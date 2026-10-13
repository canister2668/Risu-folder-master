// 소개글 스크린샷: 휴대폰 화면. showcase.cjs 다음에 돌린다. 시험 서버 전용.
const L = require('./lib.cjs'); const path = require('path');
const OUT = path.join(__dirname, '..', 'docs', 'arca', 'shots');
const fm = async (p) => { for (let i = 0; i < 80; i++) { for (const f of p.frames()) { if (f === p.mainFrame()) continue; try { if (await f.evaluate(() => !!document.querySelector('.fm-app'))) return f; } catch {} } await p.waitForTimeout(200); } throw new Error('fm frame'); };
(async () => {
  try {
    const { ctx, p } = await L.open(390, 844); const stop = L.autoYes(p); await p.waitForTimeout(9000);
    await p.mouse.click(22, 35); await p.waitForTimeout(1200);
    await p.click('.rs-sidebar-toggle-button'); await p.waitForTimeout(700);
    await p.locator('.rs-sidebar-menu-popover button:has(svg[fill="#8ea2ff"])').first().click();
    const F = await fm(p); await p.waitForTimeout(800);
    await F.click('.fm-nav[data-view="__all__"]').catch(() => {}); await p.waitForTimeout(2500);
    await p.screenshot({ path: path.join(OUT, '09_mobile_home.png') });
    await F.click('.fm-ftile >> nth=0'); await p.waitForTimeout(2000);
    await p.screenshot({ path: path.join(OUT, '10_mobile_folder.png') });
    await F.click('[data-act="back"]').catch(() => {});
    stop(); await ctx.close();
  } catch (err) { console.error(err); process.exitCode = 1; }
  finally { setTimeout(() => process.exit(process.exitCode || 0), 500).unref?.(); }
})();
