#!/usr/bin/env tsx
/**
 * Copies component registry metadata (`layout:` + `variants.<name>.{best_for,
 * avoid_when, content_shape, metadata_status}`) from a local site registry
 * into another checkout of the same site (e.g. a fresh clone of the content
 * repo) without touching anything else in those schema.yml files. Used to
 * push backfilled metadata when the local checkout is behind remote.
 *
 * Usage:
 *   npx tsx scripts/merge-registry-metadata.ts --from site_4geeks-com --to /tmp/clone/site_4geeks-com [--write]
 *
 * Prints the changed paths (relative to --to's parent) one per line.
 */
import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { isDeepStrictEqual } from "util";
import { SCHEMA_YML_DUMP_OPTIONS } from "../server/design/variant-metadata";

const META_KEYS = ["best_for", "avoid_when", "content_shape", "metadata_status"] as const;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const from = arg("--from");
const to = arg("--to");
const write = process.argv.includes("--write");
if (!from || !to) {
  console.error("--from <local site folder> and --to <target site folder> are required");
  process.exit(1);
}

type Doc = Record<string, unknown>;

function stripMeta(doc: Doc): Doc {
  const copy = JSON.parse(JSON.stringify(doc)) as Doc;
  delete copy.layout;
  const variants = copy.variants as Record<string, Doc | null> | undefined;
  if (variants && typeof variants === "object" && !Array.isArray(variants)) {
    for (const [k, v] of Object.entries(variants)) {
      if (!v) continue;
      for (const key of META_KEYS) delete v[key];
      variants[k] = v;
    }
  }
  return copy;
}

const registry = path.join(from, "component-registry");
const changed: string[] = [];
for (const type of fs.readdirSync(registry)) {
  const typeDir = path.join(registry, type);
  if (!fs.statSync(typeDir).isDirectory()) continue;
  for (const ver of fs.readdirSync(typeDir)) {
    const localFile = path.join(typeDir, ver, "schema.yml");
    if (!fs.existsSync(localFile)) continue;
    const targetFile = path.join(to, "component-registry", type, ver, "schema.yml");
    if (!fs.existsSync(targetFile)) continue;
    const localRaw = fs.readFileSync(localFile, "utf8");
    const targetRaw = fs.readFileSync(targetFile, "utf8");
    if (localRaw === targetRaw) continue;
    const local = yaml.load(localRaw) as Doc;
    const target = yaml.load(targetRaw) as Doc;
    if (!local || !target) continue;

    let next: string;
    if (isDeepStrictEqual(stripMeta(local), stripMeta(target))) {
      next = localRaw;
    } else {
      const merged = JSON.parse(JSON.stringify(target)) as Doc;
      if (local.layout && !merged.layout) merged.layout = local.layout;
      const lv = local.variants as Record<string, Doc | null> | undefined;
      const onlyMeta = (v: Doc | null) => !v || Object.keys(v).every((k) => (META_KEYS as readonly string[]).includes(k));
      if (lv && merged.variants === undefined && Object.values(lv).every(onlyMeta)) {
        merged.variants = JSON.parse(JSON.stringify(lv));
      }
      const mv = merged.variants as Record<string, Doc | null> | undefined;
      if (lv && mv && typeof mv === "object" && !Array.isArray(mv)) {
        for (const [name, meta] of Object.entries(lv)) {
          if (!meta || !(name in mv)) continue;
          const dest = { ...(mv[name] ?? {}) };
          for (const key of META_KEYS) {
            if (meta[key] !== undefined && dest[key] === undefined) dest[key] = meta[key];
          }
          mv[name] = dest;
        }
      }
      if (isDeepStrictEqual(merged, target)) continue;
      next = yaml.dump(merged, SCHEMA_YML_DUMP_OPTIONS);
    }
    if (next === targetRaw) continue;
    if (write) fs.writeFileSync(targetFile, next);
    changed.push(path.relative(path.dirname(path.resolve(to)), targetFile));
  }
}
for (const f of changed) console.log(f);
console.error("changed", changed.length);
