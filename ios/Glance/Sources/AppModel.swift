import Foundation
import Observation
import UIKit

/// App-lifetime observable model: connection, relay, lens bridge, history.
@Observable
@MainActor
final class AppModel {
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
    var apiBase: URL = Config.apiBase
    var cameraSource: CameraSource = .phone
    var lastFrameAt: Date?
    var developerLog: [String] = []

    let relay: RelayClient
    let transport: GlassesTransport
    let lensBridge = LensBridge()

    init() {
        relay = RelayClient(baseURL: Config.apiBase)
        transport = GlassesTransportFactory.make()
    }

    func start() async {
        transport.onState = { [weak self] s in Task { @MainActor in self?.connection = s } }
        transport.onCapabilities = { [weak self] c in Task { @MainActor in self?.capabilities = c } }
        transport.onFrame = { [weak self] jpeg, w, h in Task { @MainActor in await self?.uploadFrame(jpeg, width: w, height: h) } }
        if let code = Keychain.read("glance.pairing.code") { pairingCode = code }
        log("started · api \(apiBase.absoluteString) · transport \(transport.name)")
    }

    func connectGlasses() async {
        connection = .registering
        do { try await transport.register(appID: Config.metaAppID, clientToken: Config.metaClientToken) }
        catch { log("registration failed: \(error.localizedDescription)") }
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

    func disconnectRelay() {
        relay.forget()
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

    func log(_ line: String) { developerLog.append("\(Date().formatted(date: .omitted, time: .standard)) \(line)"); if developerLog.count > 200 { developerLog.removeFirst() } }
}

enum CameraSource: String, CaseIterable, Identifiable { case phone = "iPhone camera", glasses = "Glasses camera", sample = "Sample media"; var id: String { rawValue } }

struct DeviceCapabilities: Equatable { var camera = false; var display = false; var input = false; var model: String = "—" }

struct HandoffLink: Identifiable, Decodable, Equatable { let id: String; let kind: String; let title: String; let url: String }

enum Config {
    static var apiBase: URL { URL(string: (Bundle.main.object(forInfoDictionaryKey: "GLANCE_API_BASE") as? String).flatMap { $0.isEmpty ? nil : $0 } ?? "http://localhost:3100")! }
    static var metaAppID: String { Bundle.main.object(forInfoDictionaryKey: "META_APP_ID") as? String ?? "" }
    static var metaClientToken: String { Bundle.main.object(forInfoDictionaryKey: "META_CLIENT_TOKEN") as? String ?? "" }
}
