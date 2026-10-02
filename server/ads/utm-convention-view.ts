/**
 * Read-only view of the UTM convention for Settings → Ads, Ads Diagnostics and MCP: active
 * values, generated templates, rejected values and the change grace period. The convention is
 * edited in ads-config.yml only (no API / MCP write).
 */

import {
  DEFAULT_UTM_CONVENTION,
  googleUrlSuffixTemplate,
  metaUtmTemplate,
  type AdsSettings,
  type UtmConvention,
  type UtmConventionRejection,
} from "@shared/ads-settings";
import { GA4_CHANNEL_DOC_URL, GA4_DISPLAY_MEDIUMS, GA4_PAID_MEDIUM_RE } from "@shared/utm-standards";
import { ADS_CONFIG_FILENAME, adsConfigReadError } from "../ads-config";
import { utmGraceState, UTM_CONVENTION_HISTORY_FILE, UTM_GRACE_DAYS, type UtmGraceState } from "./utm-convention-history";

export type UtmConventionView = {
  file: string;
  /** Set when ads-config.yml exists but can't be parsed (syncs paused). */
  config_error: string | null;
  convention: UtmConvention;
  rejected: UtmConventionRejection[];
  meta_template: string;
  google_template: string;
  grace: UtmGraceState;
  grace_days: number;
  history_file: string;
  standard: { paid_medium_regex: string; display_mediums: readonly string[]; doc_url: string };
};

export function utmConventionView(site: string, settings: Pick<AdsSettings, "utm_convention" | "utm_convention_rejected">, contentRoot?: string, now = new Date()): UtmConventionView {
  const convention = settings.utm_convention ?? DEFAULT_UTM_CONVENTION;
  return {
    file: ADS_CONFIG_FILENAME,
    config_error: adsConfigReadError(contentRoot),
    convention,
    rejected: settings.utm_convention_rejected ?? [],
    meta_template: metaUtmTemplate(convention),
    google_template: googleUrlSuffixTemplate(convention),
    grace: utmGraceState(site, convention, now),
    grace_days: UTM_GRACE_DAYS,
    history_file: `.cache/${site}/${UTM_CONVENTION_HISTORY_FILE}`,
    standard: { paid_medium_regex: GA4_PAID_MEDIUM_RE.source, display_mediums: GA4_DISPLAY_MEDIUMS, doc_url: GA4_CHANNEL_DOC_URL },
  };
}

export type UtmConventionWarning =
  | {
      code: "utm_convention_changed";
      message: string;
      changed_at: string | null;
      grace_ends_at: string | null;
      accepted_old_values: string[];
      file: string;
    }
  | { code: "utm_convention_invalid"; message: string; rejected: UtmConventionRejection[]; file: string }
  | { code: "ads_config_unreadable"; message: string; error: string; file: string };

/** Structured warnings for MCP / API responses (dense facts; staff copy lives in the UI). */
export function utmConventionWarnings(v: UtmConventionView): UtmConventionWarning[] {
  const out: UtmConventionWarning[] = [];
  if (v.config_error) {
    out.push({
      code: "ads_config_unreadable",
      message: `${v.file} can't be parsed; Meta / Google / GA4 syncs are skipped until it is fixed. Checks use the last good parse (or defaults).`,
      error: v.config_error,
      file: v.file,
    });
  }
  if (v.grace.active) {
    out.push({
      code: "utm_convention_changed",
      message: `utm_convention changed; values from the previous version are accepted at info severity until ${v.grace.ends_at?.slice(0, 10)}, then flagged. History is per environment (${v.history_file}); pull from production to align.`,
      changed_at: v.grace.changed_at,
      grace_ends_at: v.grace.ends_at,
      accepted_old_values: v.grace.accepted_old_values,
      file: v.file,
    });
  }
  if (v.rejected.length > 0) {
    out.push({
      code: "utm_convention_invalid",
      message: `utm_convention values outside the GA4 default channel group are ignored (the default is used for each): ${v.rejected.map((r) => `${r.field}=${r.value}`).join(", ")}. Edit ${v.file}; there is no MCP write.`,
      rejected: v.rejected,
      file: v.file,
    });
  }
  return out;
}
