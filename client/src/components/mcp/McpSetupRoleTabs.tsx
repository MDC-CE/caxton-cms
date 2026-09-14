import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

export interface McpSetupRoleOption {
  id: string;
  label: string;
  description?: string;
}

export interface McpSetupRoleTabsProps {
  /** `undefined` = nothing selected yet. */
  value: string | undefined;
  onValueChange: (roleId: string) => void;
  roles: McpSetupRoleOption[];
  className?: string;
  triggerClassName?: string;
  /** Placeholder when value is undefined. */
  placeholder?: string;
  listTestId?: string;
}

/** Single-role picker for MCP connector setup (role connectors only — no plain /mcp). */
export function McpSetupRoleTabs({
  value,
  onValueChange,
  roles,
  className,
  triggerClassName,
  placeholder = "Select a role",
  listTestId = "select-mcp-setup-role",
}: McpSetupRoleTabsProps) {
  const displayLabel = value ? roles.find((r) => r.id === value)?.label ?? value : null;

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger
        className={cn("w-full sm:max-w-xs", triggerClassName, className)}
        data-testid={listTestId}
      >
        {displayLabel ? (
          <span className="truncate">{displayLabel}</span>
        ) : (
          <SelectValue placeholder={placeholder} />
        )}
      </SelectTrigger>
      <SelectContent data-testid={`${listTestId}-content`}>
        {roles.map((role) => (
          <SelectItem
            key={role.id}
            value={role.id}
            data-testid={`${listTestId}-${role.id}`}
          >
            {role.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export interface McpSetupRoleMultiSelectProps {
  value: string[];
  onValueChange: (roleIds: string[]) => void;
  roles: McpSetupRoleOption[];
  className?: string;
  listTestId?: string;
}

/** Multi-select checklist of assigned roles for MCP connector setup. */
export function McpSetupRoleMultiSelect({
  value,
  onValueChange,
  roles,
  className,
  listTestId = "select-mcp-setup-roles",
}: McpSetupRoleMultiSelectProps) {
  const selected = new Set(value);

  function toggle(roleId: string) {
    const next = new Set(selected);
    if (next.has(roleId)) next.delete(roleId);
    else next.add(roleId);
    onValueChange(Array.from(next));
  }

  if (roles.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid={`${listTestId}-empty`}>
        No agent roles assigned to your account. Ask a user admin to grant swarm agent roles
        (for example Copy Editor or Media Editor), then refresh this page.
      </p>
    );
  }

  return (
    <ul
      className={cn(
        "rounded-md border border-card-border divide-y divide-border overflow-hidden",
        className,
      )}
      data-testid={listTestId}
    >
      {roles.map((role) => {
        const checked = selected.has(role.id);
        const id = `${listTestId}-${role.id}`;
        const description = role.description?.trim();
        return (
          <li key={role.id}>
            <label
              htmlFor={id}
              className="flex items-start gap-3 px-3 py-2.5 text-sm cursor-pointer hover:bg-muted/40"
              data-testid={`${listTestId}-option-${role.id}`}
            >
              <Checkbox
                id={id}
                checked={checked}
                onCheckedChange={() => toggle(role.id)}
                className="mt-0.5"
                data-testid={`${listTestId}-check-${role.id}`}
              />
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex items-center gap-3">
                  <span className="min-w-0 truncate text-foreground">{role.label}</span>
                  <code className="ml-auto shrink-0 text-[11px] font-mono text-muted-foreground">
                    /mcp/role/{role.id}
                  </code>
                </div>
                {description ? (
                  <p className="text-xs text-muted-foreground leading-snug">
                    {description}
                  </p>
                ) : null}
              </div>
            </label>
          </li>
        );
      })}
    </ul>
  );
}
