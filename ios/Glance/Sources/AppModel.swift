import Foundation
import Observation
import UIKit
import WebKit
import OSLog

/// App-lifetime observable model: connection, relay, lens bridge, history.
@Observable
@MainActor
final class AppModel {
    private static let logger = Logger(subsystem: "com.glance.companion", category: "connection")
    enum ConnectionState: Equatable {
        case idle, noMetaApp, noDevice, permissionDenied, registering, registered, sessionActive, sessionExpired, outdatedSDK, canceled, reconnecting
        var label: String {
            switch self {
            case .idle: return "Not connected"
            case .noMetaApp: return "Meta AI app not installed"
            case .noDevice: return "No glasses found"
            case .permissionDenied: return "Permission denied"
            case .registering: return "Registering with Meta…"
            case .registered: return "Registered · connecting"
            case .sessionActive: return "Glasses connected"
            case .sessionExpired: return "Session expired"
            case .outdatedSDK: return "Update required"
            case .canceled: return "Registration canceled"
            case .reconnecting: return "Reconnecting…"
            }
        }
        var recovery: String {
            switch self {
            case .noMetaApp: return "Install the Meta AI app, then try again."
            case .noDevice: return "Turn on your glasses and keep them nearby."
            case .permissionDenied: return "Allow camera (and display/input on display glasses) in the Meta AI app."
            case .sessionExpired, .canceled, .reconnecting: return "Reconnect to continue. Pending orders are safe on the server."
            case .outdatedSDK: return "Update the Meta AI app or glasses firmware."
            default: return ""
            }
        }
    }

    /// Where the lens runs. Mirroring (the default) shows the phone's screens on the glasses with no
    /// setup. The glasses web app renders on the glasses themselves and needs a one-time Meta AI setup.
    enum GlassesMode: String, CaseIterable, Identifiable {
        case mirror, webApp
        var id: String { rawValue }
        var title: String { self == .webApp ? "Glasses web app" : "Same as phone" }
        var detail: String {
            self == .webApp
                ? "Runs on the glasses for smoother motion. Needs a one-time setup in Meta AI."
                : "The glasses show the same Glance screens as this phone. No setup."
        }
    }

    var connection: ConnectionState = .idle
    var capabilities = DeviceCapabilities()
    var relayStatus: String = "Connecting…"
    var history: [HandoffLink] = []
    let apiBase: URL = Config.apiBase
    var lastFrameAt: Date?
    var glassesAppOpen = false
    var developerLog: [String] = []
    var errorMessage: String?
    var launchStatus = "Connecting to your glasses…"
    var showWallet = false
    var isLaunching = false
    var mode: GlassesMode = GlassesMode(rawValue: UserDefaults.standard.string(forKey: AppModel.modeKey) ?? "") ?? .mirror
    /// v2: earlier builds defaulted to the web app, which shows nothing on the glasses until it is set up.
    private static let modeKey = "glance.glassesMode.v2"
    private var uploading = false
    private var lastUpload = Date.distantPast
    private var cameraHealth: Task<Void, Never>?
    private var relayWatch: Task<Void, Never>?
    private var wantsLaunch = false
    private var continuingLaunch = false
    private var registrationDeadline: Task<Void, Never>?
    private var started = false
    private var relayJoined = false

    let relay: RelayClient
    let transport: GlassesTransport
    let lensBridge = LensBridge()

    init() {
        relay = RelayClient(baseURL: Config.apiBase, code: Config.relayCode)
        transport = GlassesTransportFactory.make()
    }

    var cameraLive: Bool { lastFrameAt.map { Date().timeIntervalSince($0) < 2.5 } ?? false }

    func start() async {
        guard !started else { return }
        started = true
        transport.onState = { [weak self] state in
            guard let self else { return }
            let previous = self.connection
            self.connection = state
            self.log("Meta state: \(state.label)")
            if state == .registered, self.wantsLaunch {
                self.registrationDeadline?.cancel()
                Task { await self.finishOpening() }
            }
            if state == .idle, previous == .registering, self.wantsLaunch {
                self.reportError("Registration was canceled. Tap Reconnect to try again.")
            }
            if state == .sessionExpired || state == .idle { self.lensBridge.clearCamera(); self.lastFrameAt = nil }
            if state == .sessionExpired { self.reportError("Glasses disconnected. Tap Reconnect.") }
        }
        transport.onCapabilities = { [weak self] c in Task { @MainActor in self?.capabilities = c; self?.log("Capabilities: camera=\(c.camera), display=\(c.display), controls=\(c.input)") } }
        transport.onFrame = { [weak self] jpeg, w, h in
            guard let self else { return }
            let now = Date()
            self.lastFrameAt = now
            self.lensBridge.receiveFrame(jpeg, width: w, height: h)
            // The glasses web app reads frames from the relay; mirroring needs it only for link handoffs.
            let interval: TimeInterval = self.mode == .webApp ? 0.4 : 1
            guard !self.uploading, now.timeIntervalSince(self.lastUpload) >= interval else { return }
            self.uploading = true
            self.lastUpload = now
            Task { await self.uploadFrame(jpeg, width: w, height: h); self.uploading = false }
        }
        cameraHealth = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(1))
                self?.lensBridge.updateCameraStatus()
            }
        }
        lensBridge.onWallet = { [weak self] in self?.showWallet = true }
        transport.onError = { [weak self] message in self?.reportError(message) }
        transport.onControl = { [weak self] control, state in self?.lensBridge.control(control, displayed: state) }
        lensBridge.onError = { [weak self] message in self?.reportError(message) }
        lensBridge.onSnapshot = { [weak self] image, state in
            guard let self, self.mode == .mirror else { return false }
            do { return try await self.transport.present(lensImage: image, state: state) }
            catch { self.reportError(error.localizedDescription); return false }
        }
        relayWatch = Task { [weak self] in
            while !Task.isCancelled {
                await self?.refreshRelay()
                try? await Task.sleep(for: .seconds(2))
            }
        }
        log("started · api \(apiBase.absoluteString) · transport \(transport.name) · mode \(mode.rawValue)")
    }

    /// Connects on launch: the camera first, so frames flow before anything else is ready.
    func openGlance() async {
        guard !isLaunching else { return }
        await start()
        errorMessage = nil
        isLaunching = true
        wantsLaunch = true
        registrationDeadline?.cancel()
        registrationDeadline = Task { [weak self] in
            do { try await Task.sleep(for: .seconds(90)) } catch { return }
            self?.reportError("Registration timed out. Return from Meta AI and tap Reconnect.")
        }
        launchStatus = "Connecting to your glasses…"
        log("connecting (\(mode.rawValue))")
        do {
            try await transport.register(appID: Config.metaAppID, clientToken: Config.metaClientToken)
        } catch {
            connection = .canceled
            reportError(error.localizedDescription)
        }
    }

    private func finishOpening() async {
        guard wantsLaunch, !continuingLaunch else { return }
        continuingLaunch = true
        defer { continuingLaunch = false }
        do {
            // The screens reach the glasses first; the camera joins behind them and never replaces them.
            if mode == .mirror {
                launchStatus = "Showing Glance on your glasses…"
                try await lensBridge.waitUntilReady()
                guard wantsLaunch else { return }
                try await transport.startDisplay()
                lensBridge.refresh()
                guard wantsLaunch else { return }
            }
            launchStatus = "Starting the glasses camera…"
            try await transport.startCamera()
            guard wantsLaunch else { return }
            lensBridge.refresh()
            registrationDeadline?.cancel()
            launchStatus = mode == .webApp ? "Camera connected." : "Glance is open on your glasses."
            isLaunching = false
            wantsLaunch = false
        } catch { reportError(error.localizedDescription) }
    }

    func setMode(_ next: GlassesMode) {
        guard next != mode else { return }
        mode = next
        UserDefaults.standard.set(next.rawValue, forKey: AppModel.modeKey)
        log("mode → \(next.rawValue)")
        // Display and controls belong to whichever side renders the lens; start the session again.
        transport.reset()
        isLaunching = false
        wantsLaunch = false
        Task { await openGlance() }
    }

    func reportError(_ message: String) {
        registrationDeadline?.cancel()
        errorMessage = message
        isLaunching = false
        wantsLaunch = false
        launchStatus = "Not connected."
        log(message)
    }

    func handleCallback(_ url: URL) {
        guard url.scheme == "glance" else { return }
        transport.handleCallback(url)
        log("callback \(url.host ?? "")")
    }

    /// Keeps the relay pairing alive and reports whether Glance is open on the glasses.
    private func refreshRelay() async {
        do {
            if !relayJoined { try await relay.join(); relayJoined = true }
            let s = try await relay.status()
            if s.lens, !glassesAppOpen, mode == .webApp { Task { await offerGlassesSignIn() } }
            glassesAppOpen = s.lens
            relayStatus = s.lens ? "Glance is open on your glasses" : "Glance isn’t open on your glasses"
        } catch {
            relayJoined = false
            relayStatus = "Can’t reach Glance. Check your connection."
        }
    }

    /// The glasses browser keeps its own cookies. When this phone is signed in, offer the account to
    /// the paired glasses for one sign-in (the server holds the offer for two minutes).
    func offerGlassesSignIn() async {
        let cookies = await WKWebsiteDataStore.default().httpCookieStore.allCookies()
            .filter { $0.domain.hasSuffix(Config.apiBase.host ?? "") && $0.name.hasPrefix("sb-") }
        guard !cookies.isEmpty else { return }
        var req = URLRequest(url: Config.apiBase.appending(path: "/api/auth/glasses"))
        req.httpMethod = "POST"; req.timeoutInterval = 8
        req.setValue("application/json", forHTTPHeaderField: "content-type")
        for (name, value) in HTTPCookie.requestHeaderFields(with: cookies) { req.setValue(value, forHTTPHeaderField: name) }
        req.httpBody = try? JSONSerialization.data(withJSONObject: ["code": Config.relayCode])
        let ok = ((try? await URLSession.shared.data(for: req))?.1 as? HTTPURLResponse)?.statusCode == 200
        log(ok ? "offered sign-in to the glasses" : "could not offer sign-in to the glasses")
    }

    func uploadFrame(_ jpeg: Data, width: Int, height: Int) async {
        do {
            let result = try await relay.upload(frame: jpeg, width: width, height: height)
            for link in result.handoffs where !history.contains(where: { $0.id == link.id }) { history.insert(link, at: 0) }
        } catch {
            // An expired pairing is re-created on the next status check.
            relayJoined = false
        }
    }

    func log(_ line: String) {
        Self.logger.notice("[Glance] \(line, privacy: .public)")
        developerLog.append("\(Date().formatted(date: .omitted, time: .standard)) \(line)")
        if developerLog.count > 200 { developerLog.removeFirst() }
    }
}

struct DeviceCapabilities: Equatable { var camera = false; var display = false; var input = false; var model: String = "—" }

struct HandoffLink: Identifiable, Decodable, Equatable { let id: String; let kind: String; let title: String; let url: String }

enum Config {
    // One canonical runtime; no environment, saved setting, or local-server fallback.
    static let apiBase = URL(string: "https://glance-blue.vercel.app")!
    /// This phone's relay code. It never changes, so the glasses web app's URL is set up once.
    static let relayCode: String = {
        if let saved = Keychain.read("glance.relay.code"), isRelayCode(saved) { return saved }
        let code = makeRelayCode()
        Keychain.write("glance.relay.code", code)
        return code
    }()
    static var lensURL: URL { URL(string: "https://glance-blue.vercel.app/lens?source=native&companion=4&pair=\(relayCode)")! }
    /// What to enter in Meta AI → Web Apps. The same lens, rendered by the glasses themselves.
    static var glassesAppURL: URL { URL(string: "https://glance-blue.vercel.app/lens?source=native&pair=\(relayCode)")! }
    static let relayAlphabet = Array("ABCDEFGHJKMNPQRSTUVWXYZ23456789")
    static func makeRelayCode() -> String { String((0..<6).map { _ in relayAlphabet.randomElement()! }) }
    static func isRelayCode(_ s: String) -> Bool { s.count == 6 && s.allSatisfy { relayAlphabet.contains($0) } }
    static func allowsLensNavigation(_ url: URL) -> Bool {
        url.scheme == "https" && url.host == apiBase.host && url.port == nil && url.path == "/lens"
            && url.user == nil && url.password == nil
    }
    static var metaAppID: String { Bundle.main.object(forInfoDictionaryKey: "META_APP_ID") as? String ?? "" }
    static var metaClientToken: String { Bundle.main.object(forInfoDictionaryKey: "META_CLIENT_TOKEN") as? String ?? "" }
}
