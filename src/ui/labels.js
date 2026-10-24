// 내 라벨: 봇을 쓰는 사람이 붙이는 「나한테 어떤 봇인지」 표시(진행 중·나중에 할 것·엔딩 봄 …).
// 폴더와 따로 쓰는 두 번째 분류다. 서버 플러그인 저장소에 두어 기기끼리 같이 쓴다.
// 자동 라벨 「새로 받음」은 저장하지 않고 그때그때 계산한다(이 기기에서 처음 본 지 7일 안 + 아직 대화 없음).

const LABELS_KEY = 'risuFolderMaster.labels';
const SEEN_KEY = 'risuFolderMaster.seen';
const VIEW_LABEL = 'label:';
const LABEL_NEW = '__new__';
// 정리는 지워졌다고 확인된 봇(roster.missing)만 한다. 열어 둔 화면의 오래된 순서로 정리하면 다른 기기에서 새로 받은 봇의 라벨을 지운다.
const labelStore = createSyncStore(LABELS_KEY, labelsNorm, labelsApply, (s) => labelsDropBots(s, roster.missing));
const labelUi = { seen: {}, sort: 'recent', fold: true }; // 「내 라벨」 칸은 처음엔 접혀 있다

function isLabelView(view) {
  return typeof view === 'string' && view.startsWith(VIEW_LABEL);
}

function labelDef(lid) {
  return labelStore.state.defs.find((d) => d.id === lid) || null;
}

function labelText(d) {
  return `${d.emoji ? d.emoji + ' ' : ''}${d.name}`;
}

function labelHex(d) {
  return FOLDER_HEX[d.color] || FOLDER_HEX.default;
}

// 처음 보는 봇 기록(이 기기). 창을 열 때 부른다.
async function labelSeenLoad() {
  try {
    const saved = await ui.prefs?.getItem(SEEN_KEY);
    const next = seenUpdate(saved && typeof saved === 'object' ? saved : null, orderBotIds(ui.order));
    labelUi.seen = next;
    if (JSON.stringify(next) !== JSON.stringify(saved)) await ui.prefs?.setItem(SEEN_KEY, next);
  } catch {}
}

function labelIsNew(id) {
  return isNewBot(id, labelUi.seen, roster.chars);
}

// 이 라벨이 붙은 봇(지금 순서에 있는 것만). 정렬: 최근 대화순 | 목록 순.
function labelBotIds(lid) {
  const order = orderBotIds(ui.order);
  let ids;
  if (lid === LABEL_NEW) ids = [...new Set(order)].filter(labelIsNew);
  else {
    const set = new Set(Object.entries(labelStore.state.tags).filter(([, l]) => l.includes(lid)).map(([b]) => b));
    ids = [...new Set(order)].filter((id) => set.has(id));
  }
  if (labelUi.sort === 'recent') {
    const last = (id) => roster.chars.get(id)?.last || 0;
    ids = ids.map((id, i) => [id, i]).sort((a, b) => last(b[0]) - last(a[0]) || a[1] - b[1]).map(([id]) => id);
  }
  return ids;
}

function labelChipsHtml(id) {
  const out = labelsOf(labelStore.state, id).map(labelDef).filter(Boolean)
    .map((d) => `<span class="fm-lbl" style="--c:${labelHex(d)}" title="라벨">${esc(labelText(d))}</span>`);
  if (labelIsNew(id)) out.push('<span class="fm-lbl new" title="자동 라벨: 받은 지 7일 안 · 아직 대화 없음">🆕 새로 받음</span>');
  return out.join('');
}

function labelButtonHtml(id) {
  const n = labelsOf(labelStore.state, id).length;
  return `<button class="fm-tagbtn${n ? ' on' : ''}" data-tag="${esc(id)}" title="라벨" aria-label="라벨 붙이기">${icon('tag')}</button>`;
}

function labelDot(d) {
  return `<span class="fm-thumb plain fm-lbl-dot" style="--c:${labelHex(d)}">${d.emoji ? esc(d.emoji) : '<i></i>'}</span>`;
}

// 왼쪽 목록의 「내 라벨」 칸. 접으면 라벨 줄을 숨기고, 지금 보고 있는 라벨 하나만 남긴다. 창을 열 때마다 접힌 채로 시작한다.
function labelRailHtml(nav) {
  const defs = labelStore.state.defs;
  const fold = labelUi.fold;
  const shown = (view) => !fold || ui.view === view;
  const rows = defs.filter((d) => shown(VIEW_LABEL + d.id)).map((d) => nav(`data-view="${VIEW_LABEL}${esc(d.id)}" data-label="${esc(d.id)}"`, labelDot(d), d.name, labelBotIds(d.id).length, ui.view === VIEW_LABEL + d.id ? ' on' : ''));
  const fresh = labelBotIds(LABEL_NEW).length;
  const toggle = `data-label-fold aria-expanded="${!fold}" title="${fold ? '라벨 펼치기' : '라벨 접기'}"`;
  let html = `<div class="fm-rail-label fm-lbl-head"><button class="fm-rail-fold${fold ? ' folded' : ''}" ${toggle}>${icon('down')}<span>내 라벨</span>${fold ? `<i>${defs.length}</i>` : ''}</button><button class="fm-rail-add" data-act="label-new" title="새 라벨" aria-label="새 라벨">${icon('plus')}</button></div>`
    // 휴대폰은 칸 제목이 안 보이므로 접기 칩을 따로 둔다.
    + `<button class="fm-nav fm-mob fm-lbl-chip${fold ? ' folded' : ''}" ${toggle}><span class="fm-thumb plain">${icon('tag')}</span><span class="fm-nav-name">라벨</span><span class="fm-nav-count">${fold ? '펼치기' : '접기'}</span></button>`
    + rows.join('');
  if (!fold) html += `<div class="fm-rail-label"><span>자동</span></div>`;
  if (shown(VIEW_LABEL + LABEL_NEW)) html += nav(`data-view="${VIEW_LABEL}${LABEL_NEW}"`, '<span class="fm-thumb plain fm-lbl-dot">🆕</span>', '새로 받음', fresh, ui.view === VIEW_LABEL + LABEL_NEW ? ' on' : '');
  return html;
}

function labelHeadHtml() {
  const lid = ui.view.slice(VIEW_LABEL.length);
  const d = lid === LABEL_NEW ? { name: '새로 받음', emoji: '🆕', color: 'default' } : labelDef(lid);
  const n = labelBotIds(lid).length;
  const sorts = [['recent', '최근 대화순'], ['order', '목록 순']].map(([k, t]) => `<button data-label-sort="${k}" class="${labelUi.sort === k ? 'on' : ''}" aria-pressed="${labelUi.sort === k}">${t}</button>`).join('');
  const sub = lid === LABEL_NEW ? `${n}개 · 받은 지 7일 안 됐고 아직 대화하지 않은 봇(이 기기 기준)` : `${n}개 · 여러 폴더에 걸쳐 있어도 모아 봅니다`;
  return `${backButton(labelDot(d))}<div class="fm-head-text" ${lid === LABEL_NEW ? '' : `data-label="${esc(lid)}"`}><h2>${esc(labelText(d))}</h2><p>${esc(sub)}</p></div>
    <div class="fm-head-actions"><div class="fm-fav-sort" role="group" aria-label="정렬">${sorts}</div>
    ${lid === LABEL_NEW ? '' : `<button class="fm-btn" data-act="label-edit">${icon('edit')}<span class="fm-text">라벨 편집</span></button>`}
    <button class="fm-btn" data-act="select-all">${icon('select')}<span class="fm-text">전체 선택</span></button></div>`;
}

function labelViewHtml() {
  const lid = ui.view.slice(VIEW_LABEL.length);
  const ids = labelBotIds(lid);
  let html = '';
  if (lid !== LABEL_NEW && plusStore.state.labelFolder.lid === lid) html += `<p class="fm-note">이 라벨은 RisuAI 사이드바 맨 위 바로가기 폴더로도 보입니다.</p>`;
  if (lid === LABEL_NEW && roster.mode === 'single') {
    const unread = orderBotIds(ui.order).filter((id) => !roster.resolved(id)).length;
    if (unread) html += `<p class="fm-note">아직 읽지 않은 봇 ${unread}개는 대화 여부를 몰라 빠져 있습니다. <button class="fm-link" data-act="load-all">모두 읽기</button></p>`;
  }
  const empty = lid === LABEL_NEW ? '새로 받은 봇이 없습니다' : '이 라벨이 붙은 봇이 없습니다. 봇 칸의 🏷️ 버튼으로 붙입니다';
  return html + gridHtml(ids, ui.view, ui.query ? '맞는 봇이 없습니다' : empty);
}

// ── 라벨 붙이기 ──

// ids 에 라벨을 붙이거나 뗀다. 창은 열린 채로 바로 반영한다.
async function openLabelPicker(ids) {
  ids = [...new Set(ids)];
  if (!ids.length) { toast('라벨을 붙일 봇을 먼저 선택하세요'); return; }
  const title = ids.length === 1 ? (botName(ids[0]) || '봇') : `봇 ${ids.length}개`;
  const rows = () => labelStore.state.defs.map((d) => {
    const have = ids.filter((id) => labelsOf(labelStore.state, id).includes(d.id)).length;
    const state = have === ids.length ? 'on' : have ? 'some' : '';
    return `<button class="fm-lrow ${state}" data-lab="${esc(d.id)}" role="checkbox" aria-checked="${state === 'on' ? 'true' : state === 'some' ? 'mixed' : 'false'}"><span class="fm-cb"></span><span class="fm-lbl" style="--c:${labelHex(d)}">${esc(labelText(d))}</span>${labelStore.state.opts.solo === d.id ? '<small>하나만</small>' : ''}</button>`;
  }).join('');
  await openModal(
    `<h3 id="fm-dialog-title">🏷️ ${esc(title)}</h3><p class="fm-desc">누르면 바로 붙고, 다시 누르면 뗍니다.</p>
     <div class="fm-lrows" data-rows>${rows()}</div>
     <button class="fm-nav fm-pick-new" data-new-label><span class="fm-thumb plain">${icon('plus')}</span><span class="fm-nav-name">새 라벨…</span></button>
     <div class="fm-modal-actions"><button class="fm-btn primary" data-x>완료</button></div>`,
    (modal, close) => {
      const box = modal.querySelector('[data-rows]');
      box.addEventListener('click', (e) => {
        const b = e.target.closest('[data-lab]');
        if (!b) return;
        const lid = b.dataset.lab;
        const all = ids.every((id) => labelsOf(labelStore.state, id).includes(lid));
        if (!all && ids.length > 1 && lid === labelStore.state.opts.solo) { toast('한 봇에만 붙는 라벨이라 봇 하나를 골라 붙여 주세요'); return; }
        labelChange(all ? { t: 'remove', bots: ids, label: lid } : { t: 'add', bots: ids, label: lid });
        rerender(box, rows());
      });
      modal.querySelector('[data-new-label]').onclick = async () => {
        const d = await editLabelDialog(null);
        if (d) { await labelChange({ t: 'add', bots: ids, label: d.id }); rerender(box, rows()); }
      };
      modal.querySelector('[data-x]').onclick = () => close(null);
    },
  );
}

function labelChange(op) {
  const job = labelStore.change(op, async () => {
    if (shortcutState.dbOk && labelFolderDef()) { if (await saver.syncShortcut() === 'written') { ui.order = await readOrder(); await shortcutGuard(); } }
  }).catch((err) => toast('라벨을 저장하지 못했습니다: ' + errorText(err), { error: true })).then(() => { if (ui.app) render(true); });
  if (ui.app) render(true);
  return job;
}

// 라벨 만들기·고치기. 결과: 저장한 라벨 | null. 지우기는 'deleted'.
async function editLabelDialog(def) {
  let color = def ? def.color : LABEL_COLORS[labelStore.state.defs.length % 6];
  const result = await openModal(
    `<h3 id="fm-dialog-title">${def ? '라벨 편집' : '새 라벨'}</h3>
     <div class="fm-lab-edit"><input class="fm-field fm-lab-emoji" maxlength="4" placeholder="🙂" value="${esc(def ? def.emoji : '')}" aria-label="이모지(선택)">
     <input class="fm-field fm-lab-name" maxlength="24" placeholder="라벨 이름 (예: 정주행 중)" value="${esc(def ? def.name : '')}" aria-label="라벨 이름"></div>
     <span class="fm-label">색</span>
     <div class="fm-swatches">${LABEL_COLORS.map((c) => `<button class="fm-swatch${color === c ? ' on' : ''}" style="--c:${FOLDER_HEX[c]}" data-c="${c}">${COLOR_NAMES[c]}</button>`).join('')}</div>
     <div class="fm-modal-actions">${def ? '<button class="fm-btn danger" data-del>라벨 삭제</button><span class="fm-spacer"></span>' : ''}<button class="fm-btn" data-x>취소</button><button class="fm-btn primary" data-ok>${def ? '저장' : '만들기'}</button></div>`,
    (modal, close) => {
      const name = modal.querySelector('.fm-lab-name');
      const emoji = modal.querySelector('.fm-lab-emoji');
      modal.querySelectorAll('[data-c]').forEach((b) => { b.onclick = () => { color = b.dataset.c; modal.querySelectorAll('[data-c]').forEach((x) => x.classList.toggle('on', x === b)); }; });
      const ok = () => {
        const n = name.value.trim();
        if (!n) { name.focus(); return; }
        close({ id: def ? def.id : 'l-' + newFolderId().slice(0, 8), name: n, emoji: emoji.value.trim(), color });
      };
      modal.querySelector('[data-ok]').onclick = ok;
      name.onkeydown = (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); ok(); } };
      modal.querySelector('[data-x]').onclick = () => close(null);
      const del = modal.querySelector('[data-del]');
      if (del) del.onclick = () => close('delete');
      setTimeout(() => name.focus(), 0);
    },
  );
  if (!result) return null;
  if (result === 'delete') {
    const n = labelBotIds(def.id).length;
    if (!(await askConfirm(`"${def.name}" 라벨 삭제`, `라벨만 지웁니다. 봇은 그대로이고, 이 라벨이 붙은 봇 ${n}개에서 라벨이 빠집니다.`, { confirm: '삭제', danger: true }))) return null;
    if (plusStore.state.labelFolder.lid === def.id) { await plusStore.change({ k: 'labelFolder', set: { lid: '' } }); }
    await labelChange({ t: 'drop', label: def.id });
    if (ui.view === VIEW_LABEL + def.id) ui.view = VIEW_ALL;
    if (shortcutState.dbOk) await shortcutResync();
    render(true);
    toast('라벨을 지웠습니다');
    return 'deleted';
  }
  if (!def && labelStore.state.defs.length >= LABEL_MAX) { toast(`라벨은 ${LABEL_MAX}개까지 만들 수 있습니다`, { error: true }); return null; }
  await labelChange({ t: 'def', def: result });
  toast(def ? '라벨을 고쳤습니다' : `"${result.name}" 라벨을 만들었습니다`);
  return result;
}

// 왼쪽 목록 라벨에서 오른쪽 클릭(길게 누르기) 메뉴.
function labelMenuItems(lid) {
  const inSidebar = plusStore.state.labelFolder.lid === lid;
  return [
    ['label-edit', 'edit', '이름·색 바꾸기'],
    ['label-sidebar', 'sidebar', inSidebar ? '사이드바 폴더 그만 쓰기' : '사이드바 폴더로 쓰기'],
    ['label-delete', 'close', '라벨 삭제'],
  ];
}

async function runLabelMenuAction(act, lid) {
  const def = labelDef(lid);
  if (!def) return;
  if (act === 'label-edit' || act === 'label-delete') {
    if (act === 'label-delete') {
      const n = labelBotIds(lid).length;
      if (!(await askConfirm(`"${def.name}" 라벨 삭제`, `라벨만 지웁니다. 봇은 그대로이고, 이 라벨이 붙은 봇 ${n}개에서 라벨이 빠집니다.`, { confirm: '삭제', danger: true }))) return;
      if (plusStore.state.labelFolder.lid === lid) await plusStore.change({ k: 'labelFolder', set: { lid: '' } });
      await labelChange({ t: 'drop', label: lid });
      if (ui.view === VIEW_LABEL + lid) ui.view = VIEW_ALL;
      if (shortcutState.dbOk) await shortcutResync();
      render(true);
      return;
    }
    await editLabelDialog(def);
    return;
  }
  if (act === 'label-sidebar') {
    const on = plusStore.state.labelFolder.lid !== lid;
    await plusStore.change({ k: 'labelFolder', set: { lid: on ? lid : '' } });
    await shortcutResync();
    render(true);
    toast(on ? `사이드바 맨 위에 「${labelText(def)}」 바로가기 폴더를 둡니다` : '라벨 사이드바 폴더를 지웠습니다');
  }
}

// ── 설정 창의 라벨 칸 ──

function labelSettingsHtml(d) {
  const chips = (attr, cur) => `<div class="fm-chips" role="group">${[['', '없음'], ...labelStore.state.defs.map((l) => [l.id, labelText(l)])].map(([v, t]) => `<button ${attr}="${esc(v)}" class="${cur === v ? 'on' : ''}" aria-pressed="${cur === v}">${esc(t)}</button>`).join('')}</div>`;
  return `<span class="fm-label">내 라벨</span>
     <div class="fm-set-row"><div><b>한 봇에만 붙는 라벨</b><small>새 봇에 붙이면 이전 봇에서 빠집니다 (예: 「진행 중」은 하나만)</small></div></div>${chips('data-lsolo', d.solo)}
     <div class="fm-set-row"><div><b>보관함 제안에 먼저 넣을 라벨</b><small>오래되지 않았어도 보관함 후보로 올립니다 (예: 「엔딩 봄」)</small></div></div>${chips('data-lfinish', d.finish)}`;
}

function labelSettingsBind(modal, d) {
  const sync = () => {
    for (const [attr, key] of [['lsolo', 'solo'], ['lfinish', 'finish']]) modal.querySelectorAll(`[data-${attr}]`).forEach((b) => { const on = b.dataset[attr] === d[key]; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
  };
  modal.querySelectorAll('[data-lsolo]').forEach((b) => { b.onclick = () => { d.solo = b.dataset.lsolo; sync(); }; });
  modal.querySelectorAll('[data-lfinish]').forEach((b) => { b.onclick = () => { d.finish = b.dataset.lfinish; sync(); }; });
  sync();
}

async function labelSettingsSave(d) {
  const o = labelStore.state.opts;
  if (d.solo !== o.solo) await labelChange({ t: 'opt', key: 'solo', value: d.solo });
  if (d.finish !== o.finish) await labelChange({ t: 'opt', key: 'finish', value: d.finish });
}
