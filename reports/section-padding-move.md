# Section padding move — spot-check report

Generated 2026-10-08 from `reports/section-padding-move-ledger.json`.

About 40 section components used to add their own top and bottom padding in code. That padding now lives in each section's spacing setting (`paddingY`), so staff and agents see and control it. Every existing section got the old padding added to its setting, so live pages should look the same after the deploy.

- Sections updated: **1585** in **576** files
- Per site: site_4geeks-com 1078, site_4geeks-florida 466, site_business-4geeks 33, shared/component-registry 8
- Sections whose new value uses exact pixels (no preset matched): 1325
- Sections whose background setting changed so the color keeps covering the moved padding: 202. Every new value is a theme background; a "Muted 30%" (`muted-30`) entry was added to the 4geeks-com and 4geeks-florida themes for the old `bg-muted/30` tint.

## Staff reminder: proposals created before the deploy

Layout proposals (agent or staff) created before this deploy were written when components still added their own padding. Before approving one, open its preview and check the vertical spacing: a proposal that adds or replaces one of these sections without a spacing value will now show it with no padding.

## Spot checks (one live page per component)

Open each page after the deploy and compare spacing above and below the section with how it looked before.

| Component | Page | Section | Before | After |
|---|---|---|---|---|
| ArticleDefault | https://4geeks.com/en/blog/ai-engineer/what-is-an-ai-engineer | sections[1] | (unset) | {desktop:md} |
| GeekchartDefault | https://4geeks.com/en/blog/ai-tools/what-is-buzz-jack-dorsey-slack-alternative | sections[3] | {desktop:sm} | {desktop:48px} |
| GraduatesStatsDefault | https://4geeks.com/landing/4geeks-others-chile | sections[1] | {desktop:none} | {mobile:lg, desktop:xl} |
| CareerSupportExplainDefault | https://4geeks.com/landing/4geeks-others-chile | sections[4] | {desktop:md none} | {mobile:80px 48px, desktop:xl lg} |
| HumanAndAiDuoDefault | https://4geeks.com/landing/4geeks-others-chile | sections[5] | {mobile:sm none, desktop:md} | {mobile:72px 56px, desktop:88px} |
| CourseSelectorDefault | https://4geeks.com/landing/4geeks-others-chile | sections[6] | (unset) | {mobile:48px, desktop:lg} |
| ListPressMentionsFeaturedShowcase | https://4geeks.com/landing/4geeks-others-chile | sections[9] | (unset) | {desktop:lg} |
| TestimonialsSlideDefault | https://4geeks.com/landing/4geeks-others-chile | sections[10] | {desktop:none} | {mobile:48px, desktop:lg} |
| FeaturesGridStatsTextCard | https://4geeks.com/landing/4geeks-pricing | sections[4] | {mobile:none md, desktop:none md} | {mobile:48px 80px, desktop:48px 80px} |
| CourseSelectorSpotlight | https://4geeks.com/landing/4geeks-vs-others-landing | sections[6] | (unset) | {mobile:48px, desktop:lg} |
| FeaturesQuadDefault | https://4geeks.com/landing/ai-egineer-program-ad-costarica | sections[2] | {desktop:none} | {desktop:56px} |
| BentoCardsDefault | https://4geeks.com/landing/ai-engineering-bootcamp-2 | sections[2] | {desktop:sm none} | {mobile:80px lg, desktop:112px xl} |
| NumberedStepsVerticalCards | https://4geeks.com/landing/ai-engineering-es | sections[11] | (unset) | {desktop:lg} |
| PricingPlanCards | https://4geeks.com/landing/ai-engineering-event-registration | sections[3] | {mobile:md, desktop:none} | {mobile:lg, desktop:56px} |
| FeaturesGridStatsCards | https://4geeks.com/landing/ai-engineering-event-registration | sections[6] | {mobile:md, desktop:none} | {mobile:80px, desktop:48px} |
| DoubleCTADefault | https://4geeks.com/landing/ai-engineering-events | sections[3] | (unset) | {mobile:48px, desktop:lg} |
| TwoColumnDefault | https://4geeks.com/landing/ai-engineering-events | sections[6] | {desktop:sm} | {desktop:80px} |
| CommunitySupportDefault | https://4geeks.com/landing/ai-engineering-next-start-dates | sections[8] | {desktop:sm} | {desktop:72px} |
| NumberedStepsBubbleText | https://4geeks.com/landing/ai-engineering-spain | sections[12] | (unset) | {desktop:lg} |
| SurveyDefault | https://4geeks.com/landing/ai-flex-latam | sections[6] | {desktop:sm} | {desktop:md} |
| AiFlexPathCourseColorSelector | https://4geeks.com/landing/ai-flex-latam | sections[7] | {desktop:md} | {desktop:md xl} |
| FeaturesGridTextOnly | https://4geeks.com/landing/ai-fluency-cv-vsl | sections[6] | (unset) | {desktop:56px} |
| FeaturesGridStatsText | https://4geeks.com/landing/programa-de-desarrollo-full-stack-con-ia | sections[5] | {desktop:none} | {desktop:48px} |
| ProfilesCarouselDefault | https://4geeks.com/landing/workshop-aiengineering-reskill | sections[3] | (unset) | {mobile:48px, desktop:lg} |
| BannerDefault | https://4geeks.com/landing/workshop-aiengineering-reskill | sections[4] | (unset) | {mobile:48px, desktop:lg} |
| ListPressMentionsDefault | https://4geeks.com/en/awards | sections[2] | (unset) | {mobile:48px, desktop:lg} |
| FaqEditorDefault | https://4geeks.com/en/faq | sections[1] | (unset) | {desktop:48px} |
| CourseSelectorSolid | https://4geeks.com/en/financing | sections[6] | {desktop:none} | {mobile:48px, desktop:lg} |
| HeroCredibility | https://4geeks.com/en/home | sections[2] | {desktop:none} | {desktop:40px 24px} |
| FeaturesGridHighlight | https://4geeks.com/es/home-new | sections[4] | (unset) | {desktop:56px} |
| FeaturesGridCardHeader | https://4geeks.com/en/job-guarantee | sections[2] | (unset) | {desktop:56px} |
| GraduatesStatsFullBleed | https://4geeks.com/en/job-guarantee | sections[3] | {desktop:none} | {mobile:lg, desktop:xl} |
| PartnershipCarouselSplitCard | https://4geeks.com/en/partners | sections[4] | (unset) | {mobile:48px, desktop:lg} |
| HorizontalBarsDefault | https://4geeks.com/en/scholarships | sections[5] | (unset) | {desktop:48px} |
| TestimonialsGridDefault | https://4geeks.com/en/testimonials | sections[2] | (unset) | {mobile:48px, desktop:lg} |
| DynamicTableDefault | https://4geeks.com/en/upcoming-dates | sections[2] | (unset) | {desktop:48px} |
| AiFlexPathSimplified | https://4geeks.com/en/career-programs/ai-flex | sections[6] | {desktop:md} | {desktop:md xl} |
| PartnershipCarouselDefault | https://fl.4geeksacademy.com/en/component-test | sections[3] | (unset) | {mobile:48px, desktop:lg} |
| PricingPlansDefault | https://fl.4geeksacademy.com/en/limpieza-componentes-final | sections[14] | {desktop:sm} | {desktop:lg} |
| TextBlockDefault | https://business.4geeks.com/en/about | sections[0] | (unset) | {mobile:48px, desktop:lg} |

## Things that are intentionally not pixel-identical

- **Pricing plan cards** (`pricing:planCards`, `pricing:planCardsComparison`): the old padding switched at 640px; section spacing switches at 768px. Screens 640–767px wide now get 32px instead of 56px.
- **Sections with a max width and a converted background** (6): the color used to fill only the max-width box; the section background now spans the full width. Listed in the table below with a flag.
- **Not migrated (YAML that does not parse, page already broken):** `site_4geeks-com/pages/home-new/en.yml`, `site_4geeks-florida/pages/home-new/en.yml`, `site_4geeks-florida/pages/ejemplo/en.yml`.

## Components that keep their own padding

These paint a surface edge to edge (decorations or color bands span the padding), so the padding is part of the design, not section spacing. Their schema now marks them `self_padded`.

- `client/src/components/features_quad/variants/FeaturesQuadLaptopEdge.tsx`
- `client/src/components/why_learn_ai/variants/WhyLearnAiLaptopEdge.tsx`
- `client/src/components/project_showcase/variants/ProjectShowcaseDefault.tsx`

## Per component

| Component | Sections | Exact px |
|---|---|---|
| AiFlexPathCourseColorSelector | 36 | 2 |
| AiFlexPathDefault | 1 | 0 |
| AiFlexPathDragAndDrop | 1 | 0 |
| AiFlexPathSimplified | 11 | 0 |
| AiFlexSelectorDefault | 1 | 1 |
| ArticleDefault | 117 | 20 |
| BannerDefault | 161 | 161 |
| BentoCardsDefault | 18 | 17 |
| CareerSupportExplainDefault | 95 | 95 |
| CommunitySupportDefault | 26 | 26 |
| CourseSelectorDefault | 3 | 3 |
| CourseSelectorSolid | 21 | 21 |
| CourseSelectorSpotlight | 159 | 159 |
| DoubleCTADefault | 8 | 8 |
| DynamicTableDefault | 5 | 5 |
| FaqEditorDefault | 4 | 4 |
| FeaturesGridCardHeader | 9 | 9 |
| FeaturesGridHighlight | 4 | 4 |
| FeaturesGridStatsCards | 26 | 26 |
| FeaturesGridStatsText | 33 | 33 |
| FeaturesGridStatsTextCard | 34 | 34 |
| FeaturesGridTextOnly | 6 | 6 |
| FeaturesQuadDefault | 153 | 153 |
| GeekchartDefault | 2 | 1 |
| GraduatesStatsDefault | 95 | 53 |
| GraduatesStatsFullBleed | 4 | 0 |
| HeroCredibility | 12 | 12 |
| HorizontalBarsDefault | 7 | 7 |
| HumanAndAiDuoDefault | 83 | 83 |
| ListPressMentionsDefault | 24 | 24 |
| ListPressMentionsFeaturedShowcase | 27 | 1 |
| NumberedStepsBubbleText | 21 | 3 |
| NumberedStepsVerticalCards | 13 | 0 |
| PartnershipCarouselDefault | 1 | 1 |
| PartnershipCarouselSplitCard | 19 | 19 |
| PricingPlanCards | 21 | 21 |
| PricingPlanCardsComparison | 3 | 3 |
| PricingPlansDefault | 2 | 1 |
| ProfilesCarouselDefault | 13 | 13 |
| SurveyDefault | 9 | 0 |
| TestimonialsGridDefault | 4 | 4 |
| TestimonialsSlideDefault | 275 | 275 |
| TextBlockDefault | 12 | 12 |
| TwoColumnDefault | 6 | 5 |

## Inventory (px moved per breakpoint, top / bottom)

| File | Rendered as | Mobile | Desktop | Note |
|---|---|---|---|---|
| ai_flex_path/variants/AiFlexPathCourseColorSelector.tsx | ai_flex_path:courseColorSelector | 0 / 64 | 0 / 64 |  |
| ai_flex_path/variants/AiFlexPathDefault.tsx | ai_flex_path:default | 0 / 64 | 0 / 64 |  |
| ai_flex_path/variants/AiFlexPathDragAndDrop.tsx | ai_flex_path:dragAndDrop | 0 / 64 | 0 / 64 |  |
| ai_flex_path/variants/AiFlexPathSimplified.tsx | ai_flex_path:simplified | 0 / 64 | 0 / 64 |  |
| ai_flex_selector/variants/AiFlexSelectorDefault.tsx | ai_flex_selector:default | 48 / 64 | 48 / 64 | Root min-height reduced by the moved 112px so the section keeps its total height. |
| article/variants/ArticleDefault.tsx | article:default | 32 | 32 |  |
| banner/variants/BannerDefault.tsx | banner:default | 48 | 64 |  |
| bento_cards/variants/BentoCardsDefault.tsx | bento_cards:default | 64 | 96 | overflow-hidden became overflow-x-clip so card shadows still show in the moved padding. |
| career_support_explain/variants/CareerSupportExplainDefault.tsx | career_support_explain:default | 48 | 64 |  |
| community_support/variants/CommunitySupportDefault.tsx | community_support:default | 56 | 56 |  |
| course_selector/variants/CourseSelectorDefault.tsx | course_selector:default | 48 | 64 |  |
| course_selector/variants/CourseSelectorSolid.tsx | course_selector:solid | 48 | 64 |  |
| course_selector/variants/CourseSelectorSpotlight.tsx | course_selector:spotlight | 48 | 64 |  |
| double_cta/variants/DoubleCTADefault.tsx | double_cta:default | 48 | 64 |  |
| dynamic_table/variants/DynamicTableDefault.tsx | dynamic_table:default | 48 | 48 |  |
| faq_editor/variants/FaqEditorDefault.tsx | faq_editor:default | 48 | 48 |  |
| features_grid/variants/FeaturesGridCardHeader.tsx | features_grid:cardHeader | 56 | 56 |  |
| features_grid/variants/FeaturesGridHighlight.tsx | features_grid:highlight | 56 | 56 |  |
| features_grid/variants/FeaturesGridStatsCards.tsx | features_grid:statsCards | 48 | 48 |  |
| features_grid/variants/FeaturesGridStatsText.tsx | features_grid:statsText | 48 | 48 |  |
| features_grid/variants/FeaturesGridStatsTextCard.tsx | features_grid:statsTextCard | 48 | 48 |  |
| features_grid/variants/FeaturesGridTextOnly.tsx | features_grid:textOnly | 56 | 56 |  |
| features_quad/variants/FeaturesQuadDefault.tsx | features_quad:default | 56 | 56 |  |
| geekchart/variants/GeekchartDefault.tsx | geekchart:default | 32 | 32 |  |
| graduates_stats/variants/GraduatesStatsAsymmetric.tsx | graduates_stats:asymmetric | 64 | 96 |  |
| graduates_stats/variants/GraduatesStatsDefault.tsx | graduates_stats:default | 64 | 96 |  |
| graduates_stats/variants/GraduatesStatsFullBleed.tsx | graduates_stats:fullBleed | 64 | 96 |  |
| hero/variants/HeroCredibility.tsx | hero:credibility | 40 / 24 | 40 / 24 |  |
| horizontal_bars/variants/HorizontalBarsDefault.tsx | horizontal_bars:default | 24 | 24 (otherwise mobile 48, desktop 48) |  |
| human_and_ai_duo/variants/HumanAndAiDuoDefault.tsx | human_and_ai_duo:default | 56 | 56 |  |
| list_press_mentions/variants/ListPressMentionsDefault.tsx | list_press_mentions:default, list_press_mentions:cards | 48 | 64 |  |
| list_press_mentions/variants/ListPressMentionsFeaturedShowcase.tsx | list_press_mentions:featuredShowcase | 64 | 64 |  |
| numbered_steps/variants/NumberedStepsBubbleText.tsx | numbered_steps:bubbleText | 64 | 64 |  |
| numbered_steps/variants/NumberedStepsVerticalCards.tsx | numbered_steps:verticalCards | 64 | 64 |  |
| partnership_carousel/variants/PartnershipCarouselDefault.tsx | partnership_carousel:default | 48 | 64 |  |
| partnership_carousel/variants/PartnershipCarouselSplitCard.tsx | partnership_carousel:splitCard | 48 | 64 |  |
| pricing/variants/PricingPlanCards.tsx | pricing:planCards | 32 | 56 | Was py-8 sm:py-14 (640px). The wrapper switches at 768px, so 640-767px wide screens now get 32px instead of 56px. |
| pricing/variants/PricingPlanCardsComparison.tsx | pricing:planCardsComparison | 32 | 56 | Was py-8 sm:py-14 (640px). The wrapper switches at 768px, so 640-767px wide screens now get 32px instead of 56px. |
| pricing_plans/variants/PricingPlansDefault.tsx | pricing_plans:default | 48 | 48 |  |
| profiles_carousel/variants/ProfilesCarouselDefault.tsx | profiles_carousel:default | 48 | 64 |  |
| survey/variants/SurveyDefault.tsx | survey:default | 16 | 16 |  |
| testimonials_grid/variants/TestimonialsGridDefault.tsx | testimonials_grid:default | 48 | 64 |  |
| testimonials_slide/variants/TestimonialsSlideDefault.tsx | testimonials_slide:default | 48 | 64 |  |
| text_block/variants/TextBlockDefault.tsx | text_block:default | 48 | 64 |  |
| two_column/variants/TwoColumnDefault.tsx | two_column:benefitCards | 64 | 64 | Only the benefitCards branch (variant: benefitCards) had outer padding. |

## Every section with exact px, a background change, or a note

| Page | File | Locale / kind | Section | Component | Before | After | Notes |
|---|---|---|---|---|---|---|---|
| — | site_4geeks-com/authors/template.en.yml |  shared template (every entry of this type) | sections[2] | TextBlockDefault | (unset) | {mobile:48px, desktop:lg} |  |
| — | site_4geeks-com/authors/template.es.yml |  shared template (every entry of this type) | sections[2] | TextBlockDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/blog/ai-engineer/what-is-an-ai-engineer | site_4geeks-com/blog/ai-engineer/en.yml | en live | sections[3] | ArticleDefault | {desktop:sm} | {desktop:48px} |  |
| https://4geeks.com/en/blog/ai-powered-learning/ai-engineer-jobs | site_4geeks-com/blog/ai-engineer-jobs/en.yml | en live | sections[3] | ArticleDefault | {desktop:sm} | {desktop:48px} |  |
| https://4geeks.com/en/blog/ai-powered-learning/ai-engineer-salary | site_4geeks-com/blog/ai-engineer-salary/en.yml | en live | sections[3] | ArticleDefault | {desktop:sm} | {desktop:48px} |  |
| https://4geeks.com/en/blog/ai-powered-learning/ai-prompt-engineer | site_4geeks-com/blog/ai-prompt-engineer/en.yml | en live | sections[3] | ArticleDefault | {desktop:sm} | {desktop:48px} |  |
| https://4geeks.com/en/blog/software-engineer/ai-software-engineer | site_4geeks-com/blog/ai-software-engineer/en.yml | en live | sections[3] | ArticleDefault | {desktop:sm} | {desktop:48px} |  |
| https://4geeks.com/en/blog/ai-powered-learning/become-an-ai-engineer | site_4geeks-com/blog/become-an-ai-engineer/en.yml | en live | sections[3] | ArticleDefault | {desktop:sm} | {desktop:48px} |  |
| https://4geeks.com/es/blog/aprendizaje-potenciado-con-ia/curso-inteligencia-artificial | site_4geeks-com/blog/curso-inteligencia-artificial/es.yml | es live | sections[4] | ArticleDefault | {desktop:sm} | {desktop:48px} |  |
| https://4geeks.com/es/blog/aprendizaje-potenciado-con-ia/curso-inteligencia-artificial | site_4geeks-com/blog/curso-inteligencia-artificial/fix-links.es.yml | es variant/draft "fix-links" | sections[4] | ArticleDefault | {desktop:sm} | {desktop:48px} |  |
| https://4geeks.com/es/blog/aprendizaje-potenciado-con-ia/cursos-de-ia | site_4geeks-com/blog/cursos-de-ia/draft.es.yml | es draft (draft) | sections[3] | ArticleDefault | {desktop:sm} | {desktop:48px} |  |
| https://4geeks.com/es/blog/aprendizaje-potenciado-con-ia/cursos-de-ia | site_4geeks-com/blog/cursos-de-ia/es.yml | es live | sections[3] | ArticleDefault | {desktop:sm} | {desktop:48px} |  |
| https://4geeks.com/es/blog/aprendizaje-potenciado-con-ia/cursos-de-ia | site_4geeks-com/blog/cursos-de-ia/fix-links.es.yml | es variant/draft "fix-links" | sections[3] | ArticleDefault | {desktop:sm} | {desktop:48px} |  |
| https://4geeks.com/en/blog/ai-tools/hub-ai-tools | site_4geeks-com/blog/hub-ai-tools/en.yml | en live | sections[5] | ArticleDefault | {desktop:sm} | {desktop:48px} |  |
| https://4geeks.com/es/blog/aprendizaje-potenciado-con-ia/master-inteligencia-artificial | site_4geeks-com/blog/master-inteligencia-artificial/draft.es.yml | es draft (draft) | sections[4] | ArticleDefault | {desktop:sm} | {desktop:48px} |  |
| https://4geeks.com/es/blog/aprendizaje-potenciado-con-ia/master-inteligencia-artificial | site_4geeks-com/blog/master-inteligencia-artificial/es.yml | es live | sections[4] | ArticleDefault | {desktop:sm} | {desktop:48px} |  |
| https://4geeks.com/es/blog/aprendizaje-potenciado-con-ia/master-inteligencia-artificial | site_4geeks-com/blog/master-inteligencia-artificial/fix-links.es.yml | es variant/draft "fix-links" | sections[4] | ArticleDefault | {desktop:sm} | {desktop:48px} |  |
| https://4geeks.com/en/blog/ai-tools/what-is-buzz-jack-dorsey-slack-alternative | site_4geeks-com/blog/what-is-buzz-jack-dorsey-slack-alternative/en.yml | en live | sections[3] | GeekchartDefault | {desktop:sm} | {desktop:48px} |  |
| https://4geeks.com/en/blog/ai-tools/what-is-buzz-jack-dorsey-slack-alternative | site_4geeks-com/blog/what-is-buzz-jack-dorsey-slack-alternative/en.yml | en live | sections[4] | ArticleDefault | {desktop:sm} | {desktop:48px} |  |
| — | site_4geeks-com/component-registry/ai_flex_selector/v1.0/examples/default.en.yml |  registry example | (example) | AiFlexSelectorDefault | (unset) | {desktop:48px lg} | Root min-height reduced by the moved 112px so the section keeps its total height. |
| — | site_4geeks-com/component-registry/banner/v1.0/examples/banner_-_geekpal.yml |  registry example | yaml[0] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| — | site_4geeks-com/component-registry/bento_cards/v1.0/examples/default.yml |  registry example | yaml[0] | BentoCardsDefault | (unset) | {mobile:lg, desktop:xl} | overflow-hidden became overflow-x-clip so card shadows still show in the moved padding. |
| — | site_4geeks-com/component-registry/career_support_explain/v1.0/examples/geekforce.yml |  registry example | (example) | CareerSupportExplainDefault | (unset) | {mobile:48px, desktop:lg} |  |
| — | site_4geeks-com/component-registry/community_support/v1.0/examples/slack-community.yml |  registry example | (example) | CommunitySupportDefault | (unset) | {desktop:56px} | background bg-primary/5 → light-blue-5 |
| — | site_4geeks-com/component-registry/course_selector/v1.0/examples/course_selector_europe.yml |  registry example | yaml[0] | CourseSelectorSolid | {desktop:none} | {mobile:48px, desktop:lg} |  |
| — | site_4geeks-com/component-registry/course_selector/v1.0/examples/course_selector_latam.yml |  registry example | yaml[0] | CourseSelectorSolid | {desktop:none} | {mobile:48px, desktop:lg} |  |
| — | site_4geeks-com/component-registry/course_selector/v1.0/examples/course_selector_overview.yml |  registry example | yaml[0] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| — | site_4geeks-com/component-registry/course_selector/v1.0/examples/course_selector_overview_prices.yml |  registry example | yaml[0] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| — | site_4geeks-com/component-registry/course_selector/v1.0/examples/course_selector_us.yml |  registry example | yaml[0] | CourseSelectorSolid | {desktop:none} | {mobile:48px, desktop:lg} |  |
| — | site_4geeks-com/component-registry/double_cta/v1.0/examples/01_consultation_vs_apply.yml |  registry example | yaml[0] | DoubleCTADefault | (unset) | {mobile:48px, desktop:lg} |  |
| — | site_4geeks-com/component-registry/double_cta/v1.0/examples/02_with_images.yml |  registry example | yaml[0] | DoubleCTADefault | (unset) | {mobile:48px, desktop:lg} |  |
| — | site_4geeks-com/component-registry/dynamic_table/v1.0/examples/default.yml |  registry example | yaml[0] | DynamicTableDefault | (unset) | {desktop:48px} |  |
| — | site_4geeks-com/component-registry/features_grid/v1.0/examples/stats-cards.yml |  registry example | yaml[0] | FeaturesGridStatsCards | (unset) | {desktop:48px} | background (unset) → light-blue-5 |
| — | site_4geeks-com/component-registry/features_grid/v1.0/examples/stats-text-card.yml |  registry example | yaml[0] | FeaturesGridStatsTextCard | (unset) | {desktop:48px} |  |
| — | site_4geeks-com/component-registry/features_grid/v1.0/examples/stats-text.yml |  registry example | yaml[0] | FeaturesGridStatsText | (unset) | {desktop:48px} | background (unset) → light-blue-5; background now spans the full section width (section has maxWidth/paddingX/marginX) |
| — | site_4geeks-com/component-registry/features_quad/v1.0/examples/centered.yml |  registry example | yaml[0] | FeaturesQuadDefault | (unset) | {desktop:56px} |  |
| — | site_4geeks-com/component-registry/features_quad/v1.0/examples/compact.yml |  registry example | yaml[0] | FeaturesQuadDefault | (unset) | {desktop:56px} | background bg-muted/30 → muted-30 |
| — | site_4geeks-com/component-registry/features_quad/v1.0/examples/default.yml |  registry example | yaml[0] | FeaturesQuadDefault | (unset) | {desktop:56px} |  |
| — | site_4geeks-com/component-registry/features_quad/v1.0/examples/with-video.yml |  registry example | yaml[0] | FeaturesQuadDefault | (unset) | {desktop:56px} |  |
| — | site_4geeks-com/component-registry/graduates_stats/v1.0/examples/graduates_stats_testimonials.yml |  registry example | yaml[0] | GraduatesStatsDefault | {desktop:md none} | {mobile:xl lg, desktop:128px xl} |  |
| — | site_4geeks-com/component-registry/horizontal_bars/v1.0/examples/salary-increase-by-region.yml |  registry example | (example) | HorizontalBarsDefault | (unset) | {desktop:48px} |  |
| — | site_4geeks-com/component-registry/horizontal_bars/v1.0/examples/us-hiring-rates.yml |  registry example | (example) | HorizontalBarsDefault | (unset) | {desktop:48px} |  |
| — | site_4geeks-com/component-registry/human_and_ai_duo/v1.0/examples/human_ai_with_images.yml |  registry example | yaml[0] | HumanAndAiDuoDefault | {mobile:sm none, desktop:md none} | {mobile:72px 56px, desktop:88px 56px} |  |
| — | site_4geeks-com/component-registry/human_and_ai_duo/v1.0/examples/no-bullets-with-cta.yml |  registry example | yaml[0] | HumanAndAiDuoDefault | (unset) | {desktop:56px} |  |
| — | site_4geeks-com/component-registry/human_and_ai_duo/v1.0/examples/with-video.yml |  registry example | (example) | HumanAndAiDuoDefault | (unset) | {desktop:56px} | background bg-muted/30 → muted-30 |
| — | site_4geeks-com/component-registry/list_press_mentions/v1.0/examples/basic.yml |  registry example | (example) | ListPressMentionsDefault | (unset) | {mobile:48px, desktop:lg} |  |
| — | site_4geeks-com/component-registry/numbered_steps/v1.0/examples/vertical-cards.yml |  registry example | yaml[0] | NumberedStepsVerticalCards | (unset) | {desktop:lg} | background bg-muted/30 → muted-30 |
| — | site_4geeks-com/component-registry/partnership_carousel/v1.0/examples/two-column.yml |  registry example | (example) | PartnershipCarouselSplitCard | (unset) | {mobile:48px, desktop:lg} |  |
| — | site_4geeks-com/component-registry/pricing/v1.0/examples/plans-new.en.yml |  registry example | yaml[0] | PricingPlanCards | (unset) | {mobile:md, desktop:56px} | Was py-8 sm:py-14 (640px). The wrapper switches at 768px, so 640-767px wide screens now get 32px instead of 56px. |
| — | site_4geeks-com/component-registry/pricing/v1.0/examples/plans.en.yml |  registry example | yaml[0] | PricingPlanCardsComparison | (unset) | {mobile:md, desktop:56px} | Was py-8 sm:py-14 (640px). The wrapper switches at 768px, so 640-767px wide screens now get 32px instead of 56px. |
| — | site_4geeks-com/component-registry/pricing_plans/v1.0/examples/default.yml |  registry example | (example) | PricingPlansDefault | (unset) | {desktop:48px} |  |
| — | site_4geeks-com/component-registry/testimonials_slide/v1.0/examples/default.yml |  registry example | yaml[0] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} |  |
| — | site_4geeks-com/component-registry/two_column/v1.0/examples/benefit_cards_with_stacked_header.yml |  registry example | (example) | TwoColumnDefault | (unset) | {desktop:lg} | background bg-muted/30 → muted-30; Only the benefitCards branch (variant: benefitCards) had outer padding. |
| — | site_4geeks-com/how-to/template.en.yml |  shared template (every entry of this type) | sections[1] | ArticleDefault | {desktop:sm} | {desktop:48px} |  |
| — | site_4geeks-com/how-to/template.es.yml |  shared template (every entry of this type) | sections[1] | ArticleDefault | {desktop:sm} | {desktop:48px} |  |
| — | site_4geeks-com/interactive-exercise/single-new-interactive-exercises-template.en.yml |  shared template (every entry of this type) | sections[5] | ListPressMentionsDefault | {desktop:sm} | {mobile:lg, desktop:80px} |  |
| — | site_4geeks-com/interactive-exercise/single.en.yml | en variant/draft "single" | sections[4] | ListPressMentionsDefault | {desktop:sm} | {mobile:lg, desktop:80px} |  |
| — | site_4geeks-com/interactive-exercise/single.es-template.es.yml |  shared template (every entry of this type) | sections[4] | ListPressMentionsDefault | {desktop:sm} | {mobile:lg, desktop:80px} |  |
| — | site_4geeks-com/interactive-exercise/single.es.yml | es variant/draft "single" | sections[4] | ListPressMentionsDefault | {desktop:sm} | {mobile:lg, desktop:80px} |  |
| — | site_4geeks-com/interactive-exercise/single.new-exercises-template.en.yml |  shared template (every entry of this type) | sections[5] | ListPressMentionsDefault | {desktop:sm} | {mobile:lg, desktop:80px} |  |
| — | site_4geeks-com/interactive-exercise/single.with-syllabus.en.yml | en variant/draft "single.with-syllabus" | sections[6] | ListPressMentionsDefault | {desktop:sm} | {mobile:lg, desktop:80px} |  |
| — | site_4geeks-com/interactive-exercise/single.with-syllabus.es.yml | es variant/draft "single.with-syllabus" | sections[4] | ListPressMentionsDefault | {desktop:sm} | {mobile:lg, desktop:80px} |  |
| — | site_4geeks-com/interactive-exercise/template.en.yml |  shared template (every entry of this type) | sections[4] | ListPressMentionsDefault | {desktop:sm} | {mobile:lg, desktop:80px} |  |
| — | site_4geeks-com/interactive-exercise/template.es-template.es.yml |  shared template (every entry of this type) | sections[4] | ListPressMentionsDefault | {desktop:sm} | {mobile:lg, desktop:80px} |  |
| — | site_4geeks-com/interactive-exercise/template.es.yml |  shared template (every entry of this type) | sections[4] | ListPressMentionsDefault | {desktop:sm} | {mobile:lg, desktop:80px} |  |
| — | site_4geeks-com/interactive-exercise/template.new-exercises-template.en.yml |  shared template (every entry of this type) | sections[5] | ListPressMentionsDefault | {desktop:sm} | {mobile:lg, desktop:80px} |  |
| — | site_4geeks-com/interactive-exercise/template.with-syllabus.en.yml |  shared template (every entry of this type) | sections[6] | ListPressMentionsDefault | {desktop:sm} | {mobile:lg, desktop:80px} |  |
| — | site_4geeks-com/interactive-exercise/template.with-syllabus.es.yml |  shared template (every entry of this type) | sections[4] | ListPressMentionsDefault | {desktop:sm} | {mobile:lg, desktop:80px} |  |
| https://4geeks.com/landing/4geeks-academy-spain | site_4geeks-com/landings/4geeks-academy-spain/draft.es.yml | es draft (draft) | sections[10] | TextBlockDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/4geeks-others-chile | site_4geeks-com/landings/4geeks-others-chile/es.yml | es live | sections[4] | CareerSupportExplainDefault | {desktop:md none} | {mobile:80px 48px, desktop:xl lg} |  |
| https://4geeks.com/landing/4geeks-others-chile | site_4geeks-com/landings/4geeks-others-chile/es.yml | es live | sections[5] | HumanAndAiDuoDefault | {mobile:sm none, desktop:md} | {mobile:72px 56px, desktop:88px} |  |
| https://4geeks.com/landing/4geeks-others-chile | site_4geeks-com/landings/4geeks-others-chile/es.yml | es live | sections[6] | CourseSelectorDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/4geeks-others-chile | site_4geeks-com/landings/4geeks-others-chile/es.yml | es live | sections[10] | TestimonialsSlideDefault | {desktop:none} | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/4geeks-others-mexico | site_4geeks-com/landings/4geeks-others-mexico/draft.es.yml | es draft (draft) | sections[4] | CareerSupportExplainDefault | {desktop:md none} | {mobile:80px 48px, desktop:xl lg} |  |
| https://4geeks.com/landing/4geeks-others-mexico | site_4geeks-com/landings/4geeks-others-mexico/draft.es.yml | es draft (draft) | sections[5] | HumanAndAiDuoDefault | {mobile:sm none, desktop:md} | {mobile:72px 56px, desktop:88px} |  |
| https://4geeks.com/landing/4geeks-others-mexico | site_4geeks-com/landings/4geeks-others-mexico/draft.es.yml | es draft (draft) | sections[6] | CourseSelectorDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/4geeks-others-mexico | site_4geeks-com/landings/4geeks-others-mexico/draft.es.yml | es draft (draft) | sections[11] | TestimonialsSlideDefault | {desktop:none} | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/4geeks-others-mexico | site_4geeks-com/landings/4geeks-others-mexico/es.yml | es live | sections[4] | CareerSupportExplainDefault | {desktop:md none} | {mobile:80px 48px, desktop:xl lg} |  |
| https://4geeks.com/landing/4geeks-others-mexico | site_4geeks-com/landings/4geeks-others-mexico/es.yml | es live | sections[5] | HumanAndAiDuoDefault | {mobile:sm none, desktop:md} | {mobile:72px 56px, desktop:88px} |  |
| https://4geeks.com/landing/4geeks-others-mexico | site_4geeks-com/landings/4geeks-others-mexico/es.yml | es live | sections[6] | CourseSelectorDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/4geeks-others-mexico | site_4geeks-com/landings/4geeks-others-mexico/es.yml | es live | sections[11] | TestimonialsSlideDefault | {desktop:none} | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/4geeks-pricing | site_4geeks-com/landings/4geeks-pricing/en.yml | en live | sections[4] | FeaturesGridStatsTextCard | {mobile:none md, desktop:none md} | {mobile:48px 80px, desktop:48px 80px} |  |
| https://4geeks.com/landing/4geeks-pricing | site_4geeks-com/landings/4geeks-pricing/en.yml | en live | sections[9] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/4geeks-vs-others-landing | site_4geeks-com/landings/4geeks-vs-others-landing/borrar-nacho.en.yml | en variant/draft "borrar-nacho" | sections[4] | CareerSupportExplainDefault | {desktop:md none} | {mobile:80px 48px, desktop:xl lg} |  |
| https://4geeks.com/landing/4geeks-vs-others-landing | site_4geeks-com/landings/4geeks-vs-others-landing/borrar-nacho.en.yml | en variant/draft "borrar-nacho" | sections[5] | HumanAndAiDuoDefault | {mobile:sm none, desktop:md} | {mobile:72px 56px, desktop:88px} |  |
| https://4geeks.com/landing/4geeks-vs-others-landing | site_4geeks-com/landings/4geeks-vs-others-landing/borrar-nacho.en.yml | en variant/draft "borrar-nacho" | sections[6] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/4geeks-vs-others-landing | site_4geeks-com/landings/4geeks-vs-others-landing/borrar-nacho.en.yml | en variant/draft "borrar-nacho" | sections[10] | TestimonialsSlideDefault | {desktop:none} | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/4geeks-vs-others-landing | site_4geeks-com/landings/4geeks-vs-others-landing/en.yml | en live | sections[4] | CareerSupportExplainDefault | {desktop:md none} | {mobile:80px 48px, desktop:xl lg} |  |
| https://4geeks.com/landing/4geeks-vs-others-landing | site_4geeks-com/landings/4geeks-vs-others-landing/en.yml | en live | sections[5] | HumanAndAiDuoDefault | {mobile:sm none, desktop:md} | {mobile:72px 56px, desktop:88px} |  |
| https://4geeks.com/landing/4geeks-vs-others-landing | site_4geeks-com/landings/4geeks-vs-others-landing/en.yml | en live | sections[6] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/4geeks-vs-others-landing | site_4geeks-com/landings/4geeks-vs-others-landing/en.yml | en live | sections[10] | TestimonialsSlideDefault | {desktop:none} | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/4geeks-vs-otros-landing | site_4geeks-com/landings/4geeks-vs-otros-landing/es.yml | es live | sections[4] | CareerSupportExplainDefault | {desktop:md none} | {mobile:80px 48px, desktop:xl lg} |  |
| https://4geeks.com/landing/4geeks-vs-otros-landing | site_4geeks-com/landings/4geeks-vs-otros-landing/es.yml | es live | sections[5] | HumanAndAiDuoDefault | {mobile:sm none, desktop:md} | {mobile:72px 56px, desktop:88px} |  |
| https://4geeks.com/landing/4geeks-vs-otros-landing | site_4geeks-com/landings/4geeks-vs-otros-landing/es.yml | es live | sections[6] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/4geeks-vs-otros-landing | site_4geeks-com/landings/4geeks-vs-otros-landing/es.yml | es live | sections[10] | TestimonialsSlideDefault | {desktop:none} | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/ai-bootcamp-with-job-placement | site_4geeks-com/landings/ai-bootcamp-with-job-placement/en.yml | en live | sections[5] | FeaturesGridStatsTextCard | {mobile:none md, desktop:none md} | {mobile:48px 80px, desktop:48px 80px} |  |
| https://4geeks.com/landing/ai-bootcamp-with-job-placement | site_4geeks-com/landings/ai-bootcamp-with-job-placement/en.yml | en live | sections[7] | CareerSupportExplainDefault | {desktop:none} | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/ai-bootcamp-with-job-placement | site_4geeks-com/landings/ai-bootcamp-with-job-placement/en.yml | en live | sections[8] | HumanAndAiDuoDefault | {mobile:sm none, desktop:md} | {mobile:72px 56px, desktop:88px} |  |
| https://4geeks.com/landing/ai-bootcamp-with-job-placement | site_4geeks-com/landings/ai-bootcamp-with-job-placement/en.yml | en live | sections[9] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/ai-egineer-program-ad-costarica | site_4geeks-com/landings/ai-egineer-program-ad-costarica/es.yml | es live | sections[2] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/ai-egineer-program-ad-costarica | site_4geeks-com/landings/ai-egineer-program-ad-costarica/es.yml | es live | sections[5] | CareerSupportExplainDefault | {desktop:none sm} | {mobile:48px lg, desktop:lg 80px} |  |
| https://4geeks.com/landing/ai-egineer-program-ad-costarica | site_4geeks-com/landings/ai-egineer-program-ad-costarica/es.yml | es live | sections[7] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/ai-egineer-program-ad-costarica | site_4geeks-com/landings/ai-egineer-program-ad-costarica/es.yml | es live | sections[10] | TestimonialsSlideDefault | {desktop:none} | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/ai-engineering | site_4geeks-com/landings/ai-engineering/es.yml | es live | sections[2] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/ai-engineering | site_4geeks-com/landings/ai-engineering/es.yml | es live | sections[5] | CareerSupportExplainDefault | {desktop:none sm} | {mobile:48px lg, desktop:lg 80px} |  |
| https://4geeks.com/landing/ai-engineering | site_4geeks-com/landings/ai-engineering/es.yml | es live | sections[7] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/ai-engineering | site_4geeks-com/landings/ai-engineering/es.yml | es live | sections[9] | TestimonialsSlideDefault | {desktop:none} | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/ai-engineering-bootcamp | site_4geeks-com/landings/ai-engineering-bootcamp/en.yml | en live | sections[3] | FeaturesGridStatsTextCard | {desktop:none md, mobile:none md} | {mobile:48px 80px, desktop:48px 80px} |  |
| https://4geeks.com/landing/ai-engineering-bootcamp | site_4geeks-com/landings/ai-engineering-bootcamp/en.yml | en live | sections[8] | CareerSupportExplainDefault | {desktop:none} | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/ai-engineering-bootcamp | site_4geeks-com/landings/ai-engineering-bootcamp/en.yml | en live | sections[10] | TestimonialsSlideDefault | {desktop:sm none} | {mobile:lg 48px, desktop:80px lg} |  |
| https://4geeks.com/landing/ai-engineering-bootcamp | site_4geeks-com/landings/ai-engineering-bootcamp/en.yml | en live | sections[11] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/ai-engineering-bootcamp-2 | site_4geeks-com/landings/ai-engineering-bootcamp-2/ai-engineering-bootcamp-2anik.en.yml | en variant/draft "ai-engineering-bootcamp-2anik" | sections[1] | BentoCardsDefault | {desktop:sm none} | {mobile:80px lg, desktop:112px xl} | overflow-hidden became overflow-x-clip so card shadows still show in the moved padding. |
| https://4geeks.com/landing/ai-engineering-bootcamp-2 | site_4geeks-com/landings/ai-engineering-bootcamp-2/ai-engineering-bootcamp-2anik.en.yml | en variant/draft "ai-engineering-bootcamp-2anik" | sections[3] | CareerSupportExplainDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/ai-engineering-bootcamp-2 | site_4geeks-com/landings/ai-engineering-bootcamp-2/ai-engineering-bootcamp-2anik.en.yml | en variant/draft "ai-engineering-bootcamp-2anik" | sections[4] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/ai-engineering-bootcamp-2 | site_4geeks-com/landings/ai-engineering-bootcamp-2/ai-engineering-bootcamp-2anik.en.yml | en variant/draft "ai-engineering-bootcamp-2anik" | sections[6] | FeaturesGridStatsTextCard | {mobile:none md, desktop:none md} | {mobile:48px 80px, desktop:48px 80px} |  |
| https://4geeks.com/landing/ai-engineering-bootcamp-2 | site_4geeks-com/landings/ai-engineering-bootcamp-2/ai-engineering-bootcamp-2anik.en.yml | en variant/draft "ai-engineering-bootcamp-2anik" | sections[7] | GraduatesStatsDefault | {desktop:none sm} | {mobile:lg 80px, desktop:xl 112px} |  |
| https://4geeks.com/landing/ai-engineering-bootcamp-2 | site_4geeks-com/landings/ai-engineering-bootcamp-2/ai-engineering-bootcamp-2anik.en.yml | en variant/draft "ai-engineering-bootcamp-2anik" | sections[10] | TestimonialsSlideDefault | {desktop:sm} | {mobile:lg, desktop:80px} |  |
| https://4geeks.com/landing/ai-engineering-bootcamp-2 | site_4geeks-com/landings/ai-engineering-bootcamp-2/ai-engineering-salaries.en.yml | en variant/draft "ai-engineering-salaries" | sections[1] | GraduatesStatsDefault | {desktop:none sm} | {mobile:lg 80px, desktop:xl 112px} |  |
| https://4geeks.com/landing/ai-engineering-bootcamp-2 | site_4geeks-com/landings/ai-engineering-bootcamp-2/ai-engineering-salaries.en.yml | en variant/draft "ai-engineering-salaries" | sections[2] | BentoCardsDefault | {desktop:sm none} | {mobile:80px lg, desktop:112px xl} | overflow-hidden became overflow-x-clip so card shadows still show in the moved padding. |
| https://4geeks.com/landing/ai-engineering-bootcamp-2 | site_4geeks-com/landings/ai-engineering-bootcamp-2/ai-engineering-salaries.en.yml | en variant/draft "ai-engineering-salaries" | sections[3] | CareerSupportExplainDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/ai-engineering-bootcamp-2 | site_4geeks-com/landings/ai-engineering-bootcamp-2/ai-engineering-salaries.en.yml | en variant/draft "ai-engineering-salaries" | sections[7] | CommunitySupportDefault | {desktop:sm} | {desktop:72px} |  |
| https://4geeks.com/landing/ai-engineering-bootcamp-2 | site_4geeks-com/landings/ai-engineering-bootcamp-2/ai-engineering-salaries.en.yml | en variant/draft "ai-engineering-salaries" | sections[9] | TestimonialsSlideDefault | {desktop:sm} | {mobile:lg, desktop:80px} |  |
| https://4geeks.com/landing/ai-engineering-bootcamp-2 | site_4geeks-com/landings/ai-engineering-bootcamp-2/en.yml | en live | sections[2] | BentoCardsDefault | {desktop:sm none} | {mobile:80px lg, desktop:112px xl} | overflow-hidden became overflow-x-clip so card shadows still show in the moved padding. |
| https://4geeks.com/landing/ai-engineering-bootcamp-2 | site_4geeks-com/landings/ai-engineering-bootcamp-2/en.yml | en live | sections[4] | CareerSupportExplainDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/ai-engineering-bootcamp-2 | site_4geeks-com/landings/ai-engineering-bootcamp-2/en.yml | en live | sections[5] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/ai-engineering-bootcamp-2 | site_4geeks-com/landings/ai-engineering-bootcamp-2/en.yml | en live | sections[7] | FeaturesGridStatsTextCard | {mobile:none md, desktop:none md} | {mobile:48px 80px, desktop:48px 80px} |  |
| https://4geeks.com/landing/ai-engineering-bootcamp-2 | site_4geeks-com/landings/ai-engineering-bootcamp-2/en.yml | en live | sections[8] | GraduatesStatsDefault | {desktop:none sm} | {mobile:lg 80px, desktop:xl 112px} |  |
| https://4geeks.com/landing/ai-engineering-bootcamp-2 | site_4geeks-com/landings/ai-engineering-bootcamp-2/en.yml | en live | sections[11] | TestimonialsSlideDefault | {desktop:sm} | {mobile:lg, desktop:80px} |  |
| https://4geeks.com/landing/ai-engineering-bootcamp-chile | site_4geeks-com/landings/ai-engineering-bootcamp-chile/es.yml | es live | sections[2] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/ai-engineering-bootcamp-chile | site_4geeks-com/landings/ai-engineering-bootcamp-chile/es.yml | es live | sections[3] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/ai-engineering-bootcamp-chile | site_4geeks-com/landings/ai-engineering-bootcamp-chile/es.yml | es live | sections[6] | CareerSupportExplainDefault | {desktop:none sm} | {mobile:48px lg, desktop:lg 80px} |  |
| https://4geeks.com/landing/ai-engineering-bootcamp-chile | site_4geeks-com/landings/ai-engineering-bootcamp-chile/es.yml | es live | sections[8] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/ai-engineering-bootcamp-chile | site_4geeks-com/landings/ai-engineering-bootcamp-chile/es.yml | es live | sections[10] | TestimonialsSlideDefault | {desktop:none} | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/ai-engineering-bootcamp-co https://4geeks.com/landing/ai-engineering-bootcamp-co | site_4geeks-com/landings/ai-engineering-bootcamp-co/_common.yml |  all locales | sections[2] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/ai-engineering-bootcamp-co https://4geeks.com/landing/ai-engineering-bootcamp-co | site_4geeks-com/landings/ai-engineering-bootcamp-co/_common.yml |  all locales | sections[3] | FeaturesQuadDefault | {desktop:sm none} | {desktop:72px 56px} |  |
| https://4geeks.com/landing/ai-engineering-bootcamp-co https://4geeks.com/landing/ai-engineering-bootcamp-co | site_4geeks-com/landings/ai-engineering-bootcamp-co/_common.yml |  all locales | sections[6] | CareerSupportExplainDefault | {desktop:none sm} | {mobile:48px lg, desktop:lg 80px} |  |
| https://4geeks.com/landing/ai-engineering-bootcamp-co https://4geeks.com/landing/ai-engineering-bootcamp-co | site_4geeks-com/landings/ai-engineering-bootcamp-co/_common.yml |  all locales | sections[8] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/ai-engineering-bootcamp-co https://4geeks.com/landing/ai-engineering-bootcamp-co | site_4geeks-com/landings/ai-engineering-bootcamp-co/_common.yml |  all locales | sections[10] | TestimonialsSlideDefault | {desktop:none} | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/ai-engineering-bootcamp-co | site_4geeks-com/landings/ai-engineering-bootcamp-co/es.yml | es live | sections[2] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/ai-engineering-bootcamp-co | site_4geeks-com/landings/ai-engineering-bootcamp-co/es.yml | es live | sections[3] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/ai-engineering-bootcamp-co | site_4geeks-com/landings/ai-engineering-bootcamp-co/es.yml | es live | sections[6] | CareerSupportExplainDefault | {desktop:none sm} | {mobile:48px lg, desktop:lg 80px} |  |
| https://4geeks.com/landing/ai-engineering-bootcamp-co | site_4geeks-com/landings/ai-engineering-bootcamp-co/es.yml | es live | sections[8] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/ai-engineering-bootcamp-co | site_4geeks-com/landings/ai-engineering-bootcamp-co/es.yml | es live | sections[10] | TestimonialsSlideDefault | {desktop:none} | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/ai-engineering-bootcamp-mexico | site_4geeks-com/landings/ai-engineering-bootcamp-mexico/es.yml | es live | sections[2] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/ai-engineering-bootcamp-mexico | site_4geeks-com/landings/ai-engineering-bootcamp-mexico/es.yml | es live | sections[3] | FeaturesQuadDefault | (unset) | {desktop:56px} |  |
| https://4geeks.com/landing/ai-engineering-bootcamp-mexico | site_4geeks-com/landings/ai-engineering-bootcamp-mexico/es.yml | es live | sections[6] | CareerSupportExplainDefault | {desktop:none sm} | {mobile:48px lg, desktop:lg 80px} |  |
| https://4geeks.com/landing/ai-engineering-bootcamp-mexico | site_4geeks-com/landings/ai-engineering-bootcamp-mexico/es.yml | es live | sections[8] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/ai-engineering-bootcamp-mexico | site_4geeks-com/landings/ai-engineering-bootcamp-mexico/es.yml | es live | sections[10] | TestimonialsSlideDefault | {desktop:none} | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/ai-engineering-chile | site_4geeks-com/landings/ai-engineering-chile/es.yml | es live | sections[5] | FeaturesGridStatsTextCard | {mobile:none md, desktop:none md} | {mobile:48px 80px, desktop:48px 80px} |  |
| https://4geeks.com/landing/ai-engineering-chile | site_4geeks-com/landings/ai-engineering-chile/es.yml | es live | sections[11] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/ai-engineering-chile | site_4geeks-com/landings/ai-engineering-chile/schema-fix.es.yml | es variant/draft "schema-fix" | sections[5] | FeaturesGridStatsTextCard | {mobile:none md, desktop:none md} | {mobile:48px 80px, desktop:48px 80px} |  |
| https://4geeks.com/landing/ai-engineering-chile | site_4geeks-com/landings/ai-engineering-chile/schema-fix.es.yml | es variant/draft "schema-fix" | sections[11] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/ai-engineering-coding-florida | site_4geeks-com/landings/ai-engineering-coding-florida/en.yml | en live | sections[5] | FeaturesGridStatsTextCard | {mobile:none md, desktop:none md} | {mobile:48px 80px, desktop:48px 80px} |  |
| https://4geeks.com/landing/ai-engineering-coding-florida | site_4geeks-com/landings/ai-engineering-coding-florida/en.yml | en live | sections[8] | HumanAndAiDuoDefault | {mobile:sm none, desktop:md none} | {mobile:72px 56px, desktop:88px 56px} |  |
| https://4geeks.com/landing/ai-engineering-coding-florida | site_4geeks-com/landings/ai-engineering-coding-florida/en.yml | en live | sections[11] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/ai-engineering-en | site_4geeks-com/landings/ai-engineering-en/en.yml | en live | sections[4] | FeaturesGridStatsTextCard | {mobile:none md, desktop:none md} | {mobile:48px 80px, desktop:48px 80px} |  |
| https://4geeks.com/landing/ai-engineering-en | site_4geeks-com/landings/ai-engineering-en/en.yml | en live | sections[8] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/ai-engineering-en | site_4geeks-com/landings/ai-engineering-en/en.yml | en live | sections[9] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/ai-engineering-es | site_4geeks-com/landings/ai-engineering-es/es.yml | es live | sections[5] | FeaturesGridStatsTextCard | {mobile:none md, desktop:none md} | {mobile:48px 80px, desktop:48px 80px} |  |
| https://4geeks.com/landing/ai-engineering-es | site_4geeks-com/landings/ai-engineering-es/es.yml | es live | sections[11] | NumberedStepsVerticalCards | (unset) | {desktop:lg} | background bg-muted/30 → muted-30 |
| https://4geeks.com/landing/ai-engineering-es | site_4geeks-com/landings/ai-engineering-es/es.yml | es live | sections[12] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/ai-engineering-event-registration | site_4geeks-com/landings/ai-engineering-event-registration/en.yml | en live | sections[3] | PricingPlanCards | {mobile:md, desktop:none} | {mobile:lg, desktop:56px} | Was py-8 sm:py-14 (640px). The wrapper switches at 768px, so 640-767px wide screens now get 32px instead of 56px. |
| https://4geeks.com/landing/ai-engineering-event-registration | site_4geeks-com/landings/ai-engineering-event-registration/en.yml | en live | sections[4] | HumanAndAiDuoDefault | {mobile:sm none, desktop:none} | {mobile:72px 56px, desktop:56px} |  |
| https://4geeks.com/landing/ai-engineering-event-registration | site_4geeks-com/landings/ai-engineering-event-registration/en.yml | en live | sections[5] | CareerSupportExplainDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/ai-engineering-event-registration | site_4geeks-com/landings/ai-engineering-event-registration/en.yml | en live | sections[6] | FeaturesGridStatsCards | {mobile:md, desktop:none} | {mobile:80px, desktop:48px} |  |
| https://4geeks.com/landing/ai-engineering-events | site_4geeks-com/landings/ai-engineering-events/agenda-pablo.es.yml | es variant/draft "agenda-pablo" | sections[2] | DoubleCTADefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/ai-engineering-events | site_4geeks-com/landings/ai-engineering-events/agenda-pablo.es.yml | es variant/draft "agenda-pablo" | sections[5] | TwoColumnDefault | {desktop:sm} | {desktop:80px} | background bg-muted/30 → muted-30; Only the benefitCards branch (variant: benefitCards) had outer padding. |
| https://4geeks.com/landing/ai-engineering-events | site_4geeks-com/landings/ai-engineering-events/agenda-pablo.es.yml | es variant/draft "agenda-pablo" | sections[6] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/ai-engineering-events | site_4geeks-com/landings/ai-engineering-events/agenda-pablo.es.yml | es variant/draft "agenda-pablo" | sections[8] | CareerSupportExplainDefault | {desktop:none sm} | {mobile:48px lg, desktop:lg 80px} |  |
| https://4geeks.com/landing/ai-engineering-events | site_4geeks-com/landings/ai-engineering-events/agenda-pablo.es.yml | es variant/draft "agenda-pablo" | sections[9] | TestimonialsSlideDefault | {desktop:none} | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/ai-engineering-events | site_4geeks-com/landings/ai-engineering-events/calendly-pablohan.es.yml | es variant/draft "calendly-pablohan" | sections[2] | DoubleCTADefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/ai-engineering-events | site_4geeks-com/landings/ai-engineering-events/calendly-pablohan.es.yml | es variant/draft "calendly-pablohan" | sections[5] | TwoColumnDefault | {desktop:sm} | {desktop:80px} | background bg-muted/30 → muted-30; Only the benefitCards branch (variant: benefitCards) had outer padding. |
| https://4geeks.com/landing/ai-engineering-events | site_4geeks-com/landings/ai-engineering-events/calendly-pablohan.es.yml | es variant/draft "calendly-pablohan" | sections[6] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/ai-engineering-events | site_4geeks-com/landings/ai-engineering-events/calendly-pablohan.es.yml | es variant/draft "calendly-pablohan" | sections[8] | CareerSupportExplainDefault | {desktop:none sm} | {mobile:48px lg, desktop:lg 80px} |  |
| https://4geeks.com/landing/ai-engineering-events | site_4geeks-com/landings/ai-engineering-events/calendly-pablohan.es.yml | es variant/draft "calendly-pablohan" | sections[9] | TestimonialsSlideDefault | {desktop:none} | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/ai-engineering-events | site_4geeks-com/landings/ai-engineering-events/calendly-pballesteros.es.yml | es variant/draft "calendly-pballesteros" | sections[2] | DoubleCTADefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/ai-engineering-events | site_4geeks-com/landings/ai-engineering-events/calendly-pballesteros.es.yml | es variant/draft "calendly-pballesteros" | sections[5] | TwoColumnDefault | {desktop:sm} | {desktop:80px} | background bg-muted/30 → muted-30; Only the benefitCards branch (variant: benefitCards) had outer padding. |
| https://4geeks.com/landing/ai-engineering-events | site_4geeks-com/landings/ai-engineering-events/calendly-pballesteros.es.yml | es variant/draft "calendly-pballesteros" | sections[6] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/ai-engineering-events | site_4geeks-com/landings/ai-engineering-events/calendly-pballesteros.es.yml | es variant/draft "calendly-pballesteros" | sections[8] | CareerSupportExplainDefault | {desktop:none sm} | {mobile:48px lg, desktop:lg 80px} |  |
| https://4geeks.com/landing/ai-engineering-events | site_4geeks-com/landings/ai-engineering-events/calendly-pballesteros.es.yml | es variant/draft "calendly-pballesteros" | sections[9] | TestimonialsSlideDefault | {desktop:none} | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/ai-engineering-events | site_4geeks-com/landings/ai-engineering-events/calendly-sguzman.es.yml | es variant/draft "calendly-sguzman" | sections[2] | DoubleCTADefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/ai-engineering-events | site_4geeks-com/landings/ai-engineering-events/calendly-sguzman.es.yml | es variant/draft "calendly-sguzman" | sections[5] | TwoColumnDefault | {desktop:sm} | {desktop:80px} | background bg-muted/30 → muted-30; Only the benefitCards branch (variant: benefitCards) had outer padding. |
| https://4geeks.com/landing/ai-engineering-events | site_4geeks-com/landings/ai-engineering-events/calendly-sguzman.es.yml | es variant/draft "calendly-sguzman" | sections[6] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/ai-engineering-events | site_4geeks-com/landings/ai-engineering-events/calendly-sguzman.es.yml | es variant/draft "calendly-sguzman" | sections[8] | CareerSupportExplainDefault | {desktop:none sm} | {mobile:48px lg, desktop:lg 80px} |  |
| https://4geeks.com/landing/ai-engineering-events | site_4geeks-com/landings/ai-engineering-events/calendly-sguzman.es.yml | es variant/draft "calendly-sguzman" | sections[9] | TestimonialsSlideDefault | {desktop:none} | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/ai-engineering-events | site_4geeks-com/landings/ai-engineering-events/es.yml | es live | sections[3] | DoubleCTADefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/ai-engineering-events | site_4geeks-com/landings/ai-engineering-events/es.yml | es live | sections[6] | TwoColumnDefault | {desktop:sm} | {desktop:80px} | background bg-muted/30 → muted-30; Only the benefitCards branch (variant: benefitCards) had outer padding. |
| https://4geeks.com/landing/ai-engineering-events | site_4geeks-com/landings/ai-engineering-events/es.yml | es live | sections[7] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/ai-engineering-events | site_4geeks-com/landings/ai-engineering-events/es.yml | es live | sections[9] | CareerSupportExplainDefault | {desktop:none sm} | {mobile:48px lg, desktop:lg 80px} |  |
| https://4geeks.com/landing/ai-engineering-events | site_4geeks-com/landings/ai-engineering-events/es.yml | es live | sections[10] | TestimonialsSlideDefault | {desktop:none} | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/ai-engineering-for-developers | site_4geeks-com/landings/ai-engineering-for-developers/en.yml | en live | sections[2] | GraduatesStatsDefault | {desktop:md none} | {mobile:xl lg, desktop:128px xl} |  |
| https://4geeks.com/landing/ai-engineering-for-developers | site_4geeks-com/landings/ai-engineering-for-developers/en.yml | en live | sections[4] | FeaturesGridStatsTextCard | {mobile:none md, desktop:none sm} | {mobile:48px 80px, desktop:48px lg} |  |
| https://4geeks.com/landing/ai-engineering-for-developers | site_4geeks-com/landings/ai-engineering-for-developers/en.yml | en live | sections[7] | HumanAndAiDuoDefault | {mobile:sm none, desktop:md} | {mobile:72px 56px, desktop:88px} |  |
| https://4geeks.com/landing/ai-engineering-for-developers | site_4geeks-com/landings/ai-engineering-for-developers/en.yml | en live | sections[8] | CareerSupportExplainDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/ai-engineering-for-developers | site_4geeks-com/landings/ai-engineering-for-developers/en.yml | en live | sections[9] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/ai-engineering-next-dates | site_4geeks-com/landings/ai-engineering-next-dates/draft.en.yml | en draft (draft) | sections[1] | GraduatesStatsDefault | {desktop:none sm} | {mobile:lg 80px, desktop:xl 112px} |  |
| https://4geeks.com/landing/ai-engineering-next-dates | site_4geeks-com/landings/ai-engineering-next-dates/draft.en.yml | en draft (draft) | sections[2] | BentoCardsDefault | {desktop:sm none} | {mobile:80px lg, desktop:112px xl} | overflow-hidden became overflow-x-clip so card shadows still show in the moved padding. |
| https://4geeks.com/landing/ai-engineering-next-dates | site_4geeks-com/landings/ai-engineering-next-dates/draft.en.yml | en draft (draft) | sections[3] | CareerSupportExplainDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/ai-engineering-next-dates | site_4geeks-com/landings/ai-engineering-next-dates/draft.en.yml | en draft (draft) | sections[7] | CommunitySupportDefault | {desktop:sm} | {desktop:72px} |  |
| https://4geeks.com/landing/ai-engineering-next-dates | site_4geeks-com/landings/ai-engineering-next-dates/draft.en.yml | en draft (draft) | sections[9] | TestimonialsSlideDefault | {desktop:sm} | {mobile:lg, desktop:80px} |  |
| https://4geeks.com/landing/ai-engineering-next-cohort https://4geeks.com/landing/ai-engineering-next-cohort | site_4geeks-com/landings/ai-engineering-next-start-dates/_common.yml |  all locales | sections[1] | GraduatesStatsDefault | {desktop:none sm} | {mobile:lg 80px, desktop:xl 112px} |  |
| https://4geeks.com/landing/ai-engineering-next-cohort https://4geeks.com/landing/ai-engineering-next-cohort | site_4geeks-com/landings/ai-engineering-next-start-dates/_common.yml |  all locales | sections[2] | BentoCardsDefault | {desktop:sm none} | {mobile:80px lg, desktop:112px xl} | overflow-hidden became overflow-x-clip so card shadows still show in the moved padding. |
| https://4geeks.com/landing/ai-engineering-next-cohort https://4geeks.com/landing/ai-engineering-next-cohort | site_4geeks-com/landings/ai-engineering-next-start-dates/_common.yml |  all locales | sections[3] | CareerSupportExplainDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/ai-engineering-next-cohort https://4geeks.com/landing/ai-engineering-next-cohort | site_4geeks-com/landings/ai-engineering-next-start-dates/_common.yml |  all locales | sections[7] | CommunitySupportDefault | {desktop:sm} | {desktop:72px} |  |
| https://4geeks.com/landing/ai-engineering-next-cohort https://4geeks.com/landing/ai-engineering-next-cohort | site_4geeks-com/landings/ai-engineering-next-start-dates/_common.yml |  all locales | sections[9] | TestimonialsSlideDefault | {desktop:sm} | {mobile:lg, desktop:80px} |  |
| https://4geeks.com/landing/ai-engineering-next-start-dates | site_4geeks-com/landings/ai-engineering-next-start-dates/draft.en.yml | en draft (draft) | sections[1] | GraduatesStatsDefault | {desktop:none sm} | {mobile:lg 80px, desktop:xl 112px} |  |
| https://4geeks.com/landing/ai-engineering-next-start-dates | site_4geeks-com/landings/ai-engineering-next-start-dates/draft.en.yml | en draft (draft) | sections[2] | BentoCardsDefault | {desktop:sm none} | {mobile:80px lg, desktop:112px xl} | overflow-hidden became overflow-x-clip so card shadows still show in the moved padding. |
| https://4geeks.com/landing/ai-engineering-next-start-dates | site_4geeks-com/landings/ai-engineering-next-start-dates/draft.en.yml | en draft (draft) | sections[3] | CareerSupportExplainDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/ai-engineering-next-start-dates | site_4geeks-com/landings/ai-engineering-next-start-dates/draft.en.yml | en draft (draft) | sections[7] | CommunitySupportDefault | {desktop:sm} | {desktop:72px} |  |
| https://4geeks.com/landing/ai-engineering-next-start-dates | site_4geeks-com/landings/ai-engineering-next-start-dates/draft.en.yml | en draft (draft) | sections[9] | TestimonialsSlideDefault | {desktop:sm} | {mobile:lg, desktop:80px} |  |
| https://4geeks.com/landing/ai-engineering-next-start-dates | site_4geeks-com/landings/ai-engineering-next-start-dates/en.yml | en live | sections[2] | GraduatesStatsDefault | {desktop:none sm} | {mobile:lg 80px, desktop:xl 112px} |  |
| https://4geeks.com/landing/ai-engineering-next-start-dates | site_4geeks-com/landings/ai-engineering-next-start-dates/en.yml | en live | sections[3] | BentoCardsDefault | {desktop:sm none} | {mobile:80px lg, desktop:112px xl} | overflow-hidden became overflow-x-clip so card shadows still show in the moved padding. |
| https://4geeks.com/landing/ai-engineering-next-start-dates | site_4geeks-com/landings/ai-engineering-next-start-dates/en.yml | en live | sections[4] | CareerSupportExplainDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/ai-engineering-next-start-dates | site_4geeks-com/landings/ai-engineering-next-start-dates/en.yml | en live | sections[8] | CommunitySupportDefault | {desktop:sm} | {desktop:72px} |  |
| https://4geeks.com/landing/ai-engineering-next-start-dates | site_4geeks-com/landings/ai-engineering-next-start-dates/en.yml | en live | sections[10] | TestimonialsSlideDefault | {desktop:sm} | {mobile:lg, desktop:80px} |  |
| https://4geeks.com/landing/ai-engineering-next-start-dates | site_4geeks-com/landings/ai-engineering-next-start-dates/schema-org-fix.en.yml | en variant/draft "schema-org-fix" | sections[2] | GraduatesStatsDefault | {desktop:none sm} | {mobile:lg 80px, desktop:xl 112px} |  |
| https://4geeks.com/landing/ai-engineering-next-start-dates | site_4geeks-com/landings/ai-engineering-next-start-dates/schema-org-fix.en.yml | en variant/draft "schema-org-fix" | sections[3] | BentoCardsDefault | {desktop:sm none} | {mobile:80px lg, desktop:112px xl} | overflow-hidden became overflow-x-clip so card shadows still show in the moved padding. |
| https://4geeks.com/landing/ai-engineering-next-start-dates | site_4geeks-com/landings/ai-engineering-next-start-dates/schema-org-fix.en.yml | en variant/draft "schema-org-fix" | sections[4] | CareerSupportExplainDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/ai-engineering-next-start-dates | site_4geeks-com/landings/ai-engineering-next-start-dates/schema-org-fix.en.yml | en variant/draft "schema-org-fix" | sections[8] | CommunitySupportDefault | {desktop:sm} | {desktop:72px} |  |
| https://4geeks.com/landing/ai-engineering-next-start-dates | site_4geeks-com/landings/ai-engineering-next-start-dates/schema-org-fix.en.yml | en variant/draft "schema-org-fix" | sections[10] | TestimonialsSlideDefault | {desktop:sm} | {mobile:lg, desktop:80px} |  |
| https://4geeks.com/landing/ai-engineering-no-tech-background | site_4geeks-com/landings/ai-engineering-no-tech-background/draft.en.yml | en draft (draft) | sections[1] | GraduatesStatsDefault | {desktop:none sm} | {mobile:lg 80px, desktop:xl 112px} |  |
| https://4geeks.com/landing/ai-engineering-no-tech-background | site_4geeks-com/landings/ai-engineering-no-tech-background/draft.en.yml | en draft (draft) | sections[2] | BentoCardsDefault | {desktop:sm none} | {mobile:80px lg, desktop:112px xl} | overflow-hidden became overflow-x-clip so card shadows still show in the moved padding. |
| https://4geeks.com/landing/ai-engineering-no-tech-background | site_4geeks-com/landings/ai-engineering-no-tech-background/draft.en.yml | en draft (draft) | sections[3] | CareerSupportExplainDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/ai-engineering-no-tech-background | site_4geeks-com/landings/ai-engineering-no-tech-background/draft.en.yml | en draft (draft) | sections[7] | CommunitySupportDefault | {desktop:sm} | {desktop:72px} |  |
| https://4geeks.com/landing/ai-engineering-no-tech-background | site_4geeks-com/landings/ai-engineering-no-tech-background/draft.en.yml | en draft (draft) | sections[9] | TestimonialsSlideDefault | {desktop:sm} | {mobile:lg, desktop:80px} |  |
| https://4geeks.com/landing/ai-engineering-no-tech-background | site_4geeks-com/landings/ai-engineering-no-tech-background/en.yml | en live | sections[2] | GraduatesStatsDefault | {desktop:none sm} | {mobile:lg 80px, desktop:xl 112px} |  |
| https://4geeks.com/landing/ai-engineering-no-tech-background | site_4geeks-com/landings/ai-engineering-no-tech-background/en.yml | en live | sections[3] | BentoCardsDefault | {desktop:sm none} | {mobile:80px lg, desktop:112px xl} | overflow-hidden became overflow-x-clip so card shadows still show in the moved padding. |
| https://4geeks.com/landing/ai-engineering-no-tech-background | site_4geeks-com/landings/ai-engineering-no-tech-background/en.yml | en live | sections[4] | CareerSupportExplainDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/ai-engineering-no-tech-background | site_4geeks-com/landings/ai-engineering-no-tech-background/en.yml | en live | sections[8] | CommunitySupportDefault | {desktop:sm} | {desktop:72px} |  |
| https://4geeks.com/landing/ai-engineering-no-tech-background | site_4geeks-com/landings/ai-engineering-no-tech-background/en.yml | en live | sections[10] | TestimonialsSlideDefault | {desktop:sm} | {mobile:lg, desktop:80px} |  |
| https://4geeks.com/landing/ai-engineering-program-ad-co https://4geeks.com/landing/ai-engineering-program-ad-co | site_4geeks-com/landings/ai-engineering-program-ad-co/_common.yml |  all locales | sections[2] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/ai-engineering-program-ad-co https://4geeks.com/landing/ai-engineering-program-ad-co | site_4geeks-com/landings/ai-engineering-program-ad-co/_common.yml |  all locales | sections[5] | CareerSupportExplainDefault | {desktop:none sm} | {mobile:48px lg, desktop:lg 80px} |  |
| https://4geeks.com/landing/ai-engineering-program-ad-co https://4geeks.com/landing/ai-engineering-program-ad-co | site_4geeks-com/landings/ai-engineering-program-ad-co/_common.yml |  all locales | sections[7] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/ai-engineering-program-ad-co https://4geeks.com/landing/ai-engineering-program-ad-co | site_4geeks-com/landings/ai-engineering-program-ad-co/_common.yml |  all locales | sections[9] | TestimonialsSlideDefault | {desktop:none} | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/ai-engineering-program-ad-co | site_4geeks-com/landings/ai-engineering-program-ad-co/draft.es.yml | es draft (draft) | sections[2] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/ai-engineering-program-ad-co | site_4geeks-com/landings/ai-engineering-program-ad-co/draft.es.yml | es draft (draft) | sections[5] | CareerSupportExplainDefault | {desktop:none sm} | {mobile:48px lg, desktop:lg 80px} |  |
| https://4geeks.com/landing/ai-engineering-program-ad-co | site_4geeks-com/landings/ai-engineering-program-ad-co/draft.es.yml | es draft (draft) | sections[7] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/ai-engineering-program-ad-co | site_4geeks-com/landings/ai-engineering-program-ad-co/draft.es.yml | es draft (draft) | sections[9] | TestimonialsSlideDefault | {desktop:none} | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/ai-engineering-program-ad-co | site_4geeks-com/landings/ai-engineering-program-ad-co/es.yml | es live | sections[2] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/ai-engineering-program-ad-co | site_4geeks-com/landings/ai-engineering-program-ad-co/es.yml | es live | sections[5] | CareerSupportExplainDefault | {desktop:none sm} | {mobile:48px lg, desktop:lg 80px} |  |
| https://4geeks.com/landing/ai-engineering-program-ad-co | site_4geeks-com/landings/ai-engineering-program-ad-co/es.yml | es live | sections[7] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/ai-engineering-program-ad-co | site_4geeks-com/landings/ai-engineering-program-ad-co/es.yml | es live | sections[9] | TestimonialsSlideDefault | {desktop:none} | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/ai-engineering-program-ad-costarica | site_4geeks-com/landings/ai-engineering-program-ad-costarica/draft.en.yml | en draft (draft) | sections[2] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/ai-engineering-program-ad-costarica | site_4geeks-com/landings/ai-engineering-program-ad-costarica/draft.en.yml | en draft (draft) | sections[5] | CareerSupportExplainDefault | {desktop:none sm} | {mobile:48px lg, desktop:lg 80px} |  |
| https://4geeks.com/landing/ai-engineering-program-ad-costarica | site_4geeks-com/landings/ai-engineering-program-ad-costarica/draft.en.yml | en draft (draft) | sections[7] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/ai-engineering-program-ad-costarica | site_4geeks-com/landings/ai-engineering-program-ad-costarica/draft.en.yml | en draft (draft) | sections[9] | TestimonialsSlideDefault | {desktop:none} | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/ai-engineering-program-ad-cr | site_4geeks-com/landings/ai-engineering-program-ad-cr/draft.es.yml | es draft (draft) | sections[2] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/ai-engineering-program-ad-cr | site_4geeks-com/landings/ai-engineering-program-ad-cr/draft.es.yml | es draft (draft) | sections[5] | CareerSupportExplainDefault | {desktop:none sm} | {mobile:48px lg, desktop:lg 80px} |  |
| https://4geeks.com/landing/ai-engineering-program-ad-cr | site_4geeks-com/landings/ai-engineering-program-ad-cr/draft.es.yml | es draft (draft) | sections[7] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/ai-engineering-program-ad-cr | site_4geeks-com/landings/ai-engineering-program-ad-cr/draft.es.yml | es draft (draft) | sections[9] | TestimonialsSlideDefault | {desktop:none} | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/ai-engineering-program-ad-es | site_4geeks-com/landings/ai-engineering-program-ad-es/es.yml | es live | sections[2] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/ai-engineering-program-ad-es | site_4geeks-com/landings/ai-engineering-program-ad-es/es.yml | es live | sections[4] | CareerSupportExplainDefault | {desktop:none sm} | {mobile:48px lg, desktop:lg 80px} |  |
| https://4geeks.com/landing/ai-engineering-program-ad-es | site_4geeks-com/landings/ai-engineering-program-ad-es/es.yml | es live | sections[6] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/ai-engineering-program-ad-es | site_4geeks-com/landings/ai-engineering-program-ad-es/es.yml | es live | sections[9] | TestimonialsSlideDefault | {desktop:none} | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/ai-engineering-program-ad-mx | site_4geeks-com/landings/ai-engineering-program-ad-mx/add-schema-org.es.yml | es variant/draft "add-schema-org" | sections[5] | FeaturesGridStatsTextCard | {mobile:none md, desktop:none md} | {mobile:48px 80px, desktop:48px 80px} |  |
| https://4geeks.com/landing/ai-engineering-program-ad-mx | site_4geeks-com/landings/ai-engineering-program-ad-mx/add-schema-org.es.yml | es variant/draft "add-schema-org" | sections[7] | CareerSupportExplainDefault | {desktop:none sm} | {mobile:48px lg, desktop:lg 80px} |  |
| https://4geeks.com/landing/ai-engineering-program-ad-mx | site_4geeks-com/landings/ai-engineering-program-ad-mx/add-schema-org.es.yml | es variant/draft "add-schema-org" | sections[10] | TestimonialsSlideDefault | {desktop:none} | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/ai-engineering-program-ad-mx | site_4geeks-com/landings/ai-engineering-program-ad-mx/draft.es.yml | es draft (draft) | sections[2] | NumberedStepsBubbleText | {desktop:sm} | {desktop:80px} |  |
| https://4geeks.com/landing/ai-engineering-program-ad-mx | site_4geeks-com/landings/ai-engineering-program-ad-mx/draft.es.yml | es draft (draft) | sections[4] | FeaturesGridStatsTextCard | {mobile:none md, desktop:none md} | {mobile:48px 80px, desktop:48px 80px} |  |
| https://4geeks.com/landing/ai-engineering-program-ad-mx | site_4geeks-com/landings/ai-engineering-program-ad-mx/draft.es.yml | es draft (draft) | sections[8] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/ai-engineering-program-ad-mx | site_4geeks-com/landings/ai-engineering-program-ad-mx/es.yml | es live | sections[5] | FeaturesGridStatsTextCard | {mobile:none md, desktop:none md} | {mobile:48px 80px, desktop:48px 80px} |  |
| https://4geeks.com/landing/ai-engineering-program-ad-mx | site_4geeks-com/landings/ai-engineering-program-ad-mx/es.yml | es live | sections[7] | CareerSupportExplainDefault | {desktop:none sm} | {mobile:48px lg, desktop:lg 80px} |  |
| https://4geeks.com/landing/ai-engineering-program-ad-mx | site_4geeks-com/landings/ai-engineering-program-ad-mx/es.yml | es live | sections[10] | TestimonialsSlideDefault | {desktop:none} | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/ai-engineering-program-chile | site_4geeks-com/landings/ai-engineering-program-chile/draft.es.yml | es draft (draft) | sections[2] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/ai-engineering-program-chile | site_4geeks-com/landings/ai-engineering-program-chile/draft.es.yml | es draft (draft) | sections[3] | FeaturesQuadDefault | {desktop:sm none} | {desktop:72px 56px} |  |
| https://4geeks.com/landing/ai-engineering-program-chile | site_4geeks-com/landings/ai-engineering-program-chile/draft.es.yml | es draft (draft) | sections[6] | CareerSupportExplainDefault | {desktop:none sm} | {mobile:48px lg, desktop:lg 80px} |  |
| https://4geeks.com/landing/ai-engineering-program-chile | site_4geeks-com/landings/ai-engineering-program-chile/draft.es.yml | es draft (draft) | sections[8] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/ai-engineering-program-chile | site_4geeks-com/landings/ai-engineering-program-chile/draft.es.yml | es draft (draft) | sections[10] | TestimonialsSlideDefault | {desktop:none} | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/ai-engineering-program-chile | site_4geeks-com/landings/ai-engineering-program-chile/es.yml | es live | sections[2] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/ai-engineering-program-chile | site_4geeks-com/landings/ai-engineering-program-chile/es.yml | es live | sections[3] | FeaturesQuadDefault | (unset) | {desktop:56px} |  |
| https://4geeks.com/landing/ai-engineering-program-chile | site_4geeks-com/landings/ai-engineering-program-chile/es.yml | es live | sections[6] | CareerSupportExplainDefault | {desktop:none sm} | {mobile:48px lg, desktop:lg 80px} |  |
| https://4geeks.com/landing/ai-engineering-program-chile | site_4geeks-com/landings/ai-engineering-program-chile/es.yml | es live | sections[8] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/ai-engineering-program-chile | site_4geeks-com/landings/ai-engineering-program-chile/es.yml | es live | sections[10] | TestimonialsSlideDefault | {desktop:none} | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/ai-engineering-python-sql-ad-chile | site_4geeks-com/landings/ai-engineering-python-sql-ad-chile/es.yml | es live | sections[2] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/ai-engineering-python-sql-ad-chile | site_4geeks-com/landings/ai-engineering-python-sql-ad-chile/es.yml | es live | sections[3] | FeaturesQuadDefault | (unset) | {desktop:56px} |  |
| https://4geeks.com/landing/ai-engineering-python-sql-ad-chile | site_4geeks-com/landings/ai-engineering-python-sql-ad-chile/es.yml | es live | sections[6] | CareerSupportExplainDefault | {desktop:none sm} | {mobile:48px lg, desktop:lg 80px} |  |
| https://4geeks.com/landing/ai-engineering-python-sql-ad-chile | site_4geeks-com/landings/ai-engineering-python-sql-ad-chile/es.yml | es live | sections[8] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/ai-engineering-python-sql-ad-chile | site_4geeks-com/landings/ai-engineering-python-sql-ad-chile/es.yml | es live | sections[10] | TestimonialsSlideDefault | {desktop:none} | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/ai-engineering-salaries | site_4geeks-com/landings/ai-engineering-salaries/en.yml | en live | sections[2] | GraduatesStatsDefault | {desktop:none sm} | {mobile:lg 80px, desktop:xl 112px} |  |
| https://4geeks.com/landing/ai-engineering-salaries | site_4geeks-com/landings/ai-engineering-salaries/en.yml | en live | sections[3] | BentoCardsDefault | {desktop:sm none} | {mobile:80px lg, desktop:112px xl} | overflow-hidden became overflow-x-clip so card shadows still show in the moved padding. |
| https://4geeks.com/landing/ai-engineering-salaries | site_4geeks-com/landings/ai-engineering-salaries/en.yml | en live | sections[4] | CareerSupportExplainDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/ai-engineering-salaries | site_4geeks-com/landings/ai-engineering-salaries/en.yml | en live | sections[8] | CommunitySupportDefault | {desktop:sm} | {desktop:72px} |  |
| https://4geeks.com/landing/ai-engineering-salaries | site_4geeks-com/landings/ai-engineering-salaries/en.yml | en live | sections[10] | TestimonialsSlideDefault | {desktop:sm} | {mobile:lg, desktop:80px} |  |
| https://4geeks.com/landing/ai-engineering-spain | site_4geeks-com/landings/ai-engineering-spain/add-schema-org.es.yml | es variant/draft "add-schema-org" | sections[5] | FeaturesGridStatsTextCard | {mobile:none md, desktop:none md} | {mobile:48px 80px, desktop:48px 80px} |  |
| https://4geeks.com/landing/ai-engineering-spain | site_4geeks-com/landings/ai-engineering-spain/add-schema-org.es.yml | es variant/draft "add-schema-org" | sections[11] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/ai-engineering-spain | site_4geeks-com/landings/ai-engineering-spain/es.yml | es live | sections[5] | FeaturesGridStatsTextCard | {mobile:none md, desktop:none md} | {mobile:48px 80px, desktop:48px 80px} |  |
| https://4geeks.com/landing/ai-engineering-spain | site_4geeks-com/landings/ai-engineering-spain/es.yml | es live | sections[11] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/ai-engineering-universidades | site_4geeks-com/landings/ai-engineering-universidades/es.yml | es live | sections[3] | FeaturesGridStatsTextCard | {mobile:none md, desktop:none} | {mobile:48px 80px, desktop:48px} |  |
| https://4geeks.com/landing/ai-engineering-universidades | site_4geeks-com/landings/ai-engineering-universidades/es.yml | es live | sections[9] | TestimonialsSlideDefault | {desktop:none} | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/ai-engineering-usa | site_4geeks-com/landings/ai-engineering-usa/en.yml | en live | sections[2] | BentoCardsDefault | {desktop:sm none} | {mobile:80px lg, desktop:112px xl} | overflow-hidden became overflow-x-clip so card shadows still show in the moved padding. |
| https://4geeks.com/landing/ai-engineering-usa | site_4geeks-com/landings/ai-engineering-usa/en.yml | en live | sections[4] | CareerSupportExplainDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/ai-engineering-usa | site_4geeks-com/landings/ai-engineering-usa/en.yml | en live | sections[5] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/ai-engineering-usa | site_4geeks-com/landings/ai-engineering-usa/en.yml | en live | sections[7] | FeaturesGridStatsTextCard | {mobile:none md, desktop:none md} | {mobile:48px 80px, desktop:48px 80px} |  |
| https://4geeks.com/landing/ai-engineering-usa | site_4geeks-com/landings/ai-engineering-usa/en.yml | en live | sections[8] | GraduatesStatsDefault | {desktop:none sm} | {mobile:lg 80px, desktop:xl 112px} |  |
| https://4geeks.com/landing/ai-engineering-usa | site_4geeks-com/landings/ai-engineering-usa/en.yml | en live | sections[11] | TestimonialsSlideDefault | {desktop:sm} | {mobile:lg, desktop:80px} |  |
| https://4geeks.com/landing/ai-flex-latam | site_4geeks-com/landings/ai-flex-latam/es.yml | es live | sections[3] | FeaturesQuadDefault | (unset) | {desktop:56px} |  |
| https://4geeks.com/landing/ai-flex-latam | site_4geeks-com/landings/ai-flex-latam/es.yml | es live | sections[12] | HumanAndAiDuoDefault | {mobile:sm none, desktop:md none} | {mobile:72px 56px, desktop:88px 56px} |  |
| https://4geeks.com/landing/ai-flex-latam | site_4geeks-com/landings/ai-flex-latam/es.yml | es live | sections[14] | PricingPlanCards | {desktop:sm} | {mobile:48px, desktop:72px} | Was py-8 sm:py-14 (640px). The wrapper switches at 768px, so 640-767px wide screens now get 32px instead of 56px. |
| https://4geeks.com/landing/ai-fluency | site_4geeks-com/landings/ai-fluency/en.yml | en live | sections[5] | BentoCardsDefault | {desktop:sm none} | {mobile:80px lg, desktop:112px xl} | overflow-hidden became overflow-x-clip so card shadows still show in the moved padding. |
| https://4geeks.com/landing/ai-fluency | site_4geeks-com/landings/ai-fluency/en.yml | en live | sections[7] | HumanAndAiDuoDefault | {mobile:sm none, desktop:md none} | {mobile:72px 56px, desktop:88px 56px} |  |
| https://4geeks.com/landing/ai-fluency | site_4geeks-com/landings/ai-fluency/es.yml | es live | sections[3] | FeaturesQuadDefault | (unset) | {desktop:56px} |  |
| https://4geeks.com/landing/ai-fluency | site_4geeks-com/landings/ai-fluency/es.yml | es live | sections[9] | HumanAndAiDuoDefault | {desktop:md none, mobile:sm none} | {mobile:72px 56px, desktop:88px 56px} |  |
| https://4geeks.com/landing/ai-fluency-cut-busywork | site_4geeks-com/landings/ai-fluency-cut-busywork/en.yml | en live | sections[5] | BentoCardsDefault | {desktop:sm none} | {mobile:80px lg, desktop:112px xl} | overflow-hidden became overflow-x-clip so card shadows still show in the moved padding. |
| https://4geeks.com/landing/ai-fluency-cut-busywork | site_4geeks-com/landings/ai-fluency-cut-busywork/en.yml | en live | sections[7] | HumanAndAiDuoDefault | {mobile:sm none, desktop:md none} | {mobile:72px 56px, desktop:88px 56px} |  |
| https://4geeks.com/landing/ai-fluency-cut-busywork | site_4geeks-com/landings/ai-fluency-cut-busywork/signup-card-hero.en.yml | en variant/draft "signup-card-hero" | sections[5] | BentoCardsDefault | {desktop:sm none} | {mobile:80px lg, desktop:112px xl} | overflow-hidden became overflow-x-clip so card shadows still show in the moved padding. |
| https://4geeks.com/landing/ai-fluency-cut-busywork | site_4geeks-com/landings/ai-fluency-cut-busywork/signup-card-hero.en.yml | en variant/draft "signup-card-hero" | sections[7] | HumanAndAiDuoDefault | {desktop:md none, mobile:sm none} | {mobile:72px 56px, desktop:88px 56px} |  |
| https://4geeks.com/landing/ai-fluency-cv-vsl | site_4geeks-com/landings/ai-fluency-cv-vsl/es.yml | es live | sections[5] | FeaturesQuadDefault | (unset) | {desktop:56px} |  |
| https://4geeks.com/landing/ai-fluency-cv-vsl | site_4geeks-com/landings/ai-fluency-cv-vsl/es.yml | es live | sections[6] | FeaturesGridTextOnly | (unset) | {desktop:56px} |  |
| https://4geeks.com/landing/ai-fluency-es | site_4geeks-com/landings/ai-fluency-es/es.yml | es live | sections[3] | FeaturesQuadDefault | (unset) | {desktop:56px} |  |
| https://4geeks.com/landing/ai-fluency-es | site_4geeks-com/landings/ai-fluency-es/es.yml | es live | sections[9] | HumanAndAiDuoDefault | {desktop:md none, mobile:sm none} | {mobile:72px 56px, desktop:88px 56px} |  |
| https://4geeks.com/landing/ai-fluency-event-registration | site_4geeks-com/landings/ai-fluency-event-registration/draft.en.yml | en draft (draft) | sections[3] | HumanAndAiDuoDefault | {mobile:sm none, desktop:none} | {mobile:72px 56px, desktop:56px} |  |
| https://4geeks.com/landing/ai-fluency-event-registration | site_4geeks-com/landings/ai-fluency-event-registration/en.yml | en live | sections[4] | HumanAndAiDuoDefault | {mobile:sm none, desktop:none} | {mobile:72px 56px, desktop:56px} |  |
| https://4geeks.com/landing/ai-fluency-for-marketing | site_4geeks-com/landings/ai-fluency-for-marketing/en.yml | en live | sections[3] | FeaturesQuadDefault | (unset) | {desktop:56px} |  |
| https://4geeks.com/landing/ai-fluency-for-marketing | site_4geeks-com/landings/ai-fluency-for-marketing/en.yml | en live | sections[9] | HumanAndAiDuoDefault | {desktop:md none, mobile:sm none} | {mobile:72px 56px, desktop:88px 56px} |  |
| https://4geeks.com/landing/ai-fluency-resume-vsl | site_4geeks-com/landings/ai-fluency-resume-vsl/en.yml | en live | sections[5] | FeaturesQuadDefault | (unset) | {desktop:56px} |  |
| https://4geeks.com/landing/ai-fluency-resume-vsl | site_4geeks-com/landings/ai-fluency-resume-vsl/en.yml | en live | sections[6] | FeaturesGridTextOnly | (unset) | {desktop:56px} |  |
| https://4geeks.com/landing/ai-fluency-salary-premium | site_4geeks-com/landings/ai-fluency-salary-premium/en.yml | en live | sections[5] | BentoCardsDefault | {desktop:sm none} | {mobile:80px lg, desktop:112px xl} | overflow-hidden became overflow-x-clip so card shadows still show in the moved padding. |
| https://4geeks.com/landing/ai-fluency-salary-premium | site_4geeks-com/landings/ai-fluency-salary-premium/en.yml | en live | sections[7] | HumanAndAiDuoDefault | {mobile:sm none, desktop:md none} | {mobile:72px 56px, desktop:88px 56px} |  |
| https://4geeks.com/landing/ai-fluency-vsl | site_4geeks-com/landings/ai-fluency-vsl/en.yml | en live | sections[5] | FeaturesQuadDefault | (unset) | {desktop:56px} |  |
| https://4geeks.com/landing/ai-fluency-vsl | site_4geeks-com/landings/ai-fluency-vsl/en.yml | en live | sections[6] | FeaturesGridTextOnly | (unset) | {desktop:56px} |  |
| https://4geeks.com/landing/ai-fluency-vsl-businessowners | site_4geeks-com/landings/ai-fluency-vsl-businessowners/en.yml | en live | sections[5] | FeaturesQuadDefault | (unset) | {desktop:56px} |  |
| https://4geeks.com/landing/ai-fluency-vsl-businessowners | site_4geeks-com/landings/ai-fluency-vsl-businessowners/en.yml | en live | sections[6] | FeaturesGridTextOnly | (unset) | {desktop:56px} |  |
| https://4geeks.com/landing/ai-fluency-vsl-empresas | site_4geeks-com/landings/ai-fluency-vsl-empresas/es.yml | es live | sections[5] | FeaturesQuadDefault | (unset) | {desktop:56px} |  |
| https://4geeks.com/landing/ai-fluency-vsl-empresas | site_4geeks-com/landings/ai-fluency-vsl-empresas/es.yml | es live | sections[6] | FeaturesGridTextOnly | (unset) | {desktop:56px} |  |
| https://4geeks.com/landing/ai-fluency-vsl-f1 | site_4geeks-com/landings/ai-fluency-vsl-f1/draft.es.yml | es draft (draft) | sections[4] | FeaturesQuadDefault | {desktop:none sm} | {desktop:56px 72px} |  |
| https://4geeks.com/landing/ai-fluency-vsl-gana-hasta-un-62-mas | site_4geeks-com/landings/ai-fluency-vsl-gana-hasta-un-62-mas/es.yml | es live | sections[5] | FeaturesQuadDefault | (unset) | {desktop:56px} |  |
| https://4geeks.com/landing/ai-fluency-vsl-gana-hasta-un-62-mas | site_4geeks-com/landings/ai-fluency-vsl-gana-hasta-un-62-mas/es.yml | es live | sections[6] | FeaturesGridTextOnly | (unset) | {desktop:56px} |  |
| https://4geeks.com/landing/ai-fluency-vsl-main | site_4geeks-com/landings/ai-fluency-vsl-main/draft.es.yml | es draft (draft) | sections[4] | FeaturesQuadDefault | {desktop:none sm} | {desktop:56px 72px} |  |
| https://4geeks.com/landing/ai-fluency-for-sales | site_4geeks-com/landings/ai-fluent-for-sales/en.yml | en live | sections[3] | FeaturesQuadDefault | (unset) | {desktop:56px} |  |
| https://4geeks.com/landing/ai-fluency-for-sales | site_4geeks-com/landings/ai-fluent-for-sales/en.yml | en live | sections[9] | HumanAndAiDuoDefault | {mobile:sm none, desktop:md none} | {mobile:72px 56px, desktop:88px 56px} |  |
| https://4geeks.com/landing/ai-software-engineering | site_4geeks-com/landings/ai-software-engineering/draft.en.yml | en draft (draft) | sections[3] | CareerSupportExplainDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/ai-software-engineering | site_4geeks-com/landings/ai-software-engineering/draft.en.yml | en draft (draft) | sections[4] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/ai-software-engineering | site_4geeks-com/landings/ai-software-engineering/draft.en.yml | en draft (draft) | sections[6] | FeaturesGridStatsTextCard | {mobile:none md, desktop:none md} | {mobile:48px 80px, desktop:48px 80px} |  |
| https://4geeks.com/landing/ai-software-engineering | site_4geeks-com/landings/ai-software-engineering/draft.en.yml | en draft (draft) | sections[7] | GraduatesStatsDefault | {desktop:none sm} | {mobile:lg 80px, desktop:xl 112px} |  |
| https://4geeks.com/landing/ai-software-engineering | site_4geeks-com/landings/ai-software-engineering/draft.en.yml | en draft (draft) | sections[10] | TestimonialsSlideDefault | {desktop:sm} | {mobile:lg, desktop:80px} |  |
| https://4geeks.com/landing/bootcamp-program-ad-es | site_4geeks-com/landings/bootcamp-program-ad-es/ai-engineering-dream-roi.es.yml | es variant/draft "ai-engineering-dream-roi" | sections[2] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/bootcamp-program-ad-es | site_4geeks-com/landings/bootcamp-program-ad-es/ai-engineering-dream-roi.es.yml | es variant/draft "ai-engineering-dream-roi" | sections[5] | CareerSupportExplainDefault | {desktop:none sm} | {mobile:48px lg, desktop:lg 80px} |  |
| https://4geeks.com/landing/bootcamp-program-ad-es | site_4geeks-com/landings/bootcamp-program-ad-es/ai-engineering-dream-roi.es.yml | es variant/draft "ai-engineering-dream-roi" | sections[7] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/bootcamp-program-ad-es | site_4geeks-com/landings/bootcamp-program-ad-es/ai-engineering-dream-roi.es.yml | es variant/draft "ai-engineering-dream-roi" | sections[9] | TestimonialsSlideDefault | {desktop:none} | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/bootcamp-program-ad-es | site_4geeks-com/landings/bootcamp-program-ad-es/es.yml | es live | sections[3] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/bootcamp-program-ad-es | site_4geeks-com/landings/bootcamp-program-ad-es/es.yml | es live | sections[5] | CareerSupportExplainDefault | {desktop:none sm} | {mobile:48px lg, desktop:lg 80px} |  |
| https://4geeks.com/landing/bootcamp-program-ad-es | site_4geeks-com/landings/bootcamp-program-ad-es/es.yml | es live | sections[7] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/bootcamp-program-ad-es | site_4geeks-com/landings/bootcamp-program-ad-es/es.yml | es live | sections[9] | TestimonialsSlideDefault | {desktop:none} | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/bootcamps-espana-comparativa-spain | site_4geeks-com/landings/bootcamps-espana-comparativa-spain/draft.es.yml | es draft (draft) | sections[8] | TextBlockDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/borrame-de-chile | site_4geeks-com/landings/borrame-de-chile/draft.es.yml | es draft (draft) | sections[4] | FeaturesGridStatsTextCard | {mobile:none md, desktop:none md} | {mobile:48px 80px, desktop:48px 80px} |  |
| https://4geeks.com/landing/borrame-de-chile | site_4geeks-com/landings/borrame-de-chile/draft.es.yml | es draft (draft) | sections[10] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/carne-joven | site_4geeks-com/landings/carne-joven/es.yml | es live | sections[5] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/ciberseguridad-ads-ar | site_4geeks-com/landings/ciberseguridad-ads-ar/es.yml | es live | sections[2] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/ciberseguridad-ads-ar | site_4geeks-com/landings/ciberseguridad-ads-ar/es.yml | es live | sections[5] | CareerSupportExplainDefault | {desktop:none sm} | {mobile:48px lg, desktop:lg 80px} |  |
| https://4geeks.com/landing/ciberseguridad-ads-ar | site_4geeks-com/landings/ciberseguridad-ads-ar/es.yml | es live | sections[7] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/ciberseguridad-ads-ar | site_4geeks-com/landings/ciberseguridad-ads-ar/es.yml | es live | sections[10] | TestimonialsSlideDefault | {desktop:none} | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/ciberseguridad-ads-es | site_4geeks-com/landings/ciberseguridad-ads-es/es.yml | es live | sections[2] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/ciberseguridad-ads-es | site_4geeks-com/landings/ciberseguridad-ads-es/es.yml | es live | sections[5] | CareerSupportExplainDefault | {desktop:none sm} | {mobile:48px lg, desktop:lg 80px} |  |
| https://4geeks.com/landing/ciberseguridad-ads-es | site_4geeks-com/landings/ciberseguridad-ads-es/es.yml | es live | sections[7] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/ciberseguridad-ads-es | site_4geeks-com/landings/ciberseguridad-ads-es/es.yml | es live | sections[10] | TestimonialsSlideDefault | {desktop:none} | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/curso-analisis-datos-desde-cero-spain | site_4geeks-com/landings/curso-analisis-datos-desde-cero-spain/draft.es.yml | es draft (draft) | sections[4] | FeaturesGridStatsTextCard | {mobile:none md, desktop:none md} | {mobile:48px 80px, desktop:48px 80px} |  |
| https://4geeks.com/landing/curso-de-ia-espana | site_4geeks-com/landings/curso-de-ia-espana/es.yml | es live | sections[2] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/curso-de-ia-espana | site_4geeks-com/landings/curso-de-ia-espana/es.yml | es live | sections[5] | CareerSupportExplainDefault | {desktop:none sm} | {mobile:48px lg, desktop:lg 80px} |  |
| https://4geeks.com/landing/curso-de-ia-espana | site_4geeks-com/landings/curso-de-ia-espana/es.yml | es live | sections[7] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/curso-de-ia-espana | site_4geeks-com/landings/curso-de-ia-espana/es.yml | es live | sections[10] | TestimonialsSlideDefault | {desktop:none} | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/curso-de-inteligencia-artificial-espana | site_4geeks-com/landings/curso-de-inteligencia-artificial-espana/es.yml | es live | sections[2] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/curso-de-inteligencia-artificial-espana | site_4geeks-com/landings/curso-de-inteligencia-artificial-espana/es.yml | es live | sections[5] | CareerSupportExplainDefault | {desktop:none sm} | {mobile:48px lg, desktop:lg 80px} |  |
| https://4geeks.com/landing/curso-de-inteligencia-artificial-espana | site_4geeks-com/landings/curso-de-inteligencia-artificial-espana/es.yml | es live | sections[7] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/curso-de-inteligencia-artificial-espana | site_4geeks-com/landings/curso-de-inteligencia-artificial-espana/es.yml | es live | sections[10] | TestimonialsSlideDefault | {desktop:none} | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/curso-online-o-bootcamp-spain | site_4geeks-com/landings/curso-online-o-bootcamp-spain/draft.es.yml | es draft (draft) | sections[8] | TextBlockDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/data-analytics-ai-engineering-program-ad-costarica https://4geeks.com/landing/data-analytics-ai-engineering-program-ad-costarica | site_4geeks-com/landings/data-analytics-ai-engineering-program-ad-costarica/_common.yml |  all locales | sections[2] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/data-analytics-ai-engineering-program-ad-costarica https://4geeks.com/landing/data-analytics-ai-engineering-program-ad-costarica | site_4geeks-com/landings/data-analytics-ai-engineering-program-ad-costarica/_common.yml |  all locales | sections[5] | CareerSupportExplainDefault | {desktop:none sm} | {mobile:48px lg, desktop:lg 80px} |  |
| https://4geeks.com/landing/data-analytics-ai-engineering-program-ad-costarica https://4geeks.com/landing/data-analytics-ai-engineering-program-ad-costarica | site_4geeks-com/landings/data-analytics-ai-engineering-program-ad-costarica/_common.yml |  all locales | sections[7] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/data-analytics-ai-engineering-program-ad-costarica https://4geeks.com/landing/data-analytics-ai-engineering-program-ad-costarica | site_4geeks-com/landings/data-analytics-ai-engineering-program-ad-costarica/_common.yml |  all locales | sections[10] | TestimonialsSlideDefault | {desktop:none} | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/data-analytics-ai-engineering-program-ad-costarica | site_4geeks-com/landings/data-analytics-ai-engineering-program-ad-costarica/draft.es.yml | es draft (draft) | sections[2] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/data-analytics-ai-engineering-program-ad-costarica | site_4geeks-com/landings/data-analytics-ai-engineering-program-ad-costarica/draft.es.yml | es draft (draft) | sections[5] | CareerSupportExplainDefault | {desktop:none sm} | {mobile:48px lg, desktop:lg 80px} |  |
| https://4geeks.com/landing/data-analytics-ai-engineering-program-ad-costarica | site_4geeks-com/landings/data-analytics-ai-engineering-program-ad-costarica/draft.es.yml | es draft (draft) | sections[7] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/data-analytics-ai-engineering-program-ad-costarica | site_4geeks-com/landings/data-analytics-ai-engineering-program-ad-costarica/draft.es.yml | es draft (draft) | sections[10] | TestimonialsSlideDefault | {desktop:none} | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/data-science-ml-argentina | site_4geeks-com/landings/data-science-ml-argentina/es.yml | es live | sections[4] | FeaturesGridStatsTextCard | {desktop:none md, mobile:none md} | {mobile:48px 80px, desktop:48px 80px} |  |
| https://4geeks.com/landing/data-science-ml-spain | site_4geeks-com/landings/data-science-ml-spain/es.yml | es live | sections[3] | FeaturesGridStatsCards | (unset) | {desktop:48px} | background (unset) → light-blue-5; background now spans the full section width (section has maxWidth/paddingX/marginX) |
| https://4geeks.com/landing/data-science-ml-spain | site_4geeks-com/landings/data-science-ml-spain/es.yml | es live | sections[4] | FeaturesGridStatsTextCard | {mobile:none md, desktop:none md} | {mobile:48px 80px, desktop:48px 80px} |  |
| https://4geeks.com/landing/data-science-ml-spain | site_4geeks-com/landings/data-science-ml-spain/es.yml | es live | sections[5] | CareerSupportExplainDefault | {desktop:none sm} | {mobile:48px lg, desktop:lg 80px} |  |
| https://4geeks.com/landing/de-aprender-programacion-a-ser-ai-engineer-mexico | site_4geeks-com/landings/de-aprender-programacion-a-ser-ai-engineer-mexico/es.yml | es live | sections[5] | FeaturesGridStatsTextCard | {mobile:none md, desktop:none md} | {mobile:48px 80px, desktop:48px 80px} |  |
| https://4geeks.com/landing/de-aprender-programacion-a-ser-ai-engineer-mexico | site_4geeks-com/landings/de-aprender-programacion-a-ser-ai-engineer-mexico/es.yml | es live | sections[11] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/deleteme | site_4geeks-com/landings/deleteme/draft.es.yml | es draft (draft) | sections[2] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/deleteme | site_4geeks-com/landings/deleteme/draft.es.yml | es draft (draft) | sections[5] | CareerSupportExplainDefault | {desktop:none sm} | {mobile:48px lg, desktop:lg 80px} |  |
| https://4geeks.com/landing/deleteme | site_4geeks-com/landings/deleteme/draft.es.yml | es draft (draft) | sections[7] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/deleteme | site_4geeks-com/landings/deleteme/draft.es.yml | es draft (draft) | sections[10] | TestimonialsSlideDefault | {desktop:none} | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/draft-spain | site_4geeks-com/landings/draft-spain/es.yml | es live | sections[4] | GraduatesStatsDefault | {desktop:md none} | {mobile:xl lg, desktop:128px xl} |  |
| https://4geeks.com/landing/draft-spain | site_4geeks-com/landings/draft-spain/es.yml | es live | sections[8] | FeaturesGridStatsCards | {desktop:md none} | {desktop:80px 48px} |  |
| https://4geeks.com/landing/draft-spain | site_4geeks-com/landings/draft-spain/h1-es-no-estudies-ia-para-tener-un-diploma--est-diala-para-asegurar-el--nico-empleo-indestructible-del-futuro-.es.yml | es variant/draft "h1-es-no-estudies-ia-para-tener-un-diploma--est-diala-para-asegurar-el--nico-empleo-indestructible-del-futuro-" | sections[3] | GraduatesStatsDefault | {desktop:md none} | {mobile:xl lg, desktop:128px xl} |  |
| https://4geeks.com/landing/draft-spain | site_4geeks-com/landings/draft-spain/h1-es-no-estudies-ia-para-tener-un-diploma--est-diala-para-asegurar-el--nico-empleo-indestructible-del-futuro-.es.yml | es variant/draft "h1-es-no-estudies-ia-para-tener-un-diploma--est-diala-para-asegurar-el--nico-empleo-indestructible-del-futuro-" | sections[7] | FeaturesGridStatsCards | {desktop:md none} | {desktop:80px 48px} |  |
| https://4geeks.com/landing/programa-de-desarrollo-full-stack-con-ia | site_4geeks-com/landings/es-programa-de-desarrollo-full-stack-con-ia/es.yml | es live | sections[5] | FeaturesGridStatsText | {desktop:none} | {desktop:48px} |  |
| https://4geeks.com/landing/programa-de-desarrollo-full-stack-con-ia | site_4geeks-com/landings/es-programa-de-desarrollo-full-stack-con-ia/es.yml | es live | sections[10] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/es-programas-espaa | site_4geeks-com/landings/es-programas-espaa/es.yml | es live | sections[3] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/es-programas-espaa | site_4geeks-com/landings/es-programas-espaa/es.yml | es live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/from-developer-to-certified-ai-engineer-with-job-guarantee | site_4geeks-com/landings/from-developer-to-certified-ai-engineer-with-job-guarantee/add-schema-org.en.yml | en variant/draft "add-schema-org" | sections[5] | FeaturesGridStatsTextCard | {mobile:none md, desktop:none md} | {mobile:48px 80px, desktop:48px 80px} |  |
| https://4geeks.com/landing/from-developer-to-certified-ai-engineer-with-job-guarantee | site_4geeks-com/landings/from-developer-to-certified-ai-engineer-with-job-guarantee/add-schema-org.en.yml | en variant/draft "add-schema-org" | sections[8] | HumanAndAiDuoDefault | {mobile:sm none, desktop:md} | {mobile:72px 56px, desktop:88px} |  |
| https://4geeks.com/landing/from-developer-to-certified-ai-engineer-with-job-guarantee | site_4geeks-com/landings/from-developer-to-certified-ai-engineer-with-job-guarantee/add-schema-org.en.yml | en variant/draft "add-schema-org" | sections[9] | CareerSupportExplainDefault | {desktop:md none} | {mobile:80px 48px, desktop:xl lg} |  |
| https://4geeks.com/landing/from-developer-to-certified-ai-engineer-with-job-guarantee | site_4geeks-com/landings/from-developer-to-certified-ai-engineer-with-job-guarantee/add-schema-org.en.yml | en variant/draft "add-schema-org" | sections[10] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/from-developer-to-certified-ai-engineer-with-job-guarantee | site_4geeks-com/landings/from-developer-to-certified-ai-engineer-with-job-guarantee/add-schema-org.en.yml | en variant/draft "add-schema-org" | sections[13] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/from-developer-to-certified-ai-engineer-with-job-guarantee | site_4geeks-com/landings/from-developer-to-certified-ai-engineer-with-job-guarantee/en.yml | en live | sections[5] | FeaturesGridStatsTextCard | {mobile:none md, desktop:none md} | {mobile:48px 80px, desktop:48px 80px} |  |
| https://4geeks.com/landing/from-developer-to-certified-ai-engineer-with-job-guarantee | site_4geeks-com/landings/from-developer-to-certified-ai-engineer-with-job-guarantee/en.yml | en live | sections[8] | HumanAndAiDuoDefault | {mobile:sm none, desktop:md} | {mobile:72px 56px, desktop:88px} |  |
| https://4geeks.com/landing/from-developer-to-certified-ai-engineer-with-job-guarantee | site_4geeks-com/landings/from-developer-to-certified-ai-engineer-with-job-guarantee/en.yml | en live | sections[9] | CareerSupportExplainDefault | {desktop:md none} | {mobile:80px 48px, desktop:xl lg} |  |
| https://4geeks.com/landing/from-developer-to-certified-ai-engineer-with-job-guarantee | site_4geeks-com/landings/from-developer-to-certified-ai-engineer-with-job-guarantee/en.yml | en live | sections[10] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/from-developer-to-certified-ai-engineer-with-job-guarantee | site_4geeks-com/landings/from-developer-to-certified-ai-engineer-with-job-guarantee/en.yml | en live | sections[13] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/full-stack | site_4geeks-com/landings/full-stack/en.yml | en live | sections[3] | FeaturesGridStatsTextCard | {desktop:none md, mobile:none md} | {mobile:48px 80px, desktop:48px 80px} |  |
| https://4geeks.com/landing/full-stack | site_4geeks-com/landings/full-stack/en.yml | en live | sections[8] | GraduatesStatsDefault | {desktop:none sm} | {mobile:lg 80px, desktop:xl 112px} |  |
| https://4geeks.com/landing/full-stack | site_4geeks-com/landings/full-stack/en.yml | en live | sections[9] | CareerSupportExplainDefault | {desktop:sm none} | {mobile:lg 48px, desktop:80px lg} |  |
| https://4geeks.com/landing/full-stack | site_4geeks-com/landings/full-stack/en.yml | en live | sections[11] | TestimonialsSlideDefault | {desktop:sm none} | {mobile:lg 48px, desktop:80px lg} |  |
| https://4geeks.com/landing/full-stack | site_4geeks-com/landings/full-stack/en.yml | en live | sections[12] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/full-stack-ads-es | site_4geeks-com/landings/full-stack-ads-es/es.yml | es live | sections[2] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/full-stack-ads-es | site_4geeks-com/landings/full-stack-ads-es/es.yml | es live | sections[5] | CareerSupportExplainDefault | {desktop:none sm} | {mobile:48px lg, desktop:lg 80px} |  |
| https://4geeks.com/landing/full-stack-ads-es | site_4geeks-com/landings/full-stack-ads-es/es.yml | es live | sections[7] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/full-stack-ads-es | site_4geeks-com/landings/full-stack-ads-es/es.yml | es live | sections[10] | TestimonialsSlideDefault | {desktop:none} | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/hazte-ingeniero-de-ia-espana | site_4geeks-com/landings/hazte-ingeniero-de-ia-espana/draft.es.yml | es draft (draft) | sections[2] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/hazte-ingeniero-de-ia-espana | site_4geeks-com/landings/hazte-ingeniero-de-ia-espana/draft.es.yml | es draft (draft) | sections[5] | CareerSupportExplainDefault | {desktop:none sm} | {mobile:48px lg, desktop:lg 80px} |  |
| https://4geeks.com/landing/hazte-ingeniero-de-ia-espana | site_4geeks-com/landings/hazte-ingeniero-de-ia-espana/draft.es.yml | es draft (draft) | sections[7] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/hazte-ingeniero-de-ia-espana | site_4geeks-com/landings/hazte-ingeniero-de-ia-espana/draft.es.yml | es draft (draft) | sections[10] | TestimonialsSlideDefault | {desktop:none} | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/herramientas-de-ia-para-programar | site_4geeks-com/landings/herramientas-de-ia-para-programar/es.yml | es live | sections[6] | FeaturesGridStatsTextCard | {mobile:none md, desktop:none} | {mobile:48px 80px, desktop:48px} |  |
| https://4geeks.com/landing/herramientas-de-ia-para-programar | site_4geeks-com/landings/herramientas-de-ia-para-programar/es.yml | es live | sections[10] | TestimonialsSlideDefault | {desktop:none} | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/job-guarantee | site_4geeks-com/landings/job-guarantee/en.yml | en live | sections[2] | GraduatesStatsDefault | {desktop:sm none} | {mobile:80px lg, desktop:112px xl} |  |
| https://4geeks.com/landing/job-guarantee | site_4geeks-com/landings/job-guarantee/en.yml | en live | sections[5] | FeaturesQuadDefault | (unset) | {desktop:56px} |  |
| https://4geeks.com/landing/job-guarantee | site_4geeks-com/landings/job-guarantee/en.yml | en live | sections[7] | CareerSupportExplainDefault | {desktop:lg none} | {mobile:112px 48px, desktop:128px lg} |  |
| https://4geeks.com/landing/job-guarantee | site_4geeks-com/landings/job-guarantee/en.yml | en live | sections[8] | HumanAndAiDuoDefault | {mobile:sm none, desktop:md} | {mobile:72px 56px, desktop:88px} |  |
| https://4geeks.com/landing/job-guarantee | site_4geeks-com/landings/job-guarantee/en.yml | en live | sections[9] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/job-guarantee | site_4geeks-com/landings/job-guarantee/en.yml | en live | sections[13] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/machine-learning-data-science | site_4geeks-com/landings/machine-learning-data-science/en.yml | en live | sections[3] | FeaturesGridStatsTextCard | {desktop:none md, mobile:none md} | {mobile:48px 80px, desktop:48px 80px} |  |
| https://4geeks.com/landing/machine-learning-data-science | site_4geeks-com/landings/machine-learning-data-science/en.yml | en live | sections[4] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/machine-learning-data-science | site_4geeks-com/landings/machine-learning-data-science/en.yml | en live | sections[8] | GraduatesStatsDefault | {desktop:none sm} | {mobile:lg 80px, desktop:xl 112px} |  |
| https://4geeks.com/landing/machine-learning-data-science | site_4geeks-com/landings/machine-learning-data-science/en.yml | en live | sections[9] | CareerSupportExplainDefault | {desktop:sm none} | {mobile:lg 48px, desktop:80px lg} |  |
| https://4geeks.com/landing/machine-learning-data-science | site_4geeks-com/landings/machine-learning-data-science/en.yml | en live | sections[11] | TestimonialsSlideDefault | {desktop:sm none} | {mobile:lg 48px, desktop:80px lg} |  |
| https://4geeks.com/landing/marca-4geeks-ai-engineeing-program-ad-costarica | site_4geeks-com/landings/marca-4geeks-ai-engineeing-program-ad-costarica/draft.es.yml | es draft (draft) | sections[2] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/marca-4geeks-ai-engineeing-program-ad-costarica | site_4geeks-com/landings/marca-4geeks-ai-engineeing-program-ad-costarica/draft.es.yml | es draft (draft) | sections[5] | CareerSupportExplainDefault | {desktop:none sm} | {mobile:48px lg, desktop:lg 80px} |  |
| https://4geeks.com/landing/marca-4geeks-ai-engineeing-program-ad-costarica | site_4geeks-com/landings/marca-4geeks-ai-engineeing-program-ad-costarica/draft.es.yml | es draft (draft) | sections[7] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/marca-4geeks-ai-engineeing-program-ad-costarica | site_4geeks-com/landings/marca-4geeks-ai-engineeing-program-ad-costarica/draft.es.yml | es draft (draft) | sections[10] | TestimonialsSlideDefault | {desktop:none} | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/master-en-inteligencia-artificial-espana | site_4geeks-com/landings/master-en-inteligencia-artificial-espana/es.yml | es live | sections[2] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/master-en-inteligencia-artificial-espana | site_4geeks-com/landings/master-en-inteligencia-artificial-espana/es.yml | es live | sections[6] | CareerSupportExplainDefault | {desktop:none sm} | {mobile:48px lg, desktop:lg 80px} |  |
| https://4geeks.com/landing/master-en-inteligencia-artificial-espana | site_4geeks-com/landings/master-en-inteligencia-artificial-espana/es.yml | es live | sections[8] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/master-en-inteligencia-artificial-espana | site_4geeks-com/landings/master-en-inteligencia-artificial-espana/es.yml | es live | sections[10] | TestimonialsSlideDefault | {desktop:none} | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/ai-engineering-program-ad-es-mexico | site_4geeks-com/landings/mexico-ai-engineering/draft.es.yml | es draft (draft) | sections[2] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/ai-engineering-program-ad-es-mexico | site_4geeks-com/landings/mexico-ai-engineering/draft.es.yml | es draft (draft) | sections[5] | CareerSupportExplainDefault | {desktop:none sm} | {mobile:48px lg, desktop:lg 80px} |  |
| https://4geeks.com/landing/ai-engineering-program-ad-es-mexico | site_4geeks-com/landings/mexico-ai-engineering/draft.es.yml | es draft (draft) | sections[7] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/ai-engineering-program-ad-es-mexico | site_4geeks-com/landings/mexico-ai-engineering/draft.es.yml | es draft (draft) | sections[10] | TestimonialsSlideDefault | {desktop:none} | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/ai-engineering-program-ad-es-mexico | site_4geeks-com/landings/mexico-ai-engineering/es.yml | es live | sections[2] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/ai-engineering-program-ad-es-mexico | site_4geeks-com/landings/mexico-ai-engineering/es.yml | es live | sections[5] | CareerSupportExplainDefault | {desktop:none sm} | {mobile:48px lg, desktop:lg 80px} |  |
| https://4geeks.com/landing/ai-engineering-program-ad-es-mexico | site_4geeks-com/landings/mexico-ai-engineering/es.yml | es live | sections[7] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/ai-engineering-program-ad-es-mexico | site_4geeks-com/landings/mexico-ai-engineering/es.yml | es live | sections[10] | TestimonialsSlideDefault | {desktop:none} | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/mexico-lino-querido | site_4geeks-com/landings/mexico-lino-querido/draft.es.yml | es draft (draft) | sections[4] | FeaturesGridStatsTextCard | {mobile:none md, desktop:none md} | {mobile:48px 80px, desktop:48px 80px} |  |
| https://4geeks.com/landing/mexico-lino-querido | site_4geeks-com/landings/mexico-lino-querido/draft.es.yml | es draft (draft) | sections[10] | NumberedStepsVerticalCards | (unset) | {desktop:lg} | background bg-muted/30 → muted-30 |
| https://4geeks.com/landing/mexico-lino-querido | site_4geeks-com/landings/mexico-lino-querido/draft.es.yml | es draft (draft) | sections[11] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/programacion-general-ads-es | site_4geeks-com/landings/programacion-general/es.yml | es live | sections[3] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/programacion-general-ads-es | site_4geeks-com/landings/programacion-general/es.yml | es live | sections[5] | CareerSupportExplainDefault | {desktop:none sm} | {mobile:48px lg, desktop:lg 80px} |  |
| https://4geeks.com/landing/programacion-general-ads-es | site_4geeks-com/landings/programacion-general/es.yml | es live | sections[7] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/programacion-general-ads-es | site_4geeks-com/landings/programacion-general/es.yml | es live | sections[9] | TestimonialsSlideDefault | {desktop:none} | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/programas-latam | site_4geeks-com/landings/programas-latam/es.yml | es live | sections[6] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/programas-latam | site_4geeks-com/landings/programas-latam/es.yml | es live | sections[8] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/python-sql-ads-ar | site_4geeks-com/landings/python-sql-ads-ar/es.yml | es live | sections[2] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/python-sql-ads-ar | site_4geeks-com/landings/python-sql-ads-ar/es.yml | es live | sections[5] | CareerSupportExplainDefault | {desktop:none sm} | {mobile:48px lg, desktop:lg 80px} |  |
| https://4geeks.com/landing/python-sql-ads-ar | site_4geeks-com/landings/python-sql-ads-ar/es.yml | es live | sections[7] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/python-sql-ads-ar | site_4geeks-com/landings/python-sql-ads-ar/es.yml | es live | sections[10] | TestimonialsSlideDefault | {desktop:none} | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/python-sql-ai-engineering-ad-costarica | site_4geeks-com/landings/python-sql-ai-engineering-ad-costarica/draft.es.yml | es draft (draft) | sections[2] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/python-sql-ai-engineering-ad-costarica | site_4geeks-com/landings/python-sql-ai-engineering-ad-costarica/draft.es.yml | es draft (draft) | sections[5] | CareerSupportExplainDefault | {desktop:none sm} | {mobile:48px lg, desktop:lg 80px} |  |
| https://4geeks.com/landing/python-sql-ai-engineering-ad-costarica | site_4geeks-com/landings/python-sql-ai-engineering-ad-costarica/draft.es.yml | es draft (draft) | sections[7] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/python-sql-ai-engineering-ad-costarica | site_4geeks-com/landings/python-sql-ai-engineering-ad-costarica/draft.es.yml | es draft (draft) | sections[10] | TestimonialsSlideDefault | {desktop:none} | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/python-sql-mexico | site_4geeks-com/landings/python-sql-mexico/draft.es.yml | es draft (draft) | sections[2] | CareerSupportExplainDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/python-sql-mexico | site_4geeks-com/landings/python-sql-mexico/draft.es.yml | es draft (draft) | sections[3] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/python-sql-mexico | site_4geeks-com/landings/python-sql-mexico/draft.es.yml | es draft (draft) | sections[5] | FeaturesGridStatsTextCard | {mobile:none md, desktop:none md} | {mobile:48px 80px, desktop:48px 80px} |  |
| https://4geeks.com/landing/python-sql-mexico | site_4geeks-com/landings/python-sql-mexico/draft.es.yml | es draft (draft) | sections[6] | GraduatesStatsDefault | {desktop:none sm} | {mobile:lg 80px, desktop:xl 112px} |  |
| https://4geeks.com/landing/python-sql-mexico | site_4geeks-com/landings/python-sql-mexico/draft.es.yml | es draft (draft) | sections[9] | TestimonialsSlideDefault | {desktop:sm} | {mobile:lg, desktop:80px} |  |
| https://4geeks.com/landing/software-engineering | site_4geeks-com/landings/software-engineering/en.yml | en live | sections[3] | FeaturesGridStatsTextCard | {desktop:none md, mobile:none md} | {mobile:48px 80px, desktop:48px 80px} |  |
| https://4geeks.com/landing/software-engineering | site_4geeks-com/landings/software-engineering/en.yml | en live | sections[8] | GraduatesStatsDefault | {desktop:none sm} | {mobile:lg 80px, desktop:xl 112px} |  |
| https://4geeks.com/landing/software-engineering | site_4geeks-com/landings/software-engineering/en.yml | en live | sections[9] | CareerSupportExplainDefault | {desktop:sm none} | {mobile:lg 48px, desktop:80px lg} |  |
| https://4geeks.com/landing/software-engineering | site_4geeks-com/landings/software-engineering/en.yml | en live | sections[11] | TestimonialsSlideDefault | {desktop:sm none} | {mobile:lg 48px, desktop:80px lg} |  |
| https://4geeks.com/landing/software-engineering | site_4geeks-com/landings/software-engineering/en.yml | en live | sections[12] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/sueldos-ingeniero-ia-spain | site_4geeks-com/landings/sueldos-ingeniero-ia-spain/es.yml | es live | sections[4] | CareerSupportExplainDefault | {desktop:none sm} | {mobile:48px lg, desktop:lg 80px} |  |
| https://4geeks.com/landing/workshop-aiengineering-reskill | site_4geeks-com/landings/workshop-aiengineering-reskill/es.yml | es live | sections[1] | HumanAndAiDuoDefault | (unset) | {desktop:56px} |  |
| https://4geeks.com/landing/workshop-aiengineering-reskill | site_4geeks-com/landings/workshop-aiengineering-reskill/es.yml | es live | sections[3] | ProfilesCarouselDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/workshop-aiengineering-reskill | site_4geeks-com/landings/workshop-aiengineering-reskill/es.yml | es live | sections[4] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/workshop-aiengineering-reskill-latam | site_4geeks-com/landings/workshop-aiengineering-reskill-latam/es.yml | es live | sections[1] | HumanAndAiDuoDefault | (unset) | {desktop:56px} |  |
| https://4geeks.com/landing/workshop-aiengineering-reskill-latam | site_4geeks-com/landings/workshop-aiengineering-reskill-latam/es.yml | es live | sections[3] | ProfilesCarouselDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/workshop-aiengineering-reskill-latam | site_4geeks-com/landings/workshop-aiengineering-reskill-latam/es.yml | es live | sections[4] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/landing/programacion-costa-rica | site_4geeks-com/landings/xx/es.yml | es live | sections[2] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/programacion-costa-rica | site_4geeks-com/landings/xx/es.yml | es live | sections[5] | CareerSupportExplainDefault | {desktop:none sm} | {mobile:48px lg, desktop:lg 80px} |  |
| https://4geeks.com/landing/programacion-costa-rica | site_4geeks-com/landings/xx/es.yml | es live | sections[7] | FeaturesQuadDefault | {desktop:none} | {desktop:56px} |  |
| https://4geeks.com/landing/programacion-costa-rica | site_4geeks-com/landings/xx/es.yml | es live | sections[10] | TestimonialsSlideDefault | {desktop:none} | {mobile:48px, desktop:lg} |  |
| — | site_4geeks-com/lesson/template.en.yml |  shared template (every entry of this type) | sections[1] | ArticleDefault | {desktop:sm} | {desktop:48px} |  |
| — | site_4geeks-com/lesson/template.es.yml |  shared template (every entry of this type) | sections[1] | ArticleDefault | {desktop:sm} | {desktop:48px} |  |
| https://4geeks.com/en/location/atlanta-usa | site_4geeks-com/locations/atlanta-usa/en.yml | en live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/location/atlanta-usa | site_4geeks-com/locations/atlanta-usa/en.yml | en live | sections[5] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/location/atlanta-usa | site_4geeks-com/locations/atlanta-usa/en.yml | en live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://4geeks.com/es/ubicacion/atlanta-usa | site_4geeks-com/locations/atlanta-usa/es.yml | es live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/es/ubicacion/atlanta-usa | site_4geeks-com/locations/atlanta-usa/es.yml | es live | sections[5] | CourseSelectorSpotlight | {desktop:md} | {mobile:80px, desktop:xl} |  |
| https://4geeks.com/es/ubicacion/atlanta-usa | site_4geeks-com/locations/atlanta-usa/es.yml | es live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://4geeks.com/en/location/austin-usa | site_4geeks-com/locations/austin-usa/en.yml | en live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/location/austin-usa | site_4geeks-com/locations/austin-usa/en.yml | en live | sections[5] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/location/austin-usa | site_4geeks-com/locations/austin-usa/en.yml | en live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://4geeks.com/es/ubicacion/austin-usa | site_4geeks-com/locations/austin-usa/es.yml | es live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/es/ubicacion/austin-usa | site_4geeks-com/locations/austin-usa/es.yml | es live | sections[5] | CourseSelectorSpotlight | {desktop:md} | {mobile:80px, desktop:xl} |  |
| https://4geeks.com/es/ubicacion/austin-usa | site_4geeks-com/locations/austin-usa/es.yml | es live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://4geeks.com/en/location/barcelona-spain | site_4geeks-com/locations/barcelona-spain/en.yml | en live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/location/barcelona-spain | site_4geeks-com/locations/barcelona-spain/en.yml | en live | sections[5] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/location/barcelona-spain | site_4geeks-com/locations/barcelona-spain/en.yml | en live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://4geeks.com/es/ubicacion/barcelona-espana | site_4geeks-com/locations/barcelona-spain/es.yml | es live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/es/ubicacion/barcelona-espana | site_4geeks-com/locations/barcelona-spain/es.yml | es live | sections[5] | CourseSelectorSpotlight | {desktop:md} | {mobile:80px, desktop:xl} |  |
| https://4geeks.com/es/ubicacion/barcelona-espana | site_4geeks-com/locations/barcelona-spain/es.yml | es live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://4geeks.com/en/location/berlin-germany | site_4geeks-com/locations/berlin-germany/en.yml | en live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/location/berlin-germany | site_4geeks-com/locations/berlin-germany/en.yml | en live | sections[5] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/location/berlin-germany | site_4geeks-com/locations/berlin-germany/en.yml | en live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://4geeks.com/es/ubicacion/berlin-alemania | site_4geeks-com/locations/berlin-germany/es.yml | es live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/es/ubicacion/berlin-alemania | site_4geeks-com/locations/berlin-germany/es.yml | es live | sections[5] | CourseSelectorSpotlight | {desktop:md} | {mobile:80px, desktop:xl} |  |
| https://4geeks.com/es/ubicacion/berlin-alemania | site_4geeks-com/locations/berlin-germany/es.yml | es live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://4geeks.com/en/location/bogota-colombia | site_4geeks-com/locations/bogota-colombia/en.yml | en live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/location/bogota-colombia | site_4geeks-com/locations/bogota-colombia/en.yml | en live | sections[5] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/location/bogota-colombia | site_4geeks-com/locations/bogota-colombia/en.yml | en live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://4geeks.com/es/ubicacion/bogota-colombia | site_4geeks-com/locations/bogota-colombia/es.yml | es live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/es/ubicacion/bogota-colombia | site_4geeks-com/locations/bogota-colombia/es.yml | es live | sections[5] | CourseSelectorSpotlight | {desktop:md} | {mobile:80px, desktop:xl} |  |
| https://4geeks.com/es/ubicacion/bogota-colombia | site_4geeks-com/locations/bogota-colombia/es.yml | es live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://4geeks.com/en/location/buenosaires-argentina | site_4geeks-com/locations/buenosaires-argentina/en.yml | en live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/location/buenosaires-argentina | site_4geeks-com/locations/buenosaires-argentina/en.yml | en live | sections[5] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/location/buenosaires-argentina | site_4geeks-com/locations/buenosaires-argentina/en.yml | en live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://4geeks.com/es/ubicacion/buenosaires-argentina | site_4geeks-com/locations/buenosaires-argentina/es.yml | es live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/es/ubicacion/buenosaires-argentina | site_4geeks-com/locations/buenosaires-argentina/es.yml | es live | sections[5] | CourseSelectorSpotlight | {desktop:md} | {mobile:80px, desktop:xl} |  |
| https://4geeks.com/es/ubicacion/buenosaires-argentina | site_4geeks-com/locations/buenosaires-argentina/es.yml | es live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://4geeks.com/en/location/caracas-venezuela | site_4geeks-com/locations/caracas-venezuela/en.yml | en live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/location/caracas-venezuela | site_4geeks-com/locations/caracas-venezuela/en.yml | en live | sections[5] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/location/caracas-venezuela | site_4geeks-com/locations/caracas-venezuela/en.yml | en live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://4geeks.com/es/ubicacion/caracas-venezuela | site_4geeks-com/locations/caracas-venezuela/es.yml | es live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/es/ubicacion/caracas-venezuela | site_4geeks-com/locations/caracas-venezuela/es.yml | es live | sections[5] | CourseSelectorSpotlight | {desktop:md} | {mobile:80px, desktop:xl} |  |
| https://4geeks.com/es/ubicacion/caracas-venezuela | site_4geeks-com/locations/caracas-venezuela/es.yml | es live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://4geeks.com/en/location/chicago-usa | site_4geeks-com/locations/chicago-usa/en.yml | en live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/location/chicago-usa | site_4geeks-com/locations/chicago-usa/en.yml | en live | sections[5] | CourseSelectorSpotlight | {desktop:md} | {mobile:80px, desktop:xl} |  |
| https://4geeks.com/en/location/chicago-usa | site_4geeks-com/locations/chicago-usa/en.yml | en live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://4geeks.com/es/ubicacion/chicago-usa | site_4geeks-com/locations/chicago-usa/es.yml | es live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/es/ubicacion/chicago-usa | site_4geeks-com/locations/chicago-usa/es.yml | es live | sections[5] | CourseSelectorSpotlight | {desktop:md} | {mobile:80px, desktop:xl} |  |
| https://4geeks.com/es/ubicacion/chicago-usa | site_4geeks-com/locations/chicago-usa/es.yml | es live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://4geeks.com/en/location/costa-rica | site_4geeks-com/locations/costa-rica/en.yml | en live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/location/costa-rica | site_4geeks-com/locations/costa-rica/en.yml | en live | sections[5] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/location/costa-rica | site_4geeks-com/locations/costa-rica/en.yml | en live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://4geeks.com/es/ubicacion/costa-rica | site_4geeks-com/locations/costa-rica/es.yml | es live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/es/ubicacion/costa-rica | site_4geeks-com/locations/costa-rica/es.yml | es live | sections[5] | CourseSelectorSpotlight | {desktop:md} | {mobile:80px, desktop:xl} |  |
| https://4geeks.com/es/ubicacion/costa-rica | site_4geeks-com/locations/costa-rica/es.yml | es live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://4geeks.com/en/location/dallas-usa | site_4geeks-com/locations/dallas-usa/en.yml | en live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/location/dallas-usa | site_4geeks-com/locations/dallas-usa/en.yml | en live | sections[5] | CourseSelectorSpotlight | {desktop:md} | {mobile:80px, desktop:xl} |  |
| https://4geeks.com/en/location/dallas-usa | site_4geeks-com/locations/dallas-usa/en.yml | en live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://4geeks.com/es/ubicacion/dallas-usa | site_4geeks-com/locations/dallas-usa/es.yml | es live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/es/ubicacion/dallas-usa | site_4geeks-com/locations/dallas-usa/es.yml | es live | sections[5] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/es/ubicacion/dallas-usa | site_4geeks-com/locations/dallas-usa/es.yml | es live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://4geeks.com/en/location/dublin-ireland | site_4geeks-com/locations/dublin-ireland/en.yml | en live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/location/dublin-ireland | site_4geeks-com/locations/dublin-ireland/en.yml | en live | sections[5] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/location/dublin-ireland | site_4geeks-com/locations/dublin-ireland/en.yml | en live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://4geeks.com/es/ubicacion/dublin-irlanda | site_4geeks-com/locations/dublin-ireland/es.yml | es live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/es/ubicacion/dublin-irlanda | site_4geeks-com/locations/dublin-ireland/es.yml | es live | sections[5] | CourseSelectorSpotlight | {desktop:md} | {mobile:80px, desktop:xl} |  |
| https://4geeks.com/es/ubicacion/dublin-irlanda | site_4geeks-com/locations/dublin-ireland/es.yml | es live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://4geeks.com/en/location/hamburg-germany | site_4geeks-com/locations/hamburg-germany/en.yml | en live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/location/hamburg-germany | site_4geeks-com/locations/hamburg-germany/en.yml | en live | sections[5] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/location/hamburg-germany | site_4geeks-com/locations/hamburg-germany/en.yml | en live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://4geeks.com/es/ubicacion/hamburgo-alemania | site_4geeks-com/locations/hamburg-germany/es.yml | es live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/es/ubicacion/hamburgo-alemania | site_4geeks-com/locations/hamburg-germany/es.yml | es live | sections[5] | CourseSelectorSpotlight | {desktop:md} | {mobile:80px, desktop:xl} |  |
| https://4geeks.com/es/ubicacion/hamburgo-alemania | site_4geeks-com/locations/hamburg-germany/es.yml | es live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://4geeks.com/es/ubicacion/houston-usa | site_4geeks-com/locations/houston-usa/draft.es.yml | es draft (draft) | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/es/ubicacion/houston-usa | site_4geeks-com/locations/houston-usa/draft.es.yml | es draft (draft) | sections[5] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/es/ubicacion/houston-usa | site_4geeks-com/locations/houston-usa/draft.es.yml | es draft (draft) | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://4geeks.com/en/location/houston-usa | site_4geeks-com/locations/houston-usa/en.yml | en live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/location/houston-usa | site_4geeks-com/locations/houston-usa/en.yml | en live | sections[5] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/location/houston-usa | site_4geeks-com/locations/houston-usa/en.yml | en live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://4geeks.com/es/ubicacion/houston-usa | site_4geeks-com/locations/houston-usa/es.yml | es live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/es/ubicacion/houston-usa | site_4geeks-com/locations/houston-usa/es.yml | es live | sections[5] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/es/ubicacion/houston-usa | site_4geeks-com/locations/houston-usa/es.yml | es live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://4geeks.com/en/location/lapaz-bolivia | site_4geeks-com/locations/lapaz-bolivia/en.yml | en live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/location/lapaz-bolivia | site_4geeks-com/locations/lapaz-bolivia/en.yml | en live | sections[5] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/location/lapaz-bolivia | site_4geeks-com/locations/lapaz-bolivia/en.yml | en live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://4geeks.com/es/ubicacion/lapaz-bolivia | site_4geeks-com/locations/lapaz-bolivia/es.yml | es live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/es/ubicacion/lapaz-bolivia | site_4geeks-com/locations/lapaz-bolivia/es.yml | es live | sections[5] | CourseSelectorSpotlight | {desktop:md} | {mobile:80px, desktop:xl} |  |
| https://4geeks.com/es/ubicacion/lapaz-bolivia | site_4geeks-com/locations/lapaz-bolivia/es.yml | es live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://4geeks.com/en/location/lima-peru | site_4geeks-com/locations/lima-peru/en.yml | en live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/location/lima-peru | site_4geeks-com/locations/lima-peru/en.yml | en live | sections[5] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/location/lima-peru | site_4geeks-com/locations/lima-peru/en.yml | en live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://4geeks.com/es/ubicacion/lima-peru | site_4geeks-com/locations/lima-peru/es.yml | es live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/es/ubicacion/lima-peru | site_4geeks-com/locations/lima-peru/es.yml | es live | sections[5] | CourseSelectorSpotlight | {desktop:md} | {mobile:80px, desktop:xl} |  |
| https://4geeks.com/es/ubicacion/lima-peru | site_4geeks-com/locations/lima-peru/es.yml | es live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://4geeks.com/en/location/lisbon-portugal | site_4geeks-com/locations/lisbon-portugal/en.yml | en live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/location/lisbon-portugal | site_4geeks-com/locations/lisbon-portugal/en.yml | en live | sections[5] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/location/lisbon-portugal | site_4geeks-com/locations/lisbon-portugal/en.yml | en live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://4geeks.com/es/ubicacion/lisboa-portugal | site_4geeks-com/locations/lisbon-portugal/es.yml | es live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/es/ubicacion/lisboa-portugal | site_4geeks-com/locations/lisbon-portugal/es.yml | es live | sections[5] | CourseSelectorSpotlight | {desktop:md} | {mobile:80px, desktop:xl} |  |
| https://4geeks.com/es/ubicacion/lisboa-portugal | site_4geeks-com/locations/lisbon-portugal/es.yml | es live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://4geeks.com/en/location/losangeles-usa | site_4geeks-com/locations/losangeles-usa/en.yml | en live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/location/losangeles-usa | site_4geeks-com/locations/losangeles-usa/en.yml | en live | sections[5] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/location/losangeles-usa | site_4geeks-com/locations/losangeles-usa/en.yml | en live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://4geeks.com/es/ubicacion/losangeles-usa | site_4geeks-com/locations/losangeles-usa/es.yml | es live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/es/ubicacion/losangeles-usa | site_4geeks-com/locations/losangeles-usa/es.yml | es live | sections[5] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/es/ubicacion/losangeles-usa | site_4geeks-com/locations/losangeles-usa/es.yml | es live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://4geeks.com/en/location/madrid-spain | site_4geeks-com/locations/madrid-spain/en.yml | en live | sections[4] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/location/madrid-spain | site_4geeks-com/locations/madrid-spain/en.yml | en live | sections[6] | CourseSelectorSpotlight | {desktop:md} | {mobile:80px, desktop:xl} |  |
| https://4geeks.com/en/location/madrid-spain | site_4geeks-com/locations/madrid-spain/en.yml | en live | sections[8] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://4geeks.com/es/ubicacion/madrid-spain | site_4geeks-com/locations/madrid-spain/es.yml | es live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/es/ubicacion/madrid-spain | site_4geeks-com/locations/madrid-spain/es.yml | es live | sections[5] | CourseSelectorSpotlight | {desktop:md} | {mobile:80px, desktop:xl} |  |
| https://4geeks.com/es/ubicacion/madrid-spain | site_4geeks-com/locations/madrid-spain/es.yml | es live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://4geeks.com/en/location/malaga-spain | site_4geeks-com/locations/malaga-spain/en.yml | en live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/location/malaga-spain | site_4geeks-com/locations/malaga-spain/en.yml | en live | sections[5] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/location/malaga-spain | site_4geeks-com/locations/malaga-spain/en.yml | en live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://4geeks.com/es/ubicacion/malaga-espana | site_4geeks-com/locations/malaga-spain/es.yml | es live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/es/ubicacion/malaga-espana | site_4geeks-com/locations/malaga-spain/es.yml | es live | sections[5] | CourseSelectorSpotlight | {desktop:md} | {mobile:80px, desktop:xl} |  |
| https://4geeks.com/es/ubicacion/malaga-espana | site_4geeks-com/locations/malaga-spain/es.yml | es live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://4geeks.com/en/location/mexicocity-mexico | site_4geeks-com/locations/mexicocity-mexico/en.yml | en live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/location/mexicocity-mexico | site_4geeks-com/locations/mexicocity-mexico/en.yml | en live | sections[5] | CourseSelectorSpotlight | {desktop:md} | {mobile:80px, desktop:xl} |  |
| https://4geeks.com/en/location/mexicocity-mexico | site_4geeks-com/locations/mexicocity-mexico/en.yml | en live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://4geeks.com/es/ubicacion/ciudad-de-mexico | site_4geeks-com/locations/mexicocity-mexico/es.yml | es live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/es/ubicacion/ciudad-de-mexico | site_4geeks-com/locations/mexicocity-mexico/es.yml | es live | sections[5] | CourseSelectorSpotlight | {desktop:md} | {mobile:80px, desktop:xl} |  |
| https://4geeks.com/es/ubicacion/ciudad-de-mexico | site_4geeks-com/locations/mexicocity-mexico/es.yml | es live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://4geeks.com/en/location/miami-usa | site_4geeks-com/locations/miami-usa/en.yml | en live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/location/miami-usa | site_4geeks-com/locations/miami-usa/en.yml | en live | sections[5] | CourseSelectorSpotlight | {desktop:md lg} | {mobile:80px 112px, desktop:xl 128px} |  |
| https://4geeks.com/en/location/miami-usa | site_4geeks-com/locations/miami-usa/en.yml | en live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://4geeks.com/es/ubicacion/miami-usa | site_4geeks-com/locations/miami-usa/es.yml | es live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/es/ubicacion/miami-usa | site_4geeks-com/locations/miami-usa/es.yml | es live | sections[5] | CourseSelectorSpotlight | {desktop:md} | {mobile:80px, desktop:xl} |  |
| https://4geeks.com/es/ubicacion/miami-usa | site_4geeks-com/locations/miami-usa/es.yml | es live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://4geeks.com/en/location/milan-italy | site_4geeks-com/locations/milan-italy/en.yml | en live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/location/milan-italy | site_4geeks-com/locations/milan-italy/en.yml | en live | sections[5] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/location/milan-italy | site_4geeks-com/locations/milan-italy/en.yml | en live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://4geeks.com/es/ubicacion/milan-italia | site_4geeks-com/locations/milan-italy/es.yml | es live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/es/ubicacion/milan-italia | site_4geeks-com/locations/milan-italy/es.yml | es live | sections[5] | CourseSelectorSpotlight | {desktop:md} | {mobile:80px, desktop:xl} |  |
| https://4geeks.com/es/ubicacion/milan-italia | site_4geeks-com/locations/milan-italy/es.yml | es live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://4geeks.com/en/location/montevideo-uruguay | site_4geeks-com/locations/montevideo-uruguay/en.yml | en live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/location/montevideo-uruguay | site_4geeks-com/locations/montevideo-uruguay/en.yml | en live | sections[5] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/location/montevideo-uruguay | site_4geeks-com/locations/montevideo-uruguay/en.yml | en live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://4geeks.com/es/ubicacion/montevideo-uruguay | site_4geeks-com/locations/montevideo-uruguay/es.yml | es live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/es/ubicacion/montevideo-uruguay | site_4geeks-com/locations/montevideo-uruguay/es.yml | es live | sections[5] | CourseSelectorSpotlight | {desktop:md} | {mobile:80px, desktop:xl} |  |
| https://4geeks.com/es/ubicacion/montevideo-uruguay | site_4geeks-com/locations/montevideo-uruguay/es.yml | es live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://4geeks.com/en/location/munich-germany | site_4geeks-com/locations/munich-germany/en.yml | en live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/location/munich-germany | site_4geeks-com/locations/munich-germany/en.yml | en live | sections[5] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/location/munich-germany | site_4geeks-com/locations/munich-germany/en.yml | en live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://4geeks.com/es/ubicacion/munich-alemania | site_4geeks-com/locations/munich-germany/es.yml | es live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/es/ubicacion/munich-alemania | site_4geeks-com/locations/munich-germany/es.yml | es live | sections[5] | CourseSelectorSpotlight | {desktop:md} | {mobile:80px, desktop:xl} |  |
| https://4geeks.com/es/ubicacion/munich-alemania | site_4geeks-com/locations/munich-germany/es.yml | es live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://4geeks.com/en/location/newyork-usa | site_4geeks-com/locations/newyork-usa/en.yml | en live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/location/newyork-usa | site_4geeks-com/locations/newyork-usa/en.yml | en live | sections[5] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/location/newyork-usa | site_4geeks-com/locations/newyork-usa/en.yml | en live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://4geeks.com/es/ubicacion/nueva-york-usa | site_4geeks-com/locations/newyork-usa/es.yml | es live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/es/ubicacion/nueva-york-usa | site_4geeks-com/locations/newyork-usa/es.yml | es live | sections[5] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/es/ubicacion/nueva-york-usa | site_4geeks-com/locations/newyork-usa/es.yml | es live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://4geeks.com/en/location/orlando-usa | site_4geeks-com/locations/orlando-usa/en.yml | en live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/location/orlando-usa | site_4geeks-com/locations/orlando-usa/en.yml | en live | sections[5] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/location/orlando-usa | site_4geeks-com/locations/orlando-usa/en.yml | en live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://4geeks.com/es/ubicacion/orlando-usa | site_4geeks-com/locations/orlando-usa/es.yml | es live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/es/ubicacion/orlando-usa | site_4geeks-com/locations/orlando-usa/es.yml | es live | sections[5] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/es/ubicacion/orlando-usa | site_4geeks-com/locations/orlando-usa/es.yml | es live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://4geeks.com/en/location/panamacity-panama | site_4geeks-com/locations/panamacity-panama/en.yml | en live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/location/panamacity-panama | site_4geeks-com/locations/panamacity-panama/en.yml | en live | sections[5] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/location/panamacity-panama | site_4geeks-com/locations/panamacity-panama/en.yml | en live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://4geeks.com/es/ubicacion/ciudad-de-panama | site_4geeks-com/locations/panamacity-panama/es.yml | es live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/es/ubicacion/ciudad-de-panama | site_4geeks-com/locations/panamacity-panama/es.yml | es live | sections[5] | CourseSelectorSpotlight | {desktop:md} | {mobile:80px, desktop:xl} |  |
| https://4geeks.com/es/ubicacion/ciudad-de-panama | site_4geeks-com/locations/panamacity-panama/es.yml | es live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://4geeks.com/en/location/quito-ecuador | site_4geeks-com/locations/quito-ecuador/en.yml | en live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/location/quito-ecuador | site_4geeks-com/locations/quito-ecuador/en.yml | en live | sections[5] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/location/quito-ecuador | site_4geeks-com/locations/quito-ecuador/en.yml | en live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://4geeks.com/es/ubicacion/quito-ecuador | site_4geeks-com/locations/quito-ecuador/es.yml | es live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/es/ubicacion/quito-ecuador | site_4geeks-com/locations/quito-ecuador/es.yml | es live | sections[5] | CourseSelectorSpotlight | {desktop:md} | {mobile:80px, desktop:xl} |  |
| https://4geeks.com/es/ubicacion/quito-ecuador | site_4geeks-com/locations/quito-ecuador/es.yml | es live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://4geeks.com/en/location/remote | site_4geeks-com/locations/remote/en.yml | en live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/location/remote | site_4geeks-com/locations/remote/en.yml | en live | sections[5] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/location/remote | site_4geeks-com/locations/remote/en.yml | en live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://4geeks.com/es/ubicacion/remoto | site_4geeks-com/locations/remote/es.yml | es live | sections[2] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/es/ubicacion/remoto | site_4geeks-com/locations/remote/es.yml | es live | sections[4] | CourseSelectorSpotlight | {desktop:md} | {mobile:80px, desktop:xl} |  |
| https://4geeks.com/es/ubicacion/remoto | site_4geeks-com/locations/remote/es.yml | es live | sections[6] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://4geeks.com/en/location/rest-of-europe | site_4geeks-com/locations/rest-of-europe/en.yml | en live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/location/rest-of-europe | site_4geeks-com/locations/rest-of-europe/en.yml | en live | sections[5] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/location/rest-of-europe | site_4geeks-com/locations/rest-of-europe/en.yml | en live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://4geeks.com/es/ubicacion/resto-de-europa | site_4geeks-com/locations/rest-of-europe/es.yml | es live | sections[4] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/es/ubicacion/resto-de-europa | site_4geeks-com/locations/rest-of-europe/es.yml | es live | sections[6] | CourseSelectorSpotlight | {desktop:md} | {mobile:80px, desktop:xl} |  |
| https://4geeks.com/es/ubicacion/resto-de-europa | site_4geeks-com/locations/rest-of-europe/es.yml | es live | sections[8] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://4geeks.com/en/location/rome-italy | site_4geeks-com/locations/rome-italy/en.yml | en live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/location/rome-italy | site_4geeks-com/locations/rome-italy/en.yml | en live | sections[5] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/location/rome-italy | site_4geeks-com/locations/rome-italy/en.yml | en live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://4geeks.com/es/ubicacion/roma-italia | site_4geeks-com/locations/rome-italy/es.yml | es live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/es/ubicacion/roma-italia | site_4geeks-com/locations/rome-italy/es.yml | es live | sections[5] | CourseSelectorSpotlight | {desktop:md} | {mobile:80px, desktop:xl} |  |
| https://4geeks.com/es/ubicacion/roma-italia | site_4geeks-com/locations/rome-italy/es.yml | es live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://4geeks.com/es/ubicacion/santiago-chile | site_4geeks-com/locations/santiago-chile/draft.es.yml | es draft (draft) | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/es/ubicacion/santiago-chile | site_4geeks-com/locations/santiago-chile/draft.es.yml | es draft (draft) | sections[5] | CourseSelectorSpotlight | {desktop:md} | {mobile:80px, desktop:xl} |  |
| https://4geeks.com/es/ubicacion/santiago-chile | site_4geeks-com/locations/santiago-chile/draft.es.yml | es draft (draft) | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://4geeks.com/en/location/santiago-chile | site_4geeks-com/locations/santiago-chile/en.yml | en live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/location/santiago-chile | site_4geeks-com/locations/santiago-chile/en.yml | en live | sections[5] | CourseSelectorSpotlight | {desktop:md} | {mobile:80px, desktop:xl} |  |
| https://4geeks.com/en/location/santiago-chile | site_4geeks-com/locations/santiago-chile/en.yml | en live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://4geeks.com/es/ubicacion/santiago-chile | site_4geeks-com/locations/santiago-chile/es.yml | es live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/es/ubicacion/santiago-chile | site_4geeks-com/locations/santiago-chile/es.yml | es live | sections[5] | CourseSelectorSpotlight | {desktop:md} | {mobile:80px, desktop:xl} |  |
| https://4geeks.com/es/ubicacion/santiago-chile | site_4geeks-com/locations/santiago-chile/es.yml | es live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://4geeks.com/en/location/tampa-usa | site_4geeks-com/locations/tampa-usa/en.yml | en live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/location/tampa-usa | site_4geeks-com/locations/tampa-usa/en.yml | en live | sections[5] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/location/tampa-usa | site_4geeks-com/locations/tampa-usa/en.yml | en live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://4geeks.com/es/ubicacion/tampa-usa | site_4geeks-com/locations/tampa-usa/es.yml | es live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/es/ubicacion/tampa-usa | site_4geeks-com/locations/tampa-usa/es.yml | es live | sections[5] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/es/ubicacion/tampa-usa | site_4geeks-com/locations/tampa-usa/es.yml | es live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://4geeks.com/en/location/toronto-canada | site_4geeks-com/locations/toronto-canada/en.yml | en live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/location/toronto-canada | site_4geeks-com/locations/toronto-canada/en.yml | en live | sections[5] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/location/toronto-canada | site_4geeks-com/locations/toronto-canada/en.yml | en live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://4geeks.com/es/ubicacion/toronto-canada | site_4geeks-com/locations/toronto-canada/es.yml | es live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/es/ubicacion/toronto-canada | site_4geeks-com/locations/toronto-canada/es.yml | es live | sections[5] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/es/ubicacion/toronto-canada | site_4geeks-com/locations/toronto-canada/es.yml | es live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://4geeks.com/en/location/valencia-spain | site_4geeks-com/locations/valencia-spain/en.yml | en live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/location/valencia-spain | site_4geeks-com/locations/valencia-spain/en.yml | en live | sections[5] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/location/valencia-spain | site_4geeks-com/locations/valencia-spain/en.yml | en live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://4geeks.com/es/ubicacion/valencia-espana | site_4geeks-com/locations/valencia-spain/es.yml | es live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/es/ubicacion/valencia-espana | site_4geeks-com/locations/valencia-spain/es.yml | es live | sections[5] | CourseSelectorSpotlight | {desktop:md} | {mobile:80px, desktop:xl} |  |
| https://4geeks.com/es/ubicacion/valencia-espana | site_4geeks-com/locations/valencia-spain/es.yml | es live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://4geeks.com/en/awards | site_4geeks-com/pages/awards/en.yml | en live | sections[2] | ListPressMentionsDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/es/premios | site_4geeks-com/pages/awards/es.yml | es live | sections[2] | ListPressMentionsDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/awards | site_4geeks-com/pages/awards/test.en.yml | en variant/draft "test" | sections[1] | ListPressMentionsDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/faq | site_4geeks-com/pages/faq/en.yml | en live | sections[1] | FaqEditorDefault | (unset) | {desktop:48px} |  |
| https://4geeks.com/es/preguntas-frecuentes | site_4geeks-com/pages/faq/es.yml | es live | sections[1] | FaqEditorDefault | (unset) | {desktop:48px} |  |
| https://4geeks.com/en/financing | site_4geeks-com/pages/financials/en.yml | en live | sections[1] | FeaturesGridStatsText | {desktop:none} | {desktop:48px} |  |
| https://4geeks.com/en/financing | site_4geeks-com/pages/financials/en.yml | en live | sections[6] | CourseSelectorSolid | {desktop:none} | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/financing | site_4geeks-com/pages/financials/en.yml | en live | sections[7] | CourseSelectorSolid | {desktop:none} | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/financing | site_4geeks-com/pages/financials/en.yml | en live | sections[8] | CourseSelectorSolid | {desktop:none} | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/es/financiaciones | site_4geeks-com/pages/financials/es.yml | es live | sections[1] | FeaturesGridStatsText | {desktop:none} | {desktop:48px} |  |
| https://4geeks.com/es/financiaciones | site_4geeks-com/pages/financials/es.yml | es live | sections[6] | CourseSelectorSolid | {desktop:none} | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/es/financiaciones | site_4geeks-com/pages/financials/es.yml | es live | sections[7] | CourseSelectorSolid | {desktop:none} | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/es/financiaciones | site_4geeks-com/pages/financials/es.yml | es live | sections[8] | CourseSelectorSolid | {desktop:none} | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/geekforce-career-support | site_4geeks-com/pages/geekforce-career-support/en.yml | en live | sections[1] | GraduatesStatsDefault | {desktop:sm none} | {mobile:80px lg, desktop:112px xl} |  |
| https://4geeks.com/en/geekforce-career-support | site_4geeks-com/pages/geekforce-career-support/en.yml | en live | sections[2] | CareerSupportExplainDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/geekforce-career-support | site_4geeks-com/pages/geekforce-career-support/en.yml | en live | sections[5] | TestimonialsSlideDefault | {desktop:md none} | {mobile:80px 48px, desktop:xl lg} |  |
| https://4geeks.com/es/soporte-profesional-geekforce | site_4geeks-com/pages/geekforce-career-support/es.yml | es live | sections[1] | CareerSupportExplainDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/es/soporte-profesional-geekforce | site_4geeks-com/pages/geekforce-career-support/es.yml | es live | sections[6] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/geekforce-career-support | site_4geeks-com/pages/geekforce-career-support/hub-links-fix.en.yml | en variant/draft "hub-links-fix" | sections[1] | GraduatesStatsDefault | {desktop:sm none} | {mobile:80px lg, desktop:112px xl} |  |
| https://4geeks.com/en/geekforce-career-support | site_4geeks-com/pages/geekforce-career-support/hub-links-fix.en.yml | en variant/draft "hub-links-fix" | sections[2] | CareerSupportExplainDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/geekforce-career-support | site_4geeks-com/pages/geekforce-career-support/hub-links-fix.en.yml | en variant/draft "hub-links-fix" | sections[3] | NumberedStepsBubbleText | {desktop:none lg} | {desktop:lg 128px} |  |
| https://4geeks.com/en/geekforce-career-support | site_4geeks-com/pages/geekforce-career-support/hub-links-fix.en.yml | en variant/draft "hub-links-fix" | sections[5] | TestimonialsSlideDefault | {desktop:md none} | {mobile:80px 48px, desktop:xl lg} |  |
| https://4geeks.com/en/geekforce-career-support | site_4geeks-com/pages/geekforce-career-support/hub-links-fix.en.yml | en variant/draft "hub-links-fix" | sections[10] | TextBlockDefault | {desktop:sm} | {mobile:lg, desktop:80px} |  |
| https://4geeks.com/en/geekpal-support | site_4geeks-com/pages/geekpal-support/en.yml | en live | sections[1] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/geekpal-support | site_4geeks-com/pages/geekpal-support/en.yml | en live | sections[2] | HumanAndAiDuoDefault | {mobile:sm none, desktop:md} | {mobile:72px 56px, desktop:88px} |  |
| https://4geeks.com/en/geekpal-support | site_4geeks-com/pages/geekpal-support/en.yml | en live | sections[3] | CommunitySupportDefault | {desktop:xl lg} | {desktop:152px 120px} |  |
| https://4geeks.com/en/geekpal-support | site_4geeks-com/pages/geekpal-support/en.yml | en live | sections[5] | TestimonialsSlideDefault | {desktop:md none} | {mobile:80px 48px, desktop:xl lg} |  |
| https://4geeks.com/es/soporte-geekpal | site_4geeks-com/pages/geekpal-support/es.yml | es live | sections[1] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/es/soporte-geekpal | site_4geeks-com/pages/geekpal-support/es.yml | es live | sections[2] | HumanAndAiDuoDefault | {mobile:sm none, desktop:md none} | {mobile:72px 56px, desktop:88px 56px} |  |
| https://4geeks.com/es/soporte-geekpal | site_4geeks-com/pages/geekpal-support/es.yml | es live | sections[3] | CommunitySupportDefault | {desktop:none md} | {desktop:56px 88px} | background bg-primary/5 → light-blue-5 |
| https://4geeks.com/es/soporte-geekpal | site_4geeks-com/pages/geekpal-support/es.yml | es live | sections[5] | TestimonialsSlideDefault | {desktop:md none} | {mobile:80px 48px, desktop:xl lg} |  |
| https://4geeks.com/en/geekpal-support | site_4geeks-com/pages/geekpal-support/geekpal-support-new.en.yml | en variant/draft "geekpal-support-new" | sections[1] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/geekpal-support | site_4geeks-com/pages/geekpal-support/geekpal-support-new.en.yml | en variant/draft "geekpal-support-new" | sections[2] | HumanAndAiDuoDefault | {mobile:sm none, desktop:md none} | {mobile:72px 56px, desktop:88px 56px} |  |
| https://4geeks.com/en/geekpal-support | site_4geeks-com/pages/geekpal-support/geekpal-support-new.en.yml | en variant/draft "geekpal-support-new" | sections[4] | CommunitySupportDefault | {desktop:none md} | {desktop:56px 88px} | background bg-primary/5 → light-blue-5 |
| https://4geeks.com/en/geekpal-support | site_4geeks-com/pages/geekpal-support/geekpal-support-new.en.yml | en variant/draft "geekpal-support-new" | sections[5] | TestimonialsSlideDefault | {desktop:md none} | {mobile:80px 48px, desktop:xl lg} |  |
| https://4geeks.com/en/geekpal-support | site_4geeks-com/pages/geekpal-support/mayor-enfoque-en-rigobot.en.yml | en variant/draft "mayor-enfoque-en-rigobot" | sections[1] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/geekpal-support | site_4geeks-com/pages/geekpal-support/mayor-enfoque-en-rigobot.en.yml | en variant/draft "mayor-enfoque-en-rigobot" | sections[2] | HumanAndAiDuoDefault | {mobile:sm none, desktop:md none} | {mobile:72px 56px, desktop:88px 56px} |  |
| https://4geeks.com/en/geekpal-support | site_4geeks-com/pages/geekpal-support/mayor-enfoque-en-rigobot.en.yml | en variant/draft "mayor-enfoque-en-rigobot" | sections[3] | CommunitySupportDefault | {desktop:none md} | {desktop:56px 88px} | background bg-primary/5 → light-blue-5 |
| https://4geeks.com/en/geekpal-support | site_4geeks-com/pages/geekpal-support/mayor-enfoque-en-rigobot.en.yml | en variant/draft "mayor-enfoque-en-rigobot" | sections[5] | TestimonialsSlideDefault | {desktop:md none} | {mobile:80px 48px, desktop:xl lg} |  |
| https://4geeks.com/en/geeks-vs-others | site_4geeks-com/pages/geeks-vs-others/en.yml | en live | sections[3] | FeaturesGridStatsCards | (unset) | {desktop:48px} | background (unset) → light-blue-5 |
| https://4geeks.com/en/geeks-vs-others | site_4geeks-com/pages/geeks-vs-others/en.yml | en live | sections[4] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/geeks-vs-others | site_4geeks-com/pages/geeks-vs-others/en.yml | en live | sections[6] | FeaturesQuadDefault | (unset) | {desktop:56px} |  |
| https://4geeks.com/es/geeks-vs-otros | site_4geeks-com/pages/geeks-vs-others/es.yml | es live | sections[3] | FeaturesGridStatsCards | (unset) | {desktop:48px} | background (unset) → light-blue-5 |
| https://4geeks.com/es/geeks-vs-otros | site_4geeks-com/pages/geeks-vs-others/es.yml | es live | sections[4] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/es/geeks-vs-otros | site_4geeks-com/pages/geeks-vs-others/es.yml | es live | sections[7] | FeaturesQuadDefault | (unset) | {desktop:56px} |  |
| https://4geeks.com/en/home | site_4geeks-com/pages/home/ai-flex-selector-prueba.en.yml | en variant/draft "ai-flex-selector-prueba" | sections[5] | AiFlexPathCourseColorSelector | {desktop:md xl} | {desktop:md 160px} |  |
| https://4geeks.com/en/home | site_4geeks-com/pages/home/ai-flex-selector-prueba.en.yml | en variant/draft "ai-flex-selector-prueba" | sections[6] | PricingPlanCardsComparison | {desktop:xl sm} | {mobile:128px 48px, desktop:152px 72px} | Was py-8 sm:py-14 (640px). The wrapper switches at 768px, so 640-767px wide screens now get 32px instead of 56px. |
| https://4geeks.com/en/home | site_4geeks-com/pages/home/en.yml | en live | sections[2] | HeroCredibility | {desktop:none} | {desktop:40px 24px} |  |
| https://4geeks.com/en/home | site_4geeks-com/pages/home/en.yml | en live | sections[3] | GraduatesStatsDefault | {desktop:sm} | {mobile:80px, desktop:112px} |  |
| https://4geeks.com/en/home | site_4geeks-com/pages/home/en.yml | en live | sections[6] | CourseSelectorSpotlight | {desktop:md} | {mobile:80px, desktop:xl} |  |
| https://4geeks.com/en/home | site_4geeks-com/pages/home/en.yml | en live | sections[9] | CareerSupportExplainDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/home | site_4geeks-com/pages/home/en.yml | en live | sections[10] | TestimonialsSlideDefault | {desktop:none sm} | {mobile:48px lg, desktop:lg 80px} |  |
| https://4geeks.com/en/home | site_4geeks-com/pages/home/en.yml | en live | sections[11] | ListPressMentionsFeaturedShowcase | {desktop:sm none} | {desktop:80px lg} |  |
| https://4geeks.com/es/inicio | site_4geeks-com/pages/home/es.yml | es live | sections[2] | HeroCredibility | {desktop:none} | {desktop:40px 24px} |  |
| https://4geeks.com/es/inicio | site_4geeks-com/pages/home/es.yml | es live | sections[3] | GraduatesStatsDefault | {desktop:sm} | {mobile:80px, desktop:112px} |  |
| https://4geeks.com/es/inicio | site_4geeks-com/pages/home/es.yml | es live | sections[6] | CourseSelectorSpotlight | {desktop:md} | {mobile:80px, desktop:xl} |  |
| https://4geeks.com/es/inicio | site_4geeks-com/pages/home/es.yml | es live | sections[9] | CareerSupportExplainDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/es/inicio | site_4geeks-com/pages/home/es.yml | es live | sections[10] | TestimonialsSlideDefault | {desktop:none} | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/home | site_4geeks-com/pages/home/home-new-programs.en.yml | en variant/draft "home-new-programs" | sections[0] | HeroCredibility | {desktop:none} | {desktop:40px 24px} |  |
| https://4geeks.com/en/home | site_4geeks-com/pages/home/home-new-programs.en.yml | en variant/draft "home-new-programs" | sections[1] | GraduatesStatsDefault | {desktop:sm} | {mobile:80px, desktop:112px} |  |
| https://4geeks.com/en/home | site_4geeks-com/pages/home/home-new-programs.en.yml | en variant/draft "home-new-programs" | sections[4] | CourseSelectorSpotlight | {desktop:md} | {mobile:80px, desktop:xl} |  |
| https://4geeks.com/en/home | site_4geeks-com/pages/home/home-new-programs.en.yml | en variant/draft "home-new-programs" | sections[7] | CareerSupportExplainDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/home | site_4geeks-com/pages/home/home-new-programs.en.yml | en variant/draft "home-new-programs" | sections[8] | TestimonialsSlideDefault | {desktop:none} | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/es/inicio | site_4geeks-com/pages/home/home-nuevos-programas.es.yml | es variant/draft "home-nuevos-programas" | sections[0] | HeroCredibility | {desktop:none} | {desktop:40px 24px} |  |
| https://4geeks.com/es/inicio | site_4geeks-com/pages/home/home-nuevos-programas.es.yml | es variant/draft "home-nuevos-programas" | sections[1] | GraduatesStatsDefault | {desktop:sm} | {mobile:80px, desktop:112px} |  |
| https://4geeks.com/es/inicio | site_4geeks-com/pages/home/home-nuevos-programas.es.yml | es variant/draft "home-nuevos-programas" | sections[4] | CourseSelectorSpotlight | {desktop:md} | {mobile:80px, desktop:xl} |  |
| https://4geeks.com/es/inicio | site_4geeks-com/pages/home/home-nuevos-programas.es.yml | es variant/draft "home-nuevos-programas" | sections[7] | CareerSupportExplainDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/es/inicio | site_4geeks-com/pages/home/home-nuevos-programas.es.yml | es variant/draft "home-nuevos-programas" | sections[8] | TestimonialsSlideDefault | {desktop:none} | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/es/home-new | site_4geeks-com/pages/home-new/es.yml | es live | sections[4] | FeaturesGridHighlight | (unset) | {desktop:56px} |  |
| https://4geeks.com/es/home-new | site_4geeks-com/pages/home-new/es.yml | es live | sections[5] | CareerSupportExplainDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/es/home-new | site_4geeks-com/pages/home-new/es.yml | es live | sections[6] | CourseSelectorSolid | {desktop:md lg} | {mobile:80px 112px, desktop:xl 128px} |  |
| https://4geeks.com/es/home-new | site_4geeks-com/pages/home-new/es.yml | es live | sections[8] | TestimonialsSlideDefault | {desktop:none} | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/job-guarantee | site_4geeks-com/pages/job-guarantee/en.yml | en live | sections[2] | FeaturesGridCardHeader | (unset) | {desktop:56px} | background bg-primary/5 → light-blue-5 |
| https://4geeks.com/en/job-guarantee | site_4geeks-com/pages/job-guarantee/en.yml | en live | sections[3] | GraduatesStatsFullBleed | {desktop:none} | {mobile:lg, desktop:xl} | background bg-muted/30 → muted-30 |
| https://4geeks.com/en/job-guarantee | site_4geeks-com/pages/job-guarantee/en.yml | en live | sections[4] | CourseSelectorSolid | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/job-guarantee | site_4geeks-com/pages/job-guarantee/en.yml | en live | sections[6] | NumberedStepsBubbleText | (unset) | {desktop:lg} | background (unset) → muted-30 |
| https://4geeks.com/es/trabajo-garantizado | site_4geeks-com/pages/job-guarantee/es.yml | es live | sections[1] | GraduatesStatsFullBleed | {desktop:none} | {mobile:lg, desktop:xl} | background bg-muted/30 → muted-30 |
| https://4geeks.com/es/trabajo-garantizado | site_4geeks-com/pages/job-guarantee/es.yml | es live | sections[2] | CourseSelectorSolid | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/es/trabajo-garantizado | site_4geeks-com/pages/job-guarantee/es.yml | es live | sections[3] | CourseSelectorSolid | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/es/trabajo-garantizado | site_4geeks-com/pages/job-guarantee/es.yml | es live | sections[5] | NumberedStepsBubbleText | (unset) | {desktop:lg} | background (unset) → muted-30 |
| https://4geeks.com/es/trabajo-garantizado | site_4geeks-com/pages/job-guarantee/es.yml | es live | sections[6] | FeaturesGridCardHeader | (unset) | {desktop:56px} | background bg-primary/5 → light-blue-5 |
| https://4geeks.com/en/partners | site_4geeks-com/pages/partners/en.yml | en live | sections[2] | FeaturesQuadDefault | (unset) | {desktop:56px} |  |
| https://4geeks.com/en/partners | site_4geeks-com/pages/partners/en.yml | en live | sections[3] | FeaturesGridStatsText | {desktop:none} | {desktop:48px} |  |
| https://4geeks.com/en/partners | site_4geeks-com/pages/partners/en.yml | en live | sections[4] | PartnershipCarouselSplitCard | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/partners | site_4geeks-com/pages/partners/en.yml | en live | sections[5] | PartnershipCarouselSplitCard | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/partners | site_4geeks-com/pages/partners/en.yml | en live | sections[7] | ProfilesCarouselDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/es/alianzas | site_4geeks-com/pages/partners/es.yml | es live | sections[2] | FeaturesQuadDefault | (unset) | {desktop:56px} |  |
| https://4geeks.com/es/alianzas | site_4geeks-com/pages/partners/es.yml | es live | sections[3] | FeaturesGridStatsText | {desktop:none} | {desktop:48px} |  |
| https://4geeks.com/es/alianzas | site_4geeks-com/pages/partners/es.yml | es live | sections[4] | PartnershipCarouselSplitCard | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/es/alianzas | site_4geeks-com/pages/partners/es.yml | es live | sections[5] | PartnershipCarouselSplitCard | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/es/alianzas | site_4geeks-com/pages/partners/es.yml | es live | sections[7] | ProfilesCarouselDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/press | site_4geeks-com/pages/press/en.yml | en live | sections[1] | ListPressMentionsDefault | {desktop:none md} | {mobile:48px 80px, desktop:lg xl} |  |
| https://4geeks.com/es/prensa | site_4geeks-com/pages/press/es.yml | es live | sections[1] | ListPressMentionsDefault | {desktop:none md} | {mobile:48px 80px, desktop:lg xl} |  |
| https://4geeks.com/es/propuesta-univermilenium | site_4geeks-com/pages/propuesta-univermilenium/es.yml | es live | sections[5] | FeaturesGridStatsCards | (unset) | {desktop:48px} |  |
| https://4geeks.com/en/scholarships | site_4geeks-com/pages/scholarships/en.yml | en live | sections[1] | FeaturesGridCardHeader | (unset) | {desktop:56px} | background bg-primary/5 → light-blue-5 |
| https://4geeks.com/en/scholarships | site_4geeks-com/pages/scholarships/en.yml | en live | sections[2] | PartnershipCarouselSplitCard | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/scholarships | site_4geeks-com/pages/scholarships/en.yml | en live | sections[3] | PartnershipCarouselSplitCard | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/scholarships | site_4geeks-com/pages/scholarships/en.yml | en live | sections[4] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/scholarships | site_4geeks-com/pages/scholarships/en.yml | en live | sections[5] | HorizontalBarsDefault | (unset) | {desktop:48px} |  |
| https://4geeks.com/es/becas | site_4geeks-com/pages/scholarships/es.yml | es live | sections[1] | FeaturesGridCardHeader | (unset) | {desktop:56px} | background bg-primary/5 → light-blue-5 |
| https://4geeks.com/es/becas | site_4geeks-com/pages/scholarships/es.yml | es live | sections[2] | PartnershipCarouselSplitCard | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/es/becas | site_4geeks-com/pages/scholarships/es.yml | es live | sections[3] | PartnershipCarouselSplitCard | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/es/becas | site_4geeks-com/pages/scholarships/es.yml | es live | sections[4] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/es/becas | site_4geeks-com/pages/scholarships/es.yml | es live | sections[5] | HorizontalBarsDefault | (unset) | {desktop:48px} |  |
| https://4geeks.com/en/scholarships | site_4geeks-com/pages/scholarships/kosmos-texas-draft.en.yml | en variant/draft "kosmos-texas-draft" | sections[1] | FeaturesGridCardHeader | (unset) | {desktop:56px} | background bg-primary/5 → light-blue-5 |
| https://4geeks.com/en/scholarships | site_4geeks-com/pages/scholarships/kosmos-texas-draft.en.yml | en variant/draft "kosmos-texas-draft" | sections[3] | PartnershipCarouselSplitCard | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/scholarships | site_4geeks-com/pages/scholarships/kosmos-texas-draft.en.yml | en variant/draft "kosmos-texas-draft" | sections[4] | PartnershipCarouselSplitCard | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/scholarships | site_4geeks-com/pages/scholarships/kosmos-texas-draft.en.yml | en variant/draft "kosmos-texas-draft" | sections[5] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/scholarships | site_4geeks-com/pages/scholarships/kosmos-texas-draft.en.yml | en variant/draft "kosmos-texas-draft" | sections[6] | HorizontalBarsDefault | (unset) | {desktop:48px} |  |
| https://4geeks.com/en/testimonials | site_4geeks-com/pages/testimonials/en.yml | en live | sections[2] | TestimonialsGridDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/es/testimonios | site_4geeks-com/pages/testimonials/es.yml | es live | sections[2] | TestimonialsGridDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/the-academy | site_4geeks-com/pages/the-academy/en.yml | en live | sections[8] | ProfilesCarouselDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/es/sobre-la-academia | site_4geeks-com/pages/the-academy/es.yml | es live | sections[8] | ProfilesCarouselDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://4geeks.com/en/upcoming-dates | site_4geeks-com/pages/upcoming-dates/en.yml | en live | sections[2] | DynamicTableDefault | (unset) | {desktop:48px} |  |
| https://4geeks.com/es/proximas-fechas | site_4geeks-com/pages/upcoming-dates/es.yml | es live | sections[1] | DynamicTableDefault | (unset) | {desktop:48px} |  |
| https://4geeks.com/en/career-programs/ai-engineering | site_4geeks-com/programs/ai-engineering/en.yml | en live | sections[4] | GraduatesStatsDefault | {desktop:md none} | {mobile:xl lg, desktop:128px xl} |  |
| https://4geeks.com/en/career-programs/ai-engineering | site_4geeks-com/programs/ai-engineering/en.yml | en live | sections[10] | HumanAndAiDuoDefault | {mobile:sm none, desktop:md none} | {mobile:72px 56px, desktop:88px 56px} |  |
| https://4geeks.com/es/programas-de-carrera/ingenieria-ia | site_4geeks-com/programs/ai-engineering/es.yml | es live | sections[7] | HumanAndAiDuoDefault | {mobile:sm none, desktop:md none} | {mobile:72px 56px, desktop:88px 56px} |  |
| https://4geeks.com/en/career-programs/ai-engineering | site_4geeks-com/programs/ai-engineering/new.en.yml | en variant/draft "new" | sections[4] | GraduatesStatsDefault | {desktop:md none} | {mobile:xl lg, desktop:128px xl} |  |
| https://4geeks.com/en/career-programs/ai-engineering | site_4geeks-com/programs/ai-engineering/new.en.yml | en variant/draft "new" | sections[7] | HumanAndAiDuoDefault | {mobile:sm none, desktop:md none} | {mobile:72px 56px, desktop:88px 56px} |  |
| https://4geeks.com/es/programas-de-carrera/ingenieria-ia | site_4geeks-com/programs/ai-engineering/nuevo.es.yml | es variant/draft "nuevo" | sections[7] | HumanAndAiDuoDefault | {mobile:sm none, desktop:md none} | {mobile:72px 56px, desktop:88px 56px} |  |
| https://4geeks.com/en/career-programs/ai-engineering-for-devs | site_4geeks-com/programs/ai-engineering-devs/en.yml | en live | sections[4] | GraduatesStatsDefault | {desktop:md none} | {mobile:xl lg, desktop:128px xl} |  |
| https://4geeks.com/en/career-programs/ai-engineering-for-devs | site_4geeks-com/programs/ai-engineering-devs/en.yml | en live | sections[9] | FeaturesGridStatsCards | {desktop:md none} | {desktop:80px 48px} |  |
| https://4geeks.com/es/programas-de-carrera/ingenieria-ia-para-desarrolladores | site_4geeks-com/programs/ai-engineering-devs/es.yml | es live | sections[4] | GraduatesStatsDefault | {desktop:md none} | {mobile:xl lg, desktop:128px xl} |  |
| https://4geeks.com/es/programas-de-carrera/ingenieria-ia-para-desarrolladores | site_4geeks-com/programs/ai-engineering-devs/es.yml | es live | sections[9] | FeaturesGridStatsCards | {desktop:md none} | {desktop:80px 48px} |  |
| https://4geeks.com/en/career-programs/ai-flex | site_4geeks-com/programs/ai-flex/en.yml | en live | sections[3] | FeaturesQuadDefault | (unset) | {desktop:56px} |  |
| https://4geeks.com/en/career-programs/ai-flex | site_4geeks-com/programs/ai-flex/en.yml | en live | sections[10] | HumanAndAiDuoDefault | {mobile:sm none, desktop:md none, section_id:human_and_ai_duo-99s71d} | {section_id:human_and_ai_duo-99s71d, mobile:72px 56px, desktop:88px 56px} |  |
| https://4geeks.com/en/career-programs/ai-flex | site_4geeks-com/programs/ai-flex/en.yml | en live | sections[12] | PricingPlanCards | {desktop:sm} | {mobile:48px, desktop:72px} | Was py-8 sm:py-14 (640px). The wrapper switches at 768px, so 640-767px wide screens now get 32px instead of 56px. |
| https://4geeks.com/en/career-programs/ai-flex | site_4geeks-com/programs/ai-flex/en.yml | en live | sections[13] | PricingPlanCards | {desktop:sm} | {mobile:48px, desktop:72px} | Was py-8 sm:py-14 (640px). The wrapper switches at 768px, so 640-767px wide screens now get 32px instead of 56px. |
| https://4geeks.com/en/career-programs/ai-flex | site_4geeks-com/programs/ai-flex/en.yml | en live | sections[14] | PricingPlanCards | {desktop:sm} | {mobile:48px, desktop:72px} | Was py-8 sm:py-14 (640px). The wrapper switches at 768px, so 640-767px wide screens now get 32px instead of 56px. |
| https://4geeks.com/es/programas-de-carrera/ai-flex | site_4geeks-com/programs/ai-flex/es.yml | es live | sections[3] | FeaturesQuadDefault | (unset) | {desktop:56px} |  |
| https://4geeks.com/es/programas-de-carrera/ai-flex | site_4geeks-com/programs/ai-flex/es.yml | es live | sections[10] | HumanAndAiDuoDefault | {mobile:sm none, desktop:md none} | {mobile:72px 56px, desktop:88px 56px} |  |
| https://4geeks.com/es/programas-de-carrera/ai-flex | site_4geeks-com/programs/ai-flex/es.yml | es live | sections[12] | PricingPlanCards | {desktop:sm} | {mobile:48px, desktop:72px} | Was py-8 sm:py-14 (640px). The wrapper switches at 768px, so 640-767px wide screens now get 32px instead of 56px. |
| https://4geeks.com/es/programas-de-carrera/ai-flex | site_4geeks-com/programs/ai-flex/es.yml | es live | sections[13] | PricingPlanCards | {desktop:sm} | {mobile:48px, desktop:72px} | Was py-8 sm:py-14 (640px). The wrapper switches at 768px, so 640-767px wide screens now get 32px instead of 56px. |
| https://4geeks.com/es/programas-de-carrera/ai-flex | site_4geeks-com/programs/ai-flex/es.yml | es live | sections[14] | PricingPlanCards | {desktop:sm} | {mobile:48px, desktop:72px} | Was py-8 sm:py-14 (640px). The wrapper switches at 768px, so 640-767px wide screens now get 32px instead of 56px. |
| https://4geeks.com/en/career-programs/ai-flex | site_4geeks-com/programs/ai-flex/old.en.yml | en variant/draft "old" | sections[4] | FeaturesQuadDefault | (unset) | {desktop:56px} |  |
| https://4geeks.com/en/career-programs/ai-flex | site_4geeks-com/programs/ai-flex/old.en.yml | en variant/draft "old" | sections[8] | HumanAndAiDuoDefault | {mobile:sm none, desktop:md none, section_id:human_and_ai_duo-99s71d} | {section_id:human_and_ai_duo-99s71d, mobile:72px 56px, desktop:88px 56px} |  |
| https://4geeks.com/en/career-programs/ai-flex | site_4geeks-com/programs/ai-flex/old.en.yml | en variant/draft "old" | sections[11] | PricingPlanCards | {desktop:sm} | {mobile:48px, desktop:72px} | Was py-8 sm:py-14 (640px). The wrapper switches at 768px, so 640-767px wide screens now get 32px instead of 56px. |
| https://4geeks.com/en/career-programs/ai-flex | site_4geeks-com/programs/ai-flex/old.en.yml | en variant/draft "old" | sections[12] | PricingPlanCards | {desktop:sm} | {mobile:48px, desktop:72px} | Was py-8 sm:py-14 (640px). The wrapper switches at 768px, so 640-767px wide screens now get 32px instead of 56px. |
| https://4geeks.com/en/career-programs/ai-flex | site_4geeks-com/programs/ai-flex/old.en.yml | en variant/draft "old" | sections[13] | PricingPlanCards | {desktop:sm} | {mobile:48px, desktop:72px} | Was py-8 sm:py-14 (640px). The wrapper switches at 768px, so 640-767px wide screens now get 32px instead of 56px. |
| https://4geeks.com/es/programas-de-carrera/ai-flex | site_4geeks-com/programs/ai-flex/v2.es.yml | es variant/draft "v2" | sections[3] | FeaturesQuadDefault | (unset) | {desktop:56px} |  |
| https://4geeks.com/es/programas-de-carrera/ai-flex | site_4geeks-com/programs/ai-flex/v2.es.yml | es variant/draft "v2" | sections[10] | HumanAndAiDuoDefault | {mobile:sm none, desktop:md none} | {mobile:72px 56px, desktop:88px 56px} |  |
| https://4geeks.com/es/programas-de-carrera/ai-flex | site_4geeks-com/programs/ai-flex/v2.es.yml | es variant/draft "v2" | sections[12] | PricingPlanCards | {desktop:sm} | {mobile:48px, desktop:72px} | Was py-8 sm:py-14 (640px). The wrapper switches at 768px, so 640-767px wide screens now get 32px instead of 56px. |
| https://4geeks.com/es/programas-de-carrera/ai-flex | site_4geeks-com/programs/ai-flex/v2.es.yml | es variant/draft "v2" | sections[13] | PricingPlanCards | {desktop:sm} | {mobile:48px, desktop:72px} | Was py-8 sm:py-14 (640px). The wrapper switches at 768px, so 640-767px wide screens now get 32px instead of 56px. |
| https://4geeks.com/es/programas-de-carrera/ai-flex | site_4geeks-com/programs/ai-flex/v2.es.yml | es variant/draft "v2" | sections[14] | PricingPlanCards | {desktop:sm} | {mobile:48px, desktop:72px} | Was py-8 sm:py-14 (640px). The wrapper switches at 768px, so 640-767px wide screens now get 32px instead of 56px. |
| https://4geeks.com/en/career-programs/ai-fluency | site_4geeks-com/programs/ai-fluency/en.yml | en live | sections[4] | FeaturesQuadDefault | (unset) | {desktop:56px} |  |
| https://4geeks.com/en/career-programs/ai-fluency | site_4geeks-com/programs/ai-fluency/en.yml | en live | sections[9] | HumanAndAiDuoDefault | {mobile:sm none, desktop:md none} | {mobile:72px 56px, desktop:88px 56px} |  |
| https://4geeks.com/es/programas-de-carrera/ai-fluency | site_4geeks-com/programs/ai-fluency/es.yml | es live | sections[3] | FeaturesQuadDefault | (unset) | {desktop:56px} |  |
| https://4geeks.com/es/programas-de-carrera/ai-fluency | site_4geeks-com/programs/ai-fluency/es.yml | es live | sections[9] | HumanAndAiDuoDefault | {mobile:sm none, desktop:md none} | {mobile:72px 56px, desktop:88px 56px} |  |
| https://4geeks.com/es/programas-de-carrera/ai-fluency | site_4geeks-com/programs/ai-fluency/hero-necesidad-v1.es.yml | es variant/draft "hero-necesidad-v1" | sections[4] | FeaturesQuadDefault | (unset) | {desktop:56px} |  |
| https://4geeks.com/es/programas-de-carrera/ai-fluency | site_4geeks-com/programs/ai-fluency/hero-necesidad-v1.es.yml | es variant/draft "hero-necesidad-v1" | sections[8] | HumanAndAiDuoDefault | {mobile:sm none, desktop:md none} | {mobile:72px 56px, desktop:88px 56px} |  |
| https://4geeks.com/en/career-programs/ai-fluency | site_4geeks-com/programs/ai-fluency/lumi-version.en.yml | en variant/draft "lumi-version" | sections[3] | FeaturesQuadDefault | (unset) | {desktop:56px} |  |
| https://4geeks.com/en/career-programs/ai-fluency | site_4geeks-com/programs/ai-fluency/lumi-version.en.yml | en variant/draft "lumi-version" | sections[8] | HumanAndAiDuoDefault | {mobile:sm none, desktop:md none} | {mobile:72px 56px, desktop:88px 56px} |  |
| https://4geeks.com/es/programas-de-carrera/ai-fluency | site_4geeks-com/programs/ai-fluency/lumi-version.es.yml | es variant/draft "lumi-version" | sections[3] | FeaturesQuadDefault | {desktop:none sm} | {desktop:56px 72px} |  |
| https://4geeks.com/es/programas-de-carrera/ai-fluency | site_4geeks-com/programs/ai-fluency/lumi-version.es.yml | es variant/draft "lumi-version" | sections[8] | HumanAndAiDuoDefault | {mobile:sm none, desktop:md none} | {mobile:72px 56px, desktop:88px 56px} |  |
| https://4geeks.com/en/career-programs/ai-fluency-for-data-analysis | site_4geeks-com/programs/ai-fluency-for-data-analysis/en.yml | en live | sections[3] | FeaturesQuadDefault | (unset) | {desktop:56px} |  |
| https://4geeks.com/en/career-programs/ai-fluency-for-data-analysis | site_4geeks-com/programs/ai-fluency-for-data-analysis/en.yml | en live | sections[9] | HumanAndAiDuoDefault | {desktop:md none, mobile:sm none} | {mobile:72px 56px, desktop:88px 56px} |  |
| https://4geeks.com/es/programas-de-carrera/ai-fluency-for-data-analysis | site_4geeks-com/programs/ai-fluency-for-data-analysis/es.yml | es live | sections[3] | FeaturesQuadDefault | (unset) | {desktop:56px} |  |
| https://4geeks.com/es/programas-de-carrera/ai-fluency-for-data-analysis | site_4geeks-com/programs/ai-fluency-for-data-analysis/es.yml | es live | sections[9] | HumanAndAiDuoDefault | {desktop:md none, mobile:sm none} | {mobile:72px 56px, desktop:88px 56px} |  |
| https://4geeks.com/en/career-programs/ai-fluency-for-hr | site_4geeks-com/programs/ai-fluency-for-hr/en.yml | en live | sections[3] | FeaturesQuadDefault | (unset) | {desktop:56px} |  |
| https://4geeks.com/en/career-programs/ai-fluency-for-hr | site_4geeks-com/programs/ai-fluency-for-hr/en.yml | en live | sections[9] | HumanAndAiDuoDefault | {desktop:md none, mobile:sm none} | {mobile:72px 56px, desktop:88px 56px} |  |
| https://4geeks.com/es/programas-de-carrera/ai-fluency-for-hr | site_4geeks-com/programs/ai-fluency-for-hr/es.yml | es live | sections[3] | FeaturesQuadDefault | (unset) | {desktop:56px} |  |
| https://4geeks.com/es/programas-de-carrera/ai-fluency-for-hr | site_4geeks-com/programs/ai-fluency-for-hr/es.yml | es live | sections[9] | HumanAndAiDuoDefault | {desktop:md none, mobile:sm none} | {mobile:72px 56px, desktop:88px 56px} |  |
| https://4geeks.com/en/career-programs/ai-fluency-for-marketing | site_4geeks-com/programs/ai-fluency-for-marketing/draft.en.yml | en draft (draft) | sections[3] | FeaturesQuadDefault | (unset) | {desktop:56px} |  |
| https://4geeks.com/en/career-programs/ai-fluency-for-marketing | site_4geeks-com/programs/ai-fluency-for-marketing/draft.en.yml | en draft (draft) | sections[9] | HumanAndAiDuoDefault | {mobile:sm none, desktop:md none} | {mobile:72px 56px, desktop:88px 56px} |  |
| https://4geeks.com/en/career-programs/ai-fluency-for-marketing | site_4geeks-com/programs/ai-fluency-for-marketing/en.yml | en live | sections[3] | FeaturesQuadDefault | (unset) | {desktop:56px} |  |
| https://4geeks.com/en/career-programs/ai-fluency-for-marketing | site_4geeks-com/programs/ai-fluency-for-marketing/en.yml | en live | sections[9] | HumanAndAiDuoDefault | {desktop:md none, mobile:sm none} | {mobile:72px 56px, desktop:88px 56px} |  |
| https://4geeks.com/es/programas-de-carrera/ai-fluency-for-marketing | site_4geeks-com/programs/ai-fluency-for-marketing/es.yml | es live | sections[3] | FeaturesQuadDefault | (unset) | {desktop:56px} |  |
| https://4geeks.com/es/programas-de-carrera/ai-fluency-for-marketing | site_4geeks-com/programs/ai-fluency-for-marketing/es.yml | es live | sections[9] | HumanAndAiDuoDefault | {desktop:md none, mobile:sm none} | {mobile:72px 56px, desktop:88px 56px} |  |
| https://4geeks.com/en/career-programs/ai-fluency-for-sales | site_4geeks-com/programs/ai-fluency-for-sales/en.yml | en live | sections[3] | FeaturesQuadDefault | (unset) | {desktop:56px} |  |
| https://4geeks.com/en/career-programs/ai-fluency-for-sales | site_4geeks-com/programs/ai-fluency-for-sales/en.yml | en live | sections[9] | HumanAndAiDuoDefault | {desktop:md none, mobile:sm none} | {mobile:72px 56px, desktop:88px 56px} |  |
| https://4geeks.com/es/programas-de-carrera/ai-fluency-for-sales | site_4geeks-com/programs/ai-fluency-for-sales/es.yml | es live | sections[3] | FeaturesQuadDefault | (unset) | {desktop:56px} |  |
| https://4geeks.com/es/programas-de-carrera/ai-fluency-for-sales | site_4geeks-com/programs/ai-fluency-for-sales/es.yml | es live | sections[9] | HumanAndAiDuoDefault | {desktop:md none, mobile:sm none} | {mobile:72px 56px, desktop:88px 56px} |  |
| https://4geeks.com/en/career-programs/applied-ai-course | site_4geeks-com/programs/applied-ai-course/en.yml | en live | sections[5] | FeaturesGridStatsText | (unset) | {desktop:48px} |  |
| https://4geeks.com/es/programas-de-carrera/curso-inteligencia-artificial | site_4geeks-com/programs/applied-ai-course/es.yml | es live | sections[5] | FeaturesGridStatsText | (unset) | {desktop:48px} |  |
| https://4geeks.com/en/career-programs/cybersecurity | site_4geeks-com/programs/cybersecurity/en.yml | en live | sections[4] | GraduatesStatsDefault | {desktop:md none} | {mobile:xl lg, desktop:128px xl} |  |
| https://4geeks.com/en/career-programs/cybersecurity | site_4geeks-com/programs/cybersecurity/en.yml | en live | sections[10] | FeaturesGridStatsCards | {desktop:md none} | {desktop:80px 48px} |  |
| https://4geeks.com/es/programas-de-carrera/ciberseguridad | site_4geeks-com/programs/cybersecurity/es.yml | es live | sections[5] | FeaturesGridStatsText | (unset) | {desktop:48px} | background bg-muted/30 → muted-30; background now spans the full section width (section has maxWidth/paddingX/marginX) |
| https://4geeks.com/en/career-programs/data-science-ml | site_4geeks-com/programs/data-science-ml/en.yml | en live | sections[4] | GraduatesStatsDefault | {desktop:md none} | {mobile:xl lg, desktop:128px xl} |  |
| https://4geeks.com/en/career-programs/data-science-ml | site_4geeks-com/programs/data-science-ml/en.yml | en live | sections[9] | FeaturesGridStatsCards | (unset) | {desktop:48px} | background (unset) → light-blue-5 |
| https://4geeks.com/es/programas-de-carrera/ciencia-de-datos-ml | site_4geeks-com/programs/data-science-ml/es.yml | es live | sections[5] | FeaturesGridStatsText | (unset) | {desktop:48px} |  |
| https://4geeks.com/es/programas-de-carrera/ciencia-de-datos-ml | site_4geeks-com/programs/data-science-ml/es.yml | es live | sections[9] | FeaturesGridHighlight | (unset) | {desktop:56px} |  |
| https://4geeks.com/en/career-programs/full-stack | site_4geeks-com/programs/full-stack/en.yml | en live | sections[4] | GraduatesStatsDefault | {desktop:md none} | {mobile:xl lg, desktop:128px xl} |  |
| https://4geeks.com/en/career-programs/full-stack | site_4geeks-com/programs/full-stack/en.yml | en live | sections[5] | FeaturesGridStatsText | (unset) | {desktop:48px} | background bg-muted/30 → muted-30; background now spans the full section width (section has maxWidth/paddingX/marginX) |
| https://4geeks.com/en/career-programs/full-stack | site_4geeks-com/programs/full-stack/en.yml | en live | sections[10] | FeaturesGridStatsCards | {desktop:md none} | {desktop:80px 48px} |  |
| https://4geeks.com/en/career-programs/hr-for-data-analysis | site_4geeks-com/programs/hr-for-data-analysis/draft.en.yml | en draft (draft) | sections[3] | FeaturesQuadDefault | (unset) | {desktop:56px} |  |
| https://4geeks.com/en/career-programs/hr-for-data-analysis | site_4geeks-com/programs/hr-for-data-analysis/draft.en.yml | en draft (draft) | sections[9] | HumanAndAiDuoDefault | {mobile:sm none, desktop:md none} | {mobile:72px 56px, desktop:88px 56px} |  |
| https://4geeks.com/en/scholarship/kosmos-arts-tech | site_4geeks-com/scholarship/kosmos-arts-tech/draft.en.yml | en draft (draft) | sections[1] | TextBlockDefault | {desktop:sm} | {mobile:lg, desktop:80px} |  |
| https://4geeks.com/en/scholarship/kosmos-arts-tech | site_4geeks-com/scholarship/kosmos-arts-tech/draft.en.yml | en draft (draft) | sections[2] | TextBlockDefault | {desktop:sm} | {mobile:lg, desktop:80px} |  |
| https://4geeks.com/en/scholarship/miami-tech-works | site_4geeks-com/scholarship/miami-tech-works/en.yml | en live | sections[3] | NumberedStepsBubbleText | (unset) | {desktop:lg} | background (unset) → muted-30 |
| https://4geeks.com/en/scholarship/miami-tech-works | site_4geeks-com/scholarship/miami-tech-works/en.yml | en live | sections[4] | FeaturesGridStatsCards | (unset) | {desktop:48px} | background (unset) → light-blue-5 |
| https://fl.4geeksacademy.com/en/location/atlanta-usa | site_4geeks-florida/locations/atlanta-usa/en.yml | en live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/location/atlanta-usa | site_4geeks-florida/locations/atlanta-usa/en.yml | en live | sections[5] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/location/atlanta-usa | site_4geeks-florida/locations/atlanta-usa/en.yml | en live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://fl.4geeksacademy.com/es/ubicacion/atlanta-usa | site_4geeks-florida/locations/atlanta-usa/es.yml | es live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/es/ubicacion/atlanta-usa | site_4geeks-florida/locations/atlanta-usa/es.yml | es live | sections[5] | CourseSelectorSpotlight | {desktop:md} | {mobile:80px, desktop:xl} |  |
| https://fl.4geeksacademy.com/es/ubicacion/atlanta-usa | site_4geeks-florida/locations/atlanta-usa/es.yml | es live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://fl.4geeksacademy.com/en/location/austin-usa | site_4geeks-florida/locations/austin-usa/en.yml | en live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/location/austin-usa | site_4geeks-florida/locations/austin-usa/en.yml | en live | sections[5] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/location/austin-usa | site_4geeks-florida/locations/austin-usa/en.yml | en live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://fl.4geeksacademy.com/es/ubicacion/austin-usa | site_4geeks-florida/locations/austin-usa/es.yml | es live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/es/ubicacion/austin-usa | site_4geeks-florida/locations/austin-usa/es.yml | es live | sections[5] | CourseSelectorSpotlight | {desktop:md} | {mobile:80px, desktop:xl} |  |
| https://fl.4geeksacademy.com/es/ubicacion/austin-usa | site_4geeks-florida/locations/austin-usa/es.yml | es live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://fl.4geeksacademy.com/en/location/barcelona-spain | site_4geeks-florida/locations/barcelona-spain/en.yml | en live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/location/barcelona-spain | site_4geeks-florida/locations/barcelona-spain/en.yml | en live | sections[5] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/location/barcelona-spain | site_4geeks-florida/locations/barcelona-spain/en.yml | en live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://fl.4geeksacademy.com/es/ubicacion/barcelona-espana | site_4geeks-florida/locations/barcelona-spain/es.yml | es live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/es/ubicacion/barcelona-espana | site_4geeks-florida/locations/barcelona-spain/es.yml | es live | sections[5] | CourseSelectorSpotlight | {desktop:md} | {mobile:80px, desktop:xl} |  |
| https://fl.4geeksacademy.com/es/ubicacion/barcelona-espana | site_4geeks-florida/locations/barcelona-spain/es.yml | es live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://fl.4geeksacademy.com/en/location/berlin-germany | site_4geeks-florida/locations/berlin-germany/en.yml | en live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/location/berlin-germany | site_4geeks-florida/locations/berlin-germany/en.yml | en live | sections[5] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/location/berlin-germany | site_4geeks-florida/locations/berlin-germany/en.yml | en live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://fl.4geeksacademy.com/es/ubicacion/berlin-alemania | site_4geeks-florida/locations/berlin-germany/es.yml | es live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/es/ubicacion/berlin-alemania | site_4geeks-florida/locations/berlin-germany/es.yml | es live | sections[5] | CourseSelectorSpotlight | {desktop:md} | {mobile:80px, desktop:xl} |  |
| https://fl.4geeksacademy.com/es/ubicacion/berlin-alemania | site_4geeks-florida/locations/berlin-germany/es.yml | es live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://fl.4geeksacademy.com/en/location/bogota-colombia | site_4geeks-florida/locations/bogota-colombia/en.yml | en live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/location/bogota-colombia | site_4geeks-florida/locations/bogota-colombia/en.yml | en live | sections[5] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/location/bogota-colombia | site_4geeks-florida/locations/bogota-colombia/en.yml | en live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://fl.4geeksacademy.com/es/ubicacion/bogota-colombia | site_4geeks-florida/locations/bogota-colombia/es.yml | es live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/es/ubicacion/bogota-colombia | site_4geeks-florida/locations/bogota-colombia/es.yml | es live | sections[5] | CourseSelectorSpotlight | {desktop:md} | {mobile:80px, desktop:xl} |  |
| https://fl.4geeksacademy.com/es/ubicacion/bogota-colombia | site_4geeks-florida/locations/bogota-colombia/es.yml | es live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://fl.4geeksacademy.com/en/location/buenosaires-argentina | site_4geeks-florida/locations/buenosaires-argentina/en.yml | en live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/location/buenosaires-argentina | site_4geeks-florida/locations/buenosaires-argentina/en.yml | en live | sections[5] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/location/buenosaires-argentina | site_4geeks-florida/locations/buenosaires-argentina/en.yml | en live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://fl.4geeksacademy.com/es/ubicacion/buenosaires-argentina | site_4geeks-florida/locations/buenosaires-argentina/es.yml | es live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/es/ubicacion/buenosaires-argentina | site_4geeks-florida/locations/buenosaires-argentina/es.yml | es live | sections[5] | CourseSelectorSpotlight | {desktop:md} | {mobile:80px, desktop:xl} |  |
| https://fl.4geeksacademy.com/es/ubicacion/buenosaires-argentina | site_4geeks-florida/locations/buenosaires-argentina/es.yml | es live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://fl.4geeksacademy.com/en/location/caracas-venezuela | site_4geeks-florida/locations/caracas-venezuela/en.yml | en live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/location/caracas-venezuela | site_4geeks-florida/locations/caracas-venezuela/en.yml | en live | sections[5] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/location/caracas-venezuela | site_4geeks-florida/locations/caracas-venezuela/en.yml | en live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://fl.4geeksacademy.com/es/ubicacion/caracas-venezuela | site_4geeks-florida/locations/caracas-venezuela/es.yml | es live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/es/ubicacion/caracas-venezuela | site_4geeks-florida/locations/caracas-venezuela/es.yml | es live | sections[5] | CourseSelectorSpotlight | {desktop:md} | {mobile:80px, desktop:xl} |  |
| https://fl.4geeksacademy.com/es/ubicacion/caracas-venezuela | site_4geeks-florida/locations/caracas-venezuela/es.yml | es live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://fl.4geeksacademy.com/en/location/chicago-usa | site_4geeks-florida/locations/chicago-usa/en.yml | en live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/location/chicago-usa | site_4geeks-florida/locations/chicago-usa/en.yml | en live | sections[5] | CourseSelectorSpotlight | {desktop:md} | {mobile:80px, desktop:xl} |  |
| https://fl.4geeksacademy.com/en/location/chicago-usa | site_4geeks-florida/locations/chicago-usa/en.yml | en live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://fl.4geeksacademy.com/es/ubicacion/chicago-usa | site_4geeks-florida/locations/chicago-usa/es.yml | es live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/es/ubicacion/chicago-usa | site_4geeks-florida/locations/chicago-usa/es.yml | es live | sections[5] | CourseSelectorSpotlight | {desktop:md} | {mobile:80px, desktop:xl} |  |
| https://fl.4geeksacademy.com/es/ubicacion/chicago-usa | site_4geeks-florida/locations/chicago-usa/es.yml | es live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://fl.4geeksacademy.com/en/location/costa-rica | site_4geeks-florida/locations/costa-rica/en.yml | en live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/location/costa-rica | site_4geeks-florida/locations/costa-rica/en.yml | en live | sections[5] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/location/costa-rica | site_4geeks-florida/locations/costa-rica/en.yml | en live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://fl.4geeksacademy.com/es/ubicacion/costa-rica | site_4geeks-florida/locations/costa-rica/es.yml | es live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/es/ubicacion/costa-rica | site_4geeks-florida/locations/costa-rica/es.yml | es live | sections[5] | CourseSelectorSpotlight | {desktop:md} | {mobile:80px, desktop:xl} |  |
| https://fl.4geeksacademy.com/es/ubicacion/costa-rica | site_4geeks-florida/locations/costa-rica/es.yml | es live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://fl.4geeksacademy.com/en/location/dallas-usa | site_4geeks-florida/locations/dallas-usa/en.yml | en live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/location/dallas-usa | site_4geeks-florida/locations/dallas-usa/en.yml | en live | sections[5] | CourseSelectorSpotlight | {desktop:md} | {mobile:80px, desktop:xl} |  |
| https://fl.4geeksacademy.com/en/location/dallas-usa | site_4geeks-florida/locations/dallas-usa/en.yml | en live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://fl.4geeksacademy.com/es/ubicacion/dallas-usa | site_4geeks-florida/locations/dallas-usa/es.yml | es live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/es/ubicacion/dallas-usa | site_4geeks-florida/locations/dallas-usa/es.yml | es live | sections[5] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/es/ubicacion/dallas-usa | site_4geeks-florida/locations/dallas-usa/es.yml | es live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://fl.4geeksacademy.com/en/location/dublin-ireland | site_4geeks-florida/locations/dublin-ireland/en.yml | en live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/location/dublin-ireland | site_4geeks-florida/locations/dublin-ireland/en.yml | en live | sections[5] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/location/dublin-ireland | site_4geeks-florida/locations/dublin-ireland/en.yml | en live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://fl.4geeksacademy.com/es/ubicacion/dublin-irlanda | site_4geeks-florida/locations/dublin-ireland/es.yml | es live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/es/ubicacion/dublin-irlanda | site_4geeks-florida/locations/dublin-ireland/es.yml | es live | sections[5] | CourseSelectorSpotlight | {desktop:md} | {mobile:80px, desktop:xl} |  |
| https://fl.4geeksacademy.com/es/ubicacion/dublin-irlanda | site_4geeks-florida/locations/dublin-ireland/es.yml | es live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://fl.4geeksacademy.com/en/location/hamburg-germany | site_4geeks-florida/locations/hamburg-germany/en.yml | en live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/location/hamburg-germany | site_4geeks-florida/locations/hamburg-germany/en.yml | en live | sections[5] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/location/hamburg-germany | site_4geeks-florida/locations/hamburg-germany/en.yml | en live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://fl.4geeksacademy.com/es/ubicacion/hamburgo-alemania | site_4geeks-florida/locations/hamburg-germany/es.yml | es live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/es/ubicacion/hamburgo-alemania | site_4geeks-florida/locations/hamburg-germany/es.yml | es live | sections[5] | CourseSelectorSpotlight | {desktop:md} | {mobile:80px, desktop:xl} |  |
| https://fl.4geeksacademy.com/es/ubicacion/hamburgo-alemania | site_4geeks-florida/locations/hamburg-germany/es.yml | es live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://fl.4geeksacademy.com/en/location/houston-usa | site_4geeks-florida/locations/houston-usa/en.yml | en live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/location/houston-usa | site_4geeks-florida/locations/houston-usa/en.yml | en live | sections[5] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/location/houston-usa | site_4geeks-florida/locations/houston-usa/en.yml | en live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://fl.4geeksacademy.com/es/ubicacion/houston-usa | site_4geeks-florida/locations/houston-usa/es.yml | es live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/es/ubicacion/houston-usa | site_4geeks-florida/locations/houston-usa/es.yml | es live | sections[5] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/es/ubicacion/houston-usa | site_4geeks-florida/locations/houston-usa/es.yml | es live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://fl.4geeksacademy.com/en/location/lapaz-bolivia | site_4geeks-florida/locations/lapaz-bolivia/en.yml | en live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/location/lapaz-bolivia | site_4geeks-florida/locations/lapaz-bolivia/en.yml | en live | sections[5] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/location/lapaz-bolivia | site_4geeks-florida/locations/lapaz-bolivia/en.yml | en live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://fl.4geeksacademy.com/es/ubicacion/lapaz-bolivia | site_4geeks-florida/locations/lapaz-bolivia/es.yml | es live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/es/ubicacion/lapaz-bolivia | site_4geeks-florida/locations/lapaz-bolivia/es.yml | es live | sections[5] | CourseSelectorSpotlight | {desktop:md} | {mobile:80px, desktop:xl} |  |
| https://fl.4geeksacademy.com/es/ubicacion/lapaz-bolivia | site_4geeks-florida/locations/lapaz-bolivia/es.yml | es live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://fl.4geeksacademy.com/en/location/lima-peru | site_4geeks-florida/locations/lima-peru/en.yml | en live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/location/lima-peru | site_4geeks-florida/locations/lima-peru/en.yml | en live | sections[5] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/location/lima-peru | site_4geeks-florida/locations/lima-peru/en.yml | en live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://fl.4geeksacademy.com/es/ubicacion/lima-peru | site_4geeks-florida/locations/lima-peru/es.yml | es live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/es/ubicacion/lima-peru | site_4geeks-florida/locations/lima-peru/es.yml | es live | sections[5] | CourseSelectorSpotlight | {desktop:md} | {mobile:80px, desktop:xl} |  |
| https://fl.4geeksacademy.com/es/ubicacion/lima-peru | site_4geeks-florida/locations/lima-peru/es.yml | es live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://fl.4geeksacademy.com/en/location/lisbon-portugal | site_4geeks-florida/locations/lisbon-portugal/en.yml | en live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/location/lisbon-portugal | site_4geeks-florida/locations/lisbon-portugal/en.yml | en live | sections[5] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/location/lisbon-portugal | site_4geeks-florida/locations/lisbon-portugal/en.yml | en live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://fl.4geeksacademy.com/es/ubicacion/lisboa-portugal | site_4geeks-florida/locations/lisbon-portugal/es.yml | es live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/es/ubicacion/lisboa-portugal | site_4geeks-florida/locations/lisbon-portugal/es.yml | es live | sections[5] | CourseSelectorSpotlight | {desktop:md} | {mobile:80px, desktop:xl} |  |
| https://fl.4geeksacademy.com/es/ubicacion/lisboa-portugal | site_4geeks-florida/locations/lisbon-portugal/es.yml | es live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://fl.4geeksacademy.com/en/location/losangeles-usa | site_4geeks-florida/locations/losangeles-usa/en.yml | en live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/location/losangeles-usa | site_4geeks-florida/locations/losangeles-usa/en.yml | en live | sections[5] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/location/losangeles-usa | site_4geeks-florida/locations/losangeles-usa/en.yml | en live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://fl.4geeksacademy.com/es/ubicacion/losangeles-usa | site_4geeks-florida/locations/losangeles-usa/es.yml | es live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/es/ubicacion/losangeles-usa | site_4geeks-florida/locations/losangeles-usa/es.yml | es live | sections[5] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/es/ubicacion/losangeles-usa | site_4geeks-florida/locations/losangeles-usa/es.yml | es live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://fl.4geeksacademy.com/en/location/madrid-spain | site_4geeks-florida/locations/madrid-spain/en.yml | en live | sections[4] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/location/madrid-spain | site_4geeks-florida/locations/madrid-spain/en.yml | en live | sections[6] | CourseSelectorSpotlight | {desktop:md} | {mobile:80px, desktop:xl} |  |
| https://fl.4geeksacademy.com/en/location/madrid-spain | site_4geeks-florida/locations/madrid-spain/en.yml | en live | sections[8] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://fl.4geeksacademy.com/es/ubicacion/madrid-spain | site_4geeks-florida/locations/madrid-spain/es.yml | es live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/es/ubicacion/madrid-spain | site_4geeks-florida/locations/madrid-spain/es.yml | es live | sections[5] | CourseSelectorSpotlight | {desktop:md} | {mobile:80px, desktop:xl} |  |
| https://fl.4geeksacademy.com/es/ubicacion/madrid-spain | site_4geeks-florida/locations/madrid-spain/es.yml | es live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://fl.4geeksacademy.com/en/location/malaga-spain | site_4geeks-florida/locations/malaga-spain/en.yml | en live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/location/malaga-spain | site_4geeks-florida/locations/malaga-spain/en.yml | en live | sections[5] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/location/malaga-spain | site_4geeks-florida/locations/malaga-spain/en.yml | en live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://fl.4geeksacademy.com/es/ubicacion/malaga-espana | site_4geeks-florida/locations/malaga-spain/es.yml | es live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/es/ubicacion/malaga-espana | site_4geeks-florida/locations/malaga-spain/es.yml | es live | sections[5] | CourseSelectorSpotlight | {desktop:md} | {mobile:80px, desktop:xl} |  |
| https://fl.4geeksacademy.com/es/ubicacion/malaga-espana | site_4geeks-florida/locations/malaga-spain/es.yml | es live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://fl.4geeksacademy.com/en/location/mexicocity-mexico | site_4geeks-florida/locations/mexicocity-mexico/en.yml | en live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/location/mexicocity-mexico | site_4geeks-florida/locations/mexicocity-mexico/en.yml | en live | sections[5] | CourseSelectorSpotlight | {desktop:md} | {mobile:80px, desktop:xl} |  |
| https://fl.4geeksacademy.com/en/location/mexicocity-mexico | site_4geeks-florida/locations/mexicocity-mexico/en.yml | en live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://fl.4geeksacademy.com/es/ubicacion/ciudad-de-mexico | site_4geeks-florida/locations/mexicocity-mexico/es.yml | es live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/es/ubicacion/ciudad-de-mexico | site_4geeks-florida/locations/mexicocity-mexico/es.yml | es live | sections[5] | CourseSelectorSpotlight | {desktop:md} | {mobile:80px, desktop:xl} |  |
| https://fl.4geeksacademy.com/es/ubicacion/ciudad-de-mexico | site_4geeks-florida/locations/mexicocity-mexico/es.yml | es live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://fl.4geeksacademy.com/en/location/miami-usa | site_4geeks-florida/locations/miami-usa/en.yml | en live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/location/miami-usa | site_4geeks-florida/locations/miami-usa/en.yml | en live | sections[5] | CourseSelectorSpotlight | {desktop:md lg} | {mobile:80px 112px, desktop:xl 128px} |  |
| https://fl.4geeksacademy.com/en/location/miami-usa | site_4geeks-florida/locations/miami-usa/en.yml | en live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://fl.4geeksacademy.com/es/ubicacion/miami-usa | site_4geeks-florida/locations/miami-usa/es.yml | es live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/es/ubicacion/miami-usa | site_4geeks-florida/locations/miami-usa/es.yml | es live | sections[5] | CourseSelectorSpotlight | {desktop:md} | {mobile:80px, desktop:xl} |  |
| https://fl.4geeksacademy.com/es/ubicacion/miami-usa | site_4geeks-florida/locations/miami-usa/es.yml | es live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://fl.4geeksacademy.com/en/location/milan-italy | site_4geeks-florida/locations/milan-italy/en.yml | en live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/location/milan-italy | site_4geeks-florida/locations/milan-italy/en.yml | en live | sections[5] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/location/milan-italy | site_4geeks-florida/locations/milan-italy/en.yml | en live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://fl.4geeksacademy.com/es/ubicacion/milan-italia | site_4geeks-florida/locations/milan-italy/es.yml | es live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/es/ubicacion/milan-italia | site_4geeks-florida/locations/milan-italy/es.yml | es live | sections[5] | CourseSelectorSpotlight | {desktop:md} | {mobile:80px, desktop:xl} |  |
| https://fl.4geeksacademy.com/es/ubicacion/milan-italia | site_4geeks-florida/locations/milan-italy/es.yml | es live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://fl.4geeksacademy.com/en/location/montevideo-uruguay | site_4geeks-florida/locations/montevideo-uruguay/en.yml | en live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/location/montevideo-uruguay | site_4geeks-florida/locations/montevideo-uruguay/en.yml | en live | sections[5] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/location/montevideo-uruguay | site_4geeks-florida/locations/montevideo-uruguay/en.yml | en live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://fl.4geeksacademy.com/es/ubicacion/montevideo-uruguay | site_4geeks-florida/locations/montevideo-uruguay/es.yml | es live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/es/ubicacion/montevideo-uruguay | site_4geeks-florida/locations/montevideo-uruguay/es.yml | es live | sections[5] | CourseSelectorSpotlight | {desktop:md} | {mobile:80px, desktop:xl} |  |
| https://fl.4geeksacademy.com/es/ubicacion/montevideo-uruguay | site_4geeks-florida/locations/montevideo-uruguay/es.yml | es live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://fl.4geeksacademy.com/en/location/munich-germany | site_4geeks-florida/locations/munich-germany/en.yml | en live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/location/munich-germany | site_4geeks-florida/locations/munich-germany/en.yml | en live | sections[5] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/location/munich-germany | site_4geeks-florida/locations/munich-germany/en.yml | en live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://fl.4geeksacademy.com/es/ubicacion/munich-alemania | site_4geeks-florida/locations/munich-germany/es.yml | es live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/es/ubicacion/munich-alemania | site_4geeks-florida/locations/munich-germany/es.yml | es live | sections[5] | CourseSelectorSpotlight | {desktop:md} | {mobile:80px, desktop:xl} |  |
| https://fl.4geeksacademy.com/es/ubicacion/munich-alemania | site_4geeks-florida/locations/munich-germany/es.yml | es live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://fl.4geeksacademy.com/en/location/newyork-usa | site_4geeks-florida/locations/newyork-usa/en.yml | en live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/location/newyork-usa | site_4geeks-florida/locations/newyork-usa/en.yml | en live | sections[5] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/location/newyork-usa | site_4geeks-florida/locations/newyork-usa/en.yml | en live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://fl.4geeksacademy.com/es/ubicacion/nueva-york-usa | site_4geeks-florida/locations/newyork-usa/es.yml | es live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/es/ubicacion/nueva-york-usa | site_4geeks-florida/locations/newyork-usa/es.yml | es live | sections[5] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/es/ubicacion/nueva-york-usa | site_4geeks-florida/locations/newyork-usa/es.yml | es live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://fl.4geeksacademy.com/en/location/orlando-usa | site_4geeks-florida/locations/orlando-usa/en.yml | en live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/location/orlando-usa | site_4geeks-florida/locations/orlando-usa/en.yml | en live | sections[5] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/location/orlando-usa | site_4geeks-florida/locations/orlando-usa/en.yml | en live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://fl.4geeksacademy.com/es/ubicacion/orlando-usa | site_4geeks-florida/locations/orlando-usa/es.yml | es live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/es/ubicacion/orlando-usa | site_4geeks-florida/locations/orlando-usa/es.yml | es live | sections[5] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/es/ubicacion/orlando-usa | site_4geeks-florida/locations/orlando-usa/es.yml | es live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://fl.4geeksacademy.com/en/location/panamacity-panama | site_4geeks-florida/locations/panamacity-panama/en.yml | en live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/location/panamacity-panama | site_4geeks-florida/locations/panamacity-panama/en.yml | en live | sections[5] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/location/panamacity-panama | site_4geeks-florida/locations/panamacity-panama/en.yml | en live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://fl.4geeksacademy.com/es/ubicacion/ciudad-de-panama | site_4geeks-florida/locations/panamacity-panama/es.yml | es live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/es/ubicacion/ciudad-de-panama | site_4geeks-florida/locations/panamacity-panama/es.yml | es live | sections[5] | CourseSelectorSpotlight | {desktop:md} | {mobile:80px, desktop:xl} |  |
| https://fl.4geeksacademy.com/es/ubicacion/ciudad-de-panama | site_4geeks-florida/locations/panamacity-panama/es.yml | es live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://fl.4geeksacademy.com/en/location/quito-ecuador | site_4geeks-florida/locations/quito-ecuador/en.yml | en live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/location/quito-ecuador | site_4geeks-florida/locations/quito-ecuador/en.yml | en live | sections[5] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/location/quito-ecuador | site_4geeks-florida/locations/quito-ecuador/en.yml | en live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://fl.4geeksacademy.com/es/ubicacion/quito-ecuador | site_4geeks-florida/locations/quito-ecuador/es.yml | es live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/es/ubicacion/quito-ecuador | site_4geeks-florida/locations/quito-ecuador/es.yml | es live | sections[5] | CourseSelectorSpotlight | {desktop:md} | {mobile:80px, desktop:xl} |  |
| https://fl.4geeksacademy.com/es/ubicacion/quito-ecuador | site_4geeks-florida/locations/quito-ecuador/es.yml | es live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://fl.4geeksacademy.com/en/location/remote | site_4geeks-florida/locations/remote/en.yml | en live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/location/remote | site_4geeks-florida/locations/remote/en.yml | en live | sections[5] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/location/remote | site_4geeks-florida/locations/remote/en.yml | en live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://fl.4geeksacademy.com/es/ubicacion/remoto | site_4geeks-florida/locations/remote/es.yml | es live | sections[2] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/es/ubicacion/remoto | site_4geeks-florida/locations/remote/es.yml | es live | sections[4] | CourseSelectorSpotlight | {desktop:md} | {mobile:80px, desktop:xl} |  |
| https://fl.4geeksacademy.com/es/ubicacion/remoto | site_4geeks-florida/locations/remote/es.yml | es live | sections[6] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://fl.4geeksacademy.com/en/location/rest-of-europe | site_4geeks-florida/locations/rest-of-europe/en.yml | en live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/location/rest-of-europe | site_4geeks-florida/locations/rest-of-europe/en.yml | en live | sections[5] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/location/rest-of-europe | site_4geeks-florida/locations/rest-of-europe/en.yml | en live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://fl.4geeksacademy.com/es/ubicacion/resto-de-europa | site_4geeks-florida/locations/rest-of-europe/es.yml | es live | sections[4] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/es/ubicacion/resto-de-europa | site_4geeks-florida/locations/rest-of-europe/es.yml | es live | sections[6] | CourseSelectorSpotlight | {desktop:md} | {mobile:80px, desktop:xl} |  |
| https://fl.4geeksacademy.com/es/ubicacion/resto-de-europa | site_4geeks-florida/locations/rest-of-europe/es.yml | es live | sections[8] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://fl.4geeksacademy.com/en/location/rome-italy | site_4geeks-florida/locations/rome-italy/en.yml | en live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/location/rome-italy | site_4geeks-florida/locations/rome-italy/en.yml | en live | sections[5] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/location/rome-italy | site_4geeks-florida/locations/rome-italy/en.yml | en live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://fl.4geeksacademy.com/es/ubicacion/roma-italia | site_4geeks-florida/locations/rome-italy/es.yml | es live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/es/ubicacion/roma-italia | site_4geeks-florida/locations/rome-italy/es.yml | es live | sections[5] | CourseSelectorSpotlight | {desktop:md} | {mobile:80px, desktop:xl} |  |
| https://fl.4geeksacademy.com/es/ubicacion/roma-italia | site_4geeks-florida/locations/rome-italy/es.yml | es live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://fl.4geeksacademy.com/en/location/santiago-chile | site_4geeks-florida/locations/santiago-chile/en.yml | en live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/location/santiago-chile | site_4geeks-florida/locations/santiago-chile/en.yml | en live | sections[5] | CourseSelectorSpotlight | {desktop:md} | {mobile:80px, desktop:xl} |  |
| https://fl.4geeksacademy.com/en/location/santiago-chile | site_4geeks-florida/locations/santiago-chile/en.yml | en live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://fl.4geeksacademy.com/es/ubicacion/santiago-chile | site_4geeks-florida/locations/santiago-chile/es.yml | es live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/es/ubicacion/santiago-chile | site_4geeks-florida/locations/santiago-chile/es.yml | es live | sections[5] | CourseSelectorSpotlight | {desktop:md} | {mobile:80px, desktop:xl} |  |
| https://fl.4geeksacademy.com/es/ubicacion/santiago-chile | site_4geeks-florida/locations/santiago-chile/es.yml | es live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://fl.4geeksacademy.com/en/location/tampa-usa | site_4geeks-florida/locations/tampa-usa/en.yml | en live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/location/tampa-usa | site_4geeks-florida/locations/tampa-usa/en.yml | en live | sections[5] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/location/tampa-usa | site_4geeks-florida/locations/tampa-usa/en.yml | en live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://fl.4geeksacademy.com/es/ubicacion/tampa-usa | site_4geeks-florida/locations/tampa-usa/es.yml | es live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/es/ubicacion/tampa-usa | site_4geeks-florida/locations/tampa-usa/es.yml | es live | sections[5] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/es/ubicacion/tampa-usa | site_4geeks-florida/locations/tampa-usa/es.yml | es live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://fl.4geeksacademy.com/en/location/toronto-canada | site_4geeks-florida/locations/toronto-canada/en.yml | en live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/location/toronto-canada | site_4geeks-florida/locations/toronto-canada/en.yml | en live | sections[5] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/location/toronto-canada | site_4geeks-florida/locations/toronto-canada/en.yml | en live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://fl.4geeksacademy.com/es/ubicacion/toronto-canada | site_4geeks-florida/locations/toronto-canada/es.yml | es live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/es/ubicacion/toronto-canada | site_4geeks-florida/locations/toronto-canada/es.yml | es live | sections[5] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/es/ubicacion/toronto-canada | site_4geeks-florida/locations/toronto-canada/es.yml | es live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://fl.4geeksacademy.com/en/location/valencia-spain | site_4geeks-florida/locations/valencia-spain/en.yml | en live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/location/valencia-spain | site_4geeks-florida/locations/valencia-spain/en.yml | en live | sections[5] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/location/valencia-spain | site_4geeks-florida/locations/valencia-spain/en.yml | en live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://fl.4geeksacademy.com/es/ubicacion/valencia-espana | site_4geeks-florida/locations/valencia-spain/es.yml | es live | sections[3] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/es/ubicacion/valencia-espana | site_4geeks-florida/locations/valencia-spain/es.yml | es live | sections[5] | CourseSelectorSpotlight | {desktop:md} | {mobile:80px, desktop:xl} |  |
| https://fl.4geeksacademy.com/es/ubicacion/valencia-espana | site_4geeks-florida/locations/valencia-spain/es.yml | es live | sections[7] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} | background bg-sidebar → muted |
| https://fl.4geeksacademy.com/en/awards | site_4geeks-florida/pages/awards/en.yml | en live | sections[1] | ListPressMentionsDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/premios | site_4geeks-florida/pages/awards/es.yml | es live | sections[1] | ListPressMentionsDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/component-test | site_4geeks-florida/pages/component-test/en.yml | en live | sections[3] | PartnershipCarouselDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/component-test | site_4geeks-florida/pages/component-test/en.yml | en live | sections[4] | CareerSupportExplainDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/component-test | site_4geeks-florida/pages/component-test/en.yml | en live | sections[5] | DoubleCTADefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/component-test | site_4geeks-florida/pages/component-test/en.yml | en live | sections[6] | ProfilesCarouselDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/faq | site_4geeks-florida/pages/faq/en.yml | en live | sections[0] | FaqEditorDefault | (unset) | {desktop:48px} |  |
| https://fl.4geeksacademy.com/en/faq | site_4geeks-florida/pages/faq/es.yml | es live | sections[0] | FaqEditorDefault | (unset) | {desktop:48px} |  |
| https://fl.4geeksacademy.com/en/financials | site_4geeks-florida/pages/financials/en.yml | en live | sections[1] | FeaturesGridStatsText | {desktop:none} | {desktop:48px} |  |
| https://fl.4geeksacademy.com/en/financials | site_4geeks-florida/pages/financials/en.yml | en live | sections[3] | CourseSelectorSolid | {desktop:none} | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/financiaciones | site_4geeks-florida/pages/financials/es.yml | es live | sections[1] | FeaturesGridStatsText | {desktop:none} | {desktop:48px} |  |
| https://fl.4geeksacademy.com/en/financiaciones | site_4geeks-florida/pages/financials/es.yml | es live | sections[6] | CourseSelectorSolid | {desktop:none} | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/financiaciones | site_4geeks-florida/pages/financials/es.yml | es live | sections[7] | CourseSelectorSolid | {desktop:none} | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/financiaciones | site_4geeks-florida/pages/financials/es.yml | es live | sections[8] | CourseSelectorSolid | {desktop:none} | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/geekforce-career-support | site_4geeks-florida/pages/geekforce-career-support/en.yml | en live | sections[1] | GraduatesStatsDefault | {desktop:sm none} | {mobile:80px lg, desktop:112px xl} |  |
| https://fl.4geeksacademy.com/en/geekforce-career-support | site_4geeks-florida/pages/geekforce-career-support/en.yml | en live | sections[2] | CareerSupportExplainDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/geekforce-career-support | site_4geeks-florida/pages/geekforce-career-support/en.yml | en live | sections[3] | NumberedStepsBubbleText | {desktop:none lg} | {desktop:lg 128px} |  |
| https://fl.4geeksacademy.com/en/geekforce-career-support | site_4geeks-florida/pages/geekforce-career-support/en.yml | en live | sections[4] | TestimonialsSlideDefault | {desktop:md none} | {mobile:80px 48px, desktop:xl lg} |  |
| https://fl.4geeksacademy.com/en/soporte-profesional-geekforce | site_4geeks-florida/pages/geekforce-career-support/es.yml | es live | sections[1] | CareerSupportExplainDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/soporte-profesional-geekforce | site_4geeks-florida/pages/geekforce-career-support/es.yml | es live | sections[6] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/geekpal-new | site_4geeks-florida/pages/geekpal-new/en.yml | en live | sections[1] | BannerDefault | {desktop:sm} | {mobile:lg, desktop:80px} |  |
| https://fl.4geeksacademy.com/en/geekpal-new | site_4geeks-florida/pages/geekpal-new/en.yml | en live | sections[2] | HumanAndAiDuoDefault | {mobile:sm none, desktop:md none} | {mobile:72px 56px, desktop:88px 56px} |  |
| https://fl.4geeksacademy.com/en/geekpal-new | site_4geeks-florida/pages/geekpal-new/en.yml | en live | sections[3] | CommunitySupportDefault | {desktop:none md} | {desktop:56px 88px} | background bg-primary/5 → light-blue-5 |
| https://fl.4geeksacademy.com/en/geekpal-new | site_4geeks-florida/pages/geekpal-new/en.yml | en live | sections[5] | TestimonialsSlideDefault | {desktop:md none} | {mobile:80px 48px, desktop:xl lg} |  |
| https://fl.4geeksacademy.com/en/geekpal-new | site_4geeks-florida/pages/geekpal-new/es.yml | es live | sections[1] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/geekpal-new | site_4geeks-florida/pages/geekpal-new/es.yml | es live | sections[2] | HumanAndAiDuoDefault | {mobile:sm none, desktop:md none} | {mobile:72px 56px, desktop:88px 56px} |  |
| https://fl.4geeksacademy.com/en/geekpal-new | site_4geeks-florida/pages/geekpal-new/es.yml | es live | sections[3] | CommunitySupportDefault | {desktop:none md} | {desktop:56px 88px} | background bg-primary/5 → light-blue-5 |
| https://fl.4geeksacademy.com/en/geekpal-new | site_4geeks-florida/pages/geekpal-new/es.yml | es live | sections[5] | TestimonialsSlideDefault | {desktop:md none} | {mobile:80px 48px, desktop:xl lg} |  |
| https://fl.4geeksacademy.com/en/geekpal-new | site_4geeks-florida/pages/geekpal-new/mayor-enfoque-en-rigobot.en.yml | en variant/draft "mayor-enfoque-en-rigobot" | sections[1] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/geekpal-new | site_4geeks-florida/pages/geekpal-new/mayor-enfoque-en-rigobot.en.yml | en variant/draft "mayor-enfoque-en-rigobot" | sections[2] | HumanAndAiDuoDefault | {mobile:sm none, desktop:md none} | {mobile:72px 56px, desktop:88px 56px} |  |
| https://fl.4geeksacademy.com/en/geekpal-new | site_4geeks-florida/pages/geekpal-new/mayor-enfoque-en-rigobot.en.yml | en variant/draft "mayor-enfoque-en-rigobot" | sections[3] | CommunitySupportDefault | {desktop:none md} | {desktop:56px 88px} | background bg-primary/5 → light-blue-5 |
| https://fl.4geeksacademy.com/en/geekpal-new | site_4geeks-florida/pages/geekpal-new/mayor-enfoque-en-rigobot.en.yml | en variant/draft "mayor-enfoque-en-rigobot" | sections[5] | TestimonialsSlideDefault | {desktop:md none} | {mobile:80px 48px, desktop:xl lg} |  |
| https://fl.4geeksacademy.com/en/geekpal-support | site_4geeks-florida/pages/geekpal-support/en.yml | en live | sections[1] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/geekpal-support | site_4geeks-florida/pages/geekpal-support/en.yml | en live | sections[2] | HumanAndAiDuoDefault | {mobile:sm none, desktop:sm} | {mobile:72px 56px, desktop:72px} |  |
| https://fl.4geeksacademy.com/en/geekpal-support | site_4geeks-florida/pages/geekpal-support/en.yml | en live | sections[3] | CommunitySupportDefault | {desktop:sm md} | {desktop:72px 88px} | background bg-primary/5 → light-blue-5 |
| https://fl.4geeksacademy.com/en/geekpal-support | site_4geeks-florida/pages/geekpal-support/en.yml | en live | sections[5] | TestimonialsSlideDefault | {desktop:md none} | {mobile:80px 48px, desktop:xl lg} |  |
| https://fl.4geeksacademy.com/en/soporte-geekpal | site_4geeks-florida/pages/geekpal-support/es.yml | es live | sections[1] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/soporte-geekpal | site_4geeks-florida/pages/geekpal-support/es.yml | es live | sections[2] | HumanAndAiDuoDefault | {mobile:sm none, desktop:md none} | {mobile:72px 56px, desktop:88px 56px} |  |
| https://fl.4geeksacademy.com/en/soporte-geekpal | site_4geeks-florida/pages/geekpal-support/es.yml | es live | sections[3] | CommunitySupportDefault | {desktop:none md} | {desktop:56px 88px} | background bg-primary/5 → light-blue-5 |
| https://fl.4geeksacademy.com/en/soporte-geekpal | site_4geeks-florida/pages/geekpal-support/es.yml | es live | sections[5] | TestimonialsSlideDefault | {desktop:md none} | {mobile:80px 48px, desktop:xl lg} |  |
| https://fl.4geeksacademy.com/en/geekpal-support | site_4geeks-florida/pages/geekpal-support/geekpal-support-new.en.yml | en variant/draft "geekpal-support-new" | sections[1] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/geekpal-support | site_4geeks-florida/pages/geekpal-support/geekpal-support-new.en.yml | en variant/draft "geekpal-support-new" | sections[2] | HumanAndAiDuoDefault | {mobile:sm none, desktop:md none} | {mobile:72px 56px, desktop:88px 56px} |  |
| https://fl.4geeksacademy.com/en/geekpal-support | site_4geeks-florida/pages/geekpal-support/geekpal-support-new.en.yml | en variant/draft "geekpal-support-new" | sections[4] | CommunitySupportDefault | {desktop:none md} | {desktop:56px 88px} | background bg-primary/5 → light-blue-5 |
| https://fl.4geeksacademy.com/en/geekpal-support | site_4geeks-florida/pages/geekpal-support/geekpal-support-new.en.yml | en variant/draft "geekpal-support-new" | sections[5] | TestimonialsSlideDefault | {desktop:md none} | {mobile:80px 48px, desktop:xl lg} |  |
| https://fl.4geeksacademy.com/en/geekpal-support | site_4geeks-florida/pages/geekpal-support/mayor-enfoque-en-rigobot.en.yml | en variant/draft "mayor-enfoque-en-rigobot" | sections[1] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/geekpal-support | site_4geeks-florida/pages/geekpal-support/mayor-enfoque-en-rigobot.en.yml | en variant/draft "mayor-enfoque-en-rigobot" | sections[2] | HumanAndAiDuoDefault | {mobile:sm none, desktop:md none} | {mobile:72px 56px, desktop:88px 56px} |  |
| https://fl.4geeksacademy.com/en/geekpal-support | site_4geeks-florida/pages/geekpal-support/mayor-enfoque-en-rigobot.en.yml | en variant/draft "mayor-enfoque-en-rigobot" | sections[3] | CommunitySupportDefault | {desktop:none md} | {desktop:56px 88px} | background bg-primary/5 → light-blue-5 |
| https://fl.4geeksacademy.com/en/geekpal-support | site_4geeks-florida/pages/geekpal-support/mayor-enfoque-en-rigobot.en.yml | en variant/draft "mayor-enfoque-en-rigobot" | sections[5] | TestimonialsSlideDefault | {desktop:md none} | {mobile:80px 48px, desktop:xl lg} |  |
| https://fl.4geeksacademy.com/en/geeks-vs-others | site_4geeks-florida/pages/geeks-vs-others/en.yml | en live | sections[3] | FeaturesGridStatsCards | (unset) | {desktop:48px} | background (unset) → light-blue-5 |
| https://fl.4geeksacademy.com/en/geeks-vs-others | site_4geeks-florida/pages/geeks-vs-others/en.yml | en live | sections[4] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/geeks-vs-otros | site_4geeks-florida/pages/geeks-vs-others/es.yml | es live | sections[3] | FeaturesGridStatsCards | (unset) | {desktop:48px} | background (unset) → light-blue-5 |
| https://fl.4geeksacademy.com/en/geeks-vs-otros | site_4geeks-florida/pages/geeks-vs-others/es.yml | es live | sections[4] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/geeks-vs-otros | site_4geeks-florida/pages/geeks-vs-others/es.yml | es live | sections[7] | FeaturesQuadDefault | (unset) | {desktop:56px} |  |
| https://fl.4geeksacademy.com/en/home | site_4geeks-florida/pages/home/ai-flex-selector-prueba.en.yml | en variant/draft "ai-flex-selector-prueba" | sections[5] | AiFlexPathCourseColorSelector | {desktop:md xl} | {desktop:md 160px} |  |
| https://fl.4geeksacademy.com/en/home | site_4geeks-florida/pages/home/ai-flex-selector-prueba.en.yml | en variant/draft "ai-flex-selector-prueba" | sections[6] | PricingPlanCardsComparison | {desktop:xl sm} | {mobile:128px 48px, desktop:152px 72px} | Was py-8 sm:py-14 (640px). The wrapper switches at 768px, so 640-767px wide screens now get 32px instead of 56px. |
| https://fl.4geeksacademy.com/en/home | site_4geeks-florida/pages/home/en.yml | en live | sections[0] | HeroCredibility | {desktop:none} | {desktop:40px 24px} |  |
| https://fl.4geeksacademy.com/en/home | site_4geeks-florida/pages/home/en.yml | en live | sections[1] | GraduatesStatsDefault | {desktop:md none} | {mobile:xl lg, desktop:128px xl} |  |
| https://fl.4geeksacademy.com/en/home | site_4geeks-florida/pages/home/en.yml | en live | sections[5] | CareerSupportExplainDefault | {desktop:md none} | {mobile:80px 48px, desktop:xl lg} |  |
| https://fl.4geeksacademy.com/en/home | site_4geeks-florida/pages/home/en.yml | en live | sections[7] | TestimonialsSlideDefault | {desktop:none} | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/inicio | site_4geeks-florida/pages/home/es.yml | es live | sections[0] | HeroCredibility | {desktop:none} | {desktop:40px 24px} |  |
| https://fl.4geeksacademy.com/en/inicio | site_4geeks-florida/pages/home/es.yml | es live | sections[5] | FeaturesGridStatsText | (unset) | {desktop:48px} |  |
| https://fl.4geeksacademy.com/en/inicio | site_4geeks-florida/pages/home/es.yml | es live | sections[6] | CareerSupportExplainDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/inicio | site_4geeks-florida/pages/home/es.yml | es live | sections[8] | TestimonialsSlideDefault | {desktop:none} | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/inicio | site_4geeks-florida/pages/home/es.yml | es live | sections[9] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/home | site_4geeks-florida/pages/home/home-new-programs.en.yml | en variant/draft "home-new-programs" | sections[0] | HeroCredibility | {desktop:none sm} | {desktop:40px} |  |
| https://fl.4geeksacademy.com/en/home | site_4geeks-florida/pages/home/home-new-programs.en.yml | en variant/draft "home-new-programs" | sections[1] | GraduatesStatsDefault | {desktop:sm} | {mobile:80px, desktop:112px} |  |
| https://fl.4geeksacademy.com/en/home | site_4geeks-florida/pages/home/home-new-programs.en.yml | en variant/draft "home-new-programs" | sections[4] | CourseSelectorSpotlight | {desktop:md} | {mobile:80px, desktop:xl} |  |
| https://fl.4geeksacademy.com/en/home | site_4geeks-florida/pages/home/home-new-programs.en.yml | en variant/draft "home-new-programs" | sections[7] | CareerSupportExplainDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/home | site_4geeks-florida/pages/home/home-new-programs.en.yml | en variant/draft "home-new-programs" | sections[8] | TestimonialsSlideDefault | {desktop:none} | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/home-copia-prueba | site_4geeks-florida/pages/home-copia-prueba/en.yml | en live | sections[4] | FeaturesGridStatsText | (unset) | {desktop:48px} |  |
| https://fl.4geeksacademy.com/en/home-copia-prueba | site_4geeks-florida/pages/home-copia-prueba/en.yml | en live | sections[5] | FeaturesGridStatsText | (unset) | {desktop:48px} |  |
| https://fl.4geeksacademy.com/en/home-copia-prueba | site_4geeks-florida/pages/home-copia-prueba/en.yml | en live | sections[6] | CareerSupportExplainDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/home-copia-prueba | site_4geeks-florida/pages/home-copia-prueba/en.yml | en live | sections[8] | TestimonialsSlideDefault | {desktop:none} | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/home-copia-prueba | site_4geeks-florida/pages/home-copia-prueba/es.yml | es live | sections[4] | FeaturesGridStatsText | (unset) | {desktop:48px} |  |
| https://fl.4geeksacademy.com/en/home-copia-prueba | site_4geeks-florida/pages/home-copia-prueba/es.yml | es live | sections[5] | FeaturesGridStatsText | (unset) | {desktop:48px} |  |
| https://fl.4geeksacademy.com/en/home-copia-prueba | site_4geeks-florida/pages/home-copia-prueba/es.yml | es live | sections[6] | CareerSupportExplainDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/home-copia-prueba | site_4geeks-florida/pages/home-copia-prueba/es.yml | es live | sections[8] | TestimonialsSlideDefault | {desktop:none} | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/home-new | site_4geeks-florida/pages/home-new/es.yml | es live | sections[4] | FeaturesGridHighlight | (unset) | {desktop:56px} |  |
| https://fl.4geeksacademy.com/en/home-new | site_4geeks-florida/pages/home-new/es.yml | es live | sections[5] | CareerSupportExplainDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/home-new | site_4geeks-florida/pages/home-new/es.yml | es live | sections[6] | CourseSelectorSolid | {desktop:md lg} | {mobile:80px 112px, desktop:xl 128px} |  |
| https://fl.4geeksacademy.com/en/home-new | site_4geeks-florida/pages/home-new/es.yml | es live | sections[8] | TestimonialsSlideDefault | {desktop:none} | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/home-prueba-lorena | site_4geeks-florida/pages/home-prueba-lorena/en.yml | en live | sections[0] | HeroCredibility | {desktop:none} | {desktop:40px 24px} |  |
| https://fl.4geeksacademy.com/en/home-prueba-lorena | site_4geeks-florida/pages/home-prueba-lorena/en.yml | en live | sections[1] | GraduatesStatsDefault | {desktop:md none} | {mobile:xl lg, desktop:128px xl} |  |
| https://fl.4geeksacademy.com/en/home-prueba-lorena | site_4geeks-florida/pages/home-prueba-lorena/en.yml | en live | sections[2] | FeaturesGridStatsText | (unset) | {desktop:48px} |  |
| https://fl.4geeksacademy.com/en/home-prueba-lorena | site_4geeks-florida/pages/home-prueba-lorena/en.yml | en live | sections[5] | FeaturesGridStatsText | (unset) | {desktop:48px} |  |
| https://fl.4geeksacademy.com/en/home-prueba-lorena | site_4geeks-florida/pages/home-prueba-lorena/en.yml | en live | sections[6] | CareerSupportExplainDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/home-prueba-lorena | site_4geeks-florida/pages/home-prueba-lorena/en.yml | en live | sections[8] | TestimonialsSlideDefault | {desktop:none} | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/home-prueba-lorena | site_4geeks-florida/pages/home-prueba-lorena/en.yml | en live | sections[9] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/home-prueba-lorena | site_4geeks-florida/pages/home-prueba-lorena/es.yml | es live | sections[0] | HeroCredibility | {desktop:none} | {desktop:40px 24px} |  |
| https://fl.4geeksacademy.com/en/home-prueba-lorena | site_4geeks-florida/pages/home-prueba-lorena/es.yml | es live | sections[2] | FeaturesGridStatsText | (unset) | {desktop:48px} |  |
| https://fl.4geeksacademy.com/en/home-prueba-lorena | site_4geeks-florida/pages/home-prueba-lorena/es.yml | es live | sections[4] | FeaturesGridStatsText | (unset) | {desktop:48px} |  |
| https://fl.4geeksacademy.com/en/home-prueba-lorena | site_4geeks-florida/pages/home-prueba-lorena/es.yml | es live | sections[5] | CareerSupportExplainDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/home-prueba-lorena | site_4geeks-florida/pages/home-prueba-lorena/es.yml | es live | sections[7] | TestimonialsSlideDefault | {desktop:none} | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/home-prueba-lorena | site_4geeks-florida/pages/home-prueba-lorena/es.yml | es live | sections[8] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/job-guarantee | site_4geeks-florida/pages/job-guarantee/en.yml | en live | sections[1] | FeaturesGridCardHeader | (unset) | {desktop:56px} | background bg-primary/5 → light-blue-5 |
| https://fl.4geeksacademy.com/en/job-guarantee | site_4geeks-florida/pages/job-guarantee/en.yml | en live | sections[2] | GraduatesStatsFullBleed | {desktop:none} | {mobile:lg, desktop:xl} | background bg-muted/30 → muted-30 |
| https://fl.4geeksacademy.com/en/job-guarantee | site_4geeks-florida/pages/job-guarantee/en.yml | en live | sections[3] | CourseSelectorSolid | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/job-guarantee | site_4geeks-florida/pages/job-guarantee/en.yml | en live | sections[5] | NumberedStepsBubbleText | (unset) | {desktop:lg} | background (unset) → muted-30 |
| https://fl.4geeksacademy.com/en/trabajo-garantizado | site_4geeks-florida/pages/job-guarantee/es.yml | es live | sections[1] | GraduatesStatsFullBleed | {desktop:none} | {mobile:lg, desktop:xl} | background bg-muted/30 → muted-30 |
| https://fl.4geeksacademy.com/en/trabajo-garantizado | site_4geeks-florida/pages/job-guarantee/es.yml | es live | sections[2] | CourseSelectorSolid | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/trabajo-garantizado | site_4geeks-florida/pages/job-guarantee/es.yml | es live | sections[3] | CourseSelectorSolid | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/trabajo-garantizado | site_4geeks-florida/pages/job-guarantee/es.yml | es live | sections[5] | NumberedStepsBubbleText | (unset) | {desktop:lg} | background (unset) → muted-30 |
| https://fl.4geeksacademy.com/en/trabajo-garantizado | site_4geeks-florida/pages/job-guarantee/es.yml | es live | sections[6] | FeaturesGridCardHeader | (unset) | {desktop:56px} | background bg-primary/5 → light-blue-5 |
| https://fl.4geeksacademy.com/en/limpieza-componentes-final | site_4geeks-florida/pages/limpieza-componentes-final/es.yml | es live | sections[4] | BannerDefault | {desktop:sm} | {mobile:lg, desktop:80px} |  |
| https://fl.4geeksacademy.com/en/limpieza-componentes-final | site_4geeks-florida/pages/limpieza-componentes-final/es.yml | es live | sections[5] | BentoCardsDefault | {desktop:sm} | {mobile:80px, desktop:112px} | overflow-hidden became overflow-x-clip so card shadows still show in the moved padding. |
| https://fl.4geeksacademy.com/en/limpieza-componentes-final | site_4geeks-florida/pages/limpieza-componentes-final/es.yml | es live | sections[10] | CommunitySupportDefault | {desktop:sm} | {desktop:72px} | background bg-primary/5 → light-blue-5 |
| https://fl.4geeksacademy.com/en/limpieza-componentes-final | site_4geeks-florida/pages/limpieza-componentes-final/es.yml | es live | sections[11] | ListPressMentionsDefault | {desktop:sm} | {mobile:lg, desktop:80px} |  |
| https://fl.4geeksacademy.com/en/lumi-home | site_4geeks-florida/pages/lumi-home/en.yml | en live | sections[0] | HeroCredibility | {desktop:none} | {desktop:40px 24px} |  |
| https://fl.4geeksacademy.com/en/lumi-home | site_4geeks-florida/pages/lumi-home/en.yml | en live | sections[1] | GraduatesStatsDefault | {desktop:md none} | {mobile:xl lg, desktop:128px xl} |  |
| https://fl.4geeksacademy.com/en/lumi-home | site_4geeks-florida/pages/lumi-home/en.yml | en live | sections[2] | FeaturesGridStatsText | (unset) | {desktop:48px} |  |
| https://fl.4geeksacademy.com/en/lumi-home | site_4geeks-florida/pages/lumi-home/en.yml | en live | sections[4] | FeaturesGridStatsText | (unset) | {desktop:48px} |  |
| https://fl.4geeksacademy.com/en/lumi-home | site_4geeks-florida/pages/lumi-home/en.yml | en live | sections[5] | CareerSupportExplainDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/lumi-home | site_4geeks-florida/pages/lumi-home/en.yml | en live | sections[7] | TestimonialsSlideDefault | {desktop:none} | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/lumi-home | site_4geeks-florida/pages/lumi-home/en.yml | en live | sections[8] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/lumi-home | site_4geeks-florida/pages/lumi-home/es.yml | es live | sections[0] | HeroCredibility | {desktop:none} | {desktop:40px 24px} |  |
| https://fl.4geeksacademy.com/en/lumi-home | site_4geeks-florida/pages/lumi-home/es.yml | es live | sections[2] | FeaturesGridStatsText | (unset) | {desktop:48px} |  |
| https://fl.4geeksacademy.com/en/lumi-home | site_4geeks-florida/pages/lumi-home/es.yml | es live | sections[4] | FeaturesGridStatsText | (unset) | {desktop:48px} |  |
| https://fl.4geeksacademy.com/en/lumi-home | site_4geeks-florida/pages/lumi-home/es.yml | es live | sections[5] | CareerSupportExplainDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/lumi-home | site_4geeks-florida/pages/lumi-home/es.yml | es live | sections[7] | TestimonialsSlideDefault | {desktop:none} | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/lumi-home | site_4geeks-florida/pages/lumi-home/es.yml | es live | sections[8] | CourseSelectorSpotlight | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/partners | site_4geeks-florida/pages/partners/en.yml | en live | sections[2] | FeaturesQuadDefault | (unset) | {desktop:56px} |  |
| https://fl.4geeksacademy.com/en/partners | site_4geeks-florida/pages/partners/en.yml | en live | sections[3] | FeaturesGridStatsText | {desktop:none} | {desktop:48px} |  |
| https://fl.4geeksacademy.com/en/partners | site_4geeks-florida/pages/partners/en.yml | en live | sections[4] | PartnershipCarouselSplitCard | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/partners | site_4geeks-florida/pages/partners/en.yml | en live | sections[5] | PartnershipCarouselSplitCard | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/partners | site_4geeks-florida/pages/partners/en.yml | en live | sections[7] | ProfilesCarouselDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/alianzas | site_4geeks-florida/pages/partners/es.yml | es live | sections[2] | FeaturesQuadDefault | (unset) | {desktop:56px} |  |
| https://fl.4geeksacademy.com/en/alianzas | site_4geeks-florida/pages/partners/es.yml | es live | sections[3] | FeaturesGridStatsText | {desktop:none} | {desktop:48px} |  |
| https://fl.4geeksacademy.com/en/alianzas | site_4geeks-florida/pages/partners/es.yml | es live | sections[4] | PartnershipCarouselSplitCard | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/alianzas | site_4geeks-florida/pages/partners/es.yml | es live | sections[5] | PartnershipCarouselSplitCard | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/alianzas | site_4geeks-florida/pages/partners/es.yml | es live | sections[7] | ProfilesCarouselDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/press | site_4geeks-florida/pages/press/en.yml | en live | sections[1] | ListPressMentionsDefault | {desktop:none md} | {mobile:48px 80px, desktop:lg xl} |  |
| https://fl.4geeksacademy.com/en/prensa | site_4geeks-florida/pages/press/es.yml | es live | sections[1] | ListPressMentionsDefault | {desktop:none md} | {mobile:48px 80px, desktop:lg xl} |  |
| https://fl.4geeksacademy.com/en/propuesta-univermilenium | site_4geeks-florida/pages/propuesta-univermilenium/es.yml | es live | sections[4] | FeaturesGridStatsCards | (unset) | {desktop:48px} | background bg-muted/30 → muted-30 |
| https://fl.4geeksacademy.com/en/prueba | site_4geeks-florida/pages/prueba/en.yml | en live | sections[4] | FeaturesGridStatsTextCard | {mobile:none md, desktop:none md} | {mobile:48px 80px, desktop:48px 80px} |  |
| https://fl.4geeksacademy.com/en/prueba | site_4geeks-florida/pages/prueba/en.yml | en live | sections[8] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/scholarships | site_4geeks-florida/pages/scholarships/en.yml | en live | sections[1] | FeaturesGridCardHeader | (unset) | {desktop:56px} | background bg-primary/5 → light-blue-5 |
| https://fl.4geeksacademy.com/en/scholarships | site_4geeks-florida/pages/scholarships/en.yml | en live | sections[2] | PartnershipCarouselSplitCard | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/scholarships | site_4geeks-florida/pages/scholarships/en.yml | en live | sections[3] | PartnershipCarouselSplitCard | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/scholarships | site_4geeks-florida/pages/scholarships/en.yml | en live | sections[4] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/scholarships | site_4geeks-florida/pages/scholarships/en.yml | en live | sections[5] | HorizontalBarsDefault | (unset) | {desktop:48px} |  |
| https://fl.4geeksacademy.com/en/becas | site_4geeks-florida/pages/scholarships/es.yml | es live | sections[1] | FeaturesGridCardHeader | (unset) | {desktop:56px} | background bg-primary/5 → light-blue-5 |
| https://fl.4geeksacademy.com/en/becas | site_4geeks-florida/pages/scholarships/es.yml | es live | sections[2] | PartnershipCarouselSplitCard | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/becas | site_4geeks-florida/pages/scholarships/es.yml | es live | sections[3] | PartnershipCarouselSplitCard | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/becas | site_4geeks-florida/pages/scholarships/es.yml | es live | sections[4] | TestimonialsSlideDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/becas | site_4geeks-florida/pages/scholarships/es.yml | es live | sections[5] | HorizontalBarsDefault | (unset) | {desktop:48px} |  |
| https://fl.4geeksacademy.com/en/test-dup | site_4geeks-florida/pages/test-dup/en.yml | en live | sections[1] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/test-dup | site_4geeks-florida/pages/test-dup/en.yml | en live | sections[2] | HumanAndAiDuoDefault | {mobile:sm none, desktop:md none} | {mobile:72px 56px, desktop:88px 56px} |  |
| https://fl.4geeksacademy.com/en/test-dup | site_4geeks-florida/pages/test-dup/en.yml | en live | sections[3] | CommunitySupportDefault | {desktop:none md} | {desktop:56px 88px} | background bg-primary/5 → light-blue-5 |
| https://fl.4geeksacademy.com/en/test-dup | site_4geeks-florida/pages/test-dup/en.yml | en live | sections[5] | TestimonialsSlideDefault | {desktop:md none} | {mobile:80px 48px, desktop:xl lg} |  |
| https://fl.4geeksacademy.com/en/test-dup | site_4geeks-florida/pages/test-dup/es.yml | es live | sections[1] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/test-dup | site_4geeks-florida/pages/test-dup/es.yml | es live | sections[2] | HumanAndAiDuoDefault | {mobile:sm none, desktop:md none} | {mobile:72px 56px, desktop:88px 56px} |  |
| https://fl.4geeksacademy.com/en/test-dup | site_4geeks-florida/pages/test-dup/es.yml | es live | sections[3] | CommunitySupportDefault | {desktop:none md} | {desktop:56px 88px} | background bg-primary/5 → light-blue-5 |
| https://fl.4geeksacademy.com/en/test-dup | site_4geeks-florida/pages/test-dup/es.yml | es live | sections[5] | TestimonialsSlideDefault | {desktop:md none} | {mobile:80px 48px, desktop:xl lg} |  |
| https://fl.4geeksacademy.com/en/test-dup | site_4geeks-florida/pages/test-dup/geekpal-support-new.en.yml | en variant/draft "geekpal-support-new" | sections[1] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/test-dup | site_4geeks-florida/pages/test-dup/geekpal-support-new.en.yml | en variant/draft "geekpal-support-new" | sections[2] | HumanAndAiDuoDefault | {mobile:sm none, desktop:md none} | {mobile:72px 56px, desktop:88px 56px} |  |
| https://fl.4geeksacademy.com/en/test-dup | site_4geeks-florida/pages/test-dup/geekpal-support-new.en.yml | en variant/draft "geekpal-support-new" | sections[3] | CommunitySupportDefault | {desktop:none md} | {desktop:56px 88px} | background bg-primary/5 → light-blue-5 |
| https://fl.4geeksacademy.com/en/test-dup | site_4geeks-florida/pages/test-dup/geekpal-support-new.en.yml | en variant/draft "geekpal-support-new" | sections[5] | TestimonialsSlideDefault | {desktop:md none} | {mobile:80px 48px, desktop:xl lg} |  |
| https://fl.4geeksacademy.com/en/test-dup | site_4geeks-florida/pages/test-dup/mayor-enfoque-en-rigobot.en.yml | en variant/draft "mayor-enfoque-en-rigobot" | sections[1] | BannerDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/test-dup | site_4geeks-florida/pages/test-dup/mayor-enfoque-en-rigobot.en.yml | en variant/draft "mayor-enfoque-en-rigobot" | sections[2] | HumanAndAiDuoDefault | {mobile:sm none, desktop:md none} | {mobile:72px 56px, desktop:88px 56px} |  |
| https://fl.4geeksacademy.com/en/test-dup | site_4geeks-florida/pages/test-dup/mayor-enfoque-en-rigobot.en.yml | en variant/draft "mayor-enfoque-en-rigobot" | sections[3] | CommunitySupportDefault | {desktop:none md} | {desktop:56px 88px} | background bg-primary/5 → light-blue-5 |
| https://fl.4geeksacademy.com/en/test-dup | site_4geeks-florida/pages/test-dup/mayor-enfoque-en-rigobot.en.yml | en variant/draft "mayor-enfoque-en-rigobot" | sections[5] | TestimonialsSlideDefault | {desktop:md none} | {mobile:80px 48px, desktop:xl lg} |  |
| https://fl.4geeksacademy.com/en/testimonials | site_4geeks-florida/pages/testimonials/en.yml | en live | sections[2] | TestimonialsGridDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/testimonios | site_4geeks-florida/pages/testimonials/es.yml | es live | sections[2] | TestimonialsGridDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/the-academy | site_4geeks-florida/pages/the-academy/en.yml | en live | sections[7] | ProfilesCarouselDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/sobre-la-academia | site_4geeks-florida/pages/the-academy/es.yml | es live | sections[7] | ProfilesCarouselDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://fl.4geeksacademy.com/en/upcoming-dates | site_4geeks-florida/pages/upcoming-dates/en.yml | en live | sections[0] | DynamicTableDefault | (unset) | {desktop:48px} |  |
| https://fl.4geeksacademy.com/en/proximas-fechas | site_4geeks-florida/pages/upcoming-dates/es.yml | es live | sections[0] | DynamicTableDefault | (unset) | {desktop:48px} |  |
| https://fl.4geeksacademy.com/en/programs/ai-engineering | site_4geeks-florida/programs/ai-engineering/en.yml | en live | sections[4] | GraduatesStatsDefault | {desktop:md none} | {mobile:xl lg, desktop:128px xl} |  |
| https://fl.4geeksacademy.com/en/programs/ai-engineering | site_4geeks-florida/programs/ai-engineering/en.yml | en live | sections[7] | HumanAndAiDuoDefault | {mobile:sm none, desktop:md none} | {mobile:72px 56px, desktop:88px 56px} |  |
| https://fl.4geeksacademy.com/es/programas/ingenieria-ia | site_4geeks-florida/programs/ai-engineering/es.yml | es live | sections[7] | HumanAndAiDuoDefault | {mobile:sm none, desktop:md none} | {mobile:72px 56px, desktop:88px 56px} |  |
| https://fl.4geeksacademy.com/en/programs/ai-engineering | site_4geeks-florida/programs/ai-engineering/new.en.yml | en variant/draft "new" | sections[4] | GraduatesStatsDefault | {desktop:md none} | {mobile:xl lg, desktop:128px xl} |  |
| https://fl.4geeksacademy.com/en/programs/ai-engineering | site_4geeks-florida/programs/ai-engineering/new.en.yml | en variant/draft "new" | sections[7] | HumanAndAiDuoDefault | {mobile:sm none, desktop:md none} | {mobile:72px 56px, desktop:88px 56px} |  |
| https://fl.4geeksacademy.com/en/programs/ai-engineering-for-devs | site_4geeks-florida/programs/ai-engineering-devs/en.yml | en live | sections[3] | GraduatesStatsDefault | {desktop:md none} | {mobile:xl lg, desktop:128px xl} |  |
| https://fl.4geeksacademy.com/en/programs/ai-engineering-for-devs | site_4geeks-florida/programs/ai-engineering-devs/en.yml | en live | sections[8] | FeaturesGridStatsCards | {desktop:md none} | {desktop:80px 48px} |  |
| https://fl.4geeksacademy.com/es/programas/ingenieria-ia-para-desarrolladores | site_4geeks-florida/programs/ai-engineering-devs/es.yml | es live | sections[3] | GraduatesStatsDefault | {desktop:md none} | {mobile:xl lg, desktop:128px xl} |  |
| https://fl.4geeksacademy.com/es/programas/ingenieria-ia-para-desarrolladores | site_4geeks-florida/programs/ai-engineering-devs/es.yml | es live | sections[7] | FeaturesGridStatsCards | {desktop:md none} | {desktop:80px 48px} |  |
| https://fl.4geeksacademy.com/en/programs/ai-engineering-new | site_4geeks-florida/programs/ai-engineering-new/en.yml | en live | sections[4] | GraduatesStatsDefault | {desktop:md none} | {mobile:xl lg, desktop:128px xl} |  |
| https://fl.4geeksacademy.com/en/programs/ai-engineering-new | site_4geeks-florida/programs/ai-engineering-new/en.yml | en live | sections[8] | FeaturesGridStatsCards | {desktop:md none} | {desktop:80px 48px} |  |
| https://fl.4geeksacademy.com/es/programas/ai-engineering-nuevo | site_4geeks-florida/programs/ai-engineering-new/es.yml | es live | sections[4] | GraduatesStatsDefault | {desktop:md none} | {mobile:xl lg, desktop:128px xl} |  |
| https://fl.4geeksacademy.com/es/programas/ai-engineering-nuevo | site_4geeks-florida/programs/ai-engineering-new/es.yml | es live | sections[8] | FeaturesGridStatsCards | {desktop:md none} | {desktop:80px 48px} |  |
| https://fl.4geeksacademy.com/en/programs/ai-flex | site_4geeks-florida/programs/ai-flex/en.yml | en live | sections[4] | FeaturesQuadDefault | (unset) | {desktop:56px} |  |
| https://fl.4geeksacademy.com/en/programs/ai-flex | site_4geeks-florida/programs/ai-flex/en.yml | en live | sections[12] | HumanAndAiDuoDefault | {mobile:sm none, desktop:md none, section_id:human_and_ai_duo-99s71d} | {section_id:human_and_ai_duo-99s71d, mobile:72px 56px, desktop:88px 56px} |  |
| https://fl.4geeksacademy.com/en/programs/ai-flex | site_4geeks-florida/programs/ai-flex/en.yml | en live | sections[14] | PricingPlanCards | {desktop:sm} | {mobile:48px, desktop:72px} | Was py-8 sm:py-14 (640px). The wrapper switches at 768px, so 640-767px wide screens now get 32px instead of 56px. |
| https://fl.4geeksacademy.com/en/programs/ai-flex | site_4geeks-florida/programs/ai-flex/en.yml | en live | sections[15] | PricingPlanCards | {desktop:sm} | {mobile:48px, desktop:72px} | Was py-8 sm:py-14 (640px). The wrapper switches at 768px, so 640-767px wide screens now get 32px instead of 56px. |
| https://fl.4geeksacademy.com/en/programs/ai-flex | site_4geeks-florida/programs/ai-flex/en.yml | en live | sections[16] | PricingPlanCards | {desktop:sm} | {mobile:48px, desktop:72px} | Was py-8 sm:py-14 (640px). The wrapper switches at 768px, so 640-767px wide screens now get 32px instead of 56px. |
| https://fl.4geeksacademy.com/es/programas/ai-flex | site_4geeks-florida/programs/ai-flex/es.yml | es live | sections[4] | FeaturesQuadDefault | (unset) | {desktop:56px} |  |
| https://fl.4geeksacademy.com/es/programas/ai-flex | site_4geeks-florida/programs/ai-flex/es.yml | es live | sections[12] | HumanAndAiDuoDefault | {mobile:sm none, desktop:md none, section_id:human_and_ai_duo-99s71d} | {section_id:human_and_ai_duo-99s71d, mobile:72px 56px, desktop:88px 56px} |  |
| https://fl.4geeksacademy.com/es/programas/ai-flex | site_4geeks-florida/programs/ai-flex/es.yml | es live | sections[14] | PricingPlanCards | {desktop:sm} | {mobile:48px, desktop:72px} | Was py-8 sm:py-14 (640px). The wrapper switches at 768px, so 640-767px wide screens now get 32px instead of 56px. |
| https://fl.4geeksacademy.com/es/programas/ai-flex | site_4geeks-florida/programs/ai-flex/es.yml | es live | sections[15] | PricingPlanCards | {desktop:sm} | {mobile:48px, desktop:72px} | Was py-8 sm:py-14 (640px). The wrapper switches at 768px, so 640-767px wide screens now get 32px instead of 56px. |
| https://fl.4geeksacademy.com/es/programas/ai-flex | site_4geeks-florida/programs/ai-flex/es.yml | es live | sections[16] | PricingPlanCards | {desktop:sm} | {mobile:48px, desktop:72px} | Was py-8 sm:py-14 (640px). The wrapper switches at 768px, so 640-767px wide screens now get 32px instead of 56px. |
| https://fl.4geeksacademy.com/en/programs/ai-fluency | site_4geeks-florida/programs/ai-fluency/en.yml | en live | sections[3] | FeaturesQuadDefault | (unset) | {desktop:56px} |  |
| https://fl.4geeksacademy.com/en/programs/ai-fluency | site_4geeks-florida/programs/ai-fluency/en.yml | en live | sections[9] | HumanAndAiDuoDefault | {mobile:sm none, desktop:md none} | {mobile:72px 56px, desktop:88px 56px} |  |
| https://fl.4geeksacademy.com/es/programas/ai-fluency | site_4geeks-florida/programs/ai-fluency/es.yml | es live | sections[3] | FeaturesQuadDefault | {desktop:none sm} | {desktop:56px 72px} |  |
| https://fl.4geeksacademy.com/es/programas/ai-fluency | site_4geeks-florida/programs/ai-fluency/es.yml | es live | sections[9] | HumanAndAiDuoDefault | {mobile:sm none, desktop:md none} | {mobile:72px 56px, desktop:88px 56px} |  |
| https://fl.4geeksacademy.com/en/programs/applied-ai-course | site_4geeks-florida/programs/applied-ai-course/en.yml | en live | sections[4] | FeaturesGridStatsText | (unset) | {desktop:48px} |  |
| https://fl.4geeksacademy.com/es/programas/curso-inteligencia-artificial | site_4geeks-florida/programs/applied-ai-course/es.yml | es live | sections[4] | FeaturesGridStatsText | (unset) | {desktop:48px} |  |
| https://fl.4geeksacademy.com/en/programs/cybersecurity | site_4geeks-florida/programs/cybersecurity/en.yml | en live | sections[3] | GraduatesStatsDefault | {desktop:md none} | {mobile:xl lg, desktop:128px xl} |  |
| https://fl.4geeksacademy.com/en/programs/cybersecurity | site_4geeks-florida/programs/cybersecurity/en.yml | en live | sections[9] | FeaturesGridStatsCards | {desktop:md none} | {desktop:80px 48px} |  |
| https://fl.4geeksacademy.com/es/programas/ciberseguridad | site_4geeks-florida/programs/cybersecurity/es.yml | es live | sections[4] | FeaturesGridStatsText | (unset) | {desktop:48px} | background bg-muted/30 → muted-30; background now spans the full section width (section has maxWidth/paddingX/marginX) |
| https://fl.4geeksacademy.com/en/programs/data-science-ml | site_4geeks-florida/programs/data-science-ml/en.yml | en live | sections[3] | GraduatesStatsDefault | {desktop:md none} | {mobile:xl lg, desktop:128px xl} |  |
| https://fl.4geeksacademy.com/en/programs/data-science-ml | site_4geeks-florida/programs/data-science-ml/en.yml | en live | sections[8] | FeaturesGridStatsCards | (unset) | {desktop:48px} | background (unset) → light-blue-5 |
| https://fl.4geeksacademy.com/es/programas/ciencia-de-datos-ml | site_4geeks-florida/programs/data-science-ml/es.yml | es live | sections[4] | FeaturesGridStatsText | (unset) | {desktop:48px} |  |
| https://fl.4geeksacademy.com/es/programas/ciencia-de-datos-ml | site_4geeks-florida/programs/data-science-ml/es.yml | es live | sections[8] | FeaturesGridHighlight | (unset) | {desktop:56px} |  |
| https://fl.4geeksacademy.com/en/programs/full-stack | site_4geeks-florida/programs/full-stack/en.yml | en live | sections[4] | GraduatesStatsDefault | {desktop:md none} | {mobile:xl lg, desktop:128px xl} |  |
| https://fl.4geeksacademy.com/en/programs/full-stack | site_4geeks-florida/programs/full-stack/en.yml | en live | sections[5] | FeaturesGridStatsText | (unset) | {desktop:48px} | background bg-muted/30 → muted-30; background now spans the full section width (section has maxWidth/paddingX/marginX) |
| https://fl.4geeksacademy.com/en/programs/full-stack | site_4geeks-florida/programs/full-stack/en.yml | en live | sections[10] | FeaturesGridStatsCards | {desktop:md none} | {desktop:80px 48px} |  |
| — | site_business-4geeks/blog/template.en.yml |  shared template (every entry of this type) | sections[0] | TextBlockDefault | (unset) | {mobile:48px, desktop:lg} |  |
| — | site_business-4geeks/blog/template.es.yml |  shared template (every entry of this type) | sections[0] | TextBlockDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://business.4geeks.com/en/about | site_business-4geeks/pages/about/en.yml | en live | sections[0] | TextBlockDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://business.4geeks.com/en/home | site_business-4geeks/pages/home/en.yml | en live | sections[3] | FeaturesQuadDefault | (unset) | {desktop:56px} |  |
| https://business.4geeks.com/en/home | site_business-4geeks/pages/home/en.yml | en live | sections[6] | GraduatesStatsDefault | {desktop:sm} | {mobile:80px, desktop:112px} |  |
| https://business.4geeks.com/en/home | site_business-4geeks/pages/home/en.yml | en live | sections[7] | ProfilesCarouselDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://business.4geeks.com/es/home | site_business-4geeks/pages/home/es.yml | es live | sections[3] | FeaturesQuadDefault | (unset) | {desktop:56px} |  |
| https://business.4geeks.com/es/home | site_business-4geeks/pages/home/es.yml | es live | sections[6] | GraduatesStatsDefault | {desktop:sm} | {mobile:80px, desktop:112px} |  |
| https://business.4geeks.com/es/home | site_business-4geeks/pages/home/es.yml | es live | sections[7] | ProfilesCarouselDefault | (unset) | {mobile:48px, desktop:lg} |  |
| https://business.4geeks.com/en/programs/ai-engineering-for-devs | site_business-4geeks/programs/ai-engineering-devs/en.yml | en live | sections[4] | GraduatesStatsDefault | {desktop:md none} | {mobile:xl lg, desktop:128px xl} |  |
| https://business.4geeks.com/en/programs/ai-engineering-for-devs | site_business-4geeks/programs/ai-engineering-devs/en.yml | en live | sections[9] | FeaturesGridStatsCards | {desktop:md none} | {desktop:80px 48px} |  |
| https://business.4geeks.com/es/programas/ingenieria-ia-para-desarrolladores | site_business-4geeks/programs/ai-engineering-devs/es.yml | es live | sections[4] | GraduatesStatsDefault | {desktop:md none} | {mobile:xl lg, desktop:128px xl} |  |
| https://business.4geeks.com/es/programas/ingenieria-ia-para-desarrolladores | site_business-4geeks/programs/ai-engineering-devs/es.yml | es live | sections[9] | FeaturesGridStatsCards | {desktop:md none} | {desktop:80px 48px} |  |
| https://business.4geeks.com/en/programs/ai-fluency-for-data-analysis | site_business-4geeks/programs/ai-fluency-for-data-analysis/en.yml | en live | sections[3] | FeaturesQuadDefault | (unset) | {desktop:56px} |  |
| https://business.4geeks.com/en/programs/ai-fluency-for-data-analysis | site_business-4geeks/programs/ai-fluency-for-data-analysis/en.yml | en live | sections[9] | HumanAndAiDuoDefault | {desktop:md none, mobile:sm none} | {mobile:72px 56px, desktop:88px 56px} |  |
| https://business.4geeks.com/es/programas/ai-fluency-for-data-analysis | site_business-4geeks/programs/ai-fluency-for-data-analysis/es.yml | es live | sections[3] | FeaturesQuadDefault | (unset) | {desktop:56px} |  |
| https://business.4geeks.com/es/programas/ai-fluency-for-data-analysis | site_business-4geeks/programs/ai-fluency-for-data-analysis/es.yml | es live | sections[9] | HumanAndAiDuoDefault | {desktop:md none, mobile:sm none} | {mobile:72px 56px, desktop:88px 56px} |  |
| https://business.4geeks.com/en/programs/ai-fluency-for-hr | site_business-4geeks/programs/ai-fluency-for-hr/en.yml | en live | sections[3] | FeaturesQuadDefault | (unset) | {desktop:56px} |  |
| https://business.4geeks.com/en/programs/ai-fluency-for-hr | site_business-4geeks/programs/ai-fluency-for-hr/en.yml | en live | sections[9] | HumanAndAiDuoDefault | {desktop:md none, mobile:sm none} | {mobile:72px 56px, desktop:88px 56px} |  |
| https://business.4geeks.com/es/programas/ai-fluency-for-hr | site_business-4geeks/programs/ai-fluency-for-hr/es.yml | es live | sections[3] | FeaturesQuadDefault | (unset) | {desktop:56px} |  |
| https://business.4geeks.com/es/programas/ai-fluency-for-hr | site_business-4geeks/programs/ai-fluency-for-hr/es.yml | es live | sections[9] | HumanAndAiDuoDefault | {desktop:md none, mobile:sm none} | {mobile:72px 56px, desktop:88px 56px} |  |
| https://business.4geeks.com/en/programs/ai-fluency-for-marketing | site_business-4geeks/programs/ai-fluency-for-marketing/draft.en.yml | en draft (draft) | sections[3] | FeaturesQuadDefault | (unset) | {desktop:56px} |  |
| https://business.4geeks.com/en/programs/ai-fluency-for-marketing | site_business-4geeks/programs/ai-fluency-for-marketing/draft.en.yml | en draft (draft) | sections[9] | HumanAndAiDuoDefault | {mobile:sm none, desktop:md none} | {mobile:72px 56px, desktop:88px 56px} |  |
| https://business.4geeks.com/en/programs/ai-fluency-for-marketing | site_business-4geeks/programs/ai-fluency-for-marketing/en.yml | en live | sections[3] | FeaturesQuadDefault | (unset) | {desktop:56px} |  |
| https://business.4geeks.com/en/programs/ai-fluency-for-marketing | site_business-4geeks/programs/ai-fluency-for-marketing/en.yml | en live | sections[9] | HumanAndAiDuoDefault | {desktop:md none, mobile:sm none} | {mobile:72px 56px, desktop:88px 56px} |  |
| https://business.4geeks.com/es/programas/ai-fluency-for-marketing | site_business-4geeks/programs/ai-fluency-for-marketing/es.yml | es live | sections[3] | FeaturesQuadDefault | (unset) | {desktop:56px} |  |
| https://business.4geeks.com/es/programas/ai-fluency-for-marketing | site_business-4geeks/programs/ai-fluency-for-marketing/es.yml | es live | sections[9] | HumanAndAiDuoDefault | {desktop:md none, mobile:sm none} | {mobile:72px 56px, desktop:88px 56px} |  |
| https://business.4geeks.com/en/programs/ai-fluency-for-sales | site_business-4geeks/programs/ai-fluency-for-sales/en.yml | en live | sections[3] | FeaturesQuadDefault | (unset) | {desktop:56px} |  |
| https://business.4geeks.com/en/programs/ai-fluency-for-sales | site_business-4geeks/programs/ai-fluency-for-sales/en.yml | en live | sections[9] | HumanAndAiDuoDefault | {desktop:md none, mobile:sm none} | {mobile:72px 56px, desktop:88px 56px} |  |
| https://business.4geeks.com/es/programas/ai-fluency-for-sales | site_business-4geeks/programs/ai-fluency-for-sales/es.yml | es live | sections[3] | FeaturesQuadDefault | (unset) | {desktop:56px} |  |
| https://business.4geeks.com/es/programas/ai-fluency-for-sales | site_business-4geeks/programs/ai-fluency-for-sales/es.yml | es live | sections[9] | HumanAndAiDuoDefault | {desktop:md none, mobile:sm none} | {mobile:72px 56px, desktop:88px 56px} |  |
| — | shared/component-registry/hero/v1.0/examples/home_hero.yml |  registry example | yaml[0] | HeroCredibility | {desktop:none} | {desktop:40px 24px} |  |
| — | shared/component-registry/text_block/v1.0/examples/text_block_-_default.yml |  registry example | yaml[0] | TextBlockDefault | (unset) | {mobile:48px, desktop:lg} |  |

## After the deploy

Run the read-only re-scan to catch sections saved with the old values between the final content push and the deploy:

```bash
npx tsx scripts/section-padding/rescan.ts
```
