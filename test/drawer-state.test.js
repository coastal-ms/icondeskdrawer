const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createInitialState,
  insertEmptySlot,
  normalizeState,
  removeSlotItem,
  setSlot,
} = require("../src/drawer-state");

const item = {
  path: "C:\\Apps\\Example.exe",
  name: "Example",
  icon: "data:image/png;base64,example",
};

test("starts with three empty slots", () => {
  assert.deepEqual(createInitialState(), [null, null, null]);
});

test("normalizes persisted state to at least three slots", () => {
  assert.deepEqual(normalizeState([item]), [item, null, null]);
});

test("inserts a new slot at a gap", () => {
  assert.deepEqual(insertEmptySlot([item, null, null], 1), [
    item,
    null,
    null,
    null,
  ]);
});

test("sets and removes a slot item", () => {
  const populated = setSlot(createInitialState(), 1, item);
  assert.equal(populated[1].path, item.path);
  assert.deepEqual(removeSlotItem(populated, 1), [null, null, null]);
});
