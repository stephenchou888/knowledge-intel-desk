import { app, BrowserWindow, dialog, Menu, shell } from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, "..");

process.env.NODE_ENV = "production";
process.env.ELECTRON_EMBEDDED = "1";

let mainWindow = null;
let embeddedServer = null;

function ensureUserEnvFile() {
  const userDataDir = app.getPath("userData");
  const envPath = path.join(userDataDir, ".env");
  if (!fs.existsSync(envPath)) {
    try {
      fs.mkdirSync(userDataDir, { recursive: true });
      fs.writeFileSync(
        envPath,
        [
          "# ============================================================================",
          "# 知识库信息核查 · 本地安全密钥配置文件",
          "# 请在等号右侧填入您需要使用的厂商真实 API Key，保存后点击顶部菜单「重新加载应用」生效",
          "# ============================================================================",
          "",
          "JEV_API_KEY=",
          "OPENAI_API_KEY=",
          "GEMINI_API_KEY=",
          "ANTHROPIC_API_KEY=",
          "DEEPSEEK_API_KEY=",
          "GLM_API_KEY=",
          "KIMI_API_KEY=",
          "TENCENT_API_KEY=",
          "CUSTOM_LLM_API_KEY=",
          "",
        ].join("\n"),
        "utf-8"
      );
    } catch (err) {
      console.error("Failed to initialize user .env template:", err);
    }
  }
  return envPath;
}

function buildAppMenu(envPath) {
  const isMac = process.platform === "darwin";

  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about", label: "关于 知识库信息核查" },
              { type: "separator" },
              { role: "services", label: "服务" },
              { type: "separator" },
              { role: "hide", label: "隐藏" },
              { role: "hideOthers", label: "隐藏其他" },
              { role: "unhide", label: "显示全部" },
              { type: "separator" },
              { role: "quit", label: "退出" },
            ],
          },
        ]
      : []),
    {
      label: "配置与密钥",
      submenu: [
        {
          label: "打开密钥配置文件 (.env)",
          click: () => {
            shell.openPath(envPath);
          },
        },
        {
          label: "打开配置所在目录",
          click: () => {
            shell.showItemInFolder(envPath);
          },
        },
        { type: "separator" },
        {
          label: "重新加载应用（使新 .env 生效）",
          click: () => {
            app.relaunch();
            app.exit(0);
          },
        },
        ...(!isMac
          ? [{ type: "separator" }, { role: "quit", label: "退出" }]
          : []),
      ],
    },
    {
      label: "编辑",
      submenu: [
        { role: "undo", label: "撤销" },
        { role: "redo", label: "重做" },
        { type: "separator" },
        { role: "cut", label: "剪切" },
        { role: "copy", label: "复制" },
        { role: "paste", label: "粘贴" },
        { role: "selectAll", label: "全选" },
      ],
    },
    {
      label: "视图",
      submenu: [
        { role: "reload", label: "刷新页面" },
        { role: "forceReload", label: "强制刷新" },
        { role: "toggleDevTools", label: "开发者工具" },
        { type: "separator" },
        { role: "resetZoom", label: "重置缩放" },
        { role: "zoomIn", label: "放大" },
        { role: "zoomOut", label: "缩小" },
        { type: "separator" },
        { role: "togglefullscreen", label: "切换全屏" },
      ],
    },
    {
      label: "窗口",
      submenu: [
        { role: "minimize", label: "最小化" },
        { role: "zoom", label: "缩放" },
        ...(isMac
          ? [{ type: "separator" }, { role: "front", label: "置于顶层" }]
          : [{ role: "close", label: "关闭窗口" }]),
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function createMainWindow(serverUrl) {
  const iconPath = path.join(appRoot, "build-resources", "icon.png");

  mainWindow = new BrowserWindow({
    width: 1420,
    height: 920,
    minWidth: 1024,
    minHeight: 680,
    title: "知识库信息核查",
    backgroundColor: "#0a0a0a",
    show: false,
    ...(fs.existsSync(iconPath) ? { icon: iconPath } : {}),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  // Open external links (X, GitHub, official docs) in the user's system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  await mainWindow.loadURL(serverUrl);
}

async function bootstrapDesktopApp() {
  const envPath = ensureUserEnvFile();
  buildAppMenu(envPath);

  const serverModuleUrl = new URL("../dist-server/server.mjs", import.meta.url);
  const { startServer } = await import(serverModuleUrl.href);

  const distDir = path.join(appRoot, "dist");
  const { server, port } = await startServer({
    port: 0,
    host: "127.0.0.1",
    distDir,
    envFilePath: envPath,
  });

  embeddedServer = server;
  await createMainWindow(`http://127.0.0.1:${port}`);
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    bootstrapDesktopApp().catch((err) => {
      console.error("Desktop bootstrap failed:", err);
      dialog.showErrorBox(
        "启动失败",
        `本地代理服务启动异常：${err instanceof Error ? err.message : String(err)}`
      );
      app.quit();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0 && embeddedServer) {
      const addr = embeddedServer.address();
      if (addr && typeof addr === "object") {
        await createMainWindow(`http://127.0.0.1:${addr.port}`);
      }
    }
  });

  app.on("before-quit", () => {
    if (embeddedServer) {
      try {
        embeddedServer.close();
      } catch {
        // ignore close errors during shutdown
      }
      embeddedServer = null;
    }
  });
}
