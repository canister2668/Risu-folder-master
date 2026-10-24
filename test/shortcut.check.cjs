// 사이드바 즐겨찾기 바로가기 폴더: 켜기·별표 동기화·사이드바 손질 되돌리기·지울 때 정리.
const { chromium } = require('/volume2/risu/itemx-plugin/node_modules/playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const SC = 'risu-folder-master-favorites';
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    const boot = async (storeSeed = {}) => {
      await page.setContent('<html><head></head><body></body></html>');
      await page.evaluate((t) => { window.__storeSeed = t; }, storeSeed);
      for (const file of ['mock-risuai.js', '../dist/risu-folder-master.plugin.js']) await page.addScriptTag({ content: fs.readFileSync(path.join(__dirname, file), 'utf8') });
      await page.waitForFunction(() => window.__open && window.__unload);
      await page.evaluate(() => window.__open());
      await page.waitForSelector('.fm-card:not(.loading)');
      await page.waitForTimeout(600);
    };
    const order = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__db.characterOrder)));
    const original = await (async () => { await boot(); return order(); })();
    const fav = () => page.evaluate(() => window.__store.get('risuFolderMaster.favorites'));
    const confirm = async () => { await page.click('.fm-modal [data-ok]'); await page.waitForTimeout(500); };

    // 별표 2개 → 즐겨찾기 화면에서 사이드바 폴더 켜기
    for (const id of ['c12', 'c21']) { await page.hover(`.fm-card[data-id="${id}"]`).catch(() => {}); }
    await page.evaluate(() => window.__store.set('risuFolderMaster.favorites', { stars: ['c12', 'c21'], pins: [] }));
    await boot(await page.evaluate(() => Object.fromEntries(window.__store)));
    await page.click('.fm-rail [data-view="__favorites__"]');
    assert.equal(await page.locator('[data-act="fav-folder-toggle"]').getAttribute('aria-checked'), 'false');
    assert.deepEqual(await order(), original, 'nothing written while off');
    await page.click('[data-act="fav-folder-toggle"]'); await page.waitForTimeout(600);
    let o = await order();
    assert.equal(o[0].id, SC); assert.deepEqual(o[0].data, ['c12', 'c21']);
    assert.deepEqual(o.slice(1), original, 'original folders untouched, bots not moved');
    assert.equal((await fav()).folder.on, true);
    assert.equal(await page.evaluate(() => window.__rootStyles.some((s) => s['x-id'] === 'risu-folder-master-favorites-guard' && /user-drag:none/.test(s.html))), true, 'sidebar drag guard injected');
    // 관리 화면에는 바로가기 폴더가 폴더로 안 나온다
    await page.click('[data-act="back"]');
    assert.equal(await page.locator('.fm-folders .fm-ftile').count(), 3);
    // 별표 추가 → 사이드바 폴더에도
    await page.hover('.fm-grid[data-container="__root__"] .fm-card[data-id="c10"]'); await page.click('.fm-grid[data-container="__root__"] .fm-card[data-id="c10"] [data-star]'); await page.waitForTimeout(500);
    assert.deepEqual((await order())[0].data, ['c12', 'c21', 'c10']);
    // 폴더 마스터의 일반 저장도 바로가기 폴더를 지키고, 겹침으로 보지 않는다
    await page.click('.fm-grid[data-container="__root__"] .fm-card[data-id="c13"]'); await page.click('[data-act="move"]'); await page.click('[data-pick="f-abydos"]'); await page.click('[data-confirm-move]'); await page.waitForTimeout(900);
    o = await order();
    assert.equal(o[0].id, SC); assert.ok(o.find((x) => x.id === 'f-abydos').data.includes('c13'));
    await page.click('[data-act="menu"]'); await page.click('[data-act="check"]'); await page.waitForTimeout(500);
    assert.equal(await page.locator('.fm-modal [data-fix="dups"]').count(), 0, 'reference folder is not reported as duplicates');
    await page.keyboard.press('Escape');
    // 해적판처럼 저장이 늦게 반영돼도 빠르게 누른 별표가 서로 덮어쓰지 않는다
    await page.evaluate(() => { window.__storeLag = 1500; });
    for (const id of ['c11', 'c14']) { await page.hover(`.fm-grid[data-container="__root__"] .fm-card[data-id="${id}"]`); await page.click(`.fm-grid[data-container="__root__"] .fm-card[data-id="${id}"] [data-star]`); await page.waitForTimeout(150); }
    await page.waitForTimeout(2200);
    assert.deepEqual((await fav()).stars, ['c12', 'c21', 'c10', 'c11', 'c14'], 'delayed storage: no lost stars');
    for (const id of ['c11', 'c14']) { await page.hover(`.fm-grid[data-container="__root__"] .fm-card[data-id="${id}"]`); await page.click(`.fm-grid[data-container="__root__"] .fm-card[data-id="${id}"] [data-star]`); await page.waitForTimeout(150); }
    await page.waitForTimeout(2200);
    assert.deepEqual((await fav()).stars, ['c12', 'c21', 'c10']);
    await page.evaluate(() => { window.__storeLag = 0; });
    // 사이드바에서 이름을 바꾸고 봇을 끌어 넣은 것 → 창을 다시 열면 되돌아간다
    await page.evaluate(() => { const o = window.__db.characterOrder; o[0].name = '해킹'; o[0].data.push('c11'); window.__db.characterOrder = o.filter((x) => x !== 'c11'); });
    await page.evaluate(() => window.__open()); await page.waitForTimeout(400);
    await page.click('[data-act="close"]').catch(() => {});
    await page.evaluate(() => window.__open()); await page.waitForTimeout(900);
    o = await order();
    assert.equal(o[0].name, '⭐ 즐겨찾기'); assert.deepEqual(o[0].data, ['c12', 'c21', 'c10']);
    assert.ok(o.includes('c11'), 'dragged-in bot returned to its place');
    // 다시 불러오기(목록에 켜진 채로 있음) → 남는다
    await page.evaluate(() => window.__unload()); 
    assert.equal((await order())[0].id, SC, 'plugin reload keeps the folder');
    // 삭제(목록에서 빠진 뒤 unload) → 지운다
    await page.evaluate(() => { window.__db.plugins = []; return window.__unload(); });
    o = await order();
    assert.ok(!o.some((x) => x && x.id === SC), 'uninstall removes the folder');
    assert.equal(JSON.stringify(o).includes('"c12"'), true);
    // 끄기
    await boot(await page.evaluate(() => Object.fromEntries(window.__store)));
    assert.equal((await order())[0].id, SC, 'reinstall restores it');
    // 즐겨찾기 폴더 그림: 왼쪽 목록 오른쪽 클릭 → 그림 바꾸기 → 템플릿 → 적용 → 사이드바 폴더에도
    await page.evaluate((b64) => { window.__tpl = { 'favorite.webp': b64 }; }, fs.readFileSync(path.join(__dirname, '..', 'templates', 'favorite.webp')).toString('base64'));
    await page.click('.fm-rail [data-view="__favorites__"]', { button: 'right' }); await page.waitForTimeout(200);
    assert.deepEqual(await page.locator('.fm-ctx [data-a]').allInnerTexts(), ['그림 바꾸기', '이름 바꾸기', '사이드바 폴더 끄기']);
    await page.waitForTimeout(500);
    await page.click('.fm-ctx [data-a="fav-image"]'); await page.waitForSelector('.fm-ip');
    assert.equal(await page.locator('.fm-ip-sec').first().innerText().catch(() => ''), '"즐겨찾기"에 어울리는 템플릿', 'picker recommends the favorites template');
    await page.click('.fm-ip-tile[data-tpl="favorite"]'); await page.click('[data-apply]'); await page.waitForTimeout(900);
    assert.equal((await fav()).folder.imgFile, 'img3');
    assert.equal((await order())[0].imgFile, 'img3', 'sidebar folder uses the picked image');
    assert.equal(await page.locator('.fm-rail [data-view="__favorites__"] .fm-thumb[data-src="img3"], .fm-rail [data-view="__favorites__"] .fm-thumb img').count(), 1, 'rail icon shows the image');
    // 이름 바꾸기도 메뉴에서
    await page.click('.fm-rail [data-view="__favorites__"]', { button: 'right' }); await page.waitForTimeout(600);
    await page.click('.fm-ctx [data-a="fav-rename"]'); await page.fill('.fm-modal input', '최애'); await page.click('.fm-modal [data-ok]'); await page.waitForTimeout(800);
    assert.equal((await order())[0].name, '최애');
    await page.click('.fm-nav[data-view="__all__"]'); await page.click('.fm-rail [data-view="__favorites__"]');
    await page.click('[data-act="fav-folder-toggle"]'); await page.waitForTimeout(600);
    assert.ok(!(await order()).some((x) => x && x.id === SC), 'turning off removes it');
    // 즐겨찾기 화면 스위치 표시
    assert.equal(await page.locator('[data-act="fav-folder-toggle"][role="switch"]').getAttribute('aria-checked'), 'false');
    // 설정 창 토글: 저장해야 적용, 취소하면 그대로
    const settings = async () => { await page.click('[data-act="menu"]'); await page.click('[data-act="settings"]'); };
    await settings(); await page.click('[data-sw="fav"]'); await page.keyboard.press('Escape'); await page.waitForTimeout(500);
    assert.ok(!(await order()).some((x) => x && x.id === SC), 'settings toggle + cancel: nothing written');
    await settings(); await page.click('[data-sw="fav"]'); await page.click('.fm-modal [data-ok]'); await page.waitForTimeout(900);
    assert.equal((await order())[0].id, SC, 'settings toggle + save: on');
    assert.equal(await page.locator('[data-act="fav-folder-toggle"]').getAttribute('aria-checked'), 'true');
    await settings(); assert.equal(await page.locator('[data-sw="fav"]').getAttribute('aria-checked'), 'true');
    await page.click('[data-sw="fav"]'); await page.click('.fm-modal [data-ok]'); await page.waitForTimeout(900);
    assert.ok(!(await order()).some((x) => x && x.id === SC), 'settings toggle + save: off');
    assert.deepEqual(errors, []);
    console.log('PASS shortcut: on, star sync, normal saves keep it, no duplicate report, sidebar edits reverted, reload keeps, uninstall/off removes');
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
