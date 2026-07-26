import CryptoKit
import SwiftUI
import UIKit

actor CoverImageStore {
    static let shared = CoverImageStore()

    private let memory = NSCache<NSString, UIImage>()
    private let diskDirectory: URL
    private let session: URLSession

    private init() {
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

    func image(for urlString: String) async -> UIImage? {
        let key = Self.key(for: urlString)
        if let cached = memory.object(forKey: key as NSString) {
            return cached
        }

        if
            let bundled = Bundle.main.url(
                forResource: key,
                withExtension: "cover",
                subdirectory: "Covers"
            ),
            let image = UIImage(contentsOfFile: bundled.path)
        {
            memory.setObject(image, forKey: key as NSString)
            return image
        }

        let local = diskDirectory
            .appendingPathComponent(key)
            .appendingPathExtension("cover")
        if let image = UIImage(contentsOfFile: local.path) {
            memory.setObject(image, forKey: key as NSString)
            return image
        }

        guard let url = Self.normalizedURL(urlString) else { return nil }
        var request = URLRequest(url: url)
        request.setValue(
            "VinylShop/1.0 (iPhone; iOS) AppleWebKit",
            forHTTPHeaderField: "User-Agent"
        )
        request.setValue("image/avif,image/webp,image/*,*/*;q=0.8", forHTTPHeaderField: "Accept")

        do {
            let (data, response) = try await session.data(for: request)
            guard
                let http = response as? HTTPURLResponse,
                200..<300 ~= http.statusCode,
                let image = UIImage(data: data)
            else { return nil }
            try? data.write(to: local, options: .atomic)
            memory.setObject(image, forKey: key as NSString)
            return image
        } catch {
            return nil
        }
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
        .task(id: url) {
            image = await CoverImageStore.shared.image(for: url)
            failed = image == nil
        }
    }
}
