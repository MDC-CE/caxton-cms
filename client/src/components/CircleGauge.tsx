
import { resolveColorVar, hslColor, hslColorRaw } from "../../../site_learning-mdc-edu/component-registry/course_selector/shared";

interface CircleGaugeProps {
  /** Value shown inside the circle and fills the arc. Optional — circle hidden when absent. */
  innerStatPct?: number;
  /** Short label rendered below the % inside the circle. */
  gaugeLabel?: string;
  /** Descriptive text shown beside the circle in the full variant. */
  gaugeSubLabel?: string;
  /** The "other" value. Defaults to (100 - innerStatPct) when inner is set,
   *  or shown standalone out of 100 when innerStatPct is absent. */
  outerStatPct?: number;
  /** When true (default), the inner stat gets the accent colour in the arc and bars.
   *  When false, the outer stat gets accent. */
  highlightInner?: boolean;
  /** When false, the circle SVG is hidden and only bars are shown. Default: true. */
  showGauge?: boolean;
  /** Outer bar label. Bar omitted when absent (no default). */
  bar1Label?: string;
  /** Inner bar label. Bar omitted when absent (no default). */
  bar2Label?: string;
  accentColor?: string;
  variant?: "full" | "circle-only" | "bars-only";
}

const GAUGE_SIZE   = 88;
const STROKE_WIDTH = 9;

export function CircleGauge({
  innerStatPct,
  outerStatPct,
  gaugeLabel,
  gaugeSubLabel,
  bar1Label,
  bar2Label,
  accentColor    = "hsl(var(--color-orange))",
  highlightInner = true,
  showGauge      = true,
  variant        = "full",
}: CircleGaugeProps) {
  const hasInner   = innerStatPct !== undefined;
  const showCircle = showGauge && (hasInner || outerStatPct !== undefined);

  const inner = hasInner
    ? Math.min(100, Math.max(0, innerStatPct!))
    : 0;

  const outer = outerStatPct !== undefined
    ? Math.min(100, Math.max(0, outerStatPct))
    : hasInner
      ? 100 - inner
      : 100;

  // When inner is absent, arc fills based on outer directly (over 100)
  const arcPct = !hasInner
    ? outer
    : highlightInner ? inner : outer;

  const accentBarValue = highlightInner ? inner : outer;
  const faintBarValue  = highlightInner ? outer : inner;

  // Scale bar visual widths proportionally
  const total        = accentBarValue + faintBarValue;
  const accentVisual = total > 0 ? (accentBarValue / total) * 100 : 0;
  const faintVisual  = total > 0 ? (faintBarValue  / total) * 100 : 0;

  const resolved  = resolveColorVar(accentColor);
  const accentCss = hslColorRaw(resolved);
  const trackColor = hslColor(resolved, 0.3);
  const barFaint   = hslColor(resolved, 0.25);
  const bar1Track  = highlightInner ? hslColor(resolved, 0.15) : trackColor;
  const bar2Track  = highlightInner ? trackColor : hslColor(resolved, 0.15);

  const cx     = GAUGE_SIZE / 2;
  const r      = (GAUGE_SIZE - STROKE_WIDTH) / 2;
  const circum = 2 * Math.PI * r;
  const arcDash = `${(arcPct / 100) * circum} ${circum}`;

  // ── Circle ───────────────────────────────────────────────────────────────────
  const circleEl = showCircle ? (
    <div
      className="relative flex-shrink-0"
      style={{ width: GAUGE_SIZE, height: GAUGE_SIZE }}
      data-testid="circle-gauge-svg"
    >
      <svg width={GAUGE_SIZE} height={GAUGE_SIZE} viewBox={`0 0 ${GAUGE_SIZE} ${GAUGE_SIZE}`}>
        <circle
          cx={cx} cy={cx} r={r}
          fill="none"
          stroke={trackColor}
          strokeWidth={STROKE_WIDTH}
          strokeDasharray={`${circum} ${circum}`}
          strokeLinecap="round"
          style={{ transform: "rotate(-90deg)", transformOrigin: "center" }}
        />
        <circle
          cx={cx} cy={cx} r={r}
          fill="none"
          stroke={accentCss}
          strokeWidth={STROKE_WIDTH}
          strokeDasharray={arcDash}
          strokeLinecap="round"
          style={{ transform: "rotate(-90deg)", transformOrigin: "center" }}
        />
      </svg>
      {hasInner && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-sm font-black leading-none" style={{ color: accentCss }}>
            {inner}%
          </span>
          {gaugeLabel && (
            <span className="text-[9px] text-muted-foreground leading-tight mt-0.5 text-center px-1">
              {gaugeLabel}
            </span>
          )}
        </div>
      )}
    </div>
  ) : null;

  // ── Bars (only when labels are provided — no defaults) ───────────────────────
  const showBar1 = !!bar1Label;
  const showBar2 = hasInner && !!bar2Label;

  const barsEl =
    !showBar1 && !showBar2 ? null : !hasInner && showBar1 ? (
      <div className="flex flex-col gap-1">
        <div className="flex justify-between text-xs">
          <span className="text-slate-400">{bar1Label}</span>
          <span style={{ color: accentCss }}>{outer}%</span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: trackColor }}>
          <div
            className="h-full rounded-full"
            style={{ width: `${outer}%`, background: accentCss }}
          />
        </div>
      </div>
    ) : (
      <div className="flex flex-col gap-2.5">
        {showBar1 && (
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">{bar1Label}</span>
              <span style={{ color: highlightInner ? "#94a3b8" : accentCss }}>{outer}%</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: bar1Track }}>
              <div
                className="h-full rounded-full"
                style={{
                  width: `${highlightInner ? faintVisual : accentVisual}%`,
                  background: highlightInner ? barFaint : accentCss,
                }}
              />
            </div>
          </div>
        )}
        {showBar2 && (
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">{bar2Label}</span>
              <span style={{ color: highlightInner ? accentCss : "#94a3b8" }}>{inner}%</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: bar2Track }}>
              <div
                className="h-full rounded-full"
                style={{
                  width: `${highlightInner ? accentVisual : faintVisual}%`,
                  background: highlightInner ? accentCss : barFaint,
                }}
              />
            </div>
          </div>
        )}
      </div>
    );

  if (variant === "circle-only") return circleEl ?? <></>;
  if (variant === "bars-only")   return barsEl ?? <></>;

  // ── Full ─────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4">
      {showCircle ? (
        <div className="flex items-center gap-4">
          {circleEl}
          <div>
            <div className="text-4xl font-black tracking-tight leading-none" style={{ color: accentCss }}>
              {outer}%
            </div>
            {gaugeSubLabel && (
              <p className="text-sm text-muted-foreground mt-1.5 leading-snug">
                {gaugeSubLabel}
              </p>
            )}
          </div>
        </div>
      ) : (
        <div>
          <div className="text-4xl font-black tracking-tight leading-none" style={{ color: accentCss }}>
            {outer}%
          </div>
          {gaugeSubLabel && (
            <p className="text-sm text-muted-foreground mt-1.5 leading-snug">
              {gaugeSubLabel}
            </p>
          )}
        </div>
      )}
      {barsEl}
    </div>
  );
}
