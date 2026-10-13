import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';

function host(order) {
  const state = { order: structuredClone(order), writes: 0 };
  const Risuai = {
    getDatabase: async (keys) => Object.fromEntries(keys.map((k) => [k, k === 'characterOrder' ? structuredClone(state.order) : []])),
    setDatabaseLite: async (p) => { state.writes++; await new Promise((r) => setTimeout(r, 5)); state.order = structuredClone(p.characterOrder); },
  };
  return { state, Risuai };
}
const files = ['src/core/util.js', 'src/core/order.js', 'src/core/store.js'];
const start = () => [{ id: 'f', name: 'F', data: ['a'] }, 'b', 'c'];

test('commits run one after another on the latest data', async () => {
  const h = host(start());
  const s = load(files, { Risuai: h.Risuai }, ['saver']);
  await Promise.all([
    s.saver.commit('1', (o) => s.moveBotsToFolder(o, ['b'], 'f')),
    s.saver.commit('2', (o) => s.moveBotsToFolder(o, ['c'], 'f')),
  ]);
  assert.deepEqual(h.state.order, [{ id: 'f', name: 'F', data: ['a', 'b', 'c'] }]);
  assert.equal(s.saver.history.length, 2);
});

test('invalid results and no-op results are not written', async () => {
  const h = host(start());
  const s = load(files, { Risuai: h.Risuai }, ['saver']);
  await assert.rejects(s.saver.commit('bad', (o) => { o[0].data = []; return o; }), /빈 폴더/);
  assert.equal(await s.saver.commit('same', (o) => o), null);
  assert.equal(h.state.writes, 0);
});

test('expect signature blocks a save after an outside change', async () => {
  const h = host(start());
  const s = load(files, { Risuai: h.Risuai }, ['saver']);
  const sig = JSON.stringify(start());
  h.state.order.push('d');
  await assert.rejects(s.saver.commit('reorder', (o) => o.reverse(), sig), /다른 곳에서/);
});

test('undo restores the previous order, and refuses after an outside change', async () => {
  const h = host(start());
  const s = load(files, { Risuai: h.Risuai }, ['saver']);
  await s.saver.commit('m', (o) => s.moveBotsToRoot(o, ['a']));
  await s.saver.undo();
  assert.deepEqual(h.state.order, start());
  await s.saver.commit('m2', (o) => s.moveBotsToFolder(o, ['b'], 'f'));
  h.state.order.push('zz');
  await assert.rejects(s.saver.undo(), /되돌릴 수 없습니다/);
});

test('an outside change between read and write is not overwritten: the edit is re-applied on the latest order', async () => {
  const h = host(start());
  let reads = 0;
  const realGet = h.Risuai.getDatabase;
  h.Risuai.getDatabase = async (keys) => {
    reads++;
    // 첫 읽기 직후 다른 곳에서 폴더를 하나 추가한다.
    if (reads === 2) h.state.order.push({ id: 'x', name: 'X', data: ['zz'] });
    return realGet(keys);
  };
  const s = load(files, { Risuai: h.Risuai }, ['saver']);
  await s.saver.commit('m', (o) => s.moveBotsToFolder(o, ['b'], 'f'));
  assert.ok(h.state.order.some((x) => x && x.id === 'x'), 'outside folder kept');
  assert.deepEqual(h.state.order.find((x) => x.id === 'f').data, ['a', 'b']);
});

test('a write overwritten right after saving is reported and gets no undo entry', async () => {
  const h = host(start());
  const realSet = h.Risuai.setDatabaseLite;
  h.Risuai.setDatabaseLite = async (p) => { await realSet(p); h.state.order.push('late'); };
  const s = load(files, { Risuai: h.Risuai }, ['saver']);
  await s.saver.commit('m', (o) => s.moveBotsToRoot(o, ['a']));
  assert.match(s.saver.takeWarning(), /바뀌었습니다/);
  assert.equal(s.saver.history.length, 0);
});
