// SceneBuilder.swift — shared by the app, the Finder thumbnail extension and the Quick Look preview.

import AppKit
import SceneKit
import Metal

// MARK: - Theme

struct Theme {
    let background: NSColor
    let grid: NSColor
    let gridMajor: NSColor

    static func current(for appearance: NSAppearance) -> Theme {
        let dark = appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
        if dark {
            return Theme(background: NSColor(srgbRed: 0.125, green: 0.135, blue: 0.155, alpha: 1),
                         grid: NSColor(srgbRed: 0.24, green: 0.26, blue: 0.29, alpha: 1),
                         gridMajor: NSColor(srgbRed: 0.34, green: 0.37, blue: 0.41, alpha: 1))
        }
        return Theme(background: NSColor(srgbRed: 0.925, green: 0.932, blue: 0.945, alpha: 1),
                     grid: NSColor(srgbRed: 0.80, green: 0.82, blue: 0.85, alpha: 1),
                     gridMajor: NSColor(srgbRed: 0.66, green: 0.69, blue: 0.73, alpha: 1))
    }
}

// MARK: - 3D view with scroll / pinch / keyboard zoom

class ZoomableSCNView: SCNView {
    var minDistance: CGFloat = 1
    var maxDistance: CGFloat = 10_000
    var onReset: (() -> Void)?

    override var acceptsFirstResponder: Bool { true }

    override func scrollWheel(with event: NSEvent) {
        let factor: CGFloat = event.hasPreciseScrollingDeltas ? 0.008 : 0.12
        zoom(by: event.scrollingDeltaY * factor)
    }

    override func magnify(with event: NSEvent) {
        zoom(by: event.magnification * 1.5)
    }

    override func keyDown(with event: NSEvent) {
        let mods = event.modifierFlags.intersection([.command, .option, .control])
        let key = event.charactersIgnoringModifiers?.lowercased() ?? ""
        guard mods.isEmpty else { super.keyDown(with: event); return }
        switch key {
        case "+", "=": zoom(by: 0.25)
        case "-", "_": zoom(by: -0.25)
        case "r": onReset?()
        default: super.keyDown(with: event)
        }
    }

    /// Positive amount moves the camera closer to the orbit target.
    func zoom(by amount: CGFloat) {
        guard amount != 0, let pov = pointOfView else { return }
        defaultCameraController.stopInertia()
        let t = defaultCameraController.target
        let p = pov.position
        let dx = p.x - t.x, dy = p.y - t.y, dz = p.z - t.z
        let len = (dx * dx + dy * dy + dz * dz).squareRoot()
        guard len > 0 else { return }
        let newLen = min(max(len * CGFloat(exp(Double(-amount))), minDistance), maxDistance)
        let k = newLen / len
        pov.position = SCNVector3(t.x + dx * k, t.y + dy * k, t.z + dz * k)
    }
}

// MARK: - Scene

struct BuiltScene {
    let scene: SCNScene
    let camera: SCNNode
    let target: SCNVector3
    let grid: SCNNode?
    let radius: CGFloat
}

enum SceneBuilder {
    /// theme == nil builds a transparent scene with no grid (for thumbnails).
    static func build(_ m: LoadedModel, theme: Theme?, framing: CGFloat = 1.2) -> BuiltScene {
        let scene = SCNScene()
        scene.background.contents = theme?.background ?? NSColor.clear

        // 3MF is Z-up in millimetres; SceneKit is Y-up.
        let model = SCNNode()
        model.eulerAngles.x = -CGFloat.pi / 2

        for b in m.batches {
            let n = b.positions.count / 3
            guard n >= 3 else { continue }
            let vData = b.positions.withUnsafeBufferPointer { Data(buffer: $0) }
            let nData = b.normals.withUnsafeBufferPointer { Data(buffer: $0) }
            let vs = SCNGeometrySource(data: vData, semantic: .vertex, vectorCount: n,
                                       usesFloatComponents: true, componentsPerVector: 3,
                                       bytesPerComponent: 4, dataOffset: 0, dataStride: 12)
            let ns = SCNGeometrySource(data: nData, semantic: .normal, vectorCount: n,
                                       usesFloatComponents: true, componentsPerVector: 3,
                                       bytesPerComponent: 4, dataOffset: 0, dataStride: 12)
            let indices = Array(0..<UInt32(n))
            let iData = indices.withUnsafeBufferPointer { Data(buffer: $0) }
            let element = SCNGeometryElement(data: iData, primitiveType: .triangles,
                                             primitiveCount: n / 3, bytesPerIndex: 4)
            let geo = SCNGeometry(sources: [vs, ns], elements: [element])

            let mat = SCNMaterial()
            mat.lightingModel = .blinn
            let alpha = CGFloat(max(b.color.a, 0.2))
            mat.diffuse.contents = NSColor(srgbRed: CGFloat(b.color.r), green: CGFloat(b.color.g),
                                           blue: CGFloat(b.color.b), alpha: alpha)
            mat.specular.contents = NSColor(white: 0.22, alpha: 1)
            mat.shininess = 0.3
            mat.isDoubleSided = true
            if alpha < 0.99 { mat.transparencyMode = .dualLayer }
            geo.materials = [mat]
            model.addChildNode(SCNNode(geometry: geo))
        }

        let sx = CGFloat(m.size.0), sy = CGFloat(m.size.1), sz = CGFloat(m.size.2)
        var grid: SCNNode?
        if let theme = theme {
            let g = makeGrid(halfExtent: Float(max(sx, sy)) * 0.75, theme: theme)
            model.addChildNode(g)
            grid = g
        }
        scene.rootNode.addChildNode(model)

        // Lighting: soft ambient, a key light that follows the camera, and a fill from above.
        let ambient = SCNNode()
        ambient.light = SCNLight()
        ambient.light!.type = .ambient
        ambient.light!.intensity = 420
        scene.rootNode.addChildNode(ambient)

        let fill = SCNNode()
        fill.light = SCNLight()
        fill.light!.type = .directional
        fill.light!.intensity = 320
        fill.eulerAngles = SCNVector3(-CGFloat.pi / 2, 0, 0)
        scene.rootNode.addChildNode(fill)

        let cameraNode = SCNNode()
        let cam = SCNCamera()
        cam.fieldOfView = 35
        cam.automaticallyAdjustsZRange = true
        cameraNode.camera = cam

        let key = SCNNode()
        key.light = SCNLight()
        key.light!.type = .directional
        key.light!.intensity = 760
        key.eulerAngles = SCNVector3(-0.35, 0.45, 0)
        cameraNode.addChildNode(key)
        scene.rootNode.addChildNode(cameraNode)

        // Front-right, slightly above, like a slicer's default view.
        let radius = max(0.5 * (sx * sx + sy * sy + sz * sz).squareRoot(), 1)
        let fov = Double(cam.fieldOfView) * Double.pi / 180
        let dist = radius / CGFloat(sin(fov / 2)) * framing
        var dx: CGFloat = 0.55, dy: CGFloat = 0.62, dz: CGFloat = 1.0
        let dl = (dx * dx + dy * dy + dz * dz).squareRoot()
        dx /= dl; dy /= dl; dz /= dl
        let target = SCNVector3(0, sz / 2, 0)
        cameraNode.position = SCNVector3(dx * dist, sz / 2 + dy * dist, dz * dist)
        cameraNode.look(at: target)

        return BuiltScene(scene: scene, camera: cameraNode, target: target, grid: grid, radius: radius)
    }

    /// Build-plate grid on Z = 0: 10 mm squares, a stronger line every 50 mm.
    static func makeGrid(halfExtent: Float, theme: Theme) -> SCNNode {
        let step: Float = 10
        let half = max((halfExtent / step).rounded(.up) * step + step, 30)
        var minor: [Float] = []
        var major: [Float] = []
        var v = -half
        while v <= half + 0.001 {
            let isMajor = Int((abs(v) / step).rounded()) % 5 == 0
            let line: [Float] = [v, -half, -0.05, v, half, -0.05, -half, v, -0.05, half, v, -0.05]
            if isMajor { major += line } else { minor += line }
            v += step
        }
        let node = SCNNode()
        for (pts, color) in [(minor, theme.grid), (major, theme.gridMajor)] where !pts.isEmpty {
            let count = pts.count / 3
            let data = pts.withUnsafeBufferPointer { Data(buffer: $0) }
            let src = SCNGeometrySource(data: data, semantic: .vertex, vectorCount: count,
                                        usesFloatComponents: true, componentsPerVector: 3,
                                        bytesPerComponent: 4, dataOffset: 0, dataStride: 12)
            let idx = Array(0..<UInt32(count))
            let iData = idx.withUnsafeBufferPointer { Data(buffer: $0) }
            let el = SCNGeometryElement(data: iData, primitiveType: .line,
                                        primitiveCount: count / 2, bytesPerIndex: 4)
            let geo = SCNGeometry(sources: [src], elements: [el])
            let mat = SCNMaterial()
            mat.lightingModel = .constant
            mat.diffuse.contents = color
            geo.materials = [mat]
            node.addChildNode(SCNNode(geometry: geo))
        }
        return node
    }

    /// Off-screen render of the object on a transparent background.
    static func renderThumbnail(_ m: LoadedModel, pixels: CGFloat) -> NSImage? {
        guard m.triangleCount > 0, let device = MTLCreateSystemDefaultDevice() else { return nil }
        let built = build(m, theme: nil, framing: 0.95)
        let r = SCNRenderer(device: device, options: nil)
        r.scene = built.scene
        r.pointOfView = built.camera
        let side = max(64, min(pixels, 1024))
        return r.snapshot(atTime: 0, with: CGSize(width: side, height: side), antialiasingMode: .multisampling4X)
    }

    static func infoText(_ m: LoadedModel, fileURL: URL) -> String {
        let nf = NumberFormatter()
        nf.numberStyle = .decimal
        let triText = nf.string(from: NSNumber(value: m.triangleCount)) ?? "\(m.triangleCount)"
        var text = String(format: "%.1f × %.1f × %.1f mm", m.size.0, m.size.1, m.size.2)
        text += "   ·   \(triText) triangles"
        if m.batches.count > 1 { text += "   ·   \(m.batches.count) colours" }
        if let bytes = (try? fileURL.resourceValues(forKeys: [.fileSizeKey]))?.fileSize {
            text += "   ·   " + ByteCountFormatter.string(fromByteCount: Int64(bytes), countStyle: .file)
        }
        return text
    }
}
