import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Moon, Plug, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CustomEndpointsPage } from "./components/CustomEndpointsPage";
import { ImportSection } from "./components/ImportSection";
import { KnowledgeTable } from "./components/KnowledgeTable";
import { PipelineStatusBar } from "./components/PipelineStatusBar";
import { TriageSection } from "./components/TriageSection";
import {
  deduplicateRecordList,
  formatRecordId,
  getTodayStrings,
  serializeRecordsToCsv,
  serializeRecordsToExportJson,
  triggerFileDownload,
} from "./lib/exportUtils";
import {
  createDemoIntelBatch,
  parsePastedInput,
  parseUploadedFile,
} from "./lib/fileParser";
import {
  DEFAULT_JUDGE_RULES,
  DEFAULT_MODEL_ROUTING,
  PROVIDER_MAP,
  type GroundingSource,
  type JudgeKey,
  type KnowledgeCategory,
  type KnowledgeRecord,
  type ModelRoutingConfig,
  type PipelineLogEntry,
  type RawIntelItem,
  type VerifyVerdict,
} from "./types/intel";

const STORAGE_KEYS = {
  theme: "x_intel_theme_v1",
  judgeRules: "x_intel_judge_rules_v1",
  records: "x_intel_knowledge_records_v1",
  modelRouting: "x_intel_custom_endpoints_v1",
};

function nowTimeStr(): string {
  return new Date().toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function loadJsonStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export default function App() {
  const [activeView, setActiveView] = useState<"workbench" | "endpoints">(
    "workbench"
  );

  // Dual-theme state (Geek Dark mode default, persisted)
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.theme);
      return saved === "light" ? "light" : "dark";
    } catch {
      return "dark";
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    try {
      localStorage.setItem(STORAGE_KEYS.theme, theme);
    } catch {
      // ignore
    }
  }, [theme]);

  const [judgeRules, setJudgeRules] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_KEYS.judgeRules) || DEFAULT_JUDGE_RULES;
    } catch {
      return DEFAULT_JUDGE_RULES;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.judgeRules, judgeRules);
    } catch {
      // ignore
    }
  }, [judgeRules]);

  const [modelRouting, setModelRouting] = useState<ModelRoutingConfig>(() => {
    const saved = loadJsonStorage<Partial<ModelRoutingConfig>>(
      STORAGE_KEYS.modelRouting,
      DEFAULT_MODEL_ROUTING
    );
    return {
      endpoints: Array.isArray(saved.endpoints) ? saved.endpoints : [],
      triageEndpointId:
        typeof saved.triageEndpointId === "string" ? saved.triageEndpointId : "",
      verifyEndpointId:
        typeof saved.verifyEndpointId === "string" ? saved.verifyEndpointId : "",
    };
  });

  const handleChangeRouting = useCallback((next: ModelRoutingConfig) => {
    setModelRouting(next);
    try {
      localStorage.setItem(STORAGE_KEYS.modelRouting, JSON.stringify(next));
    } catch {
      // ignore
    }
  }, []);

  const triageEndpoint = useMemo(
    () =>
      modelRouting.endpoints.find(
        (e) => e.id === modelRouting.triageEndpointId
      ) ?? null,
    [modelRouting]
  );

  const verifyEndpoint = useMemo(
    () =>
      modelRouting.endpoints.find(
        (e) => e.id === modelRouting.verifyEndpointId
      ) ?? null,
    [modelRouting]
  );

  const [items, setItems] = useState<RawIntelItem[]>([]);
  const [records, setRecords] = useState<KnowledgeRecord[]>(() =>
    loadJsonStorage<KnowledgeRecord[]>(STORAGE_KEYS.records, [])
  );

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.records, JSON.stringify(records));
    } catch {
      // ignore
    }
  }, [records]);

  const [isTriaging, setIsTriaging] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [activeProgressLabel, setActiveProgressLabel] = useState<string | null>(
    null
  );
  const [progressCurrent, setProgressCurrent] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);
  const [logs, setLogs] = useState<PipelineLogEntry[]>([]);

  const appendLog = useCallback(
    (
      stage: PipelineLogEntry["stage"],
      level: PipelineLogEntry["level"],
      message: string
    ) => {
      const entry: PipelineLogEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        time: nowTimeStr(),
        stage,
        level,
        message,
      };
      setLogs((prev) => [entry, ...prev].slice(0, 120));
    },
    []
  );

  // KPI metrics (100% live from real state)
  const kpiStats = useMemo(() => {
    const totalImported = items.length;
    const blockedNoise = items.filter((i) => i.judgeKey === "noise_spam").length;
    const verifiedTotal = records.length;
    const confirmedCount = records.filter((r) => r.verdict === "✅ 属实").length;
    const caveatCount = records.filter(
      (r) => r.verdict === "⚠️ 部分夸大或有隐藏短板"
    ).length;
    return {
      totalImported,
      blockedNoise,
      verifiedTotal,
      confirmedCount,
      caveatCount,
    };
  }, [items, records]);

  // Stage 0: Multi-file upload & intelligent parser
  const handleFilesSelected = useCallback(
    async (fileList: FileList | File[]) => {
      const files = Array.from(fileList);
      if (files.length === 0) return;

      const imported: RawIntelItem[] = [];
      for (const file of files) {
        try {
          const parsed = await parseUploadedFile(file);
          imported.push(...parsed);
          appendLog(
            "解析",
            parsed.length > 0 ? "success" : "warn",
            `文件 ${file.name} 解析完成，提取 ${parsed.length} 条独立情报。`
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : "解析异常";
          appendLog("解析", "error", `文件 ${file.name} 解析失败：${msg}`);
        }
      }

      if (imported.length > 0) {
        setItems((prev) => [...imported, ...prev]);
      }
    },
    [appendLog]
  );

  const handlePasteSubmit = useCallback(
    (rawText: string) => {
      const parsed = parsePastedInput(rawText);
      if (parsed.length === 0) return;
      setItems((prev) => [...parsed, ...prev]);
      appendLog(
        "解析",
        "success",
        `已解析手动粘贴内容，新增 ${parsed.length} 条进入待筛队列。`
      );
    },
    [appendLog]
  );

  const handleLoadDemo = useCallback(() => {
    const batch = createDemoIntelBatch();
    setItems((prev) => [...batch, ...prev]);
    appendLog(
      "解析",
      "info",
      `已载入 ${batch.length} 条演示情报（含多仓库 Agent 贴、开源工具贴与 2 条噪音/日常贴）。`
    );
  }, [appendLog]);

  // Stage 1: Electronic Judge batch triage via user's custom endpoint
  const handleRunTriage = useCallback(async () => {
    if (items.length === 0 || isTriaging || isVerifying) return;
    if (!triageEndpoint) {
      appendLog(
        "接口",
        "warn",
        "尚未绑定第一阶段决策初筛接口，已为您跳转至「自定义接口」配置页面。"
      );
      setActiveView("endpoints");
      return;
    }

    const targetItems = [...items];
    const providerTag = (PROVIDER_MAP[triageEndpoint.provider] ?? PROVIDER_MAP.other).shortTag;
    setIsTriaging(true);
    setActiveProgressLabel(
      `第一阶段：电子判官初筛 ([${providerTag}] ${triageEndpoint.modelId})`
    );
    setProgressCurrent(0);
    setProgressTotal(targetItems.length);
    appendLog(
      "判官",
      "info",
      `启动电子判官极速初筛（[${providerTag}] ${triageEndpoint.name} · ${triageEndpoint.modelId}），共 ${targetItems.length} 条待判定……`
    );

    const BATCH_SIZE = 4;
    let completed = 0;
    let noiseBlocked = 0;
    let keptCount = 0;

    try {
      for (let i = 0; i < targetItems.length; i += BATCH_SIZE) {
        const chunk = targetItems.slice(i, i + BATCH_SIZE);
        const chunkIds = new Set(chunk.map((c) => c.id));

        setItems((prev) =>
          prev.map((it) =>
            chunkIds.has(it.id)
              ? { ...it, judgeStatus: "judging", judgeError: undefined }
              : it
          )
        );

        const res = await fetch("/api/triage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            endpoint: triageEndpoint,
            customRules: judgeRules,
            items: chunk.map((c) => ({
              id: c.id,
              content: c.content,
              author: c.author,
              xUrl: c.xUrl,
              externalLinks: c.externalLinks,
            })),
          }),
        });

        const payload = (await res.json().catch(() => ({}))) as {
          error?: string;
          results?: Array<{
            id: string;
            judgeKey?: JudgeKey;
            judgeLabel?: string;
            defaultSelected?: boolean;
            confidence?: number;
            durationMs?: number;
            error?: string;
          }>;
        };

        if (!res.ok) {
          throw new Error(payload.error || `HTTP ${res.status}`);
        }

        const resultMap = new Map(
          (payload.results ?? []).map((r) => [r.id, r])
        );

        setItems((prev) =>
          prev.map((it) => {
            const match = resultMap.get(it.id);
            if (!match) return it;
            if (match.error || !match.judgeKey) {
              return {
                ...it,
                judgeStatus: "error",
                judgeError: match.error || "判定失败",
              };
            }
            return {
              ...it,
              judgeStatus: "done",
              judgeKey: match.judgeKey,
              judgeLabel: match.judgeLabel,
              judgeConfidence: match.confidence,
              judgeDurationMs: match.durationMs,
              selected: Boolean(match.defaultSelected),
            };
          })
        );

        for (const r of payload.results ?? []) {
          completed += 1;
          if (r.error) {
            appendLog("判官", "error", `条目判定失败：${r.error}`);
          } else if (r.judgeKey === "noise_spam") {
            noiseBlocked += 1;
            appendLog(
              "判官",
              "warn",
              `拦截噪音 → 【${r.judgeLabel}】 (${((r.confidence ?? 0) * 100).toFixed(1)}% · ${r.durationMs ?? 0}ms)`
            );
          } else {
            if (r.defaultSelected) keptCount += 1;
            appendLog(
              "判官",
              "success",
              `判定完成 → 【${r.judgeLabel}】 (${((r.confidence ?? 0) * 100).toFixed(1)}% · ${r.durationMs ?? 0}ms)`
            );
          }
        }

        setProgressCurrent(completed);
      }

      appendLog(
        "判官",
        "success",
        `初筛全部结束：保留勾选 ${keptCount} 条高价值/开源情报，自动拦截 ${noiseBlocked} 条低质噪音。`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "判官初筛异常中断";
      appendLog("判官", "error", `批量初筛中止：${msg}`);
      setItems((prev) =>
        prev.map((it) =>
          it.judgeStatus === "judging"
            ? { ...it, judgeStatus: "error", judgeError: msg }
            : it
        )
      );
    } finally {
      setIsTriaging(false);
      setActiveProgressLabel(null);
    }
  }, [items, isTriaging, isVerifying, triageEndpoint, judgeRules, appendLog]);

  // Stage 2: Deep Fact-Checking & 11-column Structured Extraction via user's custom endpoint
  const handleRunVerify = useCallback(async () => {
    const targets = items.filter((i) => i.selected);
    if (targets.length === 0 || isTriaging || isVerifying) return;
    if (!verifyEndpoint) {
      appendLog(
        "接口",
        "warn",
        "尚未绑定第二阶段核查提取接口，已为您跳转至「自定义接口」配置页面。"
      );
      setActiveView("endpoints");
      return;
    }

    const providerTag = (PROVIDER_MAP[verifyEndpoint.provider] ?? PROVIDER_MAP.other).shortTag;
    setIsVerifying(true);
    setActiveProgressLabel(
      `第二阶段：核查与 11 列提取 ([${providerTag}] ${verifyEndpoint.modelId})`
    );
    setProgressCurrent(0);
    setProgressTotal(targets.length);

    const { dateDash, dateCompact } = getTodayStrings();
    const existingTodayMax = records.reduce((maxSeq, rec) => {
      const match = rec.recordId.match(new RegExp(`^${dateCompact}-(\\d+)$`));
      if (match) {
        const num = Number.parseInt(match[1], 10);
        if (!Number.isNaN(num) && num > maxSeq) return num;
      }
      return maxSeq;
    }, 0);
    let nextSeq = existingTodayMax + 1;

    appendLog(
      "核查",
      "info",
      `开始对勾选的 ${targets.length} 条高价值情报执行核查（[${providerTag}] ${verifyEndpoint.name} · ${verifyEndpoint.modelId}）……`
    );

    let completed = 0;
    let totalExtracted = 0;

    try {
      for (const target of targets) {
        setItems((prev) =>
          prev.map((it) =>
            it.id === target.id
              ? { ...it, verifyStatus: "verifying", verifyError: undefined }
              : it
          )
        );

        try {
          const res = await fetch("/api/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              endpoint: verifyEndpoint,
              item: {
                id: target.id,
                content: target.content,
                author: target.author,
                timestamp: target.timestamp,
                xUrl: target.xUrl,
                externalLinks: target.externalLinks,
                judgeLabel: target.judgeLabel,
              },
            }),
          });

          const payload = (await res.json().catch(() => ({}))) as {
            error?: string;
            durationMs?: number;
            sources?: GroundingSource[];
            records?: Array<{
              category: KnowledgeCategory;
              coreTopic: string;
              verdict: VerifyVerdict;
              projectOrTool: string;
              factCheckAndCaveats: string;
              reusableMethodology: string;
              keywords: string;
              xUrl: string;
              repoUrl: string;
            }>;
          };

          if (!res.ok) {
            throw new Error(payload.error || `HTTP ${res.status}`);
          }

          const rawRows = payload.records ?? [];
          const sources = payload.sources ?? [];
          const builtRecords: KnowledgeRecord[] = rawRows.map((row) => {
            const idStr = formatRecordId(dateCompact, nextSeq);
            nextSeq += 1;
            return {
              uid: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              sourceItemId: target.id,
              recordId: idStr,
              collectedDate: dateDash,
              category: row.category,
              coreTopic: row.coreTopic,
              verdict: row.verdict,
              projectOrTool: row.projectOrTool,
              factCheckAndCaveats: row.factCheckAndCaveats,
              reusableMethodology: row.reusableMethodology,
              keywords: row.keywords,
              xUrl: row.xUrl,
              repoUrl: row.repoUrl,
              groundingSources: sources,
            };
          });

          totalExtracted += builtRecords.length;
          setRecords((prev) => [...prev, ...builtRecords]);

          setItems((prev) =>
            prev.map((it) =>
              it.id === target.id
                ? {
                    ...it,
                    verifyStatus: "done",
                    verifiedCount: builtRecords.length,
                  }
                : it
            )
          );

          const splitNote =
            builtRecords.length > 1
              ? `（检测到多项目，已自动拆分为 ${builtRecords.length} 行）`
              : "";
          appendLog(
            "核查",
            "success",
            `核查入表 ${builtRecords.map((r) => `${r.recordId}「${r.coreTopic}」`).join(" / ")}${splitNote} · ${payload.durationMs ?? 0}ms`
          );
        } catch (itemErr) {
          const msg =
            itemErr instanceof Error ? itemErr.message : "单条核查失败";
          setItems((prev) =>
            prev.map((it) =>
              it.id === target.id
                ? { ...it, verifyStatus: "error", verifyError: msg }
                : it
            )
          );
          appendLog("核查", "error", `条目核查失败：${msg}`);
        }

        completed += 1;
        setProgressCurrent(completed);
      }

      appendLog(
        "核查",
        "success",
        `第二阶段结束：共处理 ${completed} 条情报，生成 ${totalExtracted} 条标准 11 列结构化记录。`
      );
    } finally {
      setIsVerifying(false);
      setActiveProgressLabel(null);
    }
  }, [items, isTriaging, isVerifying, records, verifyEndpoint, appendLog]);

  // Stage 3: Deduplicate by X URL + Repo URL
  const handleDeduplicate = useCallback(() => {
    const { uniqueRecords, removedCount } = deduplicateRecordList(records);
    if (removedCount === 0) {
      appendLog("导出", "info", "链接去重检查完成：当前表格中没有重复记录。");
      return;
    }
    setRecords(uniqueRecords);
    appendLog(
      "导出",
      "success",
      `按「推特X链接 + 仓库/项目链接」去重完成，已清理 ${removedCount} 条重复记录，剩余 ${uniqueRecords.length} 条。`
    );
  }, [records, appendLog]);

  const handleExportCsv = useCallback(
    (targetRecords: KnowledgeRecord[]) => {
      if (targetRecords.length === 0) return;
      const { dateCompact } = getTodayStrings();
      const csv = serializeRecordsToCsv(targetRecords, {
        includeHeader: true,
        withBom: true,
      });
      triggerFileDownload(
        csv,
        `知识库信息核查_${dateCompact}.csv`,
        "text/csv;charset=utf-8"
      );
      appendLog(
        "导出",
        "success",
        `已下载标准 11 列 CSV 文件（共 ${targetRecords.length} 条，UTF-8 BOM，可直接导入 Google Sheets）。`
      );
    },
    [appendLog]
  );

  const handleExportJson = useCallback(
    (targetRecords: KnowledgeRecord[]) => {
      if (targetRecords.length === 0) return;
      const { dateCompact } = getTodayStrings();
      const json = serializeRecordsToExportJson(targetRecords);
      triggerFileDownload(
        json,
        `知识库信息核查_${dateCompact}.json`,
        "application/json;charset=utf-8"
      );
      appendLog(
        "导出",
        "success",
        `已导出标准 11 列 JSON 备份（共 ${targetRecords.length} 条）。`
      );
    },
    [appendLog]
  );

  const handleAddManualRecord = useCallback(() => {
    const { dateDash, dateCompact } = getTodayStrings();
    const maxSeq = records.reduce((max, r) => {
      const m = r.recordId.match(new RegExp(`^${dateCompact}-(\\d+)$`));
      if (m) {
        const n = Number.parseInt(m[1], 10);
        if (!Number.isNaN(n) && n > max) return n;
      }
      return max;
    }, 0);

    const newRow: KnowledgeRecord = {
      uid: `manual-${Date.now()}`,
      sourceItemId: "manual",
      recordId: formatRecordId(dateCompact, maxSeq + 1),
      collectedDate: dateDash,
      category: "AI开发与Agent",
      coreTopic: "点击微调核心主题",
      verdict: "✅ 属实",
      projectOrTool: "",
      factCheckAndCaveats: "",
      reusableMethodology: "",
      keywords: "",
      xUrl: "",
      repoUrl: "",
    };
    setRecords((prev) => [...prev, newRow]);
  }, [records]);

  const navigateToSection = useCallback((sectionId?: string) => {
    setActiveView("workbench");
    if (!sectionId) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document
          .getElementById(sectionId)
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }, []);

  const isBusy = isTriaging || isVerifying;

  return (
    <div className="min-h-screen bg-background text-foreground transition-colors duration-150">
      {/* Top Bar: Clean 3-Zone Header */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex h-15 max-w-[1400px] items-center justify-between gap-8 px-4 sm:px-6">
          <button
            type="button"
            onClick={() => navigateToSection()}
            className="cursor-pointer text-base font-bold tracking-tight text-foreground whitespace-nowrap shrink-0"
          >
            知识库信息核查
          </button>

          <nav
            aria-label="主导航"
            className="hidden items-center gap-6 text-sm text-muted-foreground md:flex"
          >
            <button
              type="button"
              onClick={() => navigateToSection()}
              className={`cursor-pointer transition-colors hover:text-foreground whitespace-nowrap shrink-0 ${
                activeView === "workbench" ? "font-medium text-foreground" : ""
              }`}
            >
              核查工作台
            </button>
            <button
              type="button"
              onClick={() => navigateToSection("import")}
              className="cursor-pointer transition-colors hover:text-foreground whitespace-nowrap shrink-0"
            >
              批量导入
            </button>
            <button
              type="button"
              onClick={() => navigateToSection("triage")}
              className="cursor-pointer transition-colors hover:text-foreground whitespace-nowrap shrink-0"
            >
              电子判官
            </button>
            <button
              type="button"
              onClick={() => navigateToSection("knowledge")}
              className="cursor-pointer transition-colors hover:text-foreground whitespace-nowrap shrink-0"
            >
              CSV 导出表
            </button>
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
              aria-label={theme === "dark" ? "切换浅色模式" : "切换深色模式"}
              title={theme === "dark" ? "切换浅色模式" : "切换深色模式"}
              className="size-9 text-muted-foreground hover:text-foreground"
            >
              {theme === "dark" ? (
                <Sun className="size-4" />
              ) : (
                <Moon className="size-4" />
              )}
            </Button>

            <Button
              type="button"
              variant={activeView === "endpoints" ? "default" : "outline"}
              size="sm"
              onClick={() =>
                setActiveView((v) => (v === "endpoints" ? "workbench" : "endpoints"))
              }
              className="h-9 gap-1.5 px-3 text-xs font-medium whitespace-nowrap shrink-0"
            >
              <Plug className="size-3.5" aria-hidden="true" />
              <span>自定义接口</span>
              <span className="font-mono text-[11px] opacity-80">
                ({modelRouting.endpoints.length})
              </span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        {activeView === "endpoints" ? (
          <CustomEndpointsPage
            routing={modelRouting}
            onChangeRouting={handleChangeRouting}
            onBack={() => setActiveView("workbench")}
            onLog={(level, message) => appendLog("接口", level, message)}
          />
        ) : (
          <>
            {/* Subtle onboarding prompt when user hasn't added any custom endpoint yet */}
            {modelRouting.endpoints.length === 0 && (
              <div className="flex flex-col items-start justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-5 py-3.5 sm:flex-row sm:items-center">
                <div className="space-y-0.5">
                  <p className="text-xs font-semibold text-foreground">
                    尚未添加自定义模型接口
                  </p>
                  <p className="text-xs text-muted-foreground">
                    系统不预设固定模型 API。请先前往自定义接口页面添加 JEV、OpenAI、Gemini、Claude、DeepSeek、GLM、Kimi、腾讯混元或其它兼容接口。
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setActiveView("endpoints")}
                  className="h-8 gap-1.5 px-3 text-xs font-medium shrink-0"
                >
                  去添加接口
                  <ArrowRight className="size-3.5" aria-hidden="true" />
                </Button>
              </div>
            )}

            {/* Top Real-Time KPI Dashboard Strip */}
            <section
              aria-label="实时数据看板"
              className="grid grid-cols-1 gap-4 sm:grid-cols-3"
            >
              <div className="rounded-xl border border-border bg-card px-5 py-4">
                <p className="text-xs font-medium text-muted-foreground">
                  导入总条数
                </p>
                <div className="mt-1.5 flex items-baseline justify-between gap-2">
                  <span className="font-mono text-2xl font-bold tracking-tight text-foreground tabular-nums">
                    {kpiStats.totalImported}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground tabular-nums">
                    已勾选 {items.filter((i) => i.selected).length} 条
                  </span>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card px-5 py-4">
                <p className="text-xs font-medium text-muted-foreground">
                  判官拦截噪音数
                </p>
                <div className="mt-1.5 flex items-baseline justify-between gap-2">
                  <span className="font-mono text-2xl font-bold tracking-tight text-rose-600 tabular-nums dark:text-rose-400">
                    {kpiStats.blockedNoise}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground tabular-nums">
                    拦截率{" "}
                    {kpiStats.totalImported > 0
                      ? `${((kpiStats.blockedNoise / kpiStats.totalImported) * 100).toFixed(0)}%`
                      : "0%"}
                  </span>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card px-5 py-4">
                <p className="text-xs font-medium text-muted-foreground">
                  已核查入库数
                </p>
                <div className="mt-1.5 flex items-baseline justify-between gap-2">
                  <span className="font-mono text-2xl font-bold tracking-tight text-emerald-600 tabular-nums dark:text-emerald-400">
                    {kpiStats.verifiedTotal}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground tabular-nums">
                    属实 {kpiStats.confirmedCount} · 短板 {kpiStats.caveatCount}
                  </span>
                </div>
              </div>
            </section>

            {/* Smooth Live Progress Bar & Real-Time Geek Logs */}
            <PipelineStatusBar
              activeLabel={activeProgressLabel}
              progressCurrent={progressCurrent}
              progressTotal={progressTotal}
              logs={logs}
              onClearLogs={() => setLogs([])}
            />

            {/* Stage 0 & Rules: Multi-Format File Upload, Smart Parser & Judge Custom Criteria */}
            <ImportSection
              judgeRules={judgeRules}
              onJudgeRulesChange={setJudgeRules}
              onFilesSelected={handleFilesSelected}
              onPasteSubmit={handlePasteSubmit}
              onLoadDemo={handleLoadDemo}
              isBusy={isBusy}
            />

            {/* Stage 1 & 2: Electronic Judge Triage Queue & Deep Fact-Check Trigger */}
            <TriageSection
              items={items}
              triageEndpoint={triageEndpoint}
              verifyEndpoint={verifyEndpoint}
              isTriaging={isTriaging}
              isVerifying={isVerifying}
              onRunTriage={handleRunTriage}
              onRunVerify={handleRunVerify}
              onOpenEndpointsPage={() => setActiveView("endpoints")}
              onToggleSelect={(id, checked) =>
                setItems((prev) =>
                  prev.map((it) => (it.id === id ? { ...it, selected: checked } : it))
                )
              }
              onSelectPreset={(mode) =>
                setItems((prev) =>
                  prev.map((it) => {
                    if (mode === "all") return { ...it, selected: true };
                    if (mode === "none") return { ...it, selected: false };
                    return {
                      ...it,
                      selected:
                        it.judgeKey === "high_value_eng" ||
                        it.judgeKey === "open_source_repo",
                    };
                  })
                )
              }
              onRemoveItem={(id) =>
                setItems((prev) => prev.filter((it) => it.id !== id))
              }
              onClearItems={() => setItems([])}
            />

            {/* Stage 3: Editable 11-Column Knowledge Base Table, CSV Direct Preview & Export */}
            <KnowledgeTable
              records={records}
              onUpdateRecord={(uid, field, value) =>
                setRecords((prev) =>
                  prev.map((r) => (r.uid === uid ? { ...r, [field]: value } : r))
                )
              }
              onDeleteRecord={(uid) =>
                setRecords((prev) => prev.filter((r) => r.uid !== uid))
              }
              onAddManualRecord={handleAddManualRecord}
              onDeduplicate={handleDeduplicate}
              onExportCsv={handleExportCsv}
              onExportJson={handleExportJson}
              onCopySuccess={(msg) => appendLog("导出", "success", msg)}
              onClearRecords={() => setRecords([])}
            />
          </>
        )}
      </main>

      <footer className="mt-12 border-t border-border">
        <div className="mx-auto flex max-w-[1400px] flex-col items-start justify-between gap-2 px-4 py-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:px-6">
          <span>知识库信息核查 · 本地安全去重与 11 列 CSV / Google Sheets 直出</span>
          <span className="font-mono">
            初筛：{triageEndpoint ? `${triageEndpoint.name} (${triageEndpoint.modelId})` : "未绑定"} · 核查：
            {verifyEndpoint ? `${verifyEndpoint.name} (${verifyEndpoint.modelId})` : "未绑定"}
          </span>
        </div>
      </footer>
    </div>
  );
}
