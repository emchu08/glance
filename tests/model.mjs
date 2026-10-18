import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const model = readFileSync(new URL('../public/models/ray-ban-meta/ray-ban-meta.glb', import.meta.url));
assert.equal(model.toString('ascii', 0, 4), 'glTF');
const document = JSON.parse(model.toString('utf8', 20, 20 + model.readUInt32LE(12)));
assert.match(document.asset.extras.author, /mminharali/);
assert.match(document.asset.extras.license, /CC-BY-4.0/);
assert.equal(document.images.length, 2);
assert.ok(document.images.every(image => image.bufferView !== undefined), 'Textures are embedded');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  let attempts = 0;
  await page.route('**/ray-ban-meta.glb', async route => {
    attempts++;
    if (attempts === 1) {
      await new Promise(resolve => setTimeout(resolve, 700));
      await route.fulfill({ status: 503, body: 'Temporary asset failure' });
    } else await route.continue();
  });
  await page.goto(process.env.BASE_URL || 'http://127.0.0.1:5173');
  await page.locator('.world-fallback').waitFor();
  await page.getByRole('button', { name: 'Retry 3D' }).click();
  await page.locator('.loader').waitFor({ state: 'hidden', timeout: 25000 });
  assert.equal(await page.locator('.world-fallback').count(), 0, 'Model retry recovers');
  assert.equal(attempts, 2);
  await page.waitForTimeout(400);
  await page.screenshot({ path: '/tmp/glance-ray-ban-reduced.png' });
  await page.getByRole('button', { name: 'Enter the experience', exact: true }).click();
  await page.locator('.pov-ui').waitFor();
  await page.getByRole('button', { name: 'Exit experience', exact: true }).click();
  await page.getByRole('group', { name: 'Rotate the Ray-Ban Meta smart glasses' }).waitFor();
  assert.equal(attempts, 2, 'Exit/replay reuses the loaded model');
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.getByRole('group', { name: 'Rotate the Ray-Ban Meta smart glasses' }).focus();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(400);
  assert.deepEqual(errors, []);
  console.log('PASS: supplied GLB attribution and embedded textures; model-load failure/retry; reduced-motion render; cached exit/replay; keyboard rotation control.');
} finally { await browser.close(); }
