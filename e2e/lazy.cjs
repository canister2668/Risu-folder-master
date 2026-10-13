// 코어 패치 없는 해적판에서: 창이 바로 뜨고, 봇 정보가 하나씩 채워지고, 다시 열면 저장분으로 바로 그린다.
const L = require('./lib.cjs');
const res = [];
const ok = (c, m, x) => { res.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + m + (x !== undefined ? ' :: ' + JSON.stringify(x).slice(0, 200) : '')); };
const fm = async (p) => { for (let i = 0; i < 60; i++) { for (const f of p.frames()) { if (f === p.mainFrame()) continue; try { if (await f.evaluate(() => !!document.querySelector('.fm-app'))) return f; } catch {} } await p.waitForTimeout(200); } return null; };
const openIcon = async (p) => { await p.click('.rs-sidebar-toggle-button'); await p.waitForTimeout(600); const t = Date.now(); await p.locator('.rs-sidebar-menu-popover button:has(svg[fill="#8ea2ff"])').first().click(); const F = await fm(p); const ms = Date.now() - t; await F.click('.fm-nav[data-view="__all__"]'); await p.waitForTimeout(300); return { F, ms }; };
(async () => {
  const { ctx, p } = await L.open(1280, 900); const stop = L.autoYes(p); await p.waitForTimeout(10000);
  let { F, ms } = await openIcon(p);
  ok(F && ms < 3000, 'window opens from the menu icon', ms);
  let t0 = Date.now(); let st;
  for (;;) { st = await F.evaluate(() => ({ loading: document.querySelectorAll('.fm-card.loading').length, cards: document.querySelectorAll('.fm-card').length, chip: document.querySelector('.fm-loading').textContent })); if (!st.loading || Date.now() - t0 > 60000) break; await p.waitForTimeout(500); }
  ok(st.cards >= 1 && st.loading === 0, `visible names filled one by one in ${Date.now() - t0} ms`, st);
  await F.click('[data-act="close"]'); await p.waitForTimeout(2500);
  ({ F, ms } = await openIcon(p)); await p.waitForTimeout(300);
  st = await F.evaluate(() => ({ loading: document.querySelectorAll('.fm-card.loading').length, cards: document.querySelectorAll('.fm-card').length }));
  ok(st.loading === 0, 'reopen uses the cached names', st);
  await L.shot(p, 'lazy-real');
  console.log(p.__logs.filter((x) => /PAGEERROR|folder-master/.test(x)).slice(-5).join('\n'));
  stop(); await ctx.close();
  process.exitCode = res.every(Boolean) ? 0 : 1;
})().catch((err) => { console.error(err); process.exitCode = 1; });
