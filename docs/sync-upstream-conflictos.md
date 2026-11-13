# Conflictos del merge `upstream/main` â†’ `sync/upstream-caxton`

Inventario tomado con el merge **en progreso** (antes de `git merge --abort`).

| | |
|---|---|
| **Rama** | `sync/upstream-caxton` |
| **Ours (HEAD)** | `8810d9ae3` â€” Merge pull request #13 from MDC-CE/cursor/playground-catalog-poll-ed07 |
| **Theirs (MERGE_HEAD)** | `a64fde962` â€” Update README.md (`upstream/main`) |
| **Mensaje del merge** | Merge remote-tracking branch `upstream/main` into `sync/upstream-caxton` |
| **Total sin resolver** | **34** |
| **Leyenda** | **ours** = MDC / `sync/upstream-caxton` Â· **theirs** = Caxton upstream Â· **manual** = hay que combinar ambos |

Este documento **no resuelve** los conflictos. Solo lista quÃ© tocar cuando se reintente el merge. Tras documentar, el merge se abortÃ³ a propÃ³sito para dejar la rama limpia y poder empujar solo este inventario.

---

## 1. Buscador (6)

CÃ³digo de bÃºsqueda semÃ¡ntica / catÃ¡logo playground vs mejoras de Ã­ndice vectorial upstream.

| # | Archivo | Tipo | RecomendaciÃ³n | Por quÃ© |
|---|---------|------|---------------|---------|
| 1 | `server/database-search.ts` | both modified | **manual** | Ours trae integraciÃ³n playground (`@shared/playground-catalog`, `fetchCatalogSearch`, `DESCRIPTION_SEARCH_LIMIT`). Theirs trae claves de Ã­tem vectoriales / cache distinta. Hay que conservar el fallback al catÃ¡logo MDC y adoptar lo estable de Qdrant/cache de upstream. |
| 2 | `server/database-search.test.ts` | both modified | **manual** | Los tests deben cubrir playground + techo de cache de ours y los doubles / exports nuevos de theirs. No basta con un lado. |
| 3 | `server/vector-search.ts` | both modified | **manual** | Ours usa `CATALOG_CHUNKS_DB_NAME` y disponibilidad propia. Theirs aporta recovery listeners, test doubles y optimizer. Combinar: base Qdrant de theirs + hooks de catÃ¡logo de ours. |
| 4 | `server/routes/databases.ts` | both modified | **manual** | Ours: rutas/params de bÃºsqueda de descriptions del playground. Theirs: evidence archive, row stamps, sort de Ã­tems. Mantener endpoints de search MDC y traer evidencia/sort de upstream. |
| 5 | `sidequest.jobs.ts` | both modified | **manual** | Ours exporta `PlaygroundCatalogPollJob`. Theirs exporta jobs nuevos (`VectorIndexSyncJob`, evidence, IndexNow, etc.). Debe quedar la uniÃ³n de ambos sets. |
| 6 | `server/jobs/register.ts` | both modified | **manual** | Igual que `sidequest.jobs.ts`: registrar `playground_catalog_poll` **y** las clases nuevas de upstream. |

---

## 2. Deploy (4)

MDC despliega Caxton en `/opt/caxton` (learning.mdc.edu). Upstream sigue el camino `website-v3` / `_WEBSITE_*`.

| # | Archivo | Tipo | RecomendaciÃ³n | Por quÃ© |
|---|---------|------|---------------|---------|
| 7 | `scripts/deploy.sh` | both modified | **ours** (+ cherry-pick puntual) | Ours fija `APP_ROOT=/opt/caxton`, servicios `caxton` / `caxton-sidequest` y secretos `_CAXTON_*`. Theirs apunta a `/opt/website-v3`. Preferir ours; valorar traer a mano `SKIP_CONTENT_FLUSH` y chequeos de Node si aportan. |
| 8 | `.github/workflows/deploy-caxton-learning.yml` | both modified | **ours** | Workflow MDC (`LEARNING_DEPLOY_*`, pack `_CAXTON_*`, grupo `deploy-caxton-learning`). Theirs es el deploy genÃ©rico VPS/`_WEBSITE_*` (incluso renombrado en el marcador). No sustituir por theirs. |
| 9 | `.github/workflows/ci.yml` | both modified | **manual** | Ours: fixture vÃ­a `ensure-ci-content-fixture.ts`, checkout/setup v5, Node 22, vitest 1 worker. Theirs: Node 24, fixture copiado a mano, typecheck advisory. Combinar Node/versiÃ³n de actions de theirs con el script de fixture de ours. |
| 10 | `docs/vps-deployment.md` | both modified | **ours** | Ours es un puntero corto a docs Caxton/MDC. Theirs es el runbook largo de `website-v3`. En este fork el puntero es el correcto. |

---

## 3. 4geeks / registry y variantes (15)

Conflictos de borrado: MDC quitÃ³ variantes/schema compartidos (o los moviÃ³ al contenido del sitio); upstream los actualizÃ³. En fixtures CI, MDC los retoca y upstream los borrÃ³.

| # | Archivo | Tipo | RecomendaciÃ³n | Por quÃ© |
|---|---------|------|---------------|---------|
| 11 | `fixtures/ci/content-4geeks-com/component-registry/hero/v1.0/examples/hero_orbit.yml` | deleted by them | **ours** | Upstream borrÃ³ el fixture; MDC lo mantiene (y lo tocÃ³) para CI local. Conservar. |
| 12 | `fixtures/ci/content-4geeks-com/component-registry/hero/v1.0/field-editors.ts` | deleted by them | **ours** | Igual: fixture CI necesario en este fork. |
| 13 | `fixtures/ci/content-4geeks-com/component-registry/hero/v1.0/schema.ts` | deleted by them | **ours** | Igual. |
| 14 | `fixtures/ci/content-4geeks-com/component-registry/hero/v1.0/schema.yml` | deleted by them | **ours** | Igual (archivo grande del fixture hero). |
| 15 | `shared/component-registry/hero/v1.0/schema.yml` | deleted by us | **ours** (mantener borrado) | MDC eliminÃ³ el schema compartido; upstream lo sigue editando. Confirmar que el schema vive en contenido/site antes de reintroducirlo. |
| 16 | `client/src/components/ai_learning/variants/AiLearningDefault.tsx` | deleted by us | **ours** (mantener borrado) | Variante eliminada en MDC; upstream sin cambios reales de lÃ­neas. No resucitar sin plan de registry. |
| 17 | `client/src/components/enrollment_selector/variants/EnrollmentSelectorDefault.tsx` | deleted by us | **ours** (mantener borrado) | Same: borrado intencional MDC; theirs solo retoques menores. |
| 18 | `client/src/components/hero/variants/HeroCourse.tsx` | deleted by us | **ours** (mantener borrado) | Hero course ya no vive aquÃ­ en el fork. |
| 19 | `client/src/components/hero/variants/HeroWorkshop.tsx` | deleted by us | **ours** (mantener borrado) | Upstream sÃ­ tiene diff (~40 lÃ­neas); si hace falta esa mejora, reintroducir como variante site, no copiar a ciegas. |
| 20 | `client/src/components/list_press_mentions/variants/ListPressMentionsFeaturedShowcase.tsx` | deleted by us | **ours** (mantener borrado) | Borrado MDC; theirs cambio menor. |
| 21 | `client/src/components/list_workshops_carousel/variants/ListWorkshopsCarouselDefault.tsx` | deleted by us | **ours** (mantener borrado) | Upstream ampliÃ³ el archivo; evaluar aparte si MDC aÃºn usa esa variante en contenido. |
| 22 | `client/src/components/pricing/variants/PricingDefault.tsx` | deleted by us | **ours** (mantener borrado) | Sin cambios Ãºtiles en theirs respecto al base. |
| 23 | `client/src/components/projects/variants/ProjectsDefault.tsx` | deleted by us | **ours** (mantener borrado) | Diff mÃ­nimo upstream. |
| 24 | `client/src/components/syllabus/variants/SyllabusProgramModules.tsx` | deleted by us | **ours** (mantener borrado) | Diff mÃ­nimo upstream. |
| 25 | `client/src/components/two_column_accordion_card/variants/TwoColumnAccordionCardImageBackground.tsx` | deleted by us | **ours** (mantener borrado) | Sin cambios Ãºtiles en theirs. |

---

## 4. Otros (9)

| # | Archivo | Tipo | RecomendaciÃ³n | Por quÃ© |
|---|---------|------|---------------|---------|
| 26 | `client/src/components/DebugBubble/components/FunnelTab.tsx` | both modified | **manual** | Ours reestructura formularios/persona. Theirs aÃ±ade `FunnelTrackingLengthNotice`, `trackingKeys`, exports. Hay que unir UX MDC con avisos de tracking de upstream. |
| 27 | `client/src/lib/lucide-curated-map.ts` | both modified | **theirs** (+ revisar) | Theirs tiene mapa mucho mÃ¡s completo (~78 iconos vs ~26). Preferir theirs y comprobar que no falte ningÃºn icono que MDC haya aÃ±adido a mano. |
| 28 | `mcp-server/tools/components.ts` | both modified | **manual** | Ours: auth/`MCP_SERVER_SECRET` + `getTokenUsername`. Theirs: `buildLoopbackHeaders` y demos con `site`. Combinar headers loopback de theirs con identidad de autor de ours. |
| 29 | `server/github.ts` | both modified | **manual** | Ambos tocan sync/deploy hybrid del registry. Revisar hunks: no perder el path de contenido MDC ni las mejoras de archive/stale de upstream. |
| 30 | `server/index.ts` | both modified | **manual** | Arranque de workers (vector reconcile, etc.). Conservar boot MDC y arrancar lo nuevo de upstream que el fork necesite. |
| 31 | `server/routes/forms.ts` | both modified | **ours** | Ours tiene lead ledger / tracking / SSRF helpers del fork. Theirs parece logging mÃ¡s viejo. Preferir ours salvo hunks claros de seguridad de upstream. |
| 32 | `server/routes/versioning.ts` | both modified | **manual** | Diff grande en ambos lados (publish/robots/SEO). Hay que leer hunk por hunk; no elegir un lado completo. |
| 33 | `server/seo-fields.ts` | both modified | **manual** | Marcadores pequeÃ±os sobre research metrics. Combinar reglas; el costo de elegir mal es SEO roto en publish. |
| 34 | `vite.config.ts` | both modified | **ours** (+ cherry-pick) | Ours apunta a `site_learning-mdc-edu` y notas Vite 8. Theirs a `site_4geeks-com` + `manualChunks`. Quedarse en ours; traer chunks/CDN solo si aplican al host MDC. |

---

## Resumen por recomendaciÃ³n

| RecomendaciÃ³n | Cantidad | Notas |
|---------------|----------|-------|
| **ours** | 16 | Deploy MDC, fixtures CI 4geeks, borrados de variantes, `forms.ts`, puntero VPS |
| **theirs** | 1 | `lucide-curated-map.ts` (mapa mÃ¡s completo) |
| **manual** | 17 | Buscador, jobs, CI, FunnelTab, MCP tools, github/index/versioning/seo |

**Conteo de control:** 6 + 4 + 15 + 9 = **34**.

---

## Notas operativas

1. **No dejar marcadores** `<<<<<<<` / `=======` / `>>>>>>>` en ningÃºn commit.
2. Tras este inventario el merge se **abortÃ³** (`git merge --abort`) para empujar la rama limpia con solo este documento.
3. Para retomar: desde `sync/upstream-caxton` limpia, volver a `git fetch upstream` y `git merge upstream/main` (o el SHA acordado), y aplicar la tabla de arriba.
4. `.cursor/mcp.json` llegÃ³ como archivo nuevo desde upstream (`{mcpServers: {}}`). En HEAD MDC no estaba trackeado; tras el abort debe seguir en `.cursor/mcp.json` (local / restaurado). No forma parte de los 34 conflictos unmerged.
