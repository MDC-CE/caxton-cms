import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { IconArrowBackUp, IconExternalLink } from "@tabler/icons-react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/queryClient";

export type FolderRestoreMode = "undo" | "restore";

export interface FolderRestoreTarget {
  sha: string;
  mode: FolderRestoreMode;
  subject: string;
}

interface CommitFileRow {
  path: string;
  status: "added" | "modified" | "removed";
  additions: number;
  deletions: number;
  restorable: boolean;
  reason?: string;
  sameAsNow: boolean;
  isVersioningFile: boolean;
}

interface SourceFileRow {
  path: string;
  restorable: boolean;
  reason?: string;
  sameAsNow: boolean;
  isVersioningFile: boolean;
}

interface CommitFilesResponse {
  mode: FolderRestoreMode;
  commitSha: string;
  parentSha: string | null;
  sourceSha: string;
  changedFiles: CommitFileRow[];
  filesAtSource: SourceFileRow[];
  extraFilesNow: string[];
  pendingFiles: string[];
  versioningFile: string | null;
  repoUrl: string | null;
}

export interface FolderRestoreResult {
  pushed: boolean;
  commitHash?: string;
  pushError?: string;
  restoredFiles: string[];
  deletedFiles: string[];
  skippedBinary: string[];
  warnings: string[];
}

interface FolderRestoreDialogProps {
  target: FolderRestoreTarget | null;
  folder: string;
  contentType: string | null;
  isTemplateAttached: boolean;
  templateHistoryUrl: string | null;
  onClose: () => void;
  onRestored: (result: FolderRestoreResult) => void;
}

const TRAFFIC_WARNING = "Changes which versions are live and the traffic split.";

function basename(p: string): string {
  return p.split("/").pop() || p;
}

function StatusBadge({ status }: { status: CommitFileRow["status"] }) {
  const label = status === "added" ? "added" : status === "removed" ? "deleted" : "edited";
  return (
    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-normal">
      {label}
    </Badge>
  );
}

export function FolderRestoreDialog({
  target,
  folder,
  contentType,
  isTemplateAttached,
  templateHistoryUrl,
  onClose,
  onRestored,
}: FolderRestoreDialogProps) {
  const { toast } = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [wholeFolder, setWholeFolder] = useState(false);
  const [removeExtra, setRemoveExtra] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  const filesQuery = useQuery<CommitFilesResponse>({
    queryKey: ["/api/git/folder-commit-files", folder, target?.sha, target?.mode],
    enabled: Boolean(target && folder),
    staleTime: 30_000,
    queryFn: async () => {
      const params = new URLSearchParams({ folder, sha: target!.sha, mode: target!.mode });
      const res = await apiFetch(`/api/git/folder-commit-files?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load files for this version");
      return data as CommitFilesResponse;
    },
  });
  const data = filesQuery.data;

  useEffect(() => {
    setWholeFolder(false);
    setRemoveExtra(false);
    if (!data) {
      setSelected(new Set());
      return;
    }
    setSelected(
      new Set(
        data.changedFiles
          .filter((f) => f.restorable && !f.isVersioningFile && !f.sameAsNow)
          .map((f) => f.path),
      ),
    );
  }, [data]);

  const sha7 = target?.sha.slice(0, 7) ?? "";
  const title = target?.mode === "undo" ? `Undo change ${sha7}` : `Restore to version ${sha7}`;
  const restorableSourceCount = useMemo(
    () => data?.filesAtSource.filter((f) => f.restorable).length ?? 0,
    [data],
  );

  const toggle = (p: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(p);
      else next.delete(p);
      return next;
    });
  };

  const handleRestore = async () => {
    if (!target || !data) return;
    setIsRestoring(true);
    try {
      const res = await apiFetch("/api/git/restore-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          folder,
          sha: target.sha,
          mode: target.mode,
          contentType,
          ...(wholeFolder ? { removeExtra } : { files: [...selected] }),
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        const files: string[] = Array.isArray(body.files) ? body.files : [];
        const fileHint = files.length
          ? ` (${files.slice(0, 5).map(basename).join(", ")}${files.length > 5 ? ", …" : ""})`
          : "";
        toast({
          title: res.status === 409 ? "Pull from GitHub first" : "Restore failed",
          description: `${body.error || "Could not restore."}${fileHint}`,
          variant: "destructive",
        });
        return;
      }
      onRestored(body as FolderRestoreResult);
    } catch (err) {
      toast({
        title: "Restore failed",
        description: err instanceof Error ? err.message : "Network error",
        variant: "destructive",
      });
    } finally {
      setIsRestoring(false);
    }
  };

  const canRestore = wholeFolder ? restorableSourceCount > 0 : selected.size > 0;

  return (
    <Dialog open={target !== null} onOpenChange={(open) => { if (!open && !isRestoring) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" data-testid="dialog-folder-restore">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {target?.mode === "undo"
              ? "Puts the files you tick back to how they were before this change."
              : "Puts the files you tick back to how they were right after this change."}{" "}
            Everything else on the page stays as it is. The restore is saved as a new version, so you can undo it.
          </DialogDescription>
        </DialogHeader>

        {target?.subject && (
          <p className="text-xs text-muted-foreground truncate" title={target.subject}>
            <span className="font-mono">{sha7}</span> · {target.subject}
          </p>
        )}

        {isTemplateAttached && (
          <p className="text-xs text-muted-foreground rounded-md border bg-muted/40 px-2.5 py-2" data-testid="text-restore-template-note">
            Only this page&apos;s own files are restored. The shared layout is not included.
            {templateHistoryUrl && (
              <>
                {" "}
                <a
                  href={templateHistoryUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  Template history
                </a>
              </>
            )}
          </p>
        )}

        {filesQuery.isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : filesQuery.isError ? (
          <p className="text-sm text-destructive py-4" data-testid="text-restore-files-error">
            {filesQuery.error instanceof Error ? filesQuery.error.message : "Could not load files"}
          </p>
        ) : data ? (
          <div className="space-y-3">
            {data.pendingFiles.length > 0 && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-2 text-xs" data-testid="text-restore-pending-warning">
                <p className="font-medium text-foreground">These have unpushed changes and will be overwritten:</p>
                <ul className="mt-1 space-y-0.5 text-muted-foreground font-mono">
                  {data.pendingFiles.map((p) => (
                    <li key={p} className="truncate" title={p}>{basename(p)}</li>
                  ))}
                </ul>
              </div>
            )}

            {!wholeFolder && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-foreground">Files changed in this version</p>
                {data.changedFiles.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No file differences found in this page&apos;s folder.</p>
                ) : (
                  <ul className="space-y-1">
                    {data.changedFiles.map((f) => (
                      <li
                        key={f.path}
                        className={`flex items-start gap-2 rounded-md px-2 py-1.5 border ${f.restorable ? "" : "opacity-60"}`}
                        data-testid={`row-restore-file-${basename(f.path)}`}
                      >
                        <Checkbox
                          className="mt-0.5"
                          checked={selected.has(f.path)}
                          disabled={!f.restorable}
                          onCheckedChange={(v) => toggle(f.path, v === true)}
                          data-testid={`checkbox-restore-file-${basename(f.path)}`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-xs font-mono truncate text-foreground" title={f.path}>
                              {basename(f.path)}
                            </span>
                            <StatusBadge status={f.status} />
                            <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                              +{f.additions} −{f.deletions}
                            </span>
                          </div>
                          {f.reason && <p className="text-[11px] text-muted-foreground mt-0.5">{f.reason}</p>}
                          {f.restorable && f.sameAsNow && (
                            <p className="text-[11px] text-muted-foreground mt-0.5">Already matches the page today.</p>
                          )}
                          {f.isVersioningFile && (
                            <p className="text-[11px] text-destructive mt-0.5">{TRAFFIC_WARNING}</p>
                          )}
                        </div>
                        {f.restorable && (
                          <a
                            href={`/api/git/file-at?${new URLSearchParams({ file: f.path, sha: data.sourceSha })}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground shrink-0"
                          >
                            Preview
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {wholeFolder && (
              <div className="space-y-2" data-testid="panel-restore-whole-folder">
                <p className="text-xs text-foreground">
                  Replaces every file for this page (all languages, drafts, and variants) with this version.
                </p>
                <ul className="space-y-0.5 text-xs font-mono">
                  {data.filesAtSource.map((f) => (
                    <li key={f.path} className={`truncate ${f.restorable ? "text-foreground" : "text-muted-foreground line-through"}`} title={f.reason || f.path}>
                      {basename(f.path)}
                      {f.isVersioningFile && (
                        <span className="font-sans text-[11px] text-destructive"> — {TRAFFIC_WARNING}</span>
                      )}
                    </li>
                  ))}
                </ul>
                {data.extraFilesNow.length > 0 && (
                  <div className="rounded-md border px-2.5 py-2 space-y-1.5">
                    <p className="text-xs text-foreground">These files exist now but not in this version:</p>
                    <ul className="space-y-0.5 text-xs font-mono text-muted-foreground">
                      {data.extraFilesNow.map((p) => (
                        <li key={p} className="truncate" title={p}>{basename(p)}</li>
                      ))}
                    </ul>
                    <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
                      <Checkbox
                        checked={removeExtra}
                        onCheckedChange={(v) => setRemoveExtra(v === true)}
                        data-testid="checkbox-restore-remove-extra"
                      />
                      Also remove these files
                    </label>
                  </div>
                )}
              </div>
            )}

            <button
              type="button"
              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
              onClick={() => setWholeFolder((v) => !v)}
              data-testid="button-toggle-whole-folder"
            >
              {wholeFolder ? "Back to picking files" : "Restore whole folder instead…"}
            </button>

            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer font-medium text-foreground/80 hover:text-foreground">
                Read more (advanced)
              </summary>
              <div className="mt-1.5 space-y-1 leading-relaxed">
                <p>
                  History comes from the site content repo on GitHub
                  {data.repoUrl ? <> (<code className="text-[10px]">{data.repoUrl.replace("https://github.com/", "")}</code>)</> : null}
                  , folder <code className="text-[10px]">{folder}</code>.
                </p>
                <p>
                  Files are read at commit <code className="text-[10px]">{data.sourceSha.slice(0, 7)}</code>
                  {target?.mode === "undo" ? " (the parent of the selected change)" : ""}, written locally, then
                  committed and pushed like a normal save. The restore is blocked if GitHub has unpulled changes for this site.
                </p>
              </div>
            </details>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isRestoring} data-testid="button-cancel-restore">
            Cancel
          </Button>
          <Button
            variant={wholeFolder ? "destructive" : "default"}
            onClick={handleRestore}
            disabled={isRestoring || !data || !canRestore}
            data-testid="button-confirm-restore"
          >
            {isRestoring ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <IconArrowBackUp className="h-4 w-4 mr-2" />
            )}
            {wholeFolder ? "Restore whole folder" : `Restore selected files${selected.size ? ` (${selected.size})` : ""}`}
          </Button>
        </DialogFooter>
        {data?.repoUrl && target && (
          <a
            href={`${data.repoUrl}/commit/${target.sha}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <IconExternalLink className="h-3 w-3" /> View this change on GitHub
          </a>
        )}
      </DialogContent>
    </Dialog>
  );
}
