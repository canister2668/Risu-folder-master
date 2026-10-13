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
