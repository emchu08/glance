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
    var onFrame: ((Data, Int, Int) -> Void)? { get set }
    func register(appID: String, clientToken: String) async throws
    func handleCallback(_ url: URL)
    func startCamera() async throws
    func stopCamera()
    /// Push a rendered 600×600 lens image to the glasses display when supported.
    func present(lensImage: UIImage) async
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
    func present(lensImage: UIImage) async { /* no display on a phone transport */ }

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

#if canImport(MWDATCore)
import MWDATCore
#if canImport(MWDATCamera)
import MWDATCamera
#endif
#if canImport(MWDATDisplay)
import MWDATDisplay
#endif
#if canImport(MWDATInputs)
import MWDATInputs
#endif

/// Official DAT adapter. Method names below follow the documented toolkit surface as of the pinned release;
/// verify against the resolved package and adjust in one place. Registration/consent is Meta's documented flow.
@MainActor
final class DATTransport: GlassesTransport {
    let name = "Meta Wearables DAT"
    var onState: ((AppModel.ConnectionState) -> Void)?
    var onCapabilities: ((DeviceCapabilities) -> Void)?
    var onFrame: ((Data, Int, Int) -> Void)?

    func register(appID: String, clientToken: String) async throws {
        guard !appID.isEmpty else { onState?(.canceled); return }
        // TODO(DAT): Wearables.configure(appID:clientToken:) and the registration/consent request go here.
        // Map SDK outcomes to ConnectionState: .noMetaApp / .noDevice / .permissionDenied / .registered.
        onState?(.registered)
    }
    func handleCallback(_ url: URL) {
        // TODO(DAT): forward the glance:// callback to the SDK's URL handler and refresh capabilities.
        onState?(.sessionActive)
    }
    func startCamera() async throws {
        // TODO(DAT): open the camera stream from the device session; forward frames (JPEG ≤768px) to onFrame.
    }
    func stopCamera() {}
    func present(lensImage: UIImage) async {
        // TODO(DAT): when the display capability is available, push the image to the right-lens display.
        // Event-driven, coalesced: only the latest revision is sent; no 60 fps snapshot loop.
    }
}
#endif
