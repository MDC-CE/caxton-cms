/**
 * Content index for Ads checks in worker processes (fork / Sidequest), where the web
 * site-context map isn't built. Same construction as the site diagnostics worker.
 */

import { ContentIndex } from "../../content-index";
import { DatabaseManager } from "../../database";
import { MediaGallery } from "../../media-gallery";

const cache = new Map<string, ContentIndex>();

export function lightContentIndex(site: string, contentRoot: string): ContentIndex {
  const hit = cache.get(site);
  if (hit) return hit;
  const mg = new MediaGallery(site);
  const ci = new ContentIndex(site, new DatabaseManager(contentRoot, mg));
  ci.getStats();
  cache.set(site, ci);
  return ci;
}
