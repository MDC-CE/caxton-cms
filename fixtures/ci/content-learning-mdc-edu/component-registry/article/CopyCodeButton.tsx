import { useState, useCallback, useRef, useEffect } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

interface CopyCodeButtonProps {
  /** Raw text to copy (code without HTML). */
  getText: () => string;
  className?: string;
}

/**
 * Tiny client island for fenced code blocks. Icon-only; visibility is
 * controlled by `.article-prose` CSS (hover on fine pointers, always on touch).
 */
export function CopyCodeButton({ getText, className }: CopyCodeButtonProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const onCopy = useCallback(async () => {
    const text = getText();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "absolute";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 2000);
  }, [getText]);

  return (
    <button
      type="button"
      onClick={onCopy}
      className={cn(
        "article-copy-code-btn inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-background/80 text-muted-foreground shadow-sm backdrop-blur-sm transition-opacity hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      aria-label={copied ? "Copied" : "Copy code"}
      data-testid="copy-code-button"
    >
      <span className="sr-only" aria-live="polite">
        {copied ? "Copied" : ""}
      </span>
      {copied ? (
        <Check className="h-3.5 w-3.5" aria-hidden />
      ) : (
        <Copy className="h-3.5 w-3.5" aria-hidden />
      )}
    </button>
  );
}
