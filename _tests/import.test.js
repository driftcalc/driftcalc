/* A tampered backup must not run script or break out of an attribute.
   Ids this app already generates stay as they are, and a holding still points
   at its account and its category after an unsafe id is replaced. */
const path = require('path'), fs = require('fs'), os = require('os');
const { setup, open, visibleText, JUNK, suite } = require('./lib');

const PAYLOAD = '"><img src=x onerror=alert(1)>';
const HOLD_PAYLOAD = "');alert(1);//";
const CAT_NAME = 'x" onfocus=alert(1) tabindex=0 x="';
const ID_OK = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const GOOD = JSON.stringify({ accounts: [{ id: 'a', name: 'Mine', type: 'Roth IRA', holdings: [{ id: 'h', ticker: 'VTI', cls: 'US', bal: 5000 }] }], equityPct: 80 });

function evil() {
  const targets = { US: 90 };
  targets[PAYLOAD] = 10;
  const ytd = {};
  ytd[PAYLOAD] = 500;
  const contrib = {};
  contrib[PAYLOAD] = '"><img src=x onerror=alert(6)>';
  contrib.safeAcct = 250;
  return {
    accounts: [
      { id: PAYLOAD, name: 'Roth IRA', type: 'Roth IRA', holdings: [
        { id: HOLD_PAYLOAD, ticker: 'CASHX', cls: PAYLOAD, bal: 2500 }
      ] },
      { id: 'safeAcct', name: "O'Brien IRA", type: 'Taxable', holdings: [
        { id: 'safeHold', ticker: 'VTI', cls: 'US', bal: 1000 }
      ] }
    ],
    preset: 'Custom',
    equityPct: 90,
    targets: targets,
    customClasses: [{ id: PAYLOAD, name: CAT_NAME, color: '"><img src=x onerror=alert(2)>' }],
    plan: {
      waitK: '"><img src=x onerror=alert(3)>',
      waitM: '<img src=x onerror=alert(4)>',
      advPct: '"><img src=x onerror=alert(5)>'
    },
    ytd: ytd,
    contrib: contrib
  };
}

const CLEAN = {
  accounts: [{ id: 'acct_1', name: "O'Brien Roth", type: 'Roth IRA', holdings: [
    { id: 'hold-1', ticker: 'VTI', cls: 'x_gold', bal: 4200 }
  ] }],
  equityPct: 80, intlPct: 30, tiltPct: 0, preset: 'Custom',
  targets: { US: 70, x_gold: 30 },
  customClasses: [{ id: 'x_gold', name: 'Gold', color: '#E0A82E' }],
  plan: { income: 5000, savePct: 20, monthly: 1000, target: 1000000, advPct: 0.5, waitK: 2500, waitM: 6 },
  ytd: { acct_1: 1500 },
  contrib: { acct_1: 250 }
};

/* listener has to be on before navigation, or an alert during load is missed */
async function openLoaded(env, raw) {
  const ctx = await env.browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(s => {
    if (sessionStorage.getItem('__seeded')) return;
    localStorage.setItem('driftcalc-v1', s);
    sessionStorage.setItem('__seeded', '1');
  }, raw);
  const page = await ctx.newPage();
  page.dialogs = [];
  page.errs = [];
  page.on('dialog', d => { page.dialogs.push(d.message()); return d.dismiss(); });
  page.on('pageerror', e => page.errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/goatcounter|favicon/i.test(m.text())) page.errs.push('console: ' + m.text()); });
  await page.route(/goatcounter/, r => r.abort());
  await page.goto(env.base + 'index.html', { waitUntil: 'load' });
  await page.waitForTimeout(700);
  page.done = () => ctx.close();
  return page;
}

function arm(page) {
  page.dialogs = [];
  page.on('dialog', d => { page.dialogs.push(d.message()); return d.dismiss(); });
}

async function snap(page) {
  await page.waitForFunction(() => {
    const el = document.querySelector('input[aria-label="Account 1 name"]');
    return el && el.value === 'Roth IRA';
  }, null, { timeout: 8000 });
  return page.evaluate(() => {
    const bad = [];
    document.querySelectorAll('*').forEach(el => {
      if (el.tagName === 'IMG' || el.tagName === 'IFRAME') bad.push(el.tagName);
      [...el.attributes].forEach(a => {
        if (/^on/i.test(a.name) && /alert\s*\(|<|>/.test(a.value)) bad.push(a.name + '=' + a.value.slice(0, 80));
      });
    });
    const grab = (sel, re) => {
      const el = document.querySelector(sel);
      const raw = el ? (el.getAttribute('onchange') || el.getAttribute('onclick') || '') : '';
      const m = raw.match(re);
      return m ? m[1] : '';
    };
    const acctId = grab('input[aria-label="Account 1 name"]', /upAcct\('([^']*)'/);
    const ytdId = grab('#roomBody input', /S\.ytd\['([^']*)'\]/);
    const sel = document.querySelector('select[aria-label="Roth IRA, fund 1 asset class"]');
    const delOn = document.querySelector('button[aria-label="Remove fund 1 from Roth IRA"]');
    const holdId = ((delOn && delOn.getAttribute('onclick')) || '').match(/delHold\('[^']*','([^']*)'\)/);
    const tgt = [...document.querySelectorAll('input.tgt-pct')].find(el => (el.getAttribute('onchange') || '').indexOf("'" + (sel && sel.value) + "'") > -1);
    const bars = [...document.querySelectorAll('#acctBars .stackbar div')].map(e => ({
      attrs: [...e.attributes].map(a => a.name).sort().join(','),
      title: e.title
    }));
    const contribs = [...document.querySelectorAll('#contribInputs input.money')].map(e => ({
      label: e.getAttribute('aria-label'), value: e.value, on: e.getAttribute('onchange')
    }));
    const color = document.querySelector('#customCats input[type="color"]');
    const catName = document.querySelector('#customCats input[aria-label="Category name"]');
    return {
      bad: bad,
      imgs: document.querySelectorAll('img').length,
      acctId: acctId,
      acct2: (document.querySelector('input[aria-label="Account 2 name"]') || {}).value,
      ytdId: ytdId,
      ytd: (document.querySelector('#roomBody input') || {}).value,
      cls: sel ? sel.value : '',
      tgt: tgt ? tgt.value : '',
      holdId: holdId ? holdId[1] : '',
      safeWired: [...document.querySelectorAll('#accounts [onchange],[onclick]')].some(el => /'safeAcct'/.test((el.getAttribute('onchange') || '') + (el.getAttribute('onclick') || '')) && /safeHold/.test((el.getAttribute('onchange') || '') + (el.getAttribute('onclick') || ''))),
      bars: bars,
      contribs: contribs,
      colorAttr: color ? color.getAttribute('value') : '',
      catName: catName ? catName.value : '',
      waitK: (document.querySelector('#waitBody input.money') || {}).value,
      waitM: (document.querySelector('#waitBody input[type="range"]') || {}).value,
      adv: (document.querySelector('#aumBody input[type="range"]') || {}).value,
      bal: (document.querySelector('input[aria-label="Roth IRA, fund 1 balance in dollars"]') || {}).value
    };
  });
}

function checkEvil(t, view, tag) {
  t.ok(!view.bad.length && view.imgs === 0, tag + ' broke out of the markup: ' + view.bad.join(' | ') + ' imgs=' + view.imgs);
  t.ok(ID_OK.test(view.acctId) && view.acctId.indexOf(PAYLOAD) < 0, tag + ' account id not replaced: ' + view.acctId);
  t.ok(ID_OK.test(view.holdId) && view.holdId !== HOLD_PAYLOAD, tag + ' holding id not replaced: ' + view.holdId);
  t.ok(ID_OK.test(view.cls) && view.cls !== view.acctId, tag + ' category id collided with the account or was not replaced: ' + view.cls);
  t.ok(view.ytdId === view.acctId && view.ytd === '500', tag + ' year-to-date did not follow the account: ' + view.ytdId + ' ' + view.ytd);
  t.ok(view.tgt === '10', tag + ' category target did not follow the new id: ' + view.tgt);
  t.ok(view.bal === '2500', tag + ' balance changed: ' + view.bal);
  t.ok(view.acct2 === "O'Brien IRA", tag + ' safe account name changed: ' + view.acct2);
  t.ok(view.safeWired, tag + ' safe account and holding ids were not kept');
  t.ok(view.catName === CAT_NAME, tag + ' category name was rewritten: ' + view.catName);
  t.ok(view.bars.length && view.bars.every(b => b.attrs === 'style,title'), tag + ' title attribute broke open: ' + JSON.stringify(view.bars));
  t.ok(view.bars.some(b => b.title.indexOf('onfocus=alert(1)') > -1), tag + ' category name did not reach the chart');
  const roth = view.contribs.find(c => c.label && c.label.indexOf('Roth IRA') > -1);
  const safe = view.contribs.find(c => c.label && c.label.indexOf("O'Brien") > -1);
  t.ok(roth && roth.value === '' && roth.on.indexOf("'" + view.acctId + "'") > -1, tag + ' Roth contribution: ' + JSON.stringify(roth));
  t.ok(safe && safe.value === '250' && safe.on.indexOf("'safeAcct'") > -1, tag + ' safe contribution: ' + JSON.stringify(safe));
  t.ok(view.waitK === '10000' && view.waitM === '12', tag + ' waiting fields: ' + view.waitK + ' / ' + view.waitM);
  t.ok(view.adv === '1', tag + ' advisor fee: ' + view.adv);
  t.ok(!view.colorAttr || view.colorAttr.charAt(0) === '#', tag + ' color still not hex: ' + view.colorAttr);
}

module.exports = async function () {
  const env = await setup(), t = suite('import');
  const raw = JSON.stringify(evil());
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dc-import-'));

  /* saved localStorage, the path a reload takes */
  const loaded = await openLoaded(env, raw);
  let view = await snap(loaded);
  t.ok(loaded.dialogs.length === 0, 'saved state ran script: ' + loaded.dialogs.join(','));
  t.ok(loaded.errs.length === 0, 'saved state errors: ' + loaded.errs.join(' | '));
  checkEvil(t, view, 'load');
  const junk = await visibleText(loaded);
  t.ok(!JUNK.test(junk), 'load shows "' + (junk.match(JUNK) || [])[0] + '"');
  await loaded.done();

  /* the Import button */
  fs.writeFileSync(path.join(dir, 'evil.json'), raw);
  const page = await open(env, 'index.html', { seed: { 'driftcalc-v1': GOOD }, settle: 500 });
  arm(page);
  await page.setInputFiles('#importFile', path.join(dir, 'evil.json'));
  view = await snap(page);
  t.ok(page.dialogs.length === 0, 'import ran script: ' + page.dialogs.join(','));
  t.ok(page.errs.length === 0, 'import errors: ' + page.errs.join(' | '));
  checkEvil(t, view, 'import');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('driftcalc-v1')));
  const blob = JSON.stringify(saved);
  t.ok(blob.indexOf('<img') < 0 && blob.indexOf('onerror') < 0 && blob.indexOf(HOLD_PAYLOAD) < 0, 'import stored the payload');
  const roth = saved.accounts.find(a => a.name === 'Roth IRA');
  const kept = saved.accounts.find(a => a.id === 'safeAcct');
  t.ok(roth && roth.id === view.acctId && roth.holdings[0].bal === 2500 && roth.holdings[0].cls === view.cls, 'import did not keep the Roth holding on its category');
  t.ok(kept && kept.holdings[0].id === 'safeHold' && kept.holdings[0].cls === 'US', 'import changed the safe holding');
  t.ok(saved.ytd[roth.id] === 500 && saved.contrib[roth.id] === 0 && saved.contrib.safeAcct === 250, 'import contributions: ' + JSON.stringify({ ytd: saved.ytd, contrib: saved.contrib }));
  t.ok(saved.customClasses[0].id === view.cls && saved.customClasses[0].color === '#888' && saved.customClasses[0].name === CAT_NAME, 'category was not repaired: ' + JSON.stringify(saved.customClasses));
  t.ok(saved.targets[view.cls] === 10 && saved.targets.US === 90, 'targets: ' + JSON.stringify(saved.targets));
  t.ok(saved.plan.waitK === 10000 && saved.plan.waitM === 12 && saved.plan.advPct === 1, 'plan numbers: ' + JSON.stringify(saved.plan));

  /* the new id has to be the one the buttons actually call */
  await page.evaluate(() => { const s = document.getElementById('s1'); if (s.classList.contains('closed')) s.querySelector('.sec-head').click(); });
  await page.waitForTimeout(450);
  const name = page.locator('input[aria-label="Account 1 name"]');
  await name.fill('Renamed Roth');
  await name.press('Tab');
  await page.waitForTimeout(250);
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('driftcalc-v1')));
  const renamed = after.accounts.find(a => a.name === 'Renamed Roth');
  t.ok(renamed && renamed.id === view.acctId && after.ytd[renamed.id] === 500, 'rename did not stick to the replacement id');
  const n = page.dialogs.length;
  await page.reload();
  await page.waitForTimeout(600);
  t.ok(page.dialogs.length === n, 'reload after import ran script');
  t.ok(await page.evaluate(() => JSON.parse(localStorage.getItem('driftcalc-v1')).accounts[0].name) === 'Renamed Roth', 'reload lost the edited name');
  await page.done();

  /* a real backup: ids with the characters we generate, quotes in a name, category link */
  fs.writeFileSync(path.join(dir, 'clean.json'), JSON.stringify(CLEAN));
  const clean = await open(env, 'index.html', { seed: { 'driftcalc-v1': GOOD }, settle: 400 });
  arm(clean);
  await clean.setInputFiles('#importFile', path.join(dir, 'clean.json'));
  await clean.waitForFunction(() => {
    const el = document.querySelector('input[aria-label="Account 1 name"]');
    return el && el.value === "O'Brien Roth";
  }, null, { timeout: 8000 });
  const got = await clean.evaluate(() => JSON.parse(localStorage.getItem('driftcalc-v1')));
  t.ok(clean.dialogs.length === 0, 'clean import ran script: ' + clean.dialogs.join(','));
  t.ok(got.accounts[0].id === 'acct_1' && got.accounts[0].holdings[0].id === 'hold-1', 'clean import replaced safe ids');
  t.ok(got.accounts[0].holdings[0].cls === 'x_gold' && got.accounts[0].holdings[0].bal === 4200, 'clean import lost the holding');
  t.ok(got.accounts[0].name === "O'Brien Roth", 'clean import changed the name');
  t.ok(got.customClasses[0].id === 'x_gold' && got.customClasses[0].color === '#E0A82E' && got.targets.x_gold === 30, 'clean import lost the category');
  t.ok(got.ytd.acct_1 === 1500 && got.contrib.acct_1 === 250, 'clean import lost contribution figures');
  t.ok(got.plan.advPct === 0.5 && got.plan.waitK === 2500 && got.plan.waitM === 6 && got.plan.income === 5000, 'clean import changed plan numbers');
  t.ok(got.equityPct === 80 && got.intlPct === 30, 'clean import changed the dials');
  const cls = await clean.$eval('select[aria-label="O\'Brien Roth, fund 1 asset class"]', e => e.value);
  t.ok(cls === 'x_gold', 'holding is no longer tagged with its category: ' + cls);
  await clean.done();

  await env.close();
  return t.report();
};
if (require.main === module) module.exports().then(f => process.exit(f ? 1 : 0));
