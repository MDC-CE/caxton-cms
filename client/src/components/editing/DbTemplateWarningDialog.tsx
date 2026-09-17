import { AlertTriangle, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export type DbTemplateOperation = "delete" | "add" | "update";

interface DbTemplateWarningDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  operation: DbTemplateOperation;
  contentType: string;
  isLoading?: boolean;
}

function formatContentType(raw: string): string {
  return raw
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function operationLabel(op: DbTemplateOperation): string {
  switch (op) {
    case "delete": return "Delete section";
    case "add": return "Add section";
    case "update": return "Update section";
  }
}

function operationVerb(op: DbTemplateOperation): string {
  switch (op) {
    case "delete": return "remove it from";
    case "add": return "add it to";
    case "update": return "update it in";
  }
}

function operationExtra(op: DbTemplateOperation): string {
  switch (op) {
    case "delete":
      return " Each language has its own shared layout — the section is also removed from the other language layouts for this type.";
    case "add":
      return " Each language has its own shared layout. Confirming also adds this section to the other language layouts for this type; those languages may stay hidden until someone edits them.";
    case "update":
      return " Each language has its own shared layout. Allowlisted layout and visibility changes sync to sibling language layouts; type/version/variant changes are not auto-copied — update other languages manually.";
  }
}

export function DbTemplateWarningDialog({
  open,
  onClose,
  onConfirm,
  operation,
  contentType,
  isLoading = false,
}: DbTemplateWarningDialogProps) {
  const typeName = formatContentType(contentType);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !isLoading) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            {operationLabel(operation)} — shared template
          </DialogTitle>
          <DialogDescription>
            This change affects the shared layout and will apply to{" "}
            <strong>all {typeName} entries</strong> that use it. Confirming will{" "}
            {operationVerb(operation)} the layout for every {typeName} entry.
            {operationExtra(operation)}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={isLoading}
            data-testid="button-db-template-warn-cancel"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isLoading}
            data-testid="button-db-template-warn-confirm"
          >
            {isLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Apply to all {typeName} entries
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
