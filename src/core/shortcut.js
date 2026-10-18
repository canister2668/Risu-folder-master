// 사이드바 즐겨찾기 바로가기 폴더. 봇을 복사하지 않고 같은 봇 ID를 한 번 더 적는 폴더다
// (사이드바에서 누르면 같은 봇·같은 채팅이 열린다. RisuAI는 순서 목록의 같은 ID를 자리마다 그리고 지우지 않는다).
// 이 폴더의 주인은 폴더 마스터다. 내용·이름·그림은 즐겨찾기 설정에서 만들고, 사이드바에서 고친 것은 되돌린다.
// 폴더 마스터의 다른 계산은 모두 이 폴더를 뺀 순서(base)로 한다. 호스트 API를 부르지 않는 순수 연산이다.

const SHORTCUT_ID = 'risu-folder-master-favorites';
const SHORTCUT_NAME = '⭐ 즐겨찾기';

function isShortcut(item) {
  return isFolder(item) && item.id === SHORTCUT_ID;
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
  const sc = order.find(isShortcut);
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
  if (sc) {
    const present = new Set(orderBotIds(base));
    for (const id of sc.data) {
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

// base 앞에 바로가기 폴더를 붙인다. 켜져 있지 않거나 순서에 있는 별표 봇이 없으면 붙이지 않는다(RisuAI는 빈 폴더를 지운다).
// opts = { on, stars, name, color, imgFile }
function withShortcut(base, opts) {
  const plainBase = base.filter((x) => !isShortcut(x));
  if (!opts || !opts.on) return plainBase;
  const live = new Set(orderBotIds(plainBase));
  const data = [...new Set((opts.stars || []).filter((id) => live.has(id)))];
  if (!data.length) return plainBase;
  const folder = { id: SHORTCUT_ID, name: opts.name || SHORTCUT_NAME, data, color: opts.color || 'yellow', imgFile: opts.imgFile || '' };
  if (!opts.imgFile) folder.img = '';
  return [folder, ...plainBase];
}

// 저장할 때 바로가기 폴더의 그림 칸(img)은 RisuAI가 채운 값을 그대로 둔다(imgFile 이 같을 때).
function keepShortcutImg(next, raw) {
  const old = (raw || []).find(isShortcut);
  const now = next.find(isShortcut);
  if (old && now && old.imgFile === now.imgFile && old.img && now.imgFile) now.img = old.img;
  return next;
}
