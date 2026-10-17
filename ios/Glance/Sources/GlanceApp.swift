import SwiftUI

@main
struct GlanceApp: App {
    @State private var model = AppModel()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(model)
                .onOpenURL { url in model.handleCallback(url) }   // glance:// callbacks from Meta registration
        }
    }
}

struct RootView: View {
    @Environment(AppModel.self) private var model
    var body: some View {
        TabView {
            GlanceTab().tabItem { Label("Glance", systemImage: "eyeglasses") }
            SettingsTab().tabItem { Label("Settings", systemImage: "gear") }
        }
        .task { await model.start() }
    }
}
