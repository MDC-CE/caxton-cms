/**
 * Decision model (Jev) health per site — drives the `decision_model_unavailable` system alert.
 * Stored in pipeline_state so it survives restarts and is visible to every web process.
 */

import { getSiteSqlite } from "../../db";
import { ensurePipelineDb } from "../../pipeline-db/runner";
import { child } from "../../logger";
import type { DecideResult } from "./types";

const log = child({ module: "ai/decisions/health" });

export const DECISION_HEALTH_KEY = "decision_model_health";

/** Consecutive failed calls before the alert turns critical. */
export const DECISION_FAILURE_ALERT_THRESHOLD = 3;

export type DecisionHealth = {
  last_ok_at: number | null;
  last_fail_at: number | null;
  last_fail_reason: string | null;
  consecutive_failures: number;
  model: string | null;
};

const EMPTY: DecisionHealth = {
  last_ok_at: null,
  last_fail_at: null,
  last_fail_reason: null,
  consecutive_failures: 0,
  model: null,
};

export type DecisionOutcomeInput =
  | Pick<Extract<DecideResult, { status: "ok" }>, "status" | "model">
  | Pick<Extract<DecideResult, { status: "unavailable" }>, "status" | "reason" | "message">;

export function readDecisionHealth(site: string): DecisionHealth {
  try {
    ensurePipelineDb(site);
    const row = getSiteSqlite(site)
      .prepare("SELECT value_json FROM pipeline_state WHERE key = ?")
      .get(DECISION_HEALTH_KEY) as { value_json: string } | undefined;
    if (!row) return { ...EMPTY };
    const parsed = JSON.parse(row.value_json) as Partial<DecisionHealth>;
    return {
      last_ok_at: typeof parsed.last_ok_at === "number" ? parsed.last_ok_at : null,
      last_fail_at: typeof parsed.last_fail_at === "number" ? parsed.last_fail_at : null,
      last_fail_reason: typeof parsed.last_fail_reason === "string" ? parsed.last_fail_reason : null,
      consecutive_failures:
        typeof parsed.consecutive_failures === "number" ? parsed.consecutive_failures : 0,
      model: typeof parsed.model === "string" ? parsed.model : null,
    };
  } catch {
    return { ...EMPTY };
  }
}

export function nextDecisionHealth(
  prev: DecisionHealth,
  result: DecisionOutcomeInput,
  now = Date.now(),
): DecisionHealth {
  if (result.status === "ok") {
    return {
      ...prev,
      last_ok_at: now,
      consecutive_failures: 0,
      model: result.model || prev.model,
    };
  }
  return {
    ...prev,
    last_fail_at: now,
    last_fail_reason: result.message ? `${result.reason}: ${result.message}` : result.reason,
    consecutive_failures: prev.consecutive_failures + 1,
  };
}

/** Never throws — health bookkeeping must not break a review. */
export function recordDecisionOutcome(site: string, result: DecisionOutcomeInput | undefined): void {
  if (!result) return;
  try {
    const next = nextDecisionHealth(readDecisionHealth(site), result);
    getSiteSqlite(site)
      .prepare(
        `INSERT INTO pipeline_state (key, value_json) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json`,
      )
      .run(DECISION_HEALTH_KEY, JSON.stringify(next));
  } catch (err) {
    log.warn({ err, site }, "Failed to record decision model health");
  }
}

export function isDecisionHealthCritical(h: DecisionHealth): boolean {
  return h.consecutive_failures >= DECISION_FAILURE_ALERT_THRESHOLD;
}
