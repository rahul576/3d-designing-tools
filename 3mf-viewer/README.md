# 3MF Viewer (v1)

Look at 3MF print files (Bambu Studio, OrcaSlicer, PrusaSlicer, Cura and others) in 3D, in their filament colours, without opening a slicer. Comes in two forms:

- **In the browser:** https://rahul576.github.io/3d-designing-tools/3mf-viewer/ (works on any computer, nothing is uploaded)
- **As a Mac app:** Finder thumbnails, Space-bar Quick Look and a viewer window for .3mf files, installed with Homebrew

## Browser version

Open a `.3mf` or `.stl` file with the Open button or drop it on the page.

- Colours come from the file: painted triangles (`paint_color` / `mmu_segmentation`), per-object and per-part filaments from the slicer settings, and 3MF colour groups and base materials.
- Size in mm, triangle count, object count and file size; the slicer's preview picture when the file has one.
- Untick a colour to hide those parts.
- 3D, front, back, left, right, top and bottom views, a 10 mm build-plate grid, and **PNG** to save the view as a picture.
- Drag to turn, right-drag or Shift-drag to move, scroll or pinch to zoom, double-click to reset. Keys: `R` reset, `G` grid, `+` / `-` zoom.
- Big files are read in a background worker; a 250 MB model with 3 million triangles opens in a few seconds.

`index.html` is always the latest version; every version is kept under `versions/vN/index.html`.

## Mac app

The `mac/` folder has the source of the Mac app (Swift, no Xcode project needed). It gives you:

- **Finder thumbnails** that show the object itself, in its filament colours
- **Quick Look**: select a .3mf and press Space for a 3D preview you can turn and zoom
- **Viewer window** (double-click a .3mf): turn, zoom, size in mm, triangle count, file size

Needs macOS 12 Monterey or later, Apple Silicon or Intel.

### Install with Homebrew (recommended)

```sh
brew tap rahul576/3d-designing-tools https://github.com/rahul576/3d-designing-tools
brew install --cask 3mf-viewer
```

No Homebrew yet? Install it first from https://brew.sh.

The cask installs **3MF Viewer.app** in Applications, turns on the Finder thumbnail and Quick Look extensions, and clears the download quarantine (the app is signed locally, not notarized by Apple, so otherwise macOS would block it on first launch). Open the app once and click **Use 3MF Viewer** if you want double-clicking .3mf files to open it.

Update and remove:

```sh
brew upgrade --cask 3mf-viewer
brew uninstall --cask 3mf-viewer          # add --zap to also remove its settings
```

### Install from the zip

1. Download `3MF-Viewer-<version>.zip` from the [releases page](https://github.com/rahul576/3d-designing-tools/releases?q=3mf-viewer-mac).
2. Unzip it and drag **3MF Viewer.app** into Applications.
3. The first time, right-click the app and choose **Open**, then **Open**. If macOS still blocks it: System Settings › Privacy & Security › scroll down › **Open Anyway**.

### Build from source

Needs Apple's Command Line Tools (the script offers to install them if they are missing).

```sh
git clone https://github.com/rahul576/3d-designing-tools.git
bash 3d-designing-tools/3mf-viewer/mac/build.sh
```

This builds the app for Apple Silicon and Intel, installs it in Applications, makes it the default for .3mf files, turns on thumbnails and Quick Look, and saves a shareable `3MF Viewer.zip` in Downloads.

`bash 3mf-viewer/mac/build.sh --package out.zip` only builds and zips the app, without installing anything.

### Controls

Drag to rotate · scroll or pinch to zoom · **+ / −** zoom · **R** or **⌘0** reset · **⌘G** grid

### Going back to your slicer as the default app

Select a .3mf in Finder › File › Get Info › "Open with" › Bambu Studio (or your slicer) › **Change All**.

### Releasing a new Mac version

1. Change the code in `mac/` and raise `CFBundleShortVersionString` (and `CFBundleVersion`) in `mac/Info.plist` and in both `mac/Extensions/*-Info.plist`.
2. Push to `main`. The **3MF Viewer Mac app** workflow (`.github/workflows/3mf-viewer-mac.yml`) builds the app on a macOS runner, publishes it as release `3mf-viewer-mac-v<version>`, and updates the version and checksum in `Casks/3mf-viewer.rb`.
3. Users get it with `brew upgrade --cask 3mf-viewer`.

A version that already has a release is not built again. The workflow can also be started by hand from the Actions tab.

## Versions

- **v1:** browser viewer (3MF and STL, filament colours, colour toggles, views, grid, PNG) and the Mac app 1.1 with a Homebrew cask.
