# Photo Frame Generator (v8)

Design a photo frame or a photo collage frame for your 3D printer, see it at true size on a wall or shelf, and download files ready for your slicer.

**Live site:** https://rahul576.github.io/3d-designing-tools/photo-frame-generator/

The app is a single offline HTML file. `index.html` is always the latest version; every version is kept under `versions/vN/index.html` (v1 to v8). Nothing is uploaded; your photos stay in the browser.

## Features

- **Frame size buttons:** in the Design view a floating box makes the frame wider, narrower, taller or shorter (or type a size), lets you pick the photo size or type the size of a print you already have (and turn it), and **Resize frame to fit Photo** picks borders that suit the photo, the hanger and the caption. Adding or removing caption text keeps the photo centred.
- **Collage photo size:** in a collage, pick the size of your prints and the collage is sized so the main opening takes that photo; the box lists the print size of every opening.
- **Photo walls and wall frames:** heart photo mosaic (22 tiles) with names and a date, printed photo grid with a cut-out sticker of one person on top (found by the same in-browser AI), photo wall of nine, family tree with branches and a raised family name plaque, and a tree of life with eight photos and a see-through tree. Captions can have a small second line.
- **Shaped collages:** 27 silhouettes that hold several photos: elephant, bunny, kitty, teddy, owl, butterfly, dinosaur, whale, turtle, fish, duck, puppy; big heart, two hearts, wine bottle, flower, two circles, love lock, LOVE, MOM, DAD; home, family tree, star, cloud, moon and balloons. Each photo sits in its own pocket; the photo sheet shows dashed lines to cut along.
- **Photo cut-out:** an opening that follows the outline of the person or pet in your photo, with the frame around it like a sticker. The subject is found by an AI segmentation model (MediaPipe DeepLab v3) that runs in the browser, or taken from the see-through part of a PNG; offline from a local file only plain backgrounds and transparent PNGs work. It needs one clear subject; hair and fine edges are smoothed.
- **Heart frames:** heart outer shape that sizes itself around the opening; with a heart opening the photo is cut to the heart line so the frame stays compact. Five new styles: Sweetheart, Heart locket, Scalloped heart, Love letter, Sticker cut-out.
- **Surprise me:** a big button that tries a random style and colours.
- **Pattern pictures:** the patterns are shown as pictures in your colours; hover one for a close-up at your pattern size.
- **Single photo or collage:** switch at the top of the left panel. The collage tab has 52 layouts (grids, big photo plus small ones, photo booth strip, mosaic, family tree, and the 27 shapes) and lets you choose many photos at once. Click an opening in the preview to select it, then click a photo to put it there; drag to move it, zoom per opening.
- **Sample photos:** four drawn kid photos to try styles with. For a realistic look upload your own (or drop it on the preview); the samples are drawings because the app ships no stock photos.
- **Real world view:** the frame at true size on a living room wall, a kids room wall or a shelf, with wall colour choice, shadow, depth and raised colours.
- **3D view:** the real printed pieces in their filament colours as a turnable 3D model. *Front* and *Back* show the finished frame, *Photo going in* shows the photo sliding into its slot, and *As printed* shows the pieces lying on the print bed. Drag to turn, scroll to zoom, right-drag to move, double-click to reset.
- **Filament colours:** up to four colours, shown as round buttons next to the frame. Click one to pick a common PLA colour or any colour; + adds a colour. Every part (frame, mats, pattern, lines, ornaments, caption) picks one of these colours.
- **Few filament changes:** with *Raised colours* (default) the frame prints face up and each extra colour stands one step higher, so a single-nozzle printer needs just one pause per extra colour. *Flat colours* prints the front face down with the colours in the first few layers, for an AMS or multi-material unit.
- **Hanging:** two keyhole slots or one on the back, a loop on top, two string holes, a desk stand leg, or nothing.
- **Photo slot:** the back has a slot open on the right or left side, so the photo slides in and out without taking the frame apart; a finger hole in the back pushes it out. Or choose a removable back that snaps on with pins.
- **Frame styles:** 26 styles, each with at most four filament colours, with lines and text widened so they print.
- **Shapes, edges and patterns:** 11 outer shapes (now with a heart), 13 opening shapes (heart, diamond, photo cut-out), scalloped/pinked/wavy/stamp/castle edges, 28 patterns, mats, stitched lines, ornaments and a caption in 11 fonts.
- **Export:** multicolour 3MF (each colour a separate part with its colour set), single colour 3MF or STL (decorations become raised texture), and the photo or collage sheet as a real-size 300 DPI PNG. After a 3D export the app shows how to print and assemble the frame, including the exact filament-change heights.
- **Hover help:** every button and setting has a tooltip; the ? button in the header explains the whole flow.

## Versions

- **v8:** photo size for collages and typed photo sizes in the Frame size box; heart photo mosaic, photo grid with cut-out sticker, photo wall of nine, family tree and tree of life frames; two-line captions; styles keep your caption; Dark walnut and Black poster styles; see-through gaps in shaped frames.
- **v7:** photo size picker in the Frame size box and the button renamed Resize frame to fit Photo; photo stays centred when caption text is added or removed; 27 shaped collages (animals, love and couples, fun shapes); photo cut-out opening that follows the person; heart outer shape and five heart styles; more watertight meshes.
- **v6:** the photo now slides into a slot in the side of the back (the v5 back was closed once assembled), finger hole to push it out; top bar cut to Design, Real world and 3D rendering; floating frame size buttons and Fit frame to photo; photo size shown in the Design view; big Surprise me button; pattern picker with pictures and hover close-up; 3D views Front, Back, Photo going in and As printed.
- **v5:** new 3D view that renders the actual printable model (the same geometry as the 3MF export) in WebGL, assembled or as printed.
- **v4:** made for 3D printing. Collage tab with 20 layouts and multi-photo selection, sample kid photos, real world and back views, up to four filament colours with floating colour buttons, raised or flat colour printing with few filament changes, multicolour and single colour 3MF, back plate with photo pocket and snap pins, keyhole / loop / string / stand hanging, tooltips everywhere, colour-coded left panel with the open section highlighted. Removed options that do not apply to a printed frame: pattern opacity, gradients, drop shadow, photo effects, laser DXF, SVG and paper printing.
- **v3:** restyled to match the Tray Generator (sidebar, grid canvas, preview toolbar, Download menu, dark mode toggle).
- **v2:** frame styles thumbnail gallery, 8 more styles (19 in total).
- **v1:** first release.

## Third-party files

`lib/` holds the MediaPipe Tasks Vision runtime (Apache 2.0, Google) and the DeepLab v3 segmentation model (Apache 2.0), used only by the photo cut-out. See `lib/README.md`.
