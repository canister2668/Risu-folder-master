// 소개글 스크린샷: 폴더 그림 고르기. 시험 서버 전용(showcase.cjs 로 꾸민 폴더 기준).
const L = require('./lib.cjs'); const path = require('path');
const OUT = path.join(__dirname, '..', 'docs', 'arca', 'shots');
const fm = async (p) => { for (let i = 0; i < 80; i++) { for (const f of p.frames()) { if (f === p.mainFrame()) continue; try { if (await f.evaluate(() => !!document.querySelector('.fm-app'))) return f; } catch {} } await p.waitForTimeout(200); } throw new Error('fm frame'); };
const openFM = async (p) => { await p.click('.rs-sidebar-toggle-button'); await p.waitForTimeout(600); await p.locator('.rs-sidebar-menu-popover button:has(svg[fill="#8ea2ff"])').first().click(); const F = await fm(p); await F.click('.fm-nav[data-view="__all__"]').catch(() => {}); await p.waitForTimeout(1200); return F; };
const PLAN = [['show-0', 'fantasy', null], ['show-1', 'daily', null], ['show-2', 'sim', '시뮬'], ['show-3', 'mystery', '추리호러'], ['show-4', 'archive', null]];
(async () => {
  try {
    const { ctx, p } = await L.open(1280, 860); const stop = L.autoYes(p); await p.waitForTimeout(9000);
    const F = await openFM(p);
    for (const [fid, tpl, text] of PLAN) {
      await F.click(`.fm-ftile[data-folder="${fid}"]`, { button: 'right' }); await p.waitForTimeout(400);
      if (fid === 'show-1') await p.screenshot({ path: path.join(OUT, '11_ctx.png') });
      await F.click('.fm-ctx [data-a="image"]'); await F.waitForSelector('.fm-ip'); await p.waitForTimeout(600);
      await F.click(`.fm-ip-tile[data-tpl="${tpl}"] >> nth=0`); await p.waitForTimeout(500);
      if (fid === 'show-0') await p.screenshot({ path: path.join(OUT, '12_picker.png') });
      if (text) {
        await F.click('[data-edit]'); await p.waitForTimeout(2500); await F.fill('[data-text]', text); await p.waitForTimeout(1500);
        if (fid === 'show-3') await p.screenshot({ path: path.join(OUT, '13_edit.png') });
      }
      await F.click('[data-apply]'); await p.waitForTimeout(2500);
    }
    await p.waitForTimeout(1500);
    await p.screenshot({ path: path.join(OUT, '14_home_icons.png') });
    stop(); await ctx.close();
  } catch (err) { console.error(err); process.exitCode = 1; }
  finally { setTimeout(() => process.exit(process.exitCode || 0), 500).unref?.(); }
})();
