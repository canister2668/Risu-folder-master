// 소개글 스크린샷용: 시험 서버의 봇에 예시 이름·그림을 넣고 폴더를 꾸민 뒤 화면을 찍는다. 시험 서버 전용.
const L = require('./lib.cjs');
const fs = require('fs'); const path = require('path');
const OUT = path.join(__dirname, '..', 'docs', 'arca', 'shots');
fs.mkdirSync(OUT, { recursive: true });
const FOLDERS = [
  ['판타지', 'purple', ['엘프 궁수 리엔', '마왕성 집사 루드', '견습 마녀 모모', '용사 파티 길드', '드래곤 아가씨 이그니스', '성기사 세라', '떠돌이 음유시인']],
  ['일상', 'blue', ['소꿉친구 하린', '편의점 알바생', '카페 사장님 서윤', '동아리 선배 지후', '고양이 집사 생활', '룸메이트 유나']],
  ['시뮬레이션', 'green', ['도시 경영 시뮬', '던전 탐사대', '아이돌 매니저', '무인도 생존기']],
  ['추리·호러', 'red', ['탐정 사무소 K', '폐교 괴담', '밀실의 손님', '심야 라디오']],
  ['보관함', 'yellow', ['옛 봇 백업 1', '옛 봇 백업 2', '테스트용 봇']],
];
const LOOSE = ['새 봇 아리아', '우주 정거장 AI', '무협 객잔', '해적선 선장', '사이버 해커 제로', '왕궁 시녀장'];
const fm = async (p) => { for (let i = 0; i < 80; i++) { for (const f of p.frames()) { if (f === p.mainFrame()) continue; try { if (await f.evaluate(() => !!document.querySelector('.fm-app'))) return f; } catch {} } await p.waitForTimeout(200); } throw new Error('fm frame'); };
const openFM = async (p) => { await p.click('.rs-sidebar-toggle-button'); await p.waitForTimeout(600); await p.locator('.rs-sidebar-menu-popover button:has(svg[fill="#8ea2ff"])').first().click(); const F = await fm(p); return F; };
const shot = (p, n, clip) => p.screenshot({ path: path.join(OUT, n + '.png'), clip });
(async () => {
  try {
    let { ctx, p } = await L.open(1280, 860); let stop = L.autoYes(p); await p.waitForTimeout(9000);
    const seed = await L.seedFrame(p);
    if (!process.argv.includes('--no-seed')) {
      const imgs = fs.readdirSync(path.join(__dirname, 'showcase-avatars')).sort().map((f) => fs.readFileSync(path.join(__dirname, 'showcase-avatars', f)).toString('base64'));
      const r = await seed.evaluate(async ({ imgs, FOLDERS, LOOSE }) => {
        const db = await window.__fmDb(['characters', 'characterOrder']);
        const chars = db.characters; const names = FOLDERS.flatMap((f) => f[2]).concat(LOOSE);
        if (chars.length < names.length) return 'need ' + names.length + ' bots, have ' + chars.length;
        for (let i = 0; i < names.length; i++) {
          const bin = atob(imgs[i % imgs.length]); const u = new Uint8Array(bin.length); for (let k = 0; k < bin.length; k++) u[k] = bin.charCodeAt(k);
          chars[i].name = names[i]; chars[i].image = await Risuai.saveAsset(u);
        }
        await window.__fmSet({ characters: chars });
        return 'seeded ' + names.length;
      }, { imgs, FOLDERS, LOOSE });
      console.log(r);
      stop(); await ctx.close();
      ({ ctx, p } = await L.open(1280, 860)); stop = L.autoYes(p); await p.waitForTimeout(9000);
    }
    {
      const s2 = await L.seedFrame(p);
      const r = await s2.evaluate(async (FOLDERS) => {
        const db = await window.__fmDb(['characters', 'characterOrder']); const ids = db.characters.map((c) => c.chaId); const order = []; let k = 0;
        const keepImg = Object.fromEntries(db.characterOrder.filter((x) => typeof x === 'object').map((f) => [f.name, f.imgFile || '']));
        FOLDERS.forEach(([name, color, list], i) => { order.push({ id: 'show-' + i, name, color, data: ids.slice(k, k + list.length), imgFile: keepImg[name] || '' }); k += list.length; });
        order.push(...ids.slice(k, 30));
        await window.__fmSet({ characterOrder: order, customCSS: '' });
        await new Promise((r) => setTimeout(r, 3000));
        const after = (await window.__fmDb(['characterOrder'])).characterOrder;
        return after.filter((x) => typeof x === 'object').map((f) => f.name + ':' + f.data.length).join(', ');
      }, FOLDERS);
      console.log('order', r);
      stop(); await ctx.close();
      ({ ctx, p } = await L.open(1280, 860)); stop = L.autoYes(p); await p.waitForTimeout(9000);
    }
    // 1. 첫 화면
    let F = await openFM(p); await F.click('.fm-nav[data-view="__all__"]'); await p.waitForTimeout(2500);
    await shot(p, '01_home');
    // 2. 폴더 열고 고르기
    await F.click('.fm-ftile >> nth=0'); await p.waitForTimeout(1500);
    const cards = F.locator('.fm-card'); await cards.nth(1).click(); await cards.nth(3).click(); await cards.nth(4).click(); await p.waitForTimeout(600);
    await shot(p, '02_select');
    // 3. 옮길 폴더 고르기
    await F.click('[data-act="move"]'); await p.waitForTimeout(800);
    await shot(p, '03_move');
    await p.keyboard.press('Escape'); await p.waitForTimeout(400); await F.click('[data-act="clear"]').catch(() => {});
    // 4. 순서 편집
    await F.click('[data-act="back"]'); await p.waitForTimeout(800);
    await F.click('[data-act="reorder"]'); await p.waitForTimeout(1000);
    await shot(p, '04_reorder');
    await F.click('[data-act="reorder-cancel"]'); await p.waitForTimeout(600);
    // 5. 사이드바 3열
    await F.click('[data-act="sidebar"]'); await F.click('[data-mode="all"]'); await F.click('[data-cols="3"]'); await p.waitForTimeout(500);
    await shot(p, '05_sidebar_dialog');
    await F.click('.fm-modal [data-ok]'); await p.waitForTimeout(2000);
    await F.click('[data-act="close"]'); await p.waitForTimeout(1200);
    await shot(p, '06_sidebar_grid');
    // 6. 사이드바에서 찾기: 닫힌 폴더 안의 봇
    F = await openFM(p); await F.click('.fm-nav[data-view="show-1"]'); await p.waitForTimeout(1500);
    await F.click('.fm-card >> nth=2 >> .fm-loc'); await F.waitForSelector('.fm-modal [data-ok]');
    await F.click('.fm-modal [data-ok]'); await p.waitForTimeout(2200);
    await shot(p, '07_locate_folder');
    await p.locator('[x-fm-locate]:not([x-fm-locate="0"])').click(); await p.waitForTimeout(1200);
    await shot(p, '08_locate_bot');
    stop(); await ctx.close();
    // 7. 휴대폰
    ({ ctx, p } = await L.open(390, 844, '/tmp/fm-e2e-profile')); stop = L.autoYes(p); await p.waitForTimeout(9000);
    F = await openFM(p).catch(async (e) => { await shot(p, 'mob_fail'); throw e; });
    await F.click('.fm-nav[data-view="__all__"]').catch(() => {}); await p.waitForTimeout(2500);
    await shot(p, '09_mobile_home');
    stop(); await ctx.close();
    console.log(p.__logs.filter((x) => /PAGEERROR/.test(x)).slice(-5).join('\n'));
  } catch (err) { console.error(err); process.exitCode = 1; }
  finally { setTimeout(() => process.exit(process.exitCode || 0), 500).unref?.(); }
})();
