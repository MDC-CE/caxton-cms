/**
 * Local SEO research credit ledger (success-only). Shared daily pot; agent session caps.
 * Path: .cache/{contentFolder}/seo-research-budget.json
 */

import fs from "fs";
import path from "path";
import { CACHE_DIR } from "./db-cache";
import { getDefaultContentFolder } from "./site-config";
import { getOpenRushSettings, type OpenRushSettings } from "./settings";

export const STAFF_BUDGET_SESSION_KEY = "staff";

export type SeoResearchBudgetFile = {
  updated_at: string;
  /** UTC YYYY-MM-DD → credits spent that day (all actors). */
  daily: Record<string, number>;
  /** agent_session_id or staff → credits spent in that session. */
  sessions: Record<string, number>;
};

export type SeoResearchBudgetSnapshot = {
  session_used: number;
  session_limit: number;
  daily_used: number;
  daily_limit: number;
  warn_percent: number;
  session_pct: number;
  daily_pct: number;
  apply_session_cap: boolean;
};

export type SeoResearchBudgetGate =
  | { ok: true; snapshot: SeoResearchBudgetSnapshot }
  | {
      ok: false;
      code: "confirm_seo_research_budget" | "seo_research_budget_exhausted";
      snapshot: SeoResearchBudgetSnapshot;
      message: string;
    };

function utcDay(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

export function seoResearchBudgetPath(contentFolder?: string): string {
  const folder = contentFolder || getDefaultContentFolder();
  return path.join(CACHE_DIR, folder, "seo-research-budget.json");
}

export function loadSeoResearchBudget(contentFolder?: string): SeoResearchBudgetFile {
  const p = seoResearchBudgetPath(contentFolder);
  if (!fs.existsSync(p)) return { updated_at: "", daily: {}, sessions: {} };
  try {
    const parsed = JSON.parse(fs.readFileSync(p, "utf-8")) as SeoResearchBudgetFile;
    if (!parsed || typeof parsed !== "object") return { updated_at: "", daily: {}, sessions: {} };
    return {
      updated_at: typeof parsed.updated_at === "string" ? parsed.updated_at : "",
      daily: parsed.daily && typeof parsed.daily === "object" ? parsed.daily : {},
      sessions: parsed.sessions && typeof parsed.sessions === "object" ? parsed.sessions : {},
    };
  } catch {
    return { updated_at: "", daily: {}, sessions: {} };
  }
}

export function saveSeoResearchBudget(file: SeoResearchBudgetFile, contentFolder?: string): void {
  const p = seoResearchBudgetPath(contentFolder);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(file), "utf-8");
}

export function budgetSnapshot(opts: {
  contentFolder?: string;
  contentRoot?: string;
  sessionKey: string;
  applySessionCap: boolean;
  settings?: OpenRushSettings;
  now?: number;
}): SeoResearchBudgetSnapshot {
  const settings = opts.settings ?? getOpenRushSettings(opts.contentRoot);
  const file = loadSeoResearchBudget(opts.contentFolder);
  const day = utcDay(opts.now);
  const daily_used = Math.max(0, Number(file.daily[day]) || 0);
  const session_used = Math.max(0, Number(file.sessions[opts.sessionKey]) || 0);
  const daily_limit = settings.daily_credit_limit;
  const session_limit = settings.session_credit_limit;
  const warn_percent = settings.budget_warn_percent;
  return {
    session_used,
    session_limit,
    daily_used,
    daily_limit,
    warn_percent,
    session_pct: session_limit > 0 ? (session_used / session_limit) * 100 : 0,
    daily_pct: daily_limit > 0 ? (daily_used / daily_limit) * 100 : 0,
    apply_session_cap: opts.applySessionCap,
  };
}

function afterSpendPct(used: number, cost: number, limit: number): number {
  if (limit <= 0) return 100;
  return ((used + cost) / limit) * 100;
}

/**
 * Gate a paid research call. Cache hits should not call this.
 * Agents: session + daily. Staff: daily only (applySessionCap false).
 */
export function wouldSpend(opts: {
  contentFolder?: string;
  contentRoot?: string;
  sessionKey: string;
  applySessionCap: boolean;
  cost: number;
  confirm?: boolean;
  settings?: OpenRushSettings;
  now?: number;
}): SeoResearchBudgetGate {
  const cost = Math.max(0, Math.round(opts.cost));
  const snap = budgetSnapshot({
    contentFolder: opts.contentFolder,
    contentRoot: opts.contentRoot,
    sessionKey: opts.sessionKey,
    applySessionCap: opts.applySessionCap,
    settings: opts.settings,
    now: opts.now,
  });

  if (cost <= 0) return { ok: true, snapshot: snap };

  const dailyAfter = afterSpendPct(snap.daily_used, cost, snap.daily_limit);
  const sessionAfter = opts.applySessionCap
    ? afterSpendPct(snap.session_used, cost, snap.session_limit)
    : 0;

  if (dailyAfter > 100 || (opts.applySessionCap && sessionAfter > 100)) {
    return {
      ok: false,
      code: "seo_research_budget_exhausted",
      snapshot: snap,
      message:
        "SEO research budget exhausted for this site day" +
        (opts.applySessionCap ? " or agent session" : "") +
        ". Wait for the next day/session or raise limits in SEO research settings.",
    };
  }

  const warn = snap.warn_percent;
  const inWarn =
    dailyAfter >= warn || (opts.applySessionCap && sessionAfter >= warn);
  if (inWarn && !opts.confirm) {
    return {
      ok: false,
      code: "confirm_seo_research_budget",
      snapshot: snap,
      message:
        `This call would use ${cost} research credits and enter/stay in the warn band ` +
        `(≥${warn}% of session and/or daily limit). Re-call with confirm_seo_research_budget: true.`,
    };
  }

  return { ok: true, snapshot: snap };
}

/** Success-only: increment daily + session after a paid fetch that returned usable data. */
export function recordSpend(opts: {
  contentFolder?: string;
  sessionKey: string;
  cost: number;
  now?: number;
}): SeoResearchBudgetSnapshot {
  const cost = Math.max(0, Math.round(opts.cost));
  const file = loadSeoResearchBudget(opts.contentFolder);
  const day = utcDay(opts.now);
  if (cost > 0) {
    file.daily[day] = (Number(file.daily[day]) || 0) + cost;
    file.sessions[opts.sessionKey] = (Number(file.sessions[opts.sessionKey]) || 0) + cost;
    file.updated_at = new Date(opts.now ?? Date.now()).toISOString();
    saveSeoResearchBudget(file, opts.contentFolder);
  }
  return budgetSnapshot({
    contentFolder: opts.contentFolder,
    sessionKey: opts.sessionKey,
    applySessionCap: opts.sessionKey !== STAFF_BUDGET_SESSION_KEY,
    now: opts.now,
  });
}
