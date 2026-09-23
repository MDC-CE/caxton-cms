import { useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { Overlay } from "@/hooks/useOverlays";
import {
  markOverlaySeen,
  isOverlayDismissible,
  overlayUsesAutoRedirect,
  resolveOverlayRedirectUrl,
} from "@/hooks/useOverlays";
import { OverlayActionButtons } from "./OverlayActionButtons";
import { OverlayContentImage, overlayHasImage } from "./OverlayContentImage";

interface OverlayModalProps {
  overlay: Overlay;
  onDismiss: () => void;
}

export function OverlayModal({ overlay, onDismiss }: OverlayModalProps) {
  const { content } = overlay;
  const dismissible = isOverlayDismissible(overlay);
  const autoRedirect = overlayUsesAutoRedirect(content);

  const resolvedUrl = useMemo(() => {
    if (typeof window === "undefined") return null;
    return resolveOverlayRedirectUrl(
      content,
      window.location.pathname,
      window.location.search,
    );
  }, [content]);

  const buttons = useMemo(() => {
    if (!autoRedirect || !resolvedUrl) return content.buttons;
    const labeled = (content.buttons ?? []).filter((b) => b.label?.trim());
    if (labeled.length === 0) {
      return [{ label: "Continue", variant: "default" as const, href: resolvedUrl }];
    }
    return labeled.map((b) =>
      b.href?.trim() ? { ...b, href: resolvedUrl } : { ...b, href: resolvedUrl },
    );
  }, [autoRedirect, content.buttons, resolvedUrl]);

  function handleDismiss() {
    markOverlaySeen(overlay);
    onDismiss();
  }

  useEffect(() => {
    if (!autoRedirect || !resolvedUrl) return;
    const ms = content.auto_redirect_after_ms ?? 1500;
    const t = setTimeout(() => {
      markOverlaySeen(overlay);
      window.location.assign(resolvedUrl);
    }, ms);
    return () => clearTimeout(t);
  }, [autoRedirect, resolvedUrl, content.auto_redirect_after_ms, overlay]);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && dismissible) handleDismiss();
      }}
    >
      <DialogContent
        className="sm:max-w-md"
        hideClose={!dismissible}
        onPointerDownOutside={dismissible ? undefined : (e) => e.preventDefault()}
        onEscapeKeyDown={dismissible ? undefined : (e) => e.preventDefault()}
        onInteractOutside={dismissible ? undefined : (e) => e.preventDefault()}
      >
        {overlayHasImage(content) && (
          <div className="rounded-md overflow-hidden mb-2">
            <OverlayContentImage content={content} className="w-full object-cover max-h-48" />
          </div>
        )}
        <DialogHeader>
          <DialogTitle>{content.title}</DialogTitle>
          {content.body && (
            <DialogDescription>{content.body}</DialogDescription>
          )}
        </DialogHeader>
        <OverlayActionButtons
          buttons={buttons}
          onDismiss={handleDismiss}
          size="sm"
          className="justify-end pt-2"
        />
      </DialogContent>
    </Dialog>
  );
}
