const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("scaleApi", {
  get: () => ipcRenderer.invoke("scale:get"),
  set: (percent) => ipcRenderer.invoke("scale:set", percent),
  close: () => ipcRenderer.send("scale:close"),
  onChanged: (callback) => {
    ipcRenderer.on("scale:changed", (_event, percent) => callback(percent));
  },
});
