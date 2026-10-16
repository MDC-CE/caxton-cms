import { describe, expect, it } from "vitest";
import { collectVisibleContent } from "./sectionYamlContentFields";

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
});
