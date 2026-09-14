import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { IconGitFork, IconFlame, IconArrowLeft } from "@tabler/icons-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const CREATE_NEW_VALUE = "__create_new__";

export interface ExistingVariant {
  slug: string;
}

interface FirstEditPromptModalProps {
  isOpen: boolean;
  contentType: string;
  slug: string;
  locale: string;
  existingVariants?: ExistingVariant[];
  onCreateVariant: (name: string) => Promise<void>;
  onSwitchToVariant?: (variantSlug: string) => void;
  onEditLive: () => void;
  /** Dismiss without editing — X, Escape, or backdrop. */
  onCancel: () => void;
}

export function FirstEditPromptModal({
  isOpen,
  slug,
  locale,
  existingVariants = [],
  onCreateVariant,
  onSwitchToVariant,
  onEditLive,
  onCancel,
}: FirstEditPromptModalProps) {
  const hasExisting = existingVariants.length > 0;

  type Step = "choose" | "configure";
  const [step, setStep] = useState<Step>("choose");
  const [selectedVariant, setSelectedVariant] = useState<string>(CREATE_NEW_VALUE);
  const [newVariantName, setNewVariantName] = useState("draft");
  const [isCreating, setIsCreating] = useState(false);

  // When variants arrive async, pre-select the first one
  useEffect(() => {
    if (existingVariants.length > 0 && selectedVariant === CREATE_NEW_VALUE) {
      setSelectedVariant(existingVariants[0].slug);
    }
  }, [existingVariants]);

  // Reset to step 1 whenever the modal closes/reopens
  useEffect(() => {
    if (!isOpen) {
      setStep("choose");
      setSelectedVariant(CREATE_NEW_VALUE);
      setNewVariantName("draft");
    }
  }, [isOpen]);

  const isCreatingNew = selectedVariant === CREATE_NEW_VALUE;

  const handleConfirm = async () => {
    if (isCreatingNew) {
      const trimmed = newVariantName.trim();
      if (!trimmed) return;
      setIsCreating(true);
      try {
        await onCreateVariant(trimmed);
      } finally {
        setIsCreating(false);
      }
    } else {
      onSwitchToVariant?.(selectedVariant);
    }
  };

  const slugPreview = isCreatingNew && slug && newVariantName.trim()
    ? `${slug}/${newVariantName.trim()}.${locale}.yml`
    : null;

  const confirmDisabled = isCreating || (isCreatingNew && !newVariantName.trim());

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isCreating) onCancel();
      }}
    >
      <DialogContent className="max-w-md">
        {step === "choose" ? (
          <>
            <DialogHeader>
              <DialogTitle>Editing the live page</DialogTitle>
              <DialogDescription>
                You are about to edit the <strong>promoted (live) version</strong> of
                this page. Changes will be visible to all visitors immediately after
                saving. Would you like to work on a safe variant copy instead?
              </DialogDescription>
            </DialogHeader>

            <DialogFooter className="flex-col gap-2 sm:flex-row mt-2">
              <Button
                variant="outline"
                onClick={onEditLive}
                data-testid="button-edit-live-page"
                className="w-full sm:w-auto border-2 border-destructive text-destructive"
              >
                <IconFlame className="h-4 w-4 mr-2" />
                Edit live page
              </Button>
              <Button
                onClick={() => setStep("configure")}
                data-testid="button-work-on-variant"
                className="w-full sm:w-auto"
              >
                <IconGitFork className="h-4 w-4 mr-2" />
                Work on a variant
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>
                {hasExisting ? "Choose a variant" : "Create a variant"}
              </DialogTitle>
              <DialogDescription>
                {hasExisting
                  ? "Select an existing variant to continue editing, or create a new one."
                  : "Give your variant a name. It will be a private copy of the live page that you can edit and preview before promoting."}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-1">
              {hasExisting && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Variant</Label>
                  <Select
                    value={selectedVariant}
                    onValueChange={setSelectedVariant}
                    disabled={isCreating}
                  >
                    <SelectTrigger data-testid="select-variant">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {existingVariants.map((v) => (
                        <SelectItem
                          key={v.slug}
                          value={v.slug}
                          data-testid={`option-variant-${v.slug}`}
                        >
                          {v.slug}
                        </SelectItem>
                      ))}
                      <SelectItem
                        value={CREATE_NEW_VALUE}
                        data-testid="option-create-new"
                      >
                        + Create new variant…
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {isCreatingNew && (
                <div className="space-y-2">
                  <Label htmlFor="variant-name-input" className="text-sm font-medium">
                    {hasExisting ? "New variant name" : "Variant name"}
                  </Label>
                  <Input
                    id="variant-name-input"
                    data-testid="input-variant-name"
                    value={newVariantName}
                    onChange={(e) =>
                      setNewVariantName(
                        e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-")
                      )
                    }
                    placeholder="draft"
                    disabled={isCreating}
                    autoFocus
                  />
                  {slugPreview && (
                    <p className="text-xs text-muted-foreground">
                      Will create: <code className="font-mono">{slugPreview}</code>
                    </p>
                  )}
                </div>
              )}
            </div>

            <DialogFooter className="flex-col gap-2 sm:flex-row">
              <Button
                variant="ghost"
                onClick={() => setStep("choose")}
                disabled={isCreating}
                data-testid="button-back"
                className="w-full sm:w-auto"
              >
                <IconArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={confirmDisabled}
                data-testid="button-confirm-variant"
                className="w-full sm:w-auto"
              >
                {isCreating ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <IconGitFork className="h-4 w-4 mr-2" />
                )}
                {isCreatingNew ? "Create & edit variant" : "Edit variant"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
