const path = require('path'), fs = require('fs');
const { setup } = require('./lib');
const SHOTS = path.join(__dirname, '.shots'); fs.mkdirSync(SHOTS, { recursive: true }); process.chdir(SHOTS);
let BASE; const fails=[]; const ok=(c,m)=>{if(!c)fails.push(m)};
(async()=>{const env = await setup(); const br = env.browser; BASE = env.base;
async function ctx(w,h,seed){const c=await br.newContext({viewport:{width:w,height:h}}); if(seed) await c.addInitScript(s=>{if(!sessionStorage.x){localStorage.setItem('driftcalc-v1',s);sessionStorage.x=1}},seed); return c;}
async function page(c){const p=await c.newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));await p.route(/goatcounter/,r=>r.abort());return p;}
// 1. first visit: appears after ~1s, doesn't steal focus; X retires it across reloads
{ const c=await ctx(390,844), p=await page(c); await p.goto(BASE);
  ok(!(await p.$('.tn')),'nudge too early'); await p.waitForTimeout(1500); ok(await p.isVisible('.tn'),'nudge not shown');
  ok(await p.evaluate(()=>!document.activeElement.closest('.tn')),'nudge stole focus');
  await p.screenshot({path:'nudge-phone.png'});
  await p.click('.tn .tq-x'); await p.waitForTimeout(300); ok(!(await p.$('.tn')),'X did not remove');
  await p.reload(); await p.waitForTimeout(1600); ok(!(await p.$('.tn')),'came back after X'); ok(p.errs.length===0,'e1 '+p.errs); await c.close(); }
// 2. Show me around starts tour, retires nudge
{ const c=await ctx(1280,800), p=await page(c); await p.goto(BASE); await p.waitForTimeout(1500);
  await p.screenshot({path:'nudge-desk.png'});
  await p.click('.tn .btn.primary'); ok(!!(await p.$('.tt-card')),'tour not started'); await p.waitForTimeout(300); ok(!(await p.$('.tn')),'nudge stayed during tour');
  await p.keyboard.press('Escape'); await p.reload(); await p.waitForTimeout(1600); ok(!(await p.$('.tn')),'came back after tour'); await c.close(); }
// 3. quiz moves it aside, it returns after the quiz finishes
{ const c=await ctx(390,844), p=await page(c); await p.goto(BASE); await p.waitForTimeout(1500);
  await p.click('#sampleBanner .tq-entry'); await p.waitForTimeout(300); ok(!(await p.$('.tn')),'nudge over quiz');
  await p.check('.tq input[value="target"]'); await p.click('.tq-foot .btn.primary'); await p.waitForSelector('.tq input[name=tq2]');
  await p.check('.tq input[name=tq2][value="80"]'); await p.click('.tq-foot .btn.primary'); await p.check('.tq input[name=tq3][value="20"]'); await p.click('.tq-foot .btn.primary');
  await p.check('.tq input[name=tq4][value="0"]'); await p.click('.tq-foot .btn.primary'); await p.check('.tq input[name=tq5][value="HSA"]'); await p.click('.tq-foot .btn.primary');
  await p.waitForTimeout(1500); ok(!(await p.$('.tn')),'nudge on top of toast'); await p.waitForTimeout(2000); ok(await p.isVisible('.tn'),'nudge not back after quiz');
  await p.screenshot({path:'nudge-after-quiz.png'});
  await p.click('.tn .btn.primary'); ok(!!(await p.$('.tt-card')),'tour from nudge after quiz'); ok(p.errs.length===0,'e3 '+p.errs); await c.close(); }
// 4. no accounts: no nudge, not retired
{ const c=await ctx(390,844,JSON.stringify({accounts:[],equityPct:90})), p=await page(c); await p.goto(BASE); await p.waitForTimeout(1600);
  ok(!(await p.$('.tn')),'nudge on empty page'); ok(await p.evaluate(()=>localStorage.getItem('driftcalc-tour-nudge'))===null,'retired on empty page'); await c.close(); }
// 5. ?setup=1: quiz open, no nudge on top
{ const c=await ctx(390,844), p=await page(c); await p.goto(BASE+'?setup=1'); await p.waitForTimeout(1600); ok(!(await p.$('.tn')),'nudge over setup link'); await c.close(); }
// 6. storage blocked: no crash
{ const c=await ctx(390,844); await c.addInitScript(()=>{Object.defineProperty(window,'localStorage',{get(){throw new Error('blocked')}})});
  const p=await page(c); await p.goto(BASE); await p.waitForTimeout(1600); ok(p.errs.filter(e=>!/blocked/.test(e)).length===0,'storage-blocked errors '+p.errs); await c.close(); }
await env.close(); console.log(fails.length?'FAILURES:\n'+fails.join('\n'):'NUDGE ALL PASS'); process.exitCode = fails.length ? 1 : 0;})();
