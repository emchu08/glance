import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined),
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const url = process.env.BASE_URL || 'http://localhost:5173';
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const button = name => page.getByRole('button', { name, exact: true });
const select = async id => { await page.locator('#catalog').selectOption(id); await button('Add to cart').waitFor(); };

try {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.locator('.loader').waitFor({ state: 'hidden' });
  await button('Enter the experience').click();
  await page.locator('.pov-ui').waitFor();
  await select('lemon');
  assert.match(await page.locator('.best-price').innerText(), /Corner Market/);
  await page.getByRole('tab', { name: 'Nutrition', exact: true }).click();
  assert.match(await page.locator('.nutrition-grid').innerText(), /22/);
  await page.locator('#preference').selectOption('sugar');
  await button('Choose alternative').click();
  await button('Add to cart').dblclick();
  assert.equal(await page.locator('.cart-count').innerText(), '1');
  await page.waitForTimeout(700);

  await button('Discover a jacket').click();
  await button('Select the jacket').click();
  await button('Next jacket').click();
  assert.match(await page.locator('.match-heading h3').innerText(), /Relaxed denim/);
  await button('Save this find').click();
  await button('None of these').click();
  assert.match(await page.locator('.no-match').innerText(), /Not quite/);

  await button('Recreate a meal').click();
  await button('Select the dish').click();
  await button('See suggested recipe').click();
  await button('See ingredients').click();
  await button('Add ingredients to my list').click();
  await button('Take my list to the aisle').click();
  await page.getByRole('button', { name: /Shopping list/ }).click();
  assert.equal(await page.locator('.list-rows label').count(), 5);
  assert.match(await page.locator('.list-rows').innerText(), /Rigatoni/);
  await button('Close panel').click();
  await select('milk');
  await page.locator('#preference').selectOption('dairy');
  await button('Choose alternative').click();
  await button('Find next item').click();
  await button('Add to cart').waitFor();
  assert.match(await page.locator('.display-heading').innerText(), /Original oat milk/);
  await button('Add to cart').click();
  await page.waitForTimeout(700);
  assert.equal(await page.locator('.cart-total').innerText(), '$8.55');
  await page.getByRole('button', { name: /Open cart/ }).click();
  await button('Remove one Lower-sugar energy drink').click();
  await button('Finish shopping').click();
  assert.match(await page.locator('.summary-total').innerText(), /\$3.80/);
  await button('Restart experience').click();
  assert.equal(await page.locator('.pov-ui').count(), 0);

  await page.evaluate(() => window.scrollTo({ top: document.querySelector('.experience-scroll').offsetHeight - innerHeight, behavior: 'instant' }));
  await page.locator('.pov-ui').waitFor();
  assert.equal(await page.locator('.cart-count').innerText(), '0');
  await button('Play walkthrough').click();
  await page.waitForTimeout(1200);
  await button('Pause').click();
  const time = await page.locator('.walk-time').innerText();
  await page.waitForTimeout(1200);
  assert.equal(await page.locator('.walk-time').innerText(), time);
  await button('Resume').click();
  await button('Shop smarter').click();
  await button('Resume').waitFor();
  await button('Exit experience').click();

  await page.setViewportSize({ width: 390, height: 844 });
  await button('Enter the experience').click();
  await button('Select original energy drink').click();
  await button('Add to cart').click();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await button('Exit experience').click();
  await button('Open navigation').click();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#mobile-menu').count(), 0);

  if (process.env.FULL_WALKTHROUGH === '1') {
    await button('Enter the experience').click();
    await button('Restart walkthrough').click();
    await button('Complete').waitFor({ timeout: 70000 });
    assert.match(await page.locator('.summary-total').innerText(), /\$8.30/);
    assert.match(await page.locator('.saved-summary').innerText(), /1 saved jacket/);
  }
  assert.deepEqual(errors, []);
  console.log('PASS: entry, three scenarios, shared list, both preference swaps, cart/remove, route, summary, restart, walkthrough pause/resume/manual pause, mobile and keyboard controls.');
} finally {
  await browser.close();
}
