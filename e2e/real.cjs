// 실제 RisuAI(시험 서버)에서: 관리 화면 열기 → 사이드바 3열 적용 → customCSS 교체 → 새로고침 후 유지 → 봇 옮기기 저장.
const L = require('./lib.cjs');
const res = []; const ok = (c, m, x) => { res.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + m + (x !== undefined ? ' :: ' + JSON.stringify(x).slice(0, 300) : '')); };
const fmFrame = async (p, ms = 20000) => { const t0 = Date.now(); for (;;) { for (const f of p.frames()) { if (f === p.mainFrame()) continue; try { if (await f.evaluate(() => !!document.querySelector('.fm-app'))) return f; } catch {} } if (Date.now() - t0 > ms) throw new Error('fm frame'); await p.waitForTimeout(500); } };
const sidebar = (p) => p.evaluate(() => { const s = [...document.querySelectorAll('style')].filter((x) => x.getAttribute('x-id') === 'risu-folder-master-sidebar-grid'); const sb = document.querySelector('.rs-sidebar'); return { styles: s.length, text: s[0] ? s[0].textContent.slice(0, 60) : '', hasGt: s[0] ? /&gt;|&amp;/.test(s[0].textContent) : null, width: sb ? Math.round(sb.getBoundingClientRect().width) : 0 }; });
async function openFM(p) {
  await p.click('.rs-sidebar-toggle-button'); await p.waitForTimeout(700); await p.locator('.rs-sidebar-menu-popover button.ico').first().click(); await p.waitForTimeout(1200);
  const item = p.getByText('Risu 폴더 마스터', { exact: true }).first();
  try { await item.waitFor({ timeout: 8000 }); } catch (e) { await L.shot(p, 'real-openfail'); console.log((await p.evaluate(() => document.body.innerText)).slice(0, 600)); throw e; }
  await item.click(); const F = await fmFrame(p); await F.click('.fm-nav[data-view="__all__"]'); await p.waitForTimeout(300); return F;
}
(async () => {
  try {
  let { ctx, p } = await L.open(1280, 900); let stop = L.autoYes(p); await p.waitForTimeout(9000);
  const seed = await L.seedFrame(p);
  await seed.evaluate(() => window.__fmSet({ customCSS: '' }));
  // 앞선 시험이 봇을 옮겨 두었을 수 있으니 폴더 구성을 처음 상태(10·6·4 + 폴더 밖 10)로 되돌린다.
  await seed.evaluate(async () => { const db = await window.__fmDb(['characters', 'characterOrder']); const ids = db.characters.map((c) => c.chaId); const old = db.characterOrder.filter((x) => typeof x === 'object');
    const sizes = [10, 6, 4]; let k = 0; const order = old.slice(0, 3).map((f, i) => { const d = ids.slice(k, k + sizes[i]); k += sizes[i]; return { ...f, data: d }; }); order.push(...ids.slice(k)); await window.__fmSet({ characterOrder: order }); });
  await p.waitForTimeout(1000);
  let F = await openFM(p); await p.waitForTimeout(1500);
  ok(await F.evaluate(() => document.querySelector('.fm-brand small').textContent) === 'v' + require('../package.json').version, 'running the current build');
  ok(await F.evaluate(() => document.querySelectorAll('.fm-ftile').length >= 3 && document.querySelectorAll('.fm-card').length >= 1), 'manager shows folder tiles and loose bots in the real app');
  await L.shot(p, 'real-manager');
  await F.click('[data-act="sidebar"]'); await F.click('[data-mode="all"]'); await F.click('[data-cols="3"]'); await F.click('.fm-modal [data-ok]');
  await p.waitForTimeout(2500);
  await F.click('[data-act="close"]'); await p.waitForTimeout(800);
  let s = await sidebar(p);
  ok(s.styles === 1 && !s.hasGt && s.width > 200, 'grid style injected into main document', s);
  await L.shot(p, 'real-grid');
  // 테마 프리셋처럼 customCSS 를 통째로 바꾼다
  await seed.evaluate(() => window.__fmSet({ customCSS: '.theme-x{color:red}' })); await p.waitForTimeout(1200);
  s = await sidebar(p); ok(s.styles === 1 && s.width > 200, 'grid survives a customCSS replacement', s);
  stop(); await ctx.close();
  // 새로고침
  ({ ctx, p } = await L.open(1280, 900)); stop = L.autoYes(p); await p.waitForTimeout(10000);
  s = await sidebar(p); ok(s.styles === 1 && s.width > 200, 'grid restored after page reload', s);
  const seed2 = await L.seedFrame(p);
  ok(await seed2.evaluate(async () => (await window.__fmDb(['customCSS'])).customCSS) === '.theme-x{color:red}', 'customCSS untouched by the plugin');
  // 봇 하나를 폴더로 옮겨 실제 저장 확인
  F = await openFM(p); await p.waitForTimeout(1500);
  const root = await seed2.evaluate(async () => (await window.__fmDb(['characterOrder'])).characterOrder.filter((x) => typeof x === 'string'));
  const fid = await seed2.evaluate(async () => (await window.__fmDb(['characterOrder'])).characterOrder.find((x) => typeof x === 'object').id);
  await F.click(`.fm-card[data-id="${root[0]}"]`); await F.click('[data-act="move"]'); await F.click(`[data-pick="${fid}"]`); await p.waitForTimeout(2500);
  const after = await seed2.evaluate(async () => (await window.__fmDb(['characterOrder'])).characterOrder);
  ok(after.find((x) => x.id === fid).data.includes(root[0]) && !after.includes(root[0]), 'move saved to the real database');
  await L.shot(p, 'real-after-move');
  await F.click('[data-act="close"]'); await p.waitForTimeout(800);
  await L.shot(p, 'real-sidebar-after');
  console.log(p.__logs.filter((x) => /PAGEERROR|folder-master/.test(x)).slice(-10).join('\n'));
  stop(); await ctx.close();
  console.log(`${res.filter(Boolean).length}/${res.length} passed`);
  process.exitCode = res.every(Boolean) ? 0 : 1;
  } catch (err) { console.error(err); process.exitCode = 1; }
  finally { setTimeout(() => process.exit(process.exitCode || 0), 500).unref?.(); }
})();
