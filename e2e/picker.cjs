// 실제 RisuAI(시험 서버)에서 폴더 그림 고르기: 오른쪽 클릭 메뉴 → 템플릿 적용 / 글씨 바꾸기 → 사이드바 폴더 그림 확인.
// 템플릿 주소를 로컬 서버로 바꾼 시험판(FM_BUNDLE)을 시험 서버에 올린 뒤 돌린다.
const L = require('./lib.cjs');
const res = []; const ok = (c, m, x) => { res.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + m + (x !== undefined ? ' :: ' + JSON.stringify(x).slice(0, 300) : '')); };
const fm = async (p) => { for (let i = 0; i < 80; i++) { for (const f of p.frames()) { if (f === p.mainFrame()) continue; try { if (await f.evaluate(() => !!document.querySelector('.fm-app'))) return f; } catch {} } await p.waitForTimeout(200); } throw new Error('fm frame'); };
const openFM = async (p) => { await p.click('.rs-sidebar-toggle-button'); await p.waitForTimeout(600); await p.locator('.rs-sidebar-menu-popover button:has(svg[fill="#8ea2ff"])').first().click(); const F = await fm(p); await F.click('.fm-nav[data-view="__all__"]').catch(() => {}); await p.waitForTimeout(800); return F; };
(async () => {
  try {
    const { ctx, p } = await L.open(1280, 860); const stop = L.autoYes(p); await p.waitForTimeout(9000);
    const seed = await L.seedFrame(p);
    const folders = async () => (await seed.evaluate(async () => (await window.__fmDb(['characterOrder'])).characterOrder)).filter((x) => typeof x === 'object');
    const before = await folders();
    const f0 = before[0], f1 = before[1];
    let F = await openFM(p);
    await F.click(`.fm-ftile[data-folder="${f0.id}"]`, { button: 'right' }); await p.waitForTimeout(300);
    ok(await F.isVisible('.fm-ctx'), 'right-click menu in the real app');
    await F.click('.fm-ctx [data-a="image"]'); await F.waitForSelector('.fm-ip');
    await F.click('.fm-ip-tile[data-tpl="sf"]'); await p.waitForTimeout(300);
    await F.click('[data-apply]'); await p.waitForTimeout(3000);
    let after = await folders();
    const img0 = after.find((x) => x.id === f0.id).imgFile;
    ok(img0 && img0 !== f0.imgFile && img0.startsWith('assets/'), 'template saved as a RisuAI asset', img0);
    await L.shot(p, 'picker-real-after-template');
    // 글씨 바꾸기
    await F.click(`.fm-ftile[data-folder="${f1.id}"]`, { button: 'right' }); await p.waitForTimeout(300);
    await F.click('.fm-ctx [data-a="image"]'); await F.waitForSelector('.fm-ip');
    await F.click('.fm-ip-tile[data-tpl="school"]'); await F.click('[data-edit]'); await p.waitForTimeout(2500);
    await F.fill('[data-text]', '깃허브판'); await p.waitForTimeout(1500);
    ok(await F.evaluate(() => !!document.querySelector('[data-new] canvas')), 'blank board + font loaded in the real app');
    await L.shot(p, 'picker-real-edit');
    await F.click('[data-apply]'); await p.waitForTimeout(3000);
    after = await folders();
    const img1 = after.find((x) => x.id === f1.id).imgFile;
    ok(img1 && img1 !== f1.imgFile, 'edited sign saved', img1);
    await F.click('[data-act="close"]'); await p.waitForTimeout(1500);
    // 사이드바 폴더 칸에 그림이 보이는지
    const shown = await p.evaluate(() => [...document.querySelectorAll('.rs-sidebar img')].filter((i) => i.naturalWidth > 0).length);
    ok(shown >= 2, 'folder images render in the RisuAI sidebar', shown);
    await L.shot(p, 'picker-real-sidebar');
    console.log(p.__logs.filter((x) => /PAGEERROR|folder-master/.test(x)).slice(-6).join('\n'));
    stop(); await ctx.close();
  } catch (err) { console.error(err); process.exitCode = 1; }
  finally { console.log(`${res.filter(Boolean).length}/${res.length} passed`); if (!res.every(Boolean)) process.exitCode = 1; setTimeout(() => process.exit(process.exitCode || 0), 500).unref?.(); }
})();
