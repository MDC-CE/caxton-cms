import { createElement, useRef, useState, type MouseEventHandler } from "react";
import { useInternalNav } from "@/hooks/useInternalNav";
import { getIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import type { HeroOrbit as HeroOrbitData } from "@shared/schema";

interface HeroOrbitProps {
  data: HeroOrbitData;
}

/* ─── Badge pill ────────────────────────────────────────────── */
interface BadgeItem {
  label: string;
  highlight?: boolean;
  url?: string;
}

interface OrbitBadgeProps extends BadgeItem {
  onLinkClick?: MouseEventHandler<HTMLAnchorElement>;
}

function OrbitBadge({ label, highlight, url, onLinkClick }: OrbitBadgeProps) {
  const pillClass = cn(
    "inline-flex h-[30px] items-center gap-2 whitespace-nowrap rounded-[10px] border px-2.5",
    "text-body-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
    highlight
      ? "border-primary bg-primary/10 font-semibold text-primary"
      : "border-border bg-card font-normal text-foreground",
    url && "orbit-badge-link",
  );

  const content = (
    <>
      <span
        className={cn(
          "h-2 w-2 shrink-0 rounded-full",
          highlight ? "bg-primary" : "bg-muted-foreground",
        )}
        aria-hidden
      />
      <span>{label}</span>
    </>
  );

  if (url) {
    const isExternal = /^https?:\/\//i.test(url);
    return (
      <a
        href={url}
        onClick={onLinkClick}
        className={pillClass}
        {...(isExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      >
        {content}
      </a>
    );
  }

  return (
    <div className={pillClass}>
      {content}
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
  onLinkClick?: MouseEventHandler<HTMLAnchorElement>;
}

function OrbitRing({ radiusPct, duration, clockwise, badges, startDeg = 0, onLinkClick }: OrbitRingProps) {
  const step = 360 / badges.length;
  return (
    <div
      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20"
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
            <OrbitBadge
              label={badge.label}
              highlight={badge.highlight}
              url={badge.url}
              onLinkClick={onLinkClick}
            />
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
  onLinkClick?: MouseEventHandler<HTMLAnchorElement>;
}

function OrbitDiagram({ centerLabel, inner, middle, outer, onLinkClick }: OrbitDiagramProps) {
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
        width: "clamp(240px, 40vw, 460px)",
        aspectRatio: "650 / 540",
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setMouse(null)}
    >
      {/* Cursor spotlight */}
      <div
        className="absolute inset-0 pointer-events-none blur-[12px] transition-opacity duration-500 z-[5]"
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
            border: "1px dashed hsl(var(--primary) / 0.28)",
          }}
        />
      ))}

      {/* Animated orbit rings */}
      <OrbitRing radiusPct={CQW.radInner}  duration={36} clockwise        badges={inner}  startDeg={20}  onLinkClick={onLinkClick} />
      <OrbitRing radiusPct={CQW.radMiddle} duration={34} clockwise={false} badges={middle} startDeg={200} onLinkClick={onLinkClick} />
      <OrbitRing radiusPct={CQW.radOuter}  duration={34} clockwise        badges={outer}  startDeg={310} onLinkClick={onLinkClick} />

      {/* Center sphere */}
      <div
        className="relative z-10 rounded-full flex items-center justify-center text-primary-foreground font-extrabold flex-shrink-0 pointer-events-none"
        style={{
          width: `${CQW.center}cqw`,
          height: `${CQW.center}cqw`,
          fontSize: `${CQW.centerFont}cqw`,
          background:
            "radial-gradient(circle at 38% 35%, hsl(var(--primary) / 0.75), hsl(var(--primary)) 55%)",
          boxShadow: "0 6px 10px 0 hsl(var(--primary) / 0.3)",
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
  const titleHtml = (data.title ?? "").replace(/\sstyle="[^"]*"/gi, "");

  return (
    <section data-testid="section-hero-orbit" className="scroll-mt-24">
      <div>
        <div className="grid w-full grid-cols-1 md:grid-cols-[2fr_3fr] md:gap-x-gutter">

          <div className="flex flex-col gap-4 md:self-end md:pb-4">
            {data.eyebrow && (
              <p
                className="text-body-sm font-semibold text-primary"
                data-testid="text-hero-eyebrow"
              >
                <span className="mr-2 inline-block h-2 w-2 rounded-full bg-primary align-middle" aria-hidden />
                {data.eyebrow}
              </p>
            )}
            <h1
              className="m-0 text-foreground [&_em]:font-light [&_em]:not-italic [&_em]:text-primary"
              data-testid="text-hero-title"
              dangerouslySetInnerHTML={{ __html: titleHtml }}
            />
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
              onLinkClick={handleLinkClick}
            />
          </div>

          {/* BOTTOM LEFT — body + CTAs + stat */}
          <div className="max-md:contents md:flex md:flex-col md:gap-[1.4rem] md:self-start md:pt-4">
            {data.body && (
              <p
                className="m-0 max-w-[65ch] text-body text-muted-foreground max-md:order-1 max-md:mt-4"
                data-testid="text-hero-body"
              >
                {data.body}
              </p>
            )}

            {data.cta_buttons && data.cta_buttons.length > 0 && (
              <div
                className="flex flex-wrap justify-start gap-3 max-md:order-2 max-md:mt-4"
                data-testid="hero-cta-buttons"
              >
                {data.cta_buttons.map((btn, i) => {
                  const external = /^https?:\/\//i.test(btn.url);
                  return (
                    <a
                      key={i}
                      href={btn.url}
                      onClick={handleLinkClick}
                      className={cn(
                        "site-action",
                        btn.variant === "primary" ? "site-action-primary" : "site-action-secondary",
                      )}
                      data-testid={`button-hero-cta-${i}`}
                      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                    >
                      {btn.icon &&
                        (() => {
                          const Ic = getIcon(btn.icon);
                          return Ic ? (
                            <span aria-hidden="true" className="inline-flex">
                              {createElement(Ic, { className: "h-4 w-4" })}
                            </span>
                          ) : null;
                        })()}
                      {btn.text}
                    </a>
                  );
                })}
              </div>
            )}

            {data.stat && (
              <p
                className="m-0 text-body text-muted-foreground max-md:order-5 max-md:mt-4"
                data-testid="text-hero-stat"
              >
                <span className="[&_strong]:font-semibold [&_strong]:text-foreground" dangerouslySetInnerHTML={{ __html: data.stat }} />
              </p>
            )}
          </div>

          {/* LEGEND — 3rd grid row, right column, normal flow (not absolute) */}
          {hasLegend && (
            <div
              className="max-md:order-4 max-md:mt-2 md:col-start-2 md:row-start-3 flex items-center justify-center gap-5 whitespace-nowrap pt-[18px]"
              data-testid="hero-orbit-legend"
            >
              {legendStart && (
                <div className="flex items-center gap-2 text-body-sm text-muted-foreground">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-muted-foreground" aria-hidden />
                  <span>{legendStart}</span>
                </div>
              )}
              {legendHighlight && (
                <div className="flex items-center gap-2 text-body-sm text-muted-foreground">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden />
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
