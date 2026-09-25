import { beforeEach, describe, expect, it, vi } from "vitest";

const configs: Record<string, { single_template?: boolean; database?: { slug?: string } } | null> = {
  blog: { single_template: true },
  course: { database: { slug: "courses" } },
  landing: {},
};
const detached = new Set<string>();

vi.mock("./content-types", () => ({
  getContentTypeConfig: (type: string) => configs[type] ?? null,
}));
vi.mock("./shared-layout-entry", () => ({
  isEntryDetached: (type: string, slug: string) => detached.has(`${type}/${slug}`),
}));

const { layoutInfoForEntry, layoutOwnerForEntry, layoutOwnerForType } = await import("./layout-owner");

describe("layoutOwnerForType", () => {
  it("shared_template for single_template or database types, entry otherwise", () => {
    expect(layoutOwnerForType({ single_template: true })).toBe("shared_template");
    expect(layoutOwnerForType({ database: { slug: "courses" } })).toBe("shared_template");
    expect(layoutOwnerForType({})).toBe("entry");
    expect(layoutOwnerForType(null)).toBe("entry");
  });
});

describe("layoutInfoForEntry", () => {
  beforeEach(() => detached.clear());

  it("attached entries of shared-layout types use the template", () => {
    expect(layoutInfoForEntry("blog", "what-is-grok")).toEqual({ layout_owner: "shared_template" });
    expect(layoutInfoForEntry("course", "full-stack")).toEqual({ layout_owner: "shared_template" });
  });

  it("types without a shared layout own their layout", () => {
    expect(layoutInfoForEntry("landing", "ai-bootcamp")).toEqual({ layout_owner: "entry" });
  });

  it("detached entries report entry, file-based and database-backed", () => {
    detached.add("blog/custom-post");
    detached.add("course/custom-course");
    expect(layoutInfoForEntry("blog", "custom-post")).toEqual({ layout_owner: "entry", detached: true });
    expect(layoutInfoForEntry("course", "custom-course")).toEqual({ layout_owner: "entry", detached: true });
    expect(layoutOwnerForEntry("blog", "custom-post")).toBe("entry");
  });

  it("template slugs are the shared template itself", () => {
    expect(layoutInfoForEntry("blog", "template")).toEqual({
      layout_owner: "shared_template",
      is_shared_template: true,
    });
  });
});
