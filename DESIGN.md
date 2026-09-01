---
name: Icon Desk Drawer
description: A compact graphite launcher built from tactile desktop keys.
colors:
  electric-blue: "#48b8ff"
  graphite: "#171d21"
  deep-well: "#070b0e"
  steel-edge: "#49545a"
  frost-text: "#eaf3f8"
  muted-steel: "#91a2ad"
typography:
  label:
    fontFamily: "Segoe UI Variable, Segoe UI, sans-serif"
    fontSize: "9px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.16em"
  body:
    fontFamily: "Segoe UI Variable, Segoe UI, sans-serif"
    fontSize: "9px"
    fontWeight: 400
    lineHeight: "20px"
rounded:
  key: "10px"
  shell: "8px"
spacing:
  key-gap: "14px"
  edge-space: "0"
components:
  launcher-key:
    backgroundColor: "{colors.deep-well}"
    rounded: "{rounded.key}"
    size: "64px"
---

# Design System: Icon Desk Drawer

## Overview

**Creative North Star: "The Desktop Keybank"**

Icon Desk Drawer treats launching software as pressing a compact bank of physical keys. The world is dark graphite and recessed steel rather than decorative glass; native Windows icons remain the visual content. The interface is deliberately dense, familiar, and quiet until a drop target opens or a key is pressed.

**Key Characteristics:**
- Recessed square launch keys with short mechanical travel.
- One cool-blue signal reserved for readiness and focus.
- Equal spacing and symmetric outer margins.
- Native Windows icon artwork without decorative wrappers.

## Colors

The palette is restrained graphite with one electrical status color.

### Primary
- **Electric Signal** (#48b8ff): Readiness light, insertion state, and keyboard focus.

### Neutral
- **Graphite Housing** (#171d21): Main metal shell.
- **Deep Key Well** (#070b0e): Recessed launcher surfaces.
- **Steel Edge** (#49545a): Structural borders.
- **Frost Text** (#eaf3f8): High-emphasis labels.
- **Muted Steel** (#91a2ad): Instructions and inactive controls.

**The Signal Discipline Rule.** Blue communicates a live state; it is never ambient decoration.

## Typography

**Display Font:** Segoe UI Variable (with Segoe UI fallback)
**Body Font:** Segoe UI Variable (with Segoe UI fallback)

**Character:** Native Windows utility typography, compact and legible. Type remains subordinate to icon recognition.

### Hierarchy
- **Label** (700, 9px, 0.16em, uppercase): Drawer identity.
- **Body** (400, 9px, 20px): One-line interaction guidance and status.

## Layout

The drawer uses a single centered key track. Keys are 64px squares separated by 14px insertion lanes, with matching end targets and no additional content padding. Horizontal and vertical modes preserve the same key size and centered justification.

## Elevation & Depth

Depth is structural. The shell uses an offset ambient shadow; keys use a hard lower ledge plus a softer cast shadow and dark inset shading. Pressing collapses the ledge, shortens the shadow, and moves the key face down by 5px.

### Shadow Vocabulary
- **Floating shell** (`0 10px 24px rgb(0 0 0 / 52%)`): Separates the drawer from the desktop.
- **Raised key** (`0 5px 0 #030405, 0 7px 10px rgb(0 0 0 / 68%)`): Establishes physical travel.
- **Pressed key** (`0 1px 0 #020303, 0 2px 3px rgb(0 0 0 / 65%)`): Confirms actuation.

**The Mechanical Feedback Rule.** Every launch visibly changes both position and shadow before the target opens.

## Shapes

The shell uses an 8px radius and 1px bezel, while launch keys use 10px. A 2px transparent inset is the only space between the floating window and its housing.

## Components

### Tray Menu
- **Behavior:** Native Windows menu controls visibility, orientation, persistent always-on-top behavior, and explicit exit.
- **Placement:** Configuration stays out of the floating drawer so the keybank remains focused on launching.

### Drawer Housing
- **Bezel:** A 1px structural edge inside a 2px transparent window inset.
- **Movement:** The housing outside launcher keys is draggable. Insertion lanes stay interactive for adding keys.
- **Chrome:** No title or drag rail. Right-clicking empty housing or an empty key opens the native close menu.

### Launcher Key
- **Shape:** Fixed 64px square with a recessed 10px face.
- **Empty:** A muted plus mark teaches dropping without setup copy.
- **Occupied:** The native Windows icon fits proportionally within 68% of the key face, matching familiar Windows icon scale without stretching.
- **Hover / Focus:** Brightness and steel border increase; keyboard focus adds an electric-blue ring.
- **Active:** The face travels 5px down, scales to 96.5%, and compresses its shadow before launch.

### Insertion Key

Insertion lanes remain faintly visible between keys and at both ends. Holding a dragged item in any lane expands a complete empty launcher key over 240ms. The preview uses the same size, shape, plus mark, and depth as permanent keys.

## Do's and Don'ts

### Do:
- **Do** keep insertion lanes visibly discoverable without overpowering native icons.
- **Do** keep launch feedback physical, brief, and tied to the opening action.
- **Do** let native application icons carry visual identity.

### Don't:
- **Don't** add widgets, skins, ornamental glow, or plugin-style chrome.
- **Don't** use the blue signal on inactive decoration.
- **Don't** change key dimensions between horizontal and vertical modes.
