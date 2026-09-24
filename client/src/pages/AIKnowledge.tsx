import { useState, useEffect } from "react";
import { BookOpen, Brain, Check, ChevronDown, ChevronRight, Cpu, Eye, EyeOff, Image, Loader2, Pencil, Plus, Search, Send, Trash2, Upload, User, Wrench, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { PrivateHistoryBackButton } from "@/components/private/PrivateHistoryBackButton";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Link, useLocation } from "wouter";
import { getDebugToken } from "@/hooks/useDebugAuth";
import { getSessionHeaders } from "@/lib/sessionHeaders";
import { ChatPanel } from "@/components/ChatPanel";

function knowledgeRequestHeaders(): Record<string, string> {
  return { "Content-Type": "application/json", ...getSessionHeaders() };
}

async function readKnowledgeError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json() as { error?: string };
    if (body.error) return body.error;
  } catch {
    // ignore
  }
  return fallback;
}

interface KnowledgeData {
  system_prompt: string | null;
  prompt_role: string;
  prompt_personality: string;
  prompt_instructions: string;
  prompt_fallback: string;
  custom_knowledge: Array<{ content: string; tag?: string }>;
  agent_tools: Array<{ name: string; description: string; enabled: boolean }>;
  chat_bubble: { enabled?: boolean; page_patterns?: string[]; content_types?: string[]; agent_name?: string; agent_icon?: string };
  question_tags: string[];
  model_default?: string;
  model_chat?: string;
}

interface ToolParameterProperty {
  type?: string;
  description?: string;
  default?: string;
}

interface ToolParameterSchema {
  type: string;
  properties?: Record<string, ToolParameterProperty>;
  required?: string[];
}

interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameterSchema;
}

interface AgentToolCallTrace {
  name: string;
  arguments: Record<string, string>;
  result: string;
}

interface AgentTrace {
  model: string;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  iterations: number;
  toolCalls: AgentToolCallTrace[];
}

interface ImageEntry {
  src: string;
  alt?: string;
  tags?: string[];
}

interface ImageRegistryData {
  images: Record<string, ImageEntry>;
}

function compileSystemPrompt(name: string, role: string, personality: string, instructions: string, fallback: string): string {
  const parts: string[] = [];
  if (name) parts.push(`You are ${name}, a helpful AI assistant.`);
  if (role) parts.push(`\n## Role & Purpose\n${role}`);
  if (personality) parts.push(`\n## Personality & Tone\n${personality}`);
  if (instructions) parts.push(`\n## Key Instructions\n${instructions}`);
  if (fallback) parts.push(`\n## Fallback & Boundaries\n${fallback}`);
  return parts.join("\n").trim();
}

function TracePanel({ trace, index }: { trace: AgentTrace; index: number }) {
  const [open, setOpen] = useState(false);
  const [expandedTools, setExpandedTools] = useState<Set<number>>(new Set());

  const toggleTool = (idx: number) => {
    setExpandedTools(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  return (
    <div className="max-w-[80%] mt-1" data-testid={`trace-panel-${index}`}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-[11px] text-muted-foreground hover-elevate rounded px-1.5 py-0.5"
        data-testid={`button-toggle-trace-${index}`}
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <span>Trace</span>
        <span className="opacity-70">({trace.totalTokens} tokens)</span>
      </button>
      {open && (
        <div className="mt-1 rounded-md border bg-muted/50 p-3 text-xs font-mono space-y-2" data-testid={`trace-details-${index}`}>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <span><span className="text-muted-foreground">Model:</span> {trace.model}</span>
            <span><span className="text-muted-foreground">Tokens:</span> {trace.totalTokens} <span className="text-muted-foreground">({trace.promptTokens}p + {trace.completionTokens}c)</span></span>
            <span><span className="text-muted-foreground">Iterations:</span> {trace.iterations}</span>
          </div>
          {trace.toolCalls.length > 0 && (
            <div className="space-y-1 pt-1 border-t border-border/50">
              <span className="text-muted-foreground text-[11px]">Tool Calls ({trace.toolCalls.length})</span>
              {trace.toolCalls.map((tc, tcIdx) => (
                <div key={tcIdx} className="rounded border bg-background/50 overflow-hidden" data-testid={`trace-tool-call-${index}-${tcIdx}`}>
                  <button
                    onClick={() => toggleTool(tcIdx)}
                    className="w-full flex items-center gap-1.5 px-2 py-1 text-left hover-elevate"
                    data-testid={`button-toggle-tool-${index}-${tcIdx}`}
                  >
                    {expandedTools.has(tcIdx) ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
                    <span className="font-semibold">{tc.name}</span>
                  </button>
                  {expandedTools.has(tcIdx) && (
                    <div className="px-2 pb-2 space-y-1">
                      <div>
                        <span className="text-muted-foreground">Args:</span>
                        <pre className="mt-0.5 p-1.5 rounded bg-muted text-[11px] overflow-x-auto whitespace-pre-wrap break-all">{JSON.stringify(tc.arguments, null, 2)}</pre>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Result:</span>
                        <pre className="mt-0.5 p-1.5 rounded bg-muted text-[11px] overflow-x-auto whitespace-pre-wrap break-all max-h-40 overflow-y-auto">{tc.result}</pre>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AIKnowledge() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [agentName, setAgentName] = useState("");
  const [agentIcon, setAgentIcon] = useState("");
  const [promptRole, setPromptRole] = useState("");
  const [promptPersonality, setPromptPersonality] = useState("");
  const [promptInstructions, setPromptInstructions] = useState("");
  const [promptFallback, setPromptFallback] = useState("");
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [iconSearch, setIconSearch] = useState("");
  const [agentTools, setAgentTools] = useState<Array<{ name: string; description: string; enabled: boolean }>>([]);
  const [pagePatterns, setPagePatterns] = useState<string[]>([]);
  const [contentTypes, setContentTypes] = useState<string[]>([]);
  const [bubbleEnabled, setBubbleEnabled] = useState(true);
  const [visibilityOpen, setVisibilityOpen] = useState(false);
  const [draftBubbleEnabled, setDraftBubbleEnabled] = useState(true);
  const [draftPagePatterns, setDraftPagePatterns] = useState<string[]>([]);
  const [draftContentTypes, setDraftContentTypes] = useState<string[]>([]);
  const [savingVisibility, setSavingVisibility] = useState(false);
  const [editingPatternIdx, setEditingPatternIdx] = useState<number | null>(null);
  const [editingPatternVal, setEditingPatternVal] = useState("");
  const [urlPatternsOpen, setUrlPatternsOpen] = useState(false);
  const [addCtSelectKey, setAddCtSelectKey] = useState(0);
  const [identityCoreOpen, setIdentityCoreOpen] = useState(false);
  const [savingIdentity, setSavingIdentity] = useState(false);
  const [draftAgentName, setDraftAgentName] = useState("");
  const [draftAgentIcon, setDraftAgentIcon] = useState("");
  const [draftPromptRole, setDraftPromptRole] = useState("");
  const [draftPromptPersonality, setDraftPromptPersonality] = useState("");
  const [draftPromptInstructions, setDraftPromptInstructions] = useState("");
  const [draftPromptFallback, setDraftPromptFallback] = useState("");
  const [identitySecOpen, setIdentitySecOpen] = useState(false);
  const [roleSecOpen, setRoleSecOpen] = useState(false);
  const [personalitySecOpen, setPersonalitySecOpen] = useState(false);
  const [instructionsSecOpen, setInstructionsSecOpen] = useState(false);
  const [fallbackSecOpen, setFallbackSecOpen] = useState(false);
  const [iconPickerForDraft, setIconPickerForDraft] = useState(false);
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [draftAgentTools, setDraftAgentTools] = useState<Array<{ name: string; description: string; enabled: boolean }>>([]);
  const [savingTools, setSavingTools] = useState(false);
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
  const [toolDefinitions, setToolDefinitions] = useState<ToolDefinition[]>([]);
  const [modelDefault, setModelDefault] = useState("");
  const [modelChat, setModelChat] = useState("");
  const [modelsOpen, setModelsOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<Array<{ role: "user" | "assistant"; content: string; trace?: AgentTrace }>>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatSessionId, setChatSessionId] = useState<string | null>(null);
  const [chatSending, setChatSending] = useState(false);

  const { data, isLoading } = useQuery<KnowledgeData>({
    queryKey: ["/api/admin/ai/knowledge"],
    queryFn: async () => {
      const res = await fetch("/api/admin/ai/knowledge", { headers: getSessionHeaders() });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
  });

  const { data: imageRegistry } = useQuery<ImageRegistryData>({
    queryKey: ["/api/image-registry"],
    queryFn: async () => {
      const res = await fetch("/api/image-registry");
      if (!res.ok) return { images: [] };
      return res.json();
    },
  });

  const { data: contentTypesData } = useQuery<Array<{ name: string; label: string }>>({
    queryKey: ["/api/content-types"],
    queryFn: async () => {
      const res = await fetch("/api/content-types");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const filteredIcons = Object.entries(imageRegistry?.images || {})
    .map(([handle, img]) => ({ handle, src: img.src, alt: img.alt, tags: img.tags }))
    .filter(img => {
      if (!iconSearch) return true;
      const q = iconSearch.toLowerCase();
      return img.handle.toLowerCase().includes(q) || (img.alt || "").toLowerCase().includes(q);
    });

  useEffect(() => {
    if (data) {
      setAgentName(data.chat_bubble?.agent_name || "");
      setAgentIcon(data.chat_bubble?.agent_icon || "");
      setPromptRole(data.prompt_role || "");
      setPromptPersonality(data.prompt_personality || "");
      setPromptInstructions(data.prompt_instructions || "");
      setPromptFallback(data.prompt_fallback || "");
      setAgentTools(data.agent_tools || []);
      setPagePatterns(data.chat_bubble?.page_patterns || []);
      setContentTypes(data.chat_bubble?.content_types || []);
      setBubbleEnabled(data.chat_bubble?.enabled !== false);
      setModelDefault(data.model_default || "");
      setModelChat(data.model_chat || "");
    }
  }, [data]);

  useEffect(() => {
    if (visibilityOpen) {
      setDraftBubbleEnabled(bubbleEnabled);
      setDraftPagePatterns([...pagePatterns]);
      setDraftContentTypes([...contentTypes]);
    }
  }, [visibilityOpen]);

  useEffect(() => {
    if (identityCoreOpen) {
      setDraftAgentName(agentName);
      setDraftAgentIcon(agentIcon);
      setDraftPromptRole(promptRole);
      setDraftPromptPersonality(promptPersonality);
      setDraftPromptInstructions(promptInstructions);
      setDraftPromptFallback(promptFallback);
      setIdentitySecOpen(false);
      setRoleSecOpen(false);
      setPersonalitySecOpen(false);
      setInstructionsSecOpen(false);
      setFallbackSecOpen(false);
    }
  }, [identityCoreOpen]);

  useEffect(() => {
    if (toolsOpen) {
      setDraftAgentTools(agentTools.map(t => ({ ...t })));
      setExpandedTools(new Set());
      const token = getDebugToken();
      const headers: Record<string, string> = { ...getSessionHeaders() };
      if (token && !headers.Authorization) headers.Authorization = `Token ${token}`;
      fetch("/api/admin/ai/tool-definitions", { headers })
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data?.tools) setToolDefinitions(data.tools); })
        .catch(() => {});
    }
  }, [toolsOpen]);

  const handleToolsSave = async () => {
    setSavingTools(true);
    try {
      const res = await fetch("/api/admin/ai/knowledge", {
        method: "PATCH",
        headers: knowledgeRequestHeaders(),
        body: JSON.stringify({
          agent_tools: draftAgentTools,
        }),
      });
      if (!res.ok) throw new Error(await readKnowledgeError(res, `Save failed (${res.status})`));
      setAgentTools(draftAgentTools.map(t => ({ ...t })));
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ai/knowledge"] });
      toast({ title: "Agent Tools saved", description: "Changes are instantly applied — test the agent now." });
      setToolsOpen(false);
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to save agent tools.",
        variant: "destructive",
      });
    } finally {
      setSavingTools(false);
    }
  };

  const handleSendTestMessage = async () => {
    const text = chatInput.trim();
    if (!text || chatSending) return;
    setChatInput("");
    setChatMessages(prev => [...prev, { role: "user", content: text }]);
    setChatSending(true);
    try {
      let sessionId = chatSessionId;
      if (!sessionId) {
        const startRes = await fetch("/api/chat/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ page_url: "/private/ai-knowledge", locale: "en" }),
        });
        if (!startRes.ok) throw new Error("Failed to start chat session");
        const startData = await startRes.json();
        sessionId = startData.conversation_id;
        setChatSessionId(sessionId);
      }
      const msgRes = await fetch("/api/chat/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: sessionId, message: text, locale: "en" }),
      });
      if (!msgRes.ok) throw new Error("Failed to send message");
      const msgData = await msgRes.json();
      setChatMessages(prev => [...prev, { role: "assistant", content: msgData.content || "No response", trace: msgData.trace }]);
    } catch {
      setChatMessages(prev => [...prev, { role: "assistant", content: "Something went wrong. Please try again." }]);
    } finally {
      setChatSending(false);
    }
  };

  const handleIdentityCoreSave = async () => {
    setSavingIdentity(true);
    try {
      const compiled = compileSystemPrompt(draftAgentName, draftPromptRole, draftPromptPersonality, draftPromptInstructions, draftPromptFallback);
      const res = await fetch("/api/admin/ai/knowledge", {
        method: "PATCH",
        headers: knowledgeRequestHeaders(),
        body: JSON.stringify({
          system_prompt: compiled,
          prompt_role: draftPromptRole,
          prompt_personality: draftPromptPersonality,
          prompt_instructions: draftPromptInstructions,
          prompt_fallback: draftPromptFallback,
          chat_bubble: { enabled: bubbleEnabled, page_patterns: pagePatterns, content_types: contentTypes, agent_name: draftAgentName, agent_icon: draftAgentIcon },
        }),
      });
      if (!res.ok) throw new Error(await readKnowledgeError(res, `Save failed (${res.status})`));
      setAgentName(draftAgentName);
      setAgentIcon(draftAgentIcon);
      setPromptRole(draftPromptRole);
      setPromptPersonality(draftPromptPersonality);
      setPromptInstructions(draftPromptInstructions);
      setPromptFallback(draftPromptFallback);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ai/knowledge"] });
      toast({ title: "Identity Core saved", description: "Changes are instantly applied — test the agent now." });
      setIdentityCoreOpen(false);
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to save identity settings.",
        variant: "destructive",
      });
    } finally {
      setSavingIdentity(false);
    }
  };

  const handleVisibilitySave = async () => {
    setSavingVisibility(true);
    try {
      const res = await fetch("/api/admin/ai/knowledge", {
        method: "PATCH",
        headers: knowledgeRequestHeaders(),
        body: JSON.stringify({
          chat_bubble: { enabled: draftBubbleEnabled, page_patterns: draftPagePatterns, content_types: draftContentTypes, agent_name: agentName, agent_icon: agentIcon },
        }),
      });
      if (!res.ok) throw new Error(await readKnowledgeError(res, `Save failed (${res.status})`));
      setBubbleEnabled(draftBubbleEnabled);
      setPagePatterns(draftPagePatterns);
      setContentTypes(draftContentTypes);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ai/knowledge"] });
      toast({ title: "Page targeting saved", description: "Changes are instantly applied — test the agent now." });
      setVisibilityOpen(false);
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to save targeting settings.",
        variant: "destructive",
      });
    } finally {
      setSavingVisibility(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const enabledToolCount = agentTools.filter(t => t.enabled).length;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="border-b">
        <div className="max-w-4xl mx-auto flex items-center gap-3 px-6 py-3">
          <PrivateHistoryBackButton fallbackHref="/" data-testid="button-back-knowledge" iconClassName="h-4 w-4" />
          <div className="flex items-center gap-3 flex-1">
            <div className="shrink-0 w-10 h-10 rounded-md border bg-muted flex items-center justify-center overflow-hidden">
              {agentIcon ? (
                <img src={agentIcon} alt="Agent" className="w-full h-full object-cover" />
              ) : (
                <User className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            <div>
              <h1 className="text-lg font-semibold leading-tight" data-testid="text-knowledge-title">{agentName || "AI Agent"}</h1>
              <p className="text-xs text-muted-foreground">Knowledge Editor</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="max-w-4xl mx-auto px-6 py-4 w-full flex flex-col flex-1 min-h-0">
          <div className="flex flex-row gap-2">
            <Button
              variant="outline"
              className="flex flex-col items-center gap-1 h-auto py-2 flex-1 min-w-0"
              onClick={() => setIdentityCoreOpen(true)}
              data-testid="button-open-identity-core"
            >
              <Brain className="h-4 w-4" />
              <span className="text-xs font-medium">Identity Core</span>
              <span className="text-[11px] text-muted-foreground">{agentName || "Not configured"}</span>
            </Button>
            <Button
              variant="outline"
              className="flex flex-col items-center gap-1 h-auto py-2 flex-1 min-w-0"
              onClick={() => setVisibilityOpen(true)}
              data-testid="button-open-visibility"
            >
              <Eye className="h-4 w-4" />
              <span className="text-xs font-medium">Visibility</span>
              <span className="text-[11px] text-muted-foreground">{bubbleEnabled ? "Visible" : "Hidden"}</span>
            </Button>
            <Button
              variant="outline"
              className="flex flex-col items-center gap-1 h-auto py-2 flex-1 min-w-0"
              onClick={() => setToolsOpen(true)}
              data-testid="button-open-tools"
            >
              <Wrench className="h-4 w-4" />
              <span className="text-xs font-medium">Tools</span>
              <span className="text-[11px] text-muted-foreground">{enabledToolCount} enabled</span>
            </Button>
            <Button
              variant="outline"
              className="flex flex-col items-center gap-1 h-auto py-2 flex-1 min-w-0"
              onClick={() => navigate("/private/ai-knowledge-blocks")}
              data-testid="button-open-knowledge-blocks"
            >
              <BookOpen className="h-4 w-4" />
              <span className="text-xs font-medium">Knowledge Blocks</span>
              <span className="text-[11px] text-muted-foreground">{data?.custom_knowledge?.length || 0} blocks</span>
            </Button>
            <Button
              variant="outline"
              className="flex flex-col items-center gap-1 h-auto py-2 flex-1 min-w-0"
              onClick={() => setModelsOpen(true)}
              data-testid="button-open-models"
            >
              <Cpu className="h-4 w-4" />
              <span className="text-xs font-medium">Models</span>
              <span className="text-[11px] text-muted-foreground truncate max-w-full">{modelChat || modelDefault || "Not set"}</span>
            </Button>
          </div>

          <Card className="mt-4 flex flex-col flex-1 min-h-0" data-testid="card-test-chat">
            <div className="p-4 border-b">
              <h2 className="font-semibold text-sm" data-testid="text-test-chat-heading">Test Chat</h2>
              <p className="text-xs text-muted-foreground">Send messages to test your agent configuration.</p>
            </div>
            <ChatPanel
              messages={chatMessages}
              isLoading={chatSending}
              input={chatInput}
              onInputChange={setChatInput}
              onSend={handleSendTestMessage}
              agentName={agentName}
              agentIcon={agentIcon}
              renderAfterAssistant={(msg, i) => {
                return msg.trace ? <TracePanel trace={msg.trace} index={i} /> : null;
              }}
              className="flex-1 min-h-0"
            />
          </Card>
        </div>
      </div>

      {/* Icon picker dialog */}
      <Dialog open={iconPickerOpen} onOpenChange={open => { setIconPickerOpen(open); if (!open) { setIconSearch(""); setIconPickerForDraft(false); } }}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col" data-testid="dialog-icon-picker">
          <DialogHeader>
            <DialogTitle>Select Agent Icon</DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 border rounded-md px-3 py-2 flex-1">
              <Search className="h-4 w-4 text-muted-foreground shrink-0" />
              <input
                type="text"
                value={iconSearch}
                onChange={e => setIconSearch(e.target.value)}
                placeholder="Search images..."
                className="flex-1 bg-transparent text-sm outline-none"
                data-testid="input-icon-search"
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={uploadingIcon}
              onClick={() => document.getElementById("icon-upload-input")?.click()}
              data-testid="button-upload-icon"
            >
              {uploadingIcon
                ? <Loader2 className="h-4 w-4 animate-spin mr-1" />
                : <Upload className="h-4 w-4 mr-1" />}
              Upload
            </Button>
            <input
              id="icon-upload-input"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,image/avif"
              className="hidden"
              data-testid="input-icon-upload-file"
              onChange={async e => {
                const file = e.target.files?.[0];
                if (!file) return;
                setUploadingIcon(true);
                try {
                  const form = new FormData();
                  form.append("file", file);
                  form.append("alt", file.name.replace(/\.[^.]+$/, ""));
                  const res = await fetch("/api/image-registry/upload", { method: "POST", body: form });
                  if (!res.ok) throw new Error("Upload failed");
                  const result = await res.json();
                  const src = result.src || result.url;
                  if (src) {
                    if (iconPickerForDraft) { setDraftAgentIcon(src); } else { setAgentIcon(src); }
                    setIconPickerOpen(false);
                    setIconSearch("");
                    setIconPickerForDraft(false);
                    queryClient.invalidateQueries({ queryKey: ["/api/image-registry"] });
                  }
                } catch {
                  // silent — user can retry
                } finally {
                  setUploadingIcon(false);
                  e.target.value = "";
                }
              }}
            />
          </div>
          <div className="overflow-y-auto grid grid-cols-4 gap-2 mt-1">
            {filteredIcons.slice(0, 60).map(img => (
              <button
                key={img.handle}
                onClick={() => { if (iconPickerForDraft) { setDraftAgentIcon(img.src); } else { setAgentIcon(img.src); } setIconPickerOpen(false); setIconSearch(""); }}
                className="aspect-square rounded-md overflow-hidden border focus:outline-none focus:ring-2 focus:ring-ring"
                data-testid={`button-icon-${img.handle}`}
              >
                <img src={img.src} alt={img.alt || img.handle} className="w-full h-full object-cover" />
              </button>
            ))}
            {filteredIcons.length === 0 && (
              <div className="col-span-4 py-12 text-center text-sm text-muted-foreground">No images found</div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Identity Core Dialog */}
      <Dialog open={identityCoreOpen} onOpenChange={setIdentityCoreOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col overflow-hidden" data-testid="dialog-identity-core">
          <DialogHeader>
            <DialogTitle data-testid="text-identity-core-title">Identity Core</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground -mt-1">Define who this agent is. Each section shapes a different aspect of its behavior.</p>
          <div className="flex-1 overflow-y-auto space-y-3 pr-1">

            {/* Identity section */}
            <Card className="p-4">
              <Collapsible open={identitySecOpen} onOpenChange={setIdentitySecOpen}>
                <CollapsibleTrigger asChild>
                  <button className="flex items-center justify-between w-full text-left rounded-md hover-elevate px-1 py-0.5" data-testid="button-toggle-identity">
                    <div className="flex-1 min-w-0 pr-2">
                      <p className="text-sm font-semibold">Identity</p>
                      {!identitySecOpen && (
                        <p className="text-xs text-muted-foreground truncate">{draftAgentName || "No name set"}</p>
                      )}
                    </div>
                    <Pencil className="h-4 w-4 text-muted-foreground shrink-0" />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-3 space-y-3">
                  <p className="text-xs text-muted-foreground">The agent's name and avatar shown in the chat bubble header.</p>
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => { setIconPickerForDraft(true); setIconPickerOpen(true); }}
                      className="relative shrink-0 w-16 h-16 rounded-md border bg-muted flex items-center justify-center overflow-hidden focus:outline-none focus:ring-2 focus:ring-ring"
                      data-testid="button-change-icon-draft"
                    >
                      {draftAgentIcon ? (
                        <img src={draftAgentIcon} alt="Agent icon" className="w-full h-full object-cover" />
                      ) : (
                        <User className="h-7 w-7 text-muted-foreground" />
                      )}
                      <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Image className="h-5 w-5 text-white" />
                      </div>
                    </button>
                    <div className="flex-1 space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">Agent Name</label>
                      <input
                        type="text"
                        value={draftAgentName}
                        onChange={e => setDraftAgentName(e.target.value)}
                        placeholder="e.g. Alex, Aria, Support Bot"
                        className="w-full px-3 py-2 text-sm border rounded-md bg-background"
                        data-testid="input-draft-agent-name"
                      />
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </Card>

            {/* Role & Purpose */}
            <Card className="p-4">
              <Collapsible open={roleSecOpen} onOpenChange={setRoleSecOpen}>
                <CollapsibleTrigger asChild>
                  <button className="flex items-center justify-between w-full text-left rounded-md hover-elevate px-1 py-0.5" data-testid="button-toggle-role">
                    <div className="flex-1 min-w-0 pr-2">
                      <p className="text-sm font-semibold">Role & Purpose</p>
                      {!roleSecOpen && (
                        <p className="text-xs text-muted-foreground truncate">{draftPromptRole || "Not configured"}</p>
                      )}
                    </div>
                    <Pencil className="h-4 w-4 text-muted-foreground shrink-0" />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-3 space-y-2">
                  <p className="text-xs text-muted-foreground">What is this agent here to help with? Who does it serve and what topics does it cover?</p>
                  <Textarea
                    value={draftPromptRole}
                    onChange={e => setDraftPromptRole(e.target.value)}
                    className="text-sm min-h-[80px]"
                    placeholder="e.g. You help prospective students learn about 4Geeks Academy's programs, admissions process, and tuition options."
                    data-testid="textarea-draft-prompt-role"
                  />
                </CollapsibleContent>
              </Collapsible>
            </Card>

            {/* Personality & Tone */}
            <Card className="p-4">
              <Collapsible open={personalitySecOpen} onOpenChange={setPersonalitySecOpen}>
                <CollapsibleTrigger asChild>
                  <button className="flex items-center justify-between w-full text-left rounded-md hover-elevate px-1 py-0.5" data-testid="button-toggle-personality">
                    <div className="flex-1 min-w-0 pr-2">
                      <p className="text-sm font-semibold">Personality & Tone</p>
                      {!personalitySecOpen && (
                        <p className="text-xs text-muted-foreground truncate">{draftPromptPersonality || "Not configured"}</p>
                      )}
                    </div>
                    <Pencil className="h-4 w-4 text-muted-foreground shrink-0" />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-3 space-y-2">
                  <p className="text-xs text-muted-foreground">How should the agent communicate? Describe the communication style, level of formality, and emotional character.</p>
                  <Textarea
                    value={draftPromptPersonality}
                    onChange={e => setDraftPromptPersonality(e.target.value)}
                    className="text-sm min-h-[80px]"
                    placeholder="e.g. Friendly and encouraging, but professional. Keep answers concise and clear."
                    data-testid="textarea-draft-prompt-personality"
                  />
                </CollapsibleContent>
              </Collapsible>
            </Card>

            {/* Key Instructions */}
            <Card className="p-4">
              <Collapsible open={instructionsSecOpen} onOpenChange={setInstructionsSecOpen}>
                <CollapsibleTrigger asChild>
                  <button className="flex items-center justify-between w-full text-left rounded-md hover-elevate px-1 py-0.5" data-testid="button-toggle-instructions">
                    <div className="flex-1 min-w-0 pr-2">
                      <p className="text-sm font-semibold">Key Instructions</p>
                      {!instructionsSecOpen && (
                        <p className="text-xs text-muted-foreground truncate">{draftPromptInstructions || "Not configured"}</p>
                      )}
                    </div>
                    <Pencil className="h-4 w-4 text-muted-foreground shrink-0" />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-3 space-y-2">
                  <p className="text-xs text-muted-foreground">Specific rules for the agent — what it should always do, recommend, or prioritize when answering.</p>
                  <Textarea
                    value={draftPromptInstructions}
                    onChange={e => setDraftPromptInstructions(e.target.value)}
                    className="text-sm min-h-[80px]"
                    placeholder="e.g. Always link to the relevant program page. Recommend booking a free consultation for detailed questions."
                    data-testid="textarea-draft-prompt-instructions"
                  />
                </CollapsibleContent>
              </Collapsible>
            </Card>

            {/* Fallback & Boundaries */}
            <Card className="p-4">
              <Collapsible open={fallbackSecOpen} onOpenChange={setFallbackSecOpen}>
                <CollapsibleTrigger asChild>
                  <button className="flex items-center justify-between w-full text-left rounded-md hover-elevate px-1 py-0.5" data-testid="button-toggle-fallback">
                    <div className="flex-1 min-w-0 pr-2">
                      <p className="text-sm font-semibold">Fallback & Boundaries</p>
                      {!fallbackSecOpen && (
                        <p className="text-xs text-muted-foreground truncate">{draftPromptFallback || "Not configured"}</p>
                      )}
                    </div>
                    <Pencil className="h-4 w-4 text-muted-foreground shrink-0" />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-3 space-y-2">
                  <p className="text-xs text-muted-foreground">What should the agent do when it doesn't know the answer? What topics or promises should it avoid?</p>
                  <Textarea
                    value={draftPromptFallback}
                    onChange={e => setDraftPromptFallback(e.target.value)}
                    className="text-sm min-h-[80px]"
                    placeholder="e.g. If you're unsure, say so honestly and direct the student to our admissions team."
                    data-testid="textarea-draft-prompt-fallback"
                  />
                </CollapsibleContent>
              </Collapsible>
            </Card>

          </div>
          <DialogFooter className="gap-2 pt-2">
            <Button variant="outline" onClick={() => setIdentityCoreOpen(false)} data-testid="button-identity-core-cancel">
              Cancel
            </Button>
            <Button onClick={handleIdentityCoreSave} disabled={savingIdentity} data-testid="button-identity-core-save">
              {savingIdentity ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Tools Dialog */}
      <Dialog open={toolsOpen} onOpenChange={setToolsOpen}>
        <DialogContent className="max-w-2xl" data-testid="dialog-agent-tools">
          <DialogHeader>
            <DialogTitle data-testid="text-tools-dialog-title">Agent Tools</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground -mt-1">External capabilities the agent can invoke while responding, such as live program lookups or location queries. Enable only the tools relevant to the conversations you want to support.</p>
          <div className="space-y-2">
            {draftAgentTools.map((tool, i) => {
              const def = toolDefinitions.find(d => d.name === tool.name);
              const params: [string, ToolParameterProperty][] = def?.parameters?.properties
                ? Object.entries(def.parameters.properties)
                : [];
              const requiredList: string[] = def?.parameters?.required || [];
              const isExpanded = expandedTools.has(tool.name);
              return (
                <Card key={i} className="p-3" data-testid={`tool-row-${tool.name}`}>
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={tool.enabled}
                      onCheckedChange={(checked: boolean) => {
                        const updated = [...draftAgentTools];
                        updated[i] = { ...updated[i], enabled: checked };
                        setDraftAgentTools(updated);
                      }}
                      data-testid={`switch-tool-${tool.name}`}
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium">{tool.name}</span>
                      <p className="text-xs text-muted-foreground">{tool.description}</p>
                    </div>
                    {params.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setExpandedTools(prev => {
                            const next = new Set(prev);
                            if (next.has(tool.name)) next.delete(tool.name);
                            else next.add(tool.name);
                            return next;
                          });
                        }}
                        className="p-1 text-muted-foreground hover-elevate rounded-md"
                        data-testid={`button-expand-tool-${tool.name}`}
                      >
                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                    )}
                  </div>
                  {isExpanded && params.length > 0 && (
                    <div className="mt-3 pt-3 border-t" data-testid={`params-section-${tool.name}`}>
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left text-muted-foreground border-b">
                            <th className="py-1 pr-2 font-medium">Name</th>
                            <th className="py-1 pr-2 font-medium">Type</th>
                            <th className="py-1 pr-2 font-medium">Required</th>
                            <th className="py-1 pr-2 font-medium">Description</th>
                            <th className="py-1 font-medium">Example</th>
                          </tr>
                        </thead>
                        <tbody>
                          {params.map(([pName, pSchema]) => {
                            const exMatch = pSchema.description?.match(/\(e\.g\.\s*(.+?)\)/);
                            const example = exMatch
                              ? exMatch[1].split(",")[0].trim().replace(/^['"]|['"]$/g, "")
                              : pSchema.default ?? "—";
                            return (
                              <tr key={pName} className="border-b last:border-b-0" data-testid={`param-row-${tool.name}-${pName}`}>
                                <td className="py-1 pr-2 font-mono">{pName}</td>
                                <td className="py-1 pr-2">{pSchema.type || "string"}</td>
                                <td className="py-1 pr-2">
                                  {requiredList.includes(pName)
                                    ? <Badge variant="destructive" className="text-[10px] px-1 py-0">required</Badge>
                                    : <span className="text-muted-foreground">optional</span>}
                                </td>
                                <td className="py-1 pr-2">{pSchema.description?.replace(/\s*\(e\.g\.\s*.+?\)/, "") || "—"}</td>
                                <td className="py-1 font-mono text-muted-foreground">{example}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setToolsOpen(false)} data-testid="button-tools-cancel">
              Cancel
            </Button>
            <Button onClick={handleToolsSave} disabled={savingTools} data-testid="button-tools-save">
              {savingTools ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={modelsOpen} onOpenChange={setModelsOpen}>
        <DialogContent className="max-w-lg" data-testid="dialog-models">
          <DialogHeader>
            <DialogTitle data-testid="text-models-dialog-title">Model Configuration</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground -mt-1">
            Completion, chat, vision, and decision models are managed in AI Settings and written to llm.yml.
          </p>
          <div className="space-y-3">
            <div className="rounded-md border border-border bg-muted/30 p-3 space-y-1">
              <p className="text-sm font-medium">Completion</p>
              <p className="text-xs text-muted-foreground font-mono break-all" data-testid="text-model-default">
                {modelDefault || "Not set"}
              </p>
            </div>
            <div className="rounded-md border border-border bg-muted/30 p-3 space-y-1">
              <p className="text-sm font-medium">Chat</p>
              <p className="text-xs text-muted-foreground font-mono break-all" data-testid="text-model-chat">
                {modelChat || "Uses completion model"}
              </p>
            </div>
            <Button variant="outline" size="sm" asChild data-testid="link-ai-settings-from-models">
              <Link href="/private/settings/ai/llms">Open AI Settings</Link>
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModelsOpen(false)} data-testid="button-models-cancel">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Visibility Dialog */}
      <Dialog open={visibilityOpen} onOpenChange={setVisibilityOpen}>
        <DialogContent className="max-w-lg" data-testid="dialog-visibility">
          <DialogHeader>
            <DialogTitle data-testid="text-visibility-dialog-title">Chat Agent Visibility</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border p-4 gap-4">
              <div className="flex items-center gap-4">
                <div className={`rounded-full p-3 ${draftBubbleEnabled ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                  {draftBubbleEnabled
                    ? <Eye className="h-6 w-6" />
                    : <EyeOff className="h-6 w-6" />
                  }
                </div>
                <div>
                  <p className="text-sm font-medium">Chat bubble</p>
                  <p className="text-xs text-muted-foreground">{draftBubbleEnabled ? "Visible to visitors" : "Hidden from visitors"}</p>
                </div>
              </div>
              <Switch
                checked={draftBubbleEnabled}
                onCheckedChange={setDraftBubbleEnabled}
                data-testid="switch-bubble-enabled"
              />
            </div>
            {/* Specific URLs — collapsible card */}
            <Card className="p-4">
              <Collapsible open={urlPatternsOpen} onOpenChange={setUrlPatternsOpen}>
                <CollapsibleTrigger asChild>
                  <button
                    className="flex items-center justify-between w-full text-left rounded-md hover-elevate px-1 py-0.5"
                    data-testid="button-toggle-url-patterns"
                  >
                    <div>
                      <p className="text-sm font-medium">Specific URLs</p>
                      {!urlPatternsOpen && (
                        <p className="text-xs text-muted-foreground">Show the chat agent only on specific groups of URLs</p>
                      )}
                    </div>
                    <ChevronDown className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200 ${urlPatternsOpen ? "rotate-180" : ""}`} />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-3 space-y-1">
                  {draftPagePatterns.map((pattern, i) =>
                    editingPatternIdx === i ? (
                      <div key={i} className="flex items-center gap-1.5">
                        <input
                          autoFocus
                          type="text"
                          value={editingPatternVal}
                          onChange={e => setEditingPatternVal(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === "Enter") {
                              const updated = [...draftPagePatterns];
                              updated[i] = editingPatternVal;
                              setDraftPagePatterns(updated);
                              setEditingPatternIdx(null);
                            } else if (e.key === "Escape") {
                              if (!pattern) setDraftPagePatterns(prev => prev.filter((_, j) => j !== i));
                              setEditingPatternIdx(null);
                            }
                          }}
                          className="flex-1 px-2.5 py-1.5 text-sm border rounded-md bg-background font-mono"
                          data-testid={`input-pattern-${i}`}
                        />
                        <Button size="icon" variant="ghost" onClick={() => {
                          const updated = [...draftPagePatterns];
                          updated[i] = editingPatternVal;
                          setDraftPagePatterns(updated);
                          setEditingPatternIdx(null);
                        }} data-testid={`button-confirm-pattern-${i}`}>
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => {
                          if (!pattern) setDraftPagePatterns(prev => prev.filter((_, j) => j !== i));
                          setEditingPatternIdx(null);
                        }} data-testid={`button-cancel-pattern-${i}`}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <div key={i} className="flex items-center gap-1.5">
                        <code className="flex-1 min-w-0 truncate text-xs bg-muted px-2.5 py-1.5 rounded-md font-mono" data-testid={`text-pattern-${i}`}>{pattern || <span className="text-muted-foreground italic">empty</span>}</code>
                        <Button size="icon" variant="ghost" onClick={() => { setEditingPatternIdx(i); setEditingPatternVal(pattern); }} data-testid={`button-edit-pattern-${i}`}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => setDraftPagePatterns(prev => prev.filter((_, j) => j !== i))} data-testid={`button-delete-pattern-${i}`}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const next = [...draftPagePatterns, ""];
                      setDraftPagePatterns(next);
                      setEditingPatternIdx(next.length - 1);
                      setEditingPatternVal("");
                    }}
                    data-testid="button-add-pattern"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add Pattern
                  </Button>
                </CollapsibleContent>
              </Collapsible>
            </Card>

            {/* Content Type Targeting — tag cloud card */}
            <Card className="p-4 space-y-3">
              <div>
                <h3 className="text-sm font-medium" data-testid="text-content-types-heading">Content Type Targeting</h3>
                <p className="text-xs text-muted-foreground">Show the chat bubble on pages matching these content types</p>
              </div>
              <div className="flex flex-wrap gap-1.5" data-testid="tag-cloud-content-types">
                {draftContentTypes.map((ct, i) => {
                  const label = (contentTypesData || []).find(c => c.name === ct)?.label || ct;
                  return (
                    <Badge key={ct} variant="secondary" className="gap-1 pl-2.5 pr-1.5 py-0.5" data-testid={`badge-content-type-${ct}`}>
                      <span className="text-xs">{label}</span>
                      <button
                        onClick={() => setDraftContentTypes(prev => prev.filter((_, j) => j !== i))}
                        className="ml-0.5 rounded-sm opacity-70 hover:opacity-100"
                        data-testid={`button-delete-content-type-${i}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  );
                })}
                {(contentTypesData || []).filter(ct => !draftContentTypes.includes(ct.name)).length > 0 && (
                  <Select
                    key={addCtSelectKey}
                    onValueChange={val => {
                      if (!draftContentTypes.includes(val)) {
                        setDraftContentTypes(prev => [...prev, val]);
                      }
                      setAddCtSelectKey(k => k + 1);
                    }}
                  >
                    <SelectTrigger className="h-6 w-auto gap-1 px-2 text-xs border-dashed" data-testid="select-add-content-type">
                      <Plus className="h-3 w-3" />
                      <SelectValue placeholder="Add type" />
                    </SelectTrigger>
                    <SelectContent>
                      {(contentTypesData || [])
                        .filter(ct => !draftContentTypes.includes(ct.name))
                        .map(ct => (
                          <SelectItem key={ct.name} value={ct.name} data-testid={`option-content-type-${ct.name}`}>
                            {ct.label}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </Card>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setVisibilityOpen(false)} data-testid="button-visibility-cancel">
              Cancel
            </Button>
            <Button onClick={handleVisibilitySave} disabled={savingVisibility} data-testid="button-visibility-save">
              {savingVisibility ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
