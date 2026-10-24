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
     <div class="fm-set-row fm-sub-row" data-recent-only><div><b>폴더 순서</b></div>${seg('data-rfirst', [['recent', '최근 먼저'], ['favorites', '즐겨찾기 먼저']], d.first)}</div>
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
