import CryptoKit
import ImageIO
import SwiftUI
import UIKit
import UniformTypeIdentifiers

/// Cover artwork cache: memory → app bundle → on-disk cache → network.
///
/// Images are decoded through ImageIO at the size they will actually be drawn.
/// Handing `UIImage(contentsOfFile:)` a 600×600 cover defers the real decode to
/// the first time it is drawn — on the main thread — which is what makes a rack
/// scroll stutter. `CGImageSourceCreateThumbnailAtIndex` does that work up front,
/// off the main actor, and at a fraction of the memory.
actor CoverImageStore {
    static let shared = CoverImageStore()

    /// Decode targets in points. Requests snap up to the nearest bucket so the
    /// rack and the gallery share entries instead of decoding a cover twice.
    enum Target: CGFloat, CaseIterable {
        /// Rack sleeves and small grid cells.
        case sleeve = 128
        /// Gallery cards.
        case card = 240
        /// Detail hero artwork.
        case hero = 640

        static func enclosing(_ points: CGFloat) -> Target {
            allCases.first { points <= $0.rawValue } ?? .hero
        }
    }

    private let memory = NSCache<NSString, UIImage>()
    private let diskDirectory: URL
    private let session: URLSession
    private let scale: CGFloat

    private init() {
        // Bounded by decoded byte cost rather than entry count, so a screenful
        // of large covers cannot balloon past this.
        memory.totalCostLimit = 96 * 1_024 * 1_024
        scale = UITraitCollection.current.displayScale > 0
            ? UITraitCollection.current.displayScale
            : 3

        let support = FileManager.default.urls(
            for: .applicationSupportDirectory,
            in: .userDomainMask
        )[0]
        diskDirectory = support
            .appendingPathComponent("VinylShop", isDirectory: true)
            .appendingPathComponent("Covers", isDirectory: true)
        try? FileManager.default.createDirectory(
            at: diskDirectory,
            withIntermediateDirectories: true
        )

        let configuration = URLSessionConfiguration.default
        configuration.urlCache = URLCache(
            memoryCapacity: 32 * 1_024 * 1_024,
            diskCapacity: 256 * 1_024 * 1_024
        )
        configuration.requestCachePolicy = .returnCacheDataElseLoad
        configuration.timeoutIntervalForRequest = 25
        session = URLSession(configuration: configuration)
    }

    func image(for urlString: String, target: Target = .card) async -> UIImage? {
        let key = Self.key(for: urlString)
        let cacheKey = "\(key)@\(Int(target.rawValue))" as NSString

        if let cached = memory.object(forKey: cacheKey) {
            return cached
        }

        let pixels = target.rawValue * scale

        // Bundled artwork shipped by scripts/cache-ios-covers.mjs. The SHA256
        // naming here must stay identical to that script, or none of the 137
        // pre-packaged covers will ever be found.
        if
            let bundled = Bundle.main.url(
                forResource: key,
                withExtension: "cover",
                subdirectory: "Covers"
            ),
            let image = Self.decode(url: bundled, maxPixel: pixels)
        {
            store(image, for: cacheKey)
            return image
        }

        let local = diskDirectory
            .appendingPathComponent(key)
            .appendingPathExtension("cover")
        if let image = Self.decode(url: local, maxPixel: pixels) {
            store(image, for: cacheKey)
            return image
        }

        guard let url = Self.normalizedURL(urlString) else { return nil }
        var request = URLRequest(url: url)
        request.setValue(
            "VinylShop/1.0 (iPhone; iOS) AppleWebKit",
            forHTTPHeaderField: "User-Agent"
        )
        request.setValue(
            "image/avif,image/webp,image/*,*/*;q=0.8",
            forHTTPHeaderField: "Accept"
        )

        do {
            let (data, response) = try await session.data(for: request)
            guard
                let http = response as? HTTPURLResponse,
                200..<300 ~= http.statusCode
            else { return nil }
            // Persist the original bytes so a later request at a different size
            // can re-decode without another round trip.
            try? data.write(to: local, options: .atomic)
            guard let image = Self.decode(data: data, maxPixel: pixels) else { return nil }
            store(image, for: cacheKey)
            return image
        } catch {
            return nil
        }
    }

    /// Average colour of a cover, used for the record's spine and side edges.
    /// Mirrors `sampleCover` in CrateCylinder.tsx: a 16×16 downsample, pixels
    /// with alpha below 16 skipped, each channel clamped to 30…224.
    func edgeColor(for urlString: String) async -> UIColor? {
        guard let image = await image(for: urlString, target: .sleeve) else { return nil }
        return Self.averageColor(of: image)
    }

    private func store(_ image: UIImage, for key: NSString) {
        let cost = Int(image.size.width * image.size.height * image.scale * image.scale * 4)
        memory.setObject(image, forKey: key, cost: cost)
    }

    // MARK: - Decoding

    private static func decode(url: URL, maxPixel: CGFloat) -> UIImage? {
        guard let source = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
        return decode(source: source, maxPixel: maxPixel)
    }

    private static func decode(data: Data, maxPixel: CGFloat) -> UIImage? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
        return decode(source: source, maxPixel: maxPixel)
    }

    private static func decode(source: CGImageSource, maxPixel: CGFloat) -> UIImage? {
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixel,
        ]
        guard
            let thumbnail = CGImageSourceCreateThumbnailAtIndex(
                source,
                0,
                options as CFDictionary
            )
        else { return nil }
        return UIImage(cgImage: thumbnail)
    }

    private static func averageColor(of image: UIImage) -> UIColor? {
        guard let cgImage = image.cgImage else { return nil }

        let side = 16
        var pixels = [UInt8](repeating: 0, count: side * side * 4)
        guard
            let context = CGContext(
                data: &pixels,
                width: side,
                height: side,
                bitsPerComponent: 8,
                bytesPerRow: side * 4,
                space: CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
            )
        else { return nil }

        context.draw(cgImage, in: CGRect(x: 0, y: 0, width: side, height: side))

        var red = 0
        var green = 0
        var blue = 0
        var counted = 0
        for index in stride(from: 0, to: pixels.count, by: 4) {
            guard pixels[index + 3] >= 16 else { continue }
            red += Int(pixels[index])
            green += Int(pixels[index + 1])
            blue += Int(pixels[index + 2])
            counted += 1
        }
        guard counted > 0 else { return nil }

        func channel(_ total: Int) -> CGFloat {
            CGFloat(min(max(total / counted, 30), 224)) / 255
        }

        return UIColor(
            red: channel(red),
            green: channel(green),
            blue: channel(blue),
            alpha: 1
        )
    }

    nonisolated static func key(for urlString: String) -> String {
        SHA256.hash(data: Data(urlString.utf8))
            .map { String(format: "%02x", $0) }
            .joined()
    }

    nonisolated private static func normalizedURL(_ string: String) -> URL? {
        guard var components = URLComponents(string: string) else { return nil }
        if components.scheme == "http" {
            components.scheme = "https"
        }
        return components.url
    }
}

struct NativeCoverImage: View {
    let url: String
    var cornerRadius: CGFloat = 12
    var target: CoverImageStore.Target = .card

    @State private var image: UIImage?
    @State private var failed = false

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                .fill(.quaternary)

            if let image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
                    .transition(.opacity)
            } else if failed {
                Image(systemName: "opticaldisc")
                    .font(.system(size: 28, weight: .light))
                    .foregroundStyle(.tertiary)
            } else {
                ProgressView()
                    .controlSize(.small)
            }
        }
        .clipShape(.rect(cornerRadius: cornerRadius))
        .contentShape(.rect(cornerRadius: cornerRadius))
        .task(id: "\(url)@\(target.rawValue)") {
            image = await CoverImageStore.shared.image(for: url, target: target)
            failed = image == nil
        }
    }
}
