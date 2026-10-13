// 사이드바 그리드 CSS를 실제 사이드바에 넣어 칸 배치를 잰다.
const L = require('./lib.cjs'); const fs = require('fs'); const vm = require('vm');
const ctx0 = {}; vm.createContext(ctx0);
for (const f of ['../src/core/util.js', '../src/sidebar/grid.js']) vm.runInContext(fs.readFileSync(require('path').join(__dirname, f), 'utf8'), ctx0);
(async () => {
  const { ctx, p } = await L.open(); const stop = L.autoYes(p); await p.waitForTimeout(8000);
  const measure = () => p.evaluate(() => {
    const sb = document.querySelector('.rs-sidebar'); const sc = sb.querySelector('.rs-sidebar-scroll');
    const items = [...sc.querySelectorAll('.group.relative.flex.items-center.px-2')].filter((e) => e.getBoundingClientRect().height > 0);
    const rows = new Map(); for (const e of items) { const r = e.getBoundingClientRect(); const y = Math.round(r.top); rows.set(y, (rows.get(y) || 0) + 1); }
    return { sidebar: Math.round(sb.getBoundingClientRect().width), scrollW: sc.scrollWidth, clientW: sc.clientWidth, rows: [...rows.values()].slice(0, 8) };
  });
  const set = async (grid) => { const css = ctx0.buildGridCSS(ctx0.normalizeGrid(grid)); if (/[<>&]/.test(css)) throw new Error('css has <>&'); await p.evaluate((css) => { let s = document.getElementById('fmlab'); if (!s) { s = document.createElement('style'); s.id = 'fmlab'; document.head.appendChild(s); } s.textContent = css; }, css); await p.waitForTimeout(500); };
  for (const g of [{ mode: 'all', cols: 3 }, { mode: 'all', cols: 2 }, { mode: 'folder', cols: 3 }]) {
    await set(g); console.log('closed', JSON.stringify(g), JSON.stringify(await measure())); await L.shot(p, `grid-${g.mode}${g.cols}-closed`);
    const folder = p.locator('.rs-sidebar-scroll .group.relative.flex.items-center.px-2').first();
    await folder.click(); await p.waitForTimeout(800);
    console.log('open  ', JSON.stringify(g), JSON.stringify(await measure())); await L.shot(p, `grid-${g.mode}${g.cols}-open`);
    await folder.click(); await p.waitForTimeout(600);
  }
  stop(); await ctx.close();
})();
