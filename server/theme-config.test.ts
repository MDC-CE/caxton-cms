import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

const state = vi.hoisted(() => ({ root: "" }));

vi.mock("@shared/paths", () => ({
  getProjectRoot: () => state.root,
  getPackageRoot: () => state.root,
}));

vi.mock("./site-config", () => {
  const configs = () => [
    { domain: "parent.test", contentFolder: "site_parent" },
    { domain: "child.test", contentFolder: "site_child", inheritComponentsFrom: "site_parent" },
    { domain: "own.test", contentFolder: "site_own", inheritComponentsFrom: "site_parent" },
  ];
  return {
    getSiteConfigs: configs,
    getInheritComponentsFrom: (folder: string) =>
      configs().find((c) => c.contentFolder === folder)?.inheritComponentsFrom,
  };
});

import {
  checkThemeWrite,
  createOwnSiteTheme,
  loadSiteTheme,
  resolveSiteTheme,
  sitesInheritingThemeFrom,
} from "./theme-config";

const parentTheme = { backgrounds: [{ id: "muted", label: "Muted" }], colors: { light: { "--primary": "210 100% 50%" } } };
const ownTheme = { backgrounds: [{ id: "card", label: "Card" }], colors: { light: { "--primary": "0 0% 0%" } } };

function site(name: string, theme?: object): string {
  const dir = path.join(state.root, name);
  fs.mkdirSync(dir, { recursive: true });
  if (theme) fs.writeFileSync(path.join(dir, "theme.json"), JSON.stringify(theme, null, 2));
  return dir;
}

describe("theme inheritance", () => {
  beforeEach(() => {
    state.root = fs.mkdtempSync(path.join(os.tmpdir(), "theme-config-"));
    site("site_parent", parentTheme);
    site("site_child");
    site("site_own", ownTheme);
  });

  afterEach(() => {
    fs.rmSync(state.root, { recursive: true, force: true });
  });

  it("a child without its own theme.json uses the parent's file", () => {
    const resolved = resolveSiteTheme(path.join(state.root, "site_child"));
    expect(resolved?.inheritedFrom).toBe("site_parent");
    expect(resolved?.theme.backgrounds?.[0]?.id).toBe("muted");
    expect(resolved?.ownerRoot).toBe(path.join(state.root, "site_parent"));
  });

  it("a child with its own theme.json uses only its own file (no merge)", () => {
    const resolved = resolveSiteTheme(path.join(state.root, "site_own"));
    expect(resolved?.inheritedFrom).toBeNull();
    expect(resolved?.theme.backgrounds?.map((b) => b.id)).toEqual(["card"]);
  });

  it("a site without a parent and without a file has no theme", () => {
    const lone = site("site_lone");
    expect(loadSiteTheme(lone)).toBeNull();
  });

  it("refuses theme writes on an inheriting site", () => {
    const check = checkThemeWrite(path.join(state.root, "site_child"));
    expect(check.ok).toBe(false);
    if (!check.ok) {
      expect(check.status).toBe(409);
      expect(check.body.code).toBe("theme_inherited");
      expect(check.body.inherited_from).toBe("site_parent");
    }
    expect(checkThemeWrite(path.join(state.root, "site_parent")).ok).toBe(true);
  });

  it("creating a separate theme copies the parent file into the child", () => {
    const child = path.join(state.root, "site_child");
    const result = createOwnSiteTheme(child);
    expect(result).toEqual({ ok: true, copiedFrom: "site_parent" });
    expect(fs.readFileSync(path.join(child, "theme.json"), "utf-8")).toBe(
      fs.readFileSync(path.join(state.root, "site_parent", "theme.json"), "utf-8"),
    );
    expect(resolveSiteTheme(child)?.inheritedFrom).toBeNull();
    expect(checkThemeWrite(child).ok).toBe(true);

    const again = createOwnSiteTheme(child);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.body.code).toBe("theme_exists");
  });

  it("lists only children that still use the parent's theme", () => {
    expect(sitesInheritingThemeFrom(path.join(state.root, "site_parent"))).toEqual([
      path.join(state.root, "site_child"),
    ]);
  });
});
