import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assertNoRegistryCollisions,
  getEffectiveSiteRegistryFolder,
  listMergedComponentTypes,
  resolveComponentPath,
} from "./registry-resolve";

const ORIGINAL_CWD = process.cwd();
const ORIGINAL_PACKAGE_ROOT = process.env.WEBLIFY_PACKAGE_ROOT;
let tempDir: string;

function writeType(registryRoot: string, type: string) {
  const dir = path.join(registryRoot, type, "v1.0");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "schema.yml"), `name: ${type}\n`, "utf-8");
}

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "registry-resolve-"));
  process.chdir(tempDir);
  // Shared registry is resolved from the package root, not process.cwd().
  process.env.WEBLIFY_PACKAGE_ROOT = tempDir;
  fs.mkdirSync(path.join(tempDir, "shared", "component-registry"), { recursive: true });
  writeType(path.join(tempDir, "shared", "component-registry"), "text_block");
});

afterEach(() => {
  process.chdir(ORIGINAL_CWD);
  if (ORIGINAL_PACKAGE_ROOT === undefined) delete process.env.WEBLIFY_PACKAGE_ROOT;
  else process.env.WEBLIFY_PACKAGE_ROOT = ORIGINAL_PACKAGE_ROOT;
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("registry-resolve inherit", () => {
  it("uses parent registry when inheritComponentsFrom is set", () => {
    writeType(path.join(tempDir, "site_parent", "component-registry"), "cta_banner");
    fs.mkdirSync(path.join(tempDir, "site_child"), { recursive: true });

    const types = listMergedComponentTypes("site_child", tempDir, "site_parent").map(
      (t) => t.type,
    );
    expect(types).toContain("text_block");
    expect(types).toContain("cta_banner");

    const resolved = resolveComponentPath("cta_banner", "site_child", tempDir, "site_parent");
    expect(resolved?.origin).toBe("site");
    expect(resolved?.componentDir).toContain(path.join("site_parent", "component-registry"));
  });

  it("fails when inheriting child has a component-registry directory", () => {
    writeType(path.join(tempDir, "site_parent", "component-registry"), "cta_banner");
    fs.mkdirSync(path.join(tempDir, "site_child", "component-registry"), {
      recursive: true,
    });

    expect(() =>
      getEffectiveSiteRegistryFolder("site_child", "site_parent", tempDir),
    ).toThrow(/must not own a component-registry/);
    expect(() =>
      assertNoRegistryCollisions("site_child", tempDir, "site_parent"),
    ).toThrow(/must not own a component-registry/);
  });

  it("resolves shared types without a site registry", () => {
    fs.mkdirSync(path.join(tempDir, "site_lonely"), { recursive: true });
    const resolved = resolveComponentPath("text_block", "site_lonely", tempDir);
    expect(resolved?.origin).toBe("shared");
  });
});
