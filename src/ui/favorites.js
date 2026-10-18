// 즐겨찾기: 봇 별표와 폴더 고정. characterOrder 는 건드리지 않고 id 목록만 따로 둔다.
// 서버 플러그인 저장소에 두어 기기끼리 같이 쓴다. 1.0.3~1.0.4 는 기기 저장소(risuFolderMaster.extras)에 있었으므로
// 서버에 아직 없으면 처음 한 번 옮긴다.
// 쓸 때는 서버 값을 다시 읽어 이번 변경만 얹는다(다른 기기에서 넣은 별표를 덮어쓰지 않게).

const FAV_KEY = 'risuFolderMaster.favorites';
const FAV_LEGACY_KEY = 'risuFolderMaster.extras';
const FAV_SORTS = [['added', '추가한 순'], ['recent', '최근 대화'], ['name', '이름']];
const FAV_HOME_MAX = 12;
const fav = { stars: [], pins: [], sort: 'added', fold: false };
let favQueue = Promise.resolve();

function favNorm(v) {
  return Array.isArray(v) ? [...new Set(v.filter((x) => typeof x === 'string' && x))] : [];
}

async function favLoad() {
  try {
    const saved = await Risuai.pluginStorage.getItem(FAV_KEY);
    if (saved && typeof saved === 'object') {
      fav.stars = favNorm(saved.stars);
      fav.pins = favNorm(saved.pins);
      return;
    }
    const legacy = await ui.prefs?.getItem(FAV_LEGACY_KEY);
    fav.stars = favNorm(legacy?.stars);
    fav.pins = favNorm(legacy?.pins);
    if (fav.stars.length || fav.pins.length) await Risuai.pluginStorage.setItem(FAV_KEY, { stars: fav.stars, pins: fav.pins });
  } catch {}
}

// 지금 순서에 없는 봇·폴더는 뺀다(지워진 봇, 다른 곳에서 삭제한 폴더).
function favPrune(state) {
  if (!ui.order.length) return state;
  const bots = new Set(orderBotIds(ui.order));
  const folders = new Set(ui.order.filter(isFolder).map((f) => f.id));
  return { stars: state.stars.filter((id) => bots.has(id)), pins: state.pins.filter((id) => folders.has(id)) };
}

function favApply(state, op) {
  const list = state[op.key].filter((id) => !op.remove?.includes(id));
  for (const id of op.add || []) if (!list.includes(id)) list.push(id);
  return { ...state, [op.key]: list };
}

function favChange(op) {
  Object.assign(fav, favApply(fav, op));
  render(true);
  favQueue = favQueue.then(async () => {
    const cur = await Risuai.pluginStorage.getItem(FAV_KEY);
    const base = cur && typeof cur === 'object' ? { stars: favNorm(cur.stars), pins: favNorm(cur.pins) } : { stars: [], pins: [] };
    const next = favPrune(favApply(base, op));
    await Risuai.pluginStorage.setItem(FAV_KEY, next);
    fav.stars = next.stars;
    fav.pins = next.pins;
  }).catch(() => toast('즐겨찾기를 저장하지 못했습니다', { error: true })).then(() => render(true));
  return favQueue;
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
  return nav(`data-view="${VIEW_STARS}"`, `<span class="fm-thumb plain fm-fav-ic">${icon('star')}</span>`, '즐겨찾기', favStarIds().length, ui.view === VIEW_STARS ? ' on' : '')
    + (pins.length ? `<div class="fm-rail-label fm-fav-label"><span>고정한 폴더</span></div>` + pins.map((f) =>
      nav(`data-view="${esc(f.id)}" data-folder="${esc(f.id)}" data-drop="${esc(f.id)}"`, folderThumb(f), f.name || '이름 없음', f.data.length, ui.view === f.id ? ' on' : '')).join('') : '');
}

function favHeadHtml() {
  const n = favStarIds().length;
  const sorts = FAV_SORTS.map(([k, t]) => `<button data-fav-sort="${k}" class="${fav.sort === k ? 'on' : ''}" aria-pressed="${fav.sort === k}">${t}</button>`).join('');
  return `${backButton(`<span class="fm-thumb plain fm-fav-ic">${icon('star')}</span>`)}<div class="fm-head-text"><h2>즐겨찾는 봇</h2><p>${n}개 · 원래 폴더 위치는 그대로입니다</p></div>
    <div class="fm-head-actions"><div class="fm-fav-sort" role="group" aria-label="정렬">${sorts}</div>${ui.reorder ? '' : `<button class="fm-btn" data-act="select-all">${icon('select')}<span class="fm-text">전체 선택</span></button>`}</div>`;
}

// 첫 화면 맨 위: 고정한 폴더 + 별표한 봇(최대 12개).
function favHomeHtml(model) {
  if (ui.reorder) return '';
  const pins = favPinnedFolders(model);
  const stars = favStarIds();
  if (!pins.length && !stars.length) return '';
  const more = `<button data-open="${VIEW_STARS}">모두 보기${stars.length > FAV_HOME_MAX ? ` ${stars.length}` : ''}</button>`;
  let html = `<section class="fm-section fm-fav-home"><div class="fm-section-head"><span class="fm-fav-ic">${icon('star')}</span><h3>즐겨찾기</h3><span>${pins.length + stars.length}</span>
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
@media (max-width:560px){.fm-fav-sort button{padding:5px 7px}}
`;
