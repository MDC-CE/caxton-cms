import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";
import {
  evaluatePageTextLimits,
  evaluateSectionTextLimits,
  rulesForVariant,
  visibleLength,
  visibleText,
  type TextLimitsByVariant,
} from "./component-text-limits";

// MDC keeps platform section schemas under site_* (shared/component-registry is empty).
const heroSchema = yaml.load(
  fs.readFileSync(
    path.join(__dirname, "../site_learning-mdc-edu/component-registry/hero/v1.0/schema.yml"),
    "utf8",
  ),
) as { text_limits: TextLimitsByVariant };
const RULES = rulesForVariant(heroSchema.text_limits, "productShowcase");

const liked = {
  type: "hero",
  variant: "productShowcase",
  title: "<br><!--EndFragment-->",
  brand_mark: {
    prefix:
      "<!--StartFragment-->Conviértete en&nbsp; Ingeniero de IA.<!--EndFragment--><!--EndFragment-->",
    highlight: "La profesión que más crece en 2026.&nbsp;<!--EndFragment--><!--EndFragment-->",
  },
};

const careerCeiling = {
  type: "hero",
  variant: "productShowcase",
  brand_mark: { prefix: "Break Your Career", highlight: "Ceiling." },
  title: "Become an AI Engineer. With the Best Career Support in Tech.",
  description:
    "81% of our graduates get hired. AI Engineering is the fastest-growing job of 2026: 1.3M new roles, 42× growth since 2023. We get you the job.",
  bullets: [
    { text: "Learn to build complete AI-native systems — exactly what companies are actively hiring for" },
    {
      text: "Unlimited career support: resume building, interview practice, employer network, and coaching that continues for life",
    },
    { text: "Optional Job Guarantee: get hired within 9 months or we refund your full tuition" },
  ],
};

function check(section: Record<string, unknown>, before?: Record<string, unknown>) {
  return evaluateSectionTextLimits({ section, rules: RULES, sectionPath: "sections[0]", before });
}

describe("visibleText", () => {
  it("strips editor HTML, comments and entities", () => {
    expect(visibleText(liked.brand_mark.prefix)).toBe("Conviértete en Ingeniero de IA.");
    expect(visibleText("<b>A</b>&amp;<span>B</span>&#160;C<br/>D")).toBe("A&B C D");
    expect(visibleText(undefined)).toBe("");
  });
  it("counts code points", () => {
    expect(visibleLength("más 42×")).toBe(7);
  });
});

describe("hero productShowcase text_limits", () => {
  it("loads the schema rules for productShowcase only", () => {
    expect(RULES.map((r) => r.label)).toContain("H1 + H2");
    expect(rulesForVariant(heroSchema.text_limits, "singleColumn")).toEqual([]);
  });

  it("accepts the liked Spanish headline (~67 visible chars)", () => {
    expect(check(liked)).toEqual([]);
  });

  it("accepts the Career Ceiling hero (the agreed ceiling)", () => {
    expect(check(careerCeiling)).toEqual([]);
  });

  it("rejects an H1 over 70 with the exact fields and count", () => {
    const long = {
      ...liked,
      brand_mark: {
        prefix: "Conviértete en Ingeniero de Inteligencia Artificial en solo seis meses.",
        highlight: "La profesión que más crece.",
      },
    };
    const v = check(long);
    const h1 = v.find((x) => x.label === "H1");
    expect(h1?.max).toBe(70);
    expect(h1?.actual).toBeGreaterThan(70);
    expect(h1?.fields).toEqual(["brand_mark.prefix", "brand_mark.highlight", "brand_mark.suffix"]);
    expect(h1?.message).toContain("sections[0]");
  });

  it("rejects H1 + H2 over 90 even when each fits alone", () => {
    const v = check({
      type: "hero",
      variant: "productShowcase",
      brand_mark: { prefix: "Launch Your Tech Career in Artificial", highlight: "Intelligence." },
      title: "Get Hired Within Nine Months, Or Get Your Tuition Back.",
    });
    expect(v.map((x) => x.label)).toEqual(["H1 + H2"]);
  });

  it("caps bullets at 4 items and 120 chars each", () => {
    const v = check({
      ...careerCeiling,
      bullets: [...careerCeiling.bullets, { text: "Four" }, { text: "x".repeat(121) }],
    });
    expect(v.find((x) => x.kind === "items")?.actual).toBe(5);
    expect(v.find((x) => x.fields[0] === "bullets.4.text")?.actual).toBe(121);
  });

  it("with before: unchanged over-limit text is not reported, changed text is", () => {
    const long = { ...careerCeiling, description: "y".repeat(200) };
    expect(check({ ...long, bullets: [{ text: "new bullet" }] }, long)).toEqual([]);
    expect(check({ ...long, description: "z".repeat(200) }, long).map((x) => x.label)).toEqual([
      "Description",
    ]);
  });

  it("an existing long bullet stays quiet when another bullet is edited", () => {
    const before = { ...careerCeiling, bullets: [{ text: "b".repeat(140) }, { text: "short" }] };
    const after = { ...careerCeiling, bullets: [{ text: "b".repeat(140) }, { text: "edited" }] };
    expect(check(after, before)).toEqual([]);
  });
});

describe("evaluatePageTextLimits", () => {
  const resolveRules = (s: Record<string, unknown>) =>
    s.type === "hero" ? rulesForVariant(heroSchema.text_limits, s.variant) : [];

  it("reports only sections with rules and uses sections[n] paths", () => {
    const page = {
      sections: [
        { type: "article", content: "x".repeat(500) },
        { ...careerCeiling, description: "d".repeat(181) },
      ],
    };
    const v = evaluatePageTextLimits(page, { resolveRules });
    expect(v).toHaveLength(1);
    expect(v[0]!.section_path).toBe("sections[1]");
  });

  it("matches before sections by section_id when order changed", () => {
    const hero = { ...careerCeiling, section_id: "hero-1", description: "d".repeat(181) };
    const before = { sections: [hero, { type: "article" }] };
    const after = { sections: [{ type: "article" }, hero] };
    expect(evaluatePageTextLimits(after, { resolveRules, before })).toEqual([]);
  });

  it("a brand-new section is always checked", () => {
    const before = { sections: [{ type: "article" }] };
    const after = { sections: [{ type: "article" }, { ...careerCeiling, description: "d".repeat(181) }] };
    expect(evaluatePageTextLimits(after, { resolveRules, before })).toHaveLength(1);
  });
});
