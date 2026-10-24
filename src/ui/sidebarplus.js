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
// 임시 정리 폴더. 새로고침해도 이어지도록 이 기기에 적어 둔다.
const CLEANUP_KEY = 'risuFolderMaster.cleanup';
const CLEANUP_POLL_MS = 1000;
const CLEANUP_MAX_MS = 60 * 60e3;
// ended: 이 기기에서 끝낸 정리 폴더의 만료 시각(다른 기기 폴더로 착각해 되살리지 않게).
const cleanup = { ids: [], timer: null, sawOpen: false, started: 0, busy: false, ended: new Set() };

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
  // 정리 폴더는 맨 위(사이드바 첫 칸)로. 닫힘 감지가 첫 칸을 본다.
  if (cleanup.ids.length) list.unshift({ id: CLEANUP_ID, name: CLEANUP_NAME, color: 'red', imgFile: plusStore.state.cleanup.imgFile, ids: cleanup.ids, until: cleanup.started + CLEANUP_MAX_MS });
  const def = labelFolderDef();
  if (def) {
    const lf = plusStore.state.labelFolder;
    list.push({ id: LABEL_FOLDER_ID, name: lf.name || `${def.emoji ? def.emoji + ' ' : ''}${def.name}`, color: def.color, imgFile: lf.imgFile, ids: labelFolderIds() });
  }
  return list.filter(Boolean);
}

function shortcutAnyOn() {
  return fav.folder.on || plusStore.state.recent.on || !!labelFolderDef() || cleanup.ids.length > 0;
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

// ── 임시 정리 폴더 ──

// 아직 남아 있는(지우지 않은) 정리 대상.
function cleanupLive() {
  const live = new Set(orderBotIds(shortcutState.last || ui.order || []));
  return cleanup.ids.filter((id) => live.has(id));
}

async function cleanupSave() {
  try { await (await Risuai.getLocalPluginStorage()).setItem(CLEANUP_KEY, cleanup.ids.length ? { ids: cleanup.ids, started: cleanup.started } : null); } catch {}
}

// 이 기기의 정리 기록만 지운다(DB는 건드리지 않음).
function cleanupForget() {
  if (cleanup.started) cleanup.ended.add(cleanup.started + CLEANUP_MAX_MS);
  clearInterval(cleanup.timer);
  cleanup.timer = null;
  cleanup.ids = [];
  cleanupSave();
}

function cleanupWatch() {
  clearInterval(cleanup.timer);
  cleanup.sawOpen = false;
  cleanup.sawCheck = 0;
  cleanup.timer = setInterval(cleanupTick, CLEANUP_POLL_MS);
}

async function cleanupStart(ids) {
  await shortcutIconEnsure('cleanup');
  cleanup.ids = [...new Set(ids)];
  cleanup.started = Date.now();
  await cleanupSave();
  if (!(await shortcutResync())) { cleanupForget(); throw new Error('정리 폴더를 만들지 못했습니다. 잠시 뒤 다시 해 주세요'); }
  cleanupWatch();
}

// 시작할 때: 새로고침 전에 쓰던 정리 폴더가 있으면 다시 지켜본다(사이드바에서 열었다 닫으면 사라짐).
async function cleanupResume() {
  try {
    const saved = await (await Risuai.getLocalPluginStorage()).getItem(CLEANUP_KEY);
    if (!saved || !Array.isArray(saved.ids) || !saved.ids.length) return;
    cleanup.ids = saved.ids.filter((x) => typeof x === 'string');
    cleanup.started = Number(saved.started) || Date.now();
    cleanupWatch();
  } catch {}
}

async function cleanupEnd(reason) {
  if (!cleanup.ids.length && !cleanup.timer) return false;
  if (Date.now() < (cleanup.retryAt || 0)) return false;
  const until = cleanup.started + CLEANUP_MAX_MS;
  const ids = cleanup.ids;
  cleanup.ended.add(until);
  cleanup.ids = [];
  // 저장에 실패하면 정리 상태를 되돌려 두고 10초 뒤에 다시 끝내 본다(완료로 보이지 않게).
  if (!(await shortcutResync())) {
    cleanup.ended.delete(until);
    cleanup.ids = ids;
    cleanup.retryAt = Date.now() + 10000;
    cleanup.pendingEnd = reason || ' ';
    return false;
  }
  cleanup.retryAt = 0;
  cleanup.pendingEnd = '';
  clearInterval(cleanup.timer);
  cleanup.timer = null;
  await cleanupSave();
  if (ui.app) { render(true); if (reason) toast(reason); }
  return true;
}

// 사이드바 첫 칸(정리 폴더)이 열렸다가 닫히면 끝낸다. 봇을 다 지웠거나 1시간이 지나도 끝낸다.
async function cleanupTick() {
  if (cleanup.busy) return;
  cleanup.busy = true;
  try {
    // 끝내기가 저장 실패로 미뤄졌으면 10초 뒤 다시 끝낸다.
    if (cleanup.pendingEnd && Date.now() >= (cleanup.retryAt || 0)) { await cleanupEnd(cleanup.pendingEnd.trim()); return; }
    if (Date.now() - cleanup.started > CLEANUP_MAX_MS) {
      // 권한을 아직 안 받았으면 이 기기 기록만 지운다. 폴더는 만료 시각이 지나 다음에 창을 열 때 사라진다.
      if (!shortcutState.dbOk) { cleanupForget(); return; }
      await cleanupEnd('정리 폴더를 1시간이 지나 정리했습니다'); return;
    }
    // 데이터 권한을 이미 받았을 때만 순서를 다시 읽는다(시작 직후 권한 창을 띄우지 않게).
    if (shortcutState.dbOk) {
      try { ui.order = await readOrder(); } catch {}
      if (!cleanupLive().length) { await cleanupEnd('정리할 봇을 모두 지워 정리 폴더를 없앴습니다'); return; }
      // 폴더가 실제로 없으면(플러그인을 껐다 켰거나 다른 곳에서 지움) 사이드바 첫 칸을 정리 폴더로 착각하지 않게 멈춘다.
      let first = null;
      try { first = (await readRawOrder())[0]; } catch {}
      if (first && !(isShortcut(first) && first.id === CLEANUP_ID) && cleanup.sawCheck++ > 2) { await cleanupEnd(''); return; }
    }
    let doc = rootDoc;
    if (!doc) { try { doc = await Risuai.getRootDocument(); rootDoc = doc; } catch { doc = null; } }
    if (!doc) return;
    const items = await sidebarTopItems(doc);
    if (!items || !items.length) return;
    const open = !!items[0].box;
    if (open) cleanup.sawOpen = true;
    else if (cleanup.sawOpen) await cleanupEnd('정리 폴더를 닫아 없앴습니다');
  } catch {} finally { cleanup.busy = false; }
}

// 첫 화면 띠: 정리 폴더를 쓰는 중이면 남은 수와 끝내기 버튼.
function cleanupBannerHtml() {
  if (!cleanup.ids.length) return '';
  const n = cleanupLive().length;
  return `<div class="fm-arch-banner fm-clean-banner"><span class="fm-arch-ic">🧹</span><div><b>사이드바 맨 위 「${CLEANUP_NAME}」 폴더 · 남은 봇 ${n}개</b><small>폴더를 열어 봇을 누르고 RisuAI에서 지우세요. 폴더를 닫으면 사라집니다(봇은 원래 자리 그대로).</small></div>
    <button class="fm-btn" data-act="cleanup-end">정리 끝내기</button></div>`;
}

// ── 최근 대화·정리 폴더 아이콘 ──
// 기본 아이콘은 플러그인에 들어 있다(defaulticons.js). 처음 쓸 때 RisuAI 에셋으로 한 번 저장하고 그 경로를 서버에 기억한다.

const SHORTCUT_ICON = {
  recent: { name: '최근 대화', color: 'blue', store: 'recent' },
  cleanup: { name: '정리 중', color: 'red', store: 'cleanup' },
};

function b64Bytes(dataUrl) {
  const bin = atob(String(dataUrl).split(',')[1] || '');
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function shortcutIconDefault(kind) {
  const src = typeof DEFAULT_ICONS === 'object' ? DEFAULT_ICONS[kind] : '';
  if (!src) return '';
  try { return (await Risuai.saveAsset(b64Bytes(src))) || ''; } catch { return ''; }
}

// 아이콘이 아직 없으면 기본 아이콘을 넣는다.
async function shortcutIconEnsure(kind) {
  const meta = SHORTCUT_ICON[kind];
  if (plusStore.state[meta.store].imgFile) return;
  const path = await shortcutIconDefault(kind);
  if (path) await plusStore.change({ k: meta.store, set: { imgFile: path } }).catch(() => {});
}

// 아이콘 고르기(폴더 그림 창 재사용). 「기본 아이콘으로」는 플러그인 기본 아이콘으로 되돌린다.
async function shortcutIconPick(kind) {
  const meta = SHORTCUT_ICON[kind];
  const cur = plusStore.state[meta.store].imgFile;
  const result = await openImagePicker({ name: meta.name, imgFile: cur, color: meta.color });
  if (!result) return false;
  const path = result.reset ? await shortcutIconDefault(kind) : result.path;
  await plusStore.change({ k: meta.store, set: { imgFile: path || '' } });
  if (shortcutState.dbOk) await shortcutResync();
  toast(result.reset ? `${meta.name} 폴더 아이콘을 기본으로 되돌렸습니다` : `${meta.name} 폴더 아이콘을 바꿨습니다`);
  return true;
}

function shortcutIconButton(kind) {
  const meta = SHORTCUT_ICON[kind];
  const thumb = folderThumb({ imgFile: plusStore.state[meta.store].imgFile, color: meta.color });
  return `<button class="fm-sc-icon" data-sc-icon="${kind}" title="${meta.name} 폴더 아이콘 바꾸기" aria-label="${meta.name} 폴더 아이콘 바꾸기">${thumb}</button>`;
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
     <div class="fm-set-row">${shortcutIconButton('recent')}<div><b>🕘 최근 대화 폴더</b><small>최근에 연 봇 순서대로 자동으로 채웁니다. 봇을 바꿀 때 RisuAI가 데이터 권한을 다시 물을 수 있습니다(3일마다). 왼쪽 그림을 누르면 아이콘을 바꿉니다.</small></div>${favSwitchHtml(d.recent, 'data-sw="recent"', '최근 대화 폴더 켜기/끄기')}</div>
     <div class="fm-set-row fm-sub-row" data-recent-only><div><b>보여 줄 개수</b></div>${seg('data-rcount', [[5, '5'], [8, '8'], [12, '12']], d.count)}</div>
     <div class="fm-set-row fm-sub-row" data-recent-only><div><b>즐겨찾기 봇은 빼기</b><small>두 폴더에 같은 봇이 겹치지 않게</small></div>${favSwitchHtml(d.noStars, 'data-sw="noStars"', '최근 대화에서 즐겨찾기 봇 빼기')}</div>
     <div class="fm-set-row fm-sub-row" data-recent-only><div><b>폴더 순서</b></div>${seg('data-rfirst', [['recent', '최근 먼저'], ['favorites', '즐겨찾기 먼저']], d.first)}</div>
     <div class="fm-set-row">${shortcutIconButton('cleanup')}<div><b>🧹 정리 폴더 아이콘</b><small>중복 봇 찾기에서 꺼낼 때 사이드바 맨 위에 잠깐 생기는 폴더의 그림입니다.</small></div></div>
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
  modal.querySelectorAll('[data-sc-icon]').forEach((b) => {
    b.onclick = async () => {
      const kind = b.dataset.scIcon;
      await shortcutIconEnsure(kind);
      if (await shortcutIconPick(kind)) { const t = document.createElement('template'); t.innerHTML = shortcutIconButton(kind); b.replaceChildren(...t.content.firstElementChild.childNodes); lazyAvatars(b); }
    };
  });
  lazyAvatars(modal);
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
  if (d.recent) { await shortcutIconEnsure('recent'); recentWatchStart(); } else recentWatchStop();
  await shortcutResync();
}

// 바로가기 폴더 설정이 바뀐 뒤: 사이드바에 쓰고, 끌기 막기·감시를 맞춘다.
// 성공하면 true(쓴 것이 없어도 true), 저장에 실패하면 false.
async function shortcutResync() {
  let ok = true;
  try {
    if (await saver.syncShortcut() === 'written' && ui.app) { ui.order = await readOrder(); render(true); }
  } catch (err) { ok = false; toastError(err); }
  await shortcutGuard();
  if (shortcutAnyOn()) shortcutPollStart(); // 모두 끄면 감시는 저절로 쉬는 상태가 된다(다른 기기에서 다시 켜면 알아챔)
  return ok;
}
