//@name risu_folder_master
//@display-name 📁 Risu 폴더 마스터 v1.0.7
//@api 3.0
//@version 1.0.7
//@update-url https://raw.githubusercontent.com/canister2668/Risu-folder-master/main/dist/risu-folder-master.plugin.js

// Risu 폴더 마스터 v1.0.7 — RisuAI 봇 폴더 관리 + 사이드바 여러 열 배열
// 소스: https://github.com/canister2668/Risu-folder-master (이 파일은 scripts/build.mjs 가 만든다. 직접 고치지 말 것)
//
// Copyright (C) 2026 Canister
// SPDX-License-Identifier: GPL-3.0-only
// 이 프로그램은 GNU General Public License 3판으로 배포합니다. 보증은 없습니다. 전문: 저장소의 LICENSE
// RisuAI(https://github.com/kwaroran/RisuAI, GPL-3.0, Copyright (C) Kwaroran)의 플러그인 API v3를 씁니다.
// RisuAI 공식 플러그인이 아니며, RisuAI 개발자와 관계없습니다.
(() => {
'use strict';
const FM_VERSION = "1.0.7";

// ── src/core/util.js ──
// 공용 도우미.

function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function debounce(fn, ms) {
  let timer = null;
  const run = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => { timer = null; fn(...args); }, ms);
  };
  run.cancel = () => { clearTimeout(timer); timer = null; };
  return run;
}

function errorText(err) {
  return (err && err.message) || String(err);
}

function timeAgo(ts) {
  if (!ts) return null;
  const diff = Date.now() - ts;
  let short;
  if (diff < 60e3) short = '방금';
  else if (diff < 3600e3) short = `${Math.floor(diff / 60e3)}분 전`;
  else if (diff < 86400e3) short = `${Math.floor(diff / 3600e3)}시간 전`;
  else if (diff < 30 * 86400e3) short = `${Math.floor(diff / 86400e3)}일 전`;
  else short = new Date(ts).toLocaleDateString('ko-KR', { year: '2-digit', month: 'short', day: 'numeric' });
  return { short, full: new Date(ts).toLocaleString('ko-KR') };
}

function imageMime(bytes) {
  const b = bytes;
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  if (b.length >= 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
    const brand = String.fromCharCode(b[8], b[9], b[10], b[11]);
    if (brand === 'avif' || brand === 'avis') return 'image/avif';
  }
  return '';
}

function toBytes(raw) {
  if (raw instanceof Uint8Array) return raw;
  if (ArrayBuffer.isView(raw)) return new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
  if (raw instanceof ArrayBuffer) return new Uint8Array(raw);
  return null;
}

// ── src/core/order.js ──
// characterOrder 순수 연산. 호스트 API를 부르지 않으므로 node 테스트에서 그대로 불러 쓴다.
// RisuAI의 characterOrder 항목은 봇 chaId 문자열 또는 { id, name, data, color, imgFile, img } 폴더다.
// 폴더 안 폴더는 없다. 봇이 0개인 폴더는 RisuAI가 저장 시 지우므로 남기지 않는다.

const FOLDER_COLORS = ['default', 'red', 'yellow', 'green', 'blue', 'indigo', 'purple', 'pink'];

function isFolder(item) {
  return typeof item === 'object' && item !== null && !Array.isArray(item);
}

function newFolderId() {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// 저장 데이터를 고칠 수 있는 사본으로 만든다. 폴더의 알 수 없는 필드도 그대로 둔다.
function cloneOrder(order) {
  return (Array.isArray(order) ? order : []).map((item) =>
    isFolder(item) ? { ...item, data: Array.isArray(item.data) ? item.data.filter((id) => typeof id === 'string') : [] } : item,
  );
}

function orderBotIds(order) {
  const ids = [];
  for (const item of Array.isArray(order) ? order : []) {
    if (typeof item === 'string') ids.push(item);
    else if (isFolder(item) && Array.isArray(item.data)) for (const id of item.data) if (typeof id === 'string') ids.push(id);
  }
  return ids;
}

function orderFolderIds(order) {
  return (Array.isArray(order) ? order : []).filter(isFolder).map((f) => f.id || '');
}

function findFolder(order, folderId) {
  const index = order.findIndex((item) => isFolder(item) && item.id === folderId);
  return index < 0 ? null : { folder: order[index], index };
}

function requireFolder(order, folderId) {
  const ref = findFolder(order, folderId);
  if (!ref) throw new Error('폴더를 찾을 수 없습니다. 다른 곳에서 바뀌었을 수 있으니 새로고침해 주세요');
  return ref;
}

// 저장 직전 검사. 위반하면 저장하지 않는다.
function validateOrder(order) {
  if (!Array.isArray(order)) throw new Error('순서 데이터가 배열이 아닙니다');
  const seen = new Set();
  for (const item of order) {
    if (typeof item === 'string') continue;
    if (!isFolder(item)) throw new Error('알 수 없는 순서 항목이 있어 저장을 취소했습니다');
    if (!item.id) throw new Error('ID가 없는 폴더가 있어 저장을 취소했습니다');
    if (seen.has(item.id)) throw new Error(`폴더 ID가 겹칩니다(${item.id})`);
    seen.add(item.id);
    if (!Array.isArray(item.data) || item.data.length === 0) {
      throw new Error(`빈 폴더는 RisuAI가 지웁니다: ${item.name || '이름 없음'}`);
    }
  }
  return order;
}

function sameMembers(a, b) {
  const x = [...a].sort();
  const y = [...b].sort();
  return x.length === y.length && x.every((v, i) => v === y[i]);
}

// 봇들을 원래 자리에서 빼낸다. 비게 된 폴더는 지우지 않고 남긴다(호출한 쪽이 결정).
function detachBots(order, ids) {
  const set = new Set(ids);
  const out = [];
  for (const item of order) {
    if (typeof item === 'string') {
      if (!set.has(item)) out.push(item);
    } else if (isFolder(item)) {
      out.push({ ...item, data: item.data.filter((id) => !set.has(id)) });
    } else out.push(item);
  }
  return out;
}

function dropEmptyFolders(order) {
  return order.filter((item) => !isFolder(item) || item.data.length > 0);
}

function uniqueIds(ids) {
  return [...new Set(ids.filter((id) => typeof id === 'string' && id))];
}

// 폴더 밖 봇은 마지막 폴더 바로 뒤에 넣는다(RisuAI 사이드바에서 폴더 묶음 아래에 보이도록).
function rootInsertIndex(order) {
  let at = 0;
  order.forEach((item, i) => { if (isFolder(item)) at = i + 1; });
  return at;
}

function moveBotsToFolder(order, ids, folderId) {
  const bots = uniqueIds(ids);
  const out = detachBots(order, bots);
  const { folder } = requireFolder(out, folderId);
  folder.data = [...folder.data, ...bots];
  return dropEmptyFolders(out);
}

function moveBotsToRoot(order, ids) {
  const bots = uniqueIds(ids);
  const out = dropEmptyFolders(detachBots(order, bots));
  out.splice(rootInsertIndex(out), 0, ...bots);
  return out;
}

function createFolder(order, name, ids, extra = {}) {
  const title = String(name || '').trim();
  if (!title) throw new Error('폴더 이름을 입력해 주세요');
  const bots = uniqueIds(ids);
  if (!bots.length) throw new Error('새 폴더에 넣을 봇을 먼저 고르세요');
  const out = dropEmptyFolders(detachBots(order, bots));
  const folder = { name: title, data: bots, color: 'default', id: newFolderId(), imgFile: '', ...extra };
  let last = -1;
  out.forEach((item, i) => { if (isFolder(item)) last = i; });
  out.splice(last + 1, 0, folder);
  return { order: out, folder };
}

function updateFolder(order, folderId, patch) {
  const out = cloneOrder(order);
  const { folder } = requireFolder(out, folderId);
  if ('name' in patch) {
    const title = String(patch.name || '').trim();
    if (!title) throw new Error('폴더 이름을 입력해 주세요');
    folder.name = title;
  }
  if ('color' in patch) folder.color = FOLDER_COLORS.includes(patch.color) ? patch.color : 'default';
  if ('imgFile' in patch) {
    folder.imgFile = patch.imgFile || '';
    if (!patch.imgFile) folder.img = '';
  }
  return out;
}

// 폴더를 풀어 안의 봇을 그 자리에 둔다.
function deleteFolder(order, folderId) {
  const out = cloneOrder(order);
  const { folder, index } = requireFolder(out, folderId);
  out.splice(index, 1);
  // 봇은 폴더 밖 맨 앞(마지막 폴더 바로 뒤)에 꺼낸다. 폴더 사이에 끼면 사이드바에서 흩어져 보인다.
  out.splice(rootInsertIndex(out), 0, ...folder.data);
  return out;
}

// 폴더끼리의 순서만 바꾼다. 폴더 밖 봇 자리는 그대로 둔다.
function moveFolder(order, folderId, delta) {
  const out = cloneOrder(order);
  const slots = [];
  out.forEach((item, i) => { if (isFolder(item)) slots.push(i); });
  const pos = slots.findIndex((i) => out[i].id === folderId);
  if (pos < 0) throw new Error('폴더를 찾을 수 없습니다');
  const next = pos + delta;
  if (next < 0 || next >= slots.length) return null;
  const a = slots[pos];
  const b = slots[next];
  [out[a], out[b]] = [out[b], out[a]];
  return out;
}

// 순서 편집 결과(layout)를 저장 데이터에 입힌다.
// layout = { folders: [{ id, data: [...] }], root: [...] }
// 원래 배열에서 폴더 자리·폴더 밖 봇 자리의 패턴을 지켜, 아무것도 안 바꾸면 결과가 같다.
function applyLayout(order, layout) {
  const base = cloneOrder(order);
  const byId = new Map(base.filter(isFolder).map((f) => [f.id, f]));
  const folders = layout.folders.map((f) => {
    const meta = byId.get(f.id);
    if (!meta) throw new Error('편집 중 폴더가 바뀌어 저장을 취소했습니다');
    return { ...meta, data: [...f.data] };
  }).filter((f) => f.data.length > 0);
  const root = [...layout.root];
  const out = [];
  let fi = 0;
  let ri = 0;
  for (const item of base) {
    if (isFolder(item)) { if (fi < folders.length) out.push(folders[fi++]); }
    else if (typeof item === 'string') { if (ri < root.length) out.push(root[ri++]); }
  }
  while (fi < folders.length) out.push(folders[fi++]);
  if (ri < root.length) out.splice(rootInsertIndex(out), 0, ...root.slice(ri));
  if (!sameMembers(orderBotIds(base), orderBotIds(out))) throw new Error('봇 목록이 맞지 않아 저장을 취소했습니다');
  return out;
}

// 점검: 같은 봇이 여러 자리에 있음 / 없는 봇 / 이름이 같은 다른 봇.
function inspectOrder(order, characters) {
  const known = new Map();
  for (const c of characters) if (c && c.chaId) known.set(c.chaId, c);
  const places = new Map();
  for (const item of order) {
    if (typeof item === 'string') places.set(item, [...(places.get(item) || []), null]);
    else if (isFolder(item)) for (const id of item.data) places.set(id, [...(places.get(id) || []), item.name || '이름 없음']);
  }
  const duplicates = [];
  const ghosts = [];
  for (const [id, where] of places) {
    if (where.length > 1) duplicates.push({ id, name: known.get(id)?.name || '(알 수 없음)', where });
    if (!known.has(id)) ghosts.push({ id, where });
  }
  const byName = new Map();
  for (const [id] of places) {
    const c = known.get(id);
    if (!c) continue;
    const key = c.name || '?';
    byName.set(key, [...(byName.get(key) || []), { id, where: places.get(id) }]);
  }
  const sameNames = [...byName].filter(([, list]) => list.length > 1).map(([name, list]) => ({ name, list }));
  return { duplicates, ghosts, sameNames };
}

function removeDuplicates(order) {
  const seen = new Set();
  const out = [];
  for (const item of cloneOrder(order)) {
    if (typeof item === 'string') {
      if (!seen.has(item)) { seen.add(item); out.push(item); }
    } else if (isFolder(item)) {
      item.data = item.data.filter((id) => (seen.has(id) ? false : (seen.add(id), true)));
      out.push(item);
    }
  }
  return dropEmptyFolders(out);
}

function removeGhosts(order, validIds) {
  const valid = new Set(validIds);
  const out = [];
  for (const item of cloneOrder(order)) {
    if (typeof item === 'string') { if (valid.has(item)) out.push(item); }
    else if (isFolder(item)) { item.data = item.data.filter((id) => valid.has(id)); out.push(item); }
  }
  return dropEmptyFolders(out);
}

// ── src/core/shortcut.js ──
// 사이드바 바로가기 폴더(즐겨찾기·최근 대화·라벨). 봇을 복사하지 않고 같은 봇 ID를 한 번 더 적는 폴더다
// (사이드바에서 누르면 같은 봇·같은 채팅이 열린다. RisuAI는 순서 목록의 같은 ID를 자리마다 그리고 지우지 않는다).
// 이 폴더들의 주인은 폴더 마스터다. 내용·이름·그림은 폴더 마스터 설정에서 만들고, 사이드바에서 고친 것은 되돌린다.
// 폴더 마스터의 다른 계산은 모두 이 폴더들을 뺀 순서(base)로 한다. 호스트 API를 부르지 않는 순수 연산이다.

const SHORTCUT_ID = 'risu-folder-master-favorites';
const SHORTCUT_NAME = '⭐ 즐겨찾기';
const RECENT_ID = 'risu-folder-master-recent';
const RECENT_NAME = '🕘 최근 대화';
const LABEL_FOLDER_ID = 'risu-folder-master-label';
const SHORTCUT_IDS = [SHORTCUT_ID, RECENT_ID, LABEL_FOLDER_ID];

function isShortcut(item) {
  return isFolder(item) && SHORTCUT_IDS.includes(item.id);
}

// 봇이 들어 있는 곳: 폴더 id, 폴더 밖이면 null, 없으면 undefined.
function botContainer(order, id) {
  for (const item of order || []) {
    if (item === id) return null;
    if (isFolder(item) && !isShortcut(item) && Array.isArray(item.data) && item.data.includes(id)) return item.id;
  }
  return undefined;
}

function dropBotAt(order, id, keepIndex) {
  let n = -1;
  const out = [];
  for (const item of order) {
    if (item === id) { n++; if (n === keepIndex) out.push(item); continue; }
    if (isFolder(item)) {
      const data = item.data.filter((x) => x !== id || ++n === keepIndex);
      if (data.length) out.push(data.length === item.data.length ? item : { ...item, data });
      continue;
    }
    out.push(item);
  }
  return out;
}

// 저장된 순서 → 바로가기 폴더를 뺀 순서. 사이드바 손질로 생긴 흔적을 지난 순서(last, base 모양)를 보고 고친다.
//  - 바로가기 폴더로 끌려 들어가 원래 자리를 잃은 봇: 지난 자리로, 모르면 폴더 밖 끝으로.
//  - 바로가기 폴더에서 끌려 나와 두 번 있게 된 봇: 지난 순서에서 한 번이었으면 지난 자리 하나만 남긴다.
// 지난 순서를 모르면 겹침은 건드리지 않는다(정리 점검이 알려 준다).
function shortcutBase(raw, last) {
  const order = cloneOrder(raw);
  const scIds = order.filter(isShortcut).flatMap((f) => f.data);
  let base = order.filter((x) => !isShortcut(x));
  if (last) {
    const lastIds = orderBotIds(last);
    const counts = new Map();
    for (const id of orderBotIds(base)) counts.set(id, (counts.get(id) || 0) + 1);
    for (const [id, n] of counts) {
      if (n < 2 || lastIds.filter((x) => x === id).length !== 1) continue;
      const want = botContainer(last, id);
      const spots = [];
      for (const item of base) {
        if (item === id) spots.push(null);
        else if (isFolder(item)) for (const x of item.data) if (x === id) spots.push(item.id);
      }
      const keep = Math.max(0, spots.indexOf(want));
      base = dropBotAt(base, id, keep);
    }
  }
  if (scIds.length) {
    const present = new Set(orderBotIds(base));
    for (const id of scIds) {
      if (present.has(id)) continue;
      present.add(id);
      const fid = last ? botContainer(last, id) : undefined;
      const folder = fid ? base.find((x) => isFolder(x) && x.id === fid) : null;
      if (folder) {
        const at = Math.min(last.find((x) => isFolder(x) && x.id === fid).data.indexOf(id), folder.data.length);
        const data = [...folder.data];
        data.splice(at, 0, id);
        base = base.map((x) => (x === folder ? { ...folder, data } : x));
      } else {
        base.push(id);
      }
    }
  }
  return base;
}

// base 앞에 바로가기 폴더들을 붙인다. list = [{ id, name, color, imgFile, ids }] (사이드바 위에서부터).
// 순서에 있는 봇이 하나도 없는 폴더는 붙이지 않는다(RisuAI는 빈 폴더를 지운다).
function withShortcuts(base, list) {
  const plainBase = base.filter((x) => !isShortcut(x));
  const live = new Set(orderBotIds(plainBase));
  const out = [];
  for (const sc of list || []) {
    if (!sc || !SHORTCUT_IDS.includes(sc.id) || out.some((f) => f.id === sc.id)) continue;
    const data = [...new Set((sc.ids || []).filter((id) => live.has(id)))];
    if (!data.length) continue;
    const folder = { id: sc.id, name: sc.name || SHORTCUT_NAME, data, color: sc.color || 'yellow', imgFile: sc.imgFile || '' };
    if (!sc.imgFile) folder.img = '';
    out.push(folder);
  }
  return [...out, ...plainBase];
}

// 즐겨찾기 하나만 쓰던 옛 형태(opts = { on, stars, name, color, imgFile })도 받는다. 배열이면 withShortcuts.
function withShortcut(base, opts) {
  if (Array.isArray(opts)) return withShortcuts(base, opts);
  if (!opts || !opts.on) return withShortcuts(base, []);
  return withShortcuts(base, [{ id: SHORTCUT_ID, name: opts.name || SHORTCUT_NAME, color: opts.color || 'yellow', imgFile: opts.imgFile || '', ids: opts.stars }]);
}

// 저장할 때 바로가기 폴더의 그림 칸(img)은 RisuAI가 채운 값을 그대로 둔다(imgFile 이 같을 때).
function keepShortcutImg(next, raw) {
  for (const now of next.filter(isShortcut)) {
    const old = (raw || []).find((x) => isShortcut(x) && x.id === now.id);
    if (old && old.imgFile === now.imgFile && old.img && now.imgFile) now.img = old.img;
  }
  return next;
}

// ── src/core/plus.js ──
// 1.0.7 기능의 순수 연산: 라벨, 최근 대화 순위, 중복 봇, 정리 마법사 제안, 배치 기록 복원·비교, 보관함 후보, 통계.
// 호스트 API를 부르지 않는다. chars 는 Map(id → { name, last, creator, tags }) 이다(roster.chars 와 같은 모양).

const DAY_MS = 86400e3;

// ── 라벨 ──

const LABEL_COLORS = ['yellow', 'blue', 'green', 'pink', 'purple', 'red', 'indigo', 'default'];
const LABEL_DEFAULTS = [
  { id: 'l-play', name: '진행 중', emoji: '▶', color: 'yellow' },
  { id: 'l-later', name: '나중에 할 것', emoji: '🔖', color: 'blue' },
  { id: 'l-done', name: '엔딩 봄', emoji: '🏁', color: 'green' },
  { id: 'l-love', name: '최애', emoji: '💖', color: 'pink' },
  { id: 'l-light', name: '가볍게', emoji: '☕', color: 'purple' },
];
const LABEL_MAX = 24;
const LABEL_NEW_DAYS = 7;

function labelDefNorm(d) {
  if (!d || typeof d !== 'object' || typeof d.id !== 'string' || !d.id) return null;
  const name = typeof d.name === 'string' ? d.name.trim().slice(0, 24) : '';
  if (!name) return null;
  return {
    id: d.id.slice(0, 40),
    name,
    emoji: typeof d.emoji === 'string' ? [...d.emoji].slice(0, 2).join('') : '',
    color: LABEL_COLORS.includes(d.color) ? d.color : 'default',
  };
}

// 서버에 저장하는 라벨 기록. 처음(저장된 것이 없을 때)은 기본 라벨 5개.
function labelsNorm(v) {
  const o = v && typeof v === 'object' ? v : null;
  const defs = [];
  for (const d of Array.isArray(o?.defs) ? o.defs : LABEL_DEFAULTS) {
    const n = labelDefNorm(d);
    if (n && !defs.some((x) => x.id === n.id) && defs.length < LABEL_MAX) defs.push(n);
  }
  const ids = new Set(defs.map((d) => d.id));
  const tags = {};
  if (o && o.tags && typeof o.tags === 'object') {
    for (const [bot, list] of Object.entries(o.tags)) {
      if (!Array.isArray(list)) continue;
      const clean = [...new Set(list.filter((l) => ids.has(l)))];
      if (clean.length) tags[bot] = clean;
    }
  }
  const opts = o && o.opts && typeof o.opts === 'object' ? o.opts : {};
  return {
    defs,
    tags,
    opts: {
      solo: typeof opts.solo === 'string' && ids.has(opts.solo) ? opts.solo : '',
      finish: typeof opts.finish === 'string' ? (ids.has(opts.finish) ? opts.finish : '') : (ids.has('l-done') ? 'l-done' : ''),
    },
  };
}

// 라벨 바꾸기 연산. 같은 연산을 두 번 적용해도 결과가 같도록 만든다(저장 반영이 늦는 서버에서 다시 얹기 때문).
// op = { t:'set', bot, labels } | { t:'add', bots, label } | { t:'remove', bots, label }
//    | { t:'def', def } (추가·고치기) | { t:'drop', label } | { t:'opt', key, value }
function labelsApply(state, op) {
  const s = labelsNorm(state);
  const solo = s.opts.solo;
  const clearSolo = (except) => {
    for (const [b, list] of Object.entries(s.tags)) if (b !== except && list.includes(solo)) s.tags[b] = list.filter((l) => l !== solo);
  };
  if (op.t === 'set') {
    s.tags[op.bot] = [...new Set((op.labels || []).filter((l) => s.defs.some((d) => d.id === l)))];
    if (solo && s.tags[op.bot].includes(solo) && !op.keepSolo) clearSolo(op.bot);
  } else if (op.t === 'add') {
    for (const b of op.bots || []) s.tags[b] = [...new Set([...(s.tags[b] || []), op.label])];
    if (solo && op.label === solo && (op.bots || []).length === 1) clearSolo(op.bots[0]);
  } else if (op.t === 'remove') {
    for (const b of op.bots || []) if (s.tags[b]) s.tags[b] = s.tags[b].filter((l) => l !== op.label);
  } else if (op.t === 'def') {
    const d = labelDefNorm(op.def);
    if (d) {
      const i = s.defs.findIndex((x) => x.id === d.id);
      if (i >= 0) s.defs[i] = d;
      else if (s.defs.length < LABEL_MAX) s.defs.push(d);
    }
  } else if (op.t === 'drop') {
    s.defs = s.defs.filter((d) => d.id !== op.label);
  } else if (op.t === 'opt') {
    s.opts[op.key] = op.value;
  }
  return labelsNorm(s);
}

function labelsOf(state, bot) {
  return state.tags[bot] || [];
}

// 순서에 없는 봇의 라벨을 지운다(지워진 봇이 쌓이지 않게).
function labelsPrune(state, liveIds) {
  if (!liveIds || !liveIds.length) return state;
  const live = new Set(liveIds);
  const tags = {};
  for (const [b, list] of Object.entries(state.tags)) if (live.has(b)) tags[b] = list;
  return { ...state, tags };
}

// 지워졌다고 확인된 봇의 라벨만 지운다.
function labelsDropBots(state, gone) {
  if (!gone || !gone.size) return state;
  const tags = {};
  for (const [b, list] of Object.entries(state.tags)) if (!gone.has(b)) tags[b] = list;
  return { ...state, tags };
}

// 자동 라벨 「새로 받음」: 폴더 마스터가 처음 본 지 7일이 안 됐고, 아직 대화하지 않은 봇.
// seen = { id: 처음 본 시각 } (첫 실행 때 이미 있던 봇은 0). 대화 여부를 모르면(이름 미확인) 넣지 않는다.
function isNewBot(id, seen, chars, now = Date.now()) {
  const at = seen && seen[id];
  if (!at || now - at > LABEL_NEW_DAYS * DAY_MS) return false;
  const c = chars.get(id);
  return !!c && !c.last;
}

// 처음 보는 봇을 기록한다. 기록이 비어 있으면(첫 실행) 지금 있는 봇은 모두 0(오래된 봇)으로 둔다.
function seenUpdate(seen, ids, now = Date.now()) {
  const first = !seen || !Object.keys(seen).length;
  const out = {};
  for (const id of ids) out[id] = seen && id in seen ? seen[id] : first ? 0 : now;
  return out;
}

// ── 최근 대화 ──

// tracked = [{ id, at }] (폴더 마스터가 본 「봇을 연 시각」), chars 의 last = RisuAI 마지막 대화 시각.
// 둘 중 늦은 시각으로 줄 세운다. live 에 없는 봇·exclude 는 뺀다.
function recentRank(live, tracked, chars, { count = 8, exclude = [] } = {}) {
  const liveSet = live ? new Set(live) : null;
  const skip = new Set(exclude);
  const at = new Map();
  for (const t of tracked || []) if (t && typeof t.id === 'string') at.set(t.id, Math.max(at.get(t.id) || 0, Number(t.at) || 0));
  for (const [id, c] of chars) if (c && c.last) at.set(id, Math.max(at.get(id) || 0, c.last));
  return [...at].filter(([id, t]) => t > 0 && (!liveSet || liveSet.has(id)) && !skip.has(id)).sort((a, b) => b[1] - a[1]).slice(0, count).map(([id]) => id);
}

function recentTrack(list, id, now = Date.now(), cap = 40) {
  return [{ id, at: now }, ...(list || []).filter((t) => t && t.id !== id)].slice(0, cap);
}

// ── 이름 다듬기 ──

function normName(name) {
  return String(name || '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

// 중복 비교용: 버전 표기·사본 표시·괄호 꼬리를 떼고 공백·기호를 지운다.
function dupKey(name) {
  let n = normName(name);
  n = n.replace(/[\s_-]*(\(|\[|【)?\s*(사본|복사본|copy|복제)\s*(\d+)?\s*(\)|\]|】)?\s*$/i, '');
  n = n.replace(/[\s_-]*(\(|\[)?\s*v?\d+(\.\d+){1,3}[a-z]?\s*(\)|\])?\s*$/i, '');
  n = n.replace(/[\s_-]*(\(|\[)\s*v\d+\s*(\)|\])\s*$/i, '').replace(/\s+v\d+\s*$/i, '');
  n = n.replace(/[\s\p{P}\p{S}]+/gu, '');
  return n;
}

// 이름이 같거나 비슷한(dupKey 가 같은) 봇 묶음. ignore = 무시한 dupKey 목록.
// 결과: [{ key, same, ids }] — same = 이름이 글자 그대로 모두 같음.
function findDuplicates(ids, chars, ignore = []) {
  const skip = new Set(ignore);
  const groups = new Map();
  for (const id of new Set(ids)) {
    const c = chars.get(id);
    if (!c || !c.name) continue;
    const key = dupKey(c.name);
    if (!key || skip.has(key)) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(id);
  }
  const out = [];
  for (const [key, list] of groups) {
    if (list.length < 2) continue;
    const names = new Set(list.map((id) => normName(chars.get(id).name)));
    const sorted = [...list].sort((a, b) => (chars.get(b).last || 0) - (chars.get(a).last || 0));
    out.push({ key, same: names.size === 1, ids: sorted });
  }
  return out.sort((a, b) => b.ids.length - a.ids.length || a.key.localeCompare(b.key));
}

// ── 정리 마법사 ──

const NAME_SPLIT = /[\s|:·/_~]+/;
// 이름 앞에 흔히 오는 낱말은 묶음 열쇠로 쓰지 않는다.
const NAME_STOP = new Set(['the', 'a', 'an']);
const BRACKET_HEAD = /^\s*[[【(（<〈「『]\s*([^\]】)）>〉」』]{1,20}?)\s*[\]】)）>〉」』]/;

// 이름에서 묶음 열쇠를 뽑는다. 앞 괄호([동방] 레이무 → 동방), 아니면 첫 낱말(버전 표기 제외).
function nameKey(name) {
  const raw = String(name || '').normalize('NFKC').trim();
  const head = BRACKET_HEAD.exec(raw);
  if (head) {
    const k = head[1].trim();
    return k.length >= 2 ? k : '';
  }
  // 이모지·기호뿐인 낱말(🎮, —)과 버전 표기는 건너뛴다.
  for (const w of raw.split(NAME_SPLIT)) {
    const k = w.replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, '');
    if ([...k].length >= 2 && !/^v?\d+(\.\d+)*$/i.test(k) && !NAME_STOP.has(k.toLowerCase())) return k;
  }
  return '';
}

// 열쇠와 맞는 있는 폴더. 이름이 같거나, 낱말 하나가 같거나, 한글·한자처럼 띄어 쓰지 않는 이름이면 앞부분이 같을 때
// (동방 → 동방환유기). 영어는 낱말 단위로만 본다(The → Theater 처럼 엉뚱하게 붙지 않게).
function folderMatch(folders, title) {
  const t = normName(title).replace(/[\s\p{P}\p{S}]+/gu, '');
  if ([...t].length < 2) return null;
  const cjk = /[\p{Script=Hangul}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(t);
  for (const f of folders) {
    const words = normName(f.name).split(/[\s\p{P}\p{S}]+/u).filter(Boolean);
    const n = words.join('');
    if (!n) continue;
    if (n === t || words.includes(t) || (cjk && [...n].length >= 2 && (n.startsWith(t) || t.startsWith(n)))) return f;
  }
  return null;
}

// rootIds(폴더 밖 봇)를 묶어 폴더를 제안한다. mode = 'name' | 'creator' | 'tag'.
// 결과: [{ key, title, ids, folderId, why }] — folderId 가 있으면 있는 폴더에 넣는다.
function suggestGroups(rootIds, chars, folders, mode) {
  const known = rootIds.filter((id) => chars.get(id)?.name);
  const buckets = new Map();
  const put = (key, title, id) => {
    const k = normName(key);
    if (!k) return;
    if (!buckets.has(k)) buckets.set(k, { title, ids: [] });
    const b = buckets.get(k);
    if (!b.ids.includes(id)) b.ids.push(id);
  };
  if (mode === 'creator') {
    for (const id of known) { const cr = String(chars.get(id).creator || '').trim(); if (cr) put(cr, cr, id); }
  } else if (mode === 'tag') {
    const count = new Map();
    for (const id of known) for (const t of new Set((chars.get(id).tags || []).map((x) => String(x).trim()).filter(Boolean))) count.set(normName(t), (count.get(normName(t)) || 0) + 1);
    const tags = [...count].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const taken = new Set();
    for (const [tag] of tags) {
      const ids = known.filter((id) => !taken.has(id) && (chars.get(id).tags || []).some((x) => normName(x) === tag));
      if (ids.length < 2) continue;
      const shown = (chars.get(ids[0]).tags || []).find((x) => normName(x) === tag) || tag;
      for (const id of ids) { taken.add(id); put(tag, String(shown).trim(), id); }
    }
  } else {
    for (const id of known) { const k = nameKey(chars.get(id).name); if (k) put(k, k, id); }
  }
  const why = { name: (t) => `이름 「${t}」`, creator: (t) => `제작자 ${t}`, tag: (t) => `태그 「${t}」` }[mode] || ((t) => t);
  const out = [];
  for (const [key, b] of buckets) {
    const f = folderMatch(folders, b.title);
    if (b.ids.length < 2 && !f) continue;
    out.push({ key, title: f ? f.name : b.title, ids: b.ids, folderId: f ? f.id : null, why: why(b.title) });
  }
  return out.sort((a, b) => b.ids.length - a.ids.length || a.title.localeCompare(b.title, 'ko'));
}

// ── 배치 기록 ──

// snap 배치로 되돌린다. 지금 순서에 없는 봇(그 사이 지워진 봇)은 빼고, snap 에 없는 봇(그 사이 들어온 봇)은
// 폴더 밖 맨 뒤에 둔다. 폴더 이름·색·그림은 snap 것을 쓴다. 빈 폴더는 남기지 않는다.
function restoreOrder(current, snap) {
  const live = new Set(orderBotIds(current));
  const used = new Set();
  const out = [];
  for (const item of cloneOrder(snap)) {
    if (typeof item === 'string') {
      if (live.has(item) && !used.has(item)) { used.add(item); out.push(item); }
    } else if (isFolder(item)) {
      const data = item.data.filter((id) => live.has(id) && !used.has(id) && (used.add(id), true));
      if (data.length) out.push({ ...item, data });
    }
  }
  for (const id of orderBotIds(current)) if (!used.has(id)) { used.add(id); out.push(id); }
  return out;
}

// a → b 에서 바뀐 것 요약.
function diffOrders(a, b) {
  const fa = new Map(cloneOrder(a).filter(isFolder).map((f) => [f.id, f]));
  const fb = new Map(cloneOrder(b).filter(isFolder).map((f) => [f.id, f]));
  const where = (order) => {
    const m = new Map();
    for (const item of cloneOrder(order)) {
      if (typeof item === 'string') { if (!m.has(item)) m.set(item, ''); } else if (isFolder(item)) for (const id of item.data) if (!m.has(id)) m.set(id, item.id);
    }
    return m;
  };
  const wa = where(a);
  const wb = where(b);
  let moved = 0;
  for (const [id, at] of wb) if (wa.has(id) && wa.get(id) !== at) moved++;
  return {
    foldersAdded: [...fb.values()].filter((f) => !fa.has(f.id)).map((f) => f.name || '이름 없음'),
    foldersRemoved: [...fa.values()].filter((f) => !fb.has(f.id)).map((f) => f.name || '이름 없음'),
    renamed: [...fb.values()].filter((f) => fa.has(f.id) && (fa.get(f.id).name || '') !== (f.name || '')).map((f) => [fa.get(f.id).name || '이름 없음', f.name || '이름 없음']),
    moved,
    botsAdded: [...wb.keys()].filter((id) => !wa.has(id)).length,
    botsRemoved: [...wa.keys()].filter((id) => !wb.has(id)).length,
  };
}

function sameOrder(a, b) {
  return JSON.stringify(cloneOrder(a)) === JSON.stringify(cloneOrder(b));
}

// ── 보관함·통계 ──

// 오래 대화하지 않은 봇(마지막 대화 시각을 아는 봇만). finished = 「엔딩 봄」 같은 라벨이 붙어 날짜와 상관없이 넣을 봇.
// 결과: [{ id, days, finished }] 오래된 순(finished 먼저).
function archiveCandidates(order, chars, { days = 60, archiveId = '', keep = [], finished = [], now = Date.now() } = {}) {
  const skip = new Set(keep);
  const fin = new Set(finished);
  const inArchive = new Set(archiveId ? (order.find((x) => isFolder(x) && x.id === archiveId)?.data || []) : []);
  const out = [];
  for (const id of new Set(orderBotIds(order))) {
    if (skip.has(id) || inArchive.has(id)) continue;
    const c = chars.get(id);
    if (!c) continue;
    const age = c.last ? Math.floor((now - c.last) / DAY_MS) : null;
    if (fin.has(id)) out.push({ id, days: age, finished: true });
    else if (age !== null && age >= days) out.push({ id, days: age, finished: false });
  }
  return out.sort((a, b) => (b.finished - a.finished) || (b.days ?? -1) - (a.days ?? -1));
}

// 폴더별 통계. active = 최근 30일 안에 대화한 봇.
function folderStats(order, chars, { now = Date.now(), activeDays = 30 } = {}) {
  const act = (id) => { const c = chars.get(id); return !!(c && c.last && now - c.last <= activeDays * DAY_MS); };
  const rows = [];
  const root = [];
  for (const item of cloneOrder(order)) {
    if (isFolder(item)) rows.push({ id: item.id, name: item.name || '이름 없음', color: item.color, total: item.data.length, active: item.data.filter(act).length });
    else if (typeof item === 'string') root.push(item);
  }
  const all = [...new Set(orderBotIds(order))];
  let oldest = null;
  for (const id of all) { const c = chars.get(id); if (c && c.last && (!oldest || c.last < oldest.last)) oldest = { id, last: c.last }; }
  const top = rows.filter((r) => r.active).sort((a, b) => b.active - a.active)[0] || null;
  return {
    total: all.length,
    folders: rows.length,
    active: all.filter(act).length,
    root: { total: root.length, active: root.filter(act).length },
    known: all.filter((id) => chars.has(id)).length,
    rows,
    top,
    oldest,
  };
}

// ── 기타 설정(서버) ──

function plusNorm(v) {
  const o = v && typeof v === 'object' ? v : {};
  const r = o.recent && typeof o.recent === 'object' ? o.recent : {};
  const l = o.labelFolder && typeof o.labelFolder === 'object' ? o.labelFolder : {};
  const a = o.archive && typeof o.archive === 'object' ? o.archive : {};
  const str = (x, n = 300) => (typeof x === 'string' ? x.slice(0, n) : '');
  return {
    recent: {
      on: r.on === true,
      count: [5, 8, 12].includes(r.count) ? r.count : 8,
      noStars: r.noStars === true,
      first: r.first === 'favorites' ? 'favorites' : 'recent',
      name: str(r.name, 80),
      imgFile: str(r.imgFile),
    },
    labelFolder: { lid: str(l.lid, 40), name: str(l.name, 80), imgFile: str(l.imgFile) },
    archive: {
      on: a.on !== false,
      days: [30, 60, 90].includes(a.days) ? a.days : 60,
      folderId: str(a.folderId, 80),
      snooze: Number(a.snooze) > 0 ? Number(a.snooze) : 0,
    },
    dupIgnore: Array.isArray(o.dupIgnore) ? [...new Set(o.dupIgnore.filter((x) => typeof x === 'string' && x))].slice(-200) : [],
  };
}

// op = { k: 'recent'|'labelFolder'|'archive', set: {...} } | { k: 'dupIgnore', add: [...] }
function plusApply(state, op) {
  const s = plusNorm(state);
  if (op.k === 'dupIgnore') s.dupIgnore = [...s.dupIgnore, ...(op.add || [])];
  else if (s[op.k] && op.set) s[op.k] = { ...s[op.k], ...op.set };
  return plusNorm(s);
}

function recentNorm(v) {
  const list = Array.isArray(v?.list) ? v.list.filter((t) => t && typeof t.id === 'string' && Number(t.at) > 0).map((t) => ({ id: t.id, at: Number(t.at) })) : [];
  return { list: list.slice(0, 40) };
}

// op = { id, at }
function recentApply(state, op) {
  return { list: recentTrack(recentNorm(state).list, op.id, op.at) };
}

// ── src/core/store.js ──
// 호스트(RisuAI) 읽기·쓰기. 저장은 한 줄로 세워 차례로 하고, 매번 최신 데이터 위에서 고친다.

const HISTORY_LIMIT = 20;

// 즐겨찾기 바로가기 폴더(core/shortcut.js) 상태. last = 마지막으로 확인한 base(사이드바 손질 복구 기준).
const shortcutState = { last: null, dbOk: false };

function currentShortcutOpts() {
  return typeof shortcutOpts === 'function' ? shortcutOpts() : null;
}

async function readDatabase(keys) {
  const db = await Risuai.getDatabase(keys);
  if (!db) throw new Error('데이터베이스 접근 권한이 필요합니다. 권한 요청 창에서 허용해 주세요');
  shortcutState.dbOk = true;
  return db;
}

// 저장된 그대로(바로가기 폴더 포함). 사이드바와 칸을 맞춰 볼 때만 쓴다.
async function readRawOrder() {
  const db = await readDatabase(['characterOrder']);
  return cloneOrder(db.characterOrder);
}

// 폴더 마스터가 다루는 순서: 바로가기 폴더를 빼고 사이드바 손질 흔적을 고친 것.
async function readOrder() {
  return shortcutBase(await readRawOrder(), shortcutState.last);
}

// base 를 저장할 모양(바로가기 폴더 포함)으로.
function rawFor(base, raw) {
  return keepShortcutImg(withShortcut(base, currentShortcutOpts()), raw);
}

// 화면에 필요한 가벼운 정보만 남긴다.
function summarizeCharacter(c) {
  const assets = Array.isArray(c.additionalAssets) ? c.additionalAssets.length : 0;
  const modules = Array.isArray(c.modules) ? c.modules.length : 0;
  const creator = typeof c.creator === 'string' && c.creator.trim() ? c.creator.trim() : typeof c.additionalData?.creator === 'string' ? c.additionalData.creator.trim() : '';
  const tagSrc = Array.isArray(c.tags) && c.tags.length ? c.tags : Array.isArray(c.additionalData?.tag) ? c.additionalData.tag : [];
  const tags = tagSrc.filter((t) => typeof t === 'string' && t.trim()).map((t) => t.trim().slice(0, 40)).slice(0, 12);
  return {
    id: c.chaId,
    name: typeof c.name === 'string' && c.name ? c.name : '이름 없음',
    image: typeof c.image === 'string' ? c.image : '',
    group: c.type === 'group',
    last: Number(c.lastInteraction) || 0,
    assets,
    modules,
    creator: creator.slice(0, 60),
    tags,
  };
}

const saver = {
  queue: Promise.resolve(),
  history: [],
  pending: 0,
  onBusy: () => {},
  onCommitted: () => {},

  run(task) {
    const job = this.queue.then(task);
    this.queue = job.catch(() => {});
    this.pending++;
    this.onBusy(true);
    return job.finally(() => {
      this.pending--;
      if (!this.pending) this.onBusy(false);
    });
  },

  // v3 에는 원자적 비교-쓰기가 없다(읽기와 setDatabaseLite 가 따로 오간다). 완전히 막을 수는 없으므로 창을 좁힌다:
  // 쓰기 직전에 다시 읽어 그 사이 바뀌었으면 최신 값에 같은 작업을 다시 적용하고, 쓴 뒤에는 다시 읽어 결과를 확인한다.
  async writeChecked(before, next) {
    const raw = await readRawOrder();
    const latest = shortcutBase(raw, shortcutState.last);
    if (JSON.stringify(latest) !== JSON.stringify(before)) return 'changed';
    await Risuai.setDatabaseLite({ characterOrder: rawFor(next, raw) });
    const after = await readOrder();
    const ok = JSON.stringify(after) === JSON.stringify(cloneOrder(next));
    if (ok) shortcutState.last = cloneOrder(next);
    return ok ? 'ok' : 'drift';
  },

  // 바로가기 폴더만 맞춘다(즐겨찾기 변경·사이드바에서 고친 것 되돌리기). 되돌리기 기록은 남기지 않는다.
  // 반환: 'written' | 'same'
  syncShortcut() {
    const job = this.queue.then(async () => {
      const raw = await readRawOrder();
      const base = shortcutBase(raw, shortcutState.last);
      const next = rawFor(base, raw);
      shortcutState.last = base;
      if (JSON.stringify(next) === JSON.stringify(raw)) return 'same';
      validateOrder(next);
      await Risuai.setDatabaseLite({ characterOrder: next });
      return 'written';
    });
    this.queue = job.catch(() => {});
    return job;
  },

  // mutate(최신 순서 사본) → 새 순서 | null(변경 없음). 최신 값이 바뀌면 mutate 를 다시 부른다.
  // expect 를 주면(순서 편집) 시작 때 본 값과 다르면 저장하지 않는다.
  commit(label, mutate, expect) {
    return this.run(async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        const before = await readOrder();
        if (expect !== undefined && JSON.stringify(before) !== expect) {
          throw new Error('편집하는 동안 다른 곳에서 순서가 바뀌어 저장하지 않았습니다. 새로고침 후 다시 해 주세요');
        }
        const next = await mutate(cloneOrder(before));
        if (!next) return null;
        validateOrder(next);
        if (JSON.stringify(next) === JSON.stringify(before)) return null;
        const result = await this.writeChecked(before, next);
        if (result === 'changed') continue;
        if (result === 'drift') {
          // 쓴 직후 다른 곳에서 또 바뀌었다. 되돌리기 기록은 남기지 않는다(덮어쓸 위험).
          this.warning = '저장 직후 다른 곳에서 순서가 바뀌었습니다. 목록을 확인해 주세요';
          return next;
        }
        this.history.push({ label, before, after: next });
        if (this.history.length > HISTORY_LIMIT) this.history.shift();
        this.onCommitted(label, next);
        return next;
      }
      throw new Error('다른 곳에서 순서가 계속 바뀌고 있어 저장하지 않았습니다. 잠시 뒤 다시 해 주세요');
    });
  },

  takeWarning() {
    const w = this.warning;
    this.warning = null;
    return w;
  },

  undo() {
    return this.run(async () => {
      const entry = this.history[this.history.length - 1];
      if (!entry) return null;
      const result = await this.writeChecked(entry.after, entry.before);
      if (result === 'changed') {
        this.history.length = 0;
        throw new Error('그 뒤에 다른 곳에서 순서가 바뀌어 되돌릴 수 없습니다');
      }
      this.history.pop();
      if (result === 'ok') this.onCommitted(`되돌림: ${entry.label}`, entry.before);
      if (result === 'drift') this.warning = '되돌린 직후 다른 곳에서 순서가 바뀌었습니다. 목록을 확인해 주세요';
      return entry;
    });
  },
};

// 아바타: readImage 결과를 blob URL로 바꿔 캐시한다. 동시에 너무 많이 읽지 않는다.
const avatars = {
  gen: 0,
  cache: new Map(),
  waiting: new Map(),
  active: 0,
  limit: 6,
  backlog: [],

  peek(path) {
    return this.cache.get(path) || null;
  },

  load(path) {
    if (!path) return Promise.resolve(null);
    if (path.startsWith('data:') || path.startsWith('blob:') || path.startsWith('http')) return Promise.resolve(path);
    if (this.cache.has(path)) return Promise.resolve(this.cache.get(path));
    if (this.waiting.has(path)) return this.waiting.get(path);
    const job = new Promise((resolve) => this.backlog.push({ path, resolve }));
    this.waiting.set(path, job);
    this.pump();
    return job;
  },

  pump() {
    while (this.active < this.limit && this.backlog.length) {
      const { path, resolve } = this.backlog.shift();
      const gen = this.gen;
      this.active++;
      this.fetch(path)
        .then((url) => {
          // 정리한 뒤 늦게 온 그림은 캐시에 넣지 않고 바로 버린다.
          if (gen !== this.gen) { if (url && url.startsWith('blob:')) URL.revokeObjectURL(url); resolve(null); return; }
          if (url) this.cache.set(path, url);
          resolve(url);
        })
        .finally(() => { this.waiting.delete(path); this.active--; this.pump(); });
    }
  },

  async fetch(path) {
    try {
      const raw = await Risuai.readImage(path);
      if (typeof raw === 'string') return raw.startsWith('data:') || raw.startsWith('blob:') ? raw : null;
      const bytes = toBytes(raw);
      if (!bytes || !bytes.byteLength) return null;
      return URL.createObjectURL(new Blob([bytes], { type: imageMime(bytes) || 'image/png' }));
    } catch {
      return null;
    }
  },

  // 대기열만 비운다. 캐시는 화면을 다시 열 때 재사용한다.
  cancel() {
    for (const { path, resolve } of this.backlog) { this.waiting.delete(path); resolve(null); }
    this.backlog.length = 0;
  },

  clear() {
    this.gen++;
    this.cancel();
    for (const url of this.cache.values()) if (url.startsWith('blob:')) URL.revokeObjectURL(url);
    this.cache.clear();
  },
};

// ── src/core/syncstore.js ──
// 서버 플러그인 저장소에 두는 작은 기록(기기끼리 같이 씀). 쓸 때는 서버 값을 다시 읽어 이번 변경만 얹는다.
// 해적판은 setItem 이 늦게 반영되어 바로 읽으면 옛 값이 오므로, 반영되지 않은 내 변경을 기억해 읽을 때마다 다시 얹는다.
// 쓸 때마다 값에 쓰기 표시(_w)를 붙이고, 서버 값의 표시가 어느 쓰기인지로 반영 여부를 본다(값이 우연히 같아도 헷갈리지 않게).
// 그 쓰기와 그보다 앞선 쓰기는 반영된 것으로 지우고, 뒤의 변경만 차례대로 다시 얹는다.

const SYNC_PENDING_MS = 60000;

function createSyncStore(key, norm, apply, prune) {
  const st = {
    key,
    state: norm(null),
    saved: null,
    pending: [],
    queue: Promise.resolve(),

    async read() {
      const saved = await Risuai.pluginStorage.getItem(key);
      let state = norm(saved);
      const now = Date.now();
      const mark = saved && typeof saved === 'object' ? saved._w : null;
      let seen = -1;
      if (mark) st.pending.forEach((p, i) => { if (p.mark === mark) seen = i; });
      if (seen >= 0) st.pending.splice(0, seen + 1);
      while (st.pending.length && now - st.pending[0].at > SYNC_PENDING_MS) st.pending.shift();
      for (const { op } of st.pending) state = apply(state, op);
      return { saved, state };
    },

    async load() {
      try {
        const { saved, state } = await st.read();
        st.saved = saved;
        st.state = state;
      } catch {}
      return st.state;
    },

    // 화면은 바로 바꾸고 저장은 줄 세워 한다. after() 는 저장 뒤에 부른다.
    change(op, after) {
      st.state = apply(st.state, op);
      const job = st.queue.then(async () => {
        const { state } = await st.read();
        const next = norm(prune ? prune(apply(state, op)) : apply(state, op));
        const mark = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        st.pending.push({ op, at: Date.now(), mark });
        await Risuai.pluginStorage.setItem(key, { ...next, _w: mark });
        st.state = next;
        if (after) await after();
      });
      st.queue = job.catch(() => {});
      return job;
    },
  };
  return st;
}

// ── src/core/roster.js ──
// 봇 이름·그림 공급. 플러그인 API(v3)만 쓰며 서버에 따라 길을 고른다.
//  single  : getCharacterFromIndex(chaId) — 해적 RisuAI. 한 번에 한 캐릭터(+그 채팅)를 받으므로
//            화면에 보이는 봇만 몇 개씩 읽고, 읽은 요약은 이 기기에 저장해 다음에 바로 쓴다.
//            전체를 미리 읽지 않는다(봇이 수백 개면 서버 부담이 크다). 필요하면 rosterAll.
//  full    : getDatabase(['characters']) — 공식 RisuAI. 캐릭터가 메모리에 있어 빠르다.
//  unknown : 판별 실패. 아무것도 읽지 않고 지워짐 판정도 하지 않는다(저장된 이름만 보여 주고 다시 시도를 띄운다).
// 해적판의 getDatabase(['characters'])는 모든 캐릭터와 채팅을 차례로 받아 봇이 많으면 끝나지 않으므로,
// 공식판이라는 확실한 증거가 있을 때만 full 로 간다.

const ROSTER_CACHE_KEY = 'risuFolderMaster.roster';
const ROSTER_LIMIT = 3;

const roster = {
  mode: null,
  chars: new Map(),
  missing: new Set(),
  failed: new Set(),
  fetched: new Set(), // 이번에 창을 연 뒤 서버에서 실제로 확인한 봇
  ids: [],
  queue: [],
  queued: new Set(),
  active: 0, // 실제로 나가 있는 요청 수(세대와 무관하게, 끝날 때만 줄인다)
  gen: 0,
  store: null,
  saveTimer: null,
  waiters: [],
  countsChanged: false,
  onUpdate: () => {},

  resolved(id) {
    return this.chars.has(id) || this.missing.has(id);
  },

  // 이번에 서버에서 실제로 확인했는지(기기 캐시만 있는 것은 확인 전으로 본다).
  verified(id) {
    if (this.mode === 'full') return this.resolved(id);
    return this.fetched.has(id) && !this.failed.has(id);
  },

  unknown() {
    let n = 0;
    for (const id of this.ids) if (!this.resolved(id)) n++;
    return n;
  },

  pending() {
    return this.queue.length + this.active;
  },
};

function rosterSetIds(ids) {
  roster.ids = [...new Set(ids)];
}

function rosterFill(list) {
  roster.chars.clear();
  for (const c of list) if (c && typeof c.chaId === 'string' && c.chaId) roster.chars.set(c.chaId, summarizeCharacter(c));
  const before = roster.missing.size;
  roster.missing = new Set(roster.ids.filter((id) => !roster.chars.has(id)));
  if (before !== roster.missing.size) roster.countsChanged = true;
}

// 판별: 숫자 0번 캐릭터를 읽고, 그 chaId 문자열로 다시 읽어 본다.
//  같은 캐릭터가 오면 해적판(single), 던지지 않고 빈 값이면 공식판(full), 던지거나 판단이 안 서면 unknown.
async function rosterProbe() {
  let first;
  try { first = await Risuai.getCharacterFromIndex(0); } catch { return { mode: 'unknown' }; }
  if (!first || typeof first.chaId !== 'string') return { mode: 'unknown' };
  let again;
  try { again = await Risuai.getCharacterFromIndex(first.chaId); } catch { return { mode: 'unknown' }; }
  if (again && again.chaId === first.chaId) return { mode: 'single', sample: again };
  if (again === null || again === undefined) return { mode: 'full' };
  return { mode: 'unknown' };
}

async function rosterLoadCache() {
  try {
    roster.store = await Risuai.getLocalPluginStorage();
    const saved = await roster.store.getItem(ROSTER_CACHE_KEY);
    if (saved && typeof saved === 'object') {
      for (const [id, c] of Object.entries(saved)) if (c && typeof c.name === 'string') roster.chars.set(id, { ...c, id });
    }
  } catch {}
}

function rosterSaveSoon() {
  if (!roster.store || roster.saveTimer) return;
  roster.saveTimer = setTimeout(() => {
    roster.saveTimer = null;
    // 지금 폴더 배치(characterOrder)에 있는 봇만 남긴다. 지운 봇·빠진 봇은 저장에서 떨어져 계속 쌓이지 않는다.
    const keep = roster.ids.length ? new Set(roster.ids) : null;
    const out = {};
    for (const [id, c] of roster.chars) if (!keep || keep.has(id)) out[id] = c;
    try { roster.store.setItem(ROSTER_CACHE_KEY, out); } catch {}
  }, 1500);
}

// single 응답 해석: 같은 봇이면 있음, 빈 값이면 없음, 다른 봇이 오면 실패(지워짐으로 보지 않는다).
function rosterApply(id, c) {
  roster.fetched.add(id);
  const wasMissing = roster.missing.has(id);
  if (c && c.chaId === id) {
    roster.failed.delete(id);
    roster.chars.set(id, summarizeCharacter(c));
    roster.missing.delete(id);
  } else if (c === null || c === undefined) {
    roster.failed.delete(id);
    roster.chars.delete(id);
    roster.missing.add(id);
  } else {
    roster.failed.add(id);
  }
  if (wasMissing !== roster.missing.has(id)) roster.countsChanged = true;
  rosterSaveSoon();
}

// 창을 열 때마다: 이번 확인 기록을 비우고(저장된 이름은 그대로), 쓸 길을 정한다.
async function rosterStart(ids) {
  const gen = ++roster.gen;
  rosterSetIds(ids);
  roster.queue = [];
  roster.queued.clear();
  roster.fetched.clear();
  roster.failed.clear();
  if (!roster.store) await rosterLoadCache();
  if (gen !== roster.gen) return;
  if (roster.mode === null || roster.mode === 'unknown') {
    let probe = { mode: 'unknown' };
    for (let attempt = 0; attempt < 3 && probe.mode === 'unknown'; attempt++) {
      if (attempt) await new Promise((r) => setTimeout(r, 800));
      probe = await rosterProbe();
      if (gen !== roster.gen) return;
    }
    roster.mode = probe.mode;
    if (probe.sample) rosterApply(probe.sample.chaId, probe.sample);
  }
  if (roster.mode === 'full') {
    const db = await readDatabase(['characters']);
    if (gen !== roster.gen) return;
    rosterFill(Array.isArray(db.characters) ? db.characters : []);
  }
  rosterNotify(roster.ids);
}

function rosterEnqueue(ids, front) {
  if (roster.mode !== 'single') return;
  const fresh = ids.filter((id) => !roster.fetched.has(id) && !roster.queued.has(id));
  for (const id of fresh) roster.queued.add(id);
  if (front) roster.queue.unshift(...fresh);
  else roster.queue.push(...fresh);
  rosterPump();
  if (fresh.length) rosterNotify([]);
}

// 화면에 보이는 봇: 저장된 적 없는 것부터 앞에, 이번에 아직 확인 안 한 것도 뒤이어 다시 읽는다.
function rosterWant(ids) {
  if (roster.mode !== 'single') return;
  rosterEnqueue(ids.filter((id) => roster.chars.has(id)), true);
  rosterEnqueue(ids.filter((id) => !roster.chars.has(id)), true);
}

// 재확인 같은 직접 요청도 같은 동시 요청 제한(3개) 안에서 돈다. 슬롯은 실제 요청이 끝날 때만 돌려준다.
const slotWaiters = [];
function rosterAcquire() {
  if (roster.active < ROSTER_LIMIT) { roster.active++; return Promise.resolve(); }
  return new Promise((resolve) => slotWaiters.push(resolve));
}
function rosterRelease() {
  const next = slotWaiters.shift();
  if (next) next(); // 슬롯을 그대로 넘긴다
  else roster.active--;
}

function rosterPump() {
  const gen = roster.gen;
  while (roster.active < ROSTER_LIMIT && !slotWaiters.length && roster.queue.length) {
    const id = roster.queue.shift();
    roster.active++;
    Risuai.getCharacterFromIndex(id)
      .then((c) => { if (gen === roster.gen) rosterApply(id, c); })
      .catch(() => { if (gen === roster.gen) { roster.fetched.add(id); roster.failed.add(id); } })
      .finally(() => {
        rosterRelease();
        if (gen === roster.gen) {
          roster.queued.delete(id);
          rosterNotify([id]);
        }
        rosterPump();
      });
  }
  if (!roster.queue.length && !roster.active) {
    for (const w of roster.waiters.splice(0)) w('done');
  }
}

function rosterNotify(ids) {
  try { roster.onUpdate(ids); } catch {}
}

// 점검처럼 모든 봇이 필요할 때. single 이면 이번에 확인 안 한 봇(실패한 봇 포함)을 모두 읽는다.
// 결과: 'done' | 'cancelled'
async function rosterAll() {
  if (roster.mode === 'full') { await rosterStart(roster.ids); return 'done'; }
  if (roster.mode !== 'single') return 'cancelled';
  for (const id of roster.ids) if (roster.failed.has(id)) { roster.failed.delete(id); roster.fetched.delete(id); }
  rosterEnqueue(roster.ids, false);
  if (!roster.queue.length && !roster.active) return 'done';
  return new Promise((resolve) => roster.waiters.push(resolve));
}

// 창을 닫으면 대기열을 버린다. 나가 있는 요청은 끝나게 두되 결과는 버린다. 캐시는 남긴다.
function rosterStop() {
  roster.gen++;
  roster.queue = [];
  roster.queued.clear();
  for (const w of roster.waiters.splice(0)) w('cancelled');
}

// 기다리는 요청만 버린다(이미 시작한 요청은 끝나게 둔다).
function rosterCancelQueue() {
  for (const id of roster.queue) roster.queued.delete(id);
  roster.queue = [];
  for (const w of roster.waiters.splice(0)) w('cancelled');
  rosterNotify([]);
}

// 실패한 봇만 다시 읽는다(자동 반복 재시도는 하지 않는다).
function rosterRetry(ids) {
  for (const id of ids) { roster.failed.delete(id); roster.fetched.delete(id); }
  rosterEnqueue(ids, true);
}

// 이 봇들이 있는지 알아야 할 때. single 이면 모르는 것만 앞당겨 읽고 기다린다. 창을 닫으면 멈춘다.
async function rosterResolve(ids, timeoutMs = 30000) {
  if (roster.mode !== 'single') return;
  const gen = roster.gen;
  const start = Date.now();
  for (;;) {
    if (gen !== roster.gen) return;
    const unknown = ids.filter((id) => !roster.resolved(id) && !roster.failed.has(id));
    if (!unknown.length || Date.now() - start > timeoutMs) return;
    rosterEnqueue(unknown, true);
    await new Promise((r) => setTimeout(r, 150));
  }
}

// 지우기 직전 재확인. 대기열을 거치지 않고 이번 호출에서 직접 다시 읽어, 이번 응답으로
// 없음이 확인된 봇만 missing 으로 돌려준다. 시간이 넘었거나 실패한 봇은 failed 로 돌려준다(지우지 않음).
async function rosterVerify(ids, timeoutMs = 60000) {
  const out = { missing: [], present: [], failed: [] };
  const gen = roster.gen;
  if (roster.mode === 'full') {
    const db = await readDatabase(['characters']);
    if (gen !== roster.gen) { out.failed.push(...ids); return out; }
    const have = new Set((Array.isArray(db.characters) ? db.characters : []).map((c) => c && c.chaId));
    for (const id of ids) (have.has(id) ? out.present : out.missing).push(id);
    return out;
  }
  if (roster.mode !== 'single') { out.failed.push(...ids); return out; }
  const deadline = Date.now() + timeoutMs;
  const todo = [...ids];
  const one = async (id) => {
    await rosterAcquire();
    let timer = null;
    const request = Risuai.getCharacterFromIndex(id);
    request.catch(() => {}).finally(rosterRelease); // 기한이 지나도 실제 요청이 끝날 때 슬롯을 돌려준다
    try {
      const c = await Promise.race([request, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), Math.max(1, deadline - Date.now())); })]);
      if (gen !== roster.gen) { out.failed.push(id); return; } // 창을 닫았으면 결과를 쓰지 않는다
      if (c && c.chaId === id) out.present.push(id);
      else if (c === null || c === undefined) out.missing.push(id);
      else out.failed.push(id);
      rosterApply(id, c);
    } catch { out.failed.push(id); }
    finally { clearTimeout(timer); }
  };
  const worker = async () => {
    while (todo.length) {
      const id = todo.shift();
      if (Date.now() > deadline || gen !== roster.gen) { out.failed.push(id); continue; }
      await one(id);
    }
  };
  await Promise.all(Array.from({ length: Math.min(ROSTER_LIMIT, ids.length) }, worker));
  return out;
}

// ── src/sidebar/grid.js ──
// RisuAI 왼쪽 사이드바를 여러 열로 펼친다.
// 설정은 플러그인 저장소(서버 동기화)에 두고, 플러그인이 켜질 때마다 메인 문서 <head>에 별도 style을 넣는다.
// customCSS는 쓰지 않는다. 테마 프리셋 플러그인 등이 customCSS를 통째로 바꾸면 함께 지워졌기 때문이다(v3.07까지의 문제).
// style 내용은 v3 setInnerHTML 의 DOMPurify를 거치므로 CSS에 < > & 를 쓰지 않는다(직계 자식 선택자 금지).

const GRID_KEY = 'risuFolderMaster.sidebarGrid';
const GRID_STYLE_XID = 'risu-folder-master-sidebar-grid';
const SIDEBAR_CELL_REM = 4.5;
// 정리할 때 다시 권한을 묻지 않도록 한 번 얻은 메인 문서를 기억한다.
let rootDoc = null;
const GRID_MODES = ['off', 'all', 'folder'];
// 사이드바 스크롤 칸: 해적판은 .rs-sidebar-scroll, 공식판은 이름표 없이 같은 클래스 조합이다.
const SIDEBAR_SCROLL = '.rs-sidebar .rs-sidebar-scroll, .rs-sidebar .flex.grow.w-full.flex-col.overflow-y-auto';
const LEGACY_GRID_RE = /\/\* \[sidebar-grid-start\] \*\/[\s\S]*?\/\* \[sidebar-grid-end\] \*\//g;

function normalizeGrid(value) {
  const v = value && typeof value === 'object' ? value : {};
  return {
    mode: GRID_MODES.includes(v.mode) ? v.mode : 'off',
    cols: clamp(parseInt(v.cols, 10) || 2, 2, 5),
    align: v.align === true,
    motion: v.motion === true,
    borderless: v.borderless === true,
  };
}

function gridLabel(grid) {
  if (grid.mode === 'all') return `항상 ${grid.cols}열`;
  if (grid.mode === 'folder') return `폴더 열면 ${grid.cols}열`;
  return '기본 1열' + (grid.align || grid.motion || grid.borderless ? ' · 꾸미기' : '');
}

function sidebarEnabled(grid) {
  return grid.mode !== 'off' || grid.align || grid.motion || grid.borderless;
}

// 배열과 꾸미기는 독립적이다. 공식판에는 rs-sidebar-scroll 이름표가 없다.
function buildSidebarDecorationCSS(grid) {
  const cell = SIDEBAR_CELL_REM;
  const scroll = ':is(.rs-sidebar-scroll,.flex.grow.w-full.flex-col.overflow-y-auto)';
  const root = `.rs-sidebar:has(${scroll})`;
  const box = `${root} ${scroll} .p-1.flex-col.py-1.mt-1.rounded-lg.relative`;
  const item = '.group.relative.flex.items-center.px-2';
  const menuTarget = ':is(.rs-sidebar-menu-popover,:is(.border-b-selected,.border-t-selected) .absolute.w-20.min-w-20.flex.flex-col.items-center)';
  const menu = `${root} ${menuTarget}`;
  const toggle = `${root} button.flex.h-8.min-h-8.w-14.min-w-14`;
  const css = [];
  if (grid.align) {
    css.push(
      `${root}{align-items:flex-start!important}`,
      `${root} ${scroll}{align-items:flex-start!important}`,
      `${root} ${scroll} ${item}{width:${cell}rem!important;min-width:${cell}rem!important;box-sizing:border-box!important;justify-content:center!important;flex-shrink:0!important;margin:.25rem 0!important}`,
      `${box}{row-gap:.5rem!important;padding-top:.5rem!important;padding-bottom:.5rem!important;margin-top:.35rem!important;margin-bottom:.35rem!important}`,
      `${root} ${scroll} .flex.flex-col.items-center.gap-2.px-2{width:${cell}rem!important;min-width:${cell}rem!important;box-sizing:border-box!important;align-items:center!important;padding-top:.25rem!important;padding-bottom:.25rem!important}`,
      `${toggle}{align-self:flex-start!important;margin-left:.75rem!important;margin-right:auto!important;flex-shrink:0!important}`,
    );
    // 단열 중심은 5rem 레일에 맞추고, 다열은 기존 셀 폭 계산을 따른다.
    if (grid.mode !== 'all') css.push(
      `${root} ${scroll} ${item}{margin-left:.25rem!important}`,
      `${box} ${item}{margin-left:0!important}`,
      `${root} ${scroll} .flex.flex-col.items-center.gap-2.px-2{margin-left:.25rem!important}`,
    );
  }
  if (grid.borderless) css.push(
    `${root} ${scroll} ${item} .avatar.border{border-color:transparent!important;box-shadow:none!important}`,
    `${box} .absolute.top-0.left-1.border.w-full.h-full.rounded-lg.z-0{border-color:transparent!important}`,
  );
  if (grid.motion) css.push(
    `@media (prefers-reduced-motion:no-preference){`,
    `${root}{transition:width .25s cubic-bezier(.25,1,.5,1),min-width .25s cubic-bezier(.25,1,.5,1)!important}`,
    `${box}{animation:fm-sidebar-folder-open .2s ease-out!important}`,
    `${menu}{transform-origin:top center;animation:fm-sidebar-menu-open .2s ease-out!important}`,
    `${menu}.bottom-full{transform-origin:bottom center;animation-name:fm-sidebar-menu-open-bottom!important}`,
    `${toggle} svg{transition:transform .2s ease!important}`,
    `${root}:has(${menuTarget}) button.flex.h-8.min-h-8.w-14.min-w-14 svg{transform:rotate(90deg)!important}`,
    `@keyframes fm-sidebar-folder-open{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}`,
    `@keyframes fm-sidebar-menu-open{from{opacity:0;transform:translateY(-8px) scaleY(.96)}to{opacity:1;transform:translateY(0) scaleY(1)}}`,
    `@keyframes fm-sidebar-menu-open-bottom{from{opacity:0;transform:translateY(8px) scaleY(.96)}to{opacity:1;transform:translateY(0) scaleY(1)}}`,
    `}`,
  );
  return css.join('\n');
}

// 사이드바 칸 하나 = 아바타 56px + 좌우 여백 = 4.5rem.
// 칸 사이의 드롭 자리(.h-4.min-h-4.w-14)는 폭 0으로 겹쳐 두어 열을 밀지 않으면서 끌어 놓기 자리로 남긴다.
function buildGridCSS(grid) {
  const decoration = buildSidebarDecorationCSS(grid);
  if (grid.mode === 'off') return decoration;
  const cell = SIDEBAR_CELL_REM;
  const width = (grid.cols * cell + 1.25).toFixed(2) + 'rem';
  // 해적판은 .rs-sidebar-scroll, 공식판은 같은 칸에 이름표가 없어 클래스 조합으로 함께 잡는다.
  const scroll = ':is(.rs-sidebar-scroll,.flex.grow.w-full.flex-col.overflow-y-auto)';
  const box = `${scroll} .p-1.flex-col.py-1.mt-1.rounded-lg.relative`;
  const row = 'flex-direction:row!important;flex-wrap:wrap!important;justify-content:flex-start!important;align-content:flex-start!important;align-items:center!important';
  const item = '.group.relative.flex.items-center.px-2';
  const gap = '.h-4.min-h-4.w-14';
  const gapRule = '{width:.5rem!important;min-width:.5rem!important;height:3.5rem!important;min-height:3.5rem!important;margin:0 -.25rem!important;position:relative!important;z-index:1!important}';
  const itemRule = `{width:${cell}rem!important;min-width:${cell}rem!important;justify-content:center!important}`;
  const sidebarRule = `{width:${width}!important;min-width:${width}!important;max-width:none!important;flex-shrink:0!important}`;
  const lines = [decoration, `/* folder-master sidebar grid: ${grid.mode} ${grid.cols} */`];
  if (grid.mode === 'all') {
    lines.push(
      `.rs-sidebar.rs-sidebar${sidebarRule}`,
      `.rs-sidebar ${scroll}{${row};padding:0 .25rem!important}`,
      `.rs-sidebar ${scroll} ${item}${itemRule}`,
      `.rs-sidebar ${scroll} ${gap}${gapRule}`,
      `.rs-sidebar ${box}{${row};flex:0 0 100%!important;width:100%!important;max-width:none!important}`,
      `.rs-sidebar ${scroll} .flex.flex-col.items-center.gap-2.px-2{flex:0 0 100%!important}`,
    );
  } else {
    const boxWidth = (grid.cols * cell + 0.5).toFixed(2) + 'rem';
    lines.push(
      `.rs-sidebar.rs-sidebar:has(${box})${sidebarRule}`,
      `.rs-sidebar ${box}{${row};width:${boxWidth}!important;max-width:none!important;flex:0 0 auto!important}`,
      `.rs-sidebar ${box} ${item}${itemRule}`,
      `.rs-sidebar ${box} ${gap}${gapRule}`,
    );
  }
  return lines.join('\n');
}

async function loadGrid() {
  try {
    return normalizeGrid(await Risuai.pluginStorage.getItem(GRID_KEY));
  } catch {
    return normalizeGrid(null);
  }
}

async function saveGrid(grid) {
  const value = normalizeGrid(grid);
  await Risuai.pluginStorage.setItem(GRID_KEY, value);
  return value;
}

// v3 querySelectorAll 은 iframe 너머의 SafeClassArray(length()·at())를 돌려준다. 보통 배열로 바꾼다.
async function remoteList(list) {
  if (!list) return [];
  if (Array.isArray(list)) return list;
  const n = await list.length();
  const out = [];
  for (let i = 0; i < n; i++) out.push(await list.at(i));
  return out;
}

// 메인 문서에 style을 넣거나 뺀다. 권한이 없으면 false.
// 메인 문서 <head>의 x-id style 하나를 만들거나 고치거나(css 가 비면) 지운다.
async function setRootStyle(doc, xid, css) {
  const list = await remoteList(await doc.querySelectorAll(`style[x-id="${xid}"]`));
  if (!css) {
    for (const el of list) await el.remove();
    return;
  }
  let style = list.shift();
  for (const extra of list) await extra.remove();
  if (!style) {
    style = await doc.createElement('style');
    await style.setAttribute('x-id', xid);
    const head = await doc.querySelector('head');
    await (head || doc).appendChild(style);
  }
  await style.setInnerHTML(css);
}

// 반환: 'ok' | 'nosidebar'(지금 사이드바가 안 보여 구조를 확인 못 함) | 'nostructure'(알아볼 수 없는 구조) | false(권한 없음)
async function applyGrid(grid) {
  const doc = await Risuai.getRootDocument();
  if (!doc) return false;
  rootDoc = doc;
  await setRootStyle(doc, GRID_STYLE_XID, buildGridCSS(grid));
  if (!sidebarEnabled(grid)) return 'ok';
  if (!(await doc.querySelector('.rs-sidebar'))) return 'nosidebar';
  return (await doc.querySelector(SIDEBAR_SCROLL)) ? 'ok' : 'nostructure';
}



async function removeGridStyle() {
  try {
    const doc = rootDoc;
    if (!doc) return;
    for (const el of await remoteList(await doc.querySelectorAll(`style[x-id="${GRID_STYLE_XID}"]`))) await el.remove();
  } catch {}
}

// v3.07(그리고 옛 sidebar_grid 플러그인)이 customCSS에 남긴 블록을 설정으로 옮기고 지운다.
// db 권한이 필요하므로 관리 화면을 열 때 부른다.
async function migrateLegacyGrid() {
  const db = await Risuai.getDatabase(['customCSS']);
  const css = db && typeof db.customCSS === 'string' ? db.customCSS : '';
  const blocks = css.match(LEGACY_GRID_RE);
  if (!blocks) return null;
  const meta = blocks[blocks.length - 1].match(/sg-(?:enabled:(0|1)\s+)?mode:(folder|all)\s+cols:([2-5])/);
  let grid = null;
  if (meta) {
    const enabled = meta[1] === undefined ? true : meta[1] === '1';
    grid = normalizeGrid({ mode: enabled ? meta[2] : 'off', cols: meta[3] });
  }
  const stored = await Risuai.pluginStorage.getItem(GRID_KEY);
  if (grid && !stored) await saveGrid(grid);
  const cleaned = css.replace(LEGACY_GRID_RE, '').replace(/\n{3,}/g, '\n\n').trimEnd();
  // 쓰기 직전에 다시 읽어 그 사이 테마 등이 customCSS 를 바꿨으면 이번엔 건드리지 않는다(다음에 열 때 다시 시도).
  const again = await Risuai.getDatabase(['customCSS']);
  if (!again || again.customCSS !== css) return grid;
  await Risuai.setDatabaseLite({ customCSS: cleaned });
  return grid;
}

// 시작할 때는 플러그인 저장소만 읽는다(db 권한 창을 띄우지 않음). 꺼져 있으면 메인 문서 권한도 묻지 않는다.
async function startSidebarGrid() {
  const grid = await loadGrid();
  if (sidebarEnabled(grid)) {
    try { await applyGrid(grid); } catch (err) { console.log('[risu-folder-master] 사이드바 그리드 적용 실패: ' + errorText(err)); }
  }
  return grid;
}

// ── src/sidebar/locate.js ──
// 사이드바에서 찾기. 플러그인 API로는 봇을 열 수 없으므로, 관리 화면을 닫고
// RisuAI 사이드바에서 그 봇(닫힌 폴더 안이면 그 폴더)을 화면에 띄워 강조한다.
// 사이드바는 characterOrder 순서대로 그려지므로(없는 봇은 빠짐) 순서를 맞춰 대상을 고른다.
// 닫힌 폴더 안의 봇은 폴더를 열었을 때 강조되도록 CSS를 미리 걸어 둔다.
// 강조 CSS도 v3 setInnerHTML(DOMPurify)을 거치므로 < > & 를 쓰지 않는다.

const LOCATE_STYLE_XID = 'risu-folder-master-locate';
const LOCATE_ATTR = 'x-fm-locate';
const LOCATE_MS = 30000;

let locateTimer = null;

// 대상 봇은 굵은 테두리, 닫힌 폴더는 얇은 테두리로 구분한다(깜빡이지 않음).
function locateCSS(token, childIndex) {
  const strong = 'outline:3px solid #8f9bff!important;outline-offset:2px!important;border-radius:14px!important';
  const soft = 'outline:1px solid #8f9bff!important;outline-offset:2px!important;border-radius:14px!important';
  const rules = [`[${LOCATE_ATTR}="${token}"]{${childIndex === null ? strong : soft}}`];
  // 닫힌 폴더 안의 봇: 폴더가 열리면 바로 뒤에 붙는 상자 안 몇 번째 칸인지로 강조한다.
  // 상자 자식 순서 = [배경, 사이 칸, 봇, 사이 칸, 봇, ...] → k번째 봇은 (3 + 2k)번째 자식.
  if (childIndex !== null) {
    rules.push(`[${LOCATE_ATTR}="${token}"] + .rounded-lg.relative .group.relative:nth-child(${3 + 2 * childIndex}){${strong}}`);
  }
  return rules.join('\n');
}

// 사이드바 맨 위 단계의 칸 목록: [{ el, box }] (box = 그 칸이 열린 폴더면 바로 뒤의 봇 상자)
async function sidebarTopItems(doc) {
  const scroll = await doc.querySelector(SIDEBAR_SCROLL);
  if (!scroll) return null;
  const kids = await remoteList(await scroll.getChildren());
  const items = [];
  for (const el of kids) {
    if (await el.hasClass('group')) items.push({ el, box: null });
    else if (await el.hasClass('rounded-lg') && items.length) items[items.length - 1].box = el;
  }
  return items;
}

async function boxItems(box) {
  const kids = await remoteList(await box.getChildren());
  const out = [];
  for (const el of kids) if (await el.hasClass('group')) out.push(el);
  return out;
}

// 대상 칸을 고른다. 반환: { el, folderClosed, childIndex } 또는 { error, mismatch }.
async function findSidebarTarget(doc, order, target, exists) {
  const top = order.filter((item) => isFolder(item) || (typeof item === 'string' && exists(item)));
  const items = await sidebarTopItems(doc);
  if (!items) return { error: '사이드바를 찾지 못했습니다. 사이드바를 연 뒤 다시 해 주세요' };
  if (items.length !== top.length) return { error: '사이드바 목록이 폴더 마스터와 맞지 않습니다. 새로 불러온 뒤 다시 해 주세요', mismatch: true };
  if (target.folder === null) {
    const i = top.findIndex((item) => item === target.id);
    if (i < 0) return { error: '사이드바에서 그 봇을 찾지 못했습니다' };
    return { el: items[i].el, folderClosed: false, childIndex: null };
  }
  const fi = top.findIndex((item) => isFolder(item) && item.id === target.folder);
  if (fi < 0) return { error: '사이드바에서 그 폴더를 찾지 못했습니다' };
  const folder = top[fi];
  if (target.id === null) return { el: items[fi].el, folderClosed: false, childIndex: null };
  const inside = folder.data.filter(exists);
  const k = inside.indexOf(target.id);
  if (k < 0) return { error: '사이드바에서 그 봇을 찾지 못했습니다' };
  if (!items[fi].box) return { el: items[fi].el, folderClosed: true, childIndex: k };
  const bots = await boxItems(items[fi].box);
  if (bots.length !== inside.length) return { error: '폴더 안 목록이 폴더 마스터와 맞지 않습니다. 새로 불러온 뒤 다시 해 주세요', mismatch: true };
  return { el: bots[k], folderClosed: false, childIndex: null };
}

async function markSidebarTarget(doc, found) {
  const token = String(Date.now());
  for (const old of await remoteList(await doc.querySelectorAll(`[${LOCATE_ATTR}]`))) await old.setAttribute(LOCATE_ATTR, '0');
  await found.el.setAttribute(LOCATE_ATTR, token);
  await setRootStyle(doc, LOCATE_STYLE_XID, locateCSS(token, found.folderClosed ? found.childIndex : null));
  try { await found.el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch {}
  clearTimeout(locateTimer);
  locateTimer = setTimeout(() => { setRootStyle(doc, LOCATE_STYLE_XID, '').catch(() => {}); }, LOCATE_MS);
}

// 정리 중에 새 권한 창을 띄우지 않도록, 이미 얻은 메인 문서가 있을 때만 지운다.
async function clearSidebarMark(doc) {
  clearTimeout(locateTimer);
  if (!doc) return;
  try { await setRootStyle(doc, LOCATE_STYLE_XID, ''); } catch {}
}

// ── src/ui/icons.js ──
// 24px 선 아이콘. currentColor로 칠한다.

const ICON_PATHS = {
  folder: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2.5h7.5A2.5 2.5 0 0 1 21 10v7.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  inbox: '<path d="M4 13.5 6.2 6.3A2 2 0 0 1 8.1 5h7.8a2 2 0 0 1 1.9 1.3L20 13.5V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M4 13.5h4.5l1.5 2h4l1.5-2H20"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
  tiles: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>',
  list: '<path d="M9 6.5h11M9 12h11M9 17.5h11"/><circle cx="5" cy="6.5" r="1"/><circle cx="5" cy="12" r="1"/><circle cx="5" cy="17.5" r="1"/>',
  sidebar: '<rect x="3.5" y="4" width="17" height="16" rx="2.5"/><path d="M9.5 4v16"/><path d="M5.8 8h1.6M5.8 11h1.6M5.8 14h1.6"/>',
  move: '<path d="M7 4v16M7 4 4 7M7 4l3 3M17 20V4M17 20l-3-3M17 20l3-3"/>',
  more: '<circle cx="5.5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18.5" cy="12" r="1.4"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  locate: '<circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/>',
  back: '<path d="M15 18l-6-6 6-6"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-1 2-2 0-1.6-1.3-2-1.3-3.3 0-1 .8-1.7 1.8-1.7H17a4 4 0 0 0 4-4c0-3.9-4-7-9-7z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7.5" r="1"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.7"/><path d="m20.5 16-5-5-9 8.5"/>',
  up: '<path d="m6 14 6-6 6 6"/>',
  down: '<path d="m6 10 6 6 6-6"/>',
  unfold: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2.5h7.5A2.5 2.5 0 0 1 21 10v7.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z"/><path d="m9.5 14.5 5-5M14.5 14.5l-5-5"/>',
  out: '<path d="M14 5h4.5A1.5 1.5 0 0 1 20 6.5v11a1.5 1.5 0 0 1-1.5 1.5H14"/><path d="M10 16.5 5.5 12 10 7.5M5.5 12H15"/>',
  scan: '<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M8 12h8"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.5-4.5L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.5 4.5L20 16"/><path d="M20 20v-4h-4"/>',
  grip: '<circle cx="9" cy="6.5" r="1.2"/><circle cx="15" cy="6.5" r="1.2"/><circle cx="9" cy="12" r="1.2"/><circle cx="15" cy="12" r="1.2"/><circle cx="9" cy="17.5" r="1.2"/><circle cx="15" cy="17.5" r="1.2"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z"/>',
  chat: '<path d="M5 18.5 4 21l3.5-1.5A8.5 8 0 1 0 5 18.5z"/>',
  puzzle: '<path d="M10 4h4v2.5a1.5 1.5 0 0 0 3 0V4h3v6h-2.5a1.5 1.5 0 0 0 0 3H20v7h-6v-2.5a1.5 1.5 0 0 0-3 0V20H4v-7h2.5a1.5 1.5 0 0 0 0-3H4V4z"/>',
  users: '<circle cx="9" cy="8.5" r="3.5"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M15.5 5.2a3.5 3.5 0 0 1 0 6.6M21 20a6 6 0 0 0-3.5-5.5"/>',
  select: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  tag: '<path d="M3.5 12.2V5a1.5 1.5 0 0 1 1.5-1.5h7.2a1.5 1.5 0 0 1 1.1.4l7.3 7.3a1.5 1.5 0 0 1 0 2.1l-7.2 7.2a1.5 1.5 0 0 1-2.1 0l-7.4-7.2a1.5 1.5 0 0 1-.4-1.1z"/><circle cx="8.3" cy="8.3" r="1.5"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  history: '<path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5"/><path d="M4 4v4.5h4.5"/><path d="M12 8v4l2.8 1.8"/>',
  wand: '<path d="m4 20 11-11"/><path d="m13 7 4 4"/><path d="M17.5 3v3M16 4.5h3M20 9v2.5M18.7 10.2h2.6M9.5 3.5v2M8.5 4.5h2"/>',
  chart: '<path d="M4 20h16"/><rect x="5.5" y="11" width="3" height="6.5" rx="1"/><rect x="10.5" y="6.5" width="3" height="11" rx="1"/><rect x="15.5" y="13.5" width="3" height="4" rx="1"/>',
  box: '<path d="M3.5 8 12 4l8.5 4-8.5 4z"/><path d="M3.5 8v8.5L12 20.5l8.5-4V8"/><path d="M12 12v8.5"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>',
  command: '<path d="M9 9h6v6H9z"/><path d="M9 9V6.5A2.5 2.5 0 1 0 6.5 9H9zM15 9V6.5A2.5 2.5 0 1 1 17.5 9H15zM9 15v2.5A2.5 2.5 0 1 1 6.5 15H9zM15 15v2.5a2.5 2.5 0 1 0 2.5-2.5H15z"/>',
  sparkle: '<path d="M12 3.5 13.8 10l6.7 2-6.7 2L12 20.5 10.2 14l-6.7-2 6.7-2z"/>',
};

function icon(name, cls = '') {
  return `<svg class="fm-i ${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS[name] || ''}</svg>`;
}

// RisuAI 메뉴에 쓰는 컬러 아이콘.
const MENU_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="#8ea2ff" stroke="#5b6ee8" stroke-width="1.6" stroke-linejoin="round"><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2.5h7.5A2.5 2.5 0 0 1 21 10v7.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z"/></svg>';

// ── src/ui/styles.js ──
// 관리 화면 CSS. 플러그인 iframe 안에서만 쓰인다.
// 모바일 GPU 부담 때문에 backdrop-filter·큰 blur 그림자는 쓰지 않는다.

const FOLDER_HEX = {
  default: '#3a4254',
  red: '#b4313f',
  yellow: '#a8741a',
  green: '#1f8a4c',
  blue: '#2858d6',
  indigo: '#4b45c6',
  purple: '#7d34c9',
  pink: '#c0337a',
};

const COLOR_NAMES = {
  default: '기본', red: '빨강', yellow: '노랑', green: '초록', blue: '파랑', indigo: '남색', purple: '보라', pink: '분홍',
};

const APP_CSS = `
:root{
  --bg:#0f1218;--panel:#141820;--surface:#191e28;--surface-2:#1f2532;--line:#272e3c;--line-2:#323a4b;
  --text:#e7eaf1;--muted:#8d95a8;--faint:#5f6779;--accent:#6c7cff;--accent-2:#8f9bff;--accent-bg:#232a4a;
  --danger:#ef5a6a;--ok:#3ccf91;--radius:12px;
  color-scheme:dark;
}
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;background:transparent;overflow:hidden}
body{font:13px/1.45 Pretendard,"Pretendard Variable",-apple-system,BlinkMacSystemFont,"Segoe UI","Apple SD Gothic Neo","Noto Sans KR",sans-serif;color:var(--text);-webkit-font-smoothing:antialiased}
button,input,select{font:inherit;color:inherit}
button{cursor:pointer;background:none;border:0}
button:disabled{cursor:default;opacity:.4}
:focus-visible{outline:2px solid var(--accent-2);outline-offset:2px}
.fm-i{width:18px;height:18px;flex:none}
.fm-root{position:fixed;inset:0;display:grid;place-items:center;padding:24px;background:rgba(5,7,12,.74)}
.fm-app{user-select:none;-webkit-user-select:none;position:relative;width:min(1140px,100%);height:min(840px,100%);display:flex;flex-direction:column;background:var(--bg);border:1px solid var(--line);border-radius:18px;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,.45)}

/* 상단 */
.fm-top{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid var(--line);background:var(--panel)}
.fm-brand{display:flex;align-items:center;gap:10px;min-width:0;margin-right:4px}
.fm-logo{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;color:#fff;background:linear-gradient(140deg,#5967f0,#8a55e6)}
.fm-logo .fm-i{width:19px;height:19px}
.fm-brand b{display:block;font-size:15px;font-weight:700;letter-spacing:-.01em;white-space:nowrap}
.fm-brand small{display:block;font-size:11px;color:var(--muted);white-space:nowrap}
.fm-search{position:relative;flex:1;min-width:120px;max-width:440px}
.fm-search .fm-i{position:absolute;left:11px;top:50%;transform:translateY(-50%);color:var(--faint);width:16px;height:16px}
.fm-search input{user-select:text;-webkit-user-select:text;width:100%;height:36px;padding:0 12px 0 34px;border-radius:10px;border:1px solid var(--line);background:var(--bg);outline:none}
.fm-search input:focus{border-color:var(--accent)}
.fm-search input::placeholder{color:var(--faint)}
.fm-spacer{flex:1}
.fm-seg{display:flex;padding:3px;gap:2px;border-radius:10px;background:var(--bg);border:1px solid var(--line)}
.fm-seg button{width:30px;height:28px;border-radius:7px;display:grid;place-items:center;color:var(--muted)}
.fm-seg button:hover{color:var(--text)}
.fm-seg button.on{background:var(--surface-2);color:var(--text)}
.fm-btn{height:36px;padding:0 12px;border-radius:10px;display:inline-flex;align-items:center;gap:7px;background:var(--surface);border:1px solid var(--line);white-space:nowrap;font-weight:550}
.fm-btn:hover:not(:disabled){background:var(--surface-2);border-color:var(--line-2)}
.fm-btn.primary{background:var(--accent);border-color:var(--accent);color:#fff}
.fm-btn.primary:hover:not(:disabled){background:#7a89ff;border-color:#7a89ff}
.fm-btn.danger{color:#ffb3bc;border-color:#4a2530;background:#2a161c}
.fm-btn.danger:hover:not(:disabled){background:#3a1b23;border-color:#6b2b3a}
.fm-btn.ghost{background:transparent;border-color:transparent}
.fm-btn.ghost:hover:not(:disabled){background:var(--surface)}
.fm-btn .fm-sub{font-size:11px;font-weight:500;color:var(--muted)}
.fm-btn.on{border-color:var(--accent);background:var(--accent-bg)}
.fm-icon{width:36px;padding:0;justify-content:center}
.fm-menu-wrap{position:relative}
.fm-menu{position:absolute;right:0;top:calc(100% + 6px);z-index:40;min-width:210px;padding:6px;border-radius:12px;background:var(--surface);border:1px solid var(--line-2);box-shadow:0 14px 34px rgba(0,0,0,.45);display:none}
.fm-menu.open{display:block}
.fm-menu button{width:100%;height:36px;padding:0 10px;border-radius:8px;display:flex;align-items:center;gap:9px;text-align:left}
.fm-menu button:hover:not(:disabled){background:var(--surface-2)}
.fm-menu small{margin-left:auto;color:var(--faint);font-size:11px;max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
[hidden]{display:none!important}
.fm-mob{display:none!important}
.fm-only-mobile{display:none!important}
.fm-menu button.on{color:var(--accent-2)}
.fm-busy{display:none;align-items:center;gap:6px;color:var(--muted);font-size:12px}
.fm-app.is-busy .fm-busy{display:inline-flex}
.fm-loading{display:none;align-items:center;gap:6px;color:var(--muted);font-size:12px;white-space:nowrap}
.fm-app.is-loading .fm-loading{display:inline-flex}
.fm-loading:disabled{opacity:1;cursor:default}
.fm-loading.warn{color:#f3c46b;cursor:pointer}
.fm-loading.warn::before{background:#f3c46b;animation:none}
.fm-loading::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--ok);animation:fm-pulse 1s ease-in-out infinite}
.fm-card.loading .fm-name{color:var(--faint)}
.fm-busy::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--accent);animation:fm-pulse 1s ease-in-out infinite}
@keyframes fm-pulse{50%{opacity:.25}}

/* 순서 편집 띠 */
.fm-banner{display:none;align-items:center;gap:10px;padding:9px 14px;background:#1a2142;border-bottom:1px solid #2c3770;color:#cfd6ff}
.fm-app.is-reorder .fm-banner{display:flex}
.fm-banner p{flex:1;font-size:12.5px}
.fm-banner b{color:#fff}

/* 본문 */
.fm-body{flex:1;display:grid;grid-template-columns:250px minmax(0,1fr);min-height:0}
.fm-rail{min-height:0;overflow:auto;padding:10px 8px 20px;border-right:1px solid var(--line);background:var(--panel);overscroll-behavior:contain}
.fm-rail-label{display:flex;align-items:center;justify-content:space-between;padding:14px 10px 6px;font-size:11px;font-weight:650;letter-spacing:.06em;color:var(--faint)}
.fm-nav{position:relative;width:100%;min-height:42px;padding:6px 8px;border-radius:10px;display:grid;grid-template-columns:30px minmax(0,1fr) auto;align-items:center;gap:10px;text-align:left;color:#c7ccd8}
.fm-nav:hover{background:var(--surface)}
.fm-nav.on{background:var(--surface-2);color:#fff}
.fm-nav.on::before{content:"";position:absolute;left:-8px;top:9px;bottom:9px;width:3px;border-radius:0 3px 3px 0;background:var(--accent)}
.fm-nav-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:550}
.fm-nav-count{min-width:24px;height:20px;padding:0 7px;border-radius:10px;display:grid;place-items:center;font-size:11px;color:var(--muted);background:var(--bg)}
.fm-nav.empty .fm-nav-name{color:var(--faint);text-decoration:line-through}
.fm-thumb{width:30px;height:30px;border-radius:8px;display:grid;place-items:center;overflow:hidden;color:#fff;background:var(--c,#3a4254)}
.fm-thumb .fm-i{width:16px;height:16px}
.fm-thumb img{width:100%;height:100%;object-fit:cover;display:block}
.fm-thumb.plain{background:var(--surface-2);color:var(--muted)}
.fm-nav .fm-grip{display:none;color:var(--faint)}
.fm-app.is-reorder .fm-nav[data-folder]{cursor:grab}
.fm-app.is-reorder .fm-nav[data-folder] .fm-nav-count{display:none}
.fm-app.is-reorder .fm-nav[data-folder] .fm-grip{display:block}

.fm-main{position:relative;display:grid;grid-template-rows:auto minmax(0,1fr);min-height:0;min-width:0}
.fm-head{display:flex;align-items:center;gap:12px;padding:14px 18px 12px;min-width:0}
.fm-head .fm-thumb{width:42px;height:42px;border-radius:11px}
.fm-back{position:relative;flex:none;border-radius:12px;transition:transform .12s}
.fm-back:hover .fm-thumb{filter:brightness(1.15)}
.fm-back:active{transform:scale(.95)}
.fm-back-arrow{position:absolute;left:-5px;bottom:-5px;width:20px;height:20px;border-radius:50%;display:grid;place-items:center;background:var(--accent);color:#fff;border:2px solid var(--bg)}
.fm-back-arrow .fm-i{width:12px;height:12px;stroke-width:2.6}
.fm-head .fm-thumb .fm-i{width:21px;height:21px}
.fm-head-text{min-width:0;flex:1}
.fm-head-text h2{font-size:18px;font-weight:700;letter-spacing:-.015em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fm-head-text p{font-size:12px;color:var(--muted);margin-top:1px}
.fm-head-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
.fm-scroll{min-height:0;overflow:auto;padding:2px 18px 110px;overscroll-behavior:contain}
.fm-section{margin-bottom:22px;content-visibility:auto;contain-intrinsic-size:auto 240px}
.fm-section-head{display:flex;align-items:center;gap:8px;margin:4px 0 10px;min-width:0}
.fm-section-head .fm-dot{width:9px;height:9px;border-radius:3px;background:var(--c,#3a4254);flex:none}
.fm-section-head h3{font-size:13px;font-weight:650;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fm-section-head span{font-size:12px;color:var(--faint)}
.fm-section-head button{margin-left:auto;font-size:12px;color:var(--muted);padding:3px 8px;border-radius:7px}
.fm-section-head button:hover{background:var(--surface);color:var(--text)}
.fm-empty{padding:34px 12px;text-align:center;color:var(--faint);border:1px dashed var(--line-2);border-radius:var(--radius)}

/* 폴더 타일(첫 화면의 주인공) */
/* 폴더: 탐색기처럼 큰 폴더 아이콘 + 아래 이름 */
.fm-folders{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:6px}
.fm-ftile{position:relative;display:flex;flex-direction:column;align-items:center;gap:6px;padding:10px 4px 8px;border-radius:12px;border:1px solid transparent;text-align:center;transition:background-color .12s,border-color .12s}
.fm-ftile:hover{background:var(--surface);border-color:var(--line)}
.fm-ftile .fm-thumb{width:58px;height:58px;border-radius:15px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)}
.fm-ftile .fm-thumb .fm-i{width:28px;height:28px}
.fm-fcount{position:absolute;top:5px;left:calc(50% + 17px);min-width:22px;height:20px;padding:0 6px;border-radius:10px;display:grid;place-items:center;font-size:11px;font-weight:700;color:#fff;background:#2b3245;border:2px solid var(--bg)}
.fm-ftile-text{width:100%;min-width:0}
.fm-ftile-text b{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:12.5px;font-weight:600;line-height:1.3;word-break:keep-all;overflow-wrap:anywhere}
.fm-ftile .fm-grip{display:none;position:absolute;top:6px;left:6px;width:14px;height:14px;color:var(--faint)}
.fm-app.is-reorder .fm-ftile{cursor:grab}
.fm-app.is-reorder .fm-ftile .fm-grip{display:block}
.fm-ftile.empty b{color:var(--faint);text-decoration:line-through}
.fm-ftile.fm-drop-before{box-shadow:-3px 0 0 -1px var(--accent)}
.fm-ftile.fm-drop-after{box-shadow:3px 0 0 -1px var(--accent)}

/* 봇: 관리용이라 작게(아바타 34px 줄 칩) */
.fm-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(176px,1fr));gap:6px;min-height:46px;border-radius:var(--radius)}
.view-list .fm-grid{grid-template-columns:minmax(0,1fr);gap:3px}
.fm-card{position:relative;display:grid;grid-template-columns:34px minmax(0,1fr);align-items:center;gap:9px;padding:5px 8px 5px 5px;border-radius:10px;background:var(--surface);border:1px solid transparent;cursor:pointer;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;transition:border-color .12s,background-color .12s}
.fm-card:hover{border-color:var(--line-2)}
.fm-av{position:relative;width:34px;height:34px;border-radius:8px;overflow:hidden;display:grid;place-items:center;background:var(--surface-2);color:var(--faint);font-size:14px;font-weight:700}
.fm-av img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;pointer-events:none}
.fm-txt{min-width:0}
.fm-name{font-size:12.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fm-meta{display:flex;flex-wrap:nowrap;overflow:hidden;gap:8px;font-size:10.5px;color:var(--muted);min-height:14px}
.fm-meta span{display:inline-flex;align-items:center;gap:3px;white-space:nowrap}
.fm-meta .fm-i{width:11px;height:11px}
.view-tiles .fm-meta .fm-extra{display:none}
.fm-card.ghost-bot .fm-name{color:var(--danger)}
.fm-tick{position:absolute;left:1px;top:1px;width:17px;height:17px;border-radius:50%;display:grid;place-items:center;background:rgba(10,12,18,.75);border:1.5px solid rgba(255,255,255,.6);color:transparent;opacity:0;transition:opacity .12s}
.fm-tick .fm-i{width:10px;height:10px;stroke-width:3}
.fm-card:hover .fm-tick,.has-selection .fm-tick{opacity:1}
.fm-card.sel{border-color:var(--accent);background:var(--accent-bg)}
.fm-card.sel .fm-tick{opacity:1;background:var(--accent);border-color:var(--accent);color:#fff}
.view-list .fm-card{grid-template-columns:30px minmax(0,1fr);padding:3px 10px 3px 4px}
.view-list .fm-av{width:30px;height:30px;font-size:12px}
.view-list .fm-txt{display:flex;align-items:center;gap:14px}
.view-list .fm-name{flex:1;min-width:0}
.view-list .fm-meta{flex:none}
.fm-main .fm-note{margin:4px 0 16px}
.fm-warn{color:#f3c46b}
.fm-card.failed .fm-name{color:#f3c46b}
.fm-card:focus-visible{outline:2px solid var(--accent-2);outline-offset:1px}
.fm-card:focus-within .fm-loc{opacity:1}
.fm-loc:focus-visible{opacity:1}
.fm-app.is-locating .fm-loc,.fm-app.is-locating [data-act="locate-folder"]{pointer-events:none;opacity:.35}
.fm-count{padding:0 10px 0 6px;font-weight:700;white-space:nowrap;border-radius:8px;min-height:34px}
.fm-count:hover{background:rgba(255,255,255,.06)}
.fm-sheet{display:grid;gap:6px;margin-top:8px}
.fm-sheet .fm-btn{height:44px;justify-content:flex-start}
.fm-pick-search{display:block;max-width:none;margin:10px 0 8px}
.fm-pick-search input{height:40px}
.fm-picker .fm-nav{min-height:44px}
.fm-picker .fm-nav-name{white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;line-height:1.3}
.fm-picker .fm-nav:disabled{opacity:.5;cursor:default}
.fm-pick-new{margin-top:6px;border-top:1px solid var(--line);border-radius:0 0 10px 10px;padding-top:10px}
.fm-ghost-dest{grid-column:1/-1;font-size:11px;font-weight:650;color:var(--accent-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fm-ghost-dest:empty{display:none}
.fm-card{grid-template-columns:34px minmax(0,1fr) auto}
.view-list .fm-card{grid-template-columns:30px minmax(0,1fr) auto}
.fm-loc{width:28px;height:28px;border-radius:8px;display:grid;place-items:center;color:var(--faint);opacity:0;transition:opacity .12s,background-color .12s}
.fm-loc .fm-i{width:16px;height:16px}
.fm-card:hover .fm-loc{opacity:1}
.fm-loc:hover{background:var(--surface-2);color:var(--accent-2)}
.fm-app.is-reorder .fm-loc{display:none}
@media (hover:none){.fm-loc{opacity:.75}}
.fm-link{color:var(--accent-2);font-weight:650;text-decoration:underline;text-underline-offset:2px}

/* 선택 막대 */
.fm-selbar{position:absolute;left:50%;bottom:18px;z-index:30;display:flex;align-items:center;gap:6px;padding:7px;border-radius:14px;background:var(--surface-2);border:1px solid var(--line-2);box-shadow:0 14px 34px rgba(0,0,0,.5);transform:translate(-50%,140%);opacity:0;visibility:hidden;transition:transform .18s ease,opacity .18s,visibility .18s;max-width:calc(100% - 24px)}
.has-selection .fm-selbar{transform:translate(-50%,0);opacity:1;visibility:visible}
.fm-app.is-reorder .fm-selbar{transform:translate(-50%,140%);opacity:0;visibility:hidden}
.fm-selbar .fm-btn{height:34px}
.fm-selbar .fm-pend{display:none}
.is-pending .fm-selbar .fm-pend{display:inline-flex}
.is-pending .fm-selbar .fm-norm{display:none}

/* 끌어 옮기기 */
.fm-app.is-reorder .fm-card{cursor:grab}
.fm-app.is-reorder .fm-tick{display:none}
.fm-dragging{opacity:.3}
.fm-ghost{position:fixed;z-index:100;pointer-events:none;left:0;top:0;width:190px;display:grid;grid-template-columns:34px minmax(0,1fr);align-items:center;gap:9px;padding:5px 8px 5px 5px;border-radius:12px;background:var(--surface-2);border:1px solid var(--accent);box-shadow:0 16px 36px rgba(0,0,0,.55)}
.fm-ghost-count{position:absolute;top:-8px;right:-8px;min-width:24px;height:24px;padding:0 7px;border-radius:12px;display:grid;place-items:center;background:var(--accent);color:#fff;font-size:12px;font-weight:700}
.fm-ghost.nav{width:220px;padding:6px 8px;display:grid;grid-template-columns:30px 1fr;gap:10px;align-items:center}
.fm-drop-before{box-shadow:-4px 0 0 -1px var(--accent)}
.fm-drop-after{box-shadow:4px 0 0 -1px var(--accent)}
.view-list .fm-drop-before,.fm-nav.fm-drop-before{box-shadow:0 -3px 0 -1px var(--accent)}
.view-list .fm-drop-after,.fm-nav.fm-drop-after{box-shadow:0 3px 0 -1px var(--accent)}
.fm-drop-into{background:var(--accent-bg)!important;box-shadow:inset 0 0 0 1.5px var(--accent)}
.fm-grid.fm-drop-into{outline:1.5px dashed var(--accent);outline-offset:4px;box-shadow:none}

/* 알림·대화상자 */
.fm-toast{position:fixed;left:50%;bottom:96px;z-index:200;transform:translateX(-50%);display:flex;align-items:center;gap:12px;max-width:min(560px,calc(100vw - 24px));padding:10px 12px 10px 16px;border-radius:12px;background:#262d3d;border:1px solid var(--line-2);box-shadow:0 12px 30px rgba(0,0,0,.5);font-weight:550;animation:fm-in .16s ease}
.fm-toast.error{background:#3a1b23;border-color:#6b2b3a;color:#ffd5da}
.fm-toast button{padding:5px 10px;border-radius:8px;background:rgba(255,255,255,.08);font-weight:650;white-space:nowrap}
.fm-toast button:hover{background:rgba(255,255,255,.16)}
@keyframes fm-in{from{opacity:0;transform:translate(-50%,8px)}}
.fm-modal-back{position:fixed;inset:0;z-index:150;display:grid;place-items:center;padding:16px;background:rgba(4,6,10,.62)}
.fm-modal{width:min(420px,100%);max-height:calc(100vh - 32px);overflow:auto;padding:18px;border-radius:16px;background:var(--panel);border:1px solid var(--line-2);box-shadow:0 24px 60px rgba(0,0,0,.55)}
.fm-modal h3{font-size:16px;font-weight:700;margin-bottom:4px}
.fm-modal .fm-desc{color:var(--muted);font-size:12.5px;margin-bottom:14px;white-space:pre-line}
.fm-modal .fm-field{width:100%;height:40px;padding:0 12px;border-radius:10px;border:1px solid var(--line-2);background:var(--bg);outline:none}
.fm-modal .fm-field:focus{border-color:var(--accent)}
.fm-modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}
.fm-label{display:block;margin:14px 0 7px;font-size:12px;font-weight:650;color:var(--muted)}
.fm-options{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.fm-options.cols4{grid-template-columns:repeat(4,1fr)}
.fm-options.cols2{grid-template-columns:repeat(2,1fr)}
.fm-option{min-height:44px;padding:8px 6px;border-radius:10px;border:1px solid var(--line);background:var(--bg);color:#c3c9d6;font-weight:600;line-height:1.25}
.fm-option small{display:block;font-size:10.5px;font-weight:500;color:var(--faint);margin-top:2px}
.fm-option:hover{border-color:var(--line-2)}
.fm-option.on{border-color:var(--accent);background:var(--accent-bg);color:#fff}
.fm-preview{display:flex;gap:10px;margin-top:14px;padding:12px;border-radius:12px;background:var(--bg);border:1px solid var(--line)}
.fm-mini{display:grid;gap:3px;align-content:start;padding:6px;border-radius:8px;background:var(--surface);flex:none}
.fm-mini i{width:12px;height:12px;border-radius:3px;background:#4a5366}
.fm-mini i.f{background:var(--accent)}
.fm-preview p{font-size:12px;color:var(--muted);align-self:center}
.fm-preview b{color:var(--text)}
.fm-note{margin-top:12px;padding:10px 12px;border-radius:10px;background:#1b2238;border:1px solid #2b355c;color:#c6cdf0;font-size:12px}
.fm-note.warn{background:#2e2216;border-color:#5a4020;color:#f3d7ac}
.fm-swatches{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.fm-swatch{height:54px;border-radius:12px;border:2px solid transparent;background:var(--c);color:#fff;font-size:12px;font-weight:650;display:grid;place-items:end start;padding:6px 8px}
.fm-swatch.on{border-color:#fff}
.fm-picker{display:grid;gap:4px;max-height:50vh;overflow:auto;margin:0 -4px;padding:0 4px}
.fm-picker .fm-nav{grid-template-columns:30px minmax(0,1fr) auto}
.fm-report{display:grid;gap:10px}
.fm-report section{padding:10px 12px;border-radius:10px;background:var(--bg);border:1px solid var(--line)}
.fm-report h4{font-size:12.5px;margin-bottom:6px}
.fm-report li{list-style:none;font-size:12px;color:var(--muted);padding:2px 0;word-break:break-all}
.fm-report li b{color:var(--text);font-weight:600}
.fm-image-row{display:flex;gap:14px;align-items:center}
.fm-image-row .fm-thumb{width:72px;height:72px;border-radius:14px}
.fm-image-row .fm-thumb .fm-i{width:30px;height:30px}
.fm-image-row div{display:grid;gap:8px;flex:1}

/* 폴더 그림 고르기 */
.fm-modal.fm-wide{width:min(660px,100%);padding:0;display:flex;flex-direction:column;overflow:hidden}
.fm-ip{display:flex;flex-direction:column;min-height:0;max-height:calc(100vh - 32px)}
.fm-ip-head{display:flex;align-items:center;gap:10px;padding:14px 12px 6px 18px}
.fm-ip-head h3{margin:0}
.fm-ip-head small{color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fm-ip-x{margin-left:auto}
.fm-ip-prev{display:flex;align-items:center;gap:14px;padding:6px 18px 14px;border-bottom:1px solid var(--line)}
.fm-ip-pv{display:flex;flex-direction:column;align-items:center;gap:6px;font-size:11px;color:var(--muted)}
.fm-ip-big{width:96px;height:96px;border-radius:14px;overflow:hidden;background:#fff;border:1px solid var(--line-2);display:grid;place-items:center}
.fm-ip-big.empty{background:var(--surface)}
.fm-ip-big img,.fm-ip-big canvas{width:100%;height:100%;display:block;object-fit:cover}
.fm-ip-big .fm-thumb,.fm-ip-sb .fm-thumb{width:100%;height:100%;border-radius:0}
.fm-ip-big .fm-thumb .fm-i{width:34px;height:34px}
.fm-ip-arrow{color:var(--faint);font-size:20px}
.fm-ip-side{margin-left:auto;display:flex;flex-direction:column;gap:6px;font-size:11px;color:var(--muted)}
.fm-ip-sb{display:flex;gap:6px;padding:6px;border-radius:10px;background:var(--bg);border:1px solid var(--line)}
.fm-ip-sb div{width:58px;height:58px;border-radius:10px;overflow:hidden;background:var(--surface)}
.fm-ip-sb img,.fm-ip-sb canvas{width:100%;height:100%;display:block;object-fit:cover}
.fm-ip-tabs{display:flex;gap:4px;padding:10px 12px 0}
.fm-ip-tabs button{padding:8px 13px;border-radius:9px 9px 0 0;color:var(--muted);font-weight:650}
.fm-ip-tabs button.on{background:var(--surface);color:var(--text)}
.fm-ip-body{margin:0 10px;padding:12px;border-radius:0 12px 12px 12px;background:var(--surface);overflow:auto;flex:1;min-height:240px}
.fm-ip-chips{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}
.fm-ip-chips button{padding:4px 11px;border-radius:999px;border:1px solid var(--line-2);color:var(--muted);font-size:12px}
.fm-ip-chips button.on{background:var(--accent-bg);border-color:var(--accent);color:#fff}
.fm-ip-sec{font-size:12px;color:var(--muted);margin:2px 2px 6px}
.fm-ip-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(82px,1fr));gap:6px;margin-bottom:12px}
.fm-ip-tile{display:flex;flex-direction:column;align-items:center;gap:4px;padding:6px 3px;border-radius:10px;border:1px solid transparent}
.fm-ip-tile:hover{background:var(--surface-2)}
.fm-ip-tile.on{border-color:var(--accent);background:var(--accent-bg)}
.fm-ip-tile img{width:66px;height:66px;border-radius:10px;background:#fff;display:block}
.fm-ip-tile b{font-size:11.5px;font-weight:600}
.fm-ip-edit{position:sticky;bottom:-12px;z-index:1;display:flex;align-items:center;gap:8px;padding:10px;border-radius:10px;background:var(--bg);border:1px solid var(--line);box-shadow:0 -8px 16px var(--surface)}
.fm-ip-edit .fm-field{flex:1;min-width:0;height:36px}
.fm-ip-nm{flex:1;min-width:0}.fm-ip-nm b{display:block}.fm-ip-nm small{color:var(--muted);font-size:11.5px}
.fm-ip-hint{font-size:11.5px;color:var(--faint);margin-top:8px}
.fm-ip-drop{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;height:220px;border:1.5px dashed var(--line-2);border-radius:12px;color:var(--muted);cursor:pointer;text-align:center;padding:0 12px}
.fm-ip-drop b{color:var(--text)}
.fm-ip-drop .fm-i{width:26px;height:26px}
.fm-ip-crop{display:flex;gap:16px;align-items:center;flex-wrap:wrap;justify-content:center}
.fm-ip-cropbox{width:220px;height:220px;border-radius:12px;overflow:hidden;position:relative;background:#000;touch-action:none;cursor:grab;flex:none}
.fm-ip-cropbox img{position:absolute;left:0;top:0;transform-origin:0 0;pointer-events:none;max-width:none}
.fm-ip-cropctl{display:flex;flex-direction:column;gap:10px;color:var(--muted);font-size:12px}
.fm-ip-cropctl label{display:flex;flex-direction:column;gap:4px}
.fm-ip-foot{display:flex;align-items:center;gap:8px;padding:12px 14px}
.fm-ftile,.fm-nav{-webkit-touch-callout:none}
.fm-ctx{position:fixed;z-index:160;min-width:168px;padding:5px;border-radius:12px;background:var(--panel);border:1px solid var(--line-2);box-shadow:0 14px 34px rgba(0,0,0,.55)}
.fm-ctx h4{font-size:11.5px;color:var(--muted);font-weight:600;padding:6px 9px 4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:220px}
.fm-ctx button{display:flex;align-items:center;gap:9px;width:100%;padding:8px 9px;border-radius:8px;text-align:left}
.fm-ctx button:hover,.fm-ctx button:focus-visible{background:var(--surface-2)}
.fm-ctx button.danger{color:#ffb3bc}

@media (max-width:760px){
  .fm-mob{display:inline-flex!important}
  .fm-nav.fm-mob{display:grid!important}
  .fm-desk{display:none!important}
  .fm-head .fm-btn,.fm-selbar .fm-btn{height:44px}
  .fm-selbar .fm-text,.fm-head .fm-text{display:inline!important}
  .fm-top .fm-text{display:inline!important}
  .fm-top .fm-btn{padding:0 9px}
  .fm-brand div{display:none}
  .fm-loc{width:36px;height:36px}
  .fm-only-mobile{display:inline!important}
  .fm-menu .fm-only-mobile{display:flex!important}
  .fm-only-desktop{display:none}
  .fm-seg{display:none}
  .fm-top .fm-btn .fm-sub{display:none}
  .fm-root{padding:0}
  .fm-app{width:100%;height:100%;border-radius:0;border:0}
  .fm-top{flex-wrap:wrap;gap:8px;padding:10px}
  .fm-brand small{display:none}
  .fm-search{order:10;flex:1 1 100%;max-width:none}
  .fm-btn .fm-text{display:none}
  .fm-btn:not(.fm-icon){padding:0 10px}
  .fm-body{grid-template-columns:minmax(0,1fr);grid-template-rows:auto minmax(0,1fr)}
  .fm-rail{display:flex;gap:6px;overflow-x:auto;overflow-y:hidden;padding:8px 10px;border-right:0;border-bottom:1px solid var(--line);scrollbar-width:none}
  .fm-rail::-webkit-scrollbar{display:none}
  .fm-rail-label{display:none}
  .fm-nav{width:auto;flex:none;min-height:38px;grid-template-columns:24px auto auto;gap:7px;padding:5px 9px 5px 6px;background:var(--surface)}
  .fm-nav.on::before{display:none}
  .fm-nav.on{background:var(--accent-bg);box-shadow:inset 0 0 0 1px var(--accent)}
  .fm-nav .fm-thumb{width:24px;height:24px;border-radius:7px}
  .fm-nav-name{max-width:120px}
  .fm-head{flex-wrap:wrap;padding:12px 12px 8px}
  .fm-head:not(.compact) .fm-head-actions{width:100%;justify-content:flex-start}
  .fm-scroll{padding:2px 12px 120px}
  .fm-grid{grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:5px}
  .fm-folders{grid-template-columns:repeat(auto-fill,minmax(80px,1fr));gap:4px}
  .fm-ftile .fm-thumb{width:52px;height:52px;border-radius:14px}
  .fm-fcount{left:calc(50% + 14px)}
  .fm-selbar{left:10px;right:10px;bottom:10px;transform:translateY(160%);max-width:none;flex-wrap:wrap;justify-content:center}
  .has-selection .fm-selbar{transform:none}
  .fm-app.is-reorder .fm-selbar{transform:translateY(160%);opacity:0;visibility:hidden}
  .fm-selbar .fm-count{flex:1 1 100%;text-align:center;padding:2px 0 4px}
  .fm-toast{bottom:150px}
}
@media (max-width:480px){
  .fm-folders{grid-template-columns:repeat(4,minmax(0,1fr))}
}
@media (max-width:560px){
  .fm-modal-back:has(.fm-wide){padding:0}
  .fm-modal.fm-wide{width:100%;height:100%;max-height:none;border-radius:0;border:0}
  .fm-ip{max-height:none;height:100%}
  .fm-ip-side{display:none}
  .fm-ip-big{width:80px;height:80px}
  .fm-ip-grid{grid-template-columns:repeat(4,minmax(0,1fr))}
  .fm-ip-tile img{width:100%;height:auto;aspect-ratio:1}
  .fm-ip-body{margin:0 8px}
}
`;

// ── src/ui/dialogs.js ──
// 알림과 대화상자.

let toastTimer = null;

function toast(message, opts = {}) {
  document.querySelector('.fm-toast')?.remove();
  clearTimeout(toastTimer);
  const el = document.createElement('div');
  el.className = 'fm-toast' + (opts.error ? ' error' : '');
  el.setAttribute('role', 'status');
  const text = document.createElement('span');
  text.textContent = message;
  el.append(text);
  if (opts.action) {
    const btn = document.createElement('button');
    btn.textContent = opts.action.label;
    btn.onclick = () => { el.remove(); opts.action.run(); };
    el.append(btn);
  }
  document.body.append(el);
  toastTimer = setTimeout(() => el.remove(), opts.ms || (opts.action ? 7000 : opts.error ? 4500 : 2400));
}

function toastError(err) {
  toast(errorText(err), { error: true });
}

// body 는 HTML 문자열. setup(modal, close) 에서 이벤트를 단다.
// 열려 있는 동안 뒤 화면은 inert, Tab 은 창 안에서만 돌고, 닫으면 연 버튼으로 포커스를 돌려준다.
function openModal(html, setup) {
  const opener = document.activeElement;
  const app = document.querySelector('.fm-root');
  const back = document.createElement('div');
  back.className = 'fm-modal-back';
  back.innerHTML = `<div class="fm-modal" role="dialog" aria-modal="true" aria-labelledby="fm-dialog-title">${html}</div>`;
  const modal = back.firstElementChild;
  if (!modal.querySelector('#fm-dialog-title')) modal.querySelector('h3')?.setAttribute('id', 'fm-dialog-title');
  let closed = false;
  const close = (value) => {
    if (closed) return;
    closed = true;
    back.remove();
    document.removeEventListener('keydown', onKey, true);
    if (app && !document.querySelector('.fm-modal-back')) app.inert = false;
    try { if (opener && opener.isConnected) opener.focus(); } catch {}
    modal.dispatchEvent(new CustomEvent('fm-close', { detail: value }));
  };
  const onKey = (e) => {
    // 창 위에 창이 열려 있으면 맨 위 창만 키를 받는다(Esc 한 번에 둘 다 닫히지 않게).
    const backs = document.querySelectorAll('.fm-modal-back');
    if (backs[backs.length - 1] !== back) return;
    if (e.key === 'Escape') { e.stopPropagation(); close(null); return; }
    if (e.key !== 'Tab') return;
    const items = [...modal.querySelectorAll('button:not([disabled]):not([hidden]), input:not([hidden]), [tabindex="0"]')].filter((el) => el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  back.addEventListener('pointerdown', (e) => { if (e.target === back) close(null); });
  document.addEventListener('keydown', onKey, true);
  document.body.append(back);
  if (app) app.inert = true;
  setup(modal, close);
  if (!modal.contains(document.activeElement)) setTimeout(() => { if (!modal.contains(document.activeElement)) modal.querySelector('.primary, button:not([disabled])')?.focus(); }, 0);
  return new Promise((resolve) => modal.addEventListener('fm-close', (e) => resolve(e.detail)));
}

// 목록을 다시 그려도 키보드 포커스·스크롤을 지킨다. 포커스는 같은 data-* 속성을 가진 요소로 돌려준다.
function rerender(box, html) {
  const a = document.activeElement;
  let sel = null;
  if (a && box.contains(a)) {
    const attrs = [...a.attributes].filter((x) => x.name.startsWith('data-'));
    if (attrs.length) sel = attrs.map((x) => `[${x.name}="${CSS.escape(x.value)}"]`).join('');
  }
  const top = box.scrollTop;
  box.innerHTML = html;
  box.scrollTop = top;
  if (!sel) return;
  // 포커스가 있던 줄이 사라졌으면 목록의 첫 버튼, 그것도 없으면 창의 닫기·확인 버튼으로.
  const next = box.querySelector(sel) || box.querySelector('button:not([disabled])') || box.closest('.fm-modal')?.querySelector('[data-x], .primary');
  next?.focus({ preventScroll: true });
}

function askText(title, { value = '', placeholder = '', confirm = '확인', desc = '' } = {}) {
  return openModal(
    `<h3 id="fm-dialog-title">${esc(title)}</h3>${desc ? `<p class="fm-desc">${esc(desc)}</p>` : '<div style="height:10px"></div>'}
     <input class="fm-field" maxlength="80" placeholder="${esc(placeholder)}" value="${esc(value)}">
     <div class="fm-modal-actions"><button class="fm-btn" data-x>취소</button><button class="fm-btn primary" data-ok>${esc(confirm)}</button></div>`,
    (modal, close) => {
      const input = modal.querySelector('input');
      const ok = () => { const v = input.value.trim(); if (v) close(v); else input.focus(); };
      modal.querySelector('[data-x]').onclick = () => close(null);
      modal.querySelector('[data-ok]').onclick = ok;
      input.onkeydown = (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); ok(); } };
      setTimeout(() => { input.focus(); input.select(); }, 0);
    },
  );
}

function askConfirm(title, desc, { confirm = '확인', danger = false } = {}) {
  return openModal(
    `<h3 id="fm-dialog-title">${esc(title)}</h3><p class="fm-desc">${esc(desc)}</p>
     <div class="fm-modal-actions"><button class="fm-btn" data-x>취소</button><button class="fm-btn ${danger ? 'danger' : 'primary'}" data-ok>${esc(confirm)}</button></div>`,
    (modal, close) => {
      modal.querySelector('[data-x]').onclick = () => close(false);
      const ok = modal.querySelector('[data-ok]');
      ok.onclick = () => close(true);
      setTimeout(() => ok.focus(), 0);
    },
  ).then((v) => v === true);
}

// ── src/ui/templates-data.js ──
// scripts/build-templates.py 가 만든다. 직접 고치지 말 것.
// 폴더 그림 템플릿 목록: 이름·분류·종이 위치(512 기준 비율)·96px 섬네일.
const TEMPLATES = [{"slug": "fantasy", "name": "판타지", "cat": "장르", "signs": [[0.1719, 0.668, 0.8281, 0.9414]], "thumb": "data:image/webp;base64,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"}, {"slug": "modern", "name": "현대물", "cat": "장르", "signs": [[0.5527, 0.1562, 0.916, 0.9062]], "thumb": "data:image/webp;base64,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"}, {"slug": "sf", "name": "SF", "cat": "장르", "signs": [[0.5059, 0.5117, 0.8691, 0.9355]], "thumb": "data:image/webp;base64,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"}, {"slug": "wuxia", "name": "무협", "cat": "장르", "signs": [[0.084, 0.1758, 0.3711, 0.832]], "thumb": "data:image/webp;base64,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"}, {"slug": "romance", "name": "로맨스", "cat": "장르", "signs": [[0.1152, 0.6387, 0.8789, 0.9395]], "thumb": "data:image/webp;base64,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"}, {"slug": "school", "name": "학원물", "cat": "장르", "signs": [[0.5625, 0.1973, 0.9199, 0.9102]], "thumb": "data:image/webp;base64,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"}, {"slug": "daily", "name": "일상", "cat": "장르", "signs": [[0.4922, 0.4629, 0.9141, 0.9219]], "thumb": "data:image/webp;base64,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"}, {"slug": "horror", "name": "호러", "cat": "장르", "signs": [[0.25, 0.4902, 0.8457, 0.7734]], "thumb": "data:image/webp;base64,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"}, {"slug": "mystery", "name": "추리", "cat": "장르", "signs": [[0.5234, 0.5195, 0.916, 0.9277]], "thumb": "data:image/webp;base64,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"}, {"slug": "isekai", "name": "이세계", "cat": "장르", "signs": [[0.1523, 0.5117, 0.8281, 0.75]], "thumb": "data:image/webp;base64,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"}, {"slug": "althistory", "name": "대체역사", "cat": "장르", "signs": [[0.2422, 0.4727, 0.6523, 0.7969]], "thumb": "data:image/webp;base64,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"}, {"slug": "apocalypse", "name": "종말물", "cat": "장르", "signs": [[0.0977, 0.1387, 0.3867, 0.8711]], "thumb": "data:image/webp;base64,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"}, {"slug": "single", "name": "단일봇", "cat": "형식", "signs": [[0.1777, 0.5352, 0.8359, 0.7871]], "thumb": "data:image/webp;base64,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"}, {"slug": "multi", "name": "멀티봇", "cat": "형식", "signs": [[0.0977, 0.0859, 0.3633, 0.334], [0.3789, 0.0859, 0.6445, 0.334], [0.6602, 0.0859, 0.9258, 0.334]], "thumb": "data:image/webp;base64,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"}, {"slug": "sim", "name": "시뮬봇", "cat": "형식", "signs": [[0.0938, 0.4434, 0.3574, 0.6758], [0.3867, 0.4434, 0.6484, 0.6758], [0.6719, 0.4434, 0.9355, 0.6758]], "thumb": "data:image/webp;base64,UklGRs4JAABXRUJQVlA4IMIJAADQJgCdASpgAGAAPpVAmUmlo6IhLVZqqLASiWUAzw2Syfbcm7a95mn1nL/6Xka9/upB8q+6/6zzT/yXhb8QNQL1l/sd8hAB+Xf0//XcZ/1w9gD+R/1P/ieqP+w8IT7N/w/YA/mH+I9CH6c9AH6D/nf/X7hf8+/uHW4XUPmAWK22l3Kf9yVeoWiy0O84cn3jK9avJMdNO9mbL21/tEJGt39AgqHJm6Mzs1AwNfLngMHifTCSJK2bxL2FcZ5Xr1qsnQzpJk9Yu6Z+ShAI0DQYdanVcNYostLq3CEvjAE2qSRW25xp+O5d/QnHgJN+odxsWlp4E05hyLU/8FofYoY2ScxUMcMS72uuug10GGxoDEkyQhMdsxW8XVoY2vGbgGrFBtS4qX0KaabUktk6po201Z/IYrVq++VGq7d81njaLvdAAP7/EgM3ySWXfduAA+TK7HYG5o5QIW+fjsHRRYHdux/KTA93M5l4157hETQR822Mi3IfoXxDJvb3eCV5RnnDKNJj5rJ/Wpw0PGrLqKVZXH+Zba9N1gJ1ir0sG+zMOCqS+DXRc8oYObop9e7/zFMjhaZz3q7MvjAoHr9Us3ydNPP4SMxCJGDM5XIZBy/y8SRg50qw+l/JT9JUh8yQBoJdsBDymZXMZ3Jn/OYkBkStIC9uwMOu67X8qFBo74dAiu0pl/MAXof/aC2h8iuDFQ9jOuBT4H/u2S6TuaQiNvxmPbqmbCUfsHuafJJv/tHS9/abLvLp54kKnYQh5sJ6omF6WLl719A3X22KK1WTdHyLk28EuYJmAnHJSJP2y7qr+ci2tXV9M0fcBnHAwVUbZbK/mzh6uY+Uu6cXsr5kliJS51P6GpdJfb4/lZC3okWVn3Yb6YI33qcj+cYd5fxBjGaPZOeLt5dATjC8VR1RJiCSVU620EfUF4Btl2UGeVKDQ7jTtD1SekMAfDnxGWJ2/N1w7mNEALK1HuvQH4WlH/WhBn0VMltXhXYUalNUr4kuHnwPFRxxYnagrMWkdN/PvscqDdpCMZCW6UNb/ST2lJpBF0IyX5GL7hxoxLvjRKyHdmUs1pFmCu2QZgtgenWd8C04/EVBLJb+Mnt7JotI8btN2zJWCFUOsQawixjR820pthQWvW1eSrieeuPAwgoTqYVOuca5ws/kw1rh+3yWQXtTlQzOGH1lAnlzrK40P1WwTFrJrMWwsqXQVslLm9a5zvxOSI3cRlVkC9SdqY9rRiT4ZmlH8ncqG7uJjy6INdrTbeunzEbIqSj5KMITPuaaCswjXJsgT3qbxf6z1HQ84iSoB5UvaipAVIT0zOt3/z7JNRsqguoPP0V/k8faSLH0cYHC/5yakQkzoCxjqkCa2OhNIVHOw1Sxk5nH6wjtulBQJMPIzT5l6Nd3OC1OUHfsl4+Pd9x0iu37qKW8JvnZFjfPnpWIGJsJqD+4lNL0F8/hIbJBqkaGBJIGWX3uu7kiaOa54MRTJwsltwj0kOj2qyNuIFwsHPpt03uhCYOQOVtzsnVmQ2uuNSeQ2i3g6FSjDvomkPQoQT164O3tt5YriV1zX86YWXnThrcrqI5gV9VLjAPYQU48bM1Y+bmihXy7GqqPhd1USN5koG4yH+PkHobUD+TipJ0XBiwpjljciTOzeh7BQ3TiOQTd//ldNGkX3ZnODEr8/wavUTBZmo8itN0Rq6GaXdM3sTXz3fVxXQjaUwjEHv3/2KukE5H/S81jRUDvIjnBMEor3Sp1mYiPimaneY0UHuuR298vX1xPxi07XGeXSkjeN5E68Y13qGlQ3MNhwqK3pUqq/cQHf4cIM3E2tmeirv6aPpBqz/AHM7Fu9UR+Eol0Erttr3fz5OQyNchvdtV9lvcfrx6eELqo8QOdvnwL/mkDxuB8oALKCHZvNxtj9J6WWKDj+I+qjXgriYpPc4Xi5u++NBTrgf2sLrBeBrhZTeSLKzJBWK4QrOGPISPcn0/e2jRki0AUxgi5PDxsFHmx/gHQTNAfVHKZKHBgCsEOa+zq4GWPl0TeVl3WXyipHItULmP3xuektEdGw1BXcdl5ZxwpjYlvY8NynJ8YFCSNC7c+9vDwPyXRbXEglauFobFCtlcPQLZxNmWxUAXf4sksJSmGoB4mUqoY0oTRRNP1AcBESjdi6B0cyEU5PblQ1b5rRAhxOpumgiMo3o8yL7IJDO2g0ghmcr73paiPv6jFKxK6neERo9px5FJa2xQYuvcltN4darUqf00drz5o+aE4sWmtV82UKEh4IVHKHOv7Ra+5fvR/12m0oxxJXrxPujIufIedmKpFnQNgKRbmGMpkFId4UULoHXbBWZzlgTndZJMK4e2U9x3qitZYWTiXyKfBjnUsZI44e0ERKZNJjWykOqP9Ap5fmgZbW5EAkecXsBroU4BC1LgjNJQVqW4DP/uswdIiuYtf0yY5MmUMcSunv+lUIxyI9Ks1njylMx+gK+EjDpL5s7eVMHsOXykPPwL4v+0tBNEe0Buwo0WkJ+QJTt0CSG8DVVPpnPSXHQpYKiPVg/I/G/12mPceJyomzU/u0giuYrw/x6kudYtbP1tSJtarj89LQxcMmEMMI9ph8wp2hhoIzpY2Scj7hfL+VyVsi8/vc3DrVtzI9k8He8XjI7VBDT5KkIVfRQO0XZd/y/En7fRzYHJz7ek7PPUUuFffqmw0sQa2jszWB5Aem8FBuimcQdMXbNykOGgntCKgJUmRf+RCLqohLL12Y8+LE3Rziw5gwdONcQ/hyjRJMfmAFT21A6h3bCGEhJdoMrqpSYGmJMWPF2d2Lr74+9zBjFAhsAp83X03mKslJ3m5bKDJYOPa14ut/f/0UZwjfynjiHB+kDRXRmITpuWtstZ/P8wradN8g6HfsPwtEwP6p+NWuyH7SZRw6sb5dStxZ0Y2HkSY0d73BueRcStEu7t+oM7df7IL8MHxEmIEjSMCQV/Bqjf4xQZ+XjqpBCbyFIqPhb3haT0bf4Xw43pkEkbZQE9pcmzbbRxXbw3T2Agt9ul5w0N/+BVsLLr33UkKdRUuY47Ti7ar61xcHWL4zDxAOGoU+ovHZX9gv7L1+3l6UO1oEEmOHCDx+ypS5V3CyW5+aL//NxZDeEDZEnq6Wny9oyDpLeAJ1+QzXO713bnLuQAGu7adE2I7w47TrMPpblv+I9BdCs5mz8J6KpV9gzcL3dLNjnHEVbCR/jkUjbx99I3s4GoB7ZWLbSfh7wcnq8+IBk8dUW+XhzzK+lw+H5ZHy+chSC6dADL5F0mZu/ZYOnxEuzwTerjXg1p4m7I96sIHcqIIad/xlE54i8/AFG3OFh5GtHI7KIJBmgF3x+MPkMgAAA=="}, {"slug": "fanwork", "name": "2차창작", "cat": "형식", "signs": [[0.1152, 0.4824, 0.873, 0.7676]], "thumb": "data:image/webp;base64,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"}, {"slug": "original", "name": "오리지널", "cat": "형식", "signs": [[0.1172, 0.668, 0.8887, 0.9414]], "thumb": "data:image/webp;base64,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"}, {"slug": "utility", "name": "유틸도구", "cat": "형식", "signs": [[0.5938, 0.2207, 0.8984, 0.8535]], "thumb": "data:image/webp;base64,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"}, {"slug": "favorite", "name": "즐겨찾기", "cat": "관리", "signs": [[0.0898, 0.4297, 0.5137, 0.8633]], "thumb": "data:image/webp;base64,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"}, {"slug": "kumjil", "name": "쿰질용", "cat": "관리", "signs": [[0.0898, 0.1465, 0.459, 0.9121]], "thumb": "data:image/webp;base64,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"}, {"slug": "wip", "name": "제작중", "cat": "관리", "signs": [[0.1035, 0.5879, 0.8926, 0.8496]], "thumb": "data:image/webp;base64,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"}, {"slug": "test", "name": "테스트", "cat": "관리", "signs": [[0.5273, 0.3672, 0.9375, 0.791]], "thumb": "data:image/webp;base64,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"}, {"slug": "archive", "name": "보관함", "cat": "관리", "signs": [[0.6094, 0.1797, 0.9414, 0.8633]], "thumb": "data:image/webp;base64,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"}, {"slug": "unsorted", "name": "미분류", "cat": "관리", "signs": [[0.293, 0.4648, 0.6758, 0.8789]], "thumb": "data:image/webp;base64,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"}, {"slug": "argon", "name": "아르곤", "cat": "아르곤", "signs": [[0.0766, 0.4258, 0.5136, 0.866]], "sign": "아르곤", "thumb": "data:image/webp;base64,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"}, {"slug": "argon-done", "name": "아르곤 작업완료", "cat": "아르곤", "signs": [[0.0837, 0.4729, 0.5455, 0.8955]], "sign": "작업완료", "thumb": "data:image/webp;base64,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"}, {"slug": "argon-rest", "name": "아르곤 휴식중", "cat": "아르곤", "signs": [[0.0805, 0.508, 0.5949, 0.941]], "sign": "휴식중", "thumb": "data:image/webp;base64,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"}, {"slug": "argon-shy", "name": "아르곤 부끄러움", "cat": "아르곤", "signs": [[0.0766, 0.4258, 0.5128, 0.866]], "sign": "부끄러움", "thumb": "data:image/webp;base64,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"}, {"slug": "argon-once", "name": "아르곤 이번만이에요", "cat": "아르곤", "signs": [[0.0789, 0.4226, 0.5104, 0.8644]], "sign": "이번만이에요", "thumb": "data:image/webp;base64,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"}, {"slug": "argon-room", "name": "아르곤 달달루방", "cat": "아르곤", "signs": [[0.059, 0.429, 0.5064, 0.8708]], "sign": "달달루방", "thumb": "data:image/webp;base64,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"}];

// ── src/ui/iconpicker.js ──
// 폴더 그림 고르기. 세 가지 길이 있다.
//   템플릿: 내장 섬네일로 고르고, 적용할 때만 GitHub에서 512px 그림을 받아 RisuAI 에셋으로 저장한다.
//   글씨 바꾸기: 그 템플릿의 빈 종이판을 받아 캔버스에 글씨를 다시 쓴다.
//   내 그림: 사용자가 고른 그림을 정사각으로 잘라 512px로 저장한다.
// 저장된 그림은 RisuAI 에셋이라 플러그인을 지우거나 GitHub에 닿지 않아도 그대로 남는다.

const TEMPLATE_BASE = 'https://raw.githubusercontent.com/canister2668/Risu-folder-master/main/templates/';
const TEMPLATE_CATS = ['전체', '장르', '형식', '관리', '아르곤'];
const SIGN_FONT = 'FMSign';
const SIGN_INK = '#282030';
const SIGN_MAX = 8;
const tplFiles = new Map();
let signFont = null;

function templateBase() {
  return globalThis.FM_TEMPLATE_BASE || TEMPLATE_BASE;
}

async function fetchTemplateFile(file) {
  if (tplFiles.has(file)) return tplFiles.get(file);
  const job = (async () => {
    const url = templateBase() + file;
    // 플러그인 iframe 은 CSP 로 fetch 가 막혀 있어 nativeFetch 만 쓴다. 옵션을 비우면 일부 판에서 내부 오류가 난다.
    let res = null;
    try { res = await Risuai.nativeFetch(url, { method: 'GET' }); } catch { res = null; }
    if (!res || !res.ok) throw new Error('템플릿 그림을 받지 못했습니다. 인터넷 연결을 확인해 주세요');
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (!bytes.byteLength) throw new Error('템플릿 그림이 비어 있습니다');
    return bytes;
  })();
  tplFiles.set(file, job);
  job.catch(() => tplFiles.delete(file));
  return job;
}

function bytesToImage(bytes) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([bytes], { type: imageMime(bytes) || 'image/png' }));
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('그림을 열지 못했습니다')); };
    img.src = url;
  });
}

// 글꼴을 못 받으면 기기의 굵은 고딕으로 쓴다.
function loadSignFont() {
  if (!signFont) {
    signFont = fetchTemplateFile('font.ttf')
      .then(async (bytes) => {
        const face = new FontFace(SIGN_FONT, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
        await face.load();
        document.fonts.add(face);
        return `"${SIGN_FONT}"`;
      })
      .catch(() => { signFont = null; return '"Apple SD Gothic Neo","Noto Sans KR","Malgun Gothic",sans-serif'; });
  }
  return signFont;
}

// 종이 하나에 글씨를 가장 크게 넣는다. 세로 종이는 세로쓰기를 먼저 본다.
function fitSignText(ctx, box, text, family) {
  const [x0, y0, x1, y1] = box;
  const w = x1 - x0;
  const h = y1 - y0;
  const pad = 0.08;
  const chars = [...text.replace(/\s+/g, '')];
  if (!chars.length) return;
  const cands = [];
  if (chars.length <= 5 && h / w > 1.2) cands.push({ lines: chars });
  cands.push({ lines: [text.trim()], spread: chars.length >= 3 && chars.length <= 4 && w / h > 1.8 });
  if (chars.length >= 3) { const m = Math.ceil(chars.length / 2); cands.push({ lines: [chars.slice(0, m).join(''), chars.slice(m).join('')] }); }
  let best = null;
  for (const c of cands) {
    let lo = 4;
    let hi = Math.floor(h);
    while (lo < hi) {
      const s = Math.ceil((lo + hi + 1) / 2);
      ctx.font = `${s}px ${family}`;
      const lw = Math.max(...c.lines.map((l) => ctx.measureText(l).width));
      if (lw <= w * (1 - 2 * pad) && s * c.lines.length * 1.04 <= h * (1 - 2 * pad)) lo = s; else hi = s - 1;
    }
    if (!best || lo > best.size) best = { ...c, size: lo };
  }
  ctx.font = `${best.size}px ${family}`;
  ctx.fillStyle = SIGN_INK;
  ctx.textBaseline = 'middle';
  const n = best.lines.length;
  const lh = best.size * 1.04;
  const top = y0 + h / 2 - (lh * (n - 1)) / 2;
  best.lines.forEach((line, i) => {
    if (best.spread && n === 1) {
      const cs = [...line];
      const tw = cs.reduce((a, c) => a + ctx.measureText(c).width, 0);
      const gap = (w * 0.84 - tw) / Math.max(1, cs.length - 1);
      let x = x0 + w * 0.08;
      ctx.textAlign = 'left';
      for (const c of cs) { ctx.fillText(c, x, top); x += ctx.measureText(c).width + gap; }
    } else {
      ctx.textAlign = 'center';
      ctx.fillText(line, x0 + w / 2, top + i * lh);
    }
  });
}

// 카드가 여러 장이면 글자를 고르게 나눈다(4자→2·1·1). 글자가 카드보다 적으면 남는 카드는 비운다.
function splitAcrossCards(text, n) {
  const ch = [...text.replace(/\s+/g, '')];
  const parts = [];
  if (ch.length < n) {
    const off = Math.floor((n - ch.length) / 2);
    for (let i = 0; i < n; i++) parts.push(ch[i - off] || '');
    return parts;
  }
  let k = 0;
  for (let i = 0; i < n; i++) {
    const c = Math.floor(ch.length / n) + (i < ch.length % n ? 1 : 0);
    parts.push(ch.slice(k, k + c).join(''));
    k += c;
  }
  return parts;
}

async function composeSign(tpl, text) {
  const [bytes, family] = await Promise.all([fetchTemplateFile(`blank/${tpl.slug}.webp`), loadSignFont()]);
  const img = await bytesToImage(bytes);
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0, 512, 512);
  const boxes = tpl.signs.map((r) => r.map((v) => v * 512));
  if (boxes.length > 1) {
    splitAcrossCards(text, boxes.length).forEach((part, i) => { if (part) fitSignText(ctx, boxes[i], part, family); });
  } else {
    fitSignText(ctx, boxes[0], text, family);
  }
  return c;
}

function canvasBytes(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) { reject(new Error('그림을 만들지 못했습니다')); return; }
      resolve(new Uint8Array(await blob.arrayBuffer()));
    }, 'image/webp', 0.9);
  });
}

// 폴더 이름과 글자가 겹치는 템플릿을 추천한다.
function templateScore(tpl, name) {
  const n = (name || '').replace(/\s+/g, '');
  if (!n) return 0;
  if (tpl.name === n) return 3;
  if (n.includes(tpl.name) || tpl.name.includes(n)) return 2;
  return [...tpl.name].filter((c) => n.includes(c)).length >= 2 ? 1 : 0;
}

// 정사각 자르기. 상자 크기는 화면에 맞춰 정하고, 저장은 512px.
function makeCropper(img, box) {
  const base = box / Math.min(img.naturalWidth, img.naturalHeight);
  const m = {
    img, z: 1, x: 0, y: 0,
    scale() { return base * this.z; },
    clamp() {
      const s = this.scale();
      this.x = Math.min(0, Math.max(box - img.naturalWidth * s, this.x));
      this.y = Math.min(0, Math.max(box - img.naturalHeight * s, this.y));
    },
    apply() { this.clamp(); img.style.transform = `translate(${this.x}px,${this.y}px) scale(${this.scale()})`; },
    zoom(z) {
      const c = box / 2;
      const s0 = this.scale();
      this.z = z;
      const s1 = this.scale();
      this.x = c - ((c - this.x) * s1) / s0;
      this.y = c - ((c - this.y) * s1) / s0;
      this.apply();
    },
    canvas() {
      const c = document.createElement('canvas');
      c.width = c.height = 512;
      const s = this.scale();
      c.getContext('2d').drawImage(img, -this.x / s, -this.y / s, box / s, box / s, 0, 0, 512, 512);
      return c;
    },
  };
  m.x = (box - img.naturalWidth * base) / 2;
  m.y = (box - img.naturalHeight * base) / 2;
  return m;
}

// 결과: { path } | { reset: true } | null
function openImagePicker(folder) {
  const st = { tab: 'tpl', cat: '전체', sel: null, editing: false, text: '', mine: null, busy: false, seq: 0 };
  const name = folder.name || '';
  const tile = (t) => `<button class="fm-ip-tile${st.sel === t ? ' on' : ''}" data-tpl="${t.slug}" title="${esc(t.name)}"><img src="${t.thumb}" alt=""><b>${esc(t.name)}</b></button>`;
  return openModal(
    `<div class="fm-ip">
      <div class="fm-ip-head"><h3 id="fm-dialog-title">폴더 그림</h3><small>${esc(name || '이름 없는 폴더')}</small>
        <button class="fm-btn ghost fm-icon fm-ip-x" data-x aria-label="닫기">${icon('close')}</button></div>
      <div class="fm-ip-prev">
        <div class="fm-ip-pv"><div class="fm-ip-big" data-cur>${folderThumb(folder, 'fm-ip-thumb')}</div><span>지금</span></div>
        <span class="fm-ip-arrow">→</span>
        <div class="fm-ip-pv"><div class="fm-ip-big empty" data-new></div><span data-new-label>바꿀 그림</span></div>
        <div class="fm-ip-side"><span>사이드바 크기</span><div class="fm-ip-sb"><div data-sb-cur>${folderThumb(folder, 'fm-ip-thumb')}</div><div data-sb-new></div></div></div>
      </div>
      <div class="fm-ip-tabs" role="tablist"><button data-tab="tpl" class="on" role="tab">템플릿</button><button data-tab="mine" role="tab">내 그림</button></div>
      <div class="fm-ip-body" data-body></div>
      <div class="fm-ip-foot">
        <button class="fm-btn ghost" data-reset ${folder.imgFile ? '' : 'disabled'}>기본 아이콘으로</button><span class="fm-spacer"></span>
        <button class="fm-btn" data-x>취소</button><button class="fm-btn primary" data-apply disabled>적용</button>
      </div>
    </div>`,
    (modal, close) => {
      modal.classList.add('fm-wide');
      const body = modal.querySelector('[data-body]');
      const applyBtn = modal.querySelector('[data-apply]');
      // 지금 그림(에셋)을 읽어 큰 칸과 사이드바 칸에 보인다.
      const curThumbs = [...modal.querySelectorAll('[data-cur] .fm-thumb, [data-sb-cur] .fm-thumb')];
      const lazy = curThumbs[0]?.dataset.src;
      if (lazy) avatars.load(lazy).then((src) => { if (src) curThumbs.forEach((el) => { const i = new Image(); i.src = src; el.replaceChildren(i); }); });

      const putNew = (node, label) => {
        const big = modal.querySelector('[data-new]');
        const sb = modal.querySelector('[data-sb-new]');
        big.classList.toggle('empty', !node);
        big.replaceChildren();
        sb.replaceChildren();
        if (node) {
          big.append(node);
          const small = document.createElement('canvas');
          small.width = small.height = 116;
          if (node.tagName === 'CANVAS') small.getContext('2d').drawImage(node, 0, 0, 116, 116);
          else { const i = new Image(); i.src = node.src; sb.append(i); }
          if (node.tagName === 'CANVAS') sb.append(small);
        }
        modal.querySelector('[data-new-label]').textContent = label || '바꿀 그림';
        applyBtn.disabled = !node || st.busy;
      };

      const refreshNew = async () => {
        const seq = ++st.seq;
        if (st.tab === 'mine') { putNew(st.mine ? st.mine.canvas() : null); return; }
        if (!st.sel) { putNew(null); return; }
        if (!st.editing) { const i = new Image(); i.src = st.sel.thumb; putNew(i, st.sel.name); return; }
        modal.querySelector('[data-new-label]').textContent = '그리는 중…';
        try {
          const c = await composeSign(st.sel, st.text || ' ');
          if (seq === st.seq) putNew(c, '글씨 바꿈');
        } catch (err) {
          if (seq !== st.seq) return;
          toastError(err);
          st.editing = false;
          renderBody();
          refreshNew();
        }
      };
      const refreshSoon = debounce(refreshNew, 140);

      const renderTpl = () => {
        const list = TEMPLATES.filter((t) => st.cat === '전체' || t.cat === st.cat);
        const rec = TEMPLATES.map((t) => [t, templateScore(t, name)]).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([t]) => t);
        const edit = !st.sel ? '<p class="fm-ip-hint">템플릿을 고르면 위에 미리 보입니다. 글씨 바꾸기를 지원하는 그림은 폴더 이름으로 바꿀 수 있어요.</p>'
          : st.sel.editable === false
            ? `<div class="fm-ip-editbar"><div><b>${esc(st.sel.name)}</b><small>문구가 포함된 완성형 아이콘입니다. 적용을 눌러 사용하세요.</small></div></div>`
          : st.editing
            ? `<div class="fm-ip-edit"><input class="fm-field" data-text maxlength="${SIGN_MAX}" placeholder="종이에 쓸 글자" aria-label="종이에 쓸 글자"><button class="fm-btn" data-orig>원래 글씨</button></div>
               <p class="fm-ip-hint">빈 종이판에 새로 씁니다. 종이 모양에 맞춰 줄과 크기를 자동으로 맞춥니다(최대 ${SIGN_MAX}자).</p>`
            : `<div class="fm-ip-edit"><div class="fm-ip-nm"><b>${esc(st.sel.name)}</b><small>템플릿 그대로 쓰거나 글씨를 바꿀 수 있어요</small></div><button class="fm-btn" data-edit>${icon('edit')}글씨 바꾸기</button></div>`;
        body.innerHTML = `<div class="fm-ip-chips">${TEMPLATE_CATS.map((c) => `<button data-cat="${c}" class="${c === st.cat ? 'on' : ''}">${c}</button>`).join('')}</div>
          ${rec.length && st.cat === '전체' ? `<div class="fm-ip-sec">"${esc(name)}"에 어울리는 템플릿</div><div class="fm-ip-grid">${rec.map(tile).join('')}</div><div class="fm-ip-sec">전체 ${TEMPLATES.length}</div>` : ''}
          <div class="fm-ip-grid">${list.map(tile).join('')}</div>${edit}`;
        const input = body.querySelector('[data-text]');
        if (input) {
          input.value = st.text;
          input.oninput = () => { st.text = [...input.value].slice(0, SIGN_MAX).join(''); refreshSoon(); };
          setTimeout(() => { input.focus(); input.select(); });
        }
      };

      const renderMine = () => {
        if (!st.mine) {
          body.innerHTML = `<label class="fm-ip-drop"><input type="file" accept="image/png,image/jpeg,image/webp" hidden>${icon('image')}<b>그림 고르기</b><span>PNG · JPG · WebP · 정사각으로 잘라 512px로 저장합니다</span></label>`;
          body.querySelector('input').onchange = async (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;
            try {
              const bytes = new Uint8Array(await file.arrayBuffer());
              if (!['image/png', 'image/jpeg', 'image/webp'].includes(imageMime(bytes))) throw new Error('PNG·JPG·WebP 그림만 쓸 수 있습니다');
              const img = await bytesToImage(bytes);
              st.mine = makeCropper(img, 220);
              renderMine();
              refreshNew();
            } catch (err) { toastError(err); e.target.value = ''; }
          };
          return;
        }
        body.innerHTML = `<div class="fm-ip-crop"><div class="fm-ip-cropbox" data-crop></div>
          <div class="fm-ip-cropctl"><label>확대<input type="range" data-zoom min="1" max="4" step="0.01" value="${st.mine.z}"></label>
          <span>끌어서 위치를 맞추세요</span><button class="fm-btn" data-other>${icon('image')}다른 그림</button></div></div>`;
        const box = body.querySelector('[data-crop]');
        box.append(st.mine.img);
        st.mine.apply();
        body.querySelector('[data-zoom]').oninput = (e) => { st.mine.zoom(+e.target.value); refreshSoon(); };
        body.querySelector('[data-other]').onclick = () => { st.mine = null; renderMine(); refreshNew(); };
        let pull = null;
        box.onpointerdown = (e) => { pull = { x: e.clientX, y: e.clientY, ox: st.mine.x, oy: st.mine.y }; box.setPointerCapture(e.pointerId); };
        box.onpointermove = (e) => { if (!pull) return; st.mine.x = pull.ox + e.clientX - pull.x; st.mine.y = pull.oy + e.clientY - pull.y; st.mine.apply(); };
        box.onpointerup = box.onpointercancel = () => { if (pull) { pull = null; refreshNew(); } };
      };

      const renderBody = () => {
        modal.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === st.tab));
        if (st.tab === 'tpl') renderTpl(); else renderMine();
      };

      body.addEventListener('click', (e) => {
        const cat = e.target.closest('[data-cat]');
        if (cat) { st.cat = cat.dataset.cat; renderTpl(); return; }
        const t = e.target.closest('[data-tpl]');
        if (t) {
          const tpl = TEMPLATES.find((x) => x.slug === t.dataset.tpl);
          if (st.sel !== tpl) { st.sel = tpl; st.editing = false; }
          renderTpl(); refreshNew(); return;
        }
        if (e.target.closest('[data-edit]') && st.sel?.editable !== false) { st.editing = true; st.text = [...name].slice(0, SIGN_MAX).join('') || st.sel.sign || st.sel.name; renderTpl(); refreshNew(); return; }
        if (e.target.closest('[data-orig]')) { st.editing = false; renderTpl(); refreshNew(); }
      });
      modal.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => { st.tab = b.dataset.tab; renderBody(); refreshNew(); }; });
      modal.querySelectorAll('[data-x]').forEach((b) => { b.onclick = () => close(null); });
      modal.querySelector('[data-reset]').onclick = () => close({ reset: true });
      applyBtn.onclick = async () => {
        if (st.busy) return;
        st.busy = true;
        applyBtn.disabled = true;
        applyBtn.textContent = '저장 중…';
        try {
          let bytes;
          if (st.tab === 'mine') bytes = await canvasBytes(st.mine.canvas());
          else if (st.editing) bytes = await canvasBytes(await composeSign(st.sel, st.text || ' '));
          else bytes = await fetchTemplateFile(`${st.sel.slug}.webp`);
          const path = await Risuai.saveAsset(bytes);
          if (!path) throw new Error('그림을 저장하지 못했습니다');
          close({ path });
        } catch (err) {
          toastError(err);
          st.busy = false;
          applyBtn.disabled = false;
          applyBtn.textContent = '적용';
        }
      };
      renderBody();
    },
  );
}

// ── src/ui/favorites.js ──
// 즐겨찾기: 봇 별표와 폴더 고정, 사이드바 바로가기 폴더 설정.
// 서버 플러그인 저장소에 두어 기기끼리 같이 쓴다. 1.0.3~1.0.4 는 기기 저장소(risuFolderMaster.extras)에 있었으므로
// 서버에 아직 없으면 처음 한 번 옮긴다.
// 쓸 때는 서버 값을 다시 읽어 이번 변경만 얹는다(다른 기기에서 넣은 별표를 덮어쓰지 않게).
// 바로가기 폴더(core/shortcut.js)를 켜면 별표가 바뀔 때마다 사이드바 폴더도 맞춘다.

const FAV_KEY = 'risuFolderMaster.favorites';
const FAV_LEGACY_KEY = 'risuFolderMaster.extras';
const FAV_SORTS = [['added', '추가한 순'], ['recent', '최근 대화'], ['name', '이름']];
const FAV_HOME_MAX = 12;
const FAV_POLL_MS = 4000;
const SHORTCUT_GUARD_XID = 'risu-folder-master-favorites-guard';
const PLUGIN_NAME = 'risu_folder_master';
const fav = { stars: [], pins: [], folder: favFolderNorm(null), sort: 'added', fold: false };
let favQueue = Promise.resolve();
let favPollTimer = null;
let favPollIdle = false;
// 해적판은 setItem 이 서버에 늦게 반영되어 바로 읽으면 옛 값이 온다. 아직 반영 안 된 내 변경을 기억해 읽을 때마다 다시 얹는다.
const favPending = [];
const FAV_PENDING_MS = 60000;

function favNorm(v) {
  return Array.isArray(v) ? [...new Set(v.filter((x) => typeof x === 'string' && x))] : [];
}

function favFolderNorm(v) {
  const o = v && typeof v === 'object' ? v : {};
  return {
    on: o.on === true,
    name: typeof o.name === 'string' ? o.name.slice(0, 80) : '',
    imgFile: typeof o.imgFile === 'string' ? o.imgFile : '',
  };
}

function favRecord(v) {
  const o = v && typeof v === 'object' ? v : {};
  return { stars: favNorm(o.stars), pins: favNorm(o.pins), folder: favFolderNorm(o.folder) };
}

// 즐겨찾기 바로가기 폴더 한 칸(sidebarplus.js 의 shortcutOpts 가 최근 대화·라벨 폴더와 함께 모은다).
function favShortcutItem() {
  return fav.folder.on ? { id: SHORTCUT_ID, name: fav.folder.name || SHORTCUT_NAME, color: 'yellow', imgFile: fav.folder.imgFile, ids: fav.stars } : null;
}

function favReflected(state, op) {
  if (op.key === 'folder') return Object.entries(op.set).every(([k, v]) => state.folder[k] === favFolderNorm({ ...state.folder, [k]: v })[k]);
  return (op.add || []).every((id) => state[op.key].includes(id)) && (op.remove || []).every((id) => !state[op.key].includes(id));
}

// 서버 값 + 아직 반영되지 않은 내 변경.
async function favRead() {
  const saved = await Risuai.pluginStorage.getItem(FAV_KEY);
  let state = favRecord(saved);
  const now = Date.now();
  for (let i = favPending.length - 1; i >= 0; i--) {
    if (now - favPending[i].at > FAV_PENDING_MS || favReflected(state, favPending[i].op)) favPending.splice(i, 1);
  }
  for (const { op } of favPending) state = favApply(state, op);
  return { saved, state };
}

async function favLoad() {
  try {
    const { saved, state } = await favRead();
    if (saved && typeof saved === 'object') {
      Object.assign(fav, state);
      return;
    }
    const legacy = await ui.prefs?.getItem(FAV_LEGACY_KEY);
    Object.assign(fav, favRecord({ stars: legacy?.stars, pins: legacy?.pins }));
    if (fav.stars.length || fav.pins.length) await Risuai.pluginStorage.setItem(FAV_KEY, favRecord(fav));
  } catch {}
}

// 지금 순서에 없는 봇·폴더는 뺀다(지워진 봇, 다른 곳에서 삭제한 폴더).
function favPrune(state) {
  if (!ui.order.length) return state;
  const bots = new Set(orderBotIds(ui.order));
  const folders = new Set(ui.order.filter(isFolder).map((f) => f.id));
  return { ...state, stars: state.stars.filter((id) => bots.has(id)), pins: state.pins.filter((id) => folders.has(id)) };
}

// op = { key: 'stars'|'pins', add?, remove? } | { key: 'folder', set }
function favApply(state, op) {
  if (op.key === 'folder') return { ...state, folder: favFolderNorm({ ...state.folder, ...op.set }) };
  const list = state[op.key].filter((id) => !op.remove?.includes(id));
  for (const id of op.add || []) if (!list.includes(id)) list.push(id);
  return { ...state, [op.key]: list };
}

function favChange(op) {
  Object.assign(fav, favApply(fav, op));
  render(true);
  favQueue = favQueue.then(async () => {
    const { state } = await favRead();
    const next = favPrune(favApply(state, op));
    favPending.push({ op, at: Date.now() });
    await Risuai.pluginStorage.setItem(FAV_KEY, next);
    Object.assign(fav, next);
    if (shortcutState.dbOk && (shortcutAnyOn() || op.key === 'folder')) await saver.syncShortcut();
    await shortcutGuard();
  }).catch((err) => toast('즐겨찾기를 저장하지 못했습니다: ' + errorText(err), { error: true })).then(() => render(true));
  return favQueue;
}

// ── 사이드바 바로가기 폴더 ──

// 사이드바에서 바로가기 폴더(맨 위 폴더들)를 끌 수 없게 한다. Chromium 계열만 막히고, 오른쪽 클릭 메뉴(이름·색·그림)는
// 막을 수 없으므로 그 밖의 손질은 syncShortcut 이 되돌린다. CSS 는 DOMPurify 를 거치므로 < > & 를 쓰지 않는다.
function shortcutGuardCSS(count = 1) {
  return SIDEBAR_SCROLL.split(',').map((sel) => {
    const top = `${sel.trim()} .group:not(.z-10):nth-child(-n+${count} of .group)`;
    return `${top},${top} *,${top} + .rounded-lg *{-webkit-user-drag:none!important}\n${top} + .rounded-lg .h-4{pointer-events:none!important}`;
  }).join('\n');
}

async function shortcutGuard() {
  const count = shortcutCount();
  try {
    const doc = count ? await Risuai.getRootDocument() : rootDoc;
    if (!doc) return;
    rootDoc = doc;
    await setRootStyle(doc, SHORTCUT_GUARD_XID, count ? shortcutGuardCSS(count) : '');
  } catch {}
}

// 창을 한 번 연 뒤(DB 권한을 이미 받은 뒤)에만 돈다. 다른 기기에서 바꾼 즐겨찾기도 다시 읽어 맞춘다.
function shortcutPollStart() {
  // 모두 꺼져 있어도 쉬는 상태로 시작한다(다른 기기에서 켜면 알아채도록). 데이터 권한을 받은 뒤에만.
  if (favPollTimer || !shortcutState.dbOk) return;
  favPollIdle = !shortcutAnyOn();
  let idle = 0;
  favPollTimer = setInterval(async () => {
    try {
      // 모두 꺼져 있으면 설정만 가끔(약 30초마다) 다시 읽는다. 다른 기기에서 다시 켜면 여기서 알아챈다.
      if (favPollIdle && ++idle % 8) return;
      Object.assign(fav, (await favRead()).state);
      await shortcutReloadStores();
      recentWatchSync();
      if (!shortcutAnyOn()) {
        if (!favPollIdle) { favPollIdle = true; await saver.syncShortcut(); await shortcutGuard(); }
        return;
      }
      if (favPollIdle) { favPollIdle = false; idle = 0; }
      if (await saver.syncShortcut() === 'written') { await shortcutGuard(); if (ui.app) { ui.order = await readOrder(); render(true); } }
    } catch {}
  }, FAV_POLL_MS);
}

function shortcutPollStop() {
  clearInterval(favPollTimer);
  favPollTimer = null;
  favPollIdle = false;
}

async function shortcutStartup() {
  await favLoad();
  await shortcutReloadStores();
  if (shortcutAnyOn()) await shortcutGuard();
  recentWatchStart();
}

// 플러그인을 지우거나 끌 때 바로가기 폴더를 지운다. RisuAI는 목록에서 먼저 빼고 플러그인을 다시 불러오므로,
// 이때 목록에 켜진 채로 남아 있으면 단순 다시 불러오기(업데이트·다른 플러그인 변경)라 그대로 둔다.
// 호스트가 정리를 1초까지만 기다리므로 권한 창이 필요하면(3일 지남) 정리하지 못할 수 있다. 확실히 지우려면 먼저 옵션을 끈다.
async function shortcutUnloadCleanup() {
  shortcutPollStop();
  recentWatchStop();
  if (!shortcutAnyOn()) return;
  const db = await Risuai.getDatabase(['plugins', 'characterOrder']);
  if (!db) return;
  const me = (Array.isArray(db.plugins) ? db.plugins : []).find((p) => p && p.name === PLUGIN_NAME);
  if (me && me.enabled !== false) return;
  const raw = cloneOrder(db.characterOrder);
  if (!raw.some(isShortcut)) return;
  await Risuai.setDatabaseLite({ characterOrder: shortcutBase(raw, shortcutState.last) });
}

async function shortcutToggle(on) {
  if (on && !fav.stars.length) toast('즐겨찾는 봇이 생기면 사이드바 맨 위에 폴더가 생깁니다');
  await favChange({ key: 'folder', set: { on } });
  if (shortcutAnyOn()) shortcutPollStart(); // 모두 끄면 감시는 저절로 쉬는 상태가 된다(다른 기기에서 다시 켜면 알아챔)
  toast(on ? '사이드바 맨 위에 즐겨찾기 폴더를 만들었습니다' : '사이드바 즐겨찾기 폴더를 지웠습니다');
}

async function shortcutRename() {
  const name = await askText('사이드바 즐겨찾기 폴더 이름', { value: fav.folder.name || SHORTCUT_NAME, confirm: '바꾸기' });
  if (!name) return;
  await favChange({ key: 'folder', set: { name: name === SHORTCUT_NAME ? '' : name } });
}

async function shortcutImage() {
  const result = await openImagePicker({ name: (fav.folder.name || SHORTCUT_NAME).replace(/^[^\p{L}\p{N}]+/u, ''), imgFile: fav.folder.imgFile, color: 'yellow' });
  if (!result) return;
  await favChange({ key: 'folder', set: { imgFile: result.reset ? '' : result.path } });
  toast(result.reset ? '즐겨찾기 폴더 그림을 기본으로 되돌렸습니다' : fav.folder.on ? '즐겨찾기 폴더 그림을 바꿨습니다(사이드바에도 적용)' : '즐겨찾기 폴더 그림을 바꿨습니다(사이드바 폴더를 켜면 적용)');
}

function favIsStar(id) { return fav.stars.includes(id); }
function favIsPin(fid) { return fav.pins.includes(fid); }

function favToggleStar(id) {
  const on = favIsStar(id);
  favChange({ key: 'stars', [on ? 'remove' : 'add']: [id] });
  toast(on ? `"${botName(id) || '봇'}" 즐겨찾기 해제` : `"${botName(id) || '봇'}" 즐겨찾기에 추가`);
}

function favToggleSelected() {
  const ids = [...ui.selected];
  if (!ids.length) { toast('즐겨찾기에 넣을 봇을 먼저 선택하세요'); return; }
  const remove = ids.every(favIsStar);
  favChange({ key: 'stars', [remove ? 'remove' : 'add']: ids });
  toast(`${ids.length}개 봇 즐겨찾기 ${remove ? '해제' : '추가'}`);
}

function favTogglePin(fid) {
  const on = favIsPin(fid);
  favChange({ key: 'pins', [on ? 'remove' : 'add']: [fid] });
  toast(on ? '폴더 고정을 해제했습니다' : '즐겨찾기에 폴더를 고정했습니다');
}

// 별표한 봇(지금 순서에 있는 것만)을 정렬 기준대로.
function favStarIds() {
  const live = new Set(orderBotIds(ui.order));
  const ids = fav.stars.filter((id) => live.has(id));
  if (fav.sort === 'recent') {
    const last = (id) => roster.chars.get(id)?.last || 0;
    return ids.map((id, i) => [id, i]).sort((a, b) => last(b[0]) - last(a[0]) || a[1] - b[1]).map(([id]) => id);
  }
  if (fav.sort === 'name') {
    return ids.map((id, i) => [id, i, botName(id)]).sort((a, b) => (!a[2]) - (!b[2]) || a[2].localeCompare(b[2], 'ko') || a[1] - b[1]).map(([id]) => id);
  }
  return ids;
}

function favPinnedFolders(model) {
  return fav.pins.map((id) => model.folders.find((f) => f.id === id)).filter(Boolean);
}

function favFolderName(id) {
  const f = ui.order.find((x) => isFolder(x) && x.data.includes(id));
  return f ? f.name || '이름 없음' : '폴더 밖';
}

function favStarButton(id) {
  const on = favIsStar(id);
  const label = on ? '즐겨찾기 해제' : '즐겨찾기에 추가';
  return `<button class="fm-star${on ? ' on' : ''}" data-star="${esc(id)}" aria-pressed="${on}" title="${label}" aria-label="${label}">${icon('star')}</button>`;
}

function favRailHtml(model, nav) {
  const pins = favPinnedFolders(model);
  return nav(`data-view="${VIEW_STARS}"`, favIconHtml(), '즐겨찾기', favStarIds().length, ui.view === VIEW_STARS ? ' on' : '')
    + (pins.length ? `<div class="fm-rail-label fm-fav-label"><span>고정한 폴더</span></div>` + pins.map((f) =>
      nav(`data-view="${esc(f.id)}" data-folder="${esc(f.id)}" data-drop="${esc(f.id)}"`, folderThumb(f), f.name || '이름 없음', f.data.length, ui.view === f.id ? ' on' : '')).join('') : '');
}

function favHeadHtml() {
  const n = favStarIds().length;
  const sorts = FAV_SORTS.map(([k, t]) => `<button data-fav-sort="${k}" class="${fav.sort === k ? 'on' : ''}" aria-pressed="${fav.sort === k}">${t}</button>`).join('');
  return `${backButton(favIconHtml())}<div class="fm-head-text" data-fav-menu><h2>즐겨찾는 봇</h2><p>${n}개 · 원래 폴더 위치는 그대로입니다</p></div>
    <div class="fm-head-actions"><div class="fm-fav-sort" role="group" aria-label="정렬">${sorts}</div>${ui.reorder ? '' : `<button class="fm-btn" data-act="select-all">${icon('select')}<span class="fm-text">전체 선택</span></button>`}</div>`;
}

// 켜기·끄기 스위치. 누르면 바로 바뀐다(확인창 없음).
function favSwitchHtml(on, attrs, label) {
  return `<button class="fm-switch${on ? ' on' : ''}" role="switch" aria-checked="${on}" aria-label="${esc(label)}" title="${esc(label)}" ${attrs}><i></i></button>`;
}

// 즐겨찾기 화면 위: 사이드바 바로가기 폴더 토글·이름·그림.
function favShortcutBarHtml() {
  const on = fav.folder.on;
  const thumb = folderThumb({ imgFile: fav.folder.imgFile, color: 'yellow' });
  return `<div class="fm-fav-bar${on ? ' on' : ''}"><button class="fm-fav-bar-thumb" data-act="fav-folder-image" title="그림 바꾸기" aria-label="즐겨찾기 폴더 그림 바꾸기">${thumb}</button><div class="fm-fav-bar-text"><b>사이드바 즐겨찾기 폴더</b>
    <small>${on ? `RisuAI 사이드바 맨 위 「${esc(fav.folder.name || SHORTCUT_NAME)}」에서 바로 엽니다. 봇은 복사되지 않고 원래 폴더에도 그대로 있습니다. 이 폴더는 여기서만 고칠 수 있고, 사이드바에서 고친 것은 되돌아갑니다.` : '켜면 RisuAI 사이드바 맨 위에 즐겨찾는 봇의 바로가기 폴더가 생깁니다. 봇은 복사되지 않습니다. 플러그인을 지우기 전에 끄면 깔끔하게 정리됩니다.'}</small></div>
    <div class="fm-fav-bar-acts"><button class="fm-btn" data-act="fav-folder-rename">${icon('edit')}<span class="fm-text">이름</span></button><button class="fm-btn" data-act="fav-folder-image">${icon('image')}<span class="fm-text">그림</span></button>
    ${favSwitchHtml(on, 'data-act="fav-folder-toggle"', '사이드바 즐겨찾기 폴더 켜기/끄기')}</div></div>`;
}

// 즐겨찾기 아이콘: 고른 그림이 있으면 그 그림, 없으면 별.
function favIconHtml() {
  return fav.folder.imgFile ? folderThumb({ imgFile: fav.folder.imgFile, color: 'yellow' }) : `<span class="fm-thumb plain fm-fav-ic">${icon('star')}</span>`;
}

function favFolderTitle() {
  return fav.folder.name || SHORTCUT_NAME;
}

// 왼쪽 목록 「즐겨찾기」·즐겨찾기 머리에서 오른쪽 클릭(길게 누르기) 메뉴.
function favMenuItems() {
  return [
    ['fav-image', 'image', '그림 바꾸기'],
    ['fav-rename', 'edit', '이름 바꾸기'],
    ['fav-toggle', 'sidebar', fav.folder.on ? '사이드바 폴더 끄기' : '사이드바 폴더 켜기'],
  ];
}

function runFavMenuAction(act) {
  ({ 'fav-image': shortcutImage, 'fav-rename': shortcutRename, 'fav-toggle': favFolderToggle })[act]?.();
}

function favFolderToggle() {
  return shortcutToggle(!fav.folder.on);
}

// 첫 화면 맨 위: 고정한 폴더 + 별표한 봇(최대 12개).
function favHomeHtml(model) {
  if (ui.reorder) return '';
  const pins = favPinnedFolders(model);
  const stars = favStarIds();
  if (!pins.length && !stars.length) return '';
  const more = `<button data-open="${VIEW_STARS}">모두 보기${stars.length > FAV_HOME_MAX ? ` ${stars.length}` : ''}</button>`;
  let html = `<section class="fm-section fm-fav-home"><div class="fm-section-head" data-fav-menu title="오른쪽 클릭(길게 누르기): 그림·이름·사이드바 폴더"><span class="fm-fav-ic">${icon('star')}</span><h3>즐겨찾기</h3><span>${pins.length + stars.length}</span>
    <button data-fav-fold aria-expanded="${!fav.fold}">${fav.fold ? '펼치기' : '접기'}</button>${more}</div>`;
  if (!fav.fold) {
    if (pins.length) html += `<div class="fm-folders">${pins.map(folderTileHtml).join('')}</div>`;
    if (stars.length) html += gridHtml(stars.slice(0, FAV_HOME_MAX), VIEW_STARS, '', false);
  }
  return html + '</section>';
}

// 첫 화면 검색: 별표한 봇 중 맞는 것을 맨 위에.
function favSearchHtml() {
  const hits = favStarIds().filter(matches);
  if (!hits.length) return '';
  return `<section class="fm-section"><div class="fm-section-head"><span class="fm-fav-ic">${icon('star')}</span><h3>즐겨찾기</h3><span>${hits.length}</span></div>${gridHtml(hits, VIEW_STARS, '', false)}</section>`;
}

const FAV_CSS = `
.fm-star{width:26px;height:28px;border-radius:8px;display:grid;place-items:center;color:var(--faint);opacity:0;transition:opacity .12s,background-color .12s}
.fm-star .fm-i{width:15px;height:15px}
.fm-star.on{opacity:1;color:#f5c542}
.fm-star.on .fm-i{fill:currentColor}
.fm-card:hover .fm-star,.fm-card:focus-within .fm-star,.fm-star:focus-visible{opacity:1}
.fm-star:hover{background:var(--surface-2);color:#f5c542}
.fm-app.is-reorder .fm-star{display:none}
@media (hover:none){.fm-star{opacity:.45}.fm-star.on{opacity:1}}
.fm-acts{display:flex;align-items:center;gap:1px}
.fm-fav-ic,.fm-thumb.fm-fav-ic,.fm-section-head .fm-fav-ic{color:#f5c542;display:inline-grid;place-items:center}
:root:is([data-fm-theme=mint],[data-fm-theme=blue]) :is(.fm-star.on,.fm-star:hover,.fm-fav-ic,.fm-thumb.fm-fav-ic,.fm-section-head .fm-fav-ic,.fm-fav-pin){color:#b87800}
.fm-fav-ic .fm-i{fill:currentColor}
.fm-section-head .fm-fav-ic .fm-i{width:14px;height:14px}
.fm-section-head button+button{margin-left:0}
.fm-fav-home{padding-bottom:6px;border-bottom:1px solid var(--line);margin-bottom:14px}
.fm-fav-home .fm-folders{margin-bottom:10px}
.fm-fav-pin{position:absolute;top:5px;left:6px;color:#f5c542}.fm-fav-pin .fm-i{width:13px;height:13px;fill:currentColor}
.fm-fav-sort{display:inline-flex;padding:2px;border-radius:9px;background:var(--surface);border:1px solid var(--line)}
.fm-fav-sort button{font-size:12px;padding:5px 9px;border-radius:7px;color:var(--muted);white-space:nowrap}
.fm-fav-sort button.on{background:var(--accent-bg);color:var(--text);font-weight:650}
.fm-meta .fm-fav-where{color:var(--faint)}
.fm-fav-bar{display:flex;align-items:center;gap:12px;padding:10px 12px;margin:0 0 14px;border:1px solid var(--line);border-radius:12px;background:var(--surface)}
.fm-fav-bar.on{border-color:#f5c54266}
.fm-fav-bar .fm-thumb{flex:none}
.fm-fav-bar-thumb{flex:none;border-radius:10px;padding:0}
.fm-fav-bar-thumb:hover .fm-thumb,.fm-fav-bar-thumb:focus-visible .fm-thumb{outline:2px solid var(--accent);outline-offset:2px}
.fm-fav-bar-text{flex:1;min-width:0;display:grid;gap:3px}
.fm-fav-bar-text b{font-size:13px}
.fm-fav-bar-text small{font-size:11.5px;color:var(--muted);line-height:1.5}
.fm-fav-bar-acts{display:flex;align-items:center;gap:6px;flex:none}
.fm-switch{position:relative;width:44px;height:26px;border-radius:13px;background:var(--surface-2);border:1px solid var(--line-2);flex:none;transition:background-color .15s,border-color .15s}
.fm-switch i{position:absolute;top:2px;left:2px;width:20px;height:20px;border-radius:50%;background:var(--muted);transition:transform .15s,background-color .15s}
.fm-switch.on{background:var(--accent);border-color:var(--accent)}
.fm-switch.on i{transform:translateX(18px);background:#fff}
.fm-switch:focus-visible{outline:2px solid var(--accent-2);outline-offset:2px}
.fm-switch:disabled{opacity:.5}
@media (prefers-reduced-motion:reduce){.fm-switch,.fm-switch i{transition:none}}
.fm-set-row{display:flex;align-items:center;gap:12px;margin:6px 0 4px}
.fm-set-row div{flex:1;min-width:0}
.fm-set-row b{display:block;font-size:13px}
.fm-set-row small{display:block;font-size:11.5px;color:var(--muted);line-height:1.5}
@media (max-width:560px){.fm-fav-bar{flex-wrap:wrap}.fm-fav-bar-acts{width:100%;justify-content:flex-end}}
@media (max-width:560px){.fm-fav-sort button{padding:5px 7px}}
`;

// ── src/ui/sidebarplus.js ──
// 사이드바 바로가기 폴더 모음(최근 대화·즐겨찾기·라벨)과 「최근 대화」 추적.
// 최근 대화: 4초마다 지금 열린 봇 번호만 확인하고(권한 필요 없음), 바뀌면 그 봇을 「최근에 연 봇」 기록 맨 앞에 둔다.
// 사이드바 폴더에 쓰려면 데이터 권한이 필요하다. 이번 세션에 권한을 받지 않았으면 봇을 바꿀 때 한 번 요청하고,
// 거절되면 이번 세션에는 다시 묻지 않는다(폴더 마스터 창을 열면 다시 맞춘다).

const PLUS_KEY_SERVER = 'risuFolderMaster.plus';
const RECENT_KEY = 'risuFolderMaster.recent';
const RECENT_POLL_MS = 4000;
const plusStore = createSyncStore(PLUS_KEY_SERVER, plusNorm, plusApply);
const recentStore = createSyncStore(RECENT_KEY, recentNorm, recentApply);
const recentWatch = { timer: null, lastIdx: null, busy: false, denied: false };

function labelFolderDef() {
  const lid = plusStore.state.labelFolder.lid;
  return lid ? labelStore.state.defs.find((d) => d.id === lid) || null : null;
}

function recentIds() {
  const r = plusStore.state.recent;
  const live = shortcutState.last ? orderBotIds(shortcutState.last) : null;
  return recentRank(live, recentStore.state.list, roster.chars, { count: r.count, exclude: r.noStars ? fav.stars : [] });
}

function labelFolderIds() {
  const def = labelFolderDef();
  if (!def) return [];
  const tagged = Object.entries(labelStore.state.tags).filter(([, l]) => l.includes(def.id)).map(([b]) => b);
  if (!shortcutState.last) return tagged;
  const set = new Set(tagged);
  return orderBotIds(shortcutState.last).filter((id) => set.has(id));
}

// 사이드바 맨 위에 둘 바로가기 폴더들(위에서부터). store.js 의 rawFor 가 부른다.
function shortcutOpts() {
  const r = plusStore.state.recent;
  const recent = r.on ? { id: RECENT_ID, name: r.name || RECENT_NAME, color: 'blue', imgFile: r.imgFile, ids: recentIds() } : null;
  const favItem = favShortcutItem();
  const list = r.first === 'favorites' ? [favItem, recent] : [recent, favItem];
  const def = labelFolderDef();
  if (def) {
    const lf = plusStore.state.labelFolder;
    list.push({ id: LABEL_FOLDER_ID, name: lf.name || `${def.emoji ? def.emoji + ' ' : ''}${def.name}`, color: def.color, imgFile: lf.imgFile, ids: labelFolderIds() });
  }
  return list.filter(Boolean);
}

function shortcutAnyOn() {
  return fav.folder.on || plusStore.state.recent.on || !!labelFolderDef();
}

// 지금 사이드바 맨 위에 생길 바로가기 폴더 수(끌기 막기 CSS 용).
function shortcutCount() {
  return shortcutOpts().filter((sc) => {
    if (!shortcutState.last) return sc.ids.length > 0;
    const live = new Set(orderBotIds(shortcutState.last));
    return sc.ids.some((id) => live.has(id));
  }).length;
}

async function shortcutReloadStores() {
  await Promise.all([plusStore.load(), recentStore.load(), labelStore.load()]);
}

// ── 최근 대화 추적 ──

function recentWatchStart() {
  if (recentWatch.timer || !plusStore.state.recent.on) return;
  // 마지막 대화 시각(기기에 저장된 봇 요약)도 순위에 쓴다.
  if (!roster.store) rosterLoadCache().catch(() => {});
  recentWatch.timer = setInterval(recentTick, RECENT_POLL_MS);
  recentTick();
}

// 다른 기기에서 켜고 끈 것까지 맞춘다.
function recentWatchSync() {
  if (plusStore.state.recent.on) recentWatchStart(); else recentWatchStop();
}

function recentWatchStop() {
  clearInterval(recentWatch.timer);
  recentWatch.timer = null;
  recentWatch.lastIdx = null;
}

async function recentTick() {
  if (recentWatch.busy) return;
  if (!plusStore.state.recent.on) { recentWatchStop(); return; }
  recentWatch.busy = true;
  try {
    let idx;
    try { idx = await Risuai.getCurrentCharacterIndex(); } catch { recentWatchStop(); return; }
    if (typeof idx !== 'number' || idx < 0 || idx === recentWatch.lastIdx) return;
    recentWatch.lastIdx = idx;
    const c = await Risuai.getCharacter();
    if (!c || typeof c.chaId !== 'string' || !c.chaId || !plusStore.state.recent.on) return;
    if (recentStore.state.list[0]?.id === c.chaId) return;
    await recentStore.change({ id: c.chaId, at: Date.now() });
    await recentSidebarSync();
  } catch {} finally { recentWatch.busy = false; }
}

async function recentSidebarSync() {
  if (!plusStore.state.recent.on || recentWatch.denied) return;
  try {
    if (await saver.syncShortcut() === 'written') {
      await shortcutGuard();
      if (ui.app) { ui.order = await readOrder(); render(true); }
    }
    shortcutPollStart();
  } catch (err) {
    if (/권한/.test(errorText(err))) recentWatch.denied = true;
  }
}

// ── 설정 창의 바로가기 폴더 칸 ──

function plusSidebarSettingsHtml(d) {
  const seg = (attr, items, cur) => `<div class="fm-fav-sort" role="group">${items.map(([v, t]) => `<button ${attr}="${v}" class="${String(cur) === String(v) ? 'on' : ''}" aria-pressed="${String(cur) === String(v)}">${t}</button>`).join('')}</div>`;
  const labels = labelStore.state.defs;
  return `<span class="fm-label">사이드바 바로가기 폴더</span>
     <p class="fm-note">RisuAI 사이드바 맨 위에 봇의 바로가기 폴더를 둡니다. 봇은 복사되지 않고 원래 폴더에도 그대로 있습니다. 이 폴더들은 폴더 마스터에서만 고칩니다.</p>
     <div class="fm-set-row"><div><b>⭐ 즐겨찾기 폴더</b><small>즐겨찾는 봇을 사이드바 맨 위에</small></div>${favSwitchHtml(d.fav, 'data-sw="fav"', '사이드바 즐겨찾기 폴더 켜기/끄기')}</div>
     <div class="fm-set-row"><div><b>🕘 최근 대화 폴더</b><small>최근에 연 봇 순서대로 자동으로 채웁니다. 봇을 바꿀 때 RisuAI가 데이터 권한을 다시 물을 수 있습니다(3일마다).</small></div>${favSwitchHtml(d.recent, 'data-sw="recent"', '최근 대화 폴더 켜기/끄기')}</div>
     <div class="fm-set-row fm-sub-row" data-recent-only><div><b>보여 줄 개수</b></div>${seg('data-rcount', [[5, '5'], [8, '8'], [12, '12']], d.count)}</div>
     <div class="fm-set-row fm-sub-row" data-recent-only><div><b>즐겨찾기 봇은 빼기</b><small>두 폴더에 같은 봇이 겹치지 않게</small></div>${favSwitchHtml(d.noStars, 'data-sw="noStars"', '최근 대화에서 즐겨찾기 봇 빼기')}</div>
     <div class="fm-set-row fm-sub-row" data-recent-only><div><b>폴더 순서</b></div>${seg('data-rfirst', [['recent', '최근 → 즐겨찾기'], ['favorites', '즐겨찾기 → 최근']], d.first)}</div>
     <div class="fm-set-row"><div><b>🏷️ 라벨 폴더</b><small>라벨 하나를 사이드바 맨 위 폴더로 (예: 「진행 중」)</small></div></div>
     <div class="fm-chips" role="group" aria-label="라벨 폴더">${[['', '쓰지 않음'], ...labels.map((l) => [l.id, `${l.emoji ? l.emoji + ' ' : ''}${l.name}`])].map(([v, t]) => `<button data-lfolder="${esc(v)}" class="${d.lfolder === v ? 'on' : ''}" aria-pressed="${d.lfolder === v}">${esc(t)}</button>`).join('')}</div>`;
}

function plusSidebarSettingsBind(modal, d) {
  const sync = () => {
    modal.querySelectorAll('[data-sw]').forEach((b) => { const on = !!d[b.dataset.sw]; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); });
    modal.querySelectorAll('[data-recent-only]').forEach((el) => el.classList.toggle('dim', !d.recent));
    for (const [attr, key] of [['rcount', 'count'], ['rfirst', 'first']]) modal.querySelectorAll(`[data-${attr}]`).forEach((b) => { const on = String(b.dataset[attr]) === String(d[key]); b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    modal.querySelectorAll('[data-lfolder]').forEach((b) => { const on = b.dataset.lfolder === d.lfolder; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
  };
  modal.querySelectorAll('[data-sw]').forEach((b) => { b.onclick = () => { d[b.dataset.sw] = !d[b.dataset.sw]; sync(); }; });
  modal.querySelectorAll('[data-rcount]').forEach((b) => { b.onclick = () => { d.count = +b.dataset.rcount; sync(); }; });
  modal.querySelectorAll('[data-rfirst]').forEach((b) => { b.onclick = () => { d.first = b.dataset.rfirst; sync(); }; });
  modal.querySelectorAll('[data-lfolder]').forEach((b) => { b.onclick = () => { d.lfolder = b.dataset.lfolder; sync(); }; });
  sync();
}

function plusSidebarDraft() {
  const r = plusStore.state.recent;
  return { fav: fav.folder.on, recent: r.on, count: r.count, noStars: r.noStars, first: r.first, lfolder: plusStore.state.labelFolder.lid };
}

// 설정 저장: 바뀐 것만 쓰고 사이드바를 한 번 맞춘다.
async function plusSidebarSave(d) {
  const r = plusStore.state.recent;
  const changed = d.recent !== r.on || d.count !== r.count || d.noStars !== r.noStars || d.first !== r.first || d.lfolder !== plusStore.state.labelFolder.lid;
  if (d.fav !== fav.folder.on) await shortcutToggle(d.fav);
  if (!changed) return;
  await plusStore.change({ k: 'recent', set: { on: d.recent, count: d.count, noStars: d.noStars, first: d.first } });
  await plusStore.change({ k: 'labelFolder', set: { lid: d.lfolder } });
  if (d.recent) recentWatchStart(); else recentWatchStop();
  await shortcutResync();
}

// 바로가기 폴더 설정이 바뀐 뒤: 사이드바에 쓰고, 끌기 막기·감시를 맞춘다.
async function shortcutResync() {
  try {
    if (await saver.syncShortcut() === 'written' && ui.app) { ui.order = await readOrder(); render(true); }
  } catch (err) { toastError(err); }
  await shortcutGuard();
  if (shortcutAnyOn()) shortcutPollStart(); // 모두 끄면 감시는 저절로 쉬는 상태가 된다(다른 기기에서 다시 켜면 알아챔)
}

// ── src/ui/labels.js ──
// 내 라벨: 봇을 쓰는 사람이 붙이는 「나한테 어떤 봇인지」 표시(진행 중·나중에 할 것·엔딩 봄 …).
// 폴더와 따로 쓰는 두 번째 분류다. 서버 플러그인 저장소에 두어 기기끼리 같이 쓴다.
// 자동 라벨 「새로 받음」은 저장하지 않고 그때그때 계산한다(이 기기에서 처음 본 지 7일 안 + 아직 대화 없음).

const LABELS_KEY = 'risuFolderMaster.labels';
const SEEN_KEY = 'risuFolderMaster.seen';
const VIEW_LABEL = 'label:';
const LABEL_NEW = '__new__';
// 정리는 지워졌다고 확인된 봇(roster.missing)만 한다. 열어 둔 화면의 오래된 순서로 정리하면 다른 기기에서 새로 받은 봇의 라벨을 지운다.
const labelStore = createSyncStore(LABELS_KEY, labelsNorm, labelsApply, (s) => labelsDropBots(s, roster.missing));
const labelUi = { seen: {}, sort: 'recent', fold: true }; // 「내 라벨」 칸은 처음엔 접혀 있다

function isLabelView(view) {
  return typeof view === 'string' && view.startsWith(VIEW_LABEL);
}

function labelDef(lid) {
  return labelStore.state.defs.find((d) => d.id === lid) || null;
}

function labelText(d) {
  return `${d.emoji ? d.emoji + ' ' : ''}${d.name}`;
}

function labelHex(d) {
  return FOLDER_HEX[d.color] || FOLDER_HEX.default;
}

// 처음 보는 봇 기록(이 기기). 창을 열 때 부른다.
async function labelSeenLoad() {
  try {
    const saved = await ui.prefs?.getItem(SEEN_KEY);
    const next = seenUpdate(saved && typeof saved === 'object' ? saved : null, orderBotIds(ui.order));
    labelUi.seen = next;
    if (JSON.stringify(next) !== JSON.stringify(saved)) await ui.prefs?.setItem(SEEN_KEY, next);
  } catch {}
}

function labelIsNew(id) {
  return isNewBot(id, labelUi.seen, roster.chars);
}

// 이 라벨이 붙은 봇(지금 순서에 있는 것만). 정렬: 최근 대화순 | 목록 순.
function labelBotIds(lid) {
  const order = orderBotIds(ui.order);
  let ids;
  if (lid === LABEL_NEW) ids = [...new Set(order)].filter(labelIsNew);
  else {
    const set = new Set(Object.entries(labelStore.state.tags).filter(([, l]) => l.includes(lid)).map(([b]) => b));
    ids = [...new Set(order)].filter((id) => set.has(id));
  }
  if (labelUi.sort === 'recent') {
    const last = (id) => roster.chars.get(id)?.last || 0;
    ids = ids.map((id, i) => [id, i]).sort((a, b) => last(b[0]) - last(a[0]) || a[1] - b[1]).map(([id]) => id);
  }
  return ids;
}

function labelChipsHtml(id) {
  const out = labelsOf(labelStore.state, id).map(labelDef).filter(Boolean)
    .map((d) => `<span class="fm-lbl" style="--c:${labelHex(d)}" title="라벨">${esc(labelText(d))}</span>`);
  if (labelIsNew(id)) out.push('<span class="fm-lbl new" title="자동 라벨: 받은 지 7일 안 · 아직 대화 없음">🆕 새로 받음</span>');
  return out.join('');
}

function labelButtonHtml(id) {
  const n = labelsOf(labelStore.state, id).length;
  return `<button class="fm-tagbtn${n ? ' on' : ''}" data-tag="${esc(id)}" title="라벨" aria-label="라벨 붙이기">${icon('tag')}</button>`;
}

function labelDot(d) {
  return `<span class="fm-thumb plain fm-lbl-dot" style="--c:${labelHex(d)}">${d.emoji ? esc(d.emoji) : '<i></i>'}</span>`;
}

// 왼쪽 목록의 「내 라벨」 칸. 접으면 라벨 줄을 숨기고, 지금 보고 있는 라벨 하나만 남긴다(접기 상태는 기기에 기억).
function labelRailHtml(nav) {
  const defs = labelStore.state.defs;
  const fold = labelUi.fold;
  const shown = (view) => !fold || ui.view === view;
  const rows = defs.filter((d) => shown(VIEW_LABEL + d.id)).map((d) => nav(`data-view="${VIEW_LABEL}${esc(d.id)}" data-label="${esc(d.id)}"`, labelDot(d), d.name, labelBotIds(d.id).length, ui.view === VIEW_LABEL + d.id ? ' on' : ''));
  const fresh = labelBotIds(LABEL_NEW).length;
  const toggle = `data-label-fold aria-expanded="${!fold}" title="${fold ? '라벨 펼치기' : '라벨 접기'}"`;
  let html = `<div class="fm-rail-label fm-lbl-head"><button class="fm-rail-fold${fold ? ' folded' : ''}" ${toggle}>${icon('down')}<span>내 라벨</span>${fold ? `<i>${defs.length}</i>` : ''}</button><button class="fm-rail-add" data-act="label-new" title="새 라벨" aria-label="새 라벨">${icon('plus')}</button></div>`
    // 휴대폰은 칸 제목이 안 보이므로 접기 칩을 따로 둔다.
    + `<button class="fm-nav fm-mob fm-lbl-chip${fold ? ' folded' : ''}" ${toggle}><span class="fm-thumb plain">${icon('tag')}</span><span class="fm-nav-name">라벨</span><span class="fm-nav-count">${fold ? '펼치기' : '접기'}</span></button>`
    + rows.join('');
  if (!fold) html += `<div class="fm-rail-label"><span>자동</span></div>`;
  if (shown(VIEW_LABEL + LABEL_NEW)) html += nav(`data-view="${VIEW_LABEL}${LABEL_NEW}"`, '<span class="fm-thumb plain fm-lbl-dot">🆕</span>', '새로 받음', fresh, ui.view === VIEW_LABEL + LABEL_NEW ? ' on' : '');
  return html;
}

function labelHeadHtml() {
  const lid = ui.view.slice(VIEW_LABEL.length);
  const d = lid === LABEL_NEW ? { name: '새로 받음', emoji: '🆕', color: 'default' } : labelDef(lid);
  const n = labelBotIds(lid).length;
  const sorts = [['recent', '최근 대화순'], ['order', '목록 순']].map(([k, t]) => `<button data-label-sort="${k}" class="${labelUi.sort === k ? 'on' : ''}" aria-pressed="${labelUi.sort === k}">${t}</button>`).join('');
  const sub = lid === LABEL_NEW ? `${n}개 · 받은 지 7일 안 됐고 아직 대화하지 않은 봇(이 기기 기준)` : `${n}개 · 여러 폴더에 걸쳐 있어도 모아 봅니다`;
  return `${backButton(labelDot(d))}<div class="fm-head-text" ${lid === LABEL_NEW ? '' : `data-label="${esc(lid)}"`}><h2>${esc(labelText(d))}</h2><p>${esc(sub)}</p></div>
    <div class="fm-head-actions"><div class="fm-fav-sort" role="group" aria-label="정렬">${sorts}</div>
    ${lid === LABEL_NEW ? '' : `<button class="fm-btn" data-act="label-edit">${icon('edit')}<span class="fm-text">라벨 편집</span></button>`}
    <button class="fm-btn" data-act="select-all">${icon('select')}<span class="fm-text">전체 선택</span></button></div>`;
}

function labelViewHtml() {
  const lid = ui.view.slice(VIEW_LABEL.length);
  const ids = labelBotIds(lid);
  let html = '';
  if (lid !== LABEL_NEW && plusStore.state.labelFolder.lid === lid) html += `<p class="fm-note">이 라벨은 RisuAI 사이드바 맨 위 바로가기 폴더로도 보입니다.</p>`;
  if (lid === LABEL_NEW && roster.mode === 'single') {
    const unread = orderBotIds(ui.order).filter((id) => !roster.resolved(id)).length;
    if (unread) html += `<p class="fm-note">아직 읽지 않은 봇 ${unread}개는 대화 여부를 몰라 빠져 있습니다. <button class="fm-link" data-act="load-all">모두 읽기</button></p>`;
  }
  const empty = lid === LABEL_NEW ? '새로 받은 봇이 없습니다' : '이 라벨이 붙은 봇이 없습니다. 봇 칸의 🏷️ 버튼으로 붙입니다';
  return html + gridHtml(ids, ui.view, ui.query ? '맞는 봇이 없습니다' : empty);
}

// ── 라벨 붙이기 ──

// ids 에 라벨을 붙이거나 뗀다. 창은 열린 채로 바로 반영한다.
async function openLabelPicker(ids) {
  ids = [...new Set(ids)];
  if (!ids.length) { toast('라벨을 붙일 봇을 먼저 선택하세요'); return; }
  const title = ids.length === 1 ? (botName(ids[0]) || '봇') : `봇 ${ids.length}개`;
  const rows = () => labelStore.state.defs.map((d) => {
    const have = ids.filter((id) => labelsOf(labelStore.state, id).includes(d.id)).length;
    const state = have === ids.length ? 'on' : have ? 'some' : '';
    return `<button class="fm-lrow ${state}" data-lab="${esc(d.id)}" role="checkbox" aria-checked="${state === 'on' ? 'true' : state === 'some' ? 'mixed' : 'false'}"><span class="fm-cb"></span><span class="fm-lbl" style="--c:${labelHex(d)}">${esc(labelText(d))}</span>${labelStore.state.opts.solo === d.id ? '<small>하나만</small>' : ''}</button>`;
  }).join('');
  await openModal(
    `<h3 id="fm-dialog-title">🏷️ ${esc(title)}</h3><p class="fm-desc">누르면 바로 붙고, 다시 누르면 뗍니다.</p>
     <div class="fm-lrows" data-rows>${rows()}</div>
     <button class="fm-nav fm-pick-new" data-new-label><span class="fm-thumb plain">${icon('plus')}</span><span class="fm-nav-name">새 라벨…</span></button>
     <div class="fm-modal-actions"><button class="fm-btn primary" data-x>완료</button></div>`,
    (modal, close) => {
      const box = modal.querySelector('[data-rows]');
      box.addEventListener('click', (e) => {
        const b = e.target.closest('[data-lab]');
        if (!b) return;
        const lid = b.dataset.lab;
        const all = ids.every((id) => labelsOf(labelStore.state, id).includes(lid));
        if (!all && ids.length > 1 && lid === labelStore.state.opts.solo) { toast('한 봇에만 붙는 라벨이라 봇 하나를 골라 붙여 주세요'); return; }
        labelChange(all ? { t: 'remove', bots: ids, label: lid } : { t: 'add', bots: ids, label: lid });
        rerender(box, rows());
      });
      modal.querySelector('[data-new-label]').onclick = async () => {
        const d = await editLabelDialog(null);
        if (d) { await labelChange({ t: 'add', bots: ids, label: d.id }); rerender(box, rows()); }
      };
      modal.querySelector('[data-x]').onclick = () => close(null);
    },
  );
}

function labelChange(op) {
  const job = labelStore.change(op, async () => {
    if (shortcutState.dbOk && labelFolderDef()) { if (await saver.syncShortcut() === 'written') { ui.order = await readOrder(); await shortcutGuard(); } }
  }).catch((err) => toast('라벨을 저장하지 못했습니다: ' + errorText(err), { error: true })).then(() => { if (ui.app) render(true); });
  if (ui.app) render(true);
  return job;
}

// 라벨 만들기·고치기. 결과: 저장한 라벨 | null. 지우기는 'deleted'.
async function editLabelDialog(def) {
  let color = def ? def.color : LABEL_COLORS[labelStore.state.defs.length % 6];
  const result = await openModal(
    `<h3 id="fm-dialog-title">${def ? '라벨 편집' : '새 라벨'}</h3>
     <div class="fm-lab-edit"><input class="fm-field fm-lab-emoji" maxlength="4" placeholder="🙂" value="${esc(def ? def.emoji : '')}" aria-label="이모지(선택)">
     <input class="fm-field fm-lab-name" maxlength="24" placeholder="라벨 이름 (예: 정주행 중)" value="${esc(def ? def.name : '')}" aria-label="라벨 이름"></div>
     <span class="fm-label">색</span>
     <div class="fm-swatches">${LABEL_COLORS.map((c) => `<button class="fm-swatch${color === c ? ' on' : ''}" style="--c:${FOLDER_HEX[c]}" data-c="${c}">${COLOR_NAMES[c]}</button>`).join('')}</div>
     <div class="fm-modal-actions">${def ? '<button class="fm-btn danger" data-del>라벨 삭제</button><span class="fm-spacer"></span>' : ''}<button class="fm-btn" data-x>취소</button><button class="fm-btn primary" data-ok>${def ? '저장' : '만들기'}</button></div>`,
    (modal, close) => {
      const name = modal.querySelector('.fm-lab-name');
      const emoji = modal.querySelector('.fm-lab-emoji');
      modal.querySelectorAll('[data-c]').forEach((b) => { b.onclick = () => { color = b.dataset.c; modal.querySelectorAll('[data-c]').forEach((x) => x.classList.toggle('on', x === b)); }; });
      const ok = () => {
        const n = name.value.trim();
        if (!n) { name.focus(); return; }
        close({ id: def ? def.id : 'l-' + newFolderId().slice(0, 8), name: n, emoji: emoji.value.trim(), color });
      };
      modal.querySelector('[data-ok]').onclick = ok;
      name.onkeydown = (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); ok(); } };
      modal.querySelector('[data-x]').onclick = () => close(null);
      const del = modal.querySelector('[data-del]');
      if (del) del.onclick = () => close('delete');
      setTimeout(() => name.focus(), 0);
    },
  );
  if (!result) return null;
  if (result === 'delete') {
    const n = labelBotIds(def.id).length;
    if (!(await askConfirm(`"${def.name}" 라벨 삭제`, `라벨만 지웁니다. 봇은 그대로이고, 이 라벨이 붙은 봇 ${n}개에서 라벨이 빠집니다.`, { confirm: '삭제', danger: true }))) return null;
    if (plusStore.state.labelFolder.lid === def.id) { await plusStore.change({ k: 'labelFolder', set: { lid: '' } }); }
    await labelChange({ t: 'drop', label: def.id });
    if (ui.view === VIEW_LABEL + def.id) ui.view = VIEW_ALL;
    if (shortcutState.dbOk) await shortcutResync();
    render(true);
    toast('라벨을 지웠습니다');
    return 'deleted';
  }
  if (!def && labelStore.state.defs.length >= LABEL_MAX) { toast(`라벨은 ${LABEL_MAX}개까지 만들 수 있습니다`, { error: true }); return null; }
  await labelChange({ t: 'def', def: result });
  toast(def ? '라벨을 고쳤습니다' : `"${result.name}" 라벨을 만들었습니다`);
  return result;
}

// 왼쪽 목록 라벨에서 오른쪽 클릭(길게 누르기) 메뉴.
function labelMenuItems(lid) {
  const inSidebar = plusStore.state.labelFolder.lid === lid;
  return [
    ['label-edit', 'edit', '이름·색 바꾸기'],
    ['label-sidebar', 'sidebar', inSidebar ? '사이드바 폴더 그만 쓰기' : '사이드바 폴더로 쓰기'],
    ['label-delete', 'close', '라벨 삭제'],
  ];
}

async function runLabelMenuAction(act, lid) {
  const def = labelDef(lid);
  if (!def) return;
  if (act === 'label-edit' || act === 'label-delete') {
    if (act === 'label-delete') {
      const n = labelBotIds(lid).length;
      if (!(await askConfirm(`"${def.name}" 라벨 삭제`, `라벨만 지웁니다. 봇은 그대로이고, 이 라벨이 붙은 봇 ${n}개에서 라벨이 빠집니다.`, { confirm: '삭제', danger: true }))) return;
      if (plusStore.state.labelFolder.lid === lid) await plusStore.change({ k: 'labelFolder', set: { lid: '' } });
      await labelChange({ t: 'drop', label: lid });
      if (ui.view === VIEW_LABEL + lid) ui.view = VIEW_ALL;
      if (shortcutState.dbOk) await shortcutResync();
      render(true);
      return;
    }
    await editLabelDialog(def);
    return;
  }
  if (act === 'label-sidebar') {
    const on = plusStore.state.labelFolder.lid !== lid;
    await plusStore.change({ k: 'labelFolder', set: { lid: on ? lid : '' } });
    await shortcutResync();
    render(true);
    toast(on ? `사이드바 맨 위에 「${labelText(def)}」 바로가기 폴더를 둡니다` : '라벨 사이드바 폴더를 지웠습니다');
  }
}

// ── 설정 창의 라벨 칸 ──

function labelSettingsHtml(d) {
  const chips = (attr, cur) => `<div class="fm-chips" role="group">${[['', '없음'], ...labelStore.state.defs.map((l) => [l.id, labelText(l)])].map(([v, t]) => `<button ${attr}="${esc(v)}" class="${cur === v ? 'on' : ''}" aria-pressed="${cur === v}">${esc(t)}</button>`).join('')}</div>`;
  return `<span class="fm-label">내 라벨</span>
     <div class="fm-set-row"><div><b>한 봇에만 붙는 라벨</b><small>새 봇에 붙이면 이전 봇에서 빠집니다 (예: 「진행 중」은 하나만)</small></div></div>${chips('data-lsolo', d.solo)}
     <div class="fm-set-row"><div><b>보관함 제안에 먼저 넣을 라벨</b><small>오래되지 않았어도 보관함 후보로 올립니다 (예: 「엔딩 봄」)</small></div></div>${chips('data-lfinish', d.finish)}`;
}

function labelSettingsBind(modal, d) {
  const sync = () => {
    for (const [attr, key] of [['lsolo', 'solo'], ['lfinish', 'finish']]) modal.querySelectorAll(`[data-${attr}]`).forEach((b) => { const on = b.dataset[attr] === d[key]; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
  };
  modal.querySelectorAll('[data-lsolo]').forEach((b) => { b.onclick = () => { d.solo = b.dataset.lsolo; sync(); }; });
  modal.querySelectorAll('[data-lfinish]').forEach((b) => { b.onclick = () => { d.finish = b.dataset.lfinish; sync(); }; });
  sync();
}

async function labelSettingsSave(d) {
  const o = labelStore.state.opts;
  if (d.solo !== o.solo) await labelChange({ t: 'opt', key: 'solo', value: d.solo });
  if (d.finish !== o.finish) await labelChange({ t: 'opt', key: 'finish', value: d.finish });
}

// ── src/ui/tools.js ──
// 1.0.7 도구 창: 배치 기록, 중복 봇, 정리 마법사, 보관함 제안, 폴더 그림 한 번에, 통계, 명령 창(Ctrl+K).
// 모두 기존 저장 경로(save → saver.commit)로 쓰므로 되돌리기·다른 곳 변경 확인이 그대로 적용된다.

const SNAP_KEY = 'risuFolderMaster.snapshots';
const SNAP_AUTO_MAX = 15;
const SNAP_PIN_MAX = 10;
const ARCHIVE_NAME = '📦 보관함';
const ARCHIVE_MIN = 5;
const snaps = { list: [] };

// 이름을 모두 알아야 하는 도구에서: 해적판에서 아직 읽지 않은 봇 수.
function unreadCount(ids) {
  return roster.mode === 'single' ? [...new Set(ids)].filter((id) => !roster.resolved(id)).length : 0;
}

function unreadNote(ids, what) {
  const n = unreadCount(ids);
  return n ? `<p class="fm-note warn">아직 정보를 읽지 않은 봇 ${n}개는 ${esc(what)}에서 빠져 있습니다. <button class="fm-link" data-read-all>모두 읽기</button></p>` : '';
}

// 「모두 읽기」를 누르면 창을 닫고 모두 읽은 뒤 같은 도구를 다시 연다.
function bindReadAll(modal, close, reopen) {
  const b = modal.querySelector('[data-read-all]');
  if (b) b.onclick = async () => { close(null); if (await readAllWithProgress()) reopen(); };
}

function miniBot(id) {
  const c = roster.chars.get(id);
  return `<span class="fm-mini">${avatarHtml(c, id).replace('class="fm-av"', 'class="fm-av sm"')}${esc(botName(id) || '…')}</span>`;
}

function lazyAvatars(root) {
  root.querySelectorAll('[data-src]').forEach(async (el) => {
    const path = el.dataset.src;
    delete el.dataset.src;
    const src = await avatars.load(path);
    if (!src || !el.isConnected) return;
    const img = document.createElement('img');
    img.alt = '';
    img.src = src;
    if (el.classList.contains('fm-thumb')) el.replaceChildren(img); else el.append(img);
  });
}

// ── ③ 배치 기록 ──

async function snapLoad() {
  try {
    const s = await ui.prefs?.getItem(SNAP_KEY);
    snaps.list = Array.isArray(s?.list) ? s.list.filter((e) => e && Array.isArray(e.order) && typeof e.at === 'number') : [];
  } catch { snaps.list = []; }
}

function snapPersist() {
  try { ui.prefs?.setItem(SNAP_KEY, { list: snaps.list }); } catch {}
}

function snapPush(kind, label, order) {
  const entry = { id: newFolderId().slice(0, 8), at: Date.now(), kind, label: String(label || '').slice(0, 80), order: cloneOrder(order) };
  snaps.list.unshift(entry);
  let autos = 0;
  let pins = 0;
  snaps.list = snaps.list.filter((e) => (e.kind === 'manual' ? ++pins <= SNAP_PIN_MAX : ++autos <= SNAP_AUTO_MAX));
  snapPersist();
  return entry;
}

// 창을 열 때: 마지막 기록과 다르면 폴더 마스터 밖에서 바뀐 것이다(다른 플러그인·사이드바에서 직접 바꿈·새 봇).
function snapCheckExternal(order) {
  const latest = snaps.list.find((e) => e.kind !== 'manual') || snaps.list[0];
  if (!latest) { snapPush('auto', '처음 기록', order); return; }
  if (!sameOrder(latest.order, order)) snapPush('external', '바깥에서 바뀜', order);
}

function diffText(d) {
  const parts = [];
  if (d.foldersAdded.length) parts.push(`<span class="p">+ 폴더 ${esc(d.foldersAdded.slice(0, 3).join(', '))}${d.foldersAdded.length > 3 ? ` 외 ${d.foldersAdded.length - 3}` : ''}</span>`);
  if (d.foldersRemoved.length) parts.push(`<span class="m">− 폴더 ${esc(d.foldersRemoved.slice(0, 3).join(', '))}${d.foldersRemoved.length > 3 ? ` 외 ${d.foldersRemoved.length - 3}` : ''}</span>`);
  if (d.renamed.length) parts.push(`<span>이름 ${esc(d.renamed[0][0])} → ${esc(d.renamed[0][1])}${d.renamed.length > 1 ? ` 외 ${d.renamed.length - 1}` : ''}</span>`);
  if (d.moved) parts.push(`<span>봇 ${d.moved}개 옮김</span>`);
  if (d.botsAdded) parts.push(`<span class="p">+ 봇 ${d.botsAdded}</span>`);
  if (d.botsRemoved) parts.push(`<span class="m">− 봇 ${d.botsRemoved}</span>`);
  return parts.join(' · ') || '<span>순서만 바뀜</span>';
}

function snapSummary(order) {
  const folders = order.filter(isFolder);
  return `폴더 ${folders.length}개 · 봇 ${new Set(orderBotIds(order)).size}개`;
}

async function openSnapshots() {
  try { ui.order = await readOrder(); } catch (err) { toastError(err); return; }
  const kindName = { auto: '', external: '⚠️ ', manual: '📌 ' };
  const rows = () => snaps.list.map((e, i) => {
    const older = snaps.list.slice(i + 1).find(() => true);
    const cur = sameOrder(e.order, ui.order);
    const t = timeAgo(e.at);
    return `<div class="fm-snap${cur ? ' cur' : ''}${e.kind === 'external' ? ' ext' : ''}">
      <div class="fm-snap-text"><b>${kindName[e.kind] || ''}${esc(e.label || '기록')}</b>${cur ? ' <span class="fm-badge">지금과 같음</span>' : ''}<small title="${esc(t.full)}">${esc(t.short)} · ${esc(snapSummary(e.order))}</small>
      <div class="fm-diff">${older ? diffText(diffOrders(older.order, e.order)) : '<span>가장 오래된 기록</span>'}</div></div>
      <div class="fm-snap-acts">${e.kind === 'manual' ? `<button class="fm-btn ghost fm-icon" data-snap-del="${e.id}" title="이 기록 지우기" aria-label="이 기록 지우기">${icon('close')}</button>` : ''}
      <button class="fm-btn" data-snap-view="${e.id}">미리보기</button>${cur ? '' : `<button class="fm-btn" data-snap-go="${e.id}">${icon('undo')}이 배치로</button>`}</div></div>`;
  }).join('') || '<div class="fm-empty">아직 기록이 없습니다</div>';
  const act = await openModal(
    `<h3 id="fm-dialog-title">${icon('history')} 배치 기록</h3>
     <p class="fm-desc">폴더 배치를 바꿀 때마다 이 기기에 자동으로 남깁니다(최근 ${SNAP_AUTO_MAX}개). 폴더 마스터 밖에서 바뀐 것(다른 플러그인, 사이드바에서 직접 고친 것, 새로 받은 봇)도 창을 열 때 알아채 「바깥에서 바뀜」으로 남깁니다.</p>
     <div class="fm-snaps" data-rows>${rows()}</div>
     <p class="fm-note">되돌려도 그 사이에 새로 받은 봇은 지우지 않고 폴더 밖 맨 뒤에 둡니다. 되돌린 뒤 「되돌리기」로 다시 돌아올 수 있습니다.</p>
     <div class="fm-modal-actions"><button class="fm-btn" data-snap-pin>📌 지금 배치 저장</button><span class="fm-spacer"></span><button class="fm-btn primary" data-x>닫기</button></div>`,
    (modal, close) => {
      modal.classList.add('fm-big');
      modal.querySelector('[data-x]').onclick = () => close(null);
      modal.addEventListener('click', async (e) => {
        const go = e.target.closest('[data-snap-go]');
        if (go) { close({ go: go.dataset.snapGo }); return; }
        const view = e.target.closest('[data-snap-view]');
        if (view) { close({ view: view.dataset.snapView }); return; }
        const del = e.target.closest('[data-snap-del]');
        if (del) { snaps.list = snaps.list.filter((x) => x.id !== del.dataset.snapDel); snapPersist(); rerender(modal.querySelector('[data-rows]'), rows()); return; }
        if (e.target.closest('[data-snap-pin]')) close({ pin: true });
      });
    },
  );
  if (!act) return;
  if (act.pin) {
    const name = await askText('지금 배치 저장', { placeholder: '예: 정리 끝난 판', confirm: '저장', desc: `손으로 저장한 기록은 자동 기록이 밀려나도 지워지지 않습니다(최대 ${SNAP_PIN_MAX}개).` });
    if (name) { snapPush('manual', name, ui.order); toast('지금 배치를 저장했습니다'); }
    openSnapshots();
    return;
  }
  const entry = snaps.list.find((x) => x.id === (act.go || act.view));
  if (!entry) return;
  if (act.view) { await previewSnapshot(entry); return; }
  await restoreSnapshot(entry);
}

async function previewSnapshot(entry) {
  const folders = entry.order.filter(isFolder);
  const loose = entry.order.filter((x) => typeof x === 'string');
  const t = timeAgo(entry.at);
  const go = await openModal(
    `<h3 id="fm-dialog-title">${esc(entry.label || '기록')}</h3><p class="fm-desc">${esc(t.full)} · ${esc(snapSummary(entry.order))}</p>
     <div class="fm-report">${folders.map((f) => `<section><h4><i class="fm-dot" style="--c:${FOLDER_HEX[f.color] || FOLDER_HEX.default}"></i> ${esc(f.name || '이름 없음')} ${f.data.length}</h4><ul><li>${esc(f.data.slice(0, 8).map((id) => botName(id) || '…').join(', '))}${f.data.length > 8 ? ` 외 ${f.data.length - 8}` : ''}</li></ul></section>`).join('')}
     <section><h4>폴더 밖 ${loose.length}</h4></section></div>
     <div class="fm-modal-actions"><button class="fm-btn" data-x>닫기</button>${sameOrder(entry.order, ui.order) ? '' : '<button class="fm-btn primary" data-ok>이 배치로</button>'}</div>`,
    (modal, close) => {
      modal.querySelector('[data-x]').onclick = () => close(false);
      const ok = modal.querySelector('[data-ok]');
      if (ok) ok.onclick = () => close(true);
    },
  );
  if (go) await restoreSnapshot(entry);
  else openSnapshots();
}

async function restoreSnapshot(entry) {
  const next = restoreOrder(ui.order, entry.order);
  const d = diffOrders(ui.order, next);
  if (sameOrder(next, ui.order)) { toast('지금 배치와 같습니다'); return; }
  const tmp = document.createElement('div');
  tmp.innerHTML = diffText(d);
  if (!(await askConfirm('이 배치로 되돌릴까요?', `「${entry.label}」(${timeAgo(entry.at).short}) 배치로 되돌립니다.\n바뀌는 것: ${tmp.textContent}`, { confirm: '되돌리기' }))) return;
  await save(`배치 복원: ${entry.label}`, (o) => { const n = restoreOrder(o, entry.order); return sameOrder(n, o) ? null : n; });
}

// ── 보관함 (② ⑤ 공용) ──

function archiveFolderId(order = ui.order) {
  const saved = plusStore.state.archive.folderId;
  if (saved && order.some((x) => isFolder(x) && x.id === saved)) return saved;
  const byName = order.find((x) => isFolder(x) && !isShortcut(x) && /^(📦\s*)?보관함$/.test(String(x.name || '').trim()));
  return byName ? byName.id : '';
}

async function archiveMove(ids, label) {
  ids = [...new Set(ids)];
  if (!ids.length) return false;
  let target = '';
  const ok = await save(label || `보관함으로 ${ids.length}개`, (o) => {
    // 창을 열어 둔 사이 지워진 봇은 빼고 옮긴다(없는 봇 자리를 다시 만들지 않게).
    const live = new Set(orderBotIds(o));
    const todo = ids.filter((id) => live.has(id));
    if (!todo.length) return null;
    const fid = archiveFolderId(o);
    if (fid) { target = fid; return moveBotsToFolder(o, todo, fid); }
    const r = createFolder(o, ARCHIVE_NAME, todo);
    target = r.folder.id;
    return r.order;
  });
  // 원래 있던 「보관함」을 쓴 경우도 기억해 두면, 나중에 이름을 바꿔도 보관함으로 알아본다.
  if (ok && target && target !== plusStore.state.archive.folderId) await plusStore.change({ k: 'archive', set: { folderId: target } }).catch(() => {});
  if (ok) ui.selected.clear();
  return ok;
}

// ── ② 중복 봇 ──

async function openDuplicates() {
  const ids = orderBotIds(ui.order);
  const groups = findDuplicates(ids, roster.chars, plusStore.state.dupIgnore);
  const keep = new Map(groups.map((g) => [g.key, new Set([g.ids[0]])]));
  const ignored = new Set();
  const body = () => {
    const live = groups.filter((g) => !ignored.has(g.key));
    if (!live.length) return '<div class="fm-empty">이름이 같거나 비슷한 봇이 없습니다</div>';
    return live.map((g) => {
      const first = roster.chars.get(g.ids[0]);
      return `<section class="fm-dupe"><div class="fm-dupe-h">${avatarHtml(first, g.ids[0])}<b>${esc(first.name)}</b><span class="fm-badge warn">${g.ids.length}개</span><small>${g.same ? '이름 같음' : '이름 비슷함'}</small>
        <button class="fm-link" data-dup-ignore="${esc(g.key)}">이 묶음 무시</button></div>
        <div class="fm-dupe-rows">${g.ids.map((id) => {
          const c = roster.chars.get(id);
          const t = timeAgo(c.last);
          const on = keep.get(g.key).has(id);
          return `<div class="fm-dupe-row"><button class="fm-lrow ${on ? 'on' : ''}" data-dup-keep="${esc(g.key)}" data-id="${esc(id)}" role="checkbox" aria-checked="${on}" aria-label="남기기"><span class="fm-cb"></span></button>
            <span class="fm-dupe-name">${esc(c.name)}</span><span class="fm-dupe-where">${icon('folder')}${esc(favFolderName(id))}</span><span class="fm-dupe-last">${t ? esc(t.short) : '대화 없음'}</span>
            <button class="fm-btn fm-sm" data-dup-loc="${esc(id)}">${icon('locate')}찾기</button></div>`;
        }).join('')}</div></section>`;
    }).join('');
  };
  const rest = () => groups.filter((g) => !ignored.has(g.key)).flatMap((g) => g.ids.filter((id) => !keep.get(g.key).has(id)));
  const act = await openModal(
    `<h3 id="fm-dialog-title">${icon('copy')} 중복 봇 찾기</h3>
     <p class="fm-desc">새 버전을 다시 받다 보면 같은 봇이 쌓입니다. 이름이 같거나 버전 표기·「사본」만 다른 봇을 묶어 보여 줍니다. 봇을 지우지는 않습니다. 지우려면 「찾기」로 사이드바의 그 칸을 짚은 뒤 RisuAI에서 지우세요.</p>
     ${unreadNote(ids, '중복 찾기')}
     <div class="fm-dupes" data-rows>${body()}</div>
     <div class="fm-modal-actions"><span class="fm-count-note" data-rest></span><span class="fm-spacer"></span><button class="fm-btn" data-x>닫기</button><button class="fm-btn primary" data-dup-archive>📦 보관함 폴더로 옮기기</button></div>`,
    (modal, close) => {
      modal.classList.add('fm-big');
      const rows = modal.querySelector('[data-rows]');
      const sync = () => {
        rerender(rows, body());
        const n = rest().length;
        modal.querySelector('[data-rest]').textContent = n ? `체크하지 않은 봇 ${n}개` : '';
        modal.querySelector('[data-dup-archive]').disabled = !n;
        lazyAvatars(rows);
      };
      rows.addEventListener('click', (e) => {
        const k = e.target.closest('[data-dup-keep]');
        if (k) { const set = keep.get(k.dataset.dupKeep); if (set.has(k.dataset.id)) { if (set.size > 1) set.delete(k.dataset.id); else toast('묶음마다 하나는 남겨야 합니다'); } else set.add(k.dataset.id); sync(); return; }
        const ig = e.target.closest('[data-dup-ignore]');
        if (ig) { ignored.add(ig.dataset.dupIgnore); sync(); return; }
        const loc = e.target.closest('[data-dup-loc]');
        if (loc) close({ locate: loc.dataset.dupLoc });
      });
      modal.querySelector('[data-x]').onclick = () => close({ done: true });
      modal.querySelector('[data-dup-archive]').onclick = () => close({ archive: rest() });
      bindReadAll(modal, close, openDuplicates);
      sync();
    },
  );
  if (ignored.size) await plusStore.change({ k: 'dupIgnore', add: [...ignored] }).catch(() => {});
  if (!act) return;
  if (act.locate) { locateBot(act.locate); return; }
  if (act.archive?.length) await archiveMove(act.archive, `중복 봇 ${act.archive.length}개 → 보관함`);
}

// ── ④ 정리 마법사 ──

async function openWizard(mode = 'name') {
  const model = currentModel();
  const groups = suggestGroups(model.root, roster.chars, model.folders, mode);
  const on = new Set(groups.filter((g) => g.ids.length >= 2 || g.folderId).map((g) => g.key));
  const titles = new Map(groups.map((g) => [g.key, g.title]));
  const body = () => groups.map((g) => {
    const f = g.folderId ? model.folders.find((x) => x.id === g.folderId) : null;
    const checked = on.has(g.key);
    const thumb = f ? folderThumb(f) : `<span class="fm-thumb" style="--c:${FOLDER_HEX.default}">${icon('plus')}</span>`;
    return `<section class="fm-wz${checked ? '' : ' off'}"><div class="fm-wz-h"><button class="fm-lrow ${checked ? 'on' : ''}" data-wz="${esc(g.key)}" role="checkbox" aria-checked="${checked}" aria-label="이 제안 쓰기"><span class="fm-cb"></span></button>${thumb}
      <div class="fm-wz-t"><b>${esc(titles.get(g.key))} <small>${f ? '(있는 폴더)' : '(새 폴더)'}</small></b><small>봇 ${g.ids.length}개${f ? ' 추가' : ''}</small></div>
      ${f ? '' : `<button class="fm-btn ghost fm-icon" data-wz-name="${esc(g.key)}" title="새 폴더 이름 바꾸기" aria-label="새 폴더 이름 바꾸기">${icon('edit')}</button>`}<span class="fm-why">${esc(g.why)}</span></div>
      <div class="fm-minis">${g.ids.slice(0, 5).map(miniBot).join('')}${g.ids.length > 5 ? `<span class="fm-mini more">+${g.ids.length - 5}개 더</span>` : ''}</div></section>`;
  }).join('') || `<div class="fm-empty">${model.root.length ? '묶을 만한 봇을 찾지 못했습니다. 다른 기준을 골라 보세요' : '폴더 밖 봇이 없습니다'}</div>`;
  const summary = () => {
    const picked = groups.filter((g) => on.has(g.key));
    const fresh = picked.filter((g) => !g.folderId).length;
    const bots = picked.reduce((n, g) => n + g.ids.length, 0);
    return picked.length ? `${fresh ? `폴더 ${fresh}개 새로 만들고 ` : ''}봇 ${bots}개 옮김 · 남는 폴더 밖 봇 ${model.root.length - bots}개` : '고른 제안이 없습니다';
  };
  const modes = [['name', '이름'], ['creator', '제작자'], ['tag', '태그']];
  const act = await openModal(
    `<h3 id="fm-dialog-title">${icon('wand')} 정리 마법사</h3>
     <p class="fm-desc">폴더 밖 봇 ${model.root.length}개를 묶어 폴더를 제안합니다. 체크한 제안만 적용하고, 적용한 뒤에도 「되돌리기」로 한 번에 돌아올 수 있습니다.</p>
     <div class="fm-wz-modes"><span>묶는 기준</span><div class="fm-fav-sort" role="group">${modes.map(([k, t]) => `<button data-wz-mode="${k}" class="${mode === k ? 'on' : ''}" aria-pressed="${mode === k}">${t}</button>`).join('')}</div></div>
     ${unreadNote(model.root, '제안')}
     <div class="fm-wzs" data-rows>${body()}</div>
     <div class="fm-modal-actions"><span class="fm-count-note" data-sum></span><span class="fm-spacer"></span><button class="fm-btn" data-x>취소</button><button class="fm-btn primary" data-ok>적용</button></div>`,
    (modal, close) => {
      modal.classList.add('fm-big');
      const rows = modal.querySelector('[data-rows]');
      const sync = () => { rerender(rows, body()); modal.querySelector('[data-sum]').textContent = summary(); modal.querySelector('[data-ok]').disabled = !groups.some((g) => on.has(g.key)); lazyAvatars(rows); };
      rows.addEventListener('click', async (e) => {
        const t = e.target.closest('[data-wz]');
        if (t) { on.has(t.dataset.wz) ? on.delete(t.dataset.wz) : on.add(t.dataset.wz); sync(); return; }
        const n = e.target.closest('[data-wz-name]');
        if (n) {
          const k = n.dataset.wzName;
          const name = await askText('새 폴더 이름', { value: titles.get(k), confirm: '바꾸기' });
          if (name) titles.set(k, name);
          sync();
        }
      });
      modal.querySelectorAll('[data-wz-mode]').forEach((b) => { b.onclick = () => close({ mode: b.dataset.wzMode }); });
      modal.querySelector('[data-x]').onclick = () => close(null);
      modal.querySelector('[data-ok]').onclick = () => close({ apply: true });
      bindReadAll(modal, close, () => openWizard(mode));
      sync();
    },
  );
  if (!act) return;
  if (act.mode) { if (act.mode !== mode) openWizard(act.mode); else openWizard(mode); return; }
  const picked = groups.filter((g) => on.has(g.key));
  const fresh = picked.filter((g) => !g.folderId).length;
  let skipped = 0;
  await save(`정리 마법사: ${fresh ? `새 폴더 ${fresh}개 · ` : ''}봇 ${picked.reduce((n, g) => n + g.ids.length, 0)}개`, (o) => {
    let out = o;
    skipped = 0;
    const loose = new Set(out.filter((x) => typeof x === 'string'));
    for (const g of picked) {
      const ids = g.ids.filter((id) => loose.has(id));
      if (!ids.length) continue;
      if (g.folderId) {
        // 「있는 폴더에 추가」로 확인한 제안인데 그 사이 폴더가 지워졌으면 새로 만들지 않고 건너뛴다.
        if (!findFolder(out, g.folderId)) { skipped++; continue; }
        out = moveBotsToFolder(out, ids, g.folderId);
      } else out = createFolder(out, titles.get(g.key), ids).order;
      for (const id of ids) loose.delete(id);
    }
    return out;
  });
  if (skipped) toast(`그 사이 지워진 폴더 ${skipped}개에 넣을 제안은 건너뛰었습니다`, { error: true, ms: 5000 });
}

// ── ⑤ 보관함 제안 ──

function archiveFinished() {
  const lid = labelStore.state.opts.finish;
  return lid ? Object.entries(labelStore.state.tags).filter(([, l]) => l.includes(lid)).map(([b]) => b) : [];
}

function archiveList(days, folderId) {
  let list = archiveCandidates(ui.order, roster.chars, { days, archiveId: archiveFolderId(), finished: archiveFinished() });
  if (folderId) {
    const set = new Set(folderId === ROOT ? currentModel().root : currentModel().folders.find((f) => f.id === folderId)?.data || []);
    list = list.filter((x) => set.has(x.id));
  }
  return list;
}

// 첫 화면 띠. 즐겨찾기 봇은 세지 않는다.
function archiveBannerHtml() {
  const a = plusStore.state.archive;
  if (!a.on || ui.reorder || Date.now() < a.snooze) return '';
  const n = archiveList(a.days).filter((x) => !favIsStar(x.id)).length;
  if (n < ARCHIVE_MIN) return '';
  return `<div class="fm-arch-banner"><span class="fm-arch-ic">${icon('box')}</span><div><b>${a.days}일 넘게 대화하지 않았거나 다 본 봇이 ${n}개 있어요</b><small>보관함 폴더로 옮기면 사이드바가 짧아집니다. 채팅은 그대로 남습니다.</small></div>
    <button class="fm-btn" data-act="archive-snooze">나중에</button><button class="fm-btn primary" data-act="archive">골라서 옮기기</button></div>`;
}

async function openArchive(opts = {}) {
  let days = plusStore.state.archive.days;
  const folderId = opts.folder || '';
  let picked = null;
  const folderName = folderId ? (folderId === ROOT ? '폴더 밖' : folderById(folderId)?.name || '폴더') : '';
  const act = await openModal(
    `<h3 id="fm-dialog-title">${icon('box')} 보관함으로 옮길 봇${folderName ? ` · ${esc(folderName)}` : ''}</h3>
     <p class="fm-desc">오래 대화하지 않은 봇${labelStore.state.opts.finish ? `과 「${esc(labelText(labelDef(labelStore.state.opts.finish) || { name: '' }))}」 라벨이 붙은 봇` : ''}입니다. 즐겨찾는 봇은 처음엔 체크되어 있지 않습니다. 보관함 폴더가 없으면 「${ARCHIVE_NAME}」를 만듭니다.</p>
     <div class="fm-wz-modes"><span>기준</span><div class="fm-fav-sort" role="group">${[30, 60, 90].map((d) => `<button data-days="${d}">${d}일</button>`).join('')}</div></div>
     ${unreadNote(orderBotIds(ui.order), '후보')}
     <div class="fm-arch-list" data-rows></div>
     <div class="fm-modal-actions"><span class="fm-count-note" data-sum></span><span class="fm-spacer"></span><button class="fm-btn" data-x>취소</button><button class="fm-btn primary" data-ok>보관함으로</button></div>`,
    (modal, close) => {
      modal.classList.add('fm-big');
      const rows = modal.querySelector('[data-rows]');
      let list = [];
      const draw = () => {
        list = archiveList(days, folderId);
        if (!picked) picked = new Set(list.filter((x) => !favIsStar(x.id)).map((x) => x.id));
        for (const id of [...picked]) if (!list.some((x) => x.id === id)) picked.delete(id);
        rerender(rows, list.map((x) => {
          const on = picked.has(x.id);
          const c = roster.chars.get(x.id);
          const why = x.finished ? `${labelText(labelDef(labelStore.state.opts.finish) || { name: '다 봄' })}${x.days !== null ? ` · ${x.days}일 전` : ''}` : `${x.days}일 전`;
          return `<button class="fm-arch-row${on ? ' on' : ''}" data-arch="${esc(x.id)}" role="checkbox" aria-checked="${on}"><span class="fm-cb"></span>${avatarHtml(c, x.id)}<span class="fm-arch-t"><b>${esc(c.name)}</b><small>${esc(why)} · ${esc(favFolderName(x.id))}${favIsStar(x.id) ? ' · ★ 즐겨찾기' : ''}</small></span></button>`;
        }).join('') || `<div class="fm-empty">${days}일 넘게 대화하지 않은 봇이 없습니다</div>`);
        modal.querySelectorAll('[data-days]').forEach((b) => { const on = +b.dataset.days === days; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
        modal.querySelector('[data-sum]').textContent = `${list.length}개 중 ${picked.size}개 선택`;
        const ok = modal.querySelector('[data-ok]');
        ok.disabled = !picked.size;
        ok.textContent = picked.size ? `${picked.size}개 보관함으로` : '보관함으로';
        lazyAvatars(rows);
      };
      rows.addEventListener('click', (e) => {
        const r = e.target.closest('[data-arch]');
        if (!r) return;
        picked.has(r.dataset.arch) ? picked.delete(r.dataset.arch) : picked.add(r.dataset.arch);
        draw();
      });
      modal.querySelectorAll('[data-days]').forEach((b) => { b.onclick = () => { days = +b.dataset.days; picked = null; draw(); }; });
      modal.querySelector('[data-x]').onclick = () => close(null);
      modal.querySelector('[data-ok]').onclick = () => close([...picked]);
      bindReadAll(modal, close, () => openArchive(opts));
      draw();
    },
  );
  // 기준 일수는 실제로 옮겼을 때만 기억한다(둘러보다 취소하면 그대로).
  if (act && act.length && days !== plusStore.state.archive.days) plusStore.change({ k: 'archive', set: { days } }).catch(() => {});
  if (act && act.length) await archiveMove(act, `보관함으로 ${act.length}개`);
}

async function archiveSnooze() {
  await plusStore.change({ k: 'archive', set: { snooze: Date.now() + 7 * DAY_MS } }).catch(() => {});
  renderMain(true);
  toast('7일 동안 보관함 제안을 띄우지 않습니다. 설정에서 끌 수도 있습니다');
}

// ── ⑥ 폴더 그림 한 번에 ──

function templateRank(name) {
  return TEMPLATES.map((t, i) => [t, templateScore(t, name), i]).sort((a, b) => b[1] - a[1] || a[2] - b[2]);
}

async function openBatchIcons() {
  const folders = currentModel().folders.filter((f) => !f.imgFile);
  if (!folders.length) { toast('모든 폴더에 그림이 있습니다'); return; }
  const pick = new Map();
  const on = new Set();
  const alts = new Map();
  for (const f of folders) {
    const ranked = templateRank(f.name);
    const good = ranked.filter((r) => r[1] > 0).map((r) => r[0]);
    const list = [...good, ...TEMPLATES.filter((t) => t.cat === '관리' && !good.includes(t))].slice(0, 4);
    alts.set(f.id, list);
    pick.set(f.id, list[0]);
    if (good.length) on.add(f.id);
  }
  let withText = false;
  const body = () => folders.map((f) => {
    const t = pick.get(f.id);
    const checked = on.has(f.id);
    return `<div class="fm-bi${checked ? '' : ' off'}"><button class="fm-lrow ${checked ? 'on' : ''}" data-bi="${esc(f.id)}" role="checkbox" aria-checked="${checked}" aria-label="${esc(f.name)} 적용"><span class="fm-cb"></span></button>
      <div class="fm-bi-row">${folderThumb(f)}<span class="fm-bi-arrow">→</span><span class="fm-thumb fm-bi-new"><img src="${t.thumb}" alt=""></span></div>
      <b>${esc(f.name || '이름 없음')}</b>
      <div class="fm-bi-alts">${alts.get(f.id).map((a) => `<button class="${a === t ? 'on' : ''}" data-bi-alt="${esc(f.id)}" data-slug="${a.slug}" title="${esc(a.name)}"><img src="${a.thumb}" alt="${esc(a.name)}"></button>`).join('')}</div></div>`;
  }).join('');
  const act = await openModal(
    `<h3 id="fm-dialog-title">${icon('image')} 폴더 그림 한 번에</h3>
     <p class="fm-desc">그림 없는 폴더 ${folders.length}개에 이름에 어울리는 템플릿을 추천합니다. 아래 작은 그림으로 다른 후보를 고를 수 있고, 체크한 폴더만 그림을 받아 저장합니다.</p>
     <div class="fm-set-row"><div><b>글씨도 폴더 이름으로</b><small>종이판이 있는 템플릿은 폴더 이름(8자까지)을 새로 씁니다</small></div>${favSwitchHtml(false, 'data-bi-text', '글씨도 폴더 이름으로')}</div>
     <div class="fm-bis" data-rows>${body()}</div>
     <p class="fm-note" data-progress hidden></p>
     <div class="fm-modal-actions"><span class="fm-count-note" data-sum></span><span class="fm-spacer"></span><button class="fm-btn" data-x>취소</button><button class="fm-btn primary" data-ok>적용</button></div>`,
    (modal, close) => {
      modal.classList.add('fm-big');
      const rows = modal.querySelector('[data-rows]');
      let busy = false;
      const sync = () => {
        rerender(rows, body());
        modal.querySelector('[data-sum]').textContent = `${on.size}개 적용 · 그림 ${on.size}장 받기`;
        modal.querySelector('[data-ok]').disabled = !on.size || busy;
        lazyAvatars(rows);
      };
      rows.addEventListener('click', (e) => {
        if (busy) return;
        const c = e.target.closest('[data-bi]');
        if (c) { on.has(c.dataset.bi) ? on.delete(c.dataset.bi) : on.add(c.dataset.bi); sync(); return; }
        const a = e.target.closest('[data-bi-alt]');
        if (a) { pick.set(a.dataset.biAlt, TEMPLATES.find((t) => t.slug === a.dataset.slug)); on.add(a.dataset.biAlt); sync(); }
      });
      const sw = modal.querySelector('[data-bi-text]');
      sw.onclick = () => { withText = !withText; sw.classList.toggle('on', withText); sw.setAttribute('aria-checked', String(withText)); };
      modal.querySelector('[data-x]').onclick = () => { if (!busy) close(null); };
      modal.querySelector('[data-ok]').onclick = async () => {
        if (busy) return;
        busy = true;
        sync();
        const prog = modal.querySelector('[data-progress]');
        prog.hidden = false;
        const done = new Map();
        const todo = folders.filter((f) => on.has(f.id));
        try {
          for (const [i, f] of todo.entries()) {
            prog.textContent = `그림 받는 중 ${i + 1} / ${todo.length} · ${f.name || ''}`;
            const t = pick.get(f.id);
            const bytes = withText && t.editable !== false && t.signs?.length
              ? await canvasBytes(await composeSign(t, [...(f.name || '')].slice(0, SIGN_MAX).join('') || t.name))
              : await fetchTemplateFile(`${t.slug}.webp`);
            const path = await Risuai.saveAsset(bytes);
            if (!path) throw new Error('그림을 저장하지 못했습니다');
            done.set(f.id, path);
          }
          close(done);
        } catch (err) {
          toastError(err);
          if (done.size) close(done);
          else { busy = false; prog.hidden = true; sync(); }
        }
      };
      sync();
    },
  );
  if (!act || !act.size) return;
  let kept = 0;
  await save(`폴더 그림 ${act.size}개`, (o) => {
    let out = o;
    kept = 0;
    for (const [fid, path] of act) {
      const ref = findFolder(out, fid);
      // 그 사이 다른 곳에서 그림을 넣은 폴더는 덮어쓰지 않는다.
      if (!ref) continue;
      if (ref.folder.imgFile) { kept++; continue; }
      out = updateFolder(out, fid, { imgFile: path });
    }
    return out;
  });
  if (kept) toast(`그 사이 그림이 생긴 폴더 ${kept}개는 그대로 두었습니다`, { ms: 5000 });
}

// ── ⑨ 통계 ──

async function openStats() {
  const s = folderStats(ui.order, roster.chars);
  const max = Math.max(1, ...s.rows.map((r) => r.total), s.root.total);
  const bar = (key, name, color, r) => `<button class="fm-stat-row" data-stat="${esc(key)}" title="안 쓴 봇 보기"><span class="fm-stat-n"><i class="fm-dot" style="--c:${color}"></i>${esc(name)}</span>
    <span class="fm-stat-tr"><i class="a" style="width:${(r.active / max) * 100}%"></i><i class="s" style="width:${((r.total - r.active) / max) * 100}%"></i></span><span class="fm-stat-v">${r.active} / ${r.total}</span></button>`;
  const oldest = s.oldest ? `${botName(s.oldest.id) || '…'} (${Math.floor((Date.now() - s.oldest.last) / DAY_MS)}일)` : '—';
  const act = await openModal(
    `<h3 id="fm-dialog-title">${icon('chart')} 통계</h3>
     <div class="fm-stats"><div><small>전체 봇</small><b>${s.total}</b></div><div><small>폴더</small><b>${s.folders}</b></div><div><small>30일 안에 대화</small><b class="ok">${s.active}</b></div><div><small>폴더 밖</small><b class="warn">${s.root.total}</b></div></div>
     ${unreadNote(orderBotIds(ui.order), '통계')}
     <div class="fm-stat-legend"><span><i class="a"></i>30일 안에 대화</span><span><i class="s"></i>안 씀·모름</span><small>막대를 누르면 그 폴더의 오래된 봇을 보관함 후보로 봅니다</small></div>
     <div class="fm-stat-rows">${s.rows.map((r) => bar(r.id, r.name, FOLDER_HEX[r.color] || FOLDER_HEX.default, r)).join('')}${bar(ROOT, '폴더 밖', FOLDER_HEX.default, s.root)}</div>
     <p class="fm-desc fm-stat-foot">가장 많이 쓴 폴더: ${esc(s.top ? s.top.name : '—')} · 가장 오래 묵은 봇: ${esc(oldest)}</p>
     <div class="fm-modal-actions"><button class="fm-btn primary" data-x>닫기</button></div>`,
    (modal, close) => {
      modal.classList.add('fm-big');
      modal.querySelector('[data-x]').onclick = () => close(null);
      modal.querySelectorAll('[data-stat]').forEach((b) => { b.onclick = () => close(b.dataset.stat); });
      bindReadAll(modal, close, openStats);
    },
  );
  if (act) openArchive({ folder: act });
}

// ── ⑦ 명령 창 ──

const PALETTE_CMDS = [
  ['create-folder', 'plus', '새 폴더'],
  ['wizard', 'wand', '정리 마법사'],
  ['dups', 'copy', '중복 봇 찾기'],
  ['archive', 'box', '보관함 정리'],
  ['snapshots', 'history', '배치 기록'],
  ['icons', 'image', '폴더 그림 한 번에'],
  ['stats', 'chart', '통계'],
  ['check', 'scan', '정리 점검'],
  ['fav-view', 'star', '즐겨찾는 봇'],
  ['reorder', 'move', '순서 편집'],
  ['sidebar', 'sidebar', '사이드바 배열'],
  ['settings', 'gear', '설정 · 테마'],
  ['reload', 'refresh', '새로 불러오기'],
];

function paletteBotActions(id) {
  const f = currentModel().folders.find((x) => x.data.includes(id));
  return [
    ['locate', 'locate', '사이드바에서 찾기'],
    ['move', 'folder', '다른 폴더로 옮기기…'],
    ['star', 'star', favIsStar(id) ? '즐겨찾기 해제' : '즐겨찾기에 추가'],
    ['label', 'tag', '라벨 붙이기…'],
    ...(f ? [['open', 'layers', `「${f.name || '폴더'}」 열기`]] : []),
  ];
}

async function openPalette() {
  if (!ui.app || ui.reorder || document.querySelector('.fm-modal-back')) return;
  const st = { q: '', sel: 0, bot: null, items: [] };
  const build = () => {
    const q = st.q.trim().toLowerCase();
    const items = [];
    if (st.bot) {
      for (const [a, i, t] of paletteBotActions(st.bot)) items.push({ kind: 'act', id: a, icon: i, text: t });
      return items;
    }
    const ids = [...new Set(orderBotIds(ui.order))];
    const bots = q ? ids.filter((id) => botName(id).toLowerCase().includes(q)).slice(0, 8) : recentRank(ids, recentStore.state.list, roster.chars, { count: 5 });
    for (const id of bots) items.push({ kind: 'bot', id, text: botName(id) || '…', sub: favFolderName(id) });
    const folders = currentModel().folders.filter((f) => !q || (f.name || '').toLowerCase().includes(q)).slice(0, q ? 5 : 0);
    for (const f of folders) items.push({ kind: 'folder', id: f.id, text: f.name || '이름 없음', sub: `봇 ${f.data.length}개` });
    for (const [a, i, t] of PALETTE_CMDS) if (!q || t.toLowerCase().includes(q)) items.push({ kind: 'cmd', id: a, icon: i, text: t });
    return items;
  };
  const group = { bot: q => (q ? '봇' : '최근 대화'), folder: () => '폴더', cmd: () => '명령', act: () => `「${botName(st.bot) || '봇'}」에 할 일` };
  const draw = (modal) => {
    st.items = build();
    st.sel = Math.max(0, Math.min(st.sel, st.items.length - 1));
    let last = '';
    modal.querySelector('[data-list]').innerHTML = st.items.map((it, i) => {
      const g = group[it.kind](st.q.trim());
      const head = g !== last ? `<div class="fm-pal-g">${esc(g)}</div>` : '';
      last = g;
      const lead = it.kind === 'bot' ? avatarHtml(roster.chars.get(it.id), it.id) : it.kind === 'folder' ? folderThumb(folderById(it.id) || {}) : `<span class="fm-thumb plain">${icon(it.icon)}</span>`;
      return `${head}<div class="fm-pal-op${i === st.sel ? ' on' : ''}" data-i="${i}" role="option" aria-selected="${i === st.sel}">${lead}<b>${esc(it.text)}</b>${it.sub ? `<small>${esc(it.sub)}</small>` : ''}${i === st.sel && it.kind === 'bot' ? '<em>Enter 찾기 · Tab 할 일</em>' : ''}</div>`;
    }).join('') || '<div class="fm-empty">맞는 것이 없습니다</div>';
    modal.querySelector('[data-list] .on')?.scrollIntoView?.({ block: 'nearest' });
    lazyAvatars(modal.querySelector('[data-list]'));
    const input = modal.querySelector('input');
    input.placeholder = st.bot ? `「${botName(st.bot) || '봇'}」에 할 일 · Backspace 뒤로` : '봇·폴더·명령 검색';
  };
  const run = await openModal(
    `<div class="fm-pal"><label class="fm-pal-in">${icon('command')}<input type="text" aria-label="명령 검색" autocomplete="off" spellcheck="false"></label>
     <div class="fm-pal-list" data-list role="listbox"></div>
     <div class="fm-pal-ft"><span>↑↓ 이동</span><span>Enter 실행</span><span>Tab 봇에 할 일</span><span>Esc 닫기</span></div></div>`,
    (modal, close) => {
      modal.classList.add('fm-palette');
      const input = modal.querySelector('input');
      const pick = (i) => {
        const it = st.items[i];
        if (!it) return;
        if (it.kind === 'act') close({ act: it.id, bot: st.bot });
        else close(it);
      };
      input.addEventListener('input', () => { st.q = input.value; st.sel = 0; draw(modal); });
      input.addEventListener('keydown', (e) => {
        if (e.isComposing) return;
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); st.sel = (st.sel + (e.key === 'ArrowDown' ? 1 : -1) + st.items.length) % Math.max(1, st.items.length); draw(modal); return; }
        if (e.key === 'Enter') { e.preventDefault(); pick(st.sel); return; }
        if (e.key === 'Tab') {
          e.preventDefault();
          const it = st.items[st.sel];
          if (!st.bot && !e.shiftKey && it && it.kind === 'bot') { st.bot = it.id; st.qSaved = st.q; st.q = ''; input.value = ''; st.sel = 0; draw(modal); }
          else if (st.bot && e.shiftKey) { st.bot = null; st.q = st.qSaved || ''; input.value = st.q; st.sel = 0; draw(modal); }
          return;
        }
        if (e.key === 'Backspace' && st.bot && !input.value) { e.preventDefault(); st.bot = null; st.q = st.qSaved || ''; input.value = st.q; st.sel = 0; draw(modal); return; }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); e.stopPropagation(); close(null); }
      });
      modal.querySelector('[data-list]').addEventListener('click', (e) => {
        const op = e.target.closest('[data-i]');
        if (!op) return;
        const it = st.items[+op.dataset.i];
        if (it && it.kind === 'bot' && !st.bot && e.target.closest('em')) { st.bot = it.id; st.q = ''; input.value = ''; st.sel = 0; draw(modal); return; }
        pick(+op.dataset.i);
      });
      draw(modal);
      input.focus(); // 바로 이어 친 글자도 받도록 기다리지 않고 포커스
    },
  );
  if (!run) return;
  if (run.kind === 'cmd') { ACTIONS[run.id]?.(); return; }
  if (run.kind === 'folder') { openView(run.id); return; }
  if (run.kind === 'bot') { locateBot(run.id); return; }
  if (run.act) {
    const id = run.bot;
    if (run.act === 'locate') locateBot(id);
    else if (run.act === 'move') {
      const target = await pickFolder('봇 옮기기', { mode: 'move', ids: [id] });
      if (target === '__new__') { ui.selected = new Set([id]); newFolderFromSelection(); }
      else if (target) save(`${botName(id) || '봇'} → ${folderById(target)?.name || '폴더'}`, (o) => moveBotsToFolder(o, [id], target));
    } else if (run.act === 'star') favToggleStar(id);
    else if (run.act === 'label') openLabelPicker([id]);
    else if (run.act === 'open') { const f = currentModel().folders.find((x) => x.data.includes(id)); if (f) openView(f.id); }
  }
}

const PLUS_CSS = `
.fm-modal.fm-big{width:min(760px,100%)}
.fm-badge{display:inline-block;font-size:11px;font-weight:600;padding:1px 8px;border-radius:999px;background:var(--accent-bg);color:var(--accent-2);vertical-align:1px}
.fm-badge.warn{background:#3a2a14;color:#f0b860}
.fm-count-note{font-size:12px;color:var(--muted)}
.fm-modal-actions .fm-spacer{flex:1}
.fm-cb{width:16px;height:16px;border-radius:5px;border:1.5px solid var(--line-2);display:inline-grid;place-items:center;flex:none;background:var(--bg)}
.on>.fm-cb,.fm-lrow.on .fm-cb{background:var(--accent);border-color:var(--accent)}
.on>.fm-cb::after,.fm-lrow.on .fm-cb::after{content:"";width:8px;height:4px;border:2px solid var(--button-text,#fff);border-top:0;border-right:0;transform:translateY(-1px) rotate(-45deg)}
.fm-lrow.some .fm-cb{background:var(--accent-bg);border-color:var(--accent)}
.fm-lrow.some .fm-cb::after{content:"";width:8px;height:2px;background:var(--accent-2)}
.fm-lrows{display:grid;gap:4px;margin-bottom:8px}
.fm-lrow{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:10px;text-align:left;color:var(--text)}
.fm-lrows .fm-lrow{border:1px solid var(--line);background:var(--surface)}
.fm-lrow:hover{background:var(--surface-2)}
.fm-lrow small{margin-left:auto;font-size:11px;color:var(--faint)}
.fm-lbl{display:inline-flex;align-items:center;gap:3px;font-size:10.5px;line-height:16px;padding:0 6px;border-radius:999px;background:color-mix(in srgb,var(--c) 28%,transparent);color:color-mix(in srgb,var(--c) 45%,#fff);white-space:nowrap}
:root:is([data-fm-theme=mint],[data-fm-theme=blue]) .fm-lbl{background:color-mix(in srgb,var(--c) 18%,#fff);color:color-mix(in srgb,var(--c) 75%,#000)}
.fm-lbl.new{--c:#5f6779}
.fm-lrows .fm-lbl{font-size:12px;line-height:20px;padding:0 9px}
.fm-meta .fm-lbls{display:inline-flex;gap:3px;overflow:hidden;flex:0 0 auto;max-width:72%}
.fm-tagbtn{width:26px;height:28px;border-radius:8px;display:grid;place-items:center;color:var(--faint);opacity:0;transition:opacity .12s,background-color .12s}
.fm-tagbtn .fm-i{width:15px;height:15px}
.fm-tagbtn.on{opacity:.8;color:var(--accent-2)}
.fm-card:hover .fm-tagbtn,.fm-card:focus-within .fm-tagbtn,.fm-tagbtn:focus-visible{opacity:1}
.fm-tagbtn:hover{background:var(--surface-2);color:var(--accent-2)}
.fm-app.is-reorder .fm-tagbtn{display:none}
@media (hover:none){.fm-tagbtn{display:none}.fm-tagbtn.on{display:grid;opacity:.8}}
.fm-lbl-dot{color:var(--c);font-size:14px}
.fm-lbl-dot i{width:10px;height:10px;border-radius:50%;background:var(--c)}
.fm-lbl-head{padding-left:4px}
.fm-rail-fold{display:inline-flex;align-items:center;gap:5px;padding:3px 6px;border-radius:6px;font:inherit;letter-spacing:inherit;color:inherit}
.fm-rail-fold:hover{background:var(--surface-2);color:var(--text)}
.fm-rail-fold .fm-i{width:12px;height:12px;transition:transform .15s}
.fm-rail-fold.folded .fm-i{transform:rotate(-90deg)}
.fm-rail-fold i{font-style:normal;font-weight:600;padding:0 6px;border-radius:999px;background:var(--surface-2);color:var(--muted)}
.fm-lbl-chip.folded{border:1px dashed var(--line-2)}
@media (prefers-reduced-motion:reduce){.fm-rail-fold .fm-i{transition:none}}
.fm-rail-add{width:20px;height:20px;border-radius:6px;display:grid;place-items:center;color:var(--faint)}
.fm-rail-add:hover{background:var(--surface-2);color:var(--text)}
.fm-rail-add .fm-i{width:13px;height:13px}
.fm-lab-edit{display:flex;gap:8px;margin-top:10px}
.fm-modal .fm-lab-emoji{width:64px;text-align:center;font-size:18px}
.fm-chips{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 10px}
.fm-chips button{font-size:12px;padding:5px 10px;border-radius:999px;border:1px solid var(--line-2);color:var(--muted);background:var(--surface)}
.fm-chips button.on{border-color:var(--accent);background:var(--accent-bg);color:var(--text);font-weight:650}
.fm-sub-row{padding-left:14px}
.fm-sub-row.dim{opacity:.45}
.fm-snaps{display:grid;gap:8px;position:relative;padding-left:18px}
.fm-snaps::before{content:"";position:absolute;left:6px;top:10px;bottom:10px;width:2px;background:var(--line-2)}
.fm-snap{position:relative;display:flex;gap:12px;align-items:center;padding:10px 12px;border-radius:12px;background:var(--surface);border:1px solid var(--line)}
.fm-snap::before{content:"";position:absolute;left:-17px;top:16px;width:10px;height:10px;border-radius:50%;background:var(--bg);border:2px solid var(--accent)}
.fm-snap.cur::before{background:var(--accent)}
.fm-snap.ext::before{border-color:#e0a63a}
.fm-snap-text{flex:1;min-width:0}
.fm-snap-text b{font-size:13px}
.fm-snap-text small{display:block;font-size:11.5px;color:var(--muted)}
.fm-diff{font-size:11.5px;color:var(--muted);margin-top:2px}
.fm-diff .p{color:var(--ok)}.fm-diff .m{color:var(--danger)}
.fm-snap-acts{display:flex;gap:6px;flex:none}
.fm-dupes,.fm-wzs{display:grid;gap:10px}
.fm-dupe{border:1px solid var(--line);border-radius:12px;overflow:hidden}
.fm-dupe-h{display:flex;align-items:center;gap:10px;padding:9px 12px;background:var(--surface)}
.fm-dupe-h b{font-size:13.5px}
.fm-dupe-h small{color:var(--faint);font-size:11.5px}
.fm-dupe-h .fm-link{margin-left:auto}
.fm-dupe-row{display:grid;grid-template-columns:auto minmax(0,1.4fr) minmax(0,1fr) auto auto;align-items:center;gap:10px;padding:6px 12px;border-top:1px solid var(--line);font-size:12.5px}
.fm-dupe-row .fm-lrow{padding:4px}
.fm-dupe-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fm-dupe-where{display:inline-flex;align-items:center;gap:4px;color:var(--muted);overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.fm-dupe-where .fm-i{width:13px;height:13px;flex:none}
.fm-dupe-last{color:var(--faint);font-size:11.5px;white-space:nowrap}
.fm-btn.fm-sm{height:28px;padding:0 9px;font-size:11.5px}
.fm-btn.fm-sm .fm-i{width:13px;height:13px}
.fm-wz-modes{display:flex;align-items:center;gap:10px;margin:0 0 12px;font-size:12px;color:var(--muted)}
.fm-wz{padding:10px 12px;border-radius:12px;background:var(--surface);border:1px solid var(--line)}
.fm-wz.off{opacity:.55}
.fm-wz-h{display:flex;align-items:center;gap:10px;margin-bottom:8px}
.fm-wz-h .fm-lrow{padding:4px}
.fm-wz-h .fm-thumb{width:38px;height:38px;border-radius:11px}
.fm-wz-t{flex:1;min-width:0}
.fm-wz-t b{display:block;font-size:13.5px}.fm-wz-t b small{font-weight:400;color:var(--faint);font-size:11.5px}
.fm-wz-t>small{display:block;color:var(--faint);font-size:11.5px}
.fm-why{font-size:11px;color:var(--accent-2);background:var(--accent-bg);padding:2px 8px;border-radius:999px;white-space:nowrap}
.fm-minis{display:flex;flex-wrap:wrap;gap:4px}
.fm-mini{display:inline-flex;align-items:center;gap:5px;padding:3px 9px 3px 3px;border-radius:999px;background:var(--surface-2);font-size:11.5px;max-width:180px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.fm-mini.more{padding:3px 9px;color:var(--muted)}
.fm-av.sm{width:20px;height:20px;border-radius:50%;font-size:9px;flex:none}
.fm-arch-banner{display:flex;align-items:center;gap:12px;padding:10px 12px;margin:0 0 14px;border-radius:12px;border:1px solid #5a4020;background:#1f1b14}
.fm-arch-banner div{flex:1;min-width:0}
.fm-arch-banner b{display:block;font-size:13px}
.fm-arch-banner small{display:block;font-size:11.5px;color:var(--muted)}
.fm-arch-ic{color:#e0a63a;display:grid}.fm-arch-ic .fm-i{width:24px;height:24px}
:root:is([data-fm-theme=mint],[data-fm-theme=blue]) .fm-arch-banner{background:#fff6e6;border-color:#e2c48c}
.fm-arch-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:6px;max-height:min(52vh,460px);overflow:auto;padding:2px}
.fm-arch-row{display:flex;align-items:center;gap:9px;height:48px;padding:0 10px;border-radius:11px;background:var(--surface);border:1px solid var(--line);text-align:left}
.fm-arch-row.on{border-color:var(--accent)}
.fm-arch-t{min-width:0;flex:1}
.fm-arch-t b{display:block;font-size:12.5px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.fm-arch-t small{display:block;font-size:11px;color:var(--faint);overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.fm-bis{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin-top:8px}
.fm-bi{position:relative;padding:10px;border-radius:12px;background:var(--surface);border:1px solid var(--line);text-align:center}
.fm-bi.off{opacity:.55}
.fm-bi>.fm-lrow{position:absolute;top:4px;left:4px;padding:4px}
.fm-bi-row{display:flex;align-items:center;justify-content:center;gap:6px;margin:6px 0}
.fm-bi-row .fm-thumb{width:44px;height:44px;border-radius:12px}
.fm-bi-new{background:transparent;overflow:hidden}
.fm-bi-new img{width:100%;height:100%;object-fit:cover}
.fm-bi-arrow{color:var(--faint)}
.fm-bi b{font-size:12.5px;display:block;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.fm-bi-alts{display:flex;justify-content:center;gap:4px;margin-top:6px}
.fm-bi-alts button{width:26px;height:26px;border-radius:7px;overflow:hidden;border:1px solid var(--line-2);padding:0}
.fm-bi-alts button.on{outline:2px solid var(--accent);outline-offset:1px}
.fm-bi-alts img{width:100%;height:100%;object-fit:cover;display:block}
.fm-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:10px 0 12px}
.fm-stats div{padding:10px 12px;border-radius:12px;background:var(--surface);border:1px solid var(--line)}
.fm-stats small{font-size:11.5px;color:var(--faint)}
.fm-stats b{display:block;font-size:22px;margin-top:2px}
.fm-stats b.ok{color:var(--ok)}.fm-stats b.warn{color:#e0a63a}
.fm-stat-legend{display:flex;flex-wrap:wrap;align-items:center;gap:12px;font-size:11.5px;color:var(--muted);margin-bottom:6px}
.fm-stat-legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px;vertical-align:-1px}
.fm-stat-legend small{margin-left:auto;color:var(--faint)}
.fm-stat-rows{display:grid;gap:2px;max-height:min(46vh,420px);overflow:auto}
.fm-stat-row{display:grid;grid-template-columns:140px 1fr 64px;align-items:center;gap:10px;padding:5px 6px;border-radius:8px;text-align:left}
.fm-stat-row:hover{background:var(--surface)}
.fm-stat-n{display:flex;align-items:center;gap:6px;font-size:12px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.fm-stat-tr{display:flex;height:12px;border-radius:4px;overflow:hidden;background:var(--surface-2)}
.fm-stat-tr i{display:block}
.fm-stat-tr .a,.fm-stat-legend .a{background:var(--accent)}
.fm-stat-tr .s,.fm-stat-legend .s{background:var(--line-2)}
.fm-stat-v{text-align:right;font-size:11.5px;color:var(--muted)}
.fm-stat-foot{margin-top:10px}
.fm-modal-back:has(.fm-palette){place-items:start center;padding-top:9vh}
.fm-modal.fm-palette{width:min(560px,100%);padding:0;overflow:hidden}
.fm-pal-in{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--line)}
.fm-pal-in .fm-i{color:var(--faint)}
.fm-pal-in input{flex:1;min-width:0;border:0;outline:none;background:transparent;font-size:15px}
.fm-pal-list{max-height:min(56vh,420px);overflow:auto;padding:4px 0}
.fm-pal-g{font-size:11px;color:var(--faint);padding:10px 16px 4px}
.fm-pal-op{display:flex;align-items:center;gap:10px;padding:7px 16px;cursor:pointer}
.fm-pal-op.on{background:var(--accent-bg)}
.fm-pal-op .fm-av,.fm-pal-op .fm-thumb{width:26px;height:26px;border-radius:7px;font-size:10px}
.fm-pal-op .fm-thumb .fm-i{width:15px;height:15px}
.fm-pal-op b{font-size:13px;font-weight:600;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.fm-pal-op small{color:var(--faint);font-size:11.5px;white-space:nowrap}
.fm-pal-op em{margin-left:auto;font-style:normal;font-size:11px;color:var(--faint);white-space:nowrap}
.fm-pal-ft{display:flex;flex-wrap:wrap;gap:14px;padding:8px 16px;border-top:1px solid var(--line);font-size:11px;color:var(--faint)}
/* 마우스: 봇 칸 버튼은 이름 위에 겹쳐 띄우고(자리 차지 안 함), 켜진 별·라벨만 늘 보인다 */
@media (hover:hover){
  .fm-card,.view-list .fm-card{grid-template-columns:34px minmax(0,1fr)}
  .view-list .fm-card{grid-template-columns:30px minmax(0,1fr)}
  .fm-acts{position:absolute;right:4px;top:50%;transform:translateY(-50%);padding-left:16px;background:linear-gradient(90deg,transparent,var(--surface) 16px);border-radius:0 9px 9px 0}
  .fm-card.sel .fm-acts{background:linear-gradient(90deg,transparent,var(--accent-bg) 16px)}
  .fm-acts>*{display:none}
  .fm-acts>.on,.fm-card:hover .fm-acts>*,.fm-card:focus-within .fm-acts>*{display:grid}
  .fm-card:not(:hover):not(:focus-within) .fm-acts:not(:has(>.on)){display:none}
  .fm-app.is-reorder .fm-acts{display:none}
}
.fm-kbd{font-size:10.5px;padding:0 5px;border-radius:5px;border:1px solid var(--line-2);color:var(--faint);margin-left:4px}
.fm-search .fm-kbd{position:absolute;right:8px;top:50%;transform:translateY(-50%);margin:0;line-height:18px;background:var(--surface)}
.fm-search .fm-kbd:hover{color:var(--text);border-color:var(--accent)}
.fm-top .fm-search input{padding-right:58px}
.fm-search:focus-within .fm-kbd{display:none}
@media (max-width:640px){
  .fm-stats{grid-template-columns:repeat(2,1fr)}
  .fm-stat-row{grid-template-columns:96px 1fr 54px}
  .fm-dupe-row{grid-template-columns:auto minmax(0,1fr) auto;row-gap:2px}
  .fm-dupe-where,.fm-dupe-last{grid-column:2}
  .fm-snap{flex-wrap:wrap}.fm-snap-acts{width:100%;justify-content:flex-end}
  .fm-arch-banner{flex-wrap:wrap}.fm-arch-banner .fm-btn{flex:1}
  .fm-pal-ft{display:none}
}
`;

// 설정 창의 보관함 칸.
function archiveSettingsHtml(d) {
  return `<span class="fm-label">보관함 제안</span>
     <div class="fm-set-row"><div><b>📦 오래된 봇 보관함 제안</b><small>첫 화면 위에 한 줄 띠로 알려 주기만 합니다. 자동으로 옮기지 않습니다.</small></div>${favSwitchHtml(d.archOn, 'data-arch-on', '보관함 제안 켜기/끄기')}</div>
     <div class="fm-set-row fm-sub-row" data-arch-only><div><b>기준</b><small>이 기간 넘게 대화하지 않은 봇</small></div><div class="fm-fav-sort" role="group">${[30, 60, 90].map((n) => `<button data-arch-days="${n}">${n}일</button>`).join('')}</div></div>`;
}

function archiveSettingsBind(modal, d) {
  const sync = () => {
    const sw = modal.querySelector('[data-arch-on]');
    sw.classList.toggle('on', d.archOn);
    sw.setAttribute('aria-checked', String(d.archOn));
    modal.querySelectorAll('[data-arch-only]').forEach((el) => el.classList.toggle('dim', !d.archOn));
    modal.querySelectorAll('[data-arch-days]').forEach((b) => { const on = +b.dataset.archDays === d.archDays; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
  };
  modal.querySelector('[data-arch-on]').onclick = () => { d.archOn = !d.archOn; sync(); };
  modal.querySelectorAll('[data-arch-days]').forEach((b) => { b.onclick = () => { d.archDays = +b.dataset.archDays; sync(); }; });
  sync();
}

async function archiveSettingsSave(d) {
  const a = plusStore.state.archive;
  if (d.archOn !== a.on || d.archDays !== a.days) await plusStore.change({ k: 'archive', set: { on: d.archOn, days: d.archDays, snooze: d.archOn && !a.on ? 0 : a.snooze } });
}

// ── src/ui/app.js ──
// 관리 화면. 상태(ui) → render() 로 다시 그리고, 이벤트는 루트에 한 번만 단다.

const ROOT = '__root__';
const VIEW_ALL = '__all__';
const VIEW_STARS = '__favorites__';
const PREFS_KEY = 'risuFolderMaster.ui';

const ui = {
  chars: roster.chars,
  order: [],
  view: VIEW_ALL,
  display: 'tiles',
  query: '',
  selected: new Set(),
  anchor: null,
  visible: [],
  reorder: null,
  grid: normalizeGrid(null),
  observer: null,
  cardObserver: null,
  prefs: null,
  app: null,
};

// ── 데이터 모양 ──

function currentModel() {
  const folders = [];
  const root = [];
  if (ui.reorder) {
    const meta = new Map(ui.order.filter(isFolder).map((f) => [f.id, f]));
    for (const f of ui.reorder.layout.folders) folders.push({ ...meta.get(f.id), data: f.data });
    root.push(...ui.reorder.layout.root);
  } else {
    for (const item of ui.order) {
      if (isFolder(item)) folders.push(item);
      else if (typeof item === 'string') root.push(item);
    }
  }
  return { folders, root };
}

function folderById(id) {
  return currentModel().folders.find((f) => f.id === id) || null;
}

function botName(id) {
  return roster.chars.get(id)?.name || (roster.missing.has(id) ? '(없는 봇)' : '');
}

function matches(id) {
  if (!ui.query) return true;
  return botName(id).toLowerCase().includes(ui.query);
}

// ── 조각 ──

function folderThumb(folder, cls = '') {
  const color = FOLDER_HEX[folder.color] || FOLDER_HEX.default;
  const src = folder.imgFile ? avatars.peek(folder.imgFile) : null;
  const inner = src ? `<img src="${esc(src)}" alt="">` : icon('folder');
  const lazy = folder.imgFile && !src ? ` data-src="${esc(folder.imgFile)}"` : '';
  return `<span class="fm-thumb ${cls}" style="--c:${color}"${lazy}>${inner}</span>`;
}

function avatarHtml(c, id) {
  const initial = esc(((c ? c.name : '') || '').match(/[\p{L}\p{N}]/u)?.[0] || '?');
  if (!c || !c.image) return `<div class="fm-av">${initial}</div>`;
  const src = avatars.peek(c.image);
  if (src) return `<div class="fm-av">${initial}<img src="${esc(src)}" alt=""></div>`;
  return `<div class="fm-av" data-src="${esc(c.image)}">${initial}</div>`;
}

function cardHtml(id, container) {
  const c = ui.chars.get(id);
  const meta = [];
  if (c) {
    const t = timeAgo(c.last);
    if (t) meta.push(`<span title="마지막 대화 ${esc(t.full)}">${icon('chat')}${esc(t.short)}</span>`);
    if (c.group) meta.push(`<span title="그룹 채팅">${icon('users')}</span>`);
    if (c.modules) meta.push(`<span class="fm-extra" title="모듈 ${c.modules}개">${icon('puzzle')}${c.modules}</span>`);
    if (c.assets) meta.push(`<span class="fm-extra" title="에셋 ${c.assets}개">${icon('image')}${c.assets}</span>`);
    if (container === VIEW_STARS || isLabelView(container)) meta.unshift(`<span class="fm-fav-where" title="원래 위치">${icon('folder')}${esc(favFolderName(id))}</span>`);
    const lbls = labelChipsHtml(id);
    if (lbls) meta.unshift(`<span class="fm-lbls">${lbls}</span>`);
  } else if (roster.missing.has(id)) meta.push('<span>캐릭터가 지워졌습니다</span>');
  else if (roster.failed.has(id)) meta.push(`<button class="fm-link" data-retry="${esc(id)}">다시 읽기</button>`);
  if (c && roster.failed.has(id)) meta.unshift(`<span class="fm-warn">갱신 실패</span><button class="fm-link" data-retry="${esc(id)}">다시 읽기</button>`);
  const selected = ui.selected.has(id);
  const ghost = !c && roster.missing.has(id);
  const failed = !c && !ghost && roster.failed.has(id);
  const name = c ? c.name : ghost ? '(없는 봇)' : failed ? '읽기 실패' : '불러오는 중…';
  const state = ghost ? ' ghost-bot' : failed ? ' failed' : !c ? ' loading' : '';
  return `<div class="fm-card${selected ? ' sel' : ''}${state}" data-id="${esc(id)}" data-container="${esc(container)}" title="${esc(c ? c.name : id)}" tabindex="0" role="checkbox" aria-checked="${selected}" aria-label="${esc(name)}">
    ${avatarHtml(c, id)}<div class="fm-txt"><div class="fm-name">${esc(name)}</div><div class="fm-meta">${meta.join('')}</div></div>
    <div class="fm-tick">${icon('check')}</div><div class="fm-acts">${c ? `<button class="fm-loc" data-locate="${esc(id)}" title="사이드바에서 찾기" aria-label="사이드바에서 찾기">${icon('locate')}</button>` : ''}${labelButtonHtml(id)}${favStarButton(id)}</div></div>`;
}

function gridHtml(ids, container, emptyText, filter = true) {
  const shown = filter ? ids.filter(matches) : ids;
  ui.visible.push(...shown);
  const body = shown.map((id) => cardHtml(id, container)).join('');
  if (body) return `<div class="fm-grid" data-container="${esc(container)}">${body}</div>`;
  return `<div class="fm-grid" data-container="${esc(container)}"><div class="fm-empty" style="grid-column:1/-1">${esc(emptyText)}</div></div>`;
}

// 첫 화면의 폴더 아이콘. 봇 정보 없이 그릴 수 있게 폴더 자체 정보만 쓴다.
function folderTileHtml(f) {
  const gone = f.data.filter((id) => roster.missing.has(id)).length;
  const count = f.data.length - gone;
  const tip = `${f.name || '이름 없음'} · 봇 ${count}개${gone ? ` · 지워진 자리 ${gone}` : ''}`;
  return `<button class="fm-ftile${f.data.length ? '' : ' empty'}" style="--c:${FOLDER_HEX[f.color] || FOLDER_HEX.default}" data-view="${esc(f.id)}" data-folder="${esc(f.id)}" data-drop="${esc(f.id)}" title="${esc(tip)}" aria-label="${esc(tip)}">
    ${icon('grip', 'fm-grip')}${folderThumb(f)}<span class="fm-fcount">${count}</span><span class="fm-ftile-text"><b>${esc(f.name || '이름 없음')}</b></span>${favIsPin(f.id) ? `<span class="fm-fav-pin" title="고정한 폴더">${icon('star')}</span>` : ''}</button>`;
}

// ── 그리기 ──

function renderRail() {
  const { folders, root } = currentModel();
  const nav = (attrs, thumb, name, count, extra = '') =>
    `<button class="fm-nav${extra}" ${attrs}>${thumb}<span class="fm-nav-name">${esc(name)}</span><span class="fm-nav-count">${count}</span>${icon('grip', 'fm-grip')}</button>`;
  const rows = [
    `<button class="fm-nav fm-mob" data-act="folder-list"><span class="fm-thumb plain">${icon('search')}</span><span class="fm-nav-name">폴더 목록</span></button>`,
    nav(`data-view="${VIEW_ALL}"`, `<span class="fm-thumb plain">${icon('layers')}</span>`, '모든 폴더', folders.length, ui.view === VIEW_ALL ? ' on' : ''),
    nav(`data-view="${ROOT}" data-drop="${ROOT}"`, `<span class="fm-thumb plain">${icon('inbox')}</span>`, '폴더 밖', root.length, ui.view === ROOT ? ' on' : ''),
    favRailHtml({ folders, root }, nav),
    labelRailHtml(nav),
    `<div class="fm-rail-label"><span>폴더 ${folders.length}</span></div>`,
    ...folders.map((f) =>
      nav(`data-view="${esc(f.id)}" data-folder="${esc(f.id)}" data-drop="${esc(f.id)}"`, folderThumb(f), f.name || '이름 없음', f.data.length,
        (ui.view === f.id ? ' on' : '') + (f.data.length ? '' : ' empty'))),
  ];
  ui.app.querySelector('.fm-rail').innerHTML = rows.join('');
}

// 폴더 안 화면의 폴더 아이콘 = 모든 폴더로 돌아가기.
function backButton(thumb) {
  return `<button class="fm-back" data-act="back" title="모든 폴더로" aria-label="모든 폴더로 돌아가기">${thumb}<span class="fm-back-arrow">${icon('back')}</span></button>`;
}

function headHtml(model) {
  if (ui.view === VIEW_STARS) return favHeadHtml();
  if (isLabelView(ui.view)) return labelHeadHtml();

  const all = model.folders.reduce((n, f) => n + f.data.length, 0) + model.root.length;
  const scope = ui.query ? '검색 결과 전체' : ui.view === ROOT ? '폴더 밖 전체' : '이 폴더 전체';
  const selectAll = `<button class="fm-btn" data-act="select-all">${icon('select')}<span class="fm-text">${scope}</span></button>`;
  if (ui.view === VIEW_ALL) {
    return `<span class="fm-thumb plain">${icon('layers')}</span><div class="fm-head-text"><h2>모든 폴더</h2><p>폴더 ${model.folders.length}개 · 봇 ${all}개</p></div>
      <div class="fm-head-actions">${ui.reorder ? '' : `<button class="fm-btn" data-act="create-folder">${icon('plus')}<span class="fm-text">새 폴더</span></button>`}</div>`;
  }
  if (ui.view === ROOT) {
    return `${backButton(`<span class="fm-thumb plain">${icon('inbox')}</span>`)}<div class="fm-head-text"><h2>폴더 밖 봇</h2><p>${model.root.length}개 · 사이드바에서 폴더 아래에 놓입니다</p></div>
      <div class="fm-head-actions">${ui.reorder ? '' : selectAll}</div>`;
  }
  const f = model.folders.find((x) => x.id === ui.view);
  const gone = f.data.filter((id) => roster.missing.has(id)).length;
  // 휴대폰은 아이콘만으로 뜻이 안 보여 꾸미기 도구를 '더보기' 글자 메뉴로 묶는다.
  const tools = ui.reorder ? '' : `${selectAll}
    <button class="fm-btn" data-act="locate-folder" title="사이드바에서 찾기">${icon('locate')}<span class="fm-text">사이드바 찾기</span></button>
    <button class="fm-btn fm-icon fm-desk" data-act="rename" title="이름 바꾸기" aria-label="이름 바꾸기">${icon('edit')}</button>
    <button class="fm-btn fm-icon fm-desk" data-act="color" title="색" aria-label="색 바꾸기">${icon('palette')}</button>
    <button class="fm-btn fm-icon fm-desk" data-act="image" title="폴더 그림" aria-label="폴더 그림 바꾸기">${icon('image')}</button>
    <button class="fm-btn fm-icon fm-desk" data-act="folder-up" title="위로" aria-label="폴더를 위로">${icon('up')}</button>
    <button class="fm-btn fm-icon fm-desk" data-act="folder-down" title="아래로" aria-label="폴더를 아래로">${icon('down')}</button>
    <button class="fm-btn danger fm-desk" data-act="unfold" title="폴더를 지우고 봇은 폴더 밖으로">${icon('unfold')}<span class="fm-text">폴더 삭제</span></button>
    <button class="fm-btn fm-mob" data-act="folder-more">${icon('more')}<span>더보기</span></button>`;
  return `${backButton(folderThumb(f))}<div class="fm-head-text"><h2>${esc(f.name || '이름 없음')}</h2><p>봇 ${f.data.length - gone}개${gone ? ` · 지워진 자리 ${gone}` : ''}</p></div>
    <div class="fm-head-actions">${tools}</div>`;
}

function renderMain(keepScroll) {
  const model = currentModel();
  const labelOk = isLabelView(ui.view) && (ui.view === VIEW_LABEL + LABEL_NEW || !!labelDef(ui.view.slice(VIEW_LABEL.length)));
  if (ui.view !== VIEW_ALL && ui.view !== ROOT && ui.view !== VIEW_STARS && !labelOk && !model.folders.some((f) => f.id === ui.view)) ui.view = VIEW_ALL;
  ui.visible = [];
  const head = ui.app.querySelector('.fm-head');
  head.innerHTML = headHtml(model);
  head.classList.toggle('compact', ui.view === VIEW_ALL || ui.view === ROOT || !!ui.reorder);
  let html = '';
  if (ui.view === VIEW_ALL && !ui.query) {
    html += archiveBannerHtml();
    html += favHomeHtml(model);
    const tiles = model.folders.map(folderTileHtml).join('');
    html += `<section class="fm-section"><div class="fm-section-head"><h3>폴더</h3><span>${model.folders.length}</span></div>
      <div class="fm-folders">${tiles || '<div class="fm-empty" style="grid-column:1/-1">폴더가 없습니다. 위의 "새 폴더"로 만드세요</div>'}</div></section>`;
    html += `<section class="fm-section"><div class="fm-section-head" data-drop="${ROOT}"><i class="fm-dot"></i><h3>폴더 밖 봇</h3><span>${model.root.length}</span></div>
      ${gridHtml(model.root, ROOT, '모든 봇이 폴더에 들어 있습니다')}</section>`;
  } else if (ui.view === VIEW_ALL) {
    // 검색: 폴더 이름이 맞으면 폴더 타일, 봇 이름이 맞으면 폴더별로 봇을 보여 준다.
    html += favSearchHtml();
    const hitFolders = model.folders.filter((f) => (f.name || '').toLowerCase().includes(ui.query));
    if (hitFolders.length) html += `<section class="fm-section"><div class="fm-section-head"><h3>폴더</h3><span>${hitFolders.length}</span></div><div class="fm-folders">${hitFolders.map(folderTileHtml).join('')}</div></section>`;
    for (const f of model.folders) {
      if (!f.data.some(matches)) continue;
      html += `<section class="fm-section"><div class="fm-section-head" data-drop="${esc(f.id)}"><i class="fm-dot" style="--c:${FOLDER_HEX[f.color] || FOLDER_HEX.default}"></i>
        <h3>${esc(f.name || '이름 없음')}</h3><span>${f.data.length}</span><button data-open="${esc(f.id)}">열기</button></div>${gridHtml(f.data, f.id, '')}</section>`;
    }
    if (model.root.some(matches)) {
      html += `<section class="fm-section"><div class="fm-section-head" data-drop="${ROOT}"><i class="fm-dot"></i><h3>폴더 밖</h3><span>${model.root.length}</span></div>${gridHtml(model.root, ROOT, '')}</section>`;
    }
    const unread = roster.mode === 'single' ? roster.ids.filter((id) => !roster.resolved(id)).length : 0;
    if (unread) html += `<p class="fm-note">아직 이름을 읽지 않은 봇 ${unread}개는 검색에 나오지 않습니다. <button class="fm-link" data-act="load-all">모두 읽기</button></p>`;
    if (!html) html = `<div class="fm-empty">"${esc(ui.query)}"에 맞는 폴더나 봇이 없습니다</div>`;
  } else if (isLabelView(ui.view)) {
    html += labelViewHtml();
  } else {
    const inRoot = ui.view === ROOT;
    const stars = ui.view === VIEW_STARS;
    if (stars && !ui.reorder) html += favShortcutBarHtml();
    const ids = stars ? favStarIds() : inRoot ? model.root : model.folders.find((x) => x.id === ui.view).data;
    if (ui.query) {
      const unread = ids.filter((id) => !roster.resolved(id)).length;
      html += `<p class="fm-note">${stars ? '즐겨찾기' : inRoot ? '폴더 밖' : '이 폴더'}에서 "${esc(ui.query)}" 검색${unread ? ` · 이름 미확인 ${unread}개 제외` : ''}</p>`;
    }
    html += gridHtml(ids, inRoot ? ROOT : ui.view, ui.query ? '맞는 봇이 없습니다' : stars ? '아직 즐겨찾는 봇이 없습니다. 봇 칸의 ☆을 누르면 여기에 모입니다' : inRoot ? '모든 봇이 폴더에 들어 있습니다' : '비어 있음');
  }
  const scroller = ui.app.querySelector('.fm-scroll');
  const top = scroller.scrollTop;
  // 다시 그려도 키보드 포커스가 있던 봇 칸으로 돌려준다.
  const active = document.activeElement;
  const focusId = scroller.contains(active) ? active.closest('.fm-card')?.dataset.id : null;
  // 지난 화면의 관찰 대상을 버린다(다시 그릴 때마다 쌓이지 않게).
  ui.observer?.disconnect();
  ui.cardObserver?.disconnect();
  scroller.innerHTML = html;
  scroller.scrollTop = keepScroll ? top : 0;
  if (focusId) scroller.querySelector(`.fm-card[data-id="${CSS.escape(focusId)}"]`)?.focus({ preventScroll: true });
  observeImages();
}

function renderChrome() {
  const app = ui.app;
  app.classList.toggle('has-selection', ui.selected.size > 0 || !!ui.pending);
  app.classList.toggle('is-pending', !!ui.pending);
  const pending = roster.pending();
  const chip = app.querySelector('.fm-loading');
  const stuck = roster.mode === 'unknown';
  app.classList.toggle('is-loading', roster.mode === null || pending > 0 || stuck);
  chip.classList.toggle('warn', stuck);
  chip.disabled = !stuck;
  chip.textContent = stuck ? '봇 정보를 읽지 못했습니다 · 다시 시도' : pending ? `봇 정보 불러오는 중 · ${pending}` : '봇 정보 확인 중';
  app.classList.toggle('is-reorder', !!ui.reorder);
  for (const v of ['tiles', 'list']) app.classList.toggle('view-' + v, ui.display === v);
  app.querySelectorAll('[data-display]').forEach((b) => b.classList.toggle('on', b.dataset.display === ui.display));
  const here = viewIds();
  const others = here ? [...ui.selected].filter((id) => !here.has(id)).length : 0;
  app.querySelector('.fm-count').textContent = ui.pending
    ? `"${ui.pending}"에 넣을 봇 ${ui.selected.size}개${others ? ` · 다른 곳 ${others}개` : ''}`
    : `${ui.selected.size}개 선택${others ? ` · 다른 곳 ${others}개` : ''}`;
  app.querySelector('[data-act="pending-make"]').disabled = !ui.selected.size;
  const inFolder = [...ui.selected].some((id) => currentModel().folders.some((f) => f.data.includes(id)));
  app.querySelector('[data-act="to-root"]').hidden = !inFolder;
  app.querySelector('[data-grid-label]').textContent = gridLabel(ui.grid);
  app.querySelector('[data-act="sidebar"]').classList.toggle('on', sidebarEnabled(ui.grid));
  const last = saver.history[saver.history.length - 1];
  const undo = app.querySelector('[data-act="undo"]');
  undo.disabled = !last || !!ui.reorder;
  undo.querySelector('small').textContent = last ? last.label : '';
  for (const b of app.querySelectorAll('[data-lock]')) b.disabled = !!ui.reorder;
}

function render(keepScroll = false) {
  if (!ui.app) return;
  renderRail();
  renderMain(keepScroll);
  renderChrome();
}

// 지금 화면(폴더·폴더 밖)에 속한 봇. 모든 폴더 화면은 null.
function viewIds() {
  if (ui.view === VIEW_ALL) return null;
  if (ui.view === VIEW_STARS) return new Set(favStarIds());
  if (isLabelView(ui.view)) return new Set(labelBotIds(ui.view.slice(VIEW_LABEL.length)));
  const m = currentModel();
  return new Set(ui.view === ROOT ? m.root : (m.folders.find((f) => f.id === ui.view)?.data || []));
}

function syncSelection() {
  ui.app.querySelectorAll('.fm-card').forEach((c) => { const on = ui.selected.has(c.dataset.id); c.classList.toggle('sel', on); c.setAttribute('aria-checked', String(on)); });
  renderChrome();
}

// ── 그림 지연 로드 ──

function observeImages() {
  if (!ui.observer) {
    const load = async (el) => {
      const path = el.dataset.src;
      delete el.dataset.src;
      const src = await avatars.load(path);
      if (!src || !el.isConnected) return;
      const img = document.createElement('img');
      img.alt = '';
      img.src = src;
      if (el.classList.contains('fm-thumb')) el.replaceChildren(img);
      else el.append(img);
    };
    ui.observer = typeof IntersectionObserver === 'function'
      ? new IntersectionObserver((entries) => {
        for (const e of entries) if (e.isIntersecting) { ui.observer.unobserve(e.target); load(e.target); }
      }, { rootMargin: '300px' })
      : { observe: load, unobserve() {}, disconnect() {} };
  }
  ui.app.querySelectorAll('[data-src]').forEach((el) => ui.observer.observe(el));
  // 해적판(single)에서는 화면에 들어온 봇부터 서버에서 읽는다.
  if (roster.mode === 'single' && typeof IntersectionObserver === 'function') {
    if (!ui.cardObserver) {
      ui.cardObserver = new IntersectionObserver((entries) => {
        const ids = [];
        for (const e of entries) if (e.isIntersecting) { ui.cardObserver.unobserve(e.target); ids.push(e.target.dataset.id); }
        if (ids.length) rosterWant(ids);
      }, { rootMargin: '200px' });
    }
    ui.app.querySelectorAll('.fm-card:not([data-seen])').forEach((el) => { el.dataset.seen = '1'; ui.cardObserver.observe(el); });
  }
}

// 봇 정보가 도착하면 그 카드만 바꿔 그린다. 검색 중이면 결과를 다시 계산한다.
const rerenderForSearch = debounce(() => { if (ui.app && ui.query) renderMain(true); }, 400);
let chromeTimer = null;
function onRosterUpdate(ids) {
  if (!ui.app) return;
  // 지워진 봇이 새로 드러나면 개수·타일도 바뀌므로 전체를 다시 그린다(드문 일).
  if (ids.length > 40 || roster.countsChanged) { roster.countsChanged = false; render(true); return; }
  for (const id of ids) {
    for (const el of ui.app.querySelectorAll(`.fm-card[data-id="${CSS.escape(id)}"]`)) {
      const focused = el.contains(document.activeElement) ? (document.activeElement === el ? 'card' : document.activeElement.className) : null;
      const tpl = document.createElement('template');
      tpl.innerHTML = cardHtml(id, el.dataset.container).trim();
      const fresh = tpl.content.firstElementChild;
      fresh.dataset.seen = '1';
      el.replaceWith(fresh);
      if (focused === 'card') fresh.focus();
      else if (focused) (fresh.querySelector(`.${focused.split(' ')[0]}`) || fresh).focus();
    }
  }
  observeImages();
  rerenderForSearch();
  if (!chromeTimer) chromeTimer = setTimeout(() => { chromeTimer = null; if (ui.app) renderChrome(); }, 250);
}

// ── 저장 ──

async function save(label, mutate, opts = {}) {
  try {
    const next = await saver.commit(label, mutate, opts.expect);
    if (!next) { if (!opts.quiet) toast('바뀐 것이 없습니다'); return false; }
    ui.order = next;
    if (opts.after) opts.after(next);
    const warn = saver.takeWarning();
    if (warn) { try { ui.order = await readOrder(); } catch {} }
    render(true);
    if (warn) toast(warn, { error: true, ms: 6000 });
    else toast(label, { action: { label: '되돌리기', run: undo } });
    return true;
  } catch (err) {
    toastError(err);
    try { ui.order = await readOrder(); render(true); } catch {}
    return false;
  }
}

async function undo() {
  try {
    const entry = await saver.undo();
    if (!entry) return;
    ui.order = await readOrder();
    ui.selected.clear();
    render(true);
    const warn = saver.takeWarning();
    toast(warn || `되돌렸습니다: ${entry.label}`, warn ? { error: true, ms: 6000 } : {});
  } catch (err) {
    toastError(err);
    renderChrome();
  }
}

// ── 선택 ──

function toggleCard(id, shift) {
  if (shift && ui.anchor && ui.visible.includes(ui.anchor)) {
    const a = ui.visible.indexOf(ui.anchor);
    const b = ui.visible.indexOf(id);
    const [from, to] = a < b ? [a, b] : [b, a];
    for (let i = from; i <= to; i++) ui.selected.add(ui.visible[i]);
  } else if (ui.selected.has(id)) ui.selected.delete(id);
  else ui.selected.add(id);
  ui.anchor = id;
  syncSelection();
}

function selectAllVisible() {
  const ids = [...new Set(ui.visible)];
  const all = ids.length && ids.every((id) => ui.selected.has(id));
  for (const id of ids) all ? ui.selected.delete(id) : ui.selected.add(id);
  syncSelection();
}

function clearSelection() {
  ui.selected.clear();
  ui.anchor = null;
  syncSelection();
}

// ── 동작 ──

// 폴더 고르기 창. mode 'move' = 고른 봇을 옮길 곳, 'go' = 열어 볼 폴더.
function pickFolder(title, { mode = 'move', ids = [] } = {}) {
  const { folders } = currentModel();
  const here = (f) => mode === 'move' && ids.length && ids.every((id) => f.data.includes(id));
  const rows = folders.map((f) =>
    `<button class="fm-nav fm-pick" data-pick="${esc(f.id)}" data-name="${esc((f.name || '').toLowerCase())}" ${here(f) ? 'disabled' : ''}>${folderThumb(f)}<span class="fm-nav-name">${esc(f.name || '이름 없음')}</span><span class="fm-nav-count">${here(f) ? '현재 위치' : f.data.length}</span></button>`).join('');
  return openModal(
    `<h3 id="fm-dialog-title">${esc(title)}</h3>
     <label class="fm-search fm-pick-search">${icon('search')}<input type="search" placeholder="${mode === 'move' ? '옮길 폴더 검색' : '폴더 검색'}" aria-label="폴더 검색"></label>
     <div class="fm-picker">${rows || '<div class="fm-empty">폴더가 없습니다</div>'}<div class="fm-empty fm-pick-none" hidden>맞는 폴더가 없습니다</div></div>
     ${mode === 'move' ? `<button class="fm-nav fm-pick-new" data-pick="__new__"><span class="fm-thumb plain">${icon('plus')}</span><span class="fm-nav-name">새 폴더 만들기</span><span></span></button>` : ''}
     <div class="fm-modal-actions"><button class="fm-btn" data-x>취소</button></div>`,
    (modal, close) => {
      modal.querySelector('[data-x]').onclick = () => close(null);
      modal.querySelectorAll('[data-pick]').forEach((b) => { b.onclick = () => close(b.dataset.pick); });
      const input = modal.querySelector('.fm-pick-search input');
      input.oninput = () => {
        const q = input.value.trim().toLowerCase();
        let shown = 0;
        modal.querySelectorAll('.fm-pick').forEach((b) => { const on = !q || b.dataset.name.includes(q); b.hidden = !on; if (on) shown++; });
        modal.querySelector('.fm-pick-none').hidden = shown > 0;
      };
      if (folders.length > 6) setTimeout(() => input.focus(), 0);
      modal.querySelectorAll('[data-src]').forEach(async (el) => {
        const src = await avatars.load(el.dataset.src);
        if (src && el.isConnected) { const img = document.createElement('img'); img.src = src; el.replaceChildren(img); }
      });
    },
  );
}

async function goToFolderPicker() {
  const id = await pickFolder('폴더 목록', { mode: 'go' });
  if (!id) return;
  openView(id);
}

async function moveSelected() {
  const ids = [...ui.selected];
  const target = await pickFolder(`${ids.length}개 봇 옮기기`, { mode: 'move', ids });
  if (!target) return;
  if (target === '__new__') return newFolderFromSelection();
  const name = folderById(target)?.name || '폴더';
  if (await save(`${ids.length}개 → ${name}`, (o) => moveBotsToFolder(o, ids, target))) clearSelection();
}

async function newFolderFromSelection() {
  const ids = [...ui.selected];
  if (!ids.length) { toast('새 폴더에 넣을 봇을 먼저 고르세요'); return; }
  const name = await askText('새 폴더', { placeholder: '폴더 이름', confirm: '만들기', desc: `고른 봇 ${ids.length}개를 새 폴더에 넣습니다.` });
  if (!name) return;
  let made = null;
  const ok = await save(`새 폴더 "${name}"`, (o) => { const r = createFolder(o, name, ids); made = r.folder.id; return r.order; },
    { after: () => { ui.view = made; } });
  if (ok) clearSelection();
}

// 새 폴더: RisuAI는 빈 폴더를 지우므로 이름을 정한 뒤 넣을 봇을 고르게 한다. 이미 고른 봇이 있으면 바로 만든다.
async function createFolderFlow() {
  if (ui.reorder) return;
  if (ui.selected.size) { await newFolderFromSelection(); return; }
  const name = await askText('새 폴더', { placeholder: '폴더 이름', confirm: '다음', desc: 'RisuAI는 빈 폴더를 지우므로, 이어서 넣을 봇을 고릅니다. 다른 폴더의 봇도 고를 수 있습니다.' });
  if (!name) return;
  ui.pending = name;
  renderChrome();
  toast('넣을 봇을 고른 뒤 아래 "폴더 만들기"를 누르세요', { ms: 4000 });
}

async function makePendingFolder() {
  const name = ui.pending;
  const ids = [...ui.selected];
  if (!name || !ids.length) return;
  let made = null;
  const ok = await save(`새 폴더 "${name}"`, (o) => { const r = createFolder(o, name, ids); made = r.folder.id; return r.order; },
    { after: () => { ui.view = made; } });
  if (ok) { ui.pending = null; clearSelection(); }
}

function cancelPendingFolder() {
  ui.pending = null;
  clearSelection();
}

async function moveSelectedToRoot() {
  const ids = [...ui.selected];
  if (await save(`${ids.length}개 → 폴더 밖`, (o) => moveBotsToRoot(o, ids))) clearSelection();
}

async function renameFolder(fid = ui.view) {
  const f = folderById(fid);
  if (!f) return;
  const name = await askText('폴더 이름 바꾸기', { value: f.name || '', confirm: '바꾸기' });
  if (!name || name === f.name) return;
  await save(`이름 바꿈: ${name}`, (o) => updateFolder(o, f.id, { name }));
}

async function recolorFolder(fid = ui.view) {
  const f = folderById(fid);
  if (!f) return;
  const pick = await openModal(
    `<h3>폴더 색</h3><p class="fm-desc">RisuAI 사이드바 폴더 색과 같습니다.</p>
     <div class="fm-swatches">${FOLDER_COLORS.map((c) => `<button class="fm-swatch${(f.color || 'default') === c ? ' on' : ''}" style="--c:${FOLDER_HEX[c]}" data-c="${c}">${COLOR_NAMES[c]}</button>`).join('')}</div>
     <div class="fm-modal-actions"><button class="fm-btn" data-x>취소</button></div>`,
    (modal, close) => {
      modal.querySelector('[data-x]').onclick = () => close(null);
      modal.querySelectorAll('[data-c]').forEach((b) => { b.onclick = () => close(b.dataset.c); });
    },
  );
  if (!pick || pick === f.color) return;
  await save(`색 바꿈: ${COLOR_NAMES[pick]}`, (o) => updateFolder(o, f.id, { color: pick }));
}

async function changeFolderImage(fid = ui.view) {
  const f = folderById(fid);
  if (!f) return;
  const result = await openImagePicker(f);
  if (!result) return;
  if (result.reset) await save('폴더 그림을 기본으로', (o) => updateFolder(o, f.id, { imgFile: '' }));
  else await save('폴더 그림 바꿈', (o) => updateFolder(o, f.id, { imgFile: result.path }));
}

async function shiftFolder(delta, fid = ui.view) {
  const f = folderById(fid);
  if (!f) return;
  await save(delta < 0 ? '폴더를 위로' : '폴더를 아래로', (o) => {
    const next = moveFolder(o, f.id, delta);
    if (!next) toast(delta < 0 ? '이미 맨 위입니다' : '이미 맨 아래입니다');
    return next;
  }, { quiet: true });
}

async function unfoldFolder(fid = ui.view) {
  const f = folderById(fid);
  if (!f) return;
  const ok = await askConfirm(`"${f.name}" 폴더 삭제`, `폴더만 지우고 안의 봇 ${f.data.length}개는 폴더 밖으로 꺼냅니다. 봇은 지워지지 않습니다.`, { confirm: '폴더 삭제', danger: true });
  if (!ok) return;
  await save(`"${f.name}" 폴더를 지웠습니다`, (o) => deleteFolder(o, f.id), { after: () => { if (ui.view === f.id) ui.view = ROOT; } });
}

// 정리 점검. 같은 봇이 여러 자리에 있는지는 순서 데이터만으로 바로 본다.
// 지워진 자리·같은 이름은 모든 봇을 알아야 하므로, 해적판에서 아직 모르는 봇이 있으면 '전체 확인'을 따로 실행한다.
async function runCheck() {
  try {
    ui.order = await readOrder();
    rosterSetIds(orderBotIds(ui.order));
  } catch (err) { toastError(err); return; }
  const unknown = roster.ids.filter((id) => !roster.verified(id));
  const report = inspectOrder(ui.order, [...ui.chars.values()].map((c) => ({ chaId: c.id, name: c.name })));
  const ghosts = report.ghosts.filter((g) => roster.missing.has(g.id));
  const where = (list) => list.map((w) => (w === null ? '폴더 밖' : w)).join(', ');
  const parts = [];
  if (report.duplicates.length) parts.push(`<section><h4>같은 봇이 여러 자리에 있음 ${report.duplicates.length}</h4><ul>${report.duplicates.map((d) => `<li><b>${esc(botName(d.id) || d.id.slice(0, 8))}</b> — ${esc(where(d.where))}</li>`).join('')}</ul></section>`);
  if (ghosts.length) parts.push(`<section><h4>지워진 봇의 빈 자리 ${ghosts.length}</h4><ul>${ghosts.map((g) => `<li>${esc(g.id.slice(0, 8))}… — ${esc(where(g.where))}</li>`).join('')}</ul></section>`);
  if (!unknown.length && report.sameNames.length) parts.push(`<section><h4>이름이 같은 다른 봇 ${report.sameNames.length}</h4><ul>${report.sameNames.map((s) => `<li><b>${esc(s.name)}</b> ${s.list.length}개 — ${esc(s.list.map((x) => where(x.where)).join(' / '))}</li>`).join('')}</ul></section>`);
  const desc = unknown.length
    ? `겹친 자리는 모두 확인했습니다. 아직 확인하지 않은 봇 ${unknown.length}개가 있어 지워진 자리·같은 이름은 일부만 보았습니다.`
    : parts.length ? '아래 항목을 찾았습니다. 이름이 같은 봇은 알려 주기만 합니다.' : '겹치거나 빈 자리가 없습니다.';
  const action = await openModal(
    `<h3 id="fm-dialog-title">정리 점검</h3><p class="fm-desc">${esc(desc)}</p>
     <div class="fm-report">${parts.join('')}</div>
     ${unknown.length ? `<p class="fm-note warn">전체 확인은 아직 확인하지 않은 ${unknown.length}개를 하나씩 읽습니다. 봇이 많으면 오래 걸리고 서버에 부담이 됩니다.</p>` : ''}
     <div class="fm-modal-actions">
       ${unknown.length ? '<button class="fm-btn" data-fix="full">전체 확인</button>' : ''}
       ${ghosts.length ? '<button class="fm-btn danger" data-fix="ghosts">빈 자리 정리</button>' : ''}
       ${report.duplicates.length ? '<button class="fm-btn danger" data-fix="dups">겹침 정리</button>' : ''}
       <button class="fm-btn primary" data-x>닫기</button></div>`,
    (modal, close) => {
      modal.querySelector('[data-x]').onclick = () => close(null);
      modal.querySelectorAll('[data-fix]').forEach((b) => { b.onclick = () => close(b.dataset.fix); });
    },
  );
  if (action === 'full') { if (await readAllWithProgress()) runCheck(); return; }
  if (action === 'dups') await save('겹친 자리를 정리했습니다', (o) => removeDuplicates(o));
  if (action === 'ghosts') {
    // 지우기 직전에 그 자리들을 다시 읽어 정말 없는지 확인한다(오래된 캐시로 지우지 않게).
    toast('지우기 전에 다시 확인하는 중…', { ms: 60000 });
    const session = ui.session;
    const check = await rosterVerify(ghosts.map((g) => g.id));
    if (session !== ui.session) return; // 그 사이 창을 닫았다
    // 이번 재확인 응답으로 없음이 확인된 자리만 지운다. 실패·시간 초과는 남긴다.
    const gone = new Set(check.missing);
    if (!gone.size) { toast(check.failed.length ? `다시 확인하지 못해 지우지 않았습니다(${check.failed.length}개)` : '다시 확인해 보니 지울 빈 자리가 없습니다', { error: !!check.failed.length }); render(true); return; }
    // 저장 대기열에서 실제로 쓸 차례가 왔을 때도 창이 열려 있는지 다시 본다.
    await save(`빈 자리 ${gone.size}개를 정리했습니다${check.failed.length ? ` · 확인 못 한 ${check.failed.length}개는 남김` : ''}`,
      (o) => (session === ui.session ? removeGhosts(o, orderBotIds(o).filter((id) => !gone.has(id))) : null), { quiet: true });
  }
}

// 모든 봇을 읽는다. 진행·실패 수를 보여 주고 중단할 수 있다. 끝까지 읽으면 true.
async function readAllWithProgress() {
  rosterSetIds(orderBotIds(ui.order));
  let stopped = false;
  let modalClose = null;
  const done = openModal(
    `<h3 id="fm-dialog-title">모든 봇 확인 중</h3><p class="fm-desc" data-progress></p>
     <div class="fm-modal-actions"><button class="fm-btn" data-x>중단</button></div>`,
    (modal, close) => {
      modalClose = close;
      const tick = () => {
        if (!modal.isConnected) return;
        const total = roster.ids.length;
        const checked = roster.ids.filter((id) => roster.verified(id)).length;
        const failed = roster.ids.filter((id) => roster.failed.has(id)).length;
        modal.querySelector('[data-progress]').textContent = `확인 ${checked} / ${total}${failed ? ` · 실패 ${failed}` : ''}`;
        setTimeout(tick, 300);
      };
      tick();
      modal.querySelector('[data-x]').onclick = () => close(null);
    },
  );
  if (roster.mode === 'unknown') { toast('봇 정보를 읽을 방법을 확인하지 못했습니다. 위쪽의 다시 시도를 눌러 주세요', { error: true }); return false; }
  const result = await Promise.race([rosterAll(), done]);
  // 중단 버튼·Esc·바깥 누르기 모두 같은 중단으로 처리한다.
  if (result !== 'done') { stopped = true; rosterCancelQueue(); }
  modalClose?.('done');
  const checked = roster.ids.filter((id) => roster.verified(id)).length;
  const failed = roster.ids.filter((id) => roster.failed.has(id)).length;
  if (ui.app) render(true);
  if (stopped) { toast(`중단했습니다 · 확인 ${checked}개${failed ? ` · 실패 ${failed}개` : ''}`); return false; }
  toast(`확인 ${checked}개${failed ? ` · 실패 ${failed}개` : ''}`);
  return !failed;
}

async function reload() {
  try {
    ui.order = await readOrder();
    roster.fetched.clear();
    await rosterStart(orderBotIds(ui.order));
    for (const id of [...ui.selected]) if (!orderBotIds(ui.order).includes(id)) ui.selected.delete(id);
    render(true);
    toast('새로 불러왔습니다');
  } catch (err) { toastError(err); }
}

// ── 사이드바 배열 ──

async function openSidebarDialog() {
  let mode = ui.grid.mode;
  let cols = ui.grid.cols;
  const decor = { align: ui.grid.align, motion: ui.grid.motion, borderless: ui.grid.borderless };
  const result = await openModal(
    `<h3>사이드바 배열</h3>
     <p class="fm-desc">왼쪽 캐릭터 사이드바의 배열과 꾸미기를 설정합니다.\n설정은 서버에 저장되어 새로고침하거나 테마를 바꿔도 유지됩니다.</p>
     <span class="fm-label">배열 방식</span>
     <div class="fm-options">
       <button class="fm-option" data-mode="off">기본 1열<small>여러 열 끄기</small></button>
       <button class="fm-option" data-mode="all">항상 여러 열<small>목록 전체</small></button>
       <button class="fm-option" data-mode="folder">폴더 열 때만<small>열린 폴더 내부만 여러 열</small></button>
     </div>
     <span class="fm-label">열 수</span>
     <div class="fm-options cols4">${[2, 3, 4, 5].map((n) => `<button class="fm-option" data-cols="${n}">${n}열</button>`).join('')}</div>
     <div class="fm-preview"><div class="fm-mini" data-mini></div><p data-say></p></div>
     <span class="fm-label">꾸미기 · 배열과 별도로 적용</span>
     <div class="fm-options fm-sidebar-decor">
       <button class="fm-option" data-decor="align" aria-pressed="false">정렬·간격 보정<small>버튼과 목록 정렬</small></button>
       <button class="fm-option" data-decor="motion" aria-pressed="false">열림 효과·폭 전환<small>동작 줄이기 설정 존중</small></button>
       <button class="fm-option" data-decor="borderless" aria-pressed="false">폴더 테두리 숨김<small>폴더 아이콘과 열린 박스</small></button>
     </div>
     <p class="fm-note">꾸미기는 기본 1열에서도 사용할 수 있습니다. 폴더·메뉴 효과는 열릴 때 적용됩니다.</p>
     <p class="fm-note">처음 적용할 때 RisuAI가 이 플러그인의 '메인 화면 접근' 권한을 묻습니다. 허용해야 사이드바에 반영됩니다.</p>
     <div class="fm-modal-actions"><button class="fm-btn" data-x>취소</button><button class="fm-btn primary" data-ok>적용</button></div>`,
    (modal, close) => {
      const sync = () => {
        modal.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
        modal.querySelectorAll('[data-cols]').forEach((b) => { b.classList.toggle('on', +b.dataset.cols === cols); b.disabled = mode === 'off'; });
        modal.querySelectorAll('[data-decor]').forEach((b) => {
          b.classList.toggle('on', decor[b.dataset.decor]);
          b.setAttribute('aria-pressed', String(decor[b.dataset.decor]));
        });
        const n = mode === 'off' ? 1 : cols;
        const mini = modal.querySelector('[data-mini]');
        mini.style.gridTemplateColumns = `repeat(${n},12px)`;
        mini.innerHTML = Array.from({ length: n * 4 }, (_, i) => `<i class="${i === 0 || (mode !== 'all' && i % n === 0 && i < n * 2) ? 'f' : ''}"></i>`).join('');
        modal.querySelector('[data-say]').innerHTML = mode === 'off'
          ? '사이드바를 <b>기본 1열</b>로 둡니다.'
          : mode === 'all' ? `사이드바 전체를 <b>${cols}열</b>로 펼칩니다.` : `평소엔 1열, <b>폴더를 열면 ${cols}열</b>로 펼칩니다.`;
      };
      modal.querySelectorAll('[data-mode]').forEach((b) => { b.onclick = () => { mode = b.dataset.mode; sync(); }; });
      modal.querySelectorAll('[data-cols]').forEach((b) => { b.onclick = () => { cols = +b.dataset.cols; sync(); }; });
      modal.querySelectorAll('[data-decor]').forEach((b) => { b.onclick = () => { decor[b.dataset.decor] = !decor[b.dataset.decor]; sync(); }; });
      modal.querySelector('[data-x]').onclick = () => close(null);
      modal.querySelector('[data-ok]').onclick = () => close({ mode, cols, ...decor });
      sync();
    },
  );
  if (!result) return;
  try {
    ui.grid = await saveGrid(result);
    renderChrome();
    const applied = await applyGrid(ui.grid);
    if (applied === 'ok') toast(`사이드바: ${gridLabel(ui.grid)}`);
    else if (applied === 'nosidebar') toast(`사이드바: ${gridLabel(ui.grid)} · 사이드바가 보일 때 적용됩니다`);
    else if (applied === 'nostructure') toast('설정은 저장했지만 이 RisuAI의 사이드바 구조를 알아보지 못해 반영되지 않을 수 있습니다', { error: true, ms: 6000 });
    else toast('설정은 저장했지만 메인 화면 접근 권한이 없어 아직 반영하지 못했습니다. 다시 적용하면 권한을 묻습니다', { error: true, ms: 6000 });
  } catch (err) { toastError(err); }
}

// ── 순서 편집 ──

function startReorder() {
  const { folders, root } = currentModel();
  ui.pending = null;
  ui.reorder = {
    layout: { folders: folders.map((f) => ({ id: f.id, data: [...f.data] })), root: [...root] },
    signature: JSON.stringify(ui.order),
  };
  ui.reorder.initial = JSON.stringify(ui.reorder.layout);
  ui.query = '';
  ui.app.querySelector('.fm-search input').value = '';
  ui.selected.clear();
  render();
}

function keyboardMove(el, delta) {
  const layout = ui.reorder.layout;
  if (el.classList.contains('fm-card')) {
    const id = el.dataset.id;
    const list = el.dataset.container === ROOT ? layout.root : layout.folders.find((f) => f.id === el.dataset.container)?.data;
    if (!list) return;
    const i = list.indexOf(id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    render(true);
    ui.app.querySelector(`.fm-card[data-id="${CSS.escape(id)}"]`)?.focus();
    toast(`${botName(id) || '봇'}: ${j + 1}번째`, { ms: 1200 });
  } else {
    const id = el.dataset.folder;
    const list = layout.folders;
    const i = list.findIndex((f) => f.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    const inRail = !!el.closest('.fm-rail');
    render(true);
    ui.app.querySelector(`${inRail ? '.fm-rail .fm-nav' : '.fm-ftile'}[data-folder="${CSS.escape(id)}"]`)?.focus();
    toast(`폴더 ${j + 1}번째`, { ms: 1200 });
  }
}

function reorderDirty() {
  return !!ui.reorder && JSON.stringify(ui.reorder.layout) !== ui.reorder.initial;
}

async function finishReorder() {
  const { layout, signature } = ui.reorder;
  if (!reorderDirty()) { cancelReorder(); return; }
  const emptied = layout.folders.filter((f) => !f.data.length).length;
  if (emptied && !(await askConfirm('빈 폴더', `봇이 하나도 없는 폴더 ${emptied}개는 저장할 때 사라집니다.`, { confirm: '저장' }))) return;
  try {
    const next = await saver.commit('순서를 저장했습니다', (o) => applyLayout(o, layout), signature);
    if (next) ui.order = next;
    const warn = saver.takeWarning();
    if (warn) { try { ui.order = await readOrder(); } catch {} }
    ui.reorder = null;
    ui.selected.clear();
    render(true);
    if (warn) toast(warn, { error: true, ms: 6000 });
    else if (next) toast('순서를 저장했습니다', { action: { label: '되돌리기', run: undo } });
  } catch (err) {
    // 다른 곳에서 바뀐 경우는 그 배치를 다시 저장하면 안 되므로 편집을 닫고, 그 밖의 실패는 배치를 남겨 다시 저장하게 한다.
    if (/다른 곳에서/.test(errorText(err))) {
      ui.reorder = null;
      try { ui.order = await readOrder(); } catch {}
      render(true);
      toast('다른 곳에서 목록이 바뀌어 저장하지 않았습니다. 새 목록에서 다시 편집해 주세요', { error: true, ms: 6000 });
    } else {
      toast(`저장하지 못했습니다: ${errorText(err)} — 편집은 그대로 두었습니다`, { error: true, ms: 6000 });
    }
  }
}

async function cancelReorder() {
  if (reorderDirty() && !(await askConfirm('편집한 순서를 버릴까요?', '저장하지 않은 순서 변경이 사라집니다.', { confirm: '버리기', danger: true }))) return false;
  ui.reorder = null;
  ui.selected.clear();
  render(true);
  return true;
}

// ── 설정 기억 ──

async function loadPrefs() {
  try {
    ui.prefs = await Risuai.getLocalPluginStorage();
    const saved = await ui.prefs.getItem(PREFS_KEY);
    if (saved && ['tiles', 'list'].includes(saved.display)) ui.display = saved.display;
    if (saved && typeof saved.view === 'string') ui.view = saved.view;
    ui.loadAll = !!(saved && saved.loadAll);
    if (saved && FAV_SORTS.some(([k]) => k === saved.favSort)) fav.sort = saved.favSort;
    fav.fold = !!(saved && saved.favFold);
    if (saved && ['recent', 'order'].includes(saved.labelSort)) labelUi.sort = saved.labelSort;
    labelUi.fold = !(saved && saved.labelFold === false);
  } catch {}
  await favLoad();
}

function savePrefs() {
  try { ui.prefs?.setItem(PREFS_KEY, { display: ui.display, view: ui.view, loadAll: !!ui.loadAll, favSort: fav.sort, favFold: fav.fold, labelSort: labelUi.sort, labelFold: labelUi.fold }); } catch {}
}

// ── 껍데기·이벤트 ──

function shellHtml() {
  return `<div class="fm-root"><div class="fm-app view-${ui.display}">
    <header class="fm-top">
      <div class="fm-brand"><span class="fm-logo">${icon('folder')}</span><div><b>Risu 폴더 마스터</b><small>v${FM_VERSION}</small></div></div>
      <label class="fm-search">${icon('search')}<input type="search" placeholder="봇·폴더 이름 검색" aria-label="봇과 폴더 검색"><button class="fm-kbd fm-only-desktop" data-act="palette" title="명령 창 (Ctrl+K)" tabindex="-1">Ctrl K</button></label>
      <span class="fm-spacer"></span>
      <span class="fm-busy">저장 중</span>
      <button class="fm-loading" data-act="roster-retry" disabled>봇 정보 불러오는 중</button>
      <div class="fm-seg" role="group" aria-label="보기">
        <button data-display="tiles" title="작은 타일" aria-label="작은 타일">${icon('tiles')}</button>
        <button data-display="list" title="목록" aria-label="목록">${icon('list')}</button>
      </div>
      <button class="fm-btn" data-act="sidebar" data-lock title="RisuAI 사이드바 열 수">${icon('sidebar')}<span class="fm-text">사이드바 <span class="fm-sub" data-grid-label></span></span></button>
      <button class="fm-btn" data-act="reorder" data-lock title="끌어서 순서·폴더 옮기기">${icon('move')}<span class="fm-text">순서 편집</span></button>
      <div class="fm-menu-wrap">
        <button class="fm-btn fm-icon" data-act="menu" data-lock title="도구" aria-label="도구">${icon('more')}</button>
        <div class="fm-menu">
          <button data-display="tiles" class="fm-only-mobile">${icon('tiles')}작은 타일</button>
          <button data-display="list" class="fm-only-mobile">${icon('list')}목록</button>
          <button data-act="undo">${icon('undo')}되돌리기<small></small></button>
          <button data-act="palette">${icon('command')}명령 창<small>Ctrl K</small></button>
          <button data-act="check">${icon('scan')}정리 점검</button>
          <button data-act="wizard">${icon('wand')}정리 마법사</button>
          <button data-act="dups">${icon('copy')}중복 봇 찾기</button>
          <button data-act="archive">${icon('box')}보관함 정리</button>
          <button data-act="icons">${icon('image')}폴더 그림 한 번에</button>
          <button data-act="snapshots">${icon('history')}배치 기록</button>
          <button data-act="stats">${icon('chart')}통계</button>
          <button data-act="reload">${icon('refresh')}새로 불러오기</button>
          <button data-act="fav-view">${icon('star')}즐겨찾는 봇</button>
          <button data-act="settings">${icon('gear')}설정 · 테마</button>
        </div>
      </div>
      <button class="fm-btn fm-icon" data-act="close" title="닫기" aria-label="닫기">${icon('close')}</button>
    </header>
    <div class="fm-banner"><p><b>순서 편집 중</b><span class="fm-only-desktop"> — 봇과 폴더를 끌어서 옮기세요. 봇을 왼쪽 폴더에 놓으면 그 폴더로 들어갑니다.</span><span class="fm-only-mobile"> — 길게 눌러 끄세요. 위 폴더 칩에 놓으면 그 폴더로 들어갑니다.</span></p>
      <button class="fm-btn" data-act="reorder-cancel">취소</button><button class="fm-btn primary" data-act="reorder-save">${icon('check')}저장</button></div>
    <div class="fm-body">
      <nav class="fm-rail" aria-label="폴더"></nav>
      <main class="fm-main"><div class="fm-head"></div><div class="fm-scroll"></div>
        <div class="fm-selbar" role="toolbar" aria-label="고른 봇">
          <button class="fm-count" data-act="show-selection" title="고른 봇 보기"></button>
          <button class="fm-btn primary fm-pend" data-act="pending-make">${icon('check')}폴더 만들기</button>
          <button class="fm-btn fm-pend" data-act="pending-cancel">취소</button>
          <button class="fm-btn primary fm-norm" data-act="move">${icon('folder')}폴더로 옮기기</button>
          <button class="fm-btn fm-norm" data-act="new-folder">${icon('plus')}<span class="fm-text">새 폴더</span></button>
          <button class="fm-btn fm-norm" data-act="to-root">${icon('out')}<span class="fm-text">폴더 밖으로</span></button>
          <button class="fm-btn fm-icon fm-norm" data-act="tag-selected" title="선택한 봇에 라벨 붙이기" aria-label="선택한 봇에 라벨 붙이기">${icon('tag')}</button>
          <button class="fm-btn fm-icon fm-norm" data-act="fav-selected" title="선택한 봇 즐겨찾기 추가 / 해제" aria-label="선택한 봇 즐겨찾기 추가 / 해제">${icon('star')}</button>
          <button class="fm-btn ghost fm-icon fm-norm" data-act="clear" title="선택 해제" aria-label="선택 해제">${icon('close')}</button>
        </div>
      </main>
    </div>
  </div></div>`;
}

// 설정 '열 때 모두 읽기'(해적판): 창을 열면 뒤에서 모든 봇을 3개씩 읽는다. 창을 닫으면 멈춘다.
function startLoadAllIfWanted() {
  if (!ui.loadAll || roster.mode !== 'single' || !ui.app) return;
  rosterSetIds(orderBotIds(ui.order));
  rosterAll().then((r) => { if (r === 'done' && ui.app) renderMain(true); });
}

async function openSettings() {
  const originalTheme=plus.theme;
  let loadAll = !!ui.loadAll;
  const draft = { ...plusSidebarDraft(), solo: labelStore.state.opts.solo, finish: labelStore.state.opts.finish, archOn: plusStore.state.archive.on, archDays: plusStore.state.archive.days };
  const official = roster.mode === 'full';
  const result = await openModal(
    `<h3 id="fm-dialog-title">설정</h3>
     ${plusThemesHtml()}
     <span class="fm-label">봇 정보 불러오기</span>
     <div class="fm-options cols2">
       <button class="fm-option" data-load="lazy">보이는 봇만<small>가볍게 · 기본</small></button>
       <button class="fm-option" data-load="all">열 때 모두 한 번에<small>검색·점검이 바로 됨</small></button>
     </div>
     <p class="fm-note" data-load-note></p>
     ${plusSidebarSettingsHtml(draft)}
     ${labelSettingsHtml(draft)}
     ${archiveSettingsHtml(draft)}
     <div class="fm-modal-actions"><button class="fm-btn" data-x>취소</button><button class="fm-btn primary" data-ok>저장</button></div>`,
    (modal, close) => {
      const sync = () => {
        modal.querySelectorAll('[data-load]').forEach((b) => b.classList.toggle('on', (b.dataset.load === 'all') === loadAll));
        modal.querySelector('[data-load-note]').classList.toggle('warn', !official && loadAll);
        modal.querySelector('[data-load-note]').textContent = official
          ? '이 RisuAI는 봇 정보를 원래 한 번에 읽어 이 설정이 필요 없습니다.'
          : loadAll
            ? '창을 열 때마다 모든 봇을 3개씩 차례로 읽습니다. 해적 RisuAI는 봇 하나를 읽을 때 그 채팅까지 받으므로, 봇이 많으면 오래 걸리고 서버에 부담이 됩니다. 이 기기에만 적용됩니다.'
            : '화면에 보이는 봇만 읽고, 읽은 이름은 이 기기에 저장해 다음에 바로 보여 줍니다. 이 기기에만 적용됩니다.';
      };
      modal.querySelectorAll('[data-theme]').forEach(b=>{b.onclick=()=>{plusApplyTheme(b.dataset.theme);modal.querySelectorAll('[data-theme]').forEach(x=>{x.classList.toggle('on',x===b);x.setAttribute('aria-pressed',String(x===b))})}});
      modal.querySelectorAll('[data-load]').forEach((b) => { b.onclick = () => { loadAll = b.dataset.load === 'all'; sync(); }; });
      plusSidebarSettingsBind(modal, draft);
      labelSettingsBind(modal, draft);
      archiveSettingsBind(modal, draft);
      modal.querySelector('[data-x]').onclick = () => close(null);
      modal.querySelector('[data-ok]').onclick = () => close({ loadAll });
      sync();
    },
  );
  if (!result) {plusApplyTheme(originalTheme);return;}
  await plusPersist();
  await plusSidebarSave(draft);
  await labelSettingsSave(draft);
  await archiveSettingsSave(draft);
  const turnedOn = result.loadAll && !ui.loadAll;
  ui.loadAll = result.loadAll;
  savePrefs();
  toast('테마와 설정을 저장했습니다');
  if (turnedOn) startLoadAllIfWanted();
  else if (!ui.loadAll) rosterCancelQueue(); // 뒤에서 읽던 것은 멈추고, 보이는 봇은 다시 요청된다
  if (!ui.loadAll) renderMain(true);
}

async function loadAllNames() {
  await readAllWithProgress();
}

// 사이드바에서 찾기: 관리 화면을 닫고 RisuAI 사이드바에서 그 봇(또는 폴더)을 강조한다.
async function locateInSidebar(target) {
  if (ui.reorder || ui.locating) return;
  ui.locating = true;
  ui.app.classList.add('is-locating');
  const session = ui.session;
  try {
    let doc;
    try { doc = await Risuai.getRootDocument(); } catch { doc = null; }
    if (!doc) { toast('메인 화면 접근 권한이 있어야 사이드바에서 찾을 수 있습니다', { error: true }); return; }
    toast('위치 확인 중…', { ms: 30000 });
    const order = await readRawOrder(); // 사이드바와 칸을 맞추므로 바로가기 폴더까지 그대로
    const folder = target.folder ? order.find((f) => isFolder(f) && f.id === target.folder) : null;
    rootDoc = doc;
    // 먼저 이미 아는 것만으로 맞춰 본다(모르는 봇은 있다고 본다). 칸 수가 안 맞을 때만 그 목록의 모르는 봇을 확인한다.
    const exists = (id) => !roster.missing.has(id);
    let found = await findSidebarTarget(doc, order, target, exists);
    if (found.mismatch && roster.mode === 'single') {
      const scope = [...order.filter((x) => typeof x === 'string'), ...(folder ? folder.data : [])].filter((id) => !roster.verified(id));
      if (scope.length > 80) { toast(`사이드바와 맞춰 보려면 확인하지 않은 봇 ${scope.length}개를 읽어야 합니다. 정리 점검의 전체 확인 뒤 다시 해 주세요`, { error: true, ms: 7000 }); return; }
      await rosterVerify(scope);
      if (session !== ui.session) return;
      found = await findSidebarTarget(doc, order, target, exists);
    }
    if (session !== ui.session) return; // 그 사이 창을 닫았다
    // 찾는 동안 다른 곳에서 순서가 바뀌었으면 엉뚱한 칸일 수 있으니 멈춘다.
    if (!found.error && JSON.stringify(await readRawOrder()) !== JSON.stringify(order)) found = { error: '찾는 동안 목록이 바뀌었습니다. 다시 해 주세요' };
    document.querySelector('.fm-toast')?.remove();
    if (found.error) { toast(found.error, { error: true, ms: 5000 }); return; }
    if (found.folderClosed) {
      const go = await askConfirm('사이드바에서 찾기', `사이드바에서 '${folder.name || '폴더'}' 폴더를 열면 '${botName(target.id) || '그 봇'}'이(가) 강조됩니다.`, { confirm: '사이드바로 가기' });
      if (!go || session !== ui.session) return;
      // 확인창이 떠 있는 동안 순서가 바뀌었으면 다시 찾는다.
      if (JSON.stringify(await readOrder()) !== JSON.stringify(order)) { toast('찾는 동안 목록이 바뀌었습니다. 다시 해 주세요', { error: true, ms: 5000 }); return; }
      found = await findSidebarTarget(doc, order, target, exists);
      if (found.error) { toast(found.error, { error: true, ms: 5000 }); return; }
    }
    await markSidebarTarget(doc, found);
    closeManager();
  } catch (err) { toastError(err); }
  finally { ui.locating = false; ui.app?.classList.remove('is-locating'); }
}

function locateBot(id) {
  const { folders } = currentModel();
  const f = folders.find((x) => x.data.includes(id));
  locateInSidebar({ id, folder: f ? f.id : null });
}

// 휴대폰용: 폴더 꾸미기 도구를 글자 버튼으로 모은 창.
const FOLDER_ITEMS = [['fav-pin', 'star', '즐겨찾기에 고정'], ['image', 'image', '그림 바꾸기'], ['rename', 'edit', '이름 바꾸기'], ['color', 'palette', '색 바꾸기'], ['locate', 'locate', '사이드바에서 찾기'], ['folder-up', 'up', '위로 옮기기'], ['folder-down', 'down', '아래로 옮기기'], ['unfold', 'unfold', '폴더 삭제']];

function folderItemLabel(act, text, fid) {
  return act === 'fav-pin' && favIsPin(fid) ? '즐겨찾기 고정 해제' : text;
}

function runFolderAction(act, fid) {
  const run = {
    image: () => changeFolderImage(fid),
    rename: () => renameFolder(fid),
    color: () => recolorFolder(fid),
    locate: () => locateInSidebar({ id: null, folder: fid }),
    'folder-up': () => shiftFolder(-1, fid),
    'folder-down': () => shiftFolder(1, fid),
    unfold: () => unfoldFolder(fid),
    'fav-pin': () => favTogglePin(fid),
  }[act];
  run?.();
}

// 휴대폰용: 폴더 꾸미기 도구를 글자 버튼으로 모은 창.
async function folderMoreSheet(fid = ui.view) {
  const f = folderById(fid);
  if (!f) return;
  const items = FOLDER_ITEMS.filter(([a]) => a !== 'locate');
  const act = await openModal(
    `<h3 id="fm-dialog-title">${esc(f.name || '폴더')}</h3>
     <div class="fm-sheet">${items.map(([a, i, t]) => `<button class="fm-btn${a === 'unfold' ? ' danger' : ''}" data-a="${a}">${icon(i)}${folderItemLabel(a, t, f.id)}</button>`).join('')}</div>
     <div class="fm-modal-actions"><button class="fm-btn" data-x>닫기</button></div>`,
    (modal, close) => {
      modal.querySelector('[data-x]').onclick = () => close(null);
      modal.querySelectorAll('[data-a]').forEach((b) => { b.onclick = () => close(b.dataset.a); });
    },
  );
  if (act) runFolderAction(act, f.id);
}

// 폴더 타일·왼쪽 목록에서 오른쪽 클릭(또는 터치로 길게 누르기)하면 뜨는 작은 메뉴.
function closeFolderMenu() {
  document.querySelector('.fm-ctx')?.remove();
  document.removeEventListener('pointerdown', onFolderMenuOutside, true);
  document.removeEventListener('keydown', onFolderMenuKey, true);
}
function onFolderMenuOutside(e) { if (!e.target.closest?.('.fm-ctx')) closeFolderMenu(); }
function onFolderMenuKey(e) { if (e.key === 'Escape') { e.stopPropagation(); closeFolderMenu(); } }

function openFolderMenu(fid, x, y) {
  const fav = fid === VIEW_STARS;
  const lab = isLabelView(fid) ? labelDef(fid.slice(VIEW_LABEL.length)) : null;
  const f = fav ? { id: VIEW_STARS, name: favFolderTitle() } : lab ? { id: fid, name: labelText(lab) } : folderById(fid);
  if (!f || ui.reorder || document.querySelector('.fm-modal-back')) return;
  closeFolderMenu();
  ui.menuAt = Date.now();
  const el = document.createElement('div');
  el.className = 'fm-ctx';
  el.setAttribute('role', 'menu');
  const items = fav ? favMenuItems() : lab ? labelMenuItems(lab.id) : FOLDER_ITEMS;
  el.innerHTML = `<h4>${esc(f.name || '폴더')}</h4>` + items.map(([a, i, t]) => `<button role="menuitem" data-a="${a}"${a === 'unfold' || a === 'label-delete' ? ' class="danger"' : ''}>${icon(i)}${fav || lab ? t : folderItemLabel(a, t, f.id)}</button>`).join('');
  document.body.append(el);
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  el.style.left = Math.max(8, Math.min(innerWidth - w - 8, x)) + 'px';
  el.style.top = Math.max(8, Math.min(innerHeight - h - 8, y)) + 'px';
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-a]');
    if (!b) return;
    closeFolderMenu();
    if (fav) runFavMenuAction(b.dataset.a); else if (lab) runLabelMenuAction(b.dataset.a, lab.id); else runFolderAction(b.dataset.a, fid);
  });
  document.addEventListener('pointerdown', onFolderMenuOutside, true);
  document.addEventListener('keydown', onFolderMenuKey, true);
  el.querySelector('button')?.focus();
}

function folderOf(target) {
  const lab = target.closest?.('.fm-rail .fm-nav[data-label], .fm-head-text[data-label]');
  if (lab) return labelDef(lab.dataset.label) ? VIEW_LABEL + lab.dataset.label : null;
  const el = target.closest?.('.fm-ftile[data-folder], .fm-rail .fm-nav[data-view], [data-fav-menu]');
  if (!el) return null;
  if (el.hasAttribute('data-fav-menu') || el.dataset.view === VIEW_STARS) return VIEW_STARS;
  const fid = el.dataset.folder || el.dataset.view;
  return folderById(fid) ? fid : null;
}

// 고른 봇을 있는 곳별로 보여 준다(이름은 이미 읽은 것만, 더 읽지 않는다).
async function showSelection() {
  const { folders, root } = currentModel();
  const groups = [];
  for (const f of folders) { const ids = f.data.filter((id) => ui.selected.has(id)); if (ids.length) groups.push([f.name || '이름 없음', ids]); }
  const loose = root.filter((id) => ui.selected.has(id));
  if (loose.length) groups.push(['폴더 밖', loose]);
  const act = await openModal(
    `<h3 id="fm-dialog-title">고른 봇 ${ui.selected.size}개</h3>
     <div class="fm-report">${groups.map(([name, ids]) => `<section><h4>${esc(name)} ${ids.length}</h4><ul>${ids.map((id) => `<li>${esc(botName(id) || id.slice(0, 8) + '…')}</li>`).join('')}</ul></section>`).join('')}</div>
     <div class="fm-modal-actions"><button class="fm-btn" data-clear>선택 해제</button><button class="fm-btn primary" data-x>닫기</button></div>`,
    (modal, close) => {
      modal.querySelector('[data-x]').onclick = () => close(null);
      modal.querySelector('[data-clear]').onclick = () => close('clear');
    },
  );
  if (act === 'clear') clearSelection();
}

function openView(view) {
  // 검색 결과에서 폴더로 들어가면 검색어를 비운다(폴더 이름 검색어로 봇을 거르지 않게).
  if (ui.query) { ui.query = ''; ui.app.querySelector('.fm-search input').value = ''; }
  ui.view = view;
  savePrefs();
  render();
}

const ACTIONS = {
  'roster-retry': () => { rosterStart(orderBotIds(ui.order)).then(() => { render(true); startLoadAllIfWanted(); }).catch(toastError); renderChrome(); },
  settings: () => openSettings(),
  back: () => openView(VIEW_ALL),
  'locate-folder': () => locateInSidebar({ id: null, folder: ui.view }),
  'load-all': () => loadAllNames(),
  close: async () => { if (ui.reorder && !(await cancelReorder())) return; closeManager(); },
  'folder-more': () => folderMoreSheet(),
  'show-selection': () => showSelection(),
  'folder-list': () => goToFolderPicker(),
  menu: () => ui.app.querySelector('.fm-menu').classList.toggle('open'),
  undo: () => undo(),
  check: () => runCheck(),
  reload: () => reload(),
  sidebar: () => openSidebarDialog(),
  reorder: () => { if (ui.view === VIEW_STARS || isLabelView(ui.view)) openView(VIEW_ALL); return startReorder(); },
  'reorder-save': () => finishReorder(),
  'reorder-cancel': () => cancelReorder(),
  'select-all': () => selectAllVisible(),
  move: () => moveSelected(),
  'new-folder': () => newFolderFromSelection(),
  'to-root': () => moveSelectedToRoot(),
  clear: () => clearSelection(),
  'create-folder': () => createFolderFlow(),
  'pending-make': () => makePendingFolder(),
  'pending-cancel': () => cancelPendingFolder(),
  rename: () => renameFolder(),
  color: () => recolorFolder(),
  image: () => changeFolderImage(),
  'folder-up': () => shiftFolder(-1),
  'folder-down': () => shiftFolder(1),
  unfold: () => unfoldFolder(),
  'fav-view': () => openView(VIEW_STARS),
  'fav-selected': () => favToggleSelected(),
  'fav-folder-toggle': () => favFolderToggle(),
  'fav-folder-rename': () => shortcutRename(),
  'fav-folder-image': () => shortcutImage(),
  palette: () => openPalette(),
  wizard: () => openWizard(),
  dups: () => openDuplicates(),
  archive: () => openArchive(),
  'archive-snooze': () => archiveSnooze(),
  snapshots: () => openSnapshots(),
  icons: () => openBatchIcons(),
  stats: () => openStats(),
  'label-new': () => editLabelDialog(null),
  'label-edit': () => { const d = labelDef(ui.view.slice(VIEW_LABEL.length)); if (d) editLabelDialog(d); },
  'tag-selected': () => openLabelPicker([...ui.selected]),
};

function bindEvents(root) {
  const app = ui.app;
  const search = app.querySelector('.fm-search input');
  const runSearch = debounce(() => { if (!ui.app) return; ui.query = search.value.trim().toLowerCase(); renderMain(false); renderChrome(); }, 140);
  ui.cancelSearch = runSearch.cancel;
  search.addEventListener('input', runSearch);

  root.addEventListener('click', (e) => {
    if (Date.now() - drag.droppedAt < 120) return; // 끌어 놓은 그 손짓이 만든 click 은 무시
    if (Date.now() - (ui.menuAt || 0) < 450) return; // 길게 눌러 메뉴를 연 그 손짓의 click 도 무시
    const t = e.target;
    const menu = app.querySelector('.fm-menu');
    if (!t.closest('.fm-menu-wrap')) menu.classList.remove('open');
    const act = t.closest('[data-act]');
    if (act && !act.disabled) {
      if (act.closest('.fm-menu')) menu.classList.remove('open');
      ACTIONS[act.dataset.act]?.();
      return;
    }
    const disp = t.closest('[data-display]');
    if (disp) { menu.classList.remove('open'); ui.display = disp.dataset.display; savePrefs(); renderChrome(); return; }
    const open = t.closest('[data-open]');
    if (open) { openView(open.dataset.open); return; }
    const nav = t.closest('.fm-nav[data-view], .fm-ftile[data-view]');
    if (nav) { const inRail = !!nav.closest('.fm-rail'); openView(inRail && nav.dataset.view === ui.view && ui.view !== VIEW_ALL && !ui.query ? VIEW_ALL : nav.dataset.view); if (inRail) ui.app.querySelector(`.fm-rail [data-view="${CSS.escape(nav.dataset.view)}"]`)?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); return; }
    const retry = t.closest('[data-retry]');
    if (retry) { rosterRetry([retry.dataset.retry]); return; }
    const star = t.closest('[data-star]');
    if (star) { if (!ui.reorder) favToggleStar(star.dataset.star); return; }
    const tag = t.closest('[data-tag]');
    if (tag) { if (!ui.reorder) openLabelPicker([tag.dataset.tag]); return; }
    const lsort = t.closest('[data-label-sort]');
    if (lsort) { labelUi.sort = lsort.dataset.labelSort; savePrefs(); renderMain(true); return; }
    if (t.closest('[data-label-fold]')) { labelUi.fold = !labelUi.fold; savePrefs(); renderRail(); ui.app.querySelector('.fm-rail [data-label-fold]:not([hidden])')?.focus({ preventScroll: true }); return; }
    const sort = t.closest('[data-fav-sort]');
    if (sort) { fav.sort = sort.dataset.favSort; savePrefs(); renderMain(true); return; }
    if (t.closest('[data-fav-fold]')) { fav.fold = !fav.fold; savePrefs(); renderMain(true); return; }
    const loc = t.closest('[data-locate]');
    if (loc) { if (!ui.reorder) locateBot(loc.dataset.locate); return; }
    const card = t.closest('.fm-card');
    if (card) toggleCard(card.dataset.id, e.shiftKey);
  });

  // 폴더 메뉴: 오른쪽 클릭(안드로이드는 길게 누르면 contextmenu 도 온다) + 터치 길게 누르기(아이폰용).
  root.addEventListener('contextmenu', (e) => {
    const fid = !ui.reorder && folderOf(e.target);
    if (!fid) return;
    e.preventDefault();
    if (Date.now() - (ui.menuAt || 0) < 450) return;
    const r = e.clientX || e.clientY ? null : e.target.getBoundingClientRect();
    openFolderMenu(fid, r ? r.left + 8 : e.clientX, r ? r.bottom : e.clientY);
  });
  let press = null;
  const cancelPress = () => { if (press) { clearTimeout(press.timer); press = null; } };
  root.addEventListener('pointerdown', (e) => {
    cancelPress();
    if (e.pointerType === 'mouse' || ui.reorder) return;
    const fid = folderOf(e.target);
    if (!fid) return;
    press = { x: e.clientX, y: e.clientY, timer: setTimeout(() => { press = null; openFolderMenu(fid, e.clientX - 20, e.clientY + 12); }, 520) };
  });
  root.addEventListener('pointermove', (e) => { if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 10) cancelPress(); });
  ['pointerup', 'pointercancel', 'scroll'].forEach((t) => root.addEventListener(t, cancelPress, true));

  root.addEventListener('keydown', (e) => {
    // 순서 편집 중 키보드로 옮기기: 화살표로 한 칸 앞·뒤(봇·폴더 모두). 끌기와 같은 배치 연산을 쓴다.
    if (ui.reorder && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) && e.target.closest?.('.fm-card, [data-folder]')) {
      e.preventDefault();
      keyboardMove(e.target.closest('.fm-card, [data-folder]'), e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1);
      return;
    }
    if ((e.key === ' ' || e.key === 'Enter') && e.target.classList?.contains('fm-card')) {
      e.preventDefault();
      toggleCard(e.target.dataset.id, e.shiftKey);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && e.target.tagName !== 'INPUT' && !ui.reorder) { e.preventDefault(); undo(); }
  });

  bindDrag(root);
  if (!ui.escBound) {
    ui.escBound = true;
    // 포커스가 문서 본문에 있어도 받도록 문서 전체에서 듣는다. 대화상자가 열려 있으면 그쪽이 먼저 처리한다.
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k' && ui.app && !drag.active && !document.querySelector('.fm-modal-back')) { e.preventDefault(); openPalette(); return; }
      if (e.key !== 'Escape' || !ui.app || document.querySelector('.fm-modal-back') || drag.active) return;
      const menu = ui.app.querySelector('.fm-menu');
      if (menu.classList.contains('open')) menu.classList.remove('open');
      else if (ui.pending) cancelPendingFolder();
      else if (ui.selected.size) clearSelection();
      else if (ui.view !== VIEW_ALL && !ui.reorder && e.target.tagName !== 'INPUT') openView(VIEW_ALL);
    });
  }
}

let fmOpen = false;

async function openManager() {
  if (fmOpen) return;
  fmOpen = true;
  ui.session = (ui.session || 0) + 1;
  try {
    await loadPrefs();
    await shortcutReloadStores();
    ui.order = await readOrder();
    // 사이드바 즐겨찾기 폴더: 사이드바에서 고친 것·다른 기기 변경을 맞추고(꺼져 있는데 남아 있으면 지운다) 감시를 시작한다.
    try { if (await saver.syncShortcut() === 'written') ui.order = await readOrder(); } catch (err) { console.log('[risu-folder-master] 즐겨찾기 폴더 맞추기 실패: ' + errorText(err)); }
    shortcutPollStart();
    if (shortcutAnyOn()) shortcutGuard();
    recentWatchStart();
    await labelSeenLoad();
    await snapLoad();
    snapCheckExternal(ui.order);
    saver.onCommitted = (label, next) => { try { snapPush('auto', label, next); } catch {} };
    roster.onUpdate = onRosterUpdate;
    ui.grid = await loadGrid();
    ui.selected.clear();
    ui.pending = null;
    ui.reorder = null;
    ui.query = '';
    document.body.innerHTML = `<style>${APP_CSS}${FEATURE_CSS}${FAV_CSS}${PLUS_CSS}</style>${shellHtml()}`;
    ui.app = document.querySelector('.fm-app');
    saver.onBusy = (busy) => ui.app?.classList.toggle('is-busy', busy);
    bindEvents(document.querySelector('.fm-root'));
    render();
    await Risuai.showContainer('fullscreen');
    clearSidebarMark(rootDoc); // 지난 '찾기' 강조는 새로 열면 지운다(그 사이 순서가 바뀌었을 수 있다)
    rosterStart(orderBotIds(ui.order)).then(() => { render(true); startLoadAllIfWanted(); }).catch((err) => toastError(err));
    // 예전 판이 customCSS에 남긴 그리드 블록은 여기서 옮긴다(db 권한을 이미 받은 시점).
    migrateLegacyGrid().then(async (grid) => {
      if (!grid) return;
      ui.grid = await loadGrid();
      renderChrome();
      if (sidebarEnabled(ui.grid)) await applyGrid(ui.grid);
      toast('예전 사이드바 배열 설정을 새 방식으로 옮겼습니다');
    }).catch((err) => console.log('[risu-folder-master] 옛 그리드 정리 실패: ' + errorText(err)));
  } catch (err) {
    fmOpen = false;
    console.log('[risu-folder-master] 열기 실패: ' + errorText(err));
    try {
      document.body.innerHTML = `<style>${APP_CSS}</style><div class="fm-root"><div class="fm-modal"><h3>폴더 마스터를 열지 못했습니다</h3><p class="fm-desc">${esc(errorText(err))}</p><div class="fm-modal-actions"><button class="fm-btn primary" id="fm-fail">닫기</button></div></div></div>`;
      document.getElementById('fm-fail').onclick = () => closeManager();
      await Risuai.showContainer('fullscreen');
    } catch {}
  }
}

function closeManager() {
  closeFolderMenu();
  ui.cancelSearch?.();
  fmOpen = false;
  ui.session = (ui.session || 0) + 1;
  ui.locating = false;
  endDrag();
  rosterStop();
  ui.observer?.disconnect();
  ui.observer = null;
  ui.cardObserver?.disconnect();
  ui.cardObserver = null;
  ui.app = null;
  avatars.clear();
  document.body.innerHTML = '';
  Risuai.hideContainer();
}

// ── src/ui/drag.js ──
// 순서 편집 모드의 끌어 옮기기. 마우스와 터치를 Pointer Events 하나로 처리한다.
// 마우스는 5px 움직이면, 터치는 0.3초 길게 누르면 시작한다(그 전에 움직이면 스크롤로 둔다).
// 화면 DOM을 직접 옮기지 않고 ui.reorder.layout 을 고친 뒤 다시 그린다.

const drag = {
  pending: null,
  active: null,
  ghost: null,
  target: null,
  timer: null,
  raf: 0,
  point: null,
  droppedAt: 0,
  bound: false,
};

function layoutContainer(layout, key) {
  if (key === ROOT) return layout.root;
  return layout.folders.find((f) => f.id === key)?.data || null;
}

function dragIds(card) {
  const id = card.dataset.id;
  if (ui.selected.has(id) && ui.selected.size > 1) return ui.visible.filter((x, i, a) => ui.selected.has(x) && a.indexOf(x) === i);
  return [id];
}

function makeGhost(kind, source, count) {
  const g = document.createElement('div');
  if (kind === 'folder') {
    g.className = 'fm-ghost nav';
    const label = source.querySelector('.fm-nav-name, .fm-ftile-text b');
    g.innerHTML = source.querySelector('.fm-thumb').outerHTML + `<span class="fm-nav-name">${esc(label.textContent)}</span>`;
  } else {
    g.className = 'fm-ghost';
    g.innerHTML = source.querySelector('.fm-av').outerHTML + `<div class="fm-name">${esc(source.querySelector('.fm-name').textContent)}</div>` +
      (count > 1 ? `<span class="fm-ghost-count">${count}</span>` : '');
  }
  g.insertAdjacentHTML('beforeend', '<span class="fm-ghost-dest"></span>');
  document.body.append(g);
  return g;
}

function beginDrag(p) {
  const el = p.el;
  if (p.kind === 'bot') {
    const ids = dragIds(el);
    drag.active = { kind: 'bot', ids };
    ui.app.querySelectorAll('.fm-card').forEach((c) => c.classList.toggle('fm-dragging', ids.includes(c.dataset.id)));
    drag.ghost = makeGhost('bot', el, ids.length);
  } else {
    drag.active = { kind: 'folder', id: el.dataset.folder };
    el.classList.add('fm-dragging');
    drag.ghost = makeGhost('folder', el, 1);
  }
  try { navigator.vibrate?.(20); } catch {}
  moveGhost(p.x, p.y);
  autoScrollLoop();
}

// 미리보기는 화면 안(사방 8px)에 둔다. 터치는 손가락에 가리지 않게 위쪽에 띄운다.
function moveGhost(x, y) {
  drag.point = { x, y };
  const g = drag.ghost;
  if (!g) return;
  const w = g.offsetWidth;
  const h = g.offsetHeight;
  let gx = drag.pending?.touch ? x - w / 2 : x + 12;
  let gy = drag.pending?.touch ? y - h - 24 : y + 10;
  gx = Math.max(8, Math.min(innerWidth - w - 8, gx));
  gy = Math.max(8, Math.min(innerHeight - h - 8, gy));
  g.style.transform = `translate(${gx}px,${gy}px)`;
}

function destLabel(t) {
  if (!t) return '';
  const name = (id) => (id === ROOT ? '폴더 밖' : currentModel().folders.find((f) => f.id === id)?.name || '폴더');
  if (t.folder) return `${name(t.folder)} ${t.after ? '뒤' : '앞'}`;
  if (t.ref) return `${botName(t.ref) || '이 봇'} ${t.after ? '뒤' : '앞'}`;
  return `→ ${name(t.container)}`;
}

function clearMarks() {
  ui.app?.querySelectorAll('.fm-drop-before,.fm-drop-after,.fm-drop-into').forEach((el) => el.classList.remove('fm-drop-before', 'fm-drop-after', 'fm-drop-into'));
}

// 앞·뒤를 좌우로 볼지 위아래로 볼지는 실제 배치로 정한다(한 열 격자·목록·세로 줄은 위아래).
function horizontal(el) {
  const parent = el.parentElement;
  const cs = getComputedStyle(parent);
  if (cs.display === 'grid') return cs.gridTemplateColumns.trim().split(/\s+/).length > 1;
  if (cs.display === 'flex') return !cs.flexDirection.startsWith('column');
  return false;
}

function findTarget(x, y) {
  const hit = document.elementFromPoint(x, y);
  if (!hit || !ui.app.contains(hit)) return null;
  const a = drag.active;
  if (a.kind === 'folder') {
    const nav = hit.closest('.fm-nav[data-folder], .fm-ftile[data-folder]');
    if (!nav || nav.dataset.folder === a.id) return null;
    const r = nav.getBoundingClientRect();
    const after = horizontal(nav) ? x > r.left + r.width / 2 : y > r.top + r.height / 2;
    return { el: nav, mark: after ? 'fm-drop-after' : 'fm-drop-before', folder: nav.dataset.folder, after };
  }
  const card = hit.closest('.fm-card');
  if (card && !a.ids.includes(card.dataset.id)) {
    const r = card.getBoundingClientRect();
    const after = horizontal(card) ? x > r.left + r.width / 2 : y > r.top + r.height / 2;
    return { el: card, mark: after ? 'fm-drop-after' : 'fm-drop-before', container: card.dataset.container, ref: card.dataset.id, after };
  }
  if (card) return null;
  const into = hit.closest('.fm-grid[data-container], [data-drop]');
  if (into) return { el: into, mark: 'fm-drop-into', container: into.dataset.container || into.dataset.drop, ref: null };
  return null;
}

function updateTarget() {
  if (!drag.point) return;
  clearMarks();
  drag.target = findTarget(drag.point.x, drag.point.y);
  if (drag.target) drag.target.el.classList.add(drag.target.mark);
  const dest = drag.ghost?.querySelector('.fm-ghost-dest');
  if (dest) dest.textContent = destLabel(drag.target);
}

function applyDrop() {
  const t = drag.target;
  const a = drag.active;
  if (!t || !ui.reorder) return false;
  const layout = ui.reorder.layout;
  if (a.kind === 'folder') {
    const list = layout.folders;
    const from = list.findIndex((f) => f.id === a.id);
    const [moved] = list.splice(from, 1);
    let at = list.findIndex((f) => f.id === t.folder);
    if (t.after) at++;
    list.splice(at, 0, moved);
    return true;
  }
  const dest = layoutContainer(layout, t.container);
  if (!dest) return false;
  for (const f of layout.folders) f.data = f.data.filter((id) => !a.ids.includes(id));
  layout.root = layout.root.filter((id) => !a.ids.includes(id));
  const fresh = layoutContainer(layout, t.container);
  let at = t.ref ? fresh.indexOf(t.ref) : -1;
  if (at < 0) at = fresh.length;
  else if (t.after) at++;
  fresh.splice(at, 0, ...a.ids);
  return true;
}

function endDrag(commit) {
  clearTimeout(drag.timer);
  cancelAnimationFrame(drag.raf);
  drag.timer = null;
  const wasActive = !!drag.active;
  let changed = false;
  if (wasActive && commit) changed = applyDrop();
  drag.ghost?.remove();
  drag.ghost = null;
  if (ui.app) {
    clearMarks();
    ui.app.querySelectorAll('.fm-dragging').forEach((el) => el.classList.remove('fm-dragging'));
  }
  if (wasActive) drag.droppedAt = Date.now();
  if (changed && ui.reorder) {
    if (drag.active.kind === 'bot') ui.selected.clear();
    render(true);
  }
  drag.pending = null;
  drag.active = null;
  drag.target = null;
  drag.point = null;
}

// 화면 가장자리에 닿으면 스크롤한다.
function autoScrollLoop() {
  cancelAnimationFrame(drag.raf);
  const step = () => {
    if (!drag.active || !ui.app) return;
    const p = drag.point;
    for (const sc of ui.app.querySelectorAll('.fm-scroll,.fm-rail')) {
      const r = sc.getBoundingClientRect();
      if (p.x < r.left || p.x > r.right || p.y < r.top - 30 || p.y > r.bottom + 30) continue;
      const edge = 48;
      if (sc.scrollHeight > sc.clientHeight) {
        if (p.y < r.top + edge) sc.scrollTop -= Math.ceil((r.top + edge - p.y) / 4);
        else if (p.y > r.bottom - edge) sc.scrollTop += Math.ceil((p.y - (r.bottom - edge)) / 4);
      }
      if (sc.scrollWidth > sc.clientWidth) {
        if (p.x < r.left + edge) sc.scrollLeft -= Math.ceil((r.left + edge - p.x) / 4);
        else if (p.x > r.right - edge) sc.scrollLeft += Math.ceil((p.x - (r.right - edge)) / 4);
      }
    }
    updateTarget();
    drag.raf = requestAnimationFrame(step);
  };
  drag.raf = requestAnimationFrame(step);
}

function bindDrag(root) {
  root.addEventListener('pointerdown', (e) => {
    if (!ui.reorder || e.button > 0 || drag.active) return;
    const el = e.target.closest('.fm-card, .fm-nav[data-folder], .fm-ftile[data-folder]');
    if (!el || !ui.app.contains(el)) return;
    const kind = el.classList.contains('fm-card') ? 'bot' : 'folder';
    drag.pending = { el, kind, x: e.clientX, y: e.clientY, id: e.pointerId, touch: e.pointerType !== 'mouse' };
    if (drag.pending.touch) {
      drag.timer = setTimeout(() => {
        if (drag.pending && !drag.active) beginDrag(drag.pending);
      }, 300);
    }
  });

  if (drag.bound) return;
  drag.bound = true;
  window.addEventListener('pointermove', (e) => {
    const p = drag.pending;
    if (!p || e.pointerId !== p.id) return;
    if (!drag.active) {
      const moved = Math.hypot(e.clientX - p.x, e.clientY - p.y);
      if (p.touch) { if (moved > 10) { clearTimeout(drag.timer); drag.pending = null; } return; }
      if (moved < 5) return;
      beginDrag({ ...p, x: e.clientX, y: e.clientY });
    }
    e.preventDefault();
    moveGhost(e.clientX, e.clientY);
  }, { passive: false });

  window.addEventListener('pointerup', (e) => {
    if (drag.pending && e.pointerId === drag.pending.id) endDrag(true);
  });
  window.addEventListener('pointercancel', (e) => {
    if (drag.pending && e.pointerId === drag.pending.id) endDrag(false);
  });

  // 길게 누른 뒤에는 스크롤·문맥 메뉴를 막는다.
  window.addEventListener('touchmove', (e) => { if (drag.active) e.preventDefault(); }, { passive: false });
  window.addEventListener('contextmenu', (e) => { if (ui.reorder && (drag.pending || drag.active)) e.preventDefault(); });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && drag.active) endDrag(false); });
}

// ── src/ui/extras.js ──
// Optional themes and move preview preserve the original home geometry and ordering. 즐겨찾기는 favorites.js.
const PLUS_KEY='risuFolderMaster.extras';
const plus={theme:'classic'};
const PLUS_THEMES={classic:{label:'기존 다크',swatch:'#6c7cff',bg:'#0f1218'},mint:{label:'민트 라이트',swatch:'#006c60',bg:'#f6f7f4'},blue:{label:'블루 라이트',swatch:'#235da2',bg:'#f3f6fa'},ocean:{label:'오션 다크',swatch:'#80e3c5',bg:'#111e24'}};
const FEATURE_CSS=`
:root[data-fm-theme=mint]{color-scheme:light;--bg:#f6f7f4;--panel:#eff2ef;--surface:#fff;--surface-2:#e7eeea;--line:#cfdad4;--line-2:#9bafa5;--text:#152f33;--muted:#596b6c;--faint:#62736d;--accent:#006c60;--accent-2:#00584e;--accent-bg:#dcefe8;--danger:#b52f42;--ok:#006c60;--button-text:#fff}
:root[data-fm-theme=blue]{color-scheme:light;--bg:#f3f6fa;--panel:#eaf0f7;--surface:#fff;--surface-2:#e1eaf4;--line:#ccd8e5;--line-2:#92abc5;--text:#192e47;--muted:#51657c;--faint:#5b6e82;--accent:#235da2;--accent-2:#184c8b;--accent-bg:#dfebfd;--danger:#b52f42;--ok:#006c60;--button-text:#fff}
:root[data-fm-theme=ocean]{color-scheme:dark;--bg:#111e24;--panel:#13232a;--surface:#182a31;--surface-2:#243c43;--line:#354c53;--line-2:#607d85;--text:#f0f6f5;--muted:#b1c3c6;--faint:#9bb4b9;--accent:#80e3c5;--accent-2:#a7efda;--accent-bg:#204b40;--danger:#ff8e9a;--ok:#80e3c5;--button-text:#102a24}
:root[data-fm-theme=classic]{--button-text:#fff}
:root:not([data-fm-theme=classic]) .fm-nav{color:var(--text)}
:root:not([data-fm-theme=classic]) .fm-nav.on,:root:not([data-fm-theme=classic]) .fm-banner b{color:var(--text)}
:root:not([data-fm-theme=classic]) .fm-logo{background:var(--accent);color:var(--button-text)}
:root:not([data-fm-theme=classic]) .fm-option,:root:not([data-fm-theme=classic]) .fm-option.on,:root:not([data-fm-theme=classic]) .fm-ip-chips button.on{color:var(--text)}
:root:not([data-fm-theme=classic]) .fm-note,:root:not([data-fm-theme=classic]) .fm-toast,:root:not([data-fm-theme=classic]) .fm-banner{background:var(--surface-2);color:var(--text);border-color:var(--line-2)}
:root:is([data-fm-theme=mint],[data-fm-theme=blue]) .fm-warn,:root:is([data-fm-theme=mint],[data-fm-theme=blue]) .fm-loading.warn,:root:is([data-fm-theme=mint],[data-fm-theme=blue]) .fm-card.failed .fm-name{color:#8a4b08}
:root:is([data-fm-theme=mint],[data-fm-theme=blue]) .fm-btn.danger{background:#ffedef;border-color:#d5a1aa;color:#a01e34}
:root:is([data-fm-theme=mint],[data-fm-theme=blue]) .fm-ctx button.danger{color:#a01e34}
:root:not([data-fm-theme=classic]) .fm-fcount{background:var(--surface-2);color:var(--text)}
:root:not([data-fm-theme=classic]) .fm-btn.primary,:root:not([data-fm-theme=classic]) .fm-card.sel .fm-tick,:root:not([data-fm-theme=classic]) .fm-back-arrow{color:var(--button-text)}
:root:not([data-fm-theme=classic]) .fm-btn.primary:hover:not(:disabled){background:var(--accent-2);border-color:var(--accent-2)}
:root:is([data-fm-theme=mint],[data-fm-theme=blue]) .fm-root{background:#d6dfdae8}
:root:is([data-fm-theme=mint],[data-fm-theme=blue]) .fm-app{box-shadow:0 18px 55px #28483933}
.fm-plus-themes{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:8px 0 18px}
.fm-plus-theme{padding:10px 6px;border:1px solid var(--line-2);border-radius:9px;text-align:left;background:var(--surface);font-size:11px;color:var(--text)}
.fm-plus-theme.on{border:2px solid var(--accent);padding:9px 5px;background:var(--accent-bg)}
.fm-plus-swatch{display:block;height:34px;border-radius:5px;margin-bottom:8px;background:var(--swatch-bg);border-left:13px solid var(--swatch);box-shadow:inset 0 0 0 1px #89999044}
.fm-plus-preview{border:1px solid var(--line-2);border-radius:10px;padding:13px;margin-top:12px;background:var(--surface);font-size:12px;line-height:1.7}
.fm-plus-preview b{color:var(--accent-2)}.fm-pick.plus-target{background:var(--accent-bg);outline:1px solid var(--accent)}
@media(max-width:700px){.fm-plus-themes{grid-template-columns:repeat(2,minmax(0,1fr))}}
`;
function plusApplyTheme(theme){plus.theme=Object.hasOwn(PLUS_THEMES,theme)?theme:'classic';document.documentElement.dataset.fmTheme=plus.theme}
async function plusPersist(){try{const old=await ui.prefs?.getItem(PLUS_KEY);await ui.prefs?.setItem(PLUS_KEY,{...(old&&typeof old==='object'?old:{}),theme:plus.theme})}catch{toast('추가 옵션을 저장하지 못했습니다',{error:true})}}
const plusLoadPrefs=loadPrefs;loadPrefs=async function(){await plusLoadPrefs();try{const s=await ui.prefs?.getItem(PLUS_KEY);plusApplyTheme(s?.theme||'classic')}catch{plusApplyTheme('classic')}};
function plusThemesHtml(){return `<span class="fm-label">화면 테마</span><div class="fm-plus-themes" role="group" aria-label="화면 테마">${Object.entries(PLUS_THEMES).map(([id,t])=>`<button class="fm-plus-theme ${plus.theme===id?'on':''}" data-theme="${id}" aria-pressed="${plus.theme===id}"><span class="fm-plus-swatch" style="--swatch:${t.swatch};--swatch-bg:${t.bg}"></span>${t.label}</button>`).join('')}</div><p class="fm-note">선택해 미리 본 뒤 저장하세요. 취소하면 이전 테마로 돌아갑니다.</p>`}

// Destination selection now previews the effect; the existing saver still performs the move.
const plusPickFolder=pickFolder;pickFolder=function(title,{mode='move',ids=[]}={}){if(mode!=='move')return plusPickFolder(title,{mode,ids});const {folders}=currentModel();let target=null;return openModal(`<h3 id="fm-dialog-title">${esc(title)}</h3><label class="fm-search fm-pick-search">${icon('search')}<input type="search" placeholder="옮길 폴더 검색" aria-label="폴더 검색"></label><div class="fm-picker">${folders.map(f=>`<button class="fm-nav fm-pick" data-pick="${esc(f.id)}" data-name="${esc(f.name.toLowerCase())}" ${ids.every(id=>f.data.includes(id))?'disabled':''}>${folderThumb(f)}<span class="fm-nav-name">${esc(f.name)}</span><span class="fm-nav-count">${ids.every(id=>f.data.includes(id))?'현재 위치':f.data.length}</span></button>`).join('')}<div class="fm-empty fm-pick-none" hidden>맞는 폴더가 없습니다</div></div><div class="fm-plus-preview" aria-live="polite">폴더를 고르면 이동 전후 개수를 보여드립니다.</div><button class="fm-nav fm-pick-new" data-new><span class="fm-thumb plain">${icon('plus')}</span><span class="fm-nav-name">새 폴더 만들기</span></button><div class="fm-modal-actions"><button class="fm-btn" data-x>취소</button><button class="fm-btn primary" data-confirm-move disabled>이동하기</button></div>`,(modal,close)=>{modal.querySelector('[data-x]').onclick=()=>close(null);modal.querySelector('[data-new]').onclick=()=>close('__new__');modal.querySelector('[data-confirm-move]').onclick=()=>target&&close(target);modal.querySelectorAll('[data-pick]').forEach(b=>b.onclick=()=>{target=b.dataset.pick;const f=folderById(target);const moving=ids.filter(id=>!f.data.includes(id)).length;modal.querySelectorAll('[data-pick]').forEach(x=>x.classList.toggle('plus-target',x===b));const sources=new Map();for(const id of ids){const from=folders.find(f=>f.data.includes(id))?.name||'폴더 밖';sources.set(from,(sources.get(from)||0)+1)}modal.querySelector('.fm-plus-preview').innerHTML=`<div>${[...sources].map(([n,c])=>`${esc(n)} ${c}개`).join(' · ')} → <b>${esc(f.name)}</b></div><div>${moving}개 이동 · <b>${f.data.length}개 → ${f.data.length+moving}개</b>${ids.length-moving?` · 이미 들어 있는 ${ids.length-moving}개 유지`:''}</div>`;const confirm=modal.querySelector('[data-confirm-move]');confirm.disabled=!moving;confirm.textContent=`${moving}개 이동하기`});const input=modal.querySelector('input');input.oninput=()=>{let n=0;modal.querySelectorAll('.fm-pick').forEach(b=>{b.hidden=!b.dataset.name.includes(input.value.trim().toLowerCase());if(!b.hidden)n++});modal.querySelector('.fm-pick-none').hidden=!!n};setTimeout(()=>input.focus(),0);modal.querySelectorAll('[data-src]').forEach(async el=>{const src=await avatars.load(el.dataset.src);if(src&&el.isConnected){const img=document.createElement('img');img.src=src;img.alt='';el.replaceChildren(img)}})})};

// ── src/main.js ──
// 시작: 메뉴 등록 + 사이드바 그리드 복원.

async function main() {
  try {
    await Risuai.registerSetting('Risu 폴더 마스터', () => openManager(), MENU_ICON, 'html', 'risu-folder-master');
  } catch (err) { console.log('[risu-folder-master] 설정 메뉴 등록 실패: ' + errorText(err)); }
  try {
    await Risuai.registerButton({ name: 'Risu 폴더 마스터', icon: MENU_ICON, iconType: 'html', location: 'hamburger', id: 'risu-folder-master' }, () => openManager());
  } catch (err) { console.log('[risu-folder-master] 메뉴 버튼 등록 실패: ' + errorText(err)); }
  try {
    await Risuai.onUnload(async () => {
      // 호스트가 1초만 기다리므로 즐겨찾기 폴더 정리를 가장 먼저 한다.
      try { await shortcutUnloadCleanup(); } catch {}
      endDrag();
      rosterStop();
      avatars.clear();
      ui.cancelSearch?.();
      await removeGridStyle();
      await clearSidebarMark(rootDoc);
      if (rootDoc) { try { await setRootStyle(rootDoc, SHORTCUT_GUARD_XID, ''); } catch {} }
    });
  } catch {}
  await startSidebarGrid();
  try { await shortcutStartup(); } catch {}
  console.log(`[risu-folder-master] v${FM_VERSION} 준비됨`);
}

main().catch((err) => console.log('[risu-folder-master] 시작 실패: ' + errorText(err)));
})();
