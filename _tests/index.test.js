/* Regressions on the home page that the sweeps can only half see. */
const { setup, open, suite } = require('./lib');
module.exports = async function () {
  const env = await setup(), t = suite('index');
  const page = await open(env, 'index.html', { settle: 700 });
  await page.evaluate(() => document.querySelectorAll('section.closed .sec-head').forEach(h => h.click()));
  const roomText = () => page.$eval('#roomBody', e => e.innerText);
  const hint = name => page.evaluate(n => {
    const i = [...document.querySelectorAll('#contribInputs input')].find(x => x.getAttribute('aria-label').indexOf(n) > -1);
    const box = i && i.closest('div').parentNode; return box ? box.innerText : '';
  }, name);

  /* 1. changing an account's type updates the room card and the contribution hint at once */
  t.ok(/Roth IRA/.test(await roomText()), 'room card should list the Roth IRA to begin with');
  t.ok(/room left/.test(await hint('Roth IRA')), 'Roth contribution box should show room left');
  await page.selectOption('select[aria-label="Account type for Roth IRA"]', 'Taxable');
  await page.waitForTimeout(200);
  t.ok(!/Roth IRA/.test(await roomText()), 'room card still lists the Roth IRA after it became Taxable');
  t.ok(!/room left/.test(await hint('Roth IRA')), 'contribution box still quotes a limit for a Taxable account');

  /* 2. renaming an account updates the contribution box label */
  const name = page.locator('input[aria-label="Account 1 name"]');
  await name.fill('Work plan'); await name.press('Tab'); await page.waitForTimeout(200);
  t.ok(await page.$('#contribInputs input[aria-label*="Work plan"]'), 'contribution box kept the old account name');

  /* 3. what you have put in so far this year moves the hint under this month's box */
  const before = await hint('Work plan');
  const ytd = page.locator('#roomBody input[aria-label*="Work plan"]');
  if (!(await ytd.count())) t.ok(false, 'room card kept the old account name');
  else {
    await ytd.fill('10000'); await ytd.press('Tab'); await page.waitForTimeout(200);
    const after = await hint('Work plan');
    t.ok(before !== after && /14,500/.test(after), 'room-left hint did not move with year-to-date: ' + after.replace(/\s+/g, ' '));
  }

  /* 4. a fund the page splits itself has its asset class picker greyed out, a plain one does not */
  const dis = await page.evaluate(() => [...document.querySelectorAll('table.hold tr')].map(r => {
    const tk = r.querySelector('input'), sel = r.querySelector('select');
    return tk && sel ? tk.value + ':' + sel.disabled : null; }).filter(Boolean));
  t.ok(dis.includes('VXUS:true'), 'VXUS picker should be disabled: ' + dis.join(' '));
  t.ok(dis.includes('VTI:false') || dis.includes('FXAIX:false'), 'plain fund picker should stay live: ' + dis.join(' '));
  /* typing a split fund into a row greys its picker out right away */
  const tk = page.locator('input[aria-label="Taxable brokerage, fund 1 ticker"]');
  if (await tk.count()) { await tk.fill('VT'); await tk.press('Tab'); await page.waitForTimeout(200);
    t.ok(await page.$eval('select[aria-label="Taxable brokerage, fund 1 asset class"]', e => e.disabled), 'picker live after typing VT'); }

  t.ok(page.errs.length === 0, 'errors: ' + page.errs.join(' | '));
  await page.done();
  await env.close();
  return t.report();
};
if (require.main === module) module.exports().then(f => process.exit(f ? 1 : 0));
