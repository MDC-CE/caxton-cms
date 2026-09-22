import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { editContent } from "./content-editor";
import { ContentIndex } from "./content-index";
import { resetRegistry } from "./content-types";

const ORIGINAL_CWD = process.cwd();
let tempDir: string;
let contentRoot: string;

const ATTACHED_MSG =
  "Attached shared-layout entries cannot change structure or layout; detach the entry or edit the shared template.";

function writeAttachedBlogSite() {
  fs.mkdirSync(path.join(contentRoot, "blog", "demo-post"), { recursive: true });
  fs.writeFileSync(
    path.join(contentRoot, "content-types.yml"),
    `blog:
  directory: blog
  single_template: true
  field_mapping:
    title: title
    content: content
    _slug: slug
    _locale: locale
  url_pattern:
    en: /en/blog/:slug
`,
    "utf-8",
  );
  fs.writeFileSync(
    path.join(contentRoot, "blog", "template.en.yml"),
    `meta:
  page_title: "{{ entry.title }}"
sections:
  - type: hero
    section_id: hero-1
    title: "{{ entry.title }}"
  - type: article
    section_id: article-1
    content: "{{ entry.content }}"
`,
    "utf-8",
  );
  fs.writeFileSync(
    path.join(contentRoot, "blog", "demo-post", "_common.yml"),
    `title: Demo
slug: demo-post
`,
    "utf-8",
  );
  fs.writeFileSync(
    path.join(contentRoot, "blog", "demo-post", "en.yml"),
    `title: Demo
content: Hello world
`,
    "utf-8",
  );
}

describe("attached shared-layout structural ops + layoutTarget", () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "attached-layout-target-"));
    contentRoot = path.join(tempDir, "site_test");
    writeAttachedBlogSite();
    process.chdir(tempDir);
    resetRegistry(contentRoot);
  });

  afterEach(() => {
    process.chdir(ORIGINAL_CWD);
    resetRegistry(contentRoot);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("rejects add_item on sections without layoutTarget (does not write entry overlay)", async () => {
    const ci = new ContentIndex(contentRoot);
    const entryBefore = fs.readFileSync(
      path.join(contentRoot, "blog", "demo-post", "en.yml"),
      "utf-8",
    );
    const templateBefore = fs.readFileSync(
      path.join(contentRoot, "blog", "template.en.yml"),
      "utf-8",
    );

    const result = await editContent({
      contentType: "blog",
      slug: "demo-post",
      locale: "en",
      operations: [
        {
          action: "add_item",
          path: "sections",
          index: 0,
          item: {
            type: "breadcrumb",
            items: [{ label: "Home", url: "/" }, { label: "Post" }],
          },
        },
      ],
      contentRoot,
      ci,
      skipSharedLayoutFanOut: true,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe(ATTACHED_MSG);
    expect(fs.readFileSync(path.join(contentRoot, "blog", "demo-post", "en.yml"), "utf-8")).toBe(
      entryBefore,
    );
    expect(fs.readFileSync(path.join(contentRoot, "blog", "template.en.yml"), "utf-8")).toBe(
      templateBefore,
    );
  });

  it("rejects reorder_sections without layoutTarget", async () => {
    const ci = new ContentIndex(contentRoot);
    const result = await editContent({
      contentType: "blog",
      slug: "demo-post",
      locale: "en",
      operations: [{ action: "reorder_sections", from: 0, to: 1 }],
      contentRoot,
      ci,
      skipSharedLayoutFanOut: true,
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe(ATTACHED_MSG);
  });

  it("with layoutTarget type_template writes template.en.yml not the entry overlay", async () => {
    const ci = new ContentIndex(contentRoot);
    const result = await editContent({
      contentType: "blog",
      slug: "demo-post",
      locale: "en",
      layoutTarget: "type_template",
      operations: [
        {
          action: "add_item",
          path: "sections",
          index: 0,
          item: {
            type: "breadcrumb",
            items: [{ label: "Home", url: "/" }, { label: "Post" }],
          },
        },
      ],
      contentRoot,
      ci,
      skipSharedLayoutFanOut: true,
    });

    expect(result.success).toBe(true);

    const entryRaw = fs.readFileSync(
      path.join(contentRoot, "blog", "demo-post", "en.yml"),
      "utf-8",
    );
    expect(entryRaw).not.toContain("type: breadcrumb");

    const templateRaw = fs.readFileSync(
      path.join(contentRoot, "blog", "template.en.yml"),
      "utf-8",
    );
    expect(templateRaw).toContain("type: breadcrumb");
    // Inserted at index 0 — breadcrumb should lead
    const breadcrumbIdx = templateRaw.indexOf("type: breadcrumb");
    const heroIdx = templateRaw.indexOf("type: hero");
    expect(breadcrumbIdx).toBeGreaterThanOrEqual(0);
    expect(breadcrumbIdx).toBeLessThan(heroIdx);
  });
});
