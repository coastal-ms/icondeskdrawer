const { ipcRenderer } = require("electron");

window.addEventListener("DOMContentLoaded", () => {
  const icon = document.querySelector("#drag-preview-icon");
  ipcRenderer.on("drag-preview:set-icon", (_event, source) => {
    icon.src = source;
  });
});
