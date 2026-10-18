// 실제 앱에서 플러그인을 끄거나 지우면 사이드바 즐겨찾기 폴더가 지워지는지(시험 서버 전용).
// 사용: node shortcut-uninstall.cjs off|delete   (delete 뒤에는 install.cjs 로 다시 설치)
const L = require('./lib.cjs');
const SC = 'risu-folder-master-favorites';
const mode = process.argv[2] || 'off';
const res = []; const ok = (c, m, x) => { res.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + m + (x !== undefined ? ' :: ' + JSON.stringify(x).slice(0, 200) : '')); };
const fm = async (p) => { for (let i = 0; i < 60; i++) { for (const f of p.frames()) { if (f === p.mainFrame()) continue; try { if (await f.evaluate(() => !!document.querySelector('.fm-app'))) return f; } catch {} } await p.waitForTimeout(200); } return null; };
(async () => {
  try {
    const { ctx, p } = await L.open(1280, 900); const stop = L.autoYes(p); await p.waitForTimeout(9000);
    const seed = await L.seedFrame(p);
    const order = async () => (await seed.evaluate(async () => window.__fmDb(['characterOrder']))).characterOrder;
    const base = (await order()).filter((x) => !(x && x.id === SC));
    const stars = [base.find((x) => typeof x === 'string')];
    await seed.evaluate(async (s) => Risuai.pluginStorage.setItem('risuFolderMaster.favorites', { stars: s, pins: [], folder: { on: true } }), stars);
    await p.waitForTimeout(3000);
    // 창을 한 번 열어 폴더를 만든다
    await p.click('.rs-sidebar-toggle-button'); await p.waitForTimeout(600); await p.locator('.rs-sidebar-menu-popover button:has(svg[fill="#8ea2ff"])').first().click();
    const F = await fm(p); await p.waitForTimeout(2500); await F.click('[data-act="close"]'); await p.waitForTimeout(1000);
    let o = await order();
    ok(o[0] && o[0].id === SC, 'folder present before', o[0] && o[0].id);
    // 설정 › Plugin › 폴더 마스터 행의 끄기/지우기
    await p.click('.rs-sidebar-toggle-button'); await p.waitForTimeout(700);
    await p.locator('.rs-sidebar-menu-popover button').first().click(); await p.waitForTimeout(1200);
    await p.getByText('Plugin', { exact: true }).first().click(); await p.waitForTimeout(1200);
    const row = p.locator('div', { hasText: /폴더 마스터 v/ }).filter({ has: p.locator('button') }).last();
    const btns = row.locator('button');
    const n = await btns.count();
    await btns.nth(mode === 'delete' ? n - 1 : n - 2).click();
    await p.waitForTimeout(4000);
    o = await order();
    ok(!o.some((x) => x && x.id === SC), `plugin ${mode}: folder removed`, o.slice(0, 2));
    ok(JSON.stringify(o) === JSON.stringify(base), 'rest of the order exactly as before');
    await L.shot(p, 'shortcut-' + mode);
    if (mode === 'off') { await btns.nth(n - 2).click(); await p.waitForTimeout(3000); console.log('turned back on'); }
    stop(); await ctx.close();
    console.log(`${res.filter(Boolean).length}/${res.length} passed`);
    process.exitCode = res.every(Boolean) ? 0 : 1;
  } catch (err) { console.error(err); process.exitCode = 1; }
})();
