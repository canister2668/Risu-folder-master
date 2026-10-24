// 알림과 대화상자.

let toastTimer = null;

function toast(message, opts = {}) {
  document.querySelector('.fm-toast')?.remove();
  clearTimeout(toastTimer);
  const el = document.createElement('div');
  el.className = 'fm-toast' + (opts.error ? ' error' : '');
  el.setAttribute('role', 'status');
  const text = document.createElement('span');
  text.textContent = message;
  el.append(text);
  if (opts.action) {
    const btn = document.createElement('button');
    btn.textContent = opts.action.label;
    btn.onclick = () => { el.remove(); opts.action.run(); };
    el.append(btn);
  }
  document.body.append(el);
  toastTimer = setTimeout(() => el.remove(), opts.ms || (opts.action ? 7000 : opts.error ? 4500 : 2400));
}

function toastError(err) {
  toast(errorText(err), { error: true });
}

// body 는 HTML 문자열. setup(modal, close) 에서 이벤트를 단다.
// 열려 있는 동안 뒤 화면은 inert, Tab 은 창 안에서만 돌고, 닫으면 연 버튼으로 포커스를 돌려준다.
function openModal(html, setup) {
  const opener = document.activeElement;
  const app = document.querySelector('.fm-root');
  const back = document.createElement('div');
  back.className = 'fm-modal-back';
  back.innerHTML = `<div class="fm-modal" role="dialog" aria-modal="true" aria-labelledby="fm-dialog-title">${html}</div>`;
  const modal = back.firstElementChild;
  if (!modal.querySelector('#fm-dialog-title')) modal.querySelector('h3')?.setAttribute('id', 'fm-dialog-title');
  let closed = false;
  const close = (value) => {
    if (closed) return;
    closed = true;
    back.remove();
    document.removeEventListener('keydown', onKey, true);
    if (app && !document.querySelector('.fm-modal-back')) app.inert = false;
    try { if (opener && opener.isConnected) opener.focus(); } catch {}
    modal.dispatchEvent(new CustomEvent('fm-close', { detail: value }));
  };
  const onKey = (e) => {
    // 창 위에 창이 열려 있으면 맨 위 창만 키를 받는다(Esc 한 번에 둘 다 닫히지 않게).
    const backs = document.querySelectorAll('.fm-modal-back');
    if (backs[backs.length - 1] !== back) return;
    if (e.key === 'Escape') { e.stopPropagation(); close(null); return; }
    if (e.key !== 'Tab') return;
    const items = [...modal.querySelectorAll('button:not([disabled]):not([hidden]), input:not([hidden]), [tabindex="0"]')].filter((el) => el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  back.addEventListener('pointerdown', (e) => { if (e.target === back) close(null); });
  document.addEventListener('keydown', onKey, true);
  document.body.append(back);
  if (app) app.inert = true;
  setup(modal, close);
  if (!modal.contains(document.activeElement)) setTimeout(() => { if (!modal.contains(document.activeElement)) modal.querySelector('.primary, button:not([disabled])')?.focus(); }, 0);
  return new Promise((resolve) => modal.addEventListener('fm-close', (e) => resolve(e.detail)));
}

// 목록을 다시 그려도 키보드 포커스·스크롤을 지킨다. 포커스는 같은 data-* 속성을 가진 요소로 돌려준다.
function rerender(box, html) {
  const a = document.activeElement;
  let sel = null;
  if (a && box.contains(a)) {
    const attrs = [...a.attributes].filter((x) => x.name.startsWith('data-'));
    if (attrs.length) sel = attrs.map((x) => `[${x.name}="${CSS.escape(x.value)}"]`).join('');
  }
  const top = box.scrollTop;
  box.innerHTML = html;
  box.scrollTop = top;
  if (!sel) return;
  // 포커스가 있던 줄이 사라졌으면 목록의 첫 버튼, 그것도 없으면 창의 닫기·확인 버튼으로.
  const next = box.querySelector(sel) || box.querySelector('button:not([disabled])') || box.closest('.fm-modal')?.querySelector('[data-x], .primary');
  next?.focus({ preventScroll: true });
}

function askText(title, { value = '', placeholder = '', confirm = '확인', desc = '' } = {}) {
  return openModal(
    `<h3 id="fm-dialog-title">${esc(title)}</h3>${desc ? `<p class="fm-desc">${esc(desc)}</p>` : '<div style="height:10px"></div>'}
     <input class="fm-field" maxlength="80" placeholder="${esc(placeholder)}" value="${esc(value)}">
     <div class="fm-modal-actions"><button class="fm-btn" data-x>취소</button><button class="fm-btn primary" data-ok>${esc(confirm)}</button></div>`,
    (modal, close) => {
      const input = modal.querySelector('input');
      const ok = () => { const v = input.value.trim(); if (v) close(v); else input.focus(); };
      modal.querySelector('[data-x]').onclick = () => close(null);
      modal.querySelector('[data-ok]').onclick = ok;
      input.onkeydown = (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); ok(); } };
      setTimeout(() => { input.focus(); input.select(); }, 0);
    },
  );
}

function askConfirm(title, desc, { confirm = '확인', danger = false } = {}) {
  return openModal(
    `<h3 id="fm-dialog-title">${esc(title)}</h3><p class="fm-desc">${esc(desc)}</p>
     <div class="fm-modal-actions"><button class="fm-btn" data-x>취소</button><button class="fm-btn ${danger ? 'danger' : 'primary'}" data-ok>${esc(confirm)}</button></div>`,
    (modal, close) => {
      modal.querySelector('[data-x]').onclick = () => close(false);
      const ok = modal.querySelector('[data-ok]');
      ok.onclick = () => close(true);
      setTimeout(() => ok.focus(), 0);
    },
  ).then((v) => v === true);
}
