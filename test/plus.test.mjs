import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';

const o = load(['src/core/util.js', 'src/core/order.js', 'src/core/shortcut.js', 'src/core/plus.js'], {}, ['LABEL_DEFAULTS', 'RECENT_ID', 'SHORTCUT_ID', 'LABEL_FOLDER_ID']);
const plain = (v) => JSON.parse(JSON.stringify(v));
const DAY = 86400e3;
const NOW = Date.UTC(2026, 9, 24);
const chars = (list) => new Map(list.map((c) => [c.id, c]));

test('labels start with five defaults; tags of unknown labels are dropped', () => {
  const s = o.labelsNorm(null);
  assert.equal(s.defs.length, 5);
  assert.equal(s.opts.finish, 'l-done');
  const t = o.labelsNorm({ defs: s.defs, tags: { a: ['l-play', 'nope'], b: [] } });
  assert.deepEqual(plain(t.tags), { a: ['l-play'] });
});

test('label ops are idempotent and solo labels move to the newest bot', () => {
  let s = o.labelsNorm(null);
  s = o.labelsApply(s, { t: 'opt', key: 'solo', value: 'l-play' });
  s = o.labelsApply(s, { t: 'add', bots: ['a'], label: 'l-play' });
  s = o.labelsApply(s, { t: 'add', bots: ['b'], label: 'l-play' });
  assert.deepEqual(plain(s.tags), { b: ['l-play'] });
  const again = o.labelsApply(s, { t: 'add', bots: ['b'], label: 'l-play' });
  assert.deepEqual(plain(again), plain(s));
  // bulk add of a solo label does not strip it from the other selected bots
  const bulk = o.labelsApply(s, { t: 'add', bots: ['c', 'd'], label: 'l-play' });
  assert.deepEqual(plain(bulk.tags.c), ['l-play']);
  // dropping a label removes it everywhere and clears options pointing at it
  const dropped = o.labelsApply(bulk, { t: 'drop', label: 'l-play' });
  assert.equal(dropped.defs.some((d) => d.id === 'l-play'), false);
  assert.deepEqual(plain(dropped.tags), {});
  assert.equal(dropped.opts.solo, '');
});

test('new-bot auto label: first seen within 7 days and never chatted', () => {
  const seen = o.seenUpdate(null, ['a', 'b']);
  assert.deepEqual(plain(seen), { a: 0, b: 0 });
  const later = o.seenUpdate(seen, ['a', 'b', 'c'], NOW - 2 * DAY);
  assert.equal(later.c, NOW - 2 * DAY);
  const cs = chars([{ id: 'a', name: 'A', last: 0 }, { id: 'c', name: 'C', last: 0 }]);
  assert.equal(o.isNewBot('a', later, cs, NOW), false);
  assert.equal(o.isNewBot('c', later, cs, NOW), true);
  assert.equal(o.isNewBot('c', later, chars([{ id: 'c', name: 'C', last: NOW }]), NOW), false);
  assert.equal(o.isNewBot('c', later, cs, NOW + 6 * DAY), false);
});

test('recent rank merges tracked opens with last chat time', () => {
  const cs = chars([{ id: 'a', last: NOW - 5 * DAY }, { id: 'b', last: NOW - DAY }, { id: 'c', last: 0 }]);
  const tracked = [{ id: 'c', at: NOW - 1000 }, { id: 'a', at: NOW - 2 * DAY }];
  assert.deepEqual(plain(o.recentRank(['a', 'b', 'c'], tracked, cs, { count: 8 })), ['c', 'b', 'a']);
  assert.deepEqual(plain(o.recentRank(['a', 'b'], tracked, cs, { count: 1 })), ['b']);
  assert.deepEqual(plain(o.recentRank(null, tracked, cs, { count: 8, exclude: ['b'] })), ['c', 'a']);
  assert.deepEqual(plain(o.recentTrack([{ id: 'a', at: 1 }, { id: 'b', at: 2 }], 'b', 9)), [{ id: 'b', at: 9 }, { id: 'a', at: 1 }]);
});

test('several shortcut folders go on top in the given order and are all stripped again', () => {
  const base = [{ id: 'f1', name: 'A', data: ['a', 'b'], color: 'red', imgFile: '' }, 'c'];
  const raw = plain(o.withShortcuts(base, [
    { id: o.RECENT_ID, name: '🕘', color: 'blue', ids: ['c', 'a', 'zz'] },
    { id: o.SHORTCUT_ID, name: '⭐', color: 'yellow', ids: [] },
    { id: o.LABEL_FOLDER_ID, name: '▶', color: 'yellow', ids: ['b'] },
  ]));
  assert.deepEqual(raw.map((x) => x.id || x), [o.RECENT_ID, o.LABEL_FOLDER_ID, 'f1', 'c']);
  assert.deepEqual(raw[0].data, ['c', 'a']);
  assert.deepEqual(plain(o.shortcutBase(raw, base)), base);
  // a bot dragged from the root into the recent folder goes back
  const dragged = [{ ...raw[0], data: ['c', 'a'] }, raw[1], raw[2]];
  assert.deepEqual(plain(o.shortcutBase(dragged, base)), base);
});

test('duplicate finder groups same and version-only names', () => {
  const cs = chars([
    { id: '1', name: 'AL-1S v2.1.3', last: NOW },
    { id: '2', name: 'AL-1S v2.0.0', last: NOW - DAY },
    { id: '3', name: 'AL-1S', last: NOW - 5 * DAY },
    { id: '4', name: '동방환유기', last: NOW - DAY },
    { id: '5', name: '동방환유기 (사본)', last: NOW - 9 * DAY },
    { id: '6', name: '스텔라 소라', last: 0 },
  ]);
  const g = plain(o.findDuplicates(['1', '2', '3', '4', '5', '6'], cs));
  assert.equal(g.length, 2);
  assert.deepEqual(g[0].ids, ['1', '2', '3']);
  assert.equal(g[0].same, false);
  assert.deepEqual(g[1].ids, ['4', '5']);
  assert.equal(plain(o.findDuplicates(['1', '2', '3', '4', '5'], cs, [o.dupKey('AL-1S')])).length, 1);
});

test('wizard suggests by name prefix, creator and tag, and reuses matching folders', () => {
  const cs = chars([
    { id: 'a', name: '[동방] 레이무', creator: 'X', tags: ['Touhou'] },
    { id: 'b', name: '[동방] 마리사', creator: 'X', tags: ['touhou', 'witch'] },
    { id: 'c', name: '유우카', creator: 'Y', tags: ['BlueArchive'] },
    { id: 'd', name: '노아', creator: 'Y', tags: ['BlueArchive'] },
    { id: 'e', name: '혼자', creator: '', tags: [] },
  ]);
  const folders = [{ id: 'f1', name: '동방 시리즈', data: ['z'] }];
  const byName = plain(o.suggestGroups(['a', 'b', 'c', 'd', 'e'], cs, folders, 'name'));
  assert.deepEqual(byName.map((g) => [g.title, g.ids, g.folderId]), [['동방 시리즈', ['a', 'b'], 'f1']]);
  const byCreator = plain(o.suggestGroups(['a', 'b', 'c', 'd', 'e'], cs, folders, 'creator'));
  assert.deepEqual(byCreator.map((g) => [g.title, g.ids]), [['X', ['a', 'b']], ['Y', ['c', 'd']]]);
  const byTag = plain(o.suggestGroups(['a', 'b', 'c', 'd', 'e'], cs, folders, 'tag'));
  assert.deepEqual(byTag.map((g) => g.ids), [['c', 'd'], ['a', 'b']]);
  assert.equal(o.nameKey('AL-1S v2'), 'AL-1S');
  assert.equal(o.nameKey('【스텔라】 하루'), '스텔라');
  assert.equal(o.nameKey('🎮 용사 아리스 [카트리지 LAB]'), '용사');
  assert.equal(o.nameKey('밈타치 — 쓰닌 비긴즈'), '밈타치');
  // 영어는 낱말 단위로만 있는 폴더에 붙고, The 같은 흔한 첫 낱말로는 묶지 않는다
  const en = chars([{ id: 'w', name: 'The Witch' }, { id: 'k', name: 'The Knight' }, { id: 'p', name: 'Persona Alpha' }, { id: 'q', name: 'Persona Beta' }]);
  const enFolders = [{ id: 'th', name: 'Theater', data: ['z'] }, { id: 'pf', name: 'My Persona', data: ['z'] }];
  const enGroups = plain(o.suggestGroups(['w', 'k', 'p', 'q'], en, enFolders, 'name'));
  assert.equal(enGroups.some((g) => g.folderId === 'th'), false);
  assert.deepEqual(enGroups.map((g) => [g.ids, g.folderId]), [[['p', 'q'], 'pf']]);
});

test('restoring a snapshot keeps new bots and drops deleted ones', () => {
  const snap = [{ id: 'f1', name: 'Old', data: ['a', 'gone'], color: 'red', imgFile: '' }, 'b'];
  const current = [{ id: 'f2', name: 'Other', data: ['a', 'b'], color: 'blue', imgFile: '' }, 'new'];
  assert.deepEqual(plain(o.restoreOrder(current, snap)), [{ id: 'f1', name: 'Old', data: ['a'], color: 'red', imgFile: '' }, 'b', 'new']);
  const d = plain(o.diffOrders(snap, current));
  assert.deepEqual(d.foldersAdded, ['Other']);
  assert.deepEqual(d.foldersRemoved, ['Old']);
  assert.equal(d.moved, 2);
  assert.equal(d.botsAdded, 1);
  assert.equal(d.botsRemoved, 1);
});

test('archive candidates skip the archive folder and include finished bots first', () => {
  const order = [{ id: 'arc', name: '보관함', data: ['x'] }, 'a', 'b', 'c', 'd'];
  const cs = chars([{ id: 'x', last: NOW - 400 * DAY }, { id: 'a', last: NOW - 100 * DAY }, { id: 'b', last: NOW - 10 * DAY }, { id: 'c', last: 0 }, { id: 'd', last: NOW - 61 * DAY }]);
  const list = plain(o.archiveCandidates(order, cs, { days: 60, archiveId: 'arc', finished: ['b'], now: NOW }));
  assert.deepEqual(list.map((x) => x.id), ['b', 'a', 'd']);
  assert.equal(list[0].finished, true);
});

test('folder stats count active bots per folder', () => {
  const order = [{ id: 'f', name: 'F', data: ['a', 'b'] }, 'c'];
  const cs = chars([{ id: 'a', last: NOW - DAY }, { id: 'b', last: NOW - 90 * DAY }, { id: 'c', last: NOW - 2 * DAY }]);
  const s = plain(o.folderStats(order, cs, { now: NOW }));
  assert.equal(s.total, 3);
  assert.equal(s.active, 2);
  assert.deepEqual(s.rows[0], { id: 'f', name: 'F', total: 2, active: 1 });
  assert.equal(s.root.active, 1);
  assert.equal(s.oldest.id, 'b');
});

test('plus settings normalise and merge', () => {
  const s = o.plusNorm(null);
  assert.equal(s.recent.on, false);
  assert.equal(s.archive.on, true);
  const n = o.plusApply(s, { k: 'recent', set: { on: true, count: 12 } });
  assert.equal(n.recent.on, true);
  assert.equal(n.recent.count, 12);
  assert.equal(o.plusApply(n, { k: 'recent', set: { count: 7 } }).recent.count, 8);
});
