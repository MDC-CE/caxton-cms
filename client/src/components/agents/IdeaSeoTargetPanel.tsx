import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type IdeaSeoTarget = {
  main_keyword: string;
  cluster:
    | { mode: "join"; pillar_path: string }
    | { mode: "hub"; members: Array<{ contentType: string; slug: string }> }
    | { mode: "standalone"; reason: string };
};

type ClusterMode = IdeaSeoTarget["cluster"]["mode"];

type SeoOverviewClusters = {
  clusters: Array<{ pillarUrl: string; clusterCount: number; keyword?: string | null }>;
};

const REASON_MIN = 40;
const STANDALONE_LABELS = new Set(["fast_decay_news", "broken_url"]);

export function describeIdeaSeoTarget(t: IdeaSeoTarget): string {
  const c = t.cluster;
  const where =
    c.mode === "join"
      ? `joins ${c.pillar_path}`
      : c.mode === "hub"
        ? `new hub for ${c.members.map((m) => `${m.contentType}/${m.slug}`).join(", ")}`
        : "no hub (standalone)";
  return `“${t.main_keyword}” · ${where}`;
}

function parseMembers(raw: string): Array<{ contentType: string; slug: string }> {
  return raw
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [contentType, ...rest] = s.split("/");
      return { contentType: contentType.trim(), slug: rest.join("/").trim() };
    })
    .filter((m) => m.contentType && m.slug);
}

export function IdeaSeoTargetPanel(props: {
  target: IdeaSeoTarget | null | undefined;
  /** Open ideas are editable (proposer / staff); accepted ideas are read-only. */
  editable: boolean;
  locked: boolean;
  /** Idea's declared demand label (review_situations). */
  reviewSituations?: string[];
  /** Locale of the page this idea will create (hub list is filtered to it). */
  locale?: string | null;
  pending: boolean;
  onSave: (target: IdeaSeoTarget) => void;
}) {
  const { target, editable, locked, reviewSituations, locale, pending, onSave } = props;
  const standaloneAllowed = (reviewSituations ?? []).some((s) => STANDALONE_LABELS.has(s));

  const [keyword, setKeyword] = useState("");
  const [mode, setMode] = useState<ClusterMode>("join");
  const [pillarPath, setPillarPath] = useState("");
  const [membersRaw, setMembersRaw] = useState("");
  const [reason, setReason] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    if (!target) return;
    setKeyword(target.main_keyword);
    setMode(target.cluster.mode);
    if (target.cluster.mode === "join") setPillarPath(target.cluster.pillar_path);
    if (target.cluster.mode === "hub")
      setMembersRaw(target.cluster.members.map((m) => `${m.contentType}/${m.slug}`).join("\n"));
    if (target.cluster.mode === "standalone") setReason(target.cluster.reason);
  }, [target]);

  const { data: overview } = useQuery<SeoOverviewClusters>({
    queryKey: ["/api/seo/overview"],
    enabled: editable,
  });
  const hubs = useMemo(() => {
    const all = overview?.clusters ?? [];
    const prefix = locale ? `/${locale.toLowerCase()}/` : null;
    return prefix ? all.filter((c) => c.pillarUrl.toLowerCase().startsWith(prefix)) : all;
  }, [overview, locale]);

  const members = parseMembers(membersRaw);
  const canSave =
    !pending &&
    keyword.trim().length > 0 &&
    (mode === "join"
      ? pillarPath.trim().length > 0
      : mode === "hub"
        ? members.length > 0
        : standaloneAllowed && reason.trim().length >= REASON_MIN);

  const save = () => {
    const cluster: IdeaSeoTarget["cluster"] =
      mode === "join"
        ? { mode, pillar_path: pillarPath.trim() }
        : mode === "hub"
          ? { mode, members }
          : { mode, reason: reason.trim() };
    onSave({ main_keyword: keyword.trim(), cluster });
  };

  return (
    <div
      className="space-y-2 rounded-md border border-card-border bg-muted/20 px-3 py-2.5"
      data-testid="proposal-idea-seo-target"
    >
      <p className="text-xs text-muted-foreground">
        {locked
          ? "SEO target locked at accept (read-only). It was copied into the new page's draft."
          : "Which search this new page should win and which topic hub it joins. Locked when the idea is accepted and copied into the new page."}
      </p>
      {target ? (
        <Badge variant="secondary" className="font-normal" data-testid="badge-idea-seo-target">
          {describeIdeaSeoTarget(target)}
        </Badge>
      ) : (
        <p className="text-xs text-amber-600 dark:text-amber-400" data-testid="text-idea-seo-target-missing">
          No SEO target yet. New pages on SEO-tracked types cannot be accepted without one.
        </p>
      )}
      {target?.cluster.mode === "standalone" ? (
        <p className="text-xs text-muted-foreground" data-testid="text-idea-seo-standalone-reason">
          Why no hub: {target.cluster.reason}
        </p>
      ) : null}

      {editable ? (
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="space-y-1 sm:col-span-3">
            <Label htmlFor="idea-seo-keyword" className="text-xs">
              Main keyword
            </Label>
            <Input
              id="idea-seo-keyword"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="review ai generated code"
              data-testid="input-idea-seo-keyword"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="idea-seo-mode" className="text-xs">
              Topic hub
            </Label>
            <select
              id="idea-seo-mode"
              className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
              value={mode}
              onChange={(e) => setMode(e.target.value as ClusterMode)}
              data-testid="select-idea-seo-mode"
            >
              <option value="join">Join an existing hub</option>
              <option value="hub">This page becomes a hub</option>
              <option value="standalone" disabled={!standaloneAllowed}>
                No hub{standaloneAllowed ? "" : " (news / broken-URL ideas only)"}
              </option>
            </select>
          </div>
          <div className="space-y-1 sm:col-span-2">
            {mode === "join" ? (
              <>
                <Label htmlFor="idea-seo-hub" className="text-xs">
                  Hub{locale ? ` (${locale})` : ""}
                </Label>
                <select
                  id="idea-seo-hub"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
                  value={pillarPath}
                  onChange={(e) => setPillarPath(e.target.value)}
                  data-testid="select-idea-seo-hub"
                >
                  <option value="">Pick a live hub…</option>
                  {pillarPath && !hubs.some((h) => h.pillarUrl === pillarPath) ? (
                    <option value={pillarPath}>{pillarPath}</option>
                  ) : null}
                  {hubs.map((h) => (
                    <option key={h.pillarUrl} value={h.pillarUrl}>
                      {h.pillarUrl}
                      {h.keyword ? ` — ${h.keyword}` : ""} ({h.clusterCount})
                    </option>
                  ))}
                </select>
              </>
            ) : mode === "hub" ? (
              <>
                <Label htmlFor="idea-seo-members" className="text-xs">
                  Posts that will join this hub (one per line, type/slug)
                </Label>
                <Textarea
                  id="idea-seo-members"
                  value={membersRaw}
                  onChange={(e) => setMembersRaw(e.target.value)}
                  placeholder={"blog/some-existing-post"}
                  rows={2}
                  data-testid="textarea-idea-seo-members"
                />
                <p className="text-xs text-muted-foreground">
                  Name at least one existing post that will join this hub.
                </p>
              </>
            ) : (
              <>
                <Label htmlFor="idea-seo-reason" className="text-xs">
                  Why this page needs no hub
                </Label>
                <Textarea
                  id="idea-seo-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  data-testid="textarea-idea-seo-reason"
                />
                <p className="text-xs text-muted-foreground">
                  {reason.trim().length}/{REASON_MIN} characters minimum.
                </p>
              </>
            )}
          </div>
          <div className="sm:col-span-3">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={!canSave}
              onClick={save}
              data-testid="button-save-idea-seo-target"
            >
              Save SEO target
            </Button>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        className="text-xs text-muted-foreground underline-offset-2 hover:underline"
        onClick={() => setShowAdvanced((v) => !v)}
        data-testid="button-idea-seo-advanced"
      >
        {showAdvanced ? "Hide advanced details" : "Read more (advanced)"}
      </button>
      {showAdvanced ? (
        <div className="space-y-1 text-xs text-muted-foreground">
          <p>
            On the implementing edit, the target is written as <code className="font-mono">seo.main_keyword</code>{" "}
            plus <code className="font-mono">seo.pillar_path</code> (join), <code className="font-mono">seo.is_pillar: true</code>{" "}
            (hub), or <code className="font-mono">seo.pillar_path: null</code> (no hub) into{" "}
            <code className="font-mono">draft.{"{locale}"}.yml</code>. First publish copies it to live and{" "}
            <code className="font-mono">seo-index.json</code>.
          </p>
          <p>
            Accept checks the hub is live and in the same language, and that no live page or other accepted idea
            already targets the keyword. A renamed hub is followed; a deleted hub stops apply. Edits that change the
            keyword or hub need an override reason. Other languages pick their own keyword and hub when translated.
          </p>
        </div>
      ) : null}
    </div>
  );
}
