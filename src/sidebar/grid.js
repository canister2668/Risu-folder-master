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
