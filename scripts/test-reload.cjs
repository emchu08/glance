// The shopping list starts empty after a reload; saved items carry over.
// BASE_URL=http://localhost:3217 NODE_PATH=/path/to/playwright/node_modules node scripts/test-reload.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 600, height: 600 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const base = process.env.BASE_URL || 'https://glance-blue.vercel.app';
    await page.goto(`${base}/lens?source=sample`);
    await page.waitForSelector('[data-screen="picker"]');
    const offer = { id: 'o1', name: 'Gray tote', retailer: 'Shop', url: 'https://example.com/tote', imageUrl: null, priceCents: 1200, match: 'exact', kind: 'external_link', origin: 'sample', savedAt: 1, candidateLabel: 'tote' };
    await page.evaluate(o => localStorage.setItem('glance.v1', JSON.stringify({ v: 1, saved: [o], recipes: [], list: [{ key: 'milk', name: 'Milk', amounts: [], recipes: [], done: false }] })), offer);
    await page.reload();
    await page.waitForSelector('[data-screen="picker"]');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('glance.v1') || '{}').list?.length === 0);
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('glance.v1')));
    assert.equal(stored.list.length, 0, 'the shopping list is cleared');
    assert.equal(stored.saved.length, 1, 'saved items stay');
    assert.deepEqual(errors, []);
    console.log('PASS: the shopping list starts empty after a reload, saved items stay, no browser errors.');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
