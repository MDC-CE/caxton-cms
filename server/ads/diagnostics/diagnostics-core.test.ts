import { describe, expect, it } from "vitest";
import type { AdsIssue } from "@shared/ads-diagnostics-rules";
import type { StoredValidationIssue, ValidationIssueCompletion } from "../../../scripts/validation/shared/types";
import type { RollupSum } from "../ads-rollups";
import { ADS_VALIDATORS, assertDeclaredCodes, UndeclaredAdsCodeError } from "./codes";
import { adsIssueId, groupFindings, subjectKey, type AdsFinding, type AdsIssueDraft, type AdsUniverse, type PriorAdsIssue } from "./grouping";
import { draftToStored, planAdsApply, type AdsApplyInput } from "./apply";
import { computeVerifyView, estimateVerifyAfter, localDate, verifyWindowStart, type VerifyContext } from "./verify";

const RUN_START = "2026-09-30T10:00:00.000Z";
const NOW = "2026-09-30T10:05:00.000Z";
const WINDOW = { start: "2026-09-02", end: "2026-09-29", days: 28 };

function ad(ad_id: string, adset_id: string, campaign_id: string, account_id = "act1") {
  return { ad_id, adset_id, campaign_id, account_id, ad_name: `Ad ${ad_id}`, adset_name: `Set ${adset_id}`, campaign_name: `Camp ${campaign_id}`, spend: { USD: 10 } };
}

// act1 → c1 (s1: a1, a2; s2: a3), c2 (s3: a4)
const UNIVERSE: AdsUniverse = {
  ads: [ad("a1", "s1", "c1"), ad("a2", "s1", "c1"), ad("a3", "s2", "c1"), ad("a4", "s3", "c2")],
  account_names: { act1: "Main account" },
};

function builderIssue(code: AdsIssue["code"], adIds: string[], extra: Partial<AdsIssue> = {}): AdsIssue {
  return {
    id: `${code}:x`,
    code,
    severity: "warning",
    title: "Ads missing tracking parameters: Camp c1",
    why: "Why.",
    how_to_fix: "Fix.",
    spend_affected: { USD: 10 * adIds.length },
    scope: {},
    site_fixable: false,
    details: { ads: adIds.map((ad_id) => ({ ad_id, spend: { USD: 10 } }) as never), ads_total: adIds.length, ads_offset: 0 },
    ...extra,
  };
}

function finding(adIds: string[], code: AdsIssue["code"] = "missing_tracking_params"): AdsFinding {
  return { validator: "ads-meta", platform: "meta", issue: builderIssue(code, adIds), ad_ids: adIds };
}

function prior(id: string, level: "account" | "campaign" | "adset" | "ad", resource: string, affected: string[]): PriorAdsIssue {
  return {
    id,
    validator: "ads-meta",
    code: "missing_tracking_params",
    ads: { platform: "meta", level, resource_id: resource, affected_ads: affected, evidence: builderIssue("missing_tracking_params", affected), measured_at: RUN_START, window: WINDOW, first_seen: RUN_START },
  };
}

describe("ads issue identity", () => {
  it("is platform + code + level + resource, with a subject only for site-wide checks", () => {
    expect(adsIssueId("meta", "missing_tracking_params", "campaign", "c1")).toBe("ads:meta:missing_tracking_params:campaign:c1");
    expect(adsIssueId("shared", "ga4_ledger_gap", "none", null)).toBe("ads:shared:ga4_ledger_gap:none:none");
    expect(adsIssueId("meta", "lead_conversion_stopped", "none", null, "conv_1")).toBe("ads:meta:lead_conversion_stopped:none:none:conv_1");
    expect(adsIssueId("meta", "missing_tracking_params", "campaign", "c1", "ignored")).toBe("ads:meta:missing_tracking_params:campaign:c1");
  });

  it("hashes unsafe subjects so ids stay URL-safe and stable", () => {
    expect(subjectKey("pixel_123")).toBe("pixel_123");
    const hashed = subjectKey("/en/some page?x=1");
    expect(hashed).toMatch(/^[a-f0-9]{12}$/);
    expect(subjectKey("/en/some page?x=1")).toBe(hashed);
    expect(subjectKey("  ")).toBeNull();
  });
});

describe("groupFindings", () => {
  const group = (findings: AdsFinding[], priors: PriorAdsIssue[] = [], touched = new Set<string>()) =>
    groupFindings({ findings, universe: UNIVERSE, prior: priors, touched });

  it("emits one account issue when every spending ad in the account is affected", () => {
    const { drafts } = group([finding(["a1", "a2", "a3", "a4"])]);
    expect(drafts.map((d) => d.id)).toEqual(["ads:meta:missing_tracking_params:account:act1"]);
    expect(drafts[0]!.affected_ads.sort()).toEqual(["a1", "a2", "a3", "a4"]);
    expect(drafts[0]!.evidence.details?.ads_total).toBe(4);
  });

  it("uses the highest fully covered level: campaign, then ad set, then ad", () => {
    expect(group([finding(["a1", "a2", "a3"])]).drafts.map((d) => d.id)).toEqual(["ads:meta:missing_tracking_params:campaign:c1"]);
    expect(group([finding(["a1", "a2"])]).drafts.map((d) => d.id)).toEqual(["ads:meta:missing_tracking_params:adset:s1"]);
    expect(group([finding(["a1"])]).drafts.map((d) => d.id)).toEqual(["ads:meta:missing_tracking_params:ad:a1"]);
  });

  it("keeps a sticky group (never splits) and shrinks its affected list", () => {
    const { drafts } = group([finding(["a1"])], [prior("ads:meta:missing_tracking_params:campaign:c1", "campaign", "c1", ["a1", "a2", "a3"])]);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.id).toBe("ads:meta:missing_tracking_params:campaign:c1");
    expect(drafts[0]!.affected_ads).toEqual(["a1"]);
  });

  it("supersedes untouched per-ad issues when a group covers them", () => {
    const priors = [prior("ads:meta:missing_tracking_params:ad:a1", "ad", "a1", ["a1"])];
    const { drafts, superseded } = group([finding(["a1", "a2"])], priors);
    expect(drafts.map((d) => d.id)).toEqual(["ads:meta:missing_tracking_params:adset:s1"]);
    expect(superseded).toEqual([{ id: "ads:meta:missing_tracking_params:ad:a1", by: "ads:meta:missing_tracking_params:adset:s1" }]);
  });

  it("never merges a per-ad issue someone acted on (it still counts toward coverage)", () => {
    const id = "ads:meta:missing_tracking_params:ad:a1";
    const { drafts, superseded } = group([finding(["a1", "a2"])], [prior(id, "ad", "a1", ["a1"])], new Set([id]));
    expect(drafts.map((d) => [d.id, d.affected_ads])).toEqual([
      [id, ["a1"]],
      ["ads:meta:missing_tracking_params:adset:s1", ["a2"]],
    ]);
    expect(superseded).toEqual([]);
  });

  it("places unrecognized campaigns at campaign level from the scope", () => {
    const f: AdsFinding = {
      validator: "ads-meta",
      platform: "meta",
      issue: builderIssue("unrecognized_campaign", [], { id: "unrecognized_campaign:spring", scope: { campaign_id: "999", campaign_name: "Spring" }, details: undefined }),
      ad_ids: [],
    };
    const { drafts } = group([f]);
    expect(drafts[0]!.id).toBe("ads:meta:unrecognized_campaign:campaign:999");
    expect(drafts[0]!.evidence.id).toBe("ads:meta:unrecognized_campaign:campaign:999");
  });
});

describe("verify windows", () => {
  it("starts on the first full day after the mark in the ad account's time zone", () => {
    const marked = "2026-09-30T03:00:00.000Z";
    expect(localDate(marked, "America/New_York")).toBe("2026-09-29");
    expect(verifyWindowStart(marked, "America/New_York")).toBe("2026-09-30");
    expect(verifyWindowStart(marked, null)).toBe("2026-10-01");
    expect(verifyWindowStart(marked, "Not/AZone")).toBe("2026-10-01");
  });

  it("estimates verify_after as last needed day + lag", () => {
    expect(estimateVerifyAfter("2026-09-30", { kind: "fresh_days", days: 3, lag_days: 2 })).toBe("2026-10-04T00:00:00.000Z");
  });
});

function stored(validator: string, code: string, extra: Partial<NonNullable<StoredValidationIssue["ads"]>> = {}): StoredValidationIssue {
  const affected = extra.affected_ads ?? ["a1"];
  return {
    id: `ads:meta:${code}:campaign:c1`,
    validator,
    code,
    severity: "warning",
    message: "m",
    lastSeenAt: RUN_START,
    category: "ads",
    ads: {
      platform: "meta",
      level: "campaign",
      resource_id: "c1",
      affected_ads: affected,
      evidence: builderIssue(code as AdsIssue["code"], affected),
      measured_at: RUN_START,
      window: WINDOW,
      first_seen: RUN_START,
      ...extra,
    },
  } as StoredValidationIssue;
}

function sum(partial: Partial<RollupSum>): RollupSum {
  return { days_counted: 0, missing_days: [], spend: {}, spend_total: 0, clicks: 0, impressions: 0, sessions: 0, leads: 0, days_with_spend: 0, ...partial };
}

function ctx(rollup: Partial<RollupSum> = {}, lastSyncAt: VerifyContext["lastSyncAt"] = {}): VerifyContext {
  return { site: "s", now: new Date("2026-10-06T12:00:00.000Z"), lastSyncAt, timeZoneFor: () => null, sumRollups: () => sum(rollup) };
}

const pendingFresh: ValidationIssueCompletion = {
  completedBy: "staff@x",
  completedAt: "2026-09-29T12:00:00.000Z",
  verify: { kind: "fresh_days", window_start: "2026-10-01", verify_after: "2026-10-05T00:00:00.000Z" },
};

describe("computeVerifyView", () => {
  it("instant checks offer Re-check and are always ready", () => {
    const v = computeVerifyView(stored("ads-meta", "missing_tracking_params"), undefined, ctx());
    expect(v).toMatchObject({ state: "open", action: "recheck", ready_to_verify: true });
  });

  it("open non-instant checks offer Mark as fixed", () => {
    const v = computeVerifyView(stored("ads-meta", "spend_zero_visits"), undefined, ctx());
    expect(v).toMatchObject({ state: "open", action: "mark_fixed", ready_to_verify: false });
  });

  it("after_sync becomes ready only after a Sync newer than the mark", () => {
    const c: ValidationIssueCompletion = { completedBy: "x", completedAt: "2026-09-30T12:00:00.000Z", verify: { kind: "after_sync", after_sync_platform: "meta" } };
    const issue = stored("ads-meta", "meta_access_failed");
    expect(computeVerifyView(issue, c, ctx({}, { meta: "2026-09-30T11:00:00.000Z" }))).toMatchObject({ state: "pending", waits_for_sync: "meta", ready_to_verify: false });
    expect(computeVerifyView(issue, c, ctx({}, { meta: "2026-09-30T13:00:00.000Z" }))).toMatchObject({ action: "recheck_ready", ready_to_verify: true });
  });

  it("fresh_days waits for days, then min data, then spend", () => {
    const issue = stored("ads-meta", "spend_zero_visits");
    expect(computeVerifyView(issue, pendingFresh, ctx({ days_counted: 1, clicks: 5, days_with_spend: 1 })).label).toBe("Waiting for 2 more days of new data");
    const thin = computeVerifyView(issue, pendingFresh, ctx({ days_counted: 3, clicks: 10, days_with_spend: 3 }));
    expect(thin.label).toBe("Not enough data yet (10 clicks of 20 clicks)");
    expect(thin.progress).toMatchObject({ days_counted: 3, days_needed: 3, value: 10, needed: 20 });
    const paused = computeVerifyView(issue, pendingFresh, ctx({ days_counted: 3, clicks: 0, days_with_spend: 0 }));
    expect(paused.progress?.waiting_for_spend).toBe(true);
    expect(paused.label).toMatch(/Waiting for spend/);
    expect(computeVerifyView(issue, pendingFresh, ctx({ days_counted: 3, clicks: 25, days_with_spend: 3 }))).toMatchObject({ ready_to_verify: true, action: "recheck_ready" });
  });
});

function draftFor(issue: StoredValidationIssue, affected = issue.ads!.affected_ads): AdsIssueDraft {
  const a = issue.ads!;
  return {
    id: issue.id,
    validator: issue.validator as AdsIssueDraft["validator"],
    platform: a.platform,
    code: issue.code,
    level: a.level,
    resource_id: a.resource_id,
    subject: null,
    account_id: null,
    campaign_id: "c1",
    adset_id: null,
    affected_ads: affected,
    evidence: { ...a.evidence, id: issue.id },
  };
}

function applyInput(partial: Partial<AdsApplyInput>): AdsApplyInput {
  return {
    mode: "full",
    runStartedAt: RUN_START,
    nowIso: NOW,
    window: WINDOW,
    checked: { "ads-meta": "all", "ads-shared": "all", "ads-google": "all" },
    drafts: [],
    superseded: [],
    existing: [],
    completions: {},
    claims: {},
    isReady: () => false,
    postFix: {},
    isResourceGone: () => false,
    ...partial,
  };
}

describe("planAdsApply", () => {
  it("opens new issues and stamps measured_at with the Run start", () => {
    const issue = stored("ads-meta", "missing_tracking_params");
    const { changes, summary } = planAdsApply(applyInput({ drafts: [draftFor(issue)] }));
    expect(summary.opened).toBe(1);
    expect(changes.upserts[0]!.ads!.measured_at).toBe(RUN_START);
    expect(changes.runAt).toBe(RUN_START);
  });

  it("race rule: leaves issues acted on after the Run started alone", () => {
    const issue = stored("ads-meta", "missing_tracking_params", { last_action_at: "2026-09-30T10:01:00.000Z" });
    const { changes, summary } = planAdsApply(applyInput({ existing: [issue] }));
    expect(summary.untouched_newer_action).toBe(1);
    expect(changes.removals).toEqual([]);
    expect(changes.upserts).toEqual([]);
  });

  it("carries pending issues until they are ready", () => {
    const issue = stored("ads-meta", "meta_access_failed");
    const completion: ValidationIssueCompletion = { completedBy: "x", completedAt: "2026-09-30T09:00:00.000Z", verify: { kind: "after_sync" } };
    const { changes, summary } = planAdsApply(applyInput({ existing: [issue], completions: { [issue.id]: completion } }));
    expect(summary.carried_pending).toBe(1);
    expect(changes.removals).toEqual([]);
    expect(changes.reopen).toEqual([]);
  });

  it("ready pending: still found → reopen with a failed attempt; gone → verified_gone or resource_gone", () => {
    const issue = stored("ads-meta", "meta_access_failed");
    const completion: ValidationIssueCompletion = { completedBy: "x", completedAt: "2026-09-30T09:00:00.000Z", verify: { kind: "after_sync" } };
    const base = { existing: [issue], completions: { [issue.id]: completion }, isReady: () => true };
    const found = planAdsApply(applyInput({ ...base, drafts: [draftFor(issue)] }));
    expect(found.changes.reopen).toHaveLength(1);
    expect(found.changes.upserts[0]!.ads!.last_check?.outcome).toBe("still_open");
    expect(planAdsApply(applyInput(base)).changes.removals[0]!.resolution).toBe("verified_gone");
    expect(planAdsApply(applyInput({ ...base, isResourceGone: () => true })).changes.removals[0]!.resolution).toBe("resource_gone");
  });

  it("fresh_days: early fail is allowed, early pass is not", () => {
    const issue = stored("ads-meta", "spend_zero_visits");
    const base = { existing: [issue], completions: { [issue.id]: pendingFresh }, isReady: () => false };
    const early = planAdsApply(applyInput({ ...base, postFix: { [issue.id]: "found" } }));
    expect(early.changes.reopen).toHaveLength(1);
    expect(early.changes.upserts[0]!.ads!.last_check?.outcome).toBe("reopened_early");
    const notYet = planAdsApply(applyInput({ ...base, postFix: { [issue.id]: "not_found" } }));
    expect(notYet.changes.removals).toEqual([]);
    expect(notYet.summary.carried_pending).toBe(1);
    const ready = planAdsApply(applyInput({ ...base, isReady: () => true, postFix: { [issue.id]: "not_found" } }));
    expect(ready.changes.removals[0]!.resolution).toBe("verified_gone");
  });

  it("keeps issues of a platform that wasn't checked", () => {
    const google = { ...stored("ads-google", "google_auto_tagging_off"), id: "ads:google:google_auto_tagging_off:account:1" };
    const { changes } = planAdsApply(applyInput({ existing: [google], checked: { "ads-meta": "all", "ads-shared": "all" } }));
    expect(changes.removals).toEqual([]);
  });

  it("retires issues whose code is no longer declared (full Runs only)", () => {
    const old = stored("ads-meta", "landing_http_error");
    expect(planAdsApply(applyInput({ existing: [old] })).changes.removals[0]!.resolution).toBe("rule_retired");
    expect(planAdsApply(applyInput({ existing: [old], mode: "scope", scope: { issueIds: new Set([old.id]) } })).changes.removals).toEqual([]);
  });

  it("a shrinking group is partly fixed, not a failed attempt", () => {
    const issue = stored("ads-meta", "missing_tracking_params", { affected_ads: ["a1", "a2", "a3"] });
    const { changes } = planAdsApply(applyInput({ existing: [issue], drafts: [draftFor(issue, ["a1"])] }));
    expect(changes.reopen).toEqual([]);
    expect(changes.upserts[0]!.ads!.last_check).toMatchObject({ outcome: "partly_fixed", message: "Partly fixed (1 of 3 ads still affected)" });
  });

  it("scope Re-checks only touch issues in scope", () => {
    const a = stored("ads-meta", "missing_tracking_params");
    const b = { ...stored("ads-meta", "non_paid_medium"), id: "ads:meta:non_paid_medium:campaign:c1" };
    const { changes } = planAdsApply(applyInput({ mode: "scope", existing: [a, b], scope: { issueIds: new Set([a.id]) } }));
    expect(changes.removals.map((r) => r.id)).toEqual([a.id]);
    expect(changes.runAt).toBeUndefined();
  });

  it("draftToStored keeps first_seen from the prior issue", () => {
    const issue = stored("ads-meta", "missing_tracking_params", { first_seen: "2026-09-01T00:00:00.000Z" });
    expect(draftToStored(draftFor(issue), { runStartedAt: RUN_START, window: WINDOW }, issue).ads!.first_seen).toBe("2026-09-01T00:00:00.000Z");
  });
});

describe("ads code catalog", () => {
  it("every fresh_days code declares min_data", () => {
    for (const v of Object.values(ADS_VALIDATORS)) {
      for (const [code, def] of Object.entries(v.issueCodes)) {
        if (def!.verify.kind === "fresh_days") expect(def!.min_data, `${v.name}/${code}`).toBeTruthy();
      }
    }
  });

  it("an undeclared code fails that validator", () => {
    expect(() => assertDeclaredCodes("ads-meta", ["missing_tracking_params"])).not.toThrow();
    expect(() => assertDeclaredCodes("ads-meta", ["missing_tracking_params", "made_up"])).toThrow(UndeclaredAdsCodeError);
  });
});
