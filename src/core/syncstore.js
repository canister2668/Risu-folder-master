// 서버 플러그인 저장소에 두는 작은 기록(기기끼리 같이 씀). 쓸 때는 서버 값을 다시 읽어 이번 변경만 얹는다.
// 해적판은 setItem 이 늦게 반영되어 바로 읽으면 옛 값이 오므로, 반영되지 않은 내 변경을 기억해 읽을 때마다 다시 얹는다.
// 쓸 때마다 값에 쓰기 표시(_w)를 붙이고, 서버 값의 표시가 어느 쓰기인지로 반영 여부를 본다(값이 우연히 같아도 헷갈리지 않게).
// 그 쓰기와 그보다 앞선 쓰기는 반영된 것으로 지우고, 뒤의 변경만 차례대로 다시 얹는다.

const SYNC_PENDING_MS = 60000;

function createSyncStore(key, norm, apply, prune) {
  const st = {
    key,
    state: norm(null),
    saved: null,
    pending: [],
    queue: Promise.resolve(),

    async read() {
      const saved = await Risuai.pluginStorage.getItem(key);
      let state = norm(saved);
      const now = Date.now();
      const mark = saved && typeof saved === 'object' ? saved._w : null;
      let seen = -1;
      if (mark) st.pending.forEach((p, i) => { if (p.mark === mark) seen = i; });
      if (seen >= 0) st.pending.splice(0, seen + 1);
      while (st.pending.length && now - st.pending[0].at > SYNC_PENDING_MS) st.pending.shift();
      for (const { op } of st.pending) state = apply(state, op);
      return { saved, state };
    },

    async load() {
      try {
        const { saved, state } = await st.read();
        st.saved = saved;
        st.state = state;
      } catch {}
      return st.state;
    },

    // 화면은 바로 바꾸고 저장은 줄 세워 한다. after() 는 저장 뒤에 부른다.
    change(op, after) {
      st.state = apply(st.state, op);
      const job = st.queue.then(async () => {
        const { state } = await st.read();
        const next = norm(prune ? prune(apply(state, op)) : apply(state, op));
        const mark = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        st.pending.push({ op, at: Date.now(), mark });
        await Risuai.pluginStorage.setItem(key, { ...next, _w: mark });
        st.state = next;
        if (after) await after();
      });
      st.queue = job.catch(() => {});
      return job;
    },
  };
  return st;
}
