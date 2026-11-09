import { app, BrowserWindow, dialog, ipcMain, type OpenDialogOptions } from "electron";
import path from "path";
import { spawn, type ChildProcess } from "child_process";
import { pathToFileURL } from "url";
import fs from "fs";
import { autoUpdater } from "electron-updater";
import log from "electron-log";

let mainWindow: BrowserWindow | null = null;
let backendProcess: ChildProcess | null = null;
const BACKEND_PORT = 3001;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
/** Icono de ventana / dock (`electron/assets/`). Sin espacios en el nombre para evitar rutas rotas en build. */
const getAppIconPath = (): string => {
  const assetsDir = path.join(__dirname, "..", "assets");
  const primary = path.join(assetsDir, "default.png");
  if (fs.existsSync(primary)) return primary;
  const fallback512 = path.join(assetsDir, "icon.iconset", "icon_512x512.png");
  if (fs.existsSync(fallback512)) return fallback512;
  return primary;
};
const isProduction = app.isPackaged;
const UPDATE_CHECK_INTERVAL_MS = 1000 * 60 * 30;

/** Ruta del Escritorio (para carpeta de resultados DGII desde la vista web). */
ipcMain.handle("ecf-desktop-parent", () => app.getPath("desktop"));

/** Selector de carpeta donde se creará `ECF-DGII-Pruebas-…` (subcarpetas xml/ y firmados/). */
ipcMain.handle("ecf-pick-parent-folder", async (event) => {
  const parentWindow = BrowserWindow.fromWebContents(event.sender);
  const defaultPath = app.getPath("desktop");
  const options: OpenDialogOptions = {
    title: "Elegir carpeta para guardar los XML de prueba",
    defaultPath,
    properties: ["openDirectory", "createDirectory"],
  };
  const result = parentWindow
    ? await dialog.showOpenDialog(parentWindow, options)
    : await dialog.showOpenDialog(options);
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

/** Excel del set DGII — Pruebas de datos e-CF. */
ipcMain.handle("ecf-pick-excel-file", async (event) => {
  const parentWindow = BrowserWindow.fromWebContents(event.sender);
  const options: OpenDialogOptions = {
    title: "Elegir Excel de pruebas e-CF (DGII)",
    defaultPath: app.getPath("downloads"),
    properties: ["openFile"],
    filters: [{ name: "Excel", extensions: ["xlsx", "xls"] }],
  };
  const result = parentWindow
    ? await dialog.showOpenDialog(parentWindow, options)
    : await dialog.showOpenDialog(options);
  if (result.canceled || !result.filePaths.length) return null;
  const filePath = result.filePaths[0];
  return { path: filePath, name: path.basename(filePath) };
});

/** Version actual de la app (para mostrarla en el frontend). */
ipcMain.handle("ecf-app-version", () => app.getVersion());

/** Disparar un chequeo manual de actualizaciones desde el frontend. */
ipcMain.handle("ecf-check-for-updates", async () => {
  if (!app.isPackaged) {
    return { ok: false, message: "Las actualizaciones solo funcionan en la app instalada." };
  }
  try {
    await autoUpdater.checkForUpdates();
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido.";
    return { ok: false, message };
  }
});

/** Excel del set DGII — Aprobaciones comerciales (ACECF). */
ipcMain.handle("acecf-pick-excel-file", async (event) => {
  const parentWindow = BrowserWindow.fromWebContents(event.sender);
  const options: OpenDialogOptions = {
    title: "Elegir Excel de aprobaciones comerciales (DGII)",
    defaultPath: app.getPath("downloads"),
    properties: ["openFile"],
    filters: [{ name: "Excel", extensions: ["xlsx", "xls"] }],
  };
  const result = parentWindow
    ? await dialog.showOpenDialog(parentWindow, options)
    : await dialog.showOpenDialog(options);
  if (result.canceled || !result.filePaths.length) return null;
  const filePath = result.filePaths[0];
  return { path: filePath, name: path.basename(filePath) };
});

const waitForBackend = async () => {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${BACKEND_PORT}/health`);
      if (response.ok) return;
    } catch {
      // backend still booting
    }
    await wait(200);
  }
  throw new Error("Backend no respondio a tiempo.");
};

function startBackend() {
  if (!app.isPackaged) {
    return;
  }

  const backendRuntime = path.join(process.resourcesPath, "backend-runtime");
  const backendEntry = path.join(backendRuntime, "dist", "index.js");
  const userDataPath = app.getPath("userData");
  const dbDir = path.join(userDataPath, "db");
  const dbPath = path.join(dbDir, "facturacion.db");
  const databaseUrl = pathToFileURL(dbPath).href;

  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const ecfTestAssets = path.join(process.resourcesPath, "ecf-test-assets");

  backendProcess = spawn(process.execPath, [backendEntry], {
    cwd: backendRuntime,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      PORT: String(BACKEND_PORT),
      DATABASE_URL: databaseUrl,
      ...(fs.existsSync(ecfTestAssets) ? { ECF_TEST_ASSETS_DIR: ecfTestAssets } : {}),
    },
    stdio: "inherit",
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1300,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    icon: getAppIconPath(),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (app.isPackaged) {
    const filePath = path.join(process.resourcesPath, "frontend-dist", "index.html");
    // `loadFile` maneja mejor rutas relativas del build (Vite) que `file://` + URLs absolutas.
    void mainWindow.loadFile(filePath);
  } else {
    mainWindow.loadURL("http://localhost:5173/");
  }
}

const setupAutoUpdater = () => {
  if (!isProduction) {
    log.info("[auto-update] Skipping updater in development mode.");
    return;
  }

  log.transports.file.level = "info";
  autoUpdater.logger = log;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = false;

  const currentVersion = app.getVersion();
  log.info(`[auto-update] Current app version: v${currentVersion}`);

  try {
    const packageJsonPath = path.join(app.getAppPath(), "package.json");
    const packageJsonRaw = fs.readFileSync(packageJsonPath, "utf8");
    const packageJson = JSON.parse(packageJsonRaw) as {
      build?: {
        publish?: Array<{ provider?: string; owner?: string; repo?: string }>;
      };
    };
    const githubPublish = packageJson.build?.publish?.find(
      (item) => item.provider === "github",
    );
    if (githubPublish?.owner && githubPublish.repo) {
      log.info(
        `[auto-update] Publish target confirmed: github/${githubPublish.owner}/${githubPublish.repo}`,
      );
    } else {
      log.error("[auto-update] Missing or invalid GitHub publish config in package.json");
    }
  } catch (error) {
    log.error("[auto-update] Could not validate publish config:", error);
  }

  const feedUrl = (autoUpdater as unknown as { getFeedURL?: () => string | null }).getFeedURL?.();
  if (feedUrl) {
    log.info(`[auto-update] Feed URL: ${feedUrl}`);
  } else {
    log.info("[auto-update] Feed URL not available before first update check (expected).");
  }

  autoUpdater.on("checking-for-update", () => {
    log.info("[auto-update] checking-for-update");
    mainWindow?.webContents.send("update-status", { status: "checking" });
  });

  autoUpdater.on("update-available", (info) => {
    log.info(
      `[auto-update] update-available current=v${currentVersion} latest=v${info.version}`,
    );
    log.info(`[auto-update] update payload files=${JSON.stringify(info.files ?? [])}`);
    mainWindow?.webContents.send("update-status", {
      status: "available",
      version: info.version,
    });
  });

  autoUpdater.on("update-not-available", (info) => {
    log.info(
      `[auto-update] update-not-available current=v${currentVersion} latest=v${info.version}`,
    );
    mainWindow?.webContents.send("update-status", { status: "not-available" });
  });

  autoUpdater.on("download-progress", (progressObj) => {
    log.info(
      `[auto-update] download-progress percent=${progressObj.percent.toFixed(2)} transferred=${progressObj.transferred} total=${progressObj.total} bytesPerSecond=${progressObj.bytesPerSecond}`,
    );
    mainWindow?.webContents.send("update-status", {
      status: "downloading",
      percent: progressObj.percent,
    });
  });

  autoUpdater.on("update-downloaded", async (info) => {
    log.info(`[auto-update] update-downloaded latest=v${info.version}`);
    mainWindow?.webContents.send("update-status", {
      status: "downloaded",
      version: info.version,
    });
    const result = await dialog.showMessageBox({
      type: "info",
      buttons: ["Restart Now", "Later"],
      defaultId: 0,
      cancelId: 1,
      title: "Update ready",
      message: "A new version is ready. Restart now?",
    });
    const resultWithResponse = result as { response?: number };
    const userAcceptedInstall = resultWithResponse.response === 0;

    if (userAcceptedInstall) {
      log.info("[auto-update] User accepted update install. Calling quitAndInstall().");
      autoUpdater.quitAndInstall();
    } else {
      log.info("[auto-update] User postponed update install.");
    }
  });

  autoUpdater.on("error", (error) => {
    log.error("[auto-update] error:", error);
    mainWindow?.webContents.send("update-status", {
      status: "error",
      message: error?.message ?? String(error),
    });
    dialog.showErrorBox(
      "Error de actualizacion",
      `No se pudo buscar/descargar la actualizacion.\n\n${error?.message ?? String(error)}`,
    );
  });
};

app.whenReady().then(async () => {
  try {
    const org = process.env.VITE_ORGANIZATION_NAME?.trim() || process.env.ORGANIZATION_NAME?.trim();
    app.setName(org ? `Facturación Electrónica ${org}.` : "Facturación Electrónica.");
    if (process.platform === "darwin") {
      app.dock?.setIcon(getAppIconPath());
    }
    startBackend();
    if (app.isPackaged) {
      await waitForBackend();
    }
    createWindow();
    setupAutoUpdater();
    if (isProduction) {
      void autoUpdater.checkForUpdatesAndNotify();
      setInterval(() => {
        void autoUpdater.checkForUpdatesAndNotify();
      }, UPDATE_CHECK_INTERVAL_MS);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido al iniciar.";
    dialog.showErrorBox("No se pudo iniciar la aplicacion", message);
    app.quit();
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// IMPORTANT: keep app alive (macOS fix)
app.on("window-all-closed", () => {
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
  }
  if (process.platform !== "darwin") {
    app.quit();
  }
});