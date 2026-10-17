import SwiftUI
import WebKit

struct GlanceTab: View {
    @Environment(AppModel.self) private var model
    @State private var code = ""
    var body: some View {
        @Bindable var model = model
        NavigationStack {
            Form {
                Section("Lens camera") {
                    LensCameraCard()
                    Picker("Source", selection: $model.cameraSource) { ForEach(CameraSource.allCases) { Text($0.rawValue).tag($0) } }
                    Text("One camera, all modes: the lens decides when to analyze. Nothing is sent while you read an offer.").font(.footnote).foregroundStyle(.secondary)
                }
                if model.capabilities.display {
                    Section("Glasses") { Text("Mirroring the lens to the right display · rev \(model.lensBridge.deliveredRevision)") }
                }
                Section("Connection") {
                    LabeledContent("Glasses", value: model.connection.label)
                    if !model.connection.recovery.isEmpty { Text(model.connection.recovery).font(.footnote).foregroundStyle(.secondary) }
                    Button(model.connection == .idle ? "Connect glasses" : "Reconnect") { Task { await model.connectGlasses() } }
                    DisclosureGroup("Pair with the lens") {
                        TextField("6-character code", text: $code).textInputAutocapitalization(.characters).autocorrectionDisabled()
                        Button("Pair") { Task { await model.pair(code: code) } }.disabled(code.count != 6)
                        LabeledContent("Relay", value: model.relayStatus)
                        if !model.pairingCode.isEmpty { Button("Disconnect", role: .destructive) { model.disconnectRelay() } }
                    }
                }
                Section("From your glasses") {
                    if model.history.isEmpty { Text("Links you send from the lens appear here.").foregroundStyle(.secondary) }
                    ForEach(model.history) { link in
                        if let url = URL(string: link.url) { Link(destination: url) { VStack(alignment: .leading) { Text(link.title); Text(link.kind.capitalized).font(.caption).foregroundStyle(.secondary) } } }
                    }
                }
                Section("Developer tools") {
                    NavigationLink("Lens preview (WKWebView)") { LensPreview() }
                    LabeledContent("API", value: model.apiBase.absoluteString)
                    LabeledContent("Transport", value: model.transport.name)
                    NavigationLink("Log") { List(model.developerLog.reversed(), id: \.self) { Text($0).font(.system(.caption, design: .monospaced)) } }
                }
            }
            .navigationTitle("Glance")
        }
    }
}

struct LensCameraCard: View {
    @Environment(AppModel.self) private var model
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack { Image(systemName: "camera.viewfinder"); Text(model.cameraSource.rawValue).font(.headline) }
            Text(model.lastFrameAt.map { "Last frame \($0.formatted(date: .omitted, time: .standard))" } ?? "No frames sent yet").font(.footnote).foregroundStyle(.secondary)
            Button("Start camera") { Task { try? await model.transport.startCamera() } }.buttonStyle(.borderedProminent)
        }
    }
}

struct LensPreview: UIViewRepresentable {
    @Environment(AppModel.self) private var model
    func makeUIView(context: Context) -> WKWebView { model.lensBridge.makeWebView(url: model.apiBase.appending(path: "/lens")) }
    func updateUIView(_ uiView: WKWebView, context: Context) {}
}

struct SettingsTab: View {
    @Environment(AppModel.self) private var model
    @State private var apiBase: String = Config.apiBase.absoluteString
    var body: some View {
        NavigationStack {
            Form {
                Section("Server") {
                    TextField("API base", text: $apiBase).keyboardType(.URL).autocorrectionDisabled().textInputAutocapitalization(.never)
                    Text("Keep the phone and lens on the same origin. Production builds use the deployed HTTPS origin.").font(.footnote).foregroundStyle(.secondary)
                }
                Section("Wallet") {
                    Link("Open wallet setup", destination: model.apiBase.appending(path: "/wallet/setup"))
                    Text("Card details stay with Stripe. Purchases happen on the glasses; your bank may occasionally ask to verify here.").font(.footnote).foregroundStyle(.secondary)
                }
                Section("Privacy") {
                    Link("Privacy", destination: model.apiBase.appending(path: "/privacy"))
                    Link("Terms", destination: model.apiBase.appending(path: "/terms"))
                    Text("Camera frames are transient (20 s on the relay) and never saved to your account.").font(.footnote).foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Settings")
        }
    }
}
