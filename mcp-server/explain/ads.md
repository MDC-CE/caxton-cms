# Ads (paid traffic)

Call this topic before answering “what are ads doing for us?” or “why do Meta numbers not match the site?”. Tool: **`get_paid_traffic`** (`metrics_view`, read-only). Organic search → topic `seo` / `get_organic_traffic`. General GA4 behavior → topic `analytics` / `get_analytics_report`.

## Sources (never summed)

| Source | What it gives | Where it lives |
|---|---|---|
| Meta Marketing API | spend, clicks, landing page views, Meta-reported leads (pixel + instant forms), ad creative link | `.cache/{site}/meta-ads-days/{date}.json` (refresh last 10 days, keep 13 months, 90-day backfill) |
| GA4 BigQuery export | paid visits per landing page, engagement, bounce, experiment variant | `.cache/{site}/paid-landing-days/{date}.json` (complete days only, ~2-day lag) |
| Lead ledger | site leads (unique vs repeat, test flag), last paid landing | pipeline SQLite `lead_submissions` (no PII, 25-month retention) |

Meta-reported leads and site leads are **separate columns** — never add them. Spend is **per currency**, never converted (`mixed_currency` warning when accounts differ).

## Modes

| Mode | Returns |
|---|---|
| `summary` | totals, top 5 pages by spend, counts of pages / destinations / campaigns |
| `campaigns` | campaign groups (spend, clicks, Meta leads, paid visits, pages) — paginated |
| `entries` | managed pages with paid visits; `group=campaign` keeps full per-row campaign list; `split_by_version` adds per-variant rows |
| `destinations` | spend that did **not** land on a managed page: instant forms, off-site, other site in sites.yml, missing page, unknown destination — so totals reconcile with Meta |
| `diagnostics` | tracking issues (error/warning/info, spend affected, how to fix), KPIs, consent rates per region; `days` ≤7 → 7 else 28 |

`days` 1–90 ending **yesterday**. `limit` default 25 (max 100) + `offset`.

## Paid classification

- Paid = paid medium (`cpc`, `paid_social`, …) **or** a platform click ID that implies paid (`gclid` alone = Google paid).
- Meta needs a paid medium **or** a matching Meta ID (`utm_id` campaign / `utm_content` ad). `fbclid` alone = **Meta: unclear** (organic Facebook shares carry it too).
- UTM template for every Meta ad (shown in Settings → Ads): `utm_source=facebook&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_id={{campaign.id}}&utm_term={{adset.id}}&utm_content={{ad.id}}`.

## Lead credit

- One lead → one landing page. Default **last paid landing** (`model=last_paid`); `first_paid` is the switch. 30-day lookback, **no split**. The form page never gets credit unless it was itself the paid landing.
- Repeats (same browser + same form within 24h) are **submissions**, not leads. Test leads (staff session / test email pattern) are excluded from counts but still delivered to the CRM.
- `last_visit_organic`: lead credited to paid, but the visit where they converted came organically (>30 min gap). Shown, not re-credited.
- Journeys are **per browser** (`attribution.basis: browser_observed`) — cross-device paths are invisible.

## Limits agents must state

- **Consent:** ask regions (EU/EEA/UK/CH) need opt-in; Consent Mode v2 advanced mode models some rejected visits in GA4. `consent.ask_region_reject_pct` → say “includes estimates” when non-null. Fewer accepts means fewer *measured* visits, not fewer real ones.
- **Covered days:** site leads exist only since the ledger started (`collecting_since`, `covered_days`). Earlier windows under-count site leads (`ledger_collecting` warning).
- **Low sample:** rates are unreliable under `thresholds.min_paid_visits_for_rates` (default 20) paid visits (`low_sample: true`).

## Warnings

| Code | Meaning / action |
|---|---|
| `meta_refresh_in_progress` | Background refresh running — re-call in ~1 minute (see `next_actions`) |
| `meta_not_connected` | No token (`META_ADS_ACCESS_TOKEN`) or no enabled accounts — staff: `/private/settings/ads/meta` |
| `ga4_not_configured` | BigQuery export unset — staff: `/private/tracking/ga4` |
| `mixed_currency` | Accounts in several currencies — compare within one currency |
| `ledger_collecting` | Window starts before the ledger — site lead counts partial |
| `consent_estimates` | Ask-region visits include Consent Mode estimates |

`status: "not_configured"` when neither Meta nor GA4 is set up.

## Side effects / non-effects

- Reads may enqueue one background refresh (`meta_ads_sync` job) when data is older than 24h; the response does not wait for it.
- `diagnostics` probes up to 10 top ad landing URLs (cached 6h) and records Issues/Resolved in `.cache/{site}/ads-issues.json`.
- Never changes Meta campaigns, settings, consent, or lead delivery. Settings edits are staff-only (`ads_settings`, UI).

## Paths

- Server: `server/ads/` (`meta-client.ts`, `meta-ads-days.ts`, `paid-detection.ts`, `ads-report.ts`, `ads-diagnostics.ts`, `lead-ledger.ts`, `ads-refresh.ts`), routes `server/routes/ads.ts`
- Shared rules: `shared/paid-traffic.ts`, `shared/paid-attribution.ts`, `shared/ads-diagnostics-rules.ts`, `shared/ads-settings.ts`
- Settings: `ads:` block in `site_<name>/settings.yml`; token env `META_ADS_ACCESS_TOKEN`
- Staff UI: Diagnostics → Ads (`/private/diagnostics/ads`), Ads perspective on each content type list, Settings → Ads
- Cookies & consent: `docs/cookies.md`
