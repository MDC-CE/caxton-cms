#!/usr/bin/env tsx
/**
 * Read-only queue: live pages that came from an accepted idea but sit outside
 * every topic cluster (seo.pillar_path empty or null, not a hub). Agents turn
 * each row into a cluster-fix edits proposal. Never writes YAML or proposals.
 *
 *   npx tsx scripts/admin/list-idea-posts-without-cluster.ts site_4geeks-com
 *   npx tsx scripts/admin/list-idea-posts-without-cluster.ts site_4geeks-com --pull --json
 *
 * --pull replaces the local proposals DB with the production snapshot first
 * (same as the staff "pull production proposals" dev action).
 */

import path from "path";
import { fileURLToPath } from "url";
import { getSiteSqlite } from "../../server/db";
import { ensurePipelineDb } from "../../server/pipeline-db/runner";
import { readSeoIndexFile, type SeoIndex, type SeoIndexEntry } from "../../server/seo-index";
import { isSeoMonitoringEnabled } from "../../server/seo-monitoring";
import { ideaDemandLabel } from "../../server/content-proposals/idea-seo-target";

export interface ListIdeaPostsWithoutClusterOptions {
  /** Content root folder name, e.g. site_4geeks-com (also the proposals site key). */
  site: string;
  /** Pull the production proposals snapshot before reading. */
  pull?: boolean;
  /** Treat the proposals snapshot as stale after this many hours. */
  staleHours?: number;
}

export interface IdeaPostWithoutClusterItem {
  id: string;
  src?: string;
  status: "missing_cluster" | "opted_out" | "error";
  reason?: string;
  content_type: string;
  slug: string;
  locale: string;
  main_keyword: string | null;
  demand_label: string | null;
  idea_id: string;
  idea_title: string;
  suggested_hubs: Array<{ path: string; members: number; keyword: string | null }>;
}

export interface ListIdeaPostsWithoutClusterResult {
  message: string;
  warnings: string[];
  acceptedIdeaCount: number;
  missingCount: number;
  optedOutCount: number;
  results: IdeaPostWithoutClusterItem[];
}

const DAY_HOURS = 24;

function parse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function tokens(s: string | null | undefined): Set<string> {
  return new Set(
    (s ?? "")
      .toLowerCase()
      .split(/[^a-z0-9áéíóúñü]+/i)
      .filter((t) => t.length > 2),
  );
}

function suggestHubs(index: SeoIndex, row: SeoIndexEntry, limit = 3) {
  const want = tokens(`${row.main_keyword ?? ""} ${row.slug.replace(/-/g, " ")}`);
  const prefix = `/${row.locale.toLowerCase()}/`;
  return Object.values(index.clusters)
    .filter((c) => c.path.toLowerCase().startsWith(prefix))
    .map((c) => {
      const hubId = index.by_path?.[c.path];
      const hub = hubId ? index.entries[hubId] : undefined;
      const have = tokens(`${hub?.main_keyword ?? ""} ${c.path.replace(/[-/]/g, " ")}`);
      let score = 0;
      for (const t of want) if (have.has(t)) score++;
      return { path: c.path, members: c.members.length, keyword: hub?.main_keyword ?? null, score };
    })
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score || b.members - a.members)
    .slice(0, limit)
    .map(({ score: _score, ...h }) => h);
}

export async function listIdeaPostsWithoutCluster(
  options: ListIdeaPostsWithoutClusterOptions,
): Promise<ListIdeaPostsWithoutClusterResult> {
  const { site } = options;
  const staleHours = options.staleHours ?? DAY_HOURS;
  const warnings: string[] = [];
  const empty = (message: string): ListIdeaPostsWithoutClusterResult => ({
    message,
    warnings,
    acceptedIdeaCount: 0,
    missingCount: 0,
    optedOutCount: 0,
    results: [],
  });

  if (options.pull) {
    const { pullProductionProposals } = await import("../../server/content-proposals/pull-production");
    const pulled = await pullProductionProposals(site);
    if (!pulled.success) {
      return empty(`Could not pull production proposals: ${pulled.reason ?? "unknown error"}`);
    }
    warnings.push(`Pulled ${pulled.imported} proposals from ${pulled.productionOrigin}.`);
  }

  const contentRoot = path.join(process.cwd(), site);
  const index = readSeoIndexFile(contentRoot);
  if (!index) {
    return empty(`No readable seo-index.json under ${site}. Rebuild the SEO index (POST /api/seo/reindex) and retry.`);
  }

  ensurePipelineDb(site);
  const db = getSiteSqlite(site);
  const newest = db
    .prepare(`SELECT MAX(COALESCE(updated_at, created_at)) AS t FROM content_proposals WHERE site = ?`)
    .get(site) as { t: number | null } | undefined;
  const ideas = db
    .prepare(
      `SELECT id, title, accepted_entry_json, review_situations_json FROM content_proposals
       WHERE site = ? AND kind = 'idea' AND status = 'finished' AND close_reason = 'accepted'
         AND accepted_entry_json IS NOT NULL
       ORDER BY closed_at DESC`,
    )
    .all(site) as Array<{
    id: string;
    title: string;
    accepted_entry_json: string;
    review_situations_json: string | null;
  }>;

  if (ideas.length === 0) {
    warnings.push(
      "No accepted ideas in the local proposals DB. Local proposals are usually empty — rerun with --pull to read the production snapshot.",
    );
  }
  const newestMs = newest?.t ? (newest.t < 1e12 ? newest.t * 1000 : newest.t) : null;
  if (newestMs && Date.now() - newestMs > staleHours * 3600_000) {
    const hours = Math.round((Date.now() - newestMs) / 3600_000);
    warnings.push(`Newest proposal row is ${hours}h old — snapshot may be stale. Rerun with --pull.`);
  }

  const results: IdeaPostWithoutClusterItem[] = [];
  const monitored = new Map<string, boolean>();
  /** Two ideas can lock the same page; the newest accept wins. */
  const seen = new Set<string>();
  for (const idea of ideas) {
    const entry = parse<{ contentType?: string; slug?: string } | null>(idea.accepted_entry_json, null);
    if (!entry?.contentType || !entry.slug) continue;
    const ct = entry.contentType;
    try {
      if (!monitored.has(ct)) monitored.set(ct, isSeoMonitoringEnabled(ct, contentRoot));
      if (!monitored.get(ct)) continue;
      const demand = ideaDemandLabel(parse<string[]>(idea.review_situations_json, []));
      const liveLocales = Object.values(index.entries).filter(
        (r) => r.content_type === ct && r.slug === entry.slug,
      );
      for (const row of liveLocales) {
        if (row.is_pillar) continue;
        if (row.pillar_path && row.pillar_path.trim()) continue;
        const id = `${ct}/${row.slug}/${row.locale}`;
        if (seen.has(id)) continue;
        seen.add(id);
        results.push({
          id,
          src: row.path,
          status: row.pillar_opted_out ? "opted_out" : "missing_cluster",
          content_type: ct,
          slug: row.slug,
          locale: row.locale,
          main_keyword: row.main_keyword,
          demand_label: demand,
          idea_id: idea.id,
          idea_title: idea.title,
          suggested_hubs: suggestHubs(index, row),
        });
      }
    } catch (err) {
      results.push({
        id: `${ct}/${entry.slug}`,
        status: "error",
        reason: err instanceof Error ? err.message : String(err),
        content_type: ct,
        slug: entry.slug,
        locale: "",
        main_keyword: null,
        demand_label: null,
        idea_id: idea.id,
        idea_title: idea.title,
        suggested_hubs: [],
      });
    }
  }

  const missingCount = results.filter((r) => r.status === "missing_cluster").length;
  const optedOutCount = results.filter((r) => r.status === "opted_out").length;
  return {
    message: `${missingCount + optedOutCount} idea-born page locales outside every cluster (${optedOutCount} opted out with pillar_path: null, ${missingCount} empty) from ${ideas.length} accepted ideas.`,
    warnings,
    acceptedIdeaCount: ideas.length,
    missingCount,
    optedOutCount,
    results,
  };
}

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  const args = process.argv.slice(2);
  const positional = args.filter((a) => !a.startsWith("--"));
  const flags = new Set(args.filter((a) => a.startsWith("--")));
  const staleArg = args.find((a) => a.startsWith("--stale-hours="))?.split("=")[1];

  if (!positional[0]) {
    console.log(
      "Usage: npx tsx scripts/admin/list-idea-posts-without-cluster.ts <site_folder> [--pull] [--json] [--stale-hours=24]",
    );
    process.exit(1);
  }

  listIdeaPostsWithoutCluster({
    site: positional[0],
    pull: flags.has("--pull"),
    staleHours: staleArg ? Number(staleArg) : undefined,
  })
    .then((result) => {
      if (flags.has("--json")) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      for (const w of result.warnings) console.log("warning", w);
      for (const r of result.results) {
        const tag = r.status === "error" ? "[ERR]" : "[OK] ";
        const hubs = r.suggested_hubs.map((h) => h.path).join(", ") || "no suggestion";
        console.log(
          `  ${tag} ${r.id} — ${r.status}${r.reason ? `: ${r.reason}` : ""} · keyword: ${r.main_keyword ?? "none"} · idea ${r.idea_id} (${r.demand_label ?? "no label"}) · hubs: ${hubs}`,
        );
      }
      console.log(`\nDone. ${result.message}`);
    })
    .catch((err) => {
      console.error("Failed:", err);
      process.exit(1);
    });
}
