// 폴더 그림 고르기. 세 가지 길이 있다.
//   템플릿: 내장 섬네일로 고르고, 적용할 때만 GitHub에서 512px 그림을 받아 RisuAI 에셋으로 저장한다.
//   글씨 바꾸기: 그 템플릿의 빈 종이판을 받아 캔버스에 글씨를 다시 쓴다.
//   내 그림: 사용자가 고른 그림을 정사각으로 잘라 512px로 저장한다.
// 저장된 그림은 RisuAI 에셋이라 플러그인을 지우거나 GitHub에 닿지 않아도 그대로 남는다.

const TEMPLATE_BASE = 'https://raw.githubusercontent.com/canister2668/Risu-folder-master/main/templates/';
const TEMPLATE_CATS = ['전체', '장르', '형식', '관리', '아르곤'];
const SIGN_FONT = 'FMSign';
const SIGN_INK = '#282030';
const SIGN_MAX = 8;
const tplFiles = new Map();
let signFont = null;

function templateBase() {
  return globalThis.FM_TEMPLATE_BASE || TEMPLATE_BASE;
}

async function fetchTemplateFile(file) {
  if (tplFiles.has(file)) return tplFiles.get(file);
  const job = (async () => {
    const url = templateBase() + file;
    // 플러그인 iframe 은 CSP 로 fetch 가 막혀 있어 nativeFetch 만 쓴다. 옵션을 비우면 일부 판에서 내부 오류가 난다.
    let res = null;
    try { res = await Risuai.nativeFetch(url, { method: 'GET' }); } catch { res = null; }
    if (!res || !res.ok) throw new Error('템플릿 그림을 받지 못했습니다. 인터넷 연결을 확인해 주세요');
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (!bytes.byteLength) throw new Error('템플릿 그림이 비어 있습니다');
    return bytes;
  })();
  tplFiles.set(file, job);
  job.catch(() => tplFiles.delete(file));
  return job;
}

function bytesToImage(bytes) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([bytes], { type: imageMime(bytes) || 'image/png' }));
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('그림을 열지 못했습니다')); };
    img.src = url;
  });
}

// 글꼴을 못 받으면 기기의 굵은 고딕으로 쓴다.
function loadSignFont() {
  if (!signFont) {
    signFont = fetchTemplateFile('font.ttf')
      .then(async (bytes) => {
        const face = new FontFace(SIGN_FONT, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
        await face.load();
        document.fonts.add(face);
        return `"${SIGN_FONT}"`;
      })
      .catch(() => { signFont = null; return '"Apple SD Gothic Neo","Noto Sans KR","Malgun Gothic",sans-serif'; });
  }
  return signFont;
}

// 종이 하나에 글씨를 가장 크게 넣는다. 세로 종이는 세로쓰기를 먼저 본다.
function fitSignText(ctx, box, text, family) {
  const [x0, y0, x1, y1] = box;
  const w = x1 - x0;
  const h = y1 - y0;
  const pad = 0.08;
  const chars = [...text.replace(/\s+/g, '')];
  if (!chars.length) return;
  const cands = [];
  if (chars.length <= 5 && h / w > 1.2) cands.push({ lines: chars });
  cands.push({ lines: [text.trim()], spread: chars.length >= 3 && chars.length <= 4 && w / h > 1.8 });
  if (chars.length >= 3) { const m = Math.ceil(chars.length / 2); cands.push({ lines: [chars.slice(0, m).join(''), chars.slice(m).join('')] }); }
  let best = null;
  for (const c of cands) {
    let lo = 4;
    let hi = Math.floor(h);
    while (lo < hi) {
      const s = Math.ceil((lo + hi + 1) / 2);
      ctx.font = `${s}px ${family}`;
      const lw = Math.max(...c.lines.map((l) => ctx.measureText(l).width));
      if (lw <= w * (1 - 2 * pad) && s * c.lines.length * 1.04 <= h * (1 - 2 * pad)) lo = s; else hi = s - 1;
    }
    if (!best || lo > best.size) best = { ...c, size: lo };
  }
  ctx.font = `${best.size}px ${family}`;
  ctx.fillStyle = SIGN_INK;
  ctx.textBaseline = 'middle';
  const n = best.lines.length;
  const lh = best.size * 1.04;
  const top = y0 + h / 2 - (lh * (n - 1)) / 2;
  best.lines.forEach((line, i) => {
    if (best.spread && n === 1) {
      const cs = [...line];
      const tw = cs.reduce((a, c) => a + ctx.measureText(c).width, 0);
      const gap = (w * 0.84 - tw) / Math.max(1, cs.length - 1);
      let x = x0 + w * 0.08;
      ctx.textAlign = 'left';
      for (const c of cs) { ctx.fillText(c, x, top); x += ctx.measureText(c).width + gap; }
    } else {
      ctx.textAlign = 'center';
      ctx.fillText(line, x0 + w / 2, top + i * lh);
    }
  });
}

// 카드가 여러 장이면 글자를 고르게 나눈다(4자→2·1·1). 글자가 카드보다 적으면 남는 카드는 비운다.
function splitAcrossCards(text, n) {
  const ch = [...text.replace(/\s+/g, '')];
  const parts = [];
  if (ch.length < n) {
    const off = Math.floor((n - ch.length) / 2);
    for (let i = 0; i < n; i++) parts.push(ch[i - off] || '');
    return parts;
  }
  let k = 0;
  for (let i = 0; i < n; i++) {
    const c = Math.floor(ch.length / n) + (i < ch.length % n ? 1 : 0);
    parts.push(ch.slice(k, k + c).join(''));
    k += c;
  }
  return parts;
}

async function composeSign(tpl, text) {
  const [bytes, family] = await Promise.all([fetchTemplateFile(`blank/${tpl.slug}.webp`), loadSignFont()]);
  const img = await bytesToImage(bytes);
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0, 512, 512);
  const boxes = tpl.signs.map((r) => r.map((v) => v * 512));
  if (boxes.length > 1) {
    splitAcrossCards(text, boxes.length).forEach((part, i) => { if (part) fitSignText(ctx, boxes[i], part, family); });
  } else {
    fitSignText(ctx, boxes[0], text, family);
  }
  return c;
}

function canvasBytes(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) { reject(new Error('그림을 만들지 못했습니다')); return; }
      resolve(new Uint8Array(await blob.arrayBuffer()));
    }, 'image/webp', 0.9);
  });
}

// 폴더 이름과 글자가 겹치는 템플릿을 추천한다.
function templateScore(tpl, name) {
  const n = (name || '').replace(/\s+/g, '');
  if (!n) return 0;
  if (tpl.name === n) return 3;
  if (n.includes(tpl.name) || tpl.name.includes(n)) return 2;
  return [...tpl.name].filter((c) => n.includes(c)).length >= 2 ? 1 : 0;
}

// 정사각 자르기. 상자 크기는 화면에 맞춰 정하고, 저장은 512px.
function makeCropper(img, box) {
  const base = box / Math.min(img.naturalWidth, img.naturalHeight);
  const m = {
    img, z: 1, x: 0, y: 0,
    scale() { return base * this.z; },
    clamp() {
      const s = this.scale();
      this.x = Math.min(0, Math.max(box - img.naturalWidth * s, this.x));
      this.y = Math.min(0, Math.max(box - img.naturalHeight * s, this.y));
    },
    apply() { this.clamp(); img.style.transform = `translate(${this.x}px,${this.y}px) scale(${this.scale()})`; },
    zoom(z) {
      const c = box / 2;
      const s0 = this.scale();
      this.z = z;
      const s1 = this.scale();
      this.x = c - ((c - this.x) * s1) / s0;
      this.y = c - ((c - this.y) * s1) / s0;
      this.apply();
    },
    canvas() {
      const c = document.createElement('canvas');
      c.width = c.height = 512;
      const s = this.scale();
      c.getContext('2d').drawImage(img, -this.x / s, -this.y / s, box / s, box / s, 0, 0, 512, 512);
      return c;
    },
  };
  m.x = (box - img.naturalWidth * base) / 2;
  m.y = (box - img.naturalHeight * base) / 2;
  return m;
}

// 결과: { path } | { reset: true } | null
function openImagePicker(folder) {
  const st = { tab: 'tpl', cat: '전체', sel: null, editing: false, text: '', mine: null, busy: false, seq: 0 };
  const name = folder.name || '';
  const tile = (t) => `<button class="fm-ip-tile${st.sel === t ? ' on' : ''}" data-tpl="${t.slug}" title="${esc(t.name)}"><img src="${t.thumb}" alt=""><b>${esc(t.name)}</b></button>`;
  return openModal(
    `<div class="fm-ip">
      <div class="fm-ip-head"><h3 id="fm-dialog-title">폴더 그림</h3><small>${esc(name || '이름 없는 폴더')}</small>
        <button class="fm-btn ghost fm-icon fm-ip-x" data-x aria-label="닫기">${icon('close')}</button></div>
      <div class="fm-ip-prev">
        <div class="fm-ip-pv"><div class="fm-ip-big" data-cur>${folderThumb(folder, 'fm-ip-thumb')}</div><span>지금</span></div>
        <span class="fm-ip-arrow">→</span>
        <div class="fm-ip-pv"><div class="fm-ip-big empty" data-new></div><span data-new-label>바꿀 그림</span></div>
        <div class="fm-ip-side"><span>사이드바 크기</span><div class="fm-ip-sb"><div data-sb-cur>${folderThumb(folder, 'fm-ip-thumb')}</div><div data-sb-new></div></div></div>
      </div>
      <div class="fm-ip-tabs" role="tablist"><button data-tab="tpl" class="on" role="tab">템플릿</button><button data-tab="mine" role="tab">내 그림</button></div>
      <div class="fm-ip-body" data-body></div>
      <div class="fm-ip-foot">
        <button class="fm-btn ghost" data-reset ${folder.imgFile ? '' : 'disabled'}>기본 아이콘으로</button><span class="fm-spacer"></span>
        <button class="fm-btn" data-x>취소</button><button class="fm-btn primary" data-apply disabled>적용</button>
      </div>
    </div>`,
    (modal, close) => {
      modal.classList.add('fm-wide');
      const body = modal.querySelector('[data-body]');
      const applyBtn = modal.querySelector('[data-apply]');
      // 지금 그림(에셋)을 읽어 큰 칸과 사이드바 칸에 보인다.
      const curThumbs = [...modal.querySelectorAll('[data-cur] .fm-thumb, [data-sb-cur] .fm-thumb')];
      const lazy = curThumbs[0]?.dataset.src;
      if (lazy) avatars.load(lazy).then((src) => { if (src) curThumbs.forEach((el) => { const i = new Image(); i.src = src; el.replaceChildren(i); }); });

      const putNew = (node, label) => {
        const big = modal.querySelector('[data-new]');
        const sb = modal.querySelector('[data-sb-new]');
        big.classList.toggle('empty', !node);
        big.replaceChildren();
        sb.replaceChildren();
        if (node) {
          big.append(node);
          const small = document.createElement('canvas');
          small.width = small.height = 116;
          if (node.tagName === 'CANVAS') small.getContext('2d').drawImage(node, 0, 0, 116, 116);
          else { const i = new Image(); i.src = node.src; sb.append(i); }
          if (node.tagName === 'CANVAS') sb.append(small);
        }
        modal.querySelector('[data-new-label]').textContent = label || '바꿀 그림';
        applyBtn.disabled = !node || st.busy;
      };

      const refreshNew = async () => {
        const seq = ++st.seq;
        if (st.tab === 'mine') { putNew(st.mine ? st.mine.canvas() : null); return; }
        if (!st.sel) { putNew(null); return; }
        if (!st.editing) { const i = new Image(); i.src = st.sel.thumb; putNew(i, st.sel.name); return; }
        modal.querySelector('[data-new-label]').textContent = '그리는 중…';
        try {
          const c = await composeSign(st.sel, st.text || ' ');
          if (seq === st.seq) putNew(c, '글씨 바꿈');
        } catch (err) {
          if (seq !== st.seq) return;
          toastError(err);
          st.editing = false;
          renderBody();
          refreshNew();
        }
      };
      const refreshSoon = debounce(refreshNew, 140);

      const renderTpl = () => {
        const list = TEMPLATES.filter((t) => st.cat === '전체' || t.cat === st.cat);
        const rec = TEMPLATES.map((t) => [t, templateScore(t, name)]).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([t]) => t);
        const edit = !st.sel ? '<p class="fm-ip-hint">템플릿을 고르면 위에 미리 보입니다. 글씨 바꾸기를 지원하는 그림은 폴더 이름으로 바꿀 수 있어요.</p>'
          : st.sel.editable === false
            ? `<div class="fm-ip-editbar"><div><b>${esc(st.sel.name)}</b><small>문구가 포함된 완성형 아이콘입니다. 적용을 눌러 사용하세요.</small></div></div>`
          : st.editing
            ? `<div class="fm-ip-edit"><input class="fm-field" data-text maxlength="${SIGN_MAX}" placeholder="종이에 쓸 글자" aria-label="종이에 쓸 글자"><button class="fm-btn" data-orig>원래 글씨</button></div>
               <p class="fm-ip-hint">빈 종이판에 새로 씁니다. 종이 모양에 맞춰 줄과 크기를 자동으로 맞춥니다(최대 ${SIGN_MAX}자).</p>`
            : `<div class="fm-ip-edit"><div class="fm-ip-nm"><b>${esc(st.sel.name)}</b><small>템플릿 그대로 쓰거나 글씨를 바꿀 수 있어요</small></div><button class="fm-btn" data-edit>${icon('edit')}글씨 바꾸기</button></div>`;
        body.innerHTML = `<div class="fm-ip-chips">${TEMPLATE_CATS.map((c) => `<button data-cat="${c}" class="${c === st.cat ? 'on' : ''}">${c}</button>`).join('')}</div>
          ${rec.length && st.cat === '전체' ? `<div class="fm-ip-sec">"${esc(name)}"에 어울리는 템플릿</div><div class="fm-ip-grid">${rec.map(tile).join('')}</div><div class="fm-ip-sec">전체 ${TEMPLATES.length}</div>` : ''}
          <div class="fm-ip-grid">${list.map(tile).join('')}</div>${edit}`;
        const input = body.querySelector('[data-text]');
        if (input) {
          input.value = st.text;
          input.oninput = () => { st.text = [...input.value].slice(0, SIGN_MAX).join(''); refreshSoon(); };
          setTimeout(() => { input.focus(); input.select(); });
        }
      };

      const renderMine = () => {
        if (!st.mine) {
          body.innerHTML = `<label class="fm-ip-drop"><input type="file" accept="image/png,image/jpeg,image/webp" hidden>${icon('image')}<b>그림 고르기</b><span>PNG · JPG · WebP · 정사각으로 잘라 512px로 저장합니다</span></label>`;
          body.querySelector('input').onchange = async (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;
            try {
              const bytes = new Uint8Array(await file.arrayBuffer());
              if (!['image/png', 'image/jpeg', 'image/webp'].includes(imageMime(bytes))) throw new Error('PNG·JPG·WebP 그림만 쓸 수 있습니다');
              const img = await bytesToImage(bytes);
              st.mine = makeCropper(img, 220);
              renderMine();
              refreshNew();
            } catch (err) { toastError(err); e.target.value = ''; }
          };
          return;
        }
        body.innerHTML = `<div class="fm-ip-crop"><div class="fm-ip-cropbox" data-crop></div>
          <div class="fm-ip-cropctl"><label>확대<input type="range" data-zoom min="1" max="4" step="0.01" value="${st.mine.z}"></label>
          <span>끌어서 위치를 맞추세요</span><button class="fm-btn" data-other>${icon('image')}다른 그림</button></div></div>`;
        const box = body.querySelector('[data-crop]');
        box.append(st.mine.img);
        st.mine.apply();
        body.querySelector('[data-zoom]').oninput = (e) => { st.mine.zoom(+e.target.value); refreshSoon(); };
        body.querySelector('[data-other]').onclick = () => { st.mine = null; renderMine(); refreshNew(); };
        let pull = null;
        box.onpointerdown = (e) => { pull = { x: e.clientX, y: e.clientY, ox: st.mine.x, oy: st.mine.y }; box.setPointerCapture(e.pointerId); };
        box.onpointermove = (e) => { if (!pull) return; st.mine.x = pull.ox + e.clientX - pull.x; st.mine.y = pull.oy + e.clientY - pull.y; st.mine.apply(); };
        box.onpointerup = box.onpointercancel = () => { if (pull) { pull = null; refreshNew(); } };
      };

      const renderBody = () => {
        modal.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === st.tab));
        if (st.tab === 'tpl') renderTpl(); else renderMine();
      };

      body.addEventListener('click', (e) => {
        const cat = e.target.closest('[data-cat]');
        if (cat) { st.cat = cat.dataset.cat; renderTpl(); return; }
        const t = e.target.closest('[data-tpl]');
        if (t) {
          const tpl = TEMPLATES.find((x) => x.slug === t.dataset.tpl);
          if (st.sel !== tpl) { st.sel = tpl; st.editing = false; }
          renderTpl(); refreshNew(); return;
        }
        if (e.target.closest('[data-edit]') && st.sel?.editable !== false) { st.editing = true; st.text = [...name].slice(0, SIGN_MAX).join('') || st.sel.name; renderTpl(); refreshNew(); return; }
        if (e.target.closest('[data-orig]')) { st.editing = false; renderTpl(); refreshNew(); }
      });
      modal.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => { st.tab = b.dataset.tab; renderBody(); refreshNew(); }; });
      modal.querySelectorAll('[data-x]').forEach((b) => { b.onclick = () => close(null); });
      modal.querySelector('[data-reset]').onclick = () => close({ reset: true });
      applyBtn.onclick = async () => {
        if (st.busy) return;
        st.busy = true;
        applyBtn.disabled = true;
        applyBtn.textContent = '저장 중…';
        try {
          let bytes;
          if (st.tab === 'mine') bytes = await canvasBytes(st.mine.canvas());
          else if (st.editing) bytes = await canvasBytes(await composeSign(st.sel, st.text || ' '));
          else bytes = await fetchTemplateFile(`${st.sel.slug}.webp`);
          const path = await Risuai.saveAsset(bytes);
          if (!path) throw new Error('그림을 저장하지 못했습니다');
          close({ path });
        } catch (err) {
          toastError(err);
          st.busy = false;
          applyBtn.disabled = false;
          applyBtn.textContent = '적용';
        }
      };
      renderBody();
    },
  );
}
