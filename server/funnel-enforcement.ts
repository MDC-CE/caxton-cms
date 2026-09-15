/**
 * Site + content-type funnel enforcement helpers.
 * Site master switch: settings.yml → funnel.enforcement (default false).
 * Type opt-out: content-types.yml → funnel.enforcement: false (omitted/true = on when site on).
 */

import { getFunnelSettings } from "./settings";
import { getContentTypeConfig, getType } from "./content-types";
import { productManager } from "./product/product-manager";

export function isSiteFunnelEnforcementEnabled(contentRoot?: string): boolean {
  return getFunnelSettings(contentRoot).enforcement === true;
}

/** True when this content type participates (default on; false opts out). */
export function isContentTypeFunnelMonitoringEnabled(
  contentType: string,
  contentRoot?: string,
): boolean {
  const singular = getType(contentType, contentRoot);
  const config = getContentTypeConfig(singular, contentRoot);
  return config?.funnel?.enforcement !== false;
}

/**
 * Site enforcement on AND type not opted out.
 * Used by diagnostics validator and funnel write gates.
 */
export function isFunnelEnforcedForType(contentType: string, contentRoot?: string): boolean {
  if (!isSiteFunnelEnforcementEnabled(contentRoot)) return false;
  return isContentTypeFunnelMonitoringEnabled(contentType, contentRoot);
}

/** True when the product index has at least one purchasable (including paused). */
export function siteHasPurchasableProducts(): boolean {
  try {
    return productManager.listAllProducts({ includePaused: true }).length > 0;
  } catch {
    return false;
  }
}
