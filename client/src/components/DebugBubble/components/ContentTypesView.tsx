import { useState, useEffect } from "react";
import { AlertTriangle, ArrowLeft, ChevronDown, ChevronRight, Database, ExternalLink, FileCode, FileText, Folder, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { MenuView } from "../types";

interface ContentTypeSummary {
  name: string;
  label: string;
  directory: string;
  has_database: boolean;
  database_slug: string | null;
  single_template?: boolean;
  database_entry_count?: number | null;
  has_field_mapping: boolean;
  static_entry_count: number;
}

interface ContentTypesViewProps {
  setMenuView: (v: MenuView) => void;
  onEditContentTypesYml: () => void;
}

interface LocaleEntry {
  code: string;
  label: string;
}

interface LocaleSettings {
  default_locale: string;
  supported_locales: LocaleEntry[];
}

interface DryRunResult {
  dry_run: true;
  type: string;
  directory: string;
  static_entry_count: number;
  has_database: boolean;
  database_slug: string | null;
  message: string;
}

function DeleteContentTypeDialog({
  contentType,
  onClose,
}: {
  contentType: ContentTypeSummary | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const open = contentType !== null;
  const [confirmInput, setConfirmInput] = useState("");
  const [dryRunResult, setDryRunResult] = useState<DryRunResult | null>(null);
  const [dryRunLoading, setDryRunLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!contentType) return;
    let cancelled = false;
    setConfirmInput("");
    setDryRunResult(null);
    setDryRunLoading(true);
    fetch(`/api/content-types/${contentType.name}?dry_run=true`, { method: "DELETE" })
      .then((res) => res.json())
      .then((data) => { if (!cancelled) setDryRunResult(data); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setDryRunLoading(false); });
    return () => { cancelled = true; };
  }, [contentType?.name]);

  const handleClose = () => {
    setConfirmInput("");
    setDryRunResult(null);
    onClose();
  };

  const handleDelete = async () => {
    if (!contentType || confirmInput !== contentType.name) return;
    setIsDeleting(true);
    try {
      const res = await apiRequest("DELETE", `/api/content-types/${contentType.name}`);
      const data = await res.json();
      if (data.success) {
        queryClient.invalidateQueries({ queryKey: ["/api/content-types"] });
        toast({ title: "Content type deleted", description: `"${contentType.name}" has been removed from content-types.yml.` });
        handleClose();
      } else {
        toast({ title: "Failed to delete content type", description: data.error || "Unknown error", variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "Failed to delete content type", description: String(err), variant: "destructive" });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => { if (!v) handleClose(); }}
    >
      <DialogContent className="sm:max-w-[480px]" data-testid="dialog-delete-content-type">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Delete Content Type
          </DialogTitle>
          <DialogDescription>
            This action cannot be undone. The content type definition will be permanently removed from{" "}
            <span className="font-mono text-xs">content-types.yml</span> and synced to GitHub.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {dryRunLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Checking impact&hellip;
            </div>
          ) : dryRunResult ? (
            <div className="rounded-md border bg-muted/50 p-3 space-y-2 text-sm" data-testid="text-dry-run-result">
              <p className="text-foreground">{dryRunResult.message}</p>
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground pt-1">
                <span>
                  <span className="font-medium text-foreground">{dryRunResult.static_entry_count}</span>{" "}
                  content file{dryRunResult.static_entry_count !== 1 ? "s" : ""} in{" "}
                  <span className="font-mono">4geeks-com/{dryRunResult.directory}/</span>
                </span>
                {dryRunResult.has_database && (
                  <span className="inline-flex items-center gap-1">
                    <Database className="h-3 w-3" />
                    Connected to <span className="font-mono">{dryRunResult.database_slug}</span>
                  </span>
                )}
              </div>
            </div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="delete-type-confirm-inline">
              Type <span className="font-mono font-bold">{contentType?.name}</span> to confirm
            </Label>
            <Input
              id="delete-type-confirm-inline"
              value={confirmInput}
              onChange={(e) => setConfirmInput(e.target.value)}
              placeholder={contentType?.name ?? ""}
              autoComplete="off"
              data-testid="input-delete-type-confirm"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isDeleting}
            data-testid="button-cancel-delete-content-type"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={confirmInput !== contentType?.name || isDeleting}
            data-testid="button-confirm-delete-content-type"
          >
            {isDeleting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Deleting&hellip;
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Content Type
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateContentTypeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { toast } = useToast();
  const { data: localeSettings } = useQuery<LocaleSettings>({
    queryKey: ["/api/settings/locales"],
    staleTime: Infinity,
  });
  const defaultLocales = localeSettings?.supported_locales ?? [{ code: "en", label: "English" }, { code: "es", label: "Spanish" }];

  const [name, setName] = useState("");
  const [patternMode, setPatternMode] = useState<"non-localized" | "shorthand" | "per-locale">("shorthand");
  const [nonLocalizedPattern, setNonLocalizedPattern] = useState("");
  const [shorthandPattern, setShorthandPattern] = useState("");
  const [localePatterns, setLocalePatterns] = useState<{ locale: string; path: string }[]>(
    defaultLocales.map(l => ({ locale: l.code, path: "" }))
  );
  const [directory, setDirectory] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showFiles, setShowFiles] = useState(false);
  const [nameError, setNameError] = useState("");

  const mutation = useMutation({
    mutationFn: async (body: { name: string; directory?: string; url_pattern: string | Record<string, string> }) => {
      const res = await apiRequest("POST", "/api/content-types", body);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/content-types"] });
      toast({ title: "Content type created", description: `"${data.name}" is ready to use.` });
      resetForm();
      onOpenChange(false);
    },
    onError: (err) => {
      toast({ title: "Failed to create content type", description: String(err), variant: "destructive" });
    },
  });

  const effectiveDir = directory || name;

  const filePreview = (() => {
    if (!name) return null;
    const dir = effectiveDir;
    const defaultLocale = localeSettings?.default_locale ?? "en";
    const localeFiles = patternMode === "non-localized"
      ? [defaultLocale]
      : defaultLocales.map(l => l.code);
    return {
      ymlEntry: `4geeks-com/content-types.yml`,
      directory: `4geeks-com/${dir}/`,
      sampleDir: `sample-${name}/`,
      sampleFiles: ["_common.yml", ...localeFiles.map(l => `${l}.yml`)],
    };
  })();

  function resetForm() {
    setName("");
    setNonLocalizedPattern("");
    setShorthandPattern("");
    setLocalePatterns(defaultLocales.map(l => ({ locale: l.code, path: "" })));
    setDirectory("");
    setShowAdvanced(false);
    setShowFiles(false);
    setPatternMode("shorthand");
    setNameError("");
  }

  function validateName(v: string) {
    if (!v) {
      setNameError("");
      return;
    }
    if (!/^[a-z][a-z0-9_-]*$/.test(v)) {
      setNameError("Lowercase letters, numbers, hyphens, underscores only. Must start with a letter.");
    } else {
      setNameError("");
    }
  }

  function normalizePathInput(raw: string): string {
    const trimmed = raw.trim();
    if (trimmed && !trimmed.startsWith("/")) return "/" + trimmed;
    return trimmed;
  }

  function updateLocalePattern(index: number, rawPath: string) {
    setLocalePatterns(prev => prev.map((lp, i) => i === index ? { ...lp, path: rawPath } : lp));
  }

  function validatePattern(p: string): string {
    if (!p) return "";
    const normalized = normalizePathInput(p);
    if (!normalized.includes(":slug")) return "Must include :slug";
    return "";
  }

  const nonLocalizedError = nonLocalizedPattern ? validatePattern(nonLocalizedPattern) : "";
  const shorthandError = shorthandPattern ? validatePattern(shorthandPattern) : "";
  const localeErrors = localePatterns.map(lp => lp.path ? validatePattern(lp.path) : "");
  const hasLocaleErrors = localeErrors.some(e => e !== "");

  const allLocalesFilled = localePatterns.length > 0 && localePatterns.every(lp => lp.path.trim() !== "");

  const canSubmit = !!name && !nameError &&
    (patternMode === "non-localized"
      ? nonLocalizedPattern.trim() !== "" && !nonLocalizedError
      : patternMode === "shorthand"
        ? shorthandPattern.trim() !== "" && !shorthandError
        : allLocalesFilled && !hasLocaleErrors);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    let url_pattern: string | Record<string, string>;
    if (patternMode === "non-localized") {
      const normalized = normalizePathInput(nonLocalizedPattern);
      url_pattern = { default: normalized };
    } else if (patternMode === "shorthand") {
      const normalized = normalizePathInput(shorthandPattern);
      url_pattern = `/:locale${normalized}`;
    } else {
      const map: Record<string, string> = {};
      for (const lp of localePatterns) {
        const normalized = normalizePathInput(lp.path);
        map[lp.locale] = `/${lp.locale}${normalized}`;
      }
      url_pattern = map;
    }

    mutation.mutate({
      name,
      directory: directory || undefined,
      url_pattern,
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Create Content Type</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ct-name">Name</Label>
            <Input
              id="ct-name"
              placeholder="e.g. testimonial"
              value={name}
              onChange={(e) => { setName(e.target.value); validateName(e.target.value); }}
              data-testid="input-content-type-name"
            />
            {nameError && <p className="text-xs text-destructive">{nameError}</p>}
          </div>

          <div className="space-y-2">
            <Label>URL Pattern</Label>
            <div className="flex rounded-md border overflow-visible" data-testid="segmented-url-pattern-mode">
              {([
                { value: "non-localized" as const, label: "No locale prefix" },
                { value: "shorthand" as const, label: "Use locale prefix" },
                { value: "per-locale" as const, label: "Customized" },
              ]).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`flex-1 text-xs py-1.5 px-1 transition-colors ${
                    patternMode === opt.value
                      ? "bg-primary text-primary-foreground font-medium"
                      : "text-muted-foreground hover-elevate"
                  } ${opt.value === "non-localized" ? "rounded-l-md" : ""} ${opt.value === "per-locale" ? "rounded-r-md" : ""}`}
                  onClick={() => setPatternMode(opt.value)}
                  data-testid={`button-pattern-mode-${opt.value}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {patternMode === "non-localized" && (
              <div className="space-y-1">
                <Input
                  placeholder={`/${name || "my-type"}/:slug`}
                  value={nonLocalizedPattern}
                  onChange={(e) => setNonLocalizedPattern(e.target.value)}
                  data-testid="input-url-pattern-non-localized"
                />
                {nonLocalizedError && <p className="text-xs text-destructive" data-testid="text-non-localized-error">{nonLocalizedError}</p>}
                <p className="text-xs text-muted-foreground">
                  A single URL for all locales, no language prefix.
                </p>
              </div>
            )}

            {patternMode === "shorthand" && (
              <>
                <div className="flex items-center gap-0">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        className="inline-flex items-center rounded-l-md border border-r-0 bg-muted px-2 py-2 text-xs text-muted-foreground flex-shrink-0 cursor-help"
                        data-testid="tooltip-trigger-locale"
                      >
                        /:locale
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-64 text-xs" data-testid="tooltip-content-locale">
                      <p className="font-medium mb-1">:locale represents the language code</p>
                      <p>Each URL will start with the locale prefix. For example: <span className="font-mono">/en{shorthandPattern || `/${name || "type"}/:slug`}</span> for English, <span className="font-mono">/es{shorthandPattern || `/${name || "type"}/:slug`}</span> for Spanish.</p>
                    </TooltipContent>
                  </Tooltip>
                  <Input
                    placeholder="/my-type/:slug"
                    value={shorthandPattern}
                    onChange={(e) => setShorthandPattern(e.target.value)}
                    className="rounded-l-none"
                    data-testid="input-url-pattern-shorthand"
                  />
                </div>
                {shorthandError && <p className="text-xs text-destructive" data-testid="text-shorthand-error">{shorthandError}</p>}
              </>
            )}

            {patternMode === "per-locale" && (
              <div className="space-y-2">
                {localePatterns.map((lp, i) => (
                  <div key={lp.locale} className="space-y-1">
                    <div className="flex items-center gap-1">
                      <span className="inline-flex items-center rounded-l-md border border-r-0 bg-muted px-2 py-2 text-xs text-muted-foreground flex-shrink-0">/{lp.locale}</span>
                      <Input
                        placeholder="/my-type/:slug"
                        value={lp.path}
                        onChange={(e) => updateLocalePattern(i, e.target.value)}
                        className="rounded-l-none"
                        data-testid={`input-url-pattern-${lp.locale}`}
                      />
                    </div>
                    {localeErrors[i] && <p className="text-xs text-destructive" data-testid={`text-pattern-error-${lp.locale}`}>{localeErrors[i]}</p>}
                  </div>
                ))}
                <Link
                  href="/private/settings"
                  className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                  onClick={() => onOpenChange(false)}
                  data-testid="link-manage-locales"
                >
                  Manage locales
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            )}
          </div>

          <div>
            <button
              type="button"
              className="flex items-center gap-1 text-xs text-muted-foreground hover-elevate rounded px-1.5 py-1"
              onClick={() => setShowAdvanced(!showAdvanced)}
              data-testid="button-toggle-advanced"
            >
              {showAdvanced ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              Advanced
            </button>
            {showAdvanced && (
              <div className="mt-2 space-y-2 pl-4">
                <Label htmlFor="ct-directory">Choose a specific directory name</Label>
                <Input
                  id="ct-directory"
                  placeholder={name || "defaults to name"}
                  value={directory}
                  onChange={(e) => setDirectory(e.target.value)}
                  data-testid="input-content-type-directory"
                />
                <p className="text-xs text-muted-foreground">
                  Your new content type will be located at: <span className="font-mono">4geeks-com/{directory || name || "folder_name"}</span>, you will find all content and YAML files inside.
                </p>
              </div>
            )}
          </div>

          {filePreview && (
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => setShowFiles(v => !v)}
                className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover-elevate rounded"
                data-testid="button-toggle-files-preview"
              >
                <ChevronDown className={`h-3 w-3 transition-transform ${showFiles ? '' : '-rotate-90'}`} />
                Files that will be created
              </button>
              {showFiles && filePreview && (
                <div className="space-y-0.5 font-mono text-xs text-muted-foreground pl-4 pt-1">
                  <div>{filePreview.directory}</div>
                  <div className="pl-4">{filePreview.sampleDir}</div>
                  {filePreview.sampleFiles.map((f, i) => {
                    const isLast = i === filePreview.sampleFiles.length - 1;
                    return (
                      <div key={f} className="pl-8">{isLast ? "└── " : "├── "}{f}</div>
                    );
                  })}
                  <div className="mt-1 text-muted-foreground/70">Modified:</div>
                  <div>{filePreview.ymlEntry}</div>
                  <div className="pl-4">└── new "{name}" entry added</div>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => { resetForm(); onOpenChange(false); }}
              data-testid="button-cancel-create-content-type"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!canSubmit || mutation.isPending}
              data-testid="button-submit-create-content-type"
            >
              {mutation.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ContentTypesView({ setMenuView, onEditContentTypesYml }: ContentTypesViewProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ContentTypeSummary | null>(null);
  const { data, isLoading } = useQuery<ContentTypeSummary[]>({
    queryKey: ["/api/content-types"],
    staleTime: 0,
  });

  return (
    <>
      <div className="px-3 py-2 border-b">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMenuView("main")}
              className="p-1 rounded-md hover-elevate"
              data-testid="button-back-to-main-content-types"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <h3 className="font-semibold text-sm">Content Types</h3>
              <p className="text-xs text-muted-foreground">
                {data ? `${data.length} type${data.length !== 1 ? "s" : ""}` : "Loading..."}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={onEditContentTypesYml}
                  className="p-1 rounded-md hover-elevate"
                  data-testid="button-edit-content-types-yml"
                >
                  <FileCode className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                Edit content-types.yml
              </TooltipContent>
            </Tooltip>
            <button
              onClick={() => setCreateOpen(true)}
              className="p-1 rounded-md hover-elevate"
              data-testid="button-create-content-type"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-y-auto overflow-x-hidden max-h-[280px]">
        <div className="p-2 space-y-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : !data || data.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              No content types found
            </div>
          ) : (
            data.map((ct) => (
              <div
                key={ct.name}
                className="flex items-center gap-1 px-3 py-2 rounded-md text-sm group"
                data-testid={`row-content-type-${ct.name}`}
              >
                <a
                  href={`/private/type/${ct.name}`}
                  className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer hover-elevate rounded-md -ml-1 pl-1 py-0.5"
                  data-testid={`link-content-type-${ct.name}`}
                >
                  <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{ct.label}</div>
                    <div className="text-xs text-muted-foreground truncate flex items-center gap-2">
                      <span className="inline-flex items-center gap-0.5">
                        <Folder className="h-3 w-3" />
                        {ct.directory}/ · {ct.static_entry_count} static
                      </span>
                      {ct.has_database && typeof ct.database_entry_count === "number" && (
                        <span className="inline-flex items-center gap-0.5">
                          <Database className="h-3 w-3" />
                          {ct.database_entry_count} cached
                        </span>
                      )}
                    </div>
                  </div>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                </a>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setDeleteTarget(ct)}
                      className="p-1 rounded-md text-muted-foreground hover-elevate opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                      data-testid={`button-delete-content-type-${ct.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="text-xs">
                    Delete content type
                  </TooltipContent>
                </Tooltip>
              </div>
            ))
          )}
        </div>
      </div>

      <CreateContentTypeDialog open={createOpen} onOpenChange={setCreateOpen} />
      <DeleteContentTypeDialog contentType={deleteTarget} onClose={() => setDeleteTarget(null)} />
    </>
  );
}
