// 즐겨찾기 폴더 그림을 바꾸면 실제 사이드바 폴더에 그 그림이 보이는지(시험 서버 전용).
const L = require('./lib.cjs');
const SC = 'risu-folder-master-favorites';
const res = []; const ok = (c, m, x) => { res.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + m + (x !== undefined ? ' :: ' + JSON.stringify(x).slice(0, 200) : '')); };
const fm = async (p) => { for (let i = 0; i < 60; i++) { for (const f of p.frames()) { if (f === p.mainFrame()) continue; try { if (await f.evaluate(() => !!document.querySelector('.fm-app'))) return f; } catch {} } await p.waitForTimeout(200); } return null; };
(async () => {
  try {
    const { ctx, p } = await L.open(1280, 900); const stop = L.autoYes(p); await p.waitForTimeout(9000);
    const seed = await L.seedFrame(p);
    const order = async () => (await seed.evaluate(async () => window.__fmDb(['characterOrder']))).characterOrder;
    const star = (await order()).find((x) => typeof x === 'string');
    await seed.evaluate(async (s) => Risuai.pluginStorage.setItem('risuFolderMaster.favorites', { stars: [s], pins: [], folder: { on: true } }), star);
    await p.waitForTimeout(3000);
    await p.click('.rs-sidebar-toggle-button'); await p.waitForTimeout(600); await p.locator('.rs-sidebar-menu-popover button:has(svg[fill="#8ea2ff"])').first().click();
    const F = await fm(p); await p.waitForTimeout(2500);
    await F.click('.fm-nav[data-view="__all__"]'); await p.waitForTimeout(300);
    await F.click('.fm-rail [data-view="__favorites__"]', { button: 'right' }); await p.waitForTimeout(700);
    await F.click('.fm-ctx [data-a="fav-image"]'); await F.waitForSelector('.fm-ip');
    await F.click('.fm-ip-tile[data-tpl="favorite"]'); await p.waitForTimeout(2500);
    await F.click('[data-apply]'); await p.waitForTimeout(4000);
    const o = await order();
    ok(o[0].id === SC && /^assets\//.test(o[0].imgFile || ''), 'folder imgFile saved as an asset', o[0].imgFile);
    await F.click('[data-act="close"]'); await p.waitForTimeout(2000);
    const side = await p.evaluate(() => { const g = document.querySelector('.rs-sidebar-scroll .group:not(.z-10)'); const bg = [...g.querySelectorAll('*')].map((e) => getComputedStyle(e).backgroundImage).find((b) => b && b !== 'none'); const img = g.querySelector('img'); return { bg: bg ? bg.slice(0, 60) : null, img: img ? img.src.slice(0, 60) : null }; });
    ok(side.bg || side.img, 'sidebar folder shows the picked image', side);
    await L.shot(p, 'shortcut-image');
    // 정리: 끄기
    await seed.evaluate(async () => Risuai.pluginStorage.setItem('risuFolderMaster.favorites', { stars: [], pins: [], folder: { on: false } }));
    stop(); await ctx.close();
    console.log(`${res.filter(Boolean).length}/${res.length} passed`);
    process.exitCode = res.every(Boolean) ? 0 : 1;
  } catch (err) { console.error(err); process.exitCode = 1; }
})();
