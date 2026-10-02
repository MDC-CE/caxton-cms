import React from "react";
import { beforeAll, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { AdsPageRow } from "./ads-types";
import type { OtherDestinationsCard as Card } from "./PaidPagesCard";

let OtherDestinationsCard: typeof Card;
beforeAll(async () => {
  // Vitest compiles JSX with the classic runtime; these modules rely on the automatic one.
  (globalThis as { React?: typeof React }).React = React;
  ({ OtherDestinationsCard } = await import("./PaidPagesCard"));
});

function row(over: Partial<AdsPageRow>): AdsPageRow {
  return {
    key: "dest:unknown",
    kind: "unknown_destination",
    kind_label: "Destination unknown",
    host: "",
    path: "",
    url: "",
    content_type: null,
    slug: null,
    locale: null,
    title: "Destination unknown",
    redirected_from: [],
    paid_visits: 0,
    matched_visits: 0,
    unclear_visits: 0,
    unassigned_visits: 0,
    engaged_sessions: 0,
    bounce_rate: null,
    avg_engaged_seconds: null,
    ga4_leads: 0,
    spend: { USD: 6758 },
    clicks: 0,
    untagged_clicks: 0,
    landing_page_views: 0,
    meta_leads: 0,
    instant_form_leads: 0,
    google_leads: 0,
    impressions: 0,
    pixel_leads_click: 0,
    unique_leads: 0,
    submissions: 0,
    repeat_submissions: 0,
    last_visit_organic: 0,
    started_here: 0,
    closed_here: 0,
    conversion_rate: null,
    meta_conversion_rate: null,
    ctr: null,
    landing_rate: null,
    lpv_to_visits: null,
    cost_per_visit: {},
    cost_per_lead: {},
    cpc: {},
    cpm: {},
    meta_cost_per_lead: {},
    clicks_to_visits: null,
    organic: null,
    low_sample: true,
    meta_low_sample: true,
    platforms: ["google"],
    campaigns: [],
    ...over,
  };
}

const render = (rows: AdsPageRow[]) => renderToStaticMarkup(<OtherDestinationsCard rows={rows} spendTotal={{ USD: 10000 }} />);

describe("OtherDestinationsCard", () => {
  it("makes the unknown destination row a button that opens the explainer", () => {
    const html = render([row({})]);
    expect(html).toMatch(/<button[^>]*data-testid="other-destination-dest:unknown"/);
    expect(html).toContain('aria-haspopup="dialog"');
  });

  it("keeps other destination rows static", () => {
    const html = render([row({ key: "dest:instant_form", kind: "instant_form", kind_label: "Instant Form", platforms: ["meta"] })]);
    expect(html).toMatch(/<div[^>]*data-testid="other-destination-dest:instant_form"/);
    expect(html).not.toContain('aria-haspopup="dialog"');
  });

  it("labels leads by the platforms that spent on the row", () => {
    const google = render([row({ platforms: ["google"] })]);
    expect(google).toContain("Destination unknown · Google");
    expect(google).toContain("Google leads");
    expect(google).not.toContain("Meta leads");

    const meta = render([row({ platforms: ["meta"] })]);
    expect(meta).toContain("Meta leads");
    expect(meta).not.toContain("Google leads");
  });
});
