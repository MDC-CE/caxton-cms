import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { findInternalUtmLinks, internalLinkUtmValidator, isSameSiteLink, utmLinksIn } from "./internal-link-utm";
import type { ValidationContext } from "../shared/types";

const hosts = new Set(["4geeks.com", "www.4geeks.com"]);

describe("isSameSiteLink", () => {
  it.each(["/es/blog/x?utm_source=blog", "?utm_source=x", "https://4geeks.com/a?utm_source=x", "https://www.4geeks.com/a?utm_medium=x", "//4geeks.com/a?utm_id=1", "4geeks.com/a?utm_source=x"])(
    "%s is same-site",
    (url) => expect(isSameSiteLink(url, hosts)).toBe(true),
  );

  it.each(["https://business.4geeks.com/a?utm_source=x", "https://fl.4geeksacademy.com/?utm_source=x", "https://example.com/?utm_source=x", "mailto:a@4geeks.com?utm_source=x"])(
    "%s is not same-site",
    (url) => expect(isSameSiteLink(url, hosts)).toBe(false),
  );
});

describe("utmLinksIn", () => {
  it("finds links inside markdown and HTML", () => {
    const text = 'See [this](/es/rigobot?utm_source=blog&utm_medium=articulo) and <a href="https://4geeks.com/x?utm_campaign=y">x</a>.';
    expect(utmLinksIn(text)).toEqual([
      { url: "/es/rigobot?utm_source=blog&utm_medium=articulo", params: ["utm_source", "utm_medium"] },
      { url: "https://4geeks.com/x?utm_campaign=y", params: ["utm_campaign"] },
    ]);
  });
});

describe("findInternalUtmLinks", () => {
  it("reports the YAML path and skips other domains", () => {
    const doc = {
      sections: [
        { type: "hero", cta: { url: "/apply?utm_source=hero" } },
        { type: "text", content: "Partner: https://example.com/?utm_source=4geeks" },
      ],
    };
    expect(findInternalUtmLinks(doc, hosts)).toEqual([{ yamlPath: "sections.0.cta.url", url: "/apply?utm_source=hero", params: ["utm_source"] }]);
  });
});

describe("internalLinkUtmValidator", () => {
  let dir: string | null = null;
  afterEach(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
    dir = null;
  });

  it("warns once per same-site link and passes clean files", async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "utm-val-"));
    const bad = path.join(dir, "bad.yml");
    const good = path.join(dir, "good.yml");
    fs.writeFileSync(bad, "sections:\n  - cta:\n      url: /apply?utm_source=hero&utm_medium=cta\n");
    fs.writeFileSync(good, "sections:\n  - cta:\n      url: /apply\n");
    const ctx = {
      contentFiles: [
        { slug: "bad", title: "Bad", type: "page", locale: "en", filePath: bad },
        { slug: "good", title: "Good", type: "page", locale: "en", filePath: good },
      ],
    } as unknown as ValidationContext;
    const res = await internalLinkUtmValidator.run(ctx);
    expect(res.errors).toEqual([]);
    expect(res.warnings).toHaveLength(1);
    expect(res.warnings[0]).toMatchObject({ code: "INTERNAL_LINK_HAS_UTM", file: bad });
    expect(res.status).toBe("warning");
  });
});
