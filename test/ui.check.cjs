// 실제 Chromium 에 빌드 결과를 올려 화면과 주요 흐름을 확인한다(가짜 Risuai).
const { chromium } = require('/volume2/risu/build/nai-studio/work/update-v5.3.1/browser/node_modules/playwright');
const fs = require('fs'); const path = require('path');
const dist = fs.readFileSync(path.join(__dirname, '../dist/risu-folder-master.plugin.js'), 'utf8');
const mock = fs.readFileSync(path.join(__dirname, 'mock-risuai.js'), 'utf8');
const results = []; const ok = (c, m, x) => { results.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + m + (x !== undefined ? ' :: ' + JSON.stringify(x).slice(0, 300) : '')); };
const shot = (p, n) => p.screenshot({ path: path.join(__dirname, 'shots', n + '.png') });

async function boot(b, viewport, legacy, opts = {}) {
  const p = await b.newPage({ viewport, hasTouch: viewport.width < 700, isMobile: viewport.width < 700 });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await p.setContent('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body></body></html>');
  if (legacy) await p.evaluate((c) => { window.__legacyCSS = c; }, legacy);
  if (opts.pre) await p.evaluate(opts.pre, opts.preArg);
  await p.addScriptTag({ content: mock }); await p.addScriptTag({ content: dist });
  await p.waitForFunction(() => window.__open);
  await p.evaluate(() => { window.__open(); }); await p.waitForSelector('.fm-card', { timeout: 1500 }); if (!opts.noWait) await p.waitForTimeout(600);
  return { p, errs };
}
const order = (p) => p.evaluate(() => window.__db.characterOrder.map((x) => (typeof x === 'string' ? x : `${x.name}[${x.data.join(',')}]`)));

(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  // ── 데스크톱
  let { p, errs } = await boot(b, { width: 1280, height: 860 }, 'a{}\n/* [sidebar-grid-start] */\n/* sg-enabled:1 mode:all cols:3 */\n/* [sidebar-grid-end] */');
  await shot(p, 'desktop-all');
  ok(await p.evaluate(() => document.querySelectorAll('.fm-ftile').length === 3 && document.querySelectorAll('.fm-card').length === 6), 'home shows folder tiles and only loose bots');
  ok(await p.evaluate(() => document.querySelectorAll('.fm-av img').length) >= 4, 'avatars lazy-loaded');
  ok(await p.evaluate(() => Math.max(...[...document.querySelectorAll('.fm-card')].map((c) => c.getBoundingClientRect().height))) <= 50, 'bot cards are compact', await p.evaluate(() => document.querySelector('.fm-card').getBoundingClientRect().height));
  await p.click('.fm-ftile[data-view="f-th"]'); await p.waitForTimeout(300);
  ok(await p.textContent('.fm-head h2') === '동방환유기', 'folder tile opens the folder');
  await p.click('.fm-head [data-act="back"]'); await p.waitForTimeout(300);
  ok(await p.textContent('.fm-head h2') === '모든 폴더', 'folder icon in the header goes back');
  await p.click('.fm-ftile[data-view="f-th"]'); await p.waitForTimeout(200);
  await p.click('.fm-rail .fm-nav[data-view="f-th"]'); await p.waitForTimeout(300);
  ok(await p.textContent('.fm-head h2') === '모든 폴더', 'tapping the open folder in the rail goes back');
  await p.click('.fm-ftile[data-view="f-th"]'); await p.waitForTimeout(200); await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  ok(await p.textContent('.fm-head h2') === '모든 폴더', 'Esc goes back to all folders');
  await p.waitForTimeout(400);
  ok(await p.evaluate(() => window.__db.customCSS === 'a{}' && document.querySelector('[data-grid-label]').textContent === '항상 3열'), 'legacy customCSS grid migrated');
  ok(await p.evaluate(() => window.__rootStyles.length === 1 && /all 3/.test(window.__rootStyles[0].html)), 'migrated grid applied to root document');

  // 선택 → 폴더로 옮기기
  await p.click('.fm-card[data-id="c10"]'); await p.click('.fm-card[data-id="c12"]', { modifiers: ['Shift'] });
  ok(await p.textContent('.fm-count') === '3개 선택', 'shift range select', await p.textContent('.fm-count'));
  await shot(p, 'desktop-selected');
  await p.click('[data-act="move"]'); await p.waitForSelector('.fm-picker'); await shot(p, 'desktop-picker');
  await p.click('[data-pick="f-abydos"]'); await p.click('[data-confirm-move]'); await p.waitForTimeout(500);
  ok((await order(p))[1] === '아비도스 대책위원회[c15,c16,c17,c18,c19,c10,c11,c12]', 'moved into folder', (await order(p))[1]);
  ok(await p.isVisible('.fm-toast button'), 'undo toast shown');
  await p.click('.fm-toast button'); await p.waitForTimeout(500);
  ok((await order(p))[1] === '아비도스 대책위원회[c15,c16,c17,c18,c19]', 'undo restored', (await order(p))[1]);

  // 새 폴더
  await p.click('.fm-card[data-id="c13"]'); await p.click('.fm-card[data-id="c14"]');
  await p.click('[data-act="new-folder"]'); await p.fill('.fm-modal input', '새 친구들'); await p.keyboard.press('Enter'); await p.waitForTimeout(500);
  ok((await order(p))[3] === '새 친구들[c13,c14]', 'new folder after last folder', await order(p));
  ok(await p.textContent('.fm-head h2') === '새 친구들', 'jumped to new folder view');
  await shot(p, 'desktop-folder');
  // 이름·색
  await p.click('[data-act="rename"]'); await p.fill('.fm-modal input', '새 친구'); await p.click('.fm-modal [data-ok]'); await p.waitForTimeout(400);
  await p.click('[data-act="color"]'); await shot(p, 'desktop-colors'); await p.click('[data-c="green"]'); await p.waitForTimeout(400);
  ok(await p.evaluate(() => { const f = window.__db.characterOrder.find((x) => x.name === '새 친구'); return f && f.color === 'green'; }), 'rename + recolor');
  // 위로
  await p.click('[data-act="folder-up"]'); await p.waitForTimeout(400);
  ok((await order(p))[2] === '새 친구[c13,c14]', 'folder moved up', await order(p));
  // 폴더 풀기
  await p.click('[data-act="unfold"]'); await p.click('.fm-modal [data-ok]'); await p.waitForTimeout(400);
  ok(!(await order(p)).some((x) => x.startsWith('새 친구')) && (await order(p)).includes('c13'), 'unfold spills bots', await order(p));

  // 검색
  await p.click('[data-view="__all__"]');
  await p.fill('.fm-search input', '유우'); await p.waitForTimeout(300);
  ok(await p.evaluate(() => [...document.querySelectorAll('.fm-card')].map((c) => c.dataset.id).join()) === 'c1', 'search filters');
  await p.fill('.fm-search input', '동방'); await p.waitForTimeout(300);
  ok(await p.evaluate(() => document.querySelectorAll('.fm-ftile').length === 1), 'folder-name search shows the folder tile');
  await shot(p, 'desktop-search');
  await p.fill('.fm-search input', ''); await p.waitForTimeout(300);

  // 순서 편집: 마우스로 봇을 레일 폴더에, 폴더 순서 바꾸기
  await p.click('[data-act="reorder"]'); await p.waitForTimeout(200);
  const drag = async (from, to, dx = 0, dy = 0) => {
    await p.locator(from).scrollIntoViewIfNeeded(); await p.locator(to).scrollIntoViewIfNeeded();
    const a = await p.locator(from).boundingBox(); const t = await p.locator(to).boundingBox();
    await p.mouse.move(a.x + a.width / 2, a.y + a.height / 2); await p.mouse.down();
    await p.mouse.move(a.x + a.width / 2 + 10, a.y + a.height / 2 + 10, { steps: 3 });
    await p.mouse.move(t.x + t.width / 2 + dx, t.y + t.height / 2 + dy, { steps: 8 }); await p.waitForTimeout(120);
    await p.mouse.up(); await p.waitForTimeout(200);
  };
  await drag('.fm-card[data-id="c20"]', '.fm-nav[data-folder="f-ba"]');
  await drag('.fm-nav[data-folder="f-th"]', '.fm-nav[data-folder="f-ba"]', 0, -8);
  await p.click('.fm-nav[data-folder="f-ba"]'); await p.waitForTimeout(200);
  await drag('.fm-card[data-id="c20"]', '.fm-card[data-id="c0"]', -30, 0);
  await shot(p, 'desktop-reorder');
  await p.click('[data-act="reorder-save"]'); await p.waitForTimeout(600);
  const o2 = await order(p);
  ok(o2[0].startsWith('동방환유기') && o2[1] === '블루 아카이브[c20,c0,c1,c2,c3,c4,c5,c6,c7,c8,c9]', 'reorder saved (folder order, into-folder, before-card)', o2);

  // 점검
  await p.click('[data-act="menu"]'); await p.click('[data-act="check"]'); await p.waitForSelector('.fm-report'); await shot(p, 'desktop-check');
  await p.click('[data-fix="ghosts"]'); await p.waitForTimeout(500);
  ok(!(await order(p)).join().includes('ghost-1'), 'ghost slot cleaned');

  // 사이드바
  await p.click('[data-act="sidebar"]'); await p.click('[data-mode="folder"]'); await p.click('[data-cols="4"]'); await shot(p, 'desktop-sidebar');
  await p.click('.fm-modal [data-ok]'); await p.waitForTimeout(300);
  ok(await p.evaluate(() => JSON.stringify(window.__store.get('risuFolderMaster.sidebarGrid')) === '{"mode":"folder","cols":4,"align":false,"motion":false,"borderless":false}' && window.__rootStyles.length === 1 && /folder 4/.test(window.__rootStyles[0].html)), 'sidebar grid saved to plugin storage + style updated');
  await p.click('[data-act="sidebar"]'); await p.click('[data-mode="off"]');
  for (const key of ['align', 'motion', 'borderless']) await p.click(`[data-decor="${key}"]`);
  await p.click('.fm-modal [data-ok]');
  ok(await p.evaluate(() => {
    const saved = window.__store.get('risuFolderMaster.sidebarGrid');
    return saved.mode === 'off' && saved.align && saved.motion && saved.borderless && window.__rootStyles.length === 1 && /fm-sidebar-folder-open/.test(window.__rootStyles[0].html);
  }), 'single-column decorations saved independently');
  await p.click('[data-act="sidebar"]');
  ok(await p.locator('[data-decor][aria-pressed="true"]').count() === 3 && await p.locator('[data-cols]:disabled').count() === 4, 'decoration toggles restored with column count disabled');
  await p.click('[data-decor="motion"]'); await p.click('.fm-modal [data-x]');
  ok(await p.evaluate(() => window.__store.get('risuFolderMaster.sidebarGrid').motion === true), 'cancel preserves saved decorations');
  for (const d of ['list', 'tiles']) { await p.click(`[data-display="${d}"]`); await p.waitForTimeout(300); await shot(p, 'desktop-' + d); }
  ok(errs.length === 0, 'no page errors (desktop)', errs);
  await p.close();

  // ── 아스트라 검토 반영분
  ({ p, errs } = await boot(b, { width: 1280, height: 860 }));
  await p.fill('.fm-search input', '동방'); await p.waitForTimeout(300);
  await p.click('.fm-ftile[data-view="f-th"]'); await p.waitForTimeout(300);
  ok(await p.evaluate(() => document.querySelector('.fm-search input').value === '' && document.querySelectorAll('.fm-card').length === 10), 'opening a folder from search clears the query');
  await p.click('.fm-nav[data-view="__root__"]'); await p.click('.fm-card[data-id="c10"]');
  ok(await p.isHidden('[data-act="to-root"]'), 'to-root hidden when only loose bots are selected');
  await p.click('.fm-nav[data-view="f-ba"]'); await p.waitForTimeout(200);
  ok((await p.textContent('.fm-count')).includes('다른 곳 1개'), 'selection elsewhere is shown', await p.textContent('.fm-count'));
  await p.click('.fm-card[data-id="c0"]');
  await p.click('[data-act="move"]'); await p.waitForSelector('.fm-picker');
  await p.fill('.fm-pick-search input', '아비'); await p.waitForTimeout(100);
  ok(await p.evaluate(() => [...document.querySelectorAll('.fm-pick')].filter((b) => !b.hidden).length === 1), 'picker search filters folders');
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  await p.click('[data-act="clear"]');
  await p.click('.fm-card[data-id="c1"]'); await p.click('[data-act="move"]'); await p.waitForSelector('.fm-picker');
  ok(await p.evaluate(() => document.querySelector('[data-pick="f-ba"]').disabled && document.querySelector('[data-pick="f-ba"] .fm-nav-count').textContent === '현재 위치'), 'current folder marked and disabled in picker');
  await p.keyboard.press('Escape'); await p.waitForTimeout(200); await p.click('[data-act="clear"]');
  await p.focus('.fm-card[data-id="c2"]'); await p.keyboard.press('Space');
  ok(await p.evaluate(() => document.querySelector('.fm-card[data-id="c2"]').getAttribute('aria-checked') === 'true'), 'Space toggles a focused card');
  await p.click('[data-act="clear"]');
  // 순서 편집 보호
  await p.click('[data-act="reorder"]'); await p.waitForTimeout(200);
  const a1 = await p.locator('.fm-card[data-id="c3"]').boundingBox(); const t1 = await p.locator('.fm-card[data-id="c0"]').boundingBox();
  await p.mouse.move(a1.x + 20, a1.y + 20); await p.mouse.down(); await p.mouse.move(a1.x + 40, a1.y + 30, { steps: 3 }); await p.mouse.move(t1.x + 10, t1.y + 20, { steps: 8 }); await p.waitForTimeout(150);
  ok(await p.evaluate(() => /앞|뒤/.test(document.querySelector('.fm-ghost-dest')?.textContent || '')), 'drag preview names the destination', await p.evaluate(() => document.querySelector('.fm-ghost-dest')?.textContent));
  await p.mouse.up(); await p.waitForTimeout(200);
  await p.click('[data-act="close"]'); await p.waitForTimeout(200);
  ok(await p.isVisible('.fm-modal') && (await p.textContent('.fm-modal h3')).includes('버릴까요'), 'closing with unsaved reorder asks first');
  await p.click('.fm-modal [data-x]'); await p.waitForTimeout(200);
  ok(await p.evaluate(() => document.querySelector('.fm-app').classList.contains('is-reorder')), 'keep editing after cancel');
  await p.click('[data-act="reorder-cancel"]'); await p.click('.fm-modal [data-ok]'); await p.waitForTimeout(200);
  ok(await p.evaluate(() => !document.querySelector('.fm-app').classList.contains('is-reorder')), 'discard leaves reorder mode');
  ok(errs.length === 0, 'no page errors (review fixes)', errs);
  await p.close();

  // ── 읽기 실패와 다시 읽기, 점검의 전체 확인 분리
  ({ p, errs } = await boot(b, { width: 1280, height: 860 }, '', { pre: () => { window.__single = true; window.__singleDelay = 40; window.__failIds = ['c11']; }, noWait: true }));
  await p.waitForTimeout(1500);
  ok(await p.evaluate(() => document.querySelector('.fm-card[data-id="c11"]').classList.contains('failed') && !!document.querySelector('.fm-card[data-id="c11"] [data-retry]')), 'failed read is shown with a retry button');
  await p.evaluate(() => { window.__failIds = []; }); await p.click('.fm-card[data-id="c11"] [data-retry]'); await p.waitForTimeout(600);
  ok(await p.evaluate(() => document.querySelector('.fm-card[data-id="c11"] .fm-name').textContent === '호시노'), 'retry reads it again');
  await p.click('[data-act="menu"]'); await p.click('[data-act="check"]'); await p.waitForSelector('.fm-modal');
  ok(await p.isVisible('[data-fix="full"]'), 'check offers a separate full scan on Haejeok');
  await p.click('.fm-modal [data-x]');
  ok(errs.length === 0, 'no page errors (failed reads)', errs);
  await p.close();

  // ── 아스트라 2차 검토 회귀
  // 해적판 판별 중 한 봇 읽기가 실패해도 전체 읽기로 넘어가지 않는다
  ({ p, errs } = await boot(b, { width: 1280, height: 860 }, '', { pre: () => { window.__single = true; window.__singleDelay = 30; window.__failIds = ['c0']; }, noWait: true }));
  await p.waitForTimeout(1500);
  ok(await p.evaluate(() => !window.__fullCalls), 'a failed probe read does not fall back to the full load', await p.evaluate(() => window.__fullCalls));
  ok(errs.length === 0, 'no page errors (probe failure)', errs);
  await p.close();
  // 기기 캐시만 있는 봇은 확인 전으로 본다 + 진행 창 Esc 는 중단 + 캐시 있는 실패 칸에도 다시 읽기
  const seedCache = await (async () => { const t = await b.newPage(); await t.addScriptTag({ content: mock }); const m = await t.evaluate(() => Object.fromEntries(window.__db.characters.map((c) => [c.chaId, { name: c.name, image: c.image, group: false, last: 0, assets: 0, modules: 0 }]))); await t.close(); return m; })();
  ({ p, errs } = await boot(b, { width: 1280, height: 860 }, '', { pre: (c) => { window.__single = true; window.__singleDelay = 250; window.__failIds = ['c12']; window.__localSeed = { 'risuFolderMaster.roster': c }; }, noWait: true, preArg: seedCache }));
  await p.waitForTimeout(1200);
  ok(await p.evaluate(() => !document.querySelector('.fm-card.loading')), 'cached names draw immediately');
  ok(await p.evaluate(() => !!document.querySelector('.fm-card[data-id="c12"] [data-retry]') && document.querySelector('.fm-card[data-id="c12"] .fm-warn')), 'cached bot whose refresh failed still offers retry');
  await p.click('[data-act="menu"]'); await p.click('[data-act="check"]'); await p.waitForSelector('.fm-modal');
  ok(await p.isVisible('[data-fix="full"]'), 'full check offered when only cached names are known');
  await p.click('[data-fix="full"]'); await p.waitForTimeout(400); await p.keyboard.press('Escape'); await p.waitForTimeout(600);
  ok((await p.textContent('.fm-toast')).includes('중단했습니다'), 'Esc during full check stops it', await p.textContent('.fm-toast'));
  await p.evaluate(() => { window.__failIds = []; window.__singleDelay = 30; });
  await p.click('.fm-nav[data-view="f-th"]'); await p.waitForTimeout(1500);
  ok((await p.textContent('.fm-head p')).includes('지워진 자리 1'), 'folder counts update once a deleted bot is found', await p.textContent('.fm-head p'));
  ok(errs.length === 0, 'no page errors (cache paths)', errs);
  await p.close();
  // 읽기가 끝나 카드가 바뀌어도 키보드 포커스 유지
  ({ p, errs } = await boot(b, { width: 1280, height: 860 }, '', { pre: () => { window.__single = true; window.__singleDelay = 900; }, noWait: true }));
  await p.waitForTimeout(400);
  await p.focus('.fm-card[data-id="c14"]');
  await p.waitForTimeout(3500);
  ok(await p.evaluate(() => document.activeElement?.dataset?.id === 'c14' && !document.activeElement.classList.contains('loading')), 'focus stays on the card after it loads', await p.evaluate(() => document.activeElement?.className));
  await p.close();

  // ── 키보드 순서 편집, 판별 실패 표시
  ({ p, errs } = await boot(b, { width: 1280, height: 860 }));
  await p.click('.fm-nav[data-view="f-ba"]'); await p.click('[data-act="reorder"]'); await p.waitForTimeout(200);
  await p.focus('.fm-card[data-id="c3"]'); await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(200);
  ok(await p.evaluate(() => [...document.querySelectorAll('.fm-card')].map((c) => c.dataset.id).slice(0, 4).join() === 'c0,c1,c3,c2' && document.activeElement.dataset.id === 'c3'), 'arrow keys move a bot and keep focus');
  await p.click('[data-act="reorder-save"]'); await p.waitForTimeout(500);
  ok((await order(p))[0].startsWith('블루 아카이브[c0,c1,c3,c2'), 'keyboard reorder saves', (await order(p))[0]);
  await p.close();
  ({ p, errs } = await boot(b, { width: 1280, height: 860 }, '', { pre: () => { window.__single = true; window.__probeFail = true; }, noWait: true }));
  await p.waitForTimeout(3500);
  ok(await p.evaluate(() => { const c = document.querySelector('.fm-loading'); return c.classList.contains('warn') && !c.disabled && !document.querySelector('.ghost-bot'); }), 'probe failure shows retry and marks nothing deleted');
  ok(await p.evaluate(() => !window.__fullCalls), 'probe failure does not fall back to the full load');
  await p.evaluate(() => { window.__probeFail = false; }); await p.click('.fm-loading'); await p.waitForTimeout(1500);
  ok(await p.evaluate(() => !document.querySelector('.fm-loading').classList.contains('warn') && !document.querySelector('.fm-card.loading')), 'retry recovers');
  ok(errs.length === 0, 'no page errors (keyboard/probe)', errs);
  await p.close();

  // ── 설정: 열 때 모두 읽기(해적판)
  ({ p, errs } = await boot(b, { width: 1280, height: 860 }, '', { pre: () => { window.__single = true; window.__singleDelay = 30; }, noWait: true }));
  await p.waitForTimeout(800);
  const before = await p.evaluate(() => window.__singleCalls);
  await p.click('[data-act="menu"]'); await p.click('[data-act="settings"]'); await p.waitForSelector('[data-load="all"]');
  await shot(p, 'desktop-settings');
  await p.click('[data-load="all"]'); await p.click('.fm-modal [data-ok]'); await p.waitForTimeout(1500);
  ok(await p.evaluate((b) => window.__singleCalls - b >= 20, before), 'turning on load-all reads every bot in the background', await p.evaluate((b) => window.__singleCalls - b, before));
  await p.click('[data-act="close"]'); await p.waitForTimeout(300);
  await p.evaluate(() => { window.__singleCalls = 0; window.__open(); }); await p.waitForTimeout(2000);
  ok(await p.evaluate(() => window.__singleCalls >= 25), 'load-all setting is remembered on reopen', await p.evaluate(() => window.__singleCalls));
  ok(errs.length === 0, 'no page errors (settings)', errs);
  await p.close();

  // ── 느린 서버: 창은 먼저 뜨고 이름은 나중에 채운다
  ({ p, errs } = await boot(b, { width: 1280, height: 860 }, '', { pre: () => { window.__slowChars = 2500; }, noWait: true }));
  ok(await p.evaluate(() => document.querySelectorAll('.fm-card.loading').length === 6 && document.querySelectorAll('.fm-ftile').length === 3 && document.querySelector('.fm-app').classList.contains('is-loading')), 'window opens before characters arrive');
  await p.waitForTimeout(3000);
  ok(await p.evaluate(() => !document.querySelector('.fm-card.loading') && document.querySelector('.fm-card[data-id="c10"] .fm-name').textContent === '치나츠'), 'names filled in after slow load');
  await p.close();
  // ── 해적판: 보이는 봇만 하나씩 읽고 기기에 저장
  ({ p, errs } = await boot(b, { width: 1280, height: 860 }, '', { pre: () => { window.__single = true; window.__slowChars = 600000; window.__singleDelay = 300; }, noWait: true }));
  await p.waitForTimeout(2500);
  ok(await p.evaluate(() => !document.querySelector('.fm-card.loading')), 'loose bots on the home screen filled');
  ok(await p.evaluate(() => window.__singleCalls) <= 10, 'bots inside closed folders are not read', await p.evaluate(() => window.__singleCalls));
  await p.click('.fm-ftile[data-view="f-th"]'); await p.waitForTimeout(400);
  ok(await p.evaluate(() => document.querySelector('.fm-loading').textContent.includes('불러오는 중')), 'progress chip while reading', await p.evaluate(() => document.querySelector('.fm-loading').textContent));
  await p.waitForTimeout(2500);
  ok(await p.evaluate(() => !document.querySelector('.fm-card.loading') && document.querySelector('.fm-card[data-id="ghost-1"]').classList.contains('ghost-bot')), 'opened folder filled, deleted one marked');
  await p.click('[data-act="close"]'); await p.waitForTimeout(1800);
  await p.evaluate(() => { window.__singleDelay = 5000; window.__open(); }); await p.waitForTimeout(500);
  if ((await p.textContent('.fm-head h2')) !== '동방환유기') { await p.click('.fm-nav[data-view="f-th"]'); await p.waitForTimeout(300); }
  ok(await p.evaluate(() => document.querySelectorAll('.fm-card.loading').length <= 1 && document.querySelector('.fm-card[data-id="c21"] .fm-name').textContent === '레이무'), 'reopen draws instantly from the device cache', await p.evaluate(() => document.querySelectorAll('.fm-card.loading').length));
  ok(errs.length === 0, 'no page errors (single)', errs);
  await p.close();

  // ── 모바일
  ({ p, errs } = await boot(b, { width: 390, height: 844 }));
  await shot(p, 'mobile-all');
  const ov = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(ov <= 0, 'no horizontal overflow on mobile', ov);
  await p.tap('.fm-card[data-id="c10"]'); await p.tap('.fm-card[data-id="c11"]'); await p.waitForTimeout(300);
  await shot(p, 'mobile-selected');
  ok(await p.evaluate(() => { const t = [...document.querySelectorAll('.fm-ftile')].map((e) => e.getBoundingClientRect()); return new Set(t.map((r) => Math.round(r.top))).size === 1 && t[0].height < 130; }), 'mobile folders sit side by side as icons', await p.evaluate(() => document.querySelector('.fm-ftile').getBoundingClientRect().height));
  await p.tap('.fm-nav[data-folder="f-th"]'); await p.waitForTimeout(300); await shot(p, 'mobile-folder');
  ok(await p.isVisible('[data-act="folder-more"]') && await p.isHidden('[data-act="rename"]'), 'mobile folder tools collapse into 더보기');
  await p.tap('[data-act="folder-more"]'); await p.waitForTimeout(200); await shot(p, 'mobile-more');
  ok(await p.evaluate(() => document.querySelectorAll('.fm-sheet .fm-btn').length === 7 && [...document.querySelectorAll('.fm-sheet .fm-btn')].some(b => b.textContent.includes('빠른 접근'))), 'more sheet lists labelled tools');
  await p.tap('.fm-modal [data-x]'); await p.waitForTimeout(200);
  // 길게 눌러 끌기(터치)
  await p.tap('[data-act="reorder"]'); await p.waitForTimeout(200);
  const cdp = await p.context().newCDPSession(p);
  const a = await p.locator('.fm-card[data-id="c22"]').boundingBox(); const t = await p.locator('.fm-card[data-id="c26"]').boundingBox();
  const tp = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  await tp('touchStart', a.x + a.width / 2, a.y + a.height / 2); await p.waitForTimeout(420);
  for (let i = 1; i <= 8; i++) await tp('touchMove', a.x + a.width / 2 + (t.x + t.width * 0.8 - a.x - a.width / 2) * i / 8, a.y + a.height / 2 + (t.y - a.y) * i / 8);
  await p.waitForTimeout(150); await shot(p, 'mobile-dragging'); await tp('touchEnd', 0, 0); await p.waitForTimeout(300);
  await p.tap('[data-act="reorder-save"]'); await p.waitForTimeout(600);
  const o3 = await order(p);
  ok(o3[2] === '동방환유기[c21,c23,c24,c25,c26,c22,c27,c28,c29,ghost-1]', 'touch long-press drag reorders', o3[2]);
  ok(errs.length === 0, 'no page errors (mobile)', errs);
  await b.close();
  const fail = results.filter((x) => !x).length;
  console.log(`\n${results.length - fail}/${results.length} passed`);
  process.exit(fail ? 1 : 0);
})();
