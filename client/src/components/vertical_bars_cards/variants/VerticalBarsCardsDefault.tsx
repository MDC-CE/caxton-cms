import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";

interface YearValue {
  year: string;
  value: number;
  displayValue: string;
}

interface MetricCard {
  title: string;
  icon?: string;
  unit?: string;
  description?: string;
  years: YearValue[];
}

interface VerticalBarsCardsData {
  type: "vertical_bars_cards";
  version?: string;
  title?: string;
  subtitle?: string;
  footer_description?: string;
  metrics: MetricCard[];
  background?: string;
}

interface VerticalBarsCardsProps {
  data: VerticalBarsCardsData;
}

interface CardRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const chartColors = [
  "hsl(210, 100%, 70%)",  // Light blue
  "hsl(210, 100%, 50%)",  // Brand blue
  "hsl(210, 100%, 40%)",  // Medium-dark blue
];

export function VerticalBarsCards({ data }: VerticalBarsCardsProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [cardRects, setCardRects] = useState<CardRect[]>([]);
  const [containerWidth, setContainerWidth] = useState(0);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Measure card positions relative to grid container
  const measureCards = () => {
    if (!gridRef.current) return;
    
    const gridRect = gridRef.current.getBoundingClientRect();
    setContainerWidth(gridRect.width);
    
    const rects: CardRect[] = cardRefs.current.map((cardEl) => {
      if (!cardEl) return { left: 0, top: 0, width: 0, height: 0 };
      const rect = cardEl.getBoundingClientRect();
      return {
        left: rect.left - gridRect.left,
        top: rect.top - gridRect.top,
        width: rect.width,
        height: rect.height,
      };
    });
    
    setCardRects(rects);
  };

  // Measure on mount and resize
  useEffect(() => {
    measureCards();
    window.addEventListener("resize", measureCards);
    return () => window.removeEventListener("resize", measureCards);
  }, [data.metrics.length]);

  // Re-measure after initial render
  useEffect(() => {
    const timer = setTimeout(measureCards, 100);
    return () => clearTimeout(timer);
  }, [measureCards]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    let hasScrolled = false;
    let isInView = false;

    const checkAndTrigger = () => {
      if (hasScrolled && isInView) {
        setIsVisible(true);
        observer.disconnect();
        window.removeEventListener("scroll", onScroll);
      }
    };

    const onScroll = () => {
      hasScrolled = true;
      checkAndTrigger();
    };

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          isInView = entry.isIntersecting;
          if (isInView) {
            checkAndTrigger();
          }
        });
      },
      { threshold: 0.2 }
    );

    window.addEventListener("scroll", onScroll, { passive: true });
    observer.observe(element);

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  const renderBars = (metric: MetricCard, metricIndex: number) => {
    const maxValue = Math.max(...metric.years.map((y) => y.value));

    return (
      <div className="flex justify-center items-end gap-6 h-44 mb-4">
        {metric.years.map((yearData, yearIndex) => {
          const percentage = (yearData.value / maxValue) * 100;
          const delay = metricIndex * 150 + yearIndex * 100;
          const barColor = chartColors[yearIndex % chartColors.length];

          return (
            <div
              key={yearIndex}
              className="flex flex-col items-center gap-2"
            >
              <span className="text-sm font-bold text-foreground">
                {yearData.displayValue}
              </span>
              <div className="w-12 md:w-14 h-36 bg-muted rounded-t-md flex items-end overflow-hidden">
                <div
                  className="w-full rounded-t-md transition-all duration-1000 ease-out"
                  style={{
                    height: isVisible ? `${percentage}%` : "0%",
                    backgroundColor: barColor,
                    transitionDelay: `${delay}ms`,
                  }}
                />
              </div>
              <span className="text-xs font-medium text-muted-foreground">
                {yearData.year}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <section
      ref={containerRef}
      className={data.background || "bg-background"}
      data-testid="section-vertical-bars-cards"
    >
      <div className="max-w-6xl mx-auto px-4">
        {(data.title || data.subtitle) && (
          <div className="text-center mb-12">
            {data.title && (
              <h2
                className="text-2xl md:text-3xl font-bold text-foreground mb-4"
                data-testid="text-vertical-bars-title"
              >
                {data.title}
              </h2>
            )}
            {data.subtitle && (
              <p
                className="text-muted-foreground text-lg"
                data-testid="text-vertical-bars-subtitle"
              >
                {data.subtitle}
              </p>
            )}
          </div>
        )}

        {/* Container for both layers */}
        <div className="relative">
          {/* BASE LAYER: Static cards */}
          <div 
            ref={gridRef}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {data.metrics.map((metric, metricIndex) => (
              <div
                key={metricIndex}
                ref={(el) => { cardRefs.current[metricIndex] = el; }}
              >
                <Card
                  className={`p-6 h-full transition-opacity ${
                    hoveredIndex === metricIndex
                      ? "md:opacity-0 md:duration-200 opacity-100"
                      : hoveredIndex !== null
                        ? "md:opacity-30 md:duration-150 opacity-100"
                        : "opacity-100 duration-0"
                  }`}
                  data-testid={`card-metric-${metricIndex}`}
                >
                  <h3 className="text-lg font-bold text-foreground text-center mb-2">
                    {metric.title}
                  </h3>
                  {metric.unit && (
                    <p className="text-sm text-muted-foreground text-center mb-6">
                      {metric.unit}
                    </p>
                  )}
                  {renderBars(metric, metricIndex)}
                  {metric.description && (
                    <p className="text-sm text-muted-foreground leading-relaxed text-center mt-4 md:hidden">
                      {metric.description}
                    </p>
                  )}
                </Card>
              </div>
            ))}
          </div>

          {/* OVERLAY LAYER: Desktop-only hover expansion */}
          <div 
            className="absolute inset-0 pointer-events-none hidden md:block"
            style={{ zIndex: 10 }}
          >
            {data.metrics.map((metric, metricIndex) => {
              const isHovered = hoveredIndex === metricIndex;
              const rect = cardRects[metricIndex];
              
              if (!rect || rect.width === 0) return null;
              
              const isFirstCard = metricIndex === 0;
              const isLastCard = metricIndex === data.metrics.length - 1;
              
              let expandedWidth: number;
              let expandedLeft: number;
              
              if (isFirstCard) {
                expandedWidth = containerWidth - rect.left;
                expandedLeft = rect.left;
              } else if (isLastCard) {
                expandedWidth = rect.left + rect.width;
                expandedLeft = 0;
              } else {
                expandedWidth = containerWidth;
                expandedLeft = 0;
              }
              
              return (
                <Card
                  key={metricIndex}
                  className={`
                    absolute p-6
                    pointer-events-auto cursor-pointer
                    max-w-none
                    ${isHovered ? "shadow-xl z-20 opacity-100" : "opacity-0"}
                  `}
                  style={{
                    transition: isHovered 
                      ? "opacity 0ms ease-out, left 300ms ease-out, width 300ms ease-out, height 300ms ease-out, box-shadow 300ms ease-out"
                      : "opacity 200ms ease-out, left 300ms ease-out, width 300ms ease-out, height 300ms ease-out, box-shadow 300ms ease-out",
                    top: rect.top,
                    left: isHovered ? expandedLeft : rect.left,
                    width: isHovered ? expandedWidth : rect.width,
                    height: rect.height,
                  }}
                  onMouseEnter={() => setHoveredIndex(metricIndex)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  data-testid={`card-overlay-${metricIndex}`}
                >
                  <div 
                    className="flex flex-col"
                    style={{ width: rect.width - 48 }}
                  >
                    <h3 className="text-lg font-bold text-foreground text-center mb-2">
                      {metric.title}
                    </h3>
                    {metric.unit && (
                      <p className="text-sm text-muted-foreground text-center mb-6">
                        {metric.unit}
                      </p>
                    )}
                    {renderBars(metric, metricIndex)}
                  </div>

                  <div 
                    className={`absolute top-6 bottom-6 flex flex-col justify-center pr-6 ease-out ${
                      isHovered 
                        ? "opacity-100" 
                        : "opacity-0 pointer-events-none"
                    }`}
                    style={{ 
                      left: rect.width - 24,
                      right: 24,
                      transitionProperty: "opacity",
                      transitionDuration: isHovered ? "300ms" : "50ms",
                      transitionDelay: isHovered ? "230ms" : "0ms"
                    }}
                  >
                    <h4 className="text-xl font-bold text-foreground mb-3">
                      {metric.title}
                    </h4>
                    <p className="text-base text-muted-foreground leading-relaxed">
                      {metric.description || "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris."}
                    </p>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>

        {data.footer_description && (
          <p className="text-base text-muted-foreground leading-relaxed italic text-center mt-8 max-w-3xl mx-auto">
            {data.footer_description}
          </p>
        )}
      </div>
    </section>
  );
}

export default VerticalBarsCards;
