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
});