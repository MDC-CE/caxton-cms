import type { CSSProperties } from "react";
import type { CtaButton } from "@shared/schema";
import { hslColorRaw, resolveColorVar } from "@/lib/resolve-color-var";

export function ceButtonUiVariant(
  style?: string,
  cta?: Pick<CtaButton, "variant">,
): "default" | "outline" | "ghost" {
  if (style === "outline") return "outline";
  if (style === "ghost") return "ghost";
  if (style === "solid") return "default";
  if (cta?.variant === "outline") return "outline";
  if (cta?.variant === "secondary") return "ghost";
  return "default";
}

/**
 * Optional fill / text colors from theme IDs on a CTA.
 * Fill applies when the button is the filled (primary) style.
 */
export function ceButtonColorStyles(
  cta?: Pick<CtaButton, "variant" | "button_variant" | "text_color"> | null,
): CSSProperties | undefined {
  if (!cta) return undefined;
  const style: CSSProperties = {};
  const filled = !cta.variant || cta.variant === "primary";
  if (filled && cta.button_variant) {
    style.backgroundColor = hslColorRaw(resolveColorVar(cta.button_variant));
    style.borderColor = style.backgroundColor;
  }
  if (cta.text_color) {
    style.color = hslColorRaw(resolveColorVar(cta.text_color));
  }
  return Object.keys(style).length ? style : undefined;
}
