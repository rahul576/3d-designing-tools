// ThumbnailProvider.swift — Finder thumbnails for .3mf files.
// Renders the object itself in its filament colours; falls back to the slicer's embedded image.

import AppKit
import QuickLookThumbnailing

@objc(TMFThumbnailProvider)
final class ThumbnailProvider: QLThumbnailProvider {
    /// Above this the render could be slow, so the embedded slicer image is used instead.
    private let maxTriangles = 2_500_000

    override func provideThumbnail(for request: QLFileThumbnailRequest,
                                   _ handler: @escaping (QLThumbnailReply?, Error?) -> Void) {
        let url = request.fileURL
        let maxSize = request.maximumSize
        let pixels = max(maxSize.width, maxSize.height) * max(request.scale, 1)

        var image: NSImage?
        if let model = try? ThreeMFLoader.load(url), model.triangleCount > 0, model.triangleCount <= maxTriangles {
            image = SceneBuilder.renderThumbnail(model, pixels: pixels)
        }
        if image == nil, let d = ThreeMFLoader.embeddedThumbnail(url) {
            image = NSImage(data: d)
        }
        guard let img = image, img.size.width > 0, img.size.height > 0 else {
            handler(nil, ThreeMFError.noModel)
            return
        }

        let s = min(maxSize.width / img.size.width, maxSize.height / img.size.height)
        let ctx = CGSize(width: max(1, (img.size.width * s).rounded()),
                         height: max(1, (img.size.height * s).rounded()))
        handler(QLThumbnailReply(contextSize: ctx, currentContextDrawing: { () -> Bool in
            img.draw(in: CGRect(origin: .zero, size: ctx))
            return true
        }), nil)
    }
}
