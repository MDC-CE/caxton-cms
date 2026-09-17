import { useState } from "react";
import { Check } from "lucide-react";
import { Label } from "@/components/ui/label";
import { useQuery } from "@tanstack/react-query";
import {
  AVAILABLE_RELATED_FEATURES,
  MAX_FAQ_SECTION_TOPICS,
  MAX_RELATED_FEATURES,
  type RelatedFeature,
  type FaqItem,
} from "@/lib/faqConstants";

interface BankTestimonial {
  student_name: string;
  student_thumb?: string;
  student_video?: string;
  excerpt?: string;
  full_text?: string;
  content?: string;
  short_content?: string;
  related_features?: string[];
  priority?: number;
  rating?: number;
}

interface PermanentFilter {
  item_property_slug: string;
  value: string | string[];
}

interface RelatedFeaturesPickerProps {
  value: string[];
  onChange: (value: string[]) => void;
  locale?: string;
  context?: "faq" | "testimonials";
  permanentFilters?: PermanentFilter[];
  /** Hide the top label row (e.g. when embedded in a popover with its own title). */
  hideLabel?: boolean;
}

function filterTestimonialsByFeatures(
  testimonials: BankTestimonial[],
  features: string[]
): BankTestimonial[] {
  return testimonials.filter((t) => {
    const tFeatures = t.related_features || [];
    return features.some((f) => tFeatures.includes(f));
  });
}

function isValidTestimonial(t: BankTestimonial): boolean {
  const hasRating = t.rating != null && t.rating > 0;
  const hasText = !!(t.excerpt || t.short_content || t.content || t.full_text);
  return hasRating || hasText;
}

export function RelatedFeaturesPicker({ value, onChange, locale = "en", context = "faq", permanentFilters, hideLabel = false }: RelatedFeaturesPickerProps) {
  const selectedFeatures = value || [];
  const isTestimonials = context === "testimonials";
  const maxSelection = context === "faq" ? MAX_FAQ_SECTION_TOPICS : MAX_RELATED_FEATURES;

  const { data: faqsData } = useQuery<{ items: FaqItem[] }>({
    queryKey: ["/api/databases/frequently_asked_questions/items?limit=1000"],
    staleTime: 5 * 60 * 1000,
    enabled: !isTestimonials,
  });

  const { data: testimonialsData } = useQuery<{ testimonials: BankTestimonial[] }>({
    queryKey: ["/api/testimonials", locale],
    staleTime: 5 * 60 * 1000,
    enabled: isTestimonials,
  });

  const faqs = (faqsData?.items ?? []).filter((f: FaqItem) => f.locale === locale);
  const testimonials = (testimonialsData?.testimonials ?? []).filter(isValidTestimonial);

  const filteredFaqs = (() => {
    if (!permanentFilters?.length) return faqs;
    let result = faqs;
    for (const pf of permanentFilters) {
      if (pf.item_property_slug === "related_features") continue;
      const filterValues = (Array.isArray(pf.value) ? pf.value : [pf.value]).map(String);
      result = result.filter((item) => {
        const itemVal = (item as unknown as Record<string, unknown>)[pf.item_property_slug];
        return filterValues.some((v) => {
          if (Array.isArray(itemVal)) return itemVal.map(String).includes(v);
          return String(itemVal ?? "") === v;
        });
      });
    }
    return result;
  })();

  const featureCounts = (() => {
    const counts: Record<string, number> = {};
    for (const feature of AVAILABLE_RELATED_FEATURES) {
      if (isTestimonials) {
        counts[feature] = filterTestimonialsByFeatures(testimonials, [feature]).length;
      } else {
        counts[feature] = filteredFaqs.filter(
          (f) => (f.related_features || []).includes(feature)
        ).length;
      }
    }
    return counts;
  })();

  const totalForSelection = (() => {
    if (selectedFeatures.length === 0) return 0;
    if (isTestimonials) {
      return filterTestimonialsByFeatures(testimonials, selectedFeatures).length;
    }
    return filteredFaqs.filter((f) =>
      selectedFeatures.some((feat) => (f.related_features || []).includes(feat))
    ).length;
  })();

  const toggleFeature = (feature: RelatedFeature) => {
    if (selectedFeatures.includes(feature)) {
      onChange(selectedFeatures.filter(f => f !== feature));
    } else if (selectedFeatures.length < maxSelection) {
      onChange([...selectedFeatures, feature]);
    }
  };

  const formatLabel = (feature: string) => {
    return feature
      .split("-")
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  const label = isTestimonials ? "Topics" : "FAQ Topics";
  const itemLabel = isTestimonials ? "testimonials" : "FAQs";

  const selectionSummary = (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">
        {selectedFeatures.length}/{maxSelection} selected
        {totalForSelection > 0 && (
          <span className="ml-1 text-primary">({totalForSelection} {itemLabel})</span>
        )}
      </span>
      {selectedFeatures.length > 0 && (
        <button
          type="button"
          onClick={() => onChange([])}
          className="text-xs text-primary hover:underline"
          data-testid="props-features-clear"
        >
          Clear
        </button>
      )}
    </div>
  );

  return (
    <div className="space-y-3">
      {!hideLabel ? (
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">{label}</Label>
          {selectionSummary}
        </div>
      ) : (
        <div className="flex items-center justify-end">
          {selectionSummary}
        </div>
      )}
      <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto p-1">
        {AVAILABLE_RELATED_FEATURES.map((feature) => {
          const isSelected = selectedFeatures.includes(feature);
          const isDisabled = !isSelected && selectedFeatures.length >= maxSelection;
          const count = featureCounts[feature] || 0;

          return (
            <button
              key={feature}
              type="button"
              onClick={() => toggleFeature(feature)}
              disabled={isDisabled}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs transition-colors ${
                isSelected
                  ? "bg-primary text-primary-foreground"
                  : isDisabled
                  ? "bg-muted text-muted-foreground/50 cursor-not-allowed"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
              data-testid={`props-feature-${feature}`}
            >
              {isSelected && <Check className="h-3 w-3" />}
              <span>{formatLabel(feature)}</span>
              <span className={`text-[10px] ${isSelected ? "opacity-75" : "opacity-50"}`}>
                ({count})
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
