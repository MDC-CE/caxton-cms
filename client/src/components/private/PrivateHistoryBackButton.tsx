import { IconArrowLeft } from "@tabler/icons-react";
import { useLocation } from "wouter";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const DEFAULT_PRIVATE_HISTORY_FALLBACK = "/private/diagnostics";

export type PrivateHistoryBackNavigateDeps = {
  historyLength: number;
  historyBack: () => void;
  navigate: (href: string) => void;
  fallbackHref: string;
};

/** Prefer browser history; otherwise SPA-navigate to fallback (cold open / new tab). */
export function navigatePrivateHistoryBack({
  historyLength,
  historyBack,
  navigate,
  fallbackHref,
}: PrivateHistoryBackNavigateDeps): void {
  if (historyLength > 1) {
    historyBack();
    return;
  }
  navigate(fallbackHref);
}

export type PrivateHistoryBackButtonProps = {
  fallbackHref?: string;
  "data-testid"?: string;
  className?: string;
  size?: ButtonProps["size"];
  variant?: ButtonProps["variant"];
  iconClassName?: string;
};

export function PrivateHistoryBackButton({
  fallbackHref = DEFAULT_PRIVATE_HISTORY_FALLBACK,
  "data-testid": dataTestId,
  className,
  size = "icon",
  variant = "ghost",
  iconClassName,
}: PrivateHistoryBackButtonProps) {
  const [, setLocation] = useLocation();

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      data-testid={dataTestId}
      aria-label="Go back"
      onClick={() =>
        navigatePrivateHistoryBack({
          historyLength: window.history.length,
          historyBack: () => window.history.back(),
          navigate: setLocation,
          fallbackHref,
        })
      }
    >
      <IconArrowLeft className={cn("h-5 w-5", iconClassName)} />
    </Button>
  );
}
