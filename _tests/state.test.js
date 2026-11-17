/* Junk in localStorage and bad import files. The page must still draw, must
   not throw, and a bad import must leave the existing portfolio alone. */
const path = require('path'), fs = require('fs'), os = require('os');
const { setup, open, visibleText, JUNK, suite } = require('./lib');
const GOOD = JSON.stringify({ accounts: [{ id: 'a', name: 'Mine', type: 'Roth IRA', holdings: [{ id: 'h', ticker: 'VTI', cls: 'US', bal: 5000 }] }], equityPct: 80 });
const JUNK_STATES = [
  'not json', '{', 'null', '[]', '42', '"string"', '{}', '{"accounts":"nope"}', '{"accounts":[null,1,"x",[]]}',
  '{"accounts":[{"holdings":[{"bal":"1e400"},{"bal":-5},{"bal":"NaN"},null]}]}',
  '{"equityPct":1e400,"intlPct":-50,"tiltPct":"x","accounts":[]}',
  '{"accounts":[],"targets":{"__proto__":{"x":1},"US":"abc","BOND":1e9}}',
  '{"accounts":[],"plan":"oops","ytd":[],"customClasses":{"a":1}}',
  '{"accounts":[{"id":5,"name":{"x":1},"type":[],"holdings":{}}]}',
  '{"accounts":[{"name":"<img src=x onerror=alert(1)>","holdings":[{"ticker":"<b>x</b>","bal":1}]}]}',
  '{"accounts":[],"preset":"Custom","targets":{"US":100},"customClasses":[{"id":"x1","name":"<i>G</i>"}]}',
];
const OPEN_STATES = ['not json', '["s1","s9","<x>"]', '{"a":1}', '[null]'];
async function check(t, page, tag) {
  t.ok(page.errs.length === 0, tag + ' errors: ' + page.errs.join(' | '));
  const txt = await visibleText(page);
  const m = txt.match(JUNK);
  t.ok(!m, tag + ' shows "' + (m && m[0]) + '"');
  t.ok(/contribution/i.test(txt), tag + ' page did not draw');
}
module.exports = async function () {
  const env = await setup(), t = suite('state');
  for (const s of JUNK_STATES) {
    const page = await open(env, 'index.html', { seed: { 'driftcalc-v1': s }, settle: 700 });
    let dialog = false; page.on('dialog', d => { dialog = true; d.dismiss(); });
    await check(t, page, 'state ' + s.slice(0, 50));
    t.ok(!dialog, 'state ' + s.slice(0, 50) + ' ran injected script');
    t.ok(await page.evaluate(() => ({}).x === undefined), 'state ' + s.slice(0, 50) + ' polluted Object.prototype');
    /* and it survives a reload, the brick test */
    await page.reload(); await page.waitForTimeout(500);
    await check(t, page, 'reload ' + s.slice(0, 50));
    await page.done();
  }
  for (const s of OPEN_STATES) {
    const page = await open(env, 'index.html', { seed: { 'driftcalc-open-v1': s, 'driftcalc-tour-nudge': s } });
    await check(t, page, 'open-state ' + s);
    await page.done();
  }
  /* bad import files: portfolio must be untouched, then a good one must work */
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dc-'));
  const files = { 'text.json': 'hello', 'array.json': '[1,2]', 'other-app.json': '{"name":"x","version":3}',
    'bad-accounts.json': '{"accounts":"x"}', 'empty.json': '' };
  for (const name in files) {
    fs.writeFileSync(path.join(dir, name), files[name]);
    const page = await open(env, 'index.html', { seed: { 'driftcalc-v1': GOOD } });
    await page.setInputFiles('#importFile', path.join(dir, name));
    await page.waitForTimeout(500);
    const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('driftcalc-v1')).accounts[0].holdings[0].bal);
    t.ok(kept === 5000, 'import ' + name + ' changed the saved portfolio');
    await check(t, page, 'import ' + name);
    await page.reload(); await page.waitForTimeout(400);
    await check(t, page, 'import ' + name + ' then reload');
    await page.done();
  }
  fs.writeFileSync(path.join(dir, 'good.json'), JSON.stringify({ accounts: [{ id: 'b', name: 'Imported', type: 'HSA', holdings: [{ id: 'g', ticker: 'VT', cls: 'US', bal: 777 }] }], equityPct: 70 }));
  const page = await open(env, 'index.html', { seed: { 'driftcalc-v1': GOOD } });
  await page.setInputFiles('#importFile', path.join(dir, 'good.json')); await page.waitForTimeout(500);
  t.ok(await page.evaluate(() => JSON.parse(localStorage.getItem('driftcalc-v1')).accounts[0].name) === 'Imported', 'good import did not load');
  await page.done();
  await env.close();
  return t.report();
};
if (require.main === module) module.exports().then(f => process.exit(f ? 1 : 0));
