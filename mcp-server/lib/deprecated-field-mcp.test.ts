import { describe, expect, it } from "vitest";
import {
  deprecatedFieldFail,
  deprecatedFieldNextActions,
  deprecatedFieldsPresent,
  deprecatedTemplateRefWarnings,
  isDeprecatedFieldInfo,
} from "./deprecated-field-mcp.js";

function parse(result: { content: Array<{ text: string }> }) {
  return JSON.parse(result.content[0].text) as Record<string, unknown>;
}

describe("deprecatedFieldFail", () => {
  it("returns code, deprecated info, non-effect warnings, and a replacement next_action", () => {
    const res = deprecatedFieldFail(
      'Field "old_author" is deprecated',
      { field: "old_author", replaced_by: "author", reason: "moved" },
      { slug: "p", contentType: "blog", locale: "en" },
    );
    const body = parse(res);
    expect(body.success).toBe(false);
    expect(body.code).toBe("deprecated_field");
    expect(body.deprecated).toEqual({
      field: "old_author",
      replaced_by: "author",
      reason: "moved",
      field_path: "old_author",
    });
    expect((body.warnings as Array<{ code: string }>)[0].code).toBe("deprecated_field_no_write");
    expect(body.side_effects).toEqual([]);
    const next = body.next_actions as Array<{ tool: string; args_hint: Record<string, unknown> }>;
    expect(next[0].tool).toBe("update_entry_field");
    expect(next[0].args_hint).toMatchObject({ field: "author", slug: "p", contentType: "blog", locale: "en" });
  });

  it("has no next_actions when there is no replacement", () => {
    expect(deprecatedFieldNextActions({ field: "x", replaced_by: null }, { slug: "p", contentType: "blog" })).toEqual([]);
  });

  it("accepts a next_actions override", () => {
    const body = parse(
      deprecatedFieldFail("m", { field: "x", replaced_by: "y" }, { slug: "p", contentType: "blog" }, [
        { tool: "create_entry", reason: "retry" },
      ]),
    );
    expect((body.next_actions as Array<{ tool: string }>)[0].tool).toBe("create_entry");
  });
});

describe("isDeprecatedFieldInfo", () => {
  it("requires a field string", () => {
    expect(isDeprecatedFieldInfo({ field: "x", replaced_by: null })).toBe(true);
    expect(isDeprecatedFieldInfo(null)).toBe(false);
    expect(isDeprecatedFieldInfo({})).toBe(false);
  });
});

describe("deprecatedFieldsPresent", () => {
  const config = {
    editor: {
      old_author: { deprecated: { replaced_by: "author" } },
      legacy: { deprecated: true },
      title: {},
    },
  };

  it("lists deprecated fields with a stored value (root or field_overrides)", () => {
    const rows = deprecatedFieldsPresent(config, {
      old_author: "Jane",
      field_overrides: { legacy: "x" },
      title: "t",
    });
    expect(rows.map((r) => r.field).sort()).toEqual(["legacy", "old_author"]);
    expect(rows.find((r) => r.field === "old_author")?.replaced_by).toBe("author");
  });

  it("returns [] when none are present", () => {
    expect(deprecatedFieldsPresent(config, { old_author: "" })).toEqual([]);
    expect(deprecatedFieldsPresent(undefined, { old_author: "x" })).toEqual([]);
  });
});

describe("deprecatedTemplateRefWarnings", () => {
  it("maps server refs to deprecated_template_ref warnings", () => {
    const warnings = deprecatedTemplateRefWarnings([
      { field: "old_author", replaced_by: "author", section_path: "sections[1].title", variable: "entry.old_author" },
    ]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].code).toBe("deprecated_template_ref");
    expect(warnings[0].message).toMatch(/entry\.author/);
    expect(deprecatedTemplateRefWarnings(undefined)).toEqual([]);
  });
});
