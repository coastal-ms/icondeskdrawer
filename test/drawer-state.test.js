const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createInitialState,
  insertEmptySlot,
  normalizeState,
  removeSlotItem,
  setSlot,
} = require("../src/drawer-state");
const { drawerSize, normalizeScale } = require("../src/drawer-scale");

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

test("clamps drawer scale between 50% and 125%", () => {
  assert.equal(normalizeScale(0.25), 0.5);
  assert.equal(normalizeScale(1.1), 1.1);
  assert.equal(normalizeScale(2), 1.25);
});

test("scales horizontal and vertical drawer geometry", () => {
  assert.deepEqual(drawerSize(3, "horizontal", 0.5), {
    width: 127,
    height: 39,
  });
  assert.deepEqual(drawerSize(4, "horizontal", 1.25), {
    width: 415,
    height: 98,
  });
  assert.deepEqual(drawerSize(3, "vertical", 1.25), {
    width: 90,
    height: 318,
  });
});
