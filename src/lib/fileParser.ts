import type { RawIntelItem } from "../types/intel";

const URL_REGEX = /https?:\/\/[^\s<>"')\]，。,;；]+/gi;

function makeId(prefix = "item"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function cleanUrl(raw: string): string {
  return raw.replace(/[.,;:!?)\]]+$/, "").trim();
}

function normalizeXUrl(raw: string): string {
  return cleanUrl(raw).replace(
    /^https?:\/\/(www\.)?twitter\.com\//i,
    "https://x.com/"
  );
}

export function extractLinksFromText(text: string): {
  xUrl: string;
  externalLinks: string[];
} {
  const matches = text.match(URL_REGEX) ?? [];
  let xUrl = "";
  const externalSet = new Set<string>();

  for (const m of matches) {
    const cleaned = cleanUrl(m);
    if (/^https?:\/\/(www\.)?(x|twitter)\.com\/[^/]+\/status\/\d+/i.test(cleaned)) {
      if (!xUrl) xUrl = normalizeXUrl(cleaned);
    } else if (/^https?:\/\/(www\.)?(x|twitter)\.com\//i.test(cleaned)) {
      if (!xUrl) xUrl = normalizeXUrl(cleaned);
    } else if (!/^https?:\/\/t\.co\//i.test(cleaned)) {
      externalSet.add(cleaned);
    }
  }

  return { xUrl, externalLinks: Array.from(externalSet) };
}

function parseCsvRows(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        currentField += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        currentField += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      currentRow.push(currentField);
      currentField = "";
    } else if (char === "\r" && next === "\n") {
      currentRow.push(currentField);
      rows.push(currentRow);
      currentRow = [];
      currentField = "";
      i += 1;
    } else if (char === "\n" || char === "\r") {
      currentRow.push(currentField);
      rows.push(currentRow);
      currentRow = [];
      currentField = "";
    } else {
      currentField += char;
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  return rows.filter((r) => r.some((cell) => cell.trim().length > 0));
}

function pickField(
  record: Record<string, unknown>,
  candidates: string[]
): string {
  const entries = Object.entries(record);
  for (const key of candidates) {
    const lower = key.toLowerCase();
    const hit = entries.find(([k]) => k.toLowerCase().trim() === lower);
    if (hit && hit[1] != null && String(hit[1]).trim() !== "") {
      return String(hit[1]).trim();
    }
  }
  for (const key of candidates) {
    const lower = key.toLowerCase();
    const hit = entries.find(([k]) => k.toLowerCase().includes(lower));
    if (hit && hit[1] != null && String(hit[1]).trim() !== "") {
      return String(hit[1]).trim();
    }
  }
  return "";
}

function buildItem(partial: {
  sourceFile: string;
  sourceType: RawIntelItem["sourceType"];
  content: string;
  author?: string;
  timestamp?: string;
  xUrl?: string;
  externalLinks?: string[];
}): RawIntelItem {
  const extracted = extractLinksFromText(
    [partial.content, partial.xUrl || "", ...(partial.externalLinks || [])].join(" ")
  );

  const explicitX = partial.xUrl ? normalizeXUrl(partial.xUrl) : "";
  const finalXUrl =
    explicitX && /^https?:\/\/(www\.)?x\.com\//i.test(explicitX)
      ? explicitX
      : extracted.xUrl;

  const externalSet = new Set<string>(extracted.externalLinks);
  for (const link of partial.externalLinks || []) {
    const cleaned = cleanUrl(link);
    if (cleaned && !/^https?:\/\/(www\.)?(x|twitter)\.com\//i.test(cleaned)) {
      externalSet.add(cleaned);
    }
  }

  return {
    id: makeId(partial.sourceType),
    sourceFile: partial.sourceFile,
    sourceType: partial.sourceType,
    content: partial.content.trim(),
    author: (partial.author || "").trim(),
    timestamp: (partial.timestamp || "").trim(),
    xUrl: finalXUrl,
    externalLinks: Array.from(externalSet),
    selected: true,
    judgeStatus: "pending",
    verifyStatus: "idle",
  };
}

export function parseHtmlFile(htmlText: string, fileName: string): RawIntelItem[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlText, "text/html");

  const noisySelectors = [
    "script",
    "style",
    "nav",
    "header",
    "footer",
    "aside",
    "noscript",
    "svg",
    "iframe",
    "template",
  ];
  for (const sel of noisySelectors) {
    doc.querySelectorAll(sel).forEach((el) => el.remove());
  }

  const rawCandidates = Array.from(
    doc.querySelectorAll('article, [data-testid="tweet"], .tweet, .bookmark-item, main section')
  ).filter((el) => (el.textContent || "").trim().length >= 20);

  // Exclude outer wrapper elements that already contain more granular matched blocks
  const blockCandidates = rawCandidates.filter(
    (el) => !rawCandidates.some((other) => other !== el && el.contains(other))
  );

  const containers =
    blockCandidates.length > 0 ? blockCandidates : [doc.body || doc.documentElement];

  const items: RawIntelItem[] = [];
  for (const container of containers) {
    if (!container) continue;
    const anchors = Array.from(container.querySelectorAll("a[href]"))
      .map((a) => a.getAttribute("href") || "")
      .filter((href) => /^https?:\/\//i.test(href));

    const rawText = (container.textContent || "")
      .replace(/\r/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    if (!rawText && anchors.length === 0) continue;

    const xLink = anchors.find((u) =>
      /^https?:\/\/(www\.)?(x|twitter)\.com\//i.test(u)
    );
    const otherLinks = anchors.filter(
      (u) => !/^https?:\/\/(www\.)?(x|twitter)\.com\//i.test(u)
    );

    const timeEl = container.querySelector("time");
    const timestamp =
      timeEl?.getAttribute("datetime") || timeEl?.textContent?.trim() || "";

    items.push(
      buildItem({
        sourceFile: fileName,
        sourceType: "html",
        content: rawText.slice(0, 8000),
        timestamp,
        xUrl: xLink,
        externalLinks: otherLinks,
      })
    );
  }

  return items;
}

export function parseMarkdownFile(mdText: string, fileName: string): RawIntelItem[] {
  const normalized = mdText.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  // Split by horizontal rules first; if none, split by markdown headings (# / ## / ###)
  let chunks: string[];
  if (/^\s*(?:---+|___+|\*\*\*+)\s*$/m.test(normalized)) {
    chunks = normalized.split(/^\s*(?:---+|___+|\*\*\*+)\s*$/m);
  } else if (/^#{1,3}\s+/m.test(normalized)) {
    chunks = normalized.split(/(?=^#{1,3}\s+)/m);
  } else {
    chunks = [normalized];
  }

  const items: RawIntelItem[] = [];
  for (const rawChunk of chunks) {
    const chunk = rawChunk.trim();
    if (chunk.length < 8) continue;

    // Extract markdown links [text](url)
    const mdLinks: string[] = [];
    const mdLinkRegex = /\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g;
    let m: RegExpExecArray | null;
    while ((m = mdLinkRegex.exec(chunk)) !== null) {
      mdLinks.push(m[1]);
    }

    const authorMatch = chunk.match(
      /(?:^|\n)(?:作者|Author|博主|Handle)\s*[:：]\s*([^\n]+)/i
    );
    const timeMatch = chunk.match(
      /(?:^|\n)(?:时间|日期|Date|Time|Created)\s*[:：]\s*([^\n]+)/i
    );

    items.push(
      buildItem({
        sourceFile: fileName,
        sourceType: "md",
        content: chunk,
        author: authorMatch?.[1],
        timestamp: timeMatch?.[1],
        externalLinks: mdLinks,
      })
    );
  }

  return items;
}

export function parseCsvFile(csvText: string, fileName: string): RawIntelItem[] {
  const rows = parseCsvRows(csvText);
  if (rows.length === 0) return [];

  const headers = rows[0].map((h) => h.trim());
  const dataRows = rows.slice(1);
  if (dataRows.length === 0) return [];

  const items: RawIntelItem[] = [];
  for (const row of dataRows) {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h || `col_${idx}`] = (row[idx] || "").trim();
    });

    const content =
      pickField(obj, [
        "full_text",
        "text",
        "content",
        "tweet",
        "body",
        "正文",
        "内容",
        "推文",
        "推文内容",
        "摘要",
      ]) || row.filter(Boolean).join(" | ");

    const author = pickField(obj, [
      "author",
      "screen_name",
      "username",
      "user",
      "handle",
      "作者",
      "博主",
      "用户名",
    ]);

    const timestamp = pickField(obj, [
      "created_at",
      "timestamp",
      "date",
      "time",
      "发布时间",
      "时间",
      "日期",
    ]);

    const xUrlCandidate = pickField(obj, [
      "x_url",
      "tweet_url",
      "url",
      "link",
      "原贴链接",
      "推文链接",
      "推特X链接",
      "推特链接",
    ]);

    const extRaw = pickField(obj, [
      "external_links",
      "repo_url",
      "github",
      "urls",
      "外链",
      "仓库链接",
      "项目链接",
    ]);

    const extLinks = extRaw
      ? extRaw.split(/[\s,;|]+/).filter((u) => /^https?:\/\//i.test(u))
      : [];

    if (!content.trim() && !xUrlCandidate && extLinks.length === 0) continue;

    items.push(
      buildItem({
        sourceFile: fileName,
        sourceType: "csv",
        content,
        author,
        timestamp,
        xUrl: xUrlCandidate,
        externalLinks: extLinks,
      })
    );
  }

  return items;
}

function flattenJsonEntry(entry: unknown): Record<string, unknown> {
  if (!entry || typeof entry !== "object") return {};
  const obj = entry as Record<string, unknown>;
  const legacy =
    obj.legacy && typeof obj.legacy === "object"
      ? (obj.legacy as Record<string, unknown>)
      : {};
  const userObj =
    obj.user && typeof obj.user === "object"
      ? (obj.user as Record<string, unknown>)
      : {};
  return {
    ...obj,
    ...legacy,
    user_screen_name:
      userObj.screen_name ?? userObj.name ?? obj.author ?? obj.username ?? "",
  };
}

export function parseJsonFile(jsonText: string, fileName: string): RawIntelItem[] {
  const parsed = JSON.parse(jsonText.replace(/^\uFEFF/, ""));
  let list: unknown[] = [];

  if (Array.isArray(parsed)) {
    list = parsed;
  } else if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    const candidateKey = [
      "items",
      "tweets",
      "bookmarks",
      "data",
      "records",
      "posts",
    ].find((k) => Array.isArray(obj[k]));
    if (candidateKey) {
      list = obj[candidateKey] as unknown[];
    } else {
      list = [parsed];
    }
  }

  const items: RawIntelItem[] = [];
  for (const rawEntry of list) {
    if (typeof rawEntry === "string") {
      if (rawEntry.trim()) {
        items.push(
          buildItem({
            sourceFile: fileName,
            sourceType: "json",
            content: rawEntry,
          })
        );
      }
      continue;
    }

    const obj = flattenJsonEntry(rawEntry);
    const content =
      pickField(obj, [
        "full_text",
        "text",
        "content",
        "tweet",
        "body",
        "description",
        "正文",
        "内容",
        "推文",
      ]) || JSON.stringify(rawEntry).slice(0, 1200);

    const author = pickField(obj, [
      "author",
      "user_screen_name",
      "screen_name",
      "username",
      "handle",
      "作者",
      "博主",
    ]);

    const timestamp = pickField(obj, [
      "created_at",
      "timestamp",
      "date",
      "time",
      "发布时间",
      "时间",
      "日期",
    ]);

    const xUrlCandidate = pickField(obj, [
      "x_url",
      "tweet_url",
      "url",
      "link",
      "原贴链接",
      "推文链接",
      "推特X链接",
    ]);

    const rawExternal = obj.externalLinks ?? obj.external_links ?? obj.urls ?? obj.links;
    const extLinks: string[] = [];
    if (Array.isArray(rawExternal)) {
      for (const l of rawExternal) {
        if (typeof l === "string" && /^https?:\/\//i.test(l)) {
          extLinks.push(l);
        } else if (l && typeof l === "object") {
          const u =
            (l as { expanded_url?: string; url?: string }).expanded_url ||
            (l as { url?: string }).url;
          if (u && /^https?:\/\//i.test(u)) extLinks.push(u);
        }
      }
    } else if (typeof rawExternal === "string") {
      extLinks.push(
        ...rawExternal.split(/[\s,;|]+/).filter((u) => /^https?:\/\//i.test(u))
      );
    }

    if (!content.trim() && !xUrlCandidate && extLinks.length === 0) continue;

    items.push(
      buildItem({
        sourceFile: fileName,
        sourceType: "json",
        content,
        author,
        timestamp,
        xUrl: xUrlCandidate,
        externalLinks: extLinks,
      })
    );
  }

  return items;
}

export async function parseUploadedFile(file: File): Promise<RawIntelItem[]> {
  const text = await file.text();
  const ext = file.name.split(".").pop()?.toLowerCase() || "";

  if (ext === "csv") return parseCsvFile(text, file.name);
  if (ext === "json") return parseJsonFile(text, file.name);
  if (ext === "md" || ext === "markdown") return parseMarkdownFile(text, file.name);
  if (ext === "html" || ext === "htm") return parseHtmlFile(text, file.name);

  // Fallback by content sniffing
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return parseJsonFile(text, file.name);
  }
  if (trimmed.startsWith("<")) {
    return parseHtmlFile(text, file.name);
  }
  return parseMarkdownFile(text, file.name);
}

export function parsePastedInput(rawInput: string): RawIntelItem[] {
  const trimmed = rawInput.trim();
  if (!trimmed) return [];

  // Allow users to paste multiple blocks separated by ---
  const chunks = /^\s*---+\s*$/m.test(trimmed)
    ? trimmed.split(/^\s*---+\s*$/m).map((c) => c.trim()).filter(Boolean)
    : [trimmed];

  return chunks.map((chunk) =>
    buildItem({
      sourceFile: "手动粘贴",
      sourceType: "paste",
      content: chunk,
      timestamp: new Date().toISOString().slice(0, 10),
    })
  );
}

export function createDemoIntelBatch(): RawIntelItem[] {
  return [
    buildItem({
      sourceFile: "demo_bookmarks.json",
      sourceType: "json",
      author: "@ai_systems_lab",
      timestamp: "2026-11-17",
      xUrl: "https://x.com/ai_systems_lab/status/1899123456789012345",
      externalLinks: [
        "https://github.com/browser-use/browser-use",
        "https://github.com/langchain-ai/langgraph",
      ],
      content:
        "本周实测了两个最值得接入生产环境的 Agent 开源框架：1) browser-use/browser-use 做 DOM 树提取+视觉定位，比纯截图点击省 60% Token；2) langchain-ai/langgraph 做带持久化 Checkpoint 的状态机编排，支持人工审批断点续跑。原贴：https://x.com/ai_systems_lab/status/1899123456789012345",
    }),
    buildItem({
      sourceFile: "demo_bookmarks.json",
      sourceType: "json",
      author: "@rust_perf_dev",
      timestamp: "2026-11-16",
      xUrl: "https://x.com/rust_perf_dev/status/1899123456789012346",
      externalLinks: ["https://github.com/astral-sh/uv"],
      content:
        "把 CI 里的 Python 依赖安装全量切到 astral-sh/uv 后，冷启动构建耗时从 4 分 12 秒降到了 19 秒，单二进制文件直接替代 pip + venv + poetry，零额外运行时依赖。https://github.com/astral-sh/uv",
    }),
    buildItem({
      sourceFile: "demo_bookmarks.json",
      sourceType: "json",
      author: "@promo_bot_888",
      timestamp: "2026-11-18",
      xUrl: "https://x.com/promo_bot_888/status/1899123456789012347",
      externalLinks: [],
      content:
        "太震撼了！AI 已经彻底改变世界！点赞转发关注并评论区回复「666」，免费送你 1000G 全套 AI 赚钱提示词大礼包，前 50 名进 VIP 变现群！！",
    }),
    buildItem({
      sourceFile: "demo_bookmarks.json",
      sourceType: "json",
      author: "@friday_mood",
      timestamp: "2026-11-18",
      xUrl: "https://x.com/friday_mood/status/1899123456789012348",
      externalLinks: [],
      content:
        "今天下午写代码写到头秃，下楼买了杯冰美式晒了十分钟太阳，感觉又活过来了，大家周末准备去哪玩？",
    }),
  ];
}
