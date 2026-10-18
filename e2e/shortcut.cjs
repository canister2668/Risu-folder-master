// 사이드바 즐겨찾기 바로가기 폴더를 실제 앱(시험 서버)에서 확인한다.
const L = require('./lib.cjs');
const res = []; const ok = (c, m, x) => { res.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + m + (x !== undefined ? ' :: ' + JSON.stringify(x).slice(0, 260) : '')); };
const SC = 'risu-folder-master-favorites';
const fm = async (p) => { for (let i = 0; i < 60; i++) { for (const f of p.frames()) { if (f === p.mainFrame()) continue; try { if (await f.evaluate(() => !!document.querySelector('.fm-app'))) return f; } catch {} } await p.waitForTimeout(200); } return null; };
const openFM = async (p) => { await p.click('.rs-sidebar-toggle-button'); await p.waitForTimeout(600); await p.locator('.rs-sidebar-menu-popover button:has(svg[fill="#8ea2ff"])').first().click(); return fm(p); };
(async () => {
  try {
    const { ctx, p } = await L.open(1280, 900); const stop = L.autoYes(p); await p.waitForTimeout(10000);
    const seed = await L.seedFrame(p);
    const db = (k) => seed.evaluate(async (k) => (await window.__fmDb(k)), k);
    const cur = () => seed.evaluate(async () => { const i = await Risuai.getCurrentCharacterIndex(); const c = i >= 0 ? await Risuai.getCharacterFromIndex(i) : null; return c ? c.chaId : null; });
    // 지난 실행의 즐겨찾기를 비우고 새로 시작한다(플러그인 저장소는 모든 플러그인이 같이 쓴다).
    await seed.evaluate(async () => Risuai.pluginStorage.setItem('risuFolderMaster.favorites', { stars: [], pins: [], folder: { on: false } }));
    await p.waitForTimeout(3000);
    let { characterOrder: order, characters } = await db(['characterOrder', 'characters']);
    order = order.filter((x) => !(x && x.id === SC));
    await seed.evaluate(async (o) => window.__fmSet({ characterOrder: o }), order); await p.waitForTimeout(800);
    const nChars = characters.length;
    const rootIds = order.filter((x) => typeof x === 'string');
    const folder = order.find((x) => typeof x === 'object');
    const stars = [folder.data[1], rootIds.at(-1)];
    let F = await openFM(p); await p.waitForTimeout(1500);
    await F.click('.fm-nav[data-view="__all__"]'); await p.waitForTimeout(300);
    // 별표 2개(폴더 안 1, 폴더 밖 1)
    await F.click(`.fm-nav[data-view="${folder.id}"]`); await p.waitForTimeout(800);
    await F.hover(`.fm-card[data-id="${stars[0]}"]`); await F.click(`.fm-card[data-id="${stars[0]}"] [data-star]`); await p.waitForTimeout(600);
    await F.click('.fm-nav[data-view="__root__"]'); await p.waitForTimeout(800);
    await F.hover(`.fm-card[data-id="${stars[1]}"]`); await F.click(`.fm-card[data-id="${stars[1]}"] [data-star]`); await p.waitForTimeout(600);
    await F.click('.fm-nav[data-view="__favorites__"]'); await p.waitForTimeout(500);
    await F.click('[data-act="fav-folder-toggle"]'); await p.waitForTimeout(3000);
    let o = (await db(['characterOrder'])).characterOrder;
    ok(o[0] && o[0].id === SC && JSON.stringify(o[0].data) === JSON.stringify(stars), 'reference folder written first', o[0]);
    ok(JSON.stringify(o.slice(1)) === JSON.stringify(order), 'other folders/bots unchanged');
    ok((await db(['characters'])).characters.length === nChars, 'no bot copied', nChars);
    await L.shot(p, 'shortcut-fm');
    await F.click('[data-act="close"]'); await p.waitForTimeout(1500);
    // 사이드바: 맨 위 폴더, 끌기 막힘, 열어서 누르면 같은 봇
    const side = await p.evaluate(() => { const top = [...document.querySelectorAll('.rs-sidebar-scroll .group:not(.z-10)')]; const s = [...document.querySelectorAll('style')].find((x) => x.getAttribute('x-id') === 'risu-folder-master-favorites-guard'); return { tops: top.length, drag0: top[0] && getComputedStyle(top[0]).webkitUserDrag, drag1: top[1] && getComputedStyle(top[1]).webkitUserDrag, guard: !!s }; });
    ok(side.guard && side.drag0 === 'none' && side.drag1 !== 'none', 'sidebar guard: only the favorites folder is locked', side);
    await p.locator('.rs-sidebar-scroll .group:not(.z-10)').first().click(); await p.waitForTimeout(1200);
    await L.shot(p, 'shortcut-sidebar-open');
    const inside = p.locator('.rs-sidebar-scroll .group:not(.z-10)').first().locator('xpath=following-sibling::*[1]').locator('.group');
    ok(await inside.count() === 2, 'two bots inside the sidebar folder', await inside.count());
    await inside.nth(0).click(); await p.waitForTimeout(2500);
    ok(await cur() === stars[0], 'tapping it opens the same bot', { want: stars[0], got: await cur() });
    // 새로고침해도 RisuAI가 지우지 않는다
    await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForTimeout(10000);
    const seed2 = await L.seedFrame(p);
    o = (await seed2.evaluate(async () => window.__fmDb(['characterOrder']))).characterOrder;
    ok(o[0] && o[0].id === SC && o.length === order.length + 1, 'survives reload (RisuAI keeps it)', o.length);
    // 사이드바에서 이름을 바꾼 것처럼 → 폴더 마스터를 열면 되돌림
    await seed2.evaluate(async () => { const d = await window.__fmDb(['characterOrder']); if (d.characterOrder[0] && d.characterOrder[0].id === 'risu-folder-master-favorites') d.characterOrder[0].name = 'renamed'; await window.__fmSet({ characterOrder: d.characterOrder }); });
    F = await openFM(p); await p.waitForTimeout(2500);
    o = (await seed2.evaluate(async () => window.__fmDb(['characterOrder']))).characterOrder;
    ok(o[0].name === '⭐ 즐겨찾기', 'sidebar rename reverted', o[0].name);
    // 끄기 → 지움
    await F.click('.fm-nav[data-view="__all__"]'); await p.waitForTimeout(300);
    await F.click('.fm-nav[data-view="__favorites__"]'); await p.waitForTimeout(500);
    await F.click('[data-act="fav-folder-toggle"]'); await p.waitForTimeout(2500);
    o = (await seed2.evaluate(async () => window.__fmDb(['characterOrder']))).characterOrder;
    ok(!o.some((x) => x && x.id === SC) && JSON.stringify(o) === JSON.stringify(order), 'turning off restores the exact original order');
    console.log(p.__logs.filter((x) => /PAGEERROR|folder-master/.test(x)).slice(-6).join('\n'));
    stop(); await ctx.close();
    console.log(`${res.filter(Boolean).length}/${res.length} passed`);
    process.exitCode = res.every(Boolean) ? 0 : 1;
  } catch (err) { console.error(err); process.exitCode = 1; }
})();
