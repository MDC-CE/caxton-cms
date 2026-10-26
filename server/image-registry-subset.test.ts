import { describe, expect, it } from "vitest";
import {
  DEFAULT_NAVBAR_LOGO_ID,
  buildPageImageRegistrySubset,
  createEmptyImageRefs,
  extractBrandLogoRefsFromVariables,
  extractImageRefsFromValue,
} from "./image-registry-subset";
import { applyLogoStructureFromMaster } from "./menu-logo-structure";

describe("extractImageRefsFromValue — Logo runtime fallbacks", () => {
  it("includes explicit imageId, imageIdDark, and hardcoded fallback for Logo items", () => {
    const refs = createEmptyImageRefs();
    extractImageRefsFromValue(
      {
        navbar: {
          items: [
            {
              component: "Logo",
              imageId: "4geeks-logo-big",
              imageIdDark: "logo-dark-id",
            },
          ],
        },
      },
      refs,
    );
    expect(refs.ids.has("4geeks-logo-big")).toBe(true);
    expect(refs.ids.has("logo-dark-id")).toBe(true);
    expect(refs.ids.has(DEFAULT_NAVBAR_LOGO_ID)).toBe(true);
  });

  it("still seeds hardcoded fallback when Logo omits imageId (Spanish menu case)", () => {
    const refs = createEmptyImageRefs();
    extractImageRefsFromValue(
      {
        data: {
          navbar: {
            items: [{ component: "Logo", href: "/" }],
          },
        },
      },
      refs,
    );
    expect(refs.ids.has(DEFAULT_NAVBAR_LOGO_ID)).toBe(true);
  });

  it("collects collage image_id keys", () => {
    const refs = createEmptyImageRefs();
    extractImageRefsFromValue(
      {
        sections: [
          {
            type: "graduates_stats",
            collage_images: [
              { image_id: "graduates_team_1" },
              { image_id: "graduates_coding" },
            ],
          },
        ],
      },
      refs,
    );
    expect(refs.ids.has("graduates_team_1")).toBe(true);
    expect(refs.ids.has("graduates_coding")).toBe(true);
  });

  it("collects blogHero / simpleTwoColumn image.src registry ids", () => {
    const refs = createEmptyImageRefs();
    extractImageRefsFromValue(
      {
        sections: [
          {
            type: "hero",
            variant: "blogHero",
            image: { src: "ce-step-choose", alt: "Advisor and student" },
          },
          {
            type: "hero",
            variant: "simpleTwoColumn",
            image: "ce-hero-evening",
          },
        ],
      },
      refs,
    );
    expect(refs.ids.has("ce-step-choose")).toBe(true);
    expect(refs.ids.has("ce-hero-evening")).toBe(true);
  });
});

describe("extractBrandLogoRefsFromVariables", () => {
  it("seeds brand.logo, brand.logo_dark, and hardcoded fallback", () => {
    const refs = createEmptyImageRefs();
    extractBrandLogoRefsFromVariables(
      {
        "brand.logo": { default: "brand-light" },
        "brand.logo_dark": { default: "brand-dark" },
      },
      refs,
    );
    expect(refs.ids.has("brand-light")).toBe(true);
    expect(refs.ids.has("brand-dark")).toBe(true);
    expect(refs.ids.has(DEFAULT_NAVBAR_LOGO_ID)).toBe(true);
  });
});

describe("buildPageImageRegistrySubset", () => {
  const fullRegistry = {
    presets: { card: { widths: [400] } },
    images: {
      "4geeks-logo-big": { src: "/images/logo-big.webp", alt: "Logo" },
      [DEFAULT_NAVBAR_LOGO_ID]: { src: "/images/logo-fallback.webp", alt: "Fallback" },
      graduates_team_1: { src: "/images/g1.webp", alt: "G1" },
      "unused-image": { src: "/images/unused.webp", alt: "Unused" },
    },
  };

  it("includes English menu imageId and Logo fallback for Spanish-only landing shape", () => {
    const pageData = {
      locale: "es",
      sections: [
        {
          type: "graduates_stats",
          collage_images: [{ image_id: "graduates_team_1" }],
        },
      ],
    };
    // English navbar (URL-inferred) + Spanish navbar without imageId (content locale)
    const menuDatas = [
      {
        name: "main-navbar",
        locale: "en",
        data: {
          navbar: {
            items: [{ component: "Logo", imageId: "4geeks-logo-big" }],
          },
        },
      },
      {
        name: "main-navbar",
        locale: "es",
        data: {
          navbar: {
            items: [{ component: "Logo" }],
          },
        },
      },
    ];

    const subset = buildPageImageRegistrySubset(fullRegistry, pageData, menuDatas, {
      variables: { "brand.logo": { default: "" } },
    });

    expect(subset.images["4geeks-logo-big"]).toBeTruthy();
    expect(subset.images[DEFAULT_NAVBAR_LOGO_ID]).toBeTruthy();
    expect(subset.images.graduates_team_1).toBeTruthy();
    expect(subset.images["unused-image"]).toBeUndefined();
    expect(subset.presets).toEqual(fullRegistry.presets);
  });
});

describe("applyLogoStructureFromMaster", () => {
  it("copies imageId, imageIdDark, and imageAlt from master", () => {
    const master = {
      label: "Logo",
      href: "/",
      component: "Logo",
      imageId: "4geeks-logo-big",
      imageIdDark: "logo-dark",
      imageAlt: "Brand",
    };
    const target: Record<string, unknown> = {
      label: "Logo ES",
      href: "/",
      component: "Logo",
    };
    applyLogoStructureFromMaster(master, target);
    expect(target.imageId).toBe("4geeks-logo-big");
    expect(target.imageIdDark).toBe("logo-dark");
    expect(target.imageAlt).toBe("Brand");
  });

  it("does not invent imageId when master has none", () => {
    const master = { label: "Logo", href: "/", component: "Logo" };
    const target: Record<string, unknown> = { label: "Logo ES" };
    applyLogoStructureFromMaster(master, target);
    expect(target.imageId).toBeUndefined();
  });
});
