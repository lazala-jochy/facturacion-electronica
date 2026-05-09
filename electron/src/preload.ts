import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  getDesktopParentPath: () => ipcRenderer.invoke("ecf-desktop-parent") as Promise<string>,
  pickOutputParentFolder: () =>
    ipcRenderer.invoke("ecf-pick-parent-folder") as Promise<string | null>,
});