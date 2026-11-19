import { ChevronDown, ChevronUp, Terminal } from "lucide-react";
import { useState } from "react";
import type { PipelineLogEntry } from "../types/intel";

interface PipelineStatusBarProps {
  activeLabel: string | null;
  progressCurrent: number;
  progressTotal: number;
  logs: PipelineLogEntry[];
  onClearLogs: () => void;
}

export function PipelineStatusBar({
  activeLabel,
  progressCurrent,
  progressTotal,
  logs,
  onClearLogs,
}: PipelineStatusBarProps) {
  const [expanded, setExpanded] = useState(true);

  const ratio =
    progressTotal > 0 ? Math.min(1, Math.max(0, progressCurrent / progressTotal)) : 0;
  const pct = Math.round(ratio * 100);

  if (!activeLabel && logs.length === 0) {
    return null;
  }

  const levelColor = (level: PipelineLogEntry["level"]) => {
    if (level === "success") return "text-emerald-600 dark:text-emerald-400";
    if (level === "warn") return "text-amber-600 dark:text-amber-400";
    if (level === "error") return "text-rose-600 dark:text-rose-400";
    return "text-muted-foreground";
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 sm:px-5">
        <div className="flex min-w-0 items-center gap-2.5 text-xs">
          <Terminal
            className="size-3.5 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <span className="font-medium text-foreground">
            {activeLabel || "流水线运行日志"}
          </span>
          {activeLabel && progressTotal > 0 && (
            <span className="font-mono text-muted-foreground tabular-nums">
              {progressCurrent} / {progressTotal} ({pct}%)
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 text-xs shrink-0">
          {logs.length > 0 && (
            <button
              type="button"
              onClick={onClearLogs}
              className="cursor-pointer text-muted-foreground hover:text-foreground whitespace-nowrap shrink-0"
            >
              清空日志
            </button>
          )}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex cursor-pointer items-center gap-1 text-muted-foreground hover:text-foreground whitespace-nowrap shrink-0"
          >
            <span>{expanded ? "收起" : `展开 (${logs.length})`}</span>
            {expanded ? (
              <ChevronUp className="size-3.5" />
            ) : (
              <ChevronDown className="size-3.5" />
            )}
          </button>
        </div>
      </div>

      {activeLabel && progressTotal > 0 && (
        <div className="h-1 w-full overflow-hidden bg-muted">
          <div
            style={{
              transform: `scaleX(${Math.max(0.04, ratio)})`,
              transformOrigin: "left",
            }}
            className="h-full w-full bg-emerald-500 transition-transform duration-200 ease-out"
          />
        </div>
      )}

      {expanded && logs.length > 0 && (
        <div className="max-h-[168px] overflow-y-auto border-t border-border bg-muted/25 px-4 py-2.5 font-mono text-[11px] leading-relaxed sm:px-5">
          {logs.map((entry) => (
            <div key={entry.id} className="flex items-start gap-2.5 py-0.5">
              <span className="shrink-0 text-muted-foreground/70 tabular-nums">
                {entry.time}
              </span>
              <span className="shrink-0 font-semibold text-foreground/80">
                [{entry.stage}]
              </span>
              <span className={`min-w-0 break-words ${levelColor(entry.level)}`}>
                {entry.message}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
