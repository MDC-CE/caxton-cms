import path from "path";
import { Job } from "sidequest";
import { ContentIndex } from "../../content-index";
import { MediaGallery } from "../../media-gallery";
import { DatabaseManager } from "../../database";
import { emitEvent, getEventById, listEvents } from "../../events/event-store";
import { primaryAuthor, systemJobAttribution } from "../../events/types";
import type { ContentEvent } from "../../events/types";
import {
  rewriteMemberPillarPaths,
  seoEntryId,
  loadSeoIndex,
  type RewritePillarPathsResult,
} from "../../seo-index";
import { canonicalizePillarPath, entryCanonicalPath } from "../../seo-fields";
import { toPublicUrlPath } from "../../redirects";
import { enqueueJob } from "../queue";
import { child } from "../../logger";
import { markJobFinished, markJobStarted } from "../heartbeat";

const log = child({ module: "job:cluster-hub-path-rewrite" });

export type ClusterHubPathRewritePayload = {
  site: string;
  contentRoot: string;
  contentType: string;
  slug: string;
  locale: string;
  /** Hint from the started event; job prefers latest started event + live hub URL. */
  oldUrl?: string;
  newUrl?: string;
  startedEventId: number;
  author?: string;
};

function mergeRewriteResults(a: RewritePillarPathsResult, b: RewritePillarPathsResult): RewritePillarPathsResult {
  const written = [...a.written];
  const updatedPaths = [...a.updatedPaths];
  const seen = new Set(written);
  for (const w of b.written) {
    if (seen.has(w)) continue;
    seen.add(w);
    written.push(w);
  }
  const seenRel = new Set(updatedPaths);
  for (const p of b.updatedPaths) {
    if (seenRel.has(p)) continue;
    seenRel.add(p);
    updatedPaths.push(p);
  }
  return {
    written,
    updatedPaths,
    skipped: a.skipped + b.skipped,
    errors: [...a.errors, ...b.errors],
  };
}

/**
 * Paths that still point at the hub only via redirect (or exact oldUrl), so rapid
 * renames A→B→C still converge when an intermediate job was coalesced away.
 */
function collectStalePathsToHub(opts: {
  contentRoot: string;
  hubPath: string;
  oldUrlHint?: string;
  locale: string;
  ci: ContentIndex;
}): string[] {
  const hubPath = toPublicUrlPath(opts.hubPath);
  const stale = new Set<string>();
  const hint = (opts.oldUrlHint || "").trim();
  if (hint && hint !== hubPath) stale.add(toPublicUrlPath(hint));

  let index;
  try {
    index = loadSeoIndex(opts.contentRoot);
  } catch {
    return [...stale];
  }

  for (const row of Object.values(index.entries)) {
    const pp = typeof row.pillar_path === "string" ? row.pillar_path.trim() : "";
    if (!pp || pp === hubPath) continue;
    if (hint && pp === hint) {
      stale.add(pp);
      continue;
    }
    try {
      const canon = canonicalizePillarPath(pp, opts.locale, opts.ci);
      if (canon.path === hubPath && pp !== hubPath) stale.add(pp);
    } catch {
      /* skip */
    }
  }
  return [...stale];
}

export class ClusterHubPathRewriteJob extends Job {
  async run(
    payload: ClusterHubPathRewritePayload,
  ): Promise<{ ok: boolean; updatedPaths: string[]; skipped: number; errors: string[] }> {
    markJobStarted("cluster_hub_path_rewrite");
    try {
      const { site, contentRoot, contentType, slug, locale } = payload;

      const contentRootName = path.relative(process.cwd(), contentRoot) || path.basename(contentRoot);
      const mg = new MediaGallery(contentRootName);
      const database = new DatabaseManager(contentRoot, mg);
      const ci = new ContentIndex(contentRootName, database);
      ci.scanFast();
      try {
        ci.scanSlow();
      } catch {
        /* redirects still usable from fast + disk */
      }

      const latestStarted = listEvents({
        site,
        type: "cluster_hub_path_rewrite_started",
        limit: 30,
      }).find(
        (e) =>
          e.resource.contentType === contentType &&
          e.resource.slug === slug &&
          e.resource.locale === locale,
      );
      const startedEventId = latestStarted?.id ?? payload.startedEventId;
      const started = latestStarted ?? (startedEventId ? getEventById(site, startedEventId) : undefined);
      const author =
        (typeof latestStarted?.payload.author === "string" ? latestStarted.payload.author : undefined) ||
        (started ? primaryAuthor(started as ContentEvent) : undefined) ||
        payload.author;

      const oldUrlHint = String(
        latestStarted?.payload.oldUrl || started?.payload.oldUrl || payload.oldUrl || "",
      ).trim();
      const targetNewUrl = (
        entryCanonicalPath(contentType, slug, locale, ci) ||
        String(latestStarted?.payload.newUrl || started?.payload.newUrl || payload.newUrl || "")
      ).trim();

      const emitDone = (result: RewritePillarPathsResult, extra?: { noop?: boolean }) => {
        emitEvent({
          site,
          type: "cluster_hub_path_rewrite_done",
          resource: { contentType, slug, locale },
          triggeredByEventId: startedEventId,
          attribution: systemJobAttribution("cluster-hub-path-rewrite"),
          agent_session_id: started?.agent_session_id ?? latestStarted?.agent_session_id,
          payload: {
            oldUrl: oldUrlHint,
            newUrl: targetNewUrl,
            updatedPaths: result.updatedPaths,
            skipped: result.skipped,
            errors: result.errors,
            author,
            ...(extra?.noop ? { noop: true } : {}),
          },
        });
      };

      if (!targetNewUrl) {
        emitDone({ written: [], updatedPaths: [], skipped: 0, errors: ["hub has no canonical URL"] });
        return { ok: false, updatedPaths: [], skipped: 0, errors: ["hub has no canonical URL"] };
      }

      const stalePaths = collectStalePathsToHub({
        contentRoot,
        hubPath: targetNewUrl,
        oldUrlHint,
        locale,
        ci,
      });

      if (stalePaths.length === 0) {
        emitDone({ written: [], updatedPaths: [], skipped: 0, errors: [] }, { noop: true });
        return { ok: true, updatedPaths: [], skipped: 0, errors: [] };
      }

      const hubId = seoEntryId(contentType, slug, locale);
      let merged: RewritePillarPathsResult = {
        written: [],
        updatedPaths: [],
        skipped: 0,
        errors: [],
      };
      for (const oldPath of stalePaths) {
        if (oldPath === targetNewUrl) continue;
        merged = mergeRewriteResults(
          merged,
          rewriteMemberPillarPaths({
            contentRoot,
            hubId,
            oldPath,
            newPath: targetNewUrl,
          }),
        );
      }

      emitDone(merged);

      if (merged.written.length > 0) {
        await enqueueJob(
          "seo_index_refresh",
          {
            site,
            contentRoot,
            generation: startedEventId,
            mode: "rebuild",
            triggeredByEventId: startedEventId,
          },
          { uniqueKey: `seo-index:${site}`, uniqueWithArgs: false },
        );
      }

      log.info(
        {
          site,
          oldUrlHint,
          newUrl: targetNewUrl,
          stalePaths,
          written: merged.written.length,
          skipped: merged.skipped,
          errors: merged.errors.length,
        },
        "[ClusterHubPathRewriteJob] completed",
      );

      return {
        ok: merged.errors.length === 0,
        updatedPaths: merged.updatedPaths,
        skipped: merged.skipped,
        errors: merged.errors,
      };
    } finally {
      markJobFinished("cluster_hub_path_rewrite");
    }
  }
}
