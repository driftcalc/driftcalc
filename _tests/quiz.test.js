const path = require('path'), fs = require('fs');
const { setup } = require('./lib');
const SHOTS = path.join(__dirname, '.shots'); fs.mkdirSync(SHOTS, { recursive: true }); process.chdir(SHOTS);
const OUT = '.'; let BASE;
const fails = []; const ok = (c, m) => { if (!c) fails.push(m); };
(async () => {
  const env = await setup(); const br = env.browser; BASE = env.base;
  async function page(w, seed) {
    const ctx = await br.newContext({ viewport: { width: w || 1100, height: 900 } });
    const p = await ctx.newPage(); p.errs = [];
    p.on('pageerror', e => p.errs.push('pageerror ' + e.message));
    p.on('console', m => { if (m.type() === 'error' && !/goatcounter/.test(m.text())) p.errs.push('console ' + m.text()); });
    await p.route(/goatcounter/, r => r.abort());
    if (seed) await p.addInitScript(s => { if (!sessionStorage.seeded) { localStorage.setItem('driftcalc-v1', s); sessionStorage.seeded = 1; } }, seed);
    return p;
  }
  const pick = (p, name, v) => p.check(`.tq input[name=${name}][value="${v}"]`);
  const next = p => p.click('.tq-foot .btn.primary');
  const state = p => p.evaluate(() => JSON.parse(localStorage.getItem('driftcalc-v1')));

  // every path: 3 routes x 5 eq x 3 intl x 2 tilt is a lot, so every option at least once plus all combos of eq x tilt
  const combos = [];
  for (const eq of [100, 90, 80, 60, 40]) for (const tilt of [0, 22]) combos.push({ eq, tilt, intl: [0, 20, 38][combos.length % 3], route: combos.length % 2 ? 'drift' : 'target', accts: [['401(k)'], ['Roth IRA', 'HSA'], ['401(k)', 'Roth IRA', 'Traditional IRA', 'HSA', 'Taxable']][combos.length % 3] });
  for (const c of combos) {
    const p = await page();
    await p.goto(BASE);
    await p.click('#sampleBanner .tq-entry');
    await pick(p, 'tq1', c.route); await next(p);
    await p.waitForSelector('.tq input[name=tq2]');
    await pick(p, 'tq2', c.eq); await next(p);
    await pick(p, 'tq3', c.intl); await next(p);
    await pick(p, 'tq4', c.tilt); await next(p);
    for (const a of c.accts) await pick(p, 'tq5', a);
    await next(p);
    const s = await state(p);
    const tag = JSON.stringify(c);
    ok(!(await p.$('.tq-back')), tag + ' overlay still open');
    ok(s.equityPct === c.eq && s.intlPct === c.intl && s.tiltPct === c.tilt, tag + ' dials ' + JSON.stringify([s.equityPct, s.intlPct, s.tiltPct]));
    ok(s.preset === (c.tilt ? 'Factor tilt' : 'Market portfolio'), tag + ' preset ' + s.preset);
    ok(s.isSample === false, tag + ' still sample');
    ok(s.accounts.length === c.accts.length && s.accounts.every(a => a.holdings.length === 1 && a.holdings[0].bal === 0), tag + ' accounts');
    ok(JSON.stringify(s.accounts.map(a => a.type)) === JSON.stringify(c.accts.length === 5 ? ['401(k)', 'Roth IRA', 'Traditional IRA', 'HSA', 'Taxable'] : c.accts), tag + ' account order');
    ok(!/[?&](eq|bal)/.test(p.url()) || !/bal/.test(p.url()), tag + ' url');
    ok(await p.isVisible('#firstRun'), tag + ' first-run block should show (no balances)');
    ok(!(await p.$eval('#s1', e => e.classList.contains('closed'))), tag + ' s1 not opened');
    // reload: survives sanitizeState and renders same
    await p.reload(); const s2 = await state(p);
    ok(JSON.stringify(s2.accounts) === JSON.stringify(s.accounts) && s2.equityPct === c.eq, tag + ' reload round trip');
    ok(p.errs.length === 0, tag + ' errors ' + p.errs.join(' | '));
    await p.context().close();
  }

  // just looking: nothing written
  { const p = await page(); await p.goto(BASE); const before = await state(p);
    await p.click('#sampleBanner .tq-entry'); await pick(p, 'tq1', 'look'); await next(p);
    ok(JSON.stringify(await state(p)) === JSON.stringify(before), 'just looking changed state');
    ok(!(await p.$('.tq-back')), 'just looking left overlay'); await p.context().close(); }

  // escape midway: nothing written; focus back on opener
  { const p = await page(); await p.goto(BASE); const before = await state(p);
    await p.click('#sampleBanner .tq-entry'); await pick(p, 'tq1', 'target'); await next(p);
    await p.keyboard.press('Escape');
    ok(JSON.stringify(await state(p)) === JSON.stringify(before), 'escape changed state');
    ok(await p.evaluate(() => document.activeElement.classList.contains('tq-entry')), 'focus not restored'); await p.context().close(); }

  // real data: gate shows, cancel keeps data, plan survives start over
  { const real = { accounts: [{ id: 'a', name: 'Mine', type: 'Roth IRA', holdings: [{ id: 'h', ticker: 'VTI', cls: 'US', bal: 5000 }] }], equityPct: 70, intlPct: 30, tiltPct: 0, preset: 'Market portfolio', plan: { income: 90000, savePct: 15, monthly: 500, target: 2e6 }, ytd: {} };
    const p = await page(1100, JSON.stringify(real)); await p.goto(BASE);
    ok(!(await p.$('.tq-entry')), 'entry button shown over real data (no sample banner/first-run expected)');
    await p.evaluate(() => openSetupQuiz());
    ok((await p.textContent('#tqTitle')) === 'Start over?', 'gate not shown');
    await p.click('button:has-text("Cancel")');
    ok((await state(p)).accounts[0].holdings[0].bal === 5000, 'cancel lost data');
    await p.evaluate(() => openSetupQuiz()); await p.click('button:has-text("Start over")');
    await pick(p, 'tq1', 'drift'); await next(p); await p.waitForSelector('.tq input[name=tq2]');
    await pick(p, 'tq2', 80); await next(p); await pick(p, 'tq3', 20); await next(p); await pick(p, 'tq4', 0); await next(p);
    await pick(p, 'tq5', 'Taxable'); await next(p);
    const s = await state(p);
    ok(s.plan.income === 90000 && s.plan.target === 2e6, 'plan not kept ' + JSON.stringify(s.plan));
    ok(s.accounts.length === 1 && s.accounts[0].name === 'Taxable brokerage', 'start over accounts');
    ok(p.errs.length === 0, 'gate errors ' + p.errs.join('|')); await p.context().close(); }

  // empty page: entry in first-run block
  { const p = await page(1100, JSON.stringify({ accounts: [], equityPct: 90 })); await p.goto(BASE);
    ok(await p.isVisible('#firstRun .tq-entry'), 'no entry on empty first-run block');
    ok(await p.$$eval('#firstRun .btn.primary', b => b.length) === 1, 'more than one primary on first-run'); await p.context().close(); }

  // ?setup=1 opens, strips the param, keeps others
  { const p = await page(); await p.goto(BASE + '?eq=80&setup=1');
    ok(await p.isVisible('.tq'), 'setup=1 did not open'); ok(p.url().endsWith('/?eq=80'), 'url after setup=1: ' + p.url()); await p.context().close(); }

  // returns.json failing: step 2 still answerable
  { const p = await page(); await p.route(/returns\.json/, r => r.fulfill({ status: 500, body: '' })); await p.goto(BASE);
    await p.click('#sampleBanner .tq-entry'); await pick(p, 'tq1', 'target'); await next(p);
    await p.waitForSelector('.tq input[name=tq2]'); ok(/Could not load/.test(await p.textContent('.tq')), 'no fallback note');
    ok(!/fell/.test(await p.textContent('.tq')), 'numbers shown without data'); await p.context().close(); }

  // screenshots at 400px
  { const p = await page(400); await p.goto(BASE);
    await p.screenshot({ path: OUT + '/0-banner-400.png' });
    await p.click('#sampleBanner .tq-entry'); await pick(p, 'tq1', 'drift'); await next(p);
    await p.waitForSelector('.tq input[name=tq2]'); await pick(p, 'tq2', 90);
    await p.screenshot({ path: OUT + '/2-fall-400.png' });
    ok(await p.evaluate(() => document.documentElement.scrollWidth <= 400), 'horizontal scroll at 400');
        await next(p); await p.screenshot({ path: OUT + '/3-intl-400.png' });
    await pick(p, 'tq3', 38); await next(p); await pick(p, 'tq4', 0); await next(p);
    await pick(p, 'tq5', '401(k)'); await pick(p, 'tq5', 'Roth IRA'); await p.screenshot({ path: OUT + '/5-accts-400.png' });
    await next(p); await p.waitForTimeout(800); await p.screenshot({ path: OUT + '/6-landed-400.png' });
    await p.context().close(); }

  await env.close();
  console.log(fails.length ? 'FAILURES:\n' + fails.join('\n') : 'ALL PASS (' + combos.length + ' full paths + 6 edge cases)'); process.exitCode = fails.length ? 1 : 0;
})();
