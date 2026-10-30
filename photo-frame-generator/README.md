# Photo Frame Generator (v5)

Design a photo frame or a photo collage frame for your 3D printer, see it at true size on a wall or shelf, and download files ready for your slicer.

**Live site:** https://rahul576.github.io/3d-designing-tools/photo-frame-generator/

The app is a single offline HTML file. `index.html` is always the latest version; every version is kept under `versions/vN/index.html` (v1 to v5). Nothing is uploaded; your photos stay in the browser.

## Features

- **Single photo or collage:** switch at the top of the left panel. The collage tab has 20 layouts (grids, big photo plus small ones, photo booth strip, mosaic, family tree) and lets you choose many photos at once. Click an opening in the preview to select it, then click a photo to put it there; drag to move it, zoom per opening.
- **Sample photos:** four drawn kid photos to try styles with, or upload your own (or drop it on the preview).
- **Real world view:** the frame at true size on a living room wall, a kids room wall or a shelf, with wall colour choice, shadow, depth and raised colours.
- **3D view:** the real printed pieces in their filament colours as a turnable 3D model. *Assembled* shows the frame standing up with the photo and back plate; *As printed* shows the pieces lying on the print bed. Drag to turn, scroll to zoom, right-drag to move, double-click to reset.
- **Back view:** the printed back with the photo pocket, snap pins and hanger, seen from behind.
- **Filament colours:** up to four colours, shown as round buttons next to the frame. Click one to pick a common PLA colour or any colour; + adds a colour. Every part (frame, mats, pattern, lines, ornaments, caption) picks one of these colours.
- **Few filament changes:** with *Raised colours* (default) the frame prints face up and each extra colour stands one step higher, so a single-nozzle printer needs just one pause per extra colour. *Flat colours* prints the front face down with the colours in the first few layers, for an AMS or multi-material unit.
- **Hanging:** two keyhole slots or one on the back, a loop on top, two string holes, a desk stand leg, or nothing.
- **Back plate:** a separate back with a photo pocket and snap pins, so you can open the frame to change the photo.
- **Frame styles:** the 19 styles from v3, converted to at most four filament colours, with lines and text widened so they print.
- **Shapes, edges and patterns:** 10 outer shapes, 12 opening shapes, scalloped/pinked/wavy/stamp/castle edges, 28 patterns, mats, stitched lines, ornaments and a caption in 11 fonts.
- **Export:** multicolour 3MF (each colour a separate part with its colour set), single colour 3MF or STL (decorations become raised texture), and the photo or collage sheet as a real-size 300 DPI PNG. After a 3D export the app shows how to print and assemble the frame, including the exact filament-change heights.
- **Hover help:** every button and setting has a tooltip; the ? button in the header explains the whole flow.

## Versions

- **v5:** new 3D view that renders the actual printable model (the same geometry as the 3MF export) in WebGL, assembled or as printed.
- **v4:** made for 3D printing. Collage tab with 20 layouts and multi-photo selection, sample kid photos, real world and back views, up to four filament colours with floating colour buttons, raised or flat colour printing with few filament changes, multicolour and single colour 3MF, back plate with photo pocket and snap pins, keyhole / loop / string / stand hanging, tooltips everywhere, colour-coded left panel with the open section highlighted. Removed options that do not apply to a printed frame: pattern opacity, gradients, drop shadow, photo effects, laser DXF, SVG and paper printing.
- **v3:** restyled to match the Tray Generator (sidebar, grid canvas, preview toolbar, Download menu, dark mode toggle).
- **v2:** frame styles thumbnail gallery, 8 more styles (19 in total).
- **v1:** first release.
