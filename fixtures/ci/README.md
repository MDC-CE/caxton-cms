# CI content fixture

GitHub Actions does not have gitignored `site_*` folders. Before typecheck and tests, `scripts/ensure-ci-content-fixture.ts` installs:

- `fixtures/ci/content-learning-mdc-edu/component-registry/` → `site_learning-mdc-edu/component-registry/` when that registry is missing. These schema files are what `shared/site-component-schemas.ts` imports. An existing local registry is left alone.
- `fixtures/ci/content-4geeks-com/` → `site_4geeks-com/` **without** `component-registry/`. Startup does not read the 4Geeks component registry.
- `fixtures/ci/sites.fixture.yml` → `sites.yml` only when `sites.yml` is missing.

This is a **trimmed** seed for unit tests (`shared/schema.ts` imports + a few CT/settings stubs), not production content. It does not follow live content: refresh the registry and content types after pulling content, whenever Zod exports that `shared/schema.ts` re-exports change or a content type's settings (such as Optimize for ads) change:

```bash
npm run fixtures:refresh-ci
```

The script copies `site_4geeks-com/component-registry/` and `content-types.yml`, leaves fixture pages alone, and lists each ads-optimized content type with its fixture pages.

Refresh the MDC schema fixture when a Zod export that the bridge re-exports changes: copy each `component-registry/<type>/v1.0/schema.ts` (and `geekchart` `server.ts`) from `site_learning-mdc-edu` into `fixtures/ci/content-learning-mdc-edu/component-registry/`, keeping the same relative path.

## SSR smoke pages

`server/ssr-smoke.test.ts` renders one fixture page for `landing` and for every ads-optimized content type with the real `client/src/entry-server.tsx`, and fails on an empty body. Each such type needs a page here: today `landings/ci-ssr-smoke/` (Spanish only) and `landings/ci-ssr-bilingual/` (English at `ci-ssr-bilingual`, Spanish at `ci-ssr-bilingue`: each language of a one-address landing renders at its own slug, in its own language). Both are `noindex`, and neither sets `locale` in `_common.yml` (the language comes from the language file). These pages are never served or pushed to the content repo.

