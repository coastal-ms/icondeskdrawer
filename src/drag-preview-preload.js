const { ipcRenderer } = require("electron");

window.addEventListener("DOMContentLoaded", () => {
  const icon = document.querySelector("#drag-preview-icon");
  ipcRenderer.on("drag-preview:set-icon", (_event, source) => {
    icon.src = source;
  });
  ipcRenderer.on("drag-preview:set-position", (_event, point) => {
    icon.style.transform = `translate3d(${point.x - 22}px, ${point.y - 22}px, 0)`;
  });
});
