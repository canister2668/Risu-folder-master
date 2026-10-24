import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';

// 해적판처럼 쓰기가 늦게 반영되는 저장소.
function lagStore() {
  const data = new Map();
  const pending = [];
  return {
    data,
    flush() { for (const [k, v] of pending.splice(0)) data.set(k, v); },
    api: { getItem: async (k) => JSON.parse(JSON.stringify(data.get(k) ?? null)), setItem: async (k, v) => { pending.push([k, JSON.parse(JSON.stringify(v))]); } },
  };
}

test('add then remove while the server lags does not bring the label back', async () => {
  const lag = lagStore();
  const o = load(['src/core/util.js', 'src/core/order.js', 'src/core/plus.js', 'src/core/syncstore.js'], { Risuai: { pluginStorage: lag.api } });
  const st = o.createSyncStore('k', o.labelsNorm, o.labelsApply);
  await st.change({ t: 'add', bots: ['a'], label: 'l-play' });
  await st.change({ t: 'remove', bots: ['a'], label: 'l-play' });
  assert.deepEqual(JSON.parse(JSON.stringify((await st.read()).state.tags)), {});
  lag.flush();
  assert.deepEqual(JSON.parse(JSON.stringify((await st.read()).state.tags)), {});
  await st.change({ t: 'add', bots: ['b'], label: 'l-love' });
  lag.flush();
  assert.deepEqual(JSON.parse(JSON.stringify(lag.data.get('k').tags)), { b: ['l-love'] });
  assert.equal(st.pending.length >= 0, true);
});

test('a write from another device is kept when no own change is pending', async () => {
  const lag = lagStore();
  const o = load(['src/core/util.js', 'src/core/order.js', 'src/core/plus.js', 'src/core/syncstore.js'], { Risuai: { pluginStorage: lag.api } });
  const st = o.createSyncStore('k', o.labelsNorm, o.labelsApply);
  await st.change({ t: 'add', bots: ['a'], label: 'l-play' });
  lag.flush();
  await st.read();
  lag.data.set('k', o.labelsApply(lag.data.get('k'), { t: 'add', bots: ['new'], label: 'l-done' }));
  await st.change({ t: 'add', bots: ['c'], label: 'l-love' });
  lag.flush();
  assert.deepEqual(Object.keys(lag.data.get('k').tags).sort(), ['a', 'c', 'new']);
});

test('add → remove: a server still showing the old value, then only the first write, keeps the label removed', async () => {
  const data = new Map();
  const queue = [];
  const api = { getItem: async (k) => JSON.parse(JSON.stringify(data.get(k) ?? null)), setItem: async (k, v) => { queue.push([k, JSON.parse(JSON.stringify(v))]); } };
  const o = load(['src/core/util.js', 'src/core/order.js', 'src/core/plus.js', 'src/core/syncstore.js'], { Risuai: { pluginStorage: api } });
  const st = o.createSyncStore('k', o.labelsNorm, o.labelsApply);
  await st.change({ t: 'add', bots: ['a'], label: 'l-play' });
  await st.change({ t: 'remove', bots: ['a'], label: 'l-play' });
  assert.deepEqual(JSON.parse(JSON.stringify((await st.read()).state.tags)), {});
  const [first] = queue.splice(0, 1);
  data.set(first[0], first[1]);
  assert.deepEqual(JSON.parse(JSON.stringify((await st.read()).state.tags)), {}, 'cancelled label must stay cancelled');
  await st.change({ t: 'add', bots: ['b'], label: 'l-love' });
  for (const [k, v] of queue.splice(0)) data.set(k, v);
  assert.deepEqual(JSON.parse(JSON.stringify(data.get('k').tags)), { b: ['l-love'] });
});
