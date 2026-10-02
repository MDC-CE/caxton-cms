import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface ThemeBackgroundUsage {
  by_id: Record<string, { count: number; legacy_css: number; files: string[] }>;
  off_theme: Array<{ value: string; count: number; files: string[] }>;
  scanned_files: number;
}

export interface BackgroundOption {
  id: string;
  label: string;
  swatch: string;
}

export const THEME_BACKGROUND_USAGE_KEY = ["/api/theme/background-usage"] as const;

export function useThemeBackgroundUsage() {
  return useQuery<ThemeBackgroundUsage>({ queryKey: THEME_BACKGROUND_USAGE_KEY, staleTime: 60_000 });
}

/** Values that are CSS (not Tailwind classes or placeholder words) can become theme entries. */
export function canAddAsThemeEntry(value: string): boolean {
  return /^(#|rgb|hsl|oklch|linear-gradient|radial-gradient|conic-gradient)/i.test(value.trim());
}

export function slugifyThemeId(label: string): string {
  const slug = label
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const withLetter = /^[a-z]/.test(slug) ? slug : `color-${slug || Date.now()}`;
  return withLetter.startsWith("bg-") ? `color-${withLetter.slice(3)}` : withLetter;
}

function Swatch({ background }: { background: string }) {
  return <span className="inline-block w-4 h-4 rounded border border-border shrink-0" style={{ background }} />;
}

interface ReplaceBackgroundDialogProps {
  open: boolean;
  title: string;
  description: string;
  fromLabel: string;
  count: number;
  options: BackgroundOption[];
  excludeId?: string;
  confirmLabel: string;
  busy: boolean;
  onConfirm: (toId: string) => void;
  onClose: () => void;
}

export function ReplaceBackgroundDialog({
  open,
  title,
  description,
  fromLabel,
  count,
  options,
  excludeId,
  confirmLabel,
  busy,
  onConfirm,
  onClose,
}: ReplaceBackgroundDialogProps) {
  const [toId, setToId] = useState<string>("");
  const choices = options.filter((o) => o.id !== excludeId);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md" data-testid="dialog-replace-background">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm">
            <span className="font-mono text-xs break-all">{fromLabel}</span>
            <span className="text-muted-foreground"> — used in {count} section{count === 1 ? "" : "s"}</span>
          </p>
          <Label className="text-xs text-muted-foreground">Replace with</Label>
          <div className="grid grid-cols-2 gap-1.5 max-h-56 overflow-y-auto">
            {choices.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => setToId(o.id)}
                className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition-colors ${
                  toId === o.id ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-primary/50"
                }`}
                data-testid={`replace-option-${o.id}`}
              >
                <Swatch background={o.swatch} />
                <span className="truncate">{o.label}</span>
              </button>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => toId && onConfirm(toId)} disabled={!toId || busy} data-testid="button-confirm-replace">
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface AddToThemeDialogProps {
  open: boolean;
  value: string;
  count: number;
  existingIds: string[];
  busy: boolean;
  onConfirm: (entry: { id: string; label: string; value: string }) => void;
  onClose: () => void;
}

export function AddToThemeDialog({ open, value, count, existingIds, busy, onConfirm, onClose }: AddToThemeDialogProps) {
  const [label, setLabel] = useState("");
  const id = slugifyThemeId(label);
  const taken = existingIds.includes(id);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md" data-testid="dialog-add-background">
        <DialogHeader>
          <DialogTitle>Add this color to the theme</DialogTitle>
          <DialogDescription>
            It becomes a theme background anyone (and any agent) can pick. The {count} section{count === 1 ? "" : "s"}{" "}
            using it switch to the new theme color, so they look the same today and follow future theme changes.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Swatch background={value} />
            <span className="font-mono text-xs break-all">{value}</span>
          </div>
          <div className="space-y-1">
            <Label htmlFor="add-bg-label" className="text-xs">Name</Label>
            <Input
              id="add-bg-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Light blue 10"
              data-testid="input-add-background-label"
            />
            {label && (
              <p className={`text-xs ${taken ? "text-destructive" : "text-muted-foreground"}`}>
                Theme ID: <span className="font-mono">{id}</span>
                {taken ? " — already used, pick another name" : ""}
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => onConfirm({ id, label: label.trim(), value })}
            disabled={!label.trim() || taken || busy}
            data-testid="button-confirm-add-background"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Add and switch sections
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface OffThemeBackgroundsPanelProps {
  usage: ThemeBackgroundUsage | undefined;
  loading: boolean;
  onAdd: (value: string, count: number) => void;
  onReplace: (value: string, count: number) => void;
}

export function OffThemeBackgroundsPanel({ usage, loading, onAdd, onReplace }: OffThemeBackgroundsPanelProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const total = useMemo(() => (usage?.off_theme ?? []).reduce((n, o) => n + o.count, 0), [usage]);

  return (
    <div className="py-3 space-y-2" data-testid="panel-off-theme-backgrounds">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Colors outside the theme</span>
        {total > 0 && (
          <Badge variant="outline" className="ml-auto text-xs">
            {total}
          </Badge>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        These section colors aren't in the theme. They still show, but won't follow theme or dark-mode changes. Add one to
        the theme, or swap it for an existing theme color on every page.
      </p>
      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Scanning pages…
        </div>
      ) : (usage?.off_theme ?? []).length === 0 ? (
        <p className="text-xs text-muted-foreground py-1">Every section uses a theme color.</p>
      ) : (
        <div className="space-y-1.5">
          {usage!.off_theme.map((o) => (
            <div key={o.value} className="rounded-md border border-border p-2 space-y-1.5" data-testid="off-theme-row">
              <div className="flex items-center gap-2">
                {canAddAsThemeEntry(o.value) && <Swatch background={o.value} />}
                <span className="font-mono text-xs break-all flex-1">{o.value}</span>
                <span className="text-xs text-muted-foreground shrink-0">{o.count}×</span>
              </div>
              <div className="flex gap-1.5">
                {canAddAsThemeEntry(o.value) && (
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onAdd(o.value, o.count)}>
                    Add to theme
                  </Button>
                )}
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onReplace(o.value, o.count)}>
                  Replace everywhere
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => setShowAdvanced((v) => !v)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        data-testid="button-off-theme-advanced"
      >
        {showAdvanced ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        Read more (advanced)
      </button>
      {showAdvanced && (
        <div className="text-xs text-muted-foreground space-y-1 rounded-md bg-muted/40 p-2">
          <p>
            Scans the section-level <span className="font-mono">background</span> of every page, draft, template and
            component example in this site ({usage?.scanned_files ?? 0} YAML files). Card or item backgrounds inside a
            section are not touched.
          </p>
          <p>
            Replacing edits those YAML files and queues them for Cloud Sync. Sections store the theme ID (e.g.{" "}
            <span className="font-mono">muted</span>), which renders through the
            <span className="font-mono"> --theme-bg-&lt;id&gt;</span> CSS variable.
          </p>
          <p>Agents can only write theme IDs; staff can still type a custom color, with a warning.</p>
        </div>
      )}
    </div>
  );
}
