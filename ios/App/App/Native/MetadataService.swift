import Foundation

/// Client-side metadata engine that queries Apple iTunes and MusicBrainz.
/// Both are public APIs, so the native app does not need the web app's hosted
/// Discogs token.
actor MetadataService {
    static let shared = MetadataService()

    struct Suggestion {
        var title: String?
        var artist: String?
        var year: Int?
        var releaseDate: String?
        var label: String?
        var country: String?
        var catalogNumber: String?
        var barcode: String?
        var genres: [String]?
        var tracklist: [String]?
        var confidence: String
        var summary: String
    }

    private let session: URLSession = {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 8
        return URLSession(configuration: config)
    }()

    // MARK: - Public

    func suggest(
        title: String,
        artist: String,
        year: Int? = nil
    ) async -> Suggestion {
        async let appleResult = fetchApple(title: title, artist: artist, year: year)
        async let mbResult = fetchMusicBrainz(title: title, artist: artist)

        let (apple, mb) = await (appleResult, mbResult)
        return merge(
            apple: apple,
            mb: mb,
            requestedTitle: title,
            requestedArtist: artist
        )
    }

    // MARK: - Apple iTunes

    private struct AppleHit {
        var title: String
        var artist: String
        var year: Int?
        var releaseDate: String?
        var genre: String?
        var tracks: [String]?
    }

    private func fetchApple(
        title: String,
        artist: String,
        year: Int?
    ) async -> AppleHit? {
        var components = URLComponents(string: "https://itunes.apple.com/search")!
        components.queryItems = [
            URLQueryItem(name: "term", value: "\(artist) \(title)"),
            URLQueryItem(name: "country", value: "cn"),
            URLQueryItem(name: "media", value: "music"),
            URLQueryItem(name: "entity", value: "album"),
            URLQueryItem(name: "limit", value: "25"),
        ]
        guard let url = components.url else { return nil }

        struct Response: Decodable {
            struct Result: Decodable {
                var collectionId: Int?
                var collectionName: String?
                var artistName: String?
                var releaseDate: String?
                var primaryGenreName: String?
            }
            var results: [Result]?
        }

        guard let response: Response = await fetchJSON(url) else { return nil }
        let results = response.results ?? []

        let scored = results.compactMap { r -> (AppleHit, Double)? in
            guard let name = r.collectionName, let art = r.artistName else { return nil }
            let ry = r.releaseDate.flatMap { Int($0.prefix(4)) }
            let hit = AppleHit(
                title: name, artist: art, year: ry,
                releaseDate: r.releaseDate, genre: r.primaryGenreName
            )
            let s = similarity(name, title) * 70
                + similarity(art, artist) * 20
                + (ry != nil && ry == year ? 10 : 0)
            return (hit, s)
        }.sorted { $0.1 > $1.1 }

        guard var best = scored.first, best.1 >= 48 else { return nil }

        // Fetch tracks
        var lookup = URLComponents(string: "https://itunes.apple.com/lookup")!
        let collectionId = results.first(where: {
            $0.collectionName == best.0.title && $0.artistName == best.0.artist
        })?.collectionId
        if let id = collectionId {
            lookup.queryItems = [
                URLQueryItem(name: "id", value: String(id)),
                URLQueryItem(name: "entity", value: "song"),
                URLQueryItem(name: "country", value: "cn"),
            ]
            struct TrackResponse: Decodable {
                struct Item: Decodable {
                    var wrapperType: String?
                    var collectionId: Int?
                    var trackName: String?
                    var trackNumber: Int?
                }
                var results: [Item]?
            }
            if let trackURL = lookup.url,
               let tr: TrackResponse = await fetchJSON(trackURL) {
                best.0.tracks = (tr.results ?? [])
                    .filter { $0.wrapperType == "track" && $0.collectionId == id && $0.trackName != nil }
                    .sorted { ($0.trackNumber ?? 0) < ($1.trackNumber ?? 0) }
                    .compactMap(\.trackName)
            }
        }

        return best.0
    }

    // MARK: - MusicBrainz

    private struct MBHit {
        var title: String
        var artist: String
        var year: Int?
        var releaseDate: String?
        var country: String?
        var label: String?
        var catalogNumber: String?
        var barcode: String?
    }

    private func fetchMusicBrainz(title: String, artist: String) async -> MBHit? {
        var components = URLComponents(string: "https://musicbrainz.org/ws/2/release/")!
        components.queryItems = [
            URLQueryItem(name: "query", value: "\(title) \(artist)"),
            URLQueryItem(name: "fmt", value: "json"),
            URLQueryItem(name: "limit", value: "8"),
        ]
        guard let url = components.url else { return nil }

        struct Response: Decodable {
            struct Release: Decodable {
                var score: Int?
                var title: String?
                var date: String?
                var country: String?
                var barcode: String?
                struct Credit: Decodable { var name: String? }
                var artistCredit: [Credit]?
                struct LabelInfo: Decodable {
                    var catalogNumber: String?
                    struct Label: Decodable { var name: String? }
                    var label: Label?
                }
                var labelInfo: [LabelInfo]?

                enum CodingKeys: String, CodingKey {
                    case score, title, date, country, barcode
                    case artistCredit = "artist-credit"
                    case labelInfo = "label-info"
                }
            }
            var releases: [Release]?
        }

        guard let response: Response = await fetchJSON(url) else { return nil }
        let releases = response.releases ?? []

        let scored = releases.compactMap { r -> (MBHit, Double)? in
            let t = r.title ?? ""
            let a = r.artistCredit?.compactMap(\.name).joined(separator: ", ") ?? ""
            let apiScore = Double(r.score ?? 0)
            let localScore = similarity(t, title) * 25 + similarity(a, artist) * 10
            guard apiScore >= 75, similarity(t, title) >= 0.42 else { return nil }
            let hit = MBHit(
                title: t, artist: a,
                year: r.date.flatMap { Int($0.prefix(4)) },
                releaseDate: r.date,
                country: r.country,
                label: r.labelInfo?.first?.label?.name,
                catalogNumber: r.labelInfo?.first?.catalogNumber,
                barcode: r.barcode
            )
            return (hit, apiScore * 0.65 + localScore)
        }.sorted { $0.1 > $1.1 }

        return scored.first?.0
    }

    // MARK: - Merge

    private func merge(
        apple: AppleHit?,
        mb: MBHit?,
        requestedTitle: String,
        requestedArtist: String
    ) -> Suggestion {
        let matched = [apple != nil, mb != nil].filter { $0 }.count
        let confidence = matched >= 2 ? "medium" : matched == 1 ? "review" : "none"
        let summary: String
        switch matched {
        case 2: summary = "多个来源指向同一张专辑，建议确认版本字段"
        case 1: summary = "只找到一个可靠来源，请逐项确认后采用"
        default: summary = "没有找到可靠的外部匹配"
        }

        func preferredIdentity(_ original: String, _ candidate: String?) -> String? {
            guard let candidate else { return nil }
            // Traditional/simplified characters, punctuation, spacing and width
            // make the result a valid match, but not a useful title/artist edit.
            return similarity(original, candidate) == 1 ? original : candidate
        }

        return Suggestion(
            title: preferredIdentity(requestedTitle, apple?.title ?? mb?.title),
            artist: preferredIdentity(requestedArtist, apple?.artist ?? mb?.artist),
            year: mb?.year ?? apple?.year,
            releaseDate: (apple?.releaseDate ?? mb?.releaseDate).map { String($0.prefix(10)) },
            label: mb?.label,
            country: mb?.country,
            catalogNumber: mb?.catalogNumber,
            barcode: mb?.barcode?.replacingOccurrences(of: " ", with: ""),
            genres: apple?.genre.map { [$0] },
            tracklist: apple?.tracks,
            confidence: confidence,
            summary: summary
        )
    }

    // MARK: - Helpers

    private func fetchJSON<T: Decodable>(_ url: URL) async -> T? {
        do {
            var request = URLRequest(url: url)
            request.setValue(
                "VinylShop/1.0 (personal record library)",
                forHTTPHeaderField: "User-Agent"
            )
            request.setValue("application/json", forHTTPHeaderField: "Accept")
            let (data, response) = try await session.data(for: request)
            guard let http = response as? HTTPURLResponse, 200..<300 ~= http.statusCode
            else { return nil }
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            return nil
        }
    }

    private func similarity(_ a: String, _ b: String) -> Double {
        let la = normalizedForMatching(a)
        let lb = normalizedForMatching(b)
        if la.isEmpty || lb.isEmpty { return 0 }
        if la == lb { return 1 }
        if la.contains(lb) || lb.contains(la) {
            let ratio = Double(min(la.count, lb.count)) / Double(max(la.count, lb.count))
            return max(0.72, ratio)
        }

        // Character bigrams work for both CJK titles and space-separated Latin
        // titles. Token-only comparison treated every Chinese title as one
        // unrelated token, which rejected valid Apple/MusicBrainz results.
        let aPairs = bigrams(la)
        let bPairs = bigrams(lb)
        guard !aPairs.isEmpty, !bPairs.isEmpty else { return 0 }
        let shared = aPairs.intersection(bPairs).count
        return 2 * Double(shared) / Double(aPairs.count + bPairs.count)
    }

    private func normalizedForMatching(_ value: String) -> String {
        let simplified = value.applyingTransform(
            StringTransform("Traditional-Simplified"),
            reverse: false
        ) ?? value
        let folded = simplified
            .folding(
                options: [.diacriticInsensitive, .widthInsensitive],
                locale: Locale(identifier: "en_US_POSIX")
            )
            .lowercased()
        return String(folded.unicodeScalars.filter {
            CharacterSet.alphanumerics.contains($0)
        })
    }

    private func bigrams(_ value: String) -> Set<String> {
        let characters = Array(value)
        guard characters.count >= 2 else { return [] }
        return Set((0..<(characters.count - 1)).map {
            String(characters[$0...($0 + 1)])
        })
    }
}
