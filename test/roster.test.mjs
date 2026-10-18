import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';

const files = ['src/core/util.js', 'src/core/order.js', 'src/core/shortcut.js', 'src/core/store.js', 'src/core/roster.js'];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// kind: 'haejeok' (문자열 chaId 지원) | 'official' (숫자 index 만)
function fakeHost({ kind = 'haejeok', chars = ['a', 'b', 'c', 'd', 'e', 'f', 'g'], delay = 20, fail = new Set(), probeFail = 0, wrongId = new Set() } = {}) {
  const st = { live: 0, peak: 0, full: 0, calls: [] };
  let probeLeft = probeFail;
  const db = chars.map((id) => ({ chaId: id, name: 'N-' + id }));
  const Risuai = {
    getLocalPluginStorage: async () => ({ getItem: async () => null, setItem: async () => {} }),
    getDatabase: async (keys) => { if (keys.includes('characters')) st.full++; return { characters: db, characterOrder: chars }; },
    getCharacterFromIndex: async (t) => {
      st.calls.push(t);
      st.live++; st.peak = Math.max(st.peak, st.live);
      try {
        await wait(delay);
        if (typeof t === 'number') { if (probeLeft-- > 0) throw new Error('flaky'); return db[t] || null; }
        if (kind === 'official') return null;
        if (fail.has(t)) throw new Error('read failed');
        if (wrongId.has(t)) return { chaId: 'other', name: 'x' };
        return db.find((c) => c.chaId === t) || null;
      } finally { st.live--; }
    },
  };
  return { st, Risuai };
}

test('official RisuAI with a flaky first read never marks real bots as deleted', async () => {
  const h = fakeHost({ kind: 'official', probeFail: 5 });
  const r = load(files, { Risuai: h.Risuai }, ['roster']);
  await r.rosterStart(['a', 'b']);
  assert.equal(r.roster.mode, 'unknown');
  assert.equal(r.roster.missing.size, 0);
  assert.equal(h.st.full, 0);
});

test('official RisuAI after a clean probe uses the full list', async () => {
  const h = fakeHost({ kind: 'official' });
  const r = load(files, { Risuai: h.Risuai }, ['roster']);
  await r.rosterStart(['a', 'zz']);
  assert.equal(r.roster.mode, 'full');
  assert.deepEqual([...r.roster.missing], ['zz']);
});

test('an empty Haejeok library does not fall back to the full load', async () => {
  const h = fakeHost({ chars: [] });
  const r = load(files, { Risuai: h.Risuai }, ['roster']);
  await r.rosterStart([]);
  assert.equal(r.roster.mode, 'unknown');
  assert.equal(h.st.full, 0);
});

test('a response for a different bot is a failure, not a deletion', async () => {
  const h = fakeHost({ wrongId: new Set(['c']) });
  const r = load(files, { Risuai: h.Risuai }, ['roster']);
  await r.rosterStart(['c']);
  r.rosterWant(['c']); await wait(120);
  assert.ok(r.roster.failed.has('c'));
  assert.ok(!r.roster.missing.has('c'));
});

test('verify only reports bots confirmed missing by this call; timeouts stay as failed', async () => {
  const h = fakeHost({ delay: 50 });
  const r = load(files, { Risuai: h.Risuai }, ['roster']);
  await r.rosterStart(['a', 'gone']);
  r.roster.missing.add('a'); // 예전에 없다고 본 봇이 지금은 돌아와 있다
  const fast = await r.rosterVerify(['a', 'gone'], 1000);
  assert.deepEqual([...fast.missing], ['gone']);
  assert.deepEqual([...fast.present], ['a']);
  const slow = await r.rosterVerify(['gone'], 10);
  assert.deepEqual([...slow.missing], []);
  assert.deepEqual([...slow.failed], ['gone']);
});

test('reopening re-checks visible bots, and full check retries failed ones', async () => {
  const fail = new Set(['b']);
  const h = fakeHost({ fail });
  const r = load(files, { Risuai: h.Risuai }, ['roster']);
  await r.rosterStart(['a', 'b']);
  r.rosterWant(['a', 'b']); await wait(100);
  assert.ok(r.roster.failed.has('b'));
  fail.clear();
  assert.equal(await r.rosterAll(), 'done');
  assert.ok(r.roster.chars.has('b'));
  const before = h.st.calls.filter((x) => x === 'a').length;
  await r.rosterStart(['a', 'b']);
  r.rosterWant(['a']); await wait(100);
  assert.equal(h.st.calls.filter((x) => x === 'a').length, before + 1);
});

test('closing and reopening never exceeds three requests in flight', async () => {
  const ids = 'abcdefg'.split('');
  const h = fakeHost({ delay: 60 });
  const r = load(files, { Risuai: h.Risuai }, ['roster']);
  await r.rosterStart(ids);
  h.st.peak = 0;
  r.rosterWant(ids);
  await wait(10);
  r.rosterStop();
  await r.rosterStart(ids);
  r.rosterWant(ids);
  await wait(400);
  assert.ok(h.st.peak <= 3, 'peak ' + h.st.peak);
});

test('verify shares the three-request limit with normal reads', async () => {
  const ids = 'abcdefg'.split('');
  const h = fakeHost({ delay: 60 });
  const r = load(files, { Risuai: h.Risuai }, ['roster']);
  await r.rosterStart(ids);
  h.st.peak = 0;
  r.rosterWant(ids);
  await r.rosterVerify(['a', 'b', 'c', 'zz'], 5000);
  await wait(300);
  assert.ok(h.st.peak <= 3, 'peak ' + h.st.peak);
});

test('closing during verify drops its results instead of marking bots missing', async () => {
  const h = fakeHost({ delay: 80 });
  const r = load(files, { Risuai: h.Risuai }, ['roster']);
  await r.rosterStart(['gone']);
  const pending = r.rosterVerify(['gone'], 5000);
  await wait(10);
  r.rosterStop();
  const out = await pending;
  assert.deepEqual([...out.missing], []);
  assert.deepEqual([...out.failed], ['gone']);
  assert.ok(!r.roster.missing.has('gone'));
});

test('the device cache only keeps bots that are still in the folder layout', async () => {
  const saved = new Map([['risuFolderMaster.roster', { old1: { name: 'old', image: '' }, a: { name: 'A', image: '' } }]]);
  const h = fakeHost();
  h.Risuai.getLocalPluginStorage = async () => ({ getItem: async (k) => saved.get(k) ?? null, setItem: async (k, v) => saved.set(k, JSON.parse(JSON.stringify(v))) });
  const r = load(files, { Risuai: h.Risuai }, ['roster']);
  await r.rosterStart(['a', 'b']);
  r.rosterWant(['a', 'b']); await wait(1800);
  assert.deepEqual(Object.keys(saved.get('risuFolderMaster.roster')).sort(), ['a', 'b']);
});
