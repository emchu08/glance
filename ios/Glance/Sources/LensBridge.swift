import Foundation
import WebKit
import UIKit

/// Hosts the 600×600 web lens in a WKWebView and bridges it to the glasses display/input.
/// The web runtime publishes {instance, revision, screen, actions, active, field} after DOM updates
/// via `window.webkit.messageHandlers.glance`; we coalesce refreshes, wait ~90 ms for layout, snapshot,
/// and record which action/revision was actually delivered. Taps resolve against published action bounds.
@MainActor
final class LensBridge: NSObject, WKScriptMessageHandler, ObservableObject {
    struct PublishedState: Decodable { let instance: String; let revision: Int; let screen: String; let active: String?; let actions: [PublishedAction] }
    struct PublishedAction: Decodable { let id: String; let label: String; let row: Int; let x: Int; let variant: String; let rect: Rect? ; struct Rect: Decodable { let x: Double; let y: Double; let width: Double; let height: Double } }

    @Published private(set) var state: PublishedState?
    @Published private(set) var lastSnapshot: UIImage?
    private(set) var deliveredRevision: Int = -1
    private var pendingRefresh = false
    weak var webView: WKWebView?
    var onSnapshot: ((UIImage, Int) -> Void)?

    func makeWebView(url: URL) -> WKWebView {
        let cfg = WKWebViewConfiguration()
        cfg.userContentController.add(self, name: "glance")
        cfg.allowsInlineMediaPlayback = true
        let wv = WKWebView(frame: CGRect(x: 0, y: 0, width: 600, height: 600), configuration: cfg)
        wv.isOpaque = true; wv.backgroundColor = .black; wv.scrollView.isScrollEnabled = false
        wv.load(URLRequest(url: url))
        webView = wv
        return wv
    }

    nonisolated func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let data = try? JSONSerialization.data(withJSONObject: body), let s = try? JSONDecoder().decode(PublishedState.self, from: data) else { return }
        Task { @MainActor in self.state = s; self.scheduleSnapshot() }
    }

    /// Coalesced, event-driven snapshot (~90 ms settle). Never a polling loop.
    private func scheduleSnapshot() {
        guard !pendingRefresh else { return }
        pendingRefresh = true
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(90))
            pendingRefresh = false
            guard let wv = webView, let s = state else { return }
            let can = (try? await wv.evaluateJavaScript("window.glanceBridge && window.glanceBridge.canSnapshot()")) as? Bool ?? true
            guard can else { scheduleSnapshot(); return }
            let cfg = WKSnapshotConfiguration(); cfg.rect = CGRect(x: 0, y: 0, width: 600, height: 600)
            if let img = try? await wv.takeSnapshot(configuration: cfg) {
                lastSnapshot = img; deliveredRevision = s.revision
                onSnapshot?(img, s.revision)
            }
        }
    }

    // Input from temples / D-pad → web runtime. Revision-bound so a delayed tap cannot pick a newer action.
    func move(_ dir: String) { js("window.glanceBridge.move('\(dir)')") }
    func swipe(_ delta: Int) { js("window.glanceBridge.swipe(\(delta))") }
    func select() { js("window.glanceBridge.selectDisplayed(\(deliveredActive()))") }
    func back() { js("window.glanceBridge.back()") }
    func tap(x: Double, y: Double) { js("window.glanceBridge.tap(\(x), \(y), \(deliveredRevision))") }
    func submitText(_ text: String) { js("window.glanceBridge.submitText && window.glanceBridge.submitText(\(jsonString(text)), \(deliveredRevision))") }
    private func deliveredActive() -> String { if let a = state?.active { return jsonString(a) } else { return "null" } }
    private func js(_ src: String) { webView?.evaluateJavaScript(src, completionHandler: nil) }
    private func jsonString(_ s: String) -> String { (try? String(data: JSONSerialization.data(withJSONObject: [s]), encoding: .utf8))?.dropFirst().dropLast().description ?? "\"\"" }
}
