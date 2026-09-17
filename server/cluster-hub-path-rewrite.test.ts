import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetRegistry } from "./content-types";
import {
  clusterHasPillarPathPointers,
  invalidateSeoIndexCache,
  rewriteMemberPillarPaths,
  type SeoIndex,
} from "./seo-index";

const ORIGINAL_CWD = process.cwd();
let tempDir: string;
let contentRoot: string;

function writeIndex(index: SeoIndex): void {
  fs.writeFileSync(path.join(contentRoot, "seo-index.json"), `${JSON.stringify(index, null, 2)}\n`, "utf-8");
  invalidateSeoIndexCache();
}

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cluster-pillar-rewrite-"));
  contentRoot = path.join(tempDir, "site_test");
  fs.mkdirSync(path.join(contentRoot, "blog", "hub"), { recursive: true });
  fs.mkdirSync(path.join(contentRoot, "blog", "spoke"), { recursive: true });
  fs.mkdirSync(path.join(contentRoot, "blog", "other"), { recursive: true });
  fs.writeFileSync(
    path.join(contentRoot, "content-types.yml"),
    `blog:
  directory: blog
  url_pattern:
    en: /en/blog/:slug
  seo_monitoring:
    enabled: true
`,
    "utf-8",
  );
  fs.writeFileSync(
    path.join(contentRoot, "blog", "hub", "en.yml"),
    `slug: hub
seo:
  is_pillar: true
  pillar_path: /en/blog/old-hub
`,
    "utf-8",
  );
  fs.writeFileSync(
    path.join(contentRoot, "blog", "spoke", "en.yml"),
    `slug: spoke
seo:
  pillar_path: /en/blog/old-hub
`,
    "utf-8",
  );
  fs.writeFileSync(
    path.join(contentRoot, "blog", "other", "en.yml"),
    `slug: other
seo:
  pillar_path: /en/blog/different
`,
    "utf-8",
  );
  writeIndex({
    version: 1,
    generated_at: new Date().toISOString(),
    entries: {
      "blog/hub/en": {
        content_type: "blog",
        slug: "hub",
        locale: "en",
        path: "/en/blog/old-hub",
        pillar_path: "/en/blog/old-hub",
        is_pillar: true,
        file: "blog/hub/en.yml",
        main_keyword: "hub",
        kw_monthly_volume: null,
        kw_difficulty: null,
        pillar_live: true,
      },
      "blog/spoke/en": {
        content_type: "blog",
        slug: "spoke",
        locale: "en",
        path: "/en/blog/spoke",
        pillar_path: "/en/blog/old-hub",
        is_pillar: false,
        file: "blog/spoke/en.yml",
        main_keyword: null,
        kw_monthly_volume: null,
        kw_difficulty: null,
        pillar_live: true,
      },
      "blog/other/en": {
        content_type: "blog",
        slug: "other",
        locale: "en",
        path: "/en/blog/other",
        pillar_path: "/en/blog/different",
        is_pillar: false,
        file: "blog/other/en.yml",
        main_keyword: null,
        kw_monthly_volume: null,
        kw_difficulty: null,
        pillar_live: true,
      },
    },
    by_path: { "/en/blog/old-hub": "blog/hub/en" },
    clusters: { "blog/hub/en": { path: "/en/blog/old-hub", members: ["blog/spoke/en"] } },
    orphans: [],
    warnings: [],
  });
  resetRegistry();
  process.chdir(tempDir);
  resetRegistry(contentRoot);
});

afterEach(() => {
  resetRegistry();
  invalidateSeoIndexCache();
  process.chdir(ORIGINAL_CWD);
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("rewriteMemberPillarPaths / clusterHasPillarPathPointers", () => {
  it("rewrites exact old path matches and heals hub; skips unrelated", () => {
    expect(
      clusterHasPillarPathPointers({
        contentRoot,
        oldPath: "/en/blog/old-hub",
        hubContentType: "blog",
        hubSlug: "hub",
        hubLocale: "en",
      }),
    ).toBe(true);

    const result = rewriteMemberPillarPaths({
      contentRoot,
      hubId: "blog/hub/en",
      oldPath: "/en/blog/old-hub",
      newPath: "/en/blog/new-hub",
    });

    expect(result.written.length).toBeGreaterThanOrEqual(2);
    expect(result.errors).toEqual([]);
    expect(fs.readFileSync(path.join(contentRoot, "blog", "spoke", "en.yml"), "utf-8")).toContain(
      "pillar_path: /en/blog/new-hub",
    );
    expect(fs.readFileSync(path.join(contentRoot, "blog", "hub", "en.yml"), "utf-8")).toContain(
      "pillar_path: /en/blog/new-hub",
    );
    expect(fs.readFileSync(path.join(contentRoot, "blog", "other", "en.yml"), "utf-8")).toContain(
      "pillar_path: /en/blog/different",
    );
  });

  it("skips files whose pillar_path no longer equals oldPath", () => {
    fs.writeFileSync(
      path.join(contentRoot, "blog", "spoke", "en.yml"),
      `slug: spoke
seo:
  pillar_path: /en/blog/moved-elsewhere
`,
      "utf-8",
    );
    const result = rewriteMemberPillarPaths({
      contentRoot,
      hubId: "blog/hub/en",
      oldPath: "/en/blog/old-hub",
      newPath: "/en/blog/new-hub",
    });
    expect(fs.readFileSync(path.join(contentRoot, "blog", "spoke", "en.yml"), "utf-8")).toContain(
      "pillar_path: /en/blog/moved-elsewhere",
    );
    expect(result.skipped).toBeGreaterThan(0);
  });

  it("no-ops when oldPath equals newPath", () => {
    const result = rewriteMemberPillarPaths({
      contentRoot,
      oldPath: "/en/blog/old-hub",
      newPath: "/en/blog/old-hub",
    });
    expect(result.written).toEqual([]);
  });

  it("gate is false when nothing points at oldPath", () => {
    expect(
      clusterHasPillarPathPointers({
        contentRoot,
        oldPath: "/en/blog/never-used",
        hubContentType: "blog",
        hubSlug: "hub",
        hubLocale: "en",
      }),
    ).toBe(false);
  });
});
