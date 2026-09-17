import type { z } from "zod";
import type { featuresGridSectionSchema } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Star } from "lucide-react";
import { getIcon } from "@/lib/icons";

type FeaturesGridSectionData = z.infer<typeof featuresGridSectionSchema>;

interface FeaturesGridSectionProps {
  data: FeaturesGridSectionData;
}

function resolveIcon(iconName: string) {
  return getIcon(iconName) || Star;
}

export function FeaturesGridSection({ data: raw }: FeaturesGridSectionProps) {
  const data = raw as FeaturesGridSectionData & Record<string, any>;
  return (
    <section 
      className="px-4 bg-muted/30"
      data-testid="section-features-grid"
    >
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2 
            className="text-foreground mb-4"
            data-testid="text-features-grid-title"
          >
            {data.title}
          </h2>
          {data.subtitle && (
            <p 
              className="text-body text-muted-foreground max-w-2xl mx-auto" style={{ fontSize: '16px' }}
              data-testid="text-features-grid-subtitle"
            >
              {data.subtitle}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {(data.items as Array<{ icon: string; title: string; description?: string; value?: string }>).map((item, index) => {
            const IconComponent = resolveIcon(item.icon || "Star");
            return (
              <Card 
                key={index}
                className="border-0 shadow-card hover-elevate transition-all duration-brand ease-brand"
                data-testid={`card-feature-${index}`}
              >
                <CardContent className="p-card-padding text-center">
                  <div className="w-12 h-12 rounded-card bg-primary/10 flex items-center justify-center mx-auto mb-4">
                    <IconComponent className="w-6 h-6 text-primary" />
                  </div>
                  <h3 
                    className="font-semibold text-foreground mb-2"
                    data-testid={`text-feature-title-${index}`}
                  >
                    {item.title}
                  </h3>
                  <p 
                    className="text-sm text-muted-foreground"
                    data-testid={`text-feature-description-${index}`}
                  >
                    {item.description}
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
