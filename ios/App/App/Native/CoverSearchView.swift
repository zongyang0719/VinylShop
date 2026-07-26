import SwiftUI

/// A sheet that searches Apple iTunes for album artwork and lets the user pick one.
struct CoverSearchView: View {
    let initialQuery: String
    let onSelect: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var query: String
    @State private var results: [CoverResult] = []
    @State private var loading = false
    @State private var errorMessage: String?

    init(initialQuery: String, onSelect: @escaping (String) -> Void) {
        self.initialQuery = initialQuery
        self.onSelect = onSelect
        _query = State(initialValue: initialQuery)
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                HStack {
                    TextField("艺人 + 专辑名", text: $query)
                        .textFieldStyle(.roundedBorder)
                        .autocorrectionDisabled()
                        .submitLabel(.search)
                        .onSubmit { Task { await search() } }
                    Button {
                        Task { await search() }
                    } label: {
                        Image(systemName: "magnifyingglass")
                    }
                    .disabled(loading || query.trimmingCharacters(in: .whitespaces).isEmpty)
                }
                .padding()

                if loading {
                    Spacer()
                    ProgressView("搜索中…")
                    Spacer()
                } else if results.isEmpty {
                    Spacer()
                    ContentUnavailableView {
                        Label(
                            errorMessage == nil ? "搜索专辑封面" : "暂时无法搜索",
                            systemImage: errorMessage == nil
                                ? "photo.on.rectangle.angled"
                                : "wifi.exclamationmark"
                        )
                    } description: {
                        Text(
                            errorMessage
                                ?? "输入艺人和专辑名，从 Apple Music 查找封面。"
                        )
                    }
                    Spacer()
                } else {
                    ScrollView {
                        LazyVGrid(
                            columns: [GridItem(.adaptive(minimum: 100, maximum: 140), spacing: 12)],
                            spacing: 12
                        ) {
                            ForEach(results) { result in
                                Button {
                                    onSelect(result.coverUrl)
                                    dismiss()
                                } label: {
                                    VStack(spacing: 6) {
                                        AsyncImage(url: URL(string: result.coverUrl)) { phase in
                                            switch phase {
                                            case .success(let image):
                                                image.resizable().scaledToFill()
                                            default:
                                                Color.secondary.opacity(0.2)
                                                    .overlay {
                                                        ProgressView().controlSize(.small)
                                                    }
                                            }
                                        }
                                        .aspectRatio(1, contentMode: .fit)
                                        .clipShape(.rect(cornerRadius: 8))

                                        Text(result.title)
                                            .font(.caption2)
                                            .lineLimit(1)
                                        Text(result.artist)
                                            .font(.caption2)
                                            .foregroundStyle(.secondary)
                                            .lineLimit(1)
                                    }
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding()
                    }
                }
            }
            .navigationTitle("查找封面")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .task { await search() }
    }

    private func search() async {
        let term = query.trimmingCharacters(in: .whitespaces)
        guard !term.isEmpty else { return }
        loading = true
        errorMessage = nil
        defer { loading = false }

        var components = URLComponents(string: "https://itunes.apple.com/search")!
        components.queryItems = [
            URLQueryItem(name: "term", value: term),
            URLQueryItem(name: "country", value: "cn"),
            URLQueryItem(name: "media", value: "music"),
            URLQueryItem(name: "entity", value: "album"),
            URLQueryItem(name: "limit", value: "30"),
        ]
        guard let url = components.url else { return }

        struct Response: Decodable {
            struct Item: Decodable {
                var collectionId: Int?
                var collectionName: String?
                var artistName: String?
                var artworkUrl100: String?
            }
            var results: [Item]?
        }

        do {
            let (data, httpResponse) = try await URLSession.shared.data(from: url)
            guard
                let http = httpResponse as? HTTPURLResponse,
                200..<300 ~= http.statusCode
            else {
                throw URLError(.badServerResponse)
            }
            let decoded = try JSONDecoder().decode(Response.self, from: data)
            results = (decoded.results ?? []).compactMap { item in
                guard
                    let name = item.collectionName,
                    let artist = item.artistName,
                    let art100 = item.artworkUrl100
                else { return nil }
                let hiRes = art100.replacingOccurrences(of: "100x100bb", with: "600x600bb")
                return CoverResult(
                    id: item.collectionId ?? Int.random(in: 0...999999),
                    title: name,
                    artist: artist,
                    coverUrl: hiRes
                )
            }
        } catch {
            results = []
            errorMessage = "请检查网络后重试。"
        }
    }
}

private struct CoverResult: Identifiable {
    let id: Int
    let title: String
    let artist: String
    let coverUrl: String
}
