// 1.0.7 기능: 내 라벨, 정리 마법사, 중복 봇, 배치 기록, 보관함 제안, 폴더 그림 한 번에, 통계, 명령 창, 최근 대화·라벨 사이드바 폴더.
const { chromium } = require('/volume2/risu/itemx-plugin/node_modules/playwright');
const fs = require('node:fs');
const path = require('node:path');
const results = [];
const ok = (c, m, x) => { results.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + m + (x !== undefined ? ' :: ' + JSON.stringify(x).slice(0, 300) : '')); };
const shot = (p, n) => p.screenshot({ path: path.join(__dirname, 'shots', 'plus-' + n + '.png') });
const DAY = 86400e3;
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const OLD = ['퀸즈', '엘리시온', '국세청', '학교생활', '비스트'];
const extra = () => [
  { chaId: 'c30', name: '아리스 v2.0', lastInteraction: Date.now() - 20 * DAY },
  { chaId: 'c31', name: '[동방] 치르노', lastInteraction: Date.now() - 3 * DAY, creator: 'Canister', tags: ['Touhou'] },
  { chaId: 'c32', name: '[동방] 루미아', lastInteraction: Date.now() - 4 * DAY, creator: 'Canister', tags: ['touhou'] },
  ...OLD.map((name, i) => ({ chaId: 'o' + i, name, lastInteraction: Date.now() - (100 + i) * DAY })),
];

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const errors = [];
  const boot = async (viewport, opts = {}) => {
    const page = await browser.newPage({ viewport, hasTouch: viewport.width < 700, isMobile: viewport.width < 700 });
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.setContent('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body></body></html>');
    await page.evaluate(([x, tpl, cur]) => { window.__extraChars = x; window.__tpl = tpl; window.__curIdx = cur; }, [extra(), opts.tpl || null, opts.cur ?? -1]);
    for (const file of ['mock-risuai.js', '../dist/risu-folder-master.plugin.js']) await page.addScriptTag({ content: fs.readFileSync(path.join(__dirname, file), 'utf8') });
    await page.waitForFunction(() => window.__open);
    await page.evaluate(() => window.__open());
    await page.waitForSelector('.fm-card:not(.loading)');
    await page.waitForTimeout(700);
    return page;
  };
  const order = (p) => p.evaluate(() => JSON.parse(JSON.stringify(window.__db.characterOrder)));
  const store = (p, k) => p.evaluate((key) => window.__store.get(key), k);
  const menu = async (p, act) => { await p.click('[data-act="menu"]'); await p.click(`.fm-menu [data-act="${act}"]`); await p.waitForTimeout(250); };
  const home = async (p) => { await p.click('.fm-rail [data-view="__all__"]'); await p.waitForTimeout(250); };

  try {
    const tpl = {};
    const src = fs.readFileSync(path.join(__dirname, '../src/ui/templates-data.js'), 'utf8');
    for (const m of src.matchAll(/"slug": "([^"]+)"/g)) tpl[m[1] + '.webp'] = PNG;
    const p = await boot({ width: 1280, height: 860 }, { tpl, cur: 12 });
    const original = await order(p);

    // ── ⑤ 보관함 띠 (오래된 봇 5개)
    ok(await p.isVisible('.fm-arch-banner'), 'archive banner shows for 5 old bots', await p.locator('.fm-arch-banner b').innerText().catch(() => ''));
    await shot(p, 'home');

    // ── ⑧ 라벨 칸은 처음엔 접혀 있다 → 펼치기
    ok(await p.locator('.fm-rail .fm-nav[data-label]').count() === 0 && await p.getAttribute('.fm-rail .fm-rail-fold', 'aria-expanded') === 'false', 'label section folded by default');
    await p.click('.fm-rail .fm-rail-fold'); await p.waitForTimeout(200);
    ok(await p.locator('.fm-rail .fm-nav[data-label]').count() === 5, 'unfold shows labels');
    // ── ⑧ 라벨: 봇 칸 🏷️ → 진행 중
    await p.hover('.fm-card[data-id="c10"]');
    await p.click('.fm-card[data-id="c10"] [data-tag]');
    await p.waitForSelector('.fm-lrows');
    await shot(p, 'label-picker');
    await p.click('.fm-lrows [data-lab="l-play"]');
    await p.click('.fm-modal [data-x]');
    await p.waitForTimeout(500);
    ok((await store(p, 'risuFolderMaster.labels'))?.tags?.c10?.includes('l-play'), 'label saved to server plugin storage');
    ok(await p.locator('.fm-card[data-id="c10"] .fm-lbl').count() === 1, 'card shows label chip');
    await p.click('.fm-rail [data-view="label:l-play"]'); await p.waitForTimeout(300);
    ok(await p.locator('.fm-scroll .fm-card').count() === 1 && (await p.textContent('.fm-head h2')).includes('진행 중'), 'label view lists the labelled bot');
    // 새 라벨
    await p.click('.fm-rail [data-act="label-new"]');
    await p.fill('.fm-lab-name', '정주행'); await p.fill('.fm-lab-emoji', '🔥'); await p.click('.fm-modal [data-ok]'); await p.waitForTimeout(400);
    const labels = await store(p, 'risuFolderMaster.labels');
    ok(labels.defs.some((d) => d.name === '정주행' && d.emoji === '🔥'), 'new label created');
    ok(await p.locator('.fm-rail .fm-nav[data-label]').count() === 6, 'rail lists six labels');
    // 접어도 보고 있는 라벨은 남고, 접기 상태는 기억한다
    ok((await p.textContent('.fm-head h2')).includes('진행 중'), 'still viewing the label');
    await p.click('.fm-rail .fm-rail-fold'); await p.waitForTimeout(200);
    ok(await p.locator('.fm-rail .fm-nav[data-label]').count() === 1, 'folded rail keeps the open label');
    ok((await p.evaluate(() => window.__local.get('risuFolderMaster.ui')))?.labelFold === true, 'fold state saved');
    await p.click('.fm-rail .fm-rail-fold'); await p.waitForTimeout(200);
    ok((await p.evaluate(() => window.__local.get('risuFolderMaster.ui')))?.labelFold === false, 'unfold state saved');
    // 「진행 중」은 하나만
    await menu(p, 'settings');
    await p.click('.fm-modal [data-lsolo="l-play"]');
    await p.click('.fm-modal [data-ok]'); await p.waitForTimeout(500);
    await home(p);
    await p.click('.fm-card[data-id="c11"]'); await p.click('[data-act="tag-selected"]'); await p.click('.fm-lrows [data-lab="l-play"]'); await p.click('.fm-modal [data-x]'); await p.waitForTimeout(500);
    let tags = (await store(p, 'risuFolderMaster.labels')).tags;
    ok(tags.c11?.includes('l-play') && !(tags.c10 || []).includes('l-play'), 'solo label moved to the newest bot', tags);
    await p.click('[data-act="clear"]');

    // ── ④ 정리 마법사: [동방] 2개 → 있는 폴더 동방환유기
    await menu(p, 'wizard');
    await p.waitForSelector('.fm-wz');
    await shot(p, 'wizard');
    const wzTitle = await p.locator('.fm-wz').first().innerText();
    ok(/동방환유기/.test(wzTitle) && /있는 폴더/.test(wzTitle), 'wizard suggests existing folder for [동방] bots', wzTitle);
    await p.click('.fm-modal [data-ok]'); await p.waitForTimeout(700);
    let o = await order(p);
    ok(o.find((x) => x.id === 'f-th').data.includes('c31') && o.find((x) => x.id === 'f-th').data.includes('c32'), 'wizard moved bots into folder');
    await p.click('.fm-toast button'); await p.waitForTimeout(600);
    ok(JSON.stringify(await order(p)) === JSON.stringify(original), 'wizard result can be undone in one step');
    // 창 위의 창: Esc 는 맨 위 창만 닫는다
    await menu(p, 'wizard'); await p.waitForSelector('.fm-wz');
    ok(true, 'wizard reopened');
    await p.keyboard.press('Escape'); await p.waitForTimeout(200);
    await p.click('.fm-rail [data-act="label-new"]'); await p.waitForSelector('.fm-lab-name');
    await p.keyboard.press('Escape'); await p.waitForTimeout(200);
    ok(await p.locator('.fm-modal').count() === 0, 'single modal closes with Esc');
    await p.hover('.fm-card[data-id="c12"]'); await p.click('.fm-card[data-id="c12"] [data-tag]'); await p.click('.fm-modal [data-new-label]'); await p.waitForSelector('.fm-lab-name');
    await p.keyboard.press('Escape'); await p.waitForTimeout(250);
    ok(await p.locator('.fm-modal').count() === 1 && await p.isVisible('.fm-lrows'), 'Esc in nested dialog closes only the top one');
    // 키보드로 체크해도 포커스가 남는다
    await p.focus('.fm-lrows [data-lab="l-later"]'); await p.keyboard.press('Enter'); await p.waitForTimeout(200);
    ok(await p.evaluate(() => document.activeElement?.dataset?.lab === 'l-later'), 'focus stays on the toggled row');
    await p.keyboard.press('Enter'); await p.waitForTimeout(200);
    await p.keyboard.press('Escape'); await p.waitForTimeout(200);
    // 제작자 기준
    await menu(p, 'wizard'); await p.click('[data-wz-mode="creator"]'); await p.waitForTimeout(300);
    ok(/Canister/.test(await p.locator('.fm-wz').first().innerText()), 'wizard creator mode');
    await p.keyboard.press('Escape');

    // ── ② 중복 봇: 아리스 / 아리스 v2.0 → 보관함
    await menu(p, 'dups');
    await p.waitForSelector('.fm-dupe');
    await shot(p, 'dups');
    ok(await p.locator('.fm-dupe').count() === 1 && await p.locator('.fm-dupe-row').count() === 2, 'duplicate group found');
    await p.click('.fm-modal [data-dup-archive]'); await p.waitForTimeout(700);
    o = await order(p);
    const arc = o.find((x) => typeof x === 'object' && x.name === '📦 보관함');
    ok(arc && arc.data.join() === 'c30', 'older duplicate moved to new archive folder', arc);
    ok((await store(p, 'risuFolderMaster.plus'))?.archive?.folderId === arc?.id, 'archive folder remembered');

    // ── ⑤ 보관함 옮기기
    await home(p);
    await p.click('.fm-arch-banner [data-act="archive"]');
    await p.waitForSelector('.fm-arch-row');
    await shot(p, 'archive');
    ok(await p.locator('.fm-arch-row').count() === 5, 'archive modal lists 5 old bots', await p.locator('.fm-arch-row').count());
    await p.click('.fm-modal [data-ok]'); await p.waitForTimeout(700);
    o = await order(p);
    ok(o.find((x) => x.id === arc.id).data.length === 6, 'old bots moved into existing archive folder');
    ok(!(await p.isVisible('.fm-arch-banner')), 'banner gone after archiving');

    // ── ③ 배치 기록 → 처음 기록으로
    await menu(p, 'snapshots');
    await p.waitForSelector('.fm-snap');
    await shot(p, 'snapshots');
    const n = await p.locator('.fm-snap').count();
    ok(n >= 5, 'snapshot entries recorded', n);
    await p.locator('.fm-snap').last().locator('[data-snap-go]').click();
    await p.click('.fm-modal [data-ok]'); await p.waitForTimeout(700);
    ok(JSON.stringify(await order(p)) === JSON.stringify(original), 'restore first snapshot gives the original order');
    await p.click('.fm-toast button'); await p.waitForTimeout(700);
    ok((await order(p)).some((x) => x.id === arc.id), 'restore can be undone');

    // ── ⑥ 폴더 그림 한 번에
    await menu(p, 'icons');
    await p.waitForSelector('.fm-bi');
    await shot(p, 'icons');
    const archiveCard = p.locator('.fm-bi', { hasText: '보관함' });
    ok(await archiveCard.locator('.fm-lrow.on').count() === 1, 'archive folder pre-checked with matching template');
    await p.click('.fm-modal [data-ok]'); await p.waitForTimeout(900);
    o = await order(p);
    ok(o.find((x) => x.id === arc.id).imgFile === 'img3', 'batch icon applied', o.find((x) => x.id === arc.id).imgFile);

    // ── ⑨ 통계
    await menu(p, 'stats');
    await p.waitForSelector('.fm-stat-row');
    await shot(p, 'stats');
    const folders = (await order(p)).filter((x) => typeof x === 'object').length;
    ok(await p.locator('.fm-stat-row').count() === folders + 1, 'stats has a row per folder plus root');
    await p.locator('.fm-stat-row').last().click(); await p.waitForTimeout(300);
    ok(await p.isVisible('.fm-arch-list'), 'stats row opens archive candidates');
    await p.keyboard.press('Escape');

    // ── ⑦ 명령 창
    await p.keyboard.press('Control+k'); await p.waitForSelector('.fm-palette');
    await shot(p, 'palette');
    await p.keyboard.type('유우카'); await p.waitForTimeout(150);
    ok(await p.locator('.fm-pal-op.on b').innerText() === '유우카', 'palette finds bot');
    await p.keyboard.press('Tab'); await p.waitForTimeout(100);
    ok(/할 일/.test(await p.locator('.fm-pal-g').first().innerText()), 'Tab shows bot actions');
    await p.keyboard.press('ArrowDown'); await p.keyboard.press('ArrowDown'); await p.keyboard.press('Enter'); await p.waitForTimeout(500);
    ok((await store(p, 'risuFolderMaster.favorites'))?.stars?.includes('c1'), 'palette action toggles favorite');
    await p.keyboard.press('Control+k'); await p.keyboard.type('통계'); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
    ok(await p.isVisible('.fm-stat-row'), 'palette runs command');
    await p.keyboard.press('Escape');

    // ── ① 최근 대화 폴더
    await menu(p, 'settings');
    await p.click('.fm-modal [data-sw="recent"]');
    await p.click('.fm-modal [data-ok]'); await p.waitForTimeout(1200);
    o = await order(p);
    ok(o[0].id === 'risu-folder-master-recent' && o[0].data[0] === 'c12', 'recent folder on top with current bot first', o[0]);
    await p.evaluate(() => { window.__curIdx = 13; });
    for (let i = 0; i < 40; i++) { o = await order(p); if (o[0]?.data?.[0] === 'c13') break; await p.waitForTimeout(250); }
    ok(o[0].data[0] === 'c13', 'switching bots updates recent folder', o[0].data.slice(0, 3));
    ok(await p.locator('.fm-folders .fm-ftile[data-folder="risu-folder-master-recent"]').count() === 0, 'recent folder is not shown as a normal folder');
    // 라벨 폴더(오른쪽 클릭)
    await p.locator('.fm-rail .fm-nav[data-label="l-play"]').click({ button: 'right' });
    await p.click('.fm-ctx [data-a="label-sidebar"]'); await p.waitForTimeout(900);
    o = await order(p);
    ok(o.some((x) => x.id === 'risu-folder-master-label' && x.data.join() === 'c11'), 'label sidebar folder', o.slice(0, 3).map((x) => x.id || x));
    ok(await p.evaluate(() => window.__rootStyles.some((s) => s['x-id'] === 'risu-folder-master-favorites-guard' && /-n\+2 of/.test(s.html))), 'drag guard covers both shortcut folders');
    // 점검이 바로가기 폴더를 겹침으로 보지 않는다
    await menu(p, 'check'); await p.waitForTimeout(400);
    ok(await p.locator('.fm-modal [data-fix="dups"]').count() === 0, 'shortcut folders not reported as duplicates');
    await p.keyboard.press('Escape');
    // 끄면 정리
    await menu(p, 'settings');
    await p.click('.fm-modal [data-sw="recent"]'); await p.click('.fm-modal [data-lfolder=""]');
    await p.click('.fm-modal [data-ok]'); await p.waitForTimeout(1000);
    o = await order(p);
    ok(!o.some((x) => typeof x === 'object' && x.id.startsWith('risu-folder-master-')), 'turning off removes shortcut folders');
    await shot(p, 'settings-after');

    // ── 휴대폰
    const m = await boot({ width: 390, height: 800 });
    await m.click('[data-act="menu"]'); await m.click('.fm-menu [data-act="palette"]'); await m.waitForSelector('.fm-palette');
    ok(await m.evaluate(() => document.querySelector('.fm-modal').getBoundingClientRect().right <= innerWidth + 1), 'mobile palette fits');
    await shot(m, 'mobile-palette');
    await m.keyboard.press('Escape');
    await m.click('[data-act="menu"]'); await m.click('.fm-menu [data-act="dups"]'); await m.waitForSelector('.fm-dupe');
    ok(await m.evaluate(() => document.querySelector('.fm-modal').scrollWidth <= document.querySelector('.fm-modal').clientWidth + 1), 'mobile duplicates fits width');
    await shot(m, 'mobile-dups');

    ok(errors.length === 0, 'no page errors', errors);
  } catch (err) {
    console.log(err);
    results.push(false);
  } finally {
    await browser.close();
    const pass = results.filter(Boolean).length;
    console.log(`${pass}/${results.length} passed`);
    process.exitCode = pass === results.length ? 0 : 1;
  }
})();
