# frequently_asked_questions (seed)

Tracked seed of the CE FAQ bank for reviewers in this app repo.

- Production content tree: MDC-CE/mdc-caxton → site_learning-mdc-edu/db/frequently_asked_questions/
- After merge, if content sync does not pull automatically, Edwin copies these YAML files into the mdc-caxton content tree at that path, then reindexes (POST /api/databases/frequently_asked_questions/reindex).
- Test fixtures used by the loader stay under scripts/fixtures/mdc-ce-frequently-asked-questions/ (same YAML bytes as this seed).
