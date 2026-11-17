/* Dead controls, the site's recurring bug class: a slider, box or button that
   moves and changes nothing. Every section and disclosure is opened first, then
   each visible control is driven to two different values and the page text is
   compared. A control whose change shows up nowhere fails.

   "Nowhere" means the whole page minus the control's own value readout, so a
   slider that only updates the number printed next to it still fails. */
const { setup, open, suite, PAGES } = require('./lib');

/* controls that only act when a separate button is pressed, by design */
const ON_SUBMIT = { 'index.html': ['contribution to'] };

async function prep(page) {
  await page.evaluate(() => {
    document.querySelectorAll('section.closed .sec-head').forEach(h => h.click());
    document.querySelectorAll('details:not([open])').forEach(d => d.open = true);
  });
  await page.waitForTimeout(250);
}

/* page text with every form control's own value left out */
function snapshot(page) {
  return page.evaluate(() => {
    const c = document.body.cloneNode(true);
    c.querySelectorAll('script,style,.toast,#toast,.tn').forEach(n => n.remove());
    return (c.innerText || c.textContent).replace(/\s+/g, ' ');
  });
}

module.exports = async function () {
  const env = await setup(), t = suite('controls');
  const info = [];
  for (const p of PAGES) {
    const page = await open(env, p, { settle: 900 });
    await prep(page);
    /* Pages re-render after a change, so a control is found again by its
       position in a fixed query every time it is touched, and its name is
       checked to make sure it is still the same control. */
    const Q = {
      field: 'input[type=range],input[type=number],select,input[inputmode=numeric],input[inputmode=decimal]',
      button: '.seg button,.pills button,.pill,[role=tab],[aria-pressed]'
    };
    const list = await page.evaluate(Q => {
      const vis = e => e.offsetParent !== null && e.getClientRects().length && !e.disabled && !e.closest('.tq,.tt-card,.tn');
      const name = e => (e.getAttribute('aria-label') || (e.labels && e.labels[0] && e.labels[0].textContent.trim()) ||
        e.id || e.name || (e.tagName === 'SELECT' ? '' : (e.textContent || '').trim()) || e.placeholder || e.tagName).replace(/\s+/g, ' ').slice(0, 60);
      const out = [];
      ['field', 'button'].forEach(kind => [...document.querySelectorAll(Q[kind])].forEach((e, i) => {
        if (!vis(e)) return;
        if (kind === 'button' && out.some(o => o.kind !== 'button' && false)) return;
        out.push({ q: kind, i, kind: kind === 'button' ? 'button' : e.tagName === 'SELECT' ? 'select' : e.type === 'range' ? 'range' : 'number', name: name(e) });
      }));
      return out;
    }, Q);
    const handle = async c => {
      const h = await page.evaluateHandle(([q, i, nm]) => {
        const e = document.querySelectorAll(q)[i];
        if (!e) return null;
        const n = (e.getAttribute('aria-label') || (e.labels && e.labels[0] && e.labels[0].textContent.trim()) ||
          e.id || e.name || (e.tagName === 'SELECT' ? '' : (e.textContent || '').trim()) || e.placeholder || e.tagName).replace(/\s+/g, ' ').slice(0, 60);
        return n === nm ? e : null;
      }, [Q[c.q], c.i, c.name]);
      return h.asElement();
    };
    for (const c of list) {
      const tag = p + ' ' + c.kind + ' "' + c.name + '"';
      let el = await handle(c);
      if (!el) continue;
      let a, b;
      if (c.kind === 'button') {
        const on = await el.evaluate(e => /\bon\b|active|selected/.test(e.className) || e.getAttribute('aria-pressed') === 'true' || e.getAttribute('aria-selected') === 'true');
        if (on) continue;
        a = await snapshot(page);
        await el.click(); await page.waitForTimeout(200);
        b = await snapshot(page);
      } else {
        const vals = await el.evaluate(e => {
          /* a dropdown is dead only if no other choice changes anything: Taxable
             to Other legitimately changes nothing, since neither has a limit */
          if (e.tagName === 'SELECT') {
            const o = [...e.options].map(x => x.value).filter(v => v !== e.value);
            return o.length ? [e.value].concat(o.slice(0, 6)) : null;
          }
          const lo = e.min !== '' ? +e.min : 1, hi = e.max !== '' ? +e.max : 50000;
          return [String(lo), String(hi === lo ? lo + 1 : hi)];
        });
        if (!vals) continue;
        const set = async v => {
          const e = await handle(c);
          if (!e) return false;
          await e.evaluate((e, v) => { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, v);
          return true;
        };
        await set(vals[0]); await page.waitForTimeout(200); a = await snapshot(page);
        b = a;
        for (let j = 1; j < vals.length && b === a; j++) { await set(vals[j]); await page.waitForTimeout(200); b = await snapshot(page); }
        await set(vals[0]); await page.waitForTimeout(150);
      }
      const allowed = (ON_SUBMIT[p] || []).some(x => c.name.toLowerCase().indexOf(x) > -1);
      t.ok(a !== b || allowed, tag + ' changes nothing on the page');
    }
    t.ok(page.errs.length === 0, p + ' errors while driving controls: ' + page.errs.join(' | '));
    info.push(p + ': ' + list.length + ' controls');
    await page.done();
  }
  await env.close();
  console.log('  ' + info.join(', '));
  return t.report();
};
if (require.main === module) module.exports().then(f => process.exit(f ? 1 : 0));
