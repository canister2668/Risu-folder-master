// 공식 RisuAI(kwaroran main)와 해적 b7487 사이드바 구조를 본뜬 화면에서 사이드바 배열·찾기를 확인한다.
// 클래스 조합은 각 판의 Sidebar.svelte 를 옮겨 왔다(공식판은 스크롤 칸에 rs-sidebar-scroll 이 없다).
const { chromium } = require('/volume2/risu/build/nai-studio/work/update-v5.3.1/browser/node_modules/playwright');
const fs = require('fs'); const path = require('path');
const src = ['src/core/util.js', 'src/core/order.js', 'src/sidebar/grid.js', 'src/sidebar/locate.js'].map((f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n');
const results = []; const ok = (c, m, x) => { results.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + m + (x !== undefined ? ' :: ' + JSON.stringify(x) : '')); };

// SafeElement 흉내: 모든 메서드 비동기, querySelectorAll·getChildren 은 length()/at() 배열.
const adapter = `(() => {
  const arr = (list) => ({ length: async () => list.length, at: async (i) => wrap(list[i]) });
  const wrap = (el) => el && ({
    querySelector: async (s) => wrap(el.querySelector(s)), querySelectorAll: async (s) => arr([...el.querySelectorAll(s)]),
    getChildren: async () => arr([...el.children]), hasClass: async (c) => el.classList.contains(c),
    setAttribute: async (k, v) => { if (!k.startsWith('x-')) throw new Error('x- only'); el.setAttribute(k, v); },
    setInnerHTML: async (v) => { if (/[<>&]/.test(v)) throw new Error('css has < > &'); el.textContent = v; },
    remove: async () => el.remove(), appendChild: async (c) => el.appendChild(c.__el), scrollIntoView: async () => {}, __el: el,
  });
  window.Risuai = { getRootDocument: async () => ({ ...wrap(document.documentElement), createElement: async (t) => { const e = document.createElement(t); return { ...wrap(e), __el: e }; } }) };
})();`;

// order: [폴더 F1(봇 a,b,c), 봇 r1, 폴더 F2(봇 d), 봇 r2]
function fixture(kind, openF1) {
  const scrollCls = kind === 'haejeok' ? 'rs-sidebar-scroll flex grow w-full flex-col items-center overflow-x-hidden overflow-y-auto pr-0' : 'flex grow w-full flex-col items-center overflow-x-hidden overflow-y-auto pr-0';
  const gap = '<div class="h-4 min-h-4 w-14" role="listitem"></div>';
  const item = (label) => `<div class="group relative flex items-center px-2" data-label="${label}"><div><span class="avatar" style="display:block;width:56px;height:56px">${label}</span></div></div>`;
  const box = (labels) => `<div class="p-1 flex flex-col items-center py-1 mt-1 rounded-lg relative"><div class="absolute top-0 left-1 border w-full h-full rounded-lg z-0"></div><div class="h-4 min-h-4 w-14 relative z-10"></div>${labels.map((l) => `<div class="group relative flex items-center px-2 z-10" data-label="${l}"><span style="display:block;width:56px;height:56px">${l}</span></div><div class="h-4 min-h-4 w-14 relative z-20"></div>`).join('')}</div>`;
  return `<div class="h-full w-20 min-w-20 flex-col items-center relative rs-sidebar" style="width:80px;display:flex;flex-direction:column">
    <div class="${scrollCls}" style="display:flex;flex-direction:column">${gap}${item('F1')}${openF1 ? box(['a', 'b', 'c']) : ''}${gap}${item('r1')}${gap}${item('F2')}${gap}${item('r2')}${gap}<div class="flex flex-col items-center gap-2 px-2">+</div></div></div>`;
}
const order = [{ id: 'F1', name: 'F1', data: ['a', 'b', 'c'] }, 'r1', { id: 'F2', name: 'F2', data: ['d'] }, 'r2'];

(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  for (const kind of ['official', 'haejeok']) {
    for (const openF1 of [false, true]) {
      const p = await b.newPage();
      await p.setContent(`<!doctype html><html><head></head><body>${fixture(kind, openF1)}</body></html>`);
      await p.addScriptTag({ content: adapter }); await p.addScriptTag({ content: src });
      const tag = `${kind}${openF1 ? ' (F1 open)' : ''}`;
      const r1 = await p.evaluate(async (o) => { const doc = await Risuai.getRootDocument(); const f = await findSidebarTarget(doc, o, { id: 'r1', folder: null }, () => true); return f.error || f.el.__el.dataset.label; }, order);
      ok(r1 === 'r1', `${tag}: loose bot found`, r1);
      const fb = await p.evaluate(async (o) => { const doc = await Risuai.getRootDocument(); const f = await findSidebarTarget(doc, o, { id: 'b', folder: 'F1' }, () => true); return f.error || { label: f.el.__el.dataset.label, closed: f.folderClosed, k: f.childIndex }; }, order);
      ok(openF1 ? fb.label === 'b' && !fb.closed : fb.label === 'F1' && fb.closed && fb.k === 1, `${tag}: bot inside folder`, fb);
      const gone = await p.evaluate(async (o) => { const doc = await Risuai.getRootDocument(); const f = await findSidebarTarget(doc, o, { id: 'r2', folder: null }, (id) => id !== 'r1'); return f.mismatch === true; }, order);
      ok(gone, `${tag}: count mismatch stops instead of guessing`);
      const w = await p.evaluate(async () => { const r = await applyGrid(normalizeGrid({ mode: 'all', cols: 3 })); return { r, w: document.querySelector('.rs-sidebar').getBoundingClientRect().width, dir: getComputedStyle(document.querySelector('.rs-sidebar .overflow-y-auto')).flexWrap }; });
      ok(w.r === 'ok' && w.w > 200 && w.dir === 'wrap', `${tag}: sidebar grid applies`, w);
      if (!openF1) {
        // 닫힌 폴더 강조 → 폴더를 열면 그 봇에 테두리
        await p.evaluate(async (o) => { const doc = await Risuai.getRootDocument(); const f = await findSidebarTarget(doc, o, { id: 'b', folder: 'F1' }, () => true); await markSidebarTarget(doc, f); }, order);
        await p.evaluate(() => { const f1 = document.querySelector('[data-label="F1"]'); f1.insertAdjacentHTML('afterend', '<div class="p-1 flex flex-col items-center py-1 mt-1 rounded-lg relative"><div class="absolute"></div><div class="h-4"></div><div class="group relative flex items-center px-2 z-10" data-label="a"></div><div class="h-4"></div><div class="group relative flex items-center px-2 z-10" data-label="b"></div><div class="h-4"></div><div class="group relative flex items-center px-2 z-10" data-label="c"></div></div>'); });
        const hit = await p.evaluate(() => [...document.querySelectorAll('[data-label]')].filter((e) => getComputedStyle(e).outlineStyle === 'solid').map((e) => e.dataset.label + ':' + getComputedStyle(e).outlineWidth));
        ok(hit.join() === 'F1:1px,b:3px', `${tag}: opening the folder highlights the bot`, hit);
      }
      await p.close();
    }
  }
  await b.close();
  const fail = results.filter((x) => !x).length;
  console.log(`\n${results.length - fail}/${results.length} passed`);
  process.exit(fail ? 1 : 0);
})();
