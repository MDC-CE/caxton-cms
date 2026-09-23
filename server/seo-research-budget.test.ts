import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import {
  wouldSpend,
  recordSpend,
  budgetSnapshot,
  STAFF_BUDGET_SESSION_KEY,
  seoResearchBudgetPath,
} from "./seo-research-budget";
import type { OpenRushSettings } from "./settings";
import { DEFAULT_OPENRUSH_SETTINGS } from "./settings";

const settings: OpenRushSettings = {
  ...DEFAULT_OPENRUSH_SETTINGS,
  session_credit_limit: 50,
  daily_credit_limit: 200,
  budget_warn_percent: 80,
};

describe("seo-research-budget", () => {
  const folder = `seo-budget-test-${process.pid}`;
  const budgetFile = seoResearchBudgetPath(folder);

  beforeEach(() => {
    fs.mkdirSync(path.dirname(budgetFile), { recursive: true });
    if (fs.existsSync(budgetFile)) fs.unlinkSync(budgetFile);
  });

  afterEach(() => {
    if (fs.existsSync(budgetFile)) fs.unlinkSync(budgetFile);
  });

  it("requires confirm in warn band; exhausts session; staff uses daily only", () => {
    recordSpend({ contentFolder: folder, sessionKey: "agent-1", cost: 40 });
    const snap = budgetSnapshot({
      contentFolder: folder,
      sessionKey: "agent-1",
      applySessionCap: true,
      settings,
    });
    expect(snap.session_used).toBe(40);
    expect(snap.daily_used).toBe(40);

    const needConfirm = wouldSpend({
      contentFolder: folder,
      sessionKey: "agent-1",
      applySessionCap: true,
      cost: 5,
      settings,
    });
    expect(needConfirm.ok).toBe(false);
    if (!needConfirm.ok) expect(needConfirm.code).toBe("confirm_seo_research_budget");

    const confirmed = wouldSpend({
      contentFolder: folder,
      sessionKey: "agent-1",
      applySessionCap: true,
      cost: 5,
      confirm: true,
      settings,
    });
    expect(confirmed.ok).toBe(true);

    recordSpend({ contentFolder: folder, sessionKey: "agent-1", cost: 12 });
    const exhaust = wouldSpend({
      contentFolder: folder,
      sessionKey: "agent-1",
      applySessionCap: true,
      cost: 5,
      confirm: true,
      settings,
    });
    expect(exhaust.ok).toBe(false);
    if (!exhaust.ok) expect(exhaust.code).toBe("seo_research_budget_exhausted");

    const staff = wouldSpend({
      contentFolder: folder,
      sessionKey: STAFF_BUDGET_SESSION_KEY,
      applySessionCap: false,
      cost: 5,
      confirm: true,
      settings,
    });
    expect(staff.ok).toBe(true);
  });

  it("does not increment on zero cost", () => {
    recordSpend({ contentFolder: folder, sessionKey: "agent-1", cost: 0 });
    const snap = budgetSnapshot({
      contentFolder: folder,
      sessionKey: "agent-1",
      applySessionCap: true,
      settings,
    });
    expect(snap.session_used).toBe(0);
  });
});
