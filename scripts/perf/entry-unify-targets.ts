import type { ContentIndex } from "../../server/content-index";
import type { DatabaseManager } from "../../server/database";
import { loadEntryForDelivery } from "../../server/entry-delivery";

/** The loader public delivery uses for a single entry page (static attached or database). */
export async function loadPageForDelivery(
  ci: ContentIndex,
  db: DatabaseManager,
  contentType: string,
  slug: string,
  locale: string,
) {
  void db;
  return loadEntryForDelivery(ci, contentType, slug, locale);
}
