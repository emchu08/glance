import XCTest

final class GlanceUITests: XCTestCase {
    @MainActor
    func testCameraAndGlanceSitSideBySideAndWalletRemainsAccessible() {
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.buttons["phone-wallet"].waitForExistence(timeout: 10))
        // No switch: the glasses camera and the Glance screens are both on screen, next to each other.
        XCTAssertFalse(app.segmentedControls["phone-view"].exists)
        XCTAssertFalse(app.segmentedControls["glasses-mode"].exists)
        XCTAssertEqual(app.tabBars.count, 0)

        let camera = app.descendants(matching: .any)["camera-preview"]
        XCTAssertTrue(camera.waitForExistence(timeout: 10))
        let runtime = app.webViews.firstMatch
        XCTAssertTrue(runtime.waitForExistence(timeout: 20))
        XCTAssertLessThanOrEqual(camera.frame.maxX, runtime.frame.minX + 1, "Camera sits to the left of the Glance screens, not on top of them")
        XCTAssertEqual(camera.frame.minY, runtime.frame.minY, accuracy: 2, "Both tiles share one row")
        XCTAssertGreaterThan(runtime.frame.width, camera.frame.width, "The Glance screens get the wider share in portrait")

        // Tapping the Glance screens drives them (the glasses show the same screens).
        let glimpse = runtime.buttons["Glimpse"]
        if glimpse.waitForExistence(timeout: 20) {
            glimpse.tap()
            XCTAssertTrue(runtime.buttons["Back"].waitForExistence(timeout: 10), "A tap on the phone opens the mode")
        }

        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = "Camera and Glance side by side"
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
