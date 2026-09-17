
import type { CSSProperties } from "react";
import type { FeaturesGridStatsChartsSection } from "@shared/schema";
import { resolveColorVar, hslColor, hslColorRaw } from "@/components/course_selector/shared";
import { BarChart } from "@/components/BarChart";
import { CircleGauge } from "@/components/CircleGauge";
import { TrendLineChart } from "@/components/TrendLineChart";

interface Props {
  data: FeaturesGridStatsChartsSection;
}

const DEFAULT_BARS_ACCENT  = "hsl(var(--color-green))";
const DEFAULT_GAUGE_ACCENT = "hsl(var(--color-orange))";
const DEFAULT_TREND_ACCENT = "hsl(var(--primary))";

function badgeStyles(accent: string): CSSProperties {
  const r = resolveColorVar(accent);
  return {
    background: hslColor(r, 0.5),
  };
}

export default function FeaturesGridStatsCharts({ data }: Props) {
  const { card_bars, card_gauge, card_trend } = data;

  const barsAccent  = data.card_bars_accent  || DEFAULT_BARS_ACCENT;
  const gaugeAccent = data.card_gauge_accent || DEFAULT_GAUGE_ACCENT;
  const trendAccent = data.card_trend_accent || DEFAULT_TREND_ACCENT;

  const barsR  = resolveColorVar(barsAccent);
  const gaugeR = resolveColorVar(gaugeAccent);
  const trendR = resolveColorVar(trendAccent);

  return (
    <section
      data-testid="section-features-grid-stats-charts"
    >
      <div className="max-w-6xl mx-auto px-4 lg:px-6 flex flex-col">
        {data.subtitle && (
          <p
            className="text-sm font-semibold text-primary tracking-wider mb-2"
            data-testid="text-stats-charts-subtitle"
          >
            {data.subtitle}
          </p>
        )}
        {(data.title || data.description) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-12 mb-8">
            
            <div>
              {data.title && (
                <h2
                  className="text-5x font-900 text-foreground "
                  data-testid="text-stats-charts-title"
                  dangerouslySetInnerHTML={{ __html: data.title || "" }}
                />
              )}
            </div>
            {data.description && (
              <p
                className="text-base text-muted-foreground leading-relaxed self-center"
                data-testid="text-stats-charts-description"
              >
                {data.description}
              </p>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          {/* ── Card Bars ── */}
          <div
            className="rounded-2xl p-4 md:p-6 flex flex-col gap-3"
            style={{ background: hslColor(barsR, 0.1) }}
            data-testid="card-stats-charts-bars"
          >
            {card_bars?.badge && (
              <span
                className="text-xs px-2.5 py-1 rounded-full self-start"
                style={badgeStyles(barsAccent)}
                data-testid="badge-stats-charts-bars"
              >
                {card_bars.badge}
              </span>
            )}

            {/* Title + description — desktop only */}
            {card_bars?.title && (
              <h3
                className="hidden md:block text-base font-bold text-foreground leading-snug"
                data-testid="text-stats-charts-bars-title"
              >
                {card_bars.title}
              </h3>
            )}
            {card_bars?.description && (
              <p
                className="hidden md:block text-xs text-slate-500 leading-snug -mt-1"
                data-testid="text-stats-charts-bars-description"
              >
                {card_bars.description}
              </p>
            )}

            {/* Mobile: stat left + chart right; Desktop: stacked */}
            <div className="flex items-center gap-3 md:flex-col md:items-stretch md:gap-3">
              {card_bars?.stat_value && (
                <div className="flex flex-col gap-1 flex-1 md:flex-none">
                  <div
                    className="text-3xl md:text-4xl font-extrabold tracking-tight leading-none"
                    style={{ color: hslColorRaw(barsR) }}
                    data-testid="text-stats-charts-bars-value"
                  >
                    {card_bars.stat_value}
                  </div>
                  {card_bars.stat_label && (
                    <p
                      className="text-xs md:text-sm text-muted-foreground mt-1 leading-snug"
                      data-testid="text-stats-charts-bars-label"
                    >
                      {card_bars.stat_label}
                    </p>
                  )}
                </div>
              )}
              <div className="flex-1 md:flex-none">
                <BarChart
                  years={card_bars?.years}
                  displacedLabel={card_bars?.displaced_label}
                  createdLabel={card_bars?.created_label}
                  accentColor={barsAccent}
                />
              </div>
            </div>
          </div>

          {/* ── Card Gauge ── */}
          <div
            className="rounded-2xl p-4 md:p-6 flex flex-col gap-3"
            style={{ background: hslColor(gaugeR, 0.1) }}
            data-testid="card-stats-charts-gauge"
          >
            {card_gauge?.badge && (
              <span
                className="text-xs px-2.5 py-1 rounded-full self-start"
                style={badgeStyles(gaugeAccent)}
                data-testid="badge-stats-charts-gauge"
              >
                {card_gauge.badge}
              </span>
            )}

            {/* Title + description — desktop only */}
            {card_gauge?.title && (
              <h3
                className="hidden md:block text-base font-bold text-foreground leading-snug"
                data-testid="text-stats-charts-gauge-title"
              >
                {card_gauge.title}
              </h3>
            )}
            {card_gauge?.description && (
              <p
                className="hidden md:block text-xs text-slate-500 leading-snug -mt-1"
                data-testid="text-stats-charts-gauge-description"
              >
                {card_gauge.description}
              </p>
            )}

            {/* Mobile layout: stat left + circle right, then bars */}
            <div className="flex flex-col gap-3 md:hidden">
              <div className="flex items-center gap-3">
                <div className="flex flex-col gap-1 flex-1">
                  <div
                    className="text-3xl font-black tracking-tight leading-none"
                    style={{ color: hslColorRaw(gaugeR) }}
                    data-testid="text-stats-charts-gauge-value-mobile"
                  >
                    {(card_gauge?.outer_stat_percentage ??
                      (100 - (card_gauge?.inner_stat_percentage ?? 3)))}%
                  </div>
                  {card_gauge?.stat_label && (
                    <p
                      className="text-xs text-muted-foreground mt-1 leading-snug"
                      data-testid="text-stats-charts-gauge-label-mobile"
                    >
                      {card_gauge.stat_label}
                    </p>
                  )}
                </div>
                <CircleGauge
                  innerStatPct={card_gauge?.inner_stat_percentage}
                  outerStatPct={card_gauge?.outer_stat_percentage}
                  gaugeLabel={card_gauge?.gauge_label}
                  highlightInner={card_gauge?.inner_stat_highlight ?? true}
                  showGauge={card_gauge?.show_gauge ?? true}
                  accentColor={gaugeAccent}
                  variant="circle-only"
                />
              </div>
              <CircleGauge
                innerStatPct={card_gauge?.inner_stat_percentage}
                outerStatPct={card_gauge?.outer_stat_percentage}
                highlightInner={card_gauge?.inner_stat_highlight ?? true}
                showGauge={card_gauge?.show_gauge ?? true}
                bar1Label={card_gauge?.bar1_label}
                bar2Label={card_gauge?.bar2_label}
                accentColor={gaugeAccent}
                variant="bars-only"
              />
            </div>

            {/* Desktop layout: full CircleGauge */}
            <div className="hidden md:block">
              <CircleGauge
                innerStatPct={card_gauge?.inner_stat_percentage}
                outerStatPct={card_gauge?.outer_stat_percentage}
                gaugeLabel={card_gauge?.gauge_label}
                gaugeSubLabel={card_gauge?.stat_label}
                highlightInner={card_gauge?.inner_stat_highlight ?? true}
                showGauge={card_gauge?.show_gauge ?? true}
                bar1Label={card_gauge?.bar1_label}
                bar2Label={card_gauge?.bar2_label}
                accentColor={gaugeAccent}
                variant="full"
              />
            </div>
          </div>

          {/* ── Card Trend ── */}
          <div
            className="rounded-2xl p-4 md:p-6 flex flex-col gap-3"
            style={{ background: hslColor(trendR, 0.1) }}
            data-testid="card-stats-charts-trend"
          >
            {card_trend?.badge && (
              <span
                className="text-xs px-2.5 py-1 rounded-full self-start"
                style={badgeStyles(trendAccent)}
                data-testid="badge-stats-charts-trend"
              >
                {card_trend.badge}
              </span>
            )}

            {/* Title + description — desktop only */}
            {card_trend?.title && (
              <h3
                className="hidden md:block text-base font-bold text-foreground leading-snug"
                data-testid="text-stats-charts-trend-title"
              >
                {card_trend.title}
              </h3>
            )}
            {card_trend?.description && (
              <p
                className="hidden md:block text-xs text-slate-500 leading-snug -mt-1"
                data-testid="text-stats-charts-trend-description"
              >
                {card_trend.description}
              </p>
            )}

            {card_trend?.stat_value && (
              <div>
                <div
                  className="text-3xl md:text-4xl font-black tracking-tight leading-none"
                  style={{ color: hslColorRaw(trendR) }}
                  data-testid="text-stats-charts-trend-value"
                >
                  {card_trend.stat_value}
                </div>
                {card_trend.stat_label && (
                  <p
                    className="text-xs md:text-sm text-muted-foreground mt-1 leading-snug"
                    data-testid="text-stats-charts-trend-label"
                  >
                    {card_trend.stat_label}
                  </p>
                )}
              </div>
            )}
            <TrendLineChart
              endLabel={card_trend?.end_label}
              axisLabels={(card_trend as { axis_labels?: string[] } | undefined)?.axis_labels}
              accentColor={trendAccent}
            />
          </div>

        </div>
      </div>
    </section>
  );
}
