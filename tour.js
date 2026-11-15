/* Drift Calc: the setup quiz.
   Loaded after backtest.js, so S, DEFAULT(), sanitizeState(), migrate(), save()
   and renderAll() are all in scope and the page has its final shape.

   Five questions that end with the target set and the accounts scaffolded, so
   nobody faces a blank form. It never asks for a balance: the account form is
   better at that, and the fewer places that touch balances the better. Nothing
   it learns goes in a URL or leaves the browser.

   Nothing is written until the last question. Closing early changes nothing. */
(function () {
'use strict';

/* ---------- the real record ----------
   Peak-to-bottom falls for each stock/bond mix, computed from returns.json so
   they stay true when the data rebuilds. Same method as runPlain() on the
   backtest page: US stocks and 10-year Treasuries, rebalanced after each
   December, so the two pages agree for the same mix and window. */
var RET_P = null;
function loadReturns() {
  if (!RET_P) {
    RET_P = fetch('returns.json').then(function (r) {
      if (!r.ok) throw new Error('returns.json ' + r.status);
      return r.json();
    }).then(function (d) {
      if (!d || !Array.isArray(d.months) || !d.series ||
          !Array.isArray(d.series.US) || !Array.isArray(d.series.BOND)) throw new Error('bad returns.json');
      return d;
    }).catch(function () { RET_P = null; return null; });
  }
  return RET_P;
}

function worstFall(d, eqPct, from) {
  var M = d.months, w = {}, ks, hold = {}, val = 1, peak = 1, peakM = M[from];
  var out = { dd: 0, peak: null, trough: null, start: null };
  if (eqPct > 0) w.US = eqPct / 100;
  if (eqPct < 100) w.BOND = 1 - eqPct / 100;
  ks = Object.keys(w);
  ks.forEach(function (k) { hold[k] = w[k]; });
  for (var i = from; i < M.length; i++) {
    var skip = false, j;
    for (j = 0; j < ks.length; j++) if (typeof d.series[ks[j]][i] !== 'number') { skip = true; break; }
    if (skip) continue;
    if (!out.start) out.start = M[i];
    var nv = 0;
    for (j = 0; j < ks.length; j++) { hold[ks[j]] *= 1 + d.series[ks[j]][i]; nv += hold[ks[j]]; }
    val = nv;
    if (val > peak) { peak = val; peakM = M[i]; }
    var dd = 1 - val / peak;
    if (dd > out.dd) { out.dd = dd; out.peak = peakM; out.trough = M[i]; }
    if (M[i].slice(4) === '12') for (j = 0; j < ks.length; j++) hold[ks[j]] = val * w[ks[j]];
  }
  return out;
}

/* Two windows: the whole record, and the stretch most people remember. The
   recent one starts where every asset class has data, so it moves with the file.
   US stocks go back to 1926 but bonds only to 1953. Months a mix cannot be
   priced are skipped, the same as the backtest does. */
function falls(d, eqPct) {
  var recent = d.months.indexOf(d.firstMonthWithAllClasses || '199007');
  return { all: worstFall(d, eqPct, 0), recent: worstFall(d, eqPct, recent < 0 ? 0 : recent) };
}

function years(f) {
  var a = f.peak.slice(0, 4), b = f.trough.slice(0, 4);
  return a === b ? 'In ' + a : a + ' to ' + b;
}

/* ---------- the questions ---------- */
var EQ = [
  [100, 'All stocks'],
  [90, '90% stocks, 10% bonds'],
  [80, '80% stocks, 20% bonds'],
  [60, '60% stocks, 40% bonds'],
  [40, '40% stocks, 60% bonds']
];
var ACCTS = [
  { type: '401(k)', name: '401(k)', note: 'Through work. A 403(b) works the same way.' },
  { type: 'Roth IRA', name: 'Roth IRA', note: 'You pay the tax now and never again.' },
  { type: 'Traditional IRA', name: 'Traditional IRA', note: 'Tax break now, taxed when you take it out.' },
  { type: 'HSA', name: 'HSA', note: 'Health savings account, if your health plan allows one.' },
  { type: 'Taxable', name: 'Taxable brokerage', note: 'A regular brokerage account with no tax break.' }
];
var TOTAL = 5;

/* ---------- small DOM helpers. Every string here is ours, never user input. ---------- */
function el(tag, attrs, kids) {
  var n = document.createElement(tag);
  if (attrs) for (var k in attrs) {
    if (k === 'text') n.textContent = attrs[k];
    else if (k === 'cls') n.className = attrs[k];
    else n.setAttribute(k, attrs[k]);
  }
  (kids || []).forEach(function (c) { if (c) n.appendChild(c); });
  return n;
}

function injectStyle() {
  if (document.getElementById('tqStyle')) return;
  var css =
    'html.tq-lock,html.tq-lock body{overflow:hidden}' +
    '.tq-back{position:fixed;inset:0;z-index:1000;background:rgba(11,31,59,.5);display:flex;' +
      'padding:16px;overflow-y:auto;-webkit-overflow-scrolling:touch}' +
    '.tq{margin:auto;width:100%;max-width:540px;background:var(--card);color:var(--ink);' +
      'border-radius:14px;padding:22px 22px 18px;box-shadow:0 12px 40px rgba(11,31,59,.25)}' +
    '.tq-top{display:flex;align-items:center;justify-content:space-between;gap:12px;' +
      'font-size:12.5px;color:var(--muted);font-weight:600}' +
    '.tq-x{font:inherit;font-size:22px;line-height:1;border:0;background:none;color:var(--muted);' +
      'cursor:pointer;min-width:44px;min-height:44px;margin:-12px -12px -12px 0;border-radius:8px}' +
    '.tq-x:hover{color:var(--ink);background:var(--hairline)}' +
    '.tq-bar{height:4px;background:var(--hairline);border-radius:4px;margin:6px 0 18px;overflow:hidden}' +
    '.tq-bar i{display:block;height:100%;background:var(--accent);border-radius:4px;transition:width .2s}' +
    '.tq h2{font-family:var(--disp);font-size:21px;line-height:1.25;margin:0 0 6px;outline:none}' +
    '.tq-intro{color:var(--muted);font-size:14px;line-height:1.55;margin:0 0 14px}' +
    '.tq-opts{display:flex;flex-direction:column;gap:8px}' +
    '.tq-opt{display:flex;gap:12px;align-items:flex-start;border:1px solid var(--border);border-radius:10px;' +
      'padding:12px 14px;cursor:pointer;transition:border-color .15s,background .15s}' +
    '.tq-opt:hover{border-color:#CBD5E4}' +
    '.tq-opt.on{border-color:var(--accent);background:var(--accent-soft)}' +
    '.tq-opt input{flex:none;width:18px;height:18px;margin:2px 0 0;accent-color:var(--accent)}' +
    '.tq-opt b{display:block;font-size:14.5px;font-weight:600}' +
    '.tq-opt small{display:block;color:var(--muted);font-size:13px;line-height:1.5;margin-top:2px}' +
    '.tq-opt small+small{margin-top:0}' +
    '.tq-nav{display:flex;justify-content:space-between;gap:10px;margin-top:18px}' +
    '.tq-nav .btn{min-height:44px;padding:10px 18px;font-size:14px}' +
    '.tq-nav .btn[disabled]{opacity:.45;cursor:not-allowed}' +
    '.tq-note{font-size:13px;color:var(--muted);margin-top:12px}' +
    '@media (max-width:420px){.tq{padding:18px 16px 14px}.tq h2{font-size:19px}}';
  document.head.appendChild(el('style', { id: 'tqStyle', text: css }));
}

/* ---------- the overlay ---------- */
var box = null, back = null, opener = null, step = 0, ans = null, gated = false;

function hasRealData() {
  if (typeof S === 'undefined' || !S || S.isSample || !Array.isArray(S.accounts)) return false;
  return S.accounts.some(function (a) {
    return (a.holdings || []).some(function (h) { return (+h.bal || 0) > 0 || String(h.ticker || '').trim(); });
  });
}

function open() {
  if (back) return;
  injectStyle();
  opener = document.activeElement;
  ans = { route: null, eq: null, intl: null, tilt: null, accts: [] };
  gated = hasRealData();
  step = gated ? 0 : 1;

  back = el('div', { cls: 'tq-back' });
  box = el('div', { cls: 'tq', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'tqTitle' });
  back.appendChild(box);
  back.addEventListener('mousedown', function (e) { if (e.target === back) close(); });
  back.addEventListener('keydown', onKey);
  document.body.appendChild(back);
  document.documentElement.classList.add('tq-lock');
  loadReturns();   /* start early so step 2 is usually ready */
  render();
}

function close(landed) {
  if (!back) return;
  back.parentNode.removeChild(back);
  back = box = null;
  document.documentElement.classList.remove('tq-lock');
  if (landed) return;
  if (opener && opener.focus && document.body.contains(opener) && opener.offsetParent !== null) opener.focus();
}

function onKey(e) {
  if (e.key === 'Escape' || e.key === 'Esc') { e.preventDefault(); close(); return; }
  if (e.key !== 'Tab') return;
  var f = Array.prototype.filter.call(
    box.querySelectorAll('button,input,[tabindex="0"]'),
    function (n) { return !n.disabled && n.offsetParent !== null; });
  if (!f.length) return;
  var first = f[0], last = f[f.length - 1];
  if (e.shiftKey && (document.activeElement === first || !box.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

function shell(title, intro) {
  box.textContent = '';
  var x = el('button', { type: 'button', cls: 'tq-x', 'aria-label': 'Close' });
  x.textContent = '×';
  x.addEventListener('click', function () { close(); });
  var label = step > 0 ? 'Question ' + step + ' of ' + TOTAL : 'Before you start';
  box.appendChild(el('div', { cls: 'tq-top' }, [el('span', { text: label }), x]));
  var bar = el('div', { cls: 'tq-bar' }, [el('i')]);
  bar.firstChild.style.width = (step / TOTAL * 100) + '%';
  box.appendChild(bar);
  box.appendChild(el('h2', { id: 'tqTitle', tabindex: '-1', text: title }));
  if (intro) box.appendChild(el('p', { cls: 'tq-intro', text: intro }));
}

function nav(backFn, nextLabel, nextFn, ready) {
  var row = el('div', { cls: 'tq-nav' });
  var b = el('button', { type: 'button', cls: 'btn', text: 'Back' });
  if (backFn) b.addEventListener('click', backFn); else b.style.visibility = 'hidden';
  var n = el('button', { type: 'button', cls: 'btn primary', text: nextLabel });
  n.disabled = !ready;
  n.addEventListener('click', nextFn);
  row.appendChild(b); row.appendChild(n);
  box.appendChild(row);
  return n;
}

/* one radio or checkbox per option, each a real labelled input */
function options(type, name, list, isOn, onPick) {
  var wrap = el('div', { cls: 'tq-opts', role: type === 'radio' ? 'radiogroup' : 'group', 'aria-labelledby': 'tqTitle' });
  list.forEach(function (o) {
    var inp = el('input', { type: type, name: name, value: String(o.value) });
    inp.checked = !!isOn(o.value);
    var txt = el('span', null, [el('b', { text: o.title })]);
    (o.lines || []).forEach(function (l) { txt.appendChild(el('small', { text: l })); });
    var lab = el('label', { cls: 'tq-opt' + (inp.checked ? ' on' : '') }, [inp, txt]);
    inp.addEventListener('change', function () {
      Array.prototype.forEach.call(wrap.querySelectorAll('.tq-opt'), function (l) {
        l.classList.toggle('on', l.querySelector('input').checked);
      });
      onPick(o.value, inp.checked);
    });
    wrap.appendChild(lab);
  });
  box.appendChild(wrap);
  return wrap;
}

function go(n) { step = n; render(); }

function render() {
  if (!box) return;
  [gate, q1, q2, q3, q4, q5][step]();
  var t = document.getElementById('tqTitle');
  if (t) t.focus();
}

/* ---------- step 0: only when there is real data to lose ---------- */
function gate() {
  shell('Start over?',
    'You already have accounts in here. Finishing these questions replaces them, balances and all. ' +
    'Save a backup first if you might want them back.');
  var row = el('div', { cls: 'tq-nav' });
  var left = el('div', { style: 'display:flex;gap:10px;flex-wrap:wrap' });
  var c = el('button', { type: 'button', cls: 'btn', text: 'Cancel' });
  c.addEventListener('click', function () { close(); });
  var bk = el('button', { type: 'button', cls: 'btn', text: 'Save a backup' });
  bk.addEventListener('click', function () { if (typeof exportJSON === 'function') exportJSON(); });
  left.appendChild(c); left.appendChild(bk);
  var go1 = el('button', { type: 'button', cls: 'btn primary', text: 'Start over' });
  go1.addEventListener('click', function () { go(1); });
  row.appendChild(left); row.appendChild(go1);
  row.style.flexWrap = 'wrap';
  box.appendChild(row);
}

/* ---------- step 1: why are you here ---------- */
function q1() {
  shell('What brought you here?');
  var next;
  options('radio', 'tq1', [
    { value: 'target', title: 'Pick a mix to aim for', lines: ['How much in stocks, bonds and overseas.'] },
    { value: 'drift', title: 'Check the accounts I have', lines: ['How far they have drifted and where new money should go.'] },
    { value: 'look', title: 'Just looking', lines: ['Keep the sample numbers and poke around.'] }
  ], function (v) { return ans.route === v; }, function (v) {
    ans.route = v;
    next.disabled = false;
    next.textContent = v === 'look' ? 'Close' : 'Next';
  });
  next = nav(gated ? function () { go(0); } : null, ans.route === 'look' ? 'Close' : 'Next', function () {
    if (ans.route === 'look') {
      close();
      if (typeof toast === 'function') toast('The sample numbers stay. Set it up whenever you like.');
      return;
    }
    go(2);
  }, !!ans.route);
}

/* ---------- step 2: the fall ---------- */
function q2() {
  shell('How big a fall could you sit through?',
    'Stocks grow more and fall harder. Bonds grow less and soften the fall. ' +
    'These are real falls from the market record, top to bottom. ' +
    'Pick the biggest one you could watch without selling.');
  var holder = el('div');
  box.appendChild(holder);
  var next = nav(function () { go(1); }, 'Next', function () { go(3); }, ans.eq != null);
  var note = el('p', { cls: 'tq-note', text: 'Loading the market record…' });
  holder.appendChild(note);

  var asked = step;
  loadReturns().then(function (d) {
    if (!box || step !== asked) return;
    holder.textContent = '';
    var list = EQ.map(function (e) {
      var lines = [];
      if (d) {
        var f = falls(d, e[0]);
        var r = f.recent, a = f.all;
        var left = Math.round(10000 * (1 - r.dd) / 100) * 100;
        lines.push(years(r) + ': fell ' + Math.round(r.dd * 100) + '%. $10,000 became $' + left.toLocaleString('en-US') + '.');
        /* bond data starts in 1953, so a mix with bonds has a shorter record than
           all stocks does. Say which year each one goes back to. */
        var since = a.start.slice(0, 4);
        lines.push(a.peak !== r.peak
          ? 'Worst since ' + since + ': ' + years(a).replace('In ', '') + ', fell ' + Math.round(a.dd * 100) + '%.'
          : 'That was the worst since ' + since + '.');
      }
      return { value: e[0], title: e[1], lines: lines };
    });
    /* options() appends to the box; move the list into its slot above the buttons */
    var wrap = options('radio', 'tq2', list, function (v) { return ans.eq === v; }, function (v) {
      ans.eq = v; next.disabled = false;
    });
    holder.appendChild(wrap);
    holder.appendChild(el('p', { cls: 'tq-note', text: d
      ? 'You can change this any time with the stocks and bonds slider.'
      : 'Could not load the market record just now. Pick by the mix; you can change it any time.' }));
  });
}

/* ---------- step 3: outside the US ---------- */
function q3() {
  var world = Math.round(typeof MARKET_INTL === 'number' ? MARKET_INTL : 38);
  shell('How much of your stocks should be outside the US?',
    'About ' + world + '% of the world’s stock market is outside the US, in places like Japan, ' +
    'Europe and China. One fund like VXUS covers all of it.');
  var next;
  options('radio', 'tq3', [
    { value: 0, title: 'None', lines: ['US companies only.'] },
    { value: 20, title: 'Some (20%)', lines: ['Mostly US, with a slice of everywhere else.'] },
    { value: world, title: 'Match the world (' + world + '%)', lines: ['Every market at its real size, so you are not betting on one country.'] }
  ], function (v) { return ans.intl === v; }, function (v) { ans.intl = v; next.disabled = false; });
  next = nav(function () { go(2); }, 'Next', function () { go(4); }, ans.intl != null);
}

/* ---------- step 4: small-value tilt ---------- */
function q4() {
  shell('Do you want a small-value tilt?',
    'Small-value means small, cheap companies. Over long stretches they have beaten the market, ' +
    'and they have also trailed it for ten years at a time. It is optional and most people skip it.');
  var next;
  options('radio', 'tq4', [
    { value: 0, title: 'No, keep it simple', lines: ['Total-market funds only. You can add this later.'] },
    { value: 22, title: 'Yes, a bit (22%)', lines: ['22% of your stocks go into small-value funds like AVUV and AVDV.'] }
  ], function (v) { return ans.tilt === v; }, function (v) { ans.tilt = v; next.disabled = false; });
  next = nav(function () { go(3); }, 'Next', function () { go(5); }, ans.tilt != null);
}

/* ---------- step 5: which accounts ---------- */
function q5() {
  shell(ans.route === 'target' ? 'Which accounts will you use?' : 'Which accounts do you have?',
    'Tick all that apply. They get set up empty, then you type in the balances. ' +
    'Nothing you type leaves this browser.');
  var next;
  options('checkbox', 'tq5', ACCTS.map(function (a) {
    return { value: a.type, title: a.name, lines: [a.note] };
  }), function (v) { return ans.accts.indexOf(v) > -1; }, function (v, on) {
    ans.accts = ans.accts.filter(function (x) { return x !== v; });
    if (on) ans.accts.push(v);
    next.disabled = !ans.accts.length;
  });
  next = nav(function () { go(4); }, 'Set it up', finish, ans.accts.length > 0);
}

/* ---------- writing the answers ---------- */
function buildState() {
  var s = DEFAULT();
  /* the quiz does not ask about income or savings, so real ones survive a start over */
  if (S && !S.isSample && S.plan) s.plan = JSON.parse(JSON.stringify(S.plan));
  if (S && S.mode) s.mode = S.mode;
  s.equityPct = ans.eq;
  s.intlPct = ans.intl;
  s.tiltPct = ans.tilt;
  s.preset = ans.tilt > 0 ? 'Factor tilt' : 'Market portfolio';
  s.accounts = ACCTS.filter(function (a) { return ans.accts.indexOf(a.type) > -1; }).map(function (a) {
    return { id: uid(), name: a.name, type: a.type, holdings: [{ id: uid(), ticker: '', cls: 'US', bal: 0 }] };
  });
  s.contrib = {};
  s.isSample = false;
  return s;
}

/* validate, render, then save, and put everything back if the render throws */
function finish() {
  var before = S;
  try {
    var next = sanitizeState(buildState());
    if (!next) throw new Error('quiz built a state sanitizeState refused');
    S = next;
    migrate();
    renderAll();
    save();
  } catch (e) {
    S = before;
    try { renderAll(); } catch (e2) {}
    close();
    if (typeof toast === 'function') toast('Something went wrong. Nothing was changed.');
    return;
  }
  try { invalidateResults(); } catch (e) {}
  close(true);
  land();
  if (typeof toast === 'function') toast('Done. Now put a balance in each account.');
}

/* open the accounts section through its own header, so the open state is saved */
function land() {
  var sec = document.getElementById('s1');
  if (!sec) return;
  var head = sec.querySelector('.sec-head');
  if (sec.classList.contains('closed') && head) head.click();
  if (head && head.focus) { try { head.focus({ preventScroll: true }); } catch (e) { head.focus(); } }
  sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ---------- the way in ----------
   A first visit loads sample data, so the sample banner is what a new visitor
   sees. The first-run block only appears once the page is empty. Both get the
   button. Both are rebuilt by the page's own renders, so this re-adds it after. */
var LABEL = 'Set it up for me (5 questions)';

function entryButton(cls) {
  var b = el('button', { type: 'button', cls: cls + ' tq-entry', text: LABEL });
  b.addEventListener('click', open);
  return b;
}

function addEntries() {
  var sb = document.getElementById('sampleBanner');
  if (sb && !sb.querySelector('.tq-entry')) {
    var clear = sb.querySelector('button');
    sb.insertBefore(entryButton('btn tiny primary'), clear || null);
  }
  var fr = document.getElementById('firstRun');
  var row = fr && fr.children[2];
  if (row && !row.querySelector('.tq-entry')) {
    Array.prototype.forEach.call(row.querySelectorAll('button'), function (b) { b.className = 'btn'; });
    row.insertBefore(entryButton('btn primary'), row.firstChild);
  }
}

['renderAll', 'renderOverview'].forEach(function (name) {
  var orig = window[name];
  if (typeof orig !== 'function') return;
  window[name] = function () {
    var out = orig.apply(this, arguments);
    try { addEntries(); } catch (e) {}
    return out;
  };
});
addEntries();

/* /?setup=1 opens it straight away, so the tools hub can link to it */
if (/(^|[?&])setup=1(&|$)/.test(location.search.slice(1))) {
  try {
    var q = location.search.slice(1).split('&').filter(function (p) { return p !== 'setup=1'; }).join('&');
    history.replaceState(null, '', location.pathname + (q ? '?' + q : '') + location.hash);
  } catch (e) {}
  open();
}

window.openSetupQuiz = open;
})();
