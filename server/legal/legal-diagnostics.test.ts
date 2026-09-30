import { describe, expect, it, vi } from "vitest";
import type { ConsentDailyRow } from "../ads/consent-store";

vi.mock("../ads/consent-store", () => ({
  listConsentDaily: () => [],
}));

import { buildLegalDiagnosticsFromRows, consentRates } from "./legal-diagnostics";

const NOW = new Date("2026-09-29T12:00:00.000Z");

function row(partial: Partial<ConsentDailyRow>): ConsentDailyRow {
  return { date: "2026-09-20", country: "DE", mode: "ask", shown: 0, granted_explicit: 0, granted_implied: 0, denied: 0, ...partial };
}

describe("buildLegalDiagnosticsFromRows", () => {
  it("reports no_data when no banners were shown", () => {
    const d = buildLegalDiagnosticsFromRows([], [], { days: 28, now: NOW });
    expect(d.status).toBe("no_data");
    expect(d.kpis.banners_shown).toBe(0);
    expect(d.kpis.accept_pct).toBeNull();
    expect(d.issues).toEqual([]);
    expect(d.consent.map((r) => r.region)).toEqual(["ask", "notice", "unknown"]);
  });

  it("computes per-region and overall rates", () => {
    const rows = [
      row({ country: "DE", mode: "ask", shown: 100, granted_explicit: 60, denied: 30 }),
      row({ country: "US", mode: "notice", shown: 50, granted_implied: 40 }),
      row({ country: "??", mode: "ask", shown: 10, granted_explicit: 5 }),
    ];
    const regions = consentRates(rows);
    expect(regions.find((r) => r.region === "ask")).toEqual({ region: "ask", shown: 100, accept_pct: 60, reject_pct: 30, ignore_pct: 10 });
    expect(regions.find((r) => r.region === "notice")).toMatchObject({ shown: 50, accept_pct: 80, reject_pct: 0, ignore_pct: 20 });
    expect(regions.find((r) => r.region === "unknown")).toMatchObject({ shown: 10, accept_pct: 50 });

    const d = buildLegalDiagnosticsFromRows(rows, [], { days: 28, now: NOW });
    expect(d.status).toBe("ok");
    expect(d.kpis).toEqual({ banners_shown: 160, accept_pct: 65.6, reject_pct: 18.8, ignore_pct: 15.6 });
  });

  it("warns when the ask-region accept rate drops vs the trailing 28 days", () => {
    const trailing = [row({ date: "2026-08-20", shown: 200, granted_explicit: 160, denied: 40 })];
    const current = [row({ shown: 200, granted_explicit: 40, denied: 60 })];
    const d = buildLegalDiagnosticsFromRows(current, trailing, { days: 28, now: NOW });
    expect(d.status).toBe("warnings");
    expect(d.issues).toHaveLength(1);
    expect(d.issues[0]).toMatchObject({ id: "consent_rate_drop", severity: "warning" });
    expect(d.issues[0]!.why).toContain("50%");
  });
});
