# Storage Container Generator (v1)

Parametric 3D-printable storage containers in 12 shapes, with lids, stacking, wall textures, and raised or engraved text and clipart that you drag into place. Every part prints **without supports**: no surface leans more than 45 degrees, and lids print flat.

**Live site:** https://rahul576.github.io/3d-designing-tools/storage-container-generator/

The app is a single offline HTML file. `index.html` is always the latest version; every version is kept under `versions/vN/index.html`. Nothing is uploaded; it runs entirely in the browser.

## What you can make

- **Shapes:** round, oval, square, rectangle, pill, triangle, pentagon, hexagon, octagon, heart, star, flower. Width, depth (or keep the shape's proportions), height and corner radius.
- **Thickness:** wall and bottom thickness, set separately.
- **Lids:**
  - *None*: an open container.
  - *Push-fit*: a flat lid with a lip that pushes into the opening.
  - *Slip-over*: the lid slides over a neck at the top and sits flush with the walls.
  - *Screw-on*: a right-hand 45° trapezoid thread (at least 1¾ turns) on a round neck, with a ribbed cap. Non-round shapes get a 45° shoulder up to the neck, like a jar. Containers too narrow for a neck of at least 16 mm fall back to a push-fit lid, with a note.
  - *Stacking*: a shallow tray that drops into the container, and the next container stacks on it.
  - Fit clearance, lip / skirt / neck depth, lid top thickness and thread pitch are adjustable.
- **Stacking:** a 45° chamfered foot drops into the container below. The inside of the rim is chamfered to match, so the walls line up. Works with no lid, a push-fit lid or a stacking lid.
- **Wall textures:** ribs, flutes, waves, twist, knurl, bricks, honeycomb, dots. Pattern size and depth. Textures are seamless all the way around.
- **Text and clipart** (on the outer wall): add text (6 font styles), 18 built-in clipart icons, or upload your own PNG / JPG / SVG. Raised or engraved, any height, depth and rotation. Drag it on the 3D model or on the unrolled wall strip in the sidebar. New items land on the flattest stretch of the front wall, next to anything already there. Engraving is limited to the wall thickness minus 0.6 mm. The texture clears a smooth panel behind each item so it stays readable.
- **Export:** STL or 3MF; container, lid, or both in one file (3MF keeps them as separate named objects).
- Weight and filament estimate, capacity in ml, a live "No supports needed" check with the steepest overhang, undo / redo, dark mode, section cut, 2-stacked and lid-on previews.

## How it stays support-free

- Every chamfer (stacking foot, slip-over neck, screw shoulder) rises at least as much as it steps outward along every ray, so it never leans past 45°, even at corners.
- Threads are trapezoids with 45° flanks.
- Lids are built in print orientation: top face on the bed, lip or skirt pointing up.
- Wall textures, text and clipart are filtered so the wall never moves outward faster than it rises. Text and pictures get 45° bevels; engraved items get 45° roofs.
- The app measures the steepest downward-facing surface of the real meshes after every change.

## Folder layout

```
storage-container-generator/
  index.html                latest version (built from source/)
  versions/v1/index.html    every released version
  thumb.png                 card image for the tools page
  source/
    container-geom.js       geometry engine (shapes, offsets, lids, threads, textures, relief, STL/3MF)
    template.html           the app (UI + WebGL viewer); build.js inlines the engine
    build.js                node build.js -> storage-container-generator-v1.html
    test-geom.js            geometry tests: every shape x lid, stacking, thread clearance, textures, text
    fuzz.js                 random-parameter fuzz test (node fuzz.js 300)
    ui-test.js              Playwright browser test (clicks, drag-and-drop, downloads)
    caster.js, check3mf.py  helpers for the tests
```

To release: `cd source && node build.js && node test-geom.js && node fuzz.js && node ui-test.js`, then copy `storage-container-generator-v1.html` to `../index.html` and `../versions/v1/index.html`.

## Printing tips

- Defaults (1.6 mm walls, 1.2 mm bottom) suit a 0.4 mm nozzle and 0.2 mm layers.
- If a lid is too tight, raise *Fit clearance* to 0.25 to 0.3 mm. For screw lids, 0.2 to 0.3 mm works for most printers.
- For fine text, use *Fine* detail and a letter height of 6 mm or more.
