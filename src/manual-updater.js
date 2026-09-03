function createManualUpdater({
  autoUpdater,
  isPackaged,
  onBeforeInstall,
  onBusyChange,
  logger = console,
}) {
  let busy = false;

  function setBusy(value) {
    if (busy === value) return;
    busy = value;
    onBusyChange(value);
  }

  function handleError(error) {
    if (busy) {
      logger.error("Could not update Icon Desk Drawer:", error.message);
    }
    setBusy(false);
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = false;

  autoUpdater.on("update-available", () => {
    autoUpdater.downloadUpdate().catch(handleError);
  });
  autoUpdater.on("update-not-available", () => setBusy(false));
  autoUpdater.on("update-downloaded", () => {
    onBeforeInstall();
    autoUpdater.quitAndInstall(true, true);
  });
  autoUpdater.on("error", handleError);

  return {
    get busy() {
      return busy;
    },
    async check() {
      if (!isPackaged || busy) return false;

      setBusy(true);
      try {
        const result = await autoUpdater.checkForUpdates();
        if (!result) setBusy(false);
        return true;
      } catch (error) {
        handleError(error);
        return false;
      }
    },
  };
}

module.exports = { createManualUpdater };
