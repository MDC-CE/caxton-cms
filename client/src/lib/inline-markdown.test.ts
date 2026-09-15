import { describe, expect, it } from "vitest";
import { inlineMarkdownToHtml } from "./inline-markdown";

describe("inlineMarkdownToHtml", () => {
  it("returns empty string for empty input", () => {
    expect(inlineMarkdownToHtml("")).toBe("");
  });

  it("passes through plain text unchanged (except escaping)", () => {
    expect(inlineMarkdownToHtml("Hello world")).toBe("Hello world");
  });

  it("converts markdown links — internal paths without target=_blank", () => {
    expect(inlineMarkdownToHtml("See [apply](/es/apply) now")).toBe(
      'See <a href="/es/apply">apply</a> now',
    );
  });

  it("converts markdown links — absolute URLs open in a new tab", () => {
    expect(inlineMarkdownToHtml("Visit [docs](https://example.com/docs)")).toBe(
      'Visit <a href="https://example.com/docs" target="_blank" rel="noopener noreferrer">docs</a>',
    );
  });

  it("converts newlines to br", () => {
    expect(inlineMarkdownToHtml("line one\nline two")).toBe("line one<br>line two");
  });

  it("converts bold and italic", () => {
    expect(inlineMarkdownToHtml("**bold** and *italic*")).toBe(
      "<strong>bold</strong> and <em>italic</em>",
    );
  });

  it("passes HTML from the rich-text editor through unchanged", () => {
    const html = '<p>Hello <a href="/x">link</a></p>';
    expect(inlineMarkdownToHtml(html)).toBe(html);
  });

  it("passes through mid-string authored <a> tags without escaping them", () => {
    const html =
      'Ver <a href="/es/blog/x">reglamento</a> y <a href="/es/blog/y">más</a>.';
    expect(inlineMarkdownToHtml(html)).toBe(html);
  });

  it("escapes script tags in the markdown path (XSS)", () => {
    const out = inlineMarkdownToHtml('<script>alert("x")</script>');
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
  });

  it("does not turn javascript: urls into links", () => {
    const out = inlineMarkdownToHtml("[x](javascript:alert(1))");
    expect(out).not.toContain("<a");
    expect(out).toContain("[x](javascript:alert(1))");
  });
});
