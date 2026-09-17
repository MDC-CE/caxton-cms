import { UniversalImage } from "@/components/UniversalImage";
import type { GraduatesStatsSection } from "@shared/schema";
import { cn } from "@/lib/utils";

interface GraduatesStatsStandardProps {
  data: GraduatesStatsSection;
}

export function GraduatesStatsStandard({ data }: GraduatesStatsStandardProps) {
  const { heading, subheading, stats, background } = data;
  const collage_images = "collage_images" in data ? data.collage_images : undefined;

  if (!stats || stats.length === 0) {
    return null;
  }

  const renderCollageImages = () => (
    <div 
      className="relative grid grid-cols-12 auto-rows-[60px] lg:auto-rows-[70px] gap-2 lg:gap-3"
      data-testid="graduates-stats-collage"
    >
      {collage_images && collage_images.map((img: (typeof collage_images)[number], index: number) => {
        const colSpan = img.col_span || 6;
        const rowSpan = img.row_span || 2;
        
        return (
          <div 
            key={index}
            className="rounded-[0.8rem] overflow-hidden"
            style={{
              gridColumn: `span ${colSpan} / span ${colSpan}`,
              gridRow: `span ${rowSpan} / span ${rowSpan}`,
            }}
          >
            <UniversalImage
              id={img.image_id}
              preset="card"
              className="w-full h-full object-cover shadow-sm"
              alt={`Graduate photo ${index + 1}`}
              loading={index < 2 ? "eager" : "lazy"}
              style={{
                objectPosition: img.object_position ?? "center center",
                transform: `scale(${img.object_scale ?? 1})`,
                transformOrigin: img.transform_origin ?? "50% 50%",
              }}
              fieldContext={{ arrayPath: "collage_images", index, srcField: "image_id" }}
            />
          </div>
        );
      })}
    </div>
  );

  const renderStats = () => (
    <div 
      className="flex flex-col justify-center"
      data-testid="graduates-stats-numbers"
    >
      <div className="grid grid-cols-2 gap-y-12 gap-x-8">
        {stats.map((stat, index) => {
          const isLastItem = index === stats.length - 1 && stats.length % 2 !== 0;
          
          return (
            <div 
              key={index} 
              className={cn(
                "text-center",
                isLastItem && "col-span-2 mt-4"
              )}
              data-testid={`stat-item-${index}`}
            >
              <p 
                className={`${data.value_size ?? "text-4xl md:text-5xl lg:text-6xl"} font-bold text-primary mb-2`}
                data-testid={`text-stat-value-${index}`}
              >
                {stat.value}
                {stat.unit && <span className="text-2xl md:text-3xl font-semibold ml-1">{stat.unit}</span>}
              </p>
              <p 
                className="text-sm md:text-base text-muted-foreground max-w-[200px] mx-auto"
                data-testid={`text-stat-label-${index}`}
              >
                {stat.label}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <section 
      className={`py-16 md:py-24 ${background || ''}`}
      data-testid="section-graduates-stats"
    >
      <div className="max-w-6xl mx-auto px-4">
        {(heading || subheading) && (
          <div className="text-center mb-12">
            {heading && (
              <h2 
                className="text-2xl md:text-3xl lg:text-4xl font-bold text-foreground leading-tight mb-4"
                data-testid="text-graduates-stats-heading"
              >
                {heading}
              </h2>
            )}
            {subheading && (
              <p 
                className="text-muted-foreground text-base md:text-lg max-w-3xl mx-auto"
                data-testid="text-graduates-stats-subheading"
              >
                {subheading}
              </p>
            )}
          </div>
        )}

        <div className="relative">
          <div 
            className="absolute inset-0 bg-primary/5 rounded-3xl pointer-events-none"
          />
          <div className="relative grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-8 lg:gap-12 items-center px-4 py-8">
            <div className="order-2 lg:order-1">
              {renderCollageImages()}
            </div>
            <div className="order-1 lg:order-2">
              {renderStats()}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
