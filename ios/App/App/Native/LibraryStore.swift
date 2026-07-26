import Combine
import Foundation

@MainActor
final class LibraryStore: ObservableObject {
    @Published private(set) var albums: [Album] = []
    @Published var displayMode: GalleryDisplayMode {
        didSet { defaults.set(displayMode.rawValue, forKey: Keys.displayMode) }
    }
    @Published var formatFilter: LibraryFormatFilter {
        didSet { defaults.set(formatFilter.rawValue, forKey: Keys.formatFilter) }
    }
    @Published var sortMode: LibrarySortMode {
        didSet { defaults.set(sortMode.rawValue, forKey: Keys.sortMode) }
    }
    @Published var hapticsEnabled: Bool {
        didSet { defaults.set(hapticsEnabled, forKey: Keys.haptics) }
    }
    @Published var scrollSoundEnabled: Bool {
        didSet { defaults.set(scrollSoundEnabled, forKey: Keys.scrollSound) }
    }
    @Published var notice: String?

    private enum Keys {
        static let displayMode = "native.displayMode"
        static let formatFilter = "native.formatFilter"
        static let sortMode = "native.sortMode"
        static let haptics = "native.haptics"
        static let scrollSound = "native.scrollSound"
    }

    private let defaults = UserDefaults.standard
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder
    private let libraryURL: URL

    init() {
        let defaults = UserDefaults.standard
        displayMode = GalleryDisplayMode(
            rawValue: defaults.string(forKey: Keys.displayMode) ?? ""
        ) ?? .standard
        formatFilter = LibraryFormatFilter(
            rawValue: defaults.string(forKey: Keys.formatFilter) ?? ""
        ) ?? .all
        sortMode = LibrarySortMode(
            rawValue: defaults.string(forKey: Keys.sortMode) ?? ""
        ) ?? .added
        hapticsEnabled = defaults.object(forKey: Keys.haptics) as? Bool ?? true
        scrollSoundEnabled =
            defaults.object(forKey: Keys.scrollSound) as? Bool ?? false

        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
        self.encoder = encoder

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        self.decoder = decoder

        let support = FileManager.default.urls(
            for: .applicationSupportDirectory,
            in: .userDomainMask
        )[0]
        let appDirectory = support.appendingPathComponent(
            "VinylShop",
            isDirectory: true
        )
        try? FileManager.default.createDirectory(
            at: appDirectory,
            withIntermediateDirectories: true
        )
        libraryURL = appDirectory.appendingPathComponent("library.json")
        load()
    }

    var favoriteCount: Int {
        albums.lazy.filter(\.isFavorite).count
    }

    func visibleAlbums(favoritesOnly: Bool = false) -> [Album] {
        var unique: [Album] = []
        var seen = Set<String>()

        for album in albums {
            guard seen.insert(Self.groupKey(album)).inserted else { continue }
            guard !favoritesOnly || album.isFavorite else { continue }
            guard formatFilter == .all || album.format.rawValue == formatFilter.rawValue
            else { continue }
            unique.append(album)
        }

        return unique.sorted { left, right in
            switch sortMode {
            case .added:
                left.dateAdded > right.dateAdded
            case .artist:
                left.cleanedArtist.localizedStandardCompare(right.cleanedArtist)
                    == .orderedAscending
            case .title:
                left.title.localizedStandardCompare(right.title) == .orderedAscending
            case .year:
                (left.year ?? -1) > (right.year ?? -1)
            }
        }
    }

    func search(_ query: String, in albums: [Album]) -> [Album] {
        let term = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !term.isEmpty else { return albums }
        return albums.filter {
            $0.title.localizedCaseInsensitiveContains(term)
                || $0.cleanedArtist.localizedCaseInsensitiveContains(term)
                || ($0.label?.localizedCaseInsensitiveContains(term) == true)
                || ($0.catalogNumber?.localizedCaseInsensitiveContains(term) == true)
        }
    }

    /// Different editions of one album share an artist and a title. Mirrors
    /// `groupKey` in page.tsx, trimming included.
    static func groupKey(_ album: Album) -> String {
        let artist = album.artist.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let title = album.title.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return "\(artist)|||\(title)"
    }

    /// Every edition of the given album, newest addition first, matching the
    /// order `getVersions` produces on the web.
    func versions(of album: Album) -> [Album] {
        let key = Self.groupKey(album)
        let group = albums.filter { Self.groupKey($0) == key }
        return group.isEmpty ? [album] : group.sorted { $0.dateAdded > $1.dateAdded }
    }

    /// Edition count per album id, for the gallery's "N 个版本" badge.
    func versionCounts() -> [String: Int] {
        var grouped: [String: [String]] = [:]
        for album in albums {
            grouped[Self.groupKey(album), default: []].append(album.id)
        }
        var counts: [String: Int] = [:]
        for ids in grouped.values where ids.count > 1 {
            for id in ids {
                counts[id] = ids.count
            }
        }
        return counts
    }

    /// Writes an edited record back. Only fields the edit form owns change; the
    /// record keeps its id, so its place in every version group is preserved.
    func update(_ album: Album) {
        guard let index = albums.firstIndex(where: { $0.id == album.id }) else { return }
        albums[index] = album
        persist()
    }

    func album(id: String?) -> Album? {
        guard let id else { return nil }
        return albums.first { $0.id == id }
    }

    func add(
        title: String,
        artist: String,
        coverURL: String,
        format: AlbumFormat,
        year: Int?
    ) {
        let album = Album(
            id: "native-\(UUID().uuidString.lowercased())",
            title: title.trimmingCharacters(in: .whitespacesAndNewlines),
            artist: artist.trimmingCharacters(in: .whitespacesAndNewlines),
            year: year,
            coverUrl: coverURL.trimmingCharacters(in: .whitespacesAndNewlines),
            format: format,
            zone: "unsorted",
            favorite: false,
            dateAdded: ISO8601DateFormatter().string(from: Date())
        )
        albums.insert(album, at: 0)
        persist()
    }

    func toggleFavorite(id: String) {
        guard let index = albums.firstIndex(where: { $0.id == id }) else { return }
        if !albums[index].isFavorite, favoriteCount >= 10 {
            notice = "喜欢已经满 10 张，请先移除一张"
            return
        }
        albums[index].isFavorite.toggle()
        notice = albums[index].isFavorite ? "已加入喜欢" : "已从喜欢中移除"
        persist()
    }

    func delete(id: String) {
        albums.removeAll { $0.id == id }
        persist()
    }

    func exportData() throws -> Data {
        try encoder.encode(LibraryBackup(albums: albums, exportedAt: Date()))
    }

    @discardableResult
    func importData(_ data: Data) throws -> (added: Int, updated: Int) {
        let incoming: [Album]
        if let backup = try? decoder.decode(LibraryBackup.self, from: data) {
            incoming = backup.albums
        } else {
            incoming = try decoder.decode([Album].self, from: data)
        }

        var byID = Dictionary(uniqueKeysWithValues: albums.map { ($0.id, $0) })
        var added = 0
        var updated = 0
        for album in incoming {
            if byID[album.id] == nil {
                added += 1
            } else {
                updated += 1
            }
            byID[album.id] = album
        }
        albums = Array(byID.values)
        persist()
        return (added, updated)
    }

    private func load() {
        if
            let data = try? Data(contentsOf: libraryURL),
            let stored = try? decoder.decode([Album].self, from: data)
        {
            albums = stored
            return
        }

        guard
            let seedURL = Bundle.main.url(
                forResource: "initial-library",
                withExtension: "json"
            ),
            let data = try? Data(contentsOf: seedURL),
            let seed = try? decoder.decode([Album].self, from: data)
        else {
            notice = "无法读取内置唱片数据"
            return
        }
        albums = seed
        persist()
    }

    private func persist() {
        do {
            try encoder.encode(albums).write(to: libraryURL, options: .atomic)
        } catch {
            notice = "本地数据保存失败：\(error.localizedDescription)"
        }
    }
}
