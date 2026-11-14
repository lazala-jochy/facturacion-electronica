import { app, BrowserWindow, dialog, ipcMain, safeStorage, session, type OpenDialogOptions } from "electron";
import path from "path";
import { spawn, type ChildProcess } from "child_process";
import fs from "fs";
import { autoUpdater } from "electron-updater";
import log from "electron-log";

let mainWindow: BrowserWindow | null = null;
let backendProcess: ChildProcess | null = null;
let currentBackendCompanyId: number | null = null;
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

/**
 * 30s de margen: en Windows, una primera corrida que tiene que aplicar todas
 * las migraciones de Prisma (o un antivirus escaneando node_modules) puede
 * tardar bastante mas que los 6s que se usaban antes, y el usuario solo veia
 * "Backend no respondio a tiempo" sin pista de si fue timeout real o un
 * crash del proceso.
 */
const waitForBackend = async () => {
  const maxAttempts = 150;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (backendProcess && backendProcess.exitCode !== null) {
      throw new Error(`El proceso del backend termino inesperadamente (codigo ${backendProcess.exitCode}).`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${BACKEND_PORT}/health`);
      if (response.ok) return;
    } catch {
      // backend still booting
    }
    await wait(200);
  }
  throw new Error(`Backend no respondio a tiempo (${(maxAttempts * 200) / 1000}s).`);
};

const isPidAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/**
 * Si un cierre anormal (force quit, crash) deja el backend anterior corriendo,
 * sigue ocupando BACKEND_PORT con una base de datos ya abierta. El backend
 * nuevo nunca logra escuchar el puerto, pero `waitForBackend` igual recibe un
 * /health 200 del huerfano -> la app conversa con datos viejos en silencio.
 */
const killStaleBackend = (pidFile: string) => {
  if (!fs.existsSync(pidFile)) return;
  const previousPid = Number(fs.readFileSync(pidFile, "utf8").trim());
  if (Number.isInteger(previousPid) && previousPid > 0 && isPidAlive(previousPid)) {
    try {
      process.kill(previousPid, "SIGKILL");
    } catch {
      // ya habia terminado entre el chequeo y el kill
    }
  }
  fs.rmSync(pidFile, { force: true });
};

/**
 * Versiones previas guardaban los logos dentro de `backend-runtime/uploads`,
 * que vive en los recursos de la app y se reemplaza en cada actualizacion.
 * Si ese directorio legado todavia existe (instalacion que esta actualizando)
 * y el nuevo (persistente, en userData) esta vacio, copiamos el contenido una
 * sola vez para no perder el logo ya subido.
 */
const migrateLegacyUploads = (legacyDir: string, targetDir: string) => {
  if (!fs.existsSync(legacyDir)) return;
  const alreadyMigrated = fs.existsSync(targetDir) && fs.readdirSync(targetDir).length > 0;
  if (alreadyMigrated) return;
  try {
    fs.cpSync(legacyDir, targetDir, { recursive: true });
  } catch (error) {
    log.error("No se pudo migrar uploads legados a userData.", error);
  }
};

/**
 * Credenciales de Postgres por empresa (DATABASE_URL del rol dedicado que
 * devuelve la Edge Function de login/registro), cifradas con el keychain del
 * SO via safeStorage -- nunca en localStorage del renderer. Una empresa =
 * un archivo; permite "cuentas guardadas" sin mezclar roles de Postgres.
 */
const credentialsDir = (): string => {
  const dir = path.join(app.getPath("userData"), "db-credentials");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
};

const credentialPath = (companyId: number): string =>
  path.join(credentialsDir(), `${companyId}.enc`);

type StoredCredential = { databaseUrl: string; appSecretsKey: string };

const saveDbCredential = (companyId: number, credential: StoredCredential): void => {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("El cifrado seguro del sistema operativo no esta disponible en este equipo.");
  }
  fs.writeFileSync(credentialPath(companyId), safeStorage.encryptString(JSON.stringify(credential)));
};

const loadDbCredential = (companyId: number): StoredCredential | null => {
  const file = credentialPath(companyId);
  if (!fs.existsSync(file)) return null;
  if (!safeStorage.isEncryptionAvailable()) return null;
  try {
    return JSON.parse(safeStorage.decryptString(fs.readFileSync(file))) as StoredCredential;
  } catch (error) {
    log.error(`No se pudo descifrar la credencial de la empresa ${companyId}.`, error);
    return null;
  }
};

/**
 * Arranca (o reinicia, si ya corria para otra empresa) el backend local con
 * el DATABASE_URL del rol de Postgres dedicado de `companyId`. Las
 * migraciones ya NO corren aca -- se aplican una vez por release contra
 * Supabase (ver backend/src/index.ts).
 */
const startBackendForCompany = async (companyId: number, credential: StoredCredential): Promise<void> => {
  if (!app.isPackaged) {
    // En dev, el backend corre aparte (`npm run dev`) contra el DATABASE_URL de su .env.
    return;
  }
  if (backendProcess && currentBackendCompanyId === companyId) {
    return; // ya corriendo para esta empresa, nada que hacer
  }
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
    currentBackendCompanyId = null;
  }

  const backendRuntime = path.join(process.resourcesPath, "backend-runtime");
  const backendEntry = path.join(backendRuntime, "dist", "index.js");
  const userDataPath = app.getPath("userData");
  const pidFile = path.join(userDataPath, "backend.pid");
  const uploadsDir = path.join(userDataPath, "uploads");

  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  migrateLegacyUploads(path.join(backendRuntime, "uploads"), uploadsDir);

  killStaleBackend(pidFile);

  const ecfTestAssets = path.join(process.resourcesPath, "ecf-test-assets");

  backendProcess = spawn(process.execPath, [backendEntry], {
    cwd: backendRuntime,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      PORT: String(BACKEND_PORT),
      DATABASE_URL: credential.databaseUrl,
      APP_SECRETS_KEY: credential.appSecretsKey,
      UPLOADS_DIR: uploadsDir,
      ...(fs.existsSync(ecfTestAssets) ? { ECF_TEST_ASSETS_DIR: ecfTestAssets } : {}),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  currentBackendCompanyId = companyId;

  backendProcess.stdout?.on("data", (chunk: Buffer) => log.info(`[backend] ${chunk.toString().trimEnd()}`));
  backendProcess.stderr?.on("data", (chunk: Buffer) => log.error(`[backend] ${chunk.toString().trimEnd()}`));

  if (backendProcess.pid) {
    fs.writeFileSync(pidFile, String(backendProcess.pid));
  }
  backendProcess.on("exit", (code) => {
    log.info(`[backend] proceso terminado, codigo ${code}`);
    fs.rmSync(pidFile, { force: true });
    currentBackendCompanyId = null;
  });

  await waitForBackend();
};

ipcMain.handle(
  "auth:complete",
  async (
    _event,
    { companyId, databaseUrl, appSecretsKey }: { companyId: number; databaseUrl: string; appSecretsKey: string },
  ) => {
    // En dev, el backend corre aparte (`npm run dev`) con su propio .env -- no hay
    // nada que guardar/arrancar aqui, y no toda esa infraestructura tiene por que
    // existir en una maquina de desarrollo.
    if (!app.isPackaged) return { ok: true as const };
    try {
      const credential = { databaseUrl, appSecretsKey };
      saveDbCredential(companyId, credential);
      await startBackendForCompany(companyId, credential);
      return { ok: true as const };
    } catch (error) {
      log.error("[auth:complete] fallo al iniciar el backend.", error);
      return { ok: false as const, message: error instanceof Error ? error.message : String(error) };
    }
  },
);

ipcMain.handle("auth:resume", async (_event, companyId: number) => {
  if (!app.isPackaged) return { ok: true as const };

  const credential = loadDbCredential(companyId);
  if (!credential) {
    return { ok: false as const, message: "No hay credenciales guardadas para esta empresa." };
  }
  try {
    await startBackendForCompany(companyId, credential);
    return { ok: true as const };
  } catch (error) {
    log.error("[auth:resume] fallo al reanudar el backend.", error);
    return { ok: false as const, message: error instanceof Error ? error.message : String(error) };
  }
});

/**
 * El renderer borra la sesion de localStorage al cerrar sesion, pero esa
 * escritura no se garantiza en disco de inmediato (Chromium la agenda en
 * segundo plano) -- si el proceso se mata (crash, kill -9, corte de luz)
 * justo despues, el logout puede no haber llegado a persistirse y la app
 * reabre con la sesion vieja. flushStorageData() fuerza la escritura ya.
 */
ipcMain.handle("app:flush-storage", () => {
  session.defaultSession.flushStorageData();
  return { ok: true as const };
});

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
    app.setName(org ? `Lazala Facturación ${org}.` : "Lazala Facturación.");
    if (process.platform === "darwin") {
      app.dock?.setIcon(getAppIconPath());
    }
    // El backend ya no arranca aqui: necesita el DATABASE_URL del rol de
    // Postgres de una empresa, que solo se conoce tras login/registro (o al
    // reanudar una sesion guardada) -- ver ipcMain "auth:complete"/"auth:resume"
    // y frontend/src/services/api.ts.
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

// Cmd+Q / "Salir" del dock no siempre pasa por "window-all-closed" antes de
// terminar el proceso -- sin esto, el backend (un proceso hijo aparte) queda
// huerfano corriendo en segundo plano tras cerrar la app.
app.on("before-quit", () => {
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
  }
});