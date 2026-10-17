import XCTest
@testable import Glance

final class GlanceTests: XCTestCase {
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
