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
        LauncherView()
        // Connect to the glasses as soon as the app opens; there is no separate start step.
        .task { await model.start(); await model.openGlance() }
    }
}
