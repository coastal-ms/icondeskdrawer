const {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeImage,
  screen,
  shell,
  Tray,
} = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { normalizeState } = require("./drawer-state");
const {
  DEFAULT_SCALE,
  drawerSize,
  normalizeScale,
  scalePixels,
} = require("./drawer-scale");
const execFileAsync = promisify(execFile);

let mainWindow;
let dragPreviewWindow;
let scaleWindow;
let dragPreviewBounds;
let dragPreviewMovePending = false;
let dragPreviewMoveTimer = null;
let tray;
let stateFile;
let windowStateFile;
let saveBoundsTimer;
let currentOrientation = "horizontal";
let currentAlwaysOnTop = true;
let currentLocked = false;
let currentSlotCount = 3;
let currentScale = DEFAULT_SCALE;
let isQuitting = false;
let windowDragStart = null;
const WINDOW_LAYOUT_VERSION = 5;
const MINIMUM_SLOT_COUNT = 3;

function validateFilePath(filePath) {
  if (
    typeof filePath !== "string" ||
    filePath.length === 0 ||
    filePath.includes("\0") ||
    !path.isAbsolute(filePath)
  ) {
    throw new TypeError("A valid absolute Windows path is required.");
  }

  return filePath;
}

async function readState() {
  try {
    const data = await fs.readFile(stateFile, "utf8");
    const saved = normalizeState(JSON.parse(data));
    const refreshed = await Promise.all(
      saved.map(async (item) => {
        if (!item) return null;
        try {
          return await describePath(item.path);
        } catch (error) {
          console.warn(`Could not refresh icon for ${item.path}:`, error.message);
          return item;
        }
      }),
    );
    await writeState(refreshed);
    return refreshed;
  } catch (error) {
    if (error.code === "ENOENT") return normalizeState([]);
    throw error;
  }
}

async function writeState(items) {
  const normalized = normalizeState(items);
  await fs.writeFile(stateFile, JSON.stringify(normalized, null, 2), "utf8");
  return normalized;
}

async function readWindowState() {
  try {
    const value = JSON.parse(await fs.readFile(windowStateFile, "utf8"));
    return {
      orientation: value.orientation === "vertical" ? "vertical" : "horizontal",
      alwaysOnTop: value.alwaysOnTop !== false,
      locked: value.locked === true,
      scale: normalizeScale(value.scale),
      bounds:
        value.layoutVersion === WINDOW_LAYOUT_VERSION &&
        value.bounds &&
        ["x", "y", "width", "height"].every((key) =>
          Number.isInteger(value.bounds[key]),
        )
          ? value.bounds
          : undefined,
    };
  } catch (error) {
    if (error.code === "ENOENT") {
      return {
        orientation: "horizontal",
        alwaysOnTop: true,
        locked: false,
        scale: DEFAULT_SCALE,
      };
    }
    throw error;
  }
}

async function writeWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  await fs.writeFile(
    windowStateFile,
    JSON.stringify(
      {
        layoutVersion: WINDOW_LAYOUT_VERSION,
        orientation: currentOrientation,
        alwaysOnTop: currentAlwaysOnTop,
        locked: currentLocked,
        scale: currentScale,
        bounds: mainWindow.getBounds(),
      },
      null,
      2,
    ),
    "utf8",
  );
}

function applyOrientation(orientation) {
  const vertical = orientation === "vertical";
  const minimum = drawerSize(MINIMUM_SLOT_COUNT, orientation, currentScale);
  mainWindow.setMinimumSize(minimum.width, minimum.height);
  mainWindow.setMaximumSize(
    vertical ? minimum.width : 10000,
    vertical ? 10000 : minimum.height,
  );
}

function fitWindowToSlots(slotCount, anchorBounds = mainWindow?.getBounds()) {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const count = Math.max(MINIMUM_SLOT_COUNT, Number(slotCount) || 0);
  currentSlotCount = count;
  const bounds = anchorBounds;
  const workArea = screen.getDisplayMatching(bounds).workArea;
  const vertical = currentOrientation === "vertical";
  const requested = drawerSize(count, currentOrientation, currentScale);
  const targetWidth = Math.min(requested.width, workArea.width - 24);
  const targetHeight = Math.min(requested.height, workArea.height - 24);
  const x = vertical || currentLocked
    ? bounds.x
    : Math.round(bounds.x - (targetWidth - bounds.width) / 2);
  const y = !vertical || currentLocked
    ? bounds.y
    : Math.round(bounds.y - (targetHeight - bounds.height) / 2);

  mainWindow.setBounds(
    {
      x: Math.max(workArea.x, Math.min(x, workArea.x + workArea.width - targetWidth)),
      y: Math.max(
        workArea.y,
        Math.min(y, workArea.y + workArea.height - targetHeight),
      ),
      width: targetWidth,
      height: targetHeight,
    },
    true,
  );
}

async function describePath(filePath) {
  validateFilePath(filePath);
  const stats = await fs.stat(filePath);
  const parsed = path.parse(filePath);
  let iconSource = filePath;
  let iconIndex = 0;
  let useResourceIcon = false;
  let iconDataUrl;

  if (parsed.ext.toLowerCase() === ".lnk") {
    const shortcut = shell.readShortcutLink(filePath);
    const configuredIcon = expandEnvironmentPath(shortcut.icon);
    const target = expandEnvironmentPath(shortcut.target);

    if (configuredIcon && (await pathExists(configuredIcon))) {
      iconSource = configuredIcon;
      iconIndex = shortcut.iconIndex;
      useResourceIcon = Number.isInteger(iconIndex) && iconIndex !== 0;
    } else if (target && (await pathExists(target))) {
      iconSource = target;
    }
  } else if (parsed.ext.toLowerCase() === ".url") {
    const shortcut = await readInternetShortcut(filePath);
    const configuredIcon = expandEnvironmentPath(shortcut.IconFile);

    if (configuredIcon && (await pathExists(configuredIcon))) {
      iconSource = configuredIcon;
    }
  }

  if (
    !iconDataUrl &&
    useResourceIcon &&
    path.extname(iconSource).toLowerCase() !== ".ico"
  ) {
    iconDataUrl = await extractWindowsResourceIcon(iconSource, iconIndex);
  }

  if (!iconDataUrl) {
    const image =
      path.extname(iconSource).toLowerCase() === ".ico"
        ? nativeImage.createFromPath(iconSource)
        : await app.getFileIcon(iconSource, { size: "large" });
    iconDataUrl = image.isEmpty()
      ? nativeImage.createEmpty().toDataURL()
      : image.toDataURL();
  }

  return {
    path: filePath,
    name: stats.isDirectory() ? parsed.base : parsed.name,
    icon: iconDataUrl,
  };
}

async function readInternetShortcut(filePath) {
  const content = await fs.readFile(filePath, "utf8");
  const values = {};

  for (const line of content.split(/\r?\n/)) {
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    values[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }

  return values;
}

async function extractWindowsResourceIcon(filePath, iconIndex = 0) {
  const command = [
    "Add-Type -AssemblyName System.Drawing",
    "Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class IconExtractor { [DllImport(\"shell32.dll\", CharSet = CharSet.Unicode)] public static extern uint ExtractIconEx(string file, int index, IntPtr[] large, IntPtr[] small, uint count); [DllImport(\"user32.dll\")] public static extern bool DestroyIcon(IntPtr handle); }'",
    "$large = New-Object IntPtr[] 1",
    "$small = New-Object IntPtr[] 1",
    "$count = [IconExtractor]::ExtractIconEx($env:ICON_DRAWER_SOURCE, [int]$env:ICON_DRAWER_INDEX, $large, $small, 1)",
    "if ($count -eq 0) { exit 2 }",
    "$handle = if ($large[0] -ne [IntPtr]::Zero) { $large[0] } else { $small[0] }",
    "$icon = [System.Drawing.Icon]::FromHandle($handle).Clone()",
    "if ($large[0] -ne [IntPtr]::Zero) { [IconExtractor]::DestroyIcon($large[0]) | Out-Null }",
    "if ($small[0] -ne [IntPtr]::Zero) { [IconExtractor]::DestroyIcon($small[0]) | Out-Null }",
    "$bitmap = $icon.ToBitmap()",
    "$stream = New-Object System.IO.MemoryStream",
    "$bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)",
    "[Console]::Out.Write([Convert]::ToBase64String($stream.ToArray()))",
    "$stream.Dispose()",
    "$bitmap.Dispose()",
    "$icon.Dispose()",
  ].join("; ");

  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", command],
      {
        env: {
          ...process.env,
          ICON_DRAWER_SOURCE: filePath,
          ICON_DRAWER_INDEX: String(Number.isInteger(iconIndex) ? iconIndex : 0),
        },
        maxBuffer: 2 * 1024 * 1024,
        windowsHide: true,
      },
    );
    return stdout ? `data:image/png;base64,${stdout.trim()}` : null;
  } catch (error) {
    console.warn(`Could not extract icon resource from ${filePath}:`, error.message);
    return null;
  }
}

function expandEnvironmentPath(value) {
  if (!value) return "";
  return value.replace(/%([^%]+)%/g, (_match, name) => process.env[name] || "");
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function createWindow(windowState) {
  const vertical = windowState.orientation === "vertical";
  currentOrientation = windowState.orientation;
  currentAlwaysOnTop = windowState.alwaysOnTop;
  currentLocked = windowState.locked;
  currentScale = windowState.scale;
  const initialSize = drawerSize(
    MINIMUM_SLOT_COUNT,
    currentOrientation,
    currentScale,
  );
  mainWindow = new BrowserWindow({
    width: initialSize.width,
    height: initialSize.height,
    x: windowState.bounds?.x,
    y: windowState.bounds?.y,
    minWidth: initialSize.width,
    minHeight: initialSize.height,
    maxWidth: vertical ? initialSize.width : undefined,
    maxHeight: vertical ? undefined : initialSize.height,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: currentAlwaysOnTop,
    movable: !currentLocked,
    skipTaskbar: true,
    show: false,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
  mainWindow.webContents.setZoomFactor(currentScale);
  applyOrientation(windowState.orientation);
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event) => event.preventDefault());
  const scheduleBoundsSave = () => {
    clearTimeout(saveBoundsTimer);
    saveBoundsTimer = setTimeout(
      () => writeWindowState(),
      180,
    );
  };
  mainWindow.on("move", scheduleBoundsSave);
  mainWindow.on("resize", scheduleBoundsSave);
  mainWindow.on("will-resize", (event) => event.preventDefault());
  mainWindow.on("maximize", () => {
    mainWindow.unmaximize();
    fitWindowToSlots(currentSlotCount);
  });
  mainWindow.on("hide", () => dragPreviewWindow?.hide());
  mainWindow.on("close", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    mainWindow.hide();
  });
  mainWindow.once("ready-to-show", async () => {
    mainWindow.show();

    const captureArgument = process.argv.find((value) =>
      value.startsWith("--capture="),
    );
    if (captureArgument) {
      const capturePath = captureArgument.slice("--capture=".length);
      await new Promise((resolve) => setTimeout(resolve, 350));
      const image = await mainWindow.capturePage();
      await fs.writeFile(capturePath, image.toPNG());
      app.quit();
    }
  });
}

function createDragPreviewWindow() {
  const displays = screen.getAllDisplays();
  const left = Math.min(...displays.map(({ bounds }) => bounds.x));
  const top = Math.min(...displays.map(({ bounds }) => bounds.y));
  const right = Math.max(
    ...displays.map(({ bounds }) => bounds.x + bounds.width),
  );
  const bottom = Math.max(
    ...displays.map(({ bounds }) => bounds.y + bounds.height),
  );
  dragPreviewBounds = {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };

  dragPreviewWindow = new BrowserWindow({
    ...dragPreviewBounds,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    maximizable: false,
    fullscreenable: false,
    focusable: false,
    skipTaskbar: true,
    show: false,
    hasShadow: false,
    alwaysOnTop: true,
    enableLargerThanScreen: true,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "drag-preview-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  dragPreviewWindow.setIgnoreMouseEvents(true);
  dragPreviewWindow.setAlwaysOnTop(true, "floating");
  dragPreviewWindow.loadFile(
    path.join(__dirname, "renderer", "drag-preview.html"),
  );
  dragPreviewWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  dragPreviewWindow.webContents.on("will-navigate", (event) =>
    event.preventDefault(),
  );
}

function positionDragPreview() {
  const pointer = screen.getCursorScreenPoint();
  if (
    !dragPreviewWindow ||
    dragPreviewWindow.isDestroyed() ||
    !dragPreviewBounds ||
    !pointer
  ) {
    return;
  }

  dragPreviewWindow.webContents.send("drag-preview:set-position", {
    x: Math.round(pointer.x - dragPreviewBounds.x),
    y: Math.round(pointer.y - dragPreviewBounds.y),
  });
}

function queueDragPreviewPosition() {
  dragPreviewMovePending = true;
  if (dragPreviewMoveTimer) return;

  dragPreviewMoveTimer = setTimeout(() => {
    dragPreviewMoveTimer = null;
    if (!dragPreviewMovePending) return;
    dragPreviewMovePending = false;
    positionDragPreview();
  }, 16);
}

function hideDragPreview() {
  clearTimeout(dragPreviewMoveTimer);
  dragPreviewMoveTimer = null;
  dragPreviewMovePending = false;
  dragPreviewWindow?.hide();
  fitWindowToSlots(currentSlotCount);
}

async function showDragPreview(icon) {
  if (
    typeof icon !== "string" ||
    !icon.startsWith("data:image/") ||
    !dragPreviewWindow ||
    dragPreviewWindow.isDestroyed()
  ) {
    return;
  }

  if (dragPreviewWindow.webContents.isLoading()) {
    await new Promise((resolve) =>
      dragPreviewWindow.webContents.once("did-finish-load", resolve),
    );
  }
  fitWindowToSlots(currentSlotCount);
  dragPreviewWindow.webContents.send("drag-preview:set-icon", {
    source: icon,
    size: scalePixels(44, currentScale),
  });
  positionDragPreview();
  dragPreviewWindow.showInactive();
}

function showDrawer() {
  if (!mainWindow) return;
  mainWindow.show();
  mainWindow.focus();
}

function toggleDrawer() {
  if (mainWindow?.isVisible()) mainWindow.hide();
  else showDrawer();
}

async function setOrientation(orientation) {
  if (orientation === currentOrientation) return;
  const anchorBounds = mainWindow.getBounds();
  currentOrientation = orientation;
  applyOrientation(orientation);
  fitWindowToSlots(currentSlotCount, anchorBounds);
  mainWindow.webContents.send("window:orientation-changed", orientation);
  await writeWindowState();
  updateTrayMenu();
}

async function setAlwaysOnTop(enabled) {
  currentAlwaysOnTop = enabled;
  mainWindow.setAlwaysOnTop(enabled);
  await writeWindowState();
  updateTrayMenu();
}

async function setLocked(locked) {
  currentLocked = locked;
  mainWindow.setMovable(!locked);
  await writeWindowState();
  updateTrayMenu();
}

function positionScaleWindow() {
  if (!scaleWindow || scaleWindow.isDestroyed() || !tray) return;

  const trayBounds = tray.getBounds();
  const display = screen.getDisplayNearestPoint({
    x: Math.round(trayBounds.x + trayBounds.width / 2),
    y: Math.round(trayBounds.y + trayBounds.height / 2),
  });
  const { workArea } = display;
  const [width, height] = scaleWindow.getSize();
  const x = Math.max(
    workArea.x,
    Math.min(
      Math.round(trayBounds.x + trayBounds.width / 2 - width / 2),
      workArea.x + workArea.width - width,
    ),
  );
  const above = trayBounds.y - height - 8;
  const y = above >= workArea.y
    ? above
    : Math.min(
        trayBounds.y + trayBounds.height + 8,
        workArea.y + workArea.height - height,
      );
  scaleWindow.setPosition(x, y);
}

function createScaleWindow() {
  scaleWindow = new BrowserWindow({
    width: 260,
    height: 86,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    alwaysOnTop: true,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "scale-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  scaleWindow.loadFile(path.join(__dirname, "renderer", "scale.html"));
  scaleWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  scaleWindow.webContents.on("will-navigate", (event) => event.preventDefault());
  scaleWindow.on("blur", () => scaleWindow?.hide());
  scaleWindow.on("close", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    scaleWindow.hide();
  });
}

function showScaleWindow() {
  if (!scaleWindow || scaleWindow.isDestroyed()) createScaleWindow();
  positionScaleWindow();
  scaleWindow.webContents.send("scale:changed", Math.round(currentScale * 100));
  scaleWindow.show();
  scaleWindow.focus();
}

function setScale(value) {
  const nextScale = normalizeScale(value);
  if (nextScale === currentScale) return currentScale;

  const anchorBounds = mainWindow.getBounds();
  currentScale = nextScale;
  mainWindow.webContents.setZoomFactor(currentScale);
  applyOrientation(currentOrientation);
  fitWindowToSlots(currentSlotCount, anchorBounds);
  scaleWindow?.webContents.send("scale:changed", Math.round(currentScale * 100));
  updateTrayMenu();
  clearTimeout(saveBoundsTimer);
  saveBoundsTimer = setTimeout(() => writeWindowState(), 150);
  return currentScale;
}

function updateTrayMenu() {
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open Drawer", click: showDrawer },
      { label: "Hide Drawer", click: () => mainWindow?.hide() },
      { type: "separator" },
      {
        label: "Orientation",
        submenu: [
          {
            label: "Horizontal",
            type: "radio",
            checked: currentOrientation === "horizontal",
            click: () => setOrientation("horizontal"),
          },
          {
            label: "Vertical",
            type: "radio",
            checked: currentOrientation === "vertical",
            click: () => setOrientation("vertical"),
          },
        ],
      },
      {
        label: `Scale: ${Math.round(currentScale * 100)}%…`,
        click: showScaleWindow,
      },
      {
        label: "Always on top",
        type: "checkbox",
        checked: currentAlwaysOnTop,
        click: (menuItem) => setAlwaysOnTop(menuItem.checked),
      },
      {
        label: "Lock in place",
        type: "checkbox",
        checked: currentLocked,
        click: (menuItem) => setLocked(menuItem.checked),
      },
      { type: "separator" },
      {
        label: "Exit",
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]),
  );
}

function showDrawerContextMenu() {
  Menu.buildFromTemplate([
    { label: "Close drawer", click: () => mainWindow?.hide() },
  ]).popup({ window: mainWindow });
}

function beginWindowDrag() {
  const pointer = screen.getCursorScreenPoint();
  if (
    currentLocked ||
    !mainWindow ||
    mainWindow.isDestroyed() ||
    !pointer
  ) {
    windowDragStart = null;
    return;
  }

  windowDragStart = {
    pointer,
    bounds: mainWindow.getBounds(),
  };
}

function moveWindowDrag() {
  const pointer = screen.getCursorScreenPoint();
  if (
    !windowDragStart ||
    currentLocked ||
    !mainWindow ||
    mainWindow.isDestroyed() ||
    !pointer
  ) {
    return;
  }

  mainWindow.setBounds({
    x: Math.round(
      windowDragStart.bounds.x + pointer.x - windowDragStart.pointer.x,
    ),
    y: Math.round(
      windowDragStart.bounds.y + pointer.y - windowDragStart.pointer.y,
    ),
    width: windowDragStart.bounds.width,
    height: windowDragStart.bounds.height,
  });
}

function createTray() {
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, "assets", "icon.png")
    : path.join(__dirname, "..", "build", "icon.png");
  const icon = nativeImage.createFromPath(iconPath).resize({
    width: 16,
    height: 16,
  });

  tray = new Tray(icon);
  tray.setToolTip("Icon Desk Drawer");
  updateTrayMenu();
  tray.on("click", toggleDrawer);
}

app.whenReady().then(() => {
  app.setAppUserModelId("com.coastal.icondeskdrawer");
  stateFile = path.join(app.getPath("userData"), "drawer.json");
  windowStateFile = path.join(app.getPath("userData"), "window.json");

  ipcMain.handle("drawer:load", readState);
  ipcMain.handle("drawer:save", (_event, items) => writeState(items));
  ipcMain.handle("drawer:describe", (_event, filePath) => describePath(filePath));
  ipcMain.handle("drawer:launch", async (_event, filePath) => {
    validateFilePath(filePath);
    const message = await shell.openPath(filePath);
    if (message) throw new Error(message);
  });
  ipcMain.handle("window:show-context-menu", showDrawerContextMenu);
  ipcMain.handle("scale:get", () => Math.round(currentScale * 100));
  ipcMain.handle("scale:set", (_event, percent) => {
    const numericPercent = Number(percent);
    if (!Number.isFinite(numericPercent)) {
      throw new TypeError("Scale must be a number.");
    }
    return Math.round(setScale(numericPercent / 100) * 100);
  });
  ipcMain.on("scale:close", () => scaleWindow?.hide());
  ipcMain.on("window:drag-begin", beginWindowDrag);
  ipcMain.on("window:drag-move", moveWindowDrag);
  ipcMain.on("window:drag-end", () => {
    windowDragStart = null;
    fitWindowToSlots(currentSlotCount);
  });
  ipcMain.on("drag-preview:show", (_event, icon) => {
    showDragPreview(icon);
  });
  ipcMain.on("drag-preview:move", () => {
    queueDragPreviewPosition();
  });
  ipcMain.on("drag-preview:hide", () => {
    hideDragPreview();
  });
  ipcMain.handle("window:orientation", () => ({
    orientation: currentOrientation,
  }));
  ipcMain.handle("window:fit-slots", (_event, slotCount) => {
    fitWindowToSlots(slotCount);
  });

  readWindowState().then((windowState) => {
    if (process.argv.includes("--vertical")) {
      windowState.orientation = "vertical";
      windowState.bounds = undefined;
    }
    createWindow(windowState);
    createDragPreviewWindow();
    createTray();
  });
});

app.on("before-quit", () => {
  isQuitting = true;
});
