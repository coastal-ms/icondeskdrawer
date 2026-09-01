const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("drawerApi", {
  load: () => ipcRenderer.invoke("drawer:load"),
  save: (items) => ipcRenderer.invoke("drawer:save", items),
  describe: (filePath) => ipcRenderer.invoke("drawer:describe", filePath),
  launch: (filePath) => ipcRenderer.invoke("drawer:launch", filePath),
  pathForFile: (file) => webUtils.getPathForFile(file),
  orientation: () => ipcRenderer.invoke("window:orientation"),
  fitSlots: (slotCount) => ipcRenderer.invoke("window:fit-slots", slotCount),
  onOrientationChanged: (callback) => {
    ipcRenderer.on("window:orientation-changed", (_event, orientation) =>
      callback(orientation),
    );
  },
  showContextMenu: () => ipcRenderer.invoke("window:show-context-menu"),
  beginWindowDrag: (point) => ipcRenderer.send("window:drag-begin", point),
  moveWindowDrag: (point) => ipcRenderer.send("window:drag-move", point),
  endWindowDrag: () => ipcRenderer.send("window:drag-end"),
  showDragPreview: (icon, point) =>
    ipcRenderer.send("drag-preview:show", icon, point),
  moveDragPreview: (point) => ipcRenderer.send("drag-preview:move", point),
  hideDragPreview: () => ipcRenderer.send("drag-preview:hide"),
});
