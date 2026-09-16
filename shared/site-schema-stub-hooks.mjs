/**
 * Node customize hooks: when site_4geeks-com registry is absent (or
 * WEBLIFY_SITE_SCHEMAS_STUB=1), redirect site-component-schemas → stub.
 * Mirrors scripts/esbuild-site-schema-stub-plugin.mjs / vite stub plugin for tsx.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = process.env.WEBLIFY_PACKAGE_ROOT?.trim()
  ? path.resolve(process.env.WEBLIFY_PACKAGE_ROOT.trim())
  : path.resolve(here, "..");
const realSchemas = path.join(packageRoot, "shared", "site-component-schemas.ts");
const stubSchemas = path.join(packageRoot, "shared", "site-component-schemas.stub.ts");

function projectRoot() {
  const override = process.env.WEBLIFY_PROJECT_ROOT?.trim();
  return override ? path.resolve(override) : process.cwd();
}

function shouldUseStub() {
  const flag = process.env.WEBLIFY_SITE_SCHEMAS_STUB?.trim();
  if (flag === "1" || flag?.toLowerCase() === "true") return true;
  if (flag === "0" || flag?.toLowerCase() === "false") return false;
  return !fs.existsSync(path.join(projectRoot(), "site_4geeks-com", "component-registry"));
}

function resolvesToReal(specifier, parentURL) {
  if (
    specifier === "@shared/site-component-schemas" ||
    specifier.endsWith("/site-component-schemas") ||
    specifier.endsWith("/site-component-schemas.ts")
  ) {
    return true;
  }
  if (
    (specifier === "./site-component-schemas" ||
      specifier === "./site-component-schemas.ts") &&
    parentURL
  ) {
    try {
      const parentDir = path.dirname(fileURLToPath(parentURL));
      const resolved = path.resolve(parentDir, specifier);
      const withTs = resolved.endsWith(".ts") ? resolved : `${resolved}.ts`;
      return path.resolve(withTs) === path.resolve(realSchemas);
    } catch {
      return false;
    }
  }
  return false;
}

function urlIsReal(url) {
  if (!url || url.includes("site-component-schemas.stub")) return false;
  try {
    const p = fileURLToPath(url);
    const withTs = p.endsWith(".ts") || p.endsWith(".js") ? p : `${p}.ts`;
    return (
      path.resolve(withTs) === path.resolve(realSchemas) ||
      path.resolve(p) === path.resolve(realSchemas)
    );
  } catch {
    return false;
  }
}

export async function resolve(specifier, context, nextResolve) {
  if (shouldUseStub() && resolvesToReal(specifier, context.parentURL)) {
    if (!fs.existsSync(stubSchemas)) {
      throw new Error(`site-component-schemas stub missing: ${stubSchemas}`);
    }
    return {
      shortCircuit: true,
      url: pathToFileURL(stubSchemas).href,
    };
  }

  const resolved = await nextResolve(specifier, context);
  if (shouldUseStub() && urlIsReal(resolved.url)) {
    return {
      shortCircuit: true,
      url: pathToFileURL(stubSchemas).href,
    };
  }
  return resolved;
}
