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
let itemPointerDrag = null;
let highlightedGap = null;

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

function clearInternalDropHighlight() {
  highlightedGap?.classList.remove("is-waiting");
  highlightedGap = null;
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

    icon.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      itemPointerDrag = {
        pointerId: event.pointerId,
        index,
        item,
        slot,
        startX: event.screenX,
        startY: event.screenY,
        active: false,
      };
      icon.setPointerCapture(event.pointerId);
    });
  }

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
  window.drawerApi.beginWindowDrag();
});

document.addEventListener("pointermove", (event) => {
  if (event.pointerId === itemPointerDrag?.pointerId) {
    if (
      !itemPointerDrag.active &&
      Math.hypot(
        event.screenX - itemPointerDrag.startX,
        event.screenY - itemPointerDrag.startY,
      ) >= 5
    ) {
      itemPointerDrag.active = true;
      internalDragIndex = itemPointerDrag.index;
      suppressNextClick = true;
      itemPointerDrag.slot.classList.add("is-dragging");
      window.drawerApi.showDragPreview(itemPointerDrag.item.icon);
      setStatus("Drop on a key or gap to move, or outside to remove.");
    }

    if (itemPointerDrag.active) {
      window.drawerApi.moveDragPreview();
      clearInternalDropHighlight();
      highlightedGap = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest(".gap");
      highlightedGap?.classList.add("is-waiting");
    }
    return;
  }

  if (event.pointerId !== windowDragPointer) return;
  window.drawerApi.moveWindowDrag();
});

async function endItemPointerDrag(event) {
  if (event.pointerId !== itemPointerDrag?.pointerId) return;

  const drag = itemPointerDrag;
  itemPointerDrag = null;
  drag.slot.classList.remove("is-dragging");
  window.drawerApi.hideDragPreview();
  clearInternalDropHighlight();

  if (!drag.active) return;

  const target = document.elementFromPoint(event.clientX, event.clientY);
  const gap = target?.closest(".gap");
  const slot = target?.closest(".slot");
  const outside =
    event.screenX < window.screenX ||
    event.screenX > window.screenX + window.outerWidth ||
    event.screenY < window.screenY ||
    event.screenY > window.screenY + window.outerHeight;

  if (outside) {
    items[drag.index] = null;
    compactSlots();
    setStatus(`${drag.item.name} removed.`);
  } else if (gap) {
    const gapIndex = Number(gap.dataset.index);
    const [moved] = items.splice(drag.index, 1);
    const destination = drag.index < gapIndex ? gapIndex - 1 : gapIndex;
    items.splice(destination, 0, moved);
    setStatus(`${drag.item.name} moved.`);
  } else if (slot) {
    const destination = Number(slot.dataset.index);
    if (destination !== drag.index) {
      [items[drag.index], items[destination]] = [
        items[destination],
        items[drag.index],
      ];
    }
    setStatus(`${drag.item.name} moved.`);
  } else {
    setStatus(`${drag.item.name} kept in the drawer.`);
    internalDragIndex = null;
    suppressNextClick = false;
    return;
  }

  internalDragIndex = null;
  await persist();
  render();
  window.setTimeout(() => {
    suppressNextClick = false;
  }, 0);
}

function cancelItemPointerDrag(event) {
  if (event.pointerId !== itemPointerDrag?.pointerId) return;
  itemPointerDrag.slot.classList.remove("is-dragging");
  itemPointerDrag = null;
  internalDragIndex = null;
  suppressNextClick = false;
  clearInternalDropHighlight();
  window.drawerApi.hideDragPreview();
}

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
document.addEventListener("pointerup", endItemPointerDrag);
document.addEventListener("pointercancel", cancelItemPointerDrag);

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
