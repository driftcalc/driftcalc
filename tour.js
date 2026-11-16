/* Drift Calc: the setup quiz, and a short tour of the page.
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
    '.tq-back{position:fixed;top:0;right:0;bottom:0;left:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:24px;' +
      'background:rgba(11,31,59,.62);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);animation:tqFade .18s ease-out}' +
    '.tq{display:flex;flex-direction:column;width:100%;max-width:560px;max-height:calc(100vh - 48px);max-height:calc(100dvh - 48px);' +
      'background:var(--card);color:var(--ink);border-radius:18px;box-shadow:0 24px 60px rgba(11,31,59,.32);overflow:hidden;' +
      'animation:tqUp .22s cubic-bezier(.2,.8,.2,1)}' +

    /* header: label, close, progress */
    '.tq-head{flex:none;padding:18px 22px 14px;border-bottom:1px solid transparent;transition:border-color .15s}' +
    '.tq-head.sh{border-bottom-color:var(--hairline)}' +
    '.tq-top{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:11.5px;font-weight:700;' +
      'letter-spacing:.07em;text-transform:uppercase;color:var(--muted)}' +
    '.tq-x{font:inherit;font-size:24px;font-weight:400;line-height:1;border:0;background:none;color:var(--muted);cursor:pointer;' +
      'min-width:44px;min-height:44px;margin:-12px -14px -12px 0;border-radius:10px}' +
    '.tq-x:hover{color:var(--ink);background:var(--hairline)}' +
    '.tq-steps{display:flex;gap:6px;margin-top:8px}' +
    '.tq-steps i{flex:1;height:5px;border-radius:5px;background:var(--hairline);transition:background .25s}' +
    '.tq-steps i.done{background:var(--accent)}' +

    /* the question, which scrolls on its own so the buttons never leave the screen */
    '.tq-main{flex:1 1 auto;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;padding:8px 22px 22px}' +
    '.tq-main.in{animation:tqIn .2s ease-out}' +
    '.tq h2{font-family:var(--disp);font-size:23px;font-weight:800;letter-spacing:-.01em;line-height:1.22;margin:0 0 8px;outline:none}' +
    /* the heading takes focus so a screen reader reads the question; it is not a control */
    '.tq h2:focus,.tq h2:focus-visible{outline:none;box-shadow:none}' +
    '.tq-intro{color:var(--muted);font-size:14.5px;line-height:1.55;margin:0 0 18px}' +
    '.tq-opts{display:flex;flex-direction:column;gap:10px}' +
    '.tq-opt{display:flex;gap:13px;align-items:flex-start;border:1.5px solid var(--border);border-radius:12px;padding:14px 16px;' +
      'cursor:pointer;background:var(--card);transition:border-color .15s,background .15s,box-shadow .15s;-webkit-tap-highlight-color:transparent}' +
    '.tq-opt:hover{border-color:#B9C7DD}' +
    '.tq-opt.on{border-color:var(--accent);background:var(--accent-soft);box-shadow:0 0 0 3px rgba(46,107,230,.12)}' +
    '.tq-opt input{flex:none;width:20px;height:20px;margin:1px 0 0;accent-color:var(--accent);cursor:pointer}' +
    '.tq-txt{flex:1;min-width:0}' +
    '.tq-opt b{display:block;font-size:15px;font-weight:600;line-height:1.35}' +
    '.tq-opt small{display:block;color:var(--muted);font-size:13px;line-height:1.5;margin-top:3px}' +
    '.tq-opt small+small{margin-top:1px}' +

    /* the fall, drawn: title on the left, the drop in red on the right, a bar under it */
    '.tq-row{display:flex;align-items:baseline;justify-content:space-between;gap:10px}' +
    '.tq-drop{flex:none;font-weight:800;font-size:16px;color:var(--red);font-variant-numeric:tabular-nums}' +
    '.tq-bar{height:7px;border-radius:7px;background:var(--hairline);overflow:hidden;margin:8px 0 6px}' +
    '.tq-bar i{display:block;height:100%;border-radius:7px;background:var(--red);opacity:.8}' +
    '.tq-opt.on .tq-bar{background:#fff}' +

    '.tq-note{font-size:13px;color:var(--muted);margin:14px 0 0;line-height:1.5}' +
    '.tq-sum{margin-top:16px;padding:12px 14px;border-radius:12px;background:var(--bg);font-size:13.5px;line-height:1.55}' +
    '.tq-sum span{display:block;font-size:11px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--muted);margin-bottom:2px}' +

    /* footer, pinned */
    '.tq-foot{flex:none;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;' +
      'padding:14px 22px;padding-bottom:calc(14px + env(safe-area-inset-bottom));border-top:1px solid var(--hairline);background:var(--card)}' +
    '.tq-foot .btn{min-height:46px;padding:10px 20px;font-size:14.5px;font-weight:600;border-radius:10px}' +
    '.tq-foot .btn.primary{min-width:130px;margin-left:auto}' +
    '.tq-foot .btn.primary[disabled]{background:var(--hairline);border-color:var(--hairline);color:var(--faint);cursor:not-allowed}' +

    /* the tour: a clear shade that catches clicks, a lit hole, a card */
    '.tt-shade{position:fixed;top:0;right:0;bottom:0;left:0;z-index:990}' +
    '.tt-hole{position:fixed;z-index:991;pointer-events:none;border-radius:14px;' +
      'box-shadow:0 0 0 2px var(--accent),0 0 0 200vmax rgba(11,31,59,.55);' +
      'transition:top .25s ease,left .25s ease,width .25s ease,height .25s ease,opacity .2s}' +
    '.tt-card{position:fixed;z-index:992;left:50%;bottom:24px;transform:translateX(-50%);width:calc(100% - 48px);max-width:440px;' +
      'background:var(--card);color:var(--ink);border-radius:16px;padding:16px 20px 16px;box-shadow:0 18px 50px rgba(11,31,59,.35);' +
      'animation:tqFade .2s ease-out}' +
    '.tt-card .tq-steps{margin-bottom:12px}' +
    '.tt-card h2{font-family:var(--disp);font-size:19px;font-weight:800;margin:0 0 6px;outline:none}' +
    '.tt-card h2:focus,.tt-card h2:focus-visible{outline:none;box-shadow:none}' +
    '.tt-card p{margin:0;color:var(--muted);font-size:14.5px;line-height:1.55}' +
    '.tt-nav{display:flex;gap:10px;margin-top:14px}' +
    '.tt-nav .btn{min-height:44px;padding:10px 18px;font-size:14.5px;font-weight:600;border-radius:10px}' +
    '.tt-nav .btn.primary{margin-left:auto;min-width:110px}' +
    /* the nudge: a small card in the corner, no backdrop, never takes focus */
    '.tn{position:fixed;z-index:95;right:20px;bottom:20px;width:320px;max-width:calc(100% - 24px);' +
      'background:var(--card);color:var(--ink);border:1px solid var(--border);border-radius:14px;' +
      'box-shadow:0 10px 30px rgba(11,31,59,.18);padding:14px 14px 14px 16px;display:flex;gap:12px;align-items:flex-start;' +
      'animation:tnIn .35s cubic-bezier(.2,.8,.2,1)}' +
    '.tn-ic{flex:none;width:34px;height:34px;border-radius:10px;background:var(--accent-soft);color:var(--accent);' +
      'display:flex;align-items:center;justify-content:center;font-size:17px}' +
    '.tn-txt{flex:1;min-width:0}' +
    '.tn b{display:block;font-size:14.5px;font-weight:700;margin-top:1px}' +
    '.tn p{margin:2px 0 10px;font-size:13px;line-height:1.45;color:var(--muted)}' +
    '.tn .btn{min-height:38px;padding:8px 14px;font-size:13.5px;font-weight:600;border-radius:9px}' +
    '.tn .tq-x{margin:-10px -8px 0 0;font-size:20px;min-width:40px;min-height:40px}' +
    '.tn.out{opacity:0;transform:translateY(10px);transition:opacity .2s,transform .2s}' +
    '@keyframes tnIn{from{opacity:0;transform:translateY(16px)}}' +
    '@media (max-width:560px){.tn{left:12px;right:12px;width:auto;max-width:none;' +
      'bottom:calc(12px + env(safe-area-inset-bottom))}}' +
    '@keyframes tqFade{from{opacity:0}}' +
    '@keyframes tqUp{from{opacity:0;transform:translateY(12px) scale(.98)}}' +
    '@keyframes tqSheet{from{opacity:0;transform:translateY(48px)}}' +
    '@keyframes tqIn{from{opacity:0;transform:translateX(10px)}}' +

    /* phones: a sheet that rises from the bottom, thumb-height buttons */
    '@media (max-width:560px){' +
      '.tq-back{align-items:flex-end;padding:0}' +
      '.tq{max-width:none;max-height:calc(100vh - 20px);max-height:calc(100dvh - 20px);border-radius:20px 20px 0 0;animation-name:tqSheet}' +
      '.tq-head{padding:14px 18px 12px}' +
      '.tq-main{padding:6px 18px 18px}' +
      '.tq-foot{padding:12px 18px;padding-bottom:calc(12px + env(safe-area-inset-bottom))}' +
      '.tq h2{font-size:21px}' +
      '.tq-foot .btn.primary{flex:1}' +
      '.tt-card{left:0;right:0;bottom:0;transform:none;width:auto;max-width:none;border-radius:20px 20px 0 0;' +
        'padding:14px 18px;padding-bottom:calc(14px + env(safe-area-inset-bottom))}' +
      '.tt-nav .btn.primary{flex:1}' +
    '}' +
    '@media (prefers-reduced-motion:reduce){.tq-back,.tq,.tq-main.in,.tt-card,.tn{animation:none}.tt-hole,.tn.out{transition:none}}';
  document.head.appendChild(el('style', { id: 'tqStyle', text: css }));
}

/* ---------- the overlay ---------- */
var box = null, back = null, pane = null, opener = null, step = 0, ans = null, gated = false;

function hasRealData() {
  if (typeof S === 'undefined' || !S || S.isSample || !Array.isArray(S.accounts)) return false;
  return S.accounts.some(function (a) {
    return (a.holdings || []).some(function (h) { return (+h.bal || 0) > 0 || String(h.ticker || '').trim(); });
  });
}

function open() {
  if (back) return;
  dropNudge(true);
  injectStyle();
  opener = document.activeElement;
  ans = { route: null, eq: null, intl: null, tilt: null, accts: [] };
  gated = hasRealData();
  step = gated ? 0 : 1;

  back = el('div', { cls: 'tq-back' });
  box = el('div', { cls: 'tq', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'tqTitle' });
  back.appendChild(box);
  /* a stray tap outside only closes before any answers are given */
  back.addEventListener('mousedown', function (e) { if (e.target === back && step <= 1 && !ans.route) close(); });
  back.addEventListener('keydown', onKey);
  document.body.appendChild(back);
  document.documentElement.classList.add('tq-lock');
  loadReturns();   /* start early so step 2 is usually ready */
  render();
}

function close(landed) {
  if (!back) return;
  back.parentNode.removeChild(back);
  back = box = pane = null;
  document.documentElement.classList.remove('tq-lock');
  if (landed) return;
  if (opener && opener.focus && document.body.contains(opener) && opener.offsetParent !== null) opener.focus();
}

function onKey(e) {
  if (e.key === 'Escape' || e.key === 'Esc') { e.preventDefault(); close(); return; }
  /* Enter on an answer moves on, the way it would in a form */
  if (e.key === 'Enter' && e.target && e.target.tagName === 'INPUT') {
    var go1 = box.querySelector('.tq-foot .btn.primary');
    if (go1 && !go1.disabled) { e.preventDefault(); go1.click(); }
    return;
  }
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
  var head = el('div', { cls: 'tq-head' }, [
    el('div', { cls: 'tq-top' }, [el('span', { text: step > 0 ? 'Question ' + step + ' of ' + TOTAL : 'Before you start' }), x])
  ]);
  if (step > 0) {
    var steps = el('div', { cls: 'tq-steps', 'aria-hidden': 'true' });
    for (var i = 1; i <= TOTAL; i++) steps.appendChild(el('i', { cls: i <= step ? 'done' : '' }));
    head.appendChild(steps);
  }
  box.appendChild(head);
  pane = el('div', { cls: 'tq-main in' });
  pane.appendChild(el('h2', { id: 'tqTitle', tabindex: '-1', text: title }));
  if (intro) pane.appendChild(el('p', { cls: 'tq-intro', text: intro }));
  box.appendChild(pane);
  /* a line under the header only once the question has scrolled under it */
  pane.addEventListener('scroll', function () { head.classList.toggle('sh', pane.scrollTop > 2); });
}

function nav(backFn, nextLabel, nextFn, ready) {
  var row = el('div', { cls: 'tq-foot' });
  if (backFn) {
    var b = el('button', { type: 'button', cls: 'btn', text: 'Back' });
    b.addEventListener('click', backFn);
    row.appendChild(b);
  }
  var n = el('button', { type: 'button', cls: 'btn primary', text: nextLabel });
  n.disabled = !ready;
  n.addEventListener('click', nextFn);
  row.appendChild(n);
  box.appendChild(row);
  return n;
}

/* one radio or checkbox per option, each a real labelled input.
   An option can bring its own body (o.body) in place of title and lines. */
function options(type, name, list, isOn, onPick) {
  var wrap = el('div', { cls: 'tq-opts', role: type === 'radio' ? 'radiogroup' : 'group', 'aria-labelledby': 'tqTitle' });
  list.forEach(function (o) {
    var inp = el('input', { type: type, name: name, value: String(o.value) });
    inp.checked = !!isOn(o.value);
    var txt = o.body || el('span', null, [el('b', { text: o.title })]);
    txt.classList.add('tq-txt');
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
  pane.appendChild(wrap);
  return wrap;
}

function go(n) { step = n; render(); }

function render() {
  if (!box) return;
  [gate, q1, q2, q3, q4, q5][step]();
  var t = document.getElementById('tqTitle');
  if (t) { try { t.focus({ preventScroll: true }); } catch (e) { t.focus(); } }
}

/* ---------- step 0: only when there is real data to lose ---------- */
function gate() {
  shell('Start over?',
    'You already have accounts in here. Finishing these questions replaces them, balances and all. ' +
    'Save a backup first if you might want them back.');
  var row = el('div', { cls: 'tq-foot' });
  var c = el('button', { type: 'button', cls: 'btn', text: 'Cancel' });
  c.addEventListener('click', function () { close(); });
  var bk = el('button', { type: 'button', cls: 'btn', text: 'Save a backup' });
  bk.addEventListener('click', function () { if (typeof exportJSON === 'function') exportJSON(); });
  var go1 = el('button', { type: 'button', cls: 'btn primary', text: 'Start over' });
  go1.addEventListener('click', function () { go(1); });
  row.appendChild(c); row.appendChild(bk); row.appendChild(go1);
  box.appendChild(row);
}

/* ---------- step 1: why are you here ---------- */
function q1() {
  shell('What brought you here?', 'Five quick questions, then this page fills in for you.');
  var next;
  options('radio', 'tq1', [
    { value: 'target', title: 'Pick a mix to aim for', lines: ['How much in stocks, bonds and overseas.'] },
    { value: 'drift', title: 'Check the accounts I have', lines: ['How far they have drifted and where new money should go.'] },
    { value: 'look', title: 'Just looking', lines: ['Keep the sample numbers and get a quick tour of the page.'] }
  ], function (v) { return ans.route === v; }, function (v) {
    ans.route = v;
    next.disabled = false;
    next.textContent = v === 'look' ? 'Show me around' : 'Next';
  });
  next = nav(gated ? function () { go(0); } : null, ans.route === 'look' ? 'Show me around' : 'Next', function () {
    if (ans.route === 'look') { close(true); startTour(); return; }
    go(2);
  }, !!ans.route);
}

/* ---------- step 2: the fall ---------- */
function q2() {
  shell('How big a fall could you sit through?',
    'Stocks grow more but fall harder. Bonds soften the fall. These are real drops, top to bottom. ' +
    'Pick the biggest one you could watch without selling.');
  var holder = el('div');
  pane.appendChild(holder);
  var next = nav(function () { go(1); }, 'Next', function () { go(3); }, ans.eq != null);
  holder.appendChild(el('p', { cls: 'tq-note', text: 'Loading the market record…' }));

  var asked = step;
  loadReturns().then(function (d) {
    if (!box || step !== asked) return;
    holder.textContent = '';
    var list = EQ.map(function (e) {
      if (!d) return { value: e[0], title: e[1] };
      var f = falls(d, e[0]), r = f.recent, a = f.all;
      var pct = Math.round(r.dd * 100);
      var left = Math.round(10000 * (1 - r.dd) / 100) * 100;
      var bar = el('div', { cls: 'tq-bar', 'aria-hidden': 'true' }, [el('i')]);
      bar.firstChild.style.width = pct + '%';
      var body = el('span', null, [
        el('span', { cls: 'tq-row' }, [el('b', { text: e[1] }), el('span', { cls: 'tq-drop', text: '−' + pct + '%' })]),
        bar,
        el('small', { text: years(r) + ': $10,000 fell to $' + left.toLocaleString('en-US') + '.' })
      ]);
      /* bond data starts in 1953, so a mix with bonds has a shorter record than
         all stocks does. Say which year each one goes back to. */
      var since = a.start.slice(0, 4);
      body.appendChild(el('small', { text: a.peak !== r.peak
        ? 'Worst since ' + since + ': fell ' + Math.round(a.dd * 100) + '%, ' + years(a).replace('In ', '') + '.'
        : 'That was the worst since ' + since + '.' }));
      return { value: e[0], body: body };
    });
    /* options() appends to the pane; move the list into its slot */
    holder.appendChild(options('radio', 'tq2', list, function (v) { return ans.eq === v; }, function (v) {
      ans.eq = v; next.disabled = false;
    }));
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
  /* what they picked, in one place, before anything is written */
  var bonds = 100 - ans.eq;
  pane.appendChild(el('div', { cls: 'tq-sum' }, [
    el('span', { text: 'Your mix' }),
    document.createTextNode(
      (bonds ? ans.eq + '% stocks, ' + bonds + '% bonds. ' : 'All stocks. ') +
      (ans.intl ? ans.intl + '% of the stocks outside the US. ' : 'US stocks only. ') +
      (ans.tilt ? ans.tilt + '% of the stocks in small value.' : 'No small-value tilt.'))
  ]));
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
  /* after the toast has gone, so the two never stack */
  setTimeout(showNudge, 3000);
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

/* ======================= the tour =======================
   Six stops on the page, each saying what that part is for. Hand-rolled: the
   CSP rules out every tour library.

   Nothing about the page is cached. backtest.js reorders and rebuilds the DOM,
   so every stop finds its element by id when it is shown and measures it again
   on every scroll and resize. A folded section is opened through its own header,
   the same path a click takes, and folded back when the tour ends.

   It needs at least one account on the page. With accounts but no balances yet,
   which is where the setup quiz leaves people, the summary row is hidden and
   skipped, and the rest still has something to point at. With no accounts at
   all every stop would point at a blank, so it does not run. */
var STOPS = [
  { id: 'statStrip', title: 'Where you stand', text: function () {
      return 'Your whole portfolio in one row: how far off target you are, what it all adds up to, ' +
        'and your mix of stocks and bonds.' +
        (S && S.isSample ? ' These are sample numbers until you put in your own.' : '');
    } },
  { id: 's2', title: 'Your target', text: 'What you want to own, in percentages. Three dials set it: ' +
      'stocks versus bonds, how much overseas, and an optional small-value tilt. ' +
      'Everything else on the page measures against this.' },
  { id: 's1', title: 'Your accounts', text: 'What you own today, one account at a time. Type a fund ' +
      'like VTI and its balance. The page works out what kind of fund it is.' },
  { id: 's3', title: 'This month', text: 'Type what you are adding this month. It shows which fund to ' +
      'buy in which account to get closer to your target, without selling anything.' },
  { id: 's5', title: 'Extras', text: 'Side math: what your fees cost over the years, what waiting ' +
      'to invest costs, and how savings grow. None of it is required.' },
  { sel: 'header .hmore > .btn', title: 'Back it up', text: 'Your numbers live in this browser and ' +
      'nowhere else. Save a backup file from this menu now and then, so clearing your browser ' +
      'does not erase them.' }
];

var tour = null;   /* { stops, i, shade, hole, card, opened, opener, raf } while running */

function hasAccounts() {
  return typeof S !== 'undefined' && !!S && Array.isArray(S.accounts) && S.accounts.length > 0;
}

function stopEl(st) { return st.id ? document.getElementById(st.id) : document.querySelector(st.sel); }
function shown(n) { return !!(n && n.getClientRects().length && n.offsetParent !== null); }
function inHeader(n) { return !!(n && n.closest && n.closest('header')); }
function headerBottom() {
  var h = document.querySelector('header');
  return h ? Math.max(0, h.getBoundingClientRect().bottom) : 0;
}
function smooth() {
  return !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

function startTour() {
  if (tour) return;
  dropNudge();
  if (back) close(true);
  if (!hasAccounts()) {
    if (typeof toast === 'function') toast('The tour needs an account on the page. Set it up or load the sample first.');
    return;
  }
  injectStyle();
  /* the summary row hides itself when there is nothing to sum, so skip what is not there */
  var stops = STOPS.filter(function (st) {
    var n = stopEl(st);
    if (!n) return false;
    if (n.closest && n.closest('section')) return true;   /* a folded section still counts */
    return shown(n);
  });
  if (!stops.length) return;

  tour = { stops: stops, i: 0, opened: [], opener: document.activeElement, raf: 0 };
  tour.shade = el('div', { cls: 'tt-shade' });
  tour.hole = el('div', { cls: 'tt-hole', 'aria-hidden': 'true' });
  tour.card = el('div', { cls: 'tt-card', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ttTitle' });
  document.body.appendChild(tour.shade);
  document.body.appendChild(tour.hole);
  document.body.appendChild(tour.card);
  tour.card.addEventListener('keydown', tourKey);
  tour.shade.addEventListener('click', function () { if (tour) tour.card.querySelector('#ttTitle').focus(); });
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  showStop(0);
}

function endTour() {
  if (!tour) return;
  var t = tour;
  tour = null;
  window.removeEventListener('scroll', schedule);
  window.removeEventListener('resize', schedule);
  if (t.raf) cancelAnimationFrame(t.raf);
  [t.shade, t.hole, t.card].forEach(function (n) { if (n.parentNode) n.parentNode.removeChild(n); });
  /* fold back what the tour opened, through the header so the state is saved */
  t.opened.forEach(function (id) {
    var sec = document.getElementById(id);
    var head = sec && sec.querySelector('.sec-head');
    if (head && !sec.classList.contains('closed')) head.click();
  });
  if (t.opener && t.opener.focus && document.body.contains(t.opener) && t.opener.offsetParent !== null) {
    try { t.opener.focus({ preventScroll: true }); } catch (e) { t.opener.focus(); }
  }
}

function showStop(i) {
  if (!tour) return;
  tour.i = i;
  var st = tour.stops[i];
  var n = stopEl(st);
  if (!n) { endTour(); return; }

  var sec = n.tagName === 'SECTION' ? n : null;
  if (sec && sec.classList.contains('closed')) {
    var head = sec.querySelector('.sec-head');
    if (head) { head.click(); tour.opened.push(sec.id); }
  }

  drawCard(st, i);
  if (!inHeader(n)) {
    var top = window.pageYOffset + n.getBoundingClientRect().top - headerBottom() - 14;
    try { window.scrollTo({ top: Math.max(0, top), behavior: smooth() ? 'smooth' : 'auto' }); }
    catch (e) { window.scrollTo(0, Math.max(0, top)); }
  }
  follow(1200);
}

/* Smooth scrolling runs for a while after the call, and Safari does not always
   fire a last scroll event, so track the target every frame until it settles. */
function follow(ms) {
  var until = Date.now() + ms;
  (function tick() {
    if (!tour) return;
    place();
    if (Date.now() < until) requestAnimationFrame(tick);
  })();
}

function drawCard(st, i) {
  var c = tour.card, total = tour.stops.length;
  c.textContent = '';
  var x = el('button', { type: 'button', cls: 'tq-x', 'aria-label': 'End the tour' });
  x.textContent = '×';
  x.addEventListener('click', endTour);
  c.appendChild(el('div', { cls: 'tq-top' }, [el('span', { text: (i + 1) + ' of ' + total }), x]));
  var steps = el('div', { cls: 'tq-steps', 'aria-hidden': 'true' });
  for (var k = 0; k < total; k++) steps.appendChild(el('i', { cls: k <= i ? 'done' : '' }));
  c.appendChild(steps);
  c.appendChild(el('h2', { id: 'ttTitle', tabindex: '-1', text: st.title }));
  c.appendChild(el('p', { text: typeof st.text === 'function' ? st.text() : st.text }));
  var row = el('div', { cls: 'tt-nav' });
  if (i > 0) {
    var b = el('button', { type: 'button', cls: 'btn', text: 'Back' });
    b.addEventListener('click', function () { showStop(i - 1); });
    row.appendChild(b);
  }
  var last = i === total - 1;
  var nx = el('button', { type: 'button', cls: 'btn primary', text: last ? 'Done' : 'Next' });
  nx.addEventListener('click', function () { if (last) endTour(); else showStop(i + 1); });
  row.appendChild(nx);
  c.appendChild(row);
  var t = c.querySelector('#ttTitle');
  try { t.focus({ preventScroll: true }); } catch (e) { t.focus(); }
}

function schedule() {
  if (!tour || tour.raf) return;
  tour.raf = requestAnimationFrame(function () { if (tour) { tour.raf = 0; place(); } });
}

/* measure the target fresh, and keep the hole between the header and the card */
function place() {
  if (!tour) return;
  var n = stopEl(tour.stops[tour.i]);
  if (!n) return;
  var r = n.getBoundingClientRect(), pad = 8;
  var vh = window.innerHeight, vw = document.documentElement.clientWidth;
  var cardTop = tour.card.getBoundingClientRect().top;
  var top = r.top - pad, bottom = r.bottom + pad;
  if (!inHeader(n)) top = Math.max(top, headerBottom() + 4);
  /* a tall section is lit down to the card and no further, so the card never sits on it */
  bottom = Math.min(bottom, Math.min(cardTop, vh) - 12);
  var h = tour.hole.style;
  if (bottom - top < 24) { h.opacity = '0'; return; }
  h.opacity = '1';
  h.top = top + 'px';
  h.left = Math.max(4, r.left - pad) + 'px';
  h.width = (Math.min(vw - 4, r.right + pad) - Math.max(4, r.left - pad)) + 'px';
  h.height = (bottom - top) + 'px';
}

function tourKey(e) {
  if (!tour) return;
  if (e.key === 'Escape' || e.key === 'Esc') { e.preventDefault(); endTour(); return; }
  if (e.key === 'ArrowRight' && tour.i < tour.stops.length - 1) { e.preventDefault(); showStop(tour.i + 1); return; }
  if (e.key === 'ArrowLeft' && tour.i > 0) { e.preventDefault(); showStop(tour.i - 1); return; }
  if (e.key !== 'Tab') return;
  var f = Array.prototype.filter.call(tour.card.querySelectorAll('button'), function (b) { return b.offsetParent !== null; });
  if (!f.length) return;
  var first = f[0], last = f[f.length - 1];
  if (e.shiftKey && (document.activeElement === first || !tour.card.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

/* ---------- the nudge ----------
   The tour buttons sit in the sample banner, the empty-page box and the header
   menu, and people walked past all three. This is a small card in the corner,
   once per browser. It shows a second after load, only when there is an account
   on the page for the tour to point at, and goes for good the moment someone
   takes the tour or closes the card. Opening the quiz only moves it aside: the
   quiz ends on empty accounts, which is when the tour helps most, so it comes
   back after. It never takes focus.
   The "seen" flag is a convenience, so if storage is blocked the worst case is
   seeing the card again. */
var NUDGE_KEY = 'driftcalc-tour-nudge';
var nudgeEl = null;

function nudgeSeen() { try { return localStorage.getItem(NUDGE_KEY) === '1'; } catch (e) { return false; } }
function markNudge() { try { localStorage.setItem(NUDGE_KEY, '1'); } catch (e) {} }

function dropNudge(keep) {
  if (!keep) markNudge();
  if (!nudgeEl) return;
  var n = nudgeEl;
  nudgeEl = null;
  n.classList.add('out');
  setTimeout(function () { if (n.parentNode) n.parentNode.removeChild(n); }, 220);
}

function showNudge() {
  if (nudgeEl || nudgeSeen() || back || tour || !hasAccounts()) return;
  injectStyle();
  var x = el('button', { type: 'button', cls: 'tq-x', 'aria-label': 'No thanks' });
  x.textContent = '×';
  x.addEventListener('click', function () { dropNudge(); });
  var go1 = el('button', { type: 'button', cls: 'btn primary', text: 'Show me around' });
  go1.addEventListener('click', function () { dropNudge(); startTour(); });
  nudgeEl = el('div', { cls: 'tn', role: 'region', 'aria-label': 'Page tour' }, [
    el('span', { cls: 'tn-ic', 'aria-hidden': 'true', text: '→' }),
    el('div', { cls: 'tn-txt' }, [
      el('b', { text: 'New here?' }),
      el('p', { text: 'A 30-second tour shows what each part of the page does.' }),
      go1
    ]),
    x
  ]);
  document.body.appendChild(nudgeEl);
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
    var tb = el('button', { type: 'button', cls: 'btn tiny tt-entry', text: 'Show me around' });
    tb.addEventListener('click', startTour);
    sb.insertBefore(tb, clear || null);
  }
  var menu = document.querySelector('header .hmenu');
  if (menu && !menu.querySelector('.tt-entry')) {
    var mb = el('button', { type: 'button', cls: 'btn ghost tiny tt-entry', text: 'Show me around' });
    mb.addEventListener('click', startTour);
    menu.insertBefore(mb, menu.firstChild);
  }
  var fr = document.getElementById('firstRun');
  var row = fr && fr.children[2];
  if (row && !row.querySelector('.tq-entry')) {
    Array.prototype.forEach.call(row.querySelectorAll('button'), function (b) { b.className = 'btn'; });
    row.insertBefore(entryButton('btn primary'), row.firstChild);
    /* accounts but no balances, which is where the quiz leaves people: the tour
       is the next useful thing, so it goes right after the quiz button */
    if (hasAccounts()) {
      var ft = el('button', { type: 'button', cls: 'btn tt-entry', text: 'Show me around' });
      ft.addEventListener('click', startTour);
      row.insertBefore(ft, row.children[1] || null);
    }
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

setTimeout(showNudge, 1200);

window.openSetupQuiz = open;
window.startTour = startTour;
})();
