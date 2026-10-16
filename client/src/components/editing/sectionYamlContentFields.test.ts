import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import yaml from "js-yaml";
import { collectVisibleContent, contentGaps } from "./sectionYamlContentFields";
import { fieldEditors as mosaicEditors } from "../../../../site_learning-mdc-edu/component-registry/mosaic_hero/v1.0/field-editors";
import { fieldEditors as profileEditors } from "../../../../site_learning-mdc-edu/component-registry/bullet_tabs_showcase/v1.0/field-editors";
import { fieldEditors as twoColumnEditors } from "../../../../site_learning-mdc-edu/component-registry/two_column/v1.0/field-editors";
import { fieldEditors as programsEditors } from "../../../../site_learning-mdc-edu/component-registry/programs_showcase/v1.0/field-editors";
import { fieldEditors as featuresEditors } from "../../../../site_learning-mdc-edu/component-registry/features_grid/v1.0/field-editors";
import { fieldEditors as bentoEditors } from "../../../../site_learning-mdc-edu/component-registry/bento_cards/v1.0/field-editors";
import { fieldEditors as stepsEditors } from "../../../../site_learning-mdc-edu/component-registry/numbered_steps/v1.0/field-editors";
import { fieldEditors as graduatesEditors } from "../../../../site_learning-mdc-edu/component-registry/graduates_stats/v1.0/field-editors";
import { fieldEditors as ctaEditors } from "../../../../site_learning-mdc-edu/component-registry/cta_banner/v1.0/field-editors";
import { fieldEditors as modalEditors } from "../../../../site_learning-mdc-edu/component-registry/modal/v1.0/field-editors";

const photoTimeline = {
  type: "numbered_steps",
  variant: "photoTimeline",
  background: "muted",
  eyebrow: "Cómo certificarte",
  title: "Tres pasos desde donde estás ahora",
  button_style: "solid",
  frame: "line",
  radius: "md",
  image_id: "ce-advisors-tablet",
  image_alt: "Asesor ayudando a un estudiante",
  photos: [
    { image_id: "ce-advisor", image_alt: "Elige un programa", alt: "dup", id: "ce-advisor" },
    { image_id: "ai-1", image_alt: "Inscríbete", alt: "dup", id: "ai-1" },
  ],
  rotate_seconds: 4,
  cta: { text: "Hablar con un asesor", url: "#advisor-modal", variant: "primary" },
  steps: [
    { icon: "Compass", title: "Elige un programa", text: "Un asesor te ayuda." },
    { icon: "ClipboardCheck", title: "Inscríbete y fínancialo", text: "Regístrate en línea." },
  ],
  section_id: "mockup-steps",
  paddingY: { desktop: "md" },
};

const configured = {
  image_id: "image-picker",
  "photos[].image_id": "image-picker",
  "cta.url": "link-picker",
  frame: "string-picker:none,line,glow",
  radius: "string-picker:none,sm,md,lg,full",
  button_style: "string-picker:solid,outline,ghost",
  "steps[].icon": "icon-picker",
};

const editorsByType: Record<string, Record<string, string>> = {
  mosaic_hero: mosaicEditors,
  bullet_tabs_showcase: profileEditors,
  two_column: twoColumnEditors,
  programs_showcase: programsEditors,
  features_grid: featuresEditors,
  bento_cards: bentoEditors,
  numbered_steps: stepsEditors,
  graduates_stats: graduatesEditors,
  cta_banner: ctaEditors,
  modal: modalEditors,
};

function editorsForVariant(type: string, variant: string) {
  const raw = editorsByType[type] || {};
  const result: Record<string, string> = {};
  for (const [fieldPath, editorType] of Object.entries(raw)) {
    const colon = fieldPath.indexOf(":");
    if (colon > 0 && !fieldPath.startsWith("color-picker:")) {
      const prefix = fieldPath.slice(0, colon);
      if (prefix === variant) result[fieldPath.slice(colon + 1)] = editorType;
    } else {
      result[fieldPath] = editorType;
    }
  }
  return result;
}

describe("collectVisibleContent", () => {
  it("shows the copy and button text that have no dedicated control", () => {
    const fields = collectVisibleContent(photoTimeline, configured);
    const paths = fields.map((field) => field.path);
    expect(paths).toContain("eyebrow");
    expect(paths).toContain("title");
    expect(paths).toContain("image_alt");
    expect(paths).toContain("rotate_seconds");
    expect(paths).toContain("cta");
    expect(paths).not.toContain("photos");
    expect(paths).not.toContain("steps");
    expect(paths).not.toContain("background");
    expect(paths).not.toContain("paddingY");

    const cta = fields.find((field) => field.kind === "group" && field.path === "cta");
    expect(cta && cta.kind === "group" ? cta.fields.map((field) => field.path) : []).toEqual([
      "cta.text",
      "cta.variant",
    ]);
  });

  it("lists each step's title and text when the icon is the only dedicated control and grouping is off", () => {
    const fields = collectVisibleContent(photoTimeline, {
      ...configured,
      "steps[].icon": "image-with-style-picker",
    });
    const steps = fields.find((field) => field.kind === "array" && field.path === "steps");
    expect(steps && steps.kind === "array" ? steps.items : []).toHaveLength(2);
    const first = steps && steps.kind === "array" ? steps.items[0].fields.map((field) => field.path) : [];
    expect(first).toEqual(["title", "text"]);
  });

  it("gives every saved field on the home draft a Props control", () => {
    const gaps: string[] = [];
    for (const name of ["draft.es.yml", "draft.en.yml"]) {
      const file = path.resolve(process.cwd(), "site_learning-mdc-edu/pages/home", name);
      const doc = yaml.load(fs.readFileSync(file, "utf8")) as { sections: Record<string, unknown>[] };
      for (const section of doc.sections) {
        const type = String(section.type);
        const variant = String(section.variant || "default");
        const missing = contentGaps(section, editorsForVariant(type, variant));
        if (missing.length) gaps.push(`${name} ${type}/${variant}: ${missing.join(", ")}`);
      }
    }
    expect(gaps).toEqual([]);
  });
});
