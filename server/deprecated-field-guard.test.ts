import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  checkDeprecatedFileWrite,
  checkDeprecatedWrites,
  deprecatedStripPayload,
  entryHasLiveStoredValue,
  findNewDeprecatedVarRefs,
  rootFieldFromPath,
  scanTypeDirForDeprecatedFields,
  stripDeprecatedFromEntryFolder,
  stripDeprecatedKeys,
} from "./deprecated-field-guard";
import { writeMappedFields } from "./field-overrides";
import { resetRegistry } from "./content-types";

const ORIGINAL_CWD = process.cwd();
let tempDir: string;
let contentRoot: string;

function write(rel: string, text: string) {
  const abs = path.join(contentRoot, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, text, "utf-8");
}

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "deprecated-guard-test-"));
  contentRoot = path.join(tempDir, "site_test");
  fs.mkdirSync(contentRoot, { recursive: true });
  write(
    "content-types.yml",
    `blog:
  directory: blog
  field_mapping:
    title: title
    author: author
    old_author:
      source: old_author
      default: null
  editor:
    old_author:
      deprecated:
        replaced_by: author
        reason: Use the author relation
  url_pattern:
    en: /en/blog/:slug
`,
  );
  write("blog/old-post/_common.yml", "old_author: Jane\n");
  write("blog/old-post/en.yml", "slug: old-post\nsections: []\n");
  write("blog/new-post/en.yml", "slug: new-post\nsections: []\n");
  process.chdir(tempDir);
  resetRegistry(contentRoot);
});

afterEach(() => {
  process.chdir(ORIGINAL_CWD);
  resetRegistry(contentRoot);
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("rootFieldFromPath", () => {
  it("returns the root key and skips non-field roots", () => {
    expect(rootFieldFromPath("old_author")).toBe("old_author");
    expect(rootFieldFromPath("author.name")).toBe("author");
    expect(rootFieldFromPath("field_overrides.old_author")).toBe("old_author");
    expect(rootFieldFromPath("sections[0].title")).toBeNull();
    expect(rootFieldFromPath("meta.page_title")).toBeNull();
  });
});

describe("entryHasLiveStoredValue", () => {
  it("detects values in _common.yml or live locale files only", () => {
    expect(entryHasLiveStoredValue("blog", "old-post", "old_author", contentRoot)).toBe(true);
    expect(entryHasLiveStoredValue("blog", "new-post", "old_author", contentRoot)).toBe(false);
    write("blog/new-post/draft.en.yml", "old_author: Draft only\n");
    expect(entryHasLiveStoredValue("blog", "new-post", "old_author", contentRoot)).toBe(false);
  });
});

describe("checkDeprecatedWrites", () => {
  it("rejects a new value on an entry without one, naming the replacement", () => {
    const r = checkDeprecatedWrites({
      contentType: "blog",
      slug: "new-post",
      contentRoot,
      updates: { old_author: "Bob" },
    });
    expect(r).toMatchObject({
      ok: false,
      code: "deprecated_field",
      field: "old_author",
      replaced_by: "author",
      reason: "Use the author relation",
      field_path: "old_author",
    });
  });

  it("allows editing on old entries and clearing anywhere", () => {
    expect(
      checkDeprecatedWrites({ contentType: "blog", slug: "old-post", contentRoot, updates: { old_author: "Jane D" } }),
    ).toEqual({ ok: true });
    expect(
      checkDeprecatedWrites({ contentType: "blog", slug: "new-post", contentRoot, updates: { old_author: null } }),
    ).toEqual({ ok: true });
    expect(
      checkDeprecatedWrites({
        contentType: "blog",
        slug: "new-post",
        contentRoot,
        updates: [{ path: "old_author", value: "" }],
      }),
    ).toEqual({ ok: true });
  });

  it("ignores non-deprecated fields", () => {
    expect(
      checkDeprecatedWrites({ contentType: "blog", slug: "new-post", contentRoot, updates: { author: "bob" } }),
    ).toEqual({ ok: true });
  });
});

describe("writeMappedFields guard", () => {
  it("returns deprecated info and does not write", () => {
    const enPath = path.join(contentRoot, "blog", "new-post", "en.yml");
    const before = fs.readFileSync(enPath, "utf-8");
    const result = writeMappedFields("blog", "new-post", "en", { old_author: "Bob" }, { contentRoot });
    expect(result.success).toBe(false);
    expect(result.code).toBe("deprecated_field");
    expect(result.deprecated).toMatchObject({ field: "old_author", replaced_by: "author" });
    expect(fs.readFileSync(enPath, "utf-8")).toBe(before);
  });

  it("allows old entries to keep editing", () => {
    const result = writeMappedFields("blog", "old-post", "en", { old_author: "Jane D" }, { contentRoot });
    expect(result.success).toBe(true);
  });
});

describe("checkDeprecatedFileWrite", () => {
  it("rejects a raw file that adds the key on a new entry", () => {
    const r = checkDeprecatedFileWrite({
      contentType: "blog",
      slug: "new-post",
      contentRoot,
      before: { slug: "new-post" },
      after: { slug: "new-post", old_author: "Bob" },
    });
    expect(r.ok).toBe(false);
  });

  it("allows unchanged values and old entries", () => {
    expect(
      checkDeprecatedFileWrite({
        contentType: "blog",
        slug: "new-post",
        contentRoot,
        before: { old_author: "Same" },
        after: { old_author: "Same", title: "x" },
      }),
    ).toEqual({ ok: true });
    expect(
      checkDeprecatedFileWrite({
        contentType: "blog",
        slug: "old-post",
        contentRoot,
        before: null,
        after: { old_author: "Changed" },
      }),
    ).toEqual({ ok: true });
  });

  it("rejects promoting a draft that sets the key when live has none", () => {
    const r = checkDeprecatedFileWrite({
      contentType: "blog",
      slug: "new-post",
      contentRoot,
      before: null,
      after: { slug: "new-post", old_author: "From draft" },
    });
    expect(r).toMatchObject({ ok: false, code: "deprecated_field" });
  });
});

describe("duplicate strip helpers", () => {
  const editor = { old_author: { deprecated: { replaced_by: "author" } } } as const;

  it("strips root keys and field_overrides entries", () => {
    const obj: Record<string, unknown> = {
      title: "x",
      old_author: "Jane",
      field_overrides: { old_author: "J", other: 1 },
    };
    expect(stripDeprecatedKeys(obj, editor as never)).toEqual(["old_author"]);
    expect(obj).toEqual({ title: "x", field_overrides: { other: 1 } });
  });

  it("strips every yaml file in an entry folder", () => {
    const folder = path.join(contentRoot, "blog", "old-post");
    expect(stripDeprecatedFromEntryFolder(folder, editor as never)).toEqual(["old_author"]);
    expect(fs.readFileSync(path.join(folder, "_common.yml"), "utf-8")).not.toMatch(/old_author/);
  });

  it("builds a payload that names the replacement", () => {
    const payload = deprecatedStripPayload(["old_author"], { old_author: { replaced_by: "author" } });
    expect(payload.stripped_deprecated_fields).toEqual([{ field: "old_author", replaced_by: "author" }]);
    expect(payload.warnings?.[0]).toMatch(/set "author" instead/);
    expect(deprecatedStripPayload([], {})).toEqual({});
  });
});

describe("findNewDeprecatedVarRefs", () => {
  const deprecated = { old_author: { replaced_by: "author" } };

  it("flags only references added by this write", () => {
    const before = [{ type: "hero", title: "By {{ entry.old_author }}" }];
    const after = [
      { type: "hero", title: "By {{ entry.old_author }}" },
      { type: "cta", body: "{{ single.old_author }} wrote this" },
    ];
    const refs = findNewDeprecatedVarRefs(before, after, deprecated);
    expect(refs.length).toBeGreaterThan(0);
    expect(refs.some((r) => r.variable === "single.old_author")).toBe(true);
    expect(refs[0]).toMatchObject({ field: "old_author", replaced_by: "author" });
  });

  it("returns nothing when refs are unchanged or removed", () => {
    const sections = [{ title: "{{ entry.old_author }}" }];
    expect(findNewDeprecatedVarRefs(sections, sections, deprecated)).toEqual([]);
    expect(findNewDeprecatedVarRefs(sections, [], deprecated)).toEqual([]);
    expect(findNewDeprecatedVarRefs([], [{ title: "{{ entry.author }}" }], deprecated)).toEqual([]);
  });
});

describe("scanTypeDirForDeprecatedFields", () => {
  it("reports template refs and draft-only values", () => {
    write("blog/template.en.yml", "sections:\n  - title: '{{ entry.old_author }}'\n");
    write("blog/new-post/draft.en.yml", "old_author: Draft only\n");
    const scan = scanTypeDirForDeprecatedFields(path.join(contentRoot, "blog"), ["old_author"]);
    expect(scan.templateRefs.old_author).toEqual(["template.en.yml"]);
    expect(scan.draftOnlyValues.old_author).toEqual(["new-post"]);
  });
});
