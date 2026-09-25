import { describe, expect, it } from "vitest";
import {
  assertNotReplacementTarget,
  deprecatedFieldMessage,
  isNonEmptyFieldValue,
  listDeprecatedFields,
  listReplacementReferrers,
  parseDeprecated,
  validateDeprecations,
} from "./deprecatedField";

describe("parseDeprecated", () => {
  it("returns null when not deprecated", () => {
    expect(parseDeprecated(undefined)).toBeNull();
    expect(parseDeprecated({})).toBeNull();
    expect(parseDeprecated({ deprecated: false })).toBeNull();
    expect(parseDeprecated({ deprecated: "yes" })).toBeNull();
  });

  it("treats true as no replacement", () => {
    expect(parseDeprecated({ deprecated: true })).toEqual({ replaced_by: null });
  });

  it("trims and keeps reason / since", () => {
    expect(
      parseDeprecated({ deprecated: { replaced_by: " author ", reason: " moved ", since: "2026-09" } }),
    ).toEqual({ replaced_by: "author", reason: "moved", since: "2026-09" });
    expect(parseDeprecated({ deprecated: { replaced_by: "" } })).toEqual({ replaced_by: null });
  });
});

describe("validateDeprecations", () => {
  const mapping = { old_author: "old_author", author: "author", _slug: "slug" };

  it("accepts a valid replacement and no replacement", () => {
    expect(
      validateDeprecations({ old_author: { deprecated: { replaced_by: "author" } } }, mapping),
    ).toEqual({ ok: true });
    expect(validateDeprecations({ old_author: { deprecated: true } }, mapping)).toEqual({ ok: true });
  });

  it("rejects deprecated + required", () => {
    const r = validateDeprecations({ old_author: { deprecated: true, required: true } }, mapping);
    expect(r).toMatchObject({ ok: false, code: "deprecated_config_invalid", field: "old_author" });
    const attached = validateDeprecations({ old_author: { deprecated: true, required: "attached" } }, mapping);
    expect(attached.ok).toBe(false);
  });

  it("rejects self, system, unknown, and deprecated replacements", () => {
    expect(validateDeprecations({ old_author: { deprecated: { replaced_by: "old_author" } } }, mapping).ok).toBe(false);
    expect(validateDeprecations({ old_author: { deprecated: { replaced_by: "_slug" } } }, mapping).ok).toBe(false);
    expect(validateDeprecations({ old_author: { deprecated: { replaced_by: "nope" } } }, mapping).ok).toBe(false);
    expect(
      validateDeprecations(
        {
          old_author: { deprecated: { replaced_by: "author" } },
          author: { deprecated: true },
        },
        mapping,
      ).ok,
    ).toBe(false);
  });
});

describe("replacement referrers", () => {
  const editor = {
    old_author: { deprecated: { replaced_by: "author" } },
    legacy_author: { deprecated: { replaced_by: "author" } },
    other: { deprecated: true },
  };

  it("lists deprecated fields pointing at a target", () => {
    expect(listReplacementReferrers(editor, "author").sort()).toEqual(["legacy_author", "old_author"]);
    expect(listReplacementReferrers(editor, "other")).toEqual([]);
  });

  it("blocks removing a replacement target", () => {
    const r = assertNotReplacementTarget(editor, "author");
    expect(r).toMatchObject({ ok: false, code: "deprecated_replacement_target" });
    expect(assertNotReplacementTarget(editor, "title")).toEqual({ ok: true });
  });

  it("lists every deprecated field", () => {
    expect(Object.keys(listDeprecatedFields(editor)).sort()).toEqual(["legacy_author", "old_author", "other"]);
  });
});

describe("isNonEmptyFieldValue", () => {
  it("treats null, empty string, [] and {} as empty", () => {
    expect(isNonEmptyFieldValue(null)).toBe(false);
    expect(isNonEmptyFieldValue(undefined)).toBe(false);
    expect(isNonEmptyFieldValue("  ")).toBe(false);
    expect(isNonEmptyFieldValue([])).toBe(false);
    expect(isNonEmptyFieldValue({})).toBe(false);
    expect(isNonEmptyFieldValue(0)).toBe(true);
    expect(isNonEmptyFieldValue(false)).toBe(true);
    expect(isNonEmptyFieldValue("x")).toBe(true);
  });
});

describe("deprecatedFieldMessage", () => {
  it("names the replacement and the non-effects", () => {
    const msg = deprecatedFieldMessage("old_author", { replaced_by: "author", reason: "Use relation" });
    expect(msg).toMatch(/use "author" instead/);
    expect(msg).toMatch(/Reason: Use relation/);
    expect(msg).toMatch(/keep it/);
    expect(deprecatedFieldMessage("x", { replaced_by: null })).toMatch(/no replacement/);
  });
});
