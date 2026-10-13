import { HardDrive } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { LeadsLocalCopy } from "@shared/leads-query";

/** Dev only: says the numbers come from this machine's database, not live production. */
export function LeadsLocalCopyBanner({ localCopy }: { localCopy?: LeadsLocalCopy }) {
  if (!import.meta.env.DEV || !localCopy) return null;
  const pulled = localCopy.pulled_at != null ? new Date(localCopy.pulled_at) : null;
  const since = localCopy.since != null ? new Date(localCopy.since) : null;
  return (
    <Alert data-testid="banner-leads-local-copy">
      <HardDrive className="h-4 w-4" />
      <AlertTitle>Local copy</AlertTitle>
      <AlertDescription className="text-xs">
        {pulled ? (
          <>
            Leads were last downloaded from production on {pulled.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
            {since ? `, covering leads since ${since.toLocaleDateString(undefined, { dateStyle: "medium", timeZone: "UTC" })} (about the last 90 days)` : ""}.
            Older numbers and leads you submitted while testing come from this machine, so they will not match the live site.
          </>
        ) : (
          <>
            Never downloaded from production. You are seeing only leads submitted on this machine. Use Download from production to
            see real numbers.
          </>
        )}
      </AlertDescription>
    </Alert>
  );
}
