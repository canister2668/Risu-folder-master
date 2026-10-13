// 시험 서버(ASR-TEST, 127.0.0.1:16099, 버리는 DB)용 Playwright 도우미. 라이브 서버에는 쓰지 않는다.
const { chromium } = require('/volume2/risu/build/nai-studio/work/update-v5.3.1/browser/node_modules/playwright');
const path = require('path');
const URL = process.env.FM_E2E_URL || 'http://127.0.0.1:16099/';
// 이 스크립트들은 확인창을 자동 승인하고 폴더 배치·customCSS를 바꾼다. 시험 서버(로컬 주소)만 허용한다.
{
  const u = new globalThis.URL(URL);
  if (!['127.0.0.1', 'localhost'].includes(u.hostname) || u.port !== '16099') {
    console.error(`refusing to run e2e against ${URL}: test server only`);
    process.exit(2);
  }
}
exports.URL = URL;
exports.open = async (w = 1280, h = 900, profile = '/tmp/fm-e2e-profile') => {
  const ctx = await chromium.launchPersistentContext(profile, { args: ['--no-sandbox'], viewport: { width: w, height: h } });
  const p = ctx.pages()[0] || await ctx.newPage();
  p.__logs = [];
  p.on('console', (m) => p.__logs.push(m.type() + ': ' + m.text().slice(0, 300)));
  p.on('pageerror', (e) => p.__logs.push('PAGEERROR ' + e.message));
  p.on('dialog', async (d) => { p.__logs.push('DIALOG ' + d.message().slice(0, 200)); try { await d.accept(); } catch {} });
  await p.goto(URL, { waitUntil: 'domcontentloaded' });
  if (new globalThis.URL(p.url()).port !== '16099') { await ctx.close(); throw new Error('redirected away from the test server: ' + p.url()); }
  return { ctx, p };
};
exports.shot = (p, n) => p.screenshot({ path: path.join(__dirname, 'shots', n + '.png') });
exports.autoYes = (p) => { const t = setInterval(async () => { try { const y = p.getByText('YES', { exact: true }); if (await y.count() && await y.first().isVisible()) await y.first().click(); } catch {} }, 400); return () => clearInterval(t); };
exports.seedFrame = async (p, ms = 30000) => {
  const t0 = Date.now();
  for (;;) {
    for (const f of p.frames()) { if (f === p.mainFrame()) continue; try { if (await f.evaluate(() => typeof window.__fmSeed === 'function')) return f; } catch {} }
    if (Date.now() - t0 > ms) throw new Error('seed frame not found');
    await p.waitForTimeout(800);
  }
};
