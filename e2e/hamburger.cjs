// 사이드바 메뉴(햄버거)의 폴더 마스터 아이콘으로 여는지 확인한다.
const L = require('./lib.cjs');
(async () => {
  const { ctx, p } = await L.open(1280, 900); const stop = L.autoYes(p); await p.waitForTimeout(9000);
  await p.click('.rs-sidebar-toggle-button'); await p.waitForTimeout(700);
  const btn = p.locator('.rs-sidebar-menu-popover button:has(svg[fill="#8ea2ff"])').first();
  console.log('icon buttons:', await p.locator('.rs-sidebar-menu-popover button:has(svg[fill="#8ea2ff"])').count());
  const t0 = Date.now(); await btn.click();
  let shown = false;
  for (let i = 0; i < 40 && !shown; i++) { for (const f of p.frames()) { if (f === p.mainFrame()) continue; try { if (await f.evaluate(() => !!document.querySelector('.fm-app'))) shown = true; } catch {} } if (!shown) await p.waitForTimeout(250); }
  console.log(shown ? `PASS opened from the menu icon in ${Date.now() - t0} ms` : 'FAIL not opened');
  await L.shot(p, 'hamburger-open');
  stop(); await ctx.close();
})();
