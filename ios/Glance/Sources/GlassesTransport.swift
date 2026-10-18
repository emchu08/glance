import Foundation
import UIKit
import AVFoundation

/// Abstraction over the Meta Wearables Device Access Toolkit (DAT). The DAT adapter compiles only when the
/// official package is resolved (`canImport(MWDATCore)`); otherwise the mock/phone transport keeps the
/// camera → relay → lens path working. Display/input adapters are isolated so missing hardware capability
/// never breaks the camera path.
@MainActor
protocol GlassesTransport: AnyObject {
    var name: String { get }
    var onState: ((AppModel.ConnectionState) -> Void)? { get set }
    var onCapabilities: ((DeviceCapabilities) -> Void)? { get set }
    var onError: ((String) -> Void)? { get set }
    var onControl: (@MainActor @Sendable (String, LensBridge.PublishedState) -> Void)? { get set }
    var onFrame: ((Data, Int, Int) -> Void)? { get set }
    func register(appID: String, clientToken: String) async throws
    func handleCallback(_ url: URL)
    func startCamera() async throws
    func stopCamera()
    /// Push a rendered 600×600 lens image to the glasses display when supported.
    func startDisplay() async throws
    func present(lensImage: UIImage, state: LensBridge.PublishedState) async throws -> Bool
}

enum GlassesTransportFactory {
    @MainActor static func make() -> GlassesTransport {
        #if canImport(MWDATCore)
        return DATTransport()
        #else
        return PhoneCameraTransport()
        #endif
    }
}

/// iPhone camera transport (development / camera-only fallback). Downscales frames to ≤768px JPEG.
@MainActor
final class PhoneCameraTransport: NSObject, GlassesTransport, AVCaptureVideoDataOutputSampleBufferDelegate {
    let name = "iPhone camera (DAT package not resolved)"
    var onState: ((AppModel.ConnectionState) -> Void)?
    var onCapabilities: ((DeviceCapabilities) -> Void)?
    var onFrame: ((Data, Int, Int) -> Void)?
    var onError: ((String) -> Void)?
    var onControl: (@MainActor @Sendable (String, LensBridge.PublishedState) -> Void)?
    private let session = AVCaptureSession()
    private var lastSent = Date.distantPast
    private let queue = DispatchQueue(label: "glance.camera")

    func register(appID: String, clientToken: String) async throws {
        // No DAT SDK: report honestly instead of pretending a registration happened.
        onState?(.noMetaApp)
        onCapabilities?(DeviceCapabilities(camera: true, display: false, input: false, model: "iPhone"))
    }
    func handleCallback(_ url: URL) {}

    func startCamera() async throws {
        let status = AVCaptureDevice.authorizationStatus(for: .video)
        if status == .notDetermined { _ = await AVCaptureDevice.requestAccess(for: .video) }
        guard AVCaptureDevice.authorizationStatus(for: .video) == .authorized else { onState?(.permissionDenied); return }
        guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back), let input = try? AVCaptureDeviceInput(device: device) else { onState?(.noDevice); return }
        session.beginConfiguration()
        session.sessionPreset = .hd1280x720
        if session.canAddInput(input) { session.addInput(input) }
        let out = AVCaptureVideoDataOutput()
        out.alwaysDiscardsLateVideoFrames = true
        out.setSampleBufferDelegate(self, queue: queue)
        if session.canAddOutput(out) { session.addOutput(out) }
        session.commitConfiguration()
        queue.async { [session] in session.startRunning() }
        onState?(.sessionActive)
    }
    func stopCamera() { queue.async { [session] in session.stopRunning() } }
    func startDisplay() async throws {}
    func present(lensImage: UIImage, state: LensBridge.PublishedState) async throws -> Bool { false }

    nonisolated func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        // Throttle to ~1 fps for the relay; the lens decides when to analyze.
        guard let px = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        let ci = CIImage(cvPixelBuffer: px)
        let scale = min(1, 768 / max(ci.extent.width, ci.extent.height))
        let scaled = ci.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
        let ctx = CIContext()
        guard let cg = ctx.createCGImage(scaled, from: scaled.extent) else { return }
        let ui = UIImage(cgImage: cg)
        guard let jpeg = ui.jpegData(compressionQuality: 0.8) else { return }
        let w = Int(scaled.extent.width), h = Int(scaled.extent.height)
        Task { @MainActor [weak self] in
            guard let self, Date().timeIntervalSince(self.lastSent) > 1.0 else { return }
            self.lastSent = Date()
            self.onFrame?(jpeg, w, h)
        }
    }
}
