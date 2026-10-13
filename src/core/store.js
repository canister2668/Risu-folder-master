// 호스트(RisuAI) 읽기·쓰기. 저장은 한 줄로 세워 차례로 하고, 매번 최신 데이터 위에서 고친다.

const HISTORY_LIMIT = 20;

async function readDatabase(keys) {
  const db = await Risuai.getDatabase(keys);
  if (!db) throw new Error('데이터베이스 접근 권한이 필요합니다. 권한 요청 창에서 허용해 주세요');
  return db;
}

async function readOrder() {
  const db = await readDatabase(['characterOrder']);
  return cloneOrder(db.characterOrder);
}

// 화면에 필요한 가벼운 정보만 남긴다.
function summarizeCharacter(c) {
  const assets = Array.isArray(c.additionalAssets) ? c.additionalAssets.length : 0;
  const modules = Array.isArray(c.modules) ? c.modules.length : 0;
  return {
    id: c.chaId,
    name: typeof c.name === 'string' && c.name ? c.name : '이름 없음',
    image: typeof c.image === 'string' ? c.image : '',
    group: c.type === 'group',
    last: Number(c.lastInteraction) || 0,
    assets,
    modules,
  };
}

const saver = {
  queue: Promise.resolve(),
  history: [],
  pending: 0,
  onBusy: () => {},

  run(task) {
    const job = this.queue.then(task);
    this.queue = job.catch(() => {});
    this.pending++;
    this.onBusy(true);
    return job.finally(() => {
      this.pending--;
      if (!this.pending) this.onBusy(false);
    });
  },

  // v3 에는 원자적 비교-쓰기가 없다(읽기와 setDatabaseLite 가 따로 오간다). 완전히 막을 수는 없으므로 창을 좁힌다:
  // 쓰기 직전에 다시 읽어 그 사이 바뀌었으면 최신 값에 같은 작업을 다시 적용하고, 쓴 뒤에는 다시 읽어 결과를 확인한다.
  async writeChecked(before, next) {
    const latest = await readOrder();
    if (JSON.stringify(latest) !== JSON.stringify(before)) return 'changed';
    await Risuai.setDatabaseLite({ characterOrder: next });
    const after = await readOrder();
    return JSON.stringify(after) === JSON.stringify(cloneOrder(next)) ? 'ok' : 'drift';
  },

  // mutate(최신 순서 사본) → 새 순서 | null(변경 없음). 최신 값이 바뀌면 mutate 를 다시 부른다.
  // expect 를 주면(순서 편집) 시작 때 본 값과 다르면 저장하지 않는다.
  commit(label, mutate, expect) {
    return this.run(async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        const before = await readOrder();
        if (expect !== undefined && JSON.stringify(before) !== expect) {
          throw new Error('편집하는 동안 다른 곳에서 순서가 바뀌어 저장하지 않았습니다. 새로고침 후 다시 해 주세요');
        }
        const next = await mutate(cloneOrder(before));
        if (!next) return null;
        validateOrder(next);
        if (JSON.stringify(next) === JSON.stringify(before)) return null;
        const result = await this.writeChecked(before, next);
        if (result === 'changed') continue;
        if (result === 'drift') {
          // 쓴 직후 다른 곳에서 또 바뀌었다. 되돌리기 기록은 남기지 않는다(덮어쓸 위험).
          this.warning = '저장 직후 다른 곳에서 순서가 바뀌었습니다. 목록을 확인해 주세요';
          return next;
        }
        this.history.push({ label, before, after: next });
        if (this.history.length > HISTORY_LIMIT) this.history.shift();
        return next;
      }
      throw new Error('다른 곳에서 순서가 계속 바뀌고 있어 저장하지 않았습니다. 잠시 뒤 다시 해 주세요');
    });
  },

  takeWarning() {
    const w = this.warning;
    this.warning = null;
    return w;
  },

  undo() {
    return this.run(async () => {
      const entry = this.history[this.history.length - 1];
      if (!entry) return null;
      const result = await this.writeChecked(entry.after, entry.before);
      if (result === 'changed') {
        this.history.length = 0;
        throw new Error('그 뒤에 다른 곳에서 순서가 바뀌어 되돌릴 수 없습니다');
      }
      this.history.pop();
      if (result === 'drift') this.warning = '되돌린 직후 다른 곳에서 순서가 바뀌었습니다. 목록을 확인해 주세요';
      return entry;
    });
  },
};

// 아바타: readImage 결과를 blob URL로 바꿔 캐시한다. 동시에 너무 많이 읽지 않는다.
const avatars = {
  gen: 0,
  cache: new Map(),
  waiting: new Map(),
  active: 0,
  limit: 6,
  backlog: [],

  peek(path) {
    return this.cache.get(path) || null;
  },

  load(path) {
    if (!path) return Promise.resolve(null);
    if (path.startsWith('data:') || path.startsWith('blob:') || path.startsWith('http')) return Promise.resolve(path);
    if (this.cache.has(path)) return Promise.resolve(this.cache.get(path));
    if (this.waiting.has(path)) return this.waiting.get(path);
    const job = new Promise((resolve) => this.backlog.push({ path, resolve }));
    this.waiting.set(path, job);
    this.pump();
    return job;
  },

  pump() {
    while (this.active < this.limit && this.backlog.length) {
      const { path, resolve } = this.backlog.shift();
      const gen = this.gen;
      this.active++;
      this.fetch(path)
        .then((url) => {
          // 정리한 뒤 늦게 온 그림은 캐시에 넣지 않고 바로 버린다.
          if (gen !== this.gen) { if (url && url.startsWith('blob:')) URL.revokeObjectURL(url); resolve(null); return; }
          if (url) this.cache.set(path, url);
          resolve(url);
        })
        .finally(() => { this.waiting.delete(path); this.active--; this.pump(); });
    }
  },

  async fetch(path) {
    try {
      const raw = await Risuai.readImage(path);
      if (typeof raw === 'string') return raw.startsWith('data:') || raw.startsWith('blob:') ? raw : null;
      const bytes = toBytes(raw);
      if (!bytes || !bytes.byteLength) return null;
      return URL.createObjectURL(new Blob([bytes], { type: imageMime(bytes) || 'image/png' }));
    } catch {
      return null;
    }
  },

  // 대기열만 비운다. 캐시는 화면을 다시 열 때 재사용한다.
  cancel() {
    for (const { path, resolve } of this.backlog) { this.waiting.delete(path); resolve(null); }
    this.backlog.length = 0;
  },

  clear() {
    this.gen++;
    this.cancel();
    for (const url of this.cache.values()) if (url.startsWith('blob:')) URL.revokeObjectURL(url);
    this.cache.clear();
  },
};
