import { contextBridge, ipcRenderer } from "electron";

type UpdateStatus =
  | { status: "checking" }
  | { status: "available"; version: string }
  | { status: "not-available" }
  | { status: "downloading"; percent: number }
  | { status: "downloaded"; version: string }
  | { status: "error"; message: string };

contextBridge.exposeInMainWorld("electronAPI", {
  getDesktopParentPath: () => ipcRenderer.invoke("ecf-desktop-parent") as Promise<string>,
  pickOutputParentFolder: () =>
    ipcRenderer.invoke("ecf-pick-parent-folder") as Promise<string | null>,
  pickAcecfExcelFile: () =>
    ipcRenderer.invoke("acecf-pick-excel-file") as Promise<{ path: string; name: string } | null>,
  pickEcfExcelFile: () =>
    ipcRenderer.invoke("ecf-pick-excel-file") as Promise<{ path: string; name: string } | null>,
  getAppVersion: () => ipcRenderer.invoke("ecf-app-version") as Promise<string>,
  checkForUpdates: () =>
    ipcRenderer.invoke("ecf-check-for-updates") as Promise<{ ok: boolean; message?: string }>,
  onUpdateStatus: (callback: (status: UpdateStatus) => void) => {
    const listener = (_event: unknown, status: UpdateStatus) => callback(status);
    ipcRenderer.on("update-status", listener);
    return () => ipcRenderer.removeListener("update-status", listener);
  },
  /** Tras login/registro: persiste el DATABASE_URL + appSecretsKey de esta empresa y (re)arranca el backend local con ellos. */
  completeAuth: (companyId: number, databaseUrl: string, appSecretsKey: string) =>
    ipcRenderer.invoke("auth:complete", { companyId, databaseUrl, appSecretsKey }) as Promise<
      { ok: true } | { ok: false; message: string }
    >,
  /** Reanuda el backend para una empresa con credencial ya guardada (sesion restaurada, cambio de cuenta). */
  resumeBackend: (companyId: number) =>
    ipcRenderer.invoke("auth:resume", companyId) as Promise<
      { ok: true } | { ok: false; message: string }
    >,
  /** Fuerza a guardar en disco YA el localStorage (ver cerrar sesion) -- sin esto un kill justo despues del logout puede perderlo. */
  flushStorage: () => ipcRenderer.invoke("app:flush-storage") as Promise<{ ok: true }>,
});