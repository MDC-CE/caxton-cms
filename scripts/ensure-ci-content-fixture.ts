/**
 * Seed site_4geeks-com (+ sites.yml) from fixtures/ci when the content registry
 * is missing — same pattern as the CI "Install CI content fixture" step.
 * Safe for typecheck/tests without a content pull.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REGISTRY = path.join(ROOT, "site_4geeks-com", "component-registry");
const FIXTURE_CONTENT = path.join(ROOT, "fixtures", "ci", "content-4geeks-com");
const FIXTURE_SITES = path.join(ROOT, "fixtures", "ci", "sites.fixture.yml");
const SITES_YML = path.join(ROOT, "sites.yml");
const SITE_ROOT = path.join(ROOT, "site_4geeks-com");

function copyDirSync(src: string, dest: string) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDirSync(from, to);
    else fs.copyFileSync(from, to);
  }
}

export function ensureCiContentFixture(opts?: { force?: boolean }): boolean {
  if (!opts?.force && fs.existsSync(REGISTRY)) {
    return false;
  }
  if (!fs.existsSync(FIXTURE_CONTENT)) {
    throw new Error(`CI content fixture missing: ${FIXTURE_CONTENT}`);
  }
  if (fs.existsSync(SITE_ROOT)) {
    fs.rmSync(SITE_ROOT, { recursive: true, force: true });
  }
  copyDirSync(FIXTURE_CONTENT, SITE_ROOT);
  if (fs.existsSync(FIXTURE_SITES)) {
    fs.copyFileSync(FIXTURE_SITES, SITES_YML);
  }
  console.log("[ensure-ci-content-fixture] Seeded site_4geeks-com from fixtures/ci");
  return true;
}

const ranAsCli =
  typeof process.argv[1] === "string" &&
  process.argv[1].includes("ensure-ci-content-fixture");

if (ranAsCli) {
  ensureCiContentFixture({ force: process.argv.includes("--force") });
}
