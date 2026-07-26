import SwiftUI

@main
struct VinylShopApp: App {
    @StateObject private var store = LibraryStore()

    var body: some Scene {
        WindowGroup {
            VinylShopRootView(store: store)
        }
    }
}
