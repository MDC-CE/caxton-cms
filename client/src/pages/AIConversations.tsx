import { useState, useRef, useEffect } from "react";
import { Brain, ChevronDown, ChevronRight, Filter, Loader2, ThumbsDown, ThumbsUp } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { PrivateHistoryBackButton } from "@/components/private/PrivateHistoryBackButton";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { getDebugToken } from "@/hooks/useDebugAuth";

interface ConversationMessage {
  id: string;
  role: string;
  content: string;
  question_tag: string | null;
  rating: string | null;
  rated_by: string | null;
  rated_at: string | null;
  override_content: string | null;
  override_by: string | null;
  override_at: string | null;
  created_at: string;
}

interface ConversationItem {
  id: string;
  page_url: string | null;
  content_type: string | null;
  content_slug: string | null;
  locale: string | null;
  feature_tags: string[];
  started_at: string;
  messages: ConversationMessage[];
}

interface ClusterResult {
  tag: string;
  count: number;
  examples: string[];
}

export default function AIConversations() {
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [pageUrl, setPageUrl] = useState("");
  const [questionTag, setQuestionTag] = useState("");
  const [ratingFilter, setRatingFilter] = useState("");
  const [expandedConvs, setExpandedConvs] = useState<Set<string>>(new Set());
  const [overrideInputs, setOverrideInputs] = useState<Record<string, string>>({});
  const [clusterResults, setClusterResults] = useState<ClusterResult[] | null>(null);
  const [clusterLoading, setClusterLoading] = useState(false);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [featureTagFilter, setFeatureTagFilter] = useState("");

  const queryParams = new URLSearchParams({
    page: String(page),
    limit: "20",
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo ? { dateTo } : {}),
    ...(pageUrl ? { pageUrl } : {}),
    ...(questionTag ? { questionTag } : {}),
    ...(ratingFilter ? { rating: ratingFilter } : {}),
    ...(featureTagFilter ? { featureTag: featureTagFilter } : {}),
  });

  const { data, isLoading } = useQuery<{ conversations: ConversationItem[]; total: number }>({
    queryKey: ["/api/admin/ai/conversations", queryParams.toString()],
    queryFn: async () => {
      const token = getDebugToken();
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Token ${token}`;
      const res = await fetch(`/api/admin/ai/conversations?${queryParams.toString()}`, { headers });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
  });

  const { data: knowledgeData } = useQuery<{ empty_conversation_grace_minutes: number }>({
    queryKey: ["/api/admin/ai/knowledge"],
    queryFn: async () => {
      const token = getDebugToken();
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Token ${token}`;
      const res = await fetch("/api/admin/ai/knowledge", { headers });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
  });

  const graceMinutes = knowledgeData?.empty_conversation_grace_minutes ?? 15;
  const [editingGrace, setEditingGrace] = useState(false);
  const [graceInputValue, setGraceInputValue] = useState(String(graceMinutes));
  const graceInputRef = useRef<HTMLInputElement>(null);
  const graceSavingRef = useRef(false);

  useEffect(() => {
    setGraceInputValue(String(graceMinutes));
  }, [graceMinutes]);

  useEffect(() => {
    if (editingGrace && graceInputRef.current) {
      graceInputRef.current.focus();
      graceInputRef.current.select();
    }
  }, [editingGrace]);

  const saveGraceMinutes = async (value: string) => {
    if (graceSavingRef.current) return;
    setEditingGrace(false);
    const parsed = parseInt(value, 10);
    if (parsed === graceMinutes) {
      setGraceInputValue(String(graceMinutes));
      return;
    }
    if (isNaN(parsed) || parsed < 1) {
      setGraceInputValue(String(graceMinutes));
      toast({ title: "Please enter a positive number", variant: "destructive" });
      return;
    }
    graceSavingRef.current = true;
    try {
      const token = getDebugToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Token ${token}`;
      const res = await fetch("/api/admin/ai/knowledge", {
        method: "PATCH",
        headers,
        body: JSON.stringify({ empty_conversation_grace_minutes: parsed }),
      });
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      queryClient.setQueryData<{ empty_conversation_grace_minutes: number }>(
        ["/api/admin/ai/knowledge"],
        (old) => ({ ...old, empty_conversation_grace_minutes: parsed }),
      );
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ai/knowledge"] });
      toast({ title: "Grace period updated" });
    } catch {
      setGraceInputValue(String(graceMinutes));
      toast({ title: "Failed to update grace period", variant: "destructive" });
    } finally {
      graceSavingRef.current = false;
    }
  };

  const toggleConversation = (id: string) => {
    setExpandedConvs(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleRate = async (convId: string, msgId: string, rating: "good" | "bad") => {
    try {
      const token = getDebugToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Token ${token}`;

      const res = await fetch(`/api/admin/ai/conversations/${convId}/messages/${msgId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ rating }),
      });
      if (!res.ok) throw new Error(`Rate failed: ${res.status}`);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ai/conversations"] });
      toast({ title: "Rating saved" });
    } catch {
      toast({ title: "Failed to save rating", variant: "destructive" });
    }
  };

  const handleOverride = async (convId: string, msgId: string) => {
    const content = overrideInputs[msgId];
    if (!content?.trim()) return;

    try {
      const token = getDebugToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Token ${token}`;

      const res = await fetch(`/api/admin/ai/conversations/${convId}/messages/${msgId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ override_content: content }),
      });
      if (!res.ok) throw new Error(`Override failed: ${res.status}`);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ai/conversations"] });
      setOverrideInputs(prev => ({ ...prev, [msgId]: "" }));
      toast({ title: "Override saved" });
    } catch {
      toast({ title: "Failed to save override", variant: "destructive" });
    }
  };

  const handleCluster = async () => {
    setClusterLoading(true);
    try {
      const token = getDebugToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Token ${token}`;

      const res = await fetch("/api/admin/ai/conversations/cluster", {
        method: "POST",
        headers,
      });
      if (!res.ok) throw new Error(`Cluster failed: ${res.status}`);
      const data = await res.json();
      setClusterResults(data.clusters || []);
    } catch {
      toast({ title: "Clustering failed", variant: "destructive" });
    } finally {
      setClusterLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <div className="flex items-center gap-3">
          <PrivateHistoryBackButton fallbackHref="/" data-testid="button-back-conversations" iconClassName="h-4 w-4" />
          <div className="flex-1">
            <h1 className="text-2xl font-bold" data-testid="text-conversations-title">Conversation Review</h1>
            <p className="text-sm text-muted-foreground">Review and rate AI chat conversations</p>
          </div>
        </div>

        <Card className="p-4">
          <button
            onClick={() => setFiltersExpanded(!filtersExpanded)}
            className="flex items-center gap-2 w-full text-left"
            data-testid="button-toggle-filters"
          >
            <Filter className="h-4 w-4" />
            <span className="font-semibold text-sm">Filters</span>
            {filtersExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>

          {filtersExpanded && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
              <div>
                <label className="text-xs text-muted-foreground font-medium">From Date</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={e => { setDateFrom(e.target.value); setPage(1); }}
                  className="w-full px-3 py-2 text-sm border rounded-md bg-background"
                  data-testid="input-filter-date-from"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground font-medium">To Date</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={e => { setDateTo(e.target.value); setPage(1); }}
                  className="w-full px-3 py-2 text-sm border rounded-md bg-background"
                  data-testid="input-filter-date-to"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground font-medium">Page URL</label>
                <input
                  type="text"
                  value={pageUrl}
                  onChange={e => { setPageUrl(e.target.value); setPage(1); }}
                  placeholder="Search URL..."
                  className="w-full px-3 py-2 text-sm border rounded-md bg-background"
                  data-testid="input-filter-page-url"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground font-medium">Question Tag</label>
                <input
                  type="text"
                  value={questionTag}
                  onChange={e => { setQuestionTag(e.target.value); setPage(1); }}
                  placeholder="Tag..."
                  className="w-full px-3 py-2 text-sm border rounded-md bg-background"
                  data-testid="input-filter-question-tag"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground font-medium">Rating</label>
                <select
                  value={ratingFilter}
                  onChange={e => { setRatingFilter(e.target.value); setPage(1); }}
                  className="w-full px-3 py-2 text-sm border rounded-md bg-background"
                  data-testid="select-filter-rating"
                >
                  <option value="">All</option>
                  <option value="good">Good</option>
                  <option value="bad">Bad</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground font-medium">Feature Tag</label>
                <input
                  type="text"
                  value={featureTagFilter}
                  onChange={e => { setFeatureTagFilter(e.target.value); setPage(1); }}
                  placeholder="e.g. enrollment, pricing..."
                  className="w-full px-3 py-2 text-sm border rounded-md bg-background"
                  data-testid="input-filter-feature-tag"
                />
              </div>
            </div>
          )}
        </Card>

        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted text-sm text-muted-foreground flex-wrap" data-testid="text-empty-conv-notice">
          <span>Empty conversations older than</span>
          {editingGrace ? (
            <input
              ref={graceInputRef}
              type="number"
              min={1}
              step={1}
              value={graceInputValue}
              onChange={(e) => setGraceInputValue(e.target.value)}
              onBlur={() => saveGraceMinutes(graceInputValue)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveGraceMinutes(graceInputValue);
                if (e.key === "Escape") {
                  setGraceInputValue(String(graceMinutes));
                  setEditingGrace(false);
                }
              }}
              className="w-16 h-7 px-2 text-center text-sm rounded-md border bg-background text-foreground"
              data-testid="input-grace-minutes"
            />
          ) : (
            <button
              onClick={() => setEditingGrace(true)}
              className="inline-flex items-center px-2 h-7 rounded-md border border-dashed cursor-pointer text-sm font-medium text-foreground hover-elevate"
              data-testid="button-edit-grace-minutes"
            >
              {graceMinutes}
            </button>
          )}
          <span>minute{graceMinutes !== 1 ? "s" : ""} are automatically hidden from this list.</span>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !data?.conversations?.length ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>No conversations found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {data.conversations.map(conv => (
              <Card key={conv.id} className="overflow-visible">
                <button
                  onClick={() => toggleConversation(conv.id)}
                  className="w-full p-4 flex items-center justify-between gap-2 text-left hover-elevate rounded-md"
                  data-testid={`button-expand-conv-${conv.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium truncate">{conv.page_url || "Unknown page"}</span>
                      {conv.content_type && <Badge variant="secondary" className="text-xs">{conv.content_type}</Badge>}
                      {conv.feature_tags?.map(tag => (
                        <Badge key={tag} variant="outline" className="text-xs" data-testid={`badge-feature-tag-${conv.id}-${tag}`}>{tag}</Badge>
                      ))}
                      <span className="text-xs text-muted-foreground">
                        {new Date(conv.started_at).toLocaleDateString()} {new Date(conv.started_at).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {conv.messages.length} messages
                    </p>
                  </div>
                  {expandedConvs.has(conv.id) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>

                {expandedConvs.has(conv.id) && (
                  <div className="border-t px-4 py-3 space-y-3">
                    {conv.messages.map(msg => (
                      <div key={msg.id} className="space-y-1" data-testid={`message-${msg.id}`}>
                        <div className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                          <div
                            className={`max-w-[85%] rounded-md px-3 py-2 text-sm whitespace-pre-wrap ${
                              msg.role === "user"
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted"
                            }`}
                          >
                            {msg.content}
                          </div>
                        </div>

                        {msg.role === "assistant" && (
                          <div className="flex items-center gap-2 ml-1 flex-wrap">
                            {msg.question_tag && (
                              <Badge variant="outline" className="text-xs" data-testid={`badge-tag-${msg.id}`}>
                                {msg.question_tag}
                              </Badge>
                            )}

                            {msg.rating ? (
                              <span className="text-xs text-muted-foreground" data-testid={`text-rating-${msg.id}`}>
                                {msg.rating === "good" ? "Rated good" : "Rated bad"} by {msg.rated_by}{msg.rated_at ? ` on ${new Date(msg.rated_at).toLocaleDateString()}` : ""}
                              </span>
                            ) : (
                              <>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleRate(conv.id, msg.id, "good")}
                                  data-testid={`button-rate-good-${msg.id}`}
                                >
                                  <ThumbsUp className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleRate(conv.id, msg.id, "bad")}
                                  data-testid={`button-rate-bad-${msg.id}`}
                                >
                                  <ThumbsDown className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            )}

                            {msg.override_content && (
                              <span className="text-xs text-muted-foreground" data-testid={`text-override-${msg.id}`}>
                                Override by {msg.override_by}{msg.override_at ? ` on ${new Date(msg.override_at).toLocaleDateString()}` : ""}
                              </span>
                            )}
                          </div>
                        )}

                        {msg.role === "assistant" && (
                          <div className="flex items-center gap-2 ml-1">
                            <input
                              type="text"
                              value={overrideInputs[msg.id] || msg.override_content || ""}
                              onChange={e => setOverrideInputs(prev => ({ ...prev, [msg.id]: e.target.value }))}
                              placeholder="Write corrected response..."
                              className="flex-1 px-2 py-1 text-xs border rounded-md bg-background max-w-md"
                              data-testid={`input-override-${msg.id}`}
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleOverride(conv.id, msg.id)}
                              disabled={!(overrideInputs[msg.id]?.trim())}
                              data-testid={`button-save-override-${msg.id}`}
                            >
                              Save
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            ))}

            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-sm text-muted-foreground">
                Page {page} of {Math.ceil((data.total || 0) / 20)}
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)} data-testid="button-prev-page">
                  Previous
                </Button>
                <Button size="sm" variant="outline" disabled={!data.conversations.length || data.conversations.length < 20} onClick={() => setPage(p => p + 1)} data-testid="button-next-page">
                  Next
                </Button>
              </div>
            </div>
          </div>
        )}

        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-muted-foreground" />
              <h2 className="font-semibold text-lg" data-testid="text-cluster-heading">Question Clustering</h2>
            </div>
            <Button onClick={handleCluster} disabled={clusterLoading} data-testid="button-cluster">
              {clusterLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Brain className="h-4 w-4 mr-2" />}
              Cluster Recent Questions
            </Button>
          </div>
          {clusterResults && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="table-cluster-results">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3 font-medium">Category</th>
                    <th className="text-left py-2 px-3 font-medium">Count</th>
                    <th className="text-left py-2 px-3 font-medium">Examples</th>
                  </tr>
                </thead>
                <tbody>
                  {clusterResults.map((cluster, i) => (
                    <tr key={i} className="border-b last:border-b-0">
                      <td className="py-2 px-3">
                        <Badge variant="secondary">{cluster.tag}</Badge>
                      </td>
                      <td className="py-2 px-3 text-muted-foreground">{cluster.count}</td>
                      <td className="py-2 px-3 text-muted-foreground">
                        {cluster.examples.slice(0, 2).map((ex, j) => (
                          <div key={j} className="truncate max-w-xs">{ex}</div>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
