import { IconCheck } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useEffect, useRef } from "react";
import { trackEcommerce } from "@/lib/tracking";
import { ensureEcommerceProductLookup } from "@/lib/ecommerceProductMap";
import { resolveProgramIdForPage } from "@/lib/ecommerceProgramId";
import { useEditModeOptional } from "@/contexts/EditModeContext";
import { usePageFunnel } from "@/contexts/PageFunnelContext";
import { useSectionContext } from "@/contexts/SectionContext";
import { resolveProductScope } from "@shared/resolveProductScope";

interface PlanItem {
  plan_id: string;
  name: string;
  price: number;
  currency: string;
  billing_period: "monthly" | "annual" | "one_time";
  highlighted: boolean;
  badge?: string;
  trial_days?: number;
  features: string[];
}

interface EcommerceSettings {
  currency: string;
  locale: string;
  tax_inclusive: boolean;
}

interface PricingPlansSectionData {
  title?: string;
  subtitle?: string;
  cta_label?: string;
  cta_url?: string;
  ecommerce_products?: string[] | "all";
  /** Content-owned plans (preferred). */
  plans?: PlanItem[];
  plan_ids?: string[];
  /** @deprecated Catalog injection removed — prefer `plans`. */
  _resolved_plans?: PlanItem[];
  _ecommerce_settings?: EcommerceSettings;
}

function formatPrice(price: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: price % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(price);
  } catch {
    return `${currency} ${price}`;
  }
}

function billingLabel(period: PlanItem["billing_period"]): string {
  switch (period) {
    case "monthly":
      return "/ month";
    case "annual":
      return "/ year";
    case "one_time":
      return "one-time";
    default:
      return "";
  }
}

interface PlanCardProps {
  plan: PlanItem;
  settings: EcommerceSettings;
  ctaLabel: string;
  ctaUrl: string;
}

function PlanCard({ plan, settings, ctaLabel, ctaUrl }: PlanCardProps) {
  const formattedPrice = formatPrice(plan.price, plan.currency || settings.currency, settings.locale);
  const href = ctaUrl ? `${ctaUrl}?plan=${encodeURIComponent(plan.plan_id)}` : undefined;

  return (
    <div
      className={`relative flex flex-col rounded-[0.8rem] border p-6 gap-4 transition-shadow ${
        plan.highlighted
          ? "border-primary bg-primary/5 shadow-md"
          : "border-border bg-card"
      }`}
      data-testid={`card-plan-${plan.plan_id}`}
    >
      {plan.badge && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <Badge
            className="px-3 py-0.5 text-xs font-semibold"
            data-testid={`badge-plan-${plan.plan_id}`}
          >
            {plan.badge}
          </Badge>
        </div>
      )}

      <div>
        <h3
          className="text-lg font-semibold text-foreground"
          data-testid={`text-plan-name-${plan.plan_id}`}
        >
          {plan.name}
        </h3>
        {plan.trial_days && (
          <p className="text-sm text-muted-foreground mt-0.5">
            {plan.trial_days}-day free trial
          </p>
        )}
      </div>

      <div className="flex items-end gap-1">
        <span
          className="text-4xl font-bold text-foreground"
          data-testid={`text-plan-price-${plan.plan_id}`}
        >
          {formattedPrice}
        </span>
        <span className="text-muted-foreground text-sm mb-1.5">
          {billingLabel(plan.billing_period)}
        </span>
      </div>

      {plan.features.length > 0 && (
        <ul className="flex flex-col gap-2 flex-1">
          {plan.features.map((feature, idx) => (
            <li
              key={idx}
              className="flex items-start gap-2 text-sm text-foreground"
              data-testid={`text-plan-feature-${plan.plan_id}-${idx}`}
            >
              <IconCheck
                className="text-primary mt-0.5 shrink-0"
                size={16}
                stroke={2.5}
              />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      )}

      {ctaLabel && (
        <Button
          asChild={!!href}
          variant={plan.highlighted ? "default" : "outline"}
          className="w-full mt-auto"
          data-testid={`button-plan-cta-${plan.plan_id}`}
        >
          {href ? (
            <a href={href}>{ctaLabel}</a>
          ) : (
            <span>{ctaLabel}</span>
          )}
        </Button>
      )}
    </div>
  );
}

interface PricingPlansDefaultProps {
  data: PricingPlansSectionData;
}

export default function PricingPlansDefault({ data }: PricingPlansDefaultProps) {
  const plans = (data.plans?.length ? data.plans : data._resolved_plans) ?? [];
  const settings: EcommerceSettings = data._ecommerce_settings ?? {
    currency: "USD",
    locale: "en-US",
    tax_inclusive: false,
  };
  const ctaLabel = data.cta_label ?? "Get Started";
  const ctaUrl = data.cta_url ?? "";
  const editMode = useEditModeOptional();
  const isEditMode = editMode?.isEditMode ?? false;
  const { contentType, slug } = useSectionContext();
  const funnel = usePageFunnel();
  const rootRef = useRef<HTMLElement | null>(null);
  const viewedRef = useRef(false);

  useEffect(() => {
    ensureEcommerceProductLookup();
  }, []);

  useEffect(() => {
    if (isEditMode || viewedRef.current || plans.length === 0 || !rootRef.current) return;
    const el = rootRef.current;
    const obs = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting) || viewedRef.current) return;
        viewedRef.current = true;
        const { scope } = resolveProductScope(data as unknown as Record<string, unknown>, {
          contentType,
          contentSlug: slug,
          funnel,
        });
        const fromScope =
          scope === "all"
            ? undefined
            : Array.isArray(scope)
              ? scope[0]
              : undefined;
        trackEcommerce("view_item_list", {
          program_id: fromScope || resolveProgramIdForPage(),
          item_list_name: "pricing_plans",
          component_type: "pricing_plans",
          path: typeof window !== "undefined" ? window.location.pathname : undefined,
        });
        obs.disconnect();
      },
      { threshold: 0.2 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [isEditMode, plans.length, contentType, slug, funnel]);

  if (plans.length === 0) {
    if (isEditMode) {
      return (
        <section className="w-full px-4" data-testid="section-pricing-plans-empty">
          <p className="text-sm text-muted-foreground text-center max-w-lg mx-auto">
            No content-owned <code className="bg-muted px-1 rounded">plans</code> on this section.
            Add plan cards in the section YAML (CMS no longer injects a global plan catalog).
          </p>
        </section>
      );
    }
    return null;
  }

  const colClass =
    plans.length === 1
      ? "max-w-sm mx-auto"
      : plans.length === 2
      ? "grid grid-cols-1 sm:grid-cols-2 gap-6"
      : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6";

  return (
    <section
      ref={rootRef}
      className="w-full px-4"
      data-testid="section-pricing-plans"
    >
      <div className="max-w-5xl mx-auto">
        {(data.title || data.subtitle) && (
          <div className="text-center mb-10">
            {data.title && (
              <h2
                className="text-3xl font-bold text-foreground mb-3"
                data-testid="text-pricing-plans-title"
              >
                {data.title}
              </h2>
            )}
            {data.subtitle && (
              <p
                className="text-muted-foreground text-lg max-w-xl mx-auto"
                data-testid="text-pricing-plans-subtitle"
              >
                {data.subtitle}
              </p>
            )}
          </div>
        )}

        <div className={colClass}>
          {plans.map((plan) => (
            <PlanCard
              key={plan.plan_id}
              plan={plan}
              settings={settings}
              ctaLabel={ctaLabel}
              ctaUrl={ctaUrl}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
