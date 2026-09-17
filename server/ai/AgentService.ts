import OpenAI from "openai";
import { getDefaultContentRoot } from "../site-config";
import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import { contentCompiler } from "./ContentCompiler";
import { conversationStore, ConversationStore } from "./ConversationStore";
import { TOOL_DEFINITIONS, executeToolCall } from "./tools/index";
import { resolveLLMApiKey, resolveLLMBaseURL } from "./LLMService";
import { child } from "../logger";
const log = child({ module: "ai/AgentService" });



interface LLMConfig {
  provider?: { api_key_env?: string; base_url_env?: string };
  model?: string | { default: string; chat?: string };
  temperature?: number;
  max_tokens?: number;
  question_tags?: string[];
  agent_tools?: Array<{ name: string; description: string; enabled: boolean }>;
  chat_bubble?: { enabled?: boolean; page_patterns?: string[]; content_types?: string[] };
}

function resolveModel(config: LLMConfig, mode: "default" | "chat"): string {
  const fallback = "openai/gpt-4o-mini";
  if (typeof config.model === "string") {
    if (mode === "chat") return process.env.LLM_CHAT_MODEL || config.model || fallback;
    return process.env.LLM_MODEL || config.model || fallback;
  }
  if (typeof config.model === "object" && config.model !== null) {
    if (mode === "chat") return process.env.LLM_CHAT_MODEL || config.model.chat || config.model.default || fallback;
    return process.env.LLM_MODEL || config.model.default || fallback;
  }
  if (mode === "chat") return process.env.LLM_CHAT_MODEL || process.env.LLM_MODEL || fallback;
  return process.env.LLM_MODEL || fallback;
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

interface AgentResponse {
  content: string;
  questionTag: string | null;
  trace: AgentTrace;
}

function loadConfig(contentRoot?: string): LLMConfig {
  try {
    const configPath = contentRoot
      ? path.join(contentRoot, "llm.yml")
      : path.join(getDefaultContentRoot(), "llm.yml");
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, "utf-8");
      return yaml.load(raw) as LLMConfig;
    }
  } catch (err) {
    log.warn({ err }, "[AgentService] Failed to load llm.yml");
  }
  return {};
}

function getOpenAIClient(config: LLMConfig): OpenAI {
  const apiKeyEnv = config.provider?.api_key_env || "OPENROUTER_API_KEY";
  const baseUrlEnv = config.provider?.base_url_env || "OPENROUTER_BASE_URL";

  const apiKey = resolveLLMApiKey(apiKeyEnv);
  const baseURL = resolveLLMBaseURL(baseUrlEnv);

  if (!apiKey) {
    throw new Error(`API key not configured. Set ${apiKeyEnv} in environment.`);
  }

  return new OpenAI({
    apiKey,
    ...(baseURL ? { baseURL } : {}),
  });
}


export class AgentService {
  private config: LLMConfig;
  private client: OpenAI | null = null;

  constructor() {
    this.config = loadConfig();
    this.reloadClient();
  }

  private reloadClient(): void {
    try {
      this.client = getOpenAIClient(this.config);
    } catch (err) {
      log.warn({ err }, "[AgentService] API client unavailable (missing API key?)");
      this.client = null;
    }
  }

  reload(): void {
    this.config = loadConfig();
    this.reloadClient();
  }

  private requireClient(): OpenAI {
    if (!this.client) {
      this.reloadClient();
    }
    if (!this.client) {
      const apiKeyEnv = this.config.provider?.api_key_env || "OPENROUTER_API_KEY";
      throw new Error(`API key not configured. Set ${apiKeyEnv} in environment.`);
    }
    return this.client;
  }

  getConfig(): LLMConfig {
    return this.config;
  }

  private async buildSystemPrompt(
    pageContext: string,
    globalSummary: string,
    questionTag: string | null = null,
    store: ConversationStore = conversationStore
  ): Promise<string> {
    let systemPrompt = await store.getKnowledge("system_prompt") as string | null;

    if (!systemPrompt) {
      systemPrompt = `You are a helpful admissions assistant for 4Geeks Academy, a coding bootcamp that offers career-changing programs in software development, data science, and AI/ML.

Your role is to help prospective students by:
- Answering questions about programs, pricing, locations, and the admissions process
- Providing accurate information based on the content available
- Being friendly, professional, and encouraging
- Never making up information - if you don't know, say so and suggest they contact admissions

Always respond in the same language as the user's message.`;
    }

    const parts: string[] = [systemPrompt];

    if (pageContext) {
      parts.push("\n--- Current Page Context ---");
      parts.push(pageContext);
    }

    if (globalSummary) {
      parts.push("\n--- Available Programs and Locations ---");
      parts.push(globalSummary);
    }

    const pinnedQA = await store.getKnowledge("pinned_qa") as Array<{ question: string; answer: string; tag?: string }> | null;
    if (pinnedQA && pinnedQA.length > 0) {
      parts.push("\n--- Pinned Q&A (always use these exact answers) ---");
      for (const qa of pinnedQA) {
        parts.push(`Q: ${qa.question}\nA: ${qa.answer}`);
      }
    }

    const knowledgeBlocks = await store.getKnowledge("custom_knowledge") as Array<{ content: string; tag?: string }> | null;
    if (knowledgeBlocks && knowledgeBlocks.length > 0) {
      const filtered = questionTag
        ? knowledgeBlocks.filter(block => !block.tag || block.tag === questionTag)
        : knowledgeBlocks;
      if (filtered.length > 0) {
        parts.push("\n--- Additional Knowledge ---");
        for (const block of filtered) {
          parts.push(block.content);
        }
      }
    }

    return parts.join("\n");
  }

  private getEnabledTools(): OpenAI.Chat.ChatCompletionTool[] {
    const agentTools = this.config.agent_tools;
    if (!agentTools || agentTools.length === 0) return TOOL_DEFINITIONS;

    const enabledToolNames = agentTools
      .filter(t => t.enabled)
      .map(t => t.name);

    if (enabledToolNames.length === 0) return [];

    return TOOL_DEFINITIONS.filter((t) =>
      enabledToolNames.includes((t as OpenAI.Chat.ChatCompletionFunctionTool).function.name),
    );
  }

  private async autoTagMessage(content: string): Promise<string | null> {
    const tags = this.config.question_tags;
    if (!tags || tags.length === 0) return null;

    try {
      const tagPrompt = `Classify the following user question into exactly one of these categories: ${tags.join(", ")}

Question: "${content}"

Respond with ONLY the category name, nothing else.`;

      const response = await this.requireClient().chat.completions.create({
        model: resolveModel(this.config, "default"),
        messages: [{ role: "user", content: tagPrompt }],
        temperature: 0,
        max_tokens: 50,
      });

      const tag = response.choices[0]?.message?.content?.trim().toLowerCase();
      if (tag && tags.includes(tag)) return tag;
      return tags.find(t => tag?.includes(t)) || "general-inquiry";
    } catch {
      return "general-inquiry";
    }
  }

  async processMessage(
    conversationId: string,
    userMessage: string,
    contentType: string | null,
    contentSlug: string | null,
    locale: string,
    store: ConversationStore = conversationStore
  ): Promise<AgentResponse> {
    const { pageContext, globalSummary } = contentCompiler.compile(contentType, contentSlug, locale);

    const questionTag = await this.autoTagMessage(userMessage);

    const systemPrompt = await this.buildSystemPrompt(pageContext, globalSummary, questionTag, store);

    const previousMessages = await store.getMessages(conversationId);
    const chatHistory: OpenAI.Chat.ChatCompletionMessageParam[] = previousMessages.map(m => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...chatHistory,
    ];

    if (!chatHistory.length || chatHistory[chatHistory.length - 1].content !== userMessage) {
      messages.push({ role: "user", content: userMessage });
    }

    const model = resolveModel(this.config, "chat");
    const tools = this.getEnabledTools();

    const trace: AgentTrace = {
      model,
      totalTokens: 0,
      promptTokens: 0,
      completionTokens: 0,
      iterations: 0,
      toolCalls: [],
    };

    const accumulateUsage = (usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined) => {
      if (!usage) return;
      const prompt = usage.prompt_tokens || 0;
      const completion = usage.completion_tokens || 0;
      trace.promptTokens += prompt;
      trace.completionTokens += completion;
      trace.totalTokens += usage.total_tokens || (prompt + completion);
    };

    let response = await this.requireClient().chat.completions.create({
      model,
      messages,
      temperature: this.config.temperature ?? 0.3,
      max_tokens: this.config.max_tokens || 4000,
      tools: tools.length > 0 ? tools : undefined,
    });

    accumulateUsage(response.usage);

    let assistantMessage = response.choices[0]?.message;
    let iterations = 0;
    const maxIterations = 5;

    log.info(`[AgentService] Initial response — finish_reason: ${response.choices[0]?.finish_reason}, tool_calls: ${assistantMessage?.tool_calls?.length || 0}`);

    while (assistantMessage?.tool_calls && assistantMessage.tool_calls.length > 0 && iterations < maxIterations) {
      iterations++;
      const toolNames = assistantMessage.tool_calls.map(
        (tc) => (tc as OpenAI.Chat.ChatCompletionMessageFunctionToolCall).function.name,
      );
      log.info(`[AgentService] Tool-call iteration ${iterations}/${maxIterations} — tools: [${toolNames.join(", ")}]`);

      messages.push({
        role: "assistant" as const,
        content: assistantMessage.content || null,
        tool_calls: assistantMessage.tool_calls,
      });

      for (const toolCall of assistantMessage.tool_calls) {
        const fnCall = toolCall as OpenAI.Chat.ChatCompletionMessageFunctionToolCall;
        let args: Record<string, string> = {};
        try {
          args = JSON.parse(fnCall.function.arguments || "{}");
        } catch {
          args = {};
        }
        const result = executeToolCall(fnCall.function.name, args);

        trace.toolCalls.push({
          name: fnCall.function.name,
          arguments: args,
          result,
        });

        messages.push({
          role: "tool" as const,
          tool_call_id: toolCall.id,
          content: result,
        });
      }

      response = await this.requireClient().chat.completions.create({
        model,
        messages,
        temperature: this.config.temperature ?? 0.3,
        max_tokens: this.config.max_tokens || 4000,
        tools: tools.length > 0 ? tools : undefined,
      });

      accumulateUsage(response.usage);

      assistantMessage = response.choices[0]?.message;
      log.info(`[AgentService] After iteration ${iterations} — finish_reason: ${response.choices[0]?.finish_reason}, has_content: ${!!assistantMessage?.content}, tool_calls: ${assistantMessage?.tool_calls?.length || 0}`);
    }

    trace.iterations = iterations;

    if (!assistantMessage?.content) {
      log.info(`[AgentService] No content after ${iterations} tool-call iteration(s) — making rescue call without tools`);
      const rescueResponse = await this.requireClient().chat.completions.create({
        model,
        messages,
        temperature: this.config.temperature ?? 0.3,
        max_tokens: this.config.max_tokens || 4000,
      });
      accumulateUsage(rescueResponse.usage);
      assistantMessage = rescueResponse.choices[0]?.message;
      log.info(`[AgentService] Rescue call — finish_reason: ${rescueResponse.choices[0]?.finish_reason}, has_content: ${!!assistantMessage?.content}`);
    }

    const responseContent = assistantMessage?.content || "I'm sorry, I couldn't generate a response. Please try again.";

    return {
      content: responseContent,
      questionTag,
      trace,
    };
  }

  async clusterQuestions(
    questions: Array<{ content: string; question_tag: string | null }>,
    tags: string[]
  ): Promise<Array<{ tag: string; count: number; examples: string[] }>> {
    const tagPrompt = `You are analyzing customer support questions. Group the following questions into these categories: ${tags.join(", ")}

Questions:
${questions.map((q, i) => `${i + 1}. ${q.content}`).join("\n")}

Respond in JSON format:
[{"tag": "category-name", "count": number, "examples": ["example question 1", "example question 2"]}]

Only include categories that have at least one question. Limit examples to 3 per category.`;

    const model = resolveModel(this.config, "default");

    const response = await this.requireClient().chat.completions.create({
      model,
      messages: [{ role: "user", content: tagPrompt }],
      temperature: 0,
      max_tokens: 2000,
    });

    const content = response.choices[0]?.message?.content || "[]";
    try {
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch {}
    return [];
  }
}

let agentServiceInstance: AgentService | null = null;

export function getAgentService(): AgentService {
  if (!agentServiceInstance) {
    agentServiceInstance = new AgentService();
  }
  return agentServiceInstance;
}
