const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { createManualUpdater } = require("../src/manual-updater");

function createUpdater() {
  const updater = new EventEmitter();
  updater.checkCalls = 0;
  updater.downloadCalls = 0;
  updater.installCalls = [];
  updater.checkForUpdates = async () => {
    updater.checkCalls += 1;
    return {};
  };
  updater.downloadUpdate = async () => {
    updater.downloadCalls += 1;
  };
  updater.quitAndInstall = (...args) => updater.installCalls.push(args);
  return updater;
}

test("checks only when explicitly requested in a packaged app", async () => {
  const autoUpdater = createUpdater();
  let noUpdateMessageCount = 0;
  const controller = createManualUpdater({
    autoUpdater,
    isPackaged: true,
    onBeforeInstall() {},
    onBusyChange() {},
    onUpdateNotAvailable: () => {
      noUpdateMessageCount += 1;
    },
  });

  assert.equal(autoUpdater.checkCalls, 0);
  assert.equal(await controller.check(), true);
  assert.equal(autoUpdater.checkCalls, 1);
  assert.equal(controller.busy, true);

  autoUpdater.emit("update-not-available");
  assert.equal(controller.busy, false);
  assert.equal(autoUpdater.downloadCalls, 0);
  assert.equal(noUpdateMessageCount, 1);
});

test("downloads and silently installs an available update", async () => {
  const autoUpdater = createUpdater();
  let beforeInstall = false;
  const controller = createManualUpdater({
    autoUpdater,
    isPackaged: true,
    onBeforeInstall: () => {
      beforeInstall = true;
    },
    onBusyChange() {},
    onUpdateNotAvailable() {},
  });

  await controller.check();
  autoUpdater.emit("update-available");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(autoUpdater.downloadCalls, 1);

  autoUpdater.emit("update-downloaded");
  assert.equal(beforeInstall, true);
  assert.deepEqual(autoUpdater.installCalls, [[true, true]]);
});

test("does not check for updates in an unpackaged app", async () => {
  const autoUpdater = createUpdater();
  const controller = createManualUpdater({
    autoUpdater,
    isPackaged: false,
    onBeforeInstall() {},
    onBusyChange() {},
    onUpdateNotAvailable() {},
  });

  assert.equal(await controller.check(), false);
  assert.equal(autoUpdater.checkCalls, 0);
});
