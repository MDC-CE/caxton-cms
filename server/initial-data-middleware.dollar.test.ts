import { describe, expect, it } from "vitest";
import { injectSsrMetaTags, type InitialDataPayload } from "./initial-data-middleware";

function shell(): string {
  return [
    "<!DOCTYPE html>",
    '<html lang="en"><head>',
    "<title>Default</title>",
    '<meta name="description" content="Default" />',
    '<meta property="og:title" content="Default" />',
    '<meta property="og:description" content="Default" />',
    '<meta name="twitter:title" content="Default" />',
    '<meta name="twitter:description" content="Default" />',
    '<meta property="og:image" content="https://example.com/default.png" />',
    "</head><body></body></html>",
  ].join("\n");
}

function pagePayload(meta: Record<string, unknown>): InitialDataPayload {
  return {
    locale: "en",
    queries: [
      {
        queryKey: ["/api/content-pages/page", "pricing", "en"],
        data: { locale: "en", slug: "pricing", meta },
      },
    ],
  };
}

describe("injectSsrMetaTags with `$` in content", () => {
  it("keeps $95K–$135K intact in description tags", () => {
    const description =
      "Become an AI engineer in 24 weeks. 84% hire rate, $95K–$135K range, and lifetime mentorship.";
    const html = injectSsrMetaTags(shell(), pagePayload({ description }), undefined, "/landing/pricing");
    expect(html).toContain(`<meta name="description" content="${description}" />`);
    expect(html).toContain(`<meta property="og:description" content="${description}" />`);
    expect(html).toContain(`<meta name="twitter:description" content="${description}" />`);
    expect(html).not.toMatch(/content="[^"]*<meta/);
  });

  it("keeps $135,980 / $214,670 intact (the `$2` case)", () => {
    const description = "$135,980 median and top 10% above $214,670. Why salary sites disagree.";
    const html = injectSsrMetaTags(shell(), pagePayload({ description }), undefined, "/en/blog/x");
    expect(html).toContain(`<meta name="description" content="${description}" />`);
  });

  it("writes og:title, twitter:title and <title> literally", () => {
    const pageTitle = `AI Engineer Salaries: $1 $2 $& $\` $' $$ "2026"`;
    const escaped = `AI Engineer Salaries: $1 $2 $&amp; $\` $' $$ &quot;2026&quot;`;
    const html = injectSsrMetaTags(shell(), pagePayload({ page_title: pageTitle }), undefined, "/x");
    expect(html).toContain(`<title>${escaped}</title>`);
    expect(html).toContain(`<meta property="og:title" content="${escaped}" />`);
    expect(html).toContain(`<meta name="twitter:title" content="${escaped}" />`);
    expect(html.match(/<!DOCTYPE html>/g)?.length).toBe(1);
  });

  it("writes og:image with `$` literally", () => {
    const ogImage = "https://cdn.example.com/og/$1-$&.png";
    const html = injectSsrMetaTags(
      shell(),
      pagePayload({ og_image: ogImage }),
      undefined,
      "/x",
    );
    expect(html).toContain(`<meta property="og:image" content="https://cdn.example.com/og/$1-$&amp;.png" />`);
  });
});
