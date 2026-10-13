// 새 폴더 만들기·폴더 삭제. 가짜 Risuai.
const { chromium } = require('/volume2/risu/build/nai-studio/work/update-v5.3.1/browser/node_modules/playwright');
const fs = require('fs'); const path = require('path');
const dist = fs.readFileSync(path.join(__dirname, '../dist/risu-folder-master.plugin.js'), 'utf8');
const mock = fs.readFileSync(path.join(__dirname, 'mock-risuai.js'), 'utf8');
const results = []; const ok = (c, m, x) => { results.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + m + (x !== undefined ? ' :: ' + JSON.stringify(x).slice(0, 300) : '')); };
const order = (p) => p.evaluate(() => window.__db.characterOrder.map((x) => (typeof x === 'string' ? x : `${x.name}[${x.data.join(',')}]`)));
async function boot(b, viewport) {
  const mobile = viewport.width < 700;
  const p = await b.newPage({ viewport, hasTouch: mobile, isMobile: mobile });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.setContent('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>');
  await p.addScriptTag({ content: mock }); await p.addScriptTag({ content: dist });
  await p.waitForFunction(() => window.__open); await p.evaluate(() => window.__open()); await p.waitForSelector('.fm-ftile'); await p.waitForTimeout(500);
  return { p, errs };
}
(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  let { p, errs } = await boot(b, { width: 1280, height: 860 });
  // 고른 봇 없이: 이름 → 고르기 → 만들기
  await p.click('.fm-head [data-act="create-folder"]'); await p.fill('.fm-modal .fm-field', '새 분류'); await p.click('.fm-modal [data-ok]'); await p.waitForTimeout(200);
  ok(await p.isVisible('.fm-selbar [data-act="pending-make"]') && await p.evaluate(() => document.querySelector('[data-act="pending-make"]').disabled), 'pending bar shown, make disabled until a bot is picked');
  ok(!(await p.isVisible('.fm-selbar [data-act="move"]')), 'normal selection buttons hidden while pending');
  await p.click('.fm-card[data-id="c10"]'); await p.click('.fm-card[data-id="c11"]');
  ok((await p.textContent('.fm-count')).includes('"새 분류"에 넣을 봇 2개'), 'count shows the pending folder', await p.textContent('.fm-count'));
  await p.screenshot({ path: path.join(__dirname, 'shots', 'folder-pending.png') });
  await p.click('[data-act="pending-make"]'); await p.waitForTimeout(500);
  ok((await order(p)).includes('새 분류[c10,c11]') && (await p.textContent('.fm-head h2')) === '새 분류', 'folder created and opened', await order(p));
  ok(!(await p.evaluate(() => document.querySelector('.fm-app').classList.contains('is-pending'))), 'pending mode cleared');
  // 취소
  await p.click('.fm-head [data-act="back"]'); await p.waitForTimeout(200);
  await p.click('.fm-head [data-act="create-folder"]'); await p.fill('.fm-modal .fm-field', '취소용'); await p.click('.fm-modal [data-ok]'); await p.waitForTimeout(200);
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  ok(!(await p.evaluate(() => document.querySelector('.fm-app').classList.contains('is-pending'))) && !(await order(p)).some((x) => x.startsWith('취소용')), 'Esc cancels a pending folder');
  // 고른 봇이 있으면 바로 만든다
  await p.click('.fm-card[data-id="c12"]');
  await p.click('.fm-head [data-act="create-folder"]'); await p.fill('.fm-modal .fm-field', '바로'); await p.click('.fm-modal [data-ok]'); await p.waitForTimeout(500);
  ok((await order(p)).includes('바로[c12]'), 'with a selection the folder is made at once', await order(p));
  // 삭제: 봇은 밖으로
  await p.click('.fm-head [data-act="back"]').catch(() => {}); await p.waitForTimeout(200);
  await p.click('.fm-ftile[data-folder="f-abydos"]', { button: 'right' }); await p.waitForTimeout(150);
  ok((await p.textContent('.fm-ctx [data-a="unfold"]')).includes('폴더 삭제'), 'menu says 폴더 삭제');
  await p.click('.fm-ctx [data-a="unfold"]'); await p.click('.fm-modal [data-ok]'); await p.waitForTimeout(500);
  const o = await order(p);
  ok(!o.some((x) => x.startsWith('아비도스')) && ['c15', 'c16', 'c17', 'c18', 'c19'].every((id) => o.includes(id)), 'delete keeps the bots outside', o);
  ok(!errs.length, 'no page errors', errs);
  await p.close();
  ({ p, errs } = await boot(b, { width: 390, height: 844 }));
  ok(await p.isVisible('.fm-head [data-act="create-folder"]'), 'new-folder button visible on mobile');
  await p.screenshot({ path: path.join(__dirname, 'shots', 'folder-mobile.png') });
  await b.close();
  const pass = results.filter(Boolean).length; console.log(`${pass}/${results.length} passed`); process.exitCode = pass === results.length ? 0 : 1;
})();
