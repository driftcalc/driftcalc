/* Structure: duplicate ids, controls with no name a screen reader can read,
   heading levels that skip, images with no alt. Every page, plus the setup quiz
   and the tour, which build their own markup. */
const { setup, open, suite, PAGES } = require('./lib');

function audit(page, scope) {
  return page.evaluate(scope => {
    const root = scope ? document.querySelector(scope) : document;
    const out = [];
    if (!scope) {
      const seen = {};
      document.querySelectorAll('[id]').forEach(e => { seen[e.id] = (seen[e.id] || 0) + 1; });
      Object.keys(seen).forEach(id => { if (seen[id] > 1) out.push('duplicate id "' + id + '" x' + seen[id]); });
    }
    const named = e => {
      if (e.getAttribute('aria-label') && e.getAttribute('aria-label').trim()) return true;
      const lb = e.getAttribute('aria-labelledby');
      if (lb && lb.split(/\s+/).some(id => { const n = document.getElementById(id); return n && n.textContent.trim(); })) return true;
      if (e.labels && [...e.labels].some(l => l.textContent.trim())) return true;
      if (e.title && e.title.trim()) return true;
      return false;
    };
    root.querySelectorAll('input:not([type=hidden]),select,textarea').forEach(e => {
      if (!named(e)) out.push('unlabelled ' + e.tagName.toLowerCase() + (e.type ? '[' + e.type + ']' : '') + (e.id ? '#' + e.id : '') + (e.placeholder ? ' placeholder="' + e.placeholder + '"' : ''));
    });
    root.querySelectorAll('button,a[href],[role=button]').forEach(e => {
      const txt = (e.textContent || '').trim() || [...e.querySelectorAll('img[alt]')].map(i => i.alt).join('');
      if (!txt && !named(e)) out.push('nameless ' + e.tagName.toLowerCase() + (e.className ? '.' + String(e.className).split(' ')[0] : '') + (e.href ? ' ' + e.getAttribute('href') : ''));
    });
    root.querySelectorAll('img').forEach(e => { if (!e.hasAttribute('alt')) out.push('img without alt ' + e.getAttribute('src')); });
    if (!scope) {
      const hs = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(h => h.offsetParent !== null || h.closest('section'));
      const h1 = hs.filter(h => h.tagName === 'H1').length;
      if (h1 !== 1) out.push(h1 + ' h1 elements');
      let prev = 0;
      hs.forEach(h => {
        const lv = +h.tagName[1];
        if (prev && lv > prev + 1) out.push('heading skips h' + prev + ' to h' + lv + ': "' + h.textContent.trim().slice(0, 40) + '"');
        prev = lv;
      });
    }
    return out;
  }, scope);
}

module.exports = async function () {
  const env = await setup(), t = suite('structure');
  for (const p of PAGES) {
    const page = await open(env, p, { settle: 900 });
    const found = await audit(page);
    found.forEach(f => t.ok(false, p + ': ' + f));
    t.ok(true);
    await page.done();
  }
  /* the quiz, every step, and the tour card */
  const page = await open(env, 'index.html?setup=1', { settle: 600 });
  const steps = [null, 'target', '90', '38', '0'];
  for (let i = 1; i <= 5; i++) {
    if (i === 2) await page.waitForSelector('.tq input[name=tq2]');
    (await audit(page, '.tq')).forEach(f => t.ok(false, 'quiz step ' + i + ': ' + f));
    if (i < 5) { await page.check('.tq input[name=tq' + i + '][value="' + steps[i] + '"]'); await page.click('.tq-foot .btn.primary'); }
  }
  await page.keyboard.press('Escape');
  await page.evaluate(() => startTour());
  (await audit(page, '.tt-card')).forEach(f => t.ok(false, 'tour card: ' + f));
  (await audit(page)).filter(f => /duplicate/.test(f)).forEach(f => t.ok(false, 'with tour open: ' + f));
  await page.keyboard.press('Escape');
  await page.reload(); await page.waitForTimeout(1500);
  if (await page.$('.tn')) (await audit(page, '.tn')).forEach(f => t.ok(false, 'tour pop-up: ' + f));
  t.ok(page.errs.length === 0, 'errors: ' + page.errs.join(' | '));
  await page.done();
  await env.close();
  return t.report();
};
if (require.main === module) module.exports().then(f => process.exit(f ? 1 : 0));
