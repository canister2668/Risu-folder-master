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
    html += cleanupBannerHtml();
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
    labelUi.fold = true; // 「내 라벨」 칸은 창을 열 때마다 접힌 상태로 시작한다(펼친 상태를 기억하지 않음)
  } catch {}
  await favLoad();
}

function savePrefs() {
  try { ui.prefs?.setItem(PREFS_KEY, { display: ui.display, view: ui.view, loadAll: !!ui.loadAll, favSort: fav.sort, favFold: fav.fold, labelSort: labelUi.sort }); } catch {}
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
  'cleanup-end': () => cleanupEnd('정리 폴더를 없앴습니다'),
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
    if (t.closest('[data-label-fold]')) { labelUi.fold = !labelUi.fold; renderRail(); ui.app.querySelector('.fm-rail [data-label-fold]:not([hidden])')?.focus({ preventScroll: true }); return; }
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
    // 1.0.8 전부터 최근 대화 폴더를 켜 둔 경우에도 기본 아이콘을 넣는다.
    if (plusStore.state.recent.on) await shortcutIconEnsure('recent');
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
