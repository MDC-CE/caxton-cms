import {
  IconCheck,
  IconCode,
  IconCopy,
  IconLoader,
  IconPencil,
  IconPlayerPlay,
  IconWebhook,
  IconX,
} from "@tabler/icons-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type WebhookSource = "section" | "event" | "global" | "none";

export interface WebhookCardProps {
  url: string;
  method: "POST" | "GET";
  authHeader: string;
  /** When true, delivery uses the visitor login token and success redirects append ?token= */
  useVisitorToken?: boolean;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  onChange: (
    field: "url" | "method" | "authHeader" | "useVisitorToken",
    value: string | boolean,
  ) => void;
  hint?: string;
  testIdPrefix?: string;
  source?: WebhookSource;
  inheritedUrl?: string;
  onTest?: () => Promise<{ ok: boolean; status?: number; error?: string }>;
  samplePayload?: Record<string, unknown>;
}

const SOURCE_LABELS: Record<WebhookSource, string> = {
  section: "Section override",
  event: "Event default",
  global: "Global webhook",
  none: "Not configured",
};

function JsonHighlight({ value }: { value: unknown }) {
  const lines = JSON.stringify(value, null, 2).split("\n");
  return (
    <pre className="text-xs font-mono leading-relaxed whitespace-pre">
      {lines.map((line, i) => {
        // Key line:  "key": value
        const keyValueMatch = line.match(
          /^(\s*)("(?:[^"\\]|\\.)*")(\s*:\s*)(.*)$/
        );
        if (keyValueMatch) {
          const [, indent, key, colon, rest] = keyValueMatch;
          return (
            <div key={i}>
              <span>{indent}</span>
              <span className="text-primary opacity-80">{key}</span>
              <span className="text-muted-foreground">{colon}</span>
              <JsonValue raw={rest} />
            </div>
          );
        }
        // Plain value line (array items, brackets, etc.)
        return (
          <div key={i}>
            <JsonValue raw={line} />
          </div>
        );
      })}
    </pre>
  );
}

function JsonValue({ raw }: { raw: string }) {
  const trimmed = raw.trimEnd();
  const trailing = raw.slice(trimmed.length);
  // string
  if (/^"/.test(trimmed.replace(/,$/, "").trim())) {
    return (
      <span>
        <span className="text-foreground">{trimmed}</span>
        <span className="text-muted-foreground">{trailing}</span>
      </span>
    );
  }
  // number
  if (/^-?\d/.test(trimmed.replace(/,$/, "").trim())) {
    return (
      <span>
        <span className="text-foreground font-medium">{trimmed}</span>
        <span className="text-muted-foreground">{trailing}</span>
      </span>
    );
  }
  // boolean / null
  if (/^(true|false|null)/.test(trimmed.replace(/,$/, "").trim())) {
    return (
      <span>
        <span className="text-muted-foreground font-medium">{trimmed}</span>
        <span>{trailing}</span>
      </span>
    );
  }
  return <span className="text-muted-foreground">{raw}</span>;
}

export function WebhookCard({
  url,
  method,
  authHeader,
  useVisitorToken = false,
  editing,
  onEditingChange,
  onChange,
  hint = "Overrides the global webhook for this event only. Leave URL blank to use the global webhook.",
  testIdPrefix = "event-webhook",
  source,
  inheritedUrl,
  onTest,
  samplePayload,
}: WebhookCardProps) {
  const [copied, setCopied] = useState(false);
  const [testState, setTestState] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [testError, setTestError] = useState<string>("");
  const [payloadOpen, setPayloadOpen] = useState(false);

  const effectiveUrl = url || inheritedUrl || "";

  function copyUrl(value: string) {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  async function handleTest() {
    if (!onTest || testState === "loading") return;
    setTestState("loading");
    setTestError("");
    try {
      const result = await onTest();
      setTestState(result.ok ? "ok" : "error");
      if (!result.ok) setTestError(result.error ?? `Status ${result.status}`);
    } catch (e) {
      setTestState("error");
      setTestError(String(e));
    } finally {
      setTimeout(() => setTestState("idle"), 2500);
    }
  }

  return (
    <>
      <div
        className="rounded-md border bg-muted/20 p-3 space-y-3 overflow-hidden w-full min-w-0"
        data-testid={`card-${testIdPrefix}`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <IconWebhook className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <span className="text-sm font-medium">Webhook</span>
            {source !== undefined && (
              <Badge
                variant={
                  source === "section"
                    ? "default"
                    : source === "none"
                    ? "outline"
                    : "secondary"
                }
                className="text-[11px] px-1.5 py-0 leading-4 font-normal"
                data-testid={`badge-${testIdPrefix}-source`}
              >
                {SOURCE_LABELS[source]}
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-0.5 flex-shrink-0">
            {samplePayload && !editing && (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                onClick={() => setPayloadOpen(true)}
                data-testid={`button-${testIdPrefix}-payload`}
                title="View sample payload"
              >
                <IconCode className="h-3.5 w-3.5" />
              </Button>
            )}

            {onTest && effectiveUrl && !editing && (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                onClick={handleTest}
                disabled={testState === "loading"}
                data-testid={`button-${testIdPrefix}-test`}
                title="Send test request"
              >
                {testState === "loading" ? (
                  <IconLoader className="h-3.5 w-3.5 animate-spin" />
                ) : testState === "ok" ? (
                  <IconCheck className="h-3.5 w-3.5 text-green-600" />
                ) : testState === "error" ? (
                  <IconX className="h-3.5 w-3.5 text-destructive" />
                ) : (
                  <IconPlayerPlay className="h-3.5 w-3.5" />
                )}
              </Button>
            )}

            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={() => onEditingChange(!editing)}
              data-testid={`button-edit-${testIdPrefix}`}
            >
              {editing ? (
                <IconX className="h-3.5 w-3.5" />
              ) : (
                <IconPencil className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </div>

        {testState === "error" && testError && (
          <p className="text-[11px] text-destructive">{testError}</p>
        )}

        {editing ? (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">{hint}</p>
            <div className="space-y-1.5">
              <Label htmlFor={`${testIdPrefix}-url`} className="text-xs text-muted-foreground">
                URL{" "}
                <span className="font-normal">(optional if using visitor token only)</span>
              </Label>
              <Input
                id={`${testIdPrefix}-url`}
                type="text"
                placeholder="https://…/event/{{ entry.id }}/checkin"
                value={url}
                onChange={(e) => onChange("url", e.target.value)}
                data-testid={`input-${testIdPrefix}-url`}
                className="text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${testIdPrefix}-method`} className="text-xs text-muted-foreground">
                Method
              </Label>
              <Select
                value={method}
                onValueChange={(val) => onChange("method", val)}
              >
                <SelectTrigger
                  id={`${testIdPrefix}-method`}
                  data-testid={`select-${testIdPrefix}-method`}
                  className="text-xs"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="POST">POST</SelectItem>
                  <SelectItem value="GET">GET</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-start gap-2 rounded-md border bg-background/60 p-2.5">
              <input
                id={`${testIdPrefix}-visitor-token`}
                type="checkbox"
                className="mt-0.5 h-3.5 w-3.5 accent-primary"
                checked={useVisitorToken}
                onChange={(e) => onChange("useVisitorToken", e.target.checked)}
                data-testid={`checkbox-${testIdPrefix}-visitor-token`}
              />
              <div className="min-w-0 space-y-0.5">
                <Label
                  htmlFor={`${testIdPrefix}-visitor-token`}
                  className="text-xs font-medium cursor-pointer"
                >
                  Use visitor login token
                </Label>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  After signup or login, call this URL as that user (Authorization header).
                  If the form redirects on success, also add their token to the success URL query.
                </p>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${testIdPrefix}-auth`} className="text-xs text-muted-foreground">
                Authorization header{" "}
                <span className="font-normal">(optional; ignored when visitor token is on)</span>
              </Label>
              <Input
                id={`${testIdPrefix}-auth`}
                type="password"
                placeholder="Bearer sk-..."
                value={authHeader}
                onChange={(e) => onChange("authHeader", e.target.value)}
                data-testid={`input-${testIdPrefix}-auth`}
                autoComplete="off"
                className="text-xs"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-1.5">
            {useVisitorToken && (
              <Badge
                variant="secondary"
                className="text-[11px] px-1.5 py-0 leading-4 font-normal"
                data-testid={`badge-${testIdPrefix}-visitor-token`}
              >
                Visitor token
              </Badge>
            )}
            <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
              {url ? (
                <div className="flex items-center gap-1.5 w-full">
                  <Badge
                    variant="secondary"
                    className="text-[11px] px-1.5 py-0 leading-4 font-normal shrink-0"
                  >
                    {method}
                  </Badge>
                  <div className="relative flex-1 min-w-0 group">
                    <input
                      readOnly
                      value={url}
                      onClick={() => copyUrl(url)}
                      className="w-full font-mono text-xs text-foreground bg-transparent border-0 outline-none cursor-pointer select-all px-0 py-0"
                      data-testid={`input-${testIdPrefix}-url-display`}
                      title="Click to copy"
                    />
                    <span className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none">
                      {copied
                        ? <IconCheck className="h-3 w-3 text-green-600" />
                        : <IconCopy className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      }
                    </span>
                  </div>
                </div>
              ) : source === "event" || source === "global" ? (
                inheritedUrl ? (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="text-xs text-muted-foreground italic underline decoration-dashed underline-offset-2 cursor-pointer hover:text-foreground transition-colors text-left"
                        data-testid={`button-${testIdPrefix}-inherited-url`}
                      >
                        not set — falls back to {source === "event" ? "event default" : "global webhook"}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent side="top" align="start" className="w-auto max-w-xs p-3 space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Inherited URL
                      </p>
                      <p className="font-mono text-xs break-all text-foreground">{inheritedUrl}</p>
                    </PopoverContent>
                  </Popover>
                ) : (
                  <span className="text-xs text-muted-foreground italic">
                    not set — falls back to {source === "event" ? "event default" : "global webhook"}
                  </span>
                )
              ) : source === "none" ? (
                <span className="text-xs text-muted-foreground italic">
                  not set — no fallback configured
                </span>
              ) : (
                inheritedUrl ? (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="text-xs text-muted-foreground italic underline decoration-dashed underline-offset-2 cursor-pointer hover:text-foreground transition-colors text-left"
                        data-testid={`button-${testIdPrefix}-inherited-url`}
                      >
                        not set — uses global webhook
                      </button>
                    </PopoverTrigger>
                    <PopoverContent side="top" align="start" className="w-auto max-w-xs p-3 space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Inherited URL
                      </p>
                      <p className="font-mono text-xs break-all text-foreground">{inheritedUrl}</p>
                    </PopoverContent>
                  </Popover>
                ) : (
                  <span className="text-xs text-muted-foreground italic">
                    not set — uses global webhook
                  </span>
                )
              )}
            </div>
            {authHeader && (
              <div className="flex items-start gap-2">
                <span className="text-xs text-muted-foreground w-20 flex-shrink-0 pt-0.5">
                  Auth
                </span>
                <span className="text-xs text-muted-foreground italic">
                  configured
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {samplePayload && (
        <Dialog open={payloadOpen} onOpenChange={setPayloadOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-sm flex items-center gap-2">
                <IconCode className="h-4 w-4 text-muted-foreground" />
                Sample payload
              </DialogTitle>
            </DialogHeader>
            <div className="rounded-md border bg-muted/40 p-4 overflow-auto max-h-[60vh]">
              <JsonHighlight value={samplePayload} />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
