import Foundation
import WebKit
import UIKit
import OSLog
import CryptoKit

/// One interactive web runtime serves the phone and the glasses. Capture and
/// Bluetooth delivery have separate, bounded queues: never build a backlog.
@MainActor
final class LensBridge: NSObject, WKScriptMessageHandler, WKScriptMessageHandlerWithReply, WKNavigationDelegate, ObservableObject {
    struct PublishedState: Decodable, Sendable, Equatable {
        let instance: String; let revision: Int; let screen: String; let active: String?; let actions: [PublishedAction]
    }
    struct PublishedAction: Decodable, Sendable, Equatable {
        // Numbers, not integers: the lens may lay actions out at fractional rows and positions.
        let id: String; let label: String; let row: Double; let x: Double; let variant: String; let rect: Rect?
        struct Rect: Decodable, Sendable, Equatable { let x: Double; let y: Double; let width: Double; let height: Double }
    }
    private static let logger = Logger(subsystem: "com.glance.companion", category: "performance")
    @Published private(set) var state: PublishedState?
    @Published private(set) var lastSnapshot: UIImage?
    private(set) var webView: WKWebView?
    private(set) var lastFrameAt: Date?
    private var cameraFrame: (jpeg: Data, width: Int, height: Int, at: Date)?
    private var cameraReady: Bool?
    private var needsRefresh = false
    private var snapshotTask: Task<Void, Never>?
    private var lastSnapshotLog = Date.distantPast
    let sender = LatestFrameSender()
    var onSnapshot: ((UIImage, PublishedState) async -> Bool)?
    var onError: ((String) -> Void)?
    var onWallet: (() -> Void)?
    /// A scan wants a picture: the camera turns on (it is off between scans).
    var onCameraDemand: (() -> Void)?
    /// The camera is ready to turn on for a scan, though not streaming now.
    private var cameraStandby = false
    /// A scan is waiting for the camera to turn on (the lens says so until the first picture).
    private var cameraStarting = false

    func makeWebView(url: URL) -> WKWebView {
        if let webView { return webView }
        let cfg = WKWebViewConfiguration()
        cfg.userContentController.add(self, name: "glance")
        cfg.userContentController.addScriptMessageHandler(self, contentWorld: .page, name: "glanceNative")
        cfg.allowsInlineMediaPlayback = true
        if let path = Bundle.main.url(forResource: "native-lens", withExtension: "js"),
           let script = try? String(contentsOf: path, encoding: .utf8) {
            cfg.userContentController.addUserScript(WKUserScript(source: script, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
        if let path = Bundle.main.url(forResource: "lens", withExtension: "css"),
           let css = try? String(contentsOf: path, encoding: .utf8) {
            let script = "const style = document.createElement('style'); style.id = 'glance-native-theme'; style.textContent = \(jsonString(css)); document.head.appendChild(style);"
            cfg.userContentController.addUserScript(WKUserScript(source: script, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        }
        let wv = WKWebView(frame: CGRect(x: 0, y: 0, width: 600, height: 600), configuration: cfg)
        wv.accessibilityIdentifier = "glance-runtime-webview"
        wv.navigationDelegate = self
        wv.isOpaque = true; wv.backgroundColor = .black; wv.scrollView.isScrollEnabled = false
        wv.scrollView.contentInsetAdjustmentBehavior = .never
        webView = wv
        sender.send = { [weak self] image, state in await self?.onSnapshot?(image, state) ?? false }
        cfg.websiteDataStore.removeData(ofTypes: [WKWebsiteDataTypeDiskCache, WKWebsiteDataTypeMemoryCache, WKWebsiteDataTypeServiceWorkerRegistrations], modifiedSince: .distantPast) { [weak wv] in
            wv?.load(URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData))
        }
        return wv
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction) async -> WKNavigationActionPolicy {
        guard navigationAction.targetFrame?.isMainFrame != false else { return .allow }
        guard let url = navigationAction.request.url, Config.allowsLensNavigation(url) else {
            if navigationAction.request.url?.path == "/wallet/setup" { onWallet?() }
            else { onError?("Glance blocked an unexpected page. Reopen the app to load the current Glance.") }
            return .cancel
        }
        return .allow
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        updateCameraStatus(force: true)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        onError?("Could not load Glance. Check your internet connection and reopen the app.")
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any] else { return }
        guard let data = try? JSONSerialization.data(withJSONObject: body),
              let s = try? JSONDecoder().decode(PublishedState.self, from: data), s != state else { return }
        state = s
        scheduleSnapshot()
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage, replyHandler: @escaping @MainActor (Any?, String?) -> Void) {
        guard message.frameInfo.isMainFrame, message.frameInfo.securityOrigin.host == Config.apiBase.host,
              let body = message.body as? [String: Any] else { replyHandler(nil, "Unsupported page"); return }
        switch body["type"] as? String {
        case "frame":
            onCameraDemand?()
            if cameraFrame.map({ Date().timeIntervalSince($0.at) > 2 }) ?? true, cameraStandby, !cameraStarting {
                cameraStarting = true
                updateCameraStatus(force: true)
            }
            Task { @MainActor in
                // The camera may be just turning on: wait for a fresh frame, never return an old one.
                let deadline = ContinuousClock.now.advanced(by: .seconds(12))
                while (cameraFrame == nil || Date().timeIntervalSince(cameraFrame!.at) > 2), ContinuousClock.now < deadline {
                    try? await Task.sleep(for: .milliseconds(50))
                }
                guard let frame = cameraFrame, Date().timeIntervalSince(frame.at) <= 2 else {
                    if cameraStarting { cameraStarting = false; updateCameraStatus(force: true) }
                    replyHandler(nil, cameraStandby ? "The glasses camera didn’t turn on. Try again, or tap Reconnect on your phone." : "The glasses camera is off. Connect your glasses in the Glance app on your phone."); return
                }
                replyHandler(["image": "data:image/jpeg;base64,\(frame.jpeg.base64EncodedString())", "width": frame.width, "height": frame.height, "capturedAt": Int(frame.at.timeIntervalSince1970 * 1000)], nil)
            }
        case "refresh": scheduleSnapshot(); replyHandler(true, nil)
        case "wallet": onWallet?(); replyHandler(true, nil)
        default: replyHandler(nil, "Unknown companion request")
        }
    }

    func receiveFrame(_ jpeg: Data, width: Int, height: Int) {
        let now = Date()
        cameraFrame = (jpeg, width, height, now)
        lastFrameAt = now
        if cameraStarting { cameraStarting = false; updateCameraStatus(force: true) }
        else if cameraReady != true { updateCameraStatus() }
    }

    func clearCamera() { cameraFrame = nil; lastFrameAt = nil; cameraStandby = false; cameraStarting = false; updateCameraStatus(force: true) }
    func setCameraStandby(_ on: Bool) { cameraStandby = on; updateCameraStatus(force: true) }
    /// Ready means a scan can get a picture: streaming now, or on standby to turn on.
    func updateCameraStatus(force: Bool = false) {
        let ready = cameraStandby || (lastFrameAt.map { Date().timeIntervalSince($0) < 2 } ?? false)
        guard force || ready != cameraReady else { return }
        cameraReady = ready
        let starting = ready && cameraStarting
        let message = starting ? "Turning on the glasses camera…" : ready ? "Camera ready" : "Connect your glasses on the phone."
        js("window.glanceCompanion?.camera({ready: \(ready), starting: \(starting), message: \(jsonString(message))})")
    }

    func walletReturned() { js("window.glanceCompanion?.walletReturned()") }
    func refresh() { scheduleSnapshot() }

    func waitUntilReady() async throws {
        let deadline = ContinuousClock.now.advanced(by: .seconds(20))
        while state == nil, ContinuousClock.now < deadline { try await Task.sleep(for: .milliseconds(100)) }
        guard state != nil else { throw TransportError.message("The current Glance could not load. Check your internet connection and try again.") }
    }

    private func scheduleSnapshot() {
        needsRefresh = true
        guard snapshotTask == nil else { return }
        snapshotTask = Task { @MainActor in
            defer { snapshotTask = nil }
            while needsRefresh {
                needsRefresh = false
                // Let React commit and WebKit paint, without a fixed 90ms penalty per input.
                try? await Task.sleep(for: .milliseconds(16))
                guard let wv = webView, let s = state else { continue }
                let t0 = ContinuousClock.now
                let cfg = WKSnapshotConfiguration()
                cfg.rect = CGRect(x: 0, y: 0, width: 600, height: 600)
                cfg.snapshotWidth = NSNumber(value: 600 / Double(wv.traitCollection.displayScale))
                guard let raw = try? await wv.takeSnapshot(configuration: cfg) else { continue }
                guard state == s else { needsRefresh = true; continue }
                let image = Self.displayImage(raw)
                lastSnapshot = image
                sender.enqueue(image, state: s)
                if Date().timeIntervalSince(lastSnapshotLog) > 2 {
                    lastSnapshotLog = Date()
                    Self.logger.notice("[Glance performance] capture=\(String(describing: t0.duration(to: .now)), privacy: .public), pixels=600x600")
                }
            }
        }
    }

    /// SHA-256 of the bitmap, so identical frames are recognised without re-encoding them.
    static func pixelDigest(_ image: UIImage) -> Data? {
        guard let data = image.cgImage?.dataProvider?.data as Data? else { return nil }
        return Data(SHA256.hash(data: data))
    }

    static func displayImage(_ image: UIImage) -> UIImage {
        // UIImage's scale would otherwise turn a 600pt canvas into 1800×1800 on iPhone.
        if image.cgImage?.width == 600, image.cgImage?.height == 600, image.scale == 1 { return image }
        let format = UIGraphicsImageRendererFormat(); format.scale = 1; format.opaque = true
        return UIGraphicsImageRenderer(size: CGSize(width: 600, height: 600), format: format).image { _ in
            image.draw(in: CGRect(x: 0, y: 0, width: 600, height: 600))
        }
    }

    func control(_ control: String, displayed: PublishedState) {
        let instance = "b && b.instance === \(jsonString(displayed.instance))"
        let sameScreen = "\(instance) && b.getState().screen === \(jsonString(displayed.screen))"
        switch control {
        // Navigation may advance while an image is in flight, but cannot cross into a new screen.
        case "up", "down", "left", "right": js("{ const b = window.glanceBridge; if (\(sameScreen)) b.move(\(jsonString(control))); }")
        case "previous": js("{ const b = window.glanceBridge; if (\(sameScreen)) b.swipe(-1); }")
        case "next": js("{ const b = window.glanceBridge; if (\(sameScreen)) b.swipe(1); }")
        case "back": js("{ const b = window.glanceBridge; if (\(sameScreen)) b.back(); }")
        case "select":
            guard let active = displayed.active else { return }
            // Purchases and selections always refer to the revision actually delivered.
            js("{ const b = window.glanceBridge; if (\(instance) && b.getState().revision === \(displayed.revision)) { \(active == "w-setup" ? "window.webkit.messageHandlers.glanceNative.postMessage({type:'wallet'});" : "") b.activate(\(jsonString(active)), \(displayed.revision)); } }")
        default: break
        }
    }
    private func js(_ src: String) { webView?.evaluateJavaScript(src, completionHandler: nil) }
    private func jsonString(_ s: String) -> String { String(data: try! JSONSerialization.data(withJSONObject: [s]), encoding: .utf8)!.dropFirst().dropLast().description }
}

/// One send in flight, one newest pending image. No stale frame backlog.
@MainActor
final class LatestFrameSender {
    var send: ((UIImage, LensBridge.PublishedState) async -> Bool)?
    private var pending: (UIImage, LensBridge.PublishedState)?
    private var running = false
    private(set) var delivered: LensBridge.PublishedState?
    private static let logger = Logger(subsystem: "com.glance.companion", category: "performance")

    func enqueue(_ image: UIImage, state: LensBridge.PublishedState) {
        pending = (image, state)
        guard !running else { return }
        running = true
        Task { @MainActor in
            defer { running = false }
            while let (image, state) = pending {
                pending = nil
                let t0 = ContinuousClock.now
                if await send?(image, state) == true {
                    delivered = state
                    Self.logger.notice("[Glance performance] display send=\(String(describing: t0.duration(to: .now)), privacy: .public), revision=\(state.revision)")
                }
            }
        }
    }
}
