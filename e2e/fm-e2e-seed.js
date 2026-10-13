//@name fm_e2e_seed
//@display-name FM e2e seed (test server only)
//@api 3.0
//@version 0.0.1
// FMSEED: 시험 서버 전용. 첫 캐릭터를 복제해 봇과 폴더를 만든다. 라이브에 설치하지 않는다.
window.__fmSeed = async (n, folders) => {
  const db = await Risuai.getDatabase(['characters', 'characterOrder']);
  const base = db.characters[0];
  const chars = db.characters.slice();
  const ids = chars.map((c) => c.chaId);
  for (let i = chars.length; i < n; i++) {
    const c = JSON.parse(JSON.stringify(base));
    c.chaId = 'fmseed-' + i + '-' + Math.random().toString(36).slice(2, 8);
    c.name = '시험봇 ' + i;
    c.chats = [{ message: [], note: '', name: 'Chat 1', localLore: [] }];
    c.chatPage = 0;
    chars.push(c); ids.push(c.chaId);
  }
  await Risuai.setDatabaseLite({ characters: chars });
  const order = [];
  let k = 0;
  for (const [name, size, color] of folders) { order.push({ id: 'seed-' + name, name, color, data: ids.slice(k, k + size), imgFile: '' }); k += size; }
  order.push(...ids.slice(k));
  await Risuai.setDatabaseLite({ characterOrder: order });
  const after = await Risuai.getDatabase(['characters', 'characterOrder']);
  return { chars: after.characters.length, order: after.characterOrder.length };
};
window.__fmDb = async (keys) => Risuai.getDatabase(keys);
window.__fmSet = async (patch) => Risuai.setDatabaseLite(patch);
