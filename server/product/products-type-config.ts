/**
 * Content-type products.allow_sellable_entries helpers.
 */

import { getAllConfigs, getType, type ContentTypeEntry } from "../content-types";
import { productManager } from "./product-manager";

function typeEntry(contentType: string, contentRoot?: string): ContentTypeEntry | undefined {
  const singular = getType(contentType, contentRoot);
  return getAllConfigs(contentRoot)[singular];
}

/**
 * True when this type may have sellable products.
 * Explicit `products.allow_sellable_entries: true` wins.
 * Omitted products key: back-compat true when the type already has ≥1 purchasable in the index.
 * Explicit false / products without allow: false.
 */
export function contentTypeAllowsSellableEntries(
  contentType: string,
  contentRoot?: string,
): boolean {
  const entry = typeEntry(contentType, contentRoot);
  if (!entry) return false;
  if (entry.products?.allow_sellable_entries === true) return true;
  if (entry.products && entry.products.allow_sellable_entries !== true) return false;
  // omitted products — back-compat
  return productManager.contentTypeHasProducts(getType(contentType, contentRoot));
}

/** Effective flag for API/UI responses (includes back-compat coercion). */
export function effectiveAllowSellableEntries(
  contentType: string,
  contentRoot?: string,
): { allow_sellable_entries: boolean; coerced_from_inventory: boolean } {
  const entry = typeEntry(contentType, contentRoot);
  const singular = getType(contentType, contentRoot);
  if (entry?.products?.allow_sellable_entries === true) {
    return { allow_sellable_entries: true, coerced_from_inventory: false };
  }
  if (entry?.products && entry.products.allow_sellable_entries !== true) {
    return { allow_sellable_entries: false, coerced_from_inventory: false };
  }
  const has = productManager.contentTypeHasProducts(singular);
  return { allow_sellable_entries: has, coerced_from_inventory: has };
}

/** Purchasable products (incl. paused) that block turning off allow_sellable_entries. */
export function listBlockingSellableProducts(
  contentType: string,
  contentRoot?: string,
): Array<{ product_id: string; name: string; content_slug: string; actively_selling: boolean }> {
  const singular = getType(contentType, contentRoot);
  return productManager
    .listAllProducts({ includePaused: true })
    .filter((p) => p.content_type === singular)
    .map((p) => ({
      product_id: p.product_id,
      name: p.name,
      content_slug: p.content_slug,
      actively_selling: p.actively_selling,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
