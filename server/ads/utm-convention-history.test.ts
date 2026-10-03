import { describe, expect, it } from "vitest";
import { DEFAULT_UTM_CONVENTION, parseUtmConvention } from "@shared/ads-settings";
import { conventionHash, graceFromHistory, UTM_GRACE_DAYS, type UtmConventionHistory } from "./utm-convention-history";

const DAY = 86_400_000;
const v = (convention: typeof DEFAULT_UTM_CONVENTION, seen_at: string) => ({ hash: conventionHash(convention), convention, seen_at });

describe("conventionHash", () => {
  it("ignores list order and key order", () => {
    const a = parseUtmConvention({ sources: { meta: { canonical: ["fb", "ig"] } } }).convention;
    const b = parseUtmConvention({ sources: { meta: { canonical: ["ig", "fb"] } } }).convention;
    expect(conventionHash(a)).toBe(conventionHash(b));
  });

  it("changes when a value changes", () => {
    const b = parseUtmConvention({ mediums: { meta: "cpc" } }).convention;
    expect(conventionHash(b)).not.toBe(conventionHash(DEFAULT_UTM_CONVENTION));
  });
});

describe("graceFromHistory", () => {
  const changed = parseUtmConvention({ sources: { meta: { canonical: ["fb", "ig"] } }, mediums: { meta: "cpc" }, campaign_pattern: "^x" }).convention;
  const old = { ...DEFAULT_UTM_CONVENTION, campaign_pattern: "^old" };

  it("first read is the baseline: no grace", () => {
    const h: UtmConventionHistory = { versions: [v(DEFAULT_UTM_CONVENTION, "2026-09-01T00:00:00.000Z")] };
    const g = graceFromHistory(h, DEFAULT_UTM_CONVENTION, new Date("2026-09-02T00:00:00.000Z"));
    expect(g.active).toBe(false);
    expect(g.accepted_old_values).toEqual([]);
  });

  it("a change starts a 28-day grace for the removed values", () => {
    const changedAt = "2026-09-10T00:00:00.000Z";
    const h: UtmConventionHistory = { versions: [v(old, "2026-09-01T00:00:00.000Z"), v(changed, changedAt)] };
    const g = graceFromHistory(h, changed, new Date("2026-09-15T00:00:00.000Z"));
    expect(g.active).toBe(true);
    expect(g.changed_at).toBe(changedAt);
    expect(g.ends_at).toBe(new Date(Date.parse(changedAt) + UTM_GRACE_DAYS * DAY).toISOString());
    expect(g.accepted.meta?.sources.sort()).toEqual(["an", "msg"]);
    expect(g.accepted.meta?.mediums).toEqual(["paid_social"]);
    expect(g.campaign_patterns).toEqual(["^old"]);
    expect(g.accepted_old_values).toEqual(expect.arrayContaining(["utm_source=msg", "utm_medium=paid_social", "utm_campaign~^old"]));
  });

  it("grace ends after 28 days", () => {
    const h: UtmConventionHistory = { versions: [v(old, "2026-08-01T00:00:00.000Z"), v(changed, "2026-08-02T00:00:00.000Z")] };
    expect(graceFromHistory(h, changed, new Date("2026-09-15T00:00:00.000Z")).active).toBe(false);
  });
});
