import XCTest

final class GlanceUITests: XCTestCase {
    @MainActor
    func testLivePhonePreviewAndWalletRemainAccessible() {
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.buttons["phone-wallet"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["open-glance"].isHittable)
        let runtime = app.webViews.firstMatch
        XCTAssertTrue(runtime.exists)
        XCTAssertEqual(app.tabBars.count, 0)
        XCTAssertGreaterThan(runtime.frame.width, 300)
        XCTAssertTrue(runtime.isHittable)
        // Loading must complete; this catches bundled integration/script and viewport failures.
        let skip = app.webViews.buttons["Skip"]
        if skip.waitForExistence(timeout: 20) { skip.tap() }
        let grocery = app.webViews.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Grocery")).firstMatch
        XCTAssertTrue(grocery.waitForExistence(timeout: 10))
        grocery.tap()
        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = "Glance live phone preview"
        screenshot.lifetime = .keepAlways
        add(screenshot)
        app.buttons["phone-wallet"].tap()
        XCTAssertTrue(app.buttons["wallet-done"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.webViews.textFields.firstMatch.waitForExistence(timeout: 25), "Wallet must load the sign-in/card setup page, not just open an empty sheet")
        let walletShot = XCTAttachment(screenshot: app.screenshot())
        walletShot.name = "Glance wallet setup"; walletShot.lifetime = .keepAlways; add(walletShot)
        app.buttons["wallet-done"].tap()
        XCTAssertTrue(app.buttons["phone-wallet"].waitForExistence(timeout: 10))
        XCTAssertTrue(runtime.exists, "Closing Wallet returns to the original live runtime")
    }
}
