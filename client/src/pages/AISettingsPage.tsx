import { useEffect, useMemo, useState, lazy, Suspense } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  IconChevronDown,
  IconDeviceFloppy,
  IconLoader2,
  IconAlertCircle,
  IconCircleCheck,
  IconSparkles,
  IconFileCode,
  IconBrain,
  IconDatabase,
  IconKey,
  IconPlugConnected,
  IconScale,
} from "@tabler/icons-react";
import { Check, ChevronsUpDown } from "lucide-react";
import { SettingsShell, useSettingsDirty, type SettingsSecondaryTab } from "@/components/settings/SettingsShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { getSessionHeaders } from "@/lib/sessionHeaders";
import { cn } from "@/lib/utils";
import { queryClient } from "@/lib/queryClient";
import { QdrantTab } from "@/components/settings/QdrantTab";
import { PromptLibraryTab } from "@/components/settings/PromptLibraryTab";

const LlmYmlEditorPanel = lazy(() => import("@/components/editing/LlmYmlEditorPanel"));

type AiSettingsTab = "llms" | "qdrant" | "prompts";

const AI_TABS: SettingsSecondaryTab<AiSettingsTab>[] = [
  { id: "llms", href: "/private/settings/ai/llms", label: "Models", Icon: IconBrain },
  { id: "qdrant", href: "/private/settings/ai/qdrant", label: "Vector DB", Icon: IconDatabase },
  { id: "prompts", href: "/private/settings/ai/prompts", label: "Prompt Library", Icon: IconFileCode },
];

function resolveAiTab(pathname: string): AiSettingsTab | null {
  if (pathname === "/private/settings/ai/llms") return "llms";
  if (pathname === "/private/settings/ai/qdrant") return "qdrant";
  if (pathname === "/private/settings/ai/prompts") return "prompts";
  return null;
}

interface AISettingsResponse {
  model_default: string;
  model_chat: string;
  model_vision: string;
  model_decision: string;
  provider: {
    api_key_env: string;
    base_url_env: string;
    base_url: string | null;
    api_key_configured: boolean;
  };
}

interface OpenRouterModel {
  id: string;
  name: string;
  context_length?: number;
  pricing?: { prompt?: string; completion?: string };
}

interface OpenRouterModelsResponse {
  models: OpenRouterModel[];
  error?: string;
}

function aiRequestHeaders(): Record<string, string> {
  return { "Content-Type": "application/json", ...getSessionHeaders() };
}

/** Format OpenRouter per-token USD price as $/1M tokens. */
function formatPerMillion(perToken: string | undefined): string | null {
  if (perToken == null || perToken === "") return null;
  const n = Number(perToken);
  if (!Number.isFinite(n)) return null;
  if (n === 0) return "free";
  const perM = n * 1_000_000;
  if (perM < 0.01) return `$${perM.toPrecision(2)}`;
  if (perM < 1) return `$${perM.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}`;
  return `$${perM % 1 === 0 ? perM.toFixed(0) : perM.toFixed(2)}`;
}

function formatModelMeta(model: OpenRouterModel): string {
  const parts: string[] = [model.id];
  if (model.context_length) {
    parts.push(`${model.context_length.toLocaleString()} context`);
  }
  const prompt = formatPerMillion(model.pricing?.prompt);
  const completion = formatPerMillion(model.pricing?.completion);
  if (prompt && completion) {
    parts.push(`${prompt} / ${completion} per 1M`);
  } else if (prompt) {
    parts.push(`${prompt} in per 1M`);
  } else if (completion) {
    parts.push(`${completion} out per 1M`);
  }
  return parts.join(" · ");
}

function ModelPicker({
  id,
  label,
  value,
  onChange,
  models,
  loading,
  disabled,
  allowEmpty,
  emptyLabel = "Use completion model",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  models: OpenRouterModel[];
  loading: boolean;
  disabled: boolean;
  allowEmpty?: boolean;
  emptyLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const selectedLabel = useMemo(() => {
    if (!value) return emptyLabel;
    const match = models.find((m) => m.id === value);
    return match ? `${match.name} (${match.id})` : value;
  }, [emptyLabel, models, value]);

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium" htmlFor={id}>
        {label}
      </label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled || loading}
            className="w-full justify-between font-normal"
            data-testid={`button-model-picker-${id}`}
          >
            <span className="truncate text-left">{loading ? "Loading models…" : selectedLabel}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search models…" data-testid={`input-search-models-${id}`} />
            <CommandList>
              <CommandEmpty>No models found.</CommandEmpty>
              <CommandGroup>
                {allowEmpty && (
                  <CommandItem
                    value="__empty__ use completion model"
                    onSelect={() => {
                      onChange("");
                      setOpen(false);
                    }}
                    data-testid={`model-option-${id}-empty`}
                  >
                    <Check className={cn("mr-2 h-4 w-4", !value ? "opacity-100" : "opacity-0")} />
                    <span className="text-sm text-muted-foreground">{emptyLabel}</span>
                  </CommandItem>
                )}
                {models.map((model) => (
                  <CommandItem
                    key={model.id}
                    value={`${model.id} ${model.name}`}
                    onSelect={() => {
                      onChange(model.id);
                      setOpen(false);
                    }}
                    data-testid={`model-option-${id}-${model.id}`}
                  >
                    <Check
                      className={cn("mr-2 h-4 w-4", value === model.id ? "opacity-100" : "opacity-0")}
                    />
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm truncate">{model.name}</span>
                      <span className="text-xs text-muted-foreground font-mono truncate">
                        {formatModelMeta(model)}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function LlmsTab() {
  const { toast } = useToast();
  const [selectedDefault, setSelectedDefault] = useState("");
  const [selectedChat, setSelectedChat] = useState("");
  const [selectedVision, setSelectedVision] = useState("");
  const [selectedDecision, setSelectedDecision] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showYmlEditor, setShowYmlEditor] = useState(false);
  const [providerOpen, setProviderOpen] = useState(false);
  const [modelsOpen, setModelsOpen] = useState(false);
  const [decisionOpen, setDecisionOpen] = useState(false);
  const [decisionAdvanced, setDecisionAdvanced] = useState(false);

  const settingsQuery = useQuery<AISettingsResponse>({
    queryKey: ["/api/admin/ai/settings"],
    queryFn: async () => {
      const res = await fetch("/api/admin/ai/settings", { headers: getSessionHeaders() });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed to load settings (${res.status})`);
      }
      return res.json();
    },
  });

  const modelsQuery = useQuery<OpenRouterModelsResponse>({
    queryKey: ["/api/admin/ai/openrouter/models"],
    queryFn: async () => {
      const res = await fetch("/api/admin/ai/openrouter/models", { headers: getSessionHeaders() });
      const body = (await res.json().catch(() => ({ models: [] }))) as OpenRouterModelsResponse;
      if (!res.ok) {
        throw new Error(body.error || `Failed to load models (${res.status})`);
      }
      return body;
    },
    enabled: Boolean(settingsQuery.data?.provider.api_key_configured),
    retry: false,
  });

  useEffect(() => {
    if (!settingsQuery.data) return;
    setSelectedDefault(settingsQuery.data.model_default || "");
    setSelectedChat(settingsQuery.data.model_chat || "");
    setSelectedVision(settingsQuery.data.model_vision || "");
    setSelectedDecision(settingsQuery.data.model_decision || "");
  }, [settingsQuery.data]);

  const models = modelsQuery.data?.models ?? [];
  const decisionModels: OpenRouterModel[] = [
    {
      id: "~typesafe/jev-latest",
      name: "TypeSafe: Jev Latest",
    },
    {
      id: "typesafe/jev-1.13",
      name: "TypeSafe: Jev 1.13",
    },
  ];
  const apiKeyConfigured = Boolean(settingsQuery.data?.provider.api_key_configured);
  const dirty =
    selectedDefault !== (settingsQuery.data?.model_default || "") ||
    selectedChat !== (settingsQuery.data?.model_chat || "") ||
    selectedVision !== (settingsQuery.data?.model_vision || "") ||
    selectedDecision !== (settingsQuery.data?.model_decision || "");
  useSettingsDirty(dirty);

  async function handleTestConnection() {
    setTesting(true);
    try {
      const res = await fetch("/api/admin/ai/openrouter/test", {
        method: "POST",
        headers: getSessionHeaders(),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        throw new Error(body.error || `Connection failed (${res.status})`);
      }
      toast({
        title: "Connection OK",
        description:
          typeof body.models_count === "number"
            ? body.decision_ok
              ? `OpenRouter reachable · ${body.models_count.toLocaleString()} models · decision model ${body.decision_model || "ok"}.`
              : `OpenRouter reachable · ${body.models_count.toLocaleString()} models listed.`
            : "OpenRouter reachable.",
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/ai/openrouter/models"] });
    } catch (err) {
      toast({
        title: "Connection failed",
        description: err instanceof Error ? err.message : "Could not reach OpenRouter.",
        variant: "destructive",
      });
    } finally {
      setTesting(false);
    }
  }

  async function handleSave() {
    if (!selectedDefault.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/ai/settings", {
        method: "PATCH",
        headers: aiRequestHeaders(),
        body: JSON.stringify({
          model_default: selectedDefault.trim(),
          model_chat: selectedChat.trim(),
          model_vision: selectedVision.trim(),
          model_decision: selectedDecision.trim(),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Save failed (${res.status})`);
      }
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/ai/settings"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/ai/knowledge"] });
      toast({
        title: "AI settings saved",
        description: "Models updated. This does not change the API key or re-test the provider.",
      });
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to save AI settings.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  if (settingsQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
        <IconLoader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Loading settings…</span>
      </div>
    );
  }

  if (settingsQuery.isError) {
    return (
      <Card data-testid="panel-ai-settings-error">
        <CardContent className="pt-6 flex items-start gap-3 text-destructive">
          <IconAlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <p className="text-sm">
            {settingsQuery.error instanceof Error
              ? settingsQuery.error.message
              : "Failed to load AI settings."}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <Card data-testid="panel-ai-provider">
          <CardHeader className={cn("flex flex-row items-center justify-between gap-2", providerOpen && "pb-4")}>
            <button
              type="button"
              className="flex items-center gap-2 min-w-0 flex-1 text-left"
              onClick={() => setProviderOpen((v) => !v)}
              aria-expanded={providerOpen}
              data-testid="button-toggle-ai-provider"
            >
              <IconKey className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-base">Provider</CardTitle>
              <IconChevronDown
                className={cn(
                  "h-4 w-4 text-muted-foreground transition-transform",
                  providerOpen && "rotate-180",
                )}
              />
            </button>
            <div className="flex items-center gap-2 shrink-0">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setShowYmlEditor(true)}
                    data-testid="button-edit-llm-yml"
                  >
                    <IconFileCode className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  Edit llm.yml
                </TooltipContent>
              </Tooltip>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleTestConnection}
                disabled={testing || !apiKeyConfigured}
                data-testid="button-ai-openrouter-test-connection"
              >
                {testing ? (
                  <IconLoader2 className="h-4 w-4 animate-spin mr-1.5" />
                ) : (
                  <IconPlugConnected className="h-4 w-4 mr-1.5" />
                )}
                {testing ? "Testing…" : "Test connection"}
              </Button>
            </div>
          </CardHeader>
          {providerOpen && (
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Keys live in the server environment. Save on Models only updates which models are used —
              Test connection proves the live OpenRouter link without changing settings.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {apiKeyConfigured ? (
                <Badge
                  variant="secondary"
                  className="gap-1 border-transparent bg-green-600/15 text-green-700 dark:bg-green-500/20 dark:text-green-400"
                  data-testid="badge-api-key-ok"
                >
                  <IconCircleCheck className="h-3.5 w-3.5" />
                  {settingsQuery.data?.provider.api_key_env} configured
                </Badge>
              ) : (
                <Badge variant="destructive" className="gap-1" data-testid="badge-api-key-missing">
                  <IconAlertCircle className="h-3.5 w-3.5" />
                  Set {settingsQuery.data?.provider.api_key_env} in environment
                </Badge>
              )}
            </div>
            <dl className="grid gap-2 text-sm">
              <div className="flex flex-col sm:flex-row sm:gap-3">
                <dt className="text-muted-foreground sm:w-32 shrink-0">API key env</dt>
                <dd className="font-mono text-xs sm:text-sm">{settingsQuery.data?.provider.api_key_env}</dd>
              </div>
              <div className="flex flex-col sm:flex-row sm:gap-3">
                <dt className="text-muted-foreground sm:w-32 shrink-0">Base URL</dt>
                <dd className="font-mono text-xs sm:text-sm break-all">
                  {settingsQuery.data?.provider.base_url || "—"}
                </dd>
              </div>
            </dl>
          </CardContent>
          )}
        </Card>

        <Card data-testid="panel-ai-models">
          <CardHeader className={cn("flex flex-row items-center gap-2", modelsOpen && "pb-4")}>
            <button
              type="button"
              className="flex items-center gap-2 min-w-0 flex-1 text-left"
              onClick={() => setModelsOpen((v) => !v)}
              aria-expanded={modelsOpen}
              data-testid="button-toggle-ai-models"
            >
              <IconBrain className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-base">Models</CardTitle>
              <IconChevronDown
                className={cn(
                  "h-4 w-4 text-muted-foreground transition-transform",
                  modelsOpen && "rotate-180",
                )}
              />
            </button>
          </CardHeader>
          {modelsOpen && (
          <CardContent className="space-y-5">
            <p className="text-sm text-muted-foreground">
              Choose models for completions, chat, vision, and structured decisions. Saving writes
              them to the site LLM config; it does not re-test the provider.
            </p>

            <ModelPicker
              id="completion-model"
              label="Completion model"
              value={selectedDefault}
              onChange={setSelectedDefault}
              models={models}
              loading={modelsQuery.isLoading}
              disabled={!apiKeyConfigured}
            />
            <p className="text-xs text-muted-foreground -mt-3">
              Field mapping, content adaptation, table builders, and other non-chat completions.
            </p>

            <ModelPicker
              id="chat-model"
              label="Chat model"
              value={selectedChat}
              onChange={setSelectedChat}
              models={models}
              loading={modelsQuery.isLoading}
              disabled={!apiKeyConfigured}
              allowEmpty
              emptyLabel="Use completion model"
            />
            <p className="text-xs text-muted-foreground -mt-3">Live chat assistant conversations.</p>

            <ModelPicker
              id="vision-model"
              label="Vision model"
              value={selectedVision}
              onChange={setSelectedVision}
              models={models}
              loading={modelsQuery.isLoading}
              disabled={!apiKeyConfigured}
              allowEmpty
              emptyLabel="Use completion model"
            />
            <p className="text-xs text-muted-foreground -mt-3">
              Image auto-tagging and other vision tasks.
            </p>

            <ModelPicker
              id="decision-model"
              label="Decision model (System One)"
              value={selectedDecision}
              onChange={setSelectedDecision}
              models={decisionModels}
              loading={false}
              disabled={!apiKeyConfigured}
              allowEmpty
              emptyLabel="Use default (Jev latest)"
            />
            <p className="text-xs text-muted-foreground -mt-3">
              Structured yes/no checks (not chat) — e.g. outcome-figure gray zone on proposals.
              Default tracks newest Jev; pin 1.13 for stability. Test connection also probes this
              endpoint.
            </p>

            {modelsQuery.isError && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <IconAlertCircle className="h-3.5 w-3.5" />
                {modelsQuery.error instanceof Error
                  ? modelsQuery.error.message
                  : "Could not load OpenRouter models."}
              </p>
            )}
            {!apiKeyConfigured && (
              <p className="text-xs text-muted-foreground">
                Add the API key to your environment, restart the server, then use Test connection to
                load models.
              </p>
            )}

            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs font-medium text-foreground hover:underline"
              onClick={() => setShowAdvanced((v) => !v)}
              data-testid="button-toggle-llms-advanced"
            >
              {showAdvanced ? "Hide advanced details" : "Read more (advanced)"}
              <IconChevronDown
                className={cn("h-3.5 w-3.5 transition-transform", showAdvanced && "rotate-180")}
              />
            </button>

            {showAdvanced && (
              <div className="rounded-md border border-border bg-muted/40 p-3 space-y-2 text-xs text-muted-foreground">
                <p>
                  Saving writes <code className="font-mono text-[11px]">model.default</code>,{" "}
                  <code className="font-mono text-[11px]">model.chat</code>,{" "}
                  <code className="font-mono text-[11px]">model.vision</code>, and{" "}
                  <code className="font-mono text-[11px]">model.decision</code> in{" "}
                  <code className="font-mono text-[11px]">llm.yml</code>. Provider env names come from
                  the same file; keys stay in the process environment. Decision models use OpenRouter
                  Decisions / System One — not chat completions.
                </p>
                <p>
                  Probe: <code className="font-mono text-[11px]">POST /api/admin/ai/openrouter/test</code>{" "}
                  (lists models and runs a tiny decision noul; does not persist settings).
                </p>
              </div>
            )}
          </CardContent>
          )}
        </Card>

        <Card data-testid="panel-ai-decision-model">
          <CardHeader className={cn("flex flex-row items-center gap-2", decisionOpen && "pb-4")}>
            <button
              type="button"
              className="flex items-center gap-2 min-w-0 flex-1 text-left"
              onClick={() => setDecisionOpen((v) => !v)}
              aria-expanded={decisionOpen}
              data-testid="button-toggle-ai-decision-model"
            >
              <IconScale className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-base">Decision Model</CardTitle>
              <IconChevronDown
                className={cn(
                  "h-4 w-4 text-muted-foreground transition-transform",
                  decisionOpen && "rotate-180",
                )}
              />
            </button>
          </CardHeader>
          {decisionOpen && (
            <CardContent className="space-y-5">
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  Jev is a small AI that answers yes-or-no questions. It never writes content, never
                  chats, and never approves or rejects anything. It only flags things so the people
                  reviewing a change know what to double-check.
                </p>
                <p>
                  Currently using:{" "}
                  <span className="font-mono text-xs text-foreground" data-testid="text-decision-model-current">
                    {selectedDecision || "default (newest Jev)"}
                  </span>
                  . Change it under Models.
                </p>
              </div>

              <div className="space-y-3">
                <p className="text-sm font-medium text-foreground">When Jev steps in</p>
                <ol className="space-y-3 text-sm">
                  <li className="rounded-md border border-border p-3 space-y-1">
                    <p className="font-medium text-foreground">
                      1. Does this edit change a price or a graduate result?
                    </p>
                    <p className="text-muted-foreground">
                      When someone proposes an edit, we first look for obvious signs like "$" or "hire
                      rate". If the signs are unclear, Jev reads the new text and decides. If it says yes,
                      reviewers get the "check the numbers" checklist and the change is treated like an edit
                      to a sales page.
                    </p>
                  </li>
                  <li className="rounded-md border border-border p-3 space-y-1">
                    <p className="font-medium text-foreground">2. Which company facts does this edit mention?</p>
                    <p className="text-muted-foreground">
                      When a review needs a facts check, Jev scans the text for six kinds of facts: prices,
                      graduate results, ratings and review counts, program details, company details, and
                      contact info. Reviewers are then shown only the matching site facts to compare
                      against, instead of the whole list. The answer is remembered until the text changes.
                    </p>
                  </li>
                  <li className="rounded-md border border-border p-3 space-y-1">
                    <p className="font-medium text-foreground">3. Is Jev reachable?</p>
                    <p className="text-muted-foreground">
                      Test connection (in Provider) and Re-check on the staff alert send Jev a tiny test
                      question. Nothing is saved.
                    </p>
                  </li>
                </ol>
                <p className="text-xs text-muted-foreground">
                  These checks run when a proposal is filed or revised, and again right before it is
                  accepted, applied, rejected, or withdrawn.
                </p>
              </div>

              <div className="space-y-1 text-sm">
                <p className="font-medium text-foreground">If Jev is down</p>
                <p className="text-muted-foreground">
                  Reviews still work. The "check the numbers" checklist is not turned on automatically,
                  the facts check shows every site fact, and the review carries a warning. After 3 failed
                  calls in a row, staff see an alert with a Re-check button.
                </p>
              </div>

              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs font-medium text-foreground hover:underline"
                onClick={() => setDecisionAdvanced((v) => !v)}
                data-testid="button-toggle-decision-model-advanced"
              >
                {decisionAdvanced ? "Hide advanced details" : "Read more (advanced)"}
                <IconChevronDown
                  className={cn("h-3.5 w-3.5 transition-transform", decisionAdvanced && "rotate-180")}
                />
              </button>

              {decisionAdvanced && (
                <div className="rounded-md border border-border bg-muted/40 p-3 space-y-2 text-xs text-muted-foreground">
                  <p>
                    Decisions go through OpenRouter Decisions (System One), not chat completions. Each
                    question returns a <code className="font-mono text-[11px]">noul</code> score; 0.55 or
                    higher counts as yes. Calls time out after 2s and send at most 12,000 characters.
                  </p>
                  <p>
                    Moment 1: <code className="font-mono text-[11px]">proposal.touches_outcome_figures</code>{" "}
                    — only for edit proposals whose claim cues are ambiguous. Result lands on the review as{" "}
                    <code className="font-mono text-[11px]">jev_claim_cue</code> /{" "}
                    <code className="font-mono text-[11px]">jev_claim_cue_unavailable</code> and turns on
                    the <code className="font-mono text-[11px]">selling_page_figures</code> checklist.
                  </p>
                  <p>
                    Moment 2: <code className="font-mono text-[11px]">proposal.touches_site_facts</code> —
                    runs when a site-facts checklist is active. Cached per proposal in{" "}
                    <code className="font-mono text-[11px]">site_facts_check_json</code> by text hash;
                    unavailable results retry on the next read. Down → warning{" "}
                    <code className="font-mono text-[11px]">jev_unavailable</code> and discovery suggests{" "}
                    <code className="font-mono text-[11px]">list_variables facts_only</code>.
                  </p>
                  <p>
                    Proposals are tagged <code className="font-mono text-[11px]">used_jev</code> or{" "}
                    <code className="font-mono text-[11px]">used_jev_unavailable</code>. Health lives in{" "}
                    <code className="font-mono text-[11px]">pipeline_state.decision_model_health</code>{" "}
                    and drives the <code className="font-mono text-[11px]">decision_model_unavailable</code>{" "}
                    alert. Code: <code className="font-mono text-[11px]">server/ai/decisions/</code>.
                  </p>
                </div>
              )}
            </CardContent>
          )}
        </Card>
      </div>

      <div
        className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 shadow-lg"
        data-testid="ai-models-save-bar"
      >
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-end gap-3">
          <p
            className={cn(
              "text-xs min-w-0 truncate text-right",
              dirty ? "text-destructive" : "text-muted-foreground",
            )}
            data-testid="text-ai-models-save-status"
          >
            {saving ? "Saving…" : dirty ? "Unsaved changes" : "All changes saved"}
          </p>
          <Button
            size="sm"
            className="gap-1.5 shrink-0"
            onClick={handleSave}
            disabled={!dirty || saving || !selectedDefault.trim()}
            data-testid="button-save-ai-settings"
          >
            {saving ? (
              <IconLoader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <IconDeviceFloppy className="h-3.5 w-3.5" aria-hidden />
            )}
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      {showYmlEditor && (
        <Suspense fallback={null}>
          <LlmYmlEditorPanel
            onClose={() => setShowYmlEditor(false)}
            onSaved={() => {
              queryClient.invalidateQueries({ queryKey: ["/api/admin/ai/settings"] });
              setShowYmlEditor(false);
            }}
          />
        </Suspense>
      )}
    </>
  );
}

export default function AISettingsPage() {
  const [pathname, setLocation] = useLocation();
  const activeTab = resolveAiTab(pathname);

  useEffect(() => {
    if (pathname === "/private/settings/ai" || pathname === "/private/settings/ai/") {
      setLocation("/private/settings/ai/llms", { replace: true });
    }
  }, [pathname, setLocation]);

  if (!activeTab) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <IconLoader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <SettingsShell
      section="ai"
      icon={IconSparkles}
      title="AI Settings"
      titleTestId="text-ai-settings-title"
      backTestId="button-ai-settings-back"
      description="Models, providers, and semantic search infrastructure."
      secondary={{
        value: activeTab,
        tabs: AI_TABS,
        listTestId: "ai-settings-tablist",
        triggerTestId: (id) => `tab-${id}`,
      }}
    >
      <div role="tabpanel">
        {activeTab === "llms" && <LlmsTab />}
        {activeTab === "qdrant" && <QdrantTab />}
        {activeTab === "prompts" && <PromptLibraryTab />}
      </div>
    </SettingsShell>
  );
}
