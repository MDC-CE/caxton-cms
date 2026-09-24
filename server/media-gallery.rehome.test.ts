import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { MediaGallery } from "./media-gallery";

const probeName = "rehome-present-probe.mp4";
const probeSrc = `/site_learning-mdc-edu/images/${probeName}`;
const missingSrc = "/site_learning-mdc-edu/images/rehome-missing-probe.mp4";

function sha256(data: Buffer): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

describe("uploadAndRegister restores a missing file", () => {
  const temps: string[] = [];
  const probePath = path.join(process.cwd(), "site_learning-mdc-edu/images", probeName);

  afterEach(() => {
    if (fs.existsSync(probePath)) fs.unlinkSync(probePath);
    for (const dir of temps.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  function galleryWith(entry: { id: string; src: string; hash: string }): {
    gallery: MediaGallery;
    dir: string;
    page: string;
  } {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "media-rehome-"));
    temps.push(dir);
    const pageDir = path.join(dir, "pages");
    fs.mkdirSync(pageDir, { recursive: true });
    const page = path.join(pageDir, "home.yml");
    fs.writeFileSync(page, `url: ${entry.src}\n`, "utf8");
    fs.writeFileSync(
      path.join(dir, "image-registry.json"),
      JSON.stringify({
        presets: {},
        images: {
          [entry.id]: {
            src: entry.src,
            alt: "Video: probe",
            hash: entry.hash,
            origin: "upload",
            tags: [],
          },
        },
      }),
      "utf8",
    );
    return { gallery: new MediaGallery(dir), dir, page };
  }

  it("writes the bytes again under the same id when the stored file is missing", async () => {
    const data = Buffer.from("same-bytes-different-filename");
    const { gallery, dir, page } = galleryWith({
      id: "mdc-desktop-24s",
      src: missingSrc,
      hash: sha256(data),
    });

    const result = await gallery.uploadAndRegister("another-name.mp4", data, "video/mp4");

    expect(result.restored).toBe(true);
    expect(result.duplicate).toBeUndefined();
    expect(result.id).toBe("mdc-desktop-24s");
    expect(result.src).not.toBe(missingSrc);
    expect(fs.existsSync(path.join(dir, "images", "mdc-desktop-24s.mp4"))).toBe(true);
    expect(fs.readFileSync(page, "utf8")).toContain(result.src);
    expect(fs.readFileSync(page, "utf8")).not.toContain(missingSrc);
    expect(gallery.getRegistry()?.images["mdc-desktop-24s"]?.src).toBe(result.src);
  });

  it("keeps the existing entry when the stored file is still on disk", async () => {
    const data = Buffer.from("bytes-that-are-already-stored");
    fs.mkdirSync(path.dirname(probePath), { recursive: true });
    fs.writeFileSync(probePath, data);
    const { gallery, dir } = galleryWith({
      id: "already-there",
      src: probeSrc,
      hash: sha256(data),
    });

    const result = await gallery.uploadAndRegister("renamed.mp4", data, "video/mp4");

    expect(result.duplicate).toBe(true);
    expect(result.existingId).toBe("already-there");
    expect(result.src).toBe(probeSrc);
    expect(fs.existsSync(path.join(dir, "images", "already-there.mp4"))).toBe(false);
  });
});
