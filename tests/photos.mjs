import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
const errors = []; page.on('pageerror', e => errors.push(e.message));
const button = name => page.getByRole('button', { name, exact: true });
async function scene(id) { await page.waitForFunction(key => document.querySelector('.photo-world')?.dataset.photo === key && document.querySelector('.scene-photo')?.naturalWidth > 0, id); }
async function checkAnchors() {
  await page.locator('.photo-target').first().waitFor({ state: 'visible' });
  const bounds = await page.locator('.photo-target').evaluateAll(targets => targets.map(el => {
    const img = el.parentElement.querySelector('.scene-photo').getBoundingClientRect();
    const box = el.getBoundingClientRect(); const [x,y,w,h] = el.dataset.bounds.split(',').map(Number);
    const expected = [img.left + img.width*x, img.top+img.height*y, img.width*w, img.height*h];
    return { error: Math.max(...[box.left,box.top,box.width,box.height].map((n,i)=>Math.abs(n-expected[i]))), width:box.width, visible:box.right>0&&box.left<innerWidth&&box.bottom>0&&box.top<innerHeight };
  }));
  assert.ok(bounds.length); for (const b of bounds) { assert.ok(b.error<1, `Anchor drift: ${b.error}`); assert.ok(b.visible); }
}
try {
  await page.goto(process.env.BASE_URL || 'http://127.0.0.1:5173', { waitUntil:'networkidle' }); await page.locator('.loader').waitFor({ state:'hidden' });
  await page.waitForTimeout(350); await page.screenshot({path:'/tmp/glance-blue-hero.png'});
  await button('Enter the experience').click(); await page.locator('.pov-ui').waitFor(); await scene('grocery'); await checkAnchors();
  await page.waitForTimeout(350); await page.screenshot({path:'/tmp/glance-photo-grocery.png'});
  await button('Select original energy drink').click(); await button('Add to cart').waitFor();
  await page.getByRole('tab',{name:'Nutrition',exact:true}).click(); assert.match(await page.locator('.nutrition-grid').innerText(), /22/);
  await page.locator('#preference').selectOption('sugar'); await button('Choose alternative').click();
  assert.equal(await page.locator('[data-target="zero"]').getAttribute('aria-pressed'),'true');
  await button('Add to cart').click(); assert.equal(await page.locator('.cart-total').innerText(),'$4.75');
  await button('Discover a jacket').click(); await scene('jacket'); await checkAnchors(); await page.waitForTimeout(350); await page.screenshot({path:'/tmp/glance-photo-jacket.png'});
  await button('Select the jacket').click(); await button('Save this find').click(); await button('Next jacket').click();
  await page.waitForFunction(()=>{const img=document.querySelector('.jacket-sample img');return img?.complete&&img.naturalWidth>0;});
  await button('Recreate a meal').click(); await scene('meal'); await checkAnchors(); await page.waitForTimeout(350); await page.screenshot({path:'/tmp/glance-photo-meal.png'});
  await button('Select the dish').click(); await button('See suggested recipe').click(); await button('See ingredients').click(); await button('Add ingredients to my list').click();
  await page.getByRole('button',{name:/Shopping list/}).click(); assert.equal(await page.locator('.list-rows label').count(),5); await button('Close panel').click();
  await button('Shop smarter').click(); await button('Find next item').click(); await scene('aisle');
  await page.waitForTimeout(350); await page.screenshot({path:'/tmp/glance-photo-aisle.png'});
  await button('Exit experience').click(); await page.setViewportSize({width:390,height:844}); await button('Enter the experience').click(); await scene('grocery');
  await checkAnchors(); assert.ok(await page.locator('[data-target="lemon"]').evaluate(e=>e.getBoundingClientRect().width>=44));
  await page.waitForTimeout(350); await page.screenshot({path:'/tmp/glance-photo-mobile.png'}); await button('Select lower-sugar energy drink').click(); await button('Add to cart').click();
  await page.setViewportSize({width:375,height:667}); await page.waitForTimeout(500); await checkAnchors();
  assert.ok(await page.locator('.sim-display').evaluate(e=>e.getBoundingClientRect().height>=180), 'Small phone keeps a usable information panel');
  await page.screenshot({path:'/tmp/glance-photo-small-phone.png'});
  for(const [name,id] of [['Discover a jacket','jacket'],['Recreate a meal','meal']]){await button(name).click(); await scene(id); await checkAnchors();}
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false); await page.keyboard.press('Escape'); assert.equal(await page.locator('.pov-ui').count(),0);
  assert.deepEqual(errors,[]); console.log('PASS: actual local photo assets; desktop/mobile anchor alignment; both drink targets; nutrition and alternative; cart; denim thumbnails/save; recipe list; navigation; exit.');
} finally {await browser.close();}
