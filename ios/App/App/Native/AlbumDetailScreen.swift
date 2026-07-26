import SwiftUI

/// Edition label for the version tabs, mirroring `versionLabel` in InspectModal.tsx.
func albumVersionLabel(_ album: Album) -> String {
    let format: String
    switch album.format {
    case .vinyl: format = "黑胶"
    case .cd: format = "CD"
    case .unknown: format = "其他"
    }
    let styles: [String: String] = [
        "standard": "",
        "transparent": "透明",
        "picture": "画胶",
        "splatter": "泼溅",
    ]
    let style = album.vinylStyle.flatMap { styles[$0] } ?? ""
    return style.isEmpty ? format : "\(format) · \(style)"
}

struct AlbumDetailScreen: View {
    @ObservedObject var store: LibraryStore
    let albumID: String

    @Environment(\.dismiss) private var dismiss
    @State private var selectedVersionID: String?
    @State private var confirmingDelete = false
    @State private var editing = false

    /// Every edition of the album the sheet was opened for.
    private var versions: [Album] {
        guard let anchor = store.album(id: albumID) else { return [] }
        return store.versions(of: anchor)
    }

    private var album: Album? {
        if let selectedVersionID, let picked = store.album(id: selectedVersionID) {
            return picked
        }
        return store.album(id: albumID)
    }

    var body: some View {
        NavigationStack {
            Group {
                if let album {
                    content(for: album)
                } else {
                    ContentUnavailableView(
                        "这张唱片已被删除",
                        systemImage: "opticaldisc"
                    )
                }
            }
            .background(Color(uiColor: .systemGroupedBackground))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { toolbar }
            .confirmationDialog(
                versions.count > 1 ? "确定删除此版本？" : "确定删除这张唱片？",
                isPresented: $confirmingDelete,
                titleVisibility: .visible
            ) {
                Button("删除", role: .destructive) {
                    guard let album else { return }
                    let remaining = versions.filter { $0.id != album.id }
                    store.delete(id: album.id)
                    // Deleting one edition keeps the sheet open on a sibling; the
                    // last one closes it.
                    if let next = remaining.first {
                        selectedVersionID = next.id
                    } else {
                        dismiss()
                    }
                }
            } message: {
                Text("此操作不可撤销。")
            }
            .sheet(isPresented: $editing) {
                if let album {
                    AlbumEditScreen(store: store, album: album)
                }
            }
        }
        .presentationDragIndicator(.visible)
    }

    @ToolbarContentBuilder
    private var toolbar: some ToolbarContent {
        ToolbarItem(placement: .topBarLeading) {
            Button("完成") { dismiss() }
        }
        ToolbarItemGroup(placement: .topBarTrailing) {
            if let album {
                Button {
                    store.toggleFavorite(id: album.id)
                } label: {
                    Image(systemName: album.isFavorite ? "heart.fill" : "heart")
                }
                .tint(album.isFavorite ? .pink : nil)

                Button {
                    editing = true
                } label: {
                    Image(systemName: "square.and.pencil")
                }

                Button(role: .destructive) {
                    confirmingDelete = true
                } label: {
                    Image(systemName: "trash")
                }
            }
        }
    }

    private func content(for album: Album) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                NativeCoverImage(url: album.coverUrl, cornerRadius: 18, target: .hero)
                    .aspectRatio(1, contentMode: .fit)
                    .shadow(color: .black.opacity(0.24), radius: 24, y: 14)

                VStack(alignment: .leading, spacing: 6) {
                    Text(album.title)
                        .font(.largeTitle.bold())
                    Text(album.cleanedArtist)
                        .font(.title3)
                        .foregroundStyle(.secondary)
                }

                if versions.count > 1 {
                    versionTabs(for: album)
                }

                HStack(spacing: 10) {
                    if let year = album.year {
                        DetailPill(String(year))
                    }
                    DetailPill(album.format.label)
                    if let country = album.country, !country.isEmpty {
                        DetailPill(country)
                    }
                }

                DetailMetadata(album: album, versionCount: versions.count)

                if let douban = album.doubanUrl,
                   !douban.isEmpty,
                   let url = URL(string: douban) {
                    Link(destination: url) {
                        Label("在豆瓣查看条目", systemImage: "arrow.up.right.square")
                    }
                    .font(.subheadline.weight(.medium))
                }

                if let tracks = album.tracklist, !tracks.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("曲目")
                            .font(.title2.bold())
                        ForEach(Array(tracks.enumerated()), id: \.offset) { _, track in
                            Text(track)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.vertical, 4)
                        }
                    }
                }
            }
            .padding(20)
        }
    }

    /// Mirrors `.version-tabs`: one tab per edition, with a dot tinted by medium.
    private func versionTabs(for album: Album) -> some View {
        ScrollView(.horizontal) {
            HStack(spacing: 8) {
                ForEach(versions) { version in
                    let isActive = version.id == album.id
                    Button {
                        selectedVersionID = version.id
                    } label: {
                        HStack(spacing: 6) {
                            Circle()
                                .fill(version.format == .vinyl ? .primary : .secondary)
                                .frame(width: 7, height: 7)
                            Text(albumVersionLabel(version))
                            if let year = version.year {
                                Text(String(year))
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .font(.footnote.weight(isActive ? .semibold : .regular))
                        .padding(.horizontal, 12)
                        .frame(height: 34)
                        .glassEffect(
                            isActive ? .regular.interactive() : .clear,
                            in: .capsule
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.vertical, 2)
        }
        .scrollIndicators(.hidden)
    }
}

struct DetailPill: View {
    let text: String

    init(_ text: String) {
        self.text = text
    }

    var body: some View {
        Text(text)
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 12)
            .frame(height: 32)
            .glassEffect(.regular, in: .capsule)
    }
}

/// The read-only spec table. Rows and their order match the `<dt>` list in
/// InspectModal.tsx, with 发行日期 added because the edit form owns it.
struct DetailMetadata: View {
    let album: Album
    var versionCount: Int = 1

    private var rows: [(String, String)] {
        var result: [(String, String)] = []
        func add(_ title: String, _ value: String?) {
            guard let value, !value.isEmpty else { return }
            result.append((title, value))
        }
        func addList(_ title: String, _ values: [String]?) {
            guard let values, !values.isEmpty else { return }
            result.append((title, values.joined(separator: " · ")))
        }

        add("厂牌", album.label)
        result.append(("介质", album.format.label))
        add("发行日期", album.releaseDate)
        addList("流派", album.genres)
        addList("风格", album.styles)
        add("发行国家", album.country)
        add("编目号", album.catalogNumber)
        add("版本", album.edition)
        addList("制作人", album.producers)
        if let volumes = album.numberOfVolumes, volumes > 1 {
            add("碟数", "\(volumes)")
        }
        add("条形码", album.barcode)
        add("购买日期", album.purchaseDate)
        add("购买价格", album.purchasePrice)
        result.append(("收藏状态", album.isFavorite ? "已加入喜欢" : "未加入"))
        if versionCount > 1 {
            result.append(("版本数", "\(versionCount) 个版本"))
        }
        return result
    }

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(rows.enumerated()), id: \.offset) { index, row in
                if index > 0 {
                    Divider().padding(.leading, 80)
                }
                HStack(alignment: .top, spacing: 16) {
                    Text(row.0)
                        .foregroundStyle(.secondary)
                        .frame(width: 64, alignment: .leading)
                    Text(row.1)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .textSelection(.enabled)
                }
                .font(.subheadline)
                .padding(.vertical, 13)
            }
        }
        .padding(.horizontal, 16)
        .background(.background.secondary, in: .rect(cornerRadius: 18))
    }
}

// MARK: - Editing

/// Full edit form. Field set and ordering follow the edit panel in
/// InspectModal.tsx. Comma-separated inputs map to the array fields, and the
/// tracklist is one track per line, exactly as on the web.
struct AlbumEditScreen: View {
    @ObservedObject var store: LibraryStore
    let album: Album

    @Environment(\.dismiss) private var dismiss

    @State private var draft: Draft
    @State private var showingCoverPreview = true

    init(store: LibraryStore, album: Album) {
        self.store = store
        self.album = album
        _draft = State(initialValue: Draft(album))
    }

    private struct Draft {
        var coverUrl: String
        var title: String
        var artist: String
        var releaseDate: String
        var purchaseDate: String
        var purchasePrice: String
        var label: String
        var genres: String
        var styles: String
        var country: String
        var catalogNumber: String
        var producers: String
        var edition: String
        var barcode: String
        var doubanUrl: String
        var format: AlbumFormat
        var vinylStyle: String
        var vinylColor: String
        var tracklist: String
        var year: String

        init(_ album: Album) {
            coverUrl = album.coverUrl
            title = album.title
            artist = album.artist
            releaseDate = album.releaseDate ?? ""
            purchaseDate = album.purchaseDate ?? ""
            purchasePrice = album.purchasePrice ?? ""
            label = album.label ?? ""
            genres = (album.genres ?? []).joined(separator: ", ")
            styles = (album.styles ?? []).joined(separator: ", ")
            country = album.country ?? ""
            catalogNumber = album.catalogNumber ?? ""
            producers = (album.producers ?? []).joined(separator: ", ")
            edition = album.edition ?? ""
            barcode = album.barcode ?? ""
            doubanUrl = album.doubanUrl ?? ""
            format = album.format
            vinylStyle = album.vinylStyle ?? "standard"
            vinylColor = album.vinylColor ?? ""
            tracklist = (album.tracklist ?? []).joined(separator: "\n")
            year = album.year.map(String.init) ?? ""
        }
    }

    private var canSave: Bool {
        !draft.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !draft.artist.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !draft.coverUrl.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        NavigationStack {
            Form {
                coverSection
                basicsSection
                releaseSection
                purchaseSection
                mediumSection
                tracklistSection
            }
            .navigationTitle("编辑资料")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("保存") {
                        store.update(apply(draft, to: album))
                        dismiss()
                    }
                    .disabled(!canSave)
                }
            }
        }
    }

    private var coverSection: some View {
        Section("封面") {
            TextField("封面图片地址", text: $draft.coverUrl, axis: .vertical)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .keyboardType(.URL)
            if showingCoverPreview, !draft.coverUrl.isEmpty {
                NativeCoverImage(url: draft.coverUrl, cornerRadius: 12, target: .card)
                    .aspectRatio(1, contentMode: .fit)
            }
        }
    }

    private var basicsSection: some View {
        Section("基本") {
            LabeledField("专辑名", text: $draft.title)
            LabeledField("艺人", text: $draft.artist)
            LabeledField("版本说明", text: $draft.edition)
        }
    }

    private var releaseSection: some View {
        Section("发行") {
            LabeledField("发行日期", text: $draft.releaseDate, hint: "YYYY-MM-DD")
            LabeledField("年份", text: $draft.year, keyboard: .numberPad)
            LabeledField("厂牌 / 唱片公司", text: $draft.label)
            LabeledField("流派", text: $draft.genres, hint: "逗号分隔")
            LabeledField("风格", text: $draft.styles, hint: "逗号分隔")
            LabeledField("发行国家", text: $draft.country)
            LabeledField("编目号", text: $draft.catalogNumber)
            LabeledField("制作人", text: $draft.producers, hint: "逗号分隔")
            LabeledField("条形码", text: $draft.barcode, keyboard: .numbersAndPunctuation)
            LabeledField("豆瓣条目链接", text: $draft.doubanUrl, keyboard: .URL)
        }
    }

    private var purchaseSection: some View {
        Section("购买") {
            LabeledField("购买日期", text: $draft.purchaseDate, hint: "YYYY-MM-DD")
            LabeledField("购买价格", text: $draft.purchasePrice)
        }
    }

    private var mediumSection: some View {
        Section("介质") {
            Picker("介质", selection: $draft.format) {
                ForEach(AlbumFormat.allCases) { item in
                    Text(item.label).tag(item)
                }
            }
            if draft.format == .vinyl {
                Picker("唱片风格", selection: $draft.vinylStyle) {
                    Text("标准").tag("standard")
                    Text("透明").tag("transparent")
                    Text("画胶").tag("picture")
                    Text("泼溅").tag("splatter")
                }
                LabeledField("唱片颜色", text: $draft.vinylColor, hint: "#RRGGBB")
            }
        }
    }

    private var tracklistSection: some View {
        Section {
            TextField("每行一首", text: $draft.tracklist, axis: .vertical)
                .lineLimit(6...30)
                .autocorrectionDisabled()
        } header: {
            Text("曲目")
        } footer: {
            Text("每行一首，保存时会去掉空行。")
        }
    }

    /// Folds the draft back onto the record. Blank inputs clear the field rather
    /// than storing an empty string, matching how the web form normalises.
    private func apply(_ draft: Draft, to album: Album) -> Album {
        func text(_ value: String) -> String? {
            let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
            return trimmed.isEmpty ? nil : trimmed
        }
        func list(_ value: String) -> [String]? {
            let items = value
                .split(separator: ",")
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty }
            return items.isEmpty ? nil : items
        }

        var updated = album
        updated.coverUrl = draft.coverUrl.trimmingCharacters(in: .whitespacesAndNewlines)
        updated.title = draft.title.trimmingCharacters(in: .whitespacesAndNewlines)
        updated.artist = draft.artist.trimmingCharacters(in: .whitespacesAndNewlines)
        updated.releaseDate = text(draft.releaseDate)
        updated.purchaseDate = text(draft.purchaseDate)
        updated.purchasePrice = text(draft.purchasePrice)
        updated.label = text(draft.label)
        updated.genres = list(draft.genres)
        updated.styles = list(draft.styles)
        updated.country = text(draft.country)
        updated.catalogNumber = text(draft.catalogNumber)
        updated.producers = list(draft.producers)
        updated.edition = text(draft.edition)
        updated.barcode = text(draft.barcode)
        updated.doubanUrl = text(draft.doubanUrl)
        updated.format = draft.format
        updated.vinylStyle = draft.format == .vinyl ? text(draft.vinylStyle) : nil
        updated.vinylColor = draft.format == .vinyl ? text(draft.vinylColor) : nil
        updated.year = Int(draft.year.trimmingCharacters(in: .whitespacesAndNewlines))
        updated.tracklist = {
            let lines = draft.tracklist
                .split(separator: "\n", omittingEmptySubsequences: false)
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty }
            return lines.isEmpty ? nil : lines
        }()
        return updated
    }
}

/// A form row with the label on the left and the field on the right, so long
/// Chinese labels stay readable instead of being clipped by a placeholder.
private struct LabeledField: View {
    let title: String
    @Binding var text: String
    var hint: String = ""
    var keyboard: UIKeyboardType = .default

    init(
        _ title: String,
        text: Binding<String>,
        hint: String = "",
        keyboard: UIKeyboardType = .default
    ) {
        self.title = title
        _text = text
        self.hint = hint
        self.keyboard = keyboard
    }

    var body: some View {
        HStack(spacing: 12) {
            Text(title)
                .foregroundStyle(.secondary)
                .frame(width: 108, alignment: .leading)
            TextField(hint.isEmpty ? title : hint, text: $text)
                .multilineTextAlignment(.trailing)
                .keyboardType(keyboard)
                .autocorrectionDisabled()
        }
        .font(.subheadline)
    }
}
