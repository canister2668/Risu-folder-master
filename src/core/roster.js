// 봇 이름·그림 공급. 플러그인 API(v3)만 쓰며 서버에 따라 길을 고른다.
//  single  : getCharacterFromIndex(chaId) — 해적 RisuAI. 한 번에 한 캐릭터(+그 채팅)를 받으므로
//            화면에 보이는 봇만 몇 개씩 읽고, 읽은 요약은 이 기기에 저장해 다음에 바로 쓴다.
//            전체를 미리 읽지 않는다(봇이 수백 개면 서버 부담이 크다). 필요하면 rosterAll.
//  full    : getDatabase(['characters']) — 공식 RisuAI. 캐릭터가 메모리에 있어 빠르다.
//  unknown : 판별 실패. 아무것도 읽지 않고 지워짐 판정도 하지 않는다(저장된 이름만 보여 주고 다시 시도를 띄운다).
// 해적판의 getDatabase(['characters'])는 모든 캐릭터와 채팅을 차례로 받아 봇이 많으면 끝나지 않으므로,
// 공식판이라는 확실한 증거가 있을 때만 full 로 간다.

const ROSTER_CACHE_KEY = 'risuFolderMaster.roster';
const ROSTER_LIMIT = 3;

const roster = {
  mode: null,
  chars: new Map(),
  missing: new Set(),
  failed: new Set(),
  fetched: new Set(), // 이번에 창을 연 뒤 서버에서 실제로 확인한 봇
  ids: [],
  queue: [],
  queued: new Set(),
  active: 0, // 실제로 나가 있는 요청 수(세대와 무관하게, 끝날 때만 줄인다)
  gen: 0,
  store: null,
  saveTimer: null,
  waiters: [],
  countsChanged: false,
  onUpdate: () => {},

  resolved(id) {
    return this.chars.has(id) || this.missing.has(id);
  },

  // 이번에 서버에서 실제로 확인했는지(기기 캐시만 있는 것은 확인 전으로 본다).
  verified(id) {
    if (this.mode === 'full') return this.resolved(id);
    return this.fetched.has(id) && !this.failed.has(id);
  },

  unknown() {
    let n = 0;
    for (const id of this.ids) if (!this.resolved(id)) n++;
    return n;
  },

  pending() {
    return this.queue.length + this.active;
  },
};

function rosterSetIds(ids) {
  roster.ids = [...new Set(ids)];
}

function rosterFill(list) {
  roster.chars.clear();
  for (const c of list) if (c && typeof c.chaId === 'string' && c.chaId) roster.chars.set(c.chaId, summarizeCharacter(c));
  const before = roster.missing.size;
  roster.missing = new Set(roster.ids.filter((id) => !roster.chars.has(id)));
  if (before !== roster.missing.size) roster.countsChanged = true;
}

// 판별: 숫자 0번 캐릭터를 읽고, 그 chaId 문자열로 다시 읽어 본다.
//  같은 캐릭터가 오면 해적판(single), 던지지 않고 빈 값이면 공식판(full), 던지거나 판단이 안 서면 unknown.
async function rosterProbe() {
  let first;
  try { first = await Risuai.getCharacterFromIndex(0); } catch { return { mode: 'unknown' }; }
  if (!first || typeof first.chaId !== 'string') return { mode: 'unknown' };
  let again;
  try { again = await Risuai.getCharacterFromIndex(first.chaId); } catch { return { mode: 'unknown' }; }
  if (again && again.chaId === first.chaId) return { mode: 'single', sample: again };
  if (again === null || again === undefined) return { mode: 'full' };
  return { mode: 'unknown' };
}

async function rosterLoadCache() {
  try {
    roster.store = await Risuai.getLocalPluginStorage();
    const saved = await roster.store.getItem(ROSTER_CACHE_KEY);
    if (saved && typeof saved === 'object') {
      for (const [id, c] of Object.entries(saved)) if (c && typeof c.name === 'string') roster.chars.set(id, { ...c, id });
    }
  } catch {}
}

function rosterSaveSoon() {
  if (!roster.store || roster.saveTimer) return;
  roster.saveTimer = setTimeout(() => {
    roster.saveTimer = null;
    // 지금 폴더 배치(characterOrder)에 있는 봇만 남긴다. 지운 봇·빠진 봇은 저장에서 떨어져 계속 쌓이지 않는다.
    const keep = roster.ids.length ? new Set(roster.ids) : null;
    const out = {};
    for (const [id, c] of roster.chars) if (!keep || keep.has(id)) out[id] = c;
    try { roster.store.setItem(ROSTER_CACHE_KEY, out); } catch {}
  }, 1500);
}

// single 응답 해석: 같은 봇이면 있음, 빈 값이면 없음, 다른 봇이 오면 실패(지워짐으로 보지 않는다).
function rosterApply(id, c) {
  roster.fetched.add(id);
  const wasMissing = roster.missing.has(id);
  if (c && c.chaId === id) {
    roster.failed.delete(id);
    roster.chars.set(id, summarizeCharacter(c));
    roster.missing.delete(id);
  } else if (c === null || c === undefined) {
    roster.failed.delete(id);
    roster.chars.delete(id);
    roster.missing.add(id);
  } else {
    roster.failed.add(id);
  }
  if (wasMissing !== roster.missing.has(id)) roster.countsChanged = true;
  rosterSaveSoon();
}

// 창을 열 때마다: 이번 확인 기록을 비우고(저장된 이름은 그대로), 쓸 길을 정한다.
async function rosterStart(ids) {
  const gen = ++roster.gen;
  rosterSetIds(ids);
  roster.queue = [];
  roster.queued.clear();
  roster.fetched.clear();
  roster.failed.clear();
  if (!roster.store) await rosterLoadCache();
  if (gen !== roster.gen) return;
  if (roster.mode === null || roster.mode === 'unknown') {
    let probe = { mode: 'unknown' };
    for (let attempt = 0; attempt < 3 && probe.mode === 'unknown'; attempt++) {
      if (attempt) await new Promise((r) => setTimeout(r, 800));
      probe = await rosterProbe();
      if (gen !== roster.gen) return;
    }
    roster.mode = probe.mode;
    if (probe.sample) rosterApply(probe.sample.chaId, probe.sample);
  }
  if (roster.mode === 'full') {
    const db = await readDatabase(['characters']);
    if (gen !== roster.gen) return;
    rosterFill(Array.isArray(db.characters) ? db.characters : []);
  }
  rosterNotify(roster.ids);
}

function rosterEnqueue(ids, front) {
  if (roster.mode !== 'single') return;
  const fresh = ids.filter((id) => !roster.fetched.has(id) && !roster.queued.has(id));
  for (const id of fresh) roster.queued.add(id);
  if (front) roster.queue.unshift(...fresh);
  else roster.queue.push(...fresh);
  rosterPump();
  if (fresh.length) rosterNotify([]);
}

// 화면에 보이는 봇: 저장된 적 없는 것부터 앞에, 이번에 아직 확인 안 한 것도 뒤이어 다시 읽는다.
function rosterWant(ids) {
  if (roster.mode !== 'single') return;
  rosterEnqueue(ids.filter((id) => roster.chars.has(id)), true);
  rosterEnqueue(ids.filter((id) => !roster.chars.has(id)), true);
}

// 재확인 같은 직접 요청도 같은 동시 요청 제한(3개) 안에서 돈다. 슬롯은 실제 요청이 끝날 때만 돌려준다.
const slotWaiters = [];
function rosterAcquire() {
  if (roster.active < ROSTER_LIMIT) { roster.active++; return Promise.resolve(); }
  return new Promise((resolve) => slotWaiters.push(resolve));
}
function rosterRelease() {
  const next = slotWaiters.shift();
  if (next) next(); // 슬롯을 그대로 넘긴다
  else roster.active--;
}

function rosterPump() {
  const gen = roster.gen;
  while (roster.active < ROSTER_LIMIT && !slotWaiters.length && roster.queue.length) {
    const id = roster.queue.shift();
    roster.active++;
    Risuai.getCharacterFromIndex(id)
      .then((c) => { if (gen === roster.gen) rosterApply(id, c); })
      .catch(() => { if (gen === roster.gen) { roster.fetched.add(id); roster.failed.add(id); } })
      .finally(() => {
        rosterRelease();
        if (gen === roster.gen) {
          roster.queued.delete(id);
          rosterNotify([id]);
        }
        rosterPump();
      });
  }
  if (!roster.queue.length && !roster.active) {
    for (const w of roster.waiters.splice(0)) w('done');
  }
}

function rosterNotify(ids) {
  try { roster.onUpdate(ids); } catch {}
}

// 점검처럼 모든 봇이 필요할 때. single 이면 이번에 확인 안 한 봇(실패한 봇 포함)을 모두 읽는다.
// 결과: 'done' | 'cancelled'
async function rosterAll() {
  if (roster.mode === 'full') { await rosterStart(roster.ids); return 'done'; }
  if (roster.mode !== 'single') return 'cancelled';
  for (const id of roster.ids) if (roster.failed.has(id)) { roster.failed.delete(id); roster.fetched.delete(id); }
  rosterEnqueue(roster.ids, false);
  if (!roster.queue.length && !roster.active) return 'done';
  return new Promise((resolve) => roster.waiters.push(resolve));
}

// 창을 닫으면 대기열을 버린다. 나가 있는 요청은 끝나게 두되 결과는 버린다. 캐시는 남긴다.
function rosterStop() {
  roster.gen++;
  roster.queue = [];
  roster.queued.clear();
  for (const w of roster.waiters.splice(0)) w('cancelled');
}

// 기다리는 요청만 버린다(이미 시작한 요청은 끝나게 둔다).
function rosterCancelQueue() {
  for (const id of roster.queue) roster.queued.delete(id);
  roster.queue = [];
  for (const w of roster.waiters.splice(0)) w('cancelled');
  rosterNotify([]);
}

// 실패한 봇만 다시 읽는다(자동 반복 재시도는 하지 않는다).
function rosterRetry(ids) {
  for (const id of ids) { roster.failed.delete(id); roster.fetched.delete(id); }
  rosterEnqueue(ids, true);
}

// 이 봇들이 있는지 알아야 할 때. single 이면 모르는 것만 앞당겨 읽고 기다린다. 창을 닫으면 멈춘다.
async function rosterResolve(ids, timeoutMs = 30000) {
  if (roster.mode !== 'single') return;
  const gen = roster.gen;
  const start = Date.now();
  for (;;) {
    if (gen !== roster.gen) return;
    const unknown = ids.filter((id) => !roster.resolved(id) && !roster.failed.has(id));
    if (!unknown.length || Date.now() - start > timeoutMs) return;
    rosterEnqueue(unknown, true);
    await new Promise((r) => setTimeout(r, 150));
  }
}

// 지우기 직전 재확인. 대기열을 거치지 않고 이번 호출에서 직접 다시 읽어, 이번 응답으로
// 없음이 확인된 봇만 missing 으로 돌려준다. 시간이 넘었거나 실패한 봇은 failed 로 돌려준다(지우지 않음).
async function rosterVerify(ids, timeoutMs = 60000) {
  const out = { missing: [], present: [], failed: [] };
  const gen = roster.gen;
  if (roster.mode === 'full') {
    const db = await readDatabase(['characters']);
    if (gen !== roster.gen) { out.failed.push(...ids); return out; }
    const have = new Set((Array.isArray(db.characters) ? db.characters : []).map((c) => c && c.chaId));
    for (const id of ids) (have.has(id) ? out.present : out.missing).push(id);
    return out;
  }
  if (roster.mode !== 'single') { out.failed.push(...ids); return out; }
  const deadline = Date.now() + timeoutMs;
  const todo = [...ids];
  const one = async (id) => {
    await rosterAcquire();
    let timer = null;
    const request = Risuai.getCharacterFromIndex(id);
    request.catch(() => {}).finally(rosterRelease); // 기한이 지나도 실제 요청이 끝날 때 슬롯을 돌려준다
    try {
      const c = await Promise.race([request, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), Math.max(1, deadline - Date.now())); })]);
      if (gen !== roster.gen) { out.failed.push(id); return; } // 창을 닫았으면 결과를 쓰지 않는다
      if (c && c.chaId === id) out.present.push(id);
      else if (c === null || c === undefined) out.missing.push(id);
      else out.failed.push(id);
      rosterApply(id, c);
    } catch { out.failed.push(id); }
    finally { clearTimeout(timer); }
  };
  const worker = async () => {
    while (todo.length) {
      const id = todo.shift();
      if (Date.now() > deadline || gen !== roster.gen) { out.failed.push(id); continue; }
      await one(id);
    }
  };
  await Promise.all(Array.from({ length: Math.min(ROSTER_LIMIT, ids.length) }, worker));
  return out;
}
