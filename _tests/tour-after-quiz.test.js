const path = require('path'), fs = require('fs');
const { setup } = require('./lib');
const SHOTS = path.join(__dirname, '.shots'); fs.mkdirSync(SHOTS, { recursive: true }); process.chdir(SHOTS);
let BASE;
const fails=[]; const ok=(c,m)=>{if(!c)fails.push(m)};
(async()=>{const env = await setup(); const br = env.browser; BASE = env.base;
async function page(w,h,seed){const p=await (await br.newContext({viewport:{width:w,height:h}})).newPage();p.errs=[];
 p.on('pageerror',e=>p.errs.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!/goatcounter/.test(m.text()))p.errs.push(m.text())});
 await p.route(/goatcounter/,r=>r.abort()); if(seed) await p.addInitScript(s=>{if(!sessionStorage.x){localStorage.setItem('driftcalc-v1',s);sessionStorage.x=1}},seed); return p;}
// 1. the real path: run the quiz, then look for the tour
{ const p=await page(390,844); await p.goto(BASE);
  await p.click('#sampleBanner .tq-entry'); await p.check('.tq input[value="target"]'); await p.click('.tq-foot .btn.primary');
  await p.waitForSelector('.tq input[name=tq2]'); await p.check('.tq input[name=tq2][value="90"]'); await p.click('.tq-foot .btn.primary');
  await p.check('.tq input[name=tq3][value="38"]'); await p.click('.tq-foot .btn.primary'); await p.check('.tq input[name=tq4][value="0"]'); await p.click('.tq-foot .btn.primary');
  await p.check('.tq input[name=tq5][value="401(k)"]'); await p.check('.tq input[name=tq5][value="Roth IRA"]'); await p.click('.tq-foot .btn.primary');
  await p.waitForTimeout(600);
  ok(await p.isVisible('#firstRun .tt-entry'),'after quiz: no tour button in the No balances box');
  /* screenshot the box itself: a clip from boundingBox() missed it when the page
     was still scrolling, and threw "Clipped area is either empty or outside" */
  await p.locator('#firstRun').screenshot({path:'after-quiz-firstrun.png'});
  await p.click('#firstRun .tt-entry');
  const n=await p.$$eval('.tt-card .tq-steps i',x=>x.length); ok(n===5,'after quiz stops '+n+' (summary row should be skipped)');
  ok((await p.textContent('#ttTitle'))==='Your target','first stop '+await p.textContent('#ttTitle'));
  for(let i=0;i<n;i++){ await p.waitForTimeout(1300);
    const op=await p.$eval('.tt-hole',e=>getComputedStyle(e).opacity); ok(op==='1','after quiz stop '+i+' hole hidden');
    await p.screenshot({path:`aq-tour-${i+1}.png`}); await p.click('.tt-nav .btn.primary'); }
  ok(!(await p.$('.tt-card')),'tour did not end'); ok(p.errs.length===0,'errs '+p.errs.join('|')); await p.context().close(); }
// 2. no accounts at all: refuses, no tour button
{ const p=await page(390,844,JSON.stringify({accounts:[],equityPct:90})); await p.goto(BASE);
  ok(!(await p.$('#firstRun .tt-entry')),'tour button shown with no accounts');
  await p.evaluate(()=>startTour()); ok(!(await p.$('.tt-card')),'tour ran with no accounts'); await p.context().close(); }
// 3. files load with the version tag
{ const p=await page(390,844); const got=[]; p.on('response',r=>{if(/(tour|backtest)\.js|polish\.css/.test(r.url()))got.push(r.status()+' '+r.url().split('/').pop())});
  await p.goto(BASE); ok(got.length===3&&got.every(g=>g.startsWith('200')),'versioned files '+got); await p.context().close(); }
await env.close(); console.log(fails.length?'FAILURES:\n'+fails.join('\n'):'AFTER-QUIZ TOUR PASS'); process.exitCode = fails.length ? 1 : 0;})();
