---
id: organic-low-ctr
version: 3
title: High impressions, low CTR
used_when: >
  Staff clicks Ask Agent on a row in Diagnostics → SEO → Opportunities →
  "High impressions, low CTR".
intention: >
  Raise click-through at the current page-1 rank by shipping a denser SERP
  title/description than live for the same query — not by rewriting the body.
success_looks_like: >
  Entry resolved; meta.page_title and/or meta.description updated via
  propose_change with review_situations: ["serp_title_description"] (or
  direct edit when allowed); short note of tokens kept vs the one token added.
failure_modes:
  - Rewrites the full page body when meta alone would fix CTR
  - Mixes content and SERP fields in one proposal
  - Changes unrelated locales or pages
  - Invents figures, years, or employers not already on live
  - Catchier hook that drops live year/place/band/source
  - Runs diagnostics with confirm:true
required:
  - query
  - url
  - position
  - impressions
  - ctr
  - expected_ctr
  - window_label
  - mcp_url
max_chars: 1200
sections:
  - Goal
  - Target
  - Do
  - Tools
  - Don’t
---

Goal: Denser SERP snippet than live — keep every true token, add one the body supports.

Target:
- query: {{query}}
- url: {{url}}
- position: {{position}} · impressions: {{impressions}}
- CTR: {{ctr}} · expected: {{expected_ctr}} ({{window_label}})
- MCP: {{mcp_url}}

Do:
1. Resolve that URL to contentType/slug/locale via MCP. If you cannot resolve it, stop and say so.
2. Read get_entry_seo + get_entry_content; name the live gap in one sentence. If live already has year + place + figure and you only want a catchier hook, stop.
3. Optionally get_or_refresh_seo_research action:serp (snapshot; no title/description rewrite).
4. File propose_change with review_situations: ["serp_title_description"] — meta.page_title and/or meta.description only. Claims must already appear on live.
5. Summarize tokens kept and the one token added (ops own the values).

Tools: list_entries, get_entry_seo, get_entry_content, get_entry_activity, get_or_refresh_seo_research, propose_change, explain_site topic serp-title-description-proposals.

Don’t: rewrite the body; mix content into the SERP packet; invent unsourced claims; locale fan-out unless a tool next_action says so; run diagnostics with confirm:true.
