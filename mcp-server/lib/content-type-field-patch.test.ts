import { describe, expect, it } from "vitest";
import {
  applyFieldPatch,
  checkRelationSourceCollision,
  checkRemoveAllowed,
  defaultStaticMapping,
  isForbiddenFieldKey,
  type ContentTypeConfigSlice,
} from "./content-type-field-patch.js";
import { buildFieldPatchWarnings, prepareFieldPatch } from "./content-type-field-validate.js";

const baseConfig: ContentTypeConfigSlice = {
  field_mapping: {
    title: { source: "title", default: null },
    body: { source: "body", default: null },
  },
  editor: {
    title: { type: "text" },
  },
  indexes: ["title"],
  unique_fields: ["slug"],
  strategy: { purpose: "Blog posts" },
};

describe("isForbiddenFieldKey", () => {
  it("blocks system and reserved keys", () => {
    expect(isForbiddenFieldKey("_slug")).toBe(true);
    expect(isForbiddenFieldKey("slug")).toBe(true);
    expect(isForbiddenFieldKey("image")).toBe(true);
    expect(isForbiddenFieldKey("hero")).toBe(false);
  });
});

describe("applyFieldPatch add", () => {
  it("adds identity mapping on static types by default", () => {
    const result = applyFieldPatch(baseConfig, {
      action: "add",
      field_key: "related_author",
      isDbBacked: false,
      editor: { type: "relation", source: "author" },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextFieldMapping.related_author).toEqual(defaultStaticMapping("related_author"));
    expect(result.nextEditor?.related_author?.type).toBe("relation");
    expect(result.diff.unchanged_field_count).toBe(2);
  });

  it("requires mapping on DB-backed types", () => {
    const dbConfig: ContentTypeConfigSlice = {
      ...baseConfig,
      database: { slug: "programs" },
    };
    const result = applyFieldPatch(dbConfig, {
      action: "add",
      field_key: "extra",
      isDbBacked: true,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("mapping_required");
  });

  it("rejects duplicate keys", () => {
    const result = applyFieldPatch(baseConfig, {
      action: "add",
      field_key: "title",
      isDbBacked: false,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("field_exists");
  });
});

describe("applyFieldPatch update", () => {
  it("deep-merges editor hints", () => {
    const result = applyFieldPatch(baseConfig, {
      action: "update",
      field_key: "title",
      isDbBacked: false,
      editor: { required: true, fill_intent: { goal: "seo", purpose: "Headline" } },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextEditor?.title).toMatchObject({
      type: "text",
      required: true,
      fill_intent: { goal: "seo", purpose: "Headline" },
    });
  });
});

describe("applyFieldPatch remove", () => {
  it("removes mapping and editor", () => {
    const result = applyFieldPatch(baseConfig, {
      action: "remove",
      field_key: "body",
      isDbBacked: false,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextFieldMapping.body).toBeUndefined();
    expect(result.nextEditor?.body).toBeUndefined();
  });

  it("blocks remove when field is indexed", () => {
    const result = applyFieldPatch(baseConfig, {
      action: "remove",
      field_key: "title",
      isDbBacked: false,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("field_in_indexes");
  });

  it("blocks remove when field is in unique_fields", () => {
    const cfg: ContentTypeConfigSlice = {
      ...baseConfig,
      indexes: [],
      unique_fields: ["body"],
    };
    const blocked = checkRemoveAllowed(cfg, "body");
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(blocked.blocker.code).toBe("field_in_unique_fields");
  });
});

describe("checkRelationSourceCollision", () => {
  it("rejects CT/DB name collision", () => {
    const r = checkRelationSourceCollision("program", ["program", "blog"], ["program"]);
    expect(r.ok).toBe(false);
  });

  it("allows unique names", () => {
    const r = checkRelationSourceCollision("author", ["blog"], ["programs"]);
    expect(r.ok).toBe(true);
  });
});

describe("prepareFieldPatch", () => {
  const ctx = {
    contentType: "blog",
    contentTypeNames: ["blog", "author"],
    databaseNames: ["programs"],
  };

  it("rejects relation collision on add", () => {
    const result = prepareFieldPatch(
      baseConfig,
      {
        action: "add",
        field_key: "prog",
        isDbBacked: false,
        editor: { type: "relation", source: "program" },
      },
      { ...ctx, contentTypeNames: ["blog", "program"], databaseNames: ["program"] },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("relation_source_collision");
  });

  it("requires fill_intent when marking required", () => {
    const result = prepareFieldPatch(
      baseConfig,
      {
        action: "update",
        field_key: "title",
        isDbBacked: false,
        editor: { required: true },
      },
      ctx,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("missing_fill_intent");
  });

  describe("deprecation", () => {
    const depConfig: ContentTypeConfigSlice = {
      ...baseConfig,
      indexes: [],
      editor: { title: { type: "text" }, body: { deprecated: { replaced_by: "title" } } },
    };

    it("deprecates a field with a replacement and warns that values stay", () => {
      const input = {
        action: "update" as const,
        field_key: "title",
        isDbBacked: false,
        editor: { deprecated: { replaced_by: null } } as never,
      };
      const cfg: ContentTypeConfigSlice = { ...baseConfig, indexes: [] };
      const result = prepareFieldPatch(cfg, input, ctx);
      expect(result.ok).toBe(true);
      const warnings = buildFieldPatchWarnings(input, cfg, false, { templateRefCount: 2 });
      const codes = warnings.map((w) => w.code);
      expect(codes).toContain("deprecated_existing_values_stay");
      expect(codes).toContain("deprecated_template_refs");
    });

    it("rejects deprecated + required", () => {
      const result = prepareFieldPatch(
        { ...baseConfig, indexes: [] },
        {
          action: "update",
          field_key: "title",
          isDbBacked: false,
          editor: {
            required: true,
            fill_intent: { goal: "g", purpose: "p" },
            deprecated: { replaced_by: "body" },
          } as never,
        },
        ctx,
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe("deprecated_config_invalid");
    });

    it("blocks removing a field that is another field's replacement", () => {
      const result = prepareFieldPatch(
        depConfig,
        { action: "remove", field_key: "title", isDbBacked: false },
        ctx,
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe("deprecated_replacement_target");
      expect(result.details?.referrers).toEqual(["body"]);
    });

    it("deprecated: null restores the field", () => {
      const result = applyFieldPatch(depConfig, {
        action: "update",
        field_key: "body",
        isDbBacked: false,
        editor: { deprecated: null } as never,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.nextEditor?.body && "deprecated" in result.nextEditor.body).toBe(false);
    });
  });
});
