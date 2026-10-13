const L = require('./lib.cjs');
(async () => {
  const { ctx, p } = await L.open();
  const stop = L.autoYes(p);
  await p.waitForTimeout(9000);
  const info = await p.evaluate(() => {
    const sb = document.querySelector('.rs-sidebar'); const sc = document.querySelector('.rs-sidebar-scroll');
    return { sb: sb && sb.getBoundingClientRect().width, parent: sc && sc.parentElement.className, kids: sc ? [...sc.children].map(c => c.className.slice(0, 60)) : null };
  });
  console.log(JSON.stringify(info, null, 1));
  await L.shot(p, 'probe');
  console.log(p.__logs.filter(x => /error/i.test(x)).slice(-5).join('\n'));
  stop(); await ctx.close();
})();
