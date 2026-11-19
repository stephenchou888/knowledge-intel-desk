import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ClipboardCopy,
  Code2,
  Download,
  ExternalLink,
  FilterX,
  Plus,
  Search,
  Table2,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { serializeRecordsToCsv, serializeRecordsToTsv } from "../lib/exportUtils";
import {
  KNOWLEDGE_CATEGORIES,
  VERIFY_VERDICTS,
  type KnowledgeCategory,
  type KnowledgeRecord,
  type VerifyVerdict,
} from "../types/intel";

interface KnowledgeTableProps {
  records: KnowledgeRecord[];
  onUpdateRecord: (
    uid: string,
    field: keyof KnowledgeRecord,
    value: string
  ) => void;
  onDeleteRecord: (uid: string) => void;
  onAddManualRecord: () => void;
  onDeduplicate: () => void;
  onExportCsv: (targetRecords: KnowledgeRecord[]) => void;
  onExportJson: (targetRecords: KnowledgeRecord[]) => void;
  onCopySuccess: (message: string) => void;
  onClearRecords: () => void;
}

type EditableField =
  | "recordId"
  | "collectedDate"
  | "category"
  | "coreTopic"
  | "verdict"
  | "projectOrTool"
  | "factCheckAndCaveats"
  | "reusableMethodology"
  | "keywords"
  | "xUrl"
  | "repoUrl";

export function KnowledgeTable({
  records,
  onUpdateRecord,
  onDeleteRecord,
  onAddManualRecord,
  onDeduplicate,
  onExportCsv,
  onExportJson,
  onCopySuccess,
  onClearRecords,
}: KnowledgeTableProps) {
  const [viewMode, setViewMode] = useState<"table" | "csv">("table");
  const [includeHeaderOnCopy, setIncludeHeaderOnCopy] = useState(false);
  const [copiedMode, setCopiedMode] = useState<"tsv" | "csv" | null>(null);
  const [verdictFilter, setVerdictFilter] = useState<"all" | VerifyVerdict>(
    "all"
  );
  const [categoryFilter, setCategoryFilter] = useState<
    "all" | KnowledgeCategory
  >("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [editingCell, setEditingCell] = useState<{
    uid: string;
    field: EditableField;
  } | null>(null);
  const [draftValue, setDraftValue] = useState("");

  const filteredRecords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return records.filter((rec) => {
      if (verdictFilter !== "all" && rec.verdict !== verdictFilter) return false;
      if (categoryFilter !== "all" && rec.category !== categoryFilter)
        return false;
      if (!q) return true;
      return [
        rec.recordId,
        rec.coreTopic,
        rec.projectOrTool,
        rec.factCheckAndCaveats,
        rec.reusableMethodology,
        rec.keywords,
        rec.xUrl,
        rec.repoUrl,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [records, verdictFilter, categoryFilter, searchQuery]);

  const generatedCsvPreview = useMemo(
    () =>
      serializeRecordsToCsv(filteredRecords, {
        includeHeader: includeHeaderOnCopy,
        withBom: false,
      }),
    [filteredRecords, includeHeaderOnCopy]
  );

  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const flashCopiedMode = (mode: "tsv" | "csv") => {
    if (copyTimerRef.current !== null) {
      window.clearTimeout(copyTimerRef.current);
    }
    setCopiedMode(mode);
    copyTimerRef.current = window.setTimeout(() => {
      setCopiedMode(null);
      copyTimerRef.current = null;
    }, 2000);
  };

  const handleCopyTsvForSheets = async () => {
    if (filteredRecords.length === 0) return;
    const tsv = serializeRecordsToTsv(filteredRecords, includeHeaderOnCopy);
    try {
      await navigator.clipboard.writeText(tsv);
      flashCopiedMode("tsv");
      onCopySuccess(
        `已复制 ${filteredRecords.length} 行表格数据（TSV 制表符格式${includeHeaderOnCopy ? "，含表头" : "，不含表头"}），可直接在 Google Sheets 空白行按 Ctrl/⌘+V 粘贴自动分列。`
      );
    } catch {
      onCopySuccess("剪贴板写入受限，请切换至「CSV 文本视图」手动全选复制。");
    }
  };

  const handleCopyRawCsv = async () => {
    if (filteredRecords.length === 0) return;
    try {
      await navigator.clipboard.writeText(generatedCsvPreview);
      flashCopiedMode("csv");
      onCopySuccess(
        `已复制 ${filteredRecords.length} 行标准 CSV 原文（${includeHeaderOnCopy ? "含表头" : "不含表头"}）。`
      );
    } catch {
      onCopySuccess("剪贴板写入受限，请直接在下方文本框中手动全选复制。");
    }
  };

  const startEdit = (rec: KnowledgeRecord, field: EditableField) => {
    setEditingCell({ uid: rec.uid, field });
    setDraftValue(String(rec[field] ?? ""));
  };

  const commitEdit = () => {
    if (!editingCell) return;
    onUpdateRecord(editingCell.uid, editingCell.field, draftValue.trim());
    setEditingCell(null);
  };

  const cancelEdit = () => {
    setEditingCell(null);
  };

  const verdictTextClass = (v: VerifyVerdict) => {
    if (v === "✅ 属实") return "text-emerald-700 dark:text-emerald-400";
    if (v === "⚠️ 部分夸大或有隐藏短板")
      return "text-amber-700 dark:text-amber-400";
    return "text-rose-700 dark:text-rose-400";
  };

  const categoryTextClass = (c: KnowledgeCategory) => {
    if (c === "AI开发与Agent") return "text-emerald-700 dark:text-emerald-400";
    if (c === "工程与效率工具") return "text-sky-700 dark:text-sky-400";
    if (c === "3D与多模态创作") return "text-violet-700 dark:text-violet-400";
    return "text-amber-700 dark:text-amber-400";
  };

  const renderEditableCell = (
    rec: KnowledgeRecord,
    field: EditableField,
    options?: {
      multiline?: boolean;
      mono?: boolean;
      isUrl?: boolean;
      placeholder?: string;
    }
  ) => {
    const isEditing =
      editingCell?.uid === rec.uid && editingCell?.field === field;
    const val = String(rec[field] ?? "");

    if (isEditing) {
      if (field === "category") {
        return (
          <select
            autoFocus
            value={draftValue}
            onChange={(e) => {
              const next = e.target.value;
              setDraftValue(next);
              onUpdateRecord(rec.uid, field, next);
              setEditingCell(null);
            }}
            onBlur={cancelEdit}
            className="h-8 w-full min-w-[132px] rounded-md border border-ring bg-background px-2 text-xs text-foreground outline-none"
          >
            {KNOWLEDGE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        );
      }

      if (field === "verdict") {
        return (
          <select
            autoFocus
            value={draftValue}
            onChange={(e) => {
              const next = e.target.value;
              setDraftValue(next);
              onUpdateRecord(rec.uid, field, next);
              setEditingCell(null);
            }}
            onBlur={cancelEdit}
            className="h-8 w-full min-w-[168px] rounded-md border border-ring bg-background px-2 text-xs text-foreground outline-none"
          >
            {VERIFY_VERDICTS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        );
      }

      if (options?.multiline) {
        return (
          <textarea
            autoFocus
            rows={4}
            value={draftValue}
            onChange={(e) => setDraftValue(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (e.key === "Escape") cancelEdit();
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") commitEdit();
            }}
            className="w-full min-w-[240px] rounded-md border border-ring bg-background p-2 text-xs leading-relaxed text-foreground outline-none"
          />
        );
      }

      return (
        <input
          autoFocus
          type="text"
          value={draftValue}
          onChange={(e) => setDraftValue(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitEdit();
            if (e.key === "Escape") cancelEdit();
          }}
          className={`h-8 w-full min-w-[120px] rounded-md border border-ring bg-background px-2 text-xs text-foreground outline-none ${
            options?.mono ? "font-mono" : ""
          }`}
        />
      );
    }

    if (options?.isUrl) {
      return (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => startEdit(rec, field)}
            title={val || "点击填写纯净 URL"}
            className="max-w-[175px] cursor-text truncate text-left font-mono text-[11px] text-sky-700 hover:underline dark:text-sky-400"
          >
            {val ? (
              val.replace(/^https?:\/\//, "")
            ) : (
              <span className="text-muted-foreground/60">点击补充</span>
            )}
          </button>
          {val && /^https?:\/\//i.test(val) && (
            <a
              href={val}
              target="_blank"
              rel="noreferrer"
              aria-label="在新窗口打开链接"
              className="shrink-0 text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="size-3" />
            </a>
          )}
        </div>
      );
    }

    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => startEdit(rec, field)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            startEdit(rec, field);
          }
        }}
        title="点击单元格直接微调"
        className={`cursor-text rounded px-1 py-0.5 transition-colors hover:bg-muted/70 ${
          options?.mono ? "font-mono tabular-nums" : ""
        } ${
          field === "verdict"
            ? `font-semibold ${verdictTextClass(rec.verdict)}`
            : field === "category"
              ? `font-medium ${categoryTextClass(rec.category)}`
              : ""
        }`}
      >
        {val || (
          <span className="text-muted-foreground/50">
            {options?.placeholder || "—"}
          </span>
        )}
      </div>
    );
  };

  return (
    <section id="knowledge" className="scroll-mt-20 space-y-4">
      <Card className="gap-0 overflow-hidden rounded-xl border border-border bg-card py-0 shadow-none ring-0">
        <CardHeader className="flex flex-col gap-3 border-b border-border px-5 py-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2.5">
              <h2 className="text-base font-semibold tracking-tight text-foreground">
                03. 11 列知识库预览、去重与 CSV / Google Sheets 导出
              </h2>
              <span className="font-mono text-xs text-muted-foreground tabular-nums">
                {filteredRecords.length} / {records.length} 条
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              纯本地安全处理，点击单元格微调后，可一键复制直接粘贴至 Google Sheets，或下载标准 CSV 导入。
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={records.length < 2}
              onClick={onDeduplicate}
              className="h-9 gap-1.5 px-3 text-xs whitespace-nowrap shrink-0"
            >
              <FilterX className="size-3.5" aria-hidden="true" />
              按链接去重
            </Button>

            <Button
              type="button"
              disabled={filteredRecords.length === 0}
              onClick={handleCopyTsvForSheets}
              className="h-9 cursor-pointer gap-1.5 rounded-lg bg-emerald-600 px-4 text-xs font-semibold text-white shadow-sm transition-all duration-150 hover:bg-emerald-500 active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-45 whitespace-nowrap shrink-0"
            >
              {copiedMode === "tsv" ? (
                <>
                  <Check className="size-3.5" aria-hidden="true" />
                  <span>已复制，去 Sheets 粘贴</span>
                </>
              ) : (
                <>
                  <ClipboardCopy className="size-3.5" aria-hidden="true" />
                  <span>复制表格行（粘贴到 Google Sheets）</span>
                </>
              )}
            </Button>

            <Button
              type="button"
              variant="default"
              size="sm"
              disabled={filteredRecords.length === 0}
              onClick={() => onExportCsv(filteredRecords)}
              className="h-9 gap-1.5 px-3.5 text-xs font-medium whitespace-nowrap shrink-0"
            >
              <Download className="size-3.5" aria-hidden="true" />
              📥 下载标准 CSV
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={filteredRecords.length === 0}
              onClick={() => onExportJson(filteredRecords)}
              className="h-9 gap-1.5 px-3 text-xs whitespace-nowrap shrink-0"
            >
              <Download className="size-3.5" aria-hidden="true" />
              📥 导出 JSON
            </Button>
          </div>
        </CardHeader>

        {/* Sub-toolbar: View switch + Filters + Include Header Option */}
        <div className="flex flex-col gap-3 border-b border-border bg-muted/25 px-5 py-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Table vs CSV Raw Preview switcher */}
            <div
              role="tablist"
              aria-label="切换预览视图"
              className="inline-flex items-center gap-1 rounded-lg bg-muted p-0.5"
            >
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === "table"}
                onClick={() => setViewMode("table")}
                className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  viewMode === "table"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Table2 className="size-3.5" aria-hidden="true" />
                可编辑表格
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === "csv"}
                onClick={() => setViewMode("csv")}
                className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  viewMode === "csv"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Code2 className="size-3.5" aria-hidden="true" />
                CSV 文本直出
              </button>
            </div>

            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-muted-foreground whitespace-nowrap shrink-0">
                核查结论：
              </span>
              <select
                aria-label="按核查结论筛选"
                value={verdictFilter}
                onChange={(e) =>
                  setVerdictFilter(e.target.value as "all" | VerifyVerdict)
                }
                className="h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground outline-none focus:border-ring"
              >
                <option value="all">全部结论</option>
                {VERIFY_VERDICTS.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-muted-foreground whitespace-nowrap shrink-0">
                一级分类：
              </span>
              <select
                aria-label="按一级分类筛选"
                value={categoryFilter}
                onChange={(e) =>
                  setCategoryFilter(e.target.value as "all" | KnowledgeCategory)
                }
                className="h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground outline-none focus:border-ring"
              >
                <option value="all">全部分类</option>
                {KNOWLEDGE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="relative min-w-[180px]">
              <Search
                className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="检索主题、仓库、标签…"
                className="h-8 bg-background pl-8 text-xs"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs shrink-0">
            <label className="inline-flex cursor-pointer items-center gap-2 text-muted-foreground select-none whitespace-nowrap shrink-0">
              <Checkbox
                checked={includeHeaderOnCopy}
                onCheckedChange={(checked) =>
                  setIncludeHeaderOnCopy(Boolean(checked))
                }
              />
              <span>复制时包含表头行</span>
            </label>

            <span aria-hidden="true" className="text-border">
              ·
            </span>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onAddManualRecord}
              className="h-8 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground whitespace-nowrap shrink-0"
            >
              <Plus className="size-3.5" aria-hidden="true" />
              新增行
            </Button>

            {records.length > 0 && (
              <button
                type="button"
                onClick={onClearRecords}
                className="cursor-pointer text-xs text-rose-600 hover:underline dark:text-rose-400 whitespace-nowrap shrink-0"
              >
                清空预览表
              </button>
            )}
          </div>
        </div>

        {/* Main Content: Editable 11-Column Table OR Live CSV Text Output */}
        <CardContent className="p-0">
          {filteredRecords.length === 0 ? (
            <div className="px-6 py-14 text-center text-sm text-muted-foreground">
              {records.length === 0
                ? "尚无已核查记录。勾选上方高价值条目并点击「🔍 深度核查与提取」后，将自动拆行并生成 11 列标准表格与 CSV 数据。"
                : "当前筛选条件下没有匹配的记录。"}
            </div>
          ) : viewMode === "csv" ? (
            <div className="space-y-3 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
                <span>
                  标准 11 列 RFC-4180 CSV 数据（实时同步表格修改；支持 Google Sheets「文件 → 导入 → 附加到当前工作表」）
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCopyRawCsv}
                  className="h-8 gap-1.5 px-3 text-xs whitespace-nowrap shrink-0"
                >
                  {copiedMode === "csv" ? (
                    <>
                      <Check className="size-3.5 text-emerald-500" />
                      已复制 CSV 原文
                    </>
                  ) : (
                    <>
                      <ClipboardCopy className="size-3.5" />
                      复制 CSV 原文
                    </>
                  )}
                </Button>
              </div>
              <textarea
                readOnly
                value={generatedCsvPreview}
                onFocus={(e) => e.currentTarget.select()}
                rows={Math.min(18, Math.max(7, filteredRecords.length + 3))}
                aria-label="生成的标准 CSV 数据"
                className="w-full rounded-lg border border-border bg-muted/35 p-3.5 font-mono text-xs leading-relaxed text-foreground outline-none focus:border-ring"
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-[11px] font-semibold text-muted-foreground">
                    <th className="px-3 py-2.5 whitespace-nowrap">记录ID</th>
                    <th className="px-3 py-2.5 whitespace-nowrap">收录日期</th>
                    <th className="px-3 py-2.5 whitespace-nowrap">一级分类</th>
                    <th className="min-w-[180px] px-3 py-2.5 whitespace-nowrap">
                      核心主题
                    </th>
                    <th className="min-w-[165px] px-3 py-2.5 whitespace-nowrap">
                      核查结论
                    </th>
                    <th className="min-w-[175px] px-3 py-2.5 whitespace-nowrap">
                      关联项目/工具
                    </th>
                    <th className="min-w-[260px] px-3 py-2.5 whitespace-nowrap">
                      事实核查与短板
                    </th>
                    <th className="min-w-[240px] px-3 py-2.5 whitespace-nowrap">
                      可复用方法论
                    </th>
                    <th className="min-w-[155px] px-3 py-2.5 whitespace-nowrap">
                      关键词标签
                    </th>
                    <th className="min-w-[175px] px-3 py-2.5 whitespace-nowrap">
                      推特X链接
                    </th>
                    <th className="min-w-[185px] px-3 py-2.5 whitespace-nowrap">
                      仓库/项目链接
                    </th>
                    <th className="px-3 py-2.5 text-right whitespace-nowrap">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredRecords.map((rec) => (
                    <tr
                      key={rec.uid}
                      className="align-top transition-colors hover:bg-muted/25"
                    >
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {renderEditableCell(rec, "recordId", { mono: true })}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">
                        {renderEditableCell(rec, "collectedDate", { mono: true })}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {renderEditableCell(rec, "category")}
                      </td>
                      <td className="px-3 py-2.5 font-medium text-foreground">
                        {renderEditableCell(rec, "coreTopic")}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {renderEditableCell(rec, "verdict")}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[11px] text-foreground">
                        {renderEditableCell(rec, "projectOrTool", { mono: true })}
                      </td>
                      <td className="px-3 py-2.5 leading-relaxed text-muted-foreground">
                        {renderEditableCell(rec, "factCheckAndCaveats", {
                          multiline: true,
                        })}
                      </td>
                      <td className="px-3 py-2.5 leading-relaxed text-muted-foreground">
                        {renderEditableCell(rec, "reusableMethodology", {
                          multiline: true,
                        })}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">
                        {renderEditableCell(rec, "keywords")}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {renderEditableCell(rec, "xUrl", { isUrl: true })}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {renderEditableCell(rec, "repoUrl", { isUrl: true })}
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => onDeleteRecord(rec.uid)}
                          aria-label="删除此行记录"
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
