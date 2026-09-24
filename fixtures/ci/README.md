# CI content fixture

GitHub Actions does not have gitignored `site_*` folders. Before typecheck and tests, `scripts/ensure-ci-content-fixture.ts` installs:

- `fixtures/ci/content-learning-mdc-edu/component-registry/` → `site_learning-mdc-edu/component-registry/` when that registry is missing. These schema files are what `shared/site-component-schemas.ts` imports. An existing local registry is left alone.
- `fixtures/ci/content-4geeks-com/` → `site_4geeks-com/` **without** `component-registry/`. Startup does not read the 4Geeks component registry.
- `fixtures/ci/sites.fixture.yml` → `sites.yml` only when `sites.yml` is missing.

Refresh the MDC schema fixture when a Zod export that the bridge re-exports changes: copy each `component-registry/<type>/v1.0/schema.ts` (and `geekchart` `server.ts`) from `site_learning-mdc-edu` into `fixtures/ci/content-learning-mdc-edu/component-registry/`, keeping the same relative path.
