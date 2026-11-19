import React, { useRef, useState } from "react";
import {
  FileCode2,
  FileJson,
  FileSpreadsheet,
  FileText,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_JUDGE_RULES } from "../types/intel";

interface ImportSectionProps {
  judgeRules: string;
  onJudgeRulesChange: (val: string) => void;
  onFilesSelected: (files: FileList | File[]) => void;
  onPasteSubmit: (rawText: string) => void;
  onLoadDemo: () => void;
  isBusy: boolean;
}

export function ImportSection({
  judgeRules,
  onJudgeRulesChange,
  onFilesSelected,
  onPasteSubmit,
  onLoadDemo,
  isBusy,
}: ImportSectionProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [pasteText, setPasteText] = useState("");

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFilesSelected(e.dataTransfer.files);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFilesSelected(e.target.files);
    }
    e.target.value = "";
  };

  const handleAddPasted = () => {
    const trimmed = pasteText.trim();
    if (!trimmed) return;
    onPasteSubmit(trimmed);
    setPasteText("");
  };

  const isRulesModified = judgeRules.trim() !== DEFAULT_JUDGE_RULES.trim();

  return (
    <section id="import" className="scroll-mt-20 space-y-5">
      {/* Editable Electronic Judge Custom Rules Bar */}
      <Card className="gap-0 rounded-xl border border-border bg-card py-0 shadow-none ring-0">
        <CardHeader className="flex flex-row items-center justify-between gap-4 border-b border-border px-5 py-3">
          <div className="flex items-center gap-2">
            <SlidersHorizontal
              className="size-4 text-muted-foreground"
              aria-hidden="true"
            />
            <h2 className="text-sm font-semibold text-foreground">
              判官自定义标准（实时注入第一阶段决策模型规则）
            </h2>
          </div>
          {isRulesModified && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isBusy}
              onClick={() => onJudgeRulesChange(DEFAULT_JUDGE_RULES)}
              className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground whitespace-nowrap shrink-0"
            >
              <RotateCcw className="size-3" aria-hidden="true" />
              恢复预设规则
            </Button>
          )}
        </CardHeader>
        <CardContent className="px-5 py-3.5">
          <label htmlFor="judge-custom-rules" className="sr-only">
            判官自定义标准
          </label>
          <Textarea
            id="judge-custom-rules"
            value={judgeRules}
            onChange={(e) => onJudgeRulesChange(e.target.value)}
            disabled={isBusy}
            rows={2}
            placeholder="输入你的初筛判定准则……"
            className="min-h-[58px] resize-none border-border bg-background/60 px-3 py-2 text-sm leading-relaxed text-foreground focus-visible:border-foreground/40"
          />
        </CardContent>
      </Card>

      {/* Multi-Format Import & Direct Paste Grid */}
      <div className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-12">
        {/* Multi-file drag & drop zone */}
        <Card className="flex flex-col justify-between gap-0 rounded-xl border border-border bg-card py-0 shadow-none ring-0 lg:col-span-7">
          <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-border px-5 py-3">
            <h2 className="text-sm font-semibold text-foreground">
              01. 多格式批量文件导入与智能解析
            </h2>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isBusy}
              onClick={onLoadDemo}
              className="h-7 gap-1.5 px-2.5 text-xs whitespace-nowrap shrink-0"
            >
              <Sparkles className="size-3" aria-hidden="true" />
              载入演示批次
            </Button>
          </CardHeader>

          <CardContent className="flex flex-1 flex-col justify-between gap-4 p-5">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".csv,.json,.md,.markdown,.html,.htm,text/csv,application/json,text/markdown,text/html"
              onChange={handleFileChange}
              className="hidden"
              aria-label="选择批量导入文件"
            />

            <div
              role="button"
              tabIndex={0}
              onClick={() => !isBusy && fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if ((e.key === "Enter" || e.key === " ") && !isBusy) {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`flex min-h-[168px] flex-1 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-5 py-6 text-center transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                isDragging
                  ? "border-foreground bg-muted/80"
                  : "border-border bg-background/50 hover:border-foreground/40 hover:bg-muted/35"
              } ${isBusy ? "pointer-events-none opacity-60" : ""}`}
            >
              <div className="mb-2.5 flex size-10 items-center justify-center rounded-lg bg-muted text-foreground">
                <Upload className="size-4" aria-hidden="true" />
              </div>
              <p className="text-sm font-medium text-foreground">
                拖拽或点击上传多个文件（支持同时批量导入）
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                支持 .csv / .json / .md / .html / .htm，自动清洗标签、按分割线切分并识别 X 原贴与 GitHub 外链
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <FileCode2 className="size-3.5" aria-hidden="true" />
                HTML 去噪提链
              </span>
              <span aria-hidden="true" className="text-border">
                ·
              </span>
              <span className="inline-flex items-center gap-1.5">
                <FileText className="size-3.5" aria-hidden="true" />
                MD 按 ---/标题切分
              </span>
              <span aria-hidden="true" className="text-border">
                ·
              </span>
              <span className="inline-flex items-center gap-1.5">
                <FileSpreadsheet className="size-3.5" aria-hidden="true" />
                CSV / <FileJson className="inline size-3.5" aria-hidden="true" /> JSON 字段自动映射
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Direct Paste Tweet or GitHub Link */}
        <Card className="flex flex-col justify-between gap-0 rounded-xl border border-border bg-card py-0 shadow-none ring-0 lg:col-span-5">
          <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-border px-5 py-3">
            <h2 className="text-sm font-semibold text-foreground">
              单条推文 / GitHub 链接快速粘贴
            </h2>
            <span className="font-mono text-xs text-muted-foreground whitespace-nowrap shrink-0">
              --- 分隔可一次粘贴多条
            </span>
          </CardHeader>

          <CardContent className="flex flex-1 flex-col justify-between gap-3.5 p-5">
            <label htmlFor="direct-paste-input" className="sr-only">
              粘贴单条推文或 GitHub 链接
            </label>
            <Textarea
              id="direct-paste-input"
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              disabled={isBusy}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  handleAddPasted();
                }
              }}
              placeholder="直接粘贴 X 推文正文、https://x.com/... 链接或 https://github.com/owner/repo 项目地址……"
              className="min-h-[144px] flex-1 resize-none border-border bg-background/60 px-3 py-2.5 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/75"
            />
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">
                ⌘ / Ctrl + Enter 快捷加入
              </span>
              <Button
                type="button"
                variant="default"
                size="sm"
                disabled={isBusy || !pasteText.trim()}
                onClick={handleAddPasted}
                className="h-9 gap-1.5 px-4 text-xs font-medium whitespace-nowrap shrink-0"
              >
                <Plus className="size-3.5" aria-hidden="true" />
                解析并加入队列
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
