import type { CSSProperties } from "react";

/** Light-theme channels from `:root`. Enough to turn `hsl(var(--token))` into a real color. */
const LIGHT_CHANNELS: Record<string, string> = {
  "--background": "0 0% 100%",
  "--card": "0 0% 100%",
  "--primary": "210 100% 50%",
  "--secondary": "0 0% 96%",
  "--muted": "0 0% 98%",
  "--accent": "43 100% 55%",
  "--destructive": "0 75% 45%",
  "--sidebar": "0 0% 98%",
};

const HSL_VAR_RE = /hsl\(\s*var\(\s*(--[a-z0-9-]+)\s*\)\s*(?:\/\s*([\d.]+%?)\s*)?\)/gi;

/** Replace `hsl(var(--token))` with a literal `hsl(...)` so extensions can rewrite it. */
export function literalizeThemeColor(value: string): string {
  return value.replace(HSL_VAR_RE, (full, name: string, alpha?: string) => {
    const channel = LIGHT_CHANNELS[name];
    if (!channel) return full;
    return alpha ? `hsl(${channel} / ${alpha})` : `hsl(${channel})`;
  });
}

function isGradient(value: string): boolean {
  return (
    value.startsWith("linear-gradient") ||
    value.startsWith("radial-gradient") ||
    value.startsWith("repeating-linear-gradient") ||
    value.startsWith("repeating-radial-gradient") ||
    value.startsWith("conic-gradient")
  );
}

/**
 * Section `background` may be a Tailwind class token or a raw CSS color/gradient.
 * Gradients/colors must use inline style — never className (and never href).
 */
export function resolveSectionBackground(background?: string): {
  className?: string;
  style?: CSSProperties;
} {
  if (!background?.trim()) return {};
  const value = literalizeThemeColor(background.trim());
  const isRawCss =
    isGradient(value) ||
    value.startsWith("hsl(") ||
    value.startsWith("hsla(") ||
    value.startsWith("rgb(") ||
    value.startsWith("rgba(") ||
    value.startsWith("#");
  if (isRawCss) {
    if (isGradient(value)) {
      return { style: { backgroundImage: value } };
    }
    return { style: { background: value } };
  }
  return { className: background.trim() };
}
