/* Hostile query strings against every page that reads the URL. None may throw,
   put junk on screen, or end up with a non-finite number in a control. */
const { setup, open, visibleText, JUNK, suite } = require('./lib');
const PARAMS = {
  'index.html': ['eq', 'intl', 'tilt'],
  'compounding.html': ['have', 'mo', 'ret', 'yrs'],
  'fees.html': ['bal', 'fee', 'ret', 'yrs'],
  'hfea.html': ['l', 's', 'w'],
  'leverage.html': ['from', 'l', 'm', 's'],
  'savings.html': ['have', 'pay', 'rate', 'ret', 'wd'],
  'waiting.html': ['amt', 'ret', 'wait', 'yrs'],
};
const VALUES = ['', '-1', '-99999', '0', '1e400', '-1e400', 'NaN', 'Infinity', '-Infinity', '9'.repeat(40),
  '%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E', '__proto__', 'constructor', '1.5.5', '0x10', '%00', '50%25'];
module.exports = async function () {
  const env = await setup(), t = suite('urls');
  for (const p in PARAMS) {
    const qs = [];
    for (const v of VALUES) qs.push(PARAMS[p].map(k => k + '=' + v).join('&'));
    qs.push(PARAMS[p].map(k => k + '=1&' + k + '=2').join('&'));                /* repeated keys */
    qs.push('__proto__[x]=1&constructor[prototype][x]=1');
    qs.push('setup=1&' + PARAMS[p][0] + '=1e400');
    for (const q of qs) {
      const page = await open(env, p + '?' + q, { settle: 700 });
      const tag = p + '?' + q.slice(0, 60);
      let dialog = false; page.on('dialog', d => { dialog = true; d.dismiss(); });
      t.ok(page.errs.length === 0, tag + ' errors: ' + page.errs.join(' | '));
      const m = (await visibleText(page)).match(JUNK);
      t.ok(!m, tag + ' shows "' + (m && m[0]) + '"');
      const bad = await page.evaluate(() => [...document.querySelectorAll('input[type=range],input[type=number]')]
        .filter(i => i.value !== '' && !isFinite(+i.value)).map(i => (i.id || i.name || i.getAttribute('aria-label')) + '=' + i.value));
      t.ok(!bad.length, tag + ' non-finite control values ' + bad.join(','));
      const polluted = await page.evaluate(() => ({}).x !== undefined);
      t.ok(!polluted, tag + ' polluted Object.prototype');
      t.ok(!dialog, tag + ' ran injected script');
      await page.done();
    }
  }
  await env.close();
  return t.report();
};
if (require.main === module) module.exports().then(f => process.exit(f ? 1 : 0));
