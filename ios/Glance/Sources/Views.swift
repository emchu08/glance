import SwiftUI
import WebKit

/// The phone half of Glance: connects the glasses on launch and draws the Glance screens on them. Their
/// camera turns on only while a scan wants pictures. The phone shows the same Glance screens, or the camera.
struct LauncherView: View {
    @Environment(AppModel.self) private var model
    private let blue = Color(red: 0.16, green: 0.39, blue: 0.91)

    var body: some View {
        @Bindable var model = model
        GeometryReader { geometry in
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    HStack {
                        Label("Glance", systemImage: "eyeglasses")
                            .font(.system(size: 30, weight: .semibold, design: .rounded))
                        Spacer()
                        Button { model.showWallet = true } label: {
                            Label("Wallet", systemImage: "wallet.bifold")
                                .font(.headline).padding(.vertical, 12).padding(.horizontal, 16)
                                .background(blue.opacity(0.09), in: Capsule())
                        }.accessibilityIdentifier("phone-wallet")
                    }.foregroundStyle(blue)

                    Picker("On this phone", selection: $model.phoneView) {
                        ForEach(AppModel.PhoneView.allCases) { Text($0.title).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    .accessibilityIdentifier("phone-view")

                    // The lens always renders (the glasses' picture is taken from it); the camera covers it.
                    ZStack {
                        LensRuntimeView()
                            .accessibilityIdentifier("live-lens")
                        if model.phoneView == .camera { CameraPreview() }
                    }
                    .aspectRatio(1, contentMode: .fit)
                    .clipShape(RoundedRectangle(cornerRadius: 20))

                    TimelineView(.periodic(from: .now, by: 1)) { _ in
                        VStack(alignment: .leading, spacing: 14) {
                            ConnectionLine(blue: blue)
                            ConnectionCard(blue: blue)
                        }
                    }

                    if !model.history.isEmpty { LinksCard(blue: blue) }

                    DetailsCard()
                }
                .padding(20)
                .frame(maxWidth: 620)
                .frame(maxWidth: .infinity, minHeight: geometry.size.height, alignment: .top)
            }
        }
        .background(LinearGradient(colors: [.white, Color(red: 0.92, green: 0.96, blue: 1)], startPoint: .top, endPoint: .bottom).ignoresSafeArea())
        .preferredColorScheme(.light)
        .sheet(isPresented: $model.showWallet, onDismiss: { model.lensBridge.walletReturned() }) {
            WalletView()
        }
    }
}

/// One quiet line of connection status under the lens; it never covers the screens.
private struct ConnectionLine: View {
    @Environment(AppModel.self) private var model
    let blue: Color
    var body: some View {
        HStack(spacing: 8) {
            if model.isLaunching { ProgressView().controlSize(.small) }
            Label(model.cameraLive ? "Glasses connected · camera on"
                  : !model.isLaunching && !model.cameraStatus.isEmpty && model.errorMessage == nil ? "Glasses connected · camera \(model.cameraStatus)"
                  : model.launchStatus,
                  systemImage: model.cameraLive ? "eyeglasses" : "antenna.radiowaves.left.and.right")
        }
        .font(.footnote).foregroundStyle(blue)
        .accessibilityIdentifier("launch-status")
    }
}

/// The glasses camera, live. The Glance screens keep running underneath and on the glasses.
private struct CameraPreview: View {
    @Environment(AppModel.self) private var model
    var body: some View {
        // An overlay, so the frame fills the square without changing its size.
        Color.black
            .overlay {
                if let image = model.cameraPreview, model.cameraLive {
                    Image(uiImage: image).resizable().scaledToFill()
                } else {
                    Label(model.cameraStatus.isEmpty ? (model.isLaunching ? "Connecting the glasses…" : "Glasses camera off") : "Camera \(model.cameraStatus)", systemImage: "video.slash")
                        .font(.callout).foregroundStyle(.white.opacity(0.7))
                        .multilineTextAlignment(.center).padding()
                }
            }
            .clipped()
        .accessibilityIdentifier("camera-preview")
    }
}

/// Only what needs the wearer: an error, and a way to retry.
private struct ConnectionCard: View {
    @Environment(AppModel.self) private var model
    let blue: Color
    var body: some View {
        // The camera is off between scans; that's normal once it's ready.
        if model.errorMessage != nil || (!model.cameraLive && !model.cameraReady && !model.isLaunching) {
            VStack(alignment: .leading, spacing: 10) {
                if let error = model.errorMessage {
                    Text(error).font(.callout).accessibilityIdentifier("connection-error")
                }
                Button { Task { await model.openGlance() } } label: {
                    HStack {
                        if model.isLaunching { ProgressView().tint(.white) }
                        Text(model.isLaunching ? "Connecting…" : "Reconnect").font(.headline)
                    }
                    .frame(maxWidth: .infinity).frame(height: 50)
                    .foregroundStyle(.white).background(blue, in: Capsule())
                }.disabled(model.isLaunching).accessibilityIdentifier("open-glance")
            }
        }
    }
}

/// The recent connection steps, for when something won't connect.
private struct DetailsCard: View {
    @Environment(AppModel.self) private var model
    @State private var copied = false
    var body: some View {
        DisclosureGroup("Details") {
            VStack(alignment: .leading, spacing: 10) {
                Text(model.developerLog.suffix(30).joined(separator: "\n"))
                    .font(.caption2.monospaced()).foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .textSelection(.enabled)
                Button(copied ? "Copied" : "Copy details") {
                    UIPasteboard.general.string = model.developerLog.suffix(60).joined(separator: "\n")
                    copied = true
                }
                .font(.footnote)
            }
            .padding(.top, 6)
        }
        .font(.footnote).tint(.secondary)
        .accessibilityIdentifier("details")
    }
}

/// Links the wearer sent from the glasses ("Send to phone").
private struct LinksCard: View {
    @Environment(AppModel.self) private var model
    let blue: Color
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Sent from your glasses").font(.headline)
            ForEach(model.history.prefix(5)) { link in
                if let url = URL(string: link.url) {
                    Link(destination: url) {
                        HStack {
                            Text(link.title).lineLimit(1)
                            Spacer()
                            Image(systemName: "arrow.up.right")
                        }
                        .padding(12).background(blue.opacity(0.07), in: RoundedRectangle(cornerRadius: 12))
                    }.foregroundStyle(blue)
                }
            }
        }
    }
}

struct LensRuntimeView: UIViewRepresentable {
    @Environment(AppModel.self) private var model
    func makeUIView(context: Context) -> ScaledLensContainer {
        ScaledLensContainer(webView: model.lensBridge.makeWebView(url: Config.lensURL))
    }
    func updateUIView(_ uiView: ScaledLensContainer, context: Context) {}
}

final class ScaledLensContainer: UIView {
    let webView: WKWebView
    init(webView: WKWebView) {
        self.webView = webView
        super.init(frame: .zero)
        backgroundColor = .black
        clipsToBounds = true
        addSubview(webView)
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) is unavailable") }
    override func layoutSubviews() {
        super.layoutSubviews()
        webView.transform = .identity
        webView.frame = CGRect(x: 0, y: 0, width: 600, height: 600)
        webView.transform = CGAffineTransform(scaleX: bounds.width / 600, y: bounds.width / 600)
        webView.frame.origin = .zero
    }
}

private struct WalletView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var loading = true
    var body: some View {
        NavigationStack {
            ZStack {
                WalletWebView(onReturn: { dismiss() }, onLoading: { loading = $0 }).ignoresSafeArea(edges: .bottom)
                if loading { ProgressView("Loading wallet…").padding(24).background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16)) }
            }
                .navigationTitle("Wallet").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() }.accessibilityIdentifier("wallet-done") } }
        }
    }
}

private struct WalletWebView: UIViewRepresentable {
    let onReturn: () -> Void
    let onLoading: (Bool) -> Void
    func makeCoordinator() -> Coordinator { Coordinator(onReturn: onReturn, onLoading: onLoading) }
    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        // The lens and wallet must share authentication/Stripe cookies.
        config.websiteDataStore = .default()
        let theme = """
        const style = document.createElement('style');
        style.textContent = `:root { color-scheme: light; background: white;
          --color-canvas: #fff; --color-surface: #eef5ff; --color-raised: #dae8ff;
          --color-fg: #173d78; --color-muted: #4d6385; --color-subtle: #586b88;
          --color-wearer: #2864e8; --color-best: #2864e8; --color-warn: #17418b; --color-saved: #17418b; }
          main li, input, select { border-color: #bcd0ef !important; }
          a[href="/demo"] { display: none !important; }`;
        document.head.appendChild(style);
        const fixLinks = () => document.querySelectorAll('a[href="/glasses"]').forEach(a => { a.href = '/lens'; a.textContent = 'Return to Glance'; });
        new MutationObserver(fixLinks).observe(document.body, {childList: true, subtree: true}); fixLinks();
        """
        config.userContentController.addUserScript(WKUserScript(source: theme, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.load(URLRequest(url: Config.apiBase.appending(path: "/wallet/setup")))
        return webView
    }
    func updateUIView(_ uiView: WKWebView, context: Context) {}
    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        let onReturn: () -> Void
        let onLoading: (Bool) -> Void
        init(onReturn: @escaping () -> Void, onLoading: @escaping (Bool) -> Void) { self.onReturn = onReturn; self.onLoading = onLoading }
        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) { onLoading(true) }
        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { onLoading(false) }

        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction) async -> WKNavigationActionPolicy {
            guard navigationAction.targetFrame?.isMainFrame != false else { return .allow }
            guard let url = navigationAction.request.url else { return .cancel }
            if url.absoluteString == "about:blank" { return .allow }
            guard url.scheme == "https" else { return .cancel }
            // Wallet/auth pages may use Stripe/bank verification. Never navigate to a legacy runtime.
            if url.host == Config.apiBase.host, ["/", "/demo", "/glasses", "/lens"].contains(url.path) { onReturn(); return .cancel }
            if url.host == "glance-website-lac.vercel.app" { return .cancel }
            return .allow
        }
        func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
            if navigationAction.targetFrame == nil { webView.load(navigationAction.request) }
            return nil
        }
        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            onLoading(false)
            webView.loadHTMLString("<meta name='viewport' content='width=device-width,initial-scale=1'><body style='font:18px system-ui;padding:24px;color:#17418b'><h2>Wallet couldn’t load</h2><p>Check your connection, then close and reopen Wallet.</p></body>", baseURL: nil)
        }
    }
}
