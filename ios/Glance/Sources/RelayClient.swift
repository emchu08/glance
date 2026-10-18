import Foundation

/// Scoped relay client for this phone's long-lived code: pairing, frame upload (≤ glasses
/// camera resolution), presence, and handoff pickup. The phone credential lives in Keychain.
actor RelayClient {
    struct UploadResult: Decodable { let ok: Bool; let demand: Bool; let handoffs: [HandoffLink] }
    struct Status: Decodable { let phone: Bool; let lens: Bool; let frameAgeMs: Int? }
    private let baseURL: URL
    private let code: String
    private var token: String?

    init(baseURL: URL, code: String) {
        self.baseURL = baseURL
        self.code = code
        self.token = Keychain.read("glance.relay.token")
    }

    /// Joins (creating if needed) this phone's pairing. Safe to repeat.
    func join() async throws {
        var req = URLRequest(url: baseURL.appending(path: "/api/relay/pair"))
        req.httpMethod = "POST"; req.setValue("application/json", forHTTPHeaderField: "content-type"); req.timeoutInterval = 8
        req.httpBody = try JSONSerialization.data(withJSONObject: ["role": "phone", "code": code, "claim": true])
        let (data, res) = try await URLSession.shared.data(for: req)
        guard (res as? HTTPURLResponse)?.statusCode == 200, let obj = try JSONSerialization.jsonObject(with: data) as? [String: Any], let t = obj["token"] as? String else { throw URLError(.badServerResponse) }
        token = t
        Keychain.write("glance.relay.token", t)
    }

    func status() async throws -> Status {
        var components = URLComponents(url: baseURL.appending(path: "/api/relay/status"), resolvingAgainstBaseURL: false)!
        components.queryItems = [URLQueryItem(name: "code", value: code)]
        var req = URLRequest(url: components.url!); req.timeoutInterval = 6; req.cachePolicy = .reloadIgnoringLocalCacheData
        let (data, res) = try await URLSession.shared.data(for: req)
        guard (res as? HTTPURLResponse)?.statusCode == 200 else { throw URLError(.badServerResponse) }
        return try JSONDecoder().decode(Status.self, from: data)
    }

    func upload(frame jpeg: Data, width: Int, height: Int) async throws -> UploadResult {
        guard let token else { throw URLError(.userAuthenticationRequired) }
        var req = URLRequest(url: baseURL.appending(path: "/api/relay/frame"))
        req.httpMethod = "POST"; req.setValue("application/json", forHTTPHeaderField: "content-type"); req.timeoutInterval = 8
        let body: [String: Any] = ["code": code, "token": token, "image": "data:image/jpeg;base64,\(jpeg.base64EncodedString())", "width": width, "height": height, "capturedAt": Int(Date().timeIntervalSince1970 * 1000)]
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, res) = try await URLSession.shared.data(for: req)
        guard (res as? HTTPURLResponse)?.statusCode == 200 else { throw URLError(.badServerResponse) }
        return try JSONDecoder().decode(UploadResult.self, from: data)
    }
}

enum Keychain {
    private static let group = "com.glance.companion"
    static func read(_ key: String) -> String? {
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrAccount as String: key, kSecAttrService as String: group, kSecReturnData as String: true]
        var out: AnyObject?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let d = out as? Data else { return nil }
        return String(data: d, encoding: .utf8)
    }
    static func write(_ key: String, _ value: String) {
        delete(key)
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrAccount as String: key, kSecAttrService as String: group, kSecValueData as String: Data(value.utf8), kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
        SecItemAdd(q as CFDictionary, nil)
    }
    static func delete(_ key: String) {
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrAccount as String: key, kSecAttrService as String: group]
        SecItemDelete(q as CFDictionary)
    }
}
