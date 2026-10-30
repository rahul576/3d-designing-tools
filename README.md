# 3D Designing Tools

A collection of tools that make 3D design easier.

## Goal

Each tool in this repository targets a common pain point in 3D design work, such as generating, converting, inspecting or cleaning up models, so you can get from idea to usable 3D asset with less manual effort.

## Tools

Each tool has its own folder with a short README describing what it does and how to run it.

- [Tray Generator](tray-generator/) — parametric stackable trays and boxes with lids, exported as STL/3MF. [Open it online](https://rahul576.github.io/3d-designing-tools/tray-generator/).
- [Photo Frame Generator](photo-frame-generator/) — 3D printable photo and collage frames in up to four filament colours, with a slide-in photo slot, a real-world preview, a turnable 3D view, wall hangers and a snap-on back, exported as multicolour or single colour 3MF/STL. [Open it online](https://rahul576.github.io/3d-designing-tools/photo-frame-generator/).

## Home page

The root `index.html` is the home page (https://rahul576.github.io/3d-designing-tools/). It is a simple grid with one picture card per tool (screenshot, short description, Open button, version picker and guide link), built from the `TOOLS` list near the bottom of the file.

The site is published from the `gh-pages` branch. A GitHub Actions workflow (`.github/workflows/sync-gh-pages.yml`) resets `gh-pages` to `main` on every push to `main`, so merged changes go live automatically.

## Versions and tags

Work goes straight to `main` (the site is not public yet, so no pull requests). A GitHub Actions workflow (`.github/workflows/version-tags.yml`) runs on every push to `main`:

- each tool version gets a tag `<tool>-vN` (for example `photo-frame-generator-v2`) on the last commit that changed `<tool>/versions/vN/`, so every old version stays reachable;
- the `latest` tag is moved to the newest commit.

## Adding a new tool

1. Put the tool in its own top-level folder (for example `my-tool/`) with an `index.html` and a README.
2. Add one entry for it to the `TOOLS` list in the root `index.html`, plus a `thumb.png` screenshot of the tool (1280×800) in its folder. Its card appears automatically.
3. Add it to the Tools list above.
4. Commit and push to `main`; tags are created automatically.
