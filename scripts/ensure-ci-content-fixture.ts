/**
 * CI checkout has no gitignored site_* folders.
 *
 * Section Zod used at boot lives in site_learning-mdc-edu/component-registry.
 * Seed that registry from fixtures only when it is missing. Never replace a
 * registry that is already on disk (local content).
 *
 * The legacy page fixture may still fill site_4geeks-com for tests that use
 * that folder name. It must not install site_4geeks-com/component-registry —
 * startup does not read it.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MDC_REGISTRY = path.join(ROOT, "site_learning-mdc-edu", "component-registry");
const MDC_FIXTURE = path.join(ROOT, "fixtures", "ci", "content-learning-mdc-edu", "component-registry");
const FIXTURE_CONTENT = path.join(ROOT, "fixtures", "ci", "content-4geeks-com");
const FIXTURE_SITES = path.join(ROOT, "fixtures", "ci", "sites.fixture.yml");
const SITES_YML = path.join(ROOT, "sites.yml");
const GEEKS_ROOT = path.join(ROOT, "site_4geeks-com");

function copyDirSync(src: string, dest: string, skip?: (rel: string) => boolean) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const rel = entry.name;
    if (skip?.(rel)) continue;
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDirSync(from, to);
    else fs.copyFileSync(from, to);
  }
}

export function ensureCiContentFixture(opts?: { force?: boolean }): boolean {
  let seeded = false;

  if (!fs.existsSync(MDC_REGISTRY)) {
    if (!fs.existsSync(MDC_FIXTURE)) {
      throw new Error(`CI schema fixture missing: ${MDC_FIXTURE}`);
    }
    copyDirSync(MDC_FIXTURE, MDC_REGISTRY);
    console.log("[ensure-ci-content-fixture] Seeded site_learning-mdc-edu/component-registry");
    seeded = true;
  }

  const geeksPages = path.join(GEEKS_ROOT, "pages");
  const shouldSeedGeeks = opts?.force || !fs.existsSync(geeksPages);
  if (shouldSeedGeeks) {
    if (!fs.existsSync(FIXTURE_CONTENT)) {
      throw new Error(`CI content fixture missing: ${FIXTURE_CONTENT}`);
    }
    if (opts?.force && fs.existsSync(GEEKS_ROOT)) {
      fs.rmSync(GEEKS_ROOT, { recursive: true, force: true });
    }
    copyDirSync(FIXTURE_CONTENT, GEEKS_ROOT, (name) => name === "component-registry");
    const leaked = path.join(GEEKS_ROOT, "component-registry");
    if (fs.existsSync(leaked)) fs.rmSync(leaked, { recursive: true, force: true });
    console.log("[ensure-ci-content-fixture] Seeded site_4geeks-com without component-registry");
    seeded = true;
  }

  if (!fs.existsSync(SITES_YML) && fs.existsSync(FIXTURE_SITES)) {
    fs.copyFileSync(FIXTURE_SITES, SITES_YML);
    seeded = true;
  }

  return seeded;
}

const ranAsCli =
  typeof process.argv[1] === "string" &&
  process.argv[1].includes("ensure-ci-content-fixture");

if (ranAsCli) {
  ensureCiContentFixture({ force: process.argv.includes("--force") });
}
