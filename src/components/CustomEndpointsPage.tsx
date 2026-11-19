import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowLeft,
  CheckCircle2,
  Edit3,
  Globe,
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Search,
  Server,
  ShieldCheck,
  Trash2,
  X,
  XCircle,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  PROTOCOL_LABELS,
  PROVIDER_MAP,
  PROVIDER_TEMPLATES,
  type ApiProtocol,
  type CustomModelEndpoint,
  type ModelRoutingConfig,
  type ProviderId,
  type ThinkingDepth,
} from "../types/intel";

interface CustomEndpointsPageProps {
  routing: ModelRoutingConfig;
  onChangeRouting: (next: ModelRoutingConfig) => void;
  onBack: () => void;
  onLog: (
    level: "info" | "success" | "warn" | "error",
    message: string
  ) => void;
}

interface EndpointTestState {
  status: "testing" | "ok" | "error";
  latencyMs?: number;
  detail?: string;
}

const PRESET_ENV_KEYS = [
  "JEV_API_KEY",
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "ANTHROPIC_API_KEY",
  "DEEPSEEK_API_KEY",
  "GLM_API_KEY",
  "KIMI_API_KEY",
  "TENCENT_API_KEY",
  "CUSTOM_LLM_API_KEY",
  "NONE",
] as const;

const ENV_VAR_REGEX = /^[A-Z][A-Z0-9_]{1,63}$/;

interface EndpointDraft {
  name: string;
  provider: ProviderId;
  protocol: ApiProtocol;
  baseUrl: string;
  modelId: string;
  envKeyName: string;
  useCustomEnvName: boolean;
  enableSearch: boolean;
  thinkingLevel: ThinkingDepth;
  notes: string;
}

function createDraftFromProvider(
  providerId: ProviderId,
  stage: "triage" | "verify"
): EndpointDraft {
  const tpl = PROVIDER_MAP[providerId];
  const modelList =
    stage === "triage" && tpl.triageSuggestedModels?.length
      ? tpl.triageSuggestedModels
      : tpl.suggestedModels;
  return {
    name: `${tpl.label}${stage === "triage" ? "初筛" : "核查"}接口`,
    provider: tpl.id,
    protocol: tpl.defaultProtocol,
    baseUrl: tpl.defaultBaseUrl,
    modelId: modelList[0] ?? "",
    envKeyName: tpl.defaultEnvKey,
    useCustomEnvName: false,
    enableSearch: stage === "verify" && tpl.id === "gemini",
    thinkingLevel: "low",
    notes: "",
  };
}

function draftFromExistingEndpoint(ep: CustomModelEndpoint): EndpointDraft {
  const envUpper = (ep.envKeyName || "").trim().toUpperCase();
  const isPreset = (PRESET_ENV_KEYS as readonly string[]).includes(envUpper);
  return {
    name: ep.name,
    provider: ep.provider,
    protocol: ep.protocol,
    baseUrl: ep.baseUrl,
    modelId: ep.modelId,
    envKeyName: envUpper,
    useCustomEnvName: !isPreset,
    enableSearch: Boolean(ep.enableSearch),
    thinkingLevel: ep.thinkingLevel ?? "low",
    notes: ep.notes ?? "",
  };
}

function validateEndpointDraft(draft: EndpointDraft): {
  error?: string;
  cleaned?: {
    name: string;
    baseUrl: string;
    modelId: string;
    envKeyName: string;
  };
} {
  const name = draft.name.trim();
  const baseUrl = draft.baseUrl.trim().replace(/\/+$/, "");
  const modelId = draft.modelId.trim();
  const envKeyName = draft.envKeyName.trim().toUpperCase();

  if (!name) return { error: "请填写接口显示名称。" };
  if (!baseUrl || !/^https?:\/\/.+/i.test(baseUrl)) {
    return { error: "请填写有效的 Base URL（必须以 https:// 或 http:// 开头）。" };
  }
  if (!modelId) return { error: "请填写需要调用的模型 ID（Model ID）。" };
  if (envKeyName !== "NONE" && !ENV_VAR_REGEX.test(envKeyName)) {
    return {
      error:
        "环境变量名仅支持大写字母、数字和下划线（如 JEV_API_KEY），本地免鉴权服务请选择 NONE。",
    };
  }
  return { cleaned: { name, baseUrl, modelId, envKeyName } };
}

interface SecretEnvBindingBlockProps {
  idPrefix: string;
  envKeyName: string;
  useCustomEnvName: boolean;
  envStatus: Record<string, boolean>;
  onChange: (nextEnvKeyName: string, nextUseCustom: boolean) => void;
}

function SecretEnvBindingBlock({
  idPrefix,
  envKeyName,
  useCustomEnvName,
  envStatus,
  onChange,
}: SecretEnvBindingBlockProps) {
  const upper = envKeyName.trim().toUpperCase();
  const isKeyless = upper === "NONE";
  const isReady = isKeyless ? true : Boolean(envStatus[upper]);

  return (
    <div className="space-y-2.5 rounded-lg border border-border bg-muted/20 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label
          htmlFor={`${idPrefix}-env-select`}
          className="flex items-center gap-1.5 text-xs font-semibold text-foreground"
        >
          <ShieldCheck
            className="size-3.5 text-emerald-500"
            aria-hidden="true"
          />
          服务端环境变量绑定（本地代理读取）
        </label>
        {isKeyless ? (
          <span className="font-mono text-[11px] text-sky-600 dark:text-sky-400">
            本地免鉴权模式 (NONE)
          </span>
        ) : isReady ? (
          <span className="inline-flex items-center gap-1 font-mono text-[11px] text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="size-3" />
            已就绪：{upper}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 font-mono text-[11px] text-amber-600 dark:text-amber-400">
            <XCircle className="size-3" />
            未检测到有效密钥：{upper || "未指定"}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-12">
        <div className="md:col-span-5">
          <select
            id={`${idPrefix}-env-select`}
            aria-label="选择服务端环境变量名"
            value={useCustomEnvName ? "__custom__" : upper}
            onChange={(e) => {
              if (e.target.value === "__custom__") {
                onChange(
                  (PRESET_ENV_KEYS as readonly string[]).includes(upper)
                    ? "CUSTOM_LLM_API_KEY"
                    : upper,
                  true
                );
              } else {
                onChange(e.target.value, false);
              }
            }}
            className="h-9 w-full rounded-md border border-input bg-background px-2.5 font-mono text-xs text-foreground outline-none focus:border-ring"
          >
            <option value="JEV_API_KEY">JEV_API_KEY (JEV 决策模型)</option>
            <option value="OPENAI_API_KEY">OPENAI_API_KEY (OpenAI)</option>
            <option value="GEMINI_API_KEY">GEMINI_API_KEY (Gemini)</option>
            <option value="ANTHROPIC_API_KEY">ANTHROPIC_API_KEY (Claude)</option>
            <option value="DEEPSEEK_API_KEY">DEEPSEEK_API_KEY (DeepSeek)</option>
            <option value="GLM_API_KEY">GLM_API_KEY (智谱 GLM)</option>
            <option value="KIMI_API_KEY">KIMI_API_KEY (月之暗面 Kimi)</option>
            <option value="TENCENT_API_KEY">TENCENT_API_KEY (腾讯混元)</option>
            <option value="CUSTOM_LLM_API_KEY">CUSTOM_LLM_API_KEY (其它通用)</option>
            <option value="NONE">NONE (本地 Ollama / 免密钥)</option>
            <option value="__custom__">自定义环境变量名…</option>
          </select>
        </div>

        <div className="md:col-span-7">
          {useCustomEnvName ? (
            <Input
              id={`${idPrefix}-custom-env`}
              value={envKeyName}
              onChange={(e) =>
                onChange(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ""), true)
              }
              placeholder="仅填写环境变量名（如 MY_OPENROUTER_KEY），勿填密钥本身"
              className="h-9 font-mono text-xs uppercase"
            />
          ) : (
            <div className="flex min-h-9 items-center rounded-md border border-border/80 bg-background/60 px-3 py-1.5 text-[11px] leading-snug text-muted-foreground">
              {isKeyless ? (
                <span>
                  当前为免密钥模式，将直接向 Base URL 发起无鉴权请求（适用于本地 Ollama / vLLM）。
                </span>
              ) : isReady ? (
                <span>
                  服务端已安全注入 <strong className="font-mono text-foreground">{upper}</strong>，可直接调用与测试连通性。
                </span>
              ) : (
                <span>
                  请在本地{" "}
                  <strong className="font-mono text-foreground">.env</strong> 或运行环境变量中配置{" "}
                  <strong className="font-mono text-foreground">{upper}</strong>
                  （桌面端可在顶部菜单{" "}
                  <strong className="text-foreground">配置与密钥 → 打开密钥配置文件 (.env)</strong>{" "}
                  编辑并重载生效）。
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface StageEndpointPanelProps {
  stage: "triage" | "verify";
  title: string;
  subtitle: string;
  providers: typeof PROVIDER_TEMPLATES;
  draft: EndpointDraft;
  onDraftChange: (updater: (prev: EndpointDraft) => EndpointDraft) => void;
  onSelectProvider: (providerId: ProviderId) => void;
  onSubmit: (bindImmediately: boolean) => void;
  formError: string | null;
  envStatus: Record<string, boolean>;
  endpoints: CustomModelEndpoint[];
  boundEndpointId: string;
  onChangeBoundEndpointId: (id: string) => void;
}

function StageEndpointPanel({
  stage,
  title,
  subtitle,
  providers,
  draft,
  onDraftChange,
  onSelectProvider,
  onSubmit,
  formError,
  envStatus,
  endpoints,
  boundEndpointId,
  onChangeBoundEndpointId,
}: StageEndpointPanelProps) {
  const isTriage = stage === "triage";
  const currentTpl = PROVIDER_MAP[draft.provider] ?? PROVIDER_MAP.other;
  const suggestedModels =
    isTriage && currentTpl.triageSuggestedModels?.length
      ? currentTpl.triageSuggestedModels
      : currentTpl.suggestedModels;
  const boundEndpoint = endpoints.find((e) => e.id === boundEndpointId);

  return (
    <Card className="gap-0 overflow-hidden rounded-xl border border-border bg-card py-0 shadow-none ring-0">
      <CardHeader className="flex flex-col gap-3 border-b border-border px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            {isTriage ? (
              <Zap className="size-4 text-amber-500" aria-hidden="true" />
            ) : (
              <Search className="size-4 text-sky-500" aria-hidden="true" />
            )}
            <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          </div>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:min-w-[340px] lg:justify-end">
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            当前生效：
          </span>
          <select
            value={boundEndpointId}
            onChange={(e) => onChangeBoundEndpointId(e.target.value)}
            aria-label={
              isTriage ? "选择当前生效的决策初筛接口" : "选择当前生效的核查提取接口"
            }
            className="h-8 max-w-[280px] flex-1 rounded-md border border-input bg-background px-2.5 text-xs text-foreground outline-none focus:border-ring"
          >
            <option value="">
              {endpoints.length === 0 ? "尚未添加接口…" : "未绑定（请在下方添加或选择）"}
            </option>
            {endpoints.map((ep) => (
              <option key={ep.id} value={ep.id}>
                [{(PROVIDER_MAP[ep.provider] ?? PROVIDER_MAP.other).shortTag}] {ep.name} ·{" "}
                {ep.modelId}
              </option>
            ))}
          </select>
          {boundEndpoint ? (
            <span className="font-mono text-[11px] text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
              已绑定
            </span>
          ) : (
            <span className="font-mono text-[11px] text-amber-600 dark:text-amber-400 whitespace-nowrap">
              未绑定
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4 p-5">
        {/* Provider Quick-Select Strip */}
        <div className="space-y-2">
          <span className="text-xs font-medium text-muted-foreground">
            选择厂商模板（已更新至最新一代模型，一键填充默认地址与协议，下方可任意自定义修改）
          </span>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9">
            {providers.map((tpl) => {
              const selected = draft.provider === tpl.id;
              const envReady = Boolean(envStatus[tpl.defaultEnvKey]);
              return (
                <button
                  key={`${stage}-${tpl.id}`}
                  type="button"
                  onClick={() => onSelectProvider(tpl.id)}
                  className={`flex cursor-pointer flex-col items-start rounded-lg border px-2.5 py-2 text-left transition-colors ${
                    selected
                      ? "border-foreground bg-muted/60"
                      : "border-border bg-background hover:border-foreground/40 hover:bg-muted/25"
                  }`}
                >
                  <div className="flex w-full items-center justify-between gap-1">
                    <span
                      className={`font-mono text-[11px] font-bold ${tpl.accentClass}`}
                    >
                      {tpl.shortTag}
                    </span>
                    <span
                      className={`size-1.5 rounded-full ${
                        envReady ? "bg-emerald-500" : "bg-muted-foreground/30"
                      }`}
                      title={
                        envReady
                          ? `${tpl.defaultEnvKey} 已就绪`
                          : `${tpl.defaultEnvKey} 未配置有效密钥`
                      }
                    />
                  </div>
                  <span className="mt-0.5 w-full truncate text-[11px] font-medium text-foreground">
                    {tpl.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Form Fields Grid */}
        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-12">
          <div className="space-y-1.5 md:col-span-4">
            <label
              htmlFor={`${stage}-name`}
              className="text-xs font-medium text-foreground"
            >
              接口显示名称
            </label>
            <Input
              id={`${stage}-name`}
              value={draft.name}
              onChange={(e) =>
                onDraftChange((prev) => ({ ...prev, name: e.target.value }))
              }
              placeholder={
                isTriage ? "例如：JEV 极速初筛网关" : "例如：GPT-6.2 深度核查"
              }
              className="h-9 text-xs"
            />
          </div>

          <div className="space-y-1.5 md:col-span-4">
            <label
              htmlFor={`${stage}-protocol`}
              className="text-xs font-medium text-foreground"
            >
              请求协议格式
            </label>
            <select
              id={`${stage}-protocol`}
              value={draft.protocol}
              onChange={(e) =>
                onDraftChange((prev) => ({
                  ...prev,
                  protocol: e.target.value as ApiProtocol,
                }))
              }
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs text-foreground outline-none focus:border-ring"
            >
              {(Object.keys(PROTOCOL_LABELS) as ApiProtocol[]).map((proto) => (
                <option key={proto} value={proto}>
                  {PROTOCOL_LABELS[proto]}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5 md:col-span-4">
            <label
              htmlFor={`${stage}-model-id`}
              className="text-xs font-medium text-foreground"
            >
              模型 ID (Model ID)
            </label>
            <Input
              id={`${stage}-model-id`}
              value={draft.modelId}
              onChange={(e) =>
                onDraftChange((prev) => ({ ...prev, modelId: e.target.value }))
              }
              placeholder="输入任意模型 ID"
              className="h-9 font-mono text-xs"
            />
          </div>

          <div className="space-y-1.5 md:col-span-7">
            <label
              htmlFor={`${stage}-base-url`}
              className="text-xs font-medium text-foreground"
            >
              接口地址 (Base URL)
            </label>
            <Input
              id={`${stage}-base-url`}
              value={draft.baseUrl}
              onChange={(e) =>
                onDraftChange((prev) => ({ ...prev, baseUrl: e.target.value }))
              }
              placeholder="https://... 或私有中转网关地址"
              className="h-9 font-mono text-xs"
            />
          </div>

          <div className="space-y-1.5 md:col-span-5">
            <label
              htmlFor={`${stage}-notes`}
              className="text-xs font-medium text-foreground"
            >
              备注说明（可选）
            </label>
            <Input
              id={`${stage}-notes`}
              value={draft.notes}
              onChange={(e) =>
                onDraftChange((prev) => ({ ...prev, notes: e.target.value }))
              }
              placeholder={
                isTriage
                  ? "例如：低延迟噪音过滤专用"
                  : "例如：长上下文多项目拆行专用"
              }
              className="h-9 text-xs"
            />
          </div>
        </div>

        {/* Latest Model Chips */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">
            {currentTpl.label} 最新推荐模型：
          </span>
          {suggestedModels.map((m) => (
            <button
              key={`${stage}-${m}`}
              type="button"
              onClick={() =>
                onDraftChange((prev) => ({ ...prev, modelId: m }))
              }
              className={`cursor-pointer rounded border px-2 py-0.5 font-mono text-[11px] transition-colors ${
                draft.modelId === m
                  ? "border-foreground bg-muted text-foreground"
                  : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground"
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        <SecretEnvBindingBlock
          idPrefix={stage}
          envKeyName={draft.envKeyName}
          useCustomEnvName={draft.useCustomEnvName}
          envStatus={envStatus}
          onChange={(nextEnv, nextCustom) =>
            onDraftChange((prev) => ({
              ...prev,
              envKeyName: nextEnv,
              useCustomEnvName: nextCustom,
            }))
          }
        />

        {/* Stage 2 Gemini Optional Grounding & Thinking Controls */}
        {!isTriage && draft.protocol === "gemini" && (
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/15 p-3.5 sm:flex-row sm:items-center sm:justify-between">
            <label
              htmlFor="verify-google-search"
              className="flex cursor-pointer items-start gap-2.5"
            >
              <Checkbox
                id="verify-google-search"
                checked={draft.enableSearch}
                onCheckedChange={(checked) =>
                  onDraftChange((prev) => ({
                    ...prev,
                    enableSearch: Boolean(checked),
                  }))
                }
                className="mt-0.5"
              />
              <div className="space-y-0.5">
                <span className="flex items-center gap-1 text-xs font-medium text-foreground">
                  <Globe className="size-3.5 text-sky-500" aria-hidden="true" />
                  启用 Google Search 实时联网核查
                </span>
                <p className="text-[11px] text-muted-foreground">
                  自动检索 GitHub / HuggingFace Star 数、归档状态与官方文档。
                </p>
              </div>
            </label>

            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[11px] text-muted-foreground">推理深度：</span>
              {(["low", "medium", "high"] as ThinkingDepth[]).map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() =>
                    onDraftChange((prev) => ({ ...prev, thinkingLevel: lvl }))
                  }
                  className={`cursor-pointer rounded border px-2 py-1 font-mono text-[11px] transition-colors ${
                    draft.thinkingLevel === lvl
                      ? "border-foreground bg-muted text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {lvl}
                </button>
              ))}
            </div>
          </div>
        )}

        {formError && (
          <p className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-400">
            {formError}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          <Button
            type="button"
            onClick={() => onSubmit(true)}
            className={`h-9 gap-1.5 px-4 text-xs font-semibold ${
              isTriage
                ? "bg-amber-500 text-neutral-950 hover:bg-amber-400"
                : ""
            }`}
          >
            <Plus className="size-3.5" aria-hidden="true" />
            {isTriage
              ? "添加并设为第一阶段决策模型"
              : "添加并设为第二阶段核查模型"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => onSubmit(false)}
            className="h-9 px-3 text-xs"
          >
            仅添加到下方接口库
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function CustomEndpointsPage({
  routing,
  onChangeRouting,
  onBack,
  onLog,
}: CustomEndpointsPageProps) {
  const editorSectionRef = useRef<HTMLDivElement>(null);

  // Stage 1 (Decision Triage) Add Draft
  const [triageDraft, setTriageDraft] = useState<EndpointDraft>(() =>
    createDraftFromProvider("jev", "triage")
  );
  const [triageError, setTriageError] = useState<string | null>(null);

  // Stage 2 (Deep Verification & Extraction) Add Draft
  const [verifyDraft, setVerifyDraft] = useState<EndpointDraft>(() =>
    createDraftFromProvider("openai", "verify")
  );
  const [verifyError, setVerifyError] = useState<string | null>(null);

  // Dedicated Editor directly below Section 03 (Saved Custom Endpoints Library)
  const [editingEndpointId, setEditingEndpointId] = useState<string | null>(
    () => routing.endpoints[0]?.id ?? null
  );
  const [editDraft, setEditDraft] = useState<EndpointDraft | null>(() =>
    routing.endpoints[0] ? draftFromExistingEndpoint(routing.endpoints[0]) : null
  );
  const [editBindTriage, setEditBindTriage] = useState<boolean>(() =>
    Boolean(
      routing.endpoints[0] &&
        routing.triageEndpointId === routing.endpoints[0].id
    )
  );
  const [editBindVerify, setEditBindVerify] = useState<boolean>(() =>
    Boolean(
      routing.endpoints[0] &&
        routing.verifyEndpointId === routing.endpoints[0].id
    )
  );
  const [editError, setEditError] = useState<string | null>(null);
  const [editSavedFlash, setEditSavedFlash] = useState(false);

  const [envStatus, setEnvStatus] = useState<Record<string, boolean>>({});
  const [isRefreshingEnv, setIsRefreshingEnv] = useState(false);
  const [testResults, setTestResults] = useState<
    Record<string, EndpointTestState>
  >({});

  const triageProviders = PROVIDER_TEMPLATES;
  const verifyProviders = useMemo(() => {
    const nonJev = PROVIDER_TEMPLATES.filter((p) => p.id !== "jev");
    const jev = PROVIDER_TEMPLATES.find((p) => p.id === "jev");
    return jev ? [...nonJev, jev] : PROVIDER_TEMPLATES;
  }, []);

  const openEditorForEndpoint = useCallback(
    (ep: CustomModelEndpoint, scrollToEditor = false) => {
      setEditingEndpointId(ep.id);
      setEditDraft(draftFromExistingEndpoint(ep));
      setEditBindTriage(routing.triageEndpointId === ep.id);
      setEditBindVerify(routing.verifyEndpointId === ep.id);
      setEditError(null);
      setEditSavedFlash(false);
      if (scrollToEditor) {
        requestAnimationFrame(() => {
          editorSectionRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        });
      }
    },
    [routing.triageEndpointId, routing.verifyEndpointId]
  );

  // Keep editor synced if endpoints change (e.g., first endpoint added or edited item deleted)
  useEffect(() => {
    if (routing.endpoints.length === 0) {
      setEditingEndpointId(null);
      setEditDraft(null);
      return;
    }
    if (
      editingEndpointId &&
      !routing.endpoints.some((e) => e.id === editingEndpointId)
    ) {
      const first = routing.endpoints[0];
      setEditingEndpointId(first.id);
      setEditDraft(draftFromExistingEndpoint(first));
      setEditBindTriage(routing.triageEndpointId === first.id);
      setEditBindVerify(routing.verifyEndpointId === first.id);
    }
  }, [
    routing.endpoints,
    routing.triageEndpointId,
    routing.verifyEndpointId,
    editingEndpointId,
  ]);

  const trackedEnvNames = useMemo(() => {
    const set = new Set<string>(PRESET_ENV_KEYS.filter((k) => k !== "NONE"));
    for (const ep of routing.endpoints) {
      if (
        ep.envKeyName &&
        ep.envKeyName !== "NONE" &&
        ENV_VAR_REGEX.test(ep.envKeyName)
      ) {
        set.add(ep.envKeyName);
      }
    }
    for (const d of [triageDraft, verifyDraft, editDraft]) {
      if (!d) continue;
      const upper = d.envKeyName.trim().toUpperCase();
      if (upper && upper !== "NONE" && ENV_VAR_REGEX.test(upper)) {
        set.add(upper);
      }
    }
    return Array.from(set);
  }, [routing.endpoints, triageDraft, verifyDraft, editDraft]);

  const fetchEnvStatus = useCallback(async () => {
    setIsRefreshingEnv(true);
    try {
      const qs = encodeURIComponent(trackedEnvNames.join(","));
      const res = await fetch(`/api/providers/env-status?names=${qs}`);
      if (!res.ok) return;
      const data = (await res.json()) as { status?: Record<string, boolean> };
      if (data.status) {
        setEnvStatus(data.status);
      }
    } catch {
      // ignore
    } finally {
      setIsRefreshingEnv(false);
    }
  }, [trackedEnvNames]);

  useEffect(() => {
    fetchEnvStatus();
  }, [fetchEnvStatus]);

  const handleAddEndpoint = (
    stage: "triage" | "verify",
    bindImmediately: boolean
  ) => {
    const draft = stage === "triage" ? triageDraft : verifyDraft;
    const setError = stage === "triage" ? setTriageError : setVerifyError;
    const setDraft = stage === "triage" ? setTriageDraft : setVerifyDraft;

    setError(null);
    const { error, cleaned } = validateEndpointDraft(draft);
    if (error || !cleaned) {
      setError(error || "配置无效");
      return;
    }

    const endpointId = `ep-${stage}-${draft.provider}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;

    const nextEndpoint: CustomModelEndpoint = {
      id: endpointId,
      name: cleaned.name,
      provider: draft.provider,
      protocol: draft.protocol,
      baseUrl: cleaned.baseUrl,
      modelId: cleaned.modelId,
      envKeyName: cleaned.envKeyName,
      stageRole: stage,
      enableSearch: draft.protocol === "gemini" ? draft.enableSearch : false,
      thinkingLevel: draft.thinkingLevel,
      notes: draft.notes.trim() || undefined,
    };

    const nextEndpoints = [...routing.endpoints, nextEndpoint];
    let nextTriageId = routing.triageEndpointId;
    let nextVerifyId = routing.verifyEndpointId;

    if (bindImmediately) {
      if (stage === "triage") nextTriageId = endpointId;
      if (stage === "verify") nextVerifyId = endpointId;
    }

    onChangeRouting({
      endpoints: nextEndpoints,
      triageEndpointId: nextTriageId,
      verifyEndpointId: nextVerifyId,
    });

    onLog(
      "success",
      `已添加${stage === "triage" ? "决策初筛" : "核查提取"}接口「${cleaned.name}」([${(PROVIDER_MAP[draft.provider] ?? PROVIDER_MAP.other).shortTag}] ${cleaned.modelId})。`
    );

    // Select newly added endpoint in the below-library editor if nothing is open yet
    if (!editingEndpointId) {
      setEditingEndpointId(endpointId);
      setEditDraft(draftFromExistingEndpoint(nextEndpoint));
      setEditBindTriage(nextTriageId === endpointId);
      setEditBindVerify(nextVerifyId === endpointId);
    }

    setDraft(createDraftFromProvider(draft.provider, stage));
  };

  const handleSaveEditorChanges = () => {
    if (!editingEndpointId || !editDraft) return;
    setEditError(null);

    const { error, cleaned } = validateEndpointDraft(editDraft);
    if (error || !cleaned) {
      setEditError(error || "配置无效");
      return;
    }

    const existing = routing.endpoints.find((e) => e.id === editingEndpointId);
    if (!existing) return;

    const updatedEndpoint: CustomModelEndpoint = {
      ...existing,
      name: cleaned.name,
      provider: editDraft.provider,
      protocol: editDraft.protocol,
      baseUrl: cleaned.baseUrl,
      modelId: cleaned.modelId,
      envKeyName: cleaned.envKeyName,
      enableSearch:
        editDraft.protocol === "gemini" ? editDraft.enableSearch : false,
      thinkingLevel: editDraft.thinkingLevel,
      notes: editDraft.notes.trim() || undefined,
    };

    const nextEndpoints = routing.endpoints.map((ep) =>
      ep.id === editingEndpointId ? updatedEndpoint : ep
    );

    let nextTriageId = routing.triageEndpointId;
    let nextVerifyId = routing.verifyEndpointId;

    if (editBindTriage) {
      nextTriageId = editingEndpointId;
    } else if (nextTriageId === editingEndpointId) {
      nextTriageId = "";
    }

    if (editBindVerify) {
      nextVerifyId = editingEndpointId;
    } else if (nextVerifyId === editingEndpointId) {
      nextVerifyId = "";
    }

    onChangeRouting({
      endpoints: nextEndpoints,
      triageEndpointId: nextTriageId,
      verifyEndpointId: nextVerifyId,
    });

    setEditSavedFlash(true);
    window.setTimeout(() => setEditSavedFlash(false), 2000);
    onLog(
      "success",
      `已保存接口修改「${cleaned.name}」([${(PROVIDER_MAP[editDraft.provider] ?? PROVIDER_MAP.other).shortTag}] ${cleaned.modelId})。`
    );
  };

  const handleDeleteEndpoint = (ep: CustomModelEndpoint) => {
    const nextEndpoints = routing.endpoints.filter((e) => e.id !== ep.id);
    const nextTriage =
      routing.triageEndpointId === ep.id
        ? nextEndpoints[0]?.id ?? ""
        : routing.triageEndpointId;
    const nextVerify =
      routing.verifyEndpointId === ep.id
        ? nextEndpoints[0]?.id ?? ""
        : routing.verifyEndpointId;

    onChangeRouting({
      endpoints: nextEndpoints,
      triageEndpointId: nextTriage,
      verifyEndpointId: nextVerify,
    });
    onLog("warn", `已删除自定义接口「${ep.name}」。`);
  };

  const handleTestEndpoint = async (ep: CustomModelEndpoint) => {
    setTestResults((prev) => ({
      ...prev,
      [ep.id]: { status: "testing" },
    }));

    try {
      const res = await fetch("/api/providers/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: ep }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        latencyMs?: number;
        replyPreview?: string;
        error?: string;
      };

      if (!res.ok || !data.ok) {
        const msg = data.error || `HTTP ${res.status}`;
        setTestResults((prev) => ({
          ...prev,
          [ep.id]: { status: "error", detail: msg },
        }));
        onLog("error", `接口「${ep.name}」连通性测试失败：${msg}`);
        return;
      }

      setTestResults((prev) => ({
        ...prev,
        [ep.id]: {
          status: "ok",
          latencyMs: data.latencyMs,
          detail: data.replyPreview || "响应正常",
        },
      }));
      onLog(
        "success",
        `接口「${ep.name}」连通测试通过 (${data.latencyMs ?? 0}ms)。`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "网络请求异常";
      setTestResults((prev) => ({
        ...prev,
        [ep.id]: { status: "error", detail: msg },
      }));
      onLog("error", `接口「${ep.name}」连通性测试异常：${msg}`);
    }
  };

  const activeEditorTpl = editDraft
    ? PROVIDER_MAP[editDraft.provider] ?? PROVIDER_MAP.other
    : null;
  const activeEditorSuggestedModels = useMemo(() => {
    if (!activeEditorTpl) return [];
    const merged = new Set<string>([
      ...activeEditorTpl.suggestedModels,
      ...(activeEditorTpl.triageSuggestedModels ?? []),
    ]);
    return Array.from(merged);
  }, [activeEditorTpl]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-3 border-b border-border pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onBack}
              className="h-8 gap-1.5 px-2.5 text-xs"
            >
              <ArrowLeft className="size-3.5" aria-hidden="true" />
              返回工作台
            </Button>
            <h1 className="text-lg font-bold tracking-tight text-foreground">
              自定义模型接口管理
            </h1>
          </div>
          <p className="text-xs text-muted-foreground">
            上下分区添加第一阶段（决策初筛）与第二阶段（深度核查提取）接口，并在底部接口库直接编辑任意已添加模型。接口密钥统一通过服务端环境变量（.env）安全代理注入。
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={fetchEnvStatus}
          disabled={isRefreshingEnv}
          className="h-8 gap-1.5 self-start text-xs sm:self-auto"
        >
          <RefreshCw
            className={`size-3.5 ${isRefreshingEnv ? "animate-spin" : ""}`}
            aria-hidden="true"
          />
          刷新密钥就绪状态
        </Button>
      </div>

      {/* 01. Stage 1 Decision Triage Endpoint Builder */}
      <StageEndpointPanel
        stage="triage"
        title="01. 第一阶段 · 决策初筛模型接口添加（支持 JEV / Gemini / OpenAI 等最新模型）"
        subtitle="用于高速四分类并自动拦截低质水贴噪音。优先支持 JEV 决策模型、Gemini Decisions API 以及各类最新轻量高速模型。"
        providers={triageProviders}
        draft={triageDraft}
        onDraftChange={setTriageDraft}
        onSelectProvider={(providerId) => {
          setTriageError(null);
          setTriageDraft(createDraftFromProvider(providerId, "triage"));
        }}
        onSubmit={(bind) => handleAddEndpoint("triage", bind)}
        formError={triageError}
        envStatus={envStatus}
        endpoints={routing.endpoints}
        boundEndpointId={routing.triageEndpointId}
        onChangeBoundEndpointId={(id) =>
          onChangeRouting({ ...routing, triageEndpointId: id })
        }
      />

      {/* 02. Stage 2 Deep Fact-Checking & Extraction Endpoint Builder */}
      <StageEndpointPanel
        stage="verify"
        title="02. 第二阶段 · 深度核查与 11 列提取模型接口添加"
        subtitle="用于对高价值条目执行多项目拆行、事实核查与 11 列结构化 JSON 提取，已更新至 GPT-6.2 / Gemini 4 / Claude 5.5 / DeepSeek V4 / GLM-4.7 / Kimi K3.1 / 混元 HY4 等最新模板。"
        providers={verifyProviders}
        draft={verifyDraft}
        onDraftChange={setVerifyDraft}
        onSelectProvider={(providerId) => {
          setVerifyError(null);
          setVerifyDraft(createDraftFromProvider(providerId, "verify"));
        }}
        onSubmit={(bind) => handleAddEndpoint("verify", bind)}
        formError={verifyError}
        envStatus={envStatus}
        endpoints={routing.endpoints}
        boundEndpointId={routing.verifyEndpointId}
        onChangeBoundEndpointId={(id) =>
          onChangeRouting({ ...routing, verifyEndpointId: id })
        }
      />

      {/* 03. Saved Custom Endpoints Library */}
      <Card className="gap-0 overflow-hidden rounded-xl border border-border bg-card py-0 shadow-none ring-0">
        <CardHeader className="flex flex-row items-center justify-between gap-4 border-b border-border px-5 py-4">
          <div className="space-y-0.5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Server className="size-4 text-muted-foreground" aria-hidden="true" />
              03. 已添加的自定义接口库 ({routing.endpoints.length})
            </h2>
            <p className="text-xs text-muted-foreground">
              可随时测试连通性、切换第一/第二阶段绑定，或点击「编辑接口」在下方编辑区修改全部参数。
            </p>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {routing.endpoints.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
              <Layers
                className="size-7 text-muted-foreground/40"
                aria-hidden="true"
              />
              <p className="text-sm font-medium text-foreground">
                尚未添加任何自定义模型接口
              </p>
              <p className="max-w-md text-xs text-muted-foreground">
                请在上方「01. 第一阶段」与「02. 第二阶段」添加窗口中配置您的 JEV、OpenAI、Gemini、Claude、DeepSeek、GLM、Kimi、腾讯混元或其它兼容接口。
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {routing.endpoints.map((ep) => {
                const tpl = PROVIDER_MAP[ep.provider] ?? PROVIDER_MAP.other;
                const isTriage = routing.triageEndpointId === ep.id;
                const isVerify = routing.verifyEndpointId === ep.id;
                const isEditingThis = editingEndpointId === ep.id;
                const isKeyless = ep.envKeyName === "NONE";
                const keyReady = isKeyless || Boolean(envStatus[ep.envKeyName]);
                const testState = testResults[ep.id];

                return (
                  <div
                    key={ep.id}
                    className={`flex flex-col gap-3 px-5 py-4 transition-colors lg:flex-row lg:items-center lg:justify-between ${
                      isEditingThis ? "bg-muted/35" : "hover:bg-muted/20"
                    }`}
                  >
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                        <span
                          className={`font-mono text-xs font-bold ${tpl.accentClass}`}
                        >
                          [{tpl.shortTag}]
                        </span>
                        <span className="text-sm font-semibold text-foreground">
                          {ep.name}
                        </span>
                        <span className="font-mono text-xs text-foreground/85">
                          {ep.modelId}
                        </span>
                        {isTriage && (
                          <span className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                            第一阶段 · 决策初筛
                          </span>
                        )}
                        {isVerify && (
                          <span className="rounded border border-sky-500/40 bg-sky-500/10 px-1.5 py-0.5 text-[11px] font-medium text-sky-600 dark:text-sky-400">
                            第二阶段 · 核查提取
                          </span>
                        )}
                        {isEditingThis && (
                          <span className="rounded border border-foreground/30 bg-muted px-1.5 py-0.5 text-[11px] font-medium text-foreground">
                            下方编辑中
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="max-w-[360px] truncate font-mono text-[11px]">
                          {ep.baseUrl}
                        </span>
                        <span aria-hidden="true" className="text-border">
                          ·
                        </span>
                        <span>{PROTOCOL_LABELS[ep.protocol]}</span>
                        <span aria-hidden="true" className="text-border">
                          ·
                        </span>
                        <span
                          className={`font-mono text-[11px] ${
                            keyReady
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-amber-600 dark:text-amber-400"
                          }`}
                        >
                          {isKeyless
                            ? "免密钥 (NONE)"
                            : keyReady
                              ? `${ep.envKeyName} 已就绪`
                              : `${ep.envKeyName} 未配置有效密钥`}
                        </span>
                        {ep.protocol === "gemini" && ep.enableSearch && (
                          <>
                            <span aria-hidden="true" className="text-border">
                              ·
                            </span>
                            <span className="text-sky-600 dark:text-sky-400">
                              +Google Search
                            </span>
                          </>
                        )}
                      </div>

                      {ep.notes && (
                        <p className="text-[11px] text-muted-foreground">
                          备注：{ep.notes}
                        </p>
                      )}

                      {testState && (
                        <div
                          className={`text-xs ${
                            testState.status === "ok"
                              ? "text-emerald-600 dark:text-emerald-400"
                              : testState.status === "error"
                                ? "text-rose-600 dark:text-rose-400"
                                : "text-muted-foreground"
                          }`}
                        >
                          {testState.status === "testing" ? (
                            <span className="inline-flex items-center gap-1">
                              <Loader2 className="size-3 animate-spin" />
                              正在通过服务端代理测试连通性…
                            </span>
                          ) : testState.status === "ok" ? (
                            <span className="inline-flex items-center gap-1 font-mono">
                              <CheckCircle2 className="size-3.5" />
                              连通成功 ({testState.latencyMs ?? 0}ms) · 响应：
                              {testState.detail}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1">
                              <XCircle className="size-3.5 shrink-0" />
                              测试失败：{testState.detail}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={testState?.status === "testing"}
                        onClick={() => handleTestEndpoint(ep)}
                        className="h-8 gap-1 px-2.5 text-xs"
                      >
                        <Activity className="size-3.5" aria-hidden="true" />
                        测试
                      </Button>

                      <Button
                        type="button"
                        variant={isTriage ? "secondary" : "outline"}
                        size="sm"
                        onClick={() => {
                          onChangeRouting({
                            ...routing,
                            triageEndpointId: ep.id,
                          });
                          if (editingEndpointId === ep.id) {
                            setEditBindTriage(true);
                          }
                        }}
                        className="h-8 px-2.5 text-xs"
                      >
                        {isTriage ? "当前初筛" : "设为初筛"}
                      </Button>

                      <Button
                        type="button"
                        variant={isVerify ? "secondary" : "outline"}
                        size="sm"
                        onClick={() => {
                          onChangeRouting({
                            ...routing,
                            verifyEndpointId: ep.id,
                          });
                          if (editingEndpointId === ep.id) {
                            setEditBindVerify(true);
                          }
                        }}
                        className="h-8 px-2.5 text-xs"
                      >
                        {isVerify ? "当前核查" : "设为核查"}
                      </Button>

                      <Button
                        type="button"
                        variant={isEditingThis ? "default" : "outline"}
                        size="sm"
                        onClick={() => openEditorForEndpoint(ep, true)}
                        className="h-8 gap-1 px-2.5 text-xs"
                      >
                        <Edit3 className="size-3.5" aria-hidden="true" />
                        编辑接口
                      </Button>

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleDeleteEndpoint(ep)}
                        aria-label={`删除 ${ep.name}`}
                        title="删除接口"
                        className="size-8 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 04. Dedicated Model Endpoint Editor Directly Below Section 03 */}
      {routing.endpoints.length > 0 && (
        <div ref={editorSectionRef} className="scroll-mt-20">
          <Card className="gap-0 overflow-hidden rounded-xl border border-border bg-card py-0 shadow-none ring-0">
            <CardHeader className="flex flex-col gap-3 border-b border-border px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-0.5">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Edit3 className="size-4 text-muted-foreground" aria-hidden="true" />
                  04. 模型接口编辑区
                </h2>
                <p className="text-xs text-muted-foreground">
                  在此直接修改已添加接口的厂商模板、模型 ID、Base URL、协议类型、环境变量绑定与阶段分配。
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 lg:min-w-[320px] lg:justify-end">
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  选择编辑对象：
                </span>
                <select
                  value={editingEndpointId ?? ""}
                  onChange={(e) => {
                    const hit = routing.endpoints.find(
                      (item) => item.id === e.target.value
                    );
                    if (hit) {
                      openEditorForEndpoint(hit, false);
                    } else {
                      setEditingEndpointId(null);
                      setEditDraft(null);
                    }
                  }}
                  aria-label="选择要编辑的已添加接口"
                  className="h-8 max-w-[260px] flex-1 rounded-md border border-input bg-background px-2.5 text-xs text-foreground outline-none focus:border-ring"
                >
                  <option value="">请选择一个已添加接口…</option>
                  {routing.endpoints.map((ep) => (
                    <option key={ep.id} value={ep.id}>
                      [{(PROVIDER_MAP[ep.provider] ?? PROVIDER_MAP.other).shortTag}]{" "}
                      {ep.name} · {ep.modelId}
                    </option>
                  ))}
                </select>
              </div>
            </CardHeader>

            <CardContent className="p-5">
              {!editingEndpointId || !editDraft ? (
                <div className="py-6 text-center text-xs text-muted-foreground">
                  请点击上方「03. 已添加的自定义接口库」中任意条目的「编辑接口」按钮，或在右上角下拉框中选择接口开始编辑。
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Provider quick switch */}
                  <div className="space-y-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      切换所属厂商模板（点击会同步刷新该厂商默认 Base URL、协议与推荐模型）
                    </span>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9">
                      {PROVIDER_TEMPLATES.map((tpl) => {
                        const selected = editDraft.provider === tpl.id;
                        return (
                          <button
                            key={`edit-${tpl.id}`}
                            type="button"
                            onClick={() => {
                              setEditError(null);
                              setEditDraft((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      provider: tpl.id,
                                      protocol: tpl.defaultProtocol,
                                      baseUrl: tpl.defaultBaseUrl,
                                      modelId: tpl.suggestedModels[0] ?? prev.modelId,
                                      envKeyName: tpl.defaultEnvKey,
                                      useCustomEnvName: false,
                                      enableSearch: tpl.id === "gemini",
                                    }
                                  : prev
                              );
                            }}
                            className={`flex cursor-pointer flex-col items-start rounded-lg border px-2.5 py-2 text-left transition-colors ${
                              selected
                                ? "border-foreground bg-muted/60"
                                : "border-border bg-background hover:border-foreground/40 hover:bg-muted/25"
                            }`}
                          >
                            <span
                              className={`font-mono text-[11px] font-bold ${tpl.accentClass}`}
                            >
                              {tpl.shortTag}
                            </span>
                            <span className="mt-0.5 w-full truncate text-[11px] font-medium text-foreground">
                              {tpl.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Core fields */}
                  <div className="grid grid-cols-1 gap-3.5 md:grid-cols-12">
                    <div className="space-y-1.5 md:col-span-4">
                      <label
                        htmlFor="edit-ep-name"
                        className="text-xs font-medium text-foreground"
                      >
                        接口显示名称
                      </label>
                      <Input
                        id="edit-ep-name"
                        value={editDraft.name}
                        onChange={(e) =>
                          setEditDraft((prev) =>
                            prev ? { ...prev, name: e.target.value } : prev
                          )
                        }
                        className="h-9 text-xs"
                      />
                    </div>

                    <div className="space-y-1.5 md:col-span-4">
                      <label
                        htmlFor="edit-ep-protocol"
                        className="text-xs font-medium text-foreground"
                      >
                        请求协议格式
                      </label>
                      <select
                        id="edit-ep-protocol"
                        value={editDraft.protocol}
                        onChange={(e) =>
                          setEditDraft((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  protocol: e.target.value as ApiProtocol,
                                }
                              : prev
                          )
                        }
                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs text-foreground outline-none focus:border-ring"
                      >
                        {(Object.keys(PROTOCOL_LABELS) as ApiProtocol[]).map(
                          (proto) => (
                            <option key={proto} value={proto}>
                              {PROTOCOL_LABELS[proto]}
                            </option>
                          )
                        )}
                      </select>
                    </div>

                    <div className="space-y-1.5 md:col-span-4">
                      <label
                        htmlFor="edit-ep-model"
                        className="text-xs font-medium text-foreground"
                      >
                        模型 ID (Model ID)
                      </label>
                      <Input
                        id="edit-ep-model"
                        value={editDraft.modelId}
                        onChange={(e) =>
                          setEditDraft((prev) =>
                            prev ? { ...prev, modelId: e.target.value } : prev
                          )
                        }
                        className="h-9 font-mono text-xs"
                      />
                    </div>

                    <div className="space-y-1.5 md:col-span-7">
                      <label
                        htmlFor="edit-ep-url"
                        className="text-xs font-medium text-foreground"
                      >
                        接口地址 (Base URL)
                      </label>
                      <Input
                        id="edit-ep-url"
                        value={editDraft.baseUrl}
                        onChange={(e) =>
                          setEditDraft((prev) =>
                            prev ? { ...prev, baseUrl: e.target.value } : prev
                          )
                        }
                        className="h-9 font-mono text-xs"
                      />
                    </div>

                    <div className="space-y-1.5 md:col-span-5">
                      <label
                        htmlFor="edit-ep-notes"
                        className="text-xs font-medium text-foreground"
                      >
                        备注说明（可选）
                      </label>
                      <Input
                        id="edit-ep-notes"
                        value={editDraft.notes}
                        onChange={(e) =>
                          setEditDraft((prev) =>
                            prev ? { ...prev, notes: e.target.value } : prev
                          )
                        }
                        className="h-9 text-xs"
                      />
                    </div>
                  </div>

                  {/* Quick-select latest model chips */}
                  {activeEditorTpl && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] text-muted-foreground">
                        {activeEditorTpl.label} 最新模型快捷替换：
                      </span>
                      {activeEditorSuggestedModels.map((m) => (
                        <button
                          key={`edit-m-${m}`}
                          type="button"
                          onClick={() =>
                            setEditDraft((prev) =>
                              prev ? { ...prev, modelId: m } : prev
                            )
                          }
                          className={`cursor-pointer rounded border px-2 py-0.5 font-mono text-[11px] transition-colors ${
                            editDraft.modelId === m
                              ? "border-foreground bg-muted text-foreground"
                              : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground"
                          }`}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  )}

                  <SecretEnvBindingBlock
                    idPrefix="editor"
                    envKeyName={editDraft.envKeyName}
                    useCustomEnvName={editDraft.useCustomEnvName}
                    envStatus={envStatus}
                    onChange={(nextEnv, nextCustom) =>
                      setEditDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              envKeyName: nextEnv,
                              useCustomEnvName: nextCustom,
                            }
                          : prev
                      )
                    }
                  />

                  {/* Gemini specific options */}
                  {editDraft.protocol === "gemini" && (
                    <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/15 p-3.5 sm:flex-row sm:items-center sm:justify-between">
                      <label
                        htmlFor="edit-google-search"
                        className="flex cursor-pointer items-center gap-2.5 text-xs font-medium text-foreground"
                      >
                        <Checkbox
                          id="edit-google-search"
                          checked={editDraft.enableSearch}
                          onCheckedChange={(checked) =>
                            setEditDraft((prev) =>
                              prev
                                ? { ...prev, enableSearch: Boolean(checked) }
                                : prev
                            )
                          }
                        />
                        <Globe
                          className="size-3.5 text-sky-500"
                          aria-hidden="true"
                        />
                        第二阶段启用 Google Search 实时联网核查
                      </label>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[11px] text-muted-foreground">
                          推理深度：
                        </span>
                        {(["low", "medium", "high"] as ThinkingDepth[]).map(
                          (lvl) => (
                            <button
                              key={`edit-lvl-${lvl}`}
                              type="button"
                              onClick={() =>
                                setEditDraft((prev) =>
                                  prev ? { ...prev, thinkingLevel: lvl } : prev
                                )
                              }
                              className={`cursor-pointer rounded border px-2 py-1 font-mono text-[11px] transition-colors ${
                                editDraft.thinkingLevel === lvl
                                  ? "border-foreground bg-muted text-foreground"
                                  : "border-border text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              {lvl}
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  )}

                  {/* Stage bindings inside editor */}
                  <div className="flex flex-wrap items-center gap-5 rounded-lg border border-border bg-muted/15 px-3.5 py-2.5 text-xs">
                    <span className="font-medium text-muted-foreground">
                      阶段路由绑定：
                    </span>
                    <label className="inline-flex cursor-pointer items-center gap-2 text-foreground">
                      <Checkbox
                        checked={editBindTriage}
                        onCheckedChange={(c) => setEditBindTriage(Boolean(c))}
                      />
                      <span>绑定为第一阶段（决策初筛）</span>
                    </label>
                    <label className="inline-flex cursor-pointer items-center gap-2 text-foreground">
                      <Checkbox
                        checked={editBindVerify}
                        onCheckedChange={(c) => setEditBindVerify(Boolean(c))}
                      />
                      <span>绑定为第二阶段（深度核查与 11 列提取）</span>
                    </label>
                  </div>

                  {editError && (
                    <p className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-400">
                      {editError}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-2 pt-0.5">
                    <Button
                      type="button"
                      onClick={handleSaveEditorChanges}
                      className="h-9 gap-1.5 px-4 text-xs font-semibold"
                    >
                      {editSavedFlash ? (
                        <>
                          <CheckCircle2 className="size-3.5" aria-hidden="true" />
                          已保存修改
                        </>
                      ) : (
                        <>
                          <Save className="size-3.5" aria-hidden="true" />
                          保存接口修改
                        </>
                      )}
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        const orig = routing.endpoints.find(
                          (e) => e.id === editingEndpointId
                        );
                        if (orig) openEditorForEndpoint(orig, false);
                      }}
                      className="h-9 px-3 text-xs"
                    >
                      还原未保存修改
                    </Button>

                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setEditingEndpointId(null);
                        setEditDraft(null);
                        setEditError(null);
                      }}
                      className="h-9 gap-1 px-3 text-xs text-muted-foreground"
                    >
                      <X className="size-3.5" aria-hidden="true" />
                      收起编辑区
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
