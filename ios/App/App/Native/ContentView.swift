import SwiftUI
import UniformTypeIdentifiers

struct VinylShopRootView: View {
    @ObservedObject var store: LibraryStore

    @State private var selectedTab: LibraryTab = .gallery
    @State private var selectedAlbumID: String?
    @State private var showingSettings = false
    @State private var showingAdd = false

    var body: some View {
        TabView(selection: $selectedTab) {
            NavigationStack {
                GalleryScreen(
                    store: store,
                    favoritesOnly: false,
                    selectedAlbumID: $selectedAlbumID,
                    showingSettings: $showingSettings,
                    showingAdd: $showingAdd
                )
            }
            .tabItem {
                Label("画廊", systemImage: "square.grid.2x2")
            }
            .tag(LibraryTab.gallery)

            NavigationStack {
                RecordRackScreen(
                    store: store,
                    selectedAlbumID: $selectedAlbumID,
                    showingSettings: $showingSettings,
                    showingAdd: $showingAdd
                )
            }
            .tabItem {
                Label("唱片架", systemImage: "rectangle.stack")
            }
            .tag(LibraryTab.rack)

            NavigationStack {
                GalleryScreen(
                    store: store,
                    favoritesOnly: true,
                    selectedAlbumID: $selectedAlbumID,
                    showingSettings: $showingSettings,
                    showingAdd: $showingAdd
                )
            }
            .tabItem {
                Label("喜欢", systemImage: "heart")
            }
            .tag(LibraryTab.favorites)
        }
        .sheet(isPresented: $showingSettings) {
            SettingsScreen(store: store)
        }
        .sheet(isPresented: $showingAdd) {
            AddAlbumScreen(store: store)
        }
        .sheet(
            isPresented: Binding(
                get: { selectedAlbumID != nil },
                set: { if !$0 { selectedAlbumID = nil } }
            )
        ) {
            if let album = store.album(id: selectedAlbumID) {
                AlbumDetailScreen(store: store, albumID: album.id)
            }
        }
        .alert(
            "唱片库",
            isPresented: Binding(
                get: { store.notice != nil },
                set: { if !$0 { store.notice = nil } }
            ),
            presenting: store.notice
        ) { _ in
            Button("好", role: .cancel) {
                store.notice = nil
            }
        } message: { message in
            Text(message)
        }
    }
}

private struct LibraryToolbar: ToolbarContent {
    @Binding var showingSettings: Bool
    @Binding var showingAdd: Bool

    var body: some ToolbarContent {
        ToolbarItemGroup(placement: .topBarTrailing) {
            Button {
                showingSettings = true
            } label: {
                Label("设置", systemImage: "slider.horizontal.3")
            }

            Button {
                showingAdd = true
            } label: {
                Label("添加唱片", systemImage: "plus")
            }
        }
    }
}

private struct GalleryScreen: View {
    @ObservedObject var store: LibraryStore
    let favoritesOnly: Bool
    @Binding var selectedAlbumID: String?
    @Binding var showingSettings: Bool
    @Binding var showingAdd: Bool

    @State private var searchText = ""

    private var versionCounts: [String: Int] {
        store.versionCounts()
    }

    private var albums: [Album] {
        store.search(
            searchText,
            in: store.visibleAlbums(favoritesOnly: favoritesOnly)
        )
    }

    private var columns: [GridItem] {
        if store.displayMode == .covers {
            return [
                GridItem(.adaptive(minimum: 104, maximum: 180), spacing: 12)
            ]
        }
        return [
            GridItem(.adaptive(minimum: 152, maximum: 220), spacing: 18)
        ]
    }

    var body: some View {
        Group {
            if albums.isEmpty {
                ContentUnavailableView {
                    Label(
                        favoritesOnly ? "还没有喜欢的唱片" : "没有找到唱片",
                        systemImage: favoritesOnly ? "heart" : "opticaldisc"
                    )
                } description: {
                    Text(
                        favoritesOnly
                            ? "在唱片详情里点按心形，最多选择 10 张。"
                            : "尝试其他搜索词或添加一张唱片。"
                    )
                }
            } else {
                ScrollView {
                    LazyVGrid(columns: columns, spacing: 24) {
                        ForEach(albums) { album in
                            AlbumCard(
                                album: album,
                                coversOnly: store.displayMode == .covers,
                                versionCount: versionCounts[album.id] ?? 1
                            ) {
                                selectedAlbumID = album.id
                            }
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 12)
                    .padding(.bottom, 36)
                }
                .scrollIndicators(.hidden)
                .background(Color(uiColor: .systemGroupedBackground))
            }
        }
        .navigationTitle(favoritesOnly ? "喜欢 \(store.favoriteCount)/10" : "唱片库")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(
            text: $searchText,
            placement: .navigationBarDrawer(displayMode: .automatic),
            prompt: "搜索唱片、艺人、厂牌"
        )
        .toolbar {
            LibraryToolbar(
                showingSettings: $showingSettings,
                showingAdd: $showingAdd
            )
        }
    }
}

private struct AlbumCard: View {
    let album: Album
    let coversOnly: Bool
    /// Editions of this album; the badge only appears above one.
    var versionCount: Int = 1
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 9) {
                NativeCoverImage(url: album.coverUrl, cornerRadius: 12)
                    .aspectRatio(1, contentMode: .fit)
                    .overlay(alignment: .topTrailing) {
                        if album.isFavorite {
                            Image(systemName: "heart.fill")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(.pink)
                                .padding(8)
                                .glassEffect(.regular, in: .circle)
                                .padding(7)
                        }
                    }
                    .shadow(
                        color: .black.opacity(0.14),
                        radius: 12,
                        y: 7
                    )

                if !coversOnly {
                    Text(album.title)
                        .font(.headline)
                        .foregroundStyle(.primary)
                        .lineLimit(1)
                    Text(album.cleanedArtist)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                    HStack(spacing: 6) {
                        if let year = album.year {
                            Text(String(year))
                        }
                        if album.format != .unknown {
                            Text(album.format.label)
                        }
                        // `.gallery-versions` — "N 个版本" when editions merged.
                        if versionCount > 1 {
                            Text("\(versionCount) 个版本")
                                .foregroundStyle(.secondary)
                        }
                    }
                    .font(.caption)
                    .foregroundStyle(.tertiary)
                }
            }
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .hoverEffect(.lift)
        .accessibilityLabel("\(album.title)，\(album.cleanedArtist)")
    }
}

private struct RecordRackScreen: View {
    @ObservedObject var store: LibraryStore
    @Binding var selectedAlbumID: String?
    @Binding var showingSettings: Bool
    @Binding var showingAdd: Bool

    @State private var activeIndex = 0

    private var albums: [Album] {
        store.visibleAlbums()
    }

    var body: some View {
        RecordRackScene(
            albums: albums,
            hapticsEnabled: store.hapticsEnabled,
            soundEnabled: store.scrollSoundEnabled,
            jumpRequest: nil,
            onActiveIndexChange: { activeIndex = $0 },
            onInspect: { selectedAlbumID = $0.id }
        )
        .ignoresSafeArea()
        // The rack is the whole screen: no title, no toolbar, no filter — only
        // the tab bar stays, matching `.crate-fullscreen` covering the viewport.
        .toolbar(.hidden, for: .navigationBar)
    }

}

private struct AddAlbumScreen: View {
    @ObservedObject var store: LibraryStore
    @Environment(\.dismiss) private var dismiss

    @State private var title = ""
    @State private var artist = ""
    @State private var coverURL = ""
    @State private var format: AlbumFormat = .vinyl
    @State private var year = ""

    private var canSave: Bool {
        !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !artist.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && URL(string: coverURL) != nil
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("唱片") {
                    TextField("专辑名", text: $title)
                    TextField("艺人", text: $artist)
                    Picker("介质", selection: $format) {
                        ForEach(AlbumFormat.allCases) { item in
                            Text(item.label).tag(item)
                        }
                    }
                    TextField("年份", text: $year)
                        .keyboardType(.numberPad)
                }

                Section("封面") {
                    TextField("https://…", text: $coverURL, axis: .vertical)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.URL)
                    if URL(string: coverURL) != nil {
                        NativeCoverImage(url: coverURL, cornerRadius: 12)
                            .aspectRatio(1, contentMode: .fit)
                    }
                }
            }
            .navigationTitle("添加唱片")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消") {
                        dismiss()
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("添加") {
                        store.add(
                            title: title,
                            artist: artist,
                            coverURL: coverURL,
                            format: format,
                            year: Int(year)
                        )
                        dismiss()
                    }
                    .disabled(!canSave)
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }
}

private struct SettingsScreen: View {
    @ObservedObject var store: LibraryStore
    @Environment(\.dismiss) private var dismiss

    @State private var exporting = false
    @State private var importing = false
    @State private var exportDocument: LibraryBackupDocument?
    @State private var resultMessage: String?

    var body: some View {
        settingsNavigation
            .fileExporter(
                isPresented: $exporting,
                document: exportDocument,
                contentType: .json,
                defaultFilename: "vinylshop-backup-\(Self.dayStamp)",
                onCompletion: exportCompleted
            )
            .fileImporter(
                isPresented: $importing,
                allowedContentTypes: [.json],
                onCompletion: importBackup
            )
            .alert(
                "数据备份",
                isPresented: hasResultMessage,
                presenting: resultMessage
            ) { _ in
                Button("好", role: .cancel) {
                    resultMessage = nil
                }
            } message: {
                Text($0)
            }
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
    }

    private var settingsNavigation: some View {
        NavigationStack {
            SettingsForm(
                store: store,
                exportAction: prepareExport,
                importAction: { importing = true }
            )
            .navigationTitle("设置")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("完成") {
                        dismiss()
                    }
                }
            }
        }
    }

    private var hasResultMessage: Binding<Bool> {
        Binding(
            get: { resultMessage != nil },
            set: { if !$0 { resultMessage = nil } }
        )
    }

    private func prepareExport() {
        do {
            exportDocument = LibraryBackupDocument(data: try store.exportData())
            exporting = true
        } catch {
            resultMessage = "无法生成备份：\(error.localizedDescription)"
        }
    }

    private func exportCompleted(_ result: Result<URL, Error>) {
        switch result {
        case .success:
            resultMessage = "备份已导出"
        case let .failure(error):
            resultMessage = "导出失败：\(error.localizedDescription)"
        }
    }

    private static var dayStamp: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: Date())
    }

    private func importBackup(_ result: Result<URL, Error>) {
        do {
            let url = try result.get()
            let scoped = url.startAccessingSecurityScopedResource()
            defer {
                if scoped {
                    url.stopAccessingSecurityScopedResource()
                }
            }
            let imported = try store.importData(Data(contentsOf: url))
            resultMessage = "已恢复：新增 \(imported.added)，更新 \(imported.updated)"
        } catch {
            resultMessage = "恢复失败：\(error.localizedDescription)"
        }
    }
}

private struct SettingsForm: View {
    @ObservedObject var store: LibraryStore
    let exportAction: () -> Void
    let importAction: () -> Void

    var body: some View {
        Form {
            displaySection
            filterSection
            feedbackSection
            dataSection
        }
    }

    private var displaySection: some View {
        Section("显示方式") {
            Picker("画廊", selection: $store.displayMode) {
                ForEach(GalleryDisplayMode.allCases) {
                    Text($0.label).tag($0)
                }
            }
            .pickerStyle(.segmented)
        }
    }

    private var filterSection: some View {
        Section("筛选与排序") {
            Picker("筛选", selection: $store.formatFilter) {
                ForEach(LibraryFormatFilter.allCases) {
                    Text($0.label).tag($0)
                }
            }
            Picker("排序", selection: $store.sortMode) {
                ForEach(LibrarySortMode.allCases) {
                    Text($0.label).tag($0)
                }
            }
        }
    }

    private var feedbackSection: some View {
        Section("唱片架反馈") {
            Toggle("滚动触觉", isOn: $store.hapticsEnabled)
            Toggle("机械滚动声音", isOn: $store.scrollSoundEnabled)
        }
    }

    private var dataSection: some View {
        Section {
            LabeledContent("存储位置", value: "此 iPhone")
            LabeledContent("唱片数量", value: String(store.albums.count))

            Button(action: exportAction) {
                Label(
                    "导出到“文件”或 iCloud Drive",
                    systemImage: "square.and.arrow.up"
                )
            }

            Button(action: importAction) {
                Label("从备份恢复", systemImage: "square.and.arrow.down")
            }
        } header: {
            Text("本地数据")
        } footer: {
            Text("唱片资料保存在 App 的原生本地文件中；导出时可在系统“文件”选择 iCloud Drive。")
        }
    }
}
