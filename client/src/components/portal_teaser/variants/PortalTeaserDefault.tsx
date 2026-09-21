import { createElement } from "react";
import { Button } from "@/components/ui/button";
import { getIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export interface PortalTeaserSectionData {
  type: string;
  version?: string;
  variant?: string;
  badge?: string;
  title: string;
  body: string;
  background?: string;
  cta?: {
    text: string;
    url: string;
    variant: "primary" | "secondary" | "outline";
    icon?: string;
  };
}

interface PortalTeaserDefaultProps {
  data: PortalTeaserSectionData;
}

export default function PortalTeaserDefault({ data }: PortalTeaserDefaultProps) {
  const { badge, title, body, background, cta } = data;

  return (
    <section
      className={cn("py-12 md:py-16", background || "bg-muted")}
      data-testid="section-portal-teaser"
    >
      <div className="max-w-3xl mx-auto px-4">
        <div className="rounded-card border border-border bg-card p-card-padding md:p-8">
          {badge && (
            <p
              className="text-xs font-semibold uppercase tracking-widest text-primary mb-3"
              data-testid="text-portal-teaser-badge"
            >
              {badge}
            </p>
          )}
          <h2
            className="text-3xl md:text-4xl font-bold text-foreground font-heading mb-4"
            data-testid="text-portal-teaser-title"
          >
            {title}
          </h2>
          <div
            className="text-base text-muted-foreground leading-relaxed prose max-w-none prose-p:mb-3 prose-p:leading-relaxed"
            data-testid="text-portal-teaser-body"
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
          </div>
          {cta?.text && cta?.url && (
            <div className="mt-6">
              <Button
                variant={cta.variant === "primary" ? "default" : cta.variant}
                asChild
                data-testid="button-portal-teaser-cta"
              >
                <a href={cta.url} className="flex items-center gap-2">
                  {cta.icon &&
                    (() => {
                      const CtaIcon = getIcon(cta.icon!);
                      return CtaIcon
                        ? createElement(CtaIcon, { className: "h-4 w-4" })
                        : null;
                    })()}
                  {cta.text}
                </a>
              </Button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
