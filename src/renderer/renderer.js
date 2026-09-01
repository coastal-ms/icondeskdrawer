const drawer = document.querySelector("#drawer");
const drawerTrack = document.querySelector("#drawer-track");
const status = document.querySelector("#status");
const slotTemplate = document.querySelector("#slot-template");
const HOLD_TO_INSERT_MS = 600;

let items = [];
let gapTimer;
let internalDragIndex = null;
let suppressNextClick = false;
let windowDragPointer = null;

function itemLabel(item, index) {
  return item
    ? `Launch ${item.name}. Right-click to remove.`
    : `Empty launcher key ${index + 1}. Drop an item here.`;
}

async function persist() {
  items = await window.drawerApi.save(items);
  await window.drawerApi.fitSlots(items.length);
}

function compactSlots() {
  items = items.filter(Boolean);
  while (items.length < 3) items.push(null);
}

function clearGapTimer() {
  window.clearTimeout(gapTimer);
  gapTimer = undefined;
}

function setStatus(message) {
  status.textContent = message;
}

async function fileFromDrop(event) {
  const file = event.dataTransfer?.files?.[0];
  if (!file) throw new Error("No Windows item was found in that drop.");

  const filePath = window.drawerApi.pathForFile(file);
  if (!filePath) throw new Error("That item does not expose a Windows file path.");

  return window.drawerApi.describe(filePath);
}

async function assignDrop(event, index, insert) {
  event.preventDefault();
  clearGapTimer();

  try {
    if (internalDragIndex !== null) {
      const sourceIndex = internalDragIndex;
      internalDragIndex = null;

      if (insert) {
        const [moved] = items.splice(sourceIndex, 1);
        const destination = sourceIndex < index ? index - 1 : index;
        items.splice(destination, 0, moved);
      } else if (sourceIndex !== index) {
        [items[sourceIndex], items[index]] = [items[index], items[sourceIndex]];
      }

      await persist();
      render();
      setStatus("Launcher keys rearranged.");
      window.setTimeout(() => {
        suppressNextClick = false;
      }, 0);
      return;
    }

    setStatus("Reading Windows icon…");
    const item = await fileFromDrop(event);
    if (insert) items.splice(index, 0, item);
    else items[index] = item;
    await persist();
    render();
    setStatus(`${item.name} is ready.`);
  } catch (error) {
    setStatus(error.message || "That item could not be added.");
  }
}

function createGap(index, edge = false) {
  const gap = document.createElement("div");
  gap.className = "gap";
  gap.classList.toggle("is-edge", edge);
  gap.dataset.index = index;
  gap.setAttribute("aria-hidden", "true");

  gap.addEventListener("dragenter", (event) => {
    event.preventDefault();
    clearGapTimer();
    gap.classList.add("is-waiting");
    setStatus("Hold here to open a new key…");
    gapTimer = window.setTimeout(() => {
      gap.classList.remove("is-waiting");
      gap.classList.add("is-armed");
      setStatus("New key ready—release to add.");
    }, HOLD_TO_INSERT_MS);
  });

  gap.addEventListener("dragover", (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  });

  gap.addEventListener("dragleave", (event) => {
    if (gap.contains(event.relatedTarget)) return;
    clearGapTimer();
    gap.classList.remove("is-waiting", "is-armed");
  });

  gap.addEventListener("drop", (event) => {
    const armed = gap.classList.contains("is-armed");
    gap.classList.remove("is-waiting", "is-armed");
    if (armed) assignDrop(event, index, true);
    else {
      event.preventDefault();
      setStatus("Hold between keys until the space opens.");
    }
  });

  return gap;
}

function createSlot(item, index) {
  const slot = slotTemplate.content.firstElementChild.cloneNode(true);

  slot.dataset.index = index;
  slot.setAttribute("aria-label", itemLabel(item, index));
  slot.title = item?.name || "Drop an item here";

  if (item) {
    const icon = document.createElement("img");
    icon.className = "item-icon";
    icon.alt = "";
    icon.draggable = false;
    icon.src = item.icon;
    slot.querySelector(".icon-host").append(icon);
    slot.classList.add("has-item");
    slot.draggable = true;
  }

  slot.addEventListener("dragstart", (event) => {
    if (!item || windowDragPointer !== null) {
      event.preventDefault();
      return;
    }

    internalDragIndex = index;
    suppressNextClick = true;
    slot.classList.add("is-dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-icon-drawer-index", String(index));
    setStatus("Drop on another key to move, or outside the drawer to remove.");
  });

  slot.addEventListener("dragend", async (event) => {
    slot.classList.remove("is-dragging");
    if (internalDragIndex === null) {
      window.setTimeout(() => {
        suppressNextClick = false;
      }, 0);
      return;
    }

    const outside =
      event.screenX < window.screenX ||
      event.screenX > window.screenX + window.outerWidth ||
      event.screenY < window.screenY ||
      event.screenY > window.screenY + window.outerHeight;
    const removedItem = items[internalDragIndex];
    internalDragIndex = null;

    if (outside && removedItem) {
      items[index] = null;
      compactSlots();
      await persist();
      render();
      setStatus(`${removedItem.name} removed.`);
    } else {
      setStatus(`${item.name} kept in the drawer.`);
    }

    window.setTimeout(() => {
      suppressNextClick = false;
    }, 0);
  });

  slot.addEventListener("dragover", (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    slot.classList.add("is-dragover");
  });

  slot.addEventListener("dragleave", () => {
    slot.classList.remove("is-dragover");
  });

  slot.addEventListener("drop", (event) => {
    slot.classList.remove("is-dragover");
    assignDrop(event, index, false);
  });

  slot.addEventListener("click", async () => {
    if (suppressNextClick) {
      suppressNextClick = false;
      return;
    }
    if (!item || slot.classList.contains("is-launching")) return;

    slot.classList.add("is-pressed", "is-launching");
    setStatus(`Opening ${item.name}…`);
    window.setTimeout(() => slot.classList.remove("is-pressed"), 105);

    try {
      await new Promise((resolve) => window.setTimeout(resolve, 125));
      await window.drawerApi.launch(item.path);
      setStatus(`${item.name} launched.`);
    } catch (error) {
      setStatus(error.message || `${item.name} could not be opened.`);
    } finally {
      slot.classList.remove("is-launching");
    }
  });

  slot.addEventListener("contextmenu", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!item) {
      window.drawerApi.showContextMenu();
      return;
    }
    items[index] = null;
    compactSlots();
    await persist();
    render();
    setStatus(`${item.name} removed.`);
  });

  return slot;
}

function render() {
  drawerTrack.replaceChildren();

  drawerTrack.append(createGap(0, true));
  items.forEach((item, index) => {
    drawerTrack.append(createSlot(item, index));
    drawerTrack.append(createGap(index + 1, index === items.length - 1));
  });
}

document.addEventListener("dragover", (event) => event.preventDefault());
document.addEventListener("drop", (event) => event.preventDefault());
document.addEventListener("dragend", clearGapTimer);
document.querySelector(".drawer-shell").addEventListener("contextmenu", (event) => {
  event.preventDefault();
  window.drawerApi.showContextMenu();
});

document.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || event.target.closest(".item-icon")) return;

  windowDragPointer = event.pointerId;
  suppressNextClick = true;
  event.target.setPointerCapture?.(event.pointerId);
  document.body.classList.add("is-moving");
  window.drawerApi.beginWindowDrag({ x: event.screenX, y: event.screenY });
});

document.addEventListener("pointermove", (event) => {
  if (event.pointerId !== windowDragPointer) return;
  window.drawerApi.moveWindowDrag({ x: event.screenX, y: event.screenY });
});

function endWindowDrag(event) {
  if (event.pointerId !== windowDragPointer) return;
  windowDragPointer = null;
  document.body.classList.remove("is-moving");
  window.drawerApi.endWindowDrag();
  window.setTimeout(() => {
    suppressNextClick = false;
  }, 0);
}

document.addEventListener("pointerup", endWindowDrag);
document.addEventListener("pointercancel", endWindowDrag);

function applyOrientation(orientation) {
  const vertical = orientation === "vertical";
  document.body.classList.toggle("is-vertical", vertical);
}

window.drawerApi.onOrientationChanged(applyOrientation);

Promise.all([window.drawerApi.load(), window.drawerApi.orientation()])
  .then(([loaded, windowState]) => {
    items = loaded;
    applyOrientation(windowState.orientation);
    render();
    return window.drawerApi.fitSlots(items.length);
  })
  .catch((error) => {
    setStatus(error.message || "The drawer could not load saved items.");
  });
