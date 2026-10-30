#!/bin/bash
# Builds "3MF Viewer.app" (Apple Silicon + Intel) with Finder thumbnails and Space-bar Quick Look,
# installs it, makes it the default for .3mf files, and saves a shareable zip to Downloads.
# Usage:  bash build.sh
#         bash build.sh --package <out.zip>   only build, sign and zip the app (used for releases)
set -euo pipefail

PACKAGE_ONLY=""
if [ "${1:-}" = "--package" ]; then
    PACKAGE_ONLY="${2:?Usage: bash build.sh --package <out.zip>}"
    case "$PACKAGE_ONLY" in /*) ;; *) PACKAGE_ONLY="$(pwd -P)/$PACKAGE_ONLY" ;; esac
fi
cd "$(dirname "$0")"

APP_NAME="3MF Viewer"
BUILD="build/${APP_NAME}.app"
SHARE_ZIP="${HOME}/Downloads/${APP_NAME}.zip"
LSREGISTER="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
PB="/usr/libexec/PlistBuddy"

if ! command -v swiftc >/dev/null 2>&1; then
    echo "Swift compiler not found. Installing Apple's Command Line Tools…"
    echo "A system window will open. Click Install, wait for it to finish, then run:  bash build.sh"
    xcode-select --install || true
    exit 1
fi

# compile <output> <extra swiftc flags…> -- <sources…>
# Builds arm64 + x86_64 and merges them; falls back to this Mac's architecture if needed.
compile() {
    local out="$1"; shift
    local flags=() srcs=()
    while [ "$1" != "--" ]; do flags+=("$1"); shift; done; shift
    srcs=("$@")
    local name; name="$(basename "$out")"
    mkdir -p build/obj
    local ok=1
    for arch in arm64 x86_64; do
        if ! swiftc -O -swift-version 5 -suppress-warnings -target "${arch}-apple-macos12.0" \
             "${flags[@]}" -o "build/obj/${name}-${arch}" "${srcs[@]}"; then ok=0; break; fi
    done
    if [ $ok -eq 1 ]; then
        lipo -create -output "$out" "build/obj/${name}-arm64" "build/obj/${name}-x86_64"
    else
        echo "  (universal build failed, building for this Mac only)"
        swiftc -O -swift-version 5 -suppress-warnings "${flags[@]}" -o "$out" "${srcs[@]}"
    fi
}

SHARED=(Sources/ZipArchive.swift Sources/ThreeMF.swift Sources/SceneBuilder.swift)
EXT_FLAGS=(-parse-as-library -application-extension -Xlinker -e -Xlinker _NSExtensionMain)

rm -rf build
mkdir -p "$BUILD/Contents/MacOS" "$BUILD/Contents/Resources" "$BUILD/Contents/PlugIns"

echo "› Compiling app…"
compile "$BUILD/Contents/MacOS/ThreeMFViewer" \
    -module-name ThreeMFViewer -framework AppKit -framework SceneKit -framework UniformTypeIdentifiers \
    -- "${SHARED[@]}" Sources/main.swift
cp Info.plist "$BUILD/Contents/Info.plist"

echo "› Compiling Finder thumbnail extension…"
THUMB="$BUILD/Contents/PlugIns/ThreeMFThumbnail.appex"
mkdir -p "$THUMB/Contents/MacOS"
compile "$THUMB/Contents/MacOS/ThreeMFThumbnail" \
    -module-name ThreeMFThumbnail "${EXT_FLAGS[@]}" \
    -framework AppKit -framework SceneKit -framework Metal -framework QuickLookThumbnailing \
    -- "${SHARED[@]}" Extensions/ThumbnailProvider.swift
cp Extensions/Thumbnail-Info.plist "$THUMB/Contents/Info.plist"

echo "› Compiling Quick Look preview extension…"
PREV="$BUILD/Contents/PlugIns/ThreeMFPreview.appex"
mkdir -p "$PREV/Contents/MacOS"
compile "$PREV/Contents/MacOS/ThreeMFPreview" \
    -module-name ThreeMFPreview "${EXT_FLAGS[@]}" \
    -framework AppKit -framework SceneKit -framework Metal -framework Quartz \
    -- "${SHARED[@]}" Extensions/PreviewViewController.swift
cp Extensions/Preview-Info.plist "$PREV/Contents/Info.plist"

echo "› Registering .3mf file types for the extensions…"
TYPES=$( { "$BUILD/Contents/MacOS/ThreeMFViewer" --print-3mf-types 2>/dev/null || true; echo "org.3mf.3mf"; } | awk 'NF && !seen[$0]++' )
for plist in "$THUMB/Contents/Info.plist" "$PREV/Contents/Info.plist"; do
    i=0
    for t in $TYPES; do
        "$PB" -c "Add :NSExtension:NSExtensionAttributes:QLSupportedContentTypes:$i string $t" "$plist"
        i=$((i + 1))
    done
done
echo "  $(echo $TYPES | tr '\n' ' ')"

echo "› Making icon…"
ICONSET="build/AppIcon.iconset"
mkdir -p "$ICONSET"
for s in 16 32 128 256 512; do
    sips -z $s $s Resources/icon_1024.png --out "$ICONSET/icon_${s}x${s}.png" >/dev/null
    d=$((s * 2))
    sips -z $d $d Resources/icon_1024.png --out "$ICONSET/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$BUILD/Contents/Resources/AppIcon.icns"

echo "› Signing (local, ad-hoc)…"
codesign --force --sign - --entitlements Extensions/Extension.entitlements "$THUMB" >/dev/null 2>&1
codesign --force --sign - --entitlements Extensions/Extension.entitlements "$PREV" >/dev/null 2>&1
codesign --force --sign - "$BUILD" >/dev/null 2>&1
codesign --verify --deep "$BUILD"

if [ -n "$PACKAGE_ONLY" ]; then
    echo "› Zipping to ${PACKAGE_ONLY}…"
    rm -f "$PACKAGE_ONLY"
    ditto -c -k --keepParent "$BUILD" "$PACKAGE_ONLY"
    rm -rf build
    echo "✓ Packaged ${PACKAGE_ONLY}"
    exit 0
fi

if [ -w /Applications ]; then DEST="/Applications"; else DEST="${HOME}/Applications"; mkdir -p "$DEST"; fi
APP="${DEST}/${APP_NAME}.app"
echo "› Installing to ${DEST}…"
osascript -e "quit app \"${APP_NAME}\"" >/dev/null 2>&1 || true
rm -rf "$APP"
ditto "$BUILD" "$APP"
"$LSREGISTER" -f -R "$APP"

echo "› Turning on thumbnails and Quick Look…"
for ext in "$APP/Contents/PlugIns/"*.appex; do
    pluginkit -a "$ext" || true
done
pluginkit -e use -i com.local.threemfviewer.thumbnail || true
pluginkit -e use -i com.local.threemfviewer.preview || true
qlmanage -r >/dev/null 2>&1 || true
qlmanage -r cache >/dev/null 2>&1 || true

echo "› Setting as default app for .3mf…"
"$APP/Contents/MacOS/ThreeMFViewer" --make-default || \
    echo "  (Couldn't set automatically. Use the app menu: ${APP_NAME} › Make Default for .3mf Files)"
defaults write com.local.threemfviewer askedToBecomeDefault -bool true

echo "› Creating shareable zip…"
SHARE_DIR="build/share/${APP_NAME}"
mkdir -p "$SHARE_DIR"
ditto "$BUILD" "$SHARE_DIR/${APP_NAME}.app"
cat > "$SHARE_DIR/How to install.txt" <<'TXT'
3MF Viewer — view .3mf 3D print files on a Mac (Bambu Studio, OrcaSlicer, PrusaSlicer, Cura).
Shows the model as a Finder thumbnail, in Quick Look (press Space), and in its own viewer window.

INSTALL
1. Drag "3MF Viewer.app" into your Applications folder.
2. The first time, right-click it and choose Open, then click Open.
   If macOS still blocks it: System Settings › Privacy & Security › scroll down › "Open Anyway".
   (This happens because the app is not from the App Store.)
3. When asked, click "Use 3MF Viewer" so double-clicking .3mf files opens it.

Finder thumbnails appear after the app has been opened once. If they don't show,
log out and back in, or open Terminal and run:  qlmanage -r cache

USING IT
- Drag to rotate, scroll or pinch to zoom, + / - keys also zoom, R resets the view.
- ⌘G hides the 10 mm build-plate grid.
- The bottom bar shows the size in mm, triangle count, colours and file size.

Needs macOS 12 Monterey or later. Works on Apple Silicon and Intel Macs.
TXT
rm -f "$SHARE_ZIP"
ditto -c -k --keepParent "$SHARE_DIR" "$SHARE_ZIP"

"$LSREGISTER" -u "$BUILD" >/dev/null 2>&1 || true
rm -rf build

echo "› Refreshing Finder…"
killall Finder >/dev/null 2>&1 || true

echo ""
echo "✓ Done."
echo "  • \"${APP_NAME}\" is installed in ${DEST} and opens .3mf files."
echo "  • Finder now shows 3D thumbnails; select a .3mf and press Space for a 3D preview."
echo "  • To share it, send:  ${SHARE_ZIP}"
