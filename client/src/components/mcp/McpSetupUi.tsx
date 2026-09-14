import { useState, type ReactNode } from "react";
import { IconCheck, IconChevronDown, IconChevronRight, IconCopy } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export function McpCopyButton({
  text,
  testId = "button-copy-snippet",
}: {
  text: string;
  testId?: string;
}) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  function handleCopy() {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      toast({ title: "Copied to clipboard" });
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <Button
      size="icon"
      variant="ghost"
      onClick={handleCopy}
      data-testid={testId}
      className="shrink-0"
    >
      {copied ? <IconCheck className="w-4 h-4" /> : <IconCopy className="w-4 h-4" />}
    </Button>
  );
}

export function McpCodeBlock({ code, testId }: { code: string; testId?: string }) {
  return (
    <div className="relative">
      <pre
        className="text-xs font-mono bg-muted px-4 py-3 rounded-md overflow-x-auto text-foreground leading-relaxed whitespace-pre-wrap break-all"
        data-testid={testId}
      >
        {code}
      </pre>
      <div className="absolute top-2 right-2">
        <McpCopyButton text={code} />
      </div>
    </div>
  );
}

export function McpSetupSteps({ children }: { children: ReactNode }) {
  return <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">{children}</ol>;
}

export type McpConnectorUrlRow = {
  roleId: string;
  label: string;
  /** Null when cloud URL cannot be resolved (e.g. missing SITE_URL on localhost). */
  url: string | null;
  /** Optional per-row config (JSON or CLI) shown when expanded. */
  configSnippet?: string;
};

/**
 * Minimal connection URL list. Expand a row to see that connector's config JSON/CLI.
 */
export function McpConnectorUrlList({
  connectors,
  expandLabel = "Show config",
  collapseLabel = "Hide config",
  testId = "list-mcp-connector-urls",
  emptyFallback = "Set SITE_URL to your public site origin",
}: {
  connectors: McpConnectorUrlRow[];
  expandLabel?: string;
  collapseLabel?: string;
  testId?: string;
  emptyFallback?: string;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <ul
      className="rounded-md border border-card-border divide-y divide-border overflow-hidden"
      data-testid={testId}
    >
      {connectors.map((c) => {
        const open = openId === c.roleId;
        const hasSnippet = Boolean(c.configSnippet);
        return (
          <li key={c.roleId} data-testid={`${testId}-row-${c.roleId}`}>
            <div className="flex items-center gap-2 px-3 py-2">
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="text-xs font-medium text-foreground truncate">{c.label}</p>
                <code className="block text-[11px] font-mono text-muted-foreground overflow-x-auto whitespace-nowrap">
                  {c.url ?? emptyFallback}
                </code>
              </div>
              {c.url ? (
                <McpCopyButton text={c.url} testId={`${testId}-copy-${c.roleId}`} />
              ) : null}
              {hasSnippet ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="shrink-0 h-8 gap-1 text-xs text-muted-foreground"
                  onClick={() => setOpenId(open ? null : c.roleId)}
                  data-testid={`${testId}-expand-${c.roleId}`}
                  aria-expanded={open}
                >
                  {open ? (
                    <IconChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <IconChevronRight className="h-3.5 w-3.5" />
                  )}
                  {open ? collapseLabel : expandLabel}
                </Button>
              ) : null}
            </div>
            {hasSnippet && open && c.configSnippet ? (
              <div className="px-3 pb-3">
                <McpCodeBlock
                  code={c.configSnippet}
                  testId={`${testId}-config-${c.roleId}`}
                />
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/** Combined multi-server JSON/CLI behind a single expand control. */
export function McpExpandableConfig({
  code,
  label = "Show full config JSON",
  hideLabel = "Hide config JSON",
  testId = "mcp-expandable-config",
}: {
  code: string;
  label?: string;
  hideLabel?: string;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn("gap-1.5 text-xs text-muted-foreground px-0")}
          data-testid={`${testId}-trigger`}
        >
          {open ? (
            <IconChevronDown className="h-3.5 w-3.5" />
          ) : (
            <IconChevronRight className="h-3.5 w-3.5" />
          )}
          {open ? hideLabel : label}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2">
        <McpCodeBlock code={code} testId={testId} />
      </CollapsibleContent>
    </Collapsible>
  );
}
