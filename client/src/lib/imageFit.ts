/**
 * Auto image fit for framed photo slots.
 * - Similar photo vs slot aspect → cover (fill) + optional focal crop
 * - Very different aspects → contain (show the whole photo)
 */

export type ImageFitMode = "cover" | "contain" | "auto";

export type FocalPoint =
  | "center"
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

const FOCAL_TO_POSITION: Record<FocalPoint, string> = {
  center: "center center",
  top: "center top",
  bottom: "center bottom",
  left: "left center",
  right: "right center",
  "top-left": "left top",
  "top-right": "right top",
  "bottom-left": "left bottom",
  "bottom-right": "right bottom",
};

/** ln(1.35) ≈ 0.30 — about 35% aspect drift before we switch to contain */
export const AUTO_FIT_LOG_THRESHOLD = 0.3;

export function focalPointToObjectPosition(focal?: string | null): string | undefined {
  if (!focal) return undefined;
  return FOCAL_TO_POSITION[focal as FocalPoint];
}

/**
 * Pick cover vs contain from photo and slot aspect ratios (width / height).
 * Returns cover when ratios are close enough that cropping stays mild.
 */
export function pickAutoObjectFit(
  imageAspect: number,
  slotAspect: number,
  logThreshold: number = AUTO_FIT_LOG_THRESHOLD,
): "cover" | "contain" {
  if (!(imageAspect > 0) || !(slotAspect > 0) || !Number.isFinite(imageAspect) || !Number.isFinite(slotAspect)) {
    return "cover";
  }
  const drift = Math.abs(Math.log(imageAspect / slotAspect));
  return drift <= logThreshold ? "cover" : "contain";
}

export function resolveImageObjectStyle(opts: {
  fit?: ImageFitMode;
  /** Explicit override from YAML / style prop — always wins */
  explicitObjectFit?: string;
  explicitObjectPosition?: string;
  imageWidth?: number;
  imageHeight?: number;
  slotWidth?: number;
  slotHeight?: number;
  focalPoint?: string | null;
}): { objectFit: "cover" | "contain"; objectPosition: string } {
  const {
    fit = "cover",
    explicitObjectFit,
    explicitObjectPosition,
    imageWidth,
    imageHeight,
    slotWidth,
    slotHeight,
    focalPoint,
  } = opts;

  const focalPosition = focalPointToObjectPosition(focalPoint);
  const objectPosition = explicitObjectPosition || focalPosition || "center center";

  if (explicitObjectFit === "contain" || explicitObjectFit === "cover") {
    return { objectFit: explicitObjectFit, objectPosition };
  }
  if (explicitObjectFit) {
    // fill / none / scale-down — leave as cover for framed photos
    return { objectFit: "cover", objectPosition };
  }

  if (fit === "contain") {
    return { objectFit: "contain", objectPosition };
  }
  if (fit !== "auto") {
    return { objectFit: "cover", objectPosition };
  }

  const imageAspect =
    imageWidth && imageHeight && imageWidth > 0 && imageHeight > 0
      ? imageWidth / imageHeight
      : undefined;
  const slotAspect =
    slotWidth && slotHeight && slotWidth > 0 && slotHeight > 0
      ? slotWidth / slotHeight
      : undefined;

  if (imageAspect == null || slotAspect == null) {
    return { objectFit: "cover", objectPosition };
  }

  return {
    objectFit: pickAutoObjectFit(imageAspect, slotAspect),
    objectPosition,
  };
}
