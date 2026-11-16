// 사이드바 바로가기 폴더(즐겨찾기·최근 대화·라벨). 봇을 복사하지 않고 같은 봇 ID를 한 번 더 적는 폴더다
// (사이드바에서 누르면 같은 봇·같은 채팅이 열린다. RisuAI는 순서 목록의 같은 ID를 자리마다 그리고 지우지 않는다).
// 이 폴더들의 주인은 폴더 마스터다. 내용·이름·그림은 폴더 마스터 설정에서 만들고, 사이드바에서 고친 것은 되돌린다.
// 폴더 마스터의 다른 계산은 모두 이 폴더들을 뺀 순서(base)로 한다. 호스트 API를 부르지 않는 순수 연산이다.

const SHORTCUT_ID = 'risu-folder-master-favorites';
const SHORTCUT_NAME = '⭐ 즐겨찾기';
const RECENT_ID = 'risu-folder-master-recent';
const RECENT_NAME = '🕘 최근 대화';
const LABEL_FOLDER_ID = 'risu-folder-master-label';
// 중복 봇 정리용 임시 폴더(사이드바에서 열었다 닫으면 사라진다).
const CLEANUP_ID = 'risu-folder-master-cleanup';
const CLEANUP_NAME = '🧹 정리 중';
const SHORTCUT_IDS = [SHORTCUT_ID, RECENT_ID, LABEL_FOLDER_ID, CLEANUP_ID];

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

// last 의 at 번째 항목을 base 에 다시 넣을 자리: last 에서 그 앞에 있던 항목 중 base 에도 있는 가장 가까운 것 바로 뒤(없으면 맨 앞).
function afterNeighbor(base, last, at) {
  const key = (x) => (isFolder(x) ? 'f:' + x.id : 's:' + x);
  const have = new Map(base.map((x, i) => [key(x), i]));
  for (let i = at - 1; i >= 0; i--) {
    const k = key(last[i]);
    if (have.has(k)) return have.get(k) + 1;
  }
  return 0;
}

// 지난 순서(last)에 있던 폴더가 base 에서 사라졌으면 그 자리 근처에 빈 폴더로 다시 만든다.
// (순정·해적 RisuAI는 빈 폴더를 지운다: 폴더의 마지막 봇을 바로가기 폴더로 끌면 폴더가 없어진다.)
function reviveFolder(base, last, fid) {
  const at = last.findIndex((x) => isFolder(x) && x.id === fid);
  if (at < 0) return null;
  const folder = { ...last[at], data: [] };
  if ('img' in folder && typeof folder.img !== 'string') delete folder.img;
  base.splice(afterNeighbor(base, last, at), 0, folder);
  return folder;
}

// 저장된 순서 → 바로가기 폴더를 뺀 순서. 사이드바·다른 앱 손질로 생긴 흔적을 지난 순서(last, base 모양)를 보고 고친다.
// last 는 기기 사이에 공유하는 기록(risuFolderMaster.home)에서 불러와 새로고침 뒤에도 남는다(store.js).
//  - 원래 자리를 잃고 바로가기 폴더에만 남은 봇: 지난 자리로(폴더가 지워졌으면 다시 만든다), 모르면 폴더 밖 끝으로.
//    PocketRisu 캐릭터 관리자는 끌어 놓을 때 겹친 ID를 앞의 것만 남겨 바로가기 폴더에 든 봇을 모두 원래 폴더에서 뺀다.
//  - 바로가기 폴더에서 끌려 나와 두 번 있게 된 봇: 지난 순서에서 한 번이었으면 지난 자리 하나만 남긴다.
//    지난 순서를 모르면 폴더 안 사본이 딱 하나이고 나머지가 폴더 밖일 때만 폴더 안 것을 남긴다. 그 밖의 겹침은 정리 점검이 알려 준다.
// 지금 한 곳에만 있는 봇은 지난 순서와 달라도 그대로 둔다(사용자가 옮긴 것).
function shortcutBase(raw, last) {
  const order = cloneOrder(raw);
  const scIds = order.filter(isShortcut).flatMap((f) => f.data);
  let base = order.filter((x) => !isShortcut(x));
  const lastIds = last ? orderBotIds(last) : [];
  const counts = new Map();
  for (const id of orderBotIds(base)) counts.set(id, (counts.get(id) || 0) + 1);
  for (const [id, n] of counts) {
    if (n < 2) continue;
    const spots = [];
    for (const item of base) {
      if (item === id) spots.push(null);
      else if (isFolder(item)) for (const x of item.data) if (x === id) spots.push(item.id);
    }
    let keep = -1;
    if (last && lastIds.filter((x) => x === id).length === 1) {
      keep = Math.max(0, spots.indexOf(botContainer(last, id)));
    } else if (!lastIds.includes(id)) {
      const inFolder = spots.filter((s) => s !== null);
      if (inFolder.length === 1) keep = spots.indexOf(inFolder[0]);
    }
    if (keep >= 0) base = dropBotAt(base, id, keep);
  }
  if (scIds.length) {
    const present = new Set(orderBotIds(base));
    for (const id of scIds) {
      if (present.has(id)) continue;
      present.add(id);
      const fid = last ? botContainer(last, id) : undefined;
      let folder = fid ? base.find((x) => isFolder(x) && x.id === fid) : null;
      if (fid && !folder) folder = reviveFolder(base, last, fid);
      if (folder) {
        const at = Math.min(last.find((x) => isFolder(x) && x.id === fid).data.indexOf(id), folder.data.length);
        const data = [...folder.data];
        data.splice(at, 0, id);
        base = base.map((x) => (x === folder ? { ...folder, data } : x));
      } else {
        base.splice(fid === null ? afterNeighbor(base, last, last.indexOf(id)) : base.length, 0, id);
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
    if (sc.until) folder.fmUntil = sc.until; // 정리 폴더: 이 시각까지만 유효(다른 기기가 지우지 않게)
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
