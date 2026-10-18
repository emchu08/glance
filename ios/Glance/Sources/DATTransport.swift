import Foundation
import OSLog
import UIKit
import MWDATCore
import MWDATCamera
import MWDATDisplay
import MWDATInputs

/// A single real device session owns both the Display and Camera capabilities.
@MainActor
final class DATTransport: GlassesTransport {
    let name = "Meta Ray-Ban Display · DAT 1.0.1"
    var onState: ((AppModel.ConnectionState) -> Void)?
    var onCapabilities: ((DeviceCapabilities) -> Void)?
    var onFrame: ((Data, Int, Int) -> Void)?
    var onError: ((String) -> Void)?
    var onControl: (@MainActor @Sendable (String, LensBridge.PublishedState) -> Void)?

    private var configured = false
    private var session: DeviceSession?
    private var display: Display?
    private var camera: Camera?
    private var inputs: Inputs?
    private var inputTask: Task<Void, Never>?
    private var inputStateToken: AnyListenerToken?
    private var inputErrorToken: AnyListenerToken?
    private var inputWait: AsyncStream<InputsState>.Continuation?
    private var inputsReady = false
    private var deliveredState: LensBridge.PublishedState?
    private var displayReady = false
    private var registrationTask: Task<Void, Never>?
    private var sessionTask: Task<Void, Never>?
    private var errorTask: Task<Void, Never>?
    private var readinessTask: Task<Void, Never>?
    private var displayToken: AnyListenerToken?
    private var displayWait: AsyncStream<DisplayState>.Continuation?
    private var frameToken: AnyListenerToken?
    private var cameraErrorToken: AnyListenerToken?
    private var encodingFrame = false
    private var cameraFrameCount = 0
    private var cameraMeasurementStart = Date()
    private static let logger = Logger(subsystem: "com.glance.companion", category: "performance")
    private struct EncodedFrame: Sendable { let jpeg: Data; let width: Int; let height: Int }
    static let cameraFrameRate: UInt = 2
    private var lastSentDigest: Data?

    private func configure() throws {
        guard !configured else { return }
        try Wearables.configure()
        configured = true
        registrationTask = Task { [weak self] in
            for await state in Wearables.shared.registrationStateStream() {
                guard let self, !Task.isCancelled else { return }
                switch state {
                case .registered: self.onState?(.registered)
                case .registering: self.onState?(.registering)
                case .available:
                    self.disconnect()
                    self.onState?(.idle)
                case .unavailable:
                    self.disconnect()
                    self.onState?(.noMetaApp)
                }
            }
        }
    }

    func register(appID: String, clientToken: String) async throws {
        try configure()
        if Wearables.shared.registrationState == .registered {
            onState?(.registered)
            return
        }
        try await Wearables.shared.startRegistration()
    }

    func handleCallback(_ url: URL) {
        guard URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?
            .contains(where: { $0.name == "metaWearablesAction" }) == true else { return }
        Task {
            do {
                try configure()
                _ = try await Wearables.shared.handleUrl(url)
            } catch { onError?(error.localizedDescription) }
        }
    }

    private func requireSession() async throws -> DeviceSession {
        try configure()
        guard Wearables.shared.registrationState == .registered else {
            throw TransportError.message("Connect glasses and approve Glance in Meta AI first.")
        }
        if let session, session.state == .started { return session }
        guard session == nil else { throw TransportError.message("Glasses are connecting. Try again shortly.") }
        let deadline = ContinuousClock.now.advanced(by: .seconds(15))
        var selectedDevice: Device?
        while ContinuousClock.now < deadline {
            selectedDevice = Wearables.shared.devices.compactMap { Wearables.shared.deviceForIdentifier($0) }
                .first { $0.supportsDisplay() && $0.linkState == .connected && $0.compatibility() == .compatible }
            if selectedDevice != nil { break }
            try await Task.sleep(for: .milliseconds(150))
        }
        guard let device = selectedDevice else {
            onState?(.noDevice)
            throw TransportError.message("No compatible Display glasses connected. Open Meta AI, check firmware, and put on your glasses.")
        }
        let newSession = try Wearables.shared.createSession(deviceSelector: SpecificDeviceSelector(device: device.identifier))
        session = newSession
        errorTask = Task { [weak self] in
            for await error in newSession.errorStream() {
                guard let self, !Task.isCancelled else { return }
                self.onError?(error.localizedDescription)
                self.disconnect()
                self.onState?(.sessionExpired)
            }
        }
        let states = newSession.stateStream()
        do {
            try newSession.start()
            // Deadline stops the SDK session as well as the UI's wait.
            readinessTask = Task { [weak self] in
                do { try await Task.sleep(for: .seconds(15)) } catch { return }
                self?.onError?("Glasses connection timed out. Reconnect in Meta AI and try again.")
                self?.disconnect()
            }
            for await state in states {
                if state == .started {
                    readinessTask?.cancel()
                    readinessTask = nil
                    onState?(.sessionActive)
                    onCapabilities?(DeviceCapabilities(camera: true, display: false, input: false, model: device.nameOrId()))
                    sessionTask = Task { [weak self] in
                        for await next in newSession.stateStream() {
                            guard let self, !Task.isCancelled, self.session === newSession else { return }
                            if next == .stopped {
                                self.disconnect()
                                self.onState?(.sessionExpired)
                                return
                            }
                        }
                    }
                    return newSession
                }
                if state == .stopped { break }
            }
            throw TransportError.message("Glasses session ended before it connected.")
        } catch {
            disconnect()
            throw error
        }
    }

    func startDisplay() async throws {
        if displayReady, inputsReady { return }
        if displayReady, let session {
            try await startInputs(on: session)
            return
        }
        guard display == nil else { throw TransportError.message("The display is still connecting.") }
        let session = try await requireSession()
        let capability = try session.addDisplay()
        display = capability
        let (states, continuation) = AsyncStream.makeStream(of: DisplayState.self)
        displayWait = continuation
        displayToken = capability.statePublisher.listen { [weak self] state in
            continuation.yield(state)
            Task { @MainActor in
                guard let self, self.display === capability else { return }
                if state == .stopping { self.displayReady = false }
                if state == .stopped {
                    continuation.finish()
                    self.disconnect()
                    self.onState?(.sessionExpired)
                }
            }
        }
        capability.start()
        readinessTask = Task { [weak self] in
            do { try await Task.sleep(for: .seconds(15)) } catch { return }
            continuation.finish()
            self?.onError?("Display connection timed out. Check the DAT glasses app in Meta AI.")
            self?.disconnect()
        }
        for await state in states {
            if state == .started {
                readinessTask?.cancel()
                readinessTask = nil
                displayReady = true
                continuation.finish()
                displayWait = nil
                try await startInputs(on: session)
                onCapabilities?(DeviceCapabilities(camera: true, display: true, input: true, model: "Meta Ray-Ban Display"))
                return
            }
            if state == .stopped { break }
        }
        disconnect()
        throw TransportError.message("Display did not start. Reconnect and try again.")
    }

    func startCamera() async throws {
        guard camera == nil else { return }
        let session = try await requireSession()
        if try await Wearables.shared.checkPermissionStatus(.camera) != .granted {
            guard try await Wearables.shared.requestPermission(.camera) == .granted else {
                onState?(.permissionDenied)
                throw TransportError.message("Camera permission was denied in Meta AI.")
            }
        }
        // Camera and display share one Bluetooth Classic link. Recognition reads at most one frame every few
        // seconds, so 2 fps (the lowest valid rate) keeps a fresh frame while leaving the link to display updates.
        // At this rate the link affords the medium resolution, which reads labels better than low.
        guard let capability = try session.addCamera(config: StreamConfiguration(videoCodec: .raw, resolution: .medium, frameRate: Self.cameraFrameRate)) else {
            throw TransportError.message("Camera unavailable. Reconnect the glasses.")
        }
        camera = capability
        cameraFrameCount = 0; cameraMeasurementStart = Date()
        frameToken = capability.stream.videoFramePublisher.listen { [weak self] frame in
            Task { @MainActor in
                guard let self, self.camera === capability, !self.encodingFrame else { return }
                self.encodingFrame = true
                defer { self.encodingFrame = false }
                // JPEG encoding must not compete with the web view's UI thread. Drop busy frames.
                let encoded = await Task.detached(priority: .userInitiated) { () -> EncodedFrame? in
                    guard let image = frame.makeUIImage(), let jpeg = image.jpegData(compressionQuality: 0.8) else { return nil }
                    return EncodedFrame(jpeg: jpeg, width: Int(image.size.width * image.scale), height: Int(image.size.height * image.scale))
                }.value
                guard self.camera === capability, let encoded else { return }
                self.onFrame?(encoded.jpeg, encoded.width, encoded.height)
                self.cameraFrameCount += 1
                let elapsed = Date().timeIntervalSince(self.cameraMeasurementStart)
                if elapsed >= 2 {
                    Self.logger.notice("[Glance performance] camera frames/sec=\(Double(self.cameraFrameCount) / elapsed)")
                    self.cameraFrameCount = 0; self.cameraMeasurementStart = Date()
                }
            }
        }
        cameraErrorToken = capability.stream.errorPublisher.listen { [weak self] error in
            Task { @MainActor in self?.onError?(error.localizedDescription) }
        }
        capability.stream.start()
    }

    func stopCamera() {
        camera?.stop()
        camera = nil
        frameToken = nil
        cameraErrorToken = nil
    }

    private func startInputs(on session: DeviceSession) async throws {
        guard !inputsReady else { return }
        // Remove a failed activation before retrying on the same session.
        if inputs != nil { stopInputs() }
        guard let capability = try session.addInputs(configuration: InputsConfiguration(consumeBack: true)) else {
            throw TransportError.message("Glasses controls could not start. Reconnect and try again.")
        }
        inputs = capability
        let (states, continuation) = AsyncStream.makeStream(of: InputsState.self)
        inputWait = continuation
        inputStateToken = capability.statePublisher.listen { [weak self] state in
            continuation.yield(state)
            Task { @MainActor in
                guard let self, self.inputs === capability else { return }
                if state == .inactive, self.inputsReady {
                    self.inputsReady = false
                    self.onError?("Glasses controls disconnected. Tap Connect glasses to reconnect.")
                }
            }
        }
        inputErrorToken = capability.errorPublisher.listen { [weak self] error in
            continuation.finish()
            Task { @MainActor in
                guard let self, self.inputs === capability else { return }
                self.inputsReady = false
                self.onError?(error == .permissionDenied
                    ? "Enable the Inputs capability for Glance in Meta Wearables Developer Center, then try again."
                    : "Glasses controls: \(error.localizedDescription)")
            }
        }
        // The capability starts when attached. Include its current state in case it activated immediately.
        continuation.yield(capability.state)
        let timeout = Task {
            do { try await Task.sleep(for: .seconds(12)) } catch { return }
            continuation.finish()
        }
        defer { timeout.cancel(); continuation.finish(); inputWait = nil }
        for await state in states {
            if state == .active {
                inputsReady = true
                inputTask = Task { [weak self] in
                    for await event in capability.events {
                        guard let self, !Task.isCancelled, self.inputsReady,
                              let displayed = self.deliveredState else { continue }
                        if let control = Self.control(for: event) { self.onControl?(control, displayed) }
                    }
                }
                return
            }
        }
        stopInputs()
        throw TransportError.message("Glasses controls are unavailable. Enable Inputs for Glance in Meta Wearables Developer Center and check the glasses connection.")
    }

    static func control(for event: InputEvent) -> String? {
        switch event {
        case .nav(let direction, let source, _):
            if source == .captouch {
                return direction == .left || direction == .up ? "previous" : "next"
            }
            switch direction {
            case .up: return "up"
            case .down: return "down"
            case .left: return "left"
            case .right: return "right"
            }
        case .select: return "select"
        case .back: return "back"
        // These are distinct system controls, not additional confirmations or purchases.
        case .button, .capture, .drag: return nil
        @unknown default: return nil
        }
    }

    func present(lensImage: UIImage, state: LensBridge.PublishedState) async throws -> Bool {
        guard let display, displayReady, inputsReady else { return false }
        // A revision without a visible change (status refresh, focus on an unchanged screen) needs no transfer;
        // the glasses already show these pixels, so only the delivered revision moves forward.
        let digest = LensBridge.pixelDigest(lensImage)
        if let digest, digest == lastSentDigest {
            deliveredState = state
            return true
        }
        try await display.send(
            FlexBox(direction: .column, spacing: 0) {
                MWDATDisplay.Image(image: lensImage, sizePreset: .fill)
            }.padding(0)
        )
        guard self.display === display, displayReady, inputsReady else { return false }
        lastSentDigest = digest
        deliveredState = state
        return true
    }

    private func stopInputs() {
        inputWait?.finish()
        inputWait = nil
        inputTask?.cancel()
        inputTask = nil
        inputStateToken = nil
        inputErrorToken = nil
        inputsReady = false
        if inputs != nil { try? session?.removeInputs() }
        inputs = nil
        deliveredState = nil
    }

    private func disconnect() {
        stopInputs()
        displayWait?.finish()
        displayWait = nil
        readinessTask?.cancel()
        readinessTask = nil
        sessionTask?.cancel()
        sessionTask = nil
        errorTask?.cancel()
        errorTask = nil
        stopCamera()
        display?.stop()
        display = nil
        displayReady = false
        lastSentDigest = nil
        displayToken = nil
        session?.stop()
        session = nil
        onCapabilities?(DeviceCapabilities())
    }
}

enum TransportError: LocalizedError {
    case message(String)
    var errorDescription: String? { if case .message(let message) = self { message } else { nil } }
}
