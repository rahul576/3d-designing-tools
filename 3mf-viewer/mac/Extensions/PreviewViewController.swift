// PreviewViewController.swift — Space-bar Quick Look preview for .3mf files (rotate + zoom).

import AppKit
import Quartz
import SceneKit

@objc(TMFPreviewViewController)
final class PreviewViewController: NSViewController, QLPreviewingController {
    private let scnView = ZoomableSCNView(frame: NSRect(x: 0, y: 0, width: 800, height: 600), options: nil)
    private let imageView = NSImageView()
    private let infoLabel = NSTextField(labelWithString: "")

    override var nibName: NSNib.Name? { nil }

    override func loadView() {
        let root = NSView(frame: NSRect(x: 0, y: 0, width: 800, height: 600))
        let theme = Theme.current(for: root.effectiveAppearance)

        scnView.translatesAutoresizingMaskIntoConstraints = false
        scnView.backgroundColor = theme.background
        scnView.allowsCameraControl = true
        scnView.antialiasingMode = .multisampling4X
        scnView.defaultCameraController.interactionMode = .orbitTurntable
        root.addSubview(scnView)

        imageView.translatesAutoresizingMaskIntoConstraints = false
        imageView.imageScaling = .scaleProportionallyUpOrDown
        imageView.isHidden = true
        root.addSubview(imageView)

        infoLabel.translatesAutoresizingMaskIntoConstraints = false
        infoLabel.font = .monospacedDigitSystemFont(ofSize: 11, weight: .medium)
        infoLabel.textColor = .secondaryLabelColor
        infoLabel.lineBreakMode = .byTruncatingTail
        root.addSubview(infoLabel)

        NSLayoutConstraint.activate([
            scnView.leadingAnchor.constraint(equalTo: root.leadingAnchor),
            scnView.trailingAnchor.constraint(equalTo: root.trailingAnchor),
            scnView.topAnchor.constraint(equalTo: root.topAnchor),
            scnView.bottomAnchor.constraint(equalTo: root.bottomAnchor),
            imageView.leadingAnchor.constraint(equalTo: root.leadingAnchor),
            imageView.trailingAnchor.constraint(equalTo: root.trailingAnchor),
            imageView.topAnchor.constraint(equalTo: root.topAnchor),
            imageView.bottomAnchor.constraint(equalTo: root.bottomAnchor),
            infoLabel.leadingAnchor.constraint(equalTo: root.leadingAnchor, constant: 12),
            infoLabel.trailingAnchor.constraint(lessThanOrEqualTo: root.trailingAnchor, constant: -12),
            infoLabel.bottomAnchor.constraint(equalTo: root.bottomAnchor, constant: -10),
        ])
        view = root
    }

    func preparePreviewOfFile(at url: URL, completionHandler handler: @escaping (Error?) -> Void) {
        DispatchQueue.global(qos: .userInitiated).async {
            let result = Result(catching: { try ThreeMFLoader.load(url) })
            DispatchQueue.main.async {
                switch result {
                case .failure(let error):
                    handler(error)
                case .success(let m):
                    if m.triangleCount > 0 {
                        let built = SceneBuilder.build(m, theme: Theme.current(for: self.view.effectiveAppearance))
                        self.scnView.scene = built.scene
                        self.scnView.pointOfView = built.camera
                        self.scnView.defaultCameraController.target = built.target
                        self.scnView.minDistance = built.radius * 0.05
                        self.scnView.maxDistance = built.radius * 25
                        self.infoLabel.stringValue = SceneBuilder.infoText(m, fileURL: url)
                        handler(nil)
                    } else if let d = m.thumbnail, let img = NSImage(data: d) {
                        self.imageView.image = img
                        self.imageView.isHidden = false
                        self.scnView.isHidden = true
                        handler(nil)
                    } else {
                        handler(ThreeMFError.noModel)
                    }
                }
            }
        }
    }
}
