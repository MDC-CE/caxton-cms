import { describe, expect, it, vi } from "vitest";

vi.mock("../site-config", () => ({
  getSiteConfigs: () => [
    { domain: "4geeks.com", contentFolder: "site_4geeks-com" },
    { domain: "fl.4geeksacademy.com", contentFolder: "site_4geeks-florida" },
  ],
}));

import { MAX_TIMEOUT_SECONDS, parseMigrationHeaders, primarySiteName, recordingSiteFor } from "./headers";

const header = (tags: string) => `/**\n * @migration Test\n * @description Does a thing\n *   across lines.\n${tags}\n */\n`;

describe("parseMigrationHeaders", () => {
  it("reads every tag", () => {
    const h = parseMigrationHeaders(
      "003_x.ts",
      header(" * @scope site\n * @dry-run\n * @production-only\n * @timeout 900"),
    );
    expect(h).toEqual({
      name: "Test",
      description: "Does a thing across lines.",
      scope: "site",
      scope_missing: false,
      supports_dry_run: true,
      timeout_seconds: 900,
      production_only: true,
    });
  });

  it("missing @scope is treated as all and flagged; defaults apply", () => {
    const h = parseMigrationHeaders("001_x.ts", header(""));
    expect(h).toMatchObject({
      scope: "all",
      scope_missing: true,
      supports_dry_run: false,
      timeout_seconds: 120,
      production_only: false,
    });
  });

  it("caps @timeout and ignores a --dry-run mention without the tag", () => {
    const h = parseMigrationHeaders("002_x.ts", header(" * @scope all\n * @timeout 99999\n * Honors --dry-run."));
    expect(h.timeout_seconds).toBe(MAX_TIMEOUT_SECONDS);
    expect(h.supports_dry_run).toBe(false);
  });

  it("falls back to the filename when @migration is missing", () => {
    expect(parseMigrationHeaders("004_foo.ts", "// nothing").name).toBe("004_foo");
  });
});

describe("recording site", () => {
  it("all-sites migrations are recorded in the primary site", () => {
    expect(primarySiteName()).toBe("site_4geeks-com");
    expect(recordingSiteFor("all", "site_4geeks-florida")).toBe("site_4geeks-com");
    expect(recordingSiteFor("site", "site_4geeks-florida")).toBe("site_4geeks-florida");
  });
});
