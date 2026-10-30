# Homebrew cask for the 3MF Viewer Mac app (source in 3mf-viewer/mac/).
#   brew tap rahul576/3d-designing-tools https://github.com/rahul576/3d-designing-tools
#   brew install --cask 3mf-viewer
# The release workflow (.github/workflows/3mf-viewer-mac.yml) builds the zip and updates
# version and sha256 here whenever the version in 3mf-viewer/mac/Info.plist changes.
cask "3mf-viewer" do
  version "1.1"
  sha256 :no_check

  url "https://github.com/rahul576/3d-designing-tools/releases/download/3mf-viewer-mac-v#{version}/3MF-Viewer-#{version}.zip"
  name "3MF Viewer"
  desc "Viewer for 3MF 3D print files with Finder thumbnails and Quick Look"
  homepage "https://rahul576.github.io/3d-designing-tools/3mf-viewer/"

  depends_on macos: ">= :monterey"

  app "3MF Viewer.app"

  postflight do
    app_path = "#{appdir}/3MF Viewer.app"
    # The app is signed locally, not notarized, so lift the download quarantine.
    system_command "/usr/bin/xattr", args: ["-dr", "com.apple.quarantine", app_path]
    system_command "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister",
                   args: ["-f", "-R", app_path]
    Dir["#{app_path}/Contents/PlugIns/*.appex"].each do |ext|
      system_command "/usr/bin/pluginkit", args: ["-a", ext]
    end
    %w[com.local.threemfviewer.thumbnail com.local.threemfviewer.preview].each do |id|
      system_command "/usr/bin/pluginkit", args: ["-e", "use", "-i", id]
    end
    system_command "/usr/bin/qlmanage", args: ["-r"]
    system_command "/usr/bin/qlmanage", args: ["-r", "cache"]
  end

  uninstall quit: "com.local.threemfviewer"

  zap trash: [
    "~/Library/Preferences/com.local.threemfviewer.plist",
    "~/Library/Saved Application State/com.local.threemfviewer.savedState",
  ]
end
