# Review situations

Authors may declare **`review_situations`** on edits proposals so Proposal Reviewer runs the right checklist packs. Empty → the server **infers** from pending field ops (and summary keywords for hub links). Multiple situations are allowed; each pack is reviewed independently.

**Per-situation ship:** Pass packs wait until failing packs’ ops are dropped or fixed via `revise_entries`, then **apply** (atomic — no partial-field apply).

## Tools

| Action | Who |
|---|---|
| `propose_change` → optional `review_situations[]` | authors (`proposals_create`) |
| `update_proposal` → `set_review_situations` | proposer or staff |
| `list_proposals(proposal_id)` → live `review_context.review_situations` + `situation_source` | reviewers |

Notes and ideas do **not** use situations.

## Catalog

| Id | When to use | Guide |
|---|---|---|
| `internal_links` | Body adds same-locale hub/cluster links; keep facts; no SERP in the same packet | `explain_site` topic **`internal-links-proposals`** |
| `serp_title_description` | `meta.page_title` / `meta.description` only (or mixed — leave-live SERP then apply body) | `explain_site` topic **`serp-title-description-proposals`** (+ checklist `title_description_ctr`) |
| `funnel_classification` | `funnel.stage` / `funnel.products` — persona → product → stage, not topical breadth | `explain_site` topic **`funnel-classification-proposals`** (+ checklist `funnel_persona_product_stage`) |
| `body_copy_edit` | General body/field edits that are not link-only, SERP-only, or funnel-only | This topic + `verify_copy` |
| `selling_figures` | Program/landing where outcome figures may move | This topic + `selling_page_figures` |
| `new_public_content` | New or draft-backed public page | This topic + `new_content_brand` |
| `promote_draft` | Promote named draft with empty/minimal updates | This topic — summary = why draft should go live |

Soft warning `situation_ops_mismatch` when the declared label and pending ops disagree — create still succeeds; live context **unions** declared ∪ inferred.

Legacy / empty filed list → infer (often `body_copy_edit`) with warning `situation_inferred_body`. Retag with `set_review_situations`.

## Author tips

- Prefer one situation per packet when possible; SERP rewrite = second proposal (`serp_title_description` + topic `serp-title-description-proposals`).
- Hub links: `review_situations: ["internal_links"]` + content-only ops + summary that promises no figure/SERP changes.
- Funnel: `review_situations: ["funnel_classification"]` + `funnel.*` only — topic `funnel-classification-proposals` (persona → product → stage; soft batch ≤10).
- After `revise_entries`, author-declared tags that no longer own remaining ops are dropped; inferred packs refresh on the next `list_proposals`.

## Reviewer tips

- Open `list_proposals(proposal_id)` — use `review_situations`, checklists, and `discovery_path`.
- Score each active pack on the ops it owns; do not reject a good link packet because SERP was weak — drop SERP ops first.
- Forced CTA for links → `add_blocker`, not reject-as-weaker-copy.
- Funnel breadth-only disagreement → `add_blocker` citing cascade step, not reject.

See also: `explain` topics **`proposals`**, **`reading-proposals`**, **`internal-links-proposals`**, **`serp-title-description-proposals`**, **`funnel-classification-proposals`**.
