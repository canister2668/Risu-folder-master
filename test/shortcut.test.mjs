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

// PocketRisu 캐릭터 관리자 끌기: 겹친 ID를 앞의 것만 남겨 바로가기 폴더에 든 봇이 원래 폴더에서 모두 빠진다.
test('bots stripped from their folders by a keep-first dedupe go back home from the saved history', () => {
  const home = [{ id: 'f1', name: 'A', data: ['a', 'b'], color: 'red', imgFile: '' }, { id: 'f2', name: 'B', data: ['c', 'd'], color: '', imgFile: '' }, 'e'];
  const raw = [SC(['b', 'c']), { id: 'f1', name: 'A', data: ['a'], color: 'red', imgFile: '' }, { id: 'f2', name: 'B', data: ['d'], color: '', imgFile: '' }, 'e'];
  assert.deepEqual(plain(o.shortcutBase(raw, home)), home);
});

test('a folder removed because its last bot was dragged into a shortcut folder is recreated in place', () => {
  const home = ['x', { id: 'f1', name: 'A', data: ['a'], color: 'red', imgFile: 'i.png', img: 'blob:9' }, 'c'];
  // stock RisuAI deletes the empty folder f1
  const raw = [SC(['a']), 'x', 'c'];
  assert.deepEqual(plain(o.shortcutBase(raw, home)), home);
  // the folder was first in the list
  const home2 = [{ id: 'f1', name: 'A', data: ['a', 'b'], color: '', imgFile: '' }, 'c'];
  assert.deepEqual(plain(o.shortcutBase([SC(['a', 'b']), 'c'], home2)), home2);
});

test('without history a bot found once in a folder and again in the root keeps the folder copy', () => {
  const raw = [SC(['c']), { id: 'f1', name: 'A', data: ['a', 'b'], color: 'red', imgFile: '' }, 'c', 'b', 'd'];
  assert.deepEqual(plain(o.shortcutBase(raw, null)), base());
  // copies in two folders: ambiguous, left alone
  const two = [{ id: 'f1', name: 'A', data: ['a'], color: '', imgFile: '' }, { id: 'f2', name: 'B', data: ['a'], color: '', imgFile: '' }];
  assert.deepEqual(plain(o.shortcutBase(two, null)), two);
});

test('a bot that the user moved to a single new place stays there even if history disagrees', () => {
  const raw = [SC(['b']), { id: 'f1', name: 'A', data: ['a'], color: 'red', imgFile: '' }, 'c', 'd', 'b'];
  assert.deepEqual(plain(o.shortcutBase(raw, base())), [{ id: 'f1', name: 'A', data: ['a'], color: 'red', imgFile: '' }, 'c', 'd', 'b']);
});

test('a loose bot that only remained in a shortcut folder goes back to its old spot in the root', () => {
  const home = ['x', 'y', { id: 'f1', name: 'A', data: ['a'], color: '', imgFile: '' }, 'z'];
  assert.deepEqual(plain(o.shortcutBase([SC(['y']), 'x', { id: 'f1', name: 'A', data: ['a'], color: '', imgFile: '' }, 'z'], home)), home);
});
