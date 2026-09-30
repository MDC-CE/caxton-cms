/**
 * Campaign context sent with every lead (flat scalars). Built from the in-memory
 * session, so a lead in the same visit still carries it before consent; the server
 * prefers the `4g_ads` cookie when consent was given.
 */

import type { Session } from '@shared/session';
import { CLICK_ID_PARAMS } from '@shared/paid-traffic';
import { getDebugToken } from '@/hooks/useDebugAuth';
import { getCurrentPageVersion } from './tracking';

export function newSubmissionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Staff token header so the server can flag staff test leads (`is_test`, reason staff_session). */
export function staffLeadHeaders(): Record<string, string> {
  const token = getDebugToken();
  return token ? { 'X-Debug-Token': token } : {};
}

export function buildLeadAdContext(
  session: Session,
  submissionId: string,
): Record<string, string | number | undefined> {
  const utm = session.utm ?? {};
  const out: Record<string, string | number | undefined> = {
    submission_id: submissionId,
    utm_id: utm.utm_id,
    fbp: utm.fbp,
    fbc: utm.fbc,
    landing_url: session.landing_page || window.location.pathname,
    conversion_url: window.location.pathname,
  };
  for (const c of CLICK_ID_PARAMS) {
    const v = utm[c as keyof typeof utm];
    if (v) out[c] = v;
  }
  const first = session.first_touch;
  if (first) {
    out.first_utm_source = first.utm_source;
    out.first_utm_medium = first.utm_medium;
    out.first_utm_campaign = first.utm_campaign;
    out.first_utm_content = first.utm_content;
    out.first_utm_term = first.utm_term;
  }
  const pl = session.paid_landing;
  if (pl?.first) {
    out.first_paid_landing_host = pl.first.host;
    out.first_paid_landing_path = pl.first.path;
    out.first_paid_landing_at = pl.first.at;
  }
  if (pl?.last) {
    out.last_paid_landing_host = pl.last.host;
    out.last_paid_landing_path = pl.last.path;
    out.last_paid_landing_at = pl.last.at;
  }
  const pv = getCurrentPageVersion();
  if (pv) out.page_experiment_id = pv.experiment_id;
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined && v !== ''));
}
