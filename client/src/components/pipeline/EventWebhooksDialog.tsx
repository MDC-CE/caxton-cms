import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconLoader2,
  IconPencil,
  IconPlus,
  IconRefresh,
  IconSend,
  IconTrash,
  IconWebhook,
} from "@tabler/icons-react";
import { apiFetch, apiRequestWithAuth } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ToggleButtonBar,
  ToggleButtonBarTrigger,
} from "@/components/ui/toggle-button-bar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

export type EventWebhookHook = {
  id: string;
  enabled: boolean;
  url: string;
  method?: "POST";
  events_per_call: number;
  headers?: Record<string, string>;
};

export type EventWebhookConfig = {
  version: 1;
  subscriptions: Record<string, EventWebhookHook[]>;
};

type DeliveryRow = {
  id: number;
  event_type: string;
  hook_id: string;
  event_ids: number[];
  url_host: string;
  status: "success" | "failure";
  http_status: number | null;
  error: string | null;
  duration_ms: number | null;
  batch_size: number;
  source: "live" | "test" | "retry";
  created_at: number;
};

type WebhookSummary = {
  config: EventWebhookConfig;
  pending: Record<string, number>;
  allowlist: string[];
  enabled_hook_count: number;
  last_delivery: DeliveryRow | null;
  file?: string;
};

function bufferKey(eventType: string, hookId: string) {
  return `${eventType}::${hookId}`;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url || "—";
  }
}

function emptyHook(id: string): EventWebhookHook {
  return { id, enabled: false, url: "", events_per_call: 1 };
}

/** Live-type slug: spaces → hyphens; lowercase a-z0-9_-, max 64. */
function slugifyHookId(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "")
    .replace(/-+/g, "-")
    .slice(0, 64);
}

function headersToText(headers?: Record<string, string>): string {
  if (!headers) return "";
  return Object.entries(headers)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
}

function parseHeadersText(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    const k = line.slice(0, idx).trim();
    const v = line.slice(idx + 1).trim();
    if (k && v) out[k] = v;
  }
  return out;
}

type PendingDrop = {
  kind: "save" | "delete";
  count: number;
  apply: () => Promise<void>;
};

/** Full settings body for /private/webhooks (no dialog chrome). */
export function EventWebhooksPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [advanced, setAdvanced] = useState(false);
  const [editing, setEditing] = useState<{
    eventType: string;
    hook: EventWebhookHook;
    headersText: string;
    isNew: boolean;
  } | null>(null);
  const [selectedFailures, setSelectedFailures] = useState<Set<number>>(new Set());
  const [dropConfirm, setDropConfirm] = useState<PendingDrop | null>(null);

  const summaryQuery = useQuery({
    queryKey: ["/api/admin/event-webhooks"],
    queryFn: async () => {
      const res = await apiFetch("/api/admin/event-webhooks");
      if (!res.ok) throw new Error("Failed to load event webhooks");
      return res.json() as Promise<WebhookSummary>;
    },
  });

  const deliveriesQuery = useQuery({
    queryKey: ["/api/admin/event-webhooks/deliveries"],
    queryFn: async () => {
      const res = await apiFetch("/api/admin/event-webhooks/deliveries?hours=48");
      if (!res.ok) throw new Error("Failed to load deliveries");
      return res.json() as Promise<{ deliveries: DeliveryRow[] }>;
    },
    refetchInterval: () => (document.hidden ? false : 15_000),
  });

  const allowlist = summaryQuery.data?.allowlist ?? [];
  const config = summaryQuery.data?.config ?? { version: 1 as const, subscriptions: {} };
  const pending = summaryQuery.data?.pending ?? {};
  const eventTypes = useMemo(() => [...allowlist], [allowlist]);

  const saveMutation = useMutation({
    mutationFn: async (next: EventWebhookConfig) => {
      const res = await apiRequestWithAuth("PUT", "/api/admin/event-webhooks", { config: next });
      return res.json() as Promise<WebhookSummary & { dropped_pending_count?: number }>;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/admin/event-webhooks"], data);
      void queryClient.invalidateQueries({ queryKey: ["/api/admin/event-webhooks"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/admin/event-webhooks/deliveries"] });
      toast({
        title: "Webhooks saved",
        description:
          (data.dropped_pending_count ?? 0) > 0
            ? `Dropped ${data.dropped_pending_count} waiting event(s).`
            : "Config written to event-webhooks.yml (content sync).",
      });
      setEditing(null);
    },
    onError: (err: Error) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ eventType, hookId }: { eventType: string; hookId: string }) => {
      const res = await apiRequestWithAuth(
        "DELETE",
        `/api/admin/event-webhooks/${encodeURIComponent(eventType)}/${encodeURIComponent(hookId)}`,
      );
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/admin/event-webhooks"] });
      toast({ title: "Hook removed" });
    },
    onError: (err: Error) => {
      toast({ title: "Remove failed", description: err.message, variant: "destructive" });
    },
  });

  const testMutation = useMutation({
    mutationFn: async ({ eventType, hookId }: { eventType: string; hookId: string }) => {
      const res = await apiRequestWithAuth(
        "POST",
        `/api/admin/event-webhooks/${encodeURIComponent(eventType)}/${encodeURIComponent(hookId)}/test`,
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Test failed");
      return body;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/admin/event-webhooks/deliveries"] });
      toast({ title: "Test sent", description: "Logged as Test in the 48h history." });
    },
    onError: (err: Error) => {
      void queryClient.invalidateQueries({ queryKey: ["/api/admin/event-webhooks/deliveries"] });
      toast({ title: "Test failed", description: err.message, variant: "destructive" });
    },
  });

  const retryMutation = useMutation({
    mutationFn: async (deliveryIds: number[]) => {
      const res = await apiRequestWithAuth("POST", "/api/admin/event-webhooks/deliveries/retry", {
        deliveryIds,
      });
      return res.json() as Promise<{ retried: number; skipped: number }>;
    },
    onSuccess: (data) => {
      setSelectedFailures(new Set());
      void queryClient.invalidateQueries({ queryKey: ["/api/admin/event-webhooks/deliveries"] });
      toast({
        title: "Retry queued",
        description: `Retried ${data.retried}, skipped ${data.skipped}.`,
      });
    },
    onError: (err: Error) => {
      toast({ title: "Retry failed", description: err.message, variant: "destructive" });
    },
  });

  const buildNextConfig = (
    eventType: string,
    hook: EventWebhookHook,
    isNew: boolean,
  ): EventWebhookConfig => {
    const subscriptions: Record<string, EventWebhookHook[]> = { ...config.subscriptions };
    const list = [...(subscriptions[eventType] ?? [])];
    const idx = list.findIndex((h) => h.id === hook.id);
    if (isNew && idx >= 0) {
      throw new Error(`Hook id "${hook.id}" already exists for ${eventType}`);
    }
    if (idx >= 0) list[idx] = hook;
    else list.push(hook);
    subscriptions[eventType] = list;
    return { version: 1, subscriptions };
  };

  const pendingForEdit = editing
    ? pending[bufferKey(editing.eventType, editing.hook.id)] ?? 0
    : 0;

  const previousHook =
    editing && !editing.isNew
      ? (config.subscriptions[editing.eventType] ?? []).find((h) => h.id === editing.hook.id)
      : null;

  const willDropOnSave =
    !!editing &&
    !editing.isNew &&
    !!previousHook &&
    pendingForEdit > 0 &&
    (editing.hook.url.trim() !== (previousHook.url || "") ||
      editing.hook.enabled === false ||
      (previousHook.enabled && !editing.hook.enabled));

  const requestSave = () => {
    if (!editing) return;
    const hook: EventWebhookHook = {
      ...editing.hook,
      id: slugifyHookId(editing.hook.id).replace(/^-+|-+$/g, ""),
      url: editing.hook.url.trim(),
      events_per_call: Math.min(
        50,
        Math.max(1, Math.floor(Number(editing.hook.events_per_call) || 1)),
      ),
      headers: parseHeadersText(editing.headersText),
    };
    if (!hook.id) {
      toast({ title: "Hook id required", variant: "destructive" });
      return;
    }
    if (hook.enabled && !hook.url) {
      toast({ title: "URL required when enabled", variant: "destructive" });
      return;
    }
    let next: EventWebhookConfig;
    try {
      next = buildNextConfig(editing.eventType, hook, editing.isNew);
    } catch (err) {
      toast({
        title: "Invalid hook",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
      return;
    }
    const apply = async () => {
      await saveMutation.mutateAsync(next);
    };
    if (willDropOnSave) {
      setDropConfirm({ kind: "save", count: pendingForEdit, apply });
      return;
    }
    void apply();
  };

  const requestDelete = (eventType: string, hook: EventWebhookHook) => {
    const count = pending[bufferKey(eventType, hook.id)] ?? 0;
    const apply = async () => {
      await deleteMutation.mutateAsync({ eventType, hookId: hook.id });
      setEditing(null);
    };
    if (count > 0) {
      setDropConfirm({ kind: "delete", count, apply });
      return;
    }
    void apply();
  };

  const requestToggleEnabled = (
    eventType: string,
    hook: EventWebhookHook,
    enabled: boolean,
  ) => {
    if (hook.enabled === enabled) return;
    if (enabled && !hook.url.trim()) {
      toast({
        title: "URL required",
        description: "Add a URL before turning this hook on.",
        variant: "destructive",
      });
      return;
    }
    const nextHook = { ...hook, enabled };
    const next = buildNextConfig(eventType, nextHook, false);
    const waiting = pending[bufferKey(eventType, hook.id)] ?? 0;
    const apply = async () => {
      await saveMutation.mutateAsync(next);
    };
    if (!enabled && waiting > 0) {
      setDropConfirm({ kind: "save", count: waiting, apply });
      return;
    }
    void apply();
  };

  const deliveries = deliveriesQuery.data?.deliveries ?? [];
  const failureIds = deliveries.filter((d) => d.status === "failure").map((d) => d.id);

  return (
    <>
      <div className="space-y-6" data-testid="panel-event-webhooks">
        <Collapsible open={advanced} onOpenChange={setAdvanced}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="h-auto px-0 text-xs text-muted-foreground">
              {advanced ? "Hide advanced" : "Read more (advanced)"}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="text-xs text-muted-foreground space-y-1 pt-1">
            <p>
              File: <code className="font-mono">event-webhooks.yml</code>. Allowlisted proposal event
              types only. Key <code className="font-mono">events_per_call</code>. Slim JSON payload;
              optional code enrichers. Buffers and delivery rows live in site SQLite. Production
              proposal import does not notify.
            </p>
          </CollapsibleContent>
        </Collapsible>

        {summaryQuery.isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
            <IconLoader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-sm text-muted-foreground">
                {summaryQuery.data?.enabled_hook_count ?? 0} enabled hook
                {(summaryQuery.data?.enabled_hook_count ?? 0) === 1 ? "" : "s"}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  void summaryQuery.refetch();
                  void deliveriesQuery.refetch();
                }}
              >
                <IconRefresh className="h-3.5 w-3.5 mr-1.5" />
                Refresh
              </Button>
            </div>

            <div className="space-y-4">
              {eventTypes.map((eventType) => {
                const hooks = config.subscriptions[eventType] ?? [];
                return (
                  <div key={eventType} className="rounded-md border border-border p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <code className="text-xs font-mono">{eventType}</code>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setEditing({
                            eventType,
                            hook: emptyHook(`hook-${hooks.length + 1}`),
                            headersText: "",
                            isNew: true,
                          })
                        }
                        data-testid={`button-add-hook-${eventType}`}
                      >
                        <IconPlus className="h-3.5 w-3.5 mr-1" />
                        Add hook
                      </Button>
                    </div>
                    {hooks.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No hooks</p>
                    ) : (
                      <ul className="space-y-2">
                        {hooks.map((hook) => {
                          const waiting = pending[bufferKey(eventType, hook.id)] ?? 0;
                          return (
                            <li
                              key={hook.id}
                              className="flex flex-wrap items-center gap-2 justify-between rounded-md bg-muted/40 px-2 py-2"
                            >
                              <div className="min-w-0 space-y-0.5">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-medium">{hook.id}</span>
                                  <ToggleButtonBar
                                    value={hook.enabled ? "on" : "off"}
                                    onValueChange={(v) => {
                                      if (v !== "on" && v !== "off") return;
                                      requestToggleEnabled(eventType, hook, v === "on");
                                    }}
                                    className="shrink-0"
                                    listClassName="h-7"
                                    listTestId={`toggle-hook-enabled-${eventType}-${hook.id}`}
                                  >
                                    <ToggleButtonBarTrigger
                                      value="on"
                                      className="px-2 py-0.5"
                                      disabled={saveMutation.isPending}
                                    >
                                      On
                                    </ToggleButtonBarTrigger>
                                    <ToggleButtonBarTrigger
                                      value="off"
                                      className="px-2 py-0.5"
                                      disabled={saveMutation.isPending}
                                    >
                                      Off
                                    </ToggleButtonBarTrigger>
                                  </ToggleButtonBar>
                                  <span className="text-xs text-muted-foreground">
                                    every {hook.events_per_call}
                                  </span>
                                  {waiting > 0 ? (
                                    <span className="text-xs text-amber-500">{waiting} waiting</span>
                                  ) : null}
                                </div>
                                <p className="text-xs text-muted-foreground truncate max-w-md">
                                  {hook.url ? hostOf(hook.url) : "No URL"}
                                </p>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  disabled={!hook.url || testMutation.isPending}
                                  onClick={() =>
                                    testMutation.mutate({ eventType, hookId: hook.id })
                                  }
                                >
                                  <IconSend className="h-3.5 w-3.5 mr-1" />
                                  Test
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  aria-label="Edit hook"
                                  onClick={() =>
                                    setEditing({
                                      eventType,
                                      hook: { ...hook },
                                      headersText: headersToText(hook.headers),
                                      isNew: false,
                                    })
                                  }
                                >
                                  <IconPencil className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-medium">Delivery log (48 hours)</h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={selectedFailures.size === 0 || retryMutation.isPending}
                  onClick={() => retryMutation.mutate([...selectedFailures])}
                  data-testid="button-retry-selected-webhooks"
                >
                  Retry selected ({selectedFailures.size})
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Retry / Retry selected work on failures only. Older than 48 hours is dropped.
              </p>
              {deliveriesQuery.isLoading ? (
                <p className="text-xs text-muted-foreground">Loading deliveries…</p>
              ) : deliveries.length === 0 ? (
                <p
                  className="text-xs text-muted-foreground"
                  data-testid="text-webhook-deliveries-empty"
                >
                  No webhook calls in the last 48 hours.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-md border border-border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 text-left">
                      <tr>
                        <th className="p-2 w-8">
                          <Checkbox
                            checked={
                              failureIds.length > 0 &&
                              failureIds.every((id) => selectedFailures.has(id))
                            }
                            onCheckedChange={(checked) => {
                              if (checked) setSelectedFailures(new Set(failureIds));
                              else setSelectedFailures(new Set());
                            }}
                            aria-label="Select all failures"
                          />
                        </th>
                        <th className="p-2">Time</th>
                        <th className="p-2">Type</th>
                        <th className="p-2">Hook</th>
                        <th className="p-2">Status</th>
                        <th className="p-2">Source</th>
                        <th className="p-2">Host</th>
                        <th className="p-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {deliveries.map((d) => {
                        const isFailure = d.status === "failure";
                        return (
                          <tr key={d.id} className="border-t border-border">
                            <td className="p-2">
                              {isFailure ? (
                                <Checkbox
                                  checked={selectedFailures.has(d.id)}
                                  onCheckedChange={(checked) => {
                                    setSelectedFailures((prev) => {
                                      const next = new Set(prev);
                                      if (checked) next.add(d.id);
                                      else next.delete(d.id);
                                      return next;
                                    });
                                  }}
                                  aria-label={`Select delivery ${d.id}`}
                                />
                              ) : null}
                            </td>
                            <td className="p-2 whitespace-nowrap">
                              {new Date(d.created_at).toLocaleString()}
                            </td>
                            <td className="p-2 font-mono">{d.event_type}</td>
                            <td className="p-2">{d.hook_id}</td>
                            <td className="p-2">
                              <span
                                className={cn(
                                  d.status === "success"
                                    ? "text-status-online"
                                    : "text-destructive",
                                )}
                              >
                                {d.status}
                                {d.http_status != null ? ` ${d.http_status}` : ""}
                              </span>
                              {d.error ? (
                                <p
                                  className="text-muted-foreground max-w-[12rem] truncate"
                                  title={d.error}
                                >
                                  {d.error}
                                </p>
                              ) : null}
                            </td>
                            <td className="p-2">{d.source}</td>
                            <td className="p-2 truncate max-w-[8rem]">{d.url_host || "—"}</td>
                            <td className="p-2">
                              {isFailure ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2"
                                  disabled={retryMutation.isPending}
                                  onClick={() => retryMutation.mutate([d.id])}
                                >
                                  Retry
                                </Button>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <Dialog
        open={!!editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent
          className="sm:max-w-lg bg-background text-foreground"
          data-testid="form-event-webhook-edit"
        >
          {editing ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {editing.isNew ? "New hook" : "Edit hook"}
                </DialogTitle>
                <DialogDescription>
                  Configure notify URL and throttle for{" "}
                  <code className="font-mono text-xs">{editing.eventType}</code>.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-1">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="hook-id">Id</Label>
                    <Input
                      id="hook-id"
                      value={editing.hook.id}
                      disabled={!editing.isNew}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          hook: { ...editing.hook, id: slugifyHookId(e.target.value) },
                        })
                      }
                      placeholder="my-hook"
                      data-testid="input-hook-id"
                    />
                    <p className="text-xs text-muted-foreground">
                      Lowercase letters, numbers, hyphens, or underscores. Spaces become hyphens.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="hook-every">Every N events (max 50)</Label>
                    <Input
                      id="hook-every"
                      type="number"
                      min={1}
                      max={50}
                      value={editing.hook.events_per_call}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          hook: {
                            ...editing.hook,
                            events_per_call: Number(e.target.value) || 1,
                          },
                        })
                      }
                      data-testid="input-hook-events-per-call"
                    />
                    <p className="text-xs text-muted-foreground">
                      Wait until this many events pile up, then send them together in one call. Use 1
                      to notify on every event.
                    </p>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="hook-url">URL</Label>
                  <Input
                    id="hook-url"
                    value={editing.hook.url}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        hook: { ...editing.hook, url: e.target.value },
                      })
                    }
                    placeholder="https://"
                    data-testid="input-hook-url"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={editing.hook.enabled}
                    onCheckedChange={(enabled) =>
                      setEditing({
                        ...editing,
                        hook: { ...editing.hook, enabled },
                      })
                    }
                    data-testid="switch-hook-enabled"
                  />
                  <Label>Enabled</Label>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="hook-headers">Headers (optional)</Label>
                  <textarea
                    id="hook-headers"
                    className="w-full min-h-[72px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={editing.headersText}
                    onChange={(e) => setEditing({ ...editing, headersText: e.target.value })}
                    placeholder={"Authorization: Bearer …\nX-Custom: value"}
                  />
                  <p className="text-xs text-muted-foreground">
                    One header per line as <code className="font-mono">Name: value</code>. Use for
                    API keys or auth your endpoint expects. Leave blank if none.
                  </p>
                </div>
                {willDropOnSave ? (
                  <p className="text-xs text-amber-500">
                    Saving will drop {pendingForEdit} waiting event(s) for this hook. They will not
                    be sent.
                  </p>
                ) : null}
              </div>
              <DialogFooter className="flex-wrap gap-2 sm:justify-between">
                {!editing.isNew ? (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => requestDelete(editing.eventType, editing.hook)}
                    disabled={deleteMutation.isPending}
                    className="sm:mr-auto"
                  >
                    <IconTrash className="h-3.5 w-3.5 mr-1.5" />
                    Remove
                  </Button>
                ) : (
                  <span />
                )}
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={requestSave}
                    disabled={saveMutation.isPending}
                    data-testid="button-save-hook"
                  >
                    {saveMutation.isPending ? (
                      <IconLoader2 className="h-4 w-4 animate-spin mr-1.5" />
                    ) : null}
                    Save
                  </Button>
                </div>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!dropConfirm} onOpenChange={(o) => !o && setDropConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Drop waiting events?</AlertDialogTitle>
            <AlertDialogDescription>
              Turning this off or changing the URL will drop {dropConfirm?.count ?? 0} waiting
              event(s). They will not be sent.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const apply = dropConfirm?.apply;
                setDropConfirm(null);
                void apply?.();
              }}
            >
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** Compact KPI for proposals list — navigates to /private/webhooks. */
export function EventWebhooksKpiButton({
  onClick,
  className,
}: {
  onClick: () => void;
  className?: string;
}) {
  const { data } = useQuery({
    queryKey: ["/api/admin/event-webhooks"],
    queryFn: async () => {
      const res = await apiFetch("/api/admin/event-webhooks");
      if (!res.ok) throw new Error("Failed to load");
      return res.json() as Promise<WebhookSummary>;
    },
    staleTime: 30_000,
  });
  const on = (data?.enabled_hook_count ?? 0) > 0;
  const last = data?.last_delivery;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-md border border-border bg-card p-3 text-left hover-elevate transition-colors",
        className,
      )}
      data-testid="kpi-event-webhooks"
    >
      <div className="flex items-center gap-2">
        <IconWebhook className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium">Webhooks</span>
        <Badge variant={on ? "default" : "secondary"} className="ml-auto">
          {on ? "On" : "Off"}
        </Badge>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {on
          ? `${data?.enabled_hook_count} hook${data?.enabled_hook_count === 1 ? "" : "s"}`
          : "Configure notify URLs"}
        {last ? ` · last ${last.status}${last.source === "test" ? " (test)" : ""}` : ""}
      </p>
    </button>
  );
}
