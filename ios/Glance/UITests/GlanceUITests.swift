import XCTest

final class GlanceUITests: XCTestCase {
    @MainActor
    func testGlanceSitsAboveTheCameraAndWalletRemainsAccessible() {
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.buttons["phone-wallet"].waitForExistence(timeout: 10))
        // No switch: the Glance screens and the glasses camera are both on the page, one above the other.
        XCTAssertFalse(app.segmentedControls["phone-view"].exists)
        XCTAssertFalse(app.segmentedControls["glasses-mode"].exists)
        XCTAssertEqual(app.tabBars.count, 0)

        let camera = app.descendants(matching: .any)["camera-preview"]
        XCTAssertTrue(camera.waitForExistence(timeout: 10))
        let runtime = app.webViews.firstMatch
        XCTAssertTrue(runtime.waitForExistence(timeout: 20))
        XCTAssertGreaterThanOrEqual(camera.frame.minY, runtime.frame.maxY - 1, "The camera sits below the Glance screens, not on top of them")
        XCTAssertEqual(camera.frame.minX, runtime.frame.minX, accuracy: 2, "One column")
        XCTAssertEqual(camera.frame.width, runtime.frame.width, accuracy: 2, "Both at full width in portrait")

        // Tapping the Glance screens drives them (the glasses show the same screens).
        let glimpse = runtime.buttons["Glimpse"]
        if glimpse.waitForExistence(timeout: 20) {
            glimpse.tap()
            XCTAssertTrue(runtime.buttons["Back"].waitForExistence(timeout: 10), "A tap on the phone opens the mode")
        }

        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = "Glance above the camera"
        screenshot.lifetime = .keepAlways
        add(screenshot)

        app.buttons["phone-wallet"].tap()
        XCTAssertTrue(app.buttons["wallet-done"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.webViews.textFields.firstMatch.waitForExistence(timeout: 25), "Wallet must load the sign-in/card setup page, not just open an empty sheet")
        let walletShot = XCTAttachment(screenshot: app.screenshot())
        walletShot.name = "Glance wallet setup"; walletShot.lifetime = .keepAlways; add(walletShot)
        app.buttons["wallet-done"].tap()
        XCTAssertTrue(app.buttons["phone-wallet"].waitForExistence(timeout: 10))
    }
}
