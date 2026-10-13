/**
 * Outer section padding that used to be hardcoded in variant files and now lives
 * in each section's `paddingY` (wrapper-owned spacing, see SectionRenderer).
 *
 * Values are px per breakpoint. The section wrapper switches at 768px (`md`), so
 * a base class maps to `mobile` and the largest-screen class maps to `desktop`.
 *
 * `bg`: how the variant root painted `data.background` around that padding.
 *  - "class": root used `data.background` (or `defaultBg`) as a Tailwind class. Theme IDs
 *    were a no-op there (the wrapper paints them); `bg-*` classes were painted by the root,
 *    so they must become a wrapper background to keep covering the moved padding.
 *  - "style" / "none": the wrapper already paints the same background (or there is none).
 */

export type Box = { top: number; bottom: number };

export type PaddingInventoryEntry = {
  file: string;
  renderedAs: Array<{ type: string; variant: string }>;
  mobile: Box;
  desktop: Box;
  bg: "class" | "style" | "none";
  defaultBg?: string;
  /** Applies only when this returns true for the section's props. */
  when?: (section: Record<string, unknown>) => boolean;
  /** Alternative padding when `when` is false (same component, other branch). */
  otherwise?: { mobile: Box; desktop: Box };
  note?: string;
};

const both = (top: number, bottom: number) => ({ mobile: { top, bottom }, desktop: { top, bottom } });
const split = (m: number, d: number) => ({ mobile: { top: m, bottom: m }, desktop: { top: d, bottom: d } });

export const PADDING_INVENTORY: PaddingInventoryEntry[] = [
  ...["courseColorSelector", "default", "dragAndDrop", "simplified"].map((variant) => ({
    file: `client/src/components/ai_flex_path/variants/AiFlexPath${variant === "default" ? "Default" : variant[0].toUpperCase() + variant.slice(1)}.tsx`,
    renderedAs: [{ type: "ai_flex_path", variant }],
    ...both(0, 64),
    bg: "none" as const,
  })),
  {
    file: "client/src/components/ai_flex_selector/variants/AiFlexSelectorDefault.tsx",
    renderedAs: [{ type: "ai_flex_selector", variant: "default" }],
    ...both(48, 64),
    bg: "none",
    note: "Root min-height reduced by the moved 112px so the section keeps its total height.",
  },
  {
    file: "client/src/components/article/variants/ArticleDefault.tsx",
    renderedAs: [{ type: "article", variant: "default" }],
    ...both(32, 32),
    bg: "none",
  },
  {
    file: "client/src/components/banner/variants/BannerDefault.tsx",
    renderedAs: [{ type: "banner", variant: "default" }],
    ...split(48, 64),
    bg: "none",
  },
  {
    file: "client/src/components/bento_cards/variants/BentoCardsDefault.tsx",
    renderedAs: [{ type: "bento_cards", variant: "default" }],
    ...split(64, 96),
    bg: "class",
    note: "overflow-hidden became overflow-x-clip so card shadows still show in the moved padding.",
  },
  {
    file: "client/src/components/career_support_explain/variants/CareerSupportExplainDefault.tsx",
    renderedAs: [{ type: "career_support_explain", variant: "default" }],
    ...split(48, 64),
    bg: "style",
  },
  {
    file: "client/src/components/community_support/variants/CommunitySupportDefault.tsx",
    renderedAs: [{ type: "community_support", variant: "default" }],
    ...both(56, 56),
    bg: "class",
    defaultBg: "bg-background",
  },
  ...["default", "solid", "spotlight"].map((variant) => ({
    file: `client/src/components/course_selector/variants/CourseSelector${variant[0].toUpperCase() + variant.slice(1)}.tsx`,
    renderedAs: [{ type: "course_selector", variant }],
    ...split(48, 64),
    bg: "none" as const,
  })),
  {
    file: "client/src/components/double_cta/variants/DoubleCTADefault.tsx",
    renderedAs: [{ type: "double_cta", variant: "default" }],
    ...split(48, 64),
    bg: "none",
  },
  {
    file: "client/src/components/dynamic_table/variants/DynamicTableDefault.tsx",
    renderedAs: [{ type: "dynamic_table", variant: "default" }],
    ...both(48, 48),
    bg: "style",
  },
  {
    file: "client/src/components/faq_editor/variants/FaqEditorDefault.tsx",
    renderedAs: [{ type: "faq_editor", variant: "default" }],
    ...both(48, 48),
    bg: "none",
  },
  {
    file: "client/src/components/features_grid/variants/FeaturesGridCardHeader.tsx",
    renderedAs: [{ type: "features_grid", variant: "cardHeader" }],
    ...both(56, 56),
    bg: "class",
    defaultBg: "bg-background",
  },
  {
    file: "client/src/components/features_grid/variants/FeaturesGridHighlight.tsx",
    renderedAs: [{ type: "features_grid", variant: "highlight" }],
    ...both(56, 56),
    bg: "class",
  },
  {
    file: "client/src/components/features_grid/variants/FeaturesGridStatsCards.tsx",
    renderedAs: [{ type: "features_grid", variant: "statsCards" }],
    ...both(48, 48),
    bg: "class",
    defaultBg: "bg-primary/5",
  },
  {
    file: "client/src/components/features_grid/variants/FeaturesGridStatsText.tsx",
    renderedAs: [{ type: "features_grid", variant: "statsText" }],
    ...both(48, 48),
    bg: "class",
    defaultBg: "bg-primary/5",
  },
  {
    file: "client/src/components/features_grid/variants/FeaturesGridStatsTextCard.tsx",
    renderedAs: [{ type: "features_grid", variant: "statsTextCard" }],
    ...both(48, 48),
    bg: "none",
  },
  {
    file: "client/src/components/features_grid/variants/FeaturesGridTextOnly.tsx",
    renderedAs: [{ type: "features_grid", variant: "textOnly" }],
    ...both(56, 56),
    bg: "class",
  },
  {
    file: "client/src/components/features_quad/variants/FeaturesQuadDefault.tsx",
    renderedAs: [{ type: "features_quad", variant: "default" }],
    ...both(56, 56),
    bg: "class",
    defaultBg: "bg-background",
  },
  {
    file: "client/src/components/geekchart/variants/GeekchartDefault.tsx",
    renderedAs: [{ type: "geekchart", variant: "default" }],
    ...both(32, 32),
    bg: "none",
  },
  ...["asymmetric", "default", "fullBleed"].map((variant) => ({
    file: `client/src/components/graduates_stats/variants/GraduatesStats${variant[0].toUpperCase() + variant.slice(1)}.tsx`,
    renderedAs: [{ type: "graduates_stats", variant }],
    ...split(64, 96),
    bg: "class" as const,
  })),
  {
    file: "client/src/components/hero/variants/HeroCredibility.tsx",
    renderedAs: [{ type: "hero", variant: "credibility" }],
    ...both(40, 24),
    bg: "none",
  },
  {
    file: "client/src/components/horizontal_bars/variants/HorizontalBarsDefault.tsx",
    renderedAs: [{ type: "horizontal_bars", variant: "default" }],
    ...both(24, 24),
    when: (s) => s.use_card === true,
    otherwise: both(48, 48),
    bg: "class",
    defaultBg: "bg-background",
  },
  {
    file: "client/src/components/human_and_ai_duo/variants/HumanAndAiDuoDefault.tsx",
    renderedAs: [{ type: "human_and_ai_duo", variant: "default" }],
    ...both(56, 56),
    bg: "class",
    defaultBg: "bg-background",
  },
  {
    file: "client/src/components/list_press_mentions/variants/ListPressMentionsDefault.tsx",
    renderedAs: [
      { type: "list_press_mentions", variant: "default" },
      { type: "list_press_mentions", variant: "cards" },
    ],
    ...split(48, 64),
    bg: "style",
  },
  {
    file: "client/src/components/list_press_mentions/variants/ListPressMentionsFeaturedShowcase.tsx",
    renderedAs: [{ type: "list_press_mentions", variant: "featuredShowcase" }],
    ...both(64, 64),
    bg: "style",
  },
  ...["bubbleText", "verticalCards"].map((variant) => ({
    file: `client/src/components/numbered_steps/variants/NumberedSteps${variant[0].toUpperCase() + variant.slice(1)}.tsx`,
    renderedAs: [{ type: "numbered_steps", variant }],
    ...both(64, 64),
    bg: "class" as const,
    defaultBg: "bg-muted/30",
  })),
  ...["default", "splitCard"].map((variant) => ({
    file: `client/src/components/partnership_carousel/variants/PartnershipCarousel${variant[0].toUpperCase() + variant.slice(1)}.tsx`,
    renderedAs: [{ type: "partnership_carousel", variant }],
    ...split(48, 64),
    bg: "style" as const,
  })),
  ...["planCards", "planCardsComparison"].map((variant) => ({
    file: `client/src/components/pricing/variants/Pricing${variant[0].toUpperCase() + variant.slice(1)}.tsx`,
    renderedAs: [{ type: "pricing", variant }],
    ...split(32, 56),
    bg: "none" as const,
    note: "Was py-8 sm:py-14 (640px). The wrapper switches at 768px, so 640-767px wide screens now get 32px instead of 56px.",
  })),
  {
    file: "client/src/components/pricing_plans/variants/PricingPlansDefault.tsx",
    renderedAs: [{ type: "pricing_plans", variant: "default" }],
    ...both(48, 48),
    bg: "none",
  },
  {
    file: "client/src/components/profiles_carousel/variants/ProfilesCarouselDefault.tsx",
    renderedAs: [{ type: "profiles_carousel", variant: "default" }],
    ...split(48, 64),
    bg: "style",
  },
  {
    file: "client/src/components/survey/variants/SurveyDefault.tsx",
    renderedAs: [{ type: "survey", variant: "default" }],
    ...both(16, 16),
    bg: "none",
  },
  {
    file: "client/src/components/testimonials_grid/variants/TestimonialsGridDefault.tsx",
    renderedAs: [{ type: "testimonials_grid", variant: "default" }],
    ...split(48, 64),
    bg: "style",
  },
  {
    file: "client/src/components/testimonials_slide/variants/TestimonialsSlideDefault.tsx",
    renderedAs: [{ type: "testimonials_slide", variant: "default" }],
    ...split(48, 64),
    bg: "class",
  },
  {
    file: "client/src/components/text_block/variants/TextBlockDefault.tsx",
    renderedAs: [{ type: "text_block", variant: "default" }],
    ...split(48, 64),
    bg: "none",
  },
  {
    file: "client/src/components/two_column/variants/TwoColumnDefault.tsx",
    renderedAs: [{ type: "two_column", variant: "benefitCards" }],
    ...both(64, 64),
    when: (s) => s.variant === "benefitCards",
    bg: "class",
    defaultBg: "bg-muted/30",
    note: "Only the benefitCards branch (variant: benefitCards) had outer padding.",
  },
];

/** Variant files that render another file's component (re-exports). */
export const RE_EXPORTS: Record<string, string> = {
  "list_press_mentions/ListPressMentionsCards": "list_press_mentions/ListPressMentionsDefault",
  "hero_single_column/HeroSingleColumnDefault": "hero/HeroSingleColumn",
  "hero/HeroApplyFormProductShowcase": "hero/HeroProductShowcase",
};

/**
 * Kept on purpose: the padding sits inside a surface the component paints edge to edge
 * (decorations or color bands span it), so it is not section spacing.
 */
export const KEPT_SELF_PADDED = [
  "client/src/components/features_quad/variants/FeaturesQuadLaptopEdge.tsx",
  "client/src/components/why_learn_ai/variants/WhyLearnAiLaptopEdge.tsx",
  "client/src/components/project_showcase/variants/ProjectShowcaseDefault.tsx",
];

/** Wrapper background for `bg-*` classes the variant root used to paint. `null` = page color already. */
export const CLASS_BG_TO_WRAPPER: Record<string, string | null> = {
  "bg-background": null,
  "bg-primary/5": "light-blue-5",
  "bg-muted": "muted",
  "bg-card": "card",
  "bg-secondary": "secondary",
  // --sidebar and --muted are both 0 0% 98% in light mode on every site.
  "bg-sidebar": "muted",
  "bg-muted/30": "muted-30",
};
