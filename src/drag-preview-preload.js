const { ipcRenderer } = require("electron");

window.addEventListener("DOMContentLoaded", () => {
  const icon = document.querySelector("#drag-preview-icon");
  let iconSize = 44;

  ipcRenderer.on("drag-preview:set-icon", (_event, preview) => {
    iconSize = preview.size;
    icon.src = preview.source;
    icon.style.width = `${iconSize}px`;
    icon.style.height = `${iconSize}px`;
  });
  ipcRenderer.on("drag-preview:set-position", (_event, point) => {
    const offset = iconSize / 2;
    icon.style.transform = `translate3d(${point.x - offset}px, ${point.y - offset}px, 0)`;
  });
});
