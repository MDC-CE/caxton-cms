import { useState } from "react";
import { AlertTriangle, ArrowRight, Check, Link, Unlink, Loader2, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import { getDebugToken, resolveAuthorName } from "@/hooks/useDebugAuth";

interface SectionBindingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contentType: string;
  slug: string;
  sectionIndex: number;
  component: string;
  locale: string;
  existingGroup?: {
    id: string;
    name?: string;
    component: string;
    locale: string;
    members: Array<{ contentType: string; slug: string; localeSlug?: string; sectionIndex: number; sectionId?: string }>;
  } | null;
  onBindingChanged: () => void;
}

interface Candidate {
  contentType: string;
  slug: string;
  localeSlug?: string;
  sectionIndex: number;
  sectionId?: string;
  title?: string;
  alreadyBound?: string;
  alreadyBoundGroupName?: string;
}

function fetchWithAuth(url: string, options?: RequestInit) {
  const token = getDebugToken();
  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Token ${token}` } : {}),
      ...(options?.headers || {}),
    },
  });
}

export function SectionBindingDialog({
  open,
  onOpenChange,
  contentType,
  slug,
  sectionIndex,
  component,
  locale,
  existingGroup,
  onBindingChanged,
}: SectionBindingDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedCandidates, setSelectedCandidates] = useState<Set<string>>(new Set());
  const [showConfirmCreate, setShowConfirmCreate] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [pendingAddCandidate, setPendingAddCandidate] = useState<Candidate | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState("");
  const [confirmDissolve, setConfirmDissolve] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [unboundTab, setUnboundTab] = useState<"join" | "create">("join");
  const [pendingJoinGroup, setPendingJoinGroup] = useState<{ id: string; name?: string; component: string; members: Array<{ contentType: string; slug: string; sectionIndex: number; sectionId?: string }> } | null>(null);
  const [showAddMore, setShowAddMore] = useState(false);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setConfirmDissolve(false);
      setConfirmLeave(false);
      setPendingJoinGroup(null);
      setUnboundTab("join");
      setShowAddMore(false);
      setConfirmAddMore(false);
    }
    onOpenChange(nextOpen);
  };

  const candidateKey = (c: Candidate | { contentType: string; slug: string; sectionIndex: number; sectionId?: string }) =>
    `${c.contentType}:${c.slug}:${(c as { sectionId?: string }).sectionId || c.sectionIndex}`;

  const { data: candidatesData, isLoading: loadingCandidates } = useQuery({
    queryKey: ["/api/bindings/candidates", component, locale],
    queryFn: async () => {
      const res = await fetch(`/api/bindings/candidates?component=${encodeURIComponent(component)}&locale=${encodeURIComponent(locale)}`);
      return res.json();
    },
    enabled: open && !!component && !!locale,
  });

  const candidates = (candidatesData?.candidates || []) as Candidate[];

  const { data: allGroupsData, isLoading: loadingGroups } = useQuery<{ groups: Array<{ id: string; name?: string; component: string; locale: string; members: Array<{ contentType: string; slug: string; sectionIndex: number; sectionId?: string }> }> }>({
    queryKey: ["/api/bindings"],
    queryFn: async () => {
      const res = await fetchWithAuth("/api/bindings");
      return res.json();
    },
    enabled: open && !existingGroup,
  });

  const matchingGroups = !allGroupsData?.groups ? [] : allGroupsData.groups.filter(g => g.component === component && g.locale === locale);

  const availableCandidates = candidates.filter(c => !(c.contentType === contentType && c.slug === slug && c.sectionIndex === sectionIndex));

  const selectableCandidates = availableCandidates.filter(c => !c.alreadyBound);

  const filteredCandidates = availableCandidates
    .filter(c => {
      if (!search) return true;
      const lower = search.toLowerCase();
      return (
        c.slug.toLowerCase().includes(lower) ||
        c.localeSlug?.toLowerCase().includes(lower) ||
        c.title?.toLowerCase().includes(lower) ||
        c.contentType.toLowerCase().includes(lower)
      );
    });

  const existingMemberKeys = !existingGroup ? new Set<string>() : new Set(existingGroup.members.map(m => candidateKey(m)));

  const addMoreCandidates = !existingGroup ? [] : candidates.filter(c => !existingMemberKeys.has(candidateKey(c)) && !c.alreadyBound);

  const filteredAddMoreCandidates = addMoreCandidates.filter(c => {
    if (!search) return true;
    const lower = search.toLowerCase();
    return (
      c.slug.toLowerCase().includes(lower) ||
      c.localeSlug?.toLowerCase().includes(lower) ||
      c.title?.toLowerCase().includes(lower) ||
      c.contentType.toLowerCase().includes(lower)
    );
  });

  const createBindingMutation = useMutation({
    mutationFn: async ({ members, name }: { members: Array<{ contentType: string; slug: string; sectionIndex: number }>; name?: string }) => {
      const author = await resolveAuthorName();
      const res = await fetchWithAuth("/api/bindings", {
        method: "POST",
        body: JSON.stringify({ component, locale, members, name: name || undefined, sourceIndex: 0, author }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create binding");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Binding created", description: "Sections are now linked and content has been synchronized." });
      queryClient.invalidateQueries({ queryKey: ["/api/bindings/section"] });
      onBindingChanged();
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const addMemberMutation = useMutation({
    mutationFn: async ({ groupId, member }: { groupId: string; member: { contentType: string; slug: string; sectionIndex: number } }) => {
      const author = await resolveAuthorName();
      const res = await fetchWithAuth(`/api/bindings/${groupId}/members`, {
        method: "POST",
        body: JSON.stringify({ ...member, author }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to add member");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Section added", description: "Section has been added to the binding group and its content has been replaced." });
      queryClient.invalidateQueries({ queryKey: ["/api/bindings/section"] });
      onBindingChanged();
      setPendingAddCandidate(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setPendingAddCandidate(null);
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: async ({ groupId, member }: { groupId: string; member: { contentType: string; slug: string; sectionIndex: number } }) => {
      const author = await resolveAuthorName();
      const res = await fetchWithAuth(`/api/bindings/${groupId}/members`, {
        method: "DELETE",
        body: JSON.stringify({ ...member, author }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to remove member");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bindings/section"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bindings/candidates"] });
      onBindingChanged();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const unbindCurrentMutation = useMutation({
    mutationFn: async () => {
      if (!existingGroup) throw new Error("No binding to remove");
      const author = await resolveAuthorName();
      const res = await fetchWithAuth(`/api/bindings/${existingGroup.id}/members`, {
        method: "DELETE",
        body: JSON.stringify({ contentType, slug, sectionIndex, author }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to unbind");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Unbound", description: "This section is no longer linked to others." });
      queryClient.invalidateQueries({ queryKey: ["/api/bindings/section"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bindings/candidates"] });
      onBindingChanged();
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const dissolveGroupMutation = useMutation({
    mutationFn: async () => {
      if (!existingGroup) throw new Error("No binding group to dissolve");
      const author = await resolveAuthorName();
      const res = await fetchWithAuth(`/api/bindings/${existingGroup.id}`, {
        method: "DELETE",
        body: JSON.stringify({ author }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to dissolve group");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Group dissolved", description: "All sections have been unbound." });
      queryClient.invalidateQueries({ queryKey: ["/api/bindings/section"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bindings/candidates"] });
      onBindingChanged();
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setConfirmDissolve(false);
    },
  });

  const renameGroupMutation = useMutation({
    mutationFn: async ({ groupId, name }: { groupId: string; name: string }) => {
      const author = await resolveAuthorName();
      const res = await fetchWithAuth(`/api/bindings/${groupId}`, {
        method: "PATCH",
        body: JSON.stringify({ name, author }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to rename");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Group renamed" });
      queryClient.invalidateQueries({ queryKey: ["/api/bindings/section"] });
      setEditingName(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleToggleCandidate = (c: Candidate) => {
    const key = candidateKey(c);
    setSelectedCandidates(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleCreateBinding = () => {
    setShowConfirmCreate(true);
  };

  const handleConfirmCreate = () => {
    const selectedMembers = filteredCandidates
      .filter(c => selectedCandidates.has(candidateKey(c)))
      .map(c => ({ contentType: c.contentType, slug: c.slug, sectionIndex: c.sectionIndex }));

    const allMembers = [
      { contentType, slug, sectionIndex },
      ...selectedMembers,
    ];

    createBindingMutation.mutate({ members: allMembers, name: groupName.trim() || undefined });
  };

  const handleAddToExisting = (c: Candidate) => {
    setPendingAddCandidate(c);
  };

  const handleConfirmAdd = () => {
    if (!existingGroup || !pendingAddCandidate) return;
    addMemberMutation.mutate({
      groupId: existingGroup.id,
      member: { contentType: pendingAddCandidate.contentType, slug: pendingAddCandidate.slug, sectionIndex: pendingAddCandidate.sectionIndex },
    });
  };

  const [confirmAddMore, setConfirmAddMore] = useState(false);

  const handleAddMoreToGroup = () => {
    if (!existingGroup || selectedCandidates.size === 0) return;
    setConfirmAddMore(true);
  };

  const handleConfirmAddMore = async () => {
    if (!existingGroup) return;
    const toAdd = filteredAddMoreCandidates
      .filter(c => selectedCandidates.has(candidateKey(c)));
    for (const c of toAdd) {
      await addMemberMutation.mutateAsync({
        groupId: existingGroup.id,
        member: { contentType: c.contentType, slug: c.slug, sectionIndex: c.sectionIndex },
      });
    }
    setSelectedCandidates(new Set());
    setShowAddMore(false);
    setConfirmAddMore(false);
    setSearch("");
  };

  const joinGroupMutation = useMutation({
    mutationFn: async ({ groupId }: { groupId: string }) => {
      const author = await resolveAuthorName();
      const res = await fetchWithAuth(`/api/bindings/${groupId}/members`, {
        method: "POST",
        body: JSON.stringify({ contentType, slug, sectionIndex, author }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to join group");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Joined group", description: "This section has been added to the binding group and its content has been synchronized." });
      queryClient.invalidateQueries({ queryKey: ["/api/bindings/section"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bindings"] });
      onBindingChanged();
      setPendingJoinGroup(null);
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setPendingJoinGroup(null);
    },
  });

  const handleConfirmJoin = () => {
    if (!pendingJoinGroup) return;
    joinGroupMutation.mutate({ groupId: pendingJoinGroup.id });
  };

  const handleRemoveFromExisting = (c: { contentType: string; slug: string; sectionIndex: number }) => {
    if (!existingGroup) return;
    removeMemberMutation.mutate({
      groupId: existingGroup.id,
      member: { contentType: c.contentType, slug: c.slug, sectionIndex: c.sectionIndex },
    });
  };

  const handleStartRename = () => {
    setEditNameValue(existingGroup?.name || "");
    setEditingName(true);
  };

  const handleSaveRename = () => {
    if (!existingGroup) return;
    renameGroupMutation.mutate({ groupId: existingGroup.id, name: editNameValue.trim() });
  };

  const isPending = createBindingMutation.isPending || addMemberMutation.isPending || removeMemberMutation.isPending || unbindCurrentMutation.isPending || dissolveGroupMutation.isPending || joinGroupMutation.isPending;

  const groupDisplayName = existingGroup?.name || `${component} binding`;

  if (showConfirmCreate) {
    const selectedItems = filteredCandidates.filter(c => selectedCandidates.has(candidateKey(c)));

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Confirm binding
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <p className="text-sm text-muted-foreground" data-testid="text-overwrite-summary">
              {selectedItems.length} page{selectedItems.length > 1 ? "s" : ""} will have the <span className="font-medium text-foreground">{component}</span> component overwritten and all {selectedItems.length + 1} components will be bound from now on.
            </p>
            <div className="flex items-stretch gap-3">
              <div className="flex-1 rounded-md border border-border bg-muted/40 p-3 text-sm" data-testid="card-source-section">
                <p className="text-xs text-muted-foreground mb-1">Source (keeps content)</p>
                <p className="font-medium truncate" data-testid="text-source-page">{slug}</p>
                <Badge variant="outline" className="text-xs mt-1.5">{component}</Badge>
              </div>

              <div className="flex flex-col items-center justify-center shrink-0">
                <ArrowRight className="h-5 w-5 text-destructive" />
              </div>

              <div className="flex-1 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm" data-testid="card-destination-sections">
                <p className="text-xs text-destructive mb-1">Will be overwritten</p>
                <div className="max-h-[110px] overflow-y-auto">
                  {selectedItems.map(c => (
                    <p key={candidateKey(c)} className="font-medium truncate" data-testid={`text-destination-page-${c.slug}`}>{c.title || c.slug}</p>
                  ))}
                </div>
                <Badge variant="outline" className="text-xs mt-1.5">{component}</Badge>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Group name (optional)</label>
              <Input
                value={groupName}
                onChange={e => setGroupName(e.target.value)}
                placeholder={`${component} binding`}
                data-testid="input-binding-group-name"
              />
              <p className="text-xs text-muted-foreground mt-1">A name helps identify this group when managing bindings later.</p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowConfirmCreate(false)}
              disabled={isPending}
              data-testid="button-binding-confirm-back"
            >
              Back
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmCreate}
              disabled={isPending}
              data-testid="button-binding-confirm-create"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                "Bind and overwrite"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  if (pendingAddCandidate) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Confirm adding to group
            </DialogTitle>
          </DialogHeader>

          <div className="flex items-stretch gap-3">
            <div className="flex-1 rounded-md border border-border bg-muted/40 p-3 text-sm" data-testid="card-group-source">
              <p className="text-xs text-muted-foreground mb-1">Group content (source)</p>
              <p className="font-medium truncate" data-testid="text-group-name">{groupDisplayName}</p>
              <Badge variant="outline" className="text-xs mt-1.5">{component}</Badge>
            </div>

            <div className="flex flex-col items-center justify-center shrink-0">
              <ArrowRight className="h-5 w-5 text-destructive" />
            </div>

            <div className="flex-1 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm" data-testid="card-add-destination">
              <p className="text-xs text-destructive mb-1">Will be overwritten</p>
              <p className="font-medium truncate" data-testid="text-destination-page">{pendingAddCandidate.title || pendingAddCandidate.slug}</p>
              <Badge variant="outline" className="text-xs mt-1.5">{component}</Badge>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setPendingAddCandidate(null)}
              disabled={isPending}
              data-testid="button-add-confirm-back"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmAdd}
              disabled={isPending}
              data-testid="button-add-confirm-yes"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                "Add and overwrite"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  if (confirmAddMore && existingGroup) {
    const addMoreSelected = filteredAddMoreCandidates.filter(c => selectedCandidates.has(candidateKey(c)));
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Confirm adding {addMoreSelected.length} section{addMoreSelected.length !== 1 ? "s" : ""} to group
            </DialogTitle>
          </DialogHeader>

          <p className="text-sm text-muted-foreground" data-testid="text-add-more-warning">
            The following sections will be <span className="font-medium text-destructive">overwritten</span> with the group's content:
          </p>

          <div className="space-y-1 max-h-[200px] overflow-y-auto">
            {addMoreSelected.map(c => (
              <div key={candidateKey(c)} className="flex items-center gap-2 text-sm py-1">
                <Badge variant="outline" className="text-xs shrink-0">{c.contentType}</Badge>
                <span className="truncate">{c.title || c.slug}</span>
                <span className="text-muted-foreground text-xs">section {c.sectionIndex}</span>
              </div>
            ))}
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setConfirmAddMore(false)}
              disabled={isPending}
              data-testid="button-add-more-confirm-back"
            >
              Back
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmAddMore}
              disabled={isPending}
              data-testid="button-add-more-confirm-yes"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                `Add and overwrite ${addMoreSelected.length} section${addMoreSelected.length !== 1 ? "s" : ""}`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  if (pendingJoinGroup) {
    const joinGroupDisplayName = pendingJoinGroup.name || `${pendingJoinGroup.component} binding`;
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Join existing group
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <p className="text-sm text-muted-foreground" data-testid="text-join-summary">
              This section's content will be <span className="font-medium text-destructive">overwritten</span> with the group's content.
            </p>
            <div className="flex items-stretch gap-3">
              <div className="flex-1 rounded-md border border-border bg-muted/40 p-3 text-sm" data-testid="card-join-group-source">
                <p className="text-xs text-muted-foreground mb-1">Group (source)</p>
                <p className="font-medium truncate" data-testid="text-join-group-name">{joinGroupDisplayName}</p>
                <p className="text-xs text-muted-foreground mt-1">{pendingJoinGroup.members.length} member{pendingJoinGroup.members.length !== 1 ? "s" : ""}</p>
                <Badge variant="outline" className="text-xs mt-1.5">{component}</Badge>
              </div>

              <div className="flex flex-col items-center justify-center shrink-0">
                <ArrowRight className="h-5 w-5 text-destructive" />
              </div>

              <div className="flex-1 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm" data-testid="card-join-destination">
                <p className="text-xs text-destructive mb-1">Will be overwritten</p>
                <p className="font-medium truncate" data-testid="text-join-current">{slug}</p>
                <span className="text-xs text-muted-foreground">section {sectionIndex}</span>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setPendingJoinGroup(null)}
              disabled={isPending}
              data-testid="button-join-cancel"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmJoin}
              disabled={isPending}
              data-testid="button-join-confirm"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Joining...
                </>
              ) : (
                "Join and overwrite"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link className="h-5 w-5" />
            {existingGroup ? "Section is actively binded" : `Section Bindings in \`${locale}\``}
          </DialogTitle>
        </DialogHeader>

        <div className="text-sm text-muted-foreground mb-2">
          {existingGroup ? (
            <>
              This <Badge variant="secondary" className="text-xs">{component}</Badge> section is binded to {existingGroup.members.length - 1} other section{existingGroup.members.length - 1 !== 1 ? "s" : ""} in other pages, as you update its content, the other pages sections will also be updated.
            </>
          ) : (
            <>
              Bind this <Badge variant="secondary" className="text-xs">{component}</Badge> section to matching sections on other pages.
              When you edit any bound section, the content changes sync automatically to all siblings.
              Layout settings (padding, background, visibility) remain independent per page.
            </>
          )}
        </div>

        {existingGroup && (
          <>
          <div className="rounded-md border border-border p-3 mb-3">
            <div className="flex items-center justify-between mb-2 gap-2">
              {editingName ? (
                <div className="flex items-center gap-1 flex-1 min-w-0">
                  <Input
                    value={editNameValue}
                    onChange={e => setEditNameValue(e.target.value)}
                    className="h-7 text-sm"
                    placeholder={`${component} binding`}
                    autoFocus
                    onKeyDown={e => {
                      if (e.key === "Enter") handleSaveRename();
                      if (e.key === "Escape") setEditingName(false);
                    }}
                    data-testid="input-rename-group"
                  />
                  <Button size="icon" variant="ghost" onClick={handleSaveRename} disabled={renameGroupMutation.isPending} data-testid="button-save-rename">
                    {renameGroupMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => setEditingName(false)} disabled={renameGroupMutation.isPending} data-testid="button-cancel-rename">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-1 min-w-0">
                  <p className="font-medium text-sm truncate">{groupDisplayName}</p>
                  <Button size="icon" variant="ghost" className="shrink-0" onClick={handleStartRename} data-testid="button-edit-group-name">
                    <Pencil className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>
            <div className="space-y-1 max-h-[132px] overflow-y-auto">
              {existingGroup.members.map(m => {
                const key = candidateKey(m);
                const displaySlug = m.localeSlug || m.slug;
                const isSelf = m.contentType === contentType && (m.slug === slug || m.localeSlug === slug) && m.sectionIndex === sectionIndex;
                const hashAnchor = m.sectionId || `${component}-${m.sectionIndex}`;
                return (
                  <div key={key} className="flex items-center text-sm py-1">
                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                      <Badge variant="outline" className="text-xs shrink-0">{m.contentType}</Badge>
                      {isSelf ? (
                        <span className="truncate">{displaySlug}</span>
                      ) : (
                        <a
                          href={`/private/preview/${m.contentType}/${m.slug}?locale=${locale}#${hashAnchor}`}
                          className="truncate underline cursor-pointer"
                          onClick={() => handleOpenChange(false)}
                          data-testid={`link-member-${key}`}
                        >
                          {displaySlug}
                        </a>
                      )}
                      <span className="text-muted-foreground text-xs">section {m.sectionIndex}</span>
                      {isSelf && <Badge variant="secondary" className="text-xs">current</Badge>}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 pt-3 border-t space-y-2">
              {confirmLeave ? (
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">Unbind this section from the group? Future changes on this section will not be propagated to the rest of the group.</p>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setConfirmLeave(false)}
                      disabled={isPending}
                      data-testid="button-leave-cancel"
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => unbindCurrentMutation.mutate()}
                      disabled={isPending}
                      data-testid="button-leave-confirm"
                    >
                      {unbindCurrentMutation.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        "Confirm"
                      )}
                    </Button>
                  </div>
                </div>
              ) : confirmDissolve ? (
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-destructive">Dissolve the entire group and all {existingGroup.members.length} sections and changes will be independent from now on.</p>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setConfirmDissolve(false)}
                      disabled={isPending}
                      data-testid="button-dissolve-cancel"
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => dissolveGroupMutation.mutate()}
                      disabled={isPending}
                      data-testid="button-dissolve-confirm"
                    >
                      {dissolveGroupMutation.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        "Confirm"
                      )}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-1"
                    onClick={() => { setShowAddMore(!showAddMore); setSearch(""); setSelectedCandidates(new Set()); }}
                    disabled={isPending || addMoreCandidates.length === 0}
                    data-testid="button-add-more-sections"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add more sections
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-1"
                    onClick={() => setConfirmLeave(true)}
                    disabled={isPending}
                    data-testid="button-leave-group"
                  >
                    <Unlink className="h-3.5 w-3.5" />
                    Leave group
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive gap-1"
                    onClick={() => setConfirmDissolve(true)}
                    disabled={isPending}
                    data-testid="button-dissolve-group"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Dissolve group
                  </Button>
                </div>
              )}
            </div>
          </div>

          {showAddMore && (
            <>
              <div className="relative mt-2">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={`Search ${addMoreCandidates.length} possible sections...`}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8"
                  autoFocus
                  data-testid="input-add-more-search"
                />
              </div>

              <ScrollArea className="flex-1 min-h-0 max-h-[250px]">
                {loadingCandidates ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredAddMoreCandidates.length === 0 ? (
                  <div className="text-center text-muted-foreground py-6 text-sm">
                    {addMoreCandidates.length === 0 ? "No more sections available to add" : "No matching sections found"}
                  </div>
                ) : (
                  <div className="space-y-1 pr-3">
                    {filteredAddMoreCandidates.map(c => {
                      const key = candidateKey(c);
                      const isSelected = selectedCandidates.has(key);
                      return (
                        <div
                          key={key}
                          className="flex items-center gap-3 p-2 rounded-md text-sm hover-elevate cursor-pointer"
                          onClick={() => handleToggleCandidate(c)}
                          data-testid={`add-more-candidate-${key}`}
                        >
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => handleToggleCandidate(c)}
                            data-testid={`checkbox-add-more-${key}`}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs shrink-0">{c.contentType}</Badge>
                              <span className="truncate font-medium">{(c.title && c.title !== c.slug) ? c.title : (c.localeSlug || c.slug)}</span>
                            </div>
                            <p className="text-xs text-muted-foreground truncate">
                              {c.localeSlug || c.slug} — section {c.sectionIndex}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>

              {selectedCandidates.size > 0 && (
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => { setShowAddMore(false); setSelectedCandidates(new Set()); setSearch(""); }}
                    data-testid="button-add-more-cancel"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleAddMoreToGroup}
                    disabled={isPending}
                    data-testid="button-add-more-confirm"
                  >
                    {isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Adding...
                      </>
                    ) : (
                      <>
                        <Plus className="h-4 w-4 mr-2" />
                        Add {selectedCandidates.size} section{selectedCandidates.size !== 1 ? "s" : ""} to group
                      </>
                    )}
                  </Button>
                </DialogFooter>
              )}
            </>
          )}
          </>
        )}

        {!existingGroup && (
          <>
            {matchingGroups.length > 0 && (
              <div className="flex items-center gap-1 border-b border-border mb-1">
                <button
                  type="button"
                  className={`px-3 py-1.5 text-sm font-medium border-b-2 transition-colors ${
                    unboundTab === "join"
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground"
                  }`}
                  onClick={() => setUnboundTab("join")}
                  data-testid="tab-join-existing"
                >
                  Join existing group ({matchingGroups.length})
                </button>
                <button
                  type="button"
                  className={`px-3 py-1.5 text-sm font-medium border-b-2 transition-colors ${
                    unboundTab === "create"
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground"
                  }`}
                  onClick={() => setUnboundTab("create")}
                  data-testid="tab-create-new"
                >
                  Create new group
                </button>
              </div>
            )}

            {(unboundTab === "join" && matchingGroups.length > 0) ? (
              <ScrollArea className="flex-1 min-h-0 max-h-[300px]">
                {loadingGroups ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="space-y-2 pr-3">
                    {matchingGroups.map(g => (
                      <div
                        key={g.id}
                        className="rounded-md border border-border p-3 hover-elevate cursor-pointer"
                        onClick={() => setPendingJoinGroup(g)}
                        data-testid={`join-group-${g.id}`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <p className="font-medium text-sm truncate">{g.name || `${g.component} binding`}</p>
                          <Badge variant="secondary" className="text-xs shrink-0">
                            {g.members.length} member{g.members.length !== 1 ? "s" : ""}
                          </Badge>
                        </div>
                        <div className="space-y-0.5">
                          {g.members.map(m => (
                            <p key={`${m.contentType}:${m.slug}:${m.sectionIndex}`} className="text-xs text-muted-foreground truncate">
                              <a
                                href={`/private/preview/${m.contentType}/${m.slug}?locale=${locale}#${g.component}-${m.sectionIndex}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="underline decoration-muted-foreground/40 hover:text-foreground"
                                onClick={(e) => e.stopPropagation()}
                                data-testid={`link-group-member-${m.contentType}:${m.slug}:${m.sectionIndex}`}
                              >
                                {(m as { localeSlug?: string }).localeSlug || m.slug}
                              </a>
                              {" "}— section {m.sectionIndex}
                            </p>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            ) : loadingCandidates ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : availableCandidates.length === 0 ? (
              <div className="text-center py-8 px-4" data-testid="text-no-candidates">
                <p className="text-sm text-muted-foreground">
                  No other sections use the <Badge variant="outline" className="mx-1 text-xs">{component}</Badge> component in this language.
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  A binding group requires at least two sections with the same component. Add this component to another page first.
                </p>
              </div>
            ) : selectableCandidates.length === 0 ? (
              <div className="text-center py-8 px-4" data-testid="text-all-bound">
                <p className="text-sm text-muted-foreground">
                  All other <Badge variant="outline" className="mx-1 text-xs">{component}</Badge> sections are already bound to existing groups.
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  You can join one of those groups from the "Join existing group" tab instead.
                </p>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={`Search ${selectableCandidates.length} possible sections...`}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-8"
                    data-testid="input-binding-search"
                  />
                </div>

                <ScrollArea className="flex-1 min-h-0 max-h-[300px]">
                  {filteredCandidates.length === 0 ? (
                    <div className="text-center text-muted-foreground py-8 text-sm">
                      No matching sections found
                    </div>
                  ) : (
                    <div className="space-y-1 pr-3">
                      {filteredCandidates.map(c => {
                        const key = candidateKey(c);
                        const isBoundElsewhere = !!c.alreadyBound;
                        const isSelected = selectedCandidates.has(key);

                        return (
                          <div
                            key={key}
                            className={`flex items-center gap-3 p-2 rounded-md text-sm ${
                              isBoundElsewhere ? "opacity-50" : "hover-elevate cursor-pointer"
                            }`}
                            onClick={() => {
                              if (isBoundElsewhere) return;
                              handleToggleCandidate(c);
                            }}
                            data-testid={`binding-candidate-${key}`}
                          >
                            {!isBoundElsewhere && (
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => handleToggleCandidate(c)}
                                disabled={isBoundElsewhere || false}
                                data-testid={`checkbox-candidate-${key}`}
                              />
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-xs shrink-0">{c.contentType}</Badge>
                                <span className="truncate font-medium">{(c.title && c.title !== c.slug) ? c.title : (c.localeSlug || c.slug)}</span>
                              </div>
                              <p className="text-xs text-muted-foreground truncate">
                                {c.localeSlug || c.slug} — section {c.sectionIndex} · <span className="uppercase font-medium">{locale}</span>
                              </p>
                            </div>
                            {isBoundElsewhere && (
                              <Badge variant="secondary" className="text-xs shrink-0">
                                {c.alreadyBoundGroupName || "bound elsewhere"}
                              </Badge>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </ScrollArea>
              </>
            )}
          </>
        )}

        {!existingGroup && (unboundTab === "create" || matchingGroups.length === 0) && selectableCandidates.length > 0 && (
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => handleOpenChange(false)}
              data-testid="button-binding-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateBinding}
              disabled={selectedCandidates.size === 0 || isPending}
              data-testid="button-binding-create"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Link className="h-4 w-4 mr-2" />
                  Bind {selectedCandidates.size + 1} sections
                </>
              )}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
