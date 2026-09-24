import { createElement, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ResponsiveRichText } from "@/components/ui/responsive-rich-text";
import { useInternalNav } from "@/hooks/useInternalNav";
import { getIcon } from "@/lib/icons";
import type { HeroOrbit as HeroOrbitData } from "@shared/schema";

interface HeroOrbitProps {
  data: HeroOrbitData;
}

/* ─── Badge pill ────────────────────────────────────────────── */
interface BadgeItem {
  label: string;
  highlight?: boolean;
}

function OrbitBadge({ label, highlight }: BadgeItem) {
  return (
    <div
      className={[
        "flex items-center rounded-full whitespace-nowrap",
        "gap-[0.2rem] md:gap-[0.3rem] lg:gap-[0.4rem]",
        "px-[0.45rem] py-[0.25rem] md:px-[0.8rem] md:py-[0.45rem] lg:px-[1.15rem] lg:py-[0.35rem]",
      ].join(" ")}
      style={
        highlight
          ? {
              background: "hsl(210 88% 96%)",
              border: "1px solid hsl(210 70% 82%)",
              boxShadow:
                "0 4px 14px hsl(210 80% 65% / 0.3), inset 0 1px 0 hsl(210 100% 99%), inset 0 -1px 0 hsl(210 55% 87%)",
            }
          : {
              background: "hsl(215 20% 95%)",
              border: "1px solid hsl(215 18% 83%)",
              boxShadow:
                "0 4px 12px rgba(0,0,0,0.10), inset 0 1px 0 hsl(0 0% 100%), inset 0 -1px 0 hsl(215 15% 88%)",
            }
      }
    >
      <span
        className="rounded-full flex-shrink-0 w-[0.3rem] h-[0.3rem] md:w-[0.4rem] md:h-[0.4rem] lg:w-[0.45rem] lg:h-[0.45rem]"
        style={{ background: highlight ? "hsl(210 100% 50%)" : "hsl(215 14% 62%)" }}
      />
      <span
        className={[
          "text-[0.58rem] md:text-[0.75rem] lg:text-[0.92rem]",
          highlight ? "font-extrabold text-primary" : "font-semibold text-[hsl(215_14%_52%)]",
        ].join(" ")}
      >
        {label}
      </span>
    </div>
  );
}

/* ─── Single orbit ring (radiusPct = % of container width) ─── */
interface OrbitRingProps {
  radiusPct: number;
  duration: number;
  clockwise: boolean;
  badges: BadgeItem[];
  startDeg?: number;
}

function OrbitRing({ radiusPct, duration, clockwise, badges, startDeg = 0 }: OrbitRingProps) {
  const step = 360 / badges.length;
  return (
    <div
      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
      style={{ width: `${radiusPct * 2}cqw`, height: `${radiusPct * 2}cqw` }}
    >
      {badges.map((badge, i) => (
        <div
          key={badge.label}
          className={`absolute top-1/2 left-1/2 w-0 h-0 [transform-origin:0_0] ${
            clockwise ? "orbit-cw" : "orbit-ccw"
          }`}
          style={{
            "--angle": `${startDeg + step * i}deg`,
            "--radius": `${radiusPct}cqw`,
            "--duration": `${duration}s`,
          } as React.CSSProperties}
        >
          <div className="orbit-item-inner">
            <OrbitBadge label={badge.label} highlight={badge.highlight} />
          </div>
        </div>
      ))}
    </div>
  );
}


/* ─── cqw constants (all sizes as % of container width) ─────── */
const CQW = {
  ringOuter:  83.1,
  ringMiddle: 62.3,
  ringInner:  41.5,
  radOuter:   41.5,
  radMiddle:  31.1,
  radInner:   20.8,
  center:     27.1,
  centerFont:  7.1,
  spotlight:  24.6,
  pulseInset:  1.5,
};

/* ─── Orbit diagram (no legend — legend lives in grid row 3) ── */
interface OrbitDiagramProps {
  centerLabel: string;
  inner: BadgeItem[];
  middle: BadgeItem[];
  outer: BadgeItem[];
}

function OrbitDiagram({ centerLabel, inner, middle, outer }: OrbitDiagramProps) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const [mouse, setMouse] = useState<{ x: number; y: number } | null>(null);

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = sceneRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMouse({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    });
  }

  return (
    <div
      ref={sceneRef}
      className="orbit-scene relative flex items-center justify-center flex-shrink-0"
      style={{
        width: "clamp(275px, 48vw, 570px)",
        aspectRatio: "650 / 540",
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setMouse(null)}
    >
      {/* Cursor spotlight */}
      <div
        className="absolute inset-0 pointer-events-none blur-[12px] transition-opacity duration-500 z-20"
        style={{
          background: `radial-gradient(circle ${CQW.spotlight}cqw at ${mouse ? `${mouse.x}%` : "50%"} ${mouse ? `${mouse.y}%` : "50%"}, hsl(var(--primary) / 0.13) 0%, hsl(var(--primary) / 0.04) 50%, transparent 75%)`,
          opacity: mouse ? 1 : 0,
        }}
      />

      {/* Static dashed rings */}
      {[CQW.ringOuter, CQW.ringMiddle, CQW.ringInner].map((pct) => (
        <div
          key={pct}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-dashed pointer-events-none"
          style={{
            width: `${pct}cqw`,
            height: `${pct}cqw`,
            border: `clamp(0.8px, 0.24cqw, 1.4px) dashed hsl(215 35% 72% / 0.65)`,
          }}
        />
      ))}

      {/* Animated orbit rings */}
      <OrbitRing radiusPct={CQW.radInner}  duration={36} clockwise        badges={inner}  startDeg={20}  />
      <OrbitRing radiusPct={CQW.radMiddle} duration={34} clockwise={false} badges={middle} startDeg={200} />
      <OrbitRing radiusPct={CQW.radOuter}  duration={34} clockwise        badges={outer}  startDeg={310} />

      {/* Center sphere */}
      <div
        className="relative z-10 rounded-full flex items-center justify-center text-primary-foreground font-extrabold flex-shrink-0"
        style={{
          width: `${CQW.center}cqw`,
          height: `${CQW.center}cqw`,
          fontSize: `${CQW.centerFont}cqw`,
          background:
            "radial-gradient(circle at 38% 35%, hsl(var(--primary) / 0.7), hsl(var(--primary)) 55%, hsl(var(--primary)))",
          boxShadow: "0 16px 50px hsl(var(--primary) / 0.45)",
        }}
      >
        <span>{centerLabel}</span>
        <span
          className="absolute rounded-full border-2 border-primary/45 pointer-events-none"
          style={{ inset: `-${CQW.pulseInset}cqw`, animation: "pulse-ring 4.2s ease-out infinite" }}
        />
      </div>
    </div>
  );
}

/* ─── HeroOrbit ─────────────────────────────────────────────── */
export default function HeroOrbit({ data }: HeroOrbitProps) {
  const handleLinkClick = useInternalNav();

  const diagram = data.orbit_diagram ?? {};
  const centerLabel     = diagram.center_label    ?? "";
  const legendStart     = diagram.legend_start    ?? "";
  const legendHighlight = diagram.legend_highlight ?? "";
  const inner  = (diagram.badges?.inner  ?? []) as BadgeItem[];
  const middle = (diagram.badges?.middle ?? []) as BadgeItem[];
  const outer  = (diagram.badges?.outer  ?? []) as BadgeItem[];

  const hasLegend = !!(legendStart || legendHighlight);

  return (
    <section data-testid="section-hero-orbit">
      <div>
        <div className="w-full grid grid-cols-1 md:grid-cols-[2fr_3fr] md:gap-x-1">

          {/* TOP LEFT — eyebrow + title */}
          <div className="flex flex-col gap-4 md:self-end md:pb-4">
            {data.eyebrow && (
              <div
                className="text-[0.65rem] md:text-[0.72rem] font-bold tracking-[0.12em] text-primary uppercase"
                data-testid="text-hero-eyebrow"
              >
                <span className="inline-block w-[0.55rem] h-[0.55rem] rounded-full bg-[hsl(142_71%_45%)] align-middle mr-[0.45rem]" />
                {data.eyebrow}
              </div>
            )}
            <h1
              className="font-inter font-black leading-none text-foreground m-0 [&_em]:text-primary [&_em]:italic text-[2.75rem] md:text-[3.1rem] lg:text-[3.9rem]"
              data-testid="text-hero-title"
            >
              <ResponsiveRichText html={data.title ?? ""} />
            </h1>
          </div>

          {/* RIGHT — orbit diagram (spans 2 rows on desktop, order-3 on mobile) */}
          <div
            className="max-md:order-3 md:row-span-2 md:col-start-2 md:row-start-1 flex items-center justify-center max-md:py-8"
            data-testid="hero-orbit-diagram"
          >
            <OrbitDiagram
              centerLabel={centerLabel}
              inner={inner}
              middle={middle}
              outer={outer}
            />
          </div>

          {/* BOTTOM LEFT — body + CTAs + stat */}
          <div className="max-md:contents md:flex md:flex-col md:gap-[1.4rem] md:self-start md:pt-4">
            {data.body && (
              <p
                className="max-md:order-1 max-md:mt-4 text-muted-foreground text-[0.88rem] md:text-[0.92rem] lg:text-[1.1rem] lg:max-w-[430px] leading-[1.65] m-0 font-medium"
                data-testid="text-hero-body"
              >
                {data.body}
              </p>
            )}

            {data.cta_buttons && data.cta_buttons.length > 0 && (
              <div
                className="max-md:order-2 max-md:mt-4 flex flex-wrap justify-center md:justify-start gap-2 md:gap-3"
                data-testid="hero-cta-buttons"
              >
                {data.cta_buttons.map((btn, i) => (
                  <Button
                    key={i}
                    variant={btn.variant === "primary" ? "default" : (btn.variant as "outline" | "secondary")}
                    asChild
                    data-testid={`button-hero-cta-${i}`}
                  >
                    <a href={btn.url} onClick={handleLinkClick} className="flex items-center !gap-1 px-2 py-1 text-sm lg:gap-2 lg:px-5 lg:py-1 font-semibold">
                      {btn.icon &&
                        (() => {
                          const Ic = getIcon(btn.icon);
                          return Ic ? createElement(Ic, { className: "h-4 w-4" }) : null;
                        })()}
                      {btn.text}
                    </a>
                  </Button>
                ))}
              </div>
            )}

            {data.stat && (
              <div
                className="max-md:order-5 max-md:mt-4 text-[0.95rem] md:text-[1rem] lg:text-[1.05rem] text-muted-foreground"
                data-testid="text-hero-stat"
              >
                <span className="inline-block w-[0.45rem] h-[0.45rem] rounded-full bg-muted-foreground/40 align-middle mr-[0.5rem]" />
                <span className="[&_strong]:text-foreground" dangerouslySetInnerHTML={{ __html: data.stat }} />
              </div>
            )}
          </div>

          {/* LEGEND — 3rd grid row, right column, normal flow (not absolute) */}
          {hasLegend && (
            <div
              className="max-md:order-4 max-md:mt-2 md:col-start-2 md:row-start-3 flex items-center justify-center gap-5 whitespace-nowrap pt-[18px]"
              data-testid="hero-orbit-legend"
            >
              {legendStart && (
                <div className="flex items-center gap-[0.4rem] text-[0.75rem] text-muted-foreground">
                  <span
                    className="rounded-full flex-shrink-0"
                    style={{
                      width: "0.65rem",
                      height: "0.65rem",
                      background: "hsl(215 14% 80%)",
                      border: "1.5px solid hsl(215 14% 62%)",
                    }}
                  />
                  <span>{legendStart}</span>
                </div>
              )}
              {legendHighlight && (
                <div className="flex items-center gap-[0.4rem] text-[0.75rem] text-muted-foreground">
                  <span className="rounded-full flex-shrink-0 bg-primary" style={{ width: "0.8rem", height: "0.8rem" }} />
                  <span>{legendHighlight}</span>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </section>
  );
}
