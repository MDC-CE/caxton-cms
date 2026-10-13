/**
 * Lead ledger product identity, checked against the site's product catalog (paused included).
 * Values that are not in the catalog are dropped, so the Leads product filter only ever sees real products.
 */

import path from "path";
import { productManager } from "../product/product-manager";
import { getDefaultContentRoot } from "../site-config";

export type CatalogProduct = { product_id: string; product_slug: string; name: string };

/**
 * The product index only covers the default site's content folder; other sites get no match
 * rather than a match against the wrong catalog.
 */
function catalogFor(contentRoot: string | undefined) {
  if (contentRoot && path.resolve(contentRoot) !== path.resolve(getDefaultContentRoot())) return [];
  return productManager.listAllProducts({ includePaused: true });
}

/** Catalog product by product_id first, then by page slug. */
export function findCatalogProduct(opts: {
  contentRoot?: string;
  productId?: string | null;
  productSlug?: string | null;
}): CatalogProduct | null {
  const id = opts.productId?.trim();
  const slug = opts.productSlug?.trim();
  if (!id && !slug) return null;
  const products = catalogFor(opts.contentRoot);
  const match =
    (id && products.find((p) => p.product_id === id)) ||
    (slug && products.find((p) => p.content_slug === slug)) ||
    null;
  return match ? { product_id: match.product_id, product_slug: match.content_slug, name: match.name } : null;
}
