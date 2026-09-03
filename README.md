# Icon Desk Drawer

A lightweight Windows desktop launcher inspired by the directness of classic docks, without widgets, skins, or plugin complexity.

## Features

- Drag applications, shortcuts, files, folders, and Steam links into tactile launcher keys.
- Starts with three keys and expands automatically as more are added.
- Drag keys to rearrange them or release them outside the drawer to remove them.
- Switch between horizontal and vertical layouts from the notification tray.
- Scale the complete drawer from 50% to 125% with the tray slider.
- Optional always-on-top and lock-in-place behavior.
- Drag the frameless housing to move it; right-click empty space to close it.
- Remembers icons, position, orientation, and tray settings.
- Runs from the Windows notification tray without a taskbar button.

## Development

Requires Node.js and Windows.

```powershell
npm install
npm start
```

Build the NSIS installer:

```powershell
npm run dist
```

The installer is written to `dist\`.

## License

MIT
