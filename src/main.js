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
const execFileAsync = promisify(execFile);

let mainWindow;
let tray;
let stateFile;
let windowStateFile;
let saveBoundsTimer;
let currentOrientation = "horizontal";
let currentAlwaysOnTop = true;
let currentLocked = false;
let currentSlotCount = 3;
let isQuitting = false;
let windowDragStart = null;
const WINDOW_LAYOUT_VERSION = 5;
const MINIMUM_SLOT_COUNT = 3;
const SLOT_STEP = 78;
const HORIZONTAL_BASE_WIDTH = 254;
const HORIZONTAL_HEIGHT = 78;
const VERTICAL_BASE_HEIGHT = 254;

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
      return { orientation: "horizontal", alwaysOnTop: true, locked: false };
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
        bounds: mainWindow.getBounds(),
      },
      null,
      2,
    ),
    "utf8",
  );
}

function applyOrientation(orientation, resize = true) {
  const vertical = orientation === "vertical";
  mainWindow.setMinimumSize(vertical ? 72 : 254, vertical ? 254 : HORIZONTAL_HEIGHT);
  mainWindow.setMaximumSize(vertical ? 72 : 10000, vertical ? 10000 : HORIZONTAL_HEIGHT);

  if (resize) {
    const [width, height] = mainWindow.getSize();
    mainWindow.setSize(
      vertical ? 72 : Math.max(254, height),
      vertical ? Math.max(254, width) : HORIZONTAL_HEIGHT,
      true,
    );
  }
}

function fitWindowToSlots(slotCount) {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const count = Math.max(MINIMUM_SLOT_COUNT, Number(slotCount) || 0);
  currentSlotCount = count;
  const extraSlots = count - MINIMUM_SLOT_COUNT;
  const bounds = mainWindow.getBounds();
  const workArea = screen.getDisplayMatching(bounds).workArea;
  const vertical = currentOrientation === "vertical";
  const targetWidth = vertical
    ? bounds.width
    : Math.min(
        HORIZONTAL_BASE_WIDTH + extraSlots * SLOT_STEP,
        workArea.width - 24,
      );
  const targetHeight = vertical
    ? Math.min(VERTICAL_BASE_HEIGHT + extraSlots * SLOT_STEP, workArea.height - 24)
    : HORIZONTAL_HEIGHT;
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
  let useResourceIcon = false;
  let iconDataUrl;

  if (parsed.ext.toLowerCase() === ".lnk") {
    iconDataUrl = await extractWindowsResourceIcon(filePath);
    const shortcut = shell.readShortcutLink(filePath);
    const configuredIcon = expandEnvironmentPath(shortcut.icon);
    const target = expandEnvironmentPath(shortcut.target);

    if (configuredIcon && (await pathExists(configuredIcon))) {
      iconSource = configuredIcon;
      useResourceIcon = true;
    } else if (target && (await pathExists(target))) {
      iconSource = target;
      useResourceIcon = true;
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
    iconDataUrl = await extractWindowsResourceIcon(iconSource);
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

async function extractWindowsResourceIcon(filePath) {
  const command = [
    "Add-Type -AssemblyName System.Drawing",
    "$icon = [System.Drawing.Icon]::ExtractAssociatedIcon($env:ICON_DRAWER_SOURCE)",
    "if ($null -eq $icon) { exit 2 }",
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
        env: { ...process.env, ICON_DRAWER_SOURCE: filePath },
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
  mainWindow = new BrowserWindow({
    width: windowState.bounds?.width || (vertical ? 72 : 254),
    height: windowState.bounds?.height || (vertical ? 254 : HORIZONTAL_HEIGHT),
    x: windowState.bounds?.x,
    y: windowState.bounds?.y,
    minWidth: vertical ? 72 : 254,
    minHeight: vertical ? 254 : HORIZONTAL_HEIGHT,
    maxWidth: vertical ? 72 : undefined,
    maxHeight: vertical ? undefined : HORIZONTAL_HEIGHT,
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
  applyOrientation(windowState.orientation, false);
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
  currentOrientation = orientation;
  applyOrientation(orientation);
  fitWindowToSlots(currentSlotCount);
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

function beginWindowDrag(point) {
  if (
    currentLocked ||
    !mainWindow ||
    mainWindow.isDestroyed() ||
    !Number.isFinite(point?.x) ||
    !Number.isFinite(point?.y)
  ) {
    windowDragStart = null;
    return;
  }

  windowDragStart = {
    pointer: point,
    bounds: mainWindow.getBounds(),
  };
}

function moveWindowDrag(point) {
  if (
    !windowDragStart ||
    currentLocked ||
    !mainWindow ||
    mainWindow.isDestroyed() ||
    !Number.isFinite(point?.x) ||
    !Number.isFinite(point?.y)
  ) {
    return;
  }

  mainWindow.setBounds({
    x: Math.round(
      windowDragStart.bounds.x + point.x - windowDragStart.pointer.x,
    ),
    y: Math.round(
      windowDragStart.bounds.y + point.y - windowDragStart.pointer.y,
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
  ipcMain.on("window:drag-begin", (_event, point) => beginWindowDrag(point));
  ipcMain.on("window:drag-move", (_event, point) => moveWindowDrag(point));
  ipcMain.on("window:drag-end", () => {
    windowDragStart = null;
    fitWindowToSlots(currentSlotCount);
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
    createTray();
  });
});

app.on("before-quit", () => {
  isQuitting = true;
});
