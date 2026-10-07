/**
 * Send campaign context to the server so it can keep it in the HttpOnly `4g_ads`
 * cookie (30 days; survives Safari's 7-day cap on script cookies).
 * Only called after tracking consent is granted.
 */

import type { Session, UTMParams } from '@shared/session';
import { MARKETING_UTM_KEYS } from '@shared/session';

function marketingSubset(utm: UTMParams | undefined): UTMParams {
  const out: UTMParams = {};
  if (!utm) return out;
  for (const key of MARKETING_UTM_KEYS) {
    const v = utm[key];
    if (v) (out as Record<string, string>)[key] = v;
  }
  return out;
}

export function buildAdContextBody(session: Session): Record<string, unknown> | null {
  const utm = marketingSubset(session.utm);
  const hasAny =
    Object.keys(utm).length > 0 || !!session.paid_landing?.last || !!session.first_touch;
  if (!hasAny) return null;
  return {
    utm,
    first_touch: session.first_touch ?? null,
    paid_landing: session.paid_landing ?? null,
  };
}

let lastSent = '';

export async function syncAdContext(session: Session): Promise<void> {
  const body = buildAdContextBody(session);
  if (!body) return;
  const serialized = JSON.stringify(body);
  if (serialized === lastSent) return;
  lastSent = serialized;
  try {
    await fetch('/api/ad-context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: serialized,
      keepalive: true,
    });
  } catch {
    lastSent = '';
  }
}
