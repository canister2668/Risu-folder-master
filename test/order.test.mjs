import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';

const o = load(['src/core/util.js', 'src/core/order.js']);
const plain = (v) => JSON.parse(JSON.stringify(v));
const base = () => [
  { id: 'f1', name: 'A', data: ['a', 'b'], color: 'red', imgFile: 'x.png', extra: 1 },
  { id: 'f2', name: 'B', data: ['c'], color: 'default', imgFile: '' },
  'd', 'e',
];

test('cloneOrder keeps unknown folder fields and drops junk ids', () => {
  const c = o.cloneOrder([{ id: 'f', name: 'n', data: ['a', 3, null], extra: { k: 1 } }, 'b']);
  assert.deepEqual(plain(c), [{ id: 'f', name: 'n', data: ['a'], extra: { k: 1 } }, 'b']);
});

test('validateOrder rejects empty folders, missing and duplicate ids', () => {
  assert.throws(() => o.validateOrder([{ id: 'f', name: 'x', data: [] }]), /빈 폴더/);
  assert.throws(() => o.validateOrder([{ name: 'x', data: ['a'] }]), /ID가 없는/);
  assert.throws(() => o.validateOrder([{ id: 'f', data: ['a'] }, { id: 'f', data: ['b'] }]), /겹칩니다/);
  assert.throws(() => o.validateOrder([1]), /알 수 없는/);
  assert.doesNotThrow(() => o.validateOrder(base()));
});

test('moveBotsToFolder moves from root and other folders, dropping folders that empty out', () => {
  const r = o.moveBotsToFolder(base(), ['c', 'd'], 'f1');
  assert.deepEqual(plain(r), [{ id: 'f1', name: 'A', data: ['a', 'b', 'c', 'd'], color: 'red', imgFile: 'x.png', extra: 1 }, 'e']);
});

test('moveBotsToRoot inserts right after the last folder', () => {
  const r = o.moveBotsToRoot(base(), ['a']);
  assert.deepEqual(plain(r).map((x) => (typeof x === 'string' ? x : x.id)), ['f1', 'f2', 'a', 'd', 'e']);
  assert.deepEqual(plain(r)[0].data, ['b']);
});

test('createFolder takes bots out of where they were and places the folder after the last folder', () => {
  const { order, folder } = o.createFolder(base(), '  새 폴더 ', ['c', 'e']);
  assert.equal(folder.name, '새 폴더');
  assert.deepEqual(plain(order).map((x) => (typeof x === 'string' ? x : x.name)), ['A', '새 폴더', 'd']);
  assert.throws(() => o.createFolder(base(), '', ['a']), /이름/);
  assert.throws(() => o.createFolder(base(), 'x', []), /봇을/);
});

test('updateFolder renames, recolors and resets image', () => {
  let r = o.updateFolder(base(), 'f1', { name: ' 새 이름 ', color: 'nope' });
  assert.equal(r[0].name, '새 이름');
  assert.equal(r[0].color, 'default');
  r = o.updateFolder(base(), 'f1', { imgFile: '' });
  assert.equal(r[0].imgFile, '');
  assert.equal(r[0].img, '');
  assert.throws(() => o.updateFolder(base(), 'zz', { name: 'x' }), /찾을 수 없습니다/);
});

test('deleteFolder moves its bots outside, right after the last folder', () => {
  assert.deepEqual(plain(o.deleteFolder(base(), 'f1')), [{ id: 'f2', name: 'B', data: ['c'], color: 'default', imgFile: '' }, 'a', 'b', 'd', 'e']);
});

test('moveFolder swaps folder slots only', () => {
  const order = ['x', ...base()];
  const r = o.moveFolder(order, 'f2', -1);
  assert.deepEqual(plain(r).map((x) => (typeof x === 'string' ? x : x.id)), ['x', 'f2', 'f1', 'd', 'e']);
  assert.equal(o.moveFolder(order, 'f1', -1), null);
  assert.equal(o.moveFolder(order, 'f2', 1), null);
});

test('applyLayout with the unchanged layout returns the same order', () => {
  const order = ['x', ...base(), 'y'];
  const layout = { folders: [{ id: 'f1', data: ['a', 'b'] }, { id: 'f2', data: ['c'] }], root: ['x', 'd', 'e', 'y'] };
  assert.deepEqual(plain(o.applyLayout(order, layout)), plain(o.cloneOrder(order)));
});

test('applyLayout reorders, moves between containers and drops emptied folders', () => {
  const layout = { folders: [{ id: 'f2', data: ['c', 'a', 'b'] }, { id: 'f1', data: [] }], root: ['e', 'd'] };
  const r = o.applyLayout(base(), layout);
  assert.deepEqual(plain(r).map((x) => (typeof x === 'string' ? x : x.id + ':' + x.data.join(''))), ['f2:cab', 'e', 'd']);
});

test('applyLayout refuses when bots go missing or folders are unknown', () => {
  assert.throws(() => o.applyLayout(base(), { folders: [{ id: 'f1', data: ['a'] }, { id: 'f2', data: ['c'] }], root: ['d', 'e'] }), /봇 목록/);
  assert.throws(() => o.applyLayout(base(), { folders: [{ id: 'zz', data: ['a'] }], root: [] }), /폴더가 바뀌어/);
});

test('inspectOrder finds duplicates, ghosts and same names', () => {
  const order = [{ id: 'f', name: 'F', data: ['a', 'g'] }, 'a', 'b', 'c'];
  const chars = [{ chaId: 'a', name: '하나' }, { chaId: 'b', name: '같은' }, { chaId: 'c', name: '같은' }];
  const r = plain(o.inspectOrder(order, chars));
  assert.deepEqual(r.duplicates, [{ id: 'a', name: '하나', where: ['F', null] }]);
  assert.deepEqual(r.ghosts, [{ id: 'g', where: ['F'] }]);
  assert.equal(r.sameNames[0].name, '같은');
});

test('removeDuplicates keeps the first place; removeGhosts drops unknown ids and empty folders', () => {
  assert.deepEqual(plain(o.removeDuplicates([{ id: 'f', name: 'F', data: ['a'] }, 'a', 'b', 'b'])), [{ id: 'f', name: 'F', data: ['a'] }, 'b']);
  assert.deepEqual(plain(o.removeGhosts([{ id: 'f', name: 'F', data: ['g'] }, 'a', 'h'], ['a'])), ['a']);
});
