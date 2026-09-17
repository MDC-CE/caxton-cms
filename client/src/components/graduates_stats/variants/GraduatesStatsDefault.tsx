
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { UniversalImage } from "@/components/UniversalImage";
import type { GraduatesStatsSection } from "@shared/schema";
import { cn } from "@/lib/utils";
import { DotsIndicator } from "@/components/DotsIndicator";
import { Button } from "@/components/ui/button";

interface GraduatesStatsDefaultProps {
  data: GraduatesStatsSection;
}

export default function GraduatesStatsDefault({ data: raw }: GraduatesStatsDefaultProps) {
  const data = raw as GraduatesStatsSection & Record<string, any>;
  const { heading, subheading, stats, collage_images, background } = data;
  const [activeMobileImageIndex, setActiveMobileImageIndex] = useState(0);
  const mobileViewportRef = useRef<HTMLDivElement | null>(null);
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const swipeDeltaXRef = useRef(0);
  const isHorizontalSwipeRef = useRef(false);

  if (!stats || stats.length === 0) {
    return null;
  }

  const hasMobileCarousel = (collage_images?.length ?? 0) > 0;
  const maxMobileImageIndex = Math.max((collage_images?.length ?? 1) - 1, 0);

  const goToMobileImage = (index: number) => {
    const clampedIndex = Math.max(0, Math.min(index, maxMobileImageIndex));
    setActiveMobileImageIndex(clampedIndex);
  };

  const resetTouchState = () => {
    touchStartXRef.current = null;
    touchStartYRef.current = null;
    swipeDeltaXRef.current = 0;
    isHorizontalSwipeRef.current = false;
  };

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    if (!touch) return;

    touchStartXRef.current = touch.clientX;
    touchStartYRef.current = touch.clientY;
    swipeDeltaXRef.current = 0;
    isHorizontalSwipeRef.current = false;
  };

  const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    if (!touch || touchStartXRef.current === null || touchStartYRef.current === null) return;

    const deltaX = touch.clientX - touchStartXRef.current;
    const deltaY = touch.clientY - touchStartYRef.current;

    if (!isHorizontalSwipeRef.current) {
      if (Math.abs(deltaX) < 8 && Math.abs(deltaY) < 8) return;
      if (Math.abs(deltaX) <= Math.abs(deltaY)) return;
      isHorizontalSwipeRef.current = true;
    }

    event.preventDefault();
    swipeDeltaXRef.current = deltaX;
  };

  const handleTouchEnd = () => {
    if (!isHorizontalSwipeRef.current) {
      resetTouchState();
      return;
    }

    const viewportWidth = mobileViewportRef.current?.offsetWidth ?? 0;
    const swipeThreshold = Math.max(viewportWidth * 0.18, 48);
    const finalOffset = swipeDeltaXRef.current;

    if (finalOffset <= -swipeThreshold && activeMobileImageIndex < maxMobileImageIndex) {
      goToMobileImage(activeMobileImageIndex + 1);
    } else if (finalOffset >= swipeThreshold && activeMobileImageIndex > 0) {
      goToMobileImage(activeMobileImageIndex - 1);
    }

    resetTouchState();
  };

  useEffect(() => {
    setActiveMobileImageIndex(0);
  }, [collage_images?.length]);

  const renderCollageImages = () => (
    <div 
      className="relative grid grid-cols-12 auto-rows-[60px] lg:auto-rows-[70px] gap-2 lg:gap-3"
      data-testid="graduates-stats-collage"
    >
      {collage_images && collage_images.map((img: Record<string, unknown>, index: number) => {
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
              id={String(img.image_id ?? "")}
              preset="card"
              className="w-full h-full object-cover shadow-sm"
              alt={`Graduate photo ${index + 1}`}
              loading={index < 2 ? "eager" : "lazy"}
              style={{
                objectPosition: (img.object_position as string | undefined) ?? "center center",
                transform: `scale(${Number(img.object_scale ?? 1)})`,
                transformOrigin: (img.transform_origin as string | undefined) ?? "50% 50%",
              }}
              fieldContext={{ arrayPath: "collage_images", index, srcField: "image_id" }}
            />
          </div>
        );
      })}
    </div>
  );

  const renderMobileCarouselImages = () => {
    if (!collage_images || collage_images.length === 0) return null;

    return (
      <div className="md:hidden">
        <div
          ref={mobileViewportRef}
          className="-mx-2 overflow-hidden px-2"
          style={{ touchAction: "pan-y" }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
          data-testid="graduates-stats-mobile-carousel"
        >
          <div
            className="flex items-stretch transition-transform duration-300 ease-out"
            style={{ transform: `translateX(-${activeMobileImageIndex * 100}%)` }}
          >
            {collage_images.map((img: Record<string, unknown>, index: number) => (
              <div key={index} className="flex w-full shrink-0">
                <div className="mx-auto flex w-[93%]">
                  <div className="relative w-full overflow-hidden rounded-[0.8rem] ">
                    <UniversalImage
                      id={String(img.image_id ?? "")}
                      className="w-full h-full object-cover shadow-sm"
                      alt={`Graduate photo ${index + 1}`}
                      loading={index === 0 ? "eager" : "lazy"}
                      style={{
                        objectPosition: (img.object_position as string | undefined) ?? "center center",
                        transform: `scale(${Number(img.object_scale ?? 1)})`,
                        transformOrigin: (img.transform_origin as string | undefined) ?? "50% 50%",
                      }}
                      fieldContext={{ arrayPath: "collage_images", index, srcField: "image_id" }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {collage_images.length > 1 && (
          <div className="mt-4 flex items-center justify-center gap-3" data-testid="graduates-stats-mobile-carousel-controls">
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 shrink-0 rounded-full border-0 shadow-none hover:bg-muted"
              onClick={() => goToMobileImage(activeMobileImageIndex - 1)}
              disabled={activeMobileImageIndex === 0}
              aria-label="Previous graduate image"
              data-testid="button-graduates-stats-prev"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <DotsIndicator
              count={collage_images.length}
              activeIndex={activeMobileImageIndex}
              onDotClick={goToMobileImage}
              ariaLabel="Graduate image indicators"
            />

            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 shrink-0 rounded-full border-0 shadow-none hover:bg-muted"
              onClick={() => goToMobileImage(activeMobileImageIndex + 1)}
              disabled={activeMobileImageIndex === collage_images.length - 1}
              aria-label="Next graduate image"
              data-testid="button-graduates-stats-next"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    );
  };

  const renderStats = () => (
    <div 
      className="flex flex-col justify-center"
      data-testid="graduates-stats-numbers"
    >
      <div className="grid grid-cols-2 gap-y-6 md:gap-y-12 gap-x-8">
        {stats.map((stat, index) => {
          const isLastItem = index === stats.length - 1 && stats.length % 2 !== 0;
          
          return (
            <div 
              key={index} 
              className={cn(
                "text-center",
                isLastItem && "col-span-2 mt-1 md:mt-4"
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
      <div>
        {(heading || subheading) && (
          <div className="text-center mb-12">
            {heading && (
              <h2 
                className="text-2xl md:text-3xl lg:text-4xl font-bold text-foreground leading-tight mb-4"
                data-testid="text-graduates-stats-heading"
                dangerouslySetInnerHTML={{ __html: heading }}
              />
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
          <div className="relative grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-8 lg:gap-12 items-center px-4 py-4 md:py-8">
            <div className="order-2 lg:order-1">
              {hasMobileCarousel ? renderMobileCarouselImages() : null}
              <div className="hidden md:block">
                {renderCollageImages()}
              </div>
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
