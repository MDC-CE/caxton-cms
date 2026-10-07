import { describe, expect, it } from "vitest";
import { coveredDays, creditLead, isLowSample, totalsByLanding } from "./paid-attribution";

const DAY = 86_400_000;
const now = Date.parse("2026-09-20T12:00:00.000Z");

const lead = (over: Record<string, unknown> = {}) => ({
  submission_id: "s1",
  created_at: now,
  is_test: 0 as const,
  is_repeat: 0 as const,
  first_paid_host: "4geeks.com",
  first_paid_path: "/en/first/",
  first_paid_at: now - 20 * DAY,
  last_paid_host: "www.4geeks.com",
  last_paid_path: "/en/last",
  last_paid_at: now - 60_000,
  ...over,
});

describe("creditLead", () => {
  it("credits the last paid landing by default and the first when switched", () => {
    expect(creditLead(lead())).toMatchObject({ reason: "credited", host: "4geeks.com", path: "/en/last", last_visit_organic: false });
    expect(creditLead(lead(), "first_paid")).toMatchObject({ reason: "credited", path: "/en/first" });
  });

  it("never credits test leads", () => {
    expect(creditLead(lead({ is_test: 1 })).reason).toBe("test");
  });

  it("drops paid landings older than the 30-day lookback", () => {
    expect(creditLead(lead({ last_paid_at: now - 31 * DAY })).reason).toBe("outside_lookback");
  });

  it("flags leads that came in a later visit", () => {
    expect(creditLead(lead({ last_paid_at: now - 2 * DAY })).last_visit_organic).toBe(true);
  });

  it("reports no paid landing", () => {
    expect(creditLead(lead({ last_paid_host: null })).reason).toBe("no_paid_landing");
  });
});

describe("totalsByLanding", () => {
  it("counts repeats as submissions, not leads", () => {
    const credits = [
      creditLead(lead()),
      creditLead(lead({ submission_id: "s2", is_repeat: 1 })),
      creditLead(lead({ submission_id: "s3", is_test: 1 })),
    ];
    const t = totalsByLanding(credits).get("4geeks.com|/en/last")!;
    expect(t).toMatchObject({ unique_leads: 1, submissions: 2, repeat_submissions: 1 });
  });
});

describe("helpers", () => {
  it("isLowSample uses the minimum paid visits", () => {
    expect(isLowSample(19)).toBe(true);
    expect(isLowSample(20)).toBe(false);
  });

  it("coveredDays counts days since collection started", () => {
    expect(coveredDays("2026-09-01", "2026-09-28", null)).toEqual({ covered: 0, total: 28 });
    expect(coveredDays("2026-09-01", "2026-09-28", Date.parse("2026-08-01T00:00:00Z"))).toEqual({ covered: 28, total: 28 });
    expect(coveredDays("2026-09-01", "2026-09-28", Date.parse("2026-09-21T15:00:00Z"))).toEqual({ covered: 8, total: 28 });
  });
});
