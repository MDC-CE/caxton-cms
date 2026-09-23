import { createElement } from "react";
import { getIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";

export interface CareerTrackItem {
  icon?: string;
  title: string;
  description: string;
  cta?: {
    text: string;
    url: string;
    variant: "primary" | "secondary" | "outline";
    icon?: string;
  };
}

export interface CareerTracksSectionData {
  type: string;
  version?: string;
  variant?: string;
  heading: string;
  subheading?: string;
  background?: string;
  tracks: CareerTrackItem[];
}

interface CareerTracksDefaultProps {
  data: CareerTracksSectionData;
}

function resolveSectionIcon(name?: string) {
  if (!name) return null;
  const aliases: Record<string, string> = {
    IconHeartbeat: "Heart",
    IconTool: "Wrench",
  };
  const Icon = getIcon(aliases[name] ?? name);
  if (!Icon || Icon.displayName?.startsWith("CustomIcon(")) return null;
  return Icon;
}

function isExternal(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

export default function CareerTracksDefault({ data }: CareerTracksDefaultProps) {
  const { heading, subheading, background, tracks } = data;

  if (!tracks?.length) return null;

  return (
    <section
      className={cn("scroll-mt-24 py-section", background)}
      data-testid="section-career-tracks"
    >
      <div className="page-shell">
        <div className="mb-6 max-w-3xl">
          <h2
            className="text-foreground"
            data-testid="text-career-tracks-heading"
          >
            {heading}
          </h2>
          {subheading && (
            <p
              className="mt-3 max-w-[65ch] text-body text-muted-foreground"
              data-testid="text-career-tracks-subheading"
            >
              {subheading}
            </p>
          )}
        </div>

        <div
          className="grid grid-cols-1 gap-gutter md:grid-cols-2 lg:grid-cols-3"
          data-testid="career-tracks-grid"
        >
          {tracks.map((track, index) => {
            const Icon = resolveSectionIcon(track.icon);
            const cta = track.cta;
            const external = Boolean(cta?.url && isExternal(cta.url));
            return (
              <div
                key={`${track.title}-${index}`}
                className="flex flex-col gap-4 rounded-card bg-card p-card-padding text-card-foreground shadow-card transition-shadow duration-brand ease-brand hover:shadow-elevation"
                data-testid={`card-career-track-${index}`}
              >
                {Icon && (
                  <span className="flex h-[55px] w-[60px] items-center justify-center rounded-[25px] border border-border bg-card shadow-card">
                    <Icon
                      className="h-6 w-6 text-primary"
                      aria-hidden
                      data-testid={`icon-career-track-${index}`}
                    />
                  </span>
                )}
                <h3
                  className="text-foreground"
                  data-testid={`text-career-track-title-${index}`}
                >
                  {track.title}
                </h3>
                <p
                  className="flex-1 text-body text-muted-foreground"
                  data-testid={`text-career-track-description-${index}`}
                >
                  {track.description}
                </p>
                {cta?.text && cta.url && (
                  <a
                    href={cta.url}
                    className={cn(
                      "site-action mt-auto self-start",
                      cta.variant === "primary" ? "site-action-primary" : "site-action-secondary",
                    )}
                    data-testid={`button-career-track-cta-${index}`}
                    {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  >
                    {cta.icon &&
                      (() => {
                        const CtaIcon = getIcon(cta.icon!);
                        return CtaIcon ? (
                          <span aria-hidden="true" className="inline-flex">
                            {createElement(CtaIcon, { className: "h-4 w-4" })}
                          </span>
                        ) : null;
                      })()}
                    {cta.text}
                  </a>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
