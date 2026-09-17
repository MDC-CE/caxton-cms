import { useState, createElement, type ComponentType } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { getIcon, isCustomIcon } from "@/lib/icons";
import type { FeaturesGridCardHeaderSection } from "@shared/schema";
import { useInternalNav } from "@/hooks/useInternalNav";
import { UniversalImage } from "@/components/UniversalImage";



interface FeaturesGridCardHeaderProps {
  data: FeaturesGridCardHeaderSection;
}

export default function FeaturesGridCardHeader({ data }: FeaturesGridCardHeaderProps) {
  const backgroundClass = data.background || "bg-background";
  const [isExpanded, setIsExpanded] = useState(false);
  const collapsibleMobile = data.collapsible_mobile ?? false;
  const handleLinkClick = useInternalNav();

  return (
    <section 
      className={`py-14 ${backgroundClass}`}
      data-testid="section-features-grid-card-header"
    >
      <div className="max-w-6xl mx-auto px-4">
        <Card className="mb-8 overflow-hidden border-t-4 p-0 border-t-primary/20">
          <CardContent className="!p-0 md:p-card">
            {/* Mobile collapsible header */}
            {collapsibleMobile && (
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="md:hidden w-full p-6 flex items-center justify-between text-left"
                data-testid="button-toggle-header"
              >
                <div>
                  <h2 className="text-2xl font-bold text-foreground">
                    {data.heading}
                  </h2>
                  <span className="text-sm font-medium text-primary">
                    {isExpanded ? 'See less' : 'See more'}
                  </span>
                </div>
              </button>
            )}
            
            {/* Mobile non-collapsible or expanded content */}
            <div className={`${collapsibleMobile ? `md:block ${isExpanded ? 'block' : 'hidden'}` : ''}`}>
              <div className="grid md:grid-cols-12 gap-0">
                <div className={`md:col-span-8 p-6 md:p-8 flex flex-col justify-center ${collapsibleMobile ? 'pt-0 md:pt-8' : ''}`}>
                  {/* Show heading only on desktop when collapsible, always on mobile when not collapsible */}
                  <h2 
                    className={`text-2xl md:text-3xl font-bold text-foreground mb-4 ${collapsibleMobile ? 'hidden md:block' : ''}`}
                    data-testid="text-features-grid-heading"
                  >
                    {data.heading}
                  </h2>
                  {data.description && (
                    <p 
                      className="text-muted-foreground text-base md:text-lg"
                      data-testid="text-features-grid-description"
                    >
                      {data.description}
                    </p>
                  )}
                  {data.cta && (
                    <Button 
                      asChild
                      className="mt-4 w-fit"
                      data-testid="button-features-grid-cta"
                    >
                      <a href={data.cta.url} onClick={handleLinkClick}>{data.cta.text}</a>
                    </Button>
                  )}
                </div>
                {data.image && (
                  <div className="md:col-span-4 flex items-center justify-center p-6 md:p-8">
                    <UniversalImage
                      id={data.image}
                      alt={data.image_alt || ""}
                      className="w-full max-w-[220px] md:max-w-[280px] object-contain"
                      fieldContext={{ fieldPath: "image" }}
                      data-testid="img-features-grid-main"
                    />
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-3 gap-4">
          {data.cards.map((card, index) => {
            const IconComponent = card.icon ? (getIcon(card.icon) ?? Check) : Check;
            const isCustom = card.icon ? isCustomIcon(card.icon) : false;

            return (
              <Card 
                key={index} 
                className="h-full border-b-4 border-b-primary/20"
                data-testid={`card-feature-${index}`}
              >
                <CardContent className="p-5 flex flex-col items-start gap-3">
                  {isCustom
                    ? createElement(IconComponent as ComponentType<{ width?: string; height?: string; className?: string }>, {
                        width: "32",
                        height: "32",
                        className: "w-8 h-8",
                      })
                    : createElement(IconComponent as ComponentType<{ className?: string }>, {
                        className: "w-8 h-8 text-primary",
                      })}
                  <p className="text-foreground text-sm md:text-base">
                    {card.text}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
