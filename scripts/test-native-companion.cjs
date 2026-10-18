// Uses Playwright + installed Chrome. No live recognition or payment calls.
// NODE_PATH=/path/to/playwright/node_modules node scripts/test-native-companion.cjs
// GLANCE_TEST_URL=http://localhost:3100/lens?source=native&pair=TESTAB to run against a dev server.
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
        glance: { postMessage: () => {} },
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
    await page.goto(process.env.GLANCE_TEST_URL || 'https://glance-blue.vercel.app/lens?source=native&pair=TESTAB');
    await page.addStyleTag({ content: fs.readFileSync('src/lens/lens.css', 'utf8') });
    const lensText = () => page.evaluate(() => document.querySelector('.lens').innerText);
    const count = (text, phrase) => text.split(phrase).length - 1;

    // The companion opens on the Welcome intro, then the picker, with the glasses camera's status, never a pair code.
    await page.waitForSelector('[data-screen="welcome"]');
    await page.screenshot({ path: '/tmp/glance-welcome.png' });
    await page.locator('[data-action-id="skip"]').click();
    await page.waitForSelector('[data-screen="picker"]');
    await page.waitForFunction(() => document.querySelector('.lens').innerText.includes('Starting the glasses camera'));
    assert.ok(!/pair code/i.test(await lensText()), 'No relay pair code inside the companion');
    await page.evaluate(() => { window.frameAvailable = true; window.glanceCompanion.camera({ ready: true }); });
    await page.waitForFunction(() => document.querySelector('.lens').innerText.includes('Glasses camera live'));

    // Grocery says each thing once; the companion adds nothing to the page.
    await page.locator('[data-action-id="mode-grocery"]').click();
    await page.waitForFunction(() => document.querySelector('.lens').innerText.includes('Start scan, then hold an item up.'));
    assert.equal(await page.locator('.glance-native-activity').count(), 0, 'No injected banner');
    await page.locator('[data-action-id="scan"]').click();
    await page.waitForFunction(() => document.querySelector('.lens').innerText.includes('Scanning every 3 s'));
    let text = await lensText();
    assert.equal(count(text, 'Hold an item up'), 1, 'Instruction appears once');
    assert.ok(!/Scanning is on/.test(text), 'No repeated scanning status');
    await page.waitForFunction(() => window.nativeMessages.some(m => m.type === 'frame'));
    await page.waitForTimeout(200);
    assert.ok(recognition, 'A fresh native frame reaches recognition');
    await page.screenshot({ path: '/tmp/glance-grocery-scanning.png' });
    await recognition.fulfill({ json: { observations: [], model: 'test' } }); recognition = null;

    // Camera drops: the one instruction line says why, instead of a second message.
    await page.evaluate(() => window.glanceCompanion.camera({ ready: false }));
    await page.waitForFunction(() => document.querySelector('.lens').innerText.includes('Starting the glasses camera'));
    text = await lensText();
    assert.equal(count(text, 'Starting the glasses camera'), 1);
    assert.equal(count(text, 'Hold an item up'), 0);
    await page.evaluate(() => window.glanceCompanion.camera({ ready: true }));

    await page.locator('[data-action-id="scan"]').click();
    await page.waitForFunction(() => document.querySelector('.lens').innerText.includes('Scan paused'));
    await page.evaluate(() => window.glanceBridge.setActive('scan'));
    await page.waitForFunction(() => document.querySelector('[data-action-id="scan"]')?.classList.contains('is-focused'));
    const ring = await page.locator('[data-action-id="scan"]').evaluate(el => ({ inset: getComputedStyle(el, '::after').top, border: getComputedStyle(el, '::after').borderTopColor, fill: getComputedStyle(el).backgroundColor, rect: el.getBoundingClientRect().toJSON() }));
    assert.equal(ring.inset, '0px', 'Focus ring sits on the pill edge, inside its clip');
    assert.equal(ring.border, 'rgb(255, 255, 255)', 'Selection is a white outline');
    assert.ok(!/rgb\(255, 255, 255\)/.test(ring.fill), 'Selection is never a solid white block on the glasses');
    assert.ok(ring.rect.bottom <= 600);
    await page.screenshot({ path: '/tmp/glance-grocery-paused-focus.png' });

    // Listing search: error and empty states come from the lens itself.
    await page.locator('[data-action-id="hdr-modes"]').click();
    await page.locator('[data-action-id="mode-glimpse"]').click();
    await page.locator('[data-action-id="more"]').click();
    await page.locator('[data-action-id="m-listings"]').click();
    await page.locator('[data-action-id="search"]').click();
    await page.locator('[data-action-id="key-a"]').click();
    await page.locator('[data-action-id="key-done"]').click();
    await page.locator('[data-action-id="go"]').click();
    for (let i = 0; i < 50 && !listingRequest; i += 1) await page.waitForTimeout(100);
    assert.ok(listingRequest);
    await listingRequest.fulfill({ status: 503, json: { error: 'test unavailable' } }); listingRequest = null;
    await page.waitForFunction(() => document.querySelector('[data-action-id="retry"]'));
    await page.locator('[data-action-id="retry"]').click();
    for (let i = 0; i < 50 && !listingRequest; i += 1) await page.waitForTimeout(100);
    await listingRequest.fulfill({ contentType: 'application/x-ndjson', body: '{"done":true}\n' }); listingRequest = null;
    await page.waitForFunction(() => /No listings|No offers/.test(document.querySelector('.lens').innerText));

    await page.locator('[data-action-id="hdr-wallet"]').click();
    await page.locator('[data-action-id="w-setup"]').click();
    assert.ok(await page.evaluate(() => window.nativeMessages.some(m => m.type === 'wallet')), 'Wallet handoff opens the phone sheet');
    assert.deepEqual(errors, []);
    console.log('PASS: welcome intro then picker, no pair code, camera status in the lens, Grocery says each thing once, camera-drop message, fresh native capture, pause, visible focus ring, listing error/empty, wallet handoff, no browser errors.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
