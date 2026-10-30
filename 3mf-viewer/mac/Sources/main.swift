// main.swift — 3MF Viewer: a lightweight Preview-style viewer for .3mf files.

import AppKit
import SceneKit
import UniformTypeIdentifiers

let appName = "3MF Viewer"
let bundleID = Bundle.main.bundleIdentifier ?? "com.local.threemfviewer"

// MARK: - File types

func threeMFTypeIdentifiers() -> [String] {
    var ids: [String] = []
    if let t = UTType(filenameExtension: "3mf") { ids.append(t.identifier) }
    for t in UTType.types(tag: "3mf", tagClass: .filenameExtension, conformingTo: nil) where !ids.contains(t.identifier) {
        ids.append(t.identifier)
    }
    return ids
}

/// Registers this app as the default for every type macOS associates with ".3mf".
@discardableResult
func setAsDefault3MFViewer() -> Bool {
    let ids = threeMFTypeIdentifiers()
    var ok = !ids.isEmpty
    for id in ids {
        let status = LSSetDefaultRoleHandlerForContentType(id as CFString, .all, bundleID as CFString)
        if status != noErr { ok = false }
    }
    return ok
}

// MARK: - 3D view with drag-and-drop

final class DropSCNView: ZoomableSCNView {
    var onDrop: (([URL]) -> Void)?

    override init(frame: NSRect, options: [String: Any]? = nil) {
        super.init(frame: frame, options: options)
        registerForDraggedTypes([.fileURL])
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        registerForDraggedTypes([.fileURL])
    }

    private func fileURLs(_ info: NSDraggingInfo) -> [URL] {
        let objs = info.draggingPasteboard.readObjects(forClasses: [NSURL.self],
                                                       options: [.urlReadingFileURLsOnly: true]) as? [URL] ?? []
        return objs.filter { $0.pathExtension.lowercased() == "3mf" }
    }

    override func draggingEntered(_ sender: NSDraggingInfo) -> NSDragOperation {
        fileURLs(sender).isEmpty ? [] : .copy
    }

    override func performDragOperation(_ sender: NSDraggingInfo) -> Bool {
        let urls = fileURLs(sender)
        guard !urls.isEmpty else { return false }
        onDrop?(urls)
        return true
    }
}

// MARK: - Viewer window

final class ViewerWindowController: NSWindowController, NSWindowDelegate {
    let url: URL
    var onClose: (() -> Void)?
    var onOpen: (([URL]) -> Void)?

    private static var cascadePoint = NSPoint.zero

    private let scnView = DropSCNView(frame: .zero, options: nil)
    private let imageView = NSImageView()
    private let infoPill = NSVisualEffectView()
    private let infoLabel = NSTextField(labelWithString: "")
    private let messageLabel = NSTextField(wrappingLabelWithString: "")
    private let spinner = NSProgressIndicator()

    private var cameraNode: SCNNode?
    private var homeTransform = SCNMatrix4Identity
    private var target = SCNVector3Zero
    private var gridNode: SCNNode?

    init(url: URL) {
        self.url = url
        let w = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 920, height: 680),
                         styleMask: [.titled, .closable, .miniaturizable, .resizable],
                         backing: .buffered, defer: false)
        w.title = url.lastPathComponent
        w.representedURL = url
        w.minSize = NSSize(width: 380, height: 300)
        w.isReleasedWhenClosed = false
        w.tabbingMode = .preferred
        super.init(window: w)
        w.delegate = self

        if ViewerWindowController.cascadePoint == .zero {
            w.center()
            ViewerWindowController.cascadePoint = w.cascadeTopLeft(from: .zero)
        } else {
            ViewerWindowController.cascadePoint = w.cascadeTopLeft(from: ViewerWindowController.cascadePoint)
        }

        setupViews()
        load()
    }

    required init?(coder: NSCoder) { fatalError("not used") }

    func windowWillClose(_ notification: Notification) { onClose?() }

    // MARK: Layout

    private func setupViews() {
        guard let content = window?.contentView else { return }
        let theme = Theme.current(for: NSApp.effectiveAppearance)

        scnView.translatesAutoresizingMaskIntoConstraints = false
        scnView.backgroundColor = theme.background
        scnView.allowsCameraControl = true
        scnView.antialiasingMode = .multisampling4X
        scnView.defaultCameraController.interactionMode = .orbitTurntable
        scnView.defaultCameraController.inertiaEnabled = true
        scnView.onReset = { [weak self] in self?.resetView(nil) }
        scnView.onDrop = { [weak self] urls in self?.onOpen?(urls) }
        content.addSubview(scnView)

        imageView.translatesAutoresizingMaskIntoConstraints = false
        imageView.imageScaling = .scaleProportionallyUpOrDown
        imageView.isHidden = true
        imageView.wantsLayer = true
        imageView.layer?.backgroundColor = theme.background.cgColor
        content.addSubview(imageView)

        infoPill.translatesAutoresizingMaskIntoConstraints = false
        infoPill.material = .popover
        infoPill.blendingMode = .withinWindow
        infoPill.state = .active
        infoPill.wantsLayer = true
        infoPill.layer?.cornerRadius = 8
        infoPill.layer?.masksToBounds = true
        infoPill.isHidden = true
        content.addSubview(infoPill)

        infoLabel.translatesAutoresizingMaskIntoConstraints = false
        infoLabel.font = .monospacedDigitSystemFont(ofSize: 12, weight: .medium)
        infoLabel.textColor = .labelColor
        infoLabel.lineBreakMode = .byTruncatingTail
        infoPill.addSubview(infoLabel)

        messageLabel.translatesAutoresizingMaskIntoConstraints = false
        messageLabel.alignment = .center
        messageLabel.font = .systemFont(ofSize: 14)
        messageLabel.textColor = .secondaryLabelColor
        messageLabel.isHidden = true
        content.addSubview(messageLabel)

        spinner.translatesAutoresizingMaskIntoConstraints = false
        spinner.style = .spinning
        spinner.controlSize = .regular
        content.addSubview(spinner)

        NSLayoutConstraint.activate([
            scnView.leadingAnchor.constraint(equalTo: content.leadingAnchor),
            scnView.trailingAnchor.constraint(equalTo: content.trailingAnchor),
            scnView.topAnchor.constraint(equalTo: content.topAnchor),
            scnView.bottomAnchor.constraint(equalTo: content.bottomAnchor),

            imageView.leadingAnchor.constraint(equalTo: content.leadingAnchor),
            imageView.trailingAnchor.constraint(equalTo: content.trailingAnchor),
            imageView.topAnchor.constraint(equalTo: content.topAnchor),
            imageView.bottomAnchor.constraint(equalTo: content.bottomAnchor),

            infoPill.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: 12),
            infoPill.bottomAnchor.constraint(equalTo: content.bottomAnchor, constant: -12),
            infoPill.trailingAnchor.constraint(lessThanOrEqualTo: content.trailingAnchor, constant: -12),

            infoLabel.leadingAnchor.constraint(equalTo: infoPill.leadingAnchor, constant: 10),
            infoLabel.trailingAnchor.constraint(equalTo: infoPill.trailingAnchor, constant: -10),
            infoLabel.topAnchor.constraint(equalTo: infoPill.topAnchor, constant: 6),
            infoLabel.bottomAnchor.constraint(equalTo: infoPill.bottomAnchor, constant: -6),

            messageLabel.centerXAnchor.constraint(equalTo: content.centerXAnchor),
            messageLabel.centerYAnchor.constraint(equalTo: content.centerYAnchor),
            messageLabel.widthAnchor.constraint(lessThanOrEqualTo: content.widthAnchor, constant: -48),

            spinner.centerXAnchor.constraint(equalTo: content.centerXAnchor),
            spinner.centerYAnchor.constraint(equalTo: content.centerYAnchor),
        ])
    }

    // MARK: Loading

    private func load() {
        spinner.startAnimation(nil)
        let url = self.url
        DispatchQueue.global(qos: .userInitiated).async {
            let result = Result(catching: { try ThreeMFLoader.load(url) })
            DispatchQueue.main.async { [weak self] in self?.present(result) }
        }
    }

    private func present(_ result: Result<LoadedModel, Error>) {
        spinner.stopAnimation(nil)
        spinner.isHidden = true
        switch result {
        case .failure(let error):
            showMessage(error.localizedDescription)
        case .success(let model):
            if model.triangleCount > 0 {
                showScene(model)
                window?.makeFirstResponder(scnView)
            } else if let d = model.thumbnail, let img = NSImage(data: d) {
                imageView.image = img
                imageView.isHidden = false
                scnView.isHidden = true
                setInfo("No 3D mesh in this file · showing the slicer's preview image")
            } else {
                showMessage(ThreeMFError.noModel.localizedDescription)
            }
        }
    }

    private func showMessage(_ text: String) {
        messageLabel.stringValue = text
        messageLabel.isHidden = false
    }

    private func setInfo(_ text: String) {
        infoLabel.stringValue = text
        infoPill.isHidden = false
    }

    private func showScene(_ m: LoadedModel) {
        let built = SceneBuilder.build(m, theme: Theme.current(for: NSApp.effectiveAppearance))
        cameraNode = built.camera
        homeTransform = built.camera.transform
        target = built.target
        gridNode = built.grid

        scnView.scene = built.scene
        scnView.pointOfView = built.camera
        scnView.defaultCameraController.target = built.target
        scnView.minDistance = built.radius * 0.05
        scnView.maxDistance = built.radius * 25
        setInfo(SceneBuilder.infoText(m, fileURL: url))
    }

    // MARK: Actions

    @objc func resetView(_ sender: Any?) {
        guard let cam = cameraNode else { return }
        scnView.defaultCameraController.stopInertia()
        SCNTransaction.begin()
        SCNTransaction.animationDuration = 0.35
        cam.transform = homeTransform
        SCNTransaction.commit()
        scnView.pointOfView = cam
        scnView.defaultCameraController.target = target
    }

    @objc func zoomIn(_ sender: Any?) { scnView.zoom(by: 0.3) }
    @objc func zoomOut(_ sender: Any?) { scnView.zoom(by: -0.3) }

    @objc func toggleGrid(_ sender: Any?) {
        gridNode?.isHidden.toggle()
    }
}

// MARK: - App delegate

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var controllers: [ViewerWindowController] = []
    private var openedFile = false

    func applicationWillFinishLaunching(_ notification: Notification) {
        buildMenu()
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.activate(ignoringOtherApps: true)
        registerQuickLookExtensions()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
            self.askToBecomeDefaultOnce()
            if !self.openedFile && self.controllers.isEmpty { self.showOpenPanel(quitOnCancel: true) }
        }
    }

    /// Makes sure Finder knows about the bundled thumbnail and Quick Look extensions.
    private func registerQuickLookExtensions() {
        guard let plugins = Bundle.main.builtInPlugInsURL,
              let items = try? FileManager.default.contentsOfDirectory(at: plugins, includingPropertiesForKeys: nil)
        else { return }
        let appexes = items.filter { $0.pathExtension == "appex" }
        DispatchQueue.global(qos: .utility).async {
            for ext in appexes {
                AppDelegate.run("/usr/bin/pluginkit", ["-a", ext.path])
                if let id = Bundle(url: ext)?.bundleIdentifier {
                    AppDelegate.run("/usr/bin/pluginkit", ["-e", "use", "-i", id])
                }
            }
        }
    }

    private static func run(_ tool: String, _ args: [String]) {
        let p = Process()
        p.executableURL = URL(fileURLWithPath: tool)
        p.arguments = args
        p.standardOutput = FileHandle.nullDevice
        p.standardError = FileHandle.nullDevice
        try? p.run()
        p.waitUntilExit()
    }

    private func isDefaultViewer() -> Bool {
        guard let t = UTType(filenameExtension: "3mf"),
              let app = NSWorkspace.shared.urlForApplication(toOpen: t) else { return false }
        return Bundle(url: app)?.bundleIdentifier == bundleID
    }

    private func askToBecomeDefaultOnce() {
        let key = "askedToBecomeDefault"
        let defaults = UserDefaults.standard
        guard !defaults.bool(forKey: key), !isDefaultViewer() else { return }
        defaults.set(true, forKey: key)
        let alert = NSAlert()
        alert.messageText = "Open .3mf files with \(appName)?"
        alert.informativeText = "Double-clicking a .3mf file in Finder will open it here. You can change this later from the \(appName) menu."
        alert.addButton(withTitle: "Use \(appName)")
        alert.addButton(withTitle: "Not Now")
        if alert.runModal() == .alertFirstButtonReturn { setAsDefault3MFViewer() }
    }

    func application(_ sender: NSApplication, openFiles filenames: [String]) {
        filenames.forEach { open(URL(fileURLWithPath: $0)) }
        sender.reply(toOpenOrPrint: .success)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    func open(_ url: URL) {
        openedFile = true
        if let existing = controllers.first(where: { $0.url.standardizedFileURL == url.standardizedFileURL }) {
            existing.window?.makeKeyAndOrderFront(nil)
            return
        }
        let c = ViewerWindowController(url: url)
        c.onClose = { [weak self, weak c] in
            guard let self = self, let c = c else { return }
            self.controllers.removeAll { $0 === c }
        }
        c.onOpen = { [weak self] urls in urls.forEach { self?.open($0) } }
        controllers.append(c)
        c.showWindow(nil)
        NSDocumentController.shared.noteNewRecentDocumentURL(url)
    }

    private func showOpenPanel(quitOnCancel: Bool) {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = true
        panel.canChooseDirectories = false
        if let t = UTType(filenameExtension: "3mf") { panel.allowedContentTypes = [t] }
        panel.message = "Choose .3mf files to view"
        if panel.runModal() == .OK {
            panel.urls.forEach { open($0) }
        } else if quitOnCancel && controllers.isEmpty {
            NSApp.terminate(nil)
        }
    }

    @objc func openDocument(_ sender: Any?) {
        showOpenPanel(quitOnCancel: false)
    }

    @objc func makeDefault(_ sender: Any?) {
        let ok = setAsDefault3MFViewer()
        let alert = NSAlert()
        alert.messageText = ok ? "\(appName) now opens .3mf files" : "Couldn't make \(appName) the default"
        alert.informativeText = ok
            ? "Double-click any .3mf file in Finder to view it here."
            : "In Finder, select a .3mf file, choose File › Get Info, pick \(appName) under “Open with”, then click Change All."
        alert.runModal()
    }

    private func buildMenu() {
        let main = NSMenu()

        func submenu(_ title: String) -> NSMenu {
            let item = NSMenuItem(title: title, action: nil, keyEquivalent: "")
            let menu = NSMenu(title: title)
            item.submenu = menu
            main.addItem(item)
            return menu
        }

        let app = submenu(appName)
        app.addItem(withTitle: "About \(appName)",
                    action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        app.addItem(.separator())
        app.addItem(withTitle: "Make Default for .3mf Files", action: #selector(makeDefault(_:)), keyEquivalent: "")
        app.addItem(.separator())
        app.addItem(withTitle: "Hide \(appName)", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        let hideOthers = app.addItem(withTitle: "Hide Others",
                                     action: #selector(NSApplication.hideOtherApplications(_:)), keyEquivalent: "h")
        hideOthers.keyEquivalentModifierMask = [.command, .option]
        app.addItem(.separator())
        app.addItem(withTitle: "Quit \(appName)", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")

        let file = submenu("File")
        file.addItem(withTitle: "Open…", action: #selector(openDocument(_:)), keyEquivalent: "o")
        file.addItem(withTitle: "Close", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")

        let view = submenu("View")
        view.addItem(withTitle: "Zoom In", action: #selector(ViewerWindowController.zoomIn(_:)), keyEquivalent: "+")
        view.addItem(withTitle: "Zoom Out", action: #selector(ViewerWindowController.zoomOut(_:)), keyEquivalent: "-")
        view.addItem(withTitle: "Reset View", action: #selector(ViewerWindowController.resetView(_:)),
                     keyEquivalent: "0")
        view.addItem(.separator())
        view.addItem(withTitle: "Show/Hide Grid", action: #selector(ViewerWindowController.toggleGrid(_:)),
                     keyEquivalent: "g")
        view.addItem(.separator())
        let fs = view.addItem(withTitle: "Enter Full Screen", action: #selector(NSWindow.toggleFullScreen(_:)),
                              keyEquivalent: "f")
        fs.keyEquivalentModifierMask = [.command, .control]

        let win = submenu("Window")
        win.addItem(withTitle: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        win.addItem(withTitle: "Zoom", action: #selector(NSWindow.performZoom(_:)), keyEquivalent: "")
        NSApp.windowsMenu = win

        NSApp.mainMenu = main
    }
}

// MARK: - Entry point

if CommandLine.arguments.contains("--print-3mf-types") {
    threeMFTypeIdentifiers().forEach { print($0) }
    exit(0)
}

if CommandLine.arguments.contains("--make-default") {
    let ok = setAsDefault3MFViewer()
    print(ok ? "3MF Viewer is now the default app for .3mf files." : "Could not set default app.")
    exit(ok ? 0 : 1)
}

let application = NSApplication.shared
let delegate = AppDelegate()
application.delegate = delegate
application.setActivationPolicy(.regular)
application.run()
