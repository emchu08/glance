import XCTest

final class GlanceUITests: XCTestCase {
    @MainActor
    func testLaunchConnectsAndCameraGlanceSwitchAndWalletRemainAccessible() {
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.buttons["phone-wallet"].waitForExistence(timeout: 10))
        // One mode: the glasses show Glance. The phone shows the glasses camera, or Glance on request.
        XCTAssertFalse(app.segmentedControls["glasses-mode"].exists)
        let view = app.segmentedControls["phone-view"]
        XCTAssertTrue(view.waitForExistence(timeout: 10))
        XCTAssertEqual(app.tabBars.count, 0)
        view.buttons["Camera"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["camera-preview"].waitForExistence(timeout: 10))

        view.buttons["Glance"].tap()
        XCTAssertFalse(app.descendants(matching: .any)["camera-preview"].exists)
        let runtime = app.webViews.firstMatch
        XCTAssertTrue(runtime.waitForExistence(timeout: 20))
        XCTAssertGreaterThan(runtime.frame.width, 300)
        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = "Glance on the phone"
        screenshot.lifetime = .keepAlways
        add(screenshot)
        view.buttons["Camera"].tap()

        app.buttons["phone-wallet"].tap()
        XCTAssertTrue(app.buttons["wallet-done"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.webViews.textFields.firstMatch.waitForExistence(timeout: 25), "Wallet must load the sign-in/card setup page, not just open an empty sheet")
        let walletShot = XCTAttachment(screenshot: app.screenshot())
        walletShot.name = "Glance wallet setup"; walletShot.lifetime = .keepAlways; add(walletShot)
        app.buttons["wallet-done"].tap()
        XCTAssertTrue(app.buttons["phone-wallet"].waitForExistence(timeout: 10))
    }
}
