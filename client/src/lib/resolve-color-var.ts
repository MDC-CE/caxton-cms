export const COLOR_MAP: Record<string, string> = {
  primary: "var(--primary)",
  muted: "var(--muted)",
  accent: "var(--accent)",
  secondary: "var(--secondary)",
  destructive: "var(--destructive)",
  card: "var(--card)",
  background: "var(--background)",
  sidebar: "var(--sidebar-background)",
};

export interface ResolvedColor {
  base: string;
  opacity: number;
}

export function resolveColorVar(color: string | undefined): ResolvedColor {
  const defaultColor: ResolvedColor = { base: "var(--primary)", opacity: 1 };
  if (!color) return defaultColor;
  if (COLOR_MAP[color]) return { base: COLOR_MAP[color], opacity: 1 };
  const hslVarMatch = color.match(/^hsl\((var\(--[^)]+\))(?:\s*\/\s*([\d.]+))?\)$/);
  if (hslVarMatch) {
    return { base: hslVarMatch[1], opacity: hslVarMatch[2] ? parseFloat(hslVarMatch[2]) : 1 };
  }
  if (color.startsWith("hsl(") && color.endsWith(")")) {
    return { base: color.slice(4, -1), opacity: 1 };
  }
  if (color.startsWith("var(") || color.startsWith("#")) return { base: color, opacity: 1 };
  return defaultColor;
}

export function hslColor(resolved: ResolvedColor, opacityMultiplier: number = 1): string {
  const finalOpacity = Math.min(resolved.opacity * opacityMultiplier, 1);
  return `hsl(${resolved.base} / ${finalOpacity})`;
}

export function hslColorRaw(resolved: ResolvedColor): string {
  return `hsl(${resolved.base})`;
}
