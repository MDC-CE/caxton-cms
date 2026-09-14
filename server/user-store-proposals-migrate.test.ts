import { describe, expect, it } from "vitest";
import {
  ensureProposalsCreateOnContentEditors,
  type RoleDefinition,
} from "./user-store";

describe("ensureProposalsCreateOnContentEditors", () => {
  it("adds proposals_create for custom text or SEO editors, not bare viewers", () => {
    const roles: Record<string, RoleDefinition> = {
      blog_writer: {
        label: "Blog writer",
        capabilities: [
          { name: "content_view", contentTypes: ["blog"] },
          { name: "content_edit_text", contentTypes: ["blog"] },
        ],
      },
      viewer_only: {
        label: "Viewer",
        capabilities: [{ name: "content_view", contentTypes: "*" }],
      },
      seo_person: {
        label: "SEO",
        capabilities: [{ name: "seo_edit", contentTypes: "*" }],
      },
    };
    expect(ensureProposalsCreateOnContentEditors(roles)).toBe(true);
    expect(roles.blog_writer.capabilities.some((g) => g.name === "proposals_create")).toBe(true);
    expect(roles.seo_person.capabilities.some((g) => g.name === "proposals_create")).toBe(true);
    expect(roles.viewer_only.capabilities.some((g) => g.name === "proposals_create")).toBe(false);
    expect(roles.blog_writer.capabilities.some((g) => g.name === "proposals_review")).toBe(false);
  });

  it("skips built-ins and agentic ids", () => {
    const roles: Record<string, RoleDefinition> = {
      copy_editor: {
        label: "Custom collision",
        capabilities: [{ name: "content_edit_text", contentTypes: "*" }],
      },
    };
    expect(ensureProposalsCreateOnContentEditors(roles)).toBe(false);
  });
});
