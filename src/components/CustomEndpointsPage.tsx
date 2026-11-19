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
  Search,
  Server,
  ShieldCheck,
  Trash2,
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
  id: string | null;
  name: string;
  provider: ProviderId;
  protocol: ApiProtocol;
  baseUrl: string;
  modelId: string;
  envKeyName: string;
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
    id: null,
    name: `${tpl.label}${stage === "triage" ? "初筛" : "核查"}接口`,
    provider: tpl.id,
    protocol: tpl.defaultProtocol,
    baseUrl: tpl.defaultBaseUrl,
    modelId: modelList[0] ?? "",
    envKeyName: tpl.defaultEnvKey,
    enableSearch: stage === "verify" && tpl.id === "gemini",
    thinkingLevel: "low",
    notes: "",
  };
}

interface StageEndpointPanelProps {
  stage: "triage" | "verify";
  title: string;
  subtitle: string;
  providers: typeof PROVIDER_TEMPLATES;
  draft: EndpointDraft;
  onDraftChange: (updater: (prev: EndpointDraft) => EndpointDraft) => void;
  onSelectProvider: (providerId: ProviderId) => void;
  onCancelEdit: () => void;
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
  onCancelEdit,
  onSubmit,
  formError,
  envStatus,
  endpoints,
  boundEndpointId,
  onChangeBoundEndpointId,
}: StageEndpointPanelProps) {
  const isTriage = stage === "triage";
  const currentTpl = PROVIDER_MAP[draft.provider];
  const suggestedModels =
    isTriage && currentTpl.triageSuggestedModels?.length
      ? currentTpl.triageSuggestedModels
      : currentTpl.suggestedModels;
  const draftEnvUpper = draft.envKeyName.trim().toUpperCase();
  const isDraftEnvReady =
    draftEnvUpper === "NONE" ? true : Boolean(envStatus[draftEnvUpper]);
  const boundEndpoint = endpoints.find((e) => e.id === boundEndpointId);

  return (
    <Card className="gap-0 overflow-hidden rounded-xl border border-border bg-card py-0 shadow-none ring-0">
      {/* Panel Header + Current Stage Active Binding */}
      <CardHeader className="flex flex-col gap-3 border-b border-border px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            {isTriage ? (
              <Zap className="size-4 text-amber-500" aria-hidden="true" />
            ) : (
              <Search className="size-4 text-sky-500" aria-hidden="true" />
            )}
            <h2 className="text-sm font-semibold text-foreground">{title}</h2>
            {draft.id && (
              <span className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                编辑模式
              </span>
            )}
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
                [{(PROVIDER_MAP[ep.provider] ?? PROVIDER_MAP.other).shortTag}] {ep.name} · {ep.modelId}
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
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              选择厂商模板（一键填充官方默认地址与协议，下方可任意自定义修改）
            </span>
            {draft.id && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onCancelEdit}
                className="h-7 px-2 text-xs text-muted-foreground"
              >
                退出编辑
              </Button>
            )}
          </div>

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
                          : `${tpl.defaultEnvKey} 待配置`
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
                isTriage ? "例如：JEV 极速初筛网关" : "例如：DeepSeek 深度核查"
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

        {/* Suggested Model Chips */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">
            {currentTpl.label} 常用模型参考：
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

        {/* Server-Side Secrets Variable Binding */}
        <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label
              htmlFor={`${stage}-env-key`}
              className="flex items-center gap-1.5 text-xs font-semibold text-foreground"
            >
              <ShieldCheck
                className="size-3.5 text-emerald-500"
                aria-hidden="true"
              />
              服务端密钥环境变量名（安全代理）
            </label>
            {draftEnvUpper === "NONE" ? (
              <span className="font-mono text-[11px] text-sky-600 dark:text-sky-400">
                本地免鉴权模式 (NONE)
              </span>
            ) : isDraftEnvReady ? (
              <span className="inline-flex items-center gap-1 font-mono text-[11px] text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="size-3" />
                Secrets 已就绪：{draftEnvUpper}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 font-mono text-[11px] text-amber-600 dark:text-amber-400">
                <XCircle className="size-3" />
                需在 Settings &gt; Secrets 添加 {draftEnvUpper || "环境变量"}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <select
              aria-label="选择服务端 Secrets 环境变量名"
              value={
                (PRESET_ENV_KEYS as readonly string[]).includes(draftEnvUpper)
                  ? draftEnvUpper
                  : "__custom__"
              }
              onChange={(e) => {
                if (e.target.value !== "__custom__") {
                  onDraftChange((prev) => ({
                    ...prev,
                    envKeyName: e.target.value,
                  }));
                }
              }}
              className="h-9 rounded-md border border-input bg-background px-2.5 font-mono text-xs text-foreground outline-none focus:border-ring"
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
              <option value="__custom__">自定义变量名（右侧输入）</option>
            </select>

            <Input
              id={`${stage}-env-key`}
              value={draft.envKeyName}
              onChange={(e) =>
                onDraftChange((prev) => ({
                  ...prev,
                  envKeyName: e.target.value.toUpperCase(),
                }))
              }
              placeholder="例如：JEV_API_KEY 或自定义变量名"
              className="h-9 font-mono text-xs uppercase"
            />
          </div>
        </div>

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
            {draft.id
              ? isTriage
                ? "保存并保持为决策初筛模型"
                : "保存并保持为核查提取模型"
              : isTriage
                ? "添加并设为第一阶段决策模型"
                : "添加并设为第二阶段核查模型"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => onSubmit(false)}
            className="h-9 px-3 text-xs"
          >
            {draft.id ? "仅保存修改" : "仅添加到下方接口库"}
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
  const triageSectionRef = useRef<HTMLDivElement>(null);
  const verifySectionRef = useRef<HTMLDivElement>(null);

  // Stage 1 (Decision Triage) defaults to JEV template for instant setup
  const [triageDraft, setTriageDraft] = useState<EndpointDraft>(() =>
    createDraftFromProvider("jev", "triage")
  );
  const [triageError, setTriageError] = useState<string | null>(null);

  // Stage 2 (Deep Verification & Extraction) defaults to OpenAI template
  const [verifyDraft, setVerifyDraft] = useState<EndpointDraft>(() =>
    createDraftFromProvider("openai", "verify")
  );
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const [envStatus, setEnvStatus] = useState<Record<string, boolean>>({});
  const [isRefreshingEnv, setIsRefreshingEnv] = useState(false);
  const [testResults, setTestResults] = useState<
    Record<string, EndpointTestState>
  >({});

  // Stage 1 puts JEV + Gemini first; Stage 2 puts mainstream generative models first (all 9 available in both)
  const triageProviders = PROVIDER_TEMPLATES;
  const verifyProviders = useMemo(() => {
    const nonJev = PROVIDER_TEMPLATES.filter((p) => p.id !== "jev");
    const jev = PROVIDER_TEMPLATES.find((p) => p.id === "jev");
    return jev ? [...nonJev, jev] : PROVIDER_TEMPLATES;
  }, []);

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
    for (const d of [triageDraft, verifyDraft]) {
      const upper = d.envKeyName.trim().toUpperCase();
      if (upper && upper !== "NONE" && ENV_VAR_REGEX.test(upper)) {
        set.add(upper);
      }
    }
    return Array.from(set);
  }, [routing.endpoints, triageDraft, verifyDraft]);

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

  const saveDraft = (stage: "triage" | "verify", bindImmediately: boolean) => {
    const draft = stage === "triage" ? triageDraft : verifyDraft;
    const setError = stage === "triage" ? setTriageError : setVerifyError;
    const setDraft = stage === "triage" ? setTriageDraft : setVerifyDraft;

    setError(null);
    const name = draft.name.trim();
    const baseUrl = draft.baseUrl.trim().replace(/\/+$/, "");
    const modelId = draft.modelId.trim();
    const envKeyName = draft.envKeyName.trim().toUpperCase();

    if (!name) {
      setError("请填写接口显示名称。");
      return;
    }
    if (!baseUrl || !/^https?:\/\/.+/i.test(baseUrl)) {
      setError("请填写有效的 Base URL（必须以 https:// 或 http:// 开头）。");
      return;
    }
    if (!modelId) {
      setError("请填写需要调用的模型 ID（Model ID）。");
      return;
    }
    if (envKeyName !== "NONE" && !ENV_VAR_REGEX.test(envKeyName)) {
      setError(
        "环境变量名仅支持大写字母、数字和下划线（如 JEV_API_KEY），或填写 NONE 表示本地免密钥接口。"
      );
      return;
    }

    const endpointId =
      draft.id ??
      `ep-${stage}-${draft.provider}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;

    const nextEndpoint: CustomModelEndpoint = {
      id: endpointId,
      name,
      provider: draft.provider,
      protocol: draft.protocol,
      baseUrl,
      modelId,
      envKeyName,
      stageRole: stage,
      enableSearch: draft.protocol === "gemini" ? draft.enableSearch : false,
      thinkingLevel: draft.thinkingLevel,
      notes: draft.notes.trim() || undefined,
    };

    const exists = routing.endpoints.some((e) => e.id === endpointId);
    const nextEndpoints = exists
      ? routing.endpoints.map((e) => (e.id === endpointId ? nextEndpoint : e))
      : [...routing.endpoints, nextEndpoint];

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
      `${exists ? "已更新" : "已添加"}${stage === "triage" ? "决策初筛" : "核查提取"}接口「${name}」([${PROVIDER_MAP[draft.provider].shortTag}] ${modelId})。`
    );

    setDraft(createDraftFromProvider(draft.provider, stage));
  };

  const handleEditEndpoint = (ep: CustomModelEndpoint) => {
    const targetStage: "triage" | "verify" =
      ep.stageRole === "verify" ||
      (routing.verifyEndpointId === ep.id && routing.triageEndpointId !== ep.id)
        ? "verify"
        : "triage";

    const nextDraft: EndpointDraft = {
      id: ep.id,
      name: ep.name,
      provider: ep.provider,
      protocol: ep.protocol,
      baseUrl: ep.baseUrl,
      modelId: ep.modelId,
      envKeyName: ep.envKeyName,
      enableSearch: Boolean(ep.enableSearch),
      thinkingLevel: ep.thinkingLevel ?? "low",
      notes: ep.notes ?? "",
    };

    if (targetStage === "triage") {
      setTriageError(null);
      setTriageDraft(nextDraft);
      triageSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      setVerifyError(null);
      setVerifyDraft(nextDraft);
      verifySectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
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
    if (triageDraft.id === ep.id) {
      setTriageDraft(createDraftFromProvider("jev", "triage"));
    }
    if (verifyDraft.id === ep.id) {
      setVerifyDraft(createDraftFromProvider("openai", "verify"));
    }
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
            上下分区分别添加与绑定第一阶段（决策初筛，支持 JEV / Gemini / OpenAI 等）与第二阶段（深度核查与 11 列提取）接口；密钥通过平台 Settings &gt; Secrets 安全代理读取。
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
          刷新 Secrets 状态
        </Button>
      </div>

      {/* Top Panel: Stage 1 Decision Triage Endpoint Builder (Includes JEV) */}
      <div ref={triageSectionRef} className="scroll-mt-20">
        <StageEndpointPanel
          stage="triage"
          title="01. 第一阶段 · 决策初筛模型接口添加（支持 JEV / Gemini / OpenAI 等）"
          subtitle="用于高速四分类并自动拦截低质水贴噪音。优先支持 JEV 决策模型接口、Gemini Decisions API 以及各类兼容网关。"
          providers={triageProviders}
          draft={triageDraft}
          onDraftChange={setTriageDraft}
          onSelectProvider={(providerId) => {
            setTriageError(null);
            setTriageDraft((prev) => {
              const fresh = createDraftFromProvider(providerId, "triage");
              return prev.id ? { ...fresh, id: prev.id, notes: prev.notes } : fresh;
            });
          }}
          onCancelEdit={() => {
            setTriageError(null);
            setTriageDraft(createDraftFromProvider("jev", "triage"));
          }}
          onSubmit={(bind) => saveDraft("triage", bind)}
          formError={triageError}
          envStatus={envStatus}
          endpoints={routing.endpoints}
          boundEndpointId={routing.triageEndpointId}
          onChangeBoundEndpointId={(id) =>
            onChangeRouting({ ...routing, triageEndpointId: id })
          }
        />
      </div>

      {/* Bottom Panel: Stage 2 Deep Fact-Checking & Extraction Endpoint Builder */}
      <div ref={verifySectionRef} className="scroll-mt-20">
        <StageEndpointPanel
          stage="verify"
          title="02. 第二阶段 · 深度核查与 11 列提取模型接口添加"
          subtitle="用于对高价值条目执行多项目拆行、事实核查与 11 列结构化 JSON 提取，支持 OpenAI / Gemini / Claude / DeepSeek / GLM / Kimi / 腾讯 / 其它 / JEV。"
          providers={verifyProviders}
          draft={verifyDraft}
          onDraftChange={setVerifyDraft}
          onSelectProvider={(providerId) => {
            setVerifyError(null);
            setVerifyDraft((prev) => {
              const fresh = createDraftFromProvider(providerId, "verify");
              return prev.id ? { ...fresh, id: prev.id, notes: prev.notes } : fresh;
            });
          }}
          onCancelEdit={() => {
            setVerifyError(null);
            setVerifyDraft(createDraftFromProvider("openai", "verify"));
          }}
          onSubmit={(bind) => saveDraft("verify", bind)}
          formError={verifyError}
          envStatus={envStatus}
          endpoints={routing.endpoints}
          boundEndpointId={routing.verifyEndpointId}
          onChangeBoundEndpointId={(id) =>
            onChangeRouting({ ...routing, verifyEndpointId: id })
          }
        />
      </div>

      {/* Saved Custom Endpoints Library */}
      <Card className="gap-0 overflow-hidden rounded-xl border border-border bg-card py-0 shadow-none ring-0">
        <CardHeader className="flex flex-row items-center justify-between gap-4 border-b border-border px-5 py-4">
          <div className="space-y-0.5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Server className="size-4 text-muted-foreground" aria-hidden="true" />
              03. 已添加的自定义接口库 ({routing.endpoints.length})
            </h2>
            <p className="text-xs text-muted-foreground">
              可随时测试连通性、编辑参数或切换第一/第二阶段绑定。所有接口配置保存在本地浏览器。
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
                请在上方「第一阶段」与「第二阶段」添加窗口中分别配置您的 JEV、OpenAI、Gemini、Claude、DeepSeek、GLM、Kimi、腾讯混元或其它兼容接口。
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {routing.endpoints.map((ep) => {
                const tpl = PROVIDER_MAP[ep.provider] ?? PROVIDER_MAP.other;
                const isTriage = routing.triageEndpointId === ep.id;
                const isVerify = routing.verifyEndpointId === ep.id;
                const isKeyless = ep.envKeyName === "NONE";
                const keyReady = isKeyless || Boolean(envStatus[ep.envKeyName]);
                const testState = testResults[ep.id];

                return (
                  <div
                    key={ep.id}
                    className="flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-muted/20 lg:flex-row lg:items-center lg:justify-between"
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
                              : `${ep.envKeyName} 未在 Secrets 配置`}
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
                        onClick={() =>
                          onChangeRouting({
                            ...routing,
                            triageEndpointId: ep.id,
                          })
                        }
                        className="h-8 px-2.5 text-xs"
                      >
                        {isTriage ? "当前初筛" : "设为初筛"}
                      </Button>

                      <Button
                        type="button"
                        variant={isVerify ? "secondary" : "outline"}
                        size="sm"
                        onClick={() =>
                          onChangeRouting({
                            ...routing,
                            verifyEndpointId: ep.id,
                          })
                        }
                        className="h-8 px-2.5 text-xs"
                      >
                        {isVerify ? "当前核查" : "设为核查"}
                      </Button>

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleEditEndpoint(ep)}
                        aria-label={`编辑 ${ep.name}`}
                        title="编辑接口"
                        className="size-8 text-muted-foreground hover:text-foreground"
                      >
                        <Edit3 className="size-3.5" />
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
    </div>
  );
}
