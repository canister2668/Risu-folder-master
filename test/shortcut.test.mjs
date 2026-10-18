import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';

const o = load(['src/core/util.js', 'src/core/order.js', 'src/core/shortcut.js']);
const plain = (v) => JSON.parse(JSON.stringify(v));
const SC = (data, extra = {}) => ({ id: 'risu-folder-master-favorites', name: '⭐ 즐겨찾기', data, color: 'yellow', imgFile: '', ...extra });
const base = () => [{ id: 'f1', name: 'A', data: ['a', 'b'], color: 'red', imgFile: '' }, 'c', 'd'];
const on = (stars, extra = {}) => ({ on: true, stars, ...extra });

test('withShortcut puts a reference folder first and never copies bots elsewhere', () => {
  const r = plain(o.withShortcut(base(), on(['c', 'a'])));
  assert.deepEqual(r[0], { ...SC(['c', 'a']), img: '' });
  assert.deepEqual(r.slice(1), base());
});

test('withShortcut skips deleted bots, removes the folder when off or empty', () => {
  assert.deepEqual(plain(o.withShortcut(base(), on(['zz']))), base());
  assert.deepEqual(plain(o.withShortcut([SC(['a']), ...base()], { on: false, stars: ['a'] })), base());
  assert.deepEqual(plain(o.withShortcut(base(), on([]))), base());
});

test('shortcutBase strips the folder; edits made in the sidebar do not leak into the base', () => {
  const raw = [SC(['a', 'c'], { name: 'renamed', color: 'red' }), ...base()];
  assert.deepEqual(plain(o.shortcutBase(raw, base())), base());
});

test('a bot dragged into the shortcut folder in the sidebar goes back to where it was', () => {
  // b was moved from f1 into the shortcut folder
  const raw = [SC(['a', 'b']), { id: 'f1', name: 'A', data: ['a'], color: 'red', imgFile: '' }, 'c', 'd'];
  assert.deepEqual(plain(o.shortcutBase(raw, base())), base());
  // without history it lands in the root
  assert.deepEqual(plain(o.shortcutBase(raw, null)), [{ id: 'f1', name: 'A', data: ['a'], color: 'red', imgFile: '' }, 'c', 'd', 'b']);
});

test('a bot dragged out of the shortcut folder keeps only its original place', () => {
  const raw = [SC(['a']), { id: 'f1', name: 'A', data: ['a', 'b'], color: 'red', imgFile: '' }, 'c', 'a', 'd'];
  assert.deepEqual(plain(o.shortcutBase(raw, base())), base());
  // duplicates that already existed before are left for the cleanup check
  const dupBefore = [...base(), 'a'];
  assert.deepEqual(plain(o.shortcutBase(dupBefore, dupBefore)), dupBefore);
});

test('keepShortcutImg keeps the host-filled image only for the same file', () => {
  const next = o.withShortcut(base(), on(['a'], { imgFile: 'x.png' }));
  const kept = plain(o.keepShortcutImg(next, [SC(['a'], { imgFile: 'x.png', img: 'blob:1' })]));
  assert.equal(kept[0].img, 'blob:1');
  const changed = plain(o.keepShortcutImg(o.withShortcut(base(), on(['a'], { imgFile: 'y.png' })), [SC(['a'], { imgFile: 'x.png', img: 'blob:1' })]));
  assert.equal(changed[0].img, undefined);
});
