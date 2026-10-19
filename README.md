# 3D Designing Tools

A collection of tools that make 3D design easier.

## Goal

Each tool in this repository targets a common pain point in 3D design work, such as generating, converting, inspecting or cleaning up models, so you can get from idea to usable 3D asset with less manual effort.

## Tools

Each tool has its own folder with a short README describing what it does and how to run it.

- [Tray Generator](tray-generator/) — parametric stackable trays and boxes with lids, exported as STL/3MF. [Open it online](https://rahul576.github.io/3d-designing-tools/tray-generator/).

## Home page

The root `index.html` is the home page (https://rahul576.github.io/3d-designing-tools/). It shows one tab per tool, built from the `TOOLS` list near the bottom of the file.

The site is published from the `gh-pages` branch. A GitHub Actions workflow (`.github/workflows/sync-gh-pages.yml`) resets `gh-pages` to `main` on every push to `main`, so merged changes go live automatically.

## Adding a new tool

1. Put the tool in its own top-level folder (for example `my-tool/`) with an `index.html` and a README.
2. Add one entry for it to the `TOOLS` list in the root `index.html`. Its tab and overview card appear automatically.
3. Add it to the Tools list above.
4. Open a pull request.
