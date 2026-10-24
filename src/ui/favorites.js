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
.fm-set-row{flex-wrap:wrap}
.fm-set-row div{flex:1 1 180px;min-width:0}
.fm-set-row>.fm-fav-sort,.fm-set-row>.fm-switch{flex:none;max-width:100%}
.fm-set-row>.fm-fav-sort{margin-left:auto}
.fm-set-row b{display:block;font-size:13px}
.fm-set-row small{display:block;font-size:11.5px;color:var(--muted);line-height:1.5}
@media (max-width:560px){.fm-fav-bar{flex-wrap:wrap}.fm-fav-bar-acts{width:100%;justify-content:flex-end}}
@media (max-width:560px){.fm-fav-sort button{padding:5px 7px}}
`;
