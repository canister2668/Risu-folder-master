// 사이드바에서 찾기: 강조된 칸을 누르면 그 봇이 열리는지 실제 앱에서 확인한다.
const L = require('./lib.cjs');
const res = []; const ok = (c, m, x) => { res.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + m + (x !== undefined ? ' :: ' + JSON.stringify(x).slice(0, 220) : '')); };
const fm = async (p) => { for (let i = 0; i < 60; i++) { for (const f of p.frames()) { if (f === p.mainFrame()) continue; try { if (await f.evaluate(() => !!document.querySelector('.fm-app'))) return f; } catch {} } await p.waitForTimeout(200); } return null; };
const openFM = async (p) => { await p.click('.rs-sidebar-toggle-button'); await p.waitForTimeout(600); await p.locator('.rs-sidebar-menu-popover button:has(svg[fill="#8ea2ff"])').first().click(); const F = await fm(p); await F.click('.fm-nav[data-view="__all__"]'); await p.waitForTimeout(300); return F; };
const marked = (p) => p.evaluate(() => { const els = [...document.querySelectorAll('[x-fm-locate]')].filter((e) => e.getAttribute('x-fm-locate') !== '0'); const s = [...document.querySelectorAll('style')].find((x) => x.getAttribute('x-id') === 'folder-master-locate'); return { n: els.length, outline: els[0] ? getComputedStyle(els[0]).outlineStyle : null, css: s ? s.textContent.length : 0 }; });
const fmHidden = (p) => p.evaluate(() => [...document.querySelectorAll('iframe')].every((f) => f.style.display === 'none' || !f.offsetParent || f.style.display === ''));
(async () => {
  try {
  const { ctx, p } = await L.open(1280, 900); const stop = L.autoYes(p); await p.waitForTimeout(10000);
  const seed = await L.seedFrame(p);
  const cur = () => seed.evaluate(async () => { const i = await Risuai.getCurrentCharacterIndex(); const c = i >= 0 ? await Risuai.getCharacterFromIndex(i) : null; return c ? c.name : null; });
  const order = await seed.evaluate(async () => (await window.__fmDb(['characterOrder'])).characterOrder);
  const names = await seed.evaluate(async () => Object.fromEntries((await window.__fmDb(['characters'])).characters.map((c) => [c.chaId, c.name])));
  // 1. 폴더 밖 봇
  const rootId = order.filter((x) => typeof x === 'string').at(-1);
  let F = await openFM(p); await p.waitForTimeout(1500);
  await F.click(`.fm-card[data-id="${rootId}"] .fm-loc`); await p.waitForTimeout(2500);
  let m = await marked(p); ok(m.n === 1 && m.outline === 'solid', 'loose bot highlighted in the sidebar', m);
  await L.shot(p, 'locate-root');
  await p.locator('[x-fm-locate]:not([x-fm-locate="0"])').click(); await p.waitForTimeout(2500);
  ok(await cur() === names[rootId], 'tapping the highlight opens that bot', { want: names[rootId], got: await cur() });
  // 2. 닫힌 폴더 안의 봇(폴더 3번째 봇)
  const folder = order.filter((x) => typeof x === 'object').at(-1); const inner = folder.data[2];
  F = await openFM(p); await p.waitForTimeout(1200);
  await F.click(`.fm-nav[data-view="${folder.id}"]`); await p.waitForTimeout(1500);
  await F.click(`.fm-card[data-id="${inner}"] .fm-loc`); await F.waitForSelector('.fm-modal [data-ok]');
  ok((await F.textContent('.fm-modal .fm-desc')).includes('강조됩니다'), 'closed folder: notice before leaving', await F.textContent('.fm-modal .fm-desc'));
  await F.click('.fm-modal [data-ok]'); await p.waitForTimeout(2500);
  m = await marked(p); ok(m.n === 1 && m.css > 124, 'closed folder highlighted', m);
  await L.shot(p, 'locate-folder-closed');
  await p.locator('[x-fm-locate]:not([x-fm-locate="0"])').click(); await p.waitForTimeout(1200);
  const hit = await p.evaluate(() => { const els = [...document.querySelectorAll('.rs-sidebar-scroll .rounded-lg.relative .group')]; const on = els.filter((e) => getComputedStyle(e).outlineStyle === 'solid'); return { on: on.length, idx: els.indexOf(on[0]) }; });
  ok(hit.on === 1 && hit.idx === 2, 'after opening the folder the bot is highlighted', hit);
  await L.shot(p, 'locate-folder-opened');
  await p.locator('.rs-sidebar-scroll .rounded-lg.relative .group').nth(2).click(); await p.waitForTimeout(2500);
  ok(await cur() === names[inner], 'that bot opens', { want: names[inner], got: await cur() });
  // 3. 열린 폴더 안의 다른 봇은 바로 강조
  const inner2 = folder.data[0];
  F = await openFM(p); await p.waitForTimeout(1200);
  await F.click(`.fm-nav[data-view="${folder.id}"]`); await p.waitForTimeout(800);
  await F.click(`.fm-card[data-id="${inner2}"] .fm-loc`); await p.waitForTimeout(2500);
  const hit2 = await p.evaluate(() => { const els = [...document.querySelectorAll('.rs-sidebar-scroll .rounded-lg.relative .group')]; return els.findIndex((e) => e.getAttribute('x-fm-locate') && e.getAttribute('x-fm-locate') !== '0'); });
  ok(hit2 === 0, 'bot in an open folder highlighted directly', hit2);
  console.log(p.__logs.filter((x) => /PAGEERROR/.test(x)).slice(-5).join('\n'));
  stop(); await ctx.close();
  console.log(`${res.filter(Boolean).length}/${res.length} passed`);
  process.exitCode = res.every(Boolean) ? 0 : 1;
  } catch (err) { console.error(err); process.exitCode = 1; }
})();
