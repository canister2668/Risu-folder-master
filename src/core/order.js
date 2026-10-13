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
  out.splice(index, 1, ...folder.data);
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
