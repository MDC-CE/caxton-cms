import fs from "fs";
import os from "os";
import path from "path";
import yaml from "js-yaml";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { extractTopLevelBlock, planAdsConfigMigration, runAdsConfigMigration, type AdsConfigMigrationDeps } from "./ads-config-migration";

const SETTINGS = `site_name: Test
# Ads block
ads:
  meta:
    enabled: true
    # keep this comment
    ad_account_ids:
      - '111'
  test_email_patterns:
    - '@example.com'

# Next block
seo:
  title: X
`;

describe("extractTopLevelBlock", () => {
  it("moves the block with its comments, dedented, and leaves the rest intact", () => {
    const { block, rest } = extractTopLevelBlock(SETTINGS, "ads");
    expect(block).toContain("# keep this comment");
    expect(yaml.load(block!)).toEqual({ meta: { enabled: true, ad_account_ids: ["111"] }, test_email_patterns: ["@example.com"] });
    expect(rest).toContain("# Next block\nseo:");
    expect(yaml.load(rest)).toEqual({ site_name: "Test", seo: { title: "X" } });
  });

  it("no block → null", () => {
    expect(extractTopLevelBlock("a: 1\n", "ads")).toEqual({ block: null, rest: "a: 1\n" });
  });
});

describe("planAdsConfigMigration", () => {
  const base = { contentFolder: "site_x", pending: [] as string[] };

  it("only the old block → move", () => {
    const plan = planAdsConfigMigration({ ...base, settingsText: SETTINGS, adsConfigText: null });
    expect(plan.action).toBe("move");
  });

  it("no block and no ads-config.yml → nothing", () => {
    expect(planAdsConfigMigration({ ...base, settingsText: "a: 1\n", adsConfigText: null })).toEqual({ action: "nothing", reason: "no ads settings on this site" });
  });

  it("already moved → nothing; pending files → recover", () => {
    expect(planAdsConfigMigration({ ...base, settingsText: "a: 1\n", adsConfigText: "meta: {}\n" }).action).toBe("nothing");
    const plan = planAdsConfigMigration({ ...base, pending: ["site_x/ads-config.yml"], settingsText: "a: 1\n", adsConfigText: "meta: {}\n" });
    expect(plan).toEqual({ action: "recover", files: ["site_x/ads-config.yml"] });
  });

  it("both exist → new file wins; reports whether they differed", () => {
    const same = planAdsConfigMigration({
      ...base,
      settingsText: SETTINGS,
      adsConfigText: "meta:\n  enabled: true\n  ad_account_ids: ['111']\ntest_email_patterns: ['@example.com']\n",
    });
    expect(same).toMatchObject({ action: "drop_leftover", differed: false });
    const diff = planAdsConfigMigration({ ...base, settingsText: SETTINGS, adsConfigText: "meta:\n  enabled: false\n" });
    expect(diff).toMatchObject({ action: "drop_leftover", differed: true });
  });

  it("unreadable ads-config.yml blocks removing the old block", () => {
    const plan = planAdsConfigMigration({ ...base, settingsText: SETTINGS, adsConfigText: "meta: [x\n" });
    expect(plan.action).toBe("blocked");
  });

  it("flow-style ads block is blocked rather than guessed", () => {
    const plan = planAdsConfigMigration({ ...base, settingsText: "ads: { meta: { enabled: true } }\nb: 1\n", adsConfigText: null });
    expect(plan.action).toBe("blocked");
  });
});

describe("runAdsConfigMigration", () => {
  let cwd: string;
  let root: string;

  beforeEach(() => {
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), "ads-mig-"));
    root = path.join(cwd, "site_x");
    fs.mkdirSync(root);
    fs.writeFileSync(path.join(root, "settings.yml"), SETTINGS);
  });

  afterEach(() => {
    fs.rmSync(cwd, { recursive: true, force: true });
  });

  const deps = (push: AdsConfigMigrationDeps["push"]): AdsConfigMigrationDeps => ({
    sites: () => [{ name: "site_x", contentRoot: root }],
    pending: () => [],
    markModified: vi.fn(),
    push,
  });

  it("dry run writes and pushes nothing", async () => {
    const push = vi.fn();
    const { failed } = await runAdsConfigMigration({ dryRun: true, deps: deps(push), log: () => {}, error: () => {} });
    expect(failed).toBe(false);
    expect(push).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(root, "ads-config.yml"))).toBe(false);
  });

  it("apply writes both files and pushes them in one commit", async () => {
    const push = vi.fn(async () => ({ success: true, commitHash: "abc123" }));
    const log = vi.fn();
    const { failed } = await runAdsConfigMigration({ dryRun: false, deps: deps(push), log, error: () => {} });
    expect(failed).toBe(false);
    expect(push).toHaveBeenCalledWith("site_x", ["site_x/ads-config.yml", "site_x/settings.yml"], expect.any(String));
    expect(log).toHaveBeenCalledWith("commitSha", "abc123");
    expect(yaml.load(fs.readFileSync(path.join(root, "settings.yml"), "utf-8"))).toEqual({ site_name: "Test", seo: { title: "X" } });
    expect(fs.readFileSync(path.join(root, "ads-config.yml"), "utf-8")).toContain("# keep this comment");
  });

  it("fails when the push returns no SHA", async () => {
    const push = vi.fn(async () => ({ success: false, error: "nope" }));
    const { failed } = await runAdsConfigMigration({ dryRun: false, deps: deps(push), log: () => {}, error: () => {} });
    expect(failed).toBe(true);
  });

  it("is idempotent: a second run finds nothing to do", async () => {
    const push = vi.fn(async () => ({ success: true, commitHash: "abc123" }));
    await runAdsConfigMigration({ dryRun: false, deps: deps(push), log: () => {}, error: () => {} });
    push.mockClear();
    const { failed } = await runAdsConfigMigration({ dryRun: false, deps: deps(push), log: () => {}, error: () => {} });
    expect(failed).toBe(false);
    expect(push).not.toHaveBeenCalled();
  });

  it("unknown MIGRATION_SITE fails", async () => {
    const { failed } = await runAdsConfigMigration({ site: "site_nope", dryRun: true, deps: deps(vi.fn()), log: () => {}, error: () => {} });
    expect(failed).toBe(true);
  });
});
