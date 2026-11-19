import type { KnowledgeRecord } from "../types/intel";

export const CSV_HEADERS = [
  "记录ID",
  "收录日期",
  "一级分类",
  "核心主题",
  "核查结论",
  "关联项目/工具",
  "事实核查与短板",
  "可复用方法论",
  "关键词标签",
  "推特X链接",
  "仓库/项目链接",
] as const;

export function getTodayStrings(): { dateDash: string; dateCompact: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return {
    dateDash: `${y}-${m}-${d}`,
    dateCompact: `${y}${m}${d}`,
  };
}

export function formatRecordId(dateCompact: string, sequence: number): string {
  return `${dateCompact}-${String(sequence).padStart(2, "0")}`;
}

export function normalizeUrlKey(url: string): string {
  return url
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/(www\.)?twitter\.com\//, "https://x.com/")
    .replace(/\/+$/, "");
}

export function buildDedupSignature(record: {
  xUrl: string;
  repoUrl: string;
  coreTopic?: string;
}): string {
  const x = normalizeUrlKey(record.xUrl || "");
  const r = normalizeUrlKey(record.repoUrl || "");
  if (x || r) {
    return `${x}||${r}`;
  }
  return `topic::${(record.coreTopic || "").trim().toLowerCase()}`;
}

export function deduplicateRecordList(records: KnowledgeRecord[]): {
  uniqueRecords: KnowledgeRecord[];
  removedCount: number;
} {
  const seen = new Set<string>();
  const uniqueRecords: KnowledgeRecord[] = [];
  let removedCount = 0;

  for (const rec of records) {
    const sig = buildDedupSignature(rec);
    if (seen.has(sig)) {
      removedCount += 1;
      continue;
    }
    seen.add(sig);
    uniqueRecords.push(rec);
  }

  return { uniqueRecords, removedCount };
}

function recordToOrderedCells(r: KnowledgeRecord): string[] {
  return [
    r.recordId,
    r.collectedDate,
    r.category,
    r.coreTopic,
    r.verdict,
    r.projectOrTool,
    r.factCheckAndCaveats,
    r.reusableMethodology,
    r.keywords,
    r.xUrl,
    r.repoUrl,
  ];
}

function escapeCsvCell(value: string): string {
  const str = String(value ?? "");
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Generates RFC-4180 CSV text (optional UTF-8 BOM for direct file download).
 */
export function serializeRecordsToCsv(
  records: KnowledgeRecord[],
  options: { includeHeader?: boolean; withBom?: boolean } = {}
): string {
  const { includeHeader = true, withBom = false } = options;
  const lines: string[] = [];
  if (includeHeader) {
    lines.push(CSV_HEADERS.map(escapeCsvCell).join(","));
  }
  for (const r of records) {
    lines.push(recordToOrderedCells(r).map(escapeCsvCell).join(","));
  }
  const body = lines.join("\r\n");
  return withBom ? `\uFEFF${body}` : body;
}

function escapeTsvCell(value: string): string {
  const str = String(value ?? "").replace(/\t/g, " ");
  if (/["\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Generates TSV (Tab-Separated Values) optimized for direct Ctrl+V / Cmd+V paste into Google Sheets.
 * Automatically splits across all 11 columns and matches Google Sheets data-validation dropdowns.
 */
export function serializeRecordsToTsv(
  records: KnowledgeRecord[],
  includeHeader = false
): string {
  const lines: string[] = [];
  if (includeHeader) {
    lines.push(CSV_HEADERS.map(escapeTsvCell).join("\t"));
  }
  for (const r of records) {
    lines.push(recordToOrderedCells(r).map(escapeTsvCell).join("\t"));
  }
  return lines.join("\n");
}

export function serializeRecordsToExportJson(records: KnowledgeRecord[]): string {
  const standardRows = records.map((r) => ({
    记录ID: r.recordId,
    收录日期: r.collectedDate,
    一级分类: r.category,
    核心主题: r.coreTopic,
    核查结论: r.verdict,
    "关联项目/工具": r.projectOrTool,
    事实核查与短板: r.factCheckAndCaveats,
    可复用方法论: r.reusableMethodology,
    关键词标签: r.keywords,
    推特X链接: r.xUrl,
    "仓库/项目链接": r.repoUrl,
  }));
  return JSON.stringify(standardRows, null, 2);
}

export function triggerFileDownload(
  content: string,
  filename: string,
  mimeType: string
) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
