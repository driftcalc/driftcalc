const path = require('path'), fs = require('fs');
const { setup } = require('./lib');
const SHOTS = path.join(__dirname, '.shots'); fs.mkdirSync(SHOTS, { recursive: true }); process.chdir(SHOTS);
let BASE; const fails=[]; const ok=(c,m)=>{if(!c)fails.push(m)};
(async()=>{const env = await setup(); const br = env.browser; BASE = env.base;
async function page(w,h,seed){const p=await (await br.newContext({viewport:{width:w,height:h}})).newPage();p.errs=[];
 p.on('pageerror',e=>p.errs.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!/goatcounter/.test(m.text()))p.errs.push(m.text())});
 await p.route(/goatcounter/,r=>r.abort()); if(seed) await p.addInitScript(s=>{if(!sessionStorage.x){localStorage.setItem('driftcalc-v1',s);sessionStorage.x=1}},seed); return p;}
const openState=p=>p.evaluate(()=>['s1','s2','s3','s5'].filter(id=>!document.getElementById(id).classList.contains('closed')).join(','));

for (const [w,h,name] of [[390,844,'phone'],[1280,800,'desk'],[320,568,'tiny']]) {
  const p=await page(w,h); await p.goto(BASE);
  const before=await openState(p), stateBefore=await p.evaluate(()=>localStorage.getItem('driftcalc-v1'));
  await p.click('#sampleBanner .tt-entry');
  const n=await p.$$eval('.tt-card .tq-steps i',x=>x.length); ok(n===6,name+' stops '+n);
  for(let i=0;i<n;i++){
    await p.waitForTimeout(1300);
    const info=await p.evaluate(()=>{const hole=document.querySelector('.tt-hole').getBoundingClientRect();const card=document.querySelector('.tt-card').getBoundingClientRect();
      return {title:document.querySelector('#ttTitle').textContent, op:getComputedStyle(document.querySelector('.tt-hole')).opacity, hole:[hole.top|0,hole.bottom|0,hole.height|0], cardTop:card.top|0, focus:document.activeElement.id, hscroll:document.documentElement.scrollWidth>innerWidth}});
    ok(info.op==='1' && info.hole[2]>=24, `${name} stop ${i} ${info.title} hole not shown ${JSON.stringify(info)}`);
    ok(info.focus==='ttTitle',`${name} stop ${i} focus ${info.focus}`);
    ok(!info.hscroll,`${name} stop ${i} horizontal scroll`);
    ok(info.hole[1]<=info.cardTop,`${name} stop ${i} hole under card`);
    // section stops must be open
    const sid=['statStrip','s2','s1','s3','s5'][i]; if(sid&&sid[0]==='s'&&sid!=='statStrip') ok(await p.$eval('#'+sid,e=>!e.classList.contains('closed')),`${name} ${sid} not opened`);
    await p.screenshot({path:`tour-${name}-${i+1}.png`});
    await p.click('.tt-nav .btn.primary');
  }
  ok(!(await p.$('.tt-card')),name+' card left after Done');
  ok(await openState(p)===before,`${name} fold state not restored: ${before} -> ${await openState(p)}`);
  ok(await p.evaluate(()=>localStorage.getItem('driftcalc-v1'))===stateBefore,name+' tour changed portfolio');
  ok(p.errs.length===0,name+' errors '+p.errs.join('|'));
  await p.context().close();
}
// keyboard: arrows, escape, back
{ const p=await page(1280,800); await p.goto(BASE); await p.click('#sampleBanner .tt-entry');
  await p.keyboard.press('ArrowRight'); await p.keyboard.press('ArrowRight'); ok((await p.textContent('#ttTitle'))==='Your accounts','arrow right');
  await p.keyboard.press('ArrowLeft'); ok((await p.textContent('#ttTitle'))==='Your target','arrow left');
  await p.keyboard.press('Escape'); ok(!(await p.$('.tt-card')),'escape');
  ok(await p.evaluate(()=>document.activeElement.classList.contains('tt-entry')),'focus back to opener'); await p.context().close(); }
// empty page: refuses
{ const p=await page(1280,800,JSON.stringify({accounts:[],equityPct:90})); await p.goto(BASE);
  await p.evaluate(()=>startTour()); ok(!(await p.$('.tt-card')),'tour ran on empty page'); await p.context().close(); }
// header menu entry + quiz "just looking" hands over
{ const p=await page(390,844); await p.goto(BASE);
  await p.click('header .hmore > .btn'); await p.click('.hmenu .tt-entry'); ok(!!(await p.$('.tt-card')),'menu entry'); await p.keyboard.press('Escape');
  await p.click('#sampleBanner .tq-entry'); await p.check('.tq input[value="look"]'); ok((await p.textContent('.tq-foot .btn.primary'))==='Show me around','look label');
  await p.click('.tq-foot .btn.primary'); ok(!(await p.$('.tq-back')) && !!(await p.$('.tt-card')),'look -> tour'); ok(p.errs.length===0,'errs '+p.errs); await p.context().close(); }
// returning user with real data: summary row present, s3 open by default
{ const real={accounts:[{id:'a',name:'Mine',type:'Roth IRA',holdings:[{id:'h',ticker:'VTI',cls:'US',bal:5000}]}],equityPct:80};
  const p=await page(390,844,JSON.stringify(real)); await p.goto(BASE); await p.evaluate(()=>startTour());
  ok(/until you put in your own/.test(await p.textContent('.tt-card'))===false,'sample wording on real data'); ok(p.errs.length===0,'real errs'); await p.context().close(); }
await env.close(); console.log(fails.length?'FAILURES:\n'+fails.join('\n'):'TOUR ALL PASS'); process.exitCode = fails.length ? 1 : 0;})();
