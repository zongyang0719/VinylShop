import Foundation
import SwiftUI
import UniformTypeIdentifiers

enum AlbumFormat: String, Codable, CaseIterable, Identifiable {
    case vinyl
    case cd
    case unknown

    var id: String { rawValue }

    var label: String {
        switch self {
        case .vinyl: "黑胶"
        case .cd: "CD"
        case .unknown: "未知"
        }
    }
}

struct Album: Codable, Identifiable, Hashable {
    var id: String
    var discogsId: Int?
    var title: String
    var artist: String
    var year: Int?
    var releaseDate: String?
    var coverUrl: String
    var format: AlbumFormat
    var zone: String
    var favorite: Bool?
    var dateAdded: String
    var purchaseDate: String?
    var purchasePrice: String?
    var doubanUrl: String?
    var tracklist: [String]?
    var label: String?
    var genres: [String]?
    var styles: [String]?
    var country: String?
    var catalogNumber: String?
    var producers: [String]?
    var edition: String?
    var barcode: String?
    var numberOfVolumes: Int?
    var vinylColor: String?
    var vinylStyle: String?
    var musicBuddySourceKey: String?
    var originalReleaseYear: Int?
    var labels: [String]?
    var trackDurations: [Int]?
    var composers: [String]?
    var orchestras: [String]?
    var conductors: [String]?
    var performers: [String]?
    var writers: [String]?
    var productionCompanies: [String]?
    var sourceMetadataJson: String?
    var notes: String?

    var isFavorite: Bool {
        get { favorite == true }
        set { favorite = newValue }
    }

    var cleanedArtist: String {
        artist.replacingOccurrences(
            of: #"\s*\(\d+\)$"#,
            with: "",
            options: .regularExpression
        )
    }
}

struct LibraryBackup: Codable {
    var albums: [Album]
    var exportedAt: Date
}

struct LibraryBackupDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.json] }

    var data: Data

    init(data: Data) {
        self.data = data
    }

    init(configuration: ReadConfiguration) throws {
        data = configuration.file.regularFileContents ?? Data()
    }

    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        FileWrapper(regularFileWithContents: data)
    }
}

enum LibraryTab: Hashable {
    case gallery
    case rack
    case favorites
}

enum GalleryDisplayMode: String, CaseIterable, Identifiable {
    case standard
    case covers

    var id: String { rawValue }
    var label: String { self == .standard ? "标准" : "仅封面" }
}

enum LibraryFormatFilter: String, CaseIterable, Identifiable {
    case all
    case vinyl
    case cd

    var id: String { rawValue }

    var label: String {
        switch self {
        case .all: "全部介质"
        case .vinyl: "黑胶"
        case .cd: "CD"
        }
    }
}

enum LibrarySortMode: String, CaseIterable, Identifiable {
    case added
    case artist
    case title
    case year

    var id: String { rawValue }

    var label: String {
        switch self {
        case .added: "最近添加"
        case .artist: "艺人"
        case .title: "专辑名"
        case .year: "年份"
        }
    }
}
