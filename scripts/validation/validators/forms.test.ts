import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import yaml from "js-yaml";
import { formsValidator } from "./forms";
import type { ContentFile, ValidationContext } from "../shared/types";

function makeContext(contentRoot: string, files: ContentFile[]): ValidationContext {
  return {
    contentRoot,
    contentFiles: files,
    redirectMap: new Map(),
    availableSchemas: new Set(),
    sitemapEntries: [],
  };
}

function pageWithForm(conversionName: string) {
  return {
    slug: "home",
    title: "Home",
    sections: [
      {
        type: "sticky_cta",
        form: {
          variant: "inline",
          conversion_name: conversionName,
          fields: { email: { visible: true } },
        },
      },
    ],
  };
}

describe("formsValidator (site-scoped)", () => {
  let tmp = "";
  let entryDir = "";

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "forms-validator-"));
    fs.writeFileSync(
      path.join(tmp, "settings.yml"),
      yaml.dump({
        tracking: {
          conversion_events: [{ name: "site_only_event" }, { name: "request_more_info" }],
        },
      }),
    );
    entryDir = path.join(tmp, "pages", "home");
    fs.mkdirSync(entryDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  function liveFile(): ContentFile {
    return {
      slug: "home",
      title: "Home",
      type: "page",
      locale: "en",
      filePath: path.join(entryDir, "en.yml"),
    };
  }

  it("uses the context site's conversion events, not the default site's", async () => {
    fs.writeFileSync(path.join(entryDir, "en.yml"), yaml.dump(pageWithForm("site_only_event")));
    const result = await formsValidator.run(makeContext(tmp, [liveFile()]));
    expect(result.errors.filter((e) => e.code === "FORM_INVALID_CONVERSION_NAME")).toEqual([]);
  });

  it("flags a conversion_name the context site does not allow", async () => {
    fs.writeFileSync(path.join(entryDir, "en.yml"), yaml.dump(pageWithForm("business_partner_lead")));
    const result = await formsValidator.run(makeContext(tmp, [liveFile()]));
    const invalid = result.errors.filter((e) => e.code === "FORM_INVALID_CONVERSION_NAME");
    expect(invalid).toHaveLength(1);
    expect(invalid[0].suggestion).toMatch(/business_partner_lead/);
    expect(path.resolve(invalid[0].file!)).toBe(path.join(entryDir, "en.yml"));
  });

  it("also checks unpublished draft overlays in the entry folder", async () => {
    fs.writeFileSync(path.join(entryDir, "en.yml"), yaml.dump(pageWithForm("site_only_event")));
    fs.writeFileSync(path.join(entryDir, "draft.en.yml"), yaml.dump(pageWithForm("not_allowed")));
    const result = await formsValidator.run(makeContext(tmp, [liveFile()]));
    const invalid = result.errors.filter((e) => e.code === "FORM_INVALID_CONVERSION_NAME");
    expect(invalid).toHaveLength(1);
    expect(path.resolve(invalid[0].file!)).toBe(path.join(entryDir, "draft.en.yml"));
  });

  it("ignores content files outside the context site root", async () => {
    const otherSite = fs.mkdtempSync(path.join(os.tmpdir(), "forms-validator-other-"));
    try {
      const otherDir = path.join(otherSite, "pages", "home");
      fs.mkdirSync(otherDir, { recursive: true });
      fs.writeFileSync(path.join(otherDir, "en.yml"), yaml.dump(pageWithForm("not_allowed")));
      const result = await formsValidator.run(
        makeContext(tmp, [{ ...liveFile(), filePath: path.join(otherDir, "en.yml") }]),
      );
      expect(result.errors).toEqual([]);
    } finally {
      fs.rmSync(otherSite, { recursive: true, force: true });
    }
  });
});
