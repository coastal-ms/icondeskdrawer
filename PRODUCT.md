# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Windows users who want a small, always-available launcher for frequently used applications, shortcuts, files, and folders.

## Product Purpose

Provide a resizable desktop icon drawer that starts with three empty slots. Users populate it by dragging items from Windows, launch them with one press, and create additional slots by holding a dragged item between existing icons.

## Positioning

The drawer keeps the directness of a Nexus-style launch bar while deliberately excluding widgets, themes, plugins, and configuration sprawl.

## Operating Context

The drawer lives on the Windows desktop as a compact horizontal utility. Items are added from Explorer or the desktop and remain available between sessions.

## Capabilities and Constraints

- Ships as a self-contained installable Windows desktop app.
- Accepts Windows applications, shortcuts, files, and folders.
- Resolves native Windows icons for dropped items.
- Starts with three empty slots and preserves at least three slots.
- Adds a slot when a dragged item is held between two existing slots.
- Occupied keys reorder immediately when dragged onto a key or insertion lane and can be dragged outside the drawer to remove them.
- The floating window expands and contracts with its key count while preserving its center position.
- Orientation and always-on-top behavior are controlled from the tray menu, not the drawer window.
- The tray menu can lock the drawer's desktop position while preserving automatic expansion.
- Provides tactile press feedback before launching an item.
- The floating window can be placed anywhere and remembers its position.
- Users cannot resize the drawer manually; its frame is sized automatically from orientation and key count.
- Moving the drawer cannot maximize, snap-resize, or otherwise change its dimensions.
- Left-dragging any open surface, including empty keys, key edges, and insertion lanes, moves the drawer without interfering with dropped desktop items.
- The app lives in the Windows notification tray without a taskbar button.
- Right-clicking empty drawer space can close it; the tray icon opens, hides, or explicitly exits the app.
- Advanced dock features are intentionally out of scope.

## Brand Commitments

The working product name is Icon Desk Drawer. Its interaction model should feel familiar to users of the free Winstep Nexus dock, without copying its branding or feature breadth.

## Evidence on Hand

The user supplied a reference screenshot showing a slim, dark horizontal dock with large application icons and restrained reflected highlights.

## Product Principles

- Launching must remain immediate and obvious.
- Adding and arranging items should happen directly through drag and drop.
- Empty capacity should teach the interaction without a setup screen.
- Visual polish must not grow into feature complexity.

## Accessibility & Inclusion

Support keyboard focus, visible focus states, reduced motion, and useful accessible labels for every slot.
