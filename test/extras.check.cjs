// New options use the same generic fixture as the existing browser regression tests.
const { chromium } = require('/volume2/risu/itemx-plugin/node_modules/playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({args:['--no-sandbox']});
  try {
    const page = await browser.newPage({viewport:{width:1280,height:860}});
    const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    const boot = async seed => {
      await page.setContent('<html><head></head><body></body></html>');
      await page.evaluate(s=>window.__localSeed=s,seed);
      for(const file of ['mock-risuai.js','../dist/risu-folder-master.plugin.js'])
        await page.addScriptTag({content:fs.readFileSync(path.join(__dirname,file),'utf8')});
      await page.waitForFunction(()=>window.__open);
      await page.evaluate(()=>window.__open());
      await page.waitForSelector('.fm-card:not(.loading)');
      await page.waitForTimeout(700);
    };
    const settings=async()=>{await page.click('[data-act="menu"]');await page.click('[data-act="settings"]')};
    await boot({});
    const original=await page.evaluate(()=>JSON.stringify(window.__db.characterOrder));
    await settings(); await page.click('[data-theme="mint"]'); await page.keyboard.press('Escape');
    assert.equal(await page.locator('html').getAttribute('data-fm-theme'),'classic');
    await settings(); await page.click('[data-theme="ocean"]'); await page.click('.fm-modal [data-ok]');
    await page.locator('.fm-ftile').first().click({button:'right'});
    await page.click('[data-a="plus-pin"]');
    await page.waitForSelector('.fm-plus-pins');
    await page.waitForTimeout(250);
    await page.click('.fm-card[data-id="c10"]'); await page.click('[data-act="plus-toggle-stars"]');
    assert.equal(await page.evaluate(()=>JSON.stringify(window.__db.characterOrder)),original);
    const seed=await page.evaluate(()=>Object.fromEntries(window.__local));
    assert.equal(seed['risuFolderMaster.extras'].theme,'ocean');
    assert.deepEqual(seed['risuFolderMaster.extras'].stars,['c10']);
    await boot(seed);
    assert.equal(await page.locator('html').getAttribute('data-fm-theme'),'ocean');
    assert.equal(await page.locator('.fm-plus-pins .fm-nav').count(),1);
    await page.click('.fm-rail [data-view="__favorites__"]');
    assert.equal(await page.locator('.fm-card').count(),1);
    await page.click('.fm-card'); await page.click('[data-act="move"]');
    await page.click('[data-pick="f-abydos"]');
    assert.match(await page.locator('.fm-plus-preview').innerText(),/5개 → 6개/);
    assert.equal(await page.evaluate(()=>JSON.stringify(window.__db.characterOrder)),original);
    await page.click('.fm-modal [data-x]');
    await page.click('[data-act="plus-toggle-stars"]');
    assert.equal(await page.locator('.fm-card').count(),0);
    await page.setViewportSize({width:390,height:844});
    await settings(); await page.click('[data-theme="blue"]'); await page.click('.fm-modal [data-ok]');
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    assert.deepEqual(errors,[]);
    console.log('PASS extras: theme cancel/save/reopen, pins, favorites, unchanged order, move preview/cancel, mobile');
  } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
