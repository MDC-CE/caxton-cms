import { Fragment, useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import {
  IconAlertTriangle,
  IconAlertCircle,
  IconServerBolt,
  IconBug,
  IconRefresh,
  IconInfoCircle,
  IconChevronRight,
  IconCopy,
  IconArrowUp,
  IconArrowDown,
  IconArrowsSort,
} from "@tabler/icons-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MetricsAccessGate } from "@/components/MetricsAccessGate";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import {
  nextErrorLogSort,
  parseErrorLogSort,
  serializeErrorLogSort,
  sortErrorLogIssues,
  type ErrorLogSort,
  type ErrorLogSortKey,
} from "./error-log-sort";

type LevelFilter = "all" | "error" | "warn";

interface ErrorLogEntry {
  id: number;
  ts: number;
  level: "error" | "warn";
  module: string;
  message: string;
  err_name: string | null;
}

interface UniqueIssue {
  fingerprint: string;
  module: string;
  level: "error" | "warn";
  message: string;
  err_name: string | null;
  count: number;
  lastTs: number;
  lastId: number;
  sampleTs: number[];
}

interface ErrorLogEntryDetail {
  id: number;
  ts: number;
  level: "error" | "warn";
  module: string;
  message: string;
  err_name: string | null;
  err_stack: string | null;
  context: Record<string, unknown> | null;
}

class ErrorLogDetailFetchError extends Error {
  status: number;
  constructor(status: number) {
    super(`Failed to fetch error log entry (${status})`);
    this.status = status;
  }
}

interface ErrorLogResponse {
  totalErrors: number;
  totalWarnings: number;
  uniqueIssues: UniqueIssue[];
  topIssue: string | null;
  recent: ErrorLogEntry[];
}

function formatTs(ts: number) {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function LevelBadge({ level }: { level: "error" | "warn" }) {
  if (level === "error") {
    return (
      <Badge variant="destructive" className="text-xs font-mono uppercase">
        error
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-xs font-mono uppercase text-amber-600 border-amber-400">
      warn
    </Badge>
  );
}

function MessageWithErrorType({ message, errName }: { message: string; errName: string | null }) {
  return (
    <div className="flex flex-col items-start gap-1">
      {errName && (
        <Badge
          variant="outline"
          className="text-[10px] font-mono px-1.5 py-0 border-transparent bg-destructive/10 text-destructive"
        >
          {errName}
        </Badge>
      )}
      <span className="line-clamp-2">{message}</span>
    </div>
  );
}

function formatContextValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

function buildCopyText(
  entry: ErrorLogEntryDetail,
  opts: { count?: number; sampleTs?: number[] },
): string {
  const lines = [
    `Error log entry #${entry.id}`,
    `Level: ${entry.level}`,
    `Module: ${entry.module}`,
    `Message: ${entry.message}`,
    `Error type: ${entry.err_name ?? "—"}`,
    `Time: ${new Date(entry.ts).toISOString()}`,
  ];
  if (opts.count != null) lines.push(`Count (last 48h): ${opts.count}`);
  if (opts.sampleTs && opts.sampleTs.length > 0) {
    lines.push(`Recent occurrences: ${opts.sampleTs.map((ts) => new Date(ts).toISOString()).join(", ")}`);
  }
  lines.push("", "Context:", entry.context ? JSON.stringify(entry.context, null, 2) : "(none)");
  lines.push("", "Stack:", entry.err_stack ?? "(none)");
  return lines.join("\n");
}

function ErrorLogDetail({
  id,
  count,
  sampleTs,
}: {
  id: number;
  count?: number;
  sampleTs?: number[];
}) {
  const { toast } = useToast();
  const { data, isLoading, error } = useQuery<ErrorLogEntryDetail, ErrorLogDetailFetchError>({
    queryKey: ["/api/admin/error-log", "entry", id],
    queryFn: async () => {
      const res = await apiFetch(`/api/admin/error-log/${id}`);
      if (!res.ok) throw new ErrorLogDetailFetchError(res.status);
      return res.json();
    },
    retry: (failures, err) => err.status !== 404 && failures < 2,
    staleTime: Infinity,
  });

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading details…</p>;
  }
  if (error) {
    return (
      <p className="text-sm text-muted-foreground" data-testid={`error-log-detail-error-${id}`}>
        {error.status === 404
          ? "This entry was pruned (older than 48 hours)."
          : "Could not load details for this entry. Try Refresh."}
      </p>
    );
  }
  if (!data) return null;

  const contextEntries = data.context ? Object.entries(data.context) : [];
  const hasDetails = contextEntries.length > 0 || !!data.err_stack;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(buildCopyText(data, { count, sampleTs }));
      toast({ title: "Details copied", description: "Paste them to a developer or an agent.", duration: 2000 });
    } catch {
      toast({ title: "Copy failed", description: "Your browser blocked clipboard access.", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4" data-testid={`error-log-detail-${id}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Latest occurrence of this issue. Copy details to share with a developer or an agent.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={handleCopy}
          data-testid={`button-copy-error-log-${id}`}
        >
          <IconCopy className="w-4 h-4 mr-2" />
          Copy details
        </Button>
      </div>

      {sampleTs && sampleTs.length > 1 && (
        <div className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Recent occurrences: </span>
          <span className="font-mono">{sampleTs.map(formatTs).join(" · ")}</span>
        </div>
      )}

      {!hasDetails && (
        <p className="text-sm text-muted-foreground">
          No extra details were recorded for this entry (it may predate detail capture).
        </p>
      )}

      {contextEntries.length > 0 && (
        <div className="space-y-1.5">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Context</h4>
          <dl className="grid grid-cols-[minmax(6rem,auto)_1fr] gap-x-4 gap-y-1 rounded-md border bg-background p-3 text-xs">
            {contextEntries.map(([key, value]) => (
              <Fragment key={key}>
                <dt className="font-mono text-muted-foreground">{key}</dt>
                <dd className="font-mono text-foreground whitespace-pre-wrap break-all">
                  {formatContextValue(value)}
                </dd>
              </Fragment>
            ))}
          </dl>
        </div>
      )}

      {data.err_stack && (
        <div className="space-y-1.5">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Stack</h4>
          <pre className="max-h-80 overflow-auto rounded-md border bg-background p-3 text-xs font-mono text-foreground whitespace-pre">
            {data.err_stack}
          </pre>
        </div>
      )}
    </div>
  );
}

function ExpandChevron({ open }: { open: boolean }) {
  return (
    <IconChevronRight
      className={cn("w-4 h-4 text-muted-foreground transition-transform", open && "rotate-90")}
      aria-hidden
    />
  );
}

function SortableHead({
  col,
  label,
  sort,
  onSort,
  className,
  align = "left",
}: {
  col: ErrorLogSortKey;
  label: string;
  sort: ErrorLogSort;
  onSort: (col: ErrorLogSortKey) => void;
  className?: string;
  align?: "left" | "right";
}) {
  const active = sort.key === col;
  const Icon = !active ? IconArrowsSort : sort.dir === "asc" ? IconArrowUp : IconArrowDown;
  return (
    <TableHead
      className={className}
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground",
          align === "right" && "w-full justify-end",
          active && "text-foreground",
        )}
        onClick={() => onSort(col)}
        data-testid={`sort-error-log-${col}`}
      >
        {label}
        <Icon className={cn("w-3 h-3", !active && "opacity-40")} aria-hidden />
      </button>
    </TableHead>
  );
}

export default function ErrorLogPage() {
  return (
    <MetricsAccessGate>
      <ErrorLogPageInner />
    </MetricsAccessGate>
  );
}

function ErrorLogPageInner() {
  const [levelFilter, setLevelFilter] = useState<LevelFilter>("all");
  const [openIssue, setOpenIssue] = useState<string | null>(null);
  const [openEventId, setOpenEventId] = useState<number | null>(null);

  const { data, isLoading, refetch, isFetching, isError } = useQuery<ErrorLogResponse>({
    queryKey: ["/api/admin/error-log", levelFilter],
    queryFn: async () => {
      const params = levelFilter !== "all" ? `?level=${levelFilter}` : "";
      const res = await apiFetch(`/api/admin/error-log${params}`);
      if (!res.ok) throw new Error("Failed to fetch error log");
      return res.json();
    },
    refetchInterval: 30000,
  });

  const [pathname, setLocation] = useLocation();
  const searchString = useSearch();
  const sort = useMemo(() => parseErrorLogSort(searchString), [searchString]);
  const handleSort = useCallback(
    (col: ErrorLogSortKey) => {
      const qs = serializeErrorLogSort(nextErrorLogSort(sort, col), searchString);
      const pathOnly = pathname.split("?")[0];
      setLocation(qs ? `${pathOnly}?${qs}` : pathOnly, { replace: true });
    },
    [sort, searchString, pathname, setLocation],
  );
  const sortedIssues = useMemo(
    () => sortErrorLogIssues(data?.uniqueIssues ?? [], sort),
    [data?.uniqueIssues, sort],
  );

  const topIssueModule = data?.uniqueIssues?.[0]?.module ?? "—";

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Error &amp; Warning Log</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Server-side warn/error events — last 48 hours</p>
        </div>
        <Button
          variant="outline"
          size="default"
          onClick={() => refetch()}
          disabled={isFetching}
          data-testid="button-refresh-error-log"
        >
          <IconRefresh className={`w-4 h-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="flex items-start gap-3 rounded-md border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
        <IconInfoCircle className="h-4 w-4 mt-0.5 shrink-0 text-foreground/60" />
        <div className="space-y-2">
          <p>
            This log is <strong className="text-foreground font-medium">centralized across all sites</strong>.
            It captures process-level errors and warnings from the entire server, not just the currently active site.
          </p>
          <p>
            The main table lists <strong className="text-foreground font-medium">unique issues</strong> (same message shape collapsed).
            Repeated warnings are rate-limited when stored so totals stay usable.
            The DebugBubble badge counts <strong className="text-foreground font-medium">errors only</strong>.
          </p>
          <details className="text-xs">
            <summary className="cursor-pointer text-foreground/80 hover:text-foreground">
              Read more (advanced)
            </summary>
            <ul className="mt-2 list-disc pl-4 space-y-1 font-mono">
              <li>server/db.ts — SQLite warn sink rate-limit</li>
              <li>server/logger.ts — DbLogStream (warn+)</li>
              <li>server/utils/error-log-fingerprint.ts — message normalize</li>
              <li>server/utils/error-log-context.ts — what is saved in Context, sensitive keys redacted, 4 KB cap</li>
              <li>server/routes/admin.ts — GET /api/admin/error-log, GET /api/admin/error-log/:id</li>
            </ul>
          </details>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card data-testid="card-total-errors">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Errors</CardTitle>
            <IconAlertCircle className="w-4 h-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold" data-testid="text-total-errors">
              {isLoading ? "—" : (data?.totalErrors ?? 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">last 48h</p>
          </CardContent>
        </Card>

        <Card data-testid="card-total-warnings">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Warnings</CardTitle>
            <IconAlertTriangle className="w-4 h-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold" data-testid="text-total-warnings">
              {isLoading ? "—" : (data?.totalWarnings ?? 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">last 48h (after rate-limit)</p>
          </CardContent>
        </Card>

        <Card data-testid="card-top-module">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Top Issue Module</CardTitle>
            <IconServerBolt className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-base font-semibold truncate" data-testid="text-top-module">
              {isLoading ? "—" : topIssueModule}
            </div>
            <p className="text-xs text-muted-foreground mt-1">from top unique issue</p>
          </CardContent>
        </Card>

        <Card data-testid="card-top-issue">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Top Issue Type</CardTitle>
            <IconBug className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-base font-semibold truncate" data-testid="text-top-issue">
              {isLoading ? "—" : (data?.topIssue ?? "—")}
            </div>
            <p className="text-xs text-muted-foreground mt-1">most common error name</p>
          </CardContent>
        </Card>
      </div>

      {data?.uniqueIssues && data.uniqueIssues.length > 0 && (
        <Card data-testid="card-unique-issues">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Top unique issues</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Same message shape collapsed. Errors first, then by count, unless you sort by Count or Last seen
              (click again to flip, a third time to reset). Last seen shows the most recent occurrence.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" aria-label="Expand" />
                  <TableHead className="w-20">Level</TableHead>
                  <TableHead className="w-44">Module</TableHead>
                  <TableHead>Message</TableHead>
                  <SortableHead
                    col="count"
                    label="Count"
                    sort={sort}
                    onSort={handleSort}
                    className="text-right w-24"
                    align="right"
                  />
                  <SortableHead
                    col="lastSeen"
                    label="Last seen"
                    sort={sort}
                    onSort={handleSort}
                    className="w-40"
                  />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedIssues.map((row, idx) => {
                  const open = openIssue === row.fingerprint;
                  const toggle = () => setOpenIssue(open ? null : row.fingerprint);
                  return (
                    <Fragment key={row.fingerprint}>
                      <TableRow
                        data-testid={`row-unique-issue-${idx}`}
                        className="cursor-pointer"
                        onClick={toggle}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggle();
                          }
                        }}
                        tabIndex={0}
                        aria-expanded={open}
                      >
                        <TableCell className="pr-0">
                          <ExpandChevron open={open} />
                        </TableCell>
                        <TableCell>
                          <LevelBadge level={row.level} />
                        </TableCell>
                        <TableCell className="font-mono text-sm">{row.module}</TableCell>
                        <TableCell className="text-sm text-foreground max-w-md">
                          <MessageWithErrorType message={row.message} errName={row.err_name} />
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {row.count}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                          {formatTs(row.lastTs)}
                        </TableCell>
                      </TableRow>
                      {open && (
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={6} className="bg-muted/40 p-4">
                            <ErrorLogDetail id={row.lastId} count={row.count} sampleTs={row.sampleTs} />
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card data-testid="card-recent-events">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Recent Events</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Latest raw rows as stored (warnings already rate-limited at ingest).
              </p>
            </div>
            <div className="flex gap-1" role="group" aria-label="Filter by level">
              {(["all", "error", "warn"] as LevelFilter[]).map((f) => (
                <Button
                  key={f}
                  variant={levelFilter === f ? "default" : "outline"}
                  size="sm"
                  onClick={() => setLevelFilter(f)}
                  data-testid={`button-filter-${f}`}
                >
                  {f === "all" ? "All" : f === "error" ? "Errors" : "Warnings"}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-center text-muted-foreground text-sm">Loading…</div>
          ) : isError ? (
            <div className="p-6 text-center text-destructive text-sm" data-testid="error-log-fetch-error">
              Failed to load error log. Check that you are signed in.
            </div>
          ) : !data?.recent || data.recent.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm">
              No events in the last 48 hours.
            </div>
          ) : (
            <div className="overflow-auto max-h-[480px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" aria-label="Expand" />
                    <TableHead className="w-40">Time</TableHead>
                    <TableHead className="w-20">Level</TableHead>
                    <TableHead className="w-44">Module</TableHead>
                    <TableHead>Message</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.recent.map((entry) => {
                    const open = openEventId === entry.id;
                    const toggle = () => setOpenEventId(open ? null : entry.id);
                    return (
                      <Fragment key={entry.id}>
                        <TableRow
                          data-testid={`row-event-${entry.id}`}
                          className="cursor-pointer"
                          onClick={toggle}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              toggle();
                            }
                          }}
                          tabIndex={0}
                          aria-expanded={open}
                        >
                          <TableCell className="pr-0">
                            <ExpandChevron open={open} />
                          </TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                            {formatTs(entry.ts)}
                          </TableCell>
                          <TableCell>
                            <LevelBadge level={entry.level} />
                          </TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground truncate max-w-[10rem]">
                            {entry.module}
                          </TableCell>
                          <TableCell className="text-sm text-foreground max-w-xs">
                            <MessageWithErrorType message={entry.message} errName={entry.err_name} />
                          </TableCell>
                        </TableRow>
                        {open && (
                          <TableRow className="hover:bg-transparent">
                            <TableCell colSpan={5} className="bg-muted/40 p-4">
                              <ErrorLogDetail id={entry.id} />
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
