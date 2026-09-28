import { describe, expect, it } from "vitest";
import { evaluateDatabaseHealth, lastGoodCacheInputs } from "./databaseHealthChecks";
import { annotateStaleSourceIssues } from "../service";
import type { ContentFile, ValidationContext, ValidatorResult } from "./types";

const DAY = 86_400_000;

const config = {
  name: "Exercises",
  source: { type: "local", local: { filename: "rows.yml" } },
} as unknown as Parameters<typeof evaluateDatabaseHealth>[1];

function staleCodes(ageMs: number, staleErrorAfterDays?: number) {
  const cfg = staleErrorAfterDays ? { ...config, cache: { stale_error_after_days: staleErrorAfterDays } } : config;
  const out = evaluateDatabaseHealth(
    "exercises",
    cfg as typeof config,
    "/tmp/site_test",
    undefined,
    { fetched_at: new Date(Date.now() - ageMs).toISOString(), item_count: 2 },
    0,
    ageMs,
  );
  return {
    errors: out.errors.filter((i) => i.code === "DATABASE_CACHE_STALE"),
    warnings: out.warnings.filter((i) => i.code === "DATABASE_CACHE_STALE"),
  };
}

describe("stale database copies", () => {
  it("reports the last good copy's age only when it is past the TTL", () => {
    const dbm = (stale: boolean) => ({
      getLastGoodItems: () => ({ fetchedAt: "2026-01-01T00:00:00.000Z", items: [{}, {}], stale, ageMs: 3 * DAY }),
    });
    expect(lastGoodCacheInputs(dbm(true), "x")).toEqual({
      cacheInfo: { fetched_at: "2026-01-01T00:00:00.000Z", item_count: 2 },
      staleAgeMs: 3 * DAY,
    });
    expect(lastGoodCacheInputs(dbm(false), "x").staleAgeMs).toBeUndefined();
    expect(lastGoodCacheInputs({ getLastGoodItems: () => null }, "x")).toEqual({ cacheInfo: null });
  });

  it("DATABASE_CACHE_STALE is a warning, then an error after stale_error_after_days (default 7)", () => {
    expect(staleCodes(2 * DAY)).toMatchObject({ errors: [], warnings: [expect.anything()] });
    expect(staleCodes(8 * DAY)).toMatchObject({ errors: [expect.anything()], warnings: [] });
    expect(staleCodes(3 * DAY, 2)).toMatchObject({ errors: [expect.anything()], warnings: [] });
  });

  it("marks issues on pages checked against an old copy", () => {
    const file = {
      filePath: "site_test/exercises/flexbox/en.yml",
      staleSourceAgeMs: 2 * DAY,
      staleSourceDatabase: "exercises",
    } as unknown as ContentFile;
    const context = { contentFiles: [file] } as unknown as ValidationContext;
    const result: ValidatorResult = {
      name: "x",
      description: "",
      status: "warning",
      errors: [],
      warnings: [
        { type: "warning", code: "A", message: "Title too long.", file: "site_test/exercises/flexbox/en.yml" },
        { type: "warning", code: "B", message: "Other page.", file: "site_test/pages/about/en.yml" },
      ],
      duration: 0,
    };
    annotateStaleSourceIssues(result, context);
    expect(result.warnings[0].message).toBe(
      "Title too long. Checked against data from 2 days ago; the source may already be fixed.",
    );
    expect(result.warnings[0].staleSourceAgeMs).toBe(2 * DAY);
    expect(result.warnings[0].staleSourceDatabase).toBe("exercises");
    expect(result.warnings[1].message).toBe("Other page.");
  });
});
