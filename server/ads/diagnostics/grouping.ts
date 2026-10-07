/**
 * Stable identity + grouping for Ads issues.
 *
 * Identity = platform + code + level + resource id (`none` + a subject key for site-wide checks).
 * Never amounts, names, messages or URLs, so overlays (pending, claims, attempts) survive Runs.
 *
 * Per-ad problems ("ladder" codes) are emitted at the highest level whose spending ads are all
 * affected (account → campaign → ad set), otherwise per ad. Groups are sticky (never split, the
 * affected list grows / shrinks) and separate ad issues only merge into a group when nobody
 * acted on them.
 */

import crypto from "crypto";
import type { AdsIssue, AdsIssueAd, AdsIssuePlatform, AdsIssueSeverity } from "@shared/ads-diagnostics-rules";
import type { AdsIssueLevel } from "@shared/ads-issues";
import type { StoredValidationIssue } from "../../../scripts/validation/shared/types";
import type { AdsValidatorName } from "./codes";

type Money = Record<string, number>;

/** Stored evidence keeps at most this many ads; `affected_ads` keeps every id. */
export const ADS_STORED_ADS_CAP = 50;

/** Codes about individual ads — grouped on the account → campaign → ad set → ad ladder. */
export const ADS_LADDER_CODES = new Set<string>([
  "landing_not_live",
  "ad_url_redirects",
  "missing_tracking_params",
  "tracking_params_unverified",
  "tracking_params_unchecked",
  "non_paid_medium",
  "spend_zero_visits",
  "off_site_destination",
  "instant_form_destination",
  "unmanaged_destination",
  // UTM issues with Meta ad setups behind them (GA4-only evidence has no ads and stays site-wide).
  "utm_case_mixed",
  "utm_bad_chars",
  "utm_medium_nonstandard",
  "utm_source_alias",
  "utm_medium_off_convention",
  "utm_campaign_pattern",
]);

/** Codes that belong to one ad account (`scope.account_id`). */
const ACCOUNT_CODES = new Set<string>([
  "google_transfer_missing_account",
  "google_history_short",
  "google_account_not_connected",
  "google_auto_tagging_off",
]);

/** One spending ad in the issue window (the coverage universe). */
export type UniverseAd = {
  ad_id: string;
  adset_id: string;
  campaign_id: string;
  account_id: string;
  ad_name: string;
  adset_name: string;
  campaign_name: string;
  spend: Money;
};

export type AdsUniverse = { ads: UniverseAd[]; account_names: Record<string, string> };

/** One problem as a validator found it (builder output, before identity / grouping). */
export type AdsFinding = {
  validator: AdsValidatorName;
  platform: AdsIssuePlatform;
  issue: AdsIssue;
  ad_ids: string[];
};

/** A grouped issue ready to save. */
export type AdsIssueDraft = {
  id: string;
  validator: AdsValidatorName;
  platform: AdsIssuePlatform;
  code: string;
  level: AdsIssueLevel;
  resource_id: string | null;
  subject: string | null;
  account_id: string | null;
  campaign_id: string | null;
  adset_id: string | null;
  affected_ads: string[];
  evidence: AdsIssue;
};

export type GroupingResult = {
  drafts: AdsIssueDraft[];
  /** Untouched per-ad issues now covered by a group issue (removed silently, never archived). */
  superseded: Array<{ id: string; by: string }>;
};

const SAFE_SUBJECT = /^[A-Za-z0-9_.-]{1,64}$/;

export function subjectKey(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  return SAFE_SUBJECT.test(s) ? s : crypto.createHash("sha1").update(s).digest("hex").slice(0, 12);
}

export function adsIssueId(platform: AdsIssuePlatform, code: string, level: AdsIssueLevel, resourceId: string | null, subject?: string | null): string {
  const base = `ads:${platform}:${code}:${level}:${resourceId ?? "none"}`;
  return level === "none" && subject ? `${base}:${subject}` : base;
}

/** Subject for site-wide checks: the builder id suffix after `code:` (conversion key, pixel, page). */
export function subjectFromIssue(issue: AdsIssue): string | null {
  if (issue.evidence?.kind === "conversion_stopped") return subjectKey(issue.evidence.conversion_key);
  const prefix = `${issue.code}:`;
  return issue.id.startsWith(prefix) ? subjectKey(issue.id.slice(prefix.length)) : null;
}

const SEVERITY_RANK: Record<AdsIssueSeverity, number> = { error: 0, warning: 1, info: 2 };

function worst(a: AdsIssueSeverity, b: AdsIssueSeverity): AdsIssueSeverity {
  return SEVERITY_RANK[a] <= SEVERITY_RANK[b] ? a : b;
}

function sumMoney(ads: UniverseAd[]): Money {
  const out: Money = {};
  for (const a of ads) for (const [c, v] of Object.entries(a.spend)) out[c] = (out[c] ?? 0) + v;
  for (const c of Object.keys(out)) out[c] = Math.round(out[c]! * 100) / 100;
  return out;
}

function titlePrefix(title: string): string {
  const i = title.indexOf(": ");
  return i > 0 ? title.slice(0, i) : title;
}

function hasHumanAction(id: string, touched: Set<string>): boolean {
  return touched.has(id);
}

type Ladder = {
  byId: Map<string, UniverseAd>;
  under: { account: Map<string, string[]>; campaign: Map<string, string[]>; adset: Map<string, string[]> };
};

function buildLadder(universe: AdsUniverse): Ladder {
  const byId = new Map<string, UniverseAd>();
  const under = { account: new Map<string, string[]>(), campaign: new Map<string, string[]>(), adset: new Map<string, string[]>() };
  const push = (m: Map<string, string[]>, k: string, v: string) => {
    if (!k) return;
    const l = m.get(k) ?? [];
    l.push(v);
    m.set(k, l);
  };
  for (const a of universe.ads) {
    byId.set(a.ad_id, a);
    push(under.account, a.account_id, a.ad_id);
    push(under.campaign, a.campaign_id, a.ad_id);
    push(under.adset, a.adset_id, a.ad_id);
  }
  return { byId, under };
}

function resourceName(level: AdsIssueLevel, id: string, sample: UniverseAd | undefined, universe: AdsUniverse): string {
  if (level === "account") return universe.account_names[id] || id;
  if (level === "campaign") return sample?.campaign_name || id;
  if (level === "adset") return sample?.adset_name || id;
  if (level === "ad") return sample?.ad_name || id;
  return id;
}

/** Evidence for a ladder draft: worst severity, top source copy, spend of these ads only. */
function ladderEvidence(input: {
  id: string;
  code: string;
  platform: AdsIssuePlatform;
  level: AdsIssueLevel;
  resourceId: string;
  ads: string[];
  sources: AdsFinding[];
  ladder: Ladder;
  universe: AdsUniverse;
}): AdsIssue {
  const { ads, sources, ladder } = input;
  const adSet = new Set(ads);
  const ranked = sources
    .map((f) => ({ f, overlap: f.ad_ids.filter((a) => adSet.has(a)).length }))
    .filter((x) => x.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap || SEVERITY_RANK[a.f.issue.severity] - SEVERITY_RANK[b.f.issue.severity]);
  const top = (ranked[0] ?? { f: sources[0]! }).f.issue;
  const severity = ranked.reduce<AdsIssueSeverity>((s, x) => worst(s, x.f.issue.severity), top.severity);
  const universeAds = ads.map((a) => ladder.byId.get(a)).filter((a): a is UniverseAd => !!a);
  const sample = universeAds[0];
  const detailAds: AdsIssueAd[] = [];
  const seen = new Set<string>();
  for (const { f } of ranked) {
    for (const a of f.issue.details?.ads ?? []) {
      if (!adSet.has(a.ad_id) || seen.has(a.ad_id)) continue;
      seen.add(a.ad_id);
      detailAds.push(a);
    }
  }
  detailAds.sort((a, b) => sumSpend(b.spend) - sumSpend(a.spend) || a.ad_id.localeCompare(b.ad_id));
  const name = resourceName(input.level, input.resourceId, sample, input.universe);
  const related = ranked.length > 1 ? ` ${ranked.length} related checks point at these ads.` : "";
  const scope: AdsIssue["scope"] = {
    ...(top.scope.url ? { url: top.scope.url } : {}),
    ...(top.scope.page_key ? { page_key: top.scope.page_key } : {}),
    ...(sample?.account_id ? { account_id: sample.account_id } : {}),
    ...(input.level !== "account" && sample?.campaign_id ? { campaign_id: sample.campaign_id, campaign_name: sample.campaign_name } : {}),
    ...(input.level === "ad" ? { ad_id: input.resourceId } : {}),
  };
  const spend = universeAds.length > 0 ? sumMoney(universeAds) : top.spend_affected;
  const { in_grace: _inGrace, grace_ends_at: _graceEnds, ...topRest } = top;
  const graceSources = ranked.length > 0 ? ranked.map((x) => x.f.issue) : [top];
  const allInGrace = graceSources.every((i) => i.in_grace);
  return {
    ...topRest,
    ...(allInGrace && top.in_grace ? { in_grace: true, grace_ends_at: top.grace_ends_at } : {}),
    id: input.id,
    code: input.code as AdsIssue["code"],
    platform: input.platform,
    severity,
    title: `${titlePrefix(top.title)}: ${name}`,
    why: `${top.why}${related}`,
    spend_affected: spend,
    scope,
    site_fixable: ranked.some((x) => x.f.issue.site_fixable) || top.site_fixable,
    details: {
      ...(top.details ?? { ads: [], ads_total: 0, ads_offset: 0 }),
      ads: detailAds.slice(0, ADS_STORED_ADS_CAP),
      ads_total: ads.length,
      ads_offset: 0,
    },
  };
}

function sumSpend(m: Money): number {
  return Object.values(m).reduce((s, v) => s + v, 0);
}

function fixedDraft(f: AdsFinding): AdsIssueDraft {
  const i = f.issue;
  let level: AdsIssueLevel = "none";
  let resourceId: string | null = null;
  let subject: string | null = null;
  if (ACCOUNT_CODES.has(i.code) && i.scope.account_id) {
    level = "account";
    resourceId = i.scope.account_id;
  } else if (i.code === "unrecognized_campaign" && i.scope.campaign_id) {
    level = "campaign";
    resourceId = i.scope.campaign_id;
  } else {
    subject = subjectFromIssue(i);
  }
  const id = adsIssueId(f.platform, i.code, level, resourceId, subject);
  const details = i.details ? { ...i.details, ads: i.details.ads.slice(0, ADS_STORED_ADS_CAP) } : undefined;
  return {
    id,
    validator: f.validator,
    platform: f.platform,
    code: i.code,
    level,
    resource_id: resourceId,
    subject,
    account_id: i.scope.account_id ?? null,
    campaign_id: i.scope.campaign_id ?? null,
    adset_id: null,
    affected_ads: Array.from(new Set(f.ad_ids)),
    evidence: { ...i, id, platform: f.platform, ...(details ? { details } : {}) },
  };
}

export type PriorAdsIssue = Pick<StoredValidationIssue, "id" | "validator" | "code"> & {
  ads: NonNullable<StoredValidationIssue["ads"]>;
};

/**
 * Group findings into drafts. `prior` = Ads issues currently in the cache (open or pending);
 * `touched` = ids with a human action (pending, claim, attempts) — never merged away.
 */
export function groupFindings(input: {
  findings: AdsFinding[];
  universe: AdsUniverse;
  prior: PriorAdsIssue[];
  touched: Set<string>;
}): GroupingResult {
  const ladder = buildLadder(input.universe);
  const drafts: AdsIssueDraft[] = [];
  const superseded: GroupingResult["superseded"] = [];
  const byKey = new Map<string, AdsFinding[]>();
  for (const f of input.findings) {
    const ladderAds = ADS_LADDER_CODES.has(f.issue.code) ? f.ad_ids.filter((a) => ladder.byId.has(a)) : [];
    if (ladderAds.length === 0) {
      drafts.push(fixedDraft(f));
      continue;
    }
    const key = `${f.validator}|${f.platform}|${f.issue.code}`;
    const list = byKey.get(key) ?? [];
    list.push({ ...f, ad_ids: ladderAds });
    byKey.set(key, list);
  }

  const levelOrder: Array<"account" | "campaign" | "adset"> = ["account", "campaign", "adset"];
  for (const sources of Array.from(byKey.values())) {
    const { validator, platform } = sources[0]!;
    const code = sources[0]!.issue.code;
    const remaining = new Set(sources.flatMap((f) => f.ad_ids));
    const affectedAll = new Set(remaining);
    const priors = input.prior.filter((p) => p.validator === validator && p.code === code && p.ads.platform === platform);
    const emit = (level: AdsIssueLevel, resourceId: string, ads: string[]) => {
      const id = adsIssueId(platform, code, level, resourceId);
      const sample = ladder.byId.get(ads[0]!);
      drafts.push({
        id,
        validator,
        platform,
        code,
        level,
        resource_id: resourceId,
        subject: null,
        account_id: sample?.account_id ?? null,
        campaign_id: level === "account" ? null : (sample?.campaign_id ?? null),
        adset_id: level === "adset" || level === "ad" ? (sample?.adset_id ?? null) : null,
        affected_ads: ads,
        evidence: ladderEvidence({ id, code, platform, level, resourceId, ads, sources, ladder, universe: input.universe }),
      });
      return id;
    };

    // 1) Sticky groups keep claiming the affected ads under them (highest level first).
    for (const level of levelOrder) {
      for (const p of priors.filter((x) => x.ads.level === level && x.ads.resource_id)) {
        const under = ladder.under[level].get(p.ads.resource_id!) ?? [];
        const claimed = under.filter((a) => remaining.has(a));
        if (claimed.length === 0) continue;
        claimed.forEach((a) => remaining.delete(a));
        emit(level, p.ads.resource_id!, claimed);
      }
    }

    // 2) Per-ad issues someone acted on stay separate (they still count as covered).
    const keptAds = new Set<string>();
    for (const p of priors.filter((x) => x.ads.level === "ad" && x.ads.resource_id && hasHumanAction(x.id, input.touched))) {
      const adId = p.ads.resource_id!;
      if (!remaining.has(adId)) continue;
      remaining.delete(adId);
      keptAds.add(adId);
      emit("ad", adId, [adId]);
    }

    // 3) Highest fully covered level for the rest, else per ad.
    const covered = (ids: string[]) => ids.length > 0 && ids.every((a) => affectedAll.has(a));
    const take = (ids: string[]) => ids.filter((a) => remaining.has(a));
    const accounts = new Set(Array.from(remaining).map((a) => ladder.byId.get(a)!.account_id));
    for (const acc of Array.from(accounts)) {
      const accAds = ladder.under.account.get(acc) ?? [];
      if (covered(accAds) && take(accAds).length > 0) {
        const ads = take(accAds);
        ads.forEach((a) => remaining.delete(a));
        emit("account", acc, ads);
        continue;
      }
      const campaigns = new Set(take(accAds).map((a) => ladder.byId.get(a)!.campaign_id));
      for (const camp of Array.from(campaigns)) {
        const campAds = ladder.under.campaign.get(camp) ?? [];
        if (covered(campAds) && take(campAds).length > 0) {
          const ads = take(campAds);
          ads.forEach((a) => remaining.delete(a));
          emit("campaign", camp, ads);
          continue;
        }
        const adsets = new Set(take(campAds).map((a) => ladder.byId.get(a)!.adset_id));
        for (const set of Array.from(adsets)) {
          const setAds = ladder.under.adset.get(set) ?? [];
          if (covered(setAds) && take(setAds).length > 0) {
            const ads = take(setAds);
            ads.forEach((a) => remaining.delete(a));
            emit("adset", set, ads);
          }
        }
      }
    }
    for (const adId of Array.from(remaining)) emit("ad", adId, [adId]);

    // Untouched per-ad issues whose ad now sits in a group issue → superseded.
    const draftByAd = new Map<string, string>();
    for (const d of drafts) if (d.code === code && d.validator === validator && d.level !== "ad") d.affected_ads.forEach((a) => draftByAd.set(a, d.id));
    for (const p of priors.filter((x) => x.ads.level === "ad" && x.ads.resource_id && !keptAds.has(x.ads.resource_id))) {
      const by = draftByAd.get(p.ads.resource_id!);
      if (by && !hasHumanAction(p.id, input.touched)) superseded.push({ id: p.id, by });
    }
  }
  return { drafts, superseded };
}

/** Builder issues → findings (affected ads from evidence). */
export function findingsFromIssues(validator: AdsValidatorName, platform: AdsIssuePlatform, issues: AdsIssue[]): AdsFinding[] {
  return issues.map((issue) => ({
    validator,
    platform,
    issue: { ...issue, platform },
    ad_ids: Array.from(new Set((issue.details?.ads ?? []).map((a) => a.ad_id).filter(Boolean))),
  }));
}

/** Universe ads under a ladder resource (used for resource-scoped Re-checks). */
export function universeAdsUnder(universe: AdsUniverse, level: AdsIssueLevel, id: string): string[] {
  return universe.ads
    .filter((a) => (level === "account" ? a.account_id === id : level === "campaign" ? a.campaign_id === id : level === "adset" ? a.adset_id === id : a.ad_id === id))
    .map((a) => a.ad_id);
}
