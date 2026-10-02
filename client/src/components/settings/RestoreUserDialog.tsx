import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { IconLoader2, IconRestore } from "@tabler/icons-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiFetch, queryClient } from "@/lib/queryClient";

export interface RestorableUser {
  username: string;
  staffId?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  deletedAt?: string;
  deletedBy?: string;
}

interface RoleOption {
  label: string;
  agentic?: boolean;
}

function displayName(user: RestorableUser): string {
  return [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.username;
}

/**
 * The only UI that restores a soft-deleted staff user. Opened from the add-user form,
 * the Previously Deleted pending card, and the Deleted users list.
 */
export function RestoreUserDialog({
  user,
  open,
  onOpenChange,
  intro,
  onRestored,
}: {
  user: RestorableUser | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  intro?: string;
  onRestored?: (username: string) => void;
}) {
  const { toast } = useToast();
  const [roles, setRoles] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const { data: rolesResponse } = useQuery<{ roles: Record<string, RoleOption> }>({
    queryKey: ["/api/admin/roles"],
    enabled: open,
  });
  const allRoles = Object.entries(rolesResponse?.roles ?? {});

  useEffect(() => {
    if (open) setRoles([]);
  }, [open, user?.username]);

  async function handleRestore() {
    if (!user || roles.length === 0) return;
    setSaving(true);
    try {
      const res = await apiFetch(`/api/admin/users/${encodeURIComponent(user.username)}/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roles }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to restore user");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users/deleted"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pending-users"] });
      toast({
        title: "User restored",
        description: `${displayName(user)} can sign in again with the roles you picked.`,
      });
      onRestored?.(user.username);
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Failed to restore user", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="max-w-lg" data-testid="dialog-restore-user">
        <DialogHeader>
          <DialogTitle>Restore {user ? displayName(user) : "user"}?</DialogTitle>
          <DialogDescription>
            {intro ?? "Restoring brings back their original account, so their history stays linked."}{" "}
            Choose what they can access.
          </DialogDescription>
        </DialogHeader>

        {user && (
          <div className="space-y-4">
            <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1">
              <p className="text-sm font-medium text-foreground">{displayName(user)}</p>
              {user.email && <p className="text-muted-foreground">{user.email}</p>}
              {user.deletedAt && (
                <p className="text-muted-foreground">
                  Deleted {new Date(user.deletedAt).toLocaleDateString()}
                  {user.deletedBy ? ` by ${user.deletedBy}` : ""}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Roles</p>
              <div className="grid grid-cols-2 gap-1.5">
                {allRoles.map(([roleId, role]) => (
                  <div key={roleId} className="flex items-center gap-2">
                    <Checkbox
                      id={`restore-role-${roleId}`}
                      checked={roles.includes(roleId)}
                      onCheckedChange={(checked) =>
                        setRoles(checked ? [...roles, roleId] : roles.filter((r) => r !== roleId))
                      }
                      data-testid={`checkbox-restore-role-${roleId}`}
                    />
                    <label
                      htmlFor={`restore-role-${roleId}`}
                      className="text-xs cursor-pointer inline-flex items-center gap-1.5"
                    >
                      {role.label}
                      {role.agentic && (
                        <Badge variant="outline" className="text-[10px] px-1 py-0">Agent</Badge>
                      )}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            data-testid="button-cancel-restore-user"
          >
            Cancel
          </Button>
          <Button
            onClick={handleRestore}
            disabled={!user || roles.length === 0 || saving}
            data-testid="button-confirm-restore-user"
          >
            {saving ? (
              <IconLoader2 className="h-4 w-4 animate-spin" />
            ) : (
              <IconRestore className="h-4 w-4" />
            )}
            Restore
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
