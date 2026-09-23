import { useState, useEffect } from "react";
import { Check, Loader2, Plus, Trash2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { PrivateHistoryBackButton } from "@/components/private/PrivateHistoryBackButton";
import { getDebugToken } from "@/hooks/useDebugAuth";

interface KnowledgeData {
  custom_knowledge: Array<{ content: string; tag?: string }>;
  question_tags: string[];
}

export default function AIKnowledgeBlocks() {
  const { toast } = useToast();
  const [customKnowledge, setCustomKnowledge] = useState<Array<{ content: string; tag: string }>>([]);
  const [savingKnowledge, setSavingKnowledge] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string>("__all__");

  const { data, isLoading } = useQuery<KnowledgeData>({
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

  useEffect(() => {
    if (data) {
      setCustomKnowledge((data.custom_knowledge || []).map(k => ({ content: k.content, tag: k.tag || "" })));
    }
  }, [data]);

  const handleKnowledgeSave = async () => {
    setSavingKnowledge(true);
    try {
      const token = getDebugToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Token ${token}`;
      const res = await fetch("/api/admin/ai/knowledge", {
        method: "PATCH",
        headers,
        body: JSON.stringify({ custom_knowledge: customKnowledge }),
      });
      if (!res.ok) throw new Error(`Save failed: ${res.status}`);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ai/knowledge"] });
      toast({ title: "Knowledge saved", description: "Custom knowledge blocks saved successfully." });
    } catch {
      toast({ title: "Error", description: "Failed to save knowledge.", variant: "destructive" });
    } finally {
      setSavingKnowledge(false);
    }
  };

  const uniqueTags = Array.from(new Set(customKnowledge.map(b => b.tag).filter(Boolean)));

  const filteredBlocks = customKnowledge.map((block, idx) => ({ block, idx })).filter(({ block }) => {
    if (activeFilter === "__all__") return true;
    if (activeFilter === "__always__") return !block.tag;
    return block.tag === activeFilter;
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <div className="flex items-center gap-3">
          <PrivateHistoryBackButton data-testid="button-back-knowledge-blocks" iconClassName="h-4 w-4" />
          <div className="flex-1">
            <h1 className="text-2xl font-bold" data-testid="text-knowledge-blocks-title">Knowledge Blocks</h1>
            <p className="text-sm text-muted-foreground">Freeform text the agent can reference when answering questions</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              onClick={() => setCustomKnowledge(prev => [...prev, { content: "", tag: "" }])}
              data-testid="button-add-knowledge-block"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Block
            </Button>
            <Button
              onClick={handleKnowledgeSave}
              disabled={savingKnowledge}
              data-testid="button-save-knowledge"
            >
              {savingKnowledge ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
              Save All
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap" data-testid="filter-tags">
          <Button
            size="sm"
            variant={activeFilter === "__all__" ? "default" : "outline"}
            onClick={() => setActiveFilter("__all__")}
            data-testid="filter-tag-all"
          >
            All ({customKnowledge.length})
          </Button>
          <Button
            size="sm"
            variant={activeFilter === "__always__" ? "default" : "outline"}
            onClick={() => setActiveFilter("__always__")}
            data-testid="filter-tag-always"
          >
            Always Include ({customKnowledge.filter(b => !b.tag).length})
          </Button>
          {uniqueTags.map(tag => (
            <Button
              key={tag}
              size="sm"
              variant={activeFilter === tag ? "default" : "outline"}
              onClick={() => setActiveFilter(tag)}
              data-testid={`filter-tag-${tag}`}
            >
              {tag} ({customKnowledge.filter(b => b.tag === tag).length})
            </Button>
          ))}
        </div>

        {filteredBlocks.length === 0 && (
          <div className="py-12 text-center text-sm text-muted-foreground" data-testid="text-no-blocks">
            {customKnowledge.length === 0
              ? "No knowledge blocks yet. Click \"Add Block\" to create one."
              : "No blocks match this filter."}
          </div>
        )}

        <div className="space-y-4">
          {filteredBlocks.map(({ block, idx }) => (
            <Card key={idx} className="p-4 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Select
                  value={block.tag || "__always__"}
                  onValueChange={val => {
                    const updated = [...customKnowledge];
                    updated[idx] = { ...updated[idx], tag: val === "__always__" ? "" : val };
                    setCustomKnowledge(updated);
                  }}
                >
                  <SelectTrigger className="w-[200px]" data-testid={`select-knowledge-tag-${idx}`}>
                    <SelectValue placeholder="Always include" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__always__" data-testid={`option-knowledge-tag-always-${idx}`}>Always include</SelectItem>
                    {(data?.question_tags || []).map(tag => (
                      <SelectItem key={tag} value={tag} data-testid={`option-knowledge-tag-${tag}-${idx}`}>
                        {tag}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {block.tag && (
                  <Badge variant="secondary" data-testid={`badge-block-tag-${idx}`}>{block.tag}</Badge>
                )}
                <div className="flex-1" />
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setCustomKnowledge(prev => prev.filter((_, j) => j !== idx))}
                  data-testid={`button-delete-knowledge-${idx}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <Textarea
                value={block.content}
                onChange={e => {
                  const updated = [...customKnowledge];
                  updated[idx] = { ...updated[idx], content: e.target.value };
                  setCustomKnowledge(updated);
                }}
                className="text-sm min-h-[100px]"
                placeholder="Knowledge content..."
                data-testid={`textarea-knowledge-content-${idx}`}
              />
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
