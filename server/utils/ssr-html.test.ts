import { describe, expect, it } from "vitest";
import { isMeaningfulSsrAppHtml } from "./ssr-html";

describe("isMeaningfulSsrAppHtml", () => {
  it("rejects empty and whitespace", () => {
    expect(isMeaningfulSsrAppHtml("")).toBe(false);
    expect(isMeaningfulSsrAppHtml("   \n  ")).toBe(false);
    expect(isMeaningfulSsrAppHtml(null)).toBe(false);
    expect(isMeaningfulSsrAppHtml("<!-- comment only -->")).toBe(false);
  });

  it("accepts markup with tags", () => {
    expect(
      isMeaningfulSsrAppHtml('<div data-section-type="hero"><h1>Title</h1></div>'),
    ).toBe(true);
  });
});
