// ThreeMF.swift — reads .3mf files (Bambu Studio, OrcaSlicer, PrusaSlicer, Cura, generic)
// Foundation only. Produces flat-shaded triangle buckets grouped by colour.

import Foundation
#if canImport(FoundationXML)
import FoundationXML
#endif

// MARK: - Colour

struct RGBA: Hashable {
    var r: Float
    var g: Float
    var b: Float
    var a: Float
    static let fallback = RGBA(r: 0.72, g: 0.74, b: 0.77, a: 1)
}

extension RGBA {
    init?(hex: String) {
        var s = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if s.hasPrefix("#") { s.removeFirst() }
        guard s.count == 6 || s.count == 8, let v = UInt64(s, radix: 16) else { return nil }
        if s.count == 6 {
            self.init(r: Float((v >> 16) & 0xff) / 255, g: Float((v >> 8) & 0xff) / 255,
                      b: Float(v & 0xff) / 255, a: 1)
        } else {
            self.init(r: Float((v >> 24) & 0xff) / 255, g: Float((v >> 16) & 0xff) / 255,
                      b: Float((v >> 8) & 0xff) / 255, a: Float(v & 0xff) / 255)
        }
    }
}

// MARK: - 3MF transform (row-vector convention: p' = p * M)

struct Xform {
    var m: [Double] // m00 m01 m02 m10 m11 m12 m20 m21 m22 m30 m31 m32
    static let identity = Xform(m: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0])

    init(m: [Double]) { self.m = m }

    init?(string: String?) {
        guard let s = string else { return nil }
        let v = s.split(whereSeparator: { $0 == " " || $0 == "\t" || $0 == "\n" || $0 == "\r" })
            .compactMap { Double($0) }
        guard v.count == 12 else { return nil }
        m = v
    }

    @inline(__always)
    func apply(_ x: Double, _ y: Double, _ z: Double) -> (Double, Double, Double) {
        (x * m[0] + y * m[3] + z * m[6] + m[9],
         x * m[1] + y * m[4] + z * m[7] + m[10],
         x * m[2] + y * m[5] + z * m[8] + m[11])
    }

    /// Apply self first, then `o`.
    func then(_ o: Xform) -> Xform {
        let a = m, b = o.m
        var out = [Double](repeating: 0, count: 12)
        for i in 0..<3 {
            for j in 0..<3 {
                out[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j]
            }
        }
        for j in 0..<3 {
            out[9 + j] = a[9] * b[j] + a[10] * b[3 + j] + a[11] * b[6 + j] + b[9 + j]
        }
        return Xform(m: out)
    }
}

// MARK: - Model data

final class MeshObject {
    var vertices: [Double] = []
    var tris: [Int32] = []
    var triColor: [Int32] = []          // index into colors, -1 = inherit
    var colors: [RGBA] = []
    private var colorIndex: [RGBA: Int32] = [:]
    var defaultColor: RGBA?
    var components: [Component] = []

    func intern(_ c: RGBA) -> Int32 {
        if let i = colorIndex[c] { return i }
        let i = Int32(colors.count)
        colors.append(c)
        colorIndex[c] = i
        return i
    }
}

struct Component {
    let path: String?
    let objectID: String
    let xform: Xform
}

struct BuildItem {
    let objectID: String
    let xform: Xform
    let path: String?
}

final class ModelFile {
    var objects: [String: MeshObject] = [:]
    var items: [BuildItem] = []
}

@inline(__always)
private func localName(_ n: String) -> String {
    if let i = n.lastIndex(of: ":") { return String(n[n.index(after: i)...]) }
    return n
}

/// Attribute lookup that ignores namespace prefixes (e.g. "p:path" matches "path").
private func attr(_ a: [String: String], _ key: String) -> String? {
    if let v = a[key] { return v }
    for (k, v) in a where localName(k) == key { return v }
    return nil
}

/// Decodes Bambu/Prusa per-triangle paint data ("paint_color" / "mmu_segmentation").
/// Returns the 1-based extruder that covers most of the triangle, or 0 for unpainted.
func paintState(_ s: String) -> Int {
    let nibbles: [Int] = s.reversed().compactMap { $0.hexDigitValue }
    var i = 0
    var counts: [Int: Int] = [:]
    func node(_ weight: Int) {
        guard i < nibbles.count else { return }
        let n = nibbles[i]
        i += 1
        let split = n & 3
        if split > 0 {
            for _ in 0...split { node(weight / (split + 1)) }
        } else {
            var st = n >> 2
            if st == 3, i < nibbles.count {
                st = nibbles[i] + 3
                i += 1
            }
            counts[st, default: 0] += max(weight, 1)
        }
    }
    node(1 << 20)
    return counts.max(by: { $0.value < $1.value })?.key ?? 0
}

// MARK: - XML parsers

final class ModelParser: NSObject, XMLParserDelegate {
    let file = ModelFile()
    private let filaments: [RGBA]
    private var groups: [String: [RGBA]] = [:]
    private var groupID: String?
    private var groupColors: [RGBA] = []
    private var obj: MeshObject?
    private var objID: String?

    init(filaments: [RGBA]) { self.filaments = filaments }

    static func parse(_ data: Data, filaments: [RGBA]) -> ModelFile? {
        let p = XMLParser(data: data)
        let d = ModelParser(filaments: filaments)
        p.delegate = d
        p.shouldProcessNamespaces = false
        _ = p.parse()
        return d.file
    }

    func parser(_ parser: XMLParser, didStartElement elementName: String, namespaceURI: String?,
                qualifiedName qName: String?, attributes a: [String: String] = [:]) {
        switch localName(elementName) {
        case "basematerials", "colorgroup":
            groupID = a["id"]
            groupColors = []
        case "base":
            groupColors.append(RGBA(hex: a["displaycolor"] ?? "") ?? .fallback)
        case "color":
            if groupID != nil { groupColors.append(RGBA(hex: a["color"] ?? "") ?? .fallback) }
        case "object":
            let o = MeshObject()
            obj = o
            objID = a["id"]
            if let pid = a["pid"], let g = groups[pid] {
                let idx = Int(a["pindex"] ?? "0") ?? 0
                if idx >= 0, idx < g.count { o.defaultColor = g[idx] }
            }
        case "vertex":
            guard let o = obj else { return }
            o.vertices.append(Double(a["x"] ?? "") ?? 0)
            o.vertices.append(Double(a["y"] ?? "") ?? 0)
            o.vertices.append(Double(a["z"] ?? "") ?? 0)
        case "triangle":
            guard let o = obj,
                  let v1 = Int32(a["v1"] ?? ""), let v2 = Int32(a["v2"] ?? ""), let v3 = Int32(a["v3"] ?? "")
            else { return }
            o.tris.append(v1); o.tris.append(v2); o.tris.append(v3)
            var c: Int32 = -1
            if let paint = attr(a, "paint_color") ?? attr(a, "mmu_segmentation"), !paint.isEmpty {
                let st = paintState(paint)
                if st > 0, st <= filaments.count { c = o.intern(filaments[st - 1]) }
            }
            if c < 0, let pid = a["pid"], let g = groups[pid] {
                let p1 = Int(a["p1"] ?? "0") ?? 0
                if p1 >= 0, p1 < g.count { c = o.intern(g[p1]) }
            }
            o.triColor.append(c)
        case "component":
            guard let o = obj, let id = a["objectid"] else { return }
            o.components.append(Component(path: attr(a, "path"), objectID: id,
                                          xform: Xform(string: a["transform"]) ?? .identity))
        case "item":
            guard let id = a["objectid"] else { return }
            file.items.append(BuildItem(objectID: id, xform: Xform(string: a["transform"]) ?? .identity,
                                        path: attr(a, "path")))
        default:
            break
        }
    }

    func parser(_ parser: XMLParser, didEndElement elementName: String, namespaceURI: String?,
                qualifiedName qName: String?) {
        switch localName(elementName) {
        case "basematerials", "colorgroup":
            if let id = groupID { groups[id] = groupColors }
            groupID = nil
        case "object":
            if let o = obj, let id = objID { file.objects[id] = o }
            obj = nil
            objID = nil
        default:
            break
        }
    }
}

/// Reads per-object / per-part extruder assignments from
/// Metadata/model_settings.config (Bambu, Orca) or Metadata/Slic3r_PE_model.config (Prusa).
final class SettingsParser: NSObject, XMLParserDelegate {
    var objExtruder: [String: Int] = [:]
    var partExtruder: [String: [String: Int]] = [:]
    private var curObj: String?
    private var curPart: String?

    func parser(_ parser: XMLParser, didStartElement elementName: String, namespaceURI: String?,
                qualifiedName qName: String?, attributes a: [String: String] = [:]) {
        switch elementName {
        case "object": curObj = a["id"]
        case "part": curPart = a["id"]
        case "metadata":
            guard a["key"] == "extruder", let obj = curObj, let e = Int(a["value"] ?? "") else { return }
            if let part = curPart {
                partExtruder[obj, default: [:]][part] = e
            } else if a["type"] == nil || a["type"] == "object" {
                objExtruder[obj] = e
            }
        default: break
        }
    }

    func parser(_ parser: XMLParser, didEndElement elementName: String, namespaceURI: String?,
                qualifiedName qName: String?) {
        if elementName == "part" { curPart = nil }
        if elementName == "object" { curObj = nil; curPart = nil }
    }
}

// MARK: - Loader

struct ColorBatch {
    let color: RGBA
    let positions: [Float]
    let normals: [Float]
}

struct LoadedModel {
    var batches: [ColorBatch]
    var size: (Float, Float, Float)     // mm, X × Y × Z
    var triangleCount: Int
    var thumbnail: Data?
}

enum ThreeMFError: LocalizedError {
    case unzipFailed, noModel
    var errorDescription: String? {
        switch self {
        case .unzipFailed: return "This file couldn't be opened. It may be damaged or not a 3MF file."
        case .noModel: return "No 3D model was found inside this file."
        }
    }
}

final class ThreeMFLoader {
    private let zip: ZipArchive
    private var filaments: [RGBA] = []
    private var objExtruder: [String: Int] = [:]
    private var partExtruder: [String: [String: Int]] = [:]
    private var cache: [String: ModelFile] = [:]
    private final class Bucket { var pos: [Float] = []; var nrm: [Float] = [] }
    private var buckets: [RGBA: Bucket] = [:]
    private var order: [RGBA] = []
    private var tris = 0
    private var lo = [Double](repeating: .greatestFiniteMagnitude, count: 3)
    private var hi = [Double](repeating: -.greatestFiniteMagnitude, count: 3)

    private init(zip: ZipArchive) { self.zip = zip }

    static func load(_ url: URL) throws -> LoadedModel {
        guard let z = try? ZipArchive(url: url) else { throw ThreeMFError.unzipFailed }
        return try ThreeMFLoader(zip: z).run()
    }

    /// The slicer's own preview image, without parsing any geometry.
    static func embeddedThumbnail(_ url: URL) -> Data? {
        guard let z = try? ZipArchive(url: url) else { return nil }
        return ThreeMFLoader(zip: z).findThumbnail()
    }

    private func run() throws -> LoadedModel {
        loadSettings()
        guard let mainPath = findMainModel(), let main = model(at: mainPath) else {
            if let thumb = findThumbnail() {
                return LoadedModel(batches: [], size: (0, 0, 0), triangleCount: 0, thumbnail: thumb)
            }
            throw ThreeMFError.noModel
        }
        for item in main.items {
            let file = item.path.flatMap { model(at: $0) } ?? main
            let ext = objExtruder[item.objectID] ?? 1
            emit(file, item.objectID, item.xform, inherited: color(extruder: ext),
                 top: item.objectID, depth: 0)
        }
        return finish(thumbnail: tris == 0 ? findThumbnail() : nil)
    }

    // MARK: Files

    private func model(at path: String) -> ModelFile? {
        let key = path.hasPrefix("/") ? path : "/" + path
        if let m = cache[key] { return m }
        guard let d = zip.data(path), let m = ModelParser.parse(d, filaments: filaments) else { return nil }
        cache[key] = m
        return m
    }

    private func findMainModel() -> String? {
        if let d = zip.data("_rels/.rels"), let s = String(data: d, encoding: .utf8) {
            for chunk in s.components(separatedBy: "<Relationship").dropFirst() where chunk.contains("3dmodel") {
                for q in ["\"", "'"] {
                    if let r = chunk.range(of: "Target=" + q),
                       let e = chunk[r.upperBound...].firstIndex(of: Character(q)) {
                        let t = String(chunk[r.upperBound..<e])
                        if zip.contains(t) { return t }
                    }
                }
            }
        }
        if zip.contains("3D/3dmodel.model") { return "3D/3dmodel.model" }
        return zip.names.first { $0.lowercased().hasPrefix("3d/") && $0.lowercased().hasSuffix(".model") }
            ?? zip.names.first { $0.lowercased().hasSuffix(".model") }
    }

    private func findThumbnail() -> Data? {
        for p in ["Metadata/plate_1.png", "Auxiliaries/.thumbnails/thumbnail_3mf.png",
                  "Auxiliaries/.thumbnails/thumbnail_middle.png", "Metadata/thumbnail.png",
                  "Thumbnails/thumbnail.png", "Metadata/plate_1_small.png"] {
            if let d = zip.data(p) { return d }
        }
        if let f = zip.names.sorted().first(where: { $0.lowercased().hasSuffix(".png") }) {
            return zip.data(f)
        }
        return nil
    }

    private func loadSettings() {
        // Bambu Studio / OrcaSlicer: JSON
        if let d = zip.data("Metadata/project_settings.config"),
           let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any] {
            let list = (j["filament_colour"] as? [String]) ?? (j["extruder_colour"] as? [String]) ?? []
            filaments = list.map { RGBA(hex: $0) ?? .fallback }
        }
        // PrusaSlicer: "; extruder_colour = #FF8000;#DB5182"
        if filaments.isEmpty, let d = zip.data("Metadata/Slic3r_PE.config"),
           let s = String(data: d, encoding: .utf8) {
            var ext: [RGBA] = [], fil: [RGBA] = []
            for line in s.split(separator: "\n") {
                let parts = line.split(separator: "=", maxSplits: 1)
                guard parts.count == 2 else { continue }
                let key = parts[0].trimmingCharacters(in: CharacterSet(charactersIn: "; "))
                let vals = parts[1].split(separator: ";").compactMap { RGBA(hex: String($0)) }
                if key == "extruder_colour" { ext = vals }
                if key == "filament_colour" { fil = vals }
            }
            filaments = ext.count == fil.count && !ext.isEmpty ? ext : (fil.isEmpty ? ext : fil)
        }
        for name in ["Metadata/model_settings.config", "Metadata/Slic3r_PE_model.config"] {
            guard let data = zip.data(name) else { continue }
            let p = XMLParser(data: data)
            let d = SettingsParser()
            p.delegate = d
            _ = p.parse()
            objExtruder.merge(d.objExtruder) { a, _ in a }
            partExtruder.merge(d.partExtruder) { a, _ in a }
        }
    }

    private func color(extruder e: Int?) -> RGBA? {
        guard let e = e, e >= 1, e <= filaments.count else { return nil }
        return filaments[e - 1]
    }

    // MARK: Geometry

    private func emit(_ file: ModelFile, _ id: String, _ x: Xform, inherited: RGBA?, top: String, depth: Int) {
        guard depth < 16, let o = file.objects[id] else { return }
        let base = o.defaultColor ?? inherited
        let v = o.vertices
        let n = v.count / 3
        let triCount = min(o.tris.count / 3, o.triColor.count)
        for t in 0..<triCount {
            let a = Int(o.tris[t * 3]), b = Int(o.tris[t * 3 + 1]), c = Int(o.tris[t * 3 + 2])
            guard a >= 0, b >= 0, c >= 0, a < n, b < n, c < n else { continue }
            let ci = o.triColor[t]
            let col = ci >= 0 ? o.colors[Int(ci)] : (base ?? .fallback)
            add(col,
                x.apply(v[a * 3], v[a * 3 + 1], v[a * 3 + 2]),
                x.apply(v[b * 3], v[b * 3 + 1], v[b * 3 + 2]),
                x.apply(v[c * 3], v[c * 3 + 1], v[c * 3 + 2]))
        }
        for comp in o.components {
            let f = comp.path.flatMap { model(at: $0) } ?? file
            let partCol = depth == 0 ? color(extruder: partExtruder[top]?[comp.objectID]) : nil
            emit(f, comp.objectID, comp.xform.then(x), inherited: partCol ?? base, top: top, depth: depth + 1)
        }
    }

    private func add(_ col: RGBA, _ p0: (Double, Double, Double), _ p1: (Double, Double, Double),
                     _ p2: (Double, Double, Double)) {
        let ux = p1.0 - p0.0, uy = p1.1 - p0.1, uz = p1.2 - p0.2
        let vx = p2.0 - p0.0, vy = p2.1 - p0.1, vz = p2.2 - p0.2
        var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
        let len = (nx * nx + ny * ny + nz * nz).squareRoot()
        if len > 0 { nx /= len; ny /= len; nz /= len } else { nx = 0; ny = 0; nz = 1 }

        let bucket: Bucket
        if let existing = buckets[col] {
            bucket = existing
        } else {
            bucket = Bucket()
            buckets[col] = bucket
            order.append(col)
        }
        for p in [p0, p1, p2] {
            bucket.pos.append(Float(p.0)); bucket.pos.append(Float(p.1)); bucket.pos.append(Float(p.2))
            bucket.nrm.append(Float(nx)); bucket.nrm.append(Float(ny)); bucket.nrm.append(Float(nz))
            lo[0] = min(lo[0], p.0); lo[1] = min(lo[1], p.1); lo[2] = min(lo[2], p.2)
            hi[0] = max(hi[0], p.0); hi[1] = max(hi[1], p.1); hi[2] = max(hi[2], p.2)
        }
        tris += 1
    }

    /// Centres the model on X/Y and drops it onto Z = 0, like a slicer plate.
    private func finish(thumbnail: Data?) -> LoadedModel {
        guard tris > 0 else {
            return LoadedModel(batches: [], size: (0, 0, 0), triangleCount: 0, thumbnail: thumbnail)
        }
        let cx = Float((lo[0] + hi[0]) / 2), cy = Float((lo[1] + hi[1]) / 2), cz = Float(lo[2])
        var batches: [ColorBatch] = []
        for col in order {
            guard let b = buckets[col] else { continue }
            var pos = b.pos
            var i = 0
            while i < pos.count {
                pos[i] -= cx; pos[i + 1] -= cy; pos[i + 2] -= cz
                i += 3
            }
            batches.append(ColorBatch(color: col, positions: pos, normals: b.nrm))
        }
        return LoadedModel(batches: batches,
                           size: (Float(hi[0] - lo[0]), Float(hi[1] - lo[1]), Float(hi[2] - lo[2])),
                           triangleCount: tris, thumbnail: thumbnail)
    }
}
