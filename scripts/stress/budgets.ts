export type BudgetBand = "normal" | "docs";

export type ScenarioBudget = {
  p95_ms: number;
  est_tokens: number;
};

/** Intentionally loose starting bands — tighten after local baselines. */
export const BANDS: Record<BudgetBand, ScenarioBudget> = {
  normal: { p95_ms: 5000, est_tokens: 80_000 },
  docs: { p95_ms: 10_000, est_tokens: 120_000 },
};

/** Optional per-scenario overrides (id → budget). */
export const byId: Record<string, Partial<ScenarioBudget>> = {};

export const SITE_PROBE_P95_MS = 2000;

export function resolveBudget(
  scenarioId: string,
  band: BudgetBand = "normal",
): ScenarioBudget {
  const base = BANDS[band] ?? BANDS.normal;
  const over = byId[scenarioId] ?? {};
  return {
    p95_ms: over.p95_ms ?? base.p95_ms,
    est_tokens: over.est_tokens ?? base.est_tokens,
  };
}
