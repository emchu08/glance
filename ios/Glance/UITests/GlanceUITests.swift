import XCTest

final class GlanceUITests: XCTestCase {
    @MainActor
    func testLaunchConnectsAndBothModesAndWalletRemainAccessible() {
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.buttons["phone-wallet"].waitForExistence(timeout: 10))
        // Launch connects by itself and the Glance screens are always shown, never the camera picture.
        XCTAssertTrue(app.webViews.firstMatch.waitForExistence(timeout: 20))
        XCTAssertFalse(app.descendants(matching: .any)["camera-card"].exists)
        let mode = app.segmentedControls["glasses-mode"]
        XCTAssertTrue(mode.waitForExistence(timeout: 10))
        XCTAssertEqual(app.tabBars.count, 0)

        mode.buttons["Glasses web app"].tap()
        let runtime = app.webViews.firstMatch
        XCTAssertTrue(runtime.waitForExistence(timeout: 20))
        XCTAssertGreaterThan(runtime.frame.width, 300)
        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = "Glance web app mode"
        screenshot.lifetime = .keepAlways
        add(screenshot)
        XCTAssertTrue(app.buttons["copy-glasses-url"].waitForExistence(timeout: 10))
        mode.buttons["Same as phone"].tap()

        app.buttons["phone-wallet"].tap()
        XCTAssertTrue(app.buttons["wallet-done"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.webViews.textFields.firstMatch.waitForExistence(timeout: 25), "Wallet must load the sign-in/card setup page, not just open an empty sheet")
        let walletShot = XCTAttachment(screenshot: app.screenshot())
        walletShot.name = "Glance wallet setup"; walletShot.lifetime = .keepAlways; add(walletShot)
        app.buttons["wallet-done"].tap()
        XCTAssertTrue(app.buttons["phone-wallet"].waitForExistence(timeout: 10))
    }
}
