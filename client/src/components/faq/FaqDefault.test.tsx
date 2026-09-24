import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FAQSection } from "../../../../site_learning-mdc-edu/component-registry/faq/variants/FaqDefault";

vi.mock("@/contexts/SessionContext", () => ({
  useSession: () => ({ session: { location: null } }),
}));

vi.mock("@/hooks/useInternalNav", () => ({
  useInternalNav: () => () => {},
}));

vi.mock("wouter", () => ({
  useLocation: () => ["/en/test", vi.fn()],
}));

const editModeMock = vi.hoisted(() => ({
  isEditMode: false,
}));

vi.mock("@/contexts/EditModeContext", () => ({
  useEditModeOptional: () => editModeMock,
}));

describe("FAQSection empty state", () => {
  it("renders nothing when empty and not in edit mode", () => {
    editModeMock.isEditMode = false;
    const html = renderToStaticMarkup(
      <FAQSection data={{ type: "faq", title: "FAQ", items: [] } as never} />,
    );
    expect(html).toBe("");
  });

  it("shows edit placeholder when empty in edit mode", () => {
    editModeMock.isEditMode = true;
    const html = renderToStaticMarkup(
      <FAQSection data={{ type: "faq", title: "FAQ", items: [] } as never} />,
    );
    expect(html).toContain("section-faq-empty-edit");
    expect(html).toContain("no results");
    expect(html).toContain("hidden on the live page");
  });

  it("does not crash when hardcoded_entries is an unresolved template string", () => {
    editModeMock.isEditMode = false;
    const html = renderToStaticMarkup(
      <FAQSection
        data={
          {
            type: "faq",
            title: "FAQ",
            hardcoded_entries: "{{ single.faq_entries | [] }}",
          } as never
        }
      />,
    );
    expect(html).toBe("");
  });

  it("renders resolved faq_entries arrays from hardcoded_entries", () => {
    editModeMock.isEditMode = false;
    const html = renderToStaticMarkup(
      <FAQSection
        data={
          {
            type: "faq",
            title: "FAQ",
            hardcoded_entries: [{ question: "Why?", answer: "Because." }],
          } as never
        }
      />,
    );
    expect(html).toContain("Why?");
    expect(html).toContain("accordion-faq-0");
  });

  it("prepends hardcoded entries missing from DB items", () => {
    editModeMock.isEditMode = false;
    const html = renderToStaticMarkup(
      <FAQSection
        data={
          {
            type: "faq",
            title: "FAQ",
            items: [{ question: "From DB?", answer: "Yes." }],
            hardcoded_entries: [{ question: "From entry?", answer: "Also yes." }],
          } as never
        }
      />,
    );
    expect(html).toContain("From entry?");
    expect(html).toContain("From DB?");
  });

  it("respects dynamic_entries.limit after merging hardcoded + items", () => {
    editModeMock.isEditMode = false;
    const html = renderToStaticMarkup(
      <FAQSection
        data={
          {
            type: "faq",
            title: "FAQ",
            dynamic_entries: { limit: 2 },
            items: [
              { question: "Q1?", answer: "A1" },
              { question: "Q2?", answer: "A2" },
              { question: "Q3?", answer: "A3" },
            ],
            hardcoded_entries: [
              { question: "Extra?", answer: "Should not appear if items already full" },
            ],
          } as never
        }
      />,
    );
    expect(html).toContain("Extra?");
    expect(html).toContain("Q1?");
    expect(html).not.toContain("Q2?");
    expect(html).not.toContain("Q3?");
  });
});
