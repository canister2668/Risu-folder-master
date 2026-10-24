// 1.0.7 도구 창: 배치 기록, 중복 봇, 정리 마법사, 보관함 제안, 폴더 그림 한 번에, 통계, 명령 창(Ctrl+K).
// 모두 기존 저장 경로(save → saver.commit)로 쓰므로 되돌리기·다른 곳 변경 확인이 그대로 적용된다.

const SNAP_KEY = 'risuFolderMaster.snapshots';
const SNAP_AUTO_MAX = 15;
const SNAP_PIN_MAX = 10;
const ARCHIVE_NAME = '📦 보관함';
const ARCHIVE_MIN = 5;
const snaps = { list: [] };

// 이름을 모두 알아야 하는 도구에서: 해적판에서 아직 읽지 않은 봇 수.
function unreadCount(ids) {
  return roster.mode === 'single' ? [...new Set(ids)].filter((id) => !roster.resolved(id)).length : 0;
}

function unreadNote(ids, what) {
  const n = unreadCount(ids);
  return n ? `<p class="fm-note warn">아직 정보를 읽지 않은 봇 ${n}개는 ${esc(what)}에서 빠져 있습니다. <button class="fm-link" data-read-all>모두 읽기</button></p>` : '';
}

// 「모두 읽기」를 누르면 창을 닫고 모두 읽은 뒤 같은 도구를 다시 연다.
function bindReadAll(modal, close, reopen) {
  const b = modal.querySelector('[data-read-all]');
  if (b) b.onclick = async () => { close(null); if (await readAllWithProgress()) reopen(); };
}

function miniBot(id) {
  const c = roster.chars.get(id);
  return `<span class="fm-mini">${avatarHtml(c, id).replace('class="fm-av"', 'class="fm-av sm"')}${esc(botName(id) || '…')}</span>`;
}

function lazyAvatars(root) {
  root.querySelectorAll('[data-src]').forEach(async (el) => {
    const path = el.dataset.src;
    delete el.dataset.src;
    const src = await avatars.load(path);
    if (!src || !el.isConnected) return;
    const img = document.createElement('img');
    img.alt = '';
    img.src = src;
    if (el.classList.contains('fm-thumb')) el.replaceChildren(img); else el.append(img);
  });
}

// ── ③ 배치 기록 ──

async function snapLoad() {
  try {
    const s = await ui.prefs?.getItem(SNAP_KEY);
    snaps.list = Array.isArray(s?.list) ? s.list.filter((e) => e && Array.isArray(e.order) && typeof e.at === 'number') : [];
  } catch { snaps.list = []; }
}

function snapPersist() {
  try { ui.prefs?.setItem(SNAP_KEY, { list: snaps.list }); } catch {}
}

function snapPush(kind, label, order) {
  const entry = { id: newFolderId().slice(0, 8), at: Date.now(), kind, label: String(label || '').slice(0, 80), order: cloneOrder(order) };
  snaps.list.unshift(entry);
  let autos = 0;
  let pins = 0;
  snaps.list = snaps.list.filter((e) => (e.kind === 'manual' ? ++pins <= SNAP_PIN_MAX : ++autos <= SNAP_AUTO_MAX));
  snapPersist();
  return entry;
}

// 창을 열 때: 마지막 기록과 다르면 폴더 마스터 밖에서 바뀐 것이다(다른 플러그인·사이드바에서 직접 바꿈·새 봇).
function snapCheckExternal(order) {
  const latest = snaps.list.find((e) => e.kind !== 'manual') || snaps.list[0];
  if (!latest) { snapPush('auto', '처음 기록', order); return; }
  if (!sameOrder(latest.order, order)) snapPush('external', '바깥에서 바뀜', order);
}

function diffText(d) {
  const parts = [];
  if (d.foldersAdded.length) parts.push(`<span class="p">+ 폴더 ${esc(d.foldersAdded.slice(0, 3).join(', '))}${d.foldersAdded.length > 3 ? ` 외 ${d.foldersAdded.length - 3}` : ''}</span>`);
  if (d.foldersRemoved.length) parts.push(`<span class="m">− 폴더 ${esc(d.foldersRemoved.slice(0, 3).join(', '))}${d.foldersRemoved.length > 3 ? ` 외 ${d.foldersRemoved.length - 3}` : ''}</span>`);
  if (d.renamed.length) parts.push(`<span>이름 ${esc(d.renamed[0][0])} → ${esc(d.renamed[0][1])}${d.renamed.length > 1 ? ` 외 ${d.renamed.length - 1}` : ''}</span>`);
  if (d.moved) parts.push(`<span>봇 ${d.moved}개 옮김</span>`);
  if (d.botsAdded) parts.push(`<span class="p">+ 봇 ${d.botsAdded}</span>`);
  if (d.botsRemoved) parts.push(`<span class="m">− 봇 ${d.botsRemoved}</span>`);
  return parts.join(' · ') || '<span>순서만 바뀜</span>';
}

function snapSummary(order) {
  const folders = order.filter(isFolder);
  return `폴더 ${folders.length}개 · 봇 ${new Set(orderBotIds(order)).size}개`;
}

async function openSnapshots() {
  try { ui.order = await readOrder(); } catch (err) { toastError(err); return; }
  const kindName = { auto: '', external: '⚠️ ', manual: '📌 ' };
  const rows = () => snaps.list.map((e, i) => {
    const older = snaps.list.slice(i + 1).find(() => true);
    const cur = sameOrder(e.order, ui.order);
    const t = timeAgo(e.at);
    return `<div class="fm-snap${cur ? ' cur' : ''}${e.kind === 'external' ? ' ext' : ''}">
      <div class="fm-snap-text"><b>${kindName[e.kind] || ''}${esc(e.label || '기록')}</b>${cur ? ' <span class="fm-badge">지금과 같음</span>' : ''}<small title="${esc(t.full)}">${esc(t.short)} · ${esc(snapSummary(e.order))}</small>
      <div class="fm-diff">${older ? diffText(diffOrders(older.order, e.order)) : '<span>가장 오래된 기록</span>'}</div></div>
      <div class="fm-snap-acts">${e.kind === 'manual' ? `<button class="fm-btn ghost fm-icon" data-snap-del="${e.id}" title="이 기록 지우기" aria-label="이 기록 지우기">${icon('close')}</button>` : ''}
      <button class="fm-btn" data-snap-view="${e.id}">미리보기</button>${cur ? '' : `<button class="fm-btn" data-snap-go="${e.id}">${icon('undo')}이 배치로</button>`}</div></div>`;
  }).join('') || '<div class="fm-empty">아직 기록이 없습니다</div>';
  const act = await openModal(
    `<h3 id="fm-dialog-title">${icon('history')} 배치 기록</h3>
     <p class="fm-desc">폴더 배치를 바꿀 때마다 이 기기에 자동으로 남깁니다(최근 ${SNAP_AUTO_MAX}개). 폴더 마스터 밖에서 바뀐 것(다른 플러그인, 사이드바에서 직접 고친 것, 새로 받은 봇)도 창을 열 때 알아채 「바깥에서 바뀜」으로 남깁니다.</p>
     <div class="fm-snaps" data-rows>${rows()}</div>
     <p class="fm-note">되돌려도 그 사이에 새로 받은 봇은 지우지 않고 폴더 밖 맨 뒤에 둡니다. 되돌린 뒤 「되돌리기」로 다시 돌아올 수 있습니다.</p>
     <div class="fm-modal-actions"><button class="fm-btn" data-snap-pin>📌 지금 배치 저장</button><span class="fm-spacer"></span><button class="fm-btn primary" data-x>닫기</button></div>`,
    (modal, close) => {
      modal.classList.add('fm-big');
      modal.querySelector('[data-x]').onclick = () => close(null);
      modal.addEventListener('click', async (e) => {
        const go = e.target.closest('[data-snap-go]');
        if (go) { close({ go: go.dataset.snapGo }); return; }
        const view = e.target.closest('[data-snap-view]');
        if (view) { close({ view: view.dataset.snapView }); return; }
        const del = e.target.closest('[data-snap-del]');
        if (del) { snaps.list = snaps.list.filter((x) => x.id !== del.dataset.snapDel); snapPersist(); rerender(modal.querySelector('[data-rows]'), rows()); return; }
        if (e.target.closest('[data-snap-pin]')) close({ pin: true });
      });
    },
  );
  if (!act) return;
  if (act.pin) {
    const name = await askText('지금 배치 저장', { placeholder: '예: 정리 끝난 판', confirm: '저장', desc: `손으로 저장한 기록은 자동 기록이 밀려나도 지워지지 않습니다(최대 ${SNAP_PIN_MAX}개).` });
    if (name) { snapPush('manual', name, ui.order); toast('지금 배치를 저장했습니다'); }
    openSnapshots();
    return;
  }
  const entry = snaps.list.find((x) => x.id === (act.go || act.view));
  if (!entry) return;
  if (act.view) { await previewSnapshot(entry); return; }
  await restoreSnapshot(entry);
}

async function previewSnapshot(entry) {
  const folders = entry.order.filter(isFolder);
  const loose = entry.order.filter((x) => typeof x === 'string');
  const t = timeAgo(entry.at);
  const go = await openModal(
    `<h3 id="fm-dialog-title">${esc(entry.label || '기록')}</h3><p class="fm-desc">${esc(t.full)} · ${esc(snapSummary(entry.order))}</p>
     <div class="fm-report">${folders.map((f) => `<section><h4><i class="fm-dot" style="--c:${FOLDER_HEX[f.color] || FOLDER_HEX.default}"></i> ${esc(f.name || '이름 없음')} ${f.data.length}</h4><ul><li>${esc(f.data.slice(0, 8).map((id) => botName(id) || '…').join(', '))}${f.data.length > 8 ? ` 외 ${f.data.length - 8}` : ''}</li></ul></section>`).join('')}
     <section><h4>폴더 밖 ${loose.length}</h4></section></div>
     <div class="fm-modal-actions"><button class="fm-btn" data-x>닫기</button>${sameOrder(entry.order, ui.order) ? '' : '<button class="fm-btn primary" data-ok>이 배치로</button>'}</div>`,
    (modal, close) => {
      modal.querySelector('[data-x]').onclick = () => close(false);
      const ok = modal.querySelector('[data-ok]');
      if (ok) ok.onclick = () => close(true);
    },
  );
  if (go) await restoreSnapshot(entry);
  else openSnapshots();
}

async function restoreSnapshot(entry) {
  const next = restoreOrder(ui.order, entry.order);
  const d = diffOrders(ui.order, next);
  if (sameOrder(next, ui.order)) { toast('지금 배치와 같습니다'); return; }
  const tmp = document.createElement('div');
  tmp.innerHTML = diffText(d);
  if (!(await askConfirm('이 배치로 되돌릴까요?', `「${entry.label}」(${timeAgo(entry.at).short}) 배치로 되돌립니다.\n바뀌는 것: ${tmp.textContent}`, { confirm: '되돌리기' }))) return;
  await save(`배치 복원: ${entry.label}`, (o) => { const n = restoreOrder(o, entry.order); return sameOrder(n, o) ? null : n; });
}

// ── 보관함 (② ⑤ 공용) ──

function archiveFolderId(order = ui.order) {
  const saved = plusStore.state.archive.folderId;
  if (saved && order.some((x) => isFolder(x) && x.id === saved)) return saved;
  const byName = order.find((x) => isFolder(x) && !isShortcut(x) && /^(📦\s*)?보관함$/.test(String(x.name || '').trim()));
  return byName ? byName.id : '';
}

async function archiveMove(ids, label) {
  ids = [...new Set(ids)];
  if (!ids.length) return false;
  let target = '';
  const ok = await save(label || `보관함으로 ${ids.length}개`, (o) => {
    // 창을 열어 둔 사이 지워진 봇은 빼고 옮긴다(없는 봇 자리를 다시 만들지 않게).
    const live = new Set(orderBotIds(o));
    const todo = ids.filter((id) => live.has(id));
    if (!todo.length) return null;
    const fid = archiveFolderId(o);
    if (fid) { target = fid; return moveBotsToFolder(o, todo, fid); }
    const r = createFolder(o, ARCHIVE_NAME, todo);
    target = r.folder.id;
    return r.order;
  });
  // 원래 있던 「보관함」을 쓴 경우도 기억해 두면, 나중에 이름을 바꿔도 보관함으로 알아본다.
  if (ok && target && target !== plusStore.state.archive.folderId) await plusStore.change({ k: 'archive', set: { folderId: target } }).catch(() => {});
  if (ok) ui.selected.clear();
  return ok;
}

// ── ② 중복 봇 ──

async function openDuplicates() {
  const ids = orderBotIds(ui.order);
  const groups = findDuplicates(ids, roster.chars, plusStore.state.dupIgnore);
  const keep = new Map(groups.map((g) => [g.key, new Set([g.ids[0]])]));
  const ignored = new Set();
  const body = () => {
    const live = groups.filter((g) => !ignored.has(g.key));
    if (!live.length) return '<div class="fm-empty">이름이 같거나 비슷한 봇이 없습니다</div>';
    return live.map((g) => {
      const first = roster.chars.get(g.ids[0]);
      return `<section class="fm-dupe"><div class="fm-dupe-h">${avatarHtml(first, g.ids[0])}<b>${esc(first.name)}</b><span class="fm-badge warn">${g.ids.length}개</span><small>${g.same ? '이름 같음' : '이름 비슷함'}</small>
        <button class="fm-link" data-dup-ignore="${esc(g.key)}">이 묶음 무시</button></div>
        <div class="fm-dupe-rows">${g.ids.map((id) => {
          const c = roster.chars.get(id);
          const t = timeAgo(c.last);
          const on = keep.get(g.key).has(id);
          return `<div class="fm-dupe-row"><button class="fm-lrow ${on ? 'on' : ''}" data-dup-keep="${esc(g.key)}" data-id="${esc(id)}" role="checkbox" aria-checked="${on}" aria-label="남기기"><span class="fm-cb"></span></button>
            <span class="fm-dupe-name">${esc(c.name)}</span><span class="fm-dupe-where">${icon('folder')}${esc(favFolderName(id))}</span><span class="fm-dupe-last">${t ? esc(t.short) : '대화 없음'}</span>
            <button class="fm-btn fm-sm" data-dup-loc="${esc(id)}">${icon('locate')}찾기</button></div>`;
        }).join('')}</div></section>`;
    }).join('');
  };
  const rest = () => groups.filter((g) => !ignored.has(g.key)).flatMap((g) => g.ids.filter((id) => !keep.get(g.key).has(id)));
  const act = await openModal(
    `<h3 id="fm-dialog-title">${icon('copy')} 중복 봇 찾기</h3>
     <p class="fm-desc">새 버전을 다시 받다 보면 같은 봇이 쌓입니다. 이름이 같거나 버전 표기·「사본」만 다른 봇을 묶어 보여 줍니다. 봇을 지우지는 않습니다. 지우려면 「찾기」로 사이드바의 그 칸을 짚은 뒤 RisuAI에서 지우세요.</p>
     ${unreadNote(ids, '중복 찾기')}
     <div class="fm-dupes" data-rows>${body()}</div>
     <div class="fm-modal-actions"><span class="fm-count-note" data-rest></span><span class="fm-spacer"></span><button class="fm-btn" data-x>닫기</button><button class="fm-btn primary" data-dup-archive>📦 보관함 폴더로 옮기기</button></div>`,
    (modal, close) => {
      modal.classList.add('fm-big');
      const rows = modal.querySelector('[data-rows]');
      const sync = () => {
        rerender(rows, body());
        const n = rest().length;
        modal.querySelector('[data-rest]').textContent = n ? `체크하지 않은 봇 ${n}개` : '';
        modal.querySelector('[data-dup-archive]').disabled = !n;
        lazyAvatars(rows);
      };
      rows.addEventListener('click', (e) => {
        const k = e.target.closest('[data-dup-keep]');
        if (k) { const set = keep.get(k.dataset.dupKeep); if (set.has(k.dataset.id)) { if (set.size > 1) set.delete(k.dataset.id); else toast('묶음마다 하나는 남겨야 합니다'); } else set.add(k.dataset.id); sync(); return; }
        const ig = e.target.closest('[data-dup-ignore]');
        if (ig) { ignored.add(ig.dataset.dupIgnore); sync(); return; }
        const loc = e.target.closest('[data-dup-loc]');
        if (loc) close({ locate: loc.dataset.dupLoc });
      });
      modal.querySelector('[data-x]').onclick = () => close({ done: true });
      modal.querySelector('[data-dup-archive]').onclick = () => close({ archive: rest() });
      bindReadAll(modal, close, openDuplicates);
      sync();
    },
  );
  if (ignored.size) await plusStore.change({ k: 'dupIgnore', add: [...ignored] }).catch(() => {});
  if (!act) return;
  if (act.locate) { locateBot(act.locate); return; }
  if (act.archive?.length) await archiveMove(act.archive, `중복 봇 ${act.archive.length}개 → 보관함`);
}

// ── ④ 정리 마법사 ──

async function openWizard(mode = 'name') {
  const model = currentModel();
  const groups = suggestGroups(model.root, roster.chars, model.folders, mode);
  const on = new Set(groups.filter((g) => g.ids.length >= 2 || g.folderId).map((g) => g.key));
  const titles = new Map(groups.map((g) => [g.key, g.title]));
  const body = () => groups.map((g) => {
    const f = g.folderId ? model.folders.find((x) => x.id === g.folderId) : null;
    const checked = on.has(g.key);
    const thumb = f ? folderThumb(f) : `<span class="fm-thumb" style="--c:${FOLDER_HEX.default}">${icon('plus')}</span>`;
    return `<section class="fm-wz${checked ? '' : ' off'}"><div class="fm-wz-h"><button class="fm-lrow ${checked ? 'on' : ''}" data-wz="${esc(g.key)}" role="checkbox" aria-checked="${checked}" aria-label="이 제안 쓰기"><span class="fm-cb"></span></button>${thumb}
      <div class="fm-wz-t"><b>${esc(titles.get(g.key))} <small>${f ? '(있는 폴더)' : '(새 폴더)'}</small></b><small>봇 ${g.ids.length}개${f ? ' 추가' : ''}</small></div>
      ${f ? '' : `<button class="fm-btn ghost fm-icon" data-wz-name="${esc(g.key)}" title="새 폴더 이름 바꾸기" aria-label="새 폴더 이름 바꾸기">${icon('edit')}</button>`}<span class="fm-why">${esc(g.why)}</span></div>
      <div class="fm-minis">${g.ids.slice(0, 5).map(miniBot).join('')}${g.ids.length > 5 ? `<span class="fm-mini more">+${g.ids.length - 5}개 더</span>` : ''}</div></section>`;
  }).join('') || `<div class="fm-empty">${model.root.length ? '묶을 만한 봇을 찾지 못했습니다. 다른 기준을 골라 보세요' : '폴더 밖 봇이 없습니다'}</div>`;
  const summary = () => {
    const picked = groups.filter((g) => on.has(g.key));
    const fresh = picked.filter((g) => !g.folderId).length;
    const bots = picked.reduce((n, g) => n + g.ids.length, 0);
    return picked.length ? `${fresh ? `폴더 ${fresh}개 새로 만들고 ` : ''}봇 ${bots}개 옮김 · 남는 폴더 밖 봇 ${model.root.length - bots}개` : '고른 제안이 없습니다';
  };
  const modes = [['name', '이름'], ['creator', '제작자'], ['tag', '태그']];
  const act = await openModal(
    `<h3 id="fm-dialog-title">${icon('wand')} 정리 마법사</h3>
     <p class="fm-desc">폴더 밖 봇 ${model.root.length}개를 묶어 폴더를 제안합니다. 체크한 제안만 적용하고, 적용한 뒤에도 「되돌리기」로 한 번에 돌아올 수 있습니다.</p>
     <div class="fm-wz-modes"><span>묶는 기준</span><div class="fm-fav-sort" role="group">${modes.map(([k, t]) => `<button data-wz-mode="${k}" class="${mode === k ? 'on' : ''}" aria-pressed="${mode === k}">${t}</button>`).join('')}</div></div>
     ${unreadNote(model.root, '제안')}
     <div class="fm-wzs" data-rows>${body()}</div>
     <div class="fm-modal-actions"><span class="fm-count-note" data-sum></span><span class="fm-spacer"></span><button class="fm-btn" data-x>취소</button><button class="fm-btn primary" data-ok>적용</button></div>`,
    (modal, close) => {
      modal.classList.add('fm-big');
      const rows = modal.querySelector('[data-rows]');
      const sync = () => { rerender(rows, body()); modal.querySelector('[data-sum]').textContent = summary(); modal.querySelector('[data-ok]').disabled = !groups.some((g) => on.has(g.key)); lazyAvatars(rows); };
      rows.addEventListener('click', async (e) => {
        const t = e.target.closest('[data-wz]');
        if (t) { on.has(t.dataset.wz) ? on.delete(t.dataset.wz) : on.add(t.dataset.wz); sync(); return; }
        const n = e.target.closest('[data-wz-name]');
        if (n) {
          const k = n.dataset.wzName;
          const name = await askText('새 폴더 이름', { value: titles.get(k), confirm: '바꾸기' });
          if (name) titles.set(k, name);
          sync();
        }
      });
      modal.querySelectorAll('[data-wz-mode]').forEach((b) => { b.onclick = () => close({ mode: b.dataset.wzMode }); });
      modal.querySelector('[data-x]').onclick = () => close(null);
      modal.querySelector('[data-ok]').onclick = () => close({ apply: true });
      bindReadAll(modal, close, () => openWizard(mode));
      sync();
    },
  );
  if (!act) return;
  if (act.mode) { if (act.mode !== mode) openWizard(act.mode); else openWizard(mode); return; }
  const picked = groups.filter((g) => on.has(g.key));
  const fresh = picked.filter((g) => !g.folderId).length;
  let skipped = 0;
  await save(`정리 마법사: ${fresh ? `새 폴더 ${fresh}개 · ` : ''}봇 ${picked.reduce((n, g) => n + g.ids.length, 0)}개`, (o) => {
    let out = o;
    skipped = 0;
    const loose = new Set(out.filter((x) => typeof x === 'string'));
    for (const g of picked) {
      const ids = g.ids.filter((id) => loose.has(id));
      if (!ids.length) continue;
      if (g.folderId) {
        // 「있는 폴더에 추가」로 확인한 제안인데 그 사이 폴더가 지워졌으면 새로 만들지 않고 건너뛴다.
        if (!findFolder(out, g.folderId)) { skipped++; continue; }
        out = moveBotsToFolder(out, ids, g.folderId);
      } else out = createFolder(out, titles.get(g.key), ids).order;
      for (const id of ids) loose.delete(id);
    }
    return out;
  });
  if (skipped) toast(`그 사이 지워진 폴더 ${skipped}개에 넣을 제안은 건너뛰었습니다`, { error: true, ms: 5000 });
}

// ── ⑤ 보관함 제안 ──

function archiveFinished() {
  const lid = labelStore.state.opts.finish;
  return lid ? Object.entries(labelStore.state.tags).filter(([, l]) => l.includes(lid)).map(([b]) => b) : [];
}

function archiveList(days, folderId) {
  let list = archiveCandidates(ui.order, roster.chars, { days, archiveId: archiveFolderId(), finished: archiveFinished() });
  if (folderId) {
    const set = new Set(folderId === ROOT ? currentModel().root : currentModel().folders.find((f) => f.id === folderId)?.data || []);
    list = list.filter((x) => set.has(x.id));
  }
  return list;
}

// 첫 화면 띠. 즐겨찾기 봇은 세지 않는다.
function archiveBannerHtml() {
  const a = plusStore.state.archive;
  if (!a.on || ui.reorder || Date.now() < a.snooze) return '';
  const n = archiveList(a.days).filter((x) => !favIsStar(x.id)).length;
  if (n < ARCHIVE_MIN) return '';
  return `<div class="fm-arch-banner"><span class="fm-arch-ic">${icon('box')}</span><div><b>${a.days}일 넘게 대화하지 않았거나 다 본 봇이 ${n}개 있어요</b><small>보관함 폴더로 옮기면 사이드바가 짧아집니다. 채팅은 그대로 남습니다.</small></div>
    <button class="fm-btn" data-act="archive-snooze">나중에</button><button class="fm-btn primary" data-act="archive">골라서 옮기기</button></div>`;
}

async function openArchive(opts = {}) {
  let days = plusStore.state.archive.days;
  const folderId = opts.folder || '';
  let picked = null;
  const folderName = folderId ? (folderId === ROOT ? '폴더 밖' : folderById(folderId)?.name || '폴더') : '';
  const act = await openModal(
    `<h3 id="fm-dialog-title">${icon('box')} 보관함으로 옮길 봇${folderName ? ` · ${esc(folderName)}` : ''}</h3>
     <p class="fm-desc">오래 대화하지 않은 봇${labelStore.state.opts.finish ? `과 「${esc(labelText(labelDef(labelStore.state.opts.finish) || { name: '' }))}」 라벨이 붙은 봇` : ''}입니다. 즐겨찾는 봇은 처음엔 체크되어 있지 않습니다. 보관함 폴더가 없으면 「${ARCHIVE_NAME}」를 만듭니다.</p>
     <div class="fm-wz-modes"><span>기준</span><div class="fm-fav-sort" role="group">${[30, 60, 90].map((d) => `<button data-days="${d}">${d}일</button>`).join('')}</div></div>
     ${unreadNote(orderBotIds(ui.order), '후보')}
     <div class="fm-arch-list" data-rows></div>
     <div class="fm-modal-actions"><span class="fm-count-note" data-sum></span><span class="fm-spacer"></span><button class="fm-btn" data-x>취소</button><button class="fm-btn primary" data-ok>보관함으로</button></div>`,
    (modal, close) => {
      modal.classList.add('fm-big');
      const rows = modal.querySelector('[data-rows]');
      let list = [];
      const draw = () => {
        list = archiveList(days, folderId);
        if (!picked) picked = new Set(list.filter((x) => !favIsStar(x.id)).map((x) => x.id));
        for (const id of [...picked]) if (!list.some((x) => x.id === id)) picked.delete(id);
        rerender(rows, list.map((x) => {
          const on = picked.has(x.id);
          const c = roster.chars.get(x.id);
          const why = x.finished ? `${labelText(labelDef(labelStore.state.opts.finish) || { name: '다 봄' })}${x.days !== null ? ` · ${x.days}일 전` : ''}` : `${x.days}일 전`;
          return `<button class="fm-arch-row${on ? ' on' : ''}" data-arch="${esc(x.id)}" role="checkbox" aria-checked="${on}"><span class="fm-cb"></span>${avatarHtml(c, x.id)}<span class="fm-arch-t"><b>${esc(c.name)}</b><small>${esc(why)} · ${esc(favFolderName(x.id))}${favIsStar(x.id) ? ' · ★ 즐겨찾기' : ''}</small></span></button>`;
        }).join('') || `<div class="fm-empty">${days}일 넘게 대화하지 않은 봇이 없습니다</div>`);
        modal.querySelectorAll('[data-days]').forEach((b) => { const on = +b.dataset.days === days; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
        modal.querySelector('[data-sum]').textContent = `${list.length}개 중 ${picked.size}개 선택`;
        const ok = modal.querySelector('[data-ok]');
        ok.disabled = !picked.size;
        ok.textContent = picked.size ? `${picked.size}개 보관함으로` : '보관함으로';
        lazyAvatars(rows);
      };
      rows.addEventListener('click', (e) => {
        const r = e.target.closest('[data-arch]');
        if (!r) return;
        picked.has(r.dataset.arch) ? picked.delete(r.dataset.arch) : picked.add(r.dataset.arch);
        draw();
      });
      modal.querySelectorAll('[data-days]').forEach((b) => { b.onclick = () => { days = +b.dataset.days; picked = null; draw(); }; });
      modal.querySelector('[data-x]').onclick = () => close(null);
      modal.querySelector('[data-ok]').onclick = () => close([...picked]);
      bindReadAll(modal, close, () => openArchive(opts));
      draw();
    },
  );
  // 기준 일수는 실제로 옮겼을 때만 기억한다(둘러보다 취소하면 그대로).
  if (act && act.length && days !== plusStore.state.archive.days) plusStore.change({ k: 'archive', set: { days } }).catch(() => {});
  if (act && act.length) await archiveMove(act, `보관함으로 ${act.length}개`);
}

async function archiveSnooze() {
  await plusStore.change({ k: 'archive', set: { snooze: Date.now() + 7 * DAY_MS } }).catch(() => {});
  renderMain(true);
  toast('7일 동안 보관함 제안을 띄우지 않습니다. 설정에서 끌 수도 있습니다');
}

// ── ⑥ 폴더 그림 한 번에 ──

function templateRank(name) {
  return TEMPLATES.map((t, i) => [t, templateScore(t, name), i]).sort((a, b) => b[1] - a[1] || a[2] - b[2]);
}

async function openBatchIcons() {
  const folders = currentModel().folders.filter((f) => !f.imgFile);
  if (!folders.length) { toast('모든 폴더에 그림이 있습니다'); return; }
  const pick = new Map();
  const on = new Set();
  const alts = new Map();
  for (const f of folders) {
    const ranked = templateRank(f.name);
    const good = ranked.filter((r) => r[1] > 0).map((r) => r[0]);
    const list = [...good, ...TEMPLATES.filter((t) => t.cat === '관리' && !good.includes(t))].slice(0, 4);
    alts.set(f.id, list);
    pick.set(f.id, list[0]);
    if (good.length) on.add(f.id);
  }
  let withText = false;
  const body = () => folders.map((f) => {
    const t = pick.get(f.id);
    const checked = on.has(f.id);
    return `<div class="fm-bi${checked ? '' : ' off'}"><button class="fm-lrow ${checked ? 'on' : ''}" data-bi="${esc(f.id)}" role="checkbox" aria-checked="${checked}" aria-label="${esc(f.name)} 적용"><span class="fm-cb"></span></button>
      <div class="fm-bi-row">${folderThumb(f)}<span class="fm-bi-arrow">→</span><span class="fm-thumb fm-bi-new"><img src="${t.thumb}" alt=""></span></div>
      <b>${esc(f.name || '이름 없음')}</b>
      <div class="fm-bi-alts">${alts.get(f.id).map((a) => `<button class="${a === t ? 'on' : ''}" data-bi-alt="${esc(f.id)}" data-slug="${a.slug}" title="${esc(a.name)}"><img src="${a.thumb}" alt="${esc(a.name)}"></button>`).join('')}</div></div>`;
  }).join('');
  const act = await openModal(
    `<h3 id="fm-dialog-title">${icon('image')} 폴더 그림 한 번에</h3>
     <p class="fm-desc">그림 없는 폴더 ${folders.length}개에 이름에 어울리는 템플릿을 추천합니다. 아래 작은 그림으로 다른 후보를 고를 수 있고, 체크한 폴더만 그림을 받아 저장합니다.</p>
     <div class="fm-set-row"><div><b>글씨도 폴더 이름으로</b><small>종이판이 있는 템플릿은 폴더 이름(8자까지)을 새로 씁니다</small></div>${favSwitchHtml(false, 'data-bi-text', '글씨도 폴더 이름으로')}</div>
     <div class="fm-bis" data-rows>${body()}</div>
     <p class="fm-note" data-progress hidden></p>
     <div class="fm-modal-actions"><span class="fm-count-note" data-sum></span><span class="fm-spacer"></span><button class="fm-btn" data-x>취소</button><button class="fm-btn primary" data-ok>적용</button></div>`,
    (modal, close) => {
      modal.classList.add('fm-big');
      const rows = modal.querySelector('[data-rows]');
      let busy = false;
      const sync = () => {
        rerender(rows, body());
        modal.querySelector('[data-sum]').textContent = `${on.size}개 적용 · 그림 ${on.size}장 받기`;
        modal.querySelector('[data-ok]').disabled = !on.size || busy;
        lazyAvatars(rows);
      };
      rows.addEventListener('click', (e) => {
        if (busy) return;
        const c = e.target.closest('[data-bi]');
        if (c) { on.has(c.dataset.bi) ? on.delete(c.dataset.bi) : on.add(c.dataset.bi); sync(); return; }
        const a = e.target.closest('[data-bi-alt]');
        if (a) { pick.set(a.dataset.biAlt, TEMPLATES.find((t) => t.slug === a.dataset.slug)); on.add(a.dataset.biAlt); sync(); }
      });
      const sw = modal.querySelector('[data-bi-text]');
      sw.onclick = () => { withText = !withText; sw.classList.toggle('on', withText); sw.setAttribute('aria-checked', String(withText)); };
      modal.querySelector('[data-x]').onclick = () => { if (!busy) close(null); };
      modal.querySelector('[data-ok]').onclick = async () => {
        if (busy) return;
        busy = true;
        sync();
        const prog = modal.querySelector('[data-progress]');
        prog.hidden = false;
        const done = new Map();
        const todo = folders.filter((f) => on.has(f.id));
        try {
          for (const [i, f] of todo.entries()) {
            prog.textContent = `그림 받는 중 ${i + 1} / ${todo.length} · ${f.name || ''}`;
            const t = pick.get(f.id);
            const bytes = withText && t.editable !== false && t.signs?.length
              ? await canvasBytes(await composeSign(t, [...(f.name || '')].slice(0, SIGN_MAX).join('') || t.name))
              : await fetchTemplateFile(`${t.slug}.webp`);
            const path = await Risuai.saveAsset(bytes);
            if (!path) throw new Error('그림을 저장하지 못했습니다');
            done.set(f.id, path);
          }
          close(done);
        } catch (err) {
          toastError(err);
          if (done.size) close(done);
          else { busy = false; prog.hidden = true; sync(); }
        }
      };
      sync();
    },
  );
  if (!act || !act.size) return;
  let kept = 0;
  await save(`폴더 그림 ${act.size}개`, (o) => {
    let out = o;
    kept = 0;
    for (const [fid, path] of act) {
      const ref = findFolder(out, fid);
      // 그 사이 다른 곳에서 그림을 넣은 폴더는 덮어쓰지 않는다.
      if (!ref) continue;
      if (ref.folder.imgFile) { kept++; continue; }
      out = updateFolder(out, fid, { imgFile: path });
    }
    return out;
  });
  if (kept) toast(`그 사이 그림이 생긴 폴더 ${kept}개는 그대로 두었습니다`, { ms: 5000 });
}

// ── ⑨ 통계 ──

async function openStats() {
  const s = folderStats(ui.order, roster.chars);
  const max = Math.max(1, ...s.rows.map((r) => r.total), s.root.total);
  const bar = (key, name, color, r) => `<button class="fm-stat-row" data-stat="${esc(key)}" title="안 쓴 봇 보기"><span class="fm-stat-n"><i class="fm-dot" style="--c:${color}"></i>${esc(name)}</span>
    <span class="fm-stat-tr"><i class="a" style="width:${(r.active / max) * 100}%"></i><i class="s" style="width:${((r.total - r.active) / max) * 100}%"></i></span><span class="fm-stat-v">${r.active} / ${r.total}</span></button>`;
  const oldest = s.oldest ? `${botName(s.oldest.id) || '…'} (${Math.floor((Date.now() - s.oldest.last) / DAY_MS)}일)` : '—';
  const act = await openModal(
    `<h3 id="fm-dialog-title">${icon('chart')} 통계</h3>
     <div class="fm-stats"><div><small>전체 봇</small><b>${s.total}</b></div><div><small>폴더</small><b>${s.folders}</b></div><div><small>30일 안에 대화</small><b class="ok">${s.active}</b></div><div><small>폴더 밖</small><b class="warn">${s.root.total}</b></div></div>
     ${unreadNote(orderBotIds(ui.order), '통계')}
     <div class="fm-stat-legend"><span><i class="a"></i>30일 안에 대화</span><span><i class="s"></i>안 씀·모름</span><small>막대를 누르면 그 폴더의 오래된 봇을 보관함 후보로 봅니다</small></div>
     <div class="fm-stat-rows">${s.rows.map((r) => bar(r.id, r.name, FOLDER_HEX[r.color] || FOLDER_HEX.default, r)).join('')}${bar(ROOT, '폴더 밖', FOLDER_HEX.default, s.root)}</div>
     <p class="fm-desc fm-stat-foot">가장 많이 쓴 폴더: ${esc(s.top ? s.top.name : '—')} · 가장 오래 묵은 봇: ${esc(oldest)}</p>
     <div class="fm-modal-actions"><button class="fm-btn primary" data-x>닫기</button></div>`,
    (modal, close) => {
      modal.classList.add('fm-big');
      modal.querySelector('[data-x]').onclick = () => close(null);
      modal.querySelectorAll('[data-stat]').forEach((b) => { b.onclick = () => close(b.dataset.stat); });
      bindReadAll(modal, close, openStats);
    },
  );
  if (act) openArchive({ folder: act });
}

// ── ⑦ 명령 창 ──

const PALETTE_CMDS = [
  ['create-folder', 'plus', '새 폴더'],
  ['wizard', 'wand', '정리 마법사'],
  ['dups', 'copy', '중복 봇 찾기'],
  ['archive', 'box', '보관함 정리'],
  ['snapshots', 'history', '배치 기록'],
  ['icons', 'image', '폴더 그림 한 번에'],
  ['stats', 'chart', '통계'],
  ['check', 'scan', '정리 점검'],
  ['fav-view', 'star', '즐겨찾는 봇'],
  ['reorder', 'move', '순서 편집'],
  ['sidebar', 'sidebar', '사이드바 배열'],
  ['settings', 'gear', '설정 · 테마'],
  ['reload', 'refresh', '새로 불러오기'],
];

function paletteBotActions(id) {
  const f = currentModel().folders.find((x) => x.data.includes(id));
  return [
    ['locate', 'locate', '사이드바에서 찾기'],
    ['move', 'folder', '다른 폴더로 옮기기…'],
    ['star', 'star', favIsStar(id) ? '즐겨찾기 해제' : '즐겨찾기에 추가'],
    ['label', 'tag', '라벨 붙이기…'],
    ...(f ? [['open', 'layers', `「${f.name || '폴더'}」 열기`]] : []),
  ];
}

async function openPalette() {
  if (!ui.app || ui.reorder || document.querySelector('.fm-modal-back')) return;
  const st = { q: '', sel: 0, bot: null, items: [] };
  const build = () => {
    const q = st.q.trim().toLowerCase();
    const items = [];
    if (st.bot) {
      for (const [a, i, t] of paletteBotActions(st.bot)) items.push({ kind: 'act', id: a, icon: i, text: t });
      return items;
    }
    const ids = [...new Set(orderBotIds(ui.order))];
    const bots = q ? ids.filter((id) => botName(id).toLowerCase().includes(q)).slice(0, 8) : recentRank(ids, recentStore.state.list, roster.chars, { count: 5 });
    for (const id of bots) items.push({ kind: 'bot', id, text: botName(id) || '…', sub: favFolderName(id) });
    const folders = currentModel().folders.filter((f) => !q || (f.name || '').toLowerCase().includes(q)).slice(0, q ? 5 : 0);
    for (const f of folders) items.push({ kind: 'folder', id: f.id, text: f.name || '이름 없음', sub: `봇 ${f.data.length}개` });
    for (const [a, i, t] of PALETTE_CMDS) if (!q || t.toLowerCase().includes(q)) items.push({ kind: 'cmd', id: a, icon: i, text: t });
    return items;
  };
  const group = { bot: q => (q ? '봇' : '최근 대화'), folder: () => '폴더', cmd: () => '명령', act: () => `「${botName(st.bot) || '봇'}」에 할 일` };
  const draw = (modal) => {
    st.items = build();
    st.sel = Math.max(0, Math.min(st.sel, st.items.length - 1));
    let last = '';
    modal.querySelector('[data-list]').innerHTML = st.items.map((it, i) => {
      const g = group[it.kind](st.q.trim());
      const head = g !== last ? `<div class="fm-pal-g">${esc(g)}</div>` : '';
      last = g;
      const lead = it.kind === 'bot' ? avatarHtml(roster.chars.get(it.id), it.id) : it.kind === 'folder' ? folderThumb(folderById(it.id) || {}) : `<span class="fm-thumb plain">${icon(it.icon)}</span>`;
      return `${head}<div class="fm-pal-op${i === st.sel ? ' on' : ''}" data-i="${i}" role="option" aria-selected="${i === st.sel}">${lead}<b>${esc(it.text)}</b>${it.sub ? `<small>${esc(it.sub)}</small>` : ''}${i === st.sel && it.kind === 'bot' ? '<em>Enter 찾기 · Tab 할 일</em>' : ''}</div>`;
    }).join('') || '<div class="fm-empty">맞는 것이 없습니다</div>';
    modal.querySelector('[data-list] .on')?.scrollIntoView?.({ block: 'nearest' });
    lazyAvatars(modal.querySelector('[data-list]'));
    const input = modal.querySelector('input');
    input.placeholder = st.bot ? `「${botName(st.bot) || '봇'}」에 할 일 · Backspace 뒤로` : '봇·폴더·명령 검색';
  };
  const run = await openModal(
    `<div class="fm-pal"><label class="fm-pal-in">${icon('command')}<input type="text" aria-label="명령 검색" autocomplete="off" spellcheck="false"></label>
     <div class="fm-pal-list" data-list role="listbox"></div>
     <div class="fm-pal-ft"><span>↑↓ 이동</span><span>Enter 실행</span><span>Tab 봇에 할 일</span><span>Esc 닫기</span></div></div>`,
    (modal, close) => {
      modal.classList.add('fm-palette');
      const input = modal.querySelector('input');
      const pick = (i) => {
        const it = st.items[i];
        if (!it) return;
        if (it.kind === 'act') close({ act: it.id, bot: st.bot });
        else close(it);
      };
      input.addEventListener('input', () => { st.q = input.value; st.sel = 0; draw(modal); });
      input.addEventListener('keydown', (e) => {
        if (e.isComposing) return;
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); st.sel = (st.sel + (e.key === 'ArrowDown' ? 1 : -1) + st.items.length) % Math.max(1, st.items.length); draw(modal); return; }
        if (e.key === 'Enter') { e.preventDefault(); pick(st.sel); return; }
        if (e.key === 'Tab') {
          e.preventDefault();
          const it = st.items[st.sel];
          if (!st.bot && !e.shiftKey && it && it.kind === 'bot') { st.bot = it.id; st.qSaved = st.q; st.q = ''; input.value = ''; st.sel = 0; draw(modal); }
          else if (st.bot && e.shiftKey) { st.bot = null; st.q = st.qSaved || ''; input.value = st.q; st.sel = 0; draw(modal); }
          return;
        }
        if (e.key === 'Backspace' && st.bot && !input.value) { e.preventDefault(); st.bot = null; st.q = st.qSaved || ''; input.value = st.q; st.sel = 0; draw(modal); return; }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); e.stopPropagation(); close(null); }
      });
      modal.querySelector('[data-list]').addEventListener('click', (e) => {
        const op = e.target.closest('[data-i]');
        if (!op) return;
        const it = st.items[+op.dataset.i];
        if (it && it.kind === 'bot' && !st.bot && e.target.closest('em')) { st.bot = it.id; st.q = ''; input.value = ''; st.sel = 0; draw(modal); return; }
        pick(+op.dataset.i);
      });
      draw(modal);
      input.focus(); // 바로 이어 친 글자도 받도록 기다리지 않고 포커스
    },
  );
  if (!run) return;
  if (run.kind === 'cmd') { ACTIONS[run.id]?.(); return; }
  if (run.kind === 'folder') { openView(run.id); return; }
  if (run.kind === 'bot') { locateBot(run.id); return; }
  if (run.act) {
    const id = run.bot;
    if (run.act === 'locate') locateBot(id);
    else if (run.act === 'move') {
      const target = await pickFolder('봇 옮기기', { mode: 'move', ids: [id] });
      if (target === '__new__') { ui.selected = new Set([id]); newFolderFromSelection(); }
      else if (target) save(`${botName(id) || '봇'} → ${folderById(target)?.name || '폴더'}`, (o) => moveBotsToFolder(o, [id], target));
    } else if (run.act === 'star') favToggleStar(id);
    else if (run.act === 'label') openLabelPicker([id]);
    else if (run.act === 'open') { const f = currentModel().folders.find((x) => x.data.includes(id)); if (f) openView(f.id); }
  }
}

const PLUS_CSS = `
.fm-modal.fm-big{width:min(760px,100%)}
.fm-badge{display:inline-block;font-size:11px;font-weight:600;padding:1px 8px;border-radius:999px;background:var(--accent-bg);color:var(--accent-2);vertical-align:1px}
.fm-badge.warn{background:#3a2a14;color:#f0b860}
.fm-count-note{font-size:12px;color:var(--muted)}
.fm-modal-actions .fm-spacer{flex:1}
.fm-cb{width:16px;height:16px;border-radius:5px;border:1.5px solid var(--line-2);display:inline-grid;place-items:center;flex:none;background:var(--bg)}
.on>.fm-cb,.fm-lrow.on .fm-cb{background:var(--accent);border-color:var(--accent)}
.on>.fm-cb::after,.fm-lrow.on .fm-cb::after{content:"";width:8px;height:4px;border:2px solid var(--button-text,#fff);border-top:0;border-right:0;transform:translateY(-1px) rotate(-45deg)}
.fm-lrow.some .fm-cb{background:var(--accent-bg);border-color:var(--accent)}
.fm-lrow.some .fm-cb::after{content:"";width:8px;height:2px;background:var(--accent-2)}
.fm-lrows{display:grid;gap:4px;margin-bottom:8px}
.fm-lrow{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:10px;text-align:left;color:var(--text)}
.fm-lrows .fm-lrow{border:1px solid var(--line);background:var(--surface)}
.fm-lrow:hover{background:var(--surface-2)}
.fm-lrow small{margin-left:auto;font-size:11px;color:var(--faint)}
.fm-lbl{display:inline-flex;align-items:center;gap:3px;font-size:10.5px;line-height:16px;padding:0 6px;border-radius:999px;background:color-mix(in srgb,var(--c) 28%,transparent);color:color-mix(in srgb,var(--c) 45%,#fff);white-space:nowrap}
:root:is([data-fm-theme=mint],[data-fm-theme=blue]) .fm-lbl{background:color-mix(in srgb,var(--c) 18%,#fff);color:color-mix(in srgb,var(--c) 75%,#000)}
.fm-lbl.new{--c:#5f6779}
.fm-lrows .fm-lbl{font-size:12px;line-height:20px;padding:0 9px}
.fm-meta .fm-lbls{display:inline-flex;gap:3px;overflow:hidden;flex:0 0 auto;max-width:72%}
.fm-tagbtn{width:26px;height:28px;border-radius:8px;display:grid;place-items:center;color:var(--faint);opacity:0;transition:opacity .12s,background-color .12s}
.fm-tagbtn .fm-i{width:15px;height:15px}
.fm-tagbtn.on{opacity:.8;color:var(--accent-2)}
.fm-card:hover .fm-tagbtn,.fm-card:focus-within .fm-tagbtn,.fm-tagbtn:focus-visible{opacity:1}
.fm-tagbtn:hover{background:var(--surface-2);color:var(--accent-2)}
.fm-app.is-reorder .fm-tagbtn{display:none}
@media (hover:none){.fm-tagbtn{display:none}.fm-tagbtn.on{display:grid;opacity:.8}}
.fm-lbl-dot{color:var(--c);font-size:14px}
.fm-lbl-dot i{width:10px;height:10px;border-radius:50%;background:var(--c)}
.fm-lbl-head{padding-left:4px}
.fm-rail-fold{display:inline-flex;align-items:center;gap:5px;padding:3px 6px;border-radius:6px;font:inherit;letter-spacing:inherit;color:inherit}
.fm-rail-fold:hover{background:var(--surface-2);color:var(--text)}
.fm-rail-fold .fm-i{width:12px;height:12px;transition:transform .15s}
.fm-rail-fold.folded .fm-i{transform:rotate(-90deg)}
.fm-rail-fold i{font-style:normal;font-weight:600;padding:0 6px;border-radius:999px;background:var(--surface-2);color:var(--muted)}
.fm-lbl-chip.folded{border:1px dashed var(--line-2)}
@media (prefers-reduced-motion:reduce){.fm-rail-fold .fm-i{transition:none}}
.fm-rail-add{width:20px;height:20px;border-radius:6px;display:grid;place-items:center;color:var(--faint)}
.fm-rail-add:hover{background:var(--surface-2);color:var(--text)}
.fm-rail-add .fm-i{width:13px;height:13px}
.fm-lab-edit{display:flex;gap:8px;margin-top:10px}
.fm-modal .fm-lab-emoji{width:64px;text-align:center;font-size:18px}
.fm-chips{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 10px}
.fm-chips button{font-size:12px;padding:5px 10px;border-radius:999px;border:1px solid var(--line-2);color:var(--muted);background:var(--surface)}
.fm-chips button.on{border-color:var(--accent);background:var(--accent-bg);color:var(--text);font-weight:650}
.fm-sub-row{padding-left:14px}
.fm-sub-row.dim{opacity:.45}
.fm-snaps{display:grid;gap:8px;position:relative;padding-left:18px}
.fm-snaps::before{content:"";position:absolute;left:6px;top:10px;bottom:10px;width:2px;background:var(--line-2)}
.fm-snap{position:relative;display:flex;gap:12px;align-items:center;padding:10px 12px;border-radius:12px;background:var(--surface);border:1px solid var(--line)}
.fm-snap::before{content:"";position:absolute;left:-17px;top:16px;width:10px;height:10px;border-radius:50%;background:var(--bg);border:2px solid var(--accent)}
.fm-snap.cur::before{background:var(--accent)}
.fm-snap.ext::before{border-color:#e0a63a}
.fm-snap-text{flex:1;min-width:0}
.fm-snap-text b{font-size:13px}
.fm-snap-text small{display:block;font-size:11.5px;color:var(--muted)}
.fm-diff{font-size:11.5px;color:var(--muted);margin-top:2px}
.fm-diff .p{color:var(--ok)}.fm-diff .m{color:var(--danger)}
.fm-snap-acts{display:flex;gap:6px;flex:none}
.fm-dupes,.fm-wzs{display:grid;gap:10px}
.fm-dupe{border:1px solid var(--line);border-radius:12px;overflow:hidden}
.fm-dupe-h{display:flex;align-items:center;gap:10px;padding:9px 12px;background:var(--surface)}
.fm-dupe-h b{font-size:13.5px}
.fm-dupe-h small{color:var(--faint);font-size:11.5px}
.fm-dupe-h .fm-link{margin-left:auto}
.fm-dupe-row{display:grid;grid-template-columns:auto minmax(0,1.4fr) minmax(0,1fr) auto auto;align-items:center;gap:10px;padding:6px 12px;border-top:1px solid var(--line);font-size:12.5px}
.fm-dupe-row .fm-lrow{padding:4px}
.fm-dupe-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fm-dupe-where{display:inline-flex;align-items:center;gap:4px;color:var(--muted);overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.fm-dupe-where .fm-i{width:13px;height:13px;flex:none}
.fm-dupe-last{color:var(--faint);font-size:11.5px;white-space:nowrap}
.fm-btn.fm-sm{height:28px;padding:0 9px;font-size:11.5px}
.fm-btn.fm-sm .fm-i{width:13px;height:13px}
.fm-wz-modes{display:flex;align-items:center;gap:10px;margin:0 0 12px;font-size:12px;color:var(--muted)}
.fm-wz{padding:10px 12px;border-radius:12px;background:var(--surface);border:1px solid var(--line)}
.fm-wz.off{opacity:.55}
.fm-wz-h{display:flex;align-items:center;gap:10px;margin-bottom:8px}
.fm-wz-h .fm-lrow{padding:4px}
.fm-wz-h .fm-thumb{width:38px;height:38px;border-radius:11px}
.fm-wz-t{flex:1;min-width:0}
.fm-wz-t b{display:block;font-size:13.5px}.fm-wz-t b small{font-weight:400;color:var(--faint);font-size:11.5px}
.fm-wz-t>small{display:block;color:var(--faint);font-size:11.5px}
.fm-why{font-size:11px;color:var(--accent-2);background:var(--accent-bg);padding:2px 8px;border-radius:999px;white-space:nowrap}
.fm-minis{display:flex;flex-wrap:wrap;gap:4px}
.fm-mini{display:inline-flex;align-items:center;gap:5px;padding:3px 9px 3px 3px;border-radius:999px;background:var(--surface-2);font-size:11.5px;max-width:180px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.fm-mini.more{padding:3px 9px;color:var(--muted)}
.fm-av.sm{width:20px;height:20px;border-radius:50%;font-size:9px;flex:none}
.fm-arch-banner{display:flex;align-items:center;gap:12px;padding:10px 12px;margin:0 0 14px;border-radius:12px;border:1px solid #5a4020;background:#1f1b14}
.fm-arch-banner div{flex:1;min-width:0}
.fm-arch-banner b{display:block;font-size:13px}
.fm-arch-banner small{display:block;font-size:11.5px;color:var(--muted)}
.fm-arch-ic{color:#e0a63a;display:grid}.fm-arch-ic .fm-i{width:24px;height:24px}
:root:is([data-fm-theme=mint],[data-fm-theme=blue]) .fm-arch-banner{background:#fff6e6;border-color:#e2c48c}
.fm-arch-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:6px;max-height:min(52vh,460px);overflow:auto;padding:2px}
.fm-arch-row{display:flex;align-items:center;gap:9px;height:48px;padding:0 10px;border-radius:11px;background:var(--surface);border:1px solid var(--line);text-align:left}
.fm-arch-row.on{border-color:var(--accent)}
.fm-arch-t{min-width:0;flex:1}
.fm-arch-t b{display:block;font-size:12.5px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.fm-arch-t small{display:block;font-size:11px;color:var(--faint);overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.fm-bis{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin-top:8px}
.fm-bi{position:relative;padding:10px;border-radius:12px;background:var(--surface);border:1px solid var(--line);text-align:center}
.fm-bi.off{opacity:.55}
.fm-bi>.fm-lrow{position:absolute;top:4px;left:4px;padding:4px}
.fm-bi-row{display:flex;align-items:center;justify-content:center;gap:6px;margin:6px 0}
.fm-bi-row .fm-thumb{width:44px;height:44px;border-radius:12px}
.fm-bi-new{background:transparent;overflow:hidden}
.fm-bi-new img{width:100%;height:100%;object-fit:cover}
.fm-bi-arrow{color:var(--faint)}
.fm-bi b{font-size:12.5px;display:block;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.fm-bi-alts{display:flex;justify-content:center;gap:4px;margin-top:6px}
.fm-bi-alts button{width:26px;height:26px;border-radius:7px;overflow:hidden;border:1px solid var(--line-2);padding:0}
.fm-bi-alts button.on{outline:2px solid var(--accent);outline-offset:1px}
.fm-bi-alts img{width:100%;height:100%;object-fit:cover;display:block}
.fm-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:10px 0 12px}
.fm-stats div{padding:10px 12px;border-radius:12px;background:var(--surface);border:1px solid var(--line)}
.fm-stats small{font-size:11.5px;color:var(--faint)}
.fm-stats b{display:block;font-size:22px;margin-top:2px}
.fm-stats b.ok{color:var(--ok)}.fm-stats b.warn{color:#e0a63a}
.fm-stat-legend{display:flex;flex-wrap:wrap;align-items:center;gap:12px;font-size:11.5px;color:var(--muted);margin-bottom:6px}
.fm-stat-legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px;vertical-align:-1px}
.fm-stat-legend small{margin-left:auto;color:var(--faint)}
.fm-stat-rows{display:grid;gap:2px;max-height:min(46vh,420px);overflow:auto}
.fm-stat-row{display:grid;grid-template-columns:140px 1fr 64px;align-items:center;gap:10px;padding:5px 6px;border-radius:8px;text-align:left}
.fm-stat-row:hover{background:var(--surface)}
.fm-stat-n{display:flex;align-items:center;gap:6px;font-size:12px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.fm-stat-tr{display:flex;height:12px;border-radius:4px;overflow:hidden;background:var(--surface-2)}
.fm-stat-tr i{display:block}
.fm-stat-tr .a,.fm-stat-legend .a{background:var(--accent)}
.fm-stat-tr .s,.fm-stat-legend .s{background:var(--line-2)}
.fm-stat-v{text-align:right;font-size:11.5px;color:var(--muted)}
.fm-stat-foot{margin-top:10px}
.fm-modal-back:has(.fm-palette){place-items:start center;padding-top:9vh}
.fm-modal.fm-palette{width:min(560px,100%);padding:0;overflow:hidden}
.fm-pal-in{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--line)}
.fm-pal-in .fm-i{color:var(--faint)}
.fm-pal-in input{flex:1;min-width:0;border:0;outline:none;background:transparent;font-size:15px}
.fm-pal-list{max-height:min(56vh,420px);overflow:auto;padding:4px 0}
.fm-pal-g{font-size:11px;color:var(--faint);padding:10px 16px 4px}
.fm-pal-op{display:flex;align-items:center;gap:10px;padding:7px 16px;cursor:pointer}
.fm-pal-op.on{background:var(--accent-bg)}
.fm-pal-op .fm-av,.fm-pal-op .fm-thumb{width:26px;height:26px;border-radius:7px;font-size:10px}
.fm-pal-op .fm-thumb .fm-i{width:15px;height:15px}
.fm-pal-op b{font-size:13px;font-weight:600;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.fm-pal-op small{color:var(--faint);font-size:11.5px;white-space:nowrap}
.fm-pal-op em{margin-left:auto;font-style:normal;font-size:11px;color:var(--faint);white-space:nowrap}
.fm-pal-ft{display:flex;flex-wrap:wrap;gap:14px;padding:8px 16px;border-top:1px solid var(--line);font-size:11px;color:var(--faint)}
/* 마우스: 봇 칸 버튼은 이름 위에 겹쳐 띄우고(자리 차지 안 함), 켜진 별·라벨만 늘 보인다 */
@media (hover:hover){
  .fm-card,.view-list .fm-card{grid-template-columns:34px minmax(0,1fr)}
  .view-list .fm-card{grid-template-columns:30px minmax(0,1fr)}
  .fm-acts{position:absolute;right:4px;top:50%;transform:translateY(-50%);padding-left:16px;background:linear-gradient(90deg,transparent,var(--surface) 16px);border-radius:0 9px 9px 0}
  .fm-card.sel .fm-acts{background:linear-gradient(90deg,transparent,var(--accent-bg) 16px)}
  .fm-acts>*{display:none}
  .fm-acts>.on,.fm-card:hover .fm-acts>*,.fm-card:focus-within .fm-acts>*{display:grid}
  .fm-card:not(:hover):not(:focus-within) .fm-acts:not(:has(>.on)){display:none}
  .fm-app.is-reorder .fm-acts{display:none}
}
.fm-kbd{font-size:10.5px;padding:0 5px;border-radius:5px;border:1px solid var(--line-2);color:var(--faint);margin-left:4px}
.fm-search .fm-kbd{position:absolute;right:8px;top:50%;transform:translateY(-50%);margin:0;line-height:18px;background:var(--surface)}
.fm-search .fm-kbd:hover{color:var(--text);border-color:var(--accent)}
.fm-top .fm-search input{padding-right:58px}
.fm-search:focus-within .fm-kbd{display:none}
@media (max-width:640px){
  .fm-stats{grid-template-columns:repeat(2,1fr)}
  .fm-stat-row{grid-template-columns:96px 1fr 54px}
  .fm-dupe-row{grid-template-columns:auto minmax(0,1fr) auto;row-gap:2px}
  .fm-dupe-where,.fm-dupe-last{grid-column:2}
  .fm-snap{flex-wrap:wrap}.fm-snap-acts{width:100%;justify-content:flex-end}
  .fm-arch-banner{flex-wrap:wrap}.fm-arch-banner .fm-btn{flex:1}
  .fm-pal-ft{display:none}
}
`;

// 설정 창의 보관함 칸.
function archiveSettingsHtml(d) {
  return `<span class="fm-label">보관함 제안</span>
     <div class="fm-set-row"><div><b>📦 오래된 봇 보관함 제안</b><small>첫 화면 위에 한 줄 띠로 알려 주기만 합니다. 자동으로 옮기지 않습니다.</small></div>${favSwitchHtml(d.archOn, 'data-arch-on', '보관함 제안 켜기/끄기')}</div>
     <div class="fm-set-row fm-sub-row" data-arch-only><div><b>기준</b><small>이 기간 넘게 대화하지 않은 봇</small></div><div class="fm-fav-sort" role="group">${[30, 60, 90].map((n) => `<button data-arch-days="${n}">${n}일</button>`).join('')}</div></div>`;
}

function archiveSettingsBind(modal, d) {
  const sync = () => {
    const sw = modal.querySelector('[data-arch-on]');
    sw.classList.toggle('on', d.archOn);
    sw.setAttribute('aria-checked', String(d.archOn));
    modal.querySelectorAll('[data-arch-only]').forEach((el) => el.classList.toggle('dim', !d.archOn));
    modal.querySelectorAll('[data-arch-days]').forEach((b) => { const on = +b.dataset.archDays === d.archDays; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
  };
  modal.querySelector('[data-arch-on]').onclick = () => { d.archOn = !d.archOn; sync(); };
  modal.querySelectorAll('[data-arch-days]').forEach((b) => { b.onclick = () => { d.archDays = +b.dataset.archDays; sync(); }; });
  sync();
}

async function archiveSettingsSave(d) {
  const a = plusStore.state.archive;
  if (d.archOn !== a.on || d.archDays !== a.days) await plusStore.change({ k: 'archive', set: { on: d.archOn, days: d.archDays, snooze: d.archOn && !a.on ? 0 : a.snooze } });
}
