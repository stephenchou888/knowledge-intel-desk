# 知识库信息核查（Knowledge Intel Desk）

面向技术情报、开源项目与高密度 X（Twitter）书签整理的 **三阶段全栈知识库核查工作台**，同时支持 **Web 部署** 与 **Windows / macOS 原生桌面端（Electron + GitHub Actions 自动编译发布）**。

本应用 **不硬编码内置任何固定模型 API**，而是提供独立的 **自定义模型接口管理页面**，由用户自由接入 **JEV、OpenAI、Gemini、Claude、DeepSeek、GLM（智谱）、Kimi（月之暗面）、腾讯混元** 及任意 OpenAI 兼容网关（OpenRouter、硅基流动、One-API、New-API、本地 Ollama / vLLM 等），并通过本地服务端代理安全调用。

---

## 一、开发演进与架构复盘

本项目历经 6 个阶段的迭代演进，最终沉淀为当前安全、可扩展的工程形态：

| 迭代阶段 | 需求背景与痛点 | 核心架构决策与落地结果 |
| :--- | :--- | :--- |
| **Phase 1 · 极简内容分类器** | 单条文本/图片快速三分类 | 引入 React 19 + Tailwind CSS v4 + shadcn/ui 组件体系与服务端代理路由雏形 |
| **Phase 2 · 三阶段情报核查流水线** | 批量整理 X 书签与开源仓库时，人工筛选耗时长、单条推文含多个仓库易遗漏 | 设计 **多格式解析 → 第一阶段电子判官初筛 → 第二阶段深度核查拆行 → 第三阶段 11 列知识库预览与去重** 完整流水线 |
| **Phase 3 · 去除 Webhook 回归纯本地导出** | 外部 Google Apps Script Webhook 存在鉴权暴露与误写风险 | 彻底移除 Webhook 推送逻辑；改为 **可编辑 11 列预览表 + 一键 TSV 复制直贴 Google Sheets + CSV 文本直出 + UTF-8 BOM 标准 CSV/JSON 下载** |
| **Phase 4 · 品牌收敛与视觉精修** | 聚焦专业极客工作台体验 | 标题统一为「知识库信息核查」，实现深色/浅色双模切换、顶部实时 KPI 看板、进度条与终端风实时日志 |
| **Phase 5 · 解耦内置 API 与 9 大厂商自定义接口** | 用户需按成本与能力自由组合不同模型（且不希望锁死单一厂商） | 移除内置模型依赖；新增独立 **「自定义模型接口管理」** 页面，支持 **JEV / OpenAI / Gemini / Claude / DeepSeek / GLM / Kimi / 腾讯混元 / 其它**，并采用 **第一阶段（上方）与第二阶段（下方）上下独立添加窗口**；前端仅绑定服务端 Secrets 环境变量名，零明文密钥泄露 |
| **Phase 6 · 缺陷复盘与双端桌面自动化编译** | 推理模型 `<think>` 干扰解析、HTML 嵌套重复、桌面分发需求 | 完成全量代码审计修复 8 类边界 Bug；封装 Electron 内嵌本地 Express 代理服务并配置 GitHub Actions 自动编译 Windows (`.exe`) 与 macOS (`.dmg` / `.zip`) |

---

## 二、核心功能与三阶段流水线

```text
[多格式批量导入] (.csv / .json / .md / .html / 直接粘贴)
        │  前端智能解析器：HTML 去噪提链 / MD 按 --- 或标题切分 / CSV·JSON 字段自动映射
        ▼
[Stage 1 · 电子判官极速初筛]  POST /api/triage
        │  绑定自定义决策接口（JEV / Gemini Decisions API / OpenAI / DeepSeek / 等）
        │  四分类：【高价值工程/AI情报】、【开源项目/工具库】、【待稍后看】、【低质水贴/广告噪音】
        │  自动勾选高价值与开源项目，自动过滤取消勾选噪音贴
        ▼
[Stage 2 · 深度核查与 11 列结构化提取]  POST /api/verify
        │  绑定自定义核查接口（支持 OpenAI / Anthropic / Gemini + 可选 Google Search 联网核查）
        │  自动核实 Star 数 / 归档状态 / License / 夸大短板，多项目自动拆分为多行
        ▼
[Stage 3 · 11 列知识库编辑、去重与直出]
           单元格点击微调 · 按 X 链接与仓库链接去重 · TSV 一键粘贴 Google Sheets · CSV / JSON 本地导出
```

### 标准 11 列输出字段规范（对齐 Google Sheets 主库）

| 序号 | 字段名 | 说明与格式规范 |
| :--- | :--- | :--- |
| 1 | `记录ID` | 自动按当日日期递增，格式 `YYYYMMDD-XX`（如 `20261119-01`） |
| 2 | `收录日期` | 标准 ISO 日期 `YYYY-MM-DD` |
| 3 | `一级分类` | 严格四选一：`AI开发与Agent`、`工程与效率工具`、`3D与多模态创作`、`内容与商业洞察` |
| 4 | `核心主题` | 25 字以内的客观中文标题，去除营销感叹词 |
| 5 | `核查结论` | 严格三选一：`✅ 属实`、`⚠️ 部分夸大或有隐藏短板`、`❌ 伪命题或已失效` |
| 6 | `关联项目/工具` | 标准格式 `owner/repo (XXk⭐)` 或官方项目名 |
| 7 | `事实核查与短板` | 记录真实能力、Star 数、Archived/只读状态、License/硬件/付费门槛及夸大点 |
| 8 | `可复用方法论` | 提炼可迁移的系统架构、Agent 编排、Prompt 设计或工程工作流规律 |
| 9 | `关键词标签` | 英文逗号分隔的 3–6 个技术标签 |
| 10 | `推特X链接` | 纯净 `https://x.com/...` URL（自动转换 `twitter.com`，无前缀文字） |
| 11 | `仓库/项目链接` | 纯净 `https://github.com/...` 或项目官网 URL |

---

## 三、支持的 9 大模型接口与安全密钥机制

点击右上角 **「自定义接口」** 进入管理页面，页面采用 **上下独立分区**：
- **上方窗口（01. 第一阶段）**：添加并绑定决策初筛接口（置顶支持 **JEV 决策模型**、**Gemini** 等）。
- **下方窗口（02. 第二阶段）**：添加并绑定深度核查与 11 列提取接口（Gemini 协议支持独立开关 Google Search 联网检索与推理深度 `low / medium / high`）。
- **底部接口库（03. 已添加接口库）**：统一执行连通性测试（`POST /api/providers/test`）、快速切换阶段绑定、编辑与删除。

### 厂商预设模板与服务端环境变量对照

> **安全设计原则**：前端页面绝不采集、不存储明文 API Key。每个自定义接口仅记录服务端环境变量名（或 `NONE` 表示本地免鉴权网关），由 Node.js 代理从环境变量读取并转发请求。

| 厂商模板 | 默认协议 | 默认 Base URL（可改为中转/私有地址） | 默认 Secrets 环境变量名 |
| :--- | :--- | :--- | :--- |
| **JEV 决策模型** | `openai-compatible` | `https://api.jev.ai/v1` | `JEV_API_KEY` |
| **OpenAI** | `openai-compatible` | `https://api.openai.com/v1` | `OPENAI_API_KEY` |
| **Gemini** | `gemini` | `https://generativelanguage.googleapis.com` | `GEMINI_API_KEY` |
| **Claude** | `anthropic` | `https://api.anthropic.com/v1` | `ANTHROPIC_API_KEY` |
| **DeepSeek** | `openai-compatible` | `https://api.deepseek.com/v1` | `DEEPSEEK_API_KEY` |
| **GLM 智谱** | `openai-compatible` | `https://open.bigmodel.cn/api/paas/v4` | `GLM_API_KEY` |
| **Kimi 月之暗面** | `openai-compatible` | `https://api.moonshot.cn/v1` | `KIMI_API_KEY` |
| **腾讯混元** | `openai-compatible` | `https://api.hunyuan.cloud.tencent.com/v1` | `TENCENT_API_KEY` |
| **其它自定义** | `openai-compatible` / 任选 | `https://openrouter.ai/api/v1`（或本地 Ollama） | `CUSTOM_LLM_API_KEY` / `NONE` |

---

## 四、技术栈与项目目录结构

- **前端**：React 19、TypeScript、Vite 8、Tailwind CSS v4、shadcn/ui（Base UI）、Lucide Icons
- **服务端代理**：Express 4、Node.js ESM、`@google/genai` SDK、原生 `fetch` + `AbortSignal.timeout`
- **桌面端打包**：Electron 35、esbuild（打包内嵌服务端）、electron-builder 26
- **CI/CD**：GitHub Actions（Ubuntu 校验 + Windows & macOS 并行矩阵编译 + 自动 Release 发布）

```text
.
├── .github/
│   └── workflows/
│       └── build-desktop.yml        # GitHub Actions 自动编译 Windows / macOS 并发布 Release
├── build-resources/
│   └── icon.png                     # 512x512 桌面端应用图标（自动转换为 .ico / .icns）
├── components/ui/                   # shadcn/ui 基础组件（button, card, checkbox, input, textarea...）
├── electron/
│   └── main.mjs                     # Electron 主进程（动态空闲端口启动内嵌 Express + 本地 .env 管理菜单）
├── src/
│   ├── components/
│   │   ├── CustomEndpointsPage.tsx  # 自定义模型接口管理页（上下双阶段独立添加窗口 + 9 大厂商模板）
│   │   ├── ImportSection.tsx        # 判官规则编辑、多文件拖拽导入与快速粘贴区
│   │   ├── KnowledgeTable.tsx       # 11 列可编辑表格、TSV 直贴与 CSV 文本直出
│   │   ├── PipelineStatusBar.tsx    # 实时进度条与流水线终端日志
│   │   └── TriageSection.tsx        # 第一阶段初筛队列与第二阶段核查触发器
│   ├── lib/
│   │   ├── exportUtils.ts           # 链接去重、RFC-4180 CSV / TSV / JSON 序列化与下载
│   │   └── fileParser.ts            # .csv / .json / .md / .html 智能解析与外链提取器
│   ├── types/intel.ts               # 核心数据结构与 9 大厂商模板定义
│   ├── App.tsx                      # 主应用视图路由、状态持久化与三阶段编排
│   └── index.css                    # 主题设计系统与深色/浅色双模样式变量
├── .env.example                     # 各厂商环境变量密钥模板
├── electron-builder.yml             # Windows (NSIS/Portable) 与 macOS (DMG/ZIP) 打包配置
├── server.ts                        # Express 多协议安全代理服务（兼容 Web 独立运行与 Electron 内嵌）
├── package.json
└── README.md
```

---

## 五、本地开发与 Web 运行

### 1. 环境准备
需要 **Node.js 20+**（推荐 Node.js 22 LTS）。

```bash
# 安装依赖
npm install

# 复制环境变量模板，并填入你需要使用的厂商 API Key
cp .env.example .env
```

### 2. 启动开发服务器（默认端口 `3000`）

```bash
npm run dev
```

浏览器访问 `http://localhost:3000`，点击右上角 **「自定义接口」** 添加并绑定第一、第二阶段接口即可使用。

### 3. 生产构建与校验

```bash
npm run lint                  # TypeScript 全量静态类型检查
npm run build                 # 构建前端静态资源至 dist/
npm run build:desktop-assets  # 同时构建前端 dist/ 与服务端打包产物 dist-server/server.mjs
```

---

## 六、Windows / macOS 桌面端打包与 GitHub Actions 自动化构建

本项目已内置完整的 Electron 封装与 GitHub Actions 自动化流水线（`.github/workflows/build-desktop.yml`），**无需本地同时拥有 Windows 和 Mac 电脑**，上传 GitHub 即可云端自动产出双平台安装包。

### 方式 A：上传 GitHub 后自动构建（推荐）

#### 第 1 步：推送代码到 GitHub 仓库

```bash
git init
git add .
git commit -m "feat: knowledge intel desk with multi-provider routing and desktop CI"
git branch -M main
git remote add origin https://github.com/<你的用户名>/<你的仓库名>.git
git push -u origin main
```

#### 第 2 步：触发双端编译（两种方式任选）

1. **方式 1 · 推送版本 Tag 自动打包并发布 GitHub Release（推荐）**：
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```
   GitHub Actions 将自动执行：
   - `verify`：在 Ubuntu 上执行 TypeScript 检查与前端/服务端构建校验；
   - `build-desktop (windows-latest)`：编译 Windows x64 **NSIS 安装版（`.exe`）** 与 **绿色便携版（`.exe`）**；
   - `build-desktop (macos-latest)`：编译 macOS **Apple Silicon (`arm64`)** 与 **Intel (`x64`)** 的 **`.dmg`** 与 **`.zip`**；
   - `publish-release`：自动在仓库的 **Releases** 页面创建 `v1.0.0` 版本并附带全部安装包供直接下载。

2. **方式 2 · 在 GitHub 网页端手动点击触发**：
   - 进入仓库 → 顶部 **Actions** → 左侧选择 **Build Desktop (Windows & macOS)** → 点击右侧 **Run workflow**；
   - 若留空 `release_tag`，编译完成后直接在当次 Workflow 运行详情底部的 **Artifacts** 中下载 `KnowledgeIntelDesk-Windows` 和 `KnowledgeIntelDesk-macOS`；
   - 若填入例如 `v1.0.1`，构建完成后将同步自动发布对应 Release。

> **权限说明**：Workflow 已声明 `permissions: contents: write`。如遇私有仓库或组织策略限制 Release 发布，请在仓库 `Settings → Actions → General → Workflow permissions` 中勾选 **Read and write permissions**。

### 方式 B：在本地电脑手动打包桌面端

```bash
# 本地预览 Electron 桌面应用
npm run desktop:dev

# 仅打包 Windows 安装包（需在 Windows 下运行）
npm run desktop:build:win

# 仅打包 macOS 安装包（需在 macOS 下运行）
npm run desktop:build:mac
```

构建产物统一输出在 `release/` 目录下。

---

## 七、桌面端使用与密钥配置说明

1. **零端口冲突**：桌面端启动时自动在 `127.0.0.1` 上分配系统空闲端口运行内嵌 Express 代理服务，退出应用时自动回收进程。
2. **本地配置 API Key（`.env`）**：
   - 首次打开桌面端时，程序会自动在系统用户数据目录生成 `.env` 模板文件；
   - 点击应用顶部原生菜单 **「配置与密钥 → 打开密钥配置文件 (.env)」**，填入您需要使用的厂商密钥（例如 `JEV_API_KEY`、`DEEPSEEK_API_KEY`、`OPENAI_API_KEY`、`GEMINI_API_KEY` 等）并保存；
   - 点击菜单 **「配置与密钥 → 重新加载应用（使新 .env 生效）」** 即可立即在「自定义接口」页面看到对应环境变量变为 **已就绪**。
3. **未签名安装包首次运行提示（GitHub Actions 默认免费构建）**：
   - **Windows**：SmartScreen 提示「Windows 已保护你的电脑」时，点击 **更多信息 → 仍要运行**；
   - **macOS**：如提示「无法验证开发者」或「已损坏」，在终端执行以下命令移除隔离属性后即可正常打开：
     ```bash
     xattr -cr /Applications/KnowledgeIntelDesk.app
     ```
   - 如需正式代码签名，可在仓库 Secrets 中配置 Apple Developer / Windows 证书环境变量，并将 `.github/workflows/build-desktop.yml` 中的 `CSC_IDENTITY_AUTO_DISCOVERY` 改为 `true`。

---

## 八、关键边界问题修复记录（Review Checklist）

- **推理模型 `<think>` 干扰剥离**：在解析 JSON 前自动清理 `<think>...</think>` 与 `<reasoning>...</reasoning>` 思考块，防止推理文本导致四分类或 11 列提取失败。
- **外部模型代理超时与兼容重试**：所有自定义接口请求均内置 `AbortSignal.timeout` 防挂死保护；遇到 `o1 / o3` 等不支持 `temperature`、`max_tokens` 或 `response_format` 的接口时自动降级重试。
- **HTML 导出嵌套去重**：解析 `.html` 书签或网页保存文件时自动过滤外层包裹节点，杜绝重复提取。
- **表格编辑状态竞争修复**：修复下拉选择一级分类与核查结论时 `onBlur` 覆盖新值及连续复制提示定时器冲突的问题。
- **跨视图平滑导航**：从「自定义接口」页点击顶部流程导航时自动切回工作台并滚动至对应功能区块。
