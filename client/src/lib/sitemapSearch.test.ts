import { describe, expect, it } from "vitest";
import {
  dedupeByContentEntry,
  dedupeSitemapEntries,
  filterSitemapEntries,
  sitemapContentEntryKey,
  sitemapEntryKey,
  sitemapMatchScore,
  sitemapPathname,
  suggestedSitemapLocale,
  type SitemapSearchEntry,
} from "./sitemapSearch";

function entry(
  loc: string,
  label: string,
  extra: Partial<SitemapSearchEntry> = {},
): SitemapSearchEntry {
  return { loc, label, ...extra };
}

const duplicateLandings: SitemapSearchEntry[] = [
  entry(
    "https://4geeks.com/landing/ai-engineering-program-ad-es",
    "Landing: AI Engineering Program (ES)",
    { slug: "ai-engineering", content_type: "landing", locale: "es" },
  ),
  entry(
    "https://4geeks.com/landing/ai-engineering-program-ad-es",
    "Landing: AI Engineering Program (ES)",
    { slug: "ai-egineer-program-ad-costarica", content_type: "landing", locale: "es" },
  ),
  entry(
    "https://4geeks.com/landing/ai-engineering-program-ad-es",
    "Landing: AI Engineering Program (ES)",
    { slug: "ai-engineering-program-ad-co", content_type: "landing", locale: "es" },
  ),
];

const programComparison = entry(
  "https://4geeks.com/en/program-comparison",
  "Page: Program Comparison | 4Geeks (EN)",
  { slug: "program-comparison", content_type: "page", locale: "en" },
);

const aiEngineerBlog = entry(
  "https://4geeks.com/en/blog/ai-powered-learning/ai-engineer",
  "Blog: AI Engineer: What They Do, Skills & Salary in 2026 (EN)",
  { slug: "ai-engineer", content_type: "blog", locale: "en" },
);

const comparisonBlog = entry(
  "https://4geeks.com/en/blog/ai-tools/best-ai-coding-agents",
  "Blog: Best AI Coding Agents Comparison (EN)",
  { slug: "best-ai-coding-agents", content_type: "blog", locale: "en" },
);

describe("sitemapPathname", () => {
  it("strips origin, query, and hash", () => {
    expect(sitemapPathname("https://4geeks.com/en/program-comparison?ref=x#top")).toBe(
      "/en/program-comparison",
    );
  });

  it("passes through a path that is not an absolute URL", () => {
    expect(sitemapPathname("/landing/ai-engineering-program-ad-es")).toBe(
      "/landing/ai-engineering-program-ad-es",
    );
  });
});

describe("dedupeSitemapEntries", () => {
  it("keeps the first row for a shared pathname", () => {
    const deduped = dedupeSitemapEntries(duplicateLandings);
    expect(deduped).toHaveLength(1);
    expect(deduped[0].slug).toBe("ai-engineering");
  });
});

describe("dedupeByContentEntry", () => {
  it("keeps one row per content_type + slug across locales", () => {
    const rows: SitemapSearchEntry[] = [
      entry("https://4geeks.com/us/coding-bootcamp", "Full Stack (EN)", {
        content_type: "program",
        slug: "full-stack",
        locale: "en",
      }),
      entry("https://4geeks.com/es/coding-bootcamp", "Full Stack (ES)", {
        content_type: "program",
        slug: "full-stack",
        locale: "es",
      }),
      entry("https://4geeks.com/us/data-science", "Data Science", {
        content_type: "program",
        slug: "data-science",
        locale: "en",
      }),
    ];
    const deduped = dedupeByContentEntry(rows);
    expect(deduped).toHaveLength(2);
    expect(deduped.map((e) => sitemapContentEntryKey(e))).toEqual([
      "program/full-stack",
      "program/data-science",
    ]);
    expect(deduped[0].locale).toBe("en");
  });

  it("drops rows missing content_type or slug", () => {
    const rows: SitemapSearchEntry[] = [
      entry("https://4geeks.com/us/x", "No type", { slug: "x", locale: "en" }),
      entry("https://4geeks.com/us/y", "No slug", { content_type: "program", locale: "en" }),
      entry("https://4geeks.com/us/z", "Ok", {
        content_type: "program",
        slug: "z",
        locale: "en",
      }),
    ];
    expect(dedupeByContentEntry(rows)).toHaveLength(1);
    expect(sitemapContentEntryKey(rows[2])).toBe("program/z");
  });
});

describe("filterSitemapEntries", () => {
  const catalog = [
    ...duplicateLandings,
    programComparison,
    aiEngineerBlog,
    comparisonBlog,
  ];

  it("dedupes when the query is empty", () => {
    const rows = filterSitemapEntries(catalog, "  ");
    expect(rows.filter((e) => sitemapPathname(e.loc) === "/landing/ai-engineering-program-ad-es")).toHaveLength(1);
  });

  it("does not return pages whose visible path and title lack the query", () => {
    const rows = filterSitemapEntries(catalog, "comparison");
    const paths = rows.map((e) => sitemapPathname(e.loc));
    expect(paths).not.toContain("/landing/ai-engineering-program-ad-es");
    expect(paths).not.toContain("/en/blog/ai-powered-learning/ai-engineer");
  });

  it("ranks a path/title token match above a weaker label match", () => {
    const rows = filterSitemapEntries(catalog, "comparison");
    expect(sitemapPathname(rows[0].loc)).toBe("/en/program-comparison");
    expect(rows.map((e) => sitemapPathname(e.loc))).toContain(
      "/en/blog/ai-tools/best-ai-coding-agents",
    );
  });

  it("does not match on hostname or other loc origin text", () => {
    const rows = filterSitemapEntries(catalog, "4geeks.com");
    expect(rows).toHaveLength(0);
  });

  it("does not match a hidden folder slug that is missing from path and title", () => {
    const rows = filterSitemapEntries(duplicateLandings, "costarica");
    expect(rows).toHaveLength(0);
  });

  it("excludes paths and seo-index member ids", () => {
    const rows = filterSitemapEntries(catalog, "", {
      excludePaths: ["/en/program-comparison"],
      excludeIds: ["blog/ai-engineer/en"],
    });
    const paths = rows.map((e) => sitemapPathname(e.loc));
    expect(paths).not.toContain("/en/program-comparison");
    expect(paths).not.toContain("/en/blog/ai-powered-learning/ai-engineer");
    expect(paths.length).toBeGreaterThan(0);
  });
});

describe("sitemapMatchScore", () => {
  it("scores an exact last-segment match highest", () => {
    const exact = sitemapMatchScore(programComparison, "program-comparison");
    const token = sitemapMatchScore(programComparison, "comparison");
    expect(exact).toBeGreaterThan(token);
    expect(token).toBeGreaterThan(0);
  });
});

describe("sitemapEntryKey", () => {
  it("differs for cloned landings that share loc", () => {
    expect(sitemapEntryKey(duplicateLandings[0])).not.toBe(sitemapEntryKey(duplicateLandings[1]));
  });
});

describe("suggestedSitemapLocale", () => {
  it("suggests es from an /es/ origin", () => {
    expect(suggestedSitemapLocale("/es/old-page")).toBe("es");
    expect(suggestedSitemapLocale("/es/old-path/(.*)")).toBe("es");
  });

  it("suggests en from /en/ and from 4geeks /us/ English paths", () => {
    expect(suggestedSitemapLocale("/en/old-page")).toBe("en");
    expect(suggestedSitemapLocale("/us/coding-bootcamp")).toBe("en");
    expect(suggestedSitemapLocale("/us/old-path/(.*)")).toBe("en");
  });

  it("returns all-locales when there is no locale prefix", () => {
    expect(suggestedSitemapLocale("/old-page")).toBe("");
    expect(suggestedSitemapLocale("/blog/(.*)")).toBe("");
    expect(suggestedSitemapLocale("")).toBe("");
  });
});
