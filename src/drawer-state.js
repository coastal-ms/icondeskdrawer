const MINIMUM_SLOTS = 3;

function createInitialState() {
  return Array.from({ length: MINIMUM_SLOTS }, () => null);
}

function normalizeState(value) {
  const items = Array.isArray(value)
    ? value.map((item) => normalizeItem(item))
    : [];

  while (items.length < MINIMUM_SLOTS) {
    items.push(null);
  }

  return items;
}

function normalizeItem(item) {
  if (
    !item ||
    typeof item.path !== "string" ||
    typeof item.name !== "string" ||
    typeof item.icon !== "string"
  ) {
    return null;
  }

  return {
    path: item.path,
    name: item.name,
    icon: item.icon,
  };
}

function insertEmptySlot(items, index) {
  const next = normalizeState(items);
  const safeIndex = Math.max(0, Math.min(index, next.length));
  next.splice(safeIndex, 0, null);
  return next;
}

function setSlot(items, index, item) {
  const next = normalizeState(items);
  if (!Number.isInteger(index) || index < 0 || index >= next.length) {
    throw new RangeError("Slot index is outside the drawer.");
  }

  next[index] = normalizeItem(item);
  return next;
}

function removeSlotItem(items, index) {
  const next = normalizeState(items);
  if (!Number.isInteger(index) || index < 0 || index >= next.length) {
    throw new RangeError("Slot index is outside the drawer.");
  }

  next[index] = null;

  while (
    next.length > MINIMUM_SLOTS &&
    next.filter(Boolean).length <= next.length - 1
  ) {
    const lastEmpty = next.findLastIndex((item) => item === null);
    if (lastEmpty === -1) break;
    next.splice(lastEmpty, 1);
  }

  return normalizeState(next);
}

module.exports = {
  MINIMUM_SLOTS,
  createInitialState,
  insertEmptySlot,
  normalizeState,
  removeSlotItem,
  setSlot,
};
