/**
 * Proposal event outbound webhooks: durable YAML config + SQLite buffers/deliveries.
 */

import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { getSiteSqlite } from "../db";
import { ensurePipelineDb } from "../pipeline-db/runner";
import { enqueueJob } from "../jobs/queue";
import { sanitizeWebhookHeaders } from "../../shared/webhookHeaders";
import { child } from "../logger";
import type { ContentEvent, EventType } from "./types";
import { getEventById } from "./event-store";

const log = child({ module: "event-webhooks" });

export const EVENT_WEBHOOK_ALLOWLIST = [
  "proposal_created",
  "proposal_revised",
  "proposal_applied_progress",
  "proposal_finished",
  "proposal_acknowledged",
  "proposal_closed",
  "proposal_rejected",
  "proposal_withdrawn",
  "proposal_escalated",
  "proposal_deescalated",
] as const;

export type EventWebhookAllowlistedType = (typeof EVENT_WEBHOOK_ALLOWLIST)[number];

export const EVENT_WEBHOOK_EVENTS_PER_CALL_MIN = 1;
export const EVENT_WEBHOOK_EVENTS_PER_CALL_MAX = 50;
export const EVENT_WEBHOOK_DELIVERY_RETENTION_MS = 48 * 60 * 60 * 1000;
export const EVENT_WEBHOOK_FILE = "event-webhooks.yml";
const BUFFERS_KEY = "event_webhook_buffers";
const WEBHOOK_TIMEOUT_MS = 8_000;

const HOOK_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export type EventWebhookDeliverySource = "live" | "test" | "retry";
export type EventWebhookDeliveryStatus = "success" | "failure";

export type EventWebhookHook = {
  id: string;
  enabled: boolean;
  url: string;
  method: "POST";
  events_per_call: number;
  headers?: Record<string, string>;
};

export type EventWebhookConfig = {
  version: 1;
  subscriptions: Partial<Record<EventWebhookAllowlistedType, EventWebhookHook[]>>;
};

export type EventWebhookBuffer = {
  pendingEventIds: number[];
  pendingCount: number;
};

export type EventWebhookBuffers = Record<string, EventWebhookBuffer>;

export type EventWebhookDeliveryRow = {
  id: number;
  site: string;
  event_type: string;
  hook_id: string;
  event_ids: number[];
  url_host: string;
  status: EventWebhookDeliveryStatus;
  http_status: number | null;
  error: string | null;
  duration_ms: number | null;
  batch_size: number;
  source: EventWebhookDeliverySource;
  created_at: number;
};

export type EventWebhookPayloadEnricher = (
  events: ContentEvent[],
  hook: EventWebhookHook,
) => Record<string, unknown>[];

/** Optional per-type enrichers (code-only; default is slim envelope). */
export const enrichEventWebhookPayload: Partial<
  Record<EventWebhookAllowlistedType, EventWebhookPayloadEnricher>
> = {};

function ensureSchema(site: string): void {
  ensurePipelineDb(site);
}

export function isEventWebhookAllowlisted(type: string): type is EventWebhookAllowlistedType {
  return (EVENT_WEBHOOK_ALLOWLIST as readonly string[]).includes(type);
}

export function bufferKey(eventType: string, hookId: string): string {
  return `${eventType}::${hookId}`;
}

export function clampEventsPerCall(n: unknown): number {
  const raw = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(raw)) return EVENT_WEBHOOK_EVENTS_PER_CALL_MIN;
  return Math.min(
    EVENT_WEBHOOK_EVENTS_PER_CALL_MAX,
    Math.max(EVENT_WEBHOOK_EVENTS_PER_CALL_MIN, Math.floor(raw)),
  );
}

export function getEventWebhooksPath(contentRoot: string): string {
  return path.join(contentRoot, EVENT_WEBHOOK_FILE);
}

function emptyConfig(): EventWebhookConfig {
  return { version: 1, subscriptions: {} };
}

function parseHook(raw: unknown, eventType: string, seenIds: Set<string>): EventWebhookHook {
  if (!raw || typeof raw !== "object") {
    throw new Error(`Invalid hook under ${eventType}`);
  }
  const h = raw as Record<string, unknown>;
  const id = typeof h.id === "string" ? h.id.trim() : "";
  if (!HOOK_ID_RE.test(id)) {
    throw new Error(
      `Invalid hook id "${id}" under ${eventType} (use lowercase letters, digits, _ or -, max 64)`,
    );
  }
  if (seenIds.has(id)) {
    throw new Error(`Duplicate hook id "${id}" under ${eventType}`);
  }
  seenIds.add(id);
  const url = typeof h.url === "string" ? h.url.trim() : "";
  const enabled = h.enabled === true;
  if (enabled && !url) {
    throw new Error(`Hook "${id}" under ${eventType} is enabled but has no url`);
  }
  if (url) {
    try {
      const u = new URL(url);
      if (u.protocol !== "http:" && u.protocol !== "https:") {
        throw new Error("protocol");
      }
    } catch {
      throw new Error(`Hook "${id}" under ${eventType} has an invalid url`);
    }
  }
  const methodRaw = typeof h.method === "string" ? h.method.trim().toUpperCase() : "POST";
  if (methodRaw !== "POST") {
    throw new Error(`Hook "${id}" under ${eventType}: only POST is supported`);
  }
  const headers = sanitizeWebhookHeaders(
    h.headers && typeof h.headers === "object"
      ? (h.headers as Record<string, string>)
      : undefined,
  );
  return {
    id,
    enabled,
    url,
    method: "POST",
    events_per_call: clampEventsPerCall(h.events_per_call ?? 1),
    ...(Object.keys(headers).length > 0 ? { headers } : {}),
  };
}

export function parseEventWebhookConfig(raw: unknown): EventWebhookConfig {
  if (raw == null) return emptyConfig();
  if (typeof raw !== "object") throw new Error("event-webhooks.yml must be a mapping");
  const doc = raw as Record<string, unknown>;
  const version = doc.version === undefined ? 1 : Number(doc.version);
  if (version !== 1) throw new Error(`Unsupported event-webhooks version: ${doc.version}`);
  const subscriptions: EventWebhookConfig["subscriptions"] = {};
  const subsRaw = doc.subscriptions;
  if (subsRaw == null) return { version: 1, subscriptions };
  if (typeof subsRaw !== "object" || Array.isArray(subsRaw)) {
    throw new Error("subscriptions must be a mapping of event type → hook list");
  }
  for (const [eventType, hooksRaw] of Object.entries(subsRaw as Record<string, unknown>)) {
    if (!isEventWebhookAllowlisted(eventType)) {
      throw new Error(`Unknown or disallowed event type: ${eventType}`);
    }
    if (!Array.isArray(hooksRaw)) {
      throw new Error(`subscriptions.${eventType} must be a list of hooks`);
    }
    const seen = new Set<string>();
    subscriptions[eventType] = hooksRaw.map((h) => parseHook(h, eventType, seen));
  }
  return { version: 1, subscriptions };
}

export function loadEventWebhookConfig(contentRoot: string): EventWebhookConfig {
  const filePath = getEventWebhooksPath(contentRoot);
  if (!fs.existsSync(filePath)) return emptyConfig();
  try {
    const raw = yaml.load(fs.readFileSync(filePath, "utf-8"));
    return parseEventWebhookConfig(raw);
  } catch (err) {
    log.warn({ err, filePath }, "[EventWebhooks] Failed to load config; treating as empty");
    throw err;
  }
}

/** Load without throwing — empty on missing/invalid (emit path). */
export function loadEventWebhookConfigSafe(contentRoot: string): EventWebhookConfig {
  try {
    return loadEventWebhookConfig(contentRoot);
  } catch {
    return emptyConfig();
  }
}

export function saveEventWebhookConfig(contentRoot: string, config: EventWebhookConfig): void {
  const normalized = parseEventWebhookConfig(config);
  const filePath = getEventWebhooksPath(contentRoot);
  const output = yaml.dump(
    {
      version: 1,
      subscriptions: normalized.subscriptions,
    },
    { lineWidth: 120, noRefs: true, sortKeys: false },
  );
  fs.writeFileSync(filePath, output, "utf-8");
}

export function findHook(
  config: EventWebhookConfig,
  eventType: string,
  hookId: string,
): EventWebhookHook | null {
  if (!isEventWebhookAllowlisted(eventType)) return null;
  const list = config.subscriptions[eventType] ?? [];
  return list.find((h) => h.id === hookId) ?? null;
}

export function listEnabledHooksForType(
  config: EventWebhookConfig,
  eventType: string,
): EventWebhookHook[] {
  if (!isEventWebhookAllowlisted(eventType)) return [];
  return (config.subscriptions[eventType] ?? []).filter((h) => h.enabled && h.url);
}

export function urlHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

function readBuffers(site: string): EventWebhookBuffers {
  ensureSchema(site);
  const row = getSiteSqlite(site)
    .prepare("SELECT value_json FROM pipeline_state WHERE key = ?")
    .get(BUFFERS_KEY) as { value_json: string } | undefined;
  if (!row) return {};
  try {
    const parsed = JSON.parse(row.value_json) as EventWebhookBuffers;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeBuffers(site: string, buffers: EventWebhookBuffers): void {
  ensureSchema(site);
  getSiteSqlite(site)
    .prepare(
      `INSERT INTO pipeline_state (key, value_json) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json`,
    )
    .run(BUFFERS_KEY, JSON.stringify(buffers));
}

export function getHookBuffer(site: string, eventType: string, hookId: string): EventWebhookBuffer {
  const key = bufferKey(eventType, hookId);
  const buf = readBuffers(site)[key];
  if (!buf) return { pendingEventIds: [], pendingCount: 0 };
  return {
    pendingEventIds: Array.isArray(buf.pendingEventIds)
      ? buf.pendingEventIds.filter((n) => typeof n === "number")
      : [],
    pendingCount: typeof buf.pendingCount === "number" ? buf.pendingCount : 0,
  };
}

export function clearHookBuffer(site: string, eventType: string, hookId: string): number {
  const buffers = readBuffers(site);
  const key = bufferKey(eventType, hookId);
  const prev = buffers[key];
  const dropped = prev?.pendingCount ?? prev?.pendingEventIds?.length ?? 0;
  if (key in buffers) {
    delete buffers[key];
    writeBuffers(site, buffers);
  }
  return dropped;
}

export function setHookBuffer(
  site: string,
  eventType: string,
  hookId: string,
  buffer: EventWebhookBuffer,
): void {
  const buffers = readBuffers(site);
  const key = bufferKey(eventType, hookId);
  if (buffer.pendingCount <= 0 || buffer.pendingEventIds.length === 0) {
    delete buffers[key];
  } else {
    buffers[key] = {
      pendingEventIds: [...buffer.pendingEventIds],
      pendingCount: buffer.pendingEventIds.length,
    };
  }
  writeBuffers(site, buffers);
}

export function getAllPendingCounts(site: string): Record<string, number> {
  const buffers = readBuffers(site);
  const out: Record<string, number> = {};
  for (const [key, buf] of Object.entries(buffers)) {
    out[key] = buf.pendingCount ?? buf.pendingEventIds?.length ?? 0;
  }
  return out;
}

export function recordDelivery(opts: {
  site: string;
  eventType: string;
  hookId: string;
  eventIds: number[];
  url: string;
  status: EventWebhookDeliveryStatus;
  httpStatus?: number | null;
  error?: string | null;
  durationMs?: number | null;
  source: EventWebhookDeliverySource;
}): number {
  ensureSchema(opts.site);
  const db = getSiteSqlite(opts.site);
  const now = Date.now();
  const info = db
    .prepare(
      `INSERT INTO event_webhook_deliveries (
        site, event_type, hook_id, event_ids_json, url_host, status,
        http_status, error, duration_ms, batch_size, source, created_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      opts.site,
      opts.eventType,
      opts.hookId,
      JSON.stringify(opts.eventIds),
      urlHost(opts.url),
      opts.status,
      opts.httpStatus ?? null,
      opts.error ?? null,
      opts.durationMs ?? null,
      opts.eventIds.length,
      opts.source,
      now,
    );
  const cutoff = now - EVENT_WEBHOOK_DELIVERY_RETENTION_MS;
  db.prepare("DELETE FROM event_webhook_deliveries WHERE site = ? AND created_at < ?").run(
    opts.site,
    cutoff,
  );
  return Number(info.lastInsertRowid);
}

function rowToDelivery(row: Record<string, unknown>): EventWebhookDeliveryRow {
  let eventIds: number[] = [];
  try {
    const parsed = JSON.parse(String(row.event_ids_json ?? "[]")) as unknown;
    if (Array.isArray(parsed)) {
      eventIds = parsed.filter((n): n is number => typeof n === "number");
    }
  } catch {
    eventIds = [];
  }
  return {
    id: Number(row.id),
    site: String(row.site),
    event_type: String(row.event_type),
    hook_id: String(row.hook_id),
    event_ids: eventIds,
    url_host: String(row.url_host ?? ""),
    status: row.status === "success" ? "success" : "failure",
    http_status: typeof row.http_status === "number" ? row.http_status : null,
    error: typeof row.error === "string" ? row.error : null,
    duration_ms: typeof row.duration_ms === "number" ? row.duration_ms : null,
    batch_size: typeof row.batch_size === "number" ? row.batch_size : eventIds.length,
    source:
      row.source === "test" || row.source === "retry" || row.source === "live"
        ? row.source
        : "live",
    created_at: Number(row.created_at),
  };
}

export function listDeliveries(
  site: string,
  opts?: { sinceMs?: number; eventType?: string; limit?: number },
): EventWebhookDeliveryRow[] {
  ensureSchema(site);
  const since = opts?.sinceMs ?? Date.now() - EVENT_WEBHOOK_DELIVERY_RETENTION_MS;
  const limit = Math.min(Math.max(opts?.limit ?? 200, 1), 500);
  const db = getSiteSqlite(site);
  const rows = opts?.eventType
    ? (db
        .prepare(
          `SELECT * FROM event_webhook_deliveries
           WHERE site = ? AND created_at >= ? AND event_type = ?
           ORDER BY created_at DESC, id DESC LIMIT ?`,
        )
        .all(site, since, opts.eventType, limit) as Record<string, unknown>[])
    : (db
        .prepare(
          `SELECT * FROM event_webhook_deliveries
           WHERE site = ? AND created_at >= ?
           ORDER BY created_at DESC, id DESC LIMIT ?`,
        )
        .all(site, since, limit) as Record<string, unknown>[]);
  return rows.map(rowToDelivery);
}

export function getDeliveryById(site: string, id: number): EventWebhookDeliveryRow | null {
  ensureSchema(site);
  const row = getSiteSqlite(site)
    .prepare("SELECT * FROM event_webhook_deliveries WHERE site = ? AND id = ?")
    .get(site, id) as Record<string, unknown> | undefined;
  return row ? rowToDelivery(row) : null;
}

export function slimEventForWebhook(event: ContentEvent): Record<string, unknown> {
  const proposalId =
    typeof event.payload?.proposal_id === "string" ? event.payload.proposal_id : undefined;
  return {
    id: event.id,
    type: event.type,
    created_at: event.created_at,
    resource: event.resource,
    payload: proposalId ? { proposal_id: proposalId } : {},
    attribution: event.attribution,
  };
}

export function buildWebhookBody(opts: {
  site: string;
  eventType: string;
  hook: EventWebhookHook;
  events: ContentEvent[];
  source: EventWebhookDeliverySource;
}): Record<string, unknown> {
  const enricher = isEventWebhookAllowlisted(opts.eventType)
    ? enrichEventWebhookPayload[opts.eventType]
    : undefined;
  const events = enricher
    ? enricher(opts.events, opts.hook)
    : opts.events.map(slimEventForWebhook);
  return {
    event: "pipeline.events",
    site: opts.site,
    triggered_at: new Date().toISOString(),
    source: opts.source,
    hook_id: opts.hook.id,
    event_type: opts.eventType,
    throttle: {
      events_per_call: opts.hook.events_per_call,
      count_in_batch: opts.events.length,
    },
    events,
  };
}

export async function deliverEventWebhookHttp(opts: {
  url: string;
  headers?: Record<string, string>;
  body: Record<string, unknown>;
}): Promise<{ ok: true; status: number; durationMs: number } | { ok: false; status: number | null; error: string; durationMs: number }> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
  try {
    const response = await fetch(opts.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...sanitizeWebhookHeaders(opts.headers),
      },
      body: JSON.stringify(opts.body),
      signal: controller.signal,
    });
    const durationMs = Date.now() - started;
    if (!response.ok) {
      const upstreamBody = await response.text().catch(() => "");
      return {
        ok: false,
        status: response.status,
        error: `Upstream HTTP ${response.status}${upstreamBody ? `: ${upstreamBody.slice(0, 200)}` : ""}`,
        durationMs,
      };
    }
    return { ok: true, status: response.status, durationMs };
  } catch (err) {
    const durationMs = Date.now() - started;
    const aborted = err instanceof Error && err.name === "AbortError";
    return {
      ok: false,
      status: null,
      error: aborted ? "Webhook upstream timed out" : err instanceof Error ? err.message : String(err),
      durationMs,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function enqueueDeliveryJob(payload: {
  site: string;
  eventType: string;
  hookId: string;
  eventIds: number[];
  source: EventWebhookDeliverySource;
}): Promise<{ queued: boolean; error?: string }> {
  try {
    const result = await enqueueJob("event_webhook_delivery", payload);
    if (!result.queued && !result.deduped) {
      return { queued: false, error: "could not queue" };
    }
    return { queued: true };
  } catch (err) {
    return { queued: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * After a due batch is taken from the buffer, enqueue delivery.
 * On enqueue failure: log + batch already dropped (caller cleared buffer first).
 */
export async function enqueueHookDelivery(opts: {
  site: string;
  eventType: string;
  hook: EventWebhookHook;
  eventIds: number[];
  source: EventWebhookDeliverySource;
}): Promise<void> {
  const result = await enqueueDeliveryJob({
    site: opts.site,
    eventType: opts.eventType,
    hookId: opts.hook.id,
    eventIds: opts.eventIds,
    source: opts.source,
  });
  if (!result.queued) {
    recordDelivery({
      site: opts.site,
      eventType: opts.eventType,
      hookId: opts.hook.id,
      eventIds: opts.eventIds,
      url: opts.hook.url,
      status: "failure",
      error: result.error ?? "could not queue",
      source: opts.source,
    });
  }
}

export async function flushHookIfDue(opts: {
  site: string;
  eventType: string;
  hook: EventWebhookHook;
}): Promise<number> {
  const buf = getHookBuffer(opts.site, opts.eventType, opts.hook.id);
  if (buf.pendingCount < opts.hook.events_per_call || buf.pendingEventIds.length === 0) {
    return 0;
  }
  const eventIds = [...buf.pendingEventIds];
  clearHookBuffer(opts.site, opts.eventType, opts.hook.id);
  await enqueueHookDelivery({
    site: opts.site,
    eventType: opts.eventType,
    hook: opts.hook,
    eventIds,
    source: "live",
  });
  return eventIds.length;
}

/**
 * Emit-path fan-out. Never throws. contentRoot resolves YAML; site is SQLite key.
 */
export function maybeEnqueueEventWebhook(
  event: ContentEvent,
  contentRoot: string | null | undefined,
): void {
  try {
    if (!contentRoot) return;
    if (!isEventWebhookAllowlisted(event.type)) return;
    const config = loadEventWebhookConfigSafe(contentRoot);
    const hooks = listEnabledHooksForType(config, event.type);
    if (hooks.length === 0) return;

    for (const hook of hooks) {
      const buf = getHookBuffer(event.site, event.type, hook.id);
      const nextIds = [...buf.pendingEventIds, event.id];
      const nextCount = nextIds.length;
      if (nextCount >= hook.events_per_call) {
        setHookBuffer(event.site, event.type, hook.id, {
          pendingEventIds: [],
          pendingCount: 0,
        });
        void enqueueHookDelivery({
          site: event.site,
          eventType: event.type,
          hook,
          eventIds: nextIds,
          source: "live",
        }).catch((err) => {
          log.warn({ err, eventId: event.id, hookId: hook.id }, "[EventWebhooks] enqueue failed");
        });
      } else {
        setHookBuffer(event.site, event.type, hook.id, {
          pendingEventIds: nextIds,
          pendingCount: nextCount,
        });
      }
    }
  } catch (err) {
    log.warn({ err, eventId: event.id, type: event.type }, "[EventWebhooks] maybeEnqueue failed");
  }
}

export function resolveContentRootForSite(site: string): string | null {
  try {
    // Lazy import to avoid circular deps at module load.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getSiteContextMap } = require("../site-manager") as typeof import("../site-manager");
    for (const ctx of getSiteContextMap().values()) {
      if (ctx.contentRootName === site) return ctx.contentRoot;
    }
  } catch {
    // site-manager may be unavailable in some tests
  }
  return null;
}

export function loadEventsForDelivery(site: string, eventIds: number[]): ContentEvent[] {
  const out: ContentEvent[] = [];
  for (const id of eventIds) {
    const ev = getEventById(site, id);
    if (ev) out.push(ev);
  }
  return out;
}

/** Diff helpers for PUT — which hook buffers to drop when URL/enable changes. */
export function computeDroppedBuffersOnSave(
  site: string,
  before: EventWebhookConfig,
  after: EventWebhookConfig,
): { key: string; eventType: string; hookId: string; dropped: number }[] {
  const dropped: { key: string; eventType: string; hookId: string; dropped: number }[] = [];
  const beforeMap = new Map<string, EventWebhookHook>();
  for (const type of EVENT_WEBHOOK_ALLOWLIST) {
    for (const h of before.subscriptions[type] ?? []) {
      beforeMap.set(bufferKey(type, h.id), h);
    }
  }
  const afterMap = new Map<string, EventWebhookHook>();
  for (const type of EVENT_WEBHOOK_ALLOWLIST) {
    for (const h of after.subscriptions[type] ?? []) {
      afterMap.set(bufferKey(type, h.id), h);
    }
  }

  for (const [key, prev] of beforeMap) {
    const [eventType, hookId] = key.split("::") as [string, string];
    const next = afterMap.get(key);
    const shouldDrop =
      !next ||
      next.enabled === false ||
      (prev.url || "") !== (next.url || "");
    if (!shouldDrop) continue;
    const n = clearHookBuffer(site, eventType, hookId);
    if (n > 0) dropped.push({ key, eventType, hookId, dropped: n });
  }

  return dropped;
}

export type { EventType };
