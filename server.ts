import dotenv from "dotenv";
import "dotenv/config";
import express from "express";
import fs from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleGenAI, Type } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ALLOWED_CATEGORIES = [
  "AI开发与Agent",
  "工程与效率工具",
  "3D与多模态创作",
  "内容与商业洞察",
] as const;

const ALLOWED_VERDICTS = [
  "✅ 属实",
  "⚠️ 部分夸大或有隐藏短板",
  "❌ 伪命题或已失效",
] as const;

const JUDGE_LABELS = {
  high_value_eng: {
    label: "高价值工程/AI情报",
    defaultSelected: true,
  },
  open_source_repo: {
    label: "开源项目/工具库",
    defaultSelected: true,
  },
  read_later: {
    label: "待稍后看",
    defaultSelected: false,
  },
  noise_spam: {
    label: "低质水贴/广告噪音",
    defaultSelected: false,
  },
} as const;

type JudgeKey = keyof typeof JUDGE_LABELS;
type ApiProtocol = "openai-compatible" | "gemini" | "anthropic";

interface EndpointConfigPayload {
  id?: string;
  name?: string;
  provider?: string;
  protocol: ApiProtocol;
  baseUrl: string;
  modelId: string;
  envKeyName: string;
  enableSearch?: boolean;
  thinkingLevel?: "low" | "medium" | "high";
}

const ENV_VAR_REGEX = /^[A-Z][A-Z0-9_]{1,63}$/;

class ProxyHttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function validateBaseUrl(rawUrl: string): string {
  const cleaned = String(rawUrl || "").trim().replace(/\/+$/, "");
  let parsed: URL;
  try {
    parsed = new URL(cleaned);
  } catch {
    throw new ProxyHttpError(400, `无效的接口 Base URL：${rawUrl}`);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new ProxyHttpError(400, "接口地址仅支持 http:// 或 https:// 协议。");
  }
  return cleaned;
}

function resolveEndpointSecret(envKeyNameRaw: string): {
  apiKey: string;
  envKeyName: string;
  isKeyless: boolean;
} {
  const envKeyName = String(envKeyNameRaw || "").trim().toUpperCase();
  if (envKeyName === "NONE") {
    return { apiKey: "", envKeyName: "NONE", isKeyless: true };
  }
  if (!ENV_VAR_REGEX.test(envKeyName)) {
    throw new ProxyHttpError(
      400,
      `无效的环境变量名「${envKeyNameRaw}」，仅允许大写字母、数字和下划线（或使用 NONE）。`
    );
  }
  const apiKey = (process.env[envKeyName] || "").trim();
  if (!apiKey) {
    throw new ProxyHttpError(
      400,
      `服务端未检测到环境变量 ${envKeyName}。请在平台 Settings > Secrets 中添加同名变量并填入该厂商 API Key 后重试。`
    );
  }
  return { apiKey, envKeyName, isKeyless: false };
}

function validateEndpointPayload(raw: unknown): EndpointConfigPayload {
  if (!raw || typeof raw !== "object") {
    throw new ProxyHttpError(
      400,
      "尚未配置或绑定自定义模型接口，请先点击右上角「自定义接口」添加并绑定接口。"
    );
  }
  const ep = raw as Partial<EndpointConfigPayload>;
  const protocol: ApiProtocol =
    ep.protocol === "gemini" ||
    ep.protocol === "anthropic" ||
    ep.protocol === "openai-compatible"
      ? ep.protocol
      : "openai-compatible";
  const baseUrl = validateBaseUrl(ep.baseUrl || "");
  const modelId = String(ep.modelId || "").trim();
  if (!modelId) {
    throw new ProxyHttpError(400, "自定义接口缺少模型 ID (modelId)。");
  }
  const envKeyName = String(ep.envKeyName || "").trim().toUpperCase();
  if (!envKeyName) {
    throw new ProxyHttpError(400, "自定义接口缺少环境变量绑定名 (envKeyName)。");
  }
  return {
    id: ep.id,
    name: ep.name,
    provider: ep.provider,
    protocol,
    baseUrl,
    modelId,
    envKeyName,
    enableSearch: Boolean(ep.enableSearch),
    thinkingLevel:
      ep.thinkingLevel === "medium" || ep.thinkingLevel === "high"
        ? ep.thinkingLevel
        : "low",
  };
}

function createGeminiClient(
  apiKey: string,
  baseUrl: string,
  apiVersion?: string
) {
  const normalizedBase = baseUrl.replace(/\/+$/, "");
  const isDefaultGoogle =
    !normalizedBase ||
    normalizedBase === "https://generativelanguage.googleapis.com";
  return new GoogleGenAI({
    apiKey,
    ...(apiVersion ? { apiVersion } : {}),
    httpOptions: {
      ...(isDefaultGoogle ? {} : { baseUrl: normalizedBase }),
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

function extractApiError(err: unknown): { status: number; message: string } {
  if (err instanceof ProxyHttpError) {
    return { status: err.status, message: err.message };
  }
  const raw = err as {
    status?: number;
    code?: number;
    message?: string;
    error?: { code?: number; message?: string; status?: string };
  };
  const status =
    typeof raw?.status === "number"
      ? raw.status
      : typeof raw?.error?.code === "number"
        ? raw.error.code
        : typeof raw?.code === "number" && raw.code >= 400 && raw.code < 600
          ? raw.code
          : 500;
  const detail = raw?.error?.message || raw?.message || "未知服务器错误";

  if (
    status === 401 ||
    status === 403 ||
    detail.includes("API_KEY_INVALID") ||
    detail.includes("PERMISSION_DENIED")
  ) {
    return {
      status: status === 401 ? 401 : 403,
      message: `API 鉴权失败（${detail}），请检查 Settings > Secrets 中对应环境变量的密钥是否正确或具有权限。`,
    };
  }
  if (status === 429 || detail.includes("RESOURCE_EXHAUSTED")) {
    return {
      status: 429,
      message: `接口调用触发频率或配额限制（429）：${detail}`,
    };
  }
  if (
    status === 400 &&
    /safety|prohibited_content|blocklist|image_safety|content_blocked/i.test(
      detail
    )
  ) {
    return {
      status: 400,
      message: "输入内容触发安全策略限制，无法继续处理。",
    };
  }
  if (
    raw?.message?.includes("aborted") ||
    raw?.message?.includes("timeout") ||
    (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError"))
  ) {
    return {
      status: 504,
      message: "请求自定义模型接口超时，请检查 Base URL 网络连通性、模型响应速度或代理状态。",
    };
  }
  return {
    status,
    message: detail,
  };
}

async function callOpenAICompatible(params: {
  baseUrl: string;
  apiKey: string;
  modelId: string;
  systemPrompt: string;
  userPrompt: string;
  jsonMode?: boolean;
  maxTokens?: number;
  timeoutMs?: number;
}): Promise<string> {
  const url = params.baseUrl.endsWith("/chat/completions")
    ? params.baseUrl
    : `${params.baseUrl}/chat/completions`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (params.apiKey) {
    headers.Authorization = `Bearer ${params.apiKey}`;
  }

  const doRequest = async (opts: {
    useJsonFormat: boolean;
    includeTemperature: boolean;
    useMaxCompletionTokens: boolean;
  }) => {
    const body: Record<string, unknown> = {
      model: params.modelId,
      messages: [
        { role: "system", content: params.systemPrompt },
        { role: "user", content: params.userPrompt },
      ],
      ...(opts.includeTemperature ? { temperature: 0.1 } : {}),
      ...(params.maxTokens
        ? opts.useMaxCompletionTokens
          ? { max_completion_tokens: params.maxTokens }
          : { max_tokens: params.maxTokens }
        : {}),
      ...(opts.useJsonFormat ? { response_format: { type: "json_object" } } : {}),
    };

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(params.timeoutMs ?? 60_000),
    });

    const text = await response.text();
    let data: Record<string, unknown> = {};
    try {
      data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      // keep empty object
    }

    if (!response.ok) {
      const errObj = data.error as { message?: string } | string | undefined;
      const errMsg =
        typeof errObj === "string"
          ? errObj
          : errObj?.message ||
            (typeof data.message === "string" ? data.message : "") ||
            text.slice(0, 300) ||
            `HTTP ${response.status}`;
      throw new ProxyHttpError(response.status, errMsg);
    }

    const choices = data.choices as
      | Array<{
          message?: { content?: string | Array<{ text?: string }> };
        }>
      | undefined;
    const content = choices?.[0]?.message?.content;
    if (typeof content === "string") {
      return content.trim();
    }
    if (Array.isArray(content)) {
      return content
        .map((c) => (typeof c?.text === "string" ? c.text : ""))
        .join("")
        .trim();
    }
    return "";
  };

  let useJsonFormat = Boolean(params.jsonMode);
  let includeTemperature = true;
  let useMaxCompletionTokens = false;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await doRequest({
        useJsonFormat,
        includeTemperature,
        useMaxCompletionTokens,
      });
    } catch (err) {
      if (!(err instanceof ProxyHttpError) || err.status !== 400 || attempt === 2) {
        throw err;
      }
      let retried = false;
      if (
        useJsonFormat &&
        /response_format|json_object|unsupported/i.test(err.message)
      ) {
        useJsonFormat = false;
        retried = true;
      }
      if (includeTemperature && /temperature/i.test(err.message)) {
        includeTemperature = false;
        retried = true;
      }
      if (
        !useMaxCompletionTokens &&
        /max_tokens|max_completion_tokens/i.test(err.message)
      ) {
        useMaxCompletionTokens = true;
        retried = true;
      }
      if (!retried) throw err;
    }
  }
  return "";
}

async function callAnthropicMessages(params: {
  baseUrl: string;
  apiKey: string;
  modelId: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  timeoutMs?: number;
}): Promise<string> {
  const url = params.baseUrl.endsWith("/messages")
    ? params.baseUrl
    : `${params.baseUrl}/messages`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "anthropic-version": "2023-06-01",
  };
  if (params.apiKey) {
    headers["x-api-key"] = params.apiKey;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: params.modelId,
      max_tokens: params.maxTokens ?? 4096,
      temperature: 0.1,
      system: params.systemPrompt,
      messages: [{ role: "user", content: params.userPrompt }],
    }),
    signal: AbortSignal.timeout(params.timeoutMs ?? 60_000),
  });

  const text = await response.text();
  let data: Record<string, unknown> = {};
  try {
    data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    // ignore
  }

  if (!response.ok) {
    const errObj = data.error as { message?: string } | undefined;
    const errMsg =
      errObj?.message ||
      (typeof data.message === "string" ? data.message : "") ||
      text.slice(0, 300) ||
      `HTTP ${response.status}`;
    throw new ProxyHttpError(response.status, errMsg);
  }

  const blocks = data.content as
    | Array<{ type?: string; text?: string }>
    | undefined;
  if (!Array.isArray(blocks)) return "";
  return blocks
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("")
    .trim();
}

function sanitizeUrl(raw: unknown, mode: "x" | "repo"): string {
  if (typeof raw !== "string") return "";
  const match = raw.match(/https?:\/\/[^\s<>"')\]，。,;；]+/i);
  if (!match) return "";
  let url = match[0].replace(/[.,;:!?)\]]+$/, "").trim();
  if (mode === "x") {
    url = url.replace(/^https?:\/\/(www\.)?twitter\.com\//i, "https://x.com/");
    if (!/^https?:\/\/(www\.)?x\.com\//i.test(url)) return "";
  }
  return url;
}

function stripThinkingBlocks(rawText: string): string {
  return rawText
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, "")
    .trim();
}

function extractJsonObject(rawText: string): Record<string, unknown> | null {
  const trimmed = stripThinkingBlocks(rawText);
  const candidates: string[] = [];

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    candidates.push(fenced[1].trim());
  }
  candidates.push(trimmed);

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // try next
    }
  }
  return null;
}

function extractJsonArray(rawText: string): unknown[] | null {
  const trimmed = stripThinkingBlocks(rawText);
  const candidates: string[] = [];

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    candidates.push(fenced[1].trim());
  }
  candidates.push(trimmed);

  const firstBracket = trimmed.indexOf("[");
  const lastBracket = trimmed.lastIndexOf("]");
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    candidates.push(trimmed.slice(firstBracket, lastBracket + 1));
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed)) return parsed;
      if (
        parsed &&
        typeof parsed === "object" &&
        Array.isArray((parsed as { records?: unknown[] }).records)
      ) {
        return (parsed as { records: unknown[] }).records;
      }
      if (parsed && typeof parsed === "object") {
        return [parsed];
      }
    } catch {
      // Try next candidate
    }
  }
  return null;
}

const VERIFY_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    records: {
      type: Type.ARRAY,
      description:
        "结构化核查记录数组。如果推文包含多个独立的开源项目或工具，必须拆分为多条记录。",
      items: {
        type: Type.OBJECT,
        properties: {
          category: {
            type: Type.STRING,
            description:
              "一级分类，必须严格四选一：AI开发与Agent、工程与效率工具、3D与多模态创作、内容与商业洞察",
            enum: [...ALLOWED_CATEGORIES],
          },
          coreTopic: {
            type: Type.STRING,
            description: "核心主题：25字以内的客观中文标题，禁止夸大词汇。",
          },
          verdict: {
            type: Type.STRING,
            description:
              "核查结论，必须严格三选一：✅ 属实、⚠️ 部分夸大或有隐藏短板、❌ 伪命题或已失效",
            enum: [...ALLOWED_VERDICTS],
          },
          projectOrTool: {
            type: Type.STRING,
            description:
              "关联项目/工具：标准格式如 owner/repo (14.2k⭐) 或官方工具名。",
          },
          factCheckAndCaveats: {
            type: Type.STRING,
            description:
              "事实核查与短板：客观记录核实的真实能力、Star数、归档/只读状态、License限制、硬件或付费门槛、作者夸大之处或死链情况。",
          },
          reusableMethodology: {
            type: Type.STRING,
            description:
              "可复用方法论：提炼可迁移的系统架构、Prompt 设计、评测思路或工程工作流规律。",
          },
          keywords: {
            type: Type.STRING,
            description: "关键词标签：3-6个精准标签，用英文逗号分隔。",
          },
          xUrl: {
            type: Type.STRING,
            description:
              "推特X链接：纯净的 https://x.com/... URL，无任何前缀文字；如无则留空字符串。",
          },
          repoUrl: {
            type: Type.STRING,
            description:
              "仓库/项目链接：纯净的 https://github.com/... 或项目官网 URL，无任何前缀文字；如无则留空字符串。",
          },
        },
        required: [
          "category",
          "coreTopic",
          "verdict",
          "projectOrTool",
          "factCheckAndCaveats",
          "reusableMethodology",
          "keywords",
          "xUrl",
          "repoUrl",
        ],
      },
    },
  },
  required: ["records"],
};

const TRIAGE_JSON_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    judgeKey: {
      type: Type.STRING,
      enum: [
        "high_value_eng",
        "open_source_repo",
        "read_later",
        "noise_spam",
      ],
      description: "四选一分类键",
    },
    confidence: {
      type: Type.NUMBER,
      description: "0到1之间的置信度",
    },
  },
  required: ["judgeKey", "confidence"],
};

function parseTriageJson(rawText: string): {
  judgeKey: JudgeKey;
  confidence: number;
} {
  const cleaned = stripThinkingBlocks(rawText);
  const parsed = extractJsonObject(cleaned);
  const rawKey = String(parsed?.judgeKey ?? "").trim();
  let judgeKey: JudgeKey = "read_later";
  if (rawKey in JUDGE_LABELS) {
    judgeKey = rawKey as JudgeKey;
  } else if (/high_value|高价值|工程|AI情报/i.test(cleaned)) {
    judgeKey = "high_value_eng";
  } else if (/open_source|开源|工具库|仓库/i.test(cleaned)) {
    judgeKey = "open_source_repo";
  } else if (/noise|spam|广告|噪音|水贴/i.test(cleaned)) {
    judgeKey = "noise_spam";
  }

  const rawConf = Number(parsed?.confidence);
  const confidence =
    Number.isFinite(rawConf) && rawConf >= 0 && rawConf <= 1 ? rawConf : 0.86;
  return { judgeKey, confidence };
}

function normalizeRecordItem(
  raw: Record<string, unknown>,
  fallbackXUrl: string,
  fallbackRepoUrl: string
) {
  const rawCat = String(raw.category ?? "").trim();
  const category = (ALLOWED_CATEGORIES as readonly string[]).includes(rawCat)
    ? rawCat
    : rawCat.includes("3D") || rawCat.includes("多模态")
      ? "3D与多模态创作"
      : rawCat.includes("商业") || rawCat.includes("内容")
        ? "内容与商业洞察"
        : rawCat.includes("效率") || rawCat.includes("工程")
          ? "工程与效率工具"
          : "AI开发与Agent";

  const rawVerdict = String(raw.verdict ?? "").trim();
  const verdict = (ALLOWED_VERDICTS as readonly string[]).includes(rawVerdict)
    ? rawVerdict
    : rawVerdict.includes("伪命题") ||
        rawVerdict.includes("失效") ||
        rawVerdict.includes("❌")
      ? "❌ 伪命题或已失效"
      : rawVerdict.includes("夸大") ||
          rawVerdict.includes("短板") ||
          rawVerdict.includes("⚠")
        ? "⚠️ 部分夸大或有隐藏短板"
        : "✅ 属实";

  const coreTopic = String(raw.coreTopic ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 32);

  const xUrl = sanitizeUrl(raw.xUrl, "x") || sanitizeUrl(fallbackXUrl, "x");
  const repoUrl =
    sanitizeUrl(raw.repoUrl, "repo") || sanitizeUrl(fallbackRepoUrl, "repo");

  return {
    category,
    coreTopic: coreTopic || "未命名情报条目",
    verdict,
    projectOrTool: String(raw.projectOrTool ?? "").trim() || "未注明项目",
    factCheckAndCaveats:
      String(raw.factCheckAndCaveats ?? "").trim() || "暂未发现公开异常记录。",
    reusableMethodology:
      String(raw.reusableMethodology ?? "").trim() || "待人工补充工程方法论。",
    keywords: String(raw.keywords ?? "")
      .replace(/[，、]/g, ", ")
      .replace(/\s*,\s*/g, ", ")
      .trim(),
    xUrl,
    repoUrl,
  };
}

function extractTextFromGeminiInteraction(interaction: {
  output_text?: string | null;
  steps?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
}): string {
  if (interaction.output_text && interaction.output_text.trim()) {
    return interaction.output_text.trim();
  }
  let combined = "";
  for (const step of interaction.steps ?? []) {
    if (step.type === "model_output" && Array.isArray(step.content)) {
      for (const part of step.content) {
        if (part.type === "text" && part.text) {
          combined += part.text;
        }
      }
    }
  }
  return combined.trim();
}

function extractSourcesFromGeminiSteps(steps: unknown[] | undefined) {
  if (!Array.isArray(steps)) return [];
  const found: Array<{ title: string; uri: string }> = [];
  for (const step of steps) {
    if (!step || typeof step !== "object") continue;
    const s = step as {
      type?: string;
      result?: Array<{ title?: string; url?: string; uri?: string }>;
    };
    if (s.type === "google_search_result" && Array.isArray(s.result)) {
      for (const item of s.result) {
        const uri = item.url || item.uri || "";
        if (uri) {
          found.push({ title: item.title || uri, uri });
        }
      }
    }
  }
  return found;
}

export interface StartServerOptions {
  port?: number;
  host?: string;
  distDir?: string;
  envFilePath?: string;
}

export async function startServer(
  options: StartServerOptions = {}
): Promise<{ server: Server; port: number }> {
  const envFile = options.envFilePath || process.env.ENV_FILE_PATH;
  if (envFile && fs.existsSync(envFile)) {
    dotenv.config({ path: envFile, override: false });
  }

  const app = express();
  const PORT =
    typeof options.port === "number"
      ? options.port
      : Number(process.env.PORT ?? 3000);
  const HOST = options.host || "0.0.0.0";

  app.use(express.json({ limit: "30mb" }));

  /**
   * Read-only presence check of server-side Secrets environment variable names.
   * Returns ONLY booleans (never secret values).
   */
  app.get("/api/providers/env-status", (req, res) => {
    const rawNames = String(req.query.names || "");
    const requested = rawNames
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter((s) => ENV_VAR_REGEX.test(s))
      .slice(0, 30);

    const status: Record<string, boolean> = {};
    for (const name of requested) {
      status[name] = Boolean(process.env[name]?.trim());
    }
    return res.json({ status });
  });

  /**
   * Connectivity smoke test for any user-configured custom endpoint
   */
  app.post("/api/providers/test", async (req, res) => {
    const startedAt = Date.now();
    try {
      const endpoint = validateEndpointPayload(req.body?.endpoint);
      const { apiKey } = resolveEndpointSecret(endpoint.envKeyName);

      let replyPreview = "";

      if (endpoint.protocol === "gemini") {
        if (endpoint.modelId === "gemini-decision-1") {
          const ai = createGeminiClient(apiKey, endpoint.baseUrl, "v1beta");
          const resp = await ai.decisions.create({
            model: "gemini-decision-1",
            input: [{ type: "text", text: "Open-source GitHub AI Agent SDK" }],
            questions: {
              ping: {
                type: "choice",
                instructions: "Is this related to software or AI?",
                criteria: {
                  yes: "Related to software engineering or AI",
                  no: "Not related to software engineering or AI",
                },
              },
            },
          });
          const ans = resp.answers?.ping;
          replyPreview =
            ans && ans.type === "choice"
              ? `Decisions API OK (${ans.choice})`
              : "Decisions API OK";
        } else {
          const ai = createGeminiClient(apiKey, endpoint.baseUrl);
          const interaction = await ai.interactions.create({
            model: endpoint.modelId,
            input: "Reply with OK in one word.",
            store: false,
          });
          replyPreview =
            extractTextFromGeminiInteraction(
              interaction as unknown as {
                output_text?: string | null;
                steps?: Array<{
                  type?: string;
                  content?: Array<{ type?: string; text?: string }>;
                }>;
              }
            ).slice(0, 80) || "OK";
        }
      } else if (endpoint.protocol === "anthropic") {
        replyPreview = (
          await callAnthropicMessages({
            baseUrl: endpoint.baseUrl,
            apiKey,
            modelId: endpoint.modelId,
            systemPrompt: "You are a connectivity probe.",
            userPrompt: "Reply with OK in one word.",
            maxTokens: 32,
            timeoutMs: 20_000,
          })
        ).slice(0, 80);
      } else {
        replyPreview = (
          await callOpenAICompatible({
            baseUrl: endpoint.baseUrl,
            apiKey,
            modelId: endpoint.modelId,
            systemPrompt: "You are a connectivity probe.",
            userPrompt: "Reply with OK in one word.",
            jsonMode: false,
            maxTokens: 32,
            timeoutMs: 20_000,
          })
        ).slice(0, 80);
      }

      return res.json({
        ok: true,
        latencyMs: Date.now() - startedAt,
        replyPreview: replyPreview || "OK",
      });
    } catch (err) {
      const { status, message } = extractApiError(err);
      return res.status(status).json({
        ok: false,
        error: message,
        latencyMs: Date.now() - startedAt,
      });
    }
  });

  /**
   * Stage 1: Electronic Judge batch triage via user's custom endpoint
   */
  app.post("/api/triage", async (req, res) => {
    try {
      const { items, customRules, endpoint: rawEndpoint } = req.body as {
        items?: Array<{
          id: string;
          content: string;
          author?: string;
          xUrl?: string;
          externalLinks?: string[];
        }>;
        customRules?: string;
        endpoint?: EndpointConfigPayload;
      };

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "缺少待初筛的条目列表。" });
      }

      const endpoint = validateEndpointPayload(rawEndpoint);
      const { apiKey } = resolveEndpointSecret(endpoint.envKeyName);

      const rulesText =
        typeof customRules === "string" && customRules.trim()
          ? customRules.trim()
          : "包含具体架构方法、Agent工作流、开源代码库或实测数据的判为高价值；纯情绪吐槽、无实质内容的转发抽奖判为噪音。";

      const triageSystemPrompt =
        '你是一名严格的 AI 与软件工程情报“电子判官”。请仅输出严格合法的 JSON 对象：{"judgeKey":"high_value_eng|open_source_repo|read_later|noise_spam","confidence":0.92}，不得输出任何额外说明。';

      const results = await Promise.all(
        items.map(async (item) => {
          const startedAt = Date.now();
          const payloadLines = [
            item.author ? `作者: ${item.author}` : "",
            item.xUrl ? `原贴链接: ${item.xUrl}` : "",
            item.externalLinks && item.externalLinks.length > 0
              ? `外链: ${item.externalLinks.join(" | ")}`
              : "",
            `正文:\n${(item.content || "").slice(0, 6000)}`,
          ].filter(Boolean);

          const inputText = payloadLines.join("\n").trim();
          if (!inputText) {
            return {
              id: item.id,
              error: "条目内容为空，跳过判定。",
              durationMs: Date.now() - startedAt,
            };
          }

          const genericUserPrompt = `请根据以下自定义标准对条目进行四选一精准分类，并给出 0~1 之间的置信度。
自定义标准：${rulesText}

分类键定义（judgeKey 必须严格四选一）：
- high_value_eng: 高价值工程/AI情报（包含具体系统架构、Agent 工作流、Prompt 实践、实测数据、一手洞察或深度教程）
- open_source_repo: 开源项目/工具库（主要分享或推荐具体 GitHub/HuggingFace 开源代码库、SDK、CLI、框架或开发者工具）
- read_later: 待稍后看（有一定参考价值但信息密度中等的行业资讯、观点讨论、长文素材）
- noise_spam: 低质水贴/广告噪音（纯情绪吐槽、打卡灌水、转发抽奖、引流卖课或空洞标题党）

待判定条目：
${inputText}

请仅返回 JSON：{"judgeKey":"...", "confidence":0.9}`;

          try {
            if (
              endpoint.protocol === "gemini" &&
              endpoint.modelId === "gemini-decision-1"
            ) {
              const decisionsAi = createGeminiClient(
                apiKey,
                endpoint.baseUrl,
                "v1beta"
              );
              const response = await decisionsAi.decisions.create({
                model: "gemini-decision-1",
                input: [{ type: "text", text: inputText }],
                questions: {
                  intel_triage: {
                    type: "choice",
                    instructions: `你是一名严格的 AI 与软件工程情报“电子判官”。请结合以下自定义判别规则对这条推文/链接进行精准分类。\n自定义标准：${rulesText}`,
                    criteria: {
                      high_value_eng:
                        "高价值工程/AI情报：包含具体系统架构、Agent 工作流设计、Prompt 工程实践、性能优化实测数据、论文核心复盘、一手技术洞察或高密度深度教程。",
                      open_source_repo:
                        "开源项目/工具库：主要分享或推荐具体的 GitHub/HuggingFace 开源代码仓库、SDK、CLI、框架、模型权重或实用开发者工具。",
                      read_later:
                        "待稍后看：有一定参考价值但信息密度中等的行业动态、新闻资讯、观点讨论、长文链接或灵感素材，值得留存但非紧急高价值工程干货。",
                      noise_spam:
                        "低质水贴/广告噪音：纯情绪吐槽、打卡灌水、无实质内容的转发抽奖、微商引流、卖课广告、空洞标题党或重复刷屏内容。",
                    },
                  },
                },
              });

              const answer = response.answers?.intel_triage;
              if (!answer || answer.type !== "choice") {
                return {
                  id: item.id,
                  error: "模型未返回有效分类结果（可能触发内容安全策略）。",
                  durationMs: Date.now() - startedAt,
                };
              }

              const key = answer.choice as JudgeKey;
              const meta = JUDGE_LABELS[key];
              return {
                id: item.id,
                judgeKey: key,
                judgeLabel: meta?.label ?? key,
                defaultSelected: meta?.defaultSelected ?? false,
                confidence: answer.confidence,
                durationMs: Date.now() - startedAt,
              };
            }

            let rawJsonText = "";
            if (endpoint.protocol === "gemini") {
              const ai = createGeminiClient(apiKey, endpoint.baseUrl);
              const interaction = await ai.interactions.create({
                model: endpoint.modelId,
                input: genericUserPrompt,
                response_format: TRIAGE_JSON_SCHEMA,
                store: false,
              });
              rawJsonText = extractTextFromGeminiInteraction(
                interaction as unknown as {
                  output_text?: string | null;
                  steps?: Array<{
                    type?: string;
                    content?: Array<{ type?: string; text?: string }>;
                  }>;
                }
              );
            } else if (endpoint.protocol === "anthropic") {
              rawJsonText = await callAnthropicMessages({
                baseUrl: endpoint.baseUrl,
                apiKey,
                modelId: endpoint.modelId,
                systemPrompt: triageSystemPrompt,
                userPrompt: genericUserPrompt,
                maxTokens: 256,
              });
            } else {
              rawJsonText = await callOpenAICompatible({
                baseUrl: endpoint.baseUrl,
                apiKey,
                modelId: endpoint.modelId,
                systemPrompt: triageSystemPrompt,
                userPrompt: genericUserPrompt,
                jsonMode: true,
                maxTokens: 256,
              });
            }

            const { judgeKey, confidence } = parseTriageJson(rawJsonText);
            const meta = JUDGE_LABELS[judgeKey];
            return {
              id: item.id,
              judgeKey,
              judgeLabel: meta.label,
              defaultSelected: meta.defaultSelected,
              confidence,
              durationMs: Date.now() - startedAt,
            };
          } catch (itemErr) {
            const parsed = extractApiError(itemErr);
            return {
              id: item.id,
              error: parsed.message,
              status: parsed.status,
              durationMs: Date.now() - startedAt,
            };
          }
        })
      );

      const fatal = results.find(
        (r) =>
          "status" in r &&
          (r.status === 400 || r.status === 401 || r.status === 403 || r.status === 429)
      );
      if (fatal && results.every((r) => "error" in r)) {
        return res
          .status(fatal.status ?? 500)
          .json({ error: fatal.error || "批量初筛失败。" });
      }

      return res.json({
        model: endpoint.modelId,
        results,
      });
    } catch (err) {
      const { status, message } = extractApiError(err);
      return res.status(status).json({ error: message });
    }
  });

  /**
   * Stage 2: Deep Fact-Checking & 11-Column Structured Extraction via user's custom endpoint
   */
  app.post("/api/verify", async (req, res) => {
    const startedAt = Date.now();
    try {
      const { item, endpoint: rawEndpoint } = req.body as {
        item?: {
          id: string;
          content: string;
          author?: string;
          timestamp?: string;
          xUrl?: string;
          externalLinks?: string[];
          judgeLabel?: string;
        };
        endpoint?: EndpointConfigPayload;
      };

      if (
        !item ||
        (!item.content?.trim() && !item.xUrl && !item.externalLinks?.length)
      ) {
        return res.status(400).json({ error: "缺少待核查的条目数据。" });
      }

      const endpoint = validateEndpointPayload(rawEndpoint);
      const { apiKey } = resolveEndpointSecret(endpoint.envKeyName);

      const externalLinks = Array.isArray(item.externalLinks)
        ? item.externalLinks
        : [];
      const fallbackXUrl = item.xUrl || "";
      const fallbackRepoUrl = externalLinks[0] || "";
      const useSearch =
        endpoint.protocol === "gemini" && Boolean(endpoint.enableSearch);

      const prompt = `请对以下情报条目进行【${useSearch ? "联网事实核查" : "深度核查分析"}】与【结构化知识提取】：

--- 原始条目 ---
作者：${item.author || "未知"}
发布时间：${item.timestamp || "未知"}
初筛标签：${item.judgeLabel || "高价值"}
原贴链接：${fallbackXUrl || "无"}
提取到的外链：${externalLinks.length > 0 ? externalLinks.join(" , ") : "无"}
正文内容：
${item.content}
--- 结束 ---

核心执行要求：
1. 【事实核查】：${useSearch ? "必须调用 Google Search 检索文中提及的 GitHub 仓库、HuggingFace 模型、论文或官方文档，核实" : "结合技术事实与上下文严谨评估"}：
   - 真实 Star 数量（如 owner/repo (12.4k⭐)，若无法确认请如实注明）
   - 仓库是否已归档（Archived / Read-only）、是否 404 死链、或长期未维护
   - License 协议限制（如 AGPL、非商用、闭源壳）
   - 真实硬件/显存要求、收费门槛、性能基准是否存在推主夸大或营销水分
2. 【多项目自动拆行】：如果单条推文同时介绍了多个独立的开源项目、代码库或工具（例如“推荐 5 个 Agent 工具”），必须拆分为多条独立对象放入 records 数组中，每条记录对应一个独立项目。如果只涉及一个主题或项目，则输出 1 条记录。
3. 【严格字段规范】：
   - category（一级分类）：只能从 ["AI开发与Agent", "工程与效率工具", "3D与多模态创作", "内容与商业洞察"] 中严格四选一。
   - coreTopic（核心主题）：25字以内的客观中文标题，禁止感叹号和营销夸大词汇。
   - verdict（核查结论）：只能从 ["✅ 属实", "⚠️ 部分夸大或有隐藏短板", "❌ 伪命题或已失效"] 中严格三选一。
   - projectOrTool（关联项目/工具）：标准格式 "owner/repo (XXk⭐)" 或官方项目/工具名称。
   - factCheckAndCaveats（事实核查与短板）：客观精炼记录真实能力、Star数、归档状态、License/硬件/付费门槛及任何夸大或短板。
   - reusableMethodology（可复用方法论）：提炼可迁移的系统架构、Agent 编排、Prompt 设计或工程工作流规律。
   - keywords（关键词标签）：3-6个精准技术关键词，英文逗号分隔。
   - xUrl（推特X链接）：纯净的 https://x.com/... URL，不得附带任何中文前缀或说明文字；若无则留空字符串 ""。
   - repoUrl（仓库/项目链接）：纯净的 https://github.com/... 或项目官网 URL，不得附带任何前缀文字；若无则留空字符串 ""。`;

      const jsonSchemaPromptSuffix = `\n\n请严格仅输出一个合法的 JSON 对象（不要输出 Markdown 以外的任何解释文字），结构如下：
{
  "records": [
    {
      "category": "AI开发与Agent | 工程与效率工具 | 3D与多模态创作 | 内容与商业洞察",
      "coreTopic": "25字以内客观中文标题",
      "verdict": "✅ 属实 | ⚠️ 部分夸大或有隐藏短板 | ❌ 伪命题或已失效",
      "projectOrTool": "owner/repo (XXk⭐) 或工具名",
      "factCheckAndCaveats": "核查结果与隐藏短板",
      "reusableMethodology": "可复用工程/架构方法论",
      "keywords": "标签1, 标签2, 标签3",
      "xUrl": "https://x.com/...",
      "repoUrl": "https://github.com/..."
    }
  ]
}`;

      const systemInstruction =
        '你是一位严谨、客观、零水分的 AI 与软件工程事实核查员。严禁编造不存在的 Star 数或链接。输出必须为严格合规的 JSON 对象，结构为 {"records": [...]}，不要输出多余的解释文字。';

      let rawText = "";
      let groundingSources: Array<{ title: string; uri: string }> = [];

      if (endpoint.protocol === "gemini") {
        const ai = createGeminiClient(apiKey, endpoint.baseUrl);
        const toolsParam = useSearch
          ? [{ type: "google_search" as const }]
          : undefined;
        const safeThinking = endpoint.thinkingLevel ?? "low";

        let combinedWorked = false;
        try {
          const directInteraction = await ai.interactions.create({
            model: endpoint.modelId,
            input: prompt,
            system_instruction: systemInstruction,
            ...(toolsParam ? { tools: toolsParam } : {}),
            response_format: VERIFY_RESPONSE_SCHEMA,
            generation_config: { thinking_level: safeThinking },
            store: false,
          });
          rawText = extractTextFromGeminiInteraction(
            directInteraction as unknown as {
              output_text?: string | null;
              steps?: Array<{
                type?: string;
                content?: Array<{ type?: string; text?: string }>;
              }>;
            }
          );
          groundingSources = extractSourcesFromGeminiSteps(
            (directInteraction as unknown as { steps?: unknown[] }).steps
          );
          if (rawText.trim()) {
            combinedWorked = true;
          }
        } catch (firstErr) {
          const msg = String((firstErr as { message?: string })?.message || "");
          if (
            !/response_format|schema|tool|thinking_level|unsupported|400/i.test(
              msg
            )
          ) {
            throw firstErr;
          }
        }

        if (!combinedWorked) {
          const searchInteraction = await ai.interactions.create({
            model: endpoint.modelId,
            input: prompt + jsonSchemaPromptSuffix,
            system_instruction: systemInstruction,
            ...(toolsParam ? { tools: toolsParam } : {}),
            store: false,
          });
          rawText = extractTextFromGeminiInteraction(
            searchInteraction as unknown as {
              output_text?: string | null;
              steps?: Array<{
                type?: string;
                content?: Array<{ type?: string; text?: string }>;
              }>;
            }
          );
          groundingSources = extractSourcesFromGeminiSteps(
            (searchInteraction as unknown as { steps?: unknown[] }).steps
          );
        }
      } else if (endpoint.protocol === "anthropic") {
        rawText = await callAnthropicMessages({
          baseUrl: endpoint.baseUrl,
          apiKey,
          modelId: endpoint.modelId,
          systemPrompt: systemInstruction,
          userPrompt: prompt + jsonSchemaPromptSuffix,
          maxTokens: 4096,
        });
      } else {
        rawText = await callOpenAICompatible({
          baseUrl: endpoint.baseUrl,
          apiKey,
          modelId: endpoint.modelId,
          systemPrompt: systemInstruction,
          userPrompt: prompt + jsonSchemaPromptSuffix,
          jsonMode: true,
          maxTokens: 4096,
        });
      }

      const parsedArray = extractJsonArray(rawText);
      if (!parsedArray || parsedArray.length === 0) {
        return res.status(502).json({
          error: "模型未能返回可解析的 11 列结构化 JSON 数据，请检查模型配置或重试。",
        });
      }

      const normalizedRecords = parsedArray
        .filter((r): r is Record<string, unknown> =>
          Boolean(r && typeof r === "object")
        )
        .map((r) => normalizeRecordItem(r, fallbackXUrl, fallbackRepoUrl));

      if (normalizedRecords.length === 0) {
        return res.status(502).json({
          error: "核查输出中未包含有效记录。",
        });
      }

      const seenUris = new Set<string>();
      const uniqueSources = groundingSources.filter((s) => {
        if (seenUris.has(s.uri)) return false;
        seenUris.add(s.uri);
        return true;
      });

      return res.json({
        model: endpoint.modelId,
        records: normalizedRecords,
        sources: uniqueSources.slice(0, 8),
        durationMs: Date.now() - startedAt,
      });
    } catch (err) {
      const { status, message } = extractApiError(err);
      return res.status(status).json({ error: `深度核查失败：${message}` });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const defaultDist = fs.existsSync(path.resolve(__dirname, "dist"))
      ? path.resolve(__dirname, "dist")
      : path.resolve(__dirname, "..", "dist");
    const distDir =
      options.distDir || process.env.STATIC_DIST_DIR || defaultDist;
    app.use(express.static(distDir));
    app.get("/{*splat}", (_req, res) => {
      const indexFile = path.join(distDir, "index.html");
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send("Not Found");
      }
    });
  }

  return await new Promise((resolve, reject) => {
    const server = app.listen(PORT, HOST, () => {
      const addr = server.address() as AddressInfo | null;
      const actualPort = addr?.port ?? PORT;
      console.log(`Server running on http://${HOST}:${actualPort}`);
      resolve({ server, port: actualPort });
    });
    server.on("error", reject);
  });
}

if (process.env.ELECTRON_EMBEDDED !== "1") {
  startServer().catch((err) => {
    console.error("Failed to start server:", err);
    process.exit(1);
  });
}
