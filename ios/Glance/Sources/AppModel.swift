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

    var connection: ConnectionState = .idle
    var capabilities = DeviceCapabilities()
    var relayStatus: String = "Connecting…"
    var history: [HandoffLink] = []
    let apiBase: URL = Config.apiBase
    var lastFrameAt: Date?
    var developerLog: [String] = []
    var errorMessage: String?
    var launchStatus = "Connecting to your glasses…"
    var showWallet = false
    var isLaunching = false
    /// The camera is connected; it streams from launch and stays on.
    var cameraReady = false
    private var cameraOn = false
    /// What the glasses camera is doing until it delivers frames ("waiting for the glasses", "paused"…).
    var cameraStatus = ""
    /// The newest glasses camera frame, for the phone's camera tile (at most 15 a second).
    var cameraPreview: UIImage?
    private var lastPreview = Date.distantPast
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

    init(transport: GlassesTransport? = nil) {
        relay = RelayClient(baseURL: Config.apiBase, code: Config.relayCode)
        self.transport = transport ?? GlassesTransportFactory.make()
    }

    /// On and has sent a picture: a slow camera still counts (its last picture stays up).
    var cameraLive: Bool { cameraOn && lastFrameAt != nil }

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
            if state == .sessionExpired || state == .idle {
                self.lensBridge.clearCamera(); self.lastFrameAt = nil
                self.cameraReady = false; self.cameraOn = false
            }
            if state == .sessionExpired { self.reportError("Glasses disconnected. Tap Reconnect.") }
        }
        transport.onCapabilities = { [weak self] c in Task { @MainActor in self?.capabilities = c; self?.log("Capabilities: camera=\(c.camera), display=\(c.display), controls=\(c.input)") } }
        transport.onCameraStatus = { [weak self] status in
            guard let self, status != self.cameraStatus else { return }
            self.cameraStatus = status
            self.log("Camera: \(status)")
        }
        transport.onFrame = { [weak self] jpeg, w, h in
            guard let self else { return }
            let now = Date()
            self.lastFrameAt = now
            self.lensBridge.receiveFrame(jpeg, width: w, height: h)
            if now.timeIntervalSince(self.lastPreview) >= 1.0 / 15 {
                self.lastPreview = now
                self.cameraPreview = UIImage(data: jpeg)
            }
            // The relay carries frames once a second; its reply brings links sent from the glasses.
            guard !self.uploading, now.timeIntervalSince(self.lastUpload) >= 1 else { return }
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
        lensBridge.onCameraDemand = { [weak self] in self?.cameraDemanded() }
        transport.onError = { [weak self] message in self?.reportError(message) }
        transport.onControl = { [weak self] control, state in self?.lensBridge.control(control, displayed: state) }
        lensBridge.onError = { [weak self] message in self?.reportError(message) }
        lensBridge.onSnapshot = { [weak self] image, state in
            guard let self else { return false }
            do { return try await self.transport.present(lensImage: image, state: state) }
            catch { self.reportError(error.localizedDescription); return false }
        }
        relayWatch = Task { [weak self] in
            while !Task.isCancelled {
                await self?.refreshRelay()
                try? await Task.sleep(for: .seconds(2))
            }
        }
        log("started · api \(apiBase.absoluteString) · transport \(transport.name)")
    }

    /// Connects on launch: the Glance screens first, then the camera, which stays off until a scan.
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
        log("connecting")
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
            launchStatus = "Showing Glance on your glasses…"
            try await lensBridge.waitUntilReady()
            guard wantsLaunch else { return }
            try await transport.startDisplay()
            lensBridge.refresh()
            guard wantsLaunch else { return }
            launchStatus = "Getting the glasses camera ready…"
            try await transport.startCamera()
            // On from launch and left on: turning the camera on later, next to the display, failed on the glasses.
            try await transport.resumeCamera()
            cameraOn = true
            cameraReady = true
            lensBridge.setCameraStandby(true)
            guard wantsLaunch else { return }
            lensBridge.refresh()
            registrationDeadline?.cancel()
            launchStatus = "Glance is open on your glasses."
            isLaunching = false
            wantsLaunch = false
        } catch { reportError(error.localizedDescription) }
    }

    /// A scan asked for a picture. The camera stays on, so this only turns it back on if it isn't.
    func cameraDemanded() {
        guard cameraReady, !cameraOn else { return }
        cameraOn = true
        log("camera on for a scan")
        Task { do { try await transport.resumeCamera() } catch { self.cameraOn = false; self.reportError(error.localizedDescription) } }
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

    /// Keeps the relay pairing alive (it carries links sent from the glasses to this phone).
    private func refreshRelay() async {
        do {
            if !relayJoined { try await relay.join(); relayJoined = true }
            _ = try await relay.status()
            relayStatus = "Connected to Glance"
        } catch {
            relayJoined = false
            relayStatus = "Can’t reach Glance. Check your connection."
        }
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
