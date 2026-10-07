/**
 * "Live server" = the real production deployment, not a laptop running a production build.
 *
 * Gate only actions that delete drafts or touch shared state (draft cleanup, draft removal
 * on proposal delete, proposal-draft push filter, `@production-only` data migrations).
 * Everything else keeps using `isProductionMode()`.
 */

import { isProductionMode } from "@shared/paths";
import { getSiteConfigs } from "./site-config";
import { child } from "./logger";

const log = child({ module: "live-server" });

let override: boolean | null = null;

function siteUrlHostname(): string | null {
  const raw = process.env.SITE_URL?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function liveDomains(): Set<string> {
  const out = new Set<string>();
  try {
    for (const c of getSiteConfigs()) {
      out.add(c.domain.toLowerCase());
      for (const a of c.aliases ?? []) out.add(a.toLowerCase());
    }
  } catch {
    /* no sites.yml → no live domains */
  }
  return out;
}

export type LiveServerStatus = {
  live: boolean;
  production_mode: boolean;
  site_url_host: string | null;
  site_url_matches: boolean;
};

export function liveServerStatus(): LiveServerStatus {
  const productionMode = isProductionMode();
  const host = siteUrlHostname();
  const matches = host !== null && liveDomains().has(host);
  const live = override ?? (productionMode && matches);
  return { live, production_mode: productionMode, site_url_host: host, site_url_matches: matches };
}

export function isLiveServer(): boolean {
  return liveServerStatus().live;
}

/** Startup: production build whose SITE_URL is not a sites.yml domain blocks cleanup and production-only migrations. */
export function warnIfLiveServerMisconfigured(): void {
  const s = liveServerStatus();
  if (s.production_mode && !s.live) {
    log.warn(
      { site_url_host: s.site_url_host },
      "Production mode is on but SITE_URL is not a sites.yml domain. Draft cleanup and production-only migrations stay disabled on this server.",
    );
  }
}

export function setLiveServerForTests(value: boolean | null): void {
  override = value;
}
