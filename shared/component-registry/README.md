# Shared component registry

Platform-default section components available to every site.

- Keep this catalog small (about ≤12 types) and simple: only components every site needs.
- A type must not also exist under `site_*/component-registry/` — boot fails on collision.
- Shared packages may import only `shared/component-registry/_common` (never site helpers).
- Gallery screenshots for shared types live under each type’s `screenshots/` directory.
- A change here (schema, examples, padding) affects sections on every site at once.
- Examples must render on any site: base palette IDs only, no single-site image without a fallback.
- `hero` is a known exception (many 4geeks-specific variants). Do not add new hero variants here; propose them as site variants.

## Shared base palette

Shared components and their examples may only use these background IDs (`SHARED_BASE_PALETTE` in `shared/theme-palette.ts`):

`background`, `muted`, `card`, `primary`, `secondary`, `accent`, `light-blue-5`, `light-blue-5-gradient`, `hero-orbit-gradient`

Every site theme keeps them (values may differ per site):

- The theme editor marks them "Required by shared components" and `PUT /api/theme/palettes` refuses removing one.
- Server startup and the `backgrounds` validator warn when a site's own `theme.json` lacks one.
- `server/design/shared-base-palette.test.ts` fails when a shared example uses any other background.

A site without its own `theme.json` uses its `inherit_components_from` parent's theme.

Site-only components stay in `site_<name>/component-registry/` (content-synced).
