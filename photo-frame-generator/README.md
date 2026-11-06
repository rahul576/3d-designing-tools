# Photo Frame Generator (v12)

Design a photo frame or a photo collage frame for your 3D printer, see it at true size on a wall or shelf, and download files ready for your slicer.

**Live site:** https://rahul576.github.io/3d-designing-tools/photo-frame-generator/

The app is a single offline HTML file. `index.html` is always the latest version; every version is kept under `versions/vN/index.html` (v1 to v12). Nothing is uploaded; your photos stay in the browser.

## Features

- **Photo shape for any frame:** at the top of Frame styles, pick Rectangle, Circle, Heart or Star (or "As style") and the photo opening takes that shape in whatever frame you choose. The frame design, size and colours stay the same, and every style picture shows your photo in that shape. Heart frames shrink the shape a little so it stays inside the frame. The same Rectangle / Circle / Heart / Star **Photo cut-out** buttons also float above the preview in every view, next to **Undo / Redo**; both places change the same setting. Undo / Redo (Ctrl+Z, Ctrl+Shift+Z or Ctrl+Y); a drag or a slider move counts as one step.
- **Clip art panel (floating, right side):** 30 pictures (heart, star, flower, sun, moon, butterfly, paw, crown, animals, rocket, car and more), always at hand in every view. Drag one onto the frame or click to add it; drag to move, corner square to resize, round handle to turn, pick the filament colour, duplicate or remove. **Text on the frame** (same panel) in any of the 11 fonts, any size, bold or italic, placed anywhere on the front. On the frame they print as raised colour in the 3MF; over the photo they are printed on the photo print.
- **Size arrows:** the Design view shows three rows of arrows: the frame, the photo (it sits in a pocket behind the frame) and the visible window. The window is the photo minus the hidden edge (4 mm each side by default), which is what holds the photo in; the pocket is the photo plus 0.6 mm room each side, so a 141 × 95 mm print goes into a 142.2 × 96.2 mm pocket and shows 133 × 87 mm. The Frame size box and the info panel list photo, pocket and visible size, and say how it goes in (slides in from the side, back comes off, or trim to the dashed line for heart and cut-out frames).
- **Colour names in the 3MF:** each part and filament in the multicolour 3MF is named after its colour (for example "Sky blue - frame (colour 1)", "Yellow - raised (colour 3)"), and the print guide uses the same names.
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
- **Filament colours:** up to four colours, shown as round buttons next to the frame. Click one to pick a common PLA colour or any colour; + adds a colour. Every part (frame, mats, pattern, ornaments, caption, add-ons) picks one of these colours.
- **Few filament changes:** with *Raised colours* (default) the frame prints face up and each extra colour stands one step higher, so a single-nozzle printer needs just one pause per extra colour. *Flat colours* prints the front face down with the colours in the first few layers, for an AMS or multi-material unit.
- **Hanging:** two keyhole slots or one on the back, a loop on top, two string holes, a desk stand leg, or nothing.
- **Photo slot:** the back has a slot open on the right or left side, so the photo slides in and out without taking the frame apart; a finger hole in the back pushes it out. Or choose a removable back that snaps on with pins.
- **Frame styles:** 26 styles, each with at most four filament colours, with lines and text widened so they print.
- **Shapes, edges and patterns:** 11 outer shapes (now with a heart), 13 opening shapes (heart, diamond, photo cut-out), scalloped/pinked/wavy/stamp/castle edges, 28 patterns, mats, ornaments and a caption in 11 fonts.
- **Export:** multicolour 3MF (each colour a separate part with its colour set), single colour 3MF or STL (decorations become raised texture), and the photo or collage sheet as a real-size 300 DPI PNG. After a 3D export the app shows how to print and assemble the frame, including the exact filament-change heights.
- **Hover help:** every button and setting has a tooltip; the ? button in the header explains the whole flow.

## Versions

- **v12:** Photo cut-out buttons (rectangle, circle, heart, star) are back in the floating bar above the preview, linked to the Photo shape row under Frame styles; each shape click is its own undo step.
- **v11:** photo size, photo pocket and visible window are shown separately (arrows, Frame size box, info panel) so it is clear the whole photo fits and slides in; checked the pocket and slide-in slot against the photo for every style and photo shape.
- **v10:** photo shape (rectangle, circle, heart, star) is now a setting under Frame styles that keeps the frame design, instead of the floating cut-out bar; clip art has its own floating panel on the right, shown in every view.
- **v9:** no more extra lines on the frames (decorative contour lines and the red photo edge guide are gone from every frame); rectangle, circle, heart and star photo cut-out buttons with undo and redo; clip art and text add-ons panel with drag, resize and turn; size arrows for the frame and the photo opening; colour names on the 3MF parts.
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
