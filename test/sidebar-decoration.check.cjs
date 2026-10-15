// 실제 Chromium에서 공식/해적 DOM의 단열·다열과 꾸미기 조합을 확인한다.
const { chromium } = require('/volume2/risu/build/nai-studio/work/update-v5.3.1/browser/node_modules/playwright');
const fs = require('fs');
const path = require('path');
const src = ['src/core/util.js', 'src/sidebar/grid.js'].map(f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n');
const assert = require('node:assert/strict');
const css = `*{box-sizing:border-box}body{margin:0}.rs-sidebar{display:flex;flex-direction:column;width:80px;min-width:80px;align-items:center}
.scroll{display:flex;flex-direction:column;width:100%;align-items:center}.group{display:flex;align-items:center;padding:0 8px}.avatar{display:block;width:56px;height:56px;flex-shrink:0}.border{border:1px solid red}.p-1{padding:4px}.flex-col{flex-direction:column}.p-1.flex-col{display:flex;align-items:center}.relative{position:relative}.absolute{position:absolute}.h-4{height:16px;min-height:16px;width:56px}.w-full{width:100%}.h-full{height:100%}.left-1{left:4px}.top-0{top:0}.rounded-lg{border-radius:8px}button.w-14{width:56px;min-width:56px}.gap-2{display:flex;gap:8px;padding:0 8px}.border-b-selected .absolute{display:flex;flex-direction:column;width:80px}.avatar:focus-visible{outline:2px solid blue}`;
function fixture(kind, bottom) {
  const item = (id, folder = false, inner = false) => `<div class="group relative flex items-center px-2${inner ? ' z-10' : ''}" data-id="${id}"><span role="button" tabindex="0" class="avatar${folder ? ' border' : ''}">${id}</span></div>`;
  const gap = '<div class="h-4 min-h-4 w-14" role="listitem"></div>';
  const box = `<div class="p-1 flex flex-col items-center py-1 mt-1 rounded-lg relative"><div class="absolute top-0 left-1 border w-full h-full rounded-lg z-0"></div>${gap}${Array.from({length:12},(_,i)=>item('b'+i,false,true)+gap).join('')}</div>`;
  return `<style>${css}</style><div id="outside" role="button"><span class="border">outside</span></div><div class="rs-sidebar-panel"><span class="avatar border">panel</span></div><div class="rs-sidebar ${kind === 'haejeok' ? 'risu-sub-sidebar' : ''}"><button class="flex h-8 min-h-8 w-14 min-w-14"><svg></svg></button><div class="${bottom ? 'border-t-selected' : 'border-b-selected'}"><div data-menu class="${bottom ? 'bottom-full ' : ''}${kind === 'haejeok' ? 'rs-sidebar-menu-popover ' : ''}absolute w-20 min-w-20 flex flex-col items-center">menu</div></div><div class="${kind === 'haejeok' ? 'rs-sidebar-scroll ' : ''}scroll flex grow w-full flex-col items-center overflow-x-hidden overflow-y-auto">${gap}${item('F',true)}${box}${gap}${item('loose')}${gap}<div class="flex flex-col items-center gap-2 px-2"><button>+</button></div></div></div>`;
}
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  let checks = 0;
  try {
    for (const kind of ['official', 'haejeok']) for (const bottom of [false,true]) {
      const p = await browser.newPage({ viewport: {width:390,height:844}, reducedMotion:'reduce' });
      await p.setContent(fixture(kind,bottom));
      await p.addScriptTag({content:src});
      for (const mode of ['off','all','folder']) for (const cols of [2,3,4,5]) {
        const r = await p.evaluate(({mode,cols}) => {
          let style = document.querySelector('style[x-test]');
          if (!style) { style=document.createElement('style');style.setAttribute('x-test','');document.head.appendChild(style); }
          style.textContent = buildGridCSS(normalizeGrid({mode,cols,align:true,motion:true,borderless:true}));
          const box = document.querySelector('.p-1.flex-col');
          const bots = [...box.querySelectorAll('.group')];
          const rect = e => {const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,right:r.right};};
          const main=document.querySelector('.rs-sidebar');
          return {width:rect(main).w, box:rect(box), items:bots.map(rect),
            border:getComputedStyle(document.querySelector('[data-id="F"] .avatar')).borderColor,
            boxBorder:getComputedStyle(box.querySelector('.border')).borderColor,
            outside:getComputedStyle(document.querySelector('#outside span')).borderColor,
            panel:getComputedStyle(document.querySelector('.rs-sidebar-panel span')).borderColor,
            animation:getComputedStyle(box).animationName,
            transition:getComputedStyle(main).transitionDuration,
            toggleX:rect(main.querySelector('button')).x-rect(main).x,
            dropHeight:box.querySelector('.h-4').getBoundingClientRect().height};
        },{mode,cols});
        assert.equal(r.width,mode==='off'?80:(cols*4.5+1.25)*16, `${kind} ${mode} ${cols}: width`);
        assert.equal(r.items.filter(x=>Math.abs(x.y-r.items[0].y)<1).length,mode==='off'?1:cols, `${kind} ${mode} ${cols}: exact columns`);
        assert.ok(r.items.every(x=>x.w===72 && x.right<=r.box.right+1), `${kind} ${mode} ${cols}: cells fit`);
        assert.equal(r.border,'rgba(0, 0, 0, 0)');
        assert.equal(r.boxBorder,'rgba(0, 0, 0, 0)');
        assert.equal(r.outside,'rgb(255, 0, 0)');assert.equal(r.panel,'rgb(255, 0, 0)');
        assert.equal(r.animation,'none');assert.equal(r.transition,'0s');
        assert.equal(r.toggleX,12);assert.ok(r.dropHeight>0);
        checks++;
      }
      await p.emulateMedia({reducedMotion:'no-preference'});
      const motion=await p.evaluate(() => ({folder:getComputedStyle(document.querySelector('.p-1.flex-col')).animationName,menu:getComputedStyle(document.querySelector('[data-menu]')).animationName}));
      assert.equal(motion.folder,'fm-sidebar-folder-open');assert.equal(motion.menu,bottom?'fm-sidebar-menu-open-bottom':'fm-sidebar-menu-open');
      await p.focus('[data-id="F"] .avatar');
      assert.equal(await p.$eval('[data-id="F"] .avatar',e=>getComputedStyle(e).outlineStyle),'solid');
      await p.emulateMedia({reducedMotion:'reduce'});
      await p.evaluate(()=>{document.querySelector('.p-1.flex-col').remove();});
      assert.equal(await p.$eval('.rs-sidebar',e=>e.getBoundingClientRect().width),80,'closing last folder restores one-column width');
      await p.evaluate(()=>{document.querySelector('style[x-test]').textContent=buildGridCSS(normalizeGrid(null));});
      assert.equal(await p.$eval('[data-id="F"] .avatar',e=>getComputedStyle(e).borderColor),'rgb(255, 0, 0)');
      await p.close();
    }
    console.log(`PASS ${checks} layout combinations; reduced motion, menu effects, focus, isolation and reset`);
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
