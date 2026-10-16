import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type SharedProps = {
  children: ReactNode;
  className?: string;
  "data-testid"?: string;
};

type ExpandArrowButtonAsButton = SharedProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "className"> & {
    href?: undefined;
  };

type ExpandArrowButtonAsLink = SharedProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "children" | "className"> & {
    href: string;
  };

export type ExpandArrowButtonProps = ExpandArrowButtonAsButton | ExpandArrowButtonAsLink;

function ExpandArrowInner({ children }: { children: ReactNode }) {
  return (
    <>
      {/* In-flow spacer so the label always starts after the circle, even when the circle is absolute. */}
      <span className="expand-arrow-button__spacer" aria-hidden="true" />
      <span className="expand-arrow-button__circle" aria-hidden="true">
        <span className="expand-arrow-button__icon expand-arrow-button__icon--arrow" />
      </span>
      <span className="expand-arrow-button__text">{children}</span>
    </>
  );
}

/**
 * MDC CE “learn more” CTA: circular arrow that expands to a full primary pill on hover/focus.
 * Theme-driven (primary / primary-foreground) — no hardcoded brand hex.
 */
export function ExpandArrowButton(props: ExpandArrowButtonProps) {
  const { children, className, ...rest } = props;
  const classes = cn("expand-arrow-button", className);

  if ("href" in props && props.href) {
    const { href, onClick, ...anchorRest } = rest as ExpandArrowButtonAsLink;
    return (
      <a href={href} onClick={onClick} className={classes} {...anchorRest}>
        <ExpandArrowInner>{children}</ExpandArrowInner>
      </a>
    );
  }

  const buttonRest = rest as ExpandArrowButtonAsButton;
  return (
    <button type={buttonRest.type ?? "button"} className={classes} {...buttonRest}>
      <ExpandArrowInner>{children}</ExpandArrowInner>
    </button>
  );
}

/** True when YAML asks for the expand-arrow chrome (dual-edit via variant or button_variant). */
export function isExpandArrowButtonVariant(button?: {
  variant?: string;
  button_variant?: string;
}): boolean {
  const v = (button?.button_variant || button?.variant || "").trim().toLowerCase();
  return v === "learn_more" || v === "expand_arrow";
}
