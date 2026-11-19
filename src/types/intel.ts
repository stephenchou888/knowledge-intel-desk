export type JudgeKey =
  | "high_value_eng"
  | "open_source_repo"
  | "read_later"
  | "noise_spam";

export type KnowledgeCategory =
  | "AI开发与Agent"
  | "工程与效率工具"
  | "3D与多模态创作"
  | "内容与商业洞察";

export type VerifyVerdict =
  | "✅ 属实"
  | "⚠️ 部分夸大或有隐藏短板"
  | "❌ 伪命题或已失效";

export interface RawIntelItem {
  id: string;
  sourceFile: string;
  sourceType: "csv" | "json" | "md" | "html" | "paste";
  content: string;
  author: string;
  timestamp: string;
  xUrl: string;
  externalLinks: string[];
  selected: boolean;
  judgeStatus: "pending" | "judging" | "done" | "error";
  judgeKey?: JudgeKey;
  judgeLabel?: string;
  judgeConfidence?: number;
  judgeDurationMs?: number;
  judgeError?: string;
  verifyStatus: "idle" | "verifying" | "done" | "error";
  verifyError?: string;
  verifiedCount?: number;
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface KnowledgeRecord {
  uid: string;
  sourceItemId: string;
  /** 1. 记录ID (YYYYMMDD-XX) */
  recordId: string;
  /** 2. 收录日期 (YYYY-MM-DD) */
  collectedDate: string;
  /** 3. 一级分类 */
  category: KnowledgeCategory;
  /** 4. 核心主题 (<=25字) */
  coreTopic: string;
  /** 5. 核查结论 */
  verdict: VerifyVerdict;
  /** 6. 关联项目/工具 */
  projectOrTool: string;
  /** 7. 事实核查与短板 */
  factCheckAndCaveats: string;
  /** 8. 可复用方法论 */
  reusableMethodology: string;
  /** 9. 关键词标签 */
  keywords: string;
  /** 10. 推特X链接 */
  xUrl: string;
  /** 11. 仓库/项目链接 */
  repoUrl: string;
  /** Optional metadata */
  groundingSources?: GroundingSource[];
}

export interface PipelineLogEntry {
  id: string;
  time: string;
  level: "info" | "success" | "warn" | "error";
  stage: "解析" | "判官" | "核查" | "导出" | "接口";
  message: string;
}

export const KNOWLEDGE_CATEGORIES: KnowledgeCategory[] = [
  "AI开发与Agent",
  "工程与效率工具",
  "3D与多模态创作",
  "内容与商业洞察",
];

export const VERIFY_VERDICTS: VerifyVerdict[] = [
  "✅ 属实",
  "⚠️ 部分夸大或有隐藏短板",
  "❌ 伪命题或已失效",
];

export const DEFAULT_JUDGE_RULES =
  "包含具体架构方法、Agent工作流、开源代码库或实测数据的判为高价值；纯情绪吐槽、无实质内容的转发抽奖判为噪音。";

export const JUDGE_META: Record<
  JudgeKey,
  {
    label: string;
    bracketLabel: string;
    defaultSelected: boolean;
    textClass: string;
    dotClass: string;
  }
> = {
  high_value_eng: {
    label: "高价值工程/AI情报",
    bracketLabel: "【高价值工程/AI情报】",
    defaultSelected: true,
    textClass: "text-emerald-700 dark:text-emerald-400",
    dotClass: "bg-emerald-500",
  },
  open_source_repo: {
    label: "开源项目/工具库",
    bracketLabel: "【开源项目/工具库】",
    defaultSelected: true,
    textClass: "text-sky-700 dark:text-sky-400",
    dotClass: "bg-sky-500",
  },
  read_later: {
    label: "待稍后看",
    bracketLabel: "【待稍后看】",
    defaultSelected: false,
    textClass: "text-amber-700 dark:text-amber-400",
    dotClass: "bg-amber-500",
  },
  noise_spam: {
    label: "低质水贴/广告噪音",
    bracketLabel: "【低质水贴/广告噪音】",
    defaultSelected: false,
    textClass: "text-rose-700 dark:text-rose-400",
    dotClass: "bg-rose-500",
  },
};

export type ThinkingDepth = "low" | "medium" | "high";

export type ProviderId =
  | "jev"
  | "openai"
  | "gemini"
  | "claude"
  | "deepseek"
  | "glm"
  | "kimi"
  | "tencent"
  | "other";

export type ApiProtocol = "openai-compatible" | "gemini" | "anthropic";

export interface CustomModelEndpoint {
  id: string;
  name: string;
  provider: ProviderId;
  protocol: ApiProtocol;
  baseUrl: string;
  modelId: string;
  /** Server-side Secrets env variable name (e.g. OPENAI_API_KEY) or "NONE" for local keyless gateway */
  envKeyName: string;
  /** Preferred stage when created ("triage" | "verify") */
  stageRole?: "triage" | "verify";
  /** Only applies to Gemini protocol */
  enableSearch?: boolean;
  /** Optional reasoning depth */
  thinkingLevel?: ThinkingDepth;
  notes?: string;
}

export interface ModelRoutingConfig {
  endpoints: CustomModelEndpoint[];
  triageEndpointId: string;
  verifyEndpointId: string;
}

export const DEFAULT_MODEL_ROUTING: ModelRoutingConfig = {
  endpoints: [],
  triageEndpointId: "",
  verifyEndpointId: "",
};

export interface ProviderTemplate {
  id: ProviderId;
  label: string;
  shortTag: string;
  description: string;
  defaultProtocol: ApiProtocol;
  defaultBaseUrl: string;
  defaultEnvKey: string;
  suggestedModels: string[];
  triageSuggestedModels?: string[];
  accentClass: string;
}

export const PROVIDER_TEMPLATES: ProviderTemplate[] = [
  {
    id: "jev",
    label: "JEV 决策模型",
    shortTag: "JEV",
    description: "JEV 专用决策与快速分类接口，支持自定义网关与决策模型 ID",
    defaultProtocol: "openai-compatible",
    defaultBaseUrl: "https://api.jev.ai/v1",
    defaultEnvKey: "JEV_API_KEY",
    suggestedModels: ["jev-decision-v1", "jev-judge-pro", "jev-classifier-fast"],
    triageSuggestedModels: ["jev-decision-v1", "jev-judge-pro", "jev-classifier-fast"],
    accentClass: "text-orange-600 dark:text-orange-400",
  },
  {
    id: "openai",
    label: "OpenAI",
    shortTag: "OPENAI",
    description: "GPT-4o / GPT-4.1 / o3 系列官方或兼容中转接口",
    defaultProtocol: "openai-compatible",
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultEnvKey: "OPENAI_API_KEY",
    suggestedModels: ["gpt-4o", "gpt-4.1", "gpt-4o-mini", "gpt-4.1-mini"],
    triageSuggestedModels: ["gpt-4o-mini", "gpt-4.1-mini", "gpt-4o"],
    accentClass: "text-emerald-600 dark:text-emerald-400",
  },
  {
    id: "gemini",
    label: "Gemini",
    shortTag: "GEMINI",
    description: "Google Gemini 系列，支持 Decisions API 与 Google Search 核查",
    defaultProtocol: "gemini",
    defaultBaseUrl: "https://generativelanguage.googleapis.com",
    defaultEnvKey: "GEMINI_API_KEY",
    suggestedModels: ["gemini-4-hydrogen", "gemini-3.1-flash-lite", "gemini-decision-1"],
    triageSuggestedModels: ["gemini-decision-1", "gemini-3.1-flash-lite", "gemini-4-hydrogen"],
    accentClass: "text-sky-600 dark:text-sky-400",
  },
  {
    id: "claude",
    label: "Claude",
    shortTag: "CLAUDE",
    description: "Anthropic Claude Messages API，长文推理与结构化抽取精准",
    defaultProtocol: "anthropic",
    defaultBaseUrl: "https://api.anthropic.com/v1",
    defaultEnvKey: "ANTHROPIC_API_KEY",
    suggestedModels: [
      "claude-sonnet-4-20250514",
      "claude-3-7-sonnet-latest",
      "claude-3-5-haiku-latest",
    ],
    triageSuggestedModels: [
      "claude-3-5-haiku-latest",
      "claude-3-7-sonnet-latest",
      "claude-sonnet-4-20250514",
    ],
    accentClass: "text-amber-600 dark:text-amber-400",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    shortTag: "DEEPSEEK",
    description: "深度求索 DeepSeek-V3 / R1 推理接口，中文工程分析性价比高",
    defaultProtocol: "openai-compatible",
    defaultBaseUrl: "https://api.deepseek.com/v1",
    defaultEnvKey: "DEEPSEEK_API_KEY",
    suggestedModels: ["deepseek-chat", "deepseek-reasoner"],
    triageSuggestedModels: ["deepseek-chat", "deepseek-reasoner"],
    accentClass: "text-indigo-600 dark:text-indigo-400",
  },
  {
    id: "glm",
    label: "GLM 智谱",
    shortTag: "GLM",
    description: "智谱开放平台 BigModel GLM-4 系列，兼容 OpenAI 协议",
    defaultProtocol: "openai-compatible",
    defaultBaseUrl: "https://open.bigmodel.cn/api/paas/v4",
    defaultEnvKey: "GLM_API_KEY",
    suggestedModels: ["glm-4-plus", "glm-4-air", "glm-4-flash"],
    triageSuggestedModels: ["glm-4-flash", "glm-4-air", "glm-4-plus"],
    accentClass: "text-blue-600 dark:text-blue-400",
  },
  {
    id: "kimi",
    label: "Kimi 月之暗面",
    shortTag: "KIMI",
    description: "Moonshot AI Kimi 长上下文模型，适合批量长贴抽取",
    defaultProtocol: "openai-compatible",
    defaultBaseUrl: "https://api.moonshot.cn/v1",
    defaultEnvKey: "KIMI_API_KEY",
    suggestedModels: ["moonshot-v1-32k", "moonshot-v1-8k", "kimi-latest"],
    triageSuggestedModels: ["moonshot-v1-8k", "kimi-latest", "moonshot-v1-32k"],
    accentClass: "text-cyan-600 dark:text-cyan-400",
  },
  {
    id: "tencent",
    label: "腾讯混元",
    shortTag: "腾讯",
    description: "腾讯云混元大模型 OpenAI 兼容接口（TurboS / Pro / Lite）",
    defaultProtocol: "openai-compatible",
    defaultBaseUrl: "https://api.hunyuan.cloud.tencent.com/v1",
    defaultEnvKey: "TENCENT_API_KEY",
    suggestedModels: ["hunyuan-turbos-latest", "hunyuan-pro", "hunyuan-lite"],
    triageSuggestedModels: ["hunyuan-lite", "hunyuan-turbos-latest", "hunyuan-pro"],
    accentClass: "text-teal-600 dark:text-teal-400",
  },
  {
    id: "other",
    label: "其它自定义",
    shortTag: "其它",
    description: "OpenRouter、硅基流动、One-API、New-API 或本地 Ollama / vLLM",
    defaultProtocol: "openai-compatible",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    defaultEnvKey: "CUSTOM_LLM_API_KEY",
    suggestedModels: [
      "qwen2.5:32b",
      "deepseek/deepseek-chat",
      "meta-llama/llama-3.3-70b-instruct",
    ],
    accentClass: "text-violet-600 dark:text-violet-400",
  },
];

export const PROVIDER_MAP: Record<ProviderId, ProviderTemplate> =
  PROVIDER_TEMPLATES.reduce(
    (acc, item) => {
      acc[item.id] = item;
      return acc;
    },
    {} as Record<ProviderId, ProviderTemplate>
  );

export const PROTOCOL_LABELS: Record<ApiProtocol, string> = {
  "openai-compatible": "OpenAI 兼容 (/chat/completions)",
  gemini: "Google Gemini SDK",
  anthropic: "Anthropic (/messages)",
};
