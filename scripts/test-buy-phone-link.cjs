// Buy on paired glasses: scan → offers → Buy (Stripe test card) → Done!, and the listing link reaches the phone.
// A fake phone uploads camera frames and picks up links through the real relay; recognition, offers and the
// payment are intercepted (a real test charge needs the server's Stripe test key).
// BASE_URL=http://localhost:3100 node scripts/test-buy-phone-link.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const base = process.env.BASE_URL || 'http://localhost:3100';
const json = { 'content-type': 'application/json', origin: base };
const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const OFFER = { id: 'live-sweater-1', name: 'Gray crew neck sweater', retailer: 'Uniqlo', url: 'https://www.uniqlo.com/us/en/products/E000001', imageUrl: null, priceCents: 2990, match: 'exact', kind: 'external_link', origin: 'live' };

(async () => {
  // The phone pairs first, the way the companion app does; the glasses web app gets the code in its URL.
  const lens = await (await fetch(`${base}/api/relay/pair`, { method: 'POST', headers: json, body: '{}' })).json();
  const phone = await (await fetch(`${base}/api/relay/pair`, { method: 'POST', headers: json, body: JSON.stringify({ role: 'phone', code: lens.code }) })).json();
  assert.ok(phone.token, 'phone joined the pairing');
  // Like the companion app: upload a frame every 2 s and collect the links each check-in hands back.
  const links = [];
  const checkIn = async () => {
    const up = await (await fetch(`${base}/api/relay/frame`, { method: 'POST', headers: json, body: JSON.stringify({ code: lens.code, token: phone.token, image: PIXEL, width: 1, height: 1, capturedAt: Date.now() }) })).json();
    links.push(...(up.handoffs ?? []));
  };
  await checkIn();
  const heartbeat = setInterval(() => checkIn().catch(() => {}), 2000);

  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 600, height: 600 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const payments = [];
    await page.route('**/api/glance/glimpse', route => route.fulfill({ json: { model: 'test', candidates: [{ id: 'gray-sweater', label: 'Gray crew neck sweater', category: 'apparel', attributes: ['gray'], confidence: 0.95, primary: true }] } }));
    await page.route('**/api/glance/offers', route => route.fulfill({ contentType: 'application/x-ndjson', body: `${JSON.stringify({ type: 'offer', offer: OFFER })}\n${JSON.stringify({ type: 'done', offers: [OFFER] })}\n` }));
    await page.route('**/api/payments/demo', async route => {
      const body = route.request().postDataJSON();
      payments.push(body);
      await route.fulfill({ json: { status: 'succeeded', id: 'pi_test_456', reference: 'TEST4567', totalCents: body.priceCents, card: 'Visa •• 4242', createdAt: new Date().toISOString() } });
    });

    // Scan only starts once the lens's status poll (every 2.5 s) has seen the phone's camera.
    const cameraLive = page.waitForResponse(async r => r.url().includes('/api/relay/status') && (await r.json().catch(() => ({}))).frameAgeMs != null);
    await page.goto(`${base}/lens?source=native&pair=${lens.code}`);
    await page.locator('[data-action-id="mode-glimpse"]').click();
    await cameraLive;
    await page.locator('[data-action-id="scan"]').click();
    await page.locator('[data-action-id="see-offers"]').click();
    const buy = page.locator('[data-action-id="buy"]');
    await buy.waitFor();
    assert.equal((await buy.innerText()).trim(), 'Buy $29.90');
    await buy.click();
    await page.waitForFunction(() => document.querySelector('.lens').innerText.includes('Link sent to phone'), null, { timeout: 15_000 });
    const text = await page.locator('.lens').innerText();
    assert.ok(text.includes('Done!') && text.includes('Visa •• 4242'), 'Done! names the test card');
    assert.equal(payments.length, 1, 'One payment per press');
    assert.equal(payments[0].priceCents, 2990, 'Charged the listed price');

    // The phone's next check-in picks the link up from the real relay.
    await checkIn();
    const bought = links.filter(h => h.kind === 'buy');
    assert.equal(bought.length, 1, 'exactly one link for one purchase');
    assert.equal(bought[0].url, OFFER.url, 'the phone gets the listing');
    assert.equal(bought[0].title, `Bought: ${OFFER.name}`);
    assert.deepEqual(errors, []);
    console.log(`PASS: paired glasses paid $29.90 with the test card, Done! says the link was sent, and the phone picked up "${bought[0].title}" → ${bought[0].url}.`);
  } finally { clearInterval(heartbeat); await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
