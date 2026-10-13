// 순서 편집 모드의 끌어 옮기기. 마우스와 터치를 Pointer Events 하나로 처리한다.
// 마우스는 5px 움직이면, 터치는 0.3초 길게 누르면 시작한다(그 전에 움직이면 스크롤로 둔다).
// 화면 DOM을 직접 옮기지 않고 ui.reorder.layout 을 고친 뒤 다시 그린다.

const drag = {
  pending: null,
  active: null,
  ghost: null,
  target: null,
  timer: null,
  raf: 0,
  point: null,
  droppedAt: 0,
  bound: false,
};

function layoutContainer(layout, key) {
  if (key === ROOT) return layout.root;
  return layout.folders.find((f) => f.id === key)?.data || null;
}

function dragIds(card) {
  const id = card.dataset.id;
  if (ui.selected.has(id) && ui.selected.size > 1) return ui.visible.filter((x, i, a) => ui.selected.has(x) && a.indexOf(x) === i);
  return [id];
}

function makeGhost(kind, source, count) {
  const g = document.createElement('div');
  if (kind === 'folder') {
    g.className = 'fm-ghost nav';
    const label = source.querySelector('.fm-nav-name, .fm-ftile-text b');
    g.innerHTML = source.querySelector('.fm-thumb').outerHTML + `<span class="fm-nav-name">${esc(label.textContent)}</span>`;
  } else {
    g.className = 'fm-ghost';
    g.innerHTML = source.querySelector('.fm-av').outerHTML + `<div class="fm-name">${esc(source.querySelector('.fm-name').textContent)}</div>` +
      (count > 1 ? `<span class="fm-ghost-count">${count}</span>` : '');
  }
  g.insertAdjacentHTML('beforeend', '<span class="fm-ghost-dest"></span>');
  document.body.append(g);
  return g;
}

function beginDrag(p) {
  const el = p.el;
  if (p.kind === 'bot') {
    const ids = dragIds(el);
    drag.active = { kind: 'bot', ids };
    ui.app.querySelectorAll('.fm-card').forEach((c) => c.classList.toggle('fm-dragging', ids.includes(c.dataset.id)));
    drag.ghost = makeGhost('bot', el, ids.length);
  } else {
    drag.active = { kind: 'folder', id: el.dataset.folder };
    el.classList.add('fm-dragging');
    drag.ghost = makeGhost('folder', el, 1);
  }
  try { navigator.vibrate?.(20); } catch {}
  moveGhost(p.x, p.y);
  autoScrollLoop();
}

// 미리보기는 화면 안(사방 8px)에 둔다. 터치는 손가락에 가리지 않게 위쪽에 띄운다.
function moveGhost(x, y) {
  drag.point = { x, y };
  const g = drag.ghost;
  if (!g) return;
  const w = g.offsetWidth;
  const h = g.offsetHeight;
  let gx = drag.pending?.touch ? x - w / 2 : x + 12;
  let gy = drag.pending?.touch ? y - h - 24 : y + 10;
  gx = Math.max(8, Math.min(innerWidth - w - 8, gx));
  gy = Math.max(8, Math.min(innerHeight - h - 8, gy));
  g.style.transform = `translate(${gx}px,${gy}px)`;
}

function destLabel(t) {
  if (!t) return '';
  const name = (id) => (id === ROOT ? '폴더 밖' : currentModel().folders.find((f) => f.id === id)?.name || '폴더');
  if (t.folder) return `${name(t.folder)} ${t.after ? '뒤' : '앞'}`;
  if (t.ref) return `${botName(t.ref) || '이 봇'} ${t.after ? '뒤' : '앞'}`;
  return `→ ${name(t.container)}`;
}

function clearMarks() {
  ui.app?.querySelectorAll('.fm-drop-before,.fm-drop-after,.fm-drop-into').forEach((el) => el.classList.remove('fm-drop-before', 'fm-drop-after', 'fm-drop-into'));
}

// 앞·뒤를 좌우로 볼지 위아래로 볼지는 실제 배치로 정한다(한 열 격자·목록·세로 줄은 위아래).
function horizontal(el) {
  const parent = el.parentElement;
  const cs = getComputedStyle(parent);
  if (cs.display === 'grid') return cs.gridTemplateColumns.trim().split(/\s+/).length > 1;
  if (cs.display === 'flex') return !cs.flexDirection.startsWith('column');
  return false;
}

function findTarget(x, y) {
  const hit = document.elementFromPoint(x, y);
  if (!hit || !ui.app.contains(hit)) return null;
  const a = drag.active;
  if (a.kind === 'folder') {
    const nav = hit.closest('.fm-nav[data-folder], .fm-ftile[data-folder]');
    if (!nav || nav.dataset.folder === a.id) return null;
    const r = nav.getBoundingClientRect();
    const after = horizontal(nav) ? x > r.left + r.width / 2 : y > r.top + r.height / 2;
    return { el: nav, mark: after ? 'fm-drop-after' : 'fm-drop-before', folder: nav.dataset.folder, after };
  }
  const card = hit.closest('.fm-card');
  if (card && !a.ids.includes(card.dataset.id)) {
    const r = card.getBoundingClientRect();
    const after = horizontal(card) ? x > r.left + r.width / 2 : y > r.top + r.height / 2;
    return { el: card, mark: after ? 'fm-drop-after' : 'fm-drop-before', container: card.dataset.container, ref: card.dataset.id, after };
  }
  if (card) return null;
  const into = hit.closest('.fm-grid[data-container], [data-drop]');
  if (into) return { el: into, mark: 'fm-drop-into', container: into.dataset.container || into.dataset.drop, ref: null };
  return null;
}

function updateTarget() {
  if (!drag.point) return;
  clearMarks();
  drag.target = findTarget(drag.point.x, drag.point.y);
  if (drag.target) drag.target.el.classList.add(drag.target.mark);
  const dest = drag.ghost?.querySelector('.fm-ghost-dest');
  if (dest) dest.textContent = destLabel(drag.target);
}

function applyDrop() {
  const t = drag.target;
  const a = drag.active;
  if (!t || !ui.reorder) return false;
  const layout = ui.reorder.layout;
  if (a.kind === 'folder') {
    const list = layout.folders;
    const from = list.findIndex((f) => f.id === a.id);
    const [moved] = list.splice(from, 1);
    let at = list.findIndex((f) => f.id === t.folder);
    if (t.after) at++;
    list.splice(at, 0, moved);
    return true;
  }
  const dest = layoutContainer(layout, t.container);
  if (!dest) return false;
  for (const f of layout.folders) f.data = f.data.filter((id) => !a.ids.includes(id));
  layout.root = layout.root.filter((id) => !a.ids.includes(id));
  const fresh = layoutContainer(layout, t.container);
  let at = t.ref ? fresh.indexOf(t.ref) : -1;
  if (at < 0) at = fresh.length;
  else if (t.after) at++;
  fresh.splice(at, 0, ...a.ids);
  return true;
}

function endDrag(commit) {
  clearTimeout(drag.timer);
  cancelAnimationFrame(drag.raf);
  drag.timer = null;
  const wasActive = !!drag.active;
  let changed = false;
  if (wasActive && commit) changed = applyDrop();
  drag.ghost?.remove();
  drag.ghost = null;
  if (ui.app) {
    clearMarks();
    ui.app.querySelectorAll('.fm-dragging').forEach((el) => el.classList.remove('fm-dragging'));
  }
  if (wasActive) drag.droppedAt = Date.now();
  if (changed && ui.reorder) {
    if (drag.active.kind === 'bot') ui.selected.clear();
    render(true);
  }
  drag.pending = null;
  drag.active = null;
  drag.target = null;
  drag.point = null;
}

// 화면 가장자리에 닿으면 스크롤한다.
function autoScrollLoop() {
  cancelAnimationFrame(drag.raf);
  const step = () => {
    if (!drag.active || !ui.app) return;
    const p = drag.point;
    for (const sc of ui.app.querySelectorAll('.fm-scroll,.fm-rail')) {
      const r = sc.getBoundingClientRect();
      if (p.x < r.left || p.x > r.right || p.y < r.top - 30 || p.y > r.bottom + 30) continue;
      const edge = 48;
      if (sc.scrollHeight > sc.clientHeight) {
        if (p.y < r.top + edge) sc.scrollTop -= Math.ceil((r.top + edge - p.y) / 4);
        else if (p.y > r.bottom - edge) sc.scrollTop += Math.ceil((p.y - (r.bottom - edge)) / 4);
      }
      if (sc.scrollWidth > sc.clientWidth) {
        if (p.x < r.left + edge) sc.scrollLeft -= Math.ceil((r.left + edge - p.x) / 4);
        else if (p.x > r.right - edge) sc.scrollLeft += Math.ceil((p.x - (r.right - edge)) / 4);
      }
    }
    updateTarget();
    drag.raf = requestAnimationFrame(step);
  };
  drag.raf = requestAnimationFrame(step);
}

function bindDrag(root) {
  root.addEventListener('pointerdown', (e) => {
    if (!ui.reorder || e.button > 0 || drag.active) return;
    const el = e.target.closest('.fm-card, .fm-nav[data-folder], .fm-ftile[data-folder]');
    if (!el || !ui.app.contains(el)) return;
    const kind = el.classList.contains('fm-card') ? 'bot' : 'folder';
    drag.pending = { el, kind, x: e.clientX, y: e.clientY, id: e.pointerId, touch: e.pointerType !== 'mouse' };
    if (drag.pending.touch) {
      drag.timer = setTimeout(() => {
        if (drag.pending && !drag.active) beginDrag(drag.pending);
      }, 300);
    }
  });

  if (drag.bound) return;
  drag.bound = true;
  window.addEventListener('pointermove', (e) => {
    const p = drag.pending;
    if (!p || e.pointerId !== p.id) return;
    if (!drag.active) {
      const moved = Math.hypot(e.clientX - p.x, e.clientY - p.y);
      if (p.touch) { if (moved > 10) { clearTimeout(drag.timer); drag.pending = null; } return; }
      if (moved < 5) return;
      beginDrag({ ...p, x: e.clientX, y: e.clientY });
    }
    e.preventDefault();
    moveGhost(e.clientX, e.clientY);
  }, { passive: false });

  window.addEventListener('pointerup', (e) => {
    if (drag.pending && e.pointerId === drag.pending.id) endDrag(true);
  });
  window.addEventListener('pointercancel', (e) => {
    if (drag.pending && e.pointerId === drag.pending.id) endDrag(false);
  });

  // 길게 누른 뒤에는 스크롤·문맥 메뉴를 막는다.
  window.addEventListener('touchmove', (e) => { if (drag.active) e.preventDefault(); }, { passive: false });
  window.addEventListener('contextmenu', (e) => { if (ui.reorder && (drag.pending || drag.active)) e.preventDefault(); });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && drag.active) endDrag(false); });
}
