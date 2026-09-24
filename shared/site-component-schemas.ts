// Single coupling point for site registry Zod schemas.
// Dev with site_learning-mdc-edu present: this file re-exports real site Zod.
// Pack/CI without that registry: Vite + esbuild alias this module to
// site-component-schemas.stub.ts (see shared/site-schema-stub-mode.ts,
// WEBLIFY_SITE_SCHEMAS_STUB=1). prepack also swaps stub into this path for the tarball.

// ai_flex_path
export {
  aiFlexPathDefaultSchema,
  aiFlexPathDragAndDropSchema,
  aiFlexPathCourseColorSelectorSchema,
  aiFlexPathSimplifiedSchema,
  aiFlexPathSectionSchema,
  type AiFlexPathDefault,
  type AiFlexPathDragAndDrop,
  type AiFlexPathCourseColorSelector,
  type AiFlexPathSimplified,
  type AiFlexPathSection,
} from "../site_learning-mdc-edu/component-registry/ai_flex_path/v1.0/schema";

// ai_flex_selector
export {
  aiFlexSelectorDefaultSchema,
  type AiFlexSelectorDefault,
} from "../site_learning-mdc-edu/component-registry/ai_flex_selector/v1.0/schema";

// ai_learning
export {
  chatExampleSchema,
  aiLearningBulletSchema,
  aiLearningFeatureSchema,
  aiLearningFeatureTabsSectionSchema,
  aiLearningHighlightSectionSchema,
  aiLearningSectionSchema,
  type ChatExample,
  type AiLearningFeatureTabsSection,
  type AiLearningHighlightSection,
  type AiLearningSection,
} from "../site_learning-mdc-edu/component-registry/ai_learning/v1.0/schema";

// apply_form
export {
  applyFormSectionSchema,
} from "../site_learning-mdc-edu/component-registry/apply_form/v1.0/schema";

// award_badges
export {
  awardBadgesSectionSchema,
} from "../site_learning-mdc-edu/component-registry/award_badges/v1.0/schema";

// banner
export {
  bannerSchema,
  bannerSectionSchema,
  bannerMarqueeBadgesSchema,
  type BannerSection,
  type BannerMarqueeBadges,
} from "../site_learning-mdc-edu/component-registry/banner/v1.0/schema";

// bento_cards
export {
  bentoCardItemSchema,
  bentoCardsSectionSchema,
  type BentoCardItem,
  type BentoCardsSection,
} from "../site_learning-mdc-edu/component-registry/bento_cards/v1.0/schema";

// bullet_tabs_showcase
export {
  bulletTabsShowcaseSectionSchema,
  type BulletTabsShowcaseSection,
  type BulletTab,
} from "../site_learning-mdc-edu/component-registry/bullet_tabs_showcase/v1.0/schema";

// career_support_explain
export {
  careerSupportExplainSectionSchema,
  type CareerSupportExplainSection,
  type CareerSupportTab,
  type CareerSupportBox,
  type CareerSupportBullet,
  type CareerSupportStat,
  type CareerSupportLogo,
  type CareerSupportTestimonial,
  type CareerSupportTestimonialLogo,
} from "../site_learning-mdc-edu/component-registry/career_support_explain/v1.0/schema";

// certificate
export {
  certificateSectionSchema,
  type CertificateSection,
} from "../site_learning-mdc-edu/component-registry/certificate/v1.0/schema";

// comparison_table
export {
  comparisonTableColumnSchema,
  comparisonTableCtaButtonSchema,
  comparisonTableCellSchema,
  comparisonTableCellValueSchema,
  comparisonTableRowSchema,
  comparisonTableSectionSchema,
  type ComparisonTableCtaButton,
  type ComparisonTableCell,
  type ComparisonTableCellValue,
  type ComparisonTableColumn,
  type ComparisonTableRow,
  type ComparisonTableSection,
} from "../site_learning-mdc-edu/component-registry/comparison_table/v1.0/schema";

// contact_bubble
export {
  contactBubbleSectionSchema,
  type ContactBubbleSection,
  type ContactBubbleImage,
} from "../site_learning-mdc-edu/component-registry/contact_bubble/v1.0/schema";

// contact_us_info
export {
  contactUsInfoSectionSchema,
  type ContactUsInfoSection,
  type ContactLocation,
} from "../site_learning-mdc-edu/component-registry/contact_us_info/v1.0/schema";

// course_selector
export {
  courseSelectorSectionSchema,
  type CourseSelectorSection,
  type CourseItem,
  type CourseBadge,
  type CourseTag,
} from "../site_learning-mdc-edu/component-registry/course_selector/v1.0/schema";

// credibility_strip
export {
  credibilityStripSectionSchema,
  type CredibilityStripSection,
  type CredibilityStripItem,
  type CredibilityStripLogo,
} from "../site_learning-mdc-edu/component-registry/credibility_strip/v1.0/schema";

// cta_banner
export {
  ctaBannerSectionSchema,
  ctaBannerDefaultSchema,
  ctaBannerFormSchema,
  ctaBannerStripSchema,
  ctaBannerResourceShowcaseSchema,
  ctaBannerPromotionSchema,
  type CtaBannerSection,
  type CtaBannerDefault,
  type CtaBannerForm,
  type CtaBannerStrip,
  type CtaBannerResourceShowcase,
  type CtaBannerPromotion,
} from "../site_learning-mdc-edu/component-registry/cta_banner/v1.0/schema";

// double_cta
export {
  doubleCTASectionSchema,
  type DoubleCTASection,
  type DoubleCTABox,
  type DoubleCTABullet,
} from "../site_learning-mdc-edu/component-registry/double_cta/v1.0/schema";

// dynamic_table
export {
  dynamicTableSectionSchema,
  type DynamicTableSection,
  type DynamicTableColumn,
  type DynamicTableAction,
} from "../site_learning-mdc-edu/component-registry/dynamic_table/v1.0/schema";

// enrollment_selector
export {
  enrollmentSelectorDefaultSchema,
  enrollmentProgramSchema,
  enrollmentPlanSchema,
  enrollmentSummarySchema,
  enrollmentSelectorSectionSchema,
  type EnrollmentSelectorDefault,
  type EnrollmentSelectorSection,
  type EnrollmentSelectorProgram,
  type EnrollmentSelectorPlan,
  type EnrollmentSummary,
  type EnrollmentQueryComponentItem,
} from "../site_learning-mdc-edu/component-registry/enrollment_selector/v1.0/schema";

// features_grid
export {
  featuresGridHighlightItemSchema,
  featuresGridDetailedItemSchema,
  featuresGridTextOnlyItemSchema,
  featuresGridSectionSchema,
  type FeaturesGridHighlightItem,
  type FeaturesGridDetailedItem,
  type FeaturesGridTextOnlyItem,
  type FeaturesGridSection,
  type FeaturesGridHighlightSection,
  type FeaturesGridDetailedSection,
  type FeaturesGridSpotlightSection,
  type FeaturesGridStatsCardsSection,
  type FeaturesGridStatsTextCardSection,
  type FeaturesGridStatsTextSection,
  type FeaturesGridTextOnlySection,
  type FeaturesGridCardHeaderSection,
  type FeaturesGridStatsCardsItem,
  type SpotlightConfig,
  type FeaturesGridStatsChartsSection,
  type FeaturesGridStatsChartsCardBars,
  type FeaturesGridStatsChartsCardGauge,
  type FeaturesGridStatsChartsCardTrend,
} from "../site_learning-mdc-edu/component-registry/features_grid/v1.0/schema";

// footer
export {
  footerSectionSchema,
  type FooterSection,
} from "../site_learning-mdc-edu/component-registry/footer/v1.0/schema";

// geeks_vs_others_comparison
export {
  geeksVsOthersColumnSchema,
  geeksVsOthersRowSchema,
  geeksVsOthersComparisonSectionSchema,
  type GeeksVsOthersColumn,
  type GeeksVsOthersRow,
  type GeeksVsOthersComparisonSection,
} from "../site_learning-mdc-edu/component-registry/geeks_vs_others_comparison/v1.0/schema";

// graduates_stats
export {
  graduatesStatsSectionSchema,
  graduatesFeaturedImageSchema,
  type GraduatesStatsSection,
  type GraduatesStatItem,
  type GraduatesCollageImage,
  type GraduatesFeaturedImage,
  type GraduatesStatsAsymmetric,
} from "../site_learning-mdc-edu/component-registry/graduates_stats/v1.0/schema";

// image_row
export {
  imageRowSectionSchema,
  type ImageRowSection,
  type ImageRowSlide,
  type ImageRowImage,
  type ImageRowHighlight,
} from "../site_learning-mdc-edu/component-registry/image_row/v1.0/schema";

// list_press_mentions
export {
  listPressMentionsSectionSchema,
  pressMentionsSectionSchema,
  type ListPressMentionsSection,
  type PressMentionItem,
  type PressMentionsSection,
} from "../site_learning-mdc-edu/component-registry/list_press_mentions/v1.0/schema";

// list_single_press_mention
export {
  listSinglePressMentionSectionSchema,
  type ListSinglePressMentionSection,
} from "../site_learning-mdc-edu/component-registry/list_single_press_mention/v1.0/schema";

// list_workshops_carousel
export {
  listWorkshopsCarouselSectionSchema,
  workshopCarouselItemSchema,
  type ListWorkshopsCarouselSection,
  type WorkshopCarouselItem,
} from "../site_learning-mdc-edu/component-registry/list_workshops_carousel/v1.0/schema";

// mentorship
export {
  mentorshipSectionSchema,
  type MentorshipSection,
} from "../site_learning-mdc-edu/component-registry/mentorship/v1.0/schema";

// modal
export {
  modalSectionSchema,
  modalDefaultSectionSchema,
  modalTwoColumnSectionSchema,
  type ModalSection,
  type ModalDefaultSection,
  type ModalTwoColumnSection,
} from "../site_learning-mdc-edu/component-registry/modal/v1.0/schema";

// numbered_steps
export {
  numberedStepsStepSchema,
  numberedStepsSectionSchema,
  type NumberedStepsStep,
  type NumberedStepsSection,
  type NumberedStepsDefaultSection,
  type NumberedStepsBubbleTextSection,
  type NumberedStepsVerticalCardsSection,
} from "../site_learning-mdc-edu/component-registry/numbered_steps/v1.0/schema";

// og_image_preview
export {
  ogImagePreviewSectionSchema,
  type OgImagePreviewSection,
} from "../site_learning-mdc-edu/component-registry/og_image_preview/v1.0/schema";

// partnership_carousel
export {
  partnershipCarouselSectionSchema,
  type PartnershipCarouselSection,
  type PartnershipSlide,
} from "../site_learning-mdc-edu/component-registry/partnership_carousel/v1.0/schema";

// pricing
export {
  pricingFeatureSchema,
  pricingPlanSchema,
  pricingSectionSchema,
  pricingPlanCardsSchema,
  pricingPlanCardsNewSchema,
  pricingPlanCardsPlanSchema,
  pricingPlanCardsNewPlanSchema,
  pricingPlanCardsFeatureSchema,
  pricingPlanCardsPlanFeatureSchema,
  pricingPlanCardsAddonSchema,
  type PricingFeature,
  type PricingPlan,
  type PricingSection,
  type PricingPlanCardsPlan,
  type PricingPlanCardsFeature,
  type PricingPlanCardsSection,
  type PricingPlanCardsPlanFeature,
  type PricingPlanCardsNewPlan,
  type PricingPlanCardsNewSection,
} from "../site_learning-mdc-edu/component-registry/pricing/v1.0/schema";

// profiles_carousel
export {
  profilesCarouselSectionSchema,
  type ProfilesCarouselSection,
  type ProfileCard,
} from "../site_learning-mdc-edu/component-registry/profiles_carousel/v1.0/schema";

// programs_showcase
export {
  programsShowcaseSectionSchema,
  type ProgramsShowcaseSection,
  type ProgramItem,
} from "../site_learning-mdc-edu/component-registry/programs_showcase/v1.0/schema";

// project_showcase
export {
  projectShowcaseCreatorSchema,
  projectShowcaseMediaSchema,
  projectShowcaseItemSchema,
  projectShowcaseSectionSchema,
  projectsShowcaseSectionSchema,
  type ProjectShowcaseCreator,
  type ProjectShowcaseMedia,
  type ProjectShowcaseItem,
  type ProjectShowcaseSection,
  type ProjectsShowcaseSection,
} from "../site_learning-mdc-edu/component-registry/project_showcase/v1.0/schema";

// projects
export {
  projectItemSchema,
  projectsSectionSchema,
  type ProjectItem,
  type ProjectsSection,
} from "../site_learning-mdc-edu/component-registry/projects/v1.0/schema";

// split_cards
export {
  toolIconSchema,
  splitCardsBenefitSchema,
  splitCardsSectionSchema,
  type ToolIcon,
  type SplitCardsBenefit,
  type SplitCardsSection,
} from "../site_learning-mdc-edu/component-registry/split_cards/v1.0/schema";

// sticky_cta
export {
  stickyCtaSectionSchema,
  type StickyCtaSection,
} from "../site_learning-mdc-edu/component-registry/sticky_cta/v1.0/schema";

// survey
export {
  surveyDefaultSchema,
  type SurveyDefault,
} from "../site_learning-mdc-edu/component-registry/survey/v1.0/schema";

// syllabus
export {
  syllabusModuleSchema,
  focusAreaSchema,
  moduleCardSchema,
  techLogoSchema,
  syllabusDefaultSchema,
  syllabusLandingSchema,
  syllabusProgramModulesSchema,
  syllabusTimelineItemSchema,
  syllabusTimelineModuleSchema,
  syllabusTimelineSchema,
  syllabusSectionSchema,
  type SyllabusModule,
  type FocusArea,
  type ModuleCard,
  type TechLogo,
  type SyllabusDefault,
  type SyllabusLanding,
  type SyllabusProgramModules,
  type SyllabusTimelineItem,
  type SyllabusTimelineModule,
  type SyllabusTimeline,
  type SyllabusSection,
} from "../site_learning-mdc-edu/component-registry/syllabus/v1.0/schema";

// testimonials_grid
export {
  testimonialsGridItemSchema,
  testimonialsGridSectionSchema,
  type TestimonialsGridItem,
  type TestimonialsGridSection,
} from "../site_learning-mdc-edu/component-registry/testimonials_grid/v1.0/schema";

// testimonials_slide
export {
  testimonialsSlideTestimonialSchema,
  testimonialsSlideSectionSchema,
  type TestimonialsSlideTestimonial,
  type TestimonialsSlideSection,
} from "../site_learning-mdc-edu/component-registry/testimonials_slide/v1.0/schema";

// testimonials
export {
  testimonialItemSchema,
  testimonialsSectionSchema,
  type TestimonialItem,
  type TestimonialsSection,
} from "../site_learning-mdc-edu/component-registry/testimonials/v1.0/schema";

// trust_cards
export {
  trustCardsSectionSchema,
  type TrustCardsSection,
  type TrustCardItem,
} from "../site_learning-mdc-edu/component-registry/trust_cards/v1.0/schema";

// two_column_accordion_card
export {
  twoColumnAccordionCardSectionSchema,
  twoColumnAccordionCardBulletSchema,
  type TwoColumnAccordionCardSection,
  type TwoColumnAccordionCardBullet,
} from "../site_learning-mdc-edu/component-registry/two_column_accordion_card/v1.0/schema";

// two_column
export {
  twoColumnBulletSchema,
  bulletGroupSchema,
  benefitItemSchema,
  twoColumnColumnSchema,
  twoColumnSectionSchema,
  type TwoColumnBullet,
  type BulletGroup,
  type BenefitItem,
  type TwoColumnColumn,
  type TwoColumnSection,
} from "../site_learning-mdc-edu/component-registry/two_column/v1.0/schema";

// value_proof_panel
export {
  evidenceItemSchema,
  valueProofPanelMediaSchema,
  valueProofPanelSectionSchema,
  type EvidenceItem,
  type ValueProofPanelMedia,
  type ValueProofPanelSection,
} from "../site_learning-mdc-edu/component-registry/value_proof_panel/v1.0/schema";

// whos_hiring
export {
  whosHiringSectionSchema,
  type WhosHiringSection,
} from "../site_learning-mdc-edu/component-registry/whos_hiring/v1.0/schema";

// why_learn_ai
export {
  whyLearnAISectionSchema,
  type WhyLearnAISection,
} from "../site_learning-mdc-edu/component-registry/why_learn_ai/v1.0/schema";

// hero (moved out of shared/component-registry)
export {
  trustBarSchema,
  awardBadgeSchema,
  heroImageSchema,
  brandMarkSchema,
  reviewLogoSchema,
  productShowcaseTrustBarSchema,
  bulletItemSchema,
  heroCourseTutorSchema,
  heroCourseFeatureSchema,
  heroSectionSchema,
  heroCredibilityPillLogoSchema,
  heroCredibilityPillSchema,
  heroCredibilityMarqueeItemSchema,
  heroCredibilitySchema,
  heroOrbitBadgeSchema,
  heroOrbitDiagramSchema,
  heroOrbitSchema,
  heroAutoVideoRightSchema,
  type TrustBar,
  type AwardBadge,
  type HeroImage,
  type BrandMark,
  type ReviewLogo,
  type ProductShowcaseTrustBar,
  type BulletItem,
  type HeroCourseTutor,
  type HeroCourseFeature,
  type HeroSection,
  type HeroCredibilityPillLogo,
  type HeroCredibilityPill,
  type HeroCredibilityMarqueeItem,
  type HeroCredibility,
  type HeroOrbitBadge,
  type HeroOrbitDiagram,
  type HeroOrbit,
  type HeroAutoVideoRight,
} from "../site_learning-mdc-edu/component-registry/hero/v1.0/schema";

export type {
  HeroSingleColumn,
  HeroBlogHero,
  HeroShowcase,
  HeroProductShowcase,
  HeroSimpleTwoColumn,
  HeroSimpleStacked,
  HeroTwoColumn,
  HeroCourse,
  HeroApplyFormProductShowcase,
  HeroExercise,
  HeroWorkshop,
} from "../site_learning-mdc-edu/component-registry/hero/v1.0/schema";

// text_block
export {
  textBlockSectionSchema,
  type TextBlockSection,
} from "../site_learning-mdc-edu/component-registry/text_block/v1.0/schema";

// faq
export {
  faqItemSchema,
  faqSectionSchema,
  type FaqItem,
  type FaqSection,
  type FAQ,
} from "../site_learning-mdc-edu/component-registry/faq/v1.0/schema";

// breadcrumb
export {
  breadcrumbItemSchema,
  breadcrumbSectionSchema,
  type BreadcrumbItem,
  type BreadcrumbSection,
} from "../site_learning-mdc-edu/component-registry/breadcrumb/v1.0/schema";

// geekchart
export {
  geekchartSectionSchema,
  type GeekchartSection,
} from "../site_learning-mdc-edu/component-registry/geekchart/v1.0/schema";

// schema_org
export {
  schemaOrgSectionSchema,
  type SchemaOrgSection,
} from "../site_learning-mdc-edu/component-registry/schema_org/v1.0/schema";

// awards_marquee
export {
  awardsMarqueeSectionSchema,
  type AwardsMarqueeSection,
  type AwardsMarqueeItem,
} from "../site_learning-mdc-edu/component-registry/awards_marquee/v1.0/schema";

// article
export {
  articleSectionSchema,
  type ArticleSection,
} from "../site_learning-mdc-edu/component-registry/article/v1.0/schema";

