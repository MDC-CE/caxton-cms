# Caxton integrations and costs

Caxton is not one vendor bill. The public site and staff CMS rely on several third-party services: hosting, cloud storage, analytics, AI tokens, and optional tools for media, forms, and checkout.

This guide explains **what each service does**, **when you need it**, **what to monitor**, and **rough cost drivers**. It is for ops, product owners, and anyone approving spend.

Related: [Asking Caxton for reports](asking-caxton-for-reports.md) (what to ask agents), [What the agent swarm can do](what-the-agent-swarm-can-do.md), [What you can edit directly](what-you-can-edit-directly.md).

Engineers configuring secrets: see the project install manual — this doc does not list API keys or env names.

---

## How to read each service

Every integration below uses the same four blocks:

1. **What it does**  
2. **When you need it**  
3. **What to monitor**  
4. **Cost notes** — including ballparks for a marketing site with about **33k Google Analytics active users per month** (planning ranges only, not quotes)

### Estimate disclaimer

- **GA active users ≠ BigQuery bill.** Export size and how often people/agents run queries matter more than MAU alone.  
- **Report asks are cheap when cached; expensive when hammered** with wide date ranges and many parallel agent sessions.  
- **AI / agent token use** is usually the largest swing factor.  
- **Stripe** (if you use it) is a commerce fee on charges — separate from CMS hosting.  
- Numbers below are **order-of-magnitude** for one typical site; multi-site multiplies storage and analytics.

---

## Core platform

### Hosting / VPS (app + background worker)

**What it does:** Runs the Caxton website and CMS, plus the background worker that processes jobs after saves (indexes, validation follow-ups, and similar).

**When you need it:** Always — without hosting there is no site.

**What to monitor:** CPU, RAM, disk, bandwidth; process health for the main app and the background worker; uptime alerts.

**Cost notes:** Small VPS often **$20–80/mo** at this traffic band; **$100–200/mo** if you colocate heavy extras (vector search) or need headroom for spikes. Traffic from ~33k active users is usually fine on a modest box if caching and CDN are sensible.

---

### PostgreSQL

**What it does:** Stores staff accounts, sessions, and related app data. It is **not** where page YAML / marketing content lives (that lives in the content files / GitHub).

**When you need it:** Always for staff login and CMS auth.

**What to monitor:** Database size, connection count, backup success, managed-DB plan limits.

**Cost notes:** Often **$0–30/mo** on a small managed instance; higher if you keep huge session history or many environments.

---

### GitHub (content repository)

**What it does:** Holds the source of truth for site content (pages, programs, registries). Staff and agents sync edits to/from this repo. Production staff commits often use GitHub Connect rather than a shared robot identity.

**When you need it:** Required for durable content sync across machines and deploys. Local-only content is wiped when sync pulls.

**What to monitor:** Repo size, Actions minutes (if used), API rate-limit errors during heavy sync, seat count for humans who Connect.

**Cost notes:** Public/org free tiers often cover the repo; seats may be **$0–4+/user/mo**. Rarely the dominant Caxton cost.

---

### Domain, DNS, and CDN

**What it does:** Makes the site reachable on your hostname and (when using a CDN) caches static assets closer to visitors.

**When you need it:** Always for a public marketing site.

**What to monitor:** DNS correctness, TLS certificates, CDN cache hit rate, WAF/bot events if enabled.

**Cost notes:** Domain is a few dollars per year; CDN is often **$0** on a free tier at this scale, or a modest Cloudflare plan if you buy extras.

---

## Storage

### Google Cloud Storage (GCS)

**What it does:** Cloud file storage for Caxton: media/images, multi-site configuration, various caches, encrypted MCP login blobs, and other sync artifacts. Keeps state durable across deploys.

**When you need it:** Strongly recommended in production for media and multi-site. Without it, media and some auth persistence stay local and do not survive clean deploys the same way.

**What to monitor:** Bucket size growth, class of storage, **egress** (downloads), operation counts; confirm the bucket matches what Site Manager expects.

**Cost notes:** For tens of GB and moderate gallery traffic, often **$2–25/mo** storage+ops; **$40–80+/mo** if the library is huge or egress is high without CDN caching. Growth is usually gradual — watch month-over-month GB.

*Media growth and egress are the same bucket economics as above; treat “hot videos without CDN” as the main egress risk.*

---

## Analytics and reporting

### Google Analytics 4 (GA4)

**What it does:** Collects visitor behavior on the public site (sessions, events, conversions you configure). Staff and marketing use it as the primary behavioral analytics product.

**When you need it:** Needed for on-site behavior reporting and as the source that can export into BigQuery for Caxton reports.

**What to monitor:** Property health, tag firing, consent mode if applicable, conversion event configuration (including “Count as lead”).

**Cost notes:** At ~33k active users, GA4 itself is typically **$0**. The bill appears when you export and query data in BigQuery (next).

---

### GA4 → BigQuery export

**What it does:** Copies GA4 event data into Google BigQuery so Caxton can run staff/agent reports (site summary, top pages, leads by channel, product journey metrics, and similar).

**When you need it:** Required for [Asking Caxton for reports](asking-caxton-for-reports.md) style answers from Caxton. Without it, those GA-backed tools show “not configured.”

**What to monitor:** Export enabled; dataset size; **query bytes billed** per month; failed jobs; retention (how many days of `events_*` you keep). Staff: Tracking → GA4 / BigQuery status in the CMS.

**Cost notes:** Storage often **$1–15/mo** at this scale with common retention; queries often **$5–60/mo** with normal use, **$100–300+** if agents and staff repeatedly run wide, uncached windows. Caps on billed bytes per query exist in the product, but **frequency** still drives cost.

---

### Search Console data (organic tools)

**What it does:** Provides **measured** Google search clicks and impressions for URLs and topic-style reads in Caxton (separate from GA sessions).

**When you need it:** Required for honest organic/SEO reporting in Caxton. Planning keyword research is a different paid path (see SEO research below).

**What to monitor:** Search Console property linking; BigQuery/GSC pipeline health if you use the BQ path; cache freshness vs forced refresh.

**Cost notes:** Search Console itself is **$0**. Cost sits in BigQuery (and rare API quota). Do not mix organic clicks with GA sessions as one “traffic” KPI.

---

### Report usage pattern (people and agents)

**What it does:** Not a vendor — it is *how* you use analytics. Every Caxton report ask can trigger warehouse reads when caches miss.

**When you need it:** Always be aware of it if agents run weekly packs from the reports guide.

**What to monitor:** How often agents re-pull the same 28-day windows; prefer cached answers; teach packs in [Asking Caxton for reports](asking-caxton-for-reports.md) without “refresh everything every hour.”

**Cost notes:** Same mid-band BQ as above when disciplined; agent-heavy orgs push the high band.

---

## AI and agents

### OpenRouter / LLM provider

**What it does:** Runs language-model completions for staff AI features (settings under AI & Agents) and for **MCP / Caxton agent** sessions that draft, diagnose, and propose.

**When you need it:** Optional for a static brochure site; **required** for AI tagging, assistants, and agent swarms.

**What to monitor:** OpenRouter (or provider) spend by day; model mix (small vs large); which staff or agents consume the most; error/rate limits. CMS: AI Settings for default models.

**Cost notes:** Quiet use **$20–50/mo**; normal staff+light swarm **$100–400/mo**; heavy swarm on large models **$500–2,000+/mo**. This is usually the **#1 swing** in total Caxton-adjacent spend.

---

### SEO research / SERP APIs

**What it does:** Pulls planning research (keywords, SERP snapshots, competitors, gaps). Distinct from Search Console’s measured clicks. Caxton may ask you to confirm budget before expensive refreshes; results are often cache-first for days/weeks.

**When you need it:** When SEO/content teams plan new angles — not required for day-to-day GSC reporting.

**What to monitor:** Provider invoice; cache hit vs fresh pulls; staff confirming research budget repeatedly.

**Cost notes:** Often **$0–80/mo** with cache discipline; **$150+** if many people force fresh SERP pulls daily.

---

### Qdrant and local embeddings (semantic FAQ search)

**What it does:** Lets private content banks (for example FAQs) search by **meaning**, not only exact keywords. Embeddings in this stack are typically **local** (not billed through OpenRouter). Qdrant stores vectors.

**When you need it:** Only if you enable semantic search on databases. Keyword search still works without it.

**What to monitor:** Qdrant uptime; disk/RAM if self-hosted; reindex jobs after large FAQ edits; Cloud plan if not self-hosted.

**Cost notes:** **$0** if off; self-host = hosting RAM; cloud often **$25–100+/mo**. Do not confuse this with LLM token spend.

---

## Media and capture

### Cloudflare Browser Rendering

**What it does:** Takes server-side screenshots of pages to build **social / entry preview (OG) images** when staff or agents regenerate previews.

**When you need it:** When you want automated OG/preview captures. Optional if you set gallery images by hand.

**What to monitor:** Cloudflare Browser Rendering usage; failed captures (SITE_URL must be publicly reachable); CMS SEO/GEO → OG Image status.

**Cost notes:** Often **$0–40/mo**; spikes when regenerating many locales/pages at once.

---

### Cloudflare Turnstile

**What it does:** Bot protection on lead-capture forms (challenge instead of classic CAPTCHA).

**When you need it:** Recommended on public lead forms to cut spam.

**What to monitor:** Challenge failure rates; Cloudflare Turnstile analytics; form conversion if challenges are too aggressive.

**Cost notes:** Usually **$0** at moderate lead volume.

---

## Optional / situational

### ipapi.pro (geo / locale)

**What it does:** Looks up visitor IP geography to help send people to a locale-appropriate experience.

**When you need it:** Only if you enable IP-based locale detection.

**What to monitor:** Lookup volume vs plan; cache behavior; cost overages.

**Cost notes:** **$0–30/mo** typical; higher if every hit is billed with no caching.

---

### Cloudflare Tunnel (ops)

**What it does:** Securely exposes or connects environments (for example agent tunnels or named hostnames) without opening raw server ports.

**When you need it:** Ops/dev convenience — not required for a normal public CDN site.

**What to monitor:** Tunnel uptime; token rotation; accidental exposure of staging.

**Cost notes:** Free tier often enough; paid Cloudflare plans if bundled with other products.

---

### Stripe (our checkout integration)

**What it does:** Processes payment when the school uses Caxton’s Stripe checkout path instead of (or alongside) an external POS.

**When you need it:** When you sell/enroll through Stripe on this stack. Not required if checkout stays 100% on the school POS.

**What to monitor:** Stripe dashboard — volume, disputes, failed payments, fee schedule.

**Cost notes:** **Percentage + fixed fee per successful charge** (commerce), not a flat “CMS hosting” line. Do not mix with OpenRouter or BigQuery.

---

### School POS → Google Analytics (offline / purchase conversions)

**What it does:** Sends closed enrollments (purchases) into the same GA4 property Caxton reads, so reports can show **purchases by program**. Caxton does not invent sales.

**When you need it:** Required for truthful purchase numbers in [Asking Caxton for reports](asking-caxton-for-reports.md). Alternative: Stripe integration feeding GA the same way.

**What to monitor:** Purchase events arriving in GA; product IDs matching CMS programs; ops “purchases stuck at zero” checks.

**Cost notes:** Usually **$0 to Caxton** (cost lives in the POS). Operational risk is high if the feed breaks — reports go quiet, not the CMS bill.

---

## Usually free, still watch quotas

### GitHub API limits

**What it does:** Powers content pull/push and automation against the content repo.

**When you need it:** Whenever sync is enabled.

**What to monitor:** 403/rate-limit errors during bulk sync; Actions minutes.

**Cost notes:** **$0** until you exceed plan limits or buy seats.

---

### Analytics API quotas (GA / Search Console)

**What it does:** Caps how often live APIs can be called. Caxton prefers BigQuery export paths for heavy reporting.

**When you need it:** Background constraint for any remaining live API use.

**What to monitor:** Quota errors in logs; prefer BQ-backed reports for agents.

**Cost notes:** **$0**; failures look like “empty reports,” not invoices.

---

## Ballpark monthly total (~33k GA active users)

Illustrative **CMS-adjacent** spend (excludes Stripe % of tuition and human Cursor/IDE seats):

| Mode | Rough total / month | Typical drivers |
|---|---:|---|
| **Quiet** | **$50–150** | Small VPS, light AI, cached reports |
| **Normal** | **$150–500** | Modest agents, normal BQ + GCS |
| **Agent-heavy** | **$600–2,500+** | Daily swarm, large models, wide BQ refreshes |

| Cost center | Low | Mid | High |
|---|---:|---:|---:|
| Hosting / VPS | $20–40 | $40–80 | $100–200 |
| Postgres | $0–15 | $15–30 | $50+ |
| GCS | $2–8 | $8–25 | $40–80 |
| BigQuery storage | $1–5 | $5–15 | $20–40 |
| BigQuery queries | $5–20 | $20–60 | $100–300+ |
| OpenRouter / LLM | $20–50 | $100–400 | $500–2,000+ |
| SEO research APIs | $0–20 | $20–80 | $150+ |
| Browser Rendering | $0–10 | $10–40 | $80+ |
| Turnstile | $0 | $0 | ~$0 |
| ipapi | $0–10 | $10–30 | $50+ |
| Qdrant | $0 | $0–25 | $50–100+ |
| GitHub | $0 | $0–seats | Team plan |

---

## Monthly checklist

Use this once a month (or after a busy agent week):

1. **OpenRouter / LLM** — spend trend; any jump in model size?  
2. **BigQuery** — storage GB and query bytes; unexpected spikes?  
3. **GCS** — bucket size and egress vs last month.  
4. **Hosting** — CPU/RAM headroom for app + background worker.  
5. **Browser Rendering** — capture volume (bulk OG regen?).  
6. **SEO research** — fresh pulls vs cache; budget confirms.  
7. **Postgres** — size and backups.  
8. **Stripe** (if used) — fees vs enrollment volume (commerce, not hosting).  
9. **Purchase feed** — sample program still shows purchases in GA when sales happened (POS or Stripe).  
10. **Quotas** — GitHub or analytics errors that looked like “empty data.”

---

## One-sentence mental model

**Know what each service is for before you watch its bill — hosting runs Caxton, GCS keeps files, BigQuery powers reports, OpenRouter powers agents, and checkout fees only appear when money actually moves.**
