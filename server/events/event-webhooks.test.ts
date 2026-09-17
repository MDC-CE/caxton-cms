import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import {
  claimHookBuffer,
  clearHookBuffer,
  clampMaxEventsPerCall,
  computeDroppedBuffersOnSave,
  EVENT_WEBHOOK_DEBOUNCE_DEFAULT_MS,
  EVENT_WEBHOOK_MAX_WAIT_DEFAULT_MS,
  flushDueBuffersForSite,
  flushHookIfDue,
  getHookBuffer,
  isHookDue,
  listEnabledHooksForType,
  loadEventWebhookConfig,
  maybeEnqueueEventWebhook,
  parseEventWebhookConfig,
  recordDelivery,
  listDeliveries,
  previewDeliveryPayload,
  restoreClaimedBuffer,
  saveEventWebhookConfig,
  setHookBuffer,
  slimEventForWebhook,
  stopEventWebhookDueScanForTests,
  type EventWebhookConfig,
  type EventWebhookHook,
} from "./event-webhooks";
import { emitEvent } from "./event-store";
import { ensurePipelineDb, resetPipelineDbCache } from "../pipeline-db/runner";
import { clearSiteSqliteCacheForTests } from "../db";
import type { ContentEvent } from "./types";

const TEST_SITE = `site_event-webhooks-test-${Date.now()}`;

vi.mock("../jobs/queue", () => ({
  enqueueJob: vi.fn(async () => ({ queued: true })),
}));

function rmSite() {
  const dir = path.join("data", TEST_SITE.replace(/\//g, "-"));
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function hook(partial: Partial<EventWebhookHook> & { id: string; url: string }): EventWebhookHook {
  return {
    enabled: true,
    method: "POST",
    debounce_ms: EVENT_WEBHOOK_DEBOUNCE_DEFAULT_MS,
    max_wait_ms: EVENT_WEBHOOK_MAX_WAIT_DEFAULT_MS,
    max_events_per_call: 50,
    ...partial,
  };
}

describe("event-webhooks", () => {
  let tmpRoot: string;

  beforeEach(() => {
    resetPipelineDbCache();
    clearSiteSqliteCacheForTests();
    rmSite();
    ensurePipelineDb(TEST_SITE, { skipBackup: true });
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "event-webhooks-"));
    stopEventWebhookDueScanForTests();
  });

  afterEach(() => {
    stopEventWebhookDueScanForTests();
    resetPipelineDbCache();
    clearSiteSqliteCacheForTests();
    rmSite();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it("parses multi-hook yaml and rejects unknown types / duplicate ids", () => {
    const cfg = parseEventWebhookConfig({
      version: 1,
      subscriptions: {
        proposal_created: [
          { id: "a", enabled: true, url: "https://example.com/a", events_per_call: 2 },
          { id: "b", enabled: false, url: "https://example.com/b", events_per_call: 1 },
        ],
      },
    });
    expect(cfg.subscriptions.proposal_created).toHaveLength(2);
    expect(listEnabledHooksForType(cfg, "proposal_created")).toHaveLength(1);
    expect(cfg.subscriptions.proposal_created?.[0]?.max_events_per_call).toBe(2);
    expect(cfg.subscriptions.proposal_created?.[0]?.debounce_ms).toBe(
      EVENT_WEBHOOK_DEBOUNCE_DEFAULT_MS,
    );
    expect(cfg.subscriptions.proposal_created?.[0]?.max_wait_ms).toBe(
      EVENT_WEBHOOK_MAX_WAIT_DEFAULT_MS,
    );

    expect(() =>
      parseEventWebhookConfig({
        version: 1,
        subscriptions: { entry_locale_saved: [{ id: "x", enabled: true, url: "https://x.com" }] },
      }),
    ).toThrow(/disallowed/);

    expect(() =>
      parseEventWebhookConfig({
        version: 1,
        subscriptions: {
          proposal_created: [
            { id: "a", enabled: true, url: "https://example.com/a" },
            { id: "a", enabled: true, url: "https://example.com/b" },
          ],
        },
      }),
    ).toThrow(/Duplicate/);
  });

  it("clamps max_events_per_call to 1..50", () => {
    expect(clampMaxEventsPerCall(0)).toBe(1);
    expect(clampMaxEventsPerCall(100)).toBe(50);
    expect(clampMaxEventsPerCall(5)).toBe(5);
  });

  it("rejects max_wait shorter than debounce when both positive", () => {
    expect(() =>
      parseEventWebhookConfig({
        version: 1,
        subscriptions: {
          proposal_created: [
            {
              id: "bad",
              enabled: true,
              url: "https://example.com/a",
              debounce_ms: 60_000,
              max_wait_ms: 10_000,
            },
          ],
        },
      }),
    ).toThrow(/max wait must be greater than or equal/i);
  });

  it("round-trips YAML save/load with new throttle keys (drops events_per_call)", () => {
    const config: EventWebhookConfig = {
      version: 1,
      subscriptions: {
        proposal_created: [
          hook({
            id: "slack",
            url: "https://hooks.example.com/x",
            max_events_per_call: 3,
            debounce_ms: 5_000,
            max_wait_ms: 15_000,
          }),
        ],
      },
    };
    saveEventWebhookConfig(tmpRoot, config);
    const loaded = loadEventWebhookConfig(tmpRoot);
    expect(loaded.subscriptions.proposal_created?.[0]?.id).toBe("slack");
    expect(loaded.subscriptions.proposal_created?.[0]?.max_events_per_call).toBe(3);
    expect(loaded.subscriptions.proposal_created?.[0]?.debounce_ms).toBe(5_000);
    expect(loaded.subscriptions.proposal_created?.[0]?.max_wait_ms).toBe(15_000);
    const yamlText = fs.readFileSync(path.join(tmpRoot, "event-webhooks.yml"), "utf-8");
    expect(yamlText).not.toMatch(/(^|[^_])events_per_call/);
    expect(yamlText).toMatch(/debounce_ms/);
    expect(yamlText).toMatch(/max_events_per_call/);
  });

  it("migrates events_per_call to max_events_per_call with default timing", () => {
    const cfg = parseEventWebhookConfig({
      version: 1,
      subscriptions: {
        proposal_created: [
          { id: "legacy", enabled: true, url: "https://example.com/a", events_per_call: 3 },
        ],
      },
    });
    const h = cfg.subscriptions.proposal_created?.[0];
    expect(h?.max_events_per_call).toBe(3);
    expect(h?.debounce_ms).toBe(EVENT_WEBHOOK_DEBOUNCE_DEFAULT_MS);
    expect(h?.max_wait_ms).toBe(EVENT_WEBHOOK_MAX_WAIT_DEFAULT_MS);
  });

  it("buffers until debounce then flushes; immediate 0/0 enqueues on first event", async () => {
    const { enqueueJob } = await import("../jobs/queue");
    const config: EventWebhookConfig = {
      version: 1,
      subscriptions: {
        proposal_created: [
          hook({
            id: "h1",
            url: "https://example.com/1",
            debounce_ms: 30_000,
            max_wait_ms: 60_000,
            max_events_per_call: 50,
          }),
          hook({
            id: "h2",
            url: "https://example.com/2",
            debounce_ms: 0,
            max_wait_ms: 0,
            max_events_per_call: 50,
          }),
        ],
      },
    };
    saveEventWebhookConfig(tmpRoot, config);

    const e1 = emitEvent({
      site: TEST_SITE,
      type: "proposal_created",
      payload: { proposal_id: "p1" },
    });
    maybeEnqueueEventWebhook(e1, tmpRoot);
    expect(getHookBuffer(TEST_SITE, "proposal_created", "h1").pendingCount).toBe(1);
    expect(enqueueJob).toHaveBeenCalled(); // h2 immediate

    const now = Date.now();
    setHookBuffer(TEST_SITE, "proposal_created", "h1", {
      pendingEventIds: [e1.id],
      pendingCount: 1,
      first_pending_at: now - 31_000,
      last_event_at: now - 31_000,
    });
    const flushed = await flushHookIfDue({
      site: TEST_SITE,
      eventType: "proposal_created",
      hook: hook({
        id: "h1",
        url: "https://example.com/1",
        debounce_ms: 30_000,
        max_wait_ms: 60_000,
      }),
      now,
    });
    expect(flushed).toBe(1);
    expect(getHookBuffer(TEST_SITE, "proposal_created", "h1").pendingCount).toBe(0);
  });

  it("max wait forces flush under continuous drip; size cap flushes early", async () => {
    const h = hook({
      id: "drip",
      url: "https://example.com/drip",
      debounce_ms: 60_000,
      max_wait_ms: 10_000,
      max_events_per_call: 50,
    });
    // max_wait < debounce is invalid for parse — use isHookDue directly
    const now = Date.now();
    const buf = {
      pendingEventIds: [1, 2],
      pendingCount: 2,
      first_pending_at: now - 11_000,
      last_event_at: now - 100,
    };
    expect(isHookDue(buf, h, now)).toBe(true);

    const capHook = hook({
      id: "cap",
      url: "https://example.com/cap",
      debounce_ms: 60_000,
      max_wait_ms: 120_000,
      max_events_per_call: 2,
    });
    saveEventWebhookConfig(tmpRoot, {
      version: 1,
      subscriptions: { proposal_created: [capHook] },
    });
    const { enqueueJob } = await import("../jobs/queue");
    vi.mocked(enqueueJob).mockClear();

    const e1 = emitEvent({
      site: TEST_SITE,
      type: "proposal_created",
      payload: { proposal_id: "c1" },
    });
    maybeEnqueueEventWebhook(e1, tmpRoot);
    expect(getHookBuffer(TEST_SITE, "proposal_created", "cap").pendingCount).toBe(1);

    const e2 = emitEvent({
      site: TEST_SITE,
      type: "proposal_created",
      payload: { proposal_id: "c2" },
    });
    maybeEnqueueEventWebhook(e2, tmpRoot);
    expect(getHookBuffer(TEST_SITE, "proposal_created", "cap").pendingCount).toBe(0);
    expect(enqueueJob).toHaveBeenCalled();
  });

  it("legacy buffer without timestamps is due on scan", async () => {
    const { enqueueJob } = await import("../jobs/queue");
    const h = hook({ id: "legacy", url: "https://example.com/legacy" });
    saveEventWebhookConfig(tmpRoot, {
      version: 1,
      subscriptions: { proposal_created: [h] },
    });
    setHookBuffer(TEST_SITE, "proposal_created", "legacy", {
      pendingEventIds: [42],
      pendingCount: 1,
    });
    expect(
      isHookDue(getHookBuffer(TEST_SITE, "proposal_created", "legacy"), h, Date.now()),
    ).toBe(true);
    vi.mocked(enqueueJob).mockClear();
    const n = await flushDueBuffersForSite(TEST_SITE, tmpRoot);
    expect(n).toBe(1);
    expect(enqueueJob).toHaveBeenCalled();
    expect(getHookBuffer(TEST_SITE, "proposal_created", "legacy").pendingCount).toBe(0);
  });

  it("claim-then-flush: second claim sees empty; enqueue failure restores buffer", async () => {
    const { enqueueJob } = await import("../jobs/queue");
    setHookBuffer(TEST_SITE, "proposal_created", "claim", {
      pendingEventIds: [1, 2],
      pendingCount: 2,
      first_pending_at: 1,
      last_event_at: 2,
    });
    const first = claimHookBuffer(TEST_SITE, "proposal_created", "claim");
    expect(first.eventIds).toEqual([1, 2]);
    const second = claimHookBuffer(TEST_SITE, "proposal_created", "claim");
    expect(second.eventIds).toEqual([]);

    restoreClaimedBuffer(TEST_SITE, "proposal_created", "claim", first);
    expect(getHookBuffer(TEST_SITE, "proposal_created", "claim").pendingEventIds).toEqual([1, 2]);

    const h = hook({
      id: "fail",
      url: "https://example.com/fail",
      debounce_ms: 0,
      max_wait_ms: 0,
    });
    saveEventWebhookConfig(tmpRoot, {
      version: 1,
      subscriptions: { proposal_created: [h] },
    });
    setHookBuffer(TEST_SITE, "proposal_created", "fail", {
      pendingEventIds: [9],
      pendingCount: 1,
      first_pending_at: Date.now(),
      last_event_at: Date.now(),
    });
    vi.mocked(enqueueJob).mockResolvedValueOnce({ queued: false });
    const flushed = await flushHookIfDue({
      site: TEST_SITE,
      eventType: "proposal_created",
      hook: h,
    });
    expect(flushed).toBe(0);
    expect(getHookBuffer(TEST_SITE, "proposal_created", "fail").pendingEventIds).toEqual([9]);
    const failures = listDeliveries(TEST_SITE, { status: "failure", limit: 5 });
    expect(failures.some((r) => r.hook_id === "fail")).toBe(true);
  });

  it("URL change / disable drops only that hook buffer", () => {
    setHookBuffer(TEST_SITE, "proposal_created", "keep", {
      pendingEventIds: [1, 2],
      pendingCount: 2,
      first_pending_at: 1,
      last_event_at: 2,
    });
    setHookBuffer(TEST_SITE, "proposal_created", "drop-me", {
      pendingEventIds: [3],
      pendingCount: 1,
      first_pending_at: 1,
      last_event_at: 1,
    });
    const before: EventWebhookConfig = {
      version: 1,
      subscriptions: {
        proposal_created: [
          hook({ id: "keep", url: "https://example.com/a", max_events_per_call: 5 }),
          hook({ id: "drop-me", url: "https://example.com/old", max_events_per_call: 5 }),
        ],
      },
    };
    const after: EventWebhookConfig = {
      version: 1,
      subscriptions: {
        proposal_created: [
          hook({ id: "keep", url: "https://example.com/a", max_events_per_call: 2 }),
          hook({ id: "drop-me", url: "https://example.com/new", max_events_per_call: 5 }),
        ],
      },
    };
    const dropped = computeDroppedBuffersOnSave(TEST_SITE, before, after);
    expect(dropped.some((d) => d.hookId === "drop-me" && d.dropped === 1)).toBe(true);
    expect(getHookBuffer(TEST_SITE, "proposal_created", "keep").pendingCount).toBe(2);
    expect(getHookBuffer(TEST_SITE, "proposal_created", "drop-me").pendingCount).toBe(0);
  });

  it("shortening wait on flushHookIfDue sends pending that are now due", async () => {
    const { enqueueJob } = await import("../jobs/queue");
    const now = Date.now();
    setHookBuffer(TEST_SITE, "proposal_created", "shorten", {
      pendingEventIds: [7],
      pendingCount: 1,
      first_pending_at: now - 5_000,
      last_event_at: now - 5_000,
    });
    const longHook = hook({
      id: "shorten",
      url: "https://example.com/s",
      debounce_ms: 30_000,
      max_wait_ms: 60_000,
    });
    expect(await flushHookIfDue({ site: TEST_SITE, eventType: "proposal_created", hook: longHook, now })).toBe(
      0,
    );

    const shortHook = hook({
      id: "shorten",
      url: "https://example.com/s",
      debounce_ms: 1_000,
      max_wait_ms: 5_000,
    });
    vi.mocked(enqueueJob).mockClear();
    expect(
      await flushHookIfDue({ site: TEST_SITE, eventType: "proposal_created", hook: shortHook, now }),
    ).toBe(1);
    expect(enqueueJob).toHaveBeenCalled();
  });

  it("clearHookBuffer reports dropped count", () => {
    setHookBuffer(TEST_SITE, "proposal_closed", "x", {
      pendingEventIds: [9, 10, 11],
      pendingCount: 3,
      first_pending_at: 1,
      last_event_at: 2,
    });
    expect(clearHookBuffer(TEST_SITE, "proposal_closed", "x")).toBe(3);
    expect(clearHookBuffer(TEST_SITE, "proposal_closed", "x")).toBe(0);
  });

  it("records and lists deliveries; prunes conceptually via retention window query", () => {
    const id = recordDelivery({
      site: TEST_SITE,
      eventType: "proposal_created",
      hookId: "h1",
      eventIds: [1, 2],
      url: "https://hooks.example.com/path",
      status: "failure",
      error: "could not queue",
      source: "live",
    });
    expect(id).toBeGreaterThan(0);
    const rows = listDeliveries(TEST_SITE, { limit: 10 });
    expect(rows[0]?.hook_id).toBe("h1");
    expect(rows[0]?.url_host).toBe("hooks.example.com");
    expect(rows[0]?.status).toBe("failure");
  });

  it("listDeliveries filters by hook, status, and order", () => {
    const t0 = Date.now() - 60_000;
    recordDelivery({
      site: TEST_SITE,
      eventType: "proposal_created",
      hookId: "a",
      eventIds: [1],
      url: "https://a.example.com",
      status: "success",
      httpStatus: 200,
      source: "live",
    });
    recordDelivery({
      site: TEST_SITE,
      eventType: "proposal_closed",
      hookId: "b",
      eventIds: [2],
      url: "https://b.example.com",
      status: "failure",
      source: "live",
    });
    const failures = listDeliveries(TEST_SITE, { status: "failure", limit: 20 });
    expect(failures.every((r) => r.status === "failure")).toBe(true);
    const hookB = listDeliveries(TEST_SITE, { hookId: "b", limit: 20 });
    expect(hookB).toHaveLength(1);
    expect(hookB[0]?.hook_id).toBe("b");
    const asc = listDeliveries(TEST_SITE, { order: "asc", limit: 20 });
    const desc = listDeliveries(TEST_SITE, { order: "desc", limit: 20 });
    expect(asc.map((r) => r.id)).toEqual([...desc.map((r) => r.id)].reverse());
    void t0;
  });

  it("previewDeliveryPayload rebuilds slim body or reports missing events", () => {
    const ev = emitEvent({
      site: TEST_SITE,
      type: "proposal_created",
      payload: { proposal_id: "p-preview" },
    });
    const cfg: EventWebhookConfig = {
      version: 1,
      subscriptions: {
        proposal_created: [
          hook({
            id: "preview-hook",
            url: "https://hooks.example.com/in",
            debounce_ms: 0,
            max_wait_ms: 0,
          }),
        ],
      },
    };
    saveEventWebhookConfig(tmpRoot, cfg);

    const okId = recordDelivery({
      site: TEST_SITE,
      eventType: "proposal_created",
      hookId: "preview-hook",
      eventIds: [ev.id],
      url: "https://hooks.example.com/in",
      status: "success",
      httpStatus: 200,
      source: "live",
    });
    const ok = previewDeliveryPayload(TEST_SITE, tmpRoot, okId);
    expect(ok).not.toBeNull();
    expect(ok!.warnings).toContain("recreated_not_archived");
    expect(ok!.payload).not.toBeNull();
    expect(ok!.events_found).toBe(1);
    const throttle = ok!.payload!.throttle as Record<string, unknown>;
    expect(throttle.debounce_ms).toBe(0);
    expect(throttle.max_wait_ms).toBe(0);
    const events = ok!.payload!.events as Array<{ payload?: { proposal_id?: string } }>;
    expect(events[0]?.payload?.proposal_id).toBe("p-preview");

    const missId = recordDelivery({
      site: TEST_SITE,
      eventType: "proposal_created",
      hookId: "preview-hook",
      eventIds: [999_999_999],
      url: "https://hooks.example.com/in",
      status: "failure",
      source: "live",
    });
    const miss = previewDeliveryPayload(TEST_SITE, tmpRoot, missId);
    expect(miss!.payload).toBeNull();
    expect(miss!.warnings).toContain("events_missing");
  });

  it("slimEventForWebhook keeps proposal_id only in payload", () => {
    const event = {
      id: 12,
      type: "proposal_created",
      site: TEST_SITE,
      resource: {},
      attribution: [],
      payload: { proposal_id: "abc", huge: "nope" },
      published: true,
      created_at: Date.now(),
    } as ContentEvent;
    const slim = slimEventForWebhook(event);
    expect(slim.payload).toEqual({ proposal_id: "abc" });
  });
});

describe("replaceProposalsFromSnapshot does not fire webhooks", () => {
  const SITE = `site_ew-pull-${Date.now()}`;

  beforeEach(() => {
    resetPipelineDbCache();
    clearSiteSqliteCacheForTests();
    const dir = path.join("data", SITE.replace(/\//g, "-"));
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    ensurePipelineDb(SITE, { skipBackup: true });
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetPipelineDbCache();
    clearSiteSqliteCacheForTests();
    const dir = path.join("data", SITE.replace(/\//g, "-"));
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  });

  it("does not call enqueueJob when importing snapshot rows", async () => {
    const { enqueueJob } = await import("../jobs/queue");
    const { replaceProposalsFromSnapshot } = await import("../content-proposals/service");
    replaceProposalsFromSnapshot(SITE, [
      {
        id: "imported-1",
        site: "prod",
        fingerprint: "fp",
        status: "open",
        kind: "notes",
        category: "handoff",
        title: "Imported",
        summary: "S".repeat(80),
        rationale: null,
        documentation: {},
        related_issue_ids: [],
        proposer_username: "alice",
        proposer_actor: {},
        created_at: Date.now(),
        updated_at: Date.now(),
        claim: null,
        tags: [],
        search_text: "imported",
        created_agent_session_id: null,
        promote_on_apply: false,
        no_auto_retry: true,
        close_reason: null,
        close_note: null,
        closed_by: null,
        closed_at: null,
        related_entries: [],
        review_context_snapshot: null,
        supersedes_proposal_id: null,
        replaced_by_proposal_id: null,
        escalated: false,
        escalated_at: null,
        escalated_by: null,
        escalated_note: null,
        decision_debug: null,
        review_situations: [],
        entries: [],
        blockers: [],
      } as any,
    ]);
    expect(enqueueJob).not.toHaveBeenCalled();
  });
});
