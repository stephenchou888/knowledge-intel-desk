import { useMemo, useState } from "react";
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  Search,
  Trash2,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  JUDGE_META,
  PROVIDER_MAP,
  type CustomModelEndpoint,
  type JudgeKey,
  type RawIntelItem,
} from "../types/intel";

interface TriageSectionProps {
  items: RawIntelItem[];
  triageEndpoint: CustomModelEndpoint | null;
  verifyEndpoint: CustomModelEndpoint | null;
  isTriaging: boolean;
  isVerifying: boolean;
  onRunTriage: () => void;
  onRunVerify: () => void;
  onOpenEndpointsPage: () => void;
  onToggleSelect: (id: string, checked: boolean) => void;
  onSelectPreset: (mode: "all" | "none" | "high_value") => void;
  onRemoveItem: (id: string) => void;
  onClearItems: () => void;
}

type TriageFilter = "all" | "pending" | JudgeKey;

export function TriageSection({
  items,
  triageEndpoint,
  verifyEndpoint,
  isTriaging,
  isVerifying,
  onRunTriage,
  onRunVerify,
  onOpenEndpointsPage,
  onToggleSelect,
  onSelectPreset,
  onRemoveItem,
  onClearItems,
}: TriageSectionProps) {
  const [filter, setFilter] = useState<TriageFilter>("all");
  const isBusy = isTriaging || isVerifying;

  const selectedCount = useMemo(
    () => items.filter((i) => i.selected).length,
    [items]
  );

  const counts = useMemo(() => {
    const map: Record<TriageFilter, number> = {
      all: items.length,
      pending: 0,
      high_value_eng: 0,
      open_source_repo: 0,
      read_later: 0,
      noise_spam: 0,
    };
    for (const item of items) {
      if (item.judgeKey) {
        map[item.judgeKey] += 1;
      } else {
        map.pending += 1;
      }
    }
    return map;
  }, [items]);

  const filteredItems = useMemo(() => {
    if (filter === "all") return items;
    if (filter === "pending") return items.filter((i) => !i.judgeKey);
    return items.filter((i) => i.judgeKey === filter);
  }, [items, filter]);

  const filterTabs: Array<{ key: TriageFilter; label: string }> = [
    { key: "all", label: "全部" },
    { key: "high_value_eng", label: "高价值工程/AI" },
    { key: "open_source_repo", label: "开源项目/工具库" },
    { key: "read_later", label: "待稍后看" },
    { key: "noise_spam", label: "低质噪音" },
    { key: "pending", label: "未初筛" },
  ];

  return (
    <section id="triage" className="scroll-mt-20 space-y-4">
      <Card className="gap-0 overflow-hidden rounded-xl border border-border bg-card py-0 shadow-none ring-0">
        <CardHeader className="flex flex-col gap-3 border-b border-border px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-0.5">
            <h2 className="text-base font-semibold tracking-tight text-foreground">
              02. 电子判官初筛队列与深度核查触发
            </h2>
            <p className="text-xs text-muted-foreground">
              第一阶段初筛：
              {triageEndpoint ? (
                <span className="font-mono text-foreground/85">
                  [{(PROVIDER_MAP[triageEndpoint.provider] ?? PROVIDER_MAP.other).shortTag}] {triageEndpoint.modelId}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={onOpenEndpointsPage}
                  className="cursor-pointer font-medium text-amber-600 underline underline-offset-2 hover:text-amber-500 dark:text-amber-400"
                >
                  未配置（点击添加）
                </button>
              )}
              {" · "}第二阶段核查提取：
              {verifyEndpoint ? (
                <span className="font-mono text-foreground/85">
                  [{(PROVIDER_MAP[verifyEndpoint.provider] ?? PROVIDER_MAP.other).shortTag}] {verifyEndpoint.modelId}
                  {verifyEndpoint.protocol === "gemini" && verifyEndpoint.enableSearch
                    ? " + Search"
                    : ""}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={onOpenEndpointsPage}
                  className="cursor-pointer font-medium text-amber-600 underline underline-offset-2 hover:text-amber-500 dark:text-amber-400"
                >
                  未配置（点击添加）
                </button>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <Button
              type="button"
              disabled={isBusy || items.length === 0}
              onClick={onRunTriage}
              className="h-10 cursor-pointer gap-2 rounded-lg bg-amber-500 px-4 text-sm font-semibold text-neutral-950 shadow-sm transition-all duration-150 hover:bg-amber-400 active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-45 whitespace-nowrap shrink-0"
            >
              {isTriaging ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  <span>判官初筛中…</span>
                </>
              ) : (
                <>
                  <Zap className="size-4" aria-hidden="true" />
                  <span>⚡ 电子判官极速初筛</span>
                </>
              )}
            </Button>

            <Button
              type="button"
              disabled={isBusy || selectedCount === 0}
              onClick={onRunVerify}
              className="h-10 cursor-pointer gap-2 rounded-lg bg-foreground px-4 text-sm font-semibold text-background shadow-sm transition-all duration-150 hover:bg-foreground/90 active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-45 whitespace-nowrap shrink-0"
            >
              {isVerifying ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  <span>
                    {verifyEndpoint?.protocol === "gemini" && verifyEndpoint?.enableSearch
                      ? "联网核查提取中…"
                      : "深度核查提取中…"}
                  </span>
                </>
              ) : (
                <>
                  <Search className="size-4" aria-hidden="true" />
                  <span>🔍 深度核查与提取 ({selectedCount})</span>
                </>
              )}
            </Button>
          </div>
        </CardHeader>

        {/* Sub-toolbar: Filters + Bulk selection */}
        <div className="flex flex-col gap-3 border-b border-border bg-muted/25 px-5 py-2.5 md:flex-row md:items-center md:justify-between">
          <div
            role="tablist"
            aria-label="按判官标签筛选"
            className="flex flex-wrap items-center gap-1"
          >
            {filterTabs.map((tab) => {
              const active = filter === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setFilter(tab.key)}
                  className={`cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? "bg-background text-foreground shadow-xs ring-1 ring-border"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab.label}
                  <span className="ml-1 font-mono text-[11px] opacity-70 tabular-nums">
                    {counts[tab.key]}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              type="button"
              disabled={isBusy || items.length === 0}
              onClick={() => onSelectPreset("high_value")}
              className="cursor-pointer text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40 whitespace-nowrap shrink-0"
            >
              仅勾选高价值/开源
            </button>
            <span aria-hidden="true" className="text-border">
              ·
            </span>
            <button
              type="button"
              disabled={isBusy || items.length === 0}
              onClick={() => onSelectPreset("all")}
              className="cursor-pointer text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40 whitespace-nowrap shrink-0"
            >
              全选
            </button>
            <span aria-hidden="true" className="text-border">
              ·
            </span>
            <button
              type="button"
              disabled={isBusy || items.length === 0}
              onClick={() => onSelectPreset("none")}
              className="cursor-pointer text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40 whitespace-nowrap shrink-0"
            >
              取消全选
            </button>
            {items.length > 0 && (
              <>
                <span aria-hidden="true" className="text-border">
                  ·
                </span>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={onClearItems}
                  className="cursor-pointer text-rose-600 transition-colors hover:text-rose-500 disabled:opacity-40 dark:text-rose-400 whitespace-nowrap shrink-0"
                >
                  清空队列
                </button>
              </>
            )}
          </div>
        </div>

        <CardContent className="p-0">
          {filteredItems.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-muted-foreground">
              {items.length === 0
                ? "待筛队列为空。请在上方上传 .csv / .json / .md / .html 文件、粘贴单条推文，或点击「载入演示批次」。"
                : "当前筛选分类下暂无条目。"}
            </div>
          ) : (
            <div className="max-h-[420px] divide-y divide-border overflow-y-auto">
              {filteredItems.map((item, idx) => {
                const judgeMeta = item.judgeKey
                  ? JUDGE_META[item.judgeKey]
                  : null;
                const isNoise = item.judgeKey === "noise_spam";

                return (
                  <div
                    key={item.id}
                    className={`group flex items-start gap-3.5 px-5 py-3.5 transition-colors hover:bg-muted/30 ${
                      isNoise && !item.selected ? "opacity-60" : ""
                    }`}
                  >
                    <div className="pt-0.5">
                      <Checkbox
                        checked={item.selected}
                        disabled={isBusy}
                        onCheckedChange={(checked) =>
                          onToggleSelect(item.id, Boolean(checked))
                        }
                        aria-label={`勾选条目 ${idx + 1}`}
                      />
                    </div>

                    <div className="min-w-0 flex-1 space-y-1.5">
                      {/* Top line: Judge classification + metadata */}
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
                        <span className="font-mono text-muted-foreground tabular-nums">
                          #{String(idx + 1).padStart(2, "0")}
                        </span>

                        {item.judgeStatus === "judging" ? (
                          <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                            <Loader2 className="size-3 animate-spin" />
                            判官判定中…
                          </span>
                        ) : judgeMeta ? (
                          <span className={`font-semibold ${judgeMeta.textClass}`}>
                            {judgeMeta.bracketLabel}
                          </span>
                        ) : item.judgeStatus === "error" ? (
                          <span className="font-medium text-rose-600 dark:text-rose-400">
                            初筛异常：{item.judgeError}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">待判官初筛</span>
                        )}

                        {typeof item.judgeConfidence === "number" && (
                          <>
                            <span aria-hidden="true" className="text-border">
                              ·
                            </span>
                            <span className="font-mono text-muted-foreground tabular-nums">
                              置信度 {(item.judgeConfidence * 100).toFixed(1)}%
                            </span>
                          </>
                        )}

                        {typeof item.judgeDurationMs === "number" && (
                          <>
                            <span aria-hidden="true" className="text-border">
                              ·
                            </span>
                            <span className="font-mono text-muted-foreground tabular-nums">
                              {item.judgeDurationMs}ms
                            </span>
                          </>
                        )}

                        {item.verifyStatus === "verifying" && (
                          <>
                            <span aria-hidden="true" className="text-border">
                              ·
                            </span>
                            <span className="inline-flex items-center gap-1 font-medium text-sky-600 dark:text-sky-400">
                              <Loader2 className="size-3 animate-spin" />
                              核查提取中…
                            </span>
                          </>
                        )}

                        {item.verifyStatus === "done" && (
                          <>
                            <span aria-hidden="true" className="text-border">
                              ·
                            </span>
                            <span className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
                              <CheckCircle2 className="size-3" />
                              已提取 {item.verifiedCount ?? 1} 条入表
                            </span>
                          </>
                        )}

                        {item.verifyStatus === "error" && (
                          <>
                            <span aria-hidden="true" className="text-border">
                              ·
                            </span>
                            <span className="font-medium text-rose-600 dark:text-rose-400">
                              核查失败：{item.verifyError}
                            </span>
                          </>
                        )}
                      </div>

                      {/* Content preview */}
                      <p className="line-clamp-2 text-sm leading-relaxed text-foreground">
                        {item.content || item.xUrl || item.externalLinks[0]}
                      </p>

                      {/* Source & extracted links */}
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
                        <span>来源：{item.sourceFile}</span>
                        {item.author && (
                          <>
                            <span aria-hidden="true" className="text-border">
                              ·
                            </span>
                            <span className="font-mono">{item.author}</span>
                          </>
                        )}
                        {item.timestamp && (
                          <>
                            <span aria-hidden="true" className="text-border">
                              ·
                            </span>
                            <span className="font-mono tabular-nums">
                              {item.timestamp}
                            </span>
                          </>
                        )}
                        {item.xUrl && (
                          <>
                            <span aria-hidden="true" className="text-border">
                              ·
                            </span>
                            <a
                              href={item.xUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-foreground/75 hover:text-foreground hover:underline"
                            >
                              X 原贴
                              <ExternalLink className="size-3" />
                            </a>
                          </>
                        )}
                        {item.externalLinks.slice(0, 2).map((link) => (
                          <a
                            key={link}
                            href={link}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex max-w-[260px] items-center gap-1 truncate font-mono text-[11px] text-sky-600 hover:underline dark:text-sky-400"
                          >
                            {link.replace(/^https?:\/\//, "")}
                            <ExternalLink className="size-2.5 shrink-0" />
                          </a>
                        ))}
                        {item.externalLinks.length > 2 && (
                          <span className="font-mono text-[11px]">
                            +{item.externalLinks.length - 2} 外链
                          </span>
                        )}
                      </div>
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={isBusy}
                      onClick={() => onRemoveItem(item.id)}
                      aria-label="删除该条目"
                      className="shrink-0 text-muted-foreground opacity-50 transition-opacity hover:text-destructive group-hover:opacity-100"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
