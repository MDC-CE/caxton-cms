/**
 * Soft fit checks for photo slots in the media picker.
 * Warnings guide staff; they never block Save.
 */

import { AUTO_FIT_LOG_THRESHOLD } from "@/lib/imageFit";

export type ImageSlotHint = {
  /** Minimum source pixels (width) recommended for a sharp result */
  minWidth?: number;
  /** Minimum source pixels (height) recommended for a sharp result */
  minHeight?: number;
  /** Target width / height (e.g. 4/5) */
  aspectRatio?: number;
  /** Optional staff-facing label for the slot (e.g. "hero photo") */
  label?: string;
};

export type ImageSlotFitWarning = {
  code: "too_small" | "aspect_mismatch" | "missing_dimensions";
  message: string;
};

export type ImageSlotFitResult = {
  ok: boolean;
  warnings: ImageSlotFitWarning[];
};

const ASPECT_LABELS: Array<{ ratio: number; label: string }> = [
  { ratio: 16 / 9, label: "16:9" },
  { ratio: 16 / 10, label: "16:10" },
  { ratio: 4 / 3, label: "4:3" },
  { ratio: 3 / 2, label: "3:2" },
  { ratio: 1, label: "1:1" },
  { ratio: 4 / 5, label: "4:5" },
  { ratio: 3 / 4, label: "3:4" },
  { ratio: 9 / 16, label: "9:16" },
];

function formatAspect(ratio: number): string {
  let best = ASPECT_LABELS[0]!;
  let bestDrift = Math.abs(Math.log(ratio / best.ratio));
  for (const entry of ASPECT_LABELS) {
    const drift = Math.abs(Math.log(ratio / entry.ratio));
    if (drift < bestDrift) {
      best = entry;
      bestDrift = drift;
    }
  }
  if (bestDrift < 0.08) return best.label;
  return `${ratio.toFixed(2)}:1`;
}

/**
 * Merge an explicit slot hint with the on-screen slot size (CSS px × DPR).
 * Explicit mins win when larger; aspect prefers the explicit hint.
 */
export function resolveSlotHint(
  renderedSize?: { width: number; height: number } | null,
  explicit?: ImageSlotHint | null,
): ImageSlotHint | null {
  const fromRendered =
    renderedSize && renderedSize.width > 0 && renderedSize.height > 0
      ? {
          minWidth: Math.round(renderedSize.width),
          minHeight: Math.round(renderedSize.height),
          aspectRatio: renderedSize.width / renderedSize.height,
        }
      : null;

  if (!fromRendered && !explicit) return null;

  const minWidth = Math.max(fromRendered?.minWidth ?? 0, explicit?.minWidth ?? 0) || undefined;
  const minHeight = Math.max(fromRendered?.minHeight ?? 0, explicit?.minHeight ?? 0) || undefined;
  const aspectRatio =
    explicit?.aspectRatio && explicit.aspectRatio > 0
      ? explicit.aspectRatio
      : fromRendered?.aspectRatio;

  if (!minWidth && !minHeight && !aspectRatio) return null;

  return {
    minWidth,
    minHeight,
    aspectRatio,
    label: explicit?.label,
  };
}

/**
 * Soft-evaluate whether a gallery image is a good fit for a slot.
 * Missing image dimensions → no size/aspect warnings (unknown ≠ fail).
 */
export function evaluateImageSlotFit(
  image: { width?: number; height?: number } | null | undefined,
  hint: ImageSlotHint | null | undefined,
  opts?: { aspectLogThreshold?: number },
): ImageSlotFitResult {
  if (!hint) return { ok: true, warnings: [] };

  const warnings: ImageSlotFitWarning[] = [];
  const imgW = image?.width;
  const imgH = image?.height;
  const hasDims = typeof imgW === "number" && imgW > 0 && typeof imgH === "number" && imgH > 0;

  const needsSize = (hint.minWidth && hint.minWidth > 0) || (hint.minHeight && hint.minHeight > 0);
  const needsAspect = typeof hint.aspectRatio === "number" && hint.aspectRatio > 0;

  if (!hasDims && (needsSize || needsAspect)) {
    // Unknown size: do not scare staff; crop tooling may still help.
    return { ok: true, warnings: [] };
  }

  if (hasDims && needsSize) {
    const shortOnWidth = hint.minWidth != null && imgW! < hint.minWidth;
    const shortOnHeight = hint.minHeight != null && imgH! < hint.minHeight;
    if (shortOnWidth || shortOnHeight) {
      const neededW = hint.minWidth ?? imgW!;
      const neededH = hint.minHeight ?? imgH!;
      const slotLabel = hint.label ? ` for the ${hint.label}` : " for this space";
      warnings.push({
        code: "too_small",
        message: `This photo is smaller than recommended${slotLabel} (${imgW}×${imgH} px; about ${neededW}×${neededH} px looks sharp). It may look soft. You can still use it.`,
      });
    }
  }

  if (hasDims && needsAspect) {
    const imageAspect = imgW! / imgH!;
    const threshold = opts?.aspectLogThreshold ?? AUTO_FIT_LOG_THRESHOLD;
    const drift = Math.abs(Math.log(imageAspect / hint.aspectRatio!));
    if (drift > threshold) {
      warnings.push({
        code: "aspect_mismatch",
        message: `This photo’s shape (${formatAspect(imageAspect)}) is quite different from the space (${formatAspect(hint.aspectRatio!)}). It may be cropped a lot. You can still use it, or crop & resize first.`,
      });
    }
  }

  return { ok: warnings.length === 0, warnings };
}
