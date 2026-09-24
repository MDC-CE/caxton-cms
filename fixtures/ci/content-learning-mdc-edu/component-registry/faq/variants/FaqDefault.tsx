import React from "react";
import { AlertTriangle, MessageCircle } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import type { FAQSection as FAQSectionType } from "@shared/schema";
import { useLocation as useWouterLocation } from "wouter";
import { useInternalNav } from "@/hooks/useInternalNav";
import { faqItemKey, normalizeFaqEntries, applyFaqHideOnLocations } from "@shared/faq-listing";
import { useSession } from "@/contexts/SessionContext";
import { useEditModeOptional } from "@/contexts/EditModeContext";
import { RichTextContent } from "@/components/ui/rich-text-content";
import { inlineMarkdownToHtml } from "@/lib/inline-markdown";

interface FAQSectionProps {
  data: FAQSectionType;
}

export function FAQSection({ data }: FAQSectionProps) {
  const handleLinkClick = useInternalNav();
  const [pathname] = useWouterLocation();
  const { session } = useSession();
  const editMode = useEditModeOptional();
  const isEditMode = editMode?.isEditMode ?? false;
  const sessionLocationSlug = session.location?.slug;

  const locationSlugMatch = pathname.match(
    /^\/(en|es)\/(location|ubicacion)\/([^/]+)/,
  );
  const locationSlug = locationSlugMatch ? locationSlugMatch[3] : undefined;

  const itemOverrides = (data as Record<string, unknown>).item_overrides as
    | Record<string, { hideOnLocations?: string[] }>
    | undefined;

  const faqItems = (() => {
    const fromItems = normalizeFaqEntries(data.items);
    const fromHardcoded = normalizeFaqEntries(
      (data as Record<string, unknown>).hardcoded_entries,
    );

    // Prefer merged `items` from resolveDynamicEntries (hardcoded + DB).
    // If items is DB-only (bind resolved too late) but hardcoded_entries is a
    // real array, prepend unique hardcoded questions.
    let items: Array<{ question: string; answer: string }>;
    if (fromItems.length === 0) {
      items = fromHardcoded;
    } else if (fromHardcoded.length === 0) {
      items = fromItems;
    } else {
      const seen = new Set(fromItems.map((i) => faqItemKey(i.question)));
      const missingHardcoded = fromHardcoded.filter(
        (i) => !seen.has(faqItemKey(i.question)),
      );
      items = missingHardcoded.length > 0
        ? [...missingHardcoded, ...fromItems]
        : fromItems;
    }

    items = applyFaqHideOnLocations(
      items,
      itemOverrides,
      locationSlug || sessionLocationSlug,
    );

    const dyn = (data as Record<string, unknown>).dynamic_entries as
      | { limit?: number }
      | undefined;
    const limit =
      typeof dyn?.limit === "number" && dyn.limit > 0 ? dyn.limit : undefined;
    if (limit != null) {
      items = items.slice(0, limit);
    }

    return items;
  })();

  if (faqItems.length === 0) {
    if (!isEditMode) return null;
    return (
      <section data-testid="section-faq-empty-edit" className="page-shell py-section">
        <div
          className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-foreground flex gap-3 items-start"
          data-testid="alert-faq-hidden-no-results"
        >
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />
          <div className="space-y-1">
            <p className="font-medium">
              {data.title ? `${data.title} — hidden on the live page` : "FAQ section — hidden on the live page"}
            </p>
            <p className="text-muted-foreground text-xs">
              This FAQ section is hidden on the live page because there are no results.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section data-testid="section-faq" className="scroll-mt-24 py-section">
      <div className="page-shell">
        <h2
          className="mb-6 max-w-3xl text-foreground"
          data-testid="text-faq-title"
        >
          {data.title}
        </h2>

        <div className="overflow-hidden rounded-card bg-card shadow-card">
          <Accordion type="single" collapsible>
            {faqItems.map((item, index) => (
              <AccordionItem
                key={index}
                value={`item-${index}`}
                className="border-0 border-b border-border px-card-padding last:border-b-0"
                data-testid={`accordion-faq-${index}`}
              >
                <AccordionTrigger
                  className="min-h-11 py-3 text-left text-body font-semibold text-foreground hover:no-underline"
                  data-testid={`button-faq-${index}`}
                >
                  {item.question}
                </AccordionTrigger>
                <AccordionContent
                  className="pb-4 text-body text-muted-foreground"
                  data-testid={`text-faq-answer-${index}`}
                >
                  <RichTextContent
                    html={inlineMarkdownToHtml(item.answer)}
                    className="text-body text-muted-foreground"
                  />
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>

        {data.cta && (data.cta.text || data.cta.button) && (
          <div
            className="mt-8 rounded-card bg-card p-card-padding shadow-card"
            data-testid="faq-cta"
          >
            <div className="mb-4 flex h-[55px] w-[60px] items-center justify-center rounded-[25px] border border-border bg-card shadow-card">
              <MessageCircle size={24} className="text-primary" aria-hidden />
            </div>
            {data.cta.text && (
              <p className="mb-4 max-w-[65ch] text-body text-foreground">{data.cta.text}</p>
            )}
            {data.cta.button && (
              <a
                href={data.cta.button.url}
                onClick={handleLinkClick}
                className="site-action site-action-primary"
                data-testid="button-faq-cta"
                target="_blank"
                rel="noopener noreferrer"
              >
                {data.cta.button.label}
              </a>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

export default FAQSection;
