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
    const boot = async (seed, storeSeed={}) => {
      await page.setContent('<html><head></head><body></body></html>');
      await page.evaluate(([s,t])=>{window.__localSeed=s;window.__storeSeed=t},[seed,storeSeed]);
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
    const fav=()=>page.evaluate(()=>window.__store.get('risuFolderMaster.favorites'));
    // 폴더 고정: 폴더 메뉴 → 첫 화면 즐겨찾기 칸과 왼쪽 목록에 나온다.
    await page.locator('.fm-ftile[data-folder="f-th"]').first().click({button:'right'});
    assert.equal(await page.locator('.fm-ctx [data-a="fav-pin"]').innerText(),'즐겨찾기에 고정');
    await page.click('.fm-ctx [data-a="fav-pin"]');
    await page.waitForSelector('.fm-fav-home .fm-ftile[data-folder="f-th"]');
    assert.equal(await page.locator('.fm-rail .fm-fav-label').count(),1);
    await page.waitForTimeout(500); // 메뉴를 연 손짓의 click 무시 시간(450ms)
    assert.equal(await page.locator('.fm-fav-pin').count(),2, 'pin mark on the pinned tile (home section + folder grid)');
    // 봇 칸 별 버튼 한 번으로 추가(선택되지 않음).
    await page.hover('.fm-card[data-id="c12"]'); await page.click('.fm-card[data-id="c12"] [data-star]');
    await page.hover('.fm-card[data-id="c10"]'); await page.click('.fm-card[data-id="c10"] [data-star]');
    await page.waitForTimeout(250);
    assert.equal(await page.locator('.fm-card.sel').count(),0, 'star button does not select the card');
    assert.deepEqual(await fav(),{stars:['c12','c10'],pins:['f-th'],folder:{on:false,name:'',imgFile:''}});
    assert.equal(await page.locator('.fm-fav-home .fm-card').count(),2);
    assert.equal(await page.locator('.fm-fav-home .fm-card[data-id="c12"] .fm-star.on').count(),1);
    // 선택 막대 별 버튼(여러 개)
    await page.click('.fm-root .fm-grid[data-container="__root__"] .fm-card[data-id="c13"]'); await page.click('[data-act="fav-selected"]'); await page.waitForTimeout(200);
    assert.deepEqual((await fav()).stars,['c12','c10','c13']);
    await page.click('[data-act="clear"]');
    assert.equal(await page.evaluate(()=>JSON.stringify(window.__db.characterOrder)),original);
    // 다른 기기에서 넣은 별표를 덮어쓰지 않는다(쓰기 직전 서버 값 다시 읽기).
    await page.evaluate(()=>{const v=window.__store.get('risuFolderMaster.favorites');window.__store.set('risuFolderMaster.favorites',{...v,stars:[...v.stars,'c21']})});
    await page.hover('.fm-root .fm-grid[data-container="__root__"] .fm-card[data-id="c14"]'); await page.click('.fm-root .fm-grid[data-container="__root__"] .fm-card[data-id="c14"] [data-star]'); await page.waitForTimeout(200);
    assert.deepEqual((await fav()).stars,['c12','c10','c13','c21','c14'], 'merge with another device');
    // 검색: 즐겨찾기 맞는 봇이 맨 위
    await page.fill('.fm-search input','노노미'); await page.waitForTimeout(300);
    assert.equal(await page.locator('.fm-section').first().locator('h3').innerText(),'즐겨찾기');
    await page.fill('.fm-search input',''); await page.waitForTimeout(300);
    const seed=await page.evaluate(()=>Object.fromEntries(window.__local));
    const storeSeed=await page.evaluate(()=>Object.fromEntries(window.__store));
    assert.equal(seed['risuFolderMaster.extras'].theme,'ocean');
    await page.evaluate(()=>{window.__storeSeed=null});
    await boot(seed, storeSeed);
    assert.equal(await page.locator('html').getAttribute('data-fm-theme'),'ocean');
    assert.equal(await page.locator('.fm-rail .fm-fav-label').count(),1);
    await page.click('.fm-rail [data-view="__favorites__"]');
    assert.equal(await page.locator('.fm-card').count(),5);
    assert.match(await page.locator('.fm-card[data-id="c21"] .fm-fav-where').innerText(),/동방환유기/);
    assert.match(await page.locator('.fm-card[data-id="c12"] .fm-fav-where').innerText(),/폴더 밖/);
    const order=()=>page.evaluate(()=>[...document.querySelectorAll('.fm-card')].map(c=>c.dataset.id).join(','));
    assert.equal(await order(),'c12,c10,c13,c21,c14');
    await page.click('[data-fav-sort="name"]');
    assert.equal(await order(),'c13,c21,c14,c12,c10', 'name sort (노노미·레이무·세리카·시로코·치나츠)');
    await page.click('[data-fav-sort="recent"]');
    const lasts=await page.evaluate(()=>[...document.querySelectorAll('.fm-card')].map(c=>window.__db.characters.find(x=>x.chaId===c.dataset.id).lastInteraction));
    assert.deepEqual(lasts,[...lasts].sort((a,b)=>b-a), 'recent sort');
    await page.click('.fm-card[data-id="c10"]'); await page.click('[data-act="move"]');
    await page.click('[data-pick="f-abydos"]');
    assert.match(await page.locator('.fm-plus-preview').innerText(),/5개 → 6개/);
    assert.equal(await page.evaluate(()=>JSON.stringify(window.__db.characterOrder)),original);
    await page.click('.fm-modal [data-x]');
    await page.click('[data-act="fav-selected"]'); await page.waitForTimeout(200);
    assert.equal(await page.locator('.fm-card').count(),4);
    // 접기는 기억된다
    await page.click('[data-act="back"]'); await page.click('[data-fav-fold]');
    assert.equal(await page.locator('.fm-fav-home .fm-card').count(),0);
    assert.equal((await page.evaluate(()=>window.__local.get('risuFolderMaster.ui'))).favFold,true);
    await page.click('[data-fav-fold]');
    // 옛 기기 저장분(1.0.3~1.0.4)은 서버에 없을 때 한 번 옮긴다.
    await boot({'risuFolderMaster.extras':{theme:'classic',stars:['c11'],pins:['f-ba']}}, {});
    assert.deepEqual(await fav(),{stars:['c11'],pins:['f-ba'],folder:{on:false,name:'',imgFile:''}});
    assert.equal(await page.locator('.fm-fav-home .fm-card[data-id="c11"]').count(),1);
    await page.setViewportSize({width:390,height:844});
    await settings(); await page.click('[data-theme="blue"]'); await page.click('.fm-modal [data-ok]');
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    assert.deepEqual(errors,[]);
    console.log('PASS extras: theme, pins, card star, multi-device merge, home/search favorites, sort, fold, legacy migration, move preview, mobile');
  } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
