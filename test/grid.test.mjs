import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';

// v3 SafeElement 흉내: 모든 메서드가 비동기, setAttribute 는 x- 만.
function fakeHost({ css = '', stored = null, mainDom = true } = {}) {
  const storage = new Map(stored ? [['risuFolderMaster.sidebarGrid', stored]] : []);
  const head = { kids: [] };
  const mk = () => {
    const el = { attrs: {}, html: '' };
    el.setAttribute = async (k, v) => { if (!k.startsWith('x-')) throw new Error('x- only'); el.attrs[k] = v; };
    el.setInnerHTML = async (v) => { el.html = v; };
    el.remove = async () => { head.kids = head.kids.filter((k) => k !== el); };
    return el;
  };
  const doc = {
    createElement: async () => mk(),
    querySelector: async (s) => (s === 'head' ? { appendChild: async (el) => head.kids.push(el) } : null),
    querySelectorAll: async () => { const items = head.kids.filter((k) => k.attrs['x-id'] === 'risu-folder-master-sidebar-grid'); return { length: async () => items.length, at: async (i) => items.at(i) }; },
  };
  const db = { customCSS: css };
  const Risuai = {
    pluginStorage: { getItem: async (k) => storage.get(k) ?? null, setItem: async (k, v) => storage.set(k, v) },
    getRootDocument: async () => (mainDom ? doc : null),
    getDatabase: async () => ({ ...db }),
    setDatabaseLite: async (p) => Object.assign(db, p),
  };
  return { Risuai, storage, head, db };
}

const files = ['src/core/util.js', 'src/sidebar/grid.js'];

test('grid CSS never contains < > & (v3 setInnerHTML runs DOMPurify)', () => {
  const g = load(files);
  for (const mode of ['all', 'folder']) for (const cols of [2, 3, 4, 5]) {
    const css = g.buildGridCSS(g.normalizeGrid({ mode, cols }));
    assert.ok(css.length > 100);
    assert.doesNotMatch(css, /[<>&]/);
  }
  assert.equal(g.buildGridCSS(g.normalizeGrid({ mode: 'off', cols: 3 })), '');
});

test('normalizeGrid clamps bad values', () => {
  const g = load(files);
  assert.deepEqual({ ...g.normalizeGrid({ mode: 'weird', cols: 9 }) }, { mode: 'off', cols: 5, align: false, motion: false, borderless: false });
  assert.deepEqual({ ...g.normalizeGrid(null) }, { mode: 'off', cols: 2, align: false, motion: false, borderless: false });
});

test('applyGrid adds one style, updates it, and removes it when off', async () => {
  const h = fakeHost();
  const g = load(files, { Risuai: h.Risuai });
  assert.ok(await g.applyGrid(g.normalizeGrid({ mode: 'all', cols: 3 })));
  assert.ok(await g.applyGrid(g.normalizeGrid({ mode: 'folder', cols: 4 })));
  assert.equal(h.head.kids.length, 1);
  assert.match(h.head.kids[0].html, /folder 4/);
  await g.applyGrid(g.normalizeGrid({ mode: 'off' }));
  assert.equal(h.head.kids.length, 0);
});

test('applyGrid reports missing main-DOM permission', async () => {
  const h = fakeHost({ mainDom: false });
  const g = load(files, { Risuai: h.Risuai });
  assert.equal(await g.applyGrid(g.normalizeGrid({ mode: 'all', cols: 3 })), false);
});

test('startSidebarGrid restores the stored setting without touching customCSS', async () => {
  const h = fakeHost({ stored: { mode: 'all', cols: 3 }, css: 'body{}' });
  const g = load(files, { Risuai: h.Risuai });
  const grid = await g.startSidebarGrid();
  assert.equal(grid.mode, 'all');
  assert.equal(h.head.kids.length, 1);
  assert.equal(h.db.customCSS, 'body{}');
});

test('migrateLegacyGrid moves the v3.07 customCSS block into plugin storage and strips it', async () => {
  const legacy = 'a{}\n\n/* [sidebar-grid-start] */\n/* sg-enabled:1 mode:folder cols:4 */\n.x{}\n/* [sidebar-grid-end] */\n\nb{}';
  const h = fakeHost({ css: legacy });
  const g = load(files, { Risuai: h.Risuai });
  const grid = await g.migrateLegacyGrid();
  assert.deepEqual({ ...grid }, { mode: 'folder', cols: 4, align: false, motion: false, borderless: false });
  assert.deepEqual(JSON.parse(JSON.stringify(h.storage.get('risuFolderMaster.sidebarGrid'))), { mode: 'folder', cols: 4, align: false, motion: false, borderless: false });
  assert.equal(h.db.customCSS, 'a{}\n\nb{}');
  assert.equal(await g.migrateLegacyGrid(), null);
});

test('migrateLegacyGrid keeps an existing new-style setting and reads disabled blocks as off', async () => {
  const h = fakeHost({ css: '/* [sidebar-grid-start] */\n/* sg-enabled:0 mode:all cols:2 */\n/* [sidebar-grid-end] */', stored: { mode: 'all', cols: 5 } });
  const g = load(files, { Risuai: h.Risuai });
  const grid = await g.migrateLegacyGrid();
  assert.equal(grid.mode, 'off');
  assert.deepEqual(h.storage.get('risuFolderMaster.sidebarGrid'), { mode: 'all', cols: 5 });
  assert.equal(h.db.customCSS, '');
});

test('single-column decorations survive restart and are removed only when all options are off', async () => {
  const h = fakeHost({ stored: { mode: 'off', cols: 4, align: true, motion: true, borderless: true }, css: 'body{}' });
  const g = load(files, { Risuai: h.Risuai });
  const grid = await g.startSidebarGrid();
  assert.equal(grid.mode, 'off');
  assert.equal(h.head.kids.length, 1);
  assert.match(h.head.kids[0].html, /fm-sidebar-folder-open/);
  assert.equal(h.db.customCSS, 'body{}');
  await g.applyGrid(g.normalizeGrid({ mode: 'off', motion: true }));
  assert.equal(h.head.kids.length, 1);
  assert.doesNotMatch(h.head.kids[0].html, /border-color:transparent/);
  await g.applyGrid(g.normalizeGrid(null));
  assert.equal(h.head.kids.length, 0);
});

test('every decoration combination is safe for the existing style injection path', () => {
  const g = load(files);
  for (const mode of ['off', 'all', 'folder']) for (const cols of [2, 3, 4, 5]) for (let bits = 0; bits < 8; bits++) {
    const css = g.buildGridCSS(g.normalizeGrid({ mode, cols, align: !!(bits & 1), motion: !!(bits & 2), borderless: !!(bits & 4) }));
    assert.doesNotMatch(css, /[<>&]/);
    assert.doesNotMatch(css, /outline\s*:/);
    assert.equal(css.includes('prefers-reduced-motion:no-preference'), !!(bits & 2));
    assert.equal(css.includes('border-color:transparent'), !!(bits & 4));
    assert.doesNotMatch(css, /character-list|hamburger-menu/);
  }
});
