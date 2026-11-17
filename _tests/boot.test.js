/* Every page loads with no script errors, on a desktop and a phone, and shows
   no NaN, Infinity or undefined anywhere on screen. */
const { setup, open, visibleText, JUNK, suite, PAGES } = require('./lib');
module.exports = async function () {
  const env = await setup(), t = suite('boot');
  for (const vp of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    for (const p of PAGES) {
      const page = await open(env, p, { viewport: vp, settle: 900 });
      const tag = p + ' @' + vp.width;
      t.ok(page.errs.length === 0, tag + ' errors: ' + page.errs.join(' | '));
      const txt = await visibleText(page);
      const m = txt.match(JUNK);
      t.ok(!m, tag + ' shows "' + (m && m[0]) + '"');
      const wide = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      t.ok(wide <= 1, tag + ' scrolls sideways by ' + wide + 'px');
      await page.done();
    }
  }
  await env.close();
  return t.report();
};
if (require.main === module) module.exports().then(f => process.exit(f ? 1 : 0));
