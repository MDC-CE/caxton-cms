import type { CtaButton } from "@shared/schema";

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
