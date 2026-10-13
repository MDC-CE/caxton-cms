import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";

interface HorizontalBarsItem {
  label: string;
  value: number;
  displayValue?: string;
  color?: string;
}

interface HorizontalBarsData {
  type: "horizontal_bars";
  version?: string;
  title?: string;
  subtitle?: string;
  items: HorizontalBarsItem[];
  background?: string;
  use_card?: boolean;
}

interface HorizontalBarsProps {
  data: HorizontalBarsData;
}

const chartColors = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

export function HorizontalBars({ data }: HorizontalBarsProps) {
  const [isVisible, setIsVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const rect = element.getBoundingClientRect();
    const isInitiallyVisible = rect.top < window.innerHeight && rect.bottom > 0;

    if (isInitiallyVisible) {
      const timeout = setTimeout(() => setIsVisible(true), 300);
      const handleScroll = () => {
        setIsVisible(true);
        window.removeEventListener("scroll", handleScroll);
      };
      window.addEventListener("scroll", handleScroll, { passive: true });
      return () => {
        clearTimeout(timeout);
        window.removeEventListener("scroll", handleScroll);
      };
    } else {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              setIsVisible(true);
              observer.disconnect();
            }
          });
        },
        { threshold: 0.2 }
      );
      observer.observe(element);
      return () => observer.disconnect();
    }
  }, []);

  const maxValue = Math.max(...data.items.map((item) => item.value));

  const barsContent = (
    <>
      {(data.title || data.subtitle) && (
        <div className={data.use_card ? "mb-6" : "text-center mb-12"}>
          {data.title && (
            <h2
              className={data.use_card 
                ? "text-lg font-bold text-foreground mb-1" 
                : "text-2xl md:text-3xl font-bold text-foreground mb-4"
              }
              data-testid="text-horizontal-bars-title"
            >
              {data.title}
            </h2>
          )}
          {data.subtitle && (
            <p
              className="text-muted-foreground text-sm"
              data-testid="text-horizontal-bars-subtitle"
            >
              {data.subtitle}
            </p>
          )}
        </div>
      )}

      <div className="space-y-4">
        {data.items.map((item, index) => {
          const percentage = (item.value / maxValue) * 100;
          const delay = index * 150;
          const barColor = item.color || chartColors[index % chartColors.length];
          const displayText = item.displayValue || `${item.value}%`;

          return (
            <div
              key={index}
              className="flex items-center h-10 md:h-12 rounded-md overflow-hidden"
              data-testid={`bar-item-${index}`}
            >
              <div className="w-20 md:w-24 h-full flex items-center justify-center bg-primary/10 shrink-0 rounded-l-md">
                <span className="text-sm md:text-base font-semibold text-foreground">
                  {item.label}
                </span>
              </div>
              <div className="flex-1 h-full bg-muted rounded-r-md overflow-hidden">
                <div
                  className="h-full flex items-center justify-end pr-3 transition-all duration-1000 ease-out rounded-r-md"
                  style={{
                    width: isVisible ? `${percentage}%` : "0%",
                    transitionDelay: `${delay}ms`,
                    backgroundColor: barColor,
                  }}
                >
                  <span className="text-sm md:text-base font-bold text-primary-foreground whitespace-nowrap">
                    {displayText}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );

  if (data.use_card) {
    return (
      <section
        ref={containerRef}
        className={data.background || "bg-background"}
        data-testid="section-horizontal-bars"
      >
        <div className="max-w-6xl mx-auto px-4">
          <Card className="p-6">
            {barsContent}
          </Card>
        </div>
      </section>
    );
  }

  return (
    <section
      ref={containerRef}
      className={data.background || "bg-background"}
      data-testid="section-horizontal-bars"
    >
      <div className="max-w-4xl mx-auto px-4">
        {barsContent}
      </div>
    </section>
  );
}

export default HorizontalBars;
