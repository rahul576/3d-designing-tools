TRAY GENERATOR v8  —  parametric, stackable, lightweight trays for 3D printing
==========================================================================

Open  index.html  (the latest version) in any browser (Chrome, Edge, Firefox, Safari).
It works fully offline: no install, no internet, nothing is uploaded.

WHAT IT DOES
------------
Size tab
  * Width / Depth / Height pills on the 3D view. Click the arrows, or PRESS AND
    HOLD to keep changing (speeds up the longer you hold). Shift = 10 mm steps.
    You can also type a value, or use the Up/Down arrow keys in the box.
  * Click a compartment on the model to resize THAT compartment.
    Two orange pills appear (Compartment W / Compartment D) with the same
    arrows / hold / typing. Neighbouring compartments give or take the space,
    so the tray size stays the same. If the compartment spans the full width
    (or depth) of the tray, resizing it resizes the tray. Min 4 mm. Esc deselects.

Grid tab   (live Columns / Rows counts)
  * Columns and Rows always show the CURRENT count of what is selected:
      - nothing selected  -> the whole tray (e.g. 1 x 2)
      - one compartment   -> 1 x 1
      - a group           -> its columns x rows (e.g. 3 x 2)
  * Press + / - to add or remove a column / row right away – only in the
    selection. After a split the new group stays selected, so you can keep
    pressing. Custom parts elsewhere are kept as they are.
  * Click compartments on the model (Shift-click for several).
    "Select group" widens the selection to the surrounding group
    (click again to go one level further up). Esc = whole tray.
  * Merge removes the partitions in the selection; Equal makes sizes equal.
  * Changes that would make compartments smaller than 4 mm are refused.
  * The Layout panel in the sidebar shows a top view with the same controls:
    click to select, drag dividers to resize.

Preview tab
  * Show 2 stacked trays, put the lid on, section cut (shows the wall profile,
    stacking joint and lid fit), edges on/off.

Sidebar
  * Thickness (default 0.8 mm = 2 lines with a 0.4 nozzle), Fillet,
    Partition height.
  * Stack: stackable trays get a 45-degree chamfer on the bottom edge and drop
    into the tray below. The chamfered wall keeps the same thickness.
  * NEW in v7 – Flush rim (on by default for stackable trays): the INSIDE top
    edge is chamfered at 45 degrees too. The tray above sits face-to-face on
    that chamfer, so the outer walls line up – the groove between stacked
    trays is gone, leaving only a 0.3 mm seam (a perfectly zero seam would
    need a knife-edge wall that cannot print). Trays also nest deeper and
    centre themselves better. Untick "Flush rim" for the old style.
    See stacking-before-after.png.
  * Wall pattern: hex / circle / diamond / lines, with hole size and density.
    Shows holes, grams saved and money saved. Bars between holes are never
    thinner than 1.5 x the wall thickness. Hex, diamond and lines have pointed
    tops and print without supports.
  * NEW in v8 – "Inner walls too" (under Wall pattern): the pattern is also cut
    through the partitions between compartments, not only the outer walls.
    Off by default. Each stretch where one compartment faces another gets its
    own centred holes, with the same solid border as the outer walls. The info
    line shows how many holes are in the inner walls. Note: small items can
    then pass between compartments. See inner-walls-pattern.png.
  * Lid: inset (plugs inside), cap (slips over the walls), or stacking
    (a shallow tray, so you can keep stacking). Clearance + skirt depth.
  * Estimate: weight per material, filament price per kg -> cost.
  * PRINT TIME estimate (tray, lid, and total).
      - Printer: Fast (Bambu / Klipper), Standard (Prusa MK4 / input shaping),
        Classic (Ender 3 / stock firmware). Layer height and nozzle size.
      - Wall patterns save filament but add time (retractions around every
        hole); the extra time is shown as "Pattern adds".
      - It is an estimate (about +/-30%) and does not include warm-up.
        For exact numbers: slice the tray once, click "Calibrate with my
        slicer", type the slicer's time, Apply. Every estimate after that is
        scaled to your printer (Reset to undo).

Download
  * STL or 3MF; tray, lid, or tray + lid in one file.
    In 3MF the tray and lid are separate named objects.
  * Lids are exported top-face-down (print orientation).

Undo / redo: Ctrl+Z / Ctrl+Shift+Z. Settings are remembered in the browser.

PRINTING TIPS
-------------
  * Slicer: 2 walls (perimeters), 0% infill — the parts are only 0.8 mm thick.
  * If a lid is too tight, raise Clearance to 0.25-0.3 mm.

FOLDERS
-------
  index.html               the latest version of the app (single file, everything built in)
  stacking-before-after.png  close-up of the stacking joint, v6 vs v7
  inner-walls-pattern.png    v8: wall pattern on the inner walls too
  versions/vN/index.html   every version, unchanged (v2 to v8; v8 = latest)
  python/                  the first Python box+lid generator and its tests
                           (python parametric_box.py --size 50 --height 30 --stackable)
  source/                  the source the app is built from, plus tests:
                             tray-geom.js     geometry engine (also runs in Node)
                             template.html    the app UI
                             build.js         node build.js -> tray-generator-v8.html
                             test-geom.js     geometry, stacking and lid-fit tests
                             fuzz.js          random-layout / pattern / lid fuzz test
                             ui-test.js       browser test (needs Playwright)
                             check3mf.py      3MF validator used by ui-test.js
