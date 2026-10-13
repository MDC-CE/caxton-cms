// section-spacing: self-padded
import type { SpacerSection, SpacerSize } from "@shared/schema";
import { cn } from "@/lib/utils";

interface SpacerProps {
  data: SpacerSection;
}

// Heights match the sm/md/lg/xl section spacing presets (16/32/64/96px).
const mobileHeightClasses: Record<SpacerSize, string> = {
  sm: "h-4",
  md: "h-8",
  lg: "h-16",
  xl: "h-24",
};

const desktopHeightClasses: Record<SpacerSize, string> = {
  sm: "md:h-4",
  md: "md:h-8",
  lg: "md:h-16",
  xl: "md:h-24",
};

export function SpacerDefault({ data }: SpacerProps) {
  const size = data.size ?? "md";
  const mobileSize = data.mobile_size ?? size;

  return (
    <div
      aria-hidden="true"
      className={cn(
        "w-full",
        mobileHeightClasses[mobileSize] ?? mobileHeightClasses.md,
        desktopHeightClasses[size] ?? desktopHeightClasses.md,
      )}
      data-testid="section-spacer"
    />
  );
}

export default SpacerDefault;
