import { createElement } from "react";
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

function isExternal(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

export default function PortalTeaserDefault({ data }: PortalTeaserDefaultProps) {
  const { badge, title, body, background, cta } = data;
  const external = Boolean(cta?.url && isExternal(cta.url));

  return (
    <section
      className={cn("scroll-mt-24 py-section", background || "bg-muted")}
      data-testid="section-portal-teaser"
    >
      <div className="page-shell">
        <div className="max-w-[65ch] rounded-card bg-card p-card-padding text-card-foreground shadow-card">
          {badge && (
            <p
              className="mb-4 inline-flex items-center rounded-[10px] bg-card px-2.5 py-1.5 text-[13px] font-medium text-primary shadow-[inset_0_0_0_1px_hsl(var(--border))]"
              data-testid="text-portal-teaser-badge"
            >
              {badge}
            </p>
          )}
          <h2
            className="mb-4 text-foreground"
            data-testid="text-portal-teaser-title"
          >
            {title}
          </h2>
          <div
            className="max-w-none text-body text-muted-foreground [&_p]:mb-3 [&_p:last-child]:mb-0"
            data-testid="text-portal-teaser-body"
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
          </div>
          {cta?.text && cta.url && (
            <div className="mt-6">
              <a
                href={cta.url}
                className={cn(
                  "site-action",
                  cta.variant === "primary" ? "site-action-primary" : "site-action-secondary",
                )}
                data-testid="button-portal-teaser-cta"
                {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              >
                {cta.icon &&
                  (() => {
                    const CtaIcon = getIcon(cta.icon!);
                    return CtaIcon
                      ? createElement(CtaIcon, { className: "h-4 w-4", "aria-hidden": true })
                      : null;
                  })()}
                {cta.text}
              </a>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
