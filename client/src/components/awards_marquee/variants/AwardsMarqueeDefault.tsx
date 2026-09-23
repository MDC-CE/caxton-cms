import { useState, useEffect } from "react";
import { CSSMarquee } from "@/components/ui/CSSMarquee";
import { UniversalImage } from "@/components/UniversalImage";

function parseLogoHeight(value?: string): number | undefined {
  if (!value) return undefined;
  const match = value.match(/^(\d+)/);
  return match ? parseInt(match[1], 10) : undefined;
}

export interface AwardsMarqueeItem {
  id: string;
  logo?: string;
  alt: string;
  logoHeight?: string;
  source?: string;
  name?: string;
  year?: string;
}

export function AwardsMarquee({ data }: { data: any }) {
  const {
    items = [],
    speed = 60,
    gradient = true,
    gradientWidth = 100,
    className = "",
    title,
    title_above_carousel = false,
  } = data;

  // SSR-safe: window may exist under the location shim without matchMedia.
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mediaQuery = window.matchMedia("(min-width: 768px)");
    setIsDesktop(mediaQuery.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  const responsiveGradientWidth = isDesktop ? gradientWidth : Math.min(gradientWidth, 30);

  if (!items || items.length === 0) return null;

  const titleBlock = title ? (
    <div className="max-w-6xl mx-auto px-4 py-4">
      <p
        className="text-body text-muted-foreground max-w-3xl mx-auto text-center"
        dangerouslySetInnerHTML={{ __html: title }}
      />
    </div>
  ) : null;

  return (
    <section className="max-w-6xl mx-auto">
      {title_above_carousel && titleBlock}
      <div className={`${className} px-4`} data-testid="awards-marquee">
        <CSSMarquee speed={speed} gradient={gradient} gradientWidth={responsiveGradientWidth}>
          {items.map((item: AwardsMarqueeItem, index: number) => (
            <div
              key={item.id}
              className="flex items-center justify-center mx-4 transition-opacity duration-brand ease-brand hover:opacity-80"
              data-testid={`marquee-item-${index}`}
            >
              {item.logo ? (
                <div style={{ height: parseLogoHeight(item.logoHeight) || 48 }} className="flex items-center">
                  <UniversalImage
                    id={item.logo}
                    alt={item.alt}
                    className="h-full w-auto"
                    style={{ objectFit: "contain", width: "auto", height: "100%" }}
                    fieldContext={{ arrayPath: "items", index, srcField: "logo" }}
                  />
                </div>
              ) : (
                <div className="flex flex-col items-center text-center">
                  <span className="text-xs text-muted-foreground uppercase tracking-wide">
                    {item.source} {item.year && `${item.year}`}
                  </span>
                  <span className="text-sm font-medium text-foreground mt-0.5">{item.name}</span>
                </div>
              )}
            </div>
          ))}
        </CSSMarquee>
      </div>
      {!title_above_carousel && titleBlock}
    </section>
  );
}

export default AwardsMarquee;
