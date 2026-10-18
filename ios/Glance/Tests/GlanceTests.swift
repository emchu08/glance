import XCTest
import WebKit
import MWDATInputs
@testable import Glance

final class GlanceTests: XCTestCase {
    func testRuntimeCannotUseAlternateHostsOrOldPages() {
        XCTAssertTrue(Config.allowsLensNavigation(Config.lensURL))
        for address in ["http://localhost:3100/lens", "https://glance-website-lac.vercel.app/lens", "https://glance-blue.vercel.app/demo", "https://glance-blue.vercel.app/glasses"] {
            XCTAssertFalse(Config.allowsLensNavigation(URL(string: address)!))
        }
    }

    @MainActor
    func testGlassesInputsNavigateExistingLensActions() {
        XCTAssertEqual(DATTransport.control(for: .nav(direction: .up, source: .neuralBand, timestampMs: 1)), "up")
        XCTAssertEqual(DATTransport.control(for: .nav(direction: .right, source: .captouch, timestampMs: 2)), "next")
        XCTAssertEqual(DATTransport.control(for: .select(source: .neuralBand, timestampMs: 3)), "select")
        XCTAssertEqual(DATTransport.control(for: .back(source: .captouch, timestampMs: 4)), "back")
        XCTAssertNil(DATTransport.control(for: .capture(.shortPress, source: .captureButton, timestampMs: 5)))
    }

    @MainActor
    func testDisplayControlsRejectStaleRevisionAndInstance() async throws {
        let bridge = LensBridge()
        let webView = bridge.makeWebView(url: URL(string: "about:blank")!)
        let navigation = NavigationWaiter()
        webView.navigationDelegate = navigation
        await withCheckedContinuation { continuation in
            navigation.loaded = { continuation.resume() }
        }
        _ = try await webView.evaluateJavaScript("""
            window.calls = [];
            window.glanceBridge = {
                instance: 'current',
                getState: () => ({revision: 4, screen: 'offers'}),
                activate: (id, revision) => calls.push(id),
                swipe: (delta) => calls.push(delta),
                move: (direction) => calls.push(direction),
                back: () => calls.push('back')
            };
            """)
        let staleRevision = LensBridge.PublishedState(instance: "current", revision: 3, screen: "offers", active: "buy", actions: [])
        let staleInstance = LensBridge.PublishedState(instance: "old", revision: 4, screen: "offers", active: "buy", actions: [])
        bridge.control("select", displayed: staleRevision)
        bridge.control("select", displayed: staleInstance)
        let count = try await webView.evaluateJavaScript("calls.length") as? Int
        XCTAssertEqual(count, 0, "Old display callbacks must never buy or navigate on a newer screen")

        let current = LensBridge.PublishedState(instance: "current", revision: 4, screen: "offers", active: "details", actions: [])
        bridge.control("select", displayed: current)
        bridge.control("up", displayed: current)
        let calls = try await webView.evaluateJavaScript("calls") as? [String]
        XCTAssertEqual(calls, ["details", "up"])
        bridge.control("next", displayed: staleRevision)
        let moved = try await webView.evaluateJavaScript("calls.at(-1)") as? Int
        XCTAssertEqual(moved, 1, "Focus can advance on the same screen while a display image is in flight")
        let oldScreen = LensBridge.PublishedState(instance: "current", revision: 3, screen: "grocery", active: "buy", actions: [])
        bridge.control("back", displayed: oldScreen)
        bridge.control("next", displayed: staleInstance)
        let finalCount = try await webView.evaluateJavaScript("calls.length") as? Int
        XCTAssertEqual(finalCount, 3)

    }

    @MainActor
    func testDisplayImagesUse600PixelsRegardlessOfRetinaScale() {
        let format = UIGraphicsImageRendererFormat(); format.scale = 3
        let retina = UIGraphicsImageRenderer(size: CGSize(width: 600, height: 600), format: format).image { ctx in
            UIColor.blue.setFill(); ctx.fill(CGRect(x: 0, y: 0, width: 600, height: 600))
        }
        let image = LensBridge.displayImage(retina)
        XCTAssertEqual(image.cgImage?.width, 600)
        XCTAssertEqual(image.cgImage?.height, 600)
        XCTAssertEqual(image.scale, 1)
    }

    @MainActor
    func testSlowDisplayDropsIntermediateFramesWithoutBlockingNewCapture() async throws {
        let sender = LatestFrameSender()
        var revisions: [Int] = []
        var releaseFirst: CheckedContinuation<Void, Never>?
        sender.send = { _, state in
            revisions.append(state.revision)
            if state.revision == 1 { await withCheckedContinuation { releaseFirst = $0 } }
            return true
        }
        func state(_ revision: Int) -> LensBridge.PublishedState {
            .init(instance: "test", revision: revision, screen: "offers", active: "details", actions: [])
        }
        sender.enqueue(UIImage(), state: state(1))
        for _ in 0..<100 where releaseFirst == nil { try await Task.sleep(for: .milliseconds(5)) }
        XCTAssertNotNil(releaseFirst)
        sender.enqueue(UIImage(), state: state(2))
        sender.enqueue(UIImage(), state: state(3))
        releaseFirst?.resume()
        for _ in 0..<100 where sender.delivered?.revision != 3 { try await Task.sleep(for: .milliseconds(5)) }
        XCTAssertEqual(revisions, [1, 3])
        XCTAssertEqual(sender.delivered?.revision, 3)
    }

    func testPairingCodeValidation() async {
        let model = await AppModel()
        await model.pair(code: "abc")
        let status = await model.relayStatus
        XCTAssertTrue(status.contains("6-character"))
    }

    func testConnectionRecoveryCopy() {
        XCTAssertFalse(AppModel.ConnectionState.permissionDenied.recovery.isEmpty)
        XCTAssertTrue(AppModel.ConnectionState.sessionActive.recovery.isEmpty)
    }

    func testPublishedStateDecodes() throws {
        let json = #"{"instance":"i","revision":3,"screen":"glimpse-offers","active":"buy","actions":[{"id":"buy","label":"Buy $12.00","row":90,"x":0,"variant":"pay","rect":{"x":36,"y":480,"width":260,"height":84}}]}"#
        let s = try JSONDecoder().decode(LensBridge.PublishedState.self, from: Data(json.utf8))
        XCTAssertEqual(s.actions.first?.id, "buy")
        XCTAssertEqual(s.revision, 3)
    }
}

@MainActor
private final class NavigationWaiter: NSObject, WKNavigationDelegate {
    var loaded: (() -> Void)?
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        let callback = loaded
        loaded = nil
        callback?()
    }
}
