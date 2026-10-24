// 1.0.7 기능의 순수 연산: 라벨, 최근 대화 순위, 중복 봇, 정리 마법사 제안, 배치 기록 복원·비교, 보관함 후보, 통계.
// 호스트 API를 부르지 않는다. chars 는 Map(id → { name, last, creator, tags }) 이다(roster.chars 와 같은 모양).

const DAY_MS = 86400e3;

// ── 라벨 ──

const LABEL_COLORS = ['yellow', 'blue', 'green', 'pink', 'purple', 'red', 'indigo', 'default'];
const LABEL_DEFAULTS = [
  { id: 'l-play', name: '진행 중', emoji: '▶', color: 'yellow' },
  { id: 'l-later', name: '나중에 할 것', emoji: '🔖', color: 'blue' },
  { id: 'l-done', name: '엔딩 봄', emoji: '🏁', color: 'green' },
  { id: 'l-love', name: '최애', emoji: '💖', color: 'pink' },
  { id: 'l-light', name: '가볍게', emoji: '☕', color: 'purple' },
];
const LABEL_MAX = 24;
const LABEL_NEW_DAYS = 7;

function labelDefNorm(d) {
  if (!d || typeof d !== 'object' || typeof d.id !== 'string' || !d.id) return null;
  const name = typeof d.name === 'string' ? d.name.trim().slice(0, 24) : '';
  if (!name) return null;
  return {
    id: d.id.slice(0, 40),
    name,
    emoji: typeof d.emoji === 'string' ? [...d.emoji].slice(0, 2).join('') : '',
    color: LABEL_COLORS.includes(d.color) ? d.color : 'default',
  };
}

// 서버에 저장하는 라벨 기록. 처음(저장된 것이 없을 때)은 기본 라벨 5개.
function labelsNorm(v) {
  const o = v && typeof v === 'object' ? v : null;
  const defs = [];
  for (const d of Array.isArray(o?.defs) ? o.defs : LABEL_DEFAULTS) {
    const n = labelDefNorm(d);
    if (n && !defs.some((x) => x.id === n.id) && defs.length < LABEL_MAX) defs.push(n);
  }
  const ids = new Set(defs.map((d) => d.id));
  const tags = {};
  if (o && o.tags && typeof o.tags === 'object') {
    for (const [bot, list] of Object.entries(o.tags)) {
      if (!Array.isArray(list)) continue;
      const clean = [...new Set(list.filter((l) => ids.has(l)))];
      if (clean.length) tags[bot] = clean;
    }
  }
  const opts = o && o.opts && typeof o.opts === 'object' ? o.opts : {};
  return {
    defs,
    tags,
    opts: {
      solo: typeof opts.solo === 'string' && ids.has(opts.solo) ? opts.solo : '',
      finish: typeof opts.finish === 'string' ? (ids.has(opts.finish) ? opts.finish : '') : (ids.has('l-done') ? 'l-done' : ''),
    },
  };
}

// 라벨 바꾸기 연산. 같은 연산을 두 번 적용해도 결과가 같도록 만든다(저장 반영이 늦는 서버에서 다시 얹기 때문).
// op = { t:'set', bot, labels } | { t:'add', bots, label } | { t:'remove', bots, label }
//    | { t:'def', def } (추가·고치기) | { t:'drop', label } | { t:'opt', key, value }
function labelsApply(state, op) {
  const s = labelsNorm(state);
  const solo = s.opts.solo;
  const clearSolo = (except) => {
    for (const [b, list] of Object.entries(s.tags)) if (b !== except && list.includes(solo)) s.tags[b] = list.filter((l) => l !== solo);
  };
  if (op.t === 'set') {
    s.tags[op.bot] = [...new Set((op.labels || []).filter((l) => s.defs.some((d) => d.id === l)))];
    if (solo && s.tags[op.bot].includes(solo) && !op.keepSolo) clearSolo(op.bot);
  } else if (op.t === 'add') {
    for (const b of op.bots || []) s.tags[b] = [...new Set([...(s.tags[b] || []), op.label])];
    if (solo && op.label === solo && (op.bots || []).length === 1) clearSolo(op.bots[0]);
  } else if (op.t === 'remove') {
    for (const b of op.bots || []) if (s.tags[b]) s.tags[b] = s.tags[b].filter((l) => l !== op.label);
  } else if (op.t === 'def') {
    const d = labelDefNorm(op.def);
    if (d) {
      const i = s.defs.findIndex((x) => x.id === d.id);
      if (i >= 0) s.defs[i] = d;
      else if (s.defs.length < LABEL_MAX) s.defs.push(d);
    }
  } else if (op.t === 'drop') {
    s.defs = s.defs.filter((d) => d.id !== op.label);
  } else if (op.t === 'opt') {
    s.opts[op.key] = op.value;
  }
  return labelsNorm(s);
}

function labelsOf(state, bot) {
  return state.tags[bot] || [];
}

// 순서에 없는 봇의 라벨을 지운다(지워진 봇이 쌓이지 않게).
function labelsPrune(state, liveIds) {
  if (!liveIds || !liveIds.length) return state;
  const live = new Set(liveIds);
  const tags = {};
  for (const [b, list] of Object.entries(state.tags)) if (live.has(b)) tags[b] = list;
  return { ...state, tags };
}

// 지워졌다고 확인된 봇의 라벨만 지운다.
function labelsDropBots(state, gone) {
  if (!gone || !gone.size) return state;
  const tags = {};
  for (const [b, list] of Object.entries(state.tags)) if (!gone.has(b)) tags[b] = list;
  return { ...state, tags };
}

// 자동 라벨 「새로 받음」: 폴더 마스터가 처음 본 지 7일이 안 됐고, 아직 대화하지 않은 봇.
// seen = { id: 처음 본 시각 } (첫 실행 때 이미 있던 봇은 0). 대화 여부를 모르면(이름 미확인) 넣지 않는다.
function isNewBot(id, seen, chars, now = Date.now()) {
  const at = seen && seen[id];
  if (!at || now - at > LABEL_NEW_DAYS * DAY_MS) return false;
  const c = chars.get(id);
  return !!c && !c.last;
}

// 처음 보는 봇을 기록한다. 기록이 비어 있으면(첫 실행) 지금 있는 봇은 모두 0(오래된 봇)으로 둔다.
function seenUpdate(seen, ids, now = Date.now()) {
  const first = !seen || !Object.keys(seen).length;
  const out = {};
  for (const id of ids) out[id] = seen && id in seen ? seen[id] : first ? 0 : now;
  return out;
}

// ── 최근 대화 ──

// tracked = [{ id, at }] (폴더 마스터가 본 「봇을 연 시각」), chars 의 last = RisuAI 마지막 대화 시각.
// 둘 중 늦은 시각으로 줄 세운다. live 에 없는 봇·exclude 는 뺀다.
function recentRank(live, tracked, chars, { count = 8, exclude = [] } = {}) {
  const liveSet = live ? new Set(live) : null;
  const skip = new Set(exclude);
  const at = new Map();
  for (const t of tracked || []) if (t && typeof t.id === 'string') at.set(t.id, Math.max(at.get(t.id) || 0, Number(t.at) || 0));
  for (const [id, c] of chars) if (c && c.last) at.set(id, Math.max(at.get(id) || 0, c.last));
  return [...at].filter(([id, t]) => t > 0 && (!liveSet || liveSet.has(id)) && !skip.has(id)).sort((a, b) => b[1] - a[1]).slice(0, count).map(([id]) => id);
}

function recentTrack(list, id, now = Date.now(), cap = 40) {
  return [{ id, at: now }, ...(list || []).filter((t) => t && t.id !== id)].slice(0, cap);
}

// ── 이름 다듬기 ──

function normName(name) {
  return String(name || '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

// 중복 비교용: 버전 표기·사본 표시·괄호 꼬리를 떼고 공백·기호를 지운다.
function dupKey(name) {
  let n = normName(name);
  n = n.replace(/[\s_-]*(\(|\[|【)?\s*(사본|복사본|copy|복제)\s*(\d+)?\s*(\)|\]|】)?\s*$/i, '');
  n = n.replace(/[\s_-]*(\(|\[)?\s*v?\d+(\.\d+){1,3}[a-z]?\s*(\)|\])?\s*$/i, '');
  n = n.replace(/[\s_-]*(\(|\[)\s*v\d+\s*(\)|\])\s*$/i, '').replace(/\s+v\d+\s*$/i, '');
  n = n.replace(/[\s\p{P}\p{S}]+/gu, '');
  return n;
}

// 이름이 같거나 비슷한(dupKey 가 같은) 봇 묶음. ignore = 무시한 dupKey 목록.
// 결과: [{ key, same, ids }] — same = 이름이 글자 그대로 모두 같음.
function findDuplicates(ids, chars, ignore = []) {
  const skip = new Set(ignore);
  const groups = new Map();
  for (const id of new Set(ids)) {
    const c = chars.get(id);
    if (!c || !c.name) continue;
    const key = dupKey(c.name);
    if (!key || skip.has(key)) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(id);
  }
  const out = [];
  for (const [key, list] of groups) {
    if (list.length < 2) continue;
    const names = new Set(list.map((id) => normName(chars.get(id).name)));
    const sorted = [...list].sort((a, b) => (chars.get(b).last || 0) - (chars.get(a).last || 0));
    out.push({ key, same: names.size === 1, ids: sorted });
  }
  return out.sort((a, b) => b.ids.length - a.ids.length || a.key.localeCompare(b.key));
}

// ── 정리 마법사 ──

const NAME_SPLIT = /[\s|:·/_~]+/;
// 이름 앞에 흔히 오는 낱말은 묶음 열쇠로 쓰지 않는다.
const NAME_STOP = new Set(['the', 'a', 'an']);
const BRACKET_HEAD = /^\s*[[【(（<〈「『]\s*([^\]】)）>〉」』]{1,20}?)\s*[\]】)）>〉」』]/;

// 이름에서 묶음 열쇠를 뽑는다. 앞 괄호([동방] 레이무 → 동방), 아니면 첫 낱말(버전 표기 제외).
function nameKey(name) {
  const raw = String(name || '').normalize('NFKC').trim();
  const head = BRACKET_HEAD.exec(raw);
  if (head) {
    const k = head[1].trim();
    return k.length >= 2 ? k : '';
  }
  // 이모지·기호뿐인 낱말(🎮, —)과 버전 표기는 건너뛴다.
  for (const w of raw.split(NAME_SPLIT)) {
    const k = w.replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, '');
    if ([...k].length >= 2 && !/^v?\d+(\.\d+)*$/i.test(k) && !NAME_STOP.has(k.toLowerCase())) return k;
  }
  return '';
}

// 열쇠와 맞는 있는 폴더. 이름이 같거나, 낱말 하나가 같거나, 한글·한자처럼 띄어 쓰지 않는 이름이면 앞부분이 같을 때
// (동방 → 동방환유기). 영어는 낱말 단위로만 본다(The → Theater 처럼 엉뚱하게 붙지 않게).
function folderMatch(folders, title) {
  const t = normName(title).replace(/[\s\p{P}\p{S}]+/gu, '');
  if ([...t].length < 2) return null;
  const cjk = /[\p{Script=Hangul}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(t);
  for (const f of folders) {
    const words = normName(f.name).split(/[\s\p{P}\p{S}]+/u).filter(Boolean);
    const n = words.join('');
    if (!n) continue;
    if (n === t || words.includes(t) || (cjk && [...n].length >= 2 && (n.startsWith(t) || t.startsWith(n)))) return f;
  }
  return null;
}

// rootIds(폴더 밖 봇)를 묶어 폴더를 제안한다. mode = 'name' | 'creator' | 'tag'.
// 결과: [{ key, title, ids, folderId, why }] — folderId 가 있으면 있는 폴더에 넣는다.
function suggestGroups(rootIds, chars, folders, mode) {
  const known = rootIds.filter((id) => chars.get(id)?.name);
  const buckets = new Map();
  const put = (key, title, id) => {
    const k = normName(key);
    if (!k) return;
    if (!buckets.has(k)) buckets.set(k, { title, ids: [] });
    const b = buckets.get(k);
    if (!b.ids.includes(id)) b.ids.push(id);
  };
  if (mode === 'creator') {
    for (const id of known) { const cr = String(chars.get(id).creator || '').trim(); if (cr) put(cr, cr, id); }
  } else if (mode === 'tag') {
    const count = new Map();
    for (const id of known) for (const t of new Set((chars.get(id).tags || []).map((x) => String(x).trim()).filter(Boolean))) count.set(normName(t), (count.get(normName(t)) || 0) + 1);
    const tags = [...count].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const taken = new Set();
    for (const [tag] of tags) {
      const ids = known.filter((id) => !taken.has(id) && (chars.get(id).tags || []).some((x) => normName(x) === tag));
      if (ids.length < 2) continue;
      const shown = (chars.get(ids[0]).tags || []).find((x) => normName(x) === tag) || tag;
      for (const id of ids) { taken.add(id); put(tag, String(shown).trim(), id); }
    }
  } else {
    for (const id of known) { const k = nameKey(chars.get(id).name); if (k) put(k, k, id); }
  }
  const why = { name: (t) => `이름 「${t}」`, creator: (t) => `제작자 ${t}`, tag: (t) => `태그 「${t}」` }[mode] || ((t) => t);
  const out = [];
  for (const [key, b] of buckets) {
    const f = folderMatch(folders, b.title);
    if (b.ids.length < 2 && !f) continue;
    out.push({ key, title: f ? f.name : b.title, ids: b.ids, folderId: f ? f.id : null, why: why(b.title) });
  }
  return out.sort((a, b) => b.ids.length - a.ids.length || a.title.localeCompare(b.title, 'ko'));
}

// ── 배치 기록 ──

// snap 배치로 되돌린다. 지금 순서에 없는 봇(그 사이 지워진 봇)은 빼고, snap 에 없는 봇(그 사이 들어온 봇)은
// 폴더 밖 맨 뒤에 둔다. 폴더 이름·색·그림은 snap 것을 쓴다. 빈 폴더는 남기지 않는다.
function restoreOrder(current, snap) {
  const live = new Set(orderBotIds(current));
  const used = new Set();
  const out = [];
  for (const item of cloneOrder(snap)) {
    if (typeof item === 'string') {
      if (live.has(item) && !used.has(item)) { used.add(item); out.push(item); }
    } else if (isFolder(item)) {
      const data = item.data.filter((id) => live.has(id) && !used.has(id) && (used.add(id), true));
      if (data.length) out.push({ ...item, data });
    }
  }
  for (const id of orderBotIds(current)) if (!used.has(id)) { used.add(id); out.push(id); }
  return out;
}

// a → b 에서 바뀐 것 요약.
function diffOrders(a, b) {
  const fa = new Map(cloneOrder(a).filter(isFolder).map((f) => [f.id, f]));
  const fb = new Map(cloneOrder(b).filter(isFolder).map((f) => [f.id, f]));
  const where = (order) => {
    const m = new Map();
    for (const item of cloneOrder(order)) {
      if (typeof item === 'string') { if (!m.has(item)) m.set(item, ''); } else if (isFolder(item)) for (const id of item.data) if (!m.has(id)) m.set(id, item.id);
    }
    return m;
  };
  const wa = where(a);
  const wb = where(b);
  let moved = 0;
  for (const [id, at] of wb) if (wa.has(id) && wa.get(id) !== at) moved++;
  return {
    foldersAdded: [...fb.values()].filter((f) => !fa.has(f.id)).map((f) => f.name || '이름 없음'),
    foldersRemoved: [...fa.values()].filter((f) => !fb.has(f.id)).map((f) => f.name || '이름 없음'),
    renamed: [...fb.values()].filter((f) => fa.has(f.id) && (fa.get(f.id).name || '') !== (f.name || '')).map((f) => [fa.get(f.id).name || '이름 없음', f.name || '이름 없음']),
    moved,
    botsAdded: [...wb.keys()].filter((id) => !wa.has(id)).length,
    botsRemoved: [...wa.keys()].filter((id) => !wb.has(id)).length,
  };
}

function sameOrder(a, b) {
  return JSON.stringify(cloneOrder(a)) === JSON.stringify(cloneOrder(b));
}

// ── 보관함·통계 ──

// 오래 대화하지 않은 봇(마지막 대화 시각을 아는 봇만). finished = 「엔딩 봄」 같은 라벨이 붙어 날짜와 상관없이 넣을 봇.
// 결과: [{ id, days, finished }] 오래된 순(finished 먼저).
function archiveCandidates(order, chars, { days = 60, archiveId = '', keep = [], finished = [], now = Date.now() } = {}) {
  const skip = new Set(keep);
  const fin = new Set(finished);
  const inArchive = new Set(archiveId ? (order.find((x) => isFolder(x) && x.id === archiveId)?.data || []) : []);
  const out = [];
  for (const id of new Set(orderBotIds(order))) {
    if (skip.has(id) || inArchive.has(id)) continue;
    const c = chars.get(id);
    if (!c) continue;
    const age = c.last ? Math.floor((now - c.last) / DAY_MS) : null;
    if (fin.has(id)) out.push({ id, days: age, finished: true });
    else if (age !== null && age >= days) out.push({ id, days: age, finished: false });
  }
  return out.sort((a, b) => (b.finished - a.finished) || (b.days ?? -1) - (a.days ?? -1));
}

// 폴더별 통계. active = 최근 30일 안에 대화한 봇.
function folderStats(order, chars, { now = Date.now(), activeDays = 30 } = {}) {
  const act = (id) => { const c = chars.get(id); return !!(c && c.last && now - c.last <= activeDays * DAY_MS); };
  const rows = [];
  const root = [];
  for (const item of cloneOrder(order)) {
    if (isFolder(item)) rows.push({ id: item.id, name: item.name || '이름 없음', color: item.color, total: item.data.length, active: item.data.filter(act).length });
    else if (typeof item === 'string') root.push(item);
  }
  const all = [...new Set(orderBotIds(order))];
  let oldest = null;
  for (const id of all) { const c = chars.get(id); if (c && c.last && (!oldest || c.last < oldest.last)) oldest = { id, last: c.last }; }
  const top = rows.filter((r) => r.active).sort((a, b) => b.active - a.active)[0] || null;
  return {
    total: all.length,
    folders: rows.length,
    active: all.filter(act).length,
    root: { total: root.length, active: root.filter(act).length },
    known: all.filter((id) => chars.has(id)).length,
    rows,
    top,
    oldest,
  };
}

// ── 기타 설정(서버) ──

function plusNorm(v) {
  const o = v && typeof v === 'object' ? v : {};
  const r = o.recent && typeof o.recent === 'object' ? o.recent : {};
  const l = o.labelFolder && typeof o.labelFolder === 'object' ? o.labelFolder : {};
  const a = o.archive && typeof o.archive === 'object' ? o.archive : {};
  const cl = o.cleanup && typeof o.cleanup === 'object' ? o.cleanup : {};
  const str = (x, n = 300) => (typeof x === 'string' ? x.slice(0, n) : '');
  return {
    recent: {
      on: r.on === true,
      count: [5, 8, 12].includes(r.count) ? r.count : 8,
      noStars: r.noStars === true,
      first: r.first === 'favorites' ? 'favorites' : 'recent',
      name: str(r.name, 80),
      imgFile: str(r.imgFile),
    },
    labelFolder: { lid: str(l.lid, 40), name: str(l.name, 80), imgFile: str(l.imgFile) },
    cleanup: { imgFile: str(cl.imgFile) },
    archive: {
      on: a.on !== false,
      days: [30, 60, 90].includes(a.days) ? a.days : 60,
      folderId: str(a.folderId, 80),
      snooze: Number(a.snooze) > 0 ? Number(a.snooze) : 0,
    },
    dupIgnore: Array.isArray(o.dupIgnore) ? [...new Set(o.dupIgnore.filter((x) => typeof x === 'string' && x))].slice(-200) : [],
  };
}

// op = { k: 'recent'|'labelFolder'|'archive'|'cleanup', set: {...} } | { k: 'dupIgnore', add: [...] }
function plusApply(state, op) {
  const s = plusNorm(state);
  if (op.k === 'dupIgnore') s.dupIgnore = [...s.dupIgnore, ...(op.add || [])];
  else if (s[op.k] && op.set) s[op.k] = { ...s[op.k], ...op.set };
  return plusNorm(s);
}

function recentNorm(v) {
  const list = Array.isArray(v?.list) ? v.list.filter((t) => t && typeof t.id === 'string' && Number(t.at) > 0).map((t) => ({ id: t.id, at: Number(t.at) })) : [];
  return { list: list.slice(0, 40) };
}

// op = { id, at }
function recentApply(state, op) {
  return { list: recentTrack(recentNorm(state).list, op.id, op.at) };
}
