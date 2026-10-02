import { describe, expect, it, vi, beforeEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { EntryPreviewManager } from "./entry-preview-manager";

function mockMediaGallery(contentRoot: string) {
  return {
    getDefaultStorageProvider: () => ({
      name: "local",
      list: undefined,
      getPublicUrl: (key: string) => `/${path.basename(contentRoot)}/images/${key}`,
      exists: async () => false,
    }),
    getImage: () => null,
  } as any;
}

describe("listMetasByKey", () => {
  let contentRoot: string;

  beforeEach(() => {
    contentRoot = fs.mkdtempSync(path.join(os.tmpdir(), "epm-"));
  });

  it("indexes metas by slug:locale:width from disk layout", async () => {
    const metaDir = path.join(
      contentRoot,
      "images",
      "entry-previews",
      "location",
      "rest-of-america",
      "es",
    );
    fs.mkdirSync(metaDir, { recursive: true });
    fs.writeFileSync(
      path.join(metaDir, "1200.meta.json"),
      JSON.stringify({
        url: "/x.webp",
        capturedAt: "2026-01-01T00:00:00.000Z",
        dirty: true,
        width: 1200,
        locale: "es",
      }),
    );

    const mgr = new EntryPreviewManager(contentRoot, mockMediaGallery(contentRoot));
    const map = await mgr.listMetasByKey("location");
    expect(map.get("rest-of-america:es:1200")?.dirty).toBe(true);
    expect(map.get("rest-of-america:es:1200")?.url).toBe("/x.webp");
  });

  it("needsCapture is true for dirty/missing when propsHash omitted", async () => {
    const mgr = new EntryPreviewManager(contentRoot, mockMediaGallery(contentRoot));
    expect(mgr.needsCapture(null, undefined, false)).toBe(true);
    expect(
      mgr.needsCapture(
        {
          url: "/a.webp",
          capturedAt: "2026-01-01T00:00:00.000Z",
          dirty: true,
          width: 1200,
          locale: "en",
        },
        undefined,
        false,
      ),
    ).toBe(true);
    expect(
      mgr.needsCapture(
        {
          url: "/a.webp",
          capturedAt: "2026-01-01T00:00:00.000Z",
          dirty: false,
          width: 1200,
          locale: "en",
        },
        undefined,
        false,
      ),
    ).toBe(false);
  });
});
