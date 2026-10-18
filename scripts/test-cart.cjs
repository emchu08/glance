// Adding really adds: Grocery's held-item Add, Grocery's online listings, and Glimpse's cart, in the real lens.
// BASE_URL=http://localhost:3100 NODE_PATH=/path/to/playwright/node_modules node scripts/test-cart.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const base = process.env.BASE_URL || 'http://localhost:3100';

(async () => {
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 600, height: 600 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/api/glance/listings', route => route.fulfill({ contentType: 'application/x-ndjson', body: JSON.stringify({ type: 'done', offers: [{ id: 'https://shop.example/water', name: 'Sparkling water 12 pk', retailer: 'Shop', url: 'https://shop.example/water', imageUrl: null, priceCents: 599, match: 'exact', kind: 'external_link', origin: 'live' }] }) + '\n' }));
    const lines = () => page.locator('[data-action-id^="line-"]').count();
    const text = () => page.locator('.lens').innerText();

    // Grocery: live scan until an item is held, then Add on its card.
    await page.goto(`${base}/lens?source=sample`);
    await page.locator('[data-action-id="mode-grocery"]').click();
    await page.locator('[data-action-id="scan"]').click();
    await page.waitForSelector('[data-screen="grocery-item"]', { timeout: 60000 });
    const linesBefore = await page.evaluate(() => window.glanceBridge.getState().actions.filter(a => a.id.startsWith('line-')).length);
    const name = (await page.locator('[data-screen="grocery-item"] p').first().innerText()).trim();
    await page.locator('[data-action-id="add"]').click();
    await page.waitForSelector('[data-screen="grocery"]');
    assert.ok((await text()).includes(name), `${name} is in the cart`);
    assert.ok(await lines() > linesBefore, 'The cart gained a line');
    await page.waitForTimeout(1500);
    assert.equal(await page.evaluate(() => document.querySelector('.lens').dataset.screen), 'grocery', 'The item card does not pop straight back up');

    // Grocery: an online listing goes into the grocery cart at its price.
    await page.locator('[data-action-id="scan"]').click(); // pause scanning
    await page.locator('[data-action-id="hdr-search"]').click();
    await page.locator('[data-action-id="cart-add"]').waitFor();
    assert.equal((await page.locator('[data-action-id="cart-add"]').innerText()).trim(), 'Add to cart');
    await page.locator('[data-action-id="cart-add"]').click();
    await page.waitForFunction(() => document.querySelector('[data-action-id="cart-add"]')?.innerText.includes('In cart'));
    await page.locator('[data-action-id="hdr-back"]').click();
    await page.waitForSelector('[data-screen="grocery"]');
    assert.ok((await text()).includes('Sparkling water 12 pk'), 'The listing is a grocery cart line');
    assert.ok((await text()).includes('$5.99'));

    // Glimpse: Add to cart shows in the cart.
    await page.locator('[data-action-id="hdr-modes"]').click();
    await page.locator('[data-action-id="mode-glimpse"]').click();
    await page.locator('[data-action-id="scan"]').click();
    await page.locator('[data-action-id="see-offers"]').click();
    await page.locator('[data-action-id="cart-add"]').waitFor();
    await page.locator('[data-action-id="cart-add"]').click();
    await page.waitForFunction(() => document.querySelector('[data-action-id="hdr-cart"]')?.innerText.trim() === '1');
    await page.locator('[data-action-id="hdr-cart"]').click();
    await page.waitForSelector('[data-action-id^="saved-"]');
    assert.deepEqual(errors, []);
    console.log(`PASS: Grocery Add put ${name} in the cart with no immediate pop-up, an online listing joined the grocery cart at $5.99, Glimpse Add to cart filled the cart, no browser errors.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
