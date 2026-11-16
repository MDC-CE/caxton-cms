# frequently_asked_questions (seed)

Tracked seed of the CE FAQ bank for reviewers in this app repo.

- Production content tree: MDC-CE/mdc-caxton → site_learning-mdc-edu/db/frequently_asked_questions/
- After merge, if content sync does not pull automatically, Edwin copies these YAML files into the mdc-caxton content tree at that path, then reindexes (POST /api/databases/frequently_asked_questions/reindex).
- Test fixtures used by the loader stay under scripts/fixtures/mdc-ce-frequently-asked-questions/ (same YAML bytes as this seed).

## Daily sync from playground (for Edwin)

The bank should stay filled from the playground endpoint, not from a one-off file copy.

**Source (public, no secret):** `GET /api/search/faqs`  
Set env `PLAYGROUND_FAQS_URL` (required). Example: `https://mdc-playground.herokuapp.com/api/search/faqs`.

**What the sync does (same idea as Luma calendar sync):**

1. Fetches the JSON list (`id`, `question`, `answer`, `locale`, `source`, `date`, `differs_by_course`).
2. Upserts into `faqs.yml` by `id` (`source` → `fuente` + `source_url`, `date` → `fecha` / `last_updated`).
3. Pending / empty answers stay `active: false` and are not indexed; official answers already in Caxton are not overwritten by pending.
4. Marks only `sync_origin: playground_search_faqs` rows that disappeared as `active: false` (never touches manual / Open Door rows).
5. Aborts (no write) on HTTP 304, 0 rows, or fewer than 50% of previously managed rows.
6. Reindexes official active rows only.

**Manual run (app repo root, content root present):**

```bash
PLAYGROUND_FAQS_URL=https://mdc-playground.herokuapp.com/api/search/faqs npx tsx scripts/sync-playground-faqs.ts
npx tsx scripts/sync-playground-faqs.ts --no-reindex --url "https://mdc-playground.herokuapp.com/api/search/faqs"
npx tsx scripts/sync-playground-faqs.ts --content-root "C:/path/to/site_learning-mdc-edu" --url "https://mdc-playground.herokuapp.com/api/search/faqs"
```

**Automated daily schedule:**

- Sidequest job name: `playground_faq_sync`
- Time: **01:00 America/New_York** every day (after catalog poll at 00:30)
- Wired on app boot via `schedulePlaygroundFaqSync()` (same pattern as `playground_catalog_poll`)
- Needs: `PLAYGROUND_FAQS_URL` set on the droplet (job skips if missing), Qdrant up for reindex, content tree writable at `site_learning-mdc-edu/db/frequently_asked_questions/`

**Tests:**

```bash
npx vitest run shared/playground-faqs.test.ts server/playground-faq-sync.test.ts server/jobs/sidequest-jobs-registry.test.ts
```
