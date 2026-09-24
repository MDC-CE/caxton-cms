
import { resolveColorVar, hslColor, hslColorRaw } from "@/lib/resolve-color-var";

interface TrendLineChartProps {
  years?: string[];
  axisLabels?: string[];
  values?: number[];
  endLabel?: string;
  accentColor?: string;
}

const DEFAULT_YEARS  = ["2020","2021","2022","2023","2024","2025","2026","2027"];
const DEFAULT_VALUES = [0.05, 0.08, 0.14, 0.25, 0.44, 0.62, 0.85, 1.0];

const W   = 280;
const H   = 100;
const PAD = { top: 10, right: 10, bottom: 18, left: 10 };

function buildPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return "";
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1];
    const curr = pts[i];
    const cpX  = (prev.x + curr.x) / 2;
    d += ` C ${cpX} ${prev.y}, ${cpX} ${curr.y}, ${curr.x} ${curr.y}`;
  }
  return d;
}

export function TrendLineChart({
  years       = DEFAULT_YEARS,
  axisLabels,
  values      = DEFAULT_VALUES,
  endLabel    = "1.3M · 2027",
  accentColor = "hsl(var(--primary))",
}: TrendLineChartProps) {
  const resolved  = resolveColorVar(accentColor);
  const accentCss = hslColorRaw(resolved);
  const gradId    = `trendArea_${accentColor.replace(/[^a-zA-Z0-9]/g, "")}`;

  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top  - PAD.bottom;

  const points = values.map((v, i) => ({
    x: PAD.left + (i / (values.length - 1)) * innerW,
    y: PAD.top  + (1 - v) * innerH,
  }));

  const pathD = buildPath(points);
  const areaD = pathD
    + ` L ${points[points.length - 1].x} ${PAD.top + innerH}`
    + ` L ${PAD.left} ${PAD.top + innerH} Z`;
  const lastPt = points[points.length - 1];

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        style={{ height: "auto" }}
        className="overflow-visible"
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   style={{ stopColor: accentCss, stopOpacity: 0.3 }} />
            <stop offset="100%" style={{ stopColor: accentCss, stopOpacity: 0.02 }} />
          </linearGradient>
        </defs>

        {[0.25, 0.5, 0.75, 1].map((t) => (
          <line
            key={t}
            x1={PAD.left}
            y1={PAD.top + (1 - t) * innerH}
            x2={PAD.left + innerW}
            y2={PAD.top + (1 - t) * innerH}
            stroke="rgba(148,163,184,0.2)"
            strokeWidth="0.8"
          />
        ))}

        <path d={areaD} fill={`url(#${gradId})`} />
        <path d={pathD} fill="none" style={{ stroke: accentCss }} strokeWidth="2" strokeLinecap="round" />
        <circle cx={lastPt.x} cy={lastPt.y} r="4" style={{ fill: accentCss }} />

        {axisLabels && axisLabels.length > 0
          ? axisLabels.map((label, i) => {
              const n = axisLabels.length;
              const x = n === 1
                ? PAD.left + innerW / 2
                : PAD.left + (i / (n - 1)) * innerW;
              return (
                <text
                  key={`${label}-${i}`}
                  x={x}
                  y={H - 2}
                  textAnchor={n === 1 ? "middle" : i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
                  fontSize="8"
                  fill="#475569"
                  data-testid={`text-trend-axis-label-${i}`}
                >
                  {label}
                </text>
              );
            })
          : years.map((y, i) => {
              if (i % 2 !== 0) return null;
              const x = PAD.left + (i / (values.length - 1)) * innerW;
              return (
                <text key={y} x={x} y={H - 2} textAnchor="middle" fontSize="8" fill="#475569">
                  {y}
                </text>
              );
            })}
      </svg>

      {endLabel && (
        <div
          className="absolute flex flex-col items-end"
          style={{ right: 0, top: (1 - values[values.length - 1]) * innerH + PAD.top - 24 }}
        >
          <span
            className="text-xs font-bold rounded-full px-2 py-0.5"
            style={{
              color: accentCss,
              background: hslColor(resolved, 0.15),
              border: `1px solid ${hslColor(resolved, 0.35)}`,
            }}
          >
            {endLabel}
          </span>
        </div>
      )}
    </div>
  );
}
