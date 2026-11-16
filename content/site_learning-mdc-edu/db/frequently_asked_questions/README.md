# frequently_asked_questions (seed)

Tracked seed of the CE FAQ bank for reviewers in this app repo.

- Production content tree: MDC-CE/mdc-caxton → site_learning-mdc-edu/db/frequently_asked_questions/
- After merge, if content sync does not pull automatically, Edwin copies these YAML files into the mdc-caxton content tree at that path, then reindexes (POST /api/databases/frequently_asked_questions/reindex).
- Test fixtures used by the loader stay under scripts/fixtures/mdc-ce-frequently-asked-questions/ (same YAML bytes as this seed).

## Daily sync from playground (for Edwin)

The bank should stay filled from the playground endpoint, not from a one-off file copy.

**Source (public, no secret):** `GET /api/search/faqs`  
Default: `https://mdc-playground.herokuapp.com/api/search/faqs`  
Override with env `PLAYGROUND_FAQS_URL` (or host via `PLAYGROUND_CATALOG_BASE_URL`).

**What the sync does (same idea as Luma calendar sync):**

1. Fetches the JSON list (`id`, `question`, `answer`, `locale`, `source`, `date`, `differs_by_course`).
2. Upserts into `faqs.yml` by `id` (`source` → `fuente`, `date` → `fecha` / `last_updated`).
3. Marks playground-managed rows that disappeared as `active: false` (does not touch Open Door rows).
4. Reindexes the vector bank (`POST /api/databases/frequently_asked_questions/reindex` or the job’s built-in reindex).

**Manual run (app repo root, content root present):**

```bash
npx tsx scripts/sync-playground-faqs.ts
npx tsx scripts/sync-playground-faqs.ts --no-reindex
npx tsx scripts/sync-playground-faqs.ts --url "https://mdc-playground.herokuapp.com/api/search/faqs"
npx tsx scripts/sync-playground-faqs.ts --content-root "C:/path/to/site_learning-mdc-edu"
```

**Automated daily schedule:**

- Sidequest job name: `playground_faq_sync`
- Time: **01:00 America/New_York** every day (after catalog poll at 00:30)
- Wired on app boot via `schedulePlaygroundFaqSync()` (same pattern as `playground_catalog_poll`)
- Needs: `PLAYGROUND_FAQS_URL` or playground host reachable from the droplet, Qdrant up for reindex, content tree writable at `site_learning-mdc-edu/db/frequently_asked_questions/`

**Note:** Heroku prod returns 404 for `/api/search/faqs` until playground PR #1411 (FAQ export API) is merged. Until then the job will fail loudly and keep the previous YAML; schedule can still be enabled.

**Tests:**

```bash
npx vitest run shared/playground-faqs.test.ts
```
