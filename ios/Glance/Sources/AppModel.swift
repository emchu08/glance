import Foundation
import Observation
import UIKit
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
    var pairingCode: String = ""
    var relayStatus: String = "Not paired"
    var history: [HandoffLink] = []
    let apiBase: URL = Config.apiBase
    var cameraSource: CameraSource = .glasses
    var lastFrameAt: Date?
    var developerLog: [String] = []
    var errorMessage: String?
    var displayConnecting = false
    var cameraStarting = false
    var launchStatus = "Ready for your glasses."
    var showWallet = false
    var isLaunching = false
    private var uploading = false
    private var lastUpload = Date.distantPast
    private var cameraHealth: Task<Void, Never>?
    private var wantsLaunch = false
    private var continuingLaunch = false
    private var registrationDeadline: Task<Void, Never>?
    private var started = false
    private var joiningCode: String?

    let relay: RelayClient
    let transport: GlassesTransport
    let lensBridge = LensBridge()

    init() {
        relay = RelayClient(baseURL: Config.apiBase)
        transport = GlassesTransportFactory.make()
    }

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
                self.reportError("Registration was canceled. Tap Connect glasses to try again.")
            }
            if state == .sessionExpired || state == .idle { self.lensBridge.clearCamera() }
            if state == .sessionExpired { self.reportError("Glasses disconnected. Tap Connect glasses to reconnect.") }
        }
        transport.onCapabilities = { [weak self] c in Task { @MainActor in self?.capabilities = c; self?.log("Capabilities: camera=\(c.camera), display=\(c.display), controls=\(c.input)") } }
        transport.onFrame = { [weak self] jpeg, w, h in
            guard let self else { return }
            self.lensBridge.receiveFrame(jpeg, width: w, height: h)
            // Relay remains available for link handoffs. Its throttle never gates local capture or UI.
            guard !self.uploading, Date().timeIntervalSince(self.lastUpload) >= 1 else { return }
            self.uploading = true
            self.lastUpload = Date()
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
            guard let self else { return false }
            do { return try await self.transport.present(lensImage: image, state: state) }
            catch { self.reportError(error.localizedDescription); return false }
        }
        lensBridge.onPairingCode = { [weak self] code in
            guard let self, code != self.pairingCode, self.joiningCode == nil else { return }
            self.joiningCode = code
            Task {
                await self.pair(code: code)
                self.joiningCode = nil
            }
        }
        if let code = Keychain.read("glance.pairing.code") { pairingCode = code }
        log("started · api \(apiBase.absoluteString) · transport \(transport.name)")
    }

    func openGlance() async {
        guard !isLaunching else { return }
        await start()
        errorMessage = nil
        isLaunching = true
        wantsLaunch = true
        registrationDeadline?.cancel()
        registrationDeadline = Task { [weak self] in
            do { try await Task.sleep(for: .seconds(90)) } catch { return }
            self?.reportError("Registration timed out. Return from Meta AI and tap Connect glasses to try again.")
        }
        launchStatus = "Approve Glance in Meta AI when prompted."
        log("Connect glasses tapped; starting current lens")
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
            launchStatus = "Loading the current Glance…"
            try await lensBridge.waitUntilReady()
            guard wantsLaunch else { return }
            launchStatus = "Connecting your glasses…"
            try await transport.startDisplay()
            guard wantsLaunch else { return }
            launchStatus = "Allow camera access in Meta AI when prompted."
            try await transport.startCamera()
            guard wantsLaunch else { return }
            lensBridge.refresh()
            launchStatus = "Glance is open on your glasses."
            isLaunching = false
            wantsLaunch = false
        } catch { reportError(error.localizedDescription) }
    }

    func reportError(_ message: String) {
        registrationDeadline?.cancel()
        errorMessage = message
        isLaunching = false
        wantsLaunch = false
        launchStatus = "Ready to try again."
        log(message)
    }

    func handleCallback(_ url: URL) {
        guard url.scheme == "glance" else { return }
        transport.handleCallback(url)
        log("callback \(url.host ?? "")")
    }

    func pair(code: String) async {
        let normalized = code.uppercased().trimmingCharacters(in: .whitespaces)
        guard normalized.count == 6 else { relayStatus = "Enter the 6-character code shown in the lens"; return }
        do {
            try await relay.join(code: normalized)
            pairingCode = normalized
            Keychain.write("glance.pairing.code", normalized)
            relayStatus = "Paired · waiting for camera"
            log("paired \(normalized)")
        } catch { relayStatus = "Pairing failed: \(error.localizedDescription)" }
    }

    func disconnectRelay() async {
        await relay.forget()
        Keychain.delete("glance.pairing.code")
        pairingCode = ""
        relayStatus = "Not paired"
    }

    func uploadFrame(_ jpeg: Data, width: Int, height: Int) async {
        guard !pairingCode.isEmpty else { return }
        do {
            let result = try await relay.upload(frame: jpeg, width: width, height: height)
            lastFrameAt = Date()
            relayStatus = result.demand ? "Streaming · lens is scanning" : "Connected · idle"
            for link in result.handoffs where !history.contains(where: { $0.id == link.id }) { history.insert(link, at: 0) }
        } catch { relayStatus = "Upload failed: \(error.localizedDescription)" }
    }

    func log(_ line: String) {
        Self.logger.notice("[Glance] \(line, privacy: .public)")
        developerLog.append("\(Date().formatted(date: .omitted, time: .standard)) \(line)")
        if developerLog.count > 200 { developerLog.removeFirst() }
    }
}

enum CameraSource: String, CaseIterable, Identifiable { case phone = "iPhone camera", glasses = "Glasses camera", sample = "Sample media"; var id: String { rawValue } }

struct DeviceCapabilities: Equatable { var camera = false; var display = false; var input = false; var model: String = "—" }

struct HandoffLink: Identifiable, Decodable, Equatable { let id: String; let kind: String; let title: String; let url: String }

enum Config {
    // One canonical runtime; no environment, saved setting, or local-server fallback.
    static let apiBase = URL(string: "https://glance-blue.vercel.app")!
    static let lensURL = URL(string: "https://glance-blue.vercel.app/lens?source=native&companion=3")!
    static func allowsLensNavigation(_ url: URL) -> Bool {
        url.scheme == "https" && url.host == apiBase.host && url.port == nil && url.path == "/lens"
            && url.user == nil && url.password == nil
    }
    static var metaAppID: String { Bundle.main.object(forInfoDictionaryKey: "META_APP_ID") as? String ?? "" }
    static var metaClientToken: String { Bundle.main.object(forInfoDictionaryKey: "META_CLIENT_TOKEN") as? String ?? "" }
}
