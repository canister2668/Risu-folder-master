// 브라우저용 가짜 Risuai(v3). 시험 화면 전용.
(() => {
  const hues = [12, 40, 160, 200, 230, 270, 300, 330];
  const names = ['아리스', '유우카', '노아', '코유키', '미카', '나기사', '세이아', '히나', '아코', '이오리', '치나츠', '호시노', '시로코', '노노미', '세리카', '아야네', '하루나', '준코', '이즈미', '아카리', '스텔라', '레이무', '마리사', '사쿠야', '레밀리아', '플랑', '요우무', '유유코', '사나에', '스와코'];
  const chars = names.map((name, i) => ({ chaId: 'c' + i, name, image: i % 7 === 6 ? '' : 'img' + i, type: i === 4 ? 'group' : 'character', lastInteraction: Date.now() - i * 3.7e6 * (i % 5 + 1), additionalAssets: new Array(i % 4 * 3), modules: i % 3 ? [] : ['m'] }));
  const db = {
    characters: chars,
    characterOrder: [
      { id: 'f-ba', name: '블루 아카이브', color: 'blue', data: ['c0', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9'], imgFile: 'img1' },
      { id: 'f-abydos', name: '아비도스 대책위원회', color: 'yellow', data: ['c15', 'c16', 'c17', 'c18', 'c19'], imgFile: '' },
      { id: 'f-th', name: '동방환유기', color: 'purple', data: ['c21', 'c22', 'c23', 'c24', 'c25', 'c26', 'c27', 'c28', 'c29', 'ghost-1'], imgFile: '' },
      'c10', 'c11', 'c12', 'c13', 'c14', 'c20',
    ],
    customCSS: window.__legacyCSS || '',
    plugins: [{ name: 'risu_folder_master', enabled: true }],
  };
  // 시험별 추가 봇: window.__extraChars = [{ chaId, name, lastInteraction, creator, tags }] → 폴더 밖 끝에 붙는다.
  for (const c of window.__extraChars || []) { chars.push({ image: '', type: 'character', additionalAssets: [], modules: [], ...c }); db.characterOrder.push(c.chaId); }
  const store = new Map(Object.entries(window.__storeSeed || {}));
  const local = new Map(Object.entries(window.__localSeed || {}));
  window.__local = local;
  const svg = (i) => {
    const h = hues[i % hues.length];
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h},55%,62%)"/><stop offset="1" stop-color="hsl(${h + 40},50%,32%)"/></linearGradient></defs><rect width="100" height="100" fill="url(#g)"/><circle cx="50" cy="42" r="18" fill="rgba(255,255,255,.55)"/><rect x="22" y="66" width="56" height="40" rx="20" fill="rgba(255,255,255,.4)"/></svg>`);
  };
  window.__db = db;
  window.__calls = [];
  window.__rootStyles = [];
  window.Risuai = {
    // 공식판: 숫자 index 만. 해적판(__single): chaId 문자열도 받고, 한 명씩 느리게 준다.
    getCharacterFromIndex: async (t) => {
      window.__singleCalls = (window.__singleCalls || 0) + 1;
      if (typeof t === 'number') { if (window.__probeFail) throw new Error('probe failure'); return JSON.parse(JSON.stringify(db.characters[t] || null)); }
      if (!window.__single) return undefined;
      await new Promise((r) => setTimeout(r, window.__singleDelay || 150));
      if ((window.__failIds || []).includes(t)) throw new Error('mock read failure');
      const c = db.characters.find((x) => x.chaId === t);
      return c ? JSON.parse(JSON.stringify(c)) : null;
    },
    getCurrentCharacterIndex: async () => (typeof window.__curIdx === 'number' ? window.__curIdx : -1),
    getCharacter: async () => JSON.parse(JSON.stringify(db.characters[window.__curIdx] ?? null)),
    registerSetting: async (n, cb) => { window.__open = cb; return { id: 'x' }; },
    registerButton: async (a, cb) => ({ id: 'y' }),
    onUnload: async (cb) => { window.__unload = cb; },
    getDatabase: async (keys) => { if (keys.includes('characters')) window.__fullCalls = (window.__fullCalls || 0) + 1; await new Promise((r) => setTimeout(r, keys.includes('characters') ? (window.__slowChars || 20) : 20)); return JSON.parse(JSON.stringify(Object.fromEntries(keys.map((k) => [k, db[k]])))); },
    setDatabaseLite: async (p) => { window.__calls.push(Object.keys(p).join(',')); await new Promise((r) => setTimeout(r, 120)); Object.assign(db, JSON.parse(JSON.stringify(p))); },
    readImage: async (p) => { await new Promise((r) => setTimeout(r, 30)); return svg(parseInt(p.slice(3), 10) || 0); },
    saveAsset: async (data) => { (window.__saved ||= []).push(data); return 'img3'; },
    // 템플릿 받기: 시험이 window.__tpl 에 { 파일 경로: base64 } 를 넣어 둔다. 없으면 실패.
    nativeFetch: async (url) => {
      (window.__fetched ||= []).push(url);
      const key = url.split('/templates/')[1];
      const b64 = window.__tpl && window.__tpl[key];
      if (!b64 || window.__tplOffline) return new Response('', { status: 404 });
      const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      return new Response(u, { status: 200 });
    },
    showContainer: async () => window.__calls.push('show'),
    hideContainer: async () => window.__calls.push('hide'),
    getLocalPluginStorage: async () => ({ getItem: async (k) => local.get(k) ?? null, setItem: async (k, v) => local.set(k, v) }),
    // __storeLag: 해적판처럼 쓰기가 서버에 늦게 반영되는 경우(바로 읽으면 옛 값).
    pluginStorage: { getItem: async (k) => JSON.parse(JSON.stringify(store.get(k) ?? null)), setItem: async (k, v) => { const c = JSON.parse(JSON.stringify(v)); if (window.__storeLag) setTimeout(() => store.set(k, c), window.__storeLag); else store.set(k, c); } },
    getRootDocument: async () => ({
      querySelectorAll: async (sel) => { const m = /x-id="([^"]+)"/.exec(sel || ''); return window.__rootStyles.filter((el) => !m || !el['x-id'] || el['x-id'] === m[1]); },
      querySelector: async (s) => (s === 'head' ? { appendChild: async (el) => window.__rootStyles.push(el) } : null),
      createElement: async () => { const el = { html: '', setAttribute: async (k, v) => { el[k] = v; }, setInnerHTML: async (v) => { el.html = v; }, remove: async () => { window.__rootStyles = window.__rootStyles.filter((x) => x !== el); } }; return el; },
    }),
  };
  window.__store = store;
})();
