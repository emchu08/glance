import Foundation

/// Scoped relay client: pairing exchange, demand-aware frame upload (≤768px), handoff pickup.
/// The phone credential lives in Keychain; it is never a pairing code alone.
actor RelayClient {
    struct UploadResult: Decodable { let ok: Bool; let demand: Bool; let handoffs: [HandoffLink] }
    private let baseURL: URL
    private var code: String?
    private var token: String?

    init(baseURL: URL) { self.baseURL = baseURL; self.code = Keychain.read("glance.pairing.code"); self.token = Keychain.read("glance.pairing.token") }

    func join(code: String) async throws {
        var req = URLRequest(url: baseURL.appending(path: "/api/relay/pair"))
        req.httpMethod = "POST"; req.setValue("application/json", forHTTPHeaderField: "content-type")
        req.httpBody = try JSONSerialization.data(withJSONObject: ["role": "phone", "code": code])
        let (data, res) = try await URLSession.shared.data(for: req)
        guard (res as? HTTPURLResponse)?.statusCode == 200, let obj = try JSONSerialization.jsonObject(with: data) as? [String: Any], let t = obj["token"] as? String else { throw URLError(.badServerResponse) }
        self.code = code; self.token = t
        Keychain.write("glance.pairing.token", t)
    }

    func forget() { code = nil; token = nil; Keychain.delete("glance.pairing.token") }

    func upload(frame jpeg: Data, width: Int, height: Int) async throws -> UploadResult {
        guard let code, let token else { throw URLError(.userAuthenticationRequired) }
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
