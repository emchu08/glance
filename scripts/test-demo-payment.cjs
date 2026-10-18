// Buy on the glasses with Stripe's test card: scan → offers → Buy → Done!. The sample source has no paired
// phone, so Done! says so instead of opening a tab (paired lenses send the listing; see scripts/test-buy-phone-link.cjs).
// The payment endpoint is intercepted here (a real test charge needs the server's Stripe test key).
// BASE_URL=http://localhost:3100 NODE_PATH=/path/to/playwright/node_modules node scripts/test-demo-payment.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const base = process.env.BASE_URL || 'http://localhost:3100';

(async () => {
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 600, height: 600 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const payments = [];
    const handoffs = [];
    await page.route('**/api/payments/demo', async route => {
      const body = route.request().postDataJSON();
      payments.push(body);
      await new Promise(r => setTimeout(r, 300));
      await route.fulfill({ json: { status: 'succeeded', id: 'pi_test_123', reference: 'TEST1234', totalCents: body.priceCents, card: 'Visa •• 4242', createdAt: new Date().toISOString() } });
    });
    await page.route('**/api/relay/handoff', route => { handoffs.push(route.request().postDataJSON()); return route.fulfill({ json: { id: 'h', status: 'sent' } }); });

    await page.goto(`${base}/lens?source=sample`);
    await page.locator('[data-action-id="mode-glimpse"]').click();
    await page.locator('[data-action-id="scan"]').click();
    await page.locator('[data-action-id="see-offers"]').click();
    const buy = page.locator('[data-action-id="buy"]');
    await buy.waitFor();
    const label = await buy.innerText();
    assert.match(label, /^Buy \$\d/, 'Buy shows the price');
    assert.ok((await page.locator('.lens').innerText()).includes('Stripe test'), 'The card says it pays here with the test card');
    await buy.click();
    await page.waitForFunction(() => document.querySelector('.lens').innerText.includes('Done!'));
    const text = await page.locator('.lens').innerText();
    assert.ok(text.includes('Visa •• 4242'), 'Done screen names the test card');
    assert.equal(payments.length, 1, 'One payment per press');
    assert.equal(`Buy $${(payments[0].priceCents / 100).toFixed(2)}`, label.trim(), 'Charged exactly the price on the button');
    assert.ok(text.includes('No phone paired'), 'Done! says the link had no phone to go to');
    assert.equal(handoffs.length, 0, 'Nothing was queued without a paired phone');
    await page.locator('[data-action-id="pay-done"]').click();
    await page.waitForSelector('[data-screen="glimpse"]');
    assert.deepEqual(errors, []);
    console.log(`PASS: ${label.trim()} paid on the glasses with the test card, one payment, no phone paired so no link queued, Done returns to Glimpse, no browser errors.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
