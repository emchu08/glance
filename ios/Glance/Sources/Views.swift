import SwiftUI
import WebKit

/// The phone half of Glance: connects the glasses camera on launch, then either hands the
/// lens to the glasses web app or mirrors the phone's lens onto the display.
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

                    TimelineView(.periodic(from: .now, by: 1)) { _ in
                        VStack(alignment: .leading, spacing: 18) {
                            if model.mode == .webApp {
                                CameraCard(blue: blue)
                                GlassesAppCard(blue: blue)
                            } else {
                                MirrorLens(blue: blue)
                            }
                            ConnectionCard(blue: blue)
                        }
                    }

                    if !model.history.isEmpty { LinksCard(blue: blue) }

                    VStack(alignment: .leading, spacing: 8) {
                        Text("On your glasses").font(.headline)
                        Picker("On your glasses", selection: Binding(get: { model.mode }, set: { model.setMode($0) })) {
                            ForEach(AppModel.GlassesMode.allCases) { Text($0.title).tag($0) }
                        }
                        .pickerStyle(.segmented)
                        .accessibilityIdentifier("glasses-mode")
                        Text(model.mode.detail).font(.footnote).foregroundStyle(.secondary)
                    }
                }
                .padding(20)
                .frame(maxWidth: 620)
                .frame(maxWidth: .infinity, minHeight: geometry.size.height, alignment: .top)
            }
        }
        .background(LinearGradient(colors: [.white, Color(red: 0.92, green: 0.96, blue: 1)], startPoint: .top, endPoint: .bottom).ignoresSafeArea())
        .preferredColorScheme(.light)
        .sheet(isPresented: $model.showWallet, onDismiss: {
            model.lensBridge.walletReturned()
            // Signing in on the phone also signs in the glasses web app.
            if model.mode == .webApp { Task { await model.offerGlassesSignIn() } }
        }) {
            WalletView()
        }
    }
}

/// What the glasses camera sees right now, from the same frames Glance recognizes.
private struct CameraCard: View {
    @Environment(AppModel.self) private var model
    let blue: Color
    var body: some View {
        ZStack(alignment: .bottomLeading) {
            RoundedRectangle(cornerRadius: 20).fill(Color(red: 0.06, green: 0.09, blue: 0.14))
            if let image = model.lastFrameImage, model.cameraLive {
                Image(uiImage: image).resizable().scaledToFill()
                    .clipShape(RoundedRectangle(cornerRadius: 20))
            } else {
                VStack(spacing: 12) {
                    ProgressView().tint(.white)
                    Text(model.errorMessage == nil ? model.launchStatus : "Glasses camera not connected")
                        .font(.callout).foregroundStyle(.white.opacity(0.85))
                }.frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            Label(model.cameraLive ? "Glasses camera · live" : "Glasses camera", systemImage: model.cameraLive ? "video.fill" : "video.slash")
                .font(.footnote.weight(.semibold)).foregroundStyle(.white)
                .padding(.horizontal, 12).padding(.vertical, 8)
                .background(.black.opacity(0.45), in: Capsule())
                .padding(12)
        }
        .aspectRatio(4 / 3, contentMode: .fit)
        .clipped()
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("camera-card")
    }
}

/// Whether the glasses are running Glance, and the one-time setup when they aren't.
private struct GlassesAppCard: View {
    @Environment(AppModel.self) private var model
    let blue: Color
    @State private var copied = false
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if model.glassesAppOpen {
                Label("Glance is open on your glasses", systemImage: "checkmark.circle.fill").font(.headline).foregroundStyle(blue)
                Text("Swipe to move, pinch to select. Keep this app open so the camera stays connected.")
                    .font(.callout).foregroundStyle(.secondary)
            } else {
                Label("Open Glance on your glasses", systemImage: "eyeglasses").font(.headline).foregroundStyle(blue)
                VStack(alignment: .leading, spacing: 8) {
                    Text("1. In Meta AI, turn on Developer Mode, then go to App Settings → Web Apps → Connect Web App.")
                    Text("2. Paste this address and save. It’s yours; it only needs doing once.")
                    Text(Config.glassesAppURL.absoluteString)
                        .font(.footnote.monospaced()).textSelection(.enabled)
                        .padding(10).frame(maxWidth: .infinity, alignment: .leading)
                        .background(blue.opacity(0.07), in: RoundedRectangle(cornerRadius: 10))
                    HStack {
                        Button {
                            UIPasteboard.general.url = Config.glassesAppURL
                            copied = true
                        } label: { Label(copied ? "Copied" : "Copy address", systemImage: copied ? "checkmark" : "doc.on.doc") }
                            .buttonStyle(.borderedProminent).tint(blue)
                            .accessibilityIdentifier("copy-glasses-url")
                        ShareLink(item: Config.glassesAppURL) { Label("Share", systemImage: "square.and.arrow.up") }
                            .buttonStyle(.bordered).tint(blue)
                    }
                    Text("3. Open Glance from the app grid on your glasses and pin it.")
                }
                .font(.callout)
            }
        }
        .padding(16)
        .background(.white.opacity(0.8), in: RoundedRectangle(cornerRadius: 20))
    }
}

/// Mirror mode: the phone's lens, covered until the glasses camera is actually live.
private struct MirrorLens: View {
    @Environment(AppModel.self) private var model
    let blue: Color
    var body: some View {
        ZStack {
            LensRuntimeView()
                .accessibilityIdentifier("live-lens")
            if !model.cameraLive {
                Color.black.opacity(0.82)
                VStack(spacing: 12) {
                    if model.errorMessage == nil { ProgressView().tint(.white) }
                    Text(model.errorMessage == nil ? model.launchStatus : "Glasses not connected")
                        .font(.callout).foregroundStyle(.white)
                }
            }
        }
        .aspectRatio(1, contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: 20))
    }
}

/// Only what needs the wearer: an error, and a way to retry.
private struct ConnectionCard: View {
    @Environment(AppModel.self) private var model
    let blue: Color
    var body: some View {
        if model.errorMessage != nil || (!model.cameraLive && !model.isLaunching) {
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
