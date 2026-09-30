import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import path from "path";
import { clearSiteSqliteCacheForTests } from "../../db";
import { ensurePipelineDb, resetPipelineDbCache } from "../../pipeline-db/runner";
import {
  DECISION_FAILURE_ALERT_THRESHOLD,
  isDecisionHealthCritical,
  nextDecisionHealth,
  readDecisionHealth,
  recordDecisionOutcome,
  type DecisionHealth,
} from "./health";

const SITE = `site_decision-health-test-${Date.now()}`;

vi.mock("../../site-manager", () => ({
  getSiteContextMap: () => new Map([[SITE, { contentRootName: SITE }]]),
}));

function rmSite(): void {
  const dir = path.join("data", SITE);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

const empty: DecisionHealth = {
  last_ok_at: null,
  last_fail_at: null,
  last_fail_reason: null,
  consecutive_failures: 0,
  model: null,
};

describe("nextDecisionHealth", () => {
  it("counts consecutive failures and resets on success", () => {
    let h = nextDecisionHealth(empty, { status: "unavailable", reason: "timeout" }, 1);
    h = nextDecisionHealth(h, { status: "unavailable", reason: "error", message: "HTTP 500" }, 2);
    expect(h).toMatchObject({ consecutive_failures: 2, last_fail_at: 2, last_fail_reason: "error: HTTP 500" });
    expect(isDecisionHealthCritical(h)).toBe(false);
    h = nextDecisionHealth(h, { status: "unavailable", reason: "timeout" }, 3);
    expect(h.consecutive_failures).toBe(DECISION_FAILURE_ALERT_THRESHOLD);
    expect(isDecisionHealthCritical(h)).toBe(true);
    h = nextDecisionHealth(h, { status: "ok", model: "jev" }, 4);
    expect(h).toMatchObject({ consecutive_failures: 0, last_ok_at: 4, model: "jev", last_fail_at: 3 });
    expect(isDecisionHealthCritical(h)).toBe(false);
  });
});

describe("decision model health + system alert", () => {
  const prevKey = process.env.OPENROUTER_API_KEY;

  beforeEach(() => {
    resetPipelineDbCache();
    clearSiteSqliteCacheForTests();
    rmSite();
    ensurePipelineDb(SITE, { skipBackup: true });
  });

  afterEach(() => {
    if (prevKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = prevKey;
    resetPipelineDbCache();
    clearSiteSqliteCacheForTests();
    rmSite();
  });

  it("persists outcomes in pipeline_state", () => {
    recordDecisionOutcome(SITE, { status: "unavailable", reason: "timeout" });
    recordDecisionOutcome(SITE, { status: "unavailable", reason: "timeout" });
    expect(readDecisionHealth(SITE).consecutive_failures).toBe(2);
    recordDecisionOutcome(SITE, { status: "ok", model: "jev" });
    expect(readDecisionHealth(SITE)).toMatchObject({ consecutive_failures: 0, model: "jev" });
  });

  it("missing key is critical immediately", async () => {
    delete process.env.OPENROUTER_API_KEY;
    const { collectDecisionModelAlerts } = await import("../../system-alerts");
    const alerts = await collectDecisionModelAlerts();
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      code: "decision_model_unavailable",
      severity: "critical",
      actionHref: "/private/settings/ai/llms",
    });
    expect(alerts[0].message).toContain("Automated fact checks are down");
  });

  it("critical after 3 failures in a row; clears on success", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    const { collectDecisionModelAlerts } = await import("../../system-alerts");
    recordDecisionOutcome(SITE, { status: "unavailable", reason: "timeout" });
    recordDecisionOutcome(SITE, { status: "unavailable", reason: "timeout" });
    expect(await collectDecisionModelAlerts()).toHaveLength(0);
    recordDecisionOutcome(SITE, { status: "unavailable", reason: "timeout" });
    const alerts = await collectDecisionModelAlerts();
    expect(alerts).toHaveLength(1);
    expect(alerts[0].message).toContain("3 failed calls in a row");
    recordDecisionOutcome(SITE, { status: "ok", model: "jev" });
    expect(await collectDecisionModelAlerts()).toHaveLength(0);
  });
});
