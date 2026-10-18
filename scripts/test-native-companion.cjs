// Uses Playwright + installed Chrome. No live recognition or payment calls.
// NODE_PATH=/path/to/playwright/node_modules node scripts/test-native-companion.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 600, height: 600 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    let recognition = null;
    let listingRequest = null;
    await page.route('**/api/glance/listings', route => { listingRequest = route; });
    await page.route('**/api/glance/grocery', route => { recognition = route; });
    await page.route('**/api/glance/grocery/item', route => route.fulfill({ json: { insight: null } }));
    await page.addInitScript(() => {
      window.nativeMessages = [];
      window.frameAvailable = false;
      window.webkit = { messageHandlers: {
        glance: { postMessage: m => { if (m.type === 'activity') window.activity = m; } },
        glanceNative: { postMessage: async m => {
          window.nativeMessages.push(m);
          if (m.type === 'frame') {
            if (!window.frameAvailable) throw Error('Camera not ready. Connect your glasses on the phone.');
            return { image: 'data:image/jpeg;base64,TEST', width: 360, height: 640, capturedAt: Date.now() };
          }
          return true;
        } },
      } };
    });
    await page.addInitScript({ path: 'ios/Glance/Resources/native-lens.js' });
    await page.goto(process.env.GLANCE_TEST_URL || 'https://glance-blue.vercel.app/lens?source=native');
    await page.addStyleTag({ content: fs.readFileSync('src/lens/lens.css', 'utf8') });
    await page.locator('[data-action-id="skip"]').click();
    await page.locator('[data-action-id="mode-grocery"]').click();
    await page.waitForFunction(() => document.querySelector('.glance-native-activity')?.innerText.includes('Scanning paused'));
    await page.locator('[data-action-id="scan"]').click();
    await page.waitForFunction(() => document.querySelector('.glance-native-activity')?.innerText.includes('Camera not ready'));
    await page.screenshot({ path: '/tmp/glance-grocery-camera-off.png' });
    await page.evaluate(() => { window.frameAvailable = true; window.glanceCompanion.camera({ ready: true, message: 'Camera connected' }); });
    await page.waitForFunction(() => document.querySelector('.glance-native-activity')?.innerText.includes('Identifying your item'));
    assert.ok(recognition, 'A fresh native frame reaches recognition');
    await page.screenshot({ path: '/tmp/glance-grocery-scanning.png' });
    await recognition.fulfill({ json: { observations: [], model: 'test' } }); recognition = null;
    await page.waitForFunction(() => document.querySelector('.glance-native-activity')?.innerText.includes('No item recognized yet'));
    await page.locator('[data-action-id="scan"]').click();
    await page.waitForFunction(() => document.querySelector('.glance-native-activity')?.innerText.includes('Scanning paused'));
    await page.evaluate(() => window.glanceBridge.setActive('scan'));
    await page.waitForFunction(() => document.querySelector('[data-action-id="scan"]')?.classList.contains('is-focused'));
    const ring = await page.locator('[data-action-id="scan"]').evaluate(el => ({ inset: getComputedStyle(el, '::after').top, outline: getComputedStyle(el).outlineWidth, rect: el.getBoundingClientRect().toJSON() }));
    assert.equal(ring.inset, '3px', 'Focus ring stays inside clipped pills');
    assert.equal(ring.outline, '3px');
    assert.ok(ring.rect.bottom <= 600);
    await page.screenshot({ path: '/tmp/glance-grocery-paused-focus.png' });
    // Scan failures are visible, then disappear when leaving the mode.
    await page.locator('[data-action-id="scan"]').click();
    await page.waitForFunction(() => window.activity.title === 'Identifying your item…');
    await recognition.fulfill({ status: 503, json: { error: 'test unavailable' } }); recognition = null;
    await page.waitForFunction(() => window.activity.title === 'Couldn’t finish the scan');
    await page.locator('[data-action-id="scan"]').click();
    await page.locator('[data-action-id="hdr-modes"]').click();
    await page.locator('[data-action-id="mode-glimpse"]').click();
    await page.locator('[data-action-id="more"]').click();
    await page.locator('[data-action-id="m-listings"]').click();
    await page.waitForFunction(() => window.activity.title === 'Search by name');
    await page.locator('[data-action-id="search"]').click();
    await page.locator('[data-action-id="key-a"]').click();
    await page.locator('[data-action-id="key-done"]').click();
    await page.locator('[data-action-id="go"]').click();
    await page.waitForFunction(() => window.activity.title === 'Searching listings…');
    assert.ok(listingRequest);
    await listingRequest.fulfill({ status: 503, json: { error: 'test unavailable' } }); listingRequest = null;
    await page.waitForFunction(() => window.activity.title === 'Couldn’t load listings');
    await page.locator('[data-action-id="retry"]').click();
    await page.waitForFunction(() => window.activity.title === 'Searching listings…');
    await listingRequest.fulfill({ contentType: 'application/x-ndjson', body: '{"done":true}\n' }); listingRequest = null;
    await page.waitForFunction(() => window.activity.title === 'No listings found');
    await page.locator('[data-action-id="hdr-wallet"]').click();
    await page.locator('[data-action-id="w-setup"]').click();
    assert.ok(await page.evaluate(() => window.nativeMessages.some(m => m.type === 'wallet')), 'Wallet handoff opens the phone sheet');
    // Late request status must not overwrite the wallet or another mode.
    await page.waitForFunction(() => window.activity.title === 'Your wallet' || window.glanceBridge.getState().screen === 'handoff');
    assert.deepEqual(errors, []);
    console.log('PASS: camera unavailable, fresh native capture, recognition pending/empty/error, pause, visible focus ring, listing idle/search/error/empty, wallet handoff, no browser errors.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
