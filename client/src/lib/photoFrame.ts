import type { CSSProperties } from "react";

export type PhotoFrameKind = "none" | "line" | "glow";

/** How round the photo box corners are (staff-facing chrome). */
export type PhotoCornerRadius = "none" | "sm" | "md" | "lg" | "full";

function colorWithAlpha(color: string, alpha: number): string {
  const trimmed = color.trim();
  const cssVar = trimmed.match(/^hsl\(\s*var\((--[\w-]+)\)\s*\)$/i);
  if (cssVar) return `hsl(var(${cssVar[1]}) / ${alpha})`;
  const hsl = trimmed.match(/^hsl\(\s*(.+)\s*\)$/i);
  if (hsl && !hsl[1].includes("/")) return `hsl(${hsl[1]} / ${alpha})`;
  return `color-mix(in srgb, ${trimmed} ${Math.round(alpha * 100)}%, transparent)`;
}

export function photoFrameKind(value?: string): PhotoFrameKind {
  if (value === "line" || value === "glow") return value;
  return "none";
}

export function photoCornerRadius(value?: string): PhotoCornerRadius {
  if (value === "none" || value === "sm" || value === "md" || value === "lg" || value === "full") {
    return value;
  }
  return "md";
}

/** Tailwind class for the photo box / inner crop. Default md = brand card radius. */
export function photoCornerRadiusClass(value?: string): string {
  switch (photoCornerRadius(value)) {
    case "none":
      return "rounded-none";
    case "sm":
      return "rounded-sm";
    case "lg":
      return "rounded-lg";
    case "full":
      return "rounded-full";
    case "md":
    default:
      return "rounded-card";
  }
}

/**
 * Outer box: glow/line chrome. Keep overflow-visible so staff "Change photo"
 * controls under small thumbs are not clipped. Crop the photo inside UniversalImage.
 */
export function photoFrameOuterStyle(
  frame?: string,
  color?: string,
  radius?: string,
): { className: string; style?: CSSProperties } {
  const kind = photoFrameKind(frame);
  const round = photoCornerRadiusClass(radius);

  if (kind === "none") {
    return { className: `min-h-0 overflow-visible ${round} bg-muted` };
  }

  const line = color?.trim() || "hsl(var(--foreground))";

  if (kind === "line") {
    return {
      className: `min-h-0 overflow-visible ${round} bg-muted border`,
      style: { borderColor: line },
    };
  }

  return {
    className: `min-h-0 overflow-visible ${round} bg-muted`,
    style: {
      boxShadow: `0 0 0 1px ${line}, 0 0 12px ${colorWithAlpha(line, 0.4)}, 0 0 24px ${colorWithAlpha(line, 0.18)}`,
    },
  };
}
