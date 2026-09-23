# Asking Caxton for reports

Copy-paste questions you can ask Caxton, plus what a good answer looks like. For anyone who needs website, lead, journey, or enrollment numbers — not a finance or CRM system of record.

For changing pages or reviewing proposals, see [What the agent swarm can do](what-the-agent-swarm-can-do.md) and [What you can edit directly](what-you-can-edit-directly.md).

For what each analytics/AI/cloud service **does** and what it tends to **cost**, see [Caxton integrations and costs](caxton-integrations-and-costs.md).

**Default time window:** last **28 days**, unless you ask for something else. Numbers can lag about a day behind the live Google Analytics UI.

---

## Five ways to read this

Packs share the same data. They differ by **what you ask first** and **why you care**.

| Path | Start here if you… | Jump |
|---|---|---|
| **A — Product / offer** | Own a program or offer; care about enrollments and the journey | [Product / offer pack](#pack-a--product--offer-owner) |
| **B — Marketing / growth** | Own channels, campaigns, landings, and creative ROI (generalist) | [Marketing / growth pack](#pack-b--marketing--growth) |
| **C — SEO / content growth** | Own search demand, snippets, and topic coverage | [SEO / content growth pack](#pack-c--seo--content-growth) |
| **D — Paid media** | Live in ads daily; scale/kill campaigns and landings | [Paid media pack](#pack-d--paid-media--performance) |
| **E — Ops / tracking** | Need to trust the numbers before anyone acts on them | [Ops / tracking pack](#pack-e--ops--tracking-trust-the-numbers) |

---

## Words that matter

| Word | Meaning here |
|---|---|
| **Leads** | Inquiries / applications counted as “Count as lead” events — **not** closed sales |
| **Purchases** | Closed enrollments reported into Google Analytics (when checkout feeds GA) |
| **Sessions / views** | Site traffic from analytics — **not** the same as Search Console clicks |
| **Organic clicks** | Measured search demand from Search Console — **not** the same as GA sessions |

**Do not call lead charts “sales.”**

### Where purchases come from (read once)

Closed enrollments appear in these reports only if the school’s checkout sends **purchase** or **offline conversion** events into the **same Google Analytics property** Caxton reads, with **product IDs that match** your CMS programs.

That feed usually comes from:

- the **school’s own POS**, or  
- **our Stripe integration**

Caxton reports what GA already received. It does not invent enrollments, tuition dollars, or CRM pipeline.

---

## How each report is written

1. **Report** — plain name  
2. **Why it matters** — for this pack’s lens  
3. **Ask Caxton** — ready to paste  
4. **Example answer** — fictional sample (*your numbers will differ*)

---

# Pack A — Product / offer owner

North star: **program outcomes, journey health, enrollments.**

## A1. Leads by channel

**Why it matters:** Shows whether traffic is turning into inquiries — the top of your offer pipeline.

**Ask Caxton:**  
“Which traffic sources brought the most leads in the last 28 days, and what’s the lead rate for each?”

**Example answer:**

> *Example — your numbers will differ.*  
> Last 28 days (complete days through yesterday):  
> - **google / organic** — 420 leads, ~3.1% lead rate  
> - **meta / cpc** — 180 leads, ~2.4% lead rate  
> - **(direct) / (none)** — 95 leads, ~1.8% lead rate  
> - **newsletter / email** — 60 leads, ~5.2% lead rate  
> Top converters by lead rate: email, then organic. Meta has solid volume but a weaker rate.  
> These are **leads**, not purchases.

---

## A2. Purchases by program

**Why it matters:** Closed enrollments by offer — the outcome that matters for the product.

**Ask Caxton:**  
“How many purchases did we record for each main program in the last 28 days?”

**Example answer:**

> *Example — your numbers will differ.*  
> Purchases in GA for the last 28 days (assumes POS or Stripe feeds purchase events with matching product IDs):  
> - **full-stack** — 42 purchases  
> - **data-science** — 18 purchases  
> - **ai-fluency** — 11 purchases  
> If a program shows **0** while you know enrollments happened, the checkout feed or product ID match is likely missing — Caxton cannot invent those sales.

---

## A3. Leads + purchases for one program

**Why it matters:** Separates “people asked” from “people enrolled” for a flagship offer.

**Ask Caxton:**  
“For full-stack, how many leads vs purchases last month, and which sources drove the leads?”

**Example answer:**

> *Example — your numbers will differ.*  
> **Full-stack**, last 28 days:  
> - **Leads:** 156 (top sources: google/organic 70, meta/cpc 45, email 20)  
> - **Purchases:** 42  
> Rough read: strong inquiry volume; about one purchase per ~3–4 leads in this window (not a formal conversion rate model — just a sanity check).  
> Leads are not sales; purchases depend on POS/Stripe → GA.

---

## A4. Checkout intent → purchase (one program)

**Why it matters:** Shows whether people start checkout but do not complete enrollment.

**Ask Caxton:**  
“For full-stack, compare begin-checkout intent and purchases last 28 days.”

**Example answer:**

> *Example — your numbers will differ.*  
> **Full-stack**, last 28 days:  
> - Checkout intent events (e.g. click to begin checkout on-site): **210**  
> - Purchases (from GA): **42**  
> Many people show intent; far fewer complete. Next step is usually landing/checkout UX or payment friction — not more top-of-funnel traffic alone.  
> On-site intent ≠ off-site purchase until POS/Stripe reports it.

---

## A5. Program journey health

**Why it matters:** Continues-ed offers live in stages (discover → compare → decide). Weak stages starve enrollments.

**Ask Caxton:**  
“For full-stack, which journey pages get sessions and views, and which stages look thin?”

**Example answer:**

> *Example — your numbers will differ.*  
> **Full-stack** journey, last 28 days:  
> - **Awareness** blog/guides — healthy sessions on 4 pages  
> - **Consideration** comparison pages — moderate; one URL near-zero  
> - **Decision** (program / money page) — strong sessions; main product page is active  
> Thin spot: one consideration page with almost no traffic — either promote it, fix discovery, or drop it from the journey map.  
> This does **not** prove people moved stage-to-stage; it shows which tagged pages are alive.

---

## A6. Site pulse

**Why it matters:** One-slide check: is the whole site soft, or is it one offer?

**Ask Caxton:**  
“Give me a 28-day site summary: sessions and anything that looks off.”

**Example answer:**

> *Example — your numbers will differ.*  
> Last 28 days: roughly **185k sessions**, engagement in a normal band for this site. No sharp cliff vs the prior window in this sample.  
> If one program’s leads dropped but site pulse is flat, look at channel mix or that journey — not “the website died.”

---

## A7. Top pages by traffic

**Why it matters:** Shows what content actually draws attention around your offers.

**Ask Caxton:**  
“What are our top 20 pages by sessions in the last 28 days? Call out program pages vs blog vs other.”

**Example answer:**

> *Example — your numbers will differ.*  
> Top sessions include: home, **full-stack** program page, two blog posts, **data-science** program page, pricing/FAQ.  
> Rough mix: ~40% program/money pages, ~35% blog, rest home/utility.  
> Useful for deciding which URLs deserve better proof, CTAs, or SEO titles.

---

## A8. Organic search demand

**Why it matters:** Are people finding your offers in search — separate from paid and from GA sessions?

**Ask Caxton:**  
“Where are we getting organic clicks and impressions for our main program URLs and topic groups?”

**Example answer:**

> *Example — your numbers will differ.*  
> Search Console (not GA):  
> - `/en/coding-bootcamps/full-stack` — strong clicks, stable impressions  
> - Topic group “AI” — rising impressions, clicks lagging (snippet opportunity)  
> - One program URL — impressions up, clicks down (title/description test candidate)  
> Organic clicks ≠ GA sessions; do not add them together as one “traffic” number.

---

## More reports (product pack)

### A9. Flagship page deep-dive

**Why it matters:** Pre-meeting read on the money page.

**Ask Caxton:** “How did the English full-stack program page perform last 28 days — sessions, views, and notable events?”

**Example answer:** *Example.* ~12k sessions, views tracking with sessions, solid lead events on-page; purchases attributed at product level (see A2), not always visible as path-level purchase.

---

### A10. Campaign / UTM lead check

**Why it matters:** Did a launch produce inquiries for your offer?

**Ask Caxton:** “Which campaigns drove the most leads last 28 days? Any high-session, low-lead campaigns?”

**Example answer:** *Example.* `spring_open_house` and `meta_fullstack_prospecting` lead; one brand campaign high sessions / weak leads — creative or landing mismatch.

---

### A11. Market / language split

**Why it matters:** Which market carries interest for your offer.

**Ask Caxton:** “Break down top pages and organic interest by language for our main programs.”

**Example answer:** *Example.* EN carries most program-page sessions; ES organic rising on one career topic — consider localized proof on the ES money page.

---

### A12. Lead-event tracking pulse

**Why it matters:** Trust the pipeline charts before you act on them.

**Ask Caxton:** “Which events count as leads, and did any drop off this period?”

**Example answer:** *Example.* Count-as-lead includes `request_more_info` and `student_application`. No drop in this sample. If leads fall to zero site-wide, check tracking before blaming marketing.

---

### A13. Broken high-intent URLs

**Why it matters:** Dead cohort/scholarship links waste demand aimed at your offer.

**Ask Caxton:** “Any high-traffic broken URLs that look like old campaigns or program paths we should redirect?”

**Example answer:** *Example.* One old `/en/apply/full-stack-spring` path with repeated hits — redirect to the live full-stack page; pause any ads still using it.

---

# Pack B — Marketing / growth

North star: **channel mix, campaigns, landings, creative ROI.**

## B1. Leads by channel + lead rate

**Why it matters:** Budget and channel story — volume and efficiency.

**Ask Caxton:**  
“Which sources/mediums drove the most leads last 28 days, and what’s the lead rate for each?”

**Example answer:** Same shape as [A1](#a1-leads-by-channel) — treat it as your weekly channel scorecard. Optimize rate *and* volume; do not scale a channel with empty lead rate.

---

## B2. Campaign / UTM lead leaders and laggards

**Why it matters:** Scale winners; kill or fix waste.

**Ask Caxton:**  
“Top campaigns by leads last 28 days — and any high-session campaigns with almost no leads?”

**Example answer:**

> *Example — your numbers will differ.*  
> **Leaders:** `meta_fullstack_prospecting` (95 leads), `google_brand` (40), `spring_open_house` (35).  
> **Laggard:** `display_awareness_q1` — high sessions, <5 leads — pause or swap landing/creative.  
> This is **lead** performance, not purchase ROI, unless you also pull purchases for those campaigns (attribution may be weaker).

---

## B3. Organic vs paid (same window)

**Why it matters:** Honest budget narrative without mixing Search Console and ads into one fake number.

**Ask Caxton:**  
“Compare organic search clicks to paid/other lead sources and overall sessions for the last 28 days.”

**Example answer:**

> *Example — your numbers will differ.*  
> - **Organic (Search Console):** ~8.2k clicks on tracked paths  
> - **Paid leads (GA):** meta/cpc + google/cpc ≈ 220 leads  
> - **Site sessions (GA):** ~185k  
> Organic is a demand engine; paid is a lead engine in this window. Do not add GSC clicks + GA sessions into one “traffic” KPI.

---

## B4. Top landing pages

**Why it matters:** Where budget and SEO actually drop people.

**Ask Caxton:**  
“Top landing pages by sessions last 28 days; flag program landings vs blog vs other.”

**Example answer:** Same idea as [A7](#a7-top-pages-by-traffic), with marketing emphasis: which URLs should ads use, and which blogs deserve stronger CTAs into money pages.

---

## B5. Flagship offer: leads → checkout intent → purchases

**Why it matters:** Full creative/landing story for a hero program in one ask.

**Ask Caxton:**  
“For full-stack, leads by source, checkout intent, and purchases last 28 days.”

**Example answer:**

> *Example — your numbers will differ.*  
> **Full-stack:** 156 leads (organic + meta heavy) → 210 checkout-intent events → 42 purchases.  
> Creative is generating interest; completion is the bottleneck. Test landing proof and checkout handoff before buying more top-funnel clicks.  
> Purchases assume POS/Stripe → GA with matching product IDs.

---

## B6. Purchases by program

**Why it matters:** Closed outcomes when leadership asks “what did marketing sell?” — with the sales disclosure.

**Ask Caxton:**  
“Purchases by main program last 28 days — remind me if sales depend on POS or Stripe feeding GA.”

**Example answer:** Same numbers pattern as [A2](#a2-purchases-by-program). Always restate: Caxton only shows purchases that GA received from school POS or Stripe.

---

## B7. Organic demand for priority URLs / topics

**Why it matters:** SEO and content prioritization tied to campaigns you care about.

**Ask Caxton:**  
“Organic clicks and impressions for our main program URLs and top topic groups.”

**Example answer:** Same shape as [A8](#a8-organic-search-demand). Use it to brief content and paid on which queries already earn attention.

---

## B8. Money-page / decision-page performance

**Why it matters:** The pages ads and SEO should feed — if they are soft, spend leaks.

**Ask Caxton:**  
“How are decision/money pages for full-stack performing — sessions and key events?”

**Example answer:**

> *Example — your numbers will differ.*  
> Full-stack decision page: strong sessions; lead events present; checkout intent present.  
> If sessions are high but leads/intent are flat, fix the page (proof, CTA, form) before scaling spend to it.

---

## More reports (marketing pack)

### B9. Program journey weak stages

**Why it matters:** Brief creative/content where the funnel is thin.

**Ask Caxton:** “For full-stack, which journey stages or pages look weak on sessions or views?”

**Example answer:** *Example.* Same spirit as [A5](#a5-program-journey-health) — market the thin stages or stop sending paid traffic past a dead consideration URL.

---

### B10. Site pulse (context)

**Why it matters:** Is the site soft overall, or is it a channel issue?

**Ask Caxton:** “28-day site summary — anything that would skew campaign reads?”

**Example answer:** *Example.* Same as [A6](#a6-site-pulse). If site pulse is flat and one campaign died, the problem is likely that campaign — not the whole site.

---

### B11. Market / language split

**Why it matters:** Where to put localized spend and creative.

**Ask Caxton:** “Leads or top pages by language/market for main programs last 28 days.”

**Example answer:** *Example.* Same as [A11](#a11-market--language-split).

---

### B12. Broken high-intent / post-campaign URLs

**Why it matters:** Stop paying for 404s after a launch ends.

**Ask Caxton:** “High-traffic broken URLs that look like old UTMs or campaign paths?”

**Example answer:** *Example.* Same as [A13](#a13-broken-high-intent-urls) — redirect and pause ads in the ad platform yourself.

---

### B13. Lead-event tracking pulse

**Why it matters:** Do not optimize on a broken pixel.

**Ask Caxton:** “Which events count as leads, and did any drop off this period?”

**Example answer:** *Example.* Same as [A12](#a12-lead-event-tracking-pulse).

---

# Pack C — SEO / content growth

North star: **search demand, snippets, topic coverage.** Leads and purchases are outcome checks — not the weekly ritual. For campaign UTM leaders, use [Pack D](#pack-d--paid-media--performance).

## C1. Organic demand for priority URLs

**Why it matters:** Are flagship pages earning real search clicks?

**Ask Caxton:**  
“Organic clicks and impressions for our main program URLs last 28 days.”

**Example answer:**

> *Example — your numbers will differ.*  
> Search Console (not GA):  
> - `/en/coding-bootcamps/full-stack` — strong clicks, stable impressions  
> - `/en/coding-bootcamps/data-science` — impressions up, clicks flat  
> - One older program URL — low both (candidate to consolidate or refresh)  
> Organic clicks ≠ GA sessions.

---

## C2. Organic by topic group

**Why it matters:** Shows where to invest hubs and supporting content.

**Ask Caxton:**  
“Which topic groups have the most organic clicks and impressions? Any rising impressions with flat clicks?”

**Example answer:**

> *Example — your numbers will differ.*  
> Topic groups (last 28 days):  
> - **Full-stack / web** — highest clicks  
> - **AI** — impressions rising fast, clicks lagging (hub + snippet work)  
> - **Data** — steady, no cliff  
> Treat “impressions up / clicks flat” as a content and title job, not a paid media job.

---

## C3. Snippet opportunity list

**Why it matters:** Pages that show up in search but do not win the click need title/description work.

**Ask Caxton:**  
“Which important URLs look like snippet opportunities — strong impressions, weaker clicks? Judge from organic data; this is a read, not a magic report name.”

**Example answer:**

> *Example — your numbers will differ.*  
> Assembled from organic impressions vs clicks (judgment, not a separate GA report):  
> - Data-science program page — impressions↑, CTR soft  
> - One AI cluster article — high impressions, weak clicks  
> - Full-stack money page — healthy CTR (leave alone)  
> Next step: rewrite titles/descriptions on the soft-CTR URLs; re-check in 2–4 weeks.

---

## C4. Top organic paths vs site top pages

**Why it matters:** Search winners and session winners are often different lists.

**Ask Caxton:**  
“Compare top organic click paths to top GA session pages — what overlaps and what’s SEO-only?”

**Example answer:**

> *Example — your numbers will differ.*  
> **Overlap:** home, full-stack program page.  
> **SEO-only (strong organic, quieter in GA top 20):** two long-form guides.  
> **GA-heavy (sessions, weaker organic):** a paid landing and one FAQ.  
> Do not merge GSC clicks and GA sessions into one “traffic” number.

---

## C5. Money-page organic health

**Why it matters:** Decision pages must earn search *and* convert later.

**Ask Caxton:**  
“How is organic performing for our decision/money pages for full-stack?”

**Example answer:**

> *Example — your numbers will differ.*  
> Full-stack money page: solid organic clicks; impressions stable. No cliff.  
> Pair with on-page lead/intent checks if enrollments matter — organic alone is not a sale.

---

## C6. Program journey content gaps

**Why it matters:** Thin mid-funnel pages starve both SEO and enrollment stories.

**Ask Caxton:**  
“For full-stack, which journey stages or pages look thin on traffic?”

**Example answer:** Same spirit as [A5](#a5-program-journey-health) — SEO lens: fill or prune thin consideration URLs; do not invent thin spokes without demand.

---

## C7. Site pulse (context)

**Why it matters:** Site-wide drop vs SEO-specific problem.

**Ask Caxton:**  
“28-day site summary — anything that would skew organic reads?”

**Example answer:** Same as [A6](#a6-site-pulse).

---

## C8. Leads from organic (outcome check)

**Why it matters:** Did search produce inquiries?

**Ask Caxton:**  
“How many leads came from google/organic last 28 days, and lead rate vs other channels?”

**Example answer:**

> *Example — your numbers will differ.*  
> **google / organic** — 420 leads, ~3.1% lead rate (strong among large channels).  
> Meta/cpc higher volume of spend but lower rate in this sample.  
> These are **leads**, not purchases.

---

## More reports (SEO pack)

### C9. Purchases by program (outcome check)

**Ask Caxton:** “Purchases by main program last 28 days.”

**Example answer:** *Example.* Same as [A2](#a2-purchases-by-program) — only as truthful as POS/Stripe → GA.

---

### C10. Market / language organic split

**Ask Caxton:** “Organic interest by language for main programs.”

**Example answer:** *Example.* Same spirit as [A11](#a11-market--language-split), focused on Search Console paths per language.

---

### C11. Flagship page deep-dive

**Ask Caxton:** “Sessions/views/events for the English full-stack page last 28 days.”

**Example answer:** *Example.* Same as [A9](#a9-flagship-page-deep-dive).

---

### C12. Broken high-intent URLs

**Ask Caxton:** “High-traffic broken URLs that look like old program or content paths?”

**Example answer:** *Example.* Same as [A13](#a13-broken-high-intent-urls).

---

### C13. Lead-event tracking pulse

**Ask Caxton:** “Which events count as leads, and did any drop off?”

**Example answer:** *Example.* Same as [A12](#a12-lead-event-tracking-pulse).

---

# Pack D — Paid media / performance

North star: **scale or kill campaigns, landing efficiency, stop paying for 404s.** Pause and scale happen in the **ad platform**; Caxton reports what happened on the site and in GA.

## D1. Campaign / UTM lead leaders and laggards

**Why it matters:** Weekly bid and creative decisions.

**Ask Caxton:**  
“Top campaigns by leads last 28 days — and high-session campaigns with almost no leads?”

**Example answer:** Same as [B2](#b2-campaign--utm-lead-leaders-and-laggards).

---

## D2. Leads by channel + lead rate

**Why it matters:** Paid efficiency vs other channels.

**Ask Caxton:**  
“Leads and lead rate by source/medium last 28 days — call out paid.”

**Example answer:** Same shape as [A1](#a1-leads-by-channel) / [B1](#b1-leads-by-channel--lead-rate) — highlight cpc/paid rows.

---

## D3. Top landing pages

**Why it matters:** Where ads should (and should not) land.

**Ask Caxton:**  
“Top landing pages by sessions; flag program landings vs blog.”

**Example answer:** Same idea as [A7](#a7-top-pages-by-traffic) / [B4](#b4-top-landing-pages) — paid lens: do not send spend to soft blogs unless the CTA path is proven.

---

## D4. Flagship offer: leads → checkout intent → purchases

**Why it matters:** Full-funnel check for the SKU you’re spending on.

**Ask Caxton:**  
“For full-stack, leads by source, checkout intent, and purchases last 28 days.”

**Example answer:** Same as [B5](#b5-flagship-offer-leads--checkout-intent--purchases). Purchases need POS/Stripe → GA.

---

## D5. Broken post-campaign / UTM URLs

**Why it matters:** Stop paying for 404s after a launch.

**Ask Caxton:**  
“High-traffic broken URLs that look like old UTMs or campaign paths?”

**Example answer:** Same as [A13](#a13-broken-high-intent-urls) / [B12](#b12-broken-high-intent--post-campaign-urls) — redirect in CMS; pause ads in the ad platform yourself.

---

## D6. Money-page performance

**Why it matters:** Ads feeding a soft decision page waste spend.

**Ask Caxton:**  
“How are decision pages for full-stack performing — sessions and key events?”

**Example answer:** Same as [B8](#b8-money-page--decision-page-performance).

---

## D7. Organic vs paid (same window)

**Why it matters:** Honest budget narrative without mixing metrics.

**Ask Caxton:**  
“Compare organic search clicks to paid lead sources and overall sessions last 28 days.”

**Example answer:** Same as [B3](#b3-organic-vs-paid-same-window).

---

## D8. Purchases by program

**Why it matters:** Closed-won check when leadership asks what paid “sold.”

**Ask Caxton:**  
“Purchases by main program last 28 days.”

**Example answer:** Same as [A2](#a2-purchases-by-program) — restate POS/Stripe disclosure.

---

## More reports (paid pack)

### D9. Program journey weak stages

**Ask Caxton:** “For full-stack, which journey pages look thin?”

**Example answer:** *Example.* Same as [A5](#a5-program-journey-health) — do not send paid past a dead mid-funnel URL.

---

### D10. Site pulse

**Ask Caxton:** “28-day site summary — anything that would skew campaign reads?”

**Example answer:** *Example.* Same as [A6](#a6-site-pulse).

---

### D11. Market / language split

**Ask Caxton:** “Leads or top pages by language for main programs.”

**Example answer:** *Example.* Same as [A11](#a11-market--language-split).

---

### D12. One landing deep-dive

**Ask Caxton:** “How did [landing path] perform last 28 days — sessions, views, key events?”

**Example answer:** *Example.* Same spirit as [A9](#a9-flagship-page-deep-dive) for the URL in the ad.

---

### D13. Lead-event tracking pulse

**Ask Caxton:** “Which events count as leads, and did any drop off?”

**Example answer:** *Example.* Same as [A12](#a12-lead-event-tracking-pulse).

---

# Pack E — Ops / tracking (“trust the numbers”)

North star: **data integrity and site health.** This is not a creative or budget pack — for growth questions use [B](#pack-b--marketing--growth), [C](#pack-c--seo--content-growth), or [D](#pack-d--paid-media--performance).

## E1. Lead-event tracking pulse

**Why it matters:** Broken “Count as lead” makes everyone’s charts lie.

**Ask Caxton:**  
“Which events count as leads, and did any major ones drop off this period?”

**Example answer:** Same as [A12](#a12-lead-event-tracking-pulse). If leads fall to zero site-wide, fix tracking before blaming marketing.

---

## E2. Purchases feed sanity

**Why it matters:** Confirms POS or Stripe is actually sending purchases into GA with matching product IDs.

**Ask Caxton:**  
“Do we see purchases by program last 28 days? Any programs stuck at zero that shouldn’t be?”

**Example answer:**

> *Example — your numbers will differ.*  
> full-stack 42, data-science 18, ai-fluency 11.  
> If a known selling program is **0** while checkout is live, check: same GA property, purchase/offline conversion firing, and product ID match to CMS. Caxton cannot invent enrollments.

---

## E3. Site pulse / cliff detection

**Why it matters:** Catch outages and tracking holes that look like “bad campaigns.”

**Ask Caxton:**  
“28-day site summary — any sharp drop or empty window that looks like a tracking or site issue?”

**Example answer:**

> *Example — your numbers will differ.*  
> Sessions roughly flat week-over-week in this sample; no empty days.  
> A sudden multi-day zero usually means export/tracking or an outage — not creative fatigue.

---

## E4. Broken high-intent URLs

**Why it matters:** Redirect / ignore hygiene for real demand paths.

**Ask Caxton:**  
“Highest-traffic broken URLs last 7–30 days that look real (not scrapers)?”

**Example answer:** Same as [A13](#a13-broken-high-intent-urls).

---

## E5. Leads by channel (anomaly check)

**Why it matters:** Impossible zeros often mean config, not demand.

**Ask Caxton:**  
“Leads by source last 28 days — anything that looks impossibly flat or zero?”

**Example answer:**

> *Example — your numbers will differ.*  
> Organic and paid present; if **all** channels are zero while sessions exist, Count-as-lead or event export is the first suspect. Same shape as [A1](#a1-leads-by-channel), read for anomalies.

---

## E6. Checkout intent without purchases

**Why it matters:** Intent firehose + zero purchases often means feed or ID matching — not “nobody buys.”

**Ask Caxton:**  
“For full-stack, checkout intent vs purchases — does the purchase side look broken?”

**Example answer:**

> *Example — your numbers will differ.*  
> Checkout intent ~210, purchases 42 — both sides alive.  
> If intent is high and purchases stay **0** for a known live offer, escalate POS/Stripe → GA product identity before rewriting the website.

---

## More reports (ops pack)

### E7. Top pages still resolving

**Ask Caxton:** “Top pages by sessions — any unexpected missing flagship URLs?”

**Example answer:** *Example.* Same spirit as [A7](#a7-top-pages-by-traffic) — flagship program pages should appear; if missing, check publish/redirect/tracking.

---

### E8. Market / language weirdness

**Ask Caxton:** “Any language/market with sessions but near-zero leads that looks like a config bug?”

**Example answer:** *Example.* Same spirit as [A11](#a11-market--language-split) — one locale with traffic and zero leads often means form/locale tracking, not “that market hates us.”

---

## Quick tips for better answers

- Name the **program** and **time window** when you care about one offer.  
- Ask for **leads** and **purchases** separately.  
- Say **organic clicks** when you mean Search Console; **sessions** when you mean site analytics.  
- If purchases are always zero, fix POS/Stripe → GA product IDs before blaming the website.  
- Caxton does not change bids in Google/Meta — pause or scale campaigns in the ad platforms.  
- Pick the pack that matches your job: **product** (offers), **marketing** (general growth), **SEO** (search), **paid** (ads), **ops** (trust).

---

## One-sentence mental model

**Product owners ask about offers and enrollments first; marketers about channels; SEO about search demand; paid about campaigns and landings; ops about whether the numbers are trustworthy — all use the same Caxton reports, with purchases only as truthful as the school’s POS or Stripe feed into Google Analytics.**
