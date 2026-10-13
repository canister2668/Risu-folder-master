// 시험 서버 설정 › Plugin 에서 파일을 설치한다. 사용: node install.cjs <file.js...>
const L = require('./lib.cjs');
(async () => {
  const { ctx, p } = await L.open(); const stop = L.autoYes(p); await p.waitForTimeout(8000);
  await p.mouse.click(40, 24); await p.waitForTimeout(700); await p.mouse.click(40, 84); await p.waitForTimeout(1200);
  await p.getByText('Plugin', { exact: true }).first().click(); await p.waitForTimeout(1000);
  for (const f of process.argv.slice(2)) {
    const pos = await p.evaluate(() => { const b = [...document.querySelectorAll('button')].map((b) => b.getBoundingClientRect()).filter((r) => Math.round(r.x) === 377); return b.length ? { x: b[b.length - 1].x + 12, y: b[b.length - 1].y + 12 } : { x: 389, y: 212 }; });
    const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.mouse.click(pos.x, pos.y)]);
    await fc.setFiles(f); await p.waitForTimeout(3000);
    console.log('installed', f, '\n', (await p.evaluate(() => document.body.innerText)).slice(-500));
    await L.shot(p, 'install-' + require('path').basename(f));
  }
  console.log(p.__logs.filter((x) => /DIALOG|PAGEERROR/.test(x)).slice(-8).join('\n'));
  stop(); await ctx.close();
})();
