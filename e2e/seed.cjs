const L = require('./lib.cjs');
(async () => {
  const { ctx, p } = await L.open(); const stop = L.autoYes(p); await p.waitForTimeout(8000);
  const f = await L.seedFrame(p);
  console.log(await f.evaluate(() => window.__fmSeed(30, [['액션', 10, 'red'], ['일상', 6, 'blue'], ['판타지', 4, 'purple']])));
  await p.waitForTimeout(3000); await L.shot(p, 'seeded');
  console.log(p.__logs.filter((x) => /PAGEERROR|error:/.test(x) && !/404/.test(x)).slice(-8).join('\n'));
  stop(); await ctx.close();
})();
