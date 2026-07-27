import Foundation

/// Parses a MusicBuddy CSV export into Album objects.
/// Port of `app/lib/musicbuddy.ts`.
enum MusicBuddyImporter {

    static func parse(data: Data) throws -> [Album] {
        guard let csv = String(data: data, encoding: .utf8) else {
            throw ImportError.invalidEncoding
        }
        let rows = parseCSV(csv)
        guard let headerRow = rows.first else {
            throw ImportError.noHeader
        }
        let headers = headerRow.map { $0.trimmingCharacters(in: .whitespaces) }
        return rows.dropFirst().compactMap { row in
            albumFromRow(headers: headers, values: row)
        }
    }

    enum ImportError: LocalizedError {
        case invalidEncoding
        case noHeader

        var errorDescription: String? {
            switch self {
            case .invalidEncoding: return "CSV 文件编码无法识别"
            case .noHeader: return "CSV 文件缺少标题行"
            }
        }
    }

    // MARK: - CSV Parser

    private static func parseCSV(_ text: String) -> [[String]] {
        var rows: [[String]] = []
        var current: [String] = []
        var field = ""
        var inQuotes = false
        let chars = Array(text)
        var i = 0

        while i < chars.count {
            let c = chars[i]
            if inQuotes {
                if c == "\"" {
                    if i + 1 < chars.count && chars[i + 1] == "\"" {
                        field.append("\"")
                        i += 2
                    } else {
                        inQuotes = false
                        i += 1
                    }
                } else {
                    field.append(c)
                    i += 1
                }
            } else if c == "\"" {
                inQuotes = true
                i += 1
            } else if c == "," {
                current.append(field)
                field = ""
                i += 1
            } else if c == "\n" || c == "\r" {
                current.append(field)
                field = ""
                if !current.allSatisfy({ $0.isEmpty }) {
                    rows.append(current)
                }
                current = []
                if c == "\r" && i + 1 < chars.count && chars[i + 1] == "\n" {
                    i += 2
                } else {
                    i += 1
                }
            } else {
                field.append(c)
                i += 1
            }
        }
        current.append(field)
        if !current.allSatisfy({ $0.isEmpty }) {
            rows.append(current)
        }
        return rows
    }

    // MARK: - Row → Album

    private static func albumFromRow(headers: [String], values: [String]) -> Album? {
        func get(_ key: String) -> String? {
            guard let index = headers.firstIndex(of: key), index < values.count else { return nil }
            let v = values[index].trimmingCharacters(in: .whitespaces)
            return v.isEmpty ? nil : v
        }

        guard
            let title = get("Title"),
            let artist = get("Artist"),
            let coverUrl = get("Uploaded Image URL")
        else { return nil }

        let format: AlbumFormat = {
            let media = (get("Media") ?? "").lowercased()
            let fmt = (get("Format") ?? "").lowercased()
            if media.contains("vinyl") || media.contains("黑胶") || fmt == "lp" { return .vinyl }
            if media.contains("cd") || media.contains("sacd") { return .cd }
            return .unknown
        }()

        let year = get("Release Year").flatMap(Int.init)
            ?? get("Original Release Year").flatMap(Int.init)

        let dateAdded = parseDate(get("Date Added")) ?? ISO8601DateFormatter().string(from: Date())
        let key = stableHash(
            [get("discogs Release ID"), title, artist, format.rawValue, dateAdded]
                .compactMap { $0 }.joined(separator: "|").lowercased()
        )

        let tracklist: [String]? = {
            guard let raw = get("Tracks"),
                  let data = raw.data(using: .utf8),
                  let tracks = try? JSONDecoder().decode(
                      [[String: String]].self, from: data
                  )
            else { return nil }
            let titles = tracks.compactMap { $0["title"]?.trimmingCharacters(in: .whitespaces) }
                .filter { !$0.isEmpty }
            return titles.isEmpty ? nil : titles
        }()

        return Album(
            id: "musicbuddy-\(key)",
            discogsId: get("discogs Release ID").flatMap(Int.init),
            title: title,
            artist: artist,
            year: year,
            coverUrl: coverUrl,
            format: format,
            zone: "unsorted",
            dateAdded: dateAdded,
            purchaseDate: parseDate(get("Purchase Date")),
            purchasePrice: get("Purchase Price"),
            tracklist: tracklist
        )
    }

    private static func parseDate(_ value: String?) -> String? {
        guard let value, !value.trimmingCharacters(in: .whitespaces).isEmpty else { return nil }
        let trimmed = value.trimmingCharacters(in: .whitespaces)
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: trimmed) {
            return formatter.string(from: date)
        }
        // Try "yyyy/MM/dd HH:mm:ss" format
        let df = DateFormatter()
        df.dateFormat = "yyyy/MM/dd HH:mm:ss"
        if let date = df.date(from: trimmed) {
            return formatter.string(from: date)
        }
        df.dateFormat = "yyyy-MM-dd"
        if let date = df.date(from: trimmed) {
            return formatter.string(from: date)
        }
        return nil
    }

    private static func stableHash(_ value: String) -> String {
        var hash: UInt32 = 2166136261
        for scalar in value.unicodeScalars {
            hash ^= UInt32(scalar.value)
            hash = hash &* 16777619
        }
        return String(hash, radix: 36)
    }
}
