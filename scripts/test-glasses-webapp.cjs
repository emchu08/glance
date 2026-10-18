// The lens as a Meta Ray-Ban Display web app: no companion bridge, camera frames from the phone via the relay.
// Plays the phone's part with the same API calls the iOS app makes. No live recognition (it is intercepted).
// BASE_URL=http://localhost:3100 NODE_PATH=/path/to/playwright/node_modules node scripts/test-glasses-webapp.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const base = process.env.BASE_URL || 'http://localhost:3100';
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const code = Array.from({ length: 6 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
// 1×1 JPEG
const FRAME = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';

const post = async (path, body) => {
  const r = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, data: await r.json().catch(() => null) };
};

(async () => {
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 600, height: 600 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    let recognized = null;
    await page.route('**/api/glance/glimpse', async route => {
      recognized = route.request().postDataJSON();
      await route.fulfill({ json: { candidates: [], model: 'test' } });
    });

    // Glasses first: the web app claims the phone's code before the phone has connected.
    await page.goto(`${base}/lens?source=native&pair=${code}`);
    await page.waitForSelector('[data-screen="picker"]');
    await page.waitForFunction(() => document.querySelector('.lens').innerText.includes('Open Glance on your phone'));

    // The phone joins the same code and uploads glasses-camera frames.
    const join = await post('/api/relay/pair', { role: 'phone', code, claim: true });
    assert.equal(join.status, 200, 'Phone joins the code the glasses claimed');
    const upload = async () => post('/api/relay/frame', { code, token: join.data.token, image: FRAME, width: 1, height: 1, capturedAt: Date.now() });
    assert.equal((await upload()).status, 200);
    const status = await (await fetch(`${base}/api/relay/status?code=${code}`)).json();
    assert.equal(status.lens, true, 'Phone can see that Glance is open on the glasses');
    await page.waitForFunction(() => document.querySelector('.lens').innerText.includes('Glasses camera live'), null, { timeout: 10000 });

    // A scan uses a frame from the phone, newer than the last one used.
    await page.locator('[data-action-id="mode-glimpse"]').click();
    await page.locator('[data-action-id="scan"]').click();
    const ticker = setInterval(() => { upload().catch(() => {}); }, 400);
    for (let i = 0; i < 80 && !recognized; i += 1) await page.waitForTimeout(100);
    clearInterval(ticker);
    assert.ok(recognized, 'Recognition ran on a relayed frame');
    assert.equal(recognized.image, FRAME);
    assert.deepEqual(errors, []);
    console.log(`PASS: glasses web app claimed ${code}, phone joined and uploaded, presence both ways, scan used the relayed frame, no browser errors.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
