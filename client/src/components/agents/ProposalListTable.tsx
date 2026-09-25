import { useState } from "react";
import { Link } from "wouter";
import { IconLoader2, IconTrash } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ProposalKindBadge } from "@/components/agents/ProposalExplainBadges";
import { formatProposalRelativeUpdatedAt } from "@/lib/proposalCardMeta";

export type ProposalTableRow = {
  id: string;
  title: string;
  kind: string;
  created_at: number;
};

function formatCreatedDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function ProposalListTable({
  proposals,
  selected,
  onToggle,
  onToggleAll,
  hrefFor,
}: {
  proposals: ProposalTableRow[];
  selected: ReadonlySet<string>;
  onToggle: (id: string, checked: boolean) => void;
  onToggleAll: (checked: boolean) => void;
  hrefFor: (id: string) => string;
}) {
  const selectedVisible = proposals.filter((p) => selected.has(p.id)).length;
  const headerState: boolean | "indeterminate" =
    selectedVisible === 0
      ? false
      : selectedVisible === proposals.length
        ? true
        : "indeterminate";

  return (
    <div
      className="overflow-hidden rounded-card border border-card-border bg-card"
      data-testid="table-proposal-list"
    >
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-10">
              <Checkbox
                checked={headerState}
                onCheckedChange={(v) => onToggleAll(v === true)}
                aria-label="Select all visible proposals"
                data-testid="checkbox-proposal-select-all"
              />
            </TableHead>
            <TableHead>Proposal</TableHead>
            <TableHead className="w-32">Type</TableHead>
            <TableHead className="w-36">Created</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {proposals.map((p) => {
            const isSelected = selected.has(p.id);
            return (
              <TableRow
                key={p.id}
                data-state={isSelected ? "selected" : undefined}
                data-testid={`row-proposal-${p.id}`}
              >
                <TableCell className="w-10">
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={(v) => onToggle(p.id, v === true)}
                    aria-label={`Select ${p.title || p.id}`}
                    data-testid={`checkbox-proposal-${p.id}`}
                  />
                </TableCell>
                <TableCell className="min-w-0">
                  <div className="font-mono text-xs text-muted-foreground">{p.id}</div>
                  <Link
                    href={hrefFor(p.id)}
                    className="text-sm font-medium text-foreground hover:underline underline-offset-2"
                    data-testid={`link-proposal-${p.id}`}
                  >
                    {p.title || "Untitled proposal"}
                  </Link>
                </TableCell>
                <TableCell>
                  <ProposalKindBadge kind={p.kind} appearance="meta" testIdSuffix={`-table-${p.id}`} />
                </TableCell>
                <TableCell
                  className="text-xs text-muted-foreground tabular-nums"
                  title={formatProposalRelativeUpdatedAt(p.created_at)}
                >
                  {formatCreatedDate(p.created_at)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export function ProposalBulkActionsBar({
  count,
  canDelete,
  deleting,
  onClear,
  onDelete,
}: {
  count: number;
  canDelete: boolean;
  deleting: boolean;
  onClear: () => void;
  onDelete: () => void;
}) {
  const deleteButton = (
    <Button
      type="button"
      variant="destructive"
      size="sm"
      className="gap-1.5"
      disabled={!canDelete || deleting}
      onClick={onDelete}
      data-testid="button-bulk-delete-proposals"
    >
      {deleting ? (
        <IconLoader2 className="h-4 w-4 animate-spin" />
      ) : (
        <IconTrash className="h-4 w-4" />
      )}
      Delete
    </Button>
  );

  return (
    <div
      className="flex min-h-10 flex-wrap items-center gap-3"
      data-testid="bulk-actions-bar"
    >
      <span
        className="text-sm text-muted-foreground tabular-nums"
        data-testid="text-bulk-selected-count"
      >
        {count} selected
      </span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onClear}
        data-testid="button-bulk-clear-selection"
      >
        Clear
      </Button>
      <div className="min-w-[1rem] flex-1" />
      {canDelete ? (
        deleteButton
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0}>{deleteButton}</span>
          </TooltipTrigger>
          <TooltipContent>Requires Delete proposals</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

export function ProposalBulkDeleteDialog({
  open,
  onOpenChange,
  count,
  deleting,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  deleting: boolean;
  onConfirm: () => void;
}) {
  const [advanced, setAdvanced] = useState(false);
  const noun = count === 1 ? "proposal" : "proposals";

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent data-testid="dialog-bulk-delete-proposals">
        <AlertDialogHeader>
          <AlertDialogTitle>
            Delete {count} {noun} permanently?
          </AlertDialogTitle>
          <AlertDialogDescription>
            They can&apos;t be recovered, and publishes they made can no longer be undone from
            here. Drafts these proposals created are removed; live pages are not changed.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div>
          <button
            type="button"
            className="text-xs text-primary underline-offset-2 hover:underline"
            onClick={() => setAdvanced((v) => !v)}
            data-testid="button-bulk-delete-read-more"
          >
            {advanced ? "Hide advanced" : "Read more (advanced)"}
          </button>
          {advanced ? (
            <ul
              className="mt-1.5 list-disc space-y-1 pl-5 text-[11px] text-muted-foreground"
              data-testid="bulk-delete-advanced-help"
            >
              <li>
                Deletes rows in <code className="text-[10px]">content_proposals</code>,{" "}
                <code className="text-[10px]">content_proposal_entries</code> and{" "}
                <code className="text-[10px]">content_proposal_blockers</code>.
              </li>
              <li>
                Removed drafts are pushed by auto-commit (they stay pending in Cloud Sync if a push
                fails).
              </li>
              <li>
                Drafts the proposal did not create, or that co-authors edited, are kept, with the{" "}
                <code className="text-[10px]">_draft.proposal</code> link cleared.
              </li>
              <li>Only drafts linked to this environment are touched.</li>
              <li>
                Accepted ideas with open implementing proposals are skipped unless those are
                selected too.
              </li>
              <li>
                A full snapshot is kept in the <code className="text-[10px]">proposal_deleted</code>{" "}
                event.
              </li>
              <li>Other proposals that referenced these will show &quot;Deleted proposal&quot;.</li>
            </ul>
          ) : null}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={deleting}
            onClick={onConfirm}
            data-testid="button-confirm-bulk-delete-proposals"
          >
            {deleting ? (
              <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <IconTrash className="mr-2 h-4 w-4" />
            )}
            Delete {count} {noun}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
