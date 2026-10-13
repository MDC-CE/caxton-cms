import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import type { Request, Response } from "express";
import { initialDataMiddleware } from "./initial-data-middleware";
import { isSiteThemedPath } from "@shared/theme-palette";

let contentRoot = "";
const shell = "<!DOCTYPE html><html><head><title>x</title></head><body><div id=\"root\"></div></body></html>";

beforeAll(() => {
  contentRoot = fs.mkdtempSync(path.join(os.tmpdir(), "theme-inject-"));
  fs.writeFileSync(
    path.join(contentRoot, "theme.json"),
    JSON.stringify({
      backgrounds: [{ id: "muted", label: "Muted", cssVar: "--muted" }],
      colors: { light: { "--primary": "1 2% 3%" }, dark: { "--primary": "4 5% 6%" } },
    }),
  );
});

afterAll(() => {
  fs.rmSync(contentRoot, { recursive: true, force: true });
});

function servePrivate(pathname: string): string {
  let sent = "";
  const headers: Record<string, string> = { "content-type": "text/html" };
  const res = {
    locals: { site: { contentRoot } },
    getHeader: (name: string) => headers[name.toLowerCase()],
    setHeader: (name: string, value: string) => {
      headers[name.toLowerCase()] = value;
    },
    end(chunk?: unknown) {
      sent = String(chunk ?? "");
      return this;
    },
  } as unknown as Response;
  let nextCalled = false;
  initialDataMiddleware({ path: pathname, originalUrl: pathname } as Request, res, () => {
    nextCalled = true;
  });
  expect(nextCalled).toBe(true);
  res.end(shell);
  return sent;
}

describe("site theme on page-rendering routes", () => {
  it("injects site colors on the page preview and section demos", () => {
    for (const route of ["/private/page-preview", "/private/demo/abc123"]) {
      const html = servePrivate(route);
      expect(html).toContain('id="__theme_overrides__"');
      expect(html).toContain("--primary: 1 2% 3%;");
      expect(html).toContain("--theme-bg-muted");
    }
  });

  it("keeps default colors on admin-only screens", () => {
    for (const route of ["/private/settings/general", "/private/theme", "/private/proposals", "/private"]) {
      expect(servePrivate(route)).not.toContain("__theme_overrides__");
    }
  });

  it("classifies routes", () => {
    expect(isSiteThemedPath("/")).toBe(true);
    expect(isSiteThemedPath("/en/landing/foo?x=1")).toBe(true);
    expect(isSiteThemedPath("/private/page-preview?type=x")).toBe(true);
    expect(isSiteThemedPath("/private/demo/abc")).toBe(true);
    expect(isSiteThemedPath("/private/page-previews")).toBe(false);
    expect(isSiteThemedPath("/private/settings")).toBe(false);
    expect(isSiteThemedPath("/api/theme")).toBe(false);
  });
});
