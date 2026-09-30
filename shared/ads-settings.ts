/**
 * Per-site Ads settings (`ads:` in site_<name>/settings.yml). Non-secret only —
 * the Meta token lives in META_ADS_ACCESS_TOKEN.
 */

export interface AdsAlertThresholds {
  /** An issue is an error when it affects ≥ this % of account spend … */
  severity_spend_share_pct: number;
  /** … or ≥ this amount in the account currency. */
  severity_spend_floor: Record<string, number>;
  /** Clicks → visits drop vs trailing 28 days that triggers a warning (percentage points of the ratio). */
  clicks_visits_drop_pct: number;
  /** Clicks → visits ratio below this is always a warning. */
  clicks_visits_floor_pct: number;
  /** Minimum clicks before the clicks → visits ratio is judged. */
  ratio_min_clicks: number;
  /** "Meta: unclear" share above this triggers a warning … */
  unclear_share_pct: number;
  /** … when there are at least this many Meta sessions. */
  unclear_min_sessions: number;
  /** GA4 vs ledger lead gap widening (points) that triggers a warning. */
  ga4_ledger_gap_widen_pts: number;
  /** Fixed gap threshold during the first 28 days of ledger data. */
  ga4_ledger_gap_bootstrap_pct: number;
  /** Spend with zero visits over this many GA4-complete days is an error. */
  zero_visits_complete_days: number;
  /** Rates are greyed out below this many paid visits. */
  min_paid_visits_for_rates: number;
  /** A campaign outside every connected ad account needs at least this many paid visits to be flagged. */
  unrecognized_campaign_min_visits: number;
  /** … and is an error at ≥ this many visits … */
  unrecognized_campaign_error_visits: number;
  /** … or at ≥ this % of paid Meta visits … */
  unrecognized_campaign_error_share_pct: number;
  /** … once the window has at least this many paid Meta visits. */
  unrecognized_campaign_share_min_visits: number;
}

/** A campaign staff know about but don't connect (agency, partner). Still shown, never counted as a problem. */
export interface KnownExternalCampaign {
  /** Campaign id, or the utm_campaign name when the visits carry no id. */
  key: string;
  note?: string;
}

export interface MetaAdsSettings {
  enabled: boolean;
  /** Ad account ids without the `act_` prefix. */
  ad_account_ids: string[];
  alert_thresholds: AdsAlertThresholds;
  known_external_campaigns: KnownExternalCampaign[];
}

export interface AdsSettings {
  meta: MetaAdsSettings;
  /** Lead emails matching any of these (glob with `*`) are flagged `is_test` (still delivered). */
  test_email_patterns: string[];
}

export const DEFAULT_ADS_ALERT_THRESHOLDS: AdsAlertThresholds = {
  severity_spend_share_pct: 5,
  severity_spend_floor: { USD: 50, EUR: 50 },
  clicks_visits_drop_pct: 30,
  clicks_visits_floor_pct: 25,
  ratio_min_clicks: 100,
  unclear_share_pct: 20,
  unclear_min_sessions: 100,
  ga4_ledger_gap_widen_pts: 15,
  ga4_ledger_gap_bootstrap_pct: 35,
  zero_visits_complete_days: 2,
  min_paid_visits_for_rates: 20,
  unrecognized_campaign_min_visits: 3,
  unrecognized_campaign_error_visits: 20,
  unrecognized_campaign_error_share_pct: 5,
  unrecognized_campaign_share_min_visits: 100,
};

export const MAX_KNOWN_EXTERNAL_CAMPAIGNS = 100;
const MAX_KNOWN_CAMPAIGN_CHARS = 200;

export const DEFAULT_ADS_SETTINGS: AdsSettings = {
  meta: { enabled: false, ad_account_ids: [], alert_thresholds: { ...DEFAULT_ADS_ALERT_THRESHOLDS }, known_external_campaigns: [] },
  test_email_patterns: [],
};

function num(raw: unknown, fallback: number, min = 0, max = 1_000_000): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function normalizeAdAccountId(raw: unknown): string | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const s = String(raw).trim().replace(/^act_/i, "");
  return /^\d{5,20}$/.test(s) ? s : null;
}

export function parseAdsAlertThresholds(raw: unknown): AdsAlertThresholds {
  const d = DEFAULT_ADS_ALERT_THRESHOLDS;
  if (!raw || typeof raw !== "object") return { ...d, severity_spend_floor: { ...d.severity_spend_floor } };
  const r = raw as Record<string, unknown>;
  const floors: Record<string, number> = {};
  const rawFloors = r.severity_spend_floor;
  if (rawFloors && typeof rawFloors === "object" && !Array.isArray(rawFloors)) {
    for (const [cur, v] of Object.entries(rawFloors as Record<string, unknown>)) {
      const code = cur.trim().toUpperCase();
      if (/^[A-Z]{3}$/.test(code)) floors[code] = num(v, 50);
    }
  }
  return {
    severity_spend_share_pct: num(r.severity_spend_share_pct, d.severity_spend_share_pct, 0, 100),
    severity_spend_floor: Object.keys(floors).length > 0 ? floors : { ...d.severity_spend_floor },
    clicks_visits_drop_pct: num(r.clicks_visits_drop_pct, d.clicks_visits_drop_pct, 0, 100),
    clicks_visits_floor_pct: num(r.clicks_visits_floor_pct, d.clicks_visits_floor_pct, 0, 100),
    ratio_min_clicks: Math.round(num(r.ratio_min_clicks, d.ratio_min_clicks, 1)),
    unclear_share_pct: num(r.unclear_share_pct, d.unclear_share_pct, 0, 100),
    unclear_min_sessions: Math.round(num(r.unclear_min_sessions, d.unclear_min_sessions, 1)),
    ga4_ledger_gap_widen_pts: num(r.ga4_ledger_gap_widen_pts, d.ga4_ledger_gap_widen_pts, 0, 100),
    ga4_ledger_gap_bootstrap_pct: num(r.ga4_ledger_gap_bootstrap_pct, d.ga4_ledger_gap_bootstrap_pct, 0, 100),
    zero_visits_complete_days: Math.round(num(r.zero_visits_complete_days, d.zero_visits_complete_days, 1, 30)),
    min_paid_visits_for_rates: Math.round(num(r.min_paid_visits_for_rates, d.min_paid_visits_for_rates, 1)),
    unrecognized_campaign_min_visits: Math.round(num(r.unrecognized_campaign_min_visits, d.unrecognized_campaign_min_visits, 1)),
    unrecognized_campaign_error_visits: Math.round(num(r.unrecognized_campaign_error_visits, d.unrecognized_campaign_error_visits, 1)),
    unrecognized_campaign_error_share_pct: num(r.unrecognized_campaign_error_share_pct, d.unrecognized_campaign_error_share_pct, 0, 100),
    unrecognized_campaign_share_min_visits: Math.round(
      num(r.unrecognized_campaign_share_min_visits, d.unrecognized_campaign_share_min_visits, 1),
    ),
  };
}

/** Trimmed, deduped by key (case-insensitive), capped. Accepts `{ key, note }` objects or bare strings. */
export function parseKnownExternalCampaigns(raw: unknown): KnownExternalCampaign[] {
  if (!Array.isArray(raw)) return [];
  const out: KnownExternalCampaign[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const rec = item && typeof item === "object" ? (item as Record<string, unknown>) : null;
    const rawKey = typeof item === "string" || typeof item === "number" ? String(item) : rec?.key;
    if (typeof rawKey !== "string" && typeof rawKey !== "number") continue;
    const key = String(rawKey).trim().slice(0, MAX_KNOWN_CAMPAIGN_CHARS);
    if (!key || seen.has(key.toLowerCase())) continue;
    seen.add(key.toLowerCase());
    const note = typeof rec?.note === "string" ? rec.note.trim().slice(0, MAX_KNOWN_CAMPAIGN_CHARS) : "";
    out.push(note ? { key, note } : { key });
    if (out.length >= MAX_KNOWN_EXTERNAL_CAMPAIGNS) break;
  }
  return out;
}

export function isKnownExternalCampaign(list: KnownExternalCampaign[], key: string): boolean {
  const k = key.trim().toLowerCase();
  return list.some((c) => c.key.toLowerCase() === k);
}

export function parseAdsSettings(raw: unknown): AdsSettings {
  if (!raw || typeof raw !== "object") {
    return {
      meta: { ...DEFAULT_ADS_SETTINGS.meta, alert_thresholds: parseAdsAlertThresholds(undefined), known_external_campaigns: [] },
      test_email_patterns: [],
    };
  }
  const r = raw as Record<string, unknown>;
  const meta = (r.meta && typeof r.meta === "object" ? r.meta : {}) as Record<string, unknown>;
  const ids = Array.isArray(meta.ad_account_ids) ? meta.ad_account_ids : [];
  const patterns = Array.isArray(r.test_email_patterns) ? r.test_email_patterns : [];
  return {
    meta: {
      enabled: meta.enabled === true,
      ad_account_ids: Array.from(new Set(ids.map(normalizeAdAccountId).filter((x): x is string => !!x))),
      alert_thresholds: parseAdsAlertThresholds(meta.alert_thresholds),
      known_external_campaigns: parseKnownExternalCampaigns(meta.known_external_campaigns),
    },
    test_email_patterns: Array.from(
      new Set(
        patterns
          .filter((p): p is string => typeof p === "string")
          .map((p) => p.trim().toLowerCase())
          .filter((p) => p.length > 0 && p.length <= 200),
      ),
    ),
  };
}

/** Glob match (`*` wildcard, case-insensitive). Used for test-lead email patterns. */
export function emailMatchesPattern(email: string, pattern: string): boolean {
  const escaped = pattern
    .trim()
    .toLowerCase()
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  if (!escaped) return false;
  return new RegExp(`^${escaped}$`).test(email.trim().toLowerCase());
}

/** Meta URL parameters template staff paste into every ad (ids enable matching). */
export const META_UTM_TEMPLATE =
  "utm_source=facebook&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_id={{campaign.id}}&utm_term={{adset.id}}&utm_content={{ad.id}}";
