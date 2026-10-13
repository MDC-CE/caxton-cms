import { describe, expect, it } from "vitest";
import {
  buildSectionSwapAiPrompt,
  getSectionHeadingForPrompt,
} from "@/components/DebugBubble/solveWithAiPrompt";

const base = {
  url: "/en/career-programs/full-stack",
  contentType: "programs",
  slug: "full-stack",
  locale: "en",
  sectionIndex: 3,
  sectionHeading: "Learn with mentors",
  component: "two_column",
  fromVersion: "v1.0",
  fromVariant: "imageRight",
  toVersion: "v2.0",
  toVariant: "showcase",
};

describe("buildSectionSwapAiPrompt", () => {
  it("includes the page, section and target layout", () => {
    const out = buildSectionSwapAiPrompt(base);
    expect(out).toContain("/en/career-programs/full-stack");
    expect(out).toContain("programs/full-stack, locale en");
    expect(out).toContain("sections[3], two_column v1.0 / imageRight");
    expect(out).toContain('heading "Learn with mentors"');
    expect(out).toContain("New layout: two_column v2.0 / showcase");
    expect(out).toContain("remove_section at 3+1");
    expect(out).toContain("sections.3.section_id");
    expect(out).toContain("{{ variable }}");
    expect(out).not.toMatch(/\n{3,}/);
  });

  it("labels live pages and draft variants", () => {
    expect(buildSectionSwapAiPrompt(base)).toContain("locale en, live)");
    expect(buildSectionSwapAiPrompt({ ...base, pageVariant: "default" })).toContain("locale en, live)");
    expect(buildSectionSwapAiPrompt({ ...base, pageVariant: "spring-test" })).toContain(
      "draft variant spring-test",
    );
  });

  it("adds the shared-template line only when shared", () => {
    expect(buildSectionSwapAiPrompt(base)).not.toContain("Shared template");
    expect(buildSectionSwapAiPrompt({ ...base, isSharedTemplate: true })).toContain(
      "Shared template: this section is used by many pages. Confirm with me before writing.",
    );
  });

  it("falls back when the current version or variant is missing", () => {
    const out = buildSectionSwapAiPrompt({ ...base, fromVersion: undefined, fromVariant: "" });
    expect(out).toContain("two_column (unknown version) / default");
  });
});

describe("getSectionHeadingForPrompt", () => {
  it("prefers title, then heading, then headline", () => {
    expect(getSectionHeadingForPrompt({ title: " Hi  there ", heading: "x" })).toBe("Hi there");
    expect(getSectionHeadingForPrompt({ title: "", heading: "Second" })).toBe("Second");
    expect(getSectionHeadingForPrompt({ headline: "Third" })).toBe("Third");
  });

  it("truncates long headings and handles missing ones", () => {
    const long = "a".repeat(120);
    const out = getSectionHeadingForPrompt({ title: long });
    expect(out.length).toBe(80);
    expect(out.endsWith("…")).toBe(true);
    expect(getSectionHeadingForPrompt({ title: { text: "obj" } })).toBe("(no heading)");
    expect(getSectionHeadingForPrompt(null)).toBe("(no heading)");
  });
});
