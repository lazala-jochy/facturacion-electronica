import { app, BrowserWindow } from "electron";
import path from "path";
import { spawn, type ChildProcess } from "child_process";
import { pathToFileURL } from "url";
import fs from "fs";

let mainWindow: BrowserWindow | null = null;
let backendProcess: ChildProcess | null = null;
const BACKEND_PORT = 3001;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForBackend = async () => {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(`http://localhost:${BACKEND_PORT}/health`);
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

  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  backendProcess = spawn(process.execPath, [backendEntry], {
    cwd: backendRuntime,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      PORT: String(BACKEND_PORT),
      DATABASE_URL: `file:${dbPath}`,
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
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  if (app.isPackaged) {
    const filePath = path.join(process.resourcesPath, "frontend-dist", "index.html");
    mainWindow.loadURL(pathToFileURL(filePath).toString());
  } else {
    mainWindow.loadURL("http://localhost:5173/");
  }

  // Debug: open dev tools
  //mainWindow.webContents.openDevTools();
}

app.whenReady().then(async () => {
  startBackend();
  if (app.isPackaged) {
    await waitForBackend();
  }
  createWindow();

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