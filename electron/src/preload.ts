import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  getDesktopParentPath: () => ipcRenderer.invoke("ecf-desktop-parent") as Promise<string>,
  pickOutputParentFolder: () =>
    ipcRenderer.invoke("ecf-pick-parent-folder") as Promise<string | null>,
  pickAcecfExcelFile: () =>
    ipcRenderer.invoke("acecf-pick-excel-file") as Promise<{ path: string; name: string } | null>,
  pickEcfExcelFile: () =>
    ipcRenderer.invoke("ecf-pick-excel-file") as Promise<{ path: string; name: string } | null>,
});