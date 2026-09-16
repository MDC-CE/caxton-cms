import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import {
  clearHookBuffer,
  clampEventsPerCall,
  computeDroppedBuffersOnSave,
  getHookBuffer,
  listEnabledHooksForType,
  loadEventWebhookConfig,
  maybeEnqueueEventWebhook,
  parseEventWebhookConfig,
  recordDelivery,
  listDeliveries,
  saveEventWebhookConfig,
  setHookBuffer,
  slimEventForWebhook,
  type EventWebhookConfig,
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

describe("event-webhooks", () => {
  let tmpRoot: string;

  beforeEach(() => {
    resetPipelineDbCache();
    clearSiteSqliteCacheForTests();
    rmSite();
    ensurePipelineDb(TEST_SITE, { skipBackup: true });
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "event-webhooks-"));
  });

  afterEach(() => {
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

  it("clamps events_per_call to 1..50", () => {
    expect(clampEventsPerCall(0)).toBe(1);
    expect(clampEventsPerCall(100)).toBe(50);
    expect(clampEventsPerCall(5)).toBe(5);
  });

  it("round-trips YAML save/load", () => {
    const config: EventWebhookConfig = {
      version: 1,
      subscriptions: {
        proposal_created: [
          {
            id: "slack",
            enabled: true,
            url: "https://hooks.example.com/x",
            method: "POST",
            events_per_call: 3,
          },
        ],
      },
    };
    saveEventWebhookConfig(tmpRoot, config);
    const loaded = loadEventWebhookConfig(tmpRoot);
    expect(loaded.subscriptions.proposal_created?.[0]?.id).toBe("slack");
    expect(loaded.subscriptions.proposal_created?.[0]?.events_per_call).toBe(3);
    expect(fs.existsSync(path.join(tmpRoot, "event-webhooks.yml"))).toBe(true);
  });

  it("buffers until events_per_call then enqueues for each hook", async () => {
    const { enqueueJob } = await import("../jobs/queue");
    const config: EventWebhookConfig = {
      version: 1,
      subscriptions: {
        proposal_created: [
          {
            id: "h1",
            enabled: true,
            url: "https://example.com/1",
            method: "POST",
            events_per_call: 2,
          },
          {
            id: "h2",
            enabled: true,
            url: "https://example.com/2",
            method: "POST",
            events_per_call: 1,
          },
        ],
      },
    };
    saveEventWebhookConfig(tmpRoot, config);

    const e1 = emitEvent({
      site: TEST_SITE,
      type: "proposal_created",
      payload: { proposal_id: "p1" },
    });
    // emit won't find contentRoot — call maybeEnqueue directly
    maybeEnqueueEventWebhook(e1, tmpRoot);
    expect(getHookBuffer(TEST_SITE, "proposal_created", "h1").pendingCount).toBe(1);
    expect(enqueueJob).toHaveBeenCalled(); // h2 every 1

    const e2 = emitEvent({
      site: TEST_SITE,
      type: "proposal_created",
      payload: { proposal_id: "p2" },
    });
    maybeEnqueueEventWebhook(e2, tmpRoot);
    expect(getHookBuffer(TEST_SITE, "proposal_created", "h1").pendingCount).toBe(0);
  });

  it("URL change / disable drops only that hook buffer", () => {
    setHookBuffer(TEST_SITE, "proposal_created", "keep", {
      pendingEventIds: [1, 2],
      pendingCount: 2,
    });
    setHookBuffer(TEST_SITE, "proposal_created", "drop-me", {
      pendingEventIds: [3],
      pendingCount: 1,
    });
    const before: EventWebhookConfig = {
      version: 1,
      subscriptions: {
        proposal_created: [
          {
            id: "keep",
            enabled: true,
            url: "https://example.com/a",
            method: "POST",
            events_per_call: 5,
          },
          {
            id: "drop-me",
            enabled: true,
            url: "https://example.com/old",
            method: "POST",
            events_per_call: 5,
          },
        ],
      },
    };
    const after: EventWebhookConfig = {
      version: 1,
      subscriptions: {
        proposal_created: [
          {
            id: "keep",
            enabled: true,
            url: "https://example.com/a",
            method: "POST",
            events_per_call: 2,
          },
          {
            id: "drop-me",
            enabled: true,
            url: "https://example.com/new",
            method: "POST",
            events_per_call: 5,
          },
        ],
      },
    };
    const dropped = computeDroppedBuffersOnSave(TEST_SITE, before, after);
    expect(dropped.some((d) => d.hookId === "drop-me" && d.dropped === 1)).toBe(true);
    expect(getHookBuffer(TEST_SITE, "proposal_created", "keep").pendingCount).toBe(2);
    expect(getHookBuffer(TEST_SITE, "proposal_created", "drop-me").pendingCount).toBe(0);
  });

  it("clearHookBuffer reports dropped count", () => {
    setHookBuffer(TEST_SITE, "proposal_closed", "x", {
      pendingEventIds: [9, 10, 11],
      pendingCount: 3,
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
