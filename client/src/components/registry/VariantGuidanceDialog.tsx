import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CircleCheck, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { VariantContentShape } from "@shared/component-layout-traits";

interface VariantMetadataRow {
  description?: string;
  best_for?: string;
  avoid_when?: string;
  content_shape?: VariantContentShape;
  metadata_status?: "draft" | "approved";
  live: { count: number; pageCount: number };
}

interface VariantMetadataResponse {
  file: string;
  variants: Record<string, VariantMetadataRow>;
  drift: Array<{ variant: string; message: string }>;
}

function shapeSummary(shape: VariantContentShape | undefined): string[] {
  if (!shape) return [];
  const lines: string[] = [];
  for (const [field, r] of Object.entries(shape.items ?? {})) {
    if (r.min === undefined) continue;
    const range = r.min === r.max ? `${r.min}` : `${r.min}–${r.max}`;
    lines.push(`${field}: ${range} items${r.typical !== undefined ? ` (usually ${r.typical})` : ""}`);
  }
  for (const [field, r] of Object.entries(shape.text ?? {})) {
    if (r.max === undefined) continue;
    lines.push(`${field}: up to ${r.max} characters${r.typical !== undefined ? ` (usually ~${r.typical})` : ""}`);
  }
  if (shape.image && shape.image !== "unused") lines.push(`image: ${shape.image}`);
  if (shape.icon && shape.icon !== "unused") lines.push(`icon: ${shape.icon}`);
  return lines;
}

export function VariantGuidanceDialog({
  componentType,
  version,
  variant,
}: {
  componentType: string;
  version: string;
  variant: string;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const queryKey = ["/api/component-registry", componentType, version, "variant-metadata"];
  const { data, isLoading } = useQuery<VariantMetadataResponse>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(`/api/component-registry/${componentType}/${version}/variant-metadata`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? `HTTP ${res.status}`);
      return res.json();
    },
    enabled: open,
  });
  const row = data?.variants[variant];
  const [bestFor, setBestFor] = useState("");
  const [avoidWhen, setAvoidWhen] = useState("");

  useEffect(() => {
    setBestFor(row?.best_for ?? "");
    setAvoidWhen(row?.avoid_when ?? "");
  }, [row?.best_for, row?.avoid_when]);

  const save = useMutation({
    mutationFn: async (approve: boolean) =>
      apiRequest("PATCH", `/api/component-registry/${componentType}/${version}/variant-metadata`, {
        variant,
        best_for: bestFor,
        avoid_when: avoidWhen,
        approve,
      }),
    onSuccess: (_r, approve) => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ["/api/component-registry", componentType] });
      toast({ title: approve ? "Guidance approved" : "Guidance saved as draft" });
    },
    onError: (err: Error) => toast({ title: "Could not save guidance", description: err.message, variant: "destructive" }),
  });

  const shape = shapeSummary(row?.content_shape);
  const drift = data?.drift.filter((d) => d.variant === variant) ?? [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 px-2 text-xs" data-testid={`button-variant-guidance-${componentType}`}>
          <Compass className="w-4 h-4 mr-1" />
          Guidance
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            When to use “{variant}”
            {row?.metadata_status === "approved" ? (
              <Badge variant="secondary" className="gap-1"><CircleCheck className="w-3 h-3" />Approved</Badge>
            ) : row ? (
              <Badge variant="outline">Suggestion — needs review</Badge>
            ) : null}
          </DialogTitle>
          <DialogDescription>
            Agents read this to pick the right variant for a page. Shape is measured from live pages; the two
            descriptions are suggestions you approve.
          </DialogDescription>
        </DialogHeader>

        {isLoading || !row ? (
          <p className="text-sm text-muted-foreground">{isLoading ? "Loading…" : "No metadata for this variant yet."}</p>
        ) : (
          <div className="space-y-4 text-sm">
            <p className="text-muted-foreground">
              Used {row.live.count} times on {row.live.pageCount} pages.
            </p>
            <label className="block space-y-1">
              <span className="font-medium">Best for</span>
              <Textarea value={bestFor} onChange={(e) => setBestFor(e.target.value)} rows={2} />
            </label>
            <label className="block space-y-1">
              <span className="font-medium">Avoid when</span>
              <Textarea value={avoidWhen} onChange={(e) => setAvoidWhen(e.target.value)} rows={2} />
            </label>
            {shape.length > 0 && (
              <div className="rounded-md border border-border bg-muted/40 p-3">
                <p className="font-medium mb-1">Typical content (measured)</p>
                <ul className="list-disc pl-5 text-muted-foreground space-y-0.5">
                  {shape.map((l) => <li key={l}>{l}</li>)}
                </ul>
              </div>
            )}
            {drift.map((d) => (
              <p key={d.message} className="text-amber-600 dark:text-amber-400">{d.message}</p>
            ))}
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => save.mutate(false)} disabled={save.isPending}>
                Save as draft
              </Button>
              <Button size="sm" onClick={() => save.mutate(true)} disabled={save.isPending || !bestFor.trim()}>
                Approve
              </Button>
            </div>
            <button
              type="button"
              className="text-xs text-muted-foreground underline"
              onClick={() => setShowAdvanced((v) => !v)}
            >
              {showAdvanced ? "Hide advanced" : "Read more (advanced)"}
            </button>
            {showAdvanced && (
              <div className="text-xs text-muted-foreground space-y-1">
                <p>
                  Stored in <code>{data?.file}</code> under <code>variants.{variant}</code> (<code>best_for</code>,{" "}
                  <code>avoid_when</code>, <code>content_shape</code>, <code>metadata_status</code>). Site registry files
                  sync through Cloud Sync; shared registry files live in the app repo.
                </p>
                <p>
                  Suggestions were drafted by AI from live usage by area, the measured shape and the variant's code
                  (<code>npm run variant-metadata:backfill</code>). Usage counts come from Component insights and are
                  merged at read time — they are not saved in the file.
                </p>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
