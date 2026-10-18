// 폴더 그림 고르기 창: 템플릿 고르기·글씨 바꾸기·내 그림 자르기·폴더 메뉴(오른쪽 클릭·길게 누르기). 가짜 Risuai.
const { chromium } = require('/volume2/risu/build/nai-studio/work/update-v5.3.1/browser/node_modules/playwright');
const fs = require('fs'); const path = require('path');
const dist = fs.readFileSync(path.join(__dirname, '../dist/risu-folder-master.plugin.js'), 'utf8');
const mock = fs.readFileSync(path.join(__dirname, 'mock-risuai.js'), 'utf8');
const tdir = path.join(__dirname, '../templates');
const tpl = {};
for (const f of ['fantasy.webp', 'blank/fantasy.webp', 'multi.webp', 'blank/multi.webp', 'blank/modern.webp', 'font.ttf', 'argon.webp', 'argon-done.webp', 'argon-rest.webp', 'argon-shy.webp', 'argon-once.webp', 'argon-room.webp']) tpl[f] = fs.readFileSync(path.join(tdir, f)).toString('base64');
const results = []; const ok = (c, m, x) => { results.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + m + (x !== undefined ? ' :: ' + JSON.stringify(x).slice(0, 300) : '')); };
const shot = (p, n) => p.screenshot({ path: path.join(__dirname, 'shots', n + '.png') });
const folderImg = (p, id) => p.evaluate((id) => window.__db.characterOrder.find((x) => x.id === id).imgFile, id);

async function boot(b, viewport) {
  const mobile = viewport.width < 700;
  const p = await b.newPage({ viewport, hasTouch: mobile, isMobile: mobile });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/status of 404/.test(m.text())) errs.push(m.text()); });
  await p.setContent('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body></body></html>');
  await p.evaluate((t) => { window.__tpl = t; }, tpl);
  await p.addScriptTag({ content: mock }); await p.addScriptTag({ content: dist });
  await p.waitForFunction(() => window.__open);
  await p.evaluate(() => { window.__open(); }); await p.waitForSelector('.fm-ftile', { timeout: 2000 }); await p.waitForTimeout(500);
  return { p, errs };
}

(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  let { p, errs } = await boot(b, { width: 1280, height: 860 });
  // 오른쪽 클릭 → 폴더 메뉴
  await p.click('.fm-ftile[data-folder="f-th"]', { button: 'right' }); await p.waitForTimeout(200);
  ok(await p.isVisible('.fm-ctx') && (await p.textContent('.fm-ctx h4')) === '동방환유기', 'right-click opens the folder menu');
  ok(await p.evaluate(() => document.querySelector('.fm-head h2').textContent) === '모든 폴더', 'right-click does not open the folder');
  await shot(p, 'picker-ctx');
  await p.mouse.click(5, 5); await p.waitForTimeout(150);
  ok(!(await p.$('.fm-ctx')), 'clicking outside closes the menu');
  await p.click('.fm-ftile[data-folder="f-th"]', { button: 'right' }); await p.waitForTimeout(150);
  await p.click('.fm-ctx [data-a="image"]'); await p.waitForSelector('.fm-ip');
  ok(await p.evaluate(() => document.querySelectorAll('.fm-ip-tile').length) === 30, 'picker lists 30 templates', await p.evaluate(() => document.querySelectorAll('.fm-ip-tile').length));
  ok(!(await p.$('.fm-ip-sec')), 'no recommendation for an unrelated folder name');
  await p.click('.fm-ip-tile[data-tpl="fantasy"]'); await p.waitForTimeout(200);
  ok(await p.evaluate(() => !!document.querySelector('[data-new] img') && !document.querySelector('[data-apply]').disabled), 'choosing a template previews it and enables apply');
  await shot(p, 'picker-template');
  await p.click('[data-apply]'); await p.waitForTimeout(600);
  ok(await folderImg(p, 'f-th') === 'img3' && !(await p.$('.fm-ip')), 'applying a template saves the folder image');
  ok(await p.evaluate(() => window.__fetched.some((u) => u.endsWith('/templates/fantasy.webp'))), 'template fetched from GitHub templates/');

  // All new fixed-label icons use the actual template download/save path.
  for (const slug of ['argon', 'argon-done', 'argon-rest', 'argon-shy', 'argon-once', 'argon-room']) {
    await p.click('.fm-ftile[data-folder="f-th"]', { button: 'right' });
    await p.click('.fm-ctx [data-a="image"]');
    await p.click('[data-cat="아르곤"]');
    ok(await p.locator('.fm-ip-tile').count() === 6, slug + ': category lists six icons');
    await p.click(`[data-tpl="${slug}"]`);
    ok(await p.locator('[data-edit]').count() === 0, slug + ': fixed label does not offer unavailable blank');
    await p.click('[data-apply]');
    await p.waitForSelector('.fm-ip', {state:'detached'});
    await p.waitForTimeout(650); // Wait for folder save/readback and home rerender.
    ok(await p.evaluate(s => window.__fetched.some(u => u.endsWith('/templates/' + s + '.webp')), slug), slug + ': downloaded and applied');
  }

  // 글씨 바꾸기
  await p.click('.fm-ftile[data-folder="f-abydos"]'); await p.waitForTimeout(250);
  await p.click('.fm-head [data-act="image"]'); await p.waitForSelector('.fm-ip');
  await p.click('.fm-ip-tile[data-tpl="fantasy"]'); await p.click('[data-edit]'); await p.waitForTimeout(800);
  ok(await p.evaluate(() => document.querySelector('[data-text]').value) === '아비도스 대책위', 'edit starts with the folder name (8 chars max)', await p.evaluate(() => document.querySelector('[data-text]').value));
  ok(await p.evaluate(() => !!document.querySelector('[data-new] canvas')), 'blank board composed into a canvas');
  await p.fill('[data-text]', '아비도스'); await p.waitForTimeout(700);
  await shot(p, 'picker-edit');
  const ink = await p.evaluate(() => { const c = document.querySelector('[data-new] canvas'); const d = c.getContext('2d').getImageData(0, 0, 512, 512).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 70 && d[i + 1] < 60 && d[i + 2] < 80) n++; return n; });
  ok(ink > 3000, 'letters drawn on the paper', ink);
  await p.click('[data-apply]'); await p.waitForTimeout(800);
  ok(await folderImg(p, 'f-abydos') === 'img3' && await p.evaluate(() => { const s = window.__saved.at(-1); return s[0] === 0x52 && s[8] === 0x57; }), 'edited sign saved as WebP');

  // 카드 3장 템플릿에 2글자 → 가운데부터, 남는 카드는 빈칸
  await p.click('.fm-head [data-act="image"]'); await p.waitForSelector('.fm-ip');
  await p.click('.fm-ip-tile[data-tpl="multi"]'); await p.click('[data-edit]'); await p.fill('[data-text]', '얼헌'); await p.waitForTimeout(900);
  await shot(p, 'picker-multi');
  await p.click('.fm-ip-tabs [data-tab="mine"]'); await p.waitForTimeout(150);
  ok(await p.isVisible('.fm-ip-drop') && await p.evaluate(() => document.querySelector('[data-apply]').disabled), 'my-image tab starts empty with apply disabled');
  // 내 그림: 400x200 PNG 를 만들어 고른다
  const png = await p.evaluate(async () => { const c = document.createElement('canvas'); c.width = 400; c.height = 200; const x = c.getContext('2d'); x.fillStyle = '#e33'; x.fillRect(0, 0, 200, 200); x.fillStyle = '#33e'; x.fillRect(200, 0, 200, 200); return c.toDataURL('image/png').split(',')[1]; });
  await p.setInputFiles('.fm-ip-drop input', { name: 'a.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await p.waitForSelector('.fm-ip-cropbox'); await p.waitForTimeout(200);
  const box = await p.locator('.fm-ip-cropbox').boundingBox();
  await p.mouse.move(box.x + 100, box.y + 100); await p.mouse.down(); await p.mouse.move(box.x + 300, box.y + 100, { steps: 4 }); await p.mouse.up(); await p.waitForTimeout(200);
  const left = await p.evaluate(() => { const c = document.querySelector('[data-new] canvas'); const d = c.getContext('2d').getImageData(10, 256, 1, 1).data; return [d[0], d[2]]; });
  ok(left[0] > 200 && left[1] < 100, 'dragging the crop to the right shows the left (red) half', left);
  await shot(p, 'picker-crop');
  await p.click('[data-apply]'); await p.waitForTimeout(600);
  ok(!(await p.$('.fm-ip')), 'my image applied');
  // 기본 아이콘으로
  await p.click('.fm-head [data-act="image"]'); await p.waitForSelector('.fm-ip'); await p.click('[data-reset]'); await p.waitForTimeout(500);
  ok(await folderImg(p, 'f-abydos') === '', 'reset to default icon');
  // 받기 실패
  await p.evaluate(() => { window.__tplOffline = true; });
  await p.click('.fm-head [data-act="image"]'); await p.waitForSelector('.fm-ip');
  await p.click('.fm-ip-tile[data-tpl="sf"]'); await p.click('[data-apply]'); await p.waitForTimeout(400);
  ok(await p.isVisible('.fm-toast.error') && await p.isVisible('.fm-ip') && await folderImg(p, 'f-abydos') === '', 'offline: error toast, dialog stays, nothing saved', await p.textContent('.fm-toast'));
  await p.keyboard.press('Escape'); await p.waitForTimeout(150);
  ok(!errs.length, 'no page errors (desktop)', errs);
  await p.close();

  // 휴대폰: 길게 누르기 → 메뉴, 그림 창 전체 화면
  ({ p, errs } = await boot(b, { width: 390, height: 844 }));
  await p.evaluate(() => { window.__tplOffline = false; });
  const t = await p.locator('.fm-ftile[data-folder="f-ba"]').boundingBox();
  const cdp = await p.context().newCDPSession(p);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: t.x + t.width / 2, y: t.y + 20 }] });
  await p.waitForTimeout(700);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await p.waitForTimeout(250);
  ok(await p.isVisible('.fm-ctx') && await p.evaluate(() => document.querySelector('.fm-head h2').textContent) === '모든 폴더', 'long-press opens the folder menu without opening the folder');
  await shot(p, 'picker-mobile-ctx');
  await p.tap('.fm-ctx [data-a="image"]'); await p.waitForSelector('.fm-ip'); await p.waitForTimeout(300);
  const r = await p.evaluate(() => { const m = document.querySelector('.fm-modal.fm-wide').getBoundingClientRect(); return [m.width, m.height, getComputedStyle(document.querySelector('.fm-ip-grid')).gridTemplateColumns.split(' ').length]; });
  ok(r[0] === 390 && r[1] === 844 && r[2] === 4, 'mobile picker is full screen with 4 columns', r);
  await shot(p, 'picker-mobile');
  // 순서 편집 중엔 메뉴가 안 뜬다
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  await p.tap('[data-act="reorder"]'); await p.waitForTimeout(300);
  await p.click('.fm-ftile[data-folder="f-ba"]', { button: 'right' }).catch(() => {}); await p.waitForTimeout(200);
  ok(!(await p.$('.fm-ctx')), 'no folder menu while reordering');
  ok(!errs.length, 'no page errors (mobile)', errs);
  await b.close();
  const pass = results.filter(Boolean).length;
  console.log(`${pass}/${results.length} passed`);
  process.exitCode = pass === results.length ? 0 : 1;
})();
