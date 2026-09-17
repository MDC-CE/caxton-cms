/**
 * Helpers for multi-article pages (always one logical article).
 *
 * When a page has 2+ article sections they always continue one piece:
 * - TOC on/off = first article's show_toc only
 * - Reading time + meta only on the first article (combined bodies)
 * - Mobile/top TOC only on the first; desktop side TOC may still appear on later parts
 *
 * `toc_group` is stamped for heading-id stability / legacy YAML — not a user choice.
 */

export type ArticleOnPage = { index: number; toc_group?: string };

export function newTocGroupId(): string {
  return `group_${Math.floor(Math.random() * 1_000_000_000)}`;
}

export function listArticlesOnPage(
  sections: Array<Record<string, unknown>>,
): ArticleOnPage[] {
  return sections
    .map((s, index) => ({
      index,
      toc_group:
        typeof s.toc_group === "string" && s.toc_group ? s.toc_group : undefined,
      type: s.type,
    }))
    .filter((s) => s.type === "article")
    .map(({ index, toc_group }) => ({ index, toc_group }));
}

/** Resolve the single shared group for the page (first non-empty), or a new id. */
export function resolveTocGroupId(articles: ArticleOnPage[]): string {
  return articles.find((a) => a.toc_group)?.toc_group ?? newTocGroupId();
}

/**
 * Ops to assign toc_group on existing articles before inserting a new one.
 * Runtime treats all articles on the page as one split regardless; stamping keeps YAML consistent.
 */
export function buildSiblingTocGroupOps(
  articles: ArticleOnPage[],
  _insertIndex: number,
  groupId: string,
): {
  ops: Array<{ action: "update_field"; path: string; value: unknown }>;
  newShowToc: boolean;
} {
  const ops: Array<{ action: "update_field"; path: string; value: unknown }> = articles.flatMap((a) => [
    {
      action: "update_field" as const,
      path: `sections.${a.index}.toc_group`,
      value: groupId,
    },
    {
      action: "update_field" as const,
      path: `sections.${a.index}.toc_position`,
      value: "side",
    },
  ]);

  // Ensure the lead (first article in page order) has show_toc when we add a continuation.
  const first = articles[0];
  if (first) {
    ops.push({
      action: "update_field" as const,
      path: `sections.${first.index}.show_toc`,
      value: true,
    });
  }

  // New article is a continuation — show_toc on it is a non-effect for chrome (A1).
  return { ops, newShowToc: false };
}

/**
 * Ops for siblings when enabling TOC on an article (always unify the page).
 * Current section is updated locally. Stamp toc_group on siblings; ensure lead show_toc.
 */
export function buildSiblingShareOpsForActivation(
  articles: ArticleOnPage[],
  currentIndex: number,
  groupId: string,
): Array<{ action: "update_field"; path: string; value: unknown }> {
  const ops: Array<{ action: "update_field"; path: string; value: unknown }> = articles
    .filter((a) => a.index !== currentIndex)
    .flatMap((a) => [
      {
        action: "update_field" as const,
        path: `sections.${a.index}.toc_group`,
        value: groupId,
      },
      {
        action: "update_field" as const,
        path: `sections.${a.index}.toc_position`,
        value: "side",
      },
    ]);

  const first = articles[0];
  if (first && first.index !== currentIndex) {
    ops.push({
      action: "update_field" as const,
      path: `sections.${first.index}.show_toc`,
      value: true,
    });
  }

  return ops;
}
