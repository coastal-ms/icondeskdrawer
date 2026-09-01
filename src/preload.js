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
  beginWindowDrag: () => ipcRenderer.send("window:drag-begin"),
  moveWindowDrag: () => ipcRenderer.send("window:drag-move"),
  endWindowDrag: () => ipcRenderer.send("window:drag-end"),
  showDragPreview: (icon) => ipcRenderer.send("drag-preview:show", icon),
  moveDragPreview: () => ipcRenderer.send("drag-preview:move"),
  hideDragPreview: () => ipcRenderer.send("drag-preview:hide"),
});
