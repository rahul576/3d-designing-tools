// ZipArchive.swift — minimal read-only ZIP reader (stored + deflate, ZIP64 aware).
// Used instead of /usr/bin/unzip so it also works inside sandboxed Quick Look extensions.

import Foundation
import Compression

enum ZipError: Error { case notZip }

final class ZipArchive {
    struct Entry {
        let name: String
        let method: Int
        let compSize: Int
        let size: Int
        let localOffset: Int
    }

    private let bytes: [UInt8]
    private var entries: [String: Entry] = [:]   // keyed by lowercased name
    private(set) var names: [String] = []

    init(url: URL) throws {
        let data = try Data(contentsOf: url, options: .mappedIfSafe)
        bytes = [UInt8](data)
        try readDirectory()
    }

    // MARK: Little-endian readers

    @inline(__always) private func has(_ o: Int, _ n: Int) -> Bool { o >= 0 && n >= 0 && o + n <= bytes.count }
    @inline(__always) private func u16(_ o: Int) -> Int { Int(bytes[o]) | Int(bytes[o + 1]) << 8 }
    @inline(__always) private func u32(_ o: Int) -> Int { u16(o) | u16(o + 2) << 16 }
    @inline(__always) private func u64(_ o: Int) -> Int { u32(o) | u32(o + 4) << 32 }

    private func readDirectory() throws {
        let n = bytes.count
        guard n >= 22 else { throw ZipError.notZip }
        var eocd = -1
        var i = n - 22
        let stop = max(0, n - 22 - 65_535)
        while i >= stop {
            if bytes[i] == 0x50, bytes[i + 1] == 0x4b, bytes[i + 2] == 0x05, bytes[i + 3] == 0x06 { eocd = i; break }
            i -= 1
        }
        guard eocd >= 0 else { throw ZipError.notZip }

        var count = u16(eocd + 10)
        var cdOffset = u32(eocd + 16)
        if cdOffset == 0xFFFF_FFFF || count == 0xFFFF, eocd >= 20, u32(eocd - 20) == 0x0706_4b50 {
            let z = u64(eocd - 20 + 8)
            if has(z, 56), u32(z) == 0x0606_4b50 {
                count = u64(z + 32)
                cdOffset = u64(z + 48)
            }
        }

        var p = cdOffset
        var k = 0
        while k < count, has(p, 46), u32(p) == 0x0201_4b50 {
            let method = u16(p + 10)
            var comp = u32(p + 20)
            var size = u32(p + 24)
            let nl = u16(p + 28), el = u16(p + 30), cl = u16(p + 32)
            var off = u32(p + 42)
            guard has(p + 46, nl + el + cl) else { break }
            let name = String(decoding: bytes[(p + 46)..<(p + 46 + nl)], as: UTF8.self)

            var e = p + 46 + nl
            let eEnd = e + el
            while e + 4 <= eEnd {
                let id = u16(e), sz = u16(e + 2)
                if id == 0x0001 {
                    var q = e + 4
                    let lim = e + 4 + sz
                    if size == 0xFFFF_FFFF, q + 8 <= lim { size = u64(q); q += 8 }
                    if comp == 0xFFFF_FFFF, q + 8 <= lim { comp = u64(q); q += 8 }
                    if off == 0xFFFF_FFFF, q + 8 <= lim { off = u64(q); q += 8 }
                }
                e += 4 + sz
            }

            if !name.hasSuffix("/") {
                entries[name.lowercased()] = Entry(name: name, method: method, compSize: comp, size: size, localOffset: off)
                names.append(name)
            }
            p = eEnd + cl
            k += 1
        }
        guard !entries.isEmpty else { throw ZipError.notZip }
    }

    // MARK: Access

    private func key(_ path: String) -> String {
        var s = path
        while s.hasPrefix("/") { s.removeFirst() }
        return (s.removingPercentEncoding ?? s).lowercased()
    }

    func contains(_ path: String) -> Bool { entries[key(path)] != nil }

    func data(_ path: String) -> Data? {
        guard let e = entries[key(path)] else { return nil }
        let lo = e.localOffset
        guard has(lo, 30), u32(lo) == 0x0403_4b50 else { return nil }
        let start = lo + 30 + u16(lo + 26) + u16(lo + 28)
        guard has(start, e.compSize) else { return nil }
        if e.method == 0 { return Data(bytes[start..<(start + e.compSize)]) }
        guard e.method == 8 else { return nil }
        if e.size == 0 { return Data() }
        var out = Data(count: e.size)
        let written = out.withUnsafeMutableBytes { (dst: UnsafeMutableRawBufferPointer) -> Int in
            bytes.withUnsafeBufferPointer { src -> Int in
                guard let d = dst.bindMemory(to: UInt8.self).baseAddress, let s = src.baseAddress else { return 0 }
                return compression_decode_buffer(d, e.size, s + start, e.compSize, nil, COMPRESSION_ZLIB)
            }
        }
        return written == e.size ? out : nil
    }
}
