import { createElement } from "react";
import { Button } from "@/components/ui/button";
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

export default function CareerTracksDefault({ data }: CareerTracksDefaultProps) {
  const { heading, subheading, background, tracks } = data;

  if (!tracks?.length) return null;

  return (
    <section
      className={cn("py-12 md:py-16", background)}
      data-testid="section-career-tracks"
    >
      <div className="max-w-6xl mx-auto px-4">
        <div className="mb-10 max-w-3xl">
          <h2
            className="text-3xl md:text-4xl font-bold text-foreground font-heading mb-3"
            data-testid="text-career-tracks-heading"
          >
            {heading}
          </h2>
          {subheading && (
            <p
              className="text-base text-muted-foreground leading-relaxed"
              data-testid="text-career-tracks-subheading"
            >
              {subheading}
            </p>
          )}
        </div>

        <div
          className="grid grid-cols-1 md:grid-cols-3 gap-6"
          data-testid="career-tracks-grid"
        >
          {tracks.map((track, index) => {
            const Icon = track.icon ? getIcon(track.icon) : null;
            return (
              <div
                key={`${track.title}-${index}`}
                className="flex flex-col bg-card border border-border rounded-card p-card-padding gap-4"
                data-testid={`card-career-track-${index}`}
              >
                {Icon && (
                  <Icon
                    className="w-8 h-8 text-primary shrink-0"
                    data-testid={`icon-career-track-${index}`}
                  />
                )}
                <h3
                  className="text-lg font-bold text-foreground font-heading leading-snug"
                  data-testid={`text-career-track-title-${index}`}
                >
                  {track.title}
                </h3>
                <p
                  className="text-base text-muted-foreground leading-relaxed flex-1"
                  data-testid={`text-career-track-description-${index}`}
                >
                  {track.description}
                </p>
                {track.cta?.text && track.cta?.url && (
                  <Button
                    variant={track.cta.variant === "primary" ? "default" : track.cta.variant}
                    asChild
                    className="mt-auto self-start"
                    data-testid={`button-career-track-cta-${index}`}
                  >
                    <a href={track.cta.url} className="flex items-center gap-2">
                      {track.cta.icon &&
                        (() => {
                          const CtaIcon = getIcon(track.cta!.icon!);
                          return CtaIcon
                            ? createElement(CtaIcon, { className: "h-4 w-4" })
                            : null;
                        })()}
                      {track.cta.text}
                    </a>
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
