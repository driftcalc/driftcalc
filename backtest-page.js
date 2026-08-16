/* Drift Calc — backtest and leverage lab.
   Reads the allocation the user set on the calculator page (same localStorage
   key, same origin) and returns.json, which the GitHub Action rebuilds monthly. */
(function () {
'use strict';

var MARKET_INTL = 38;
var COLORS = { US:'#2E6BE6', INTL:'#14B8A6', USSCV:'#F59E0B', BOND:'#7C8DA6' };
var NAMES  = { US:'US stocks', INTL:'International', USSCV:'US small value', BOND:'Bonds' };
/* EM and intl small value have no free long-run series; they ride with developed intl. */
var PROXY  = { US:'US', USSCV:'USSCV', INTL:'INTL', EM:'INTL', INTLSCV:'INTL', BOND:'BOND' };


/* ---------- three ways people actually get leverage ---------- */
var DIV_YIELD = 0.018;   /* dividends an options holder gives up */
var LETF_ER   = 0.90;    /* typical levered-fund expense ratio */
var METHODS = {
  margin: { label:'Margin', spread:1.5,
    blurb:'You borrow cash from your broker and buy more shares. You keep the dividends. Rebalanced monthly here.',
    /* Portfolio margin at IBKR sits near the low end; ordinary retail margin at
       Schwab, Fidelity or E*TRADE is the high end. Both move with the Fed. */
    range:'0.5&ndash;1.5% on portfolio margin, 2&ndash;5% on ordinary retail margin',
    note:'Nothing else. You hold real shares, so you keep the dividends.' },
  letf:   { label:'Leveraged ETF', spread:0.6,
    blurb:'A fund like SSO, UPRO or TQQQ borrows for you and resets every single day. Easiest to buy, worst in choppy markets.',
    range:'0.4&ndash;0.8%, the rate the fund itself pays on swaps and futures',
    note:'Plus a 0.90% expense ratio charged on the <i>whole</i> position, not just the borrowed part. That is the bigger cost, and it is already in the numbers.' },
  leaps:  { label:'LEAPS options', spread:1.0,
    blurb:'Long-dated deep in-the-money calls. Financing is priced in, and you get no dividends because you own options, not shares.',
    range:'0.5&ndash;1.5% baked into the option price, plus a few tenths in bid-ask every time you roll',
    note:'Plus the ~1.8% dividend you give up on the whole position, because you own options rather than shares. Already in the numbers.' },
};

function leveredMonth(r, cash, L, spreadA, method, varM) {
  var c = cash + spreadA / 100 / 12;
  if (method === 'margin') return L * r - (L - 1) * c;
  if (method === 'letf') {
    /* Daily reset compounds inside the month, which is why a flat but choppy
       market still loses money. (1+r)^L shrunk by exp(-(L^2-L)/2 * variance). */
    var decay = Math.exp(-(L * L - L) / 2 * varM);
    return Math.pow(1 + r, L) * decay - 1 - (L - 1) * c - LETF_ER / 100 / 12;
  }
  /* leaps: price moves only, and the dividend is lost on the whole notional */
  return L * (r - DIV_YIELD / 12) - (L - 1) * c;
}

function variance(a) {
  if (a.length < 2) return 0;
  var m = a.reduce(function (x, y) { return x + y; }, 0) / a.length;
  return a.reduce(function (x, y) { return x + (y - m) * (y - m); }, 0) / (a.length - 1);
}

/* Trailing variance for the daily-reset decay. Falls back to the full-sample
   figure rather than zero, because zero would switch decay off and flatter
   leveraged funds exactly where we have least information. */
function rollingVar(series, window) {
  window = window || 36;
  var clean = series.filter(function (v) { return v != null; });
  var fallback = variance(clean);
  var minPts = Math.min(6, Math.max(2, window));
  var out = new Array(series.length), buf = [];
  for (var i = 0; i < series.length; i++) {
    var v = series[i];
    if (v != null) { buf.push(v); if (buf.length > window) buf.shift(); }
    out[i] = buf.length >= minPts ? variance(buf) : fallback;
  }
  return out;
}


/* segmented control styling, injected once so backtest.html needs no change */
(function injectCss(){
  var s = document.createElement('style');
  s.textContent =
    '.seg{display:inline-flex;background:var(--hairline);border-radius:10px;padding:3px;gap:2px}' +
    '.seg button{font-family:inherit;font-size:13px;font-weight:600;border:none;background:none;' +
      'color:var(--muted);padding:7px 14px;border-radius:8px;cursor:pointer;transition:all .18s cubic-bezier(.2,.7,.3,1)}' +
    '.seg button:hover{color:var(--ink)}' +
    '.seg button.on{background:var(--card);color:var(--ink);box-shadow:0 1px 3px rgba(16,24,40,.10)}' +
    '.field{display:flex;flex-direction:column;gap:7px}' +
    '.field>.lbl{font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:var(--faint);font-weight:600}' +
    '.ctlgrid{display:flex;gap:26px;flex-wrap:wrap;align-items:flex-start;margin-bottom:18px}' +
    '.readout{font-family:var(--disp);font-size:15px;font-weight:800;color:var(--ink);min-width:42px;display:inline-block}' +
    '.mcompare td:first-child{font-weight:600}' +
    'details.acc{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);' +
      'box-shadow:var(--shadow);margin-bottom:10px;overflow:hidden}' +
    'details.acc>summary{cursor:pointer;list-style:none;padding:15px 20px;font-family:var(--disp);' +
      'font-size:14.5px;font-weight:700;letter-spacing:-.01em;display:flex;align-items:center;gap:10px;' +
      'transition:background .15s}' +
    'details.acc>summary::-webkit-details-marker{display:none}' +
    'details.acc>summary:hover{background:#FAFCFF}' +
    'details.acc>summary::before{content:"+";font-family:var(--disp);font-size:17px;color:var(--accent);' +
      'width:18px;display:inline-block;transition:transform .2s}' +
    'details.acc[open]>summary::before{content:"\\2212"}' +
    'details.acc>summary .hint{margin-left:auto;font-family:var(--font,inherit);font-size:12.5px;' +
      'font-weight:400;color:var(--faint)}' +
    'details.acc .accbody{padding:0 20px 18px}' +
    '.verdict{font-size:15px;line-height:1.65;padding:16px 18px;border-radius:12px;' +
      'background:var(--accent-soft);border:1px solid #C9DAFB;margin-bottom:18px}';
  document.head.appendChild(s);
})();

var RET = null, W = {}, UNKNOWN = 0;
var UI = { start:null, rebal:'annual', lev:2, spread:1.5, asset:'mix', method:'margin', years:50 };

/* ---------- read the saved allocation ---------- */

function loadTargets() {
  var S = null;
  try { S = JSON.parse(localStorage.getItem('driftcalc-v1') || 'null'); } catch (e) {}
  if (!S) return { US:55.8, INTL:25.65, EM:8.55, USSCV:0, INTLSCV:0, BOND:10 };
  if (S.preset === 'Custom' && S.targets) return S.targets;
  var eq = S.equityPct != null ? S.equityPct : 90;
  var s  = S.intlPct != null ? S.intlPct : MARKET_INTL;
  var t  = S.tiltPct || 0;
  var mkt = eq * (100 - t) / 100, scv = eq * t / 100;
  return {
    BOND: 100 - eq,
    US: mkt * (100 - s) / 100,
    INTL: mkt * (s / 100) * 0.75,
    EM: mkt * (s / 100) * 0.25,
    USSCV: scv * (100 - s) / 100,
    INTLSCV: scv * (s / 100),
  };
}

function buildWeights() {
  var t = loadTargets(), known = 0;
  W = {}; UNKNOWN = 0;
  for (var c in t) {
    var v = +t[c];
    /* Targets are percentages. Anything not a real 0-100 number is corrupt
       storage, not a portfolio — drop it rather than let one absurd value
       swamp the mix. (A stored 1e308 once rendered as "small value 100%".) */
    if (!isFinite(v) || v <= 0) continue;
    if (v > 100) v = 100;
    if (PROXY[c]) { W[PROXY[c]] = (W[PROXY[c]] || 0) + v; known += v; }
    else UNKNOWN += v;
  }
  if (known > 0) for (var k in W) W[k] = W[k] / known;
}

/* ---------- engine ---------- */

function keysOf(w) { return Object.keys(w).filter(function (k) { return w[k] > 0; }); }

function firstUsable(w) {
  var ks = keysOf(w), M = RET.months, S = RET.series;
  for (var i = 0; i < M.length; i++) {
    var ok = true;
    for (var j = 0; j < ks.length; j++) if (S[ks[j]][i] == null) { ok = false; break; }
    if (ok && S.CASH[i] != null) return i;
  }
  return -1;
}

function run(w, from, to, _rebal, lev, spreadAnnual, method, VARS) {
  method = method || 'margin';
  var M = RET.months, S = RET.series, ks = keysOf(w);
  lev = lev || 1; spreadAnnual = spreadAnnual || 0;
  var val = 1, i, j;
  var curve = [], byYear = {}, peak = 1, maxDD = 0, wiped = null, worstMonth = 0;

  for (i = from; i <= to; i++) {
    var skip = false;
    for (j = 0; j < ks.length; j++) if (S[ks[j]][i] == null) { skip = true; break; }
    if (skip || S.CASH[i] == null) continue;

    var r = 0;
    for (j = 0; j < ks.length; j++) r += w[ks[j]] * S[ks[j]][i];
    var lr = lev === 1 && method === 'margin'
      ? r
      : leveredMonth(r, S.CASH[i], lev, spreadAnnual, method, VARS ? VARS[i] : 0);
    if (lr < worstMonth) worstMonth = lr;

    var prev = val;
    val = val * (1 + lr);
    /* A month worse than -1/L wipes the equity out. There is no coming back. */
    if (val <= 0) { wiped = M[i]; val = 0; curve.push({ m:M[i], v:0 }); break; }

    var yr = M[i].slice(0, 4);
    byYear[yr] = (byYear[yr] == null ? 1 : byYear[yr]) * (val / prev);
    if (val > peak) peak = val;
    var dd = val / peak - 1;
    if (dd < maxDD) maxDD = dd;
    curve.push({ m:M[i], v:val });
  }
  return { curve:curve, val:val, maxDD:maxDD, byYear:byYear, wiped:wiped, worstMonth:worstMonth, n:curve.length };
}

/* Unlevered path with honest rebalancing behaviour (drift between rebalances). */
function runPlain(w, from, to, rebal) {
  var M = RET.months, S = RET.series, ks = keysOf(w);
  var val = 1, hold = {}, i, j;
  for (j = 0; j < ks.length; j++) hold[ks[j]] = w[ks[j]];
  var curve = [], byYear = {}, peak = 1, maxDD = 0;
  for (i = from; i <= to; i++) {
    var skip = false;
    for (j = 0; j < ks.length; j++) if (S[ks[j]][i] == null) { skip = true; break; }
    if (skip) continue;
    var nv = 0;
    for (j = 0; j < ks.length; j++) { hold[ks[j]] *= (1 + S[ks[j]][i]); nv += hold[ks[j]]; }
    var prev = val; val = nv;
    var yr = M[i].slice(0, 4);
    byYear[yr] = (byYear[yr] == null ? 1 : byYear[yr]) * (val / prev);
    if (val > peak) peak = val;
    var dd = val / peak - 1; if (dd < maxDD) maxDD = dd;
    curve.push({ m:M[i], v:val });
    var yearEnd = M[i].slice(4) === '12';
    if (rebal === 'annual' ? yearEnd : rebal === 'monthly')
      for (j = 0; j < ks.length; j++) hold[ks[j]] = val * w[ks[j]];
  }
  return { curve:curve, val:val, maxDD:maxDD, byYear:byYear, n:curve.length };
}

function cagr(v, n) { return n > 0 && v > 0 ? Math.pow(v, 12 / n) - 1 : -1; }
var pct  = function (x) { return (x * 100).toFixed(1) + '%'; };
var money = function (x) { return '$' + Math.round(x).toLocaleString(); };

/* ---------- little chart helpers ---------- */

function sparkline(curve, w, h, color) {
  if (!curve.length) return '';
  var vals = curve.map(function (p) { return Math.max(p.v, 1e-6); });
  var lo = Math.log(Math.min.apply(null, vals)), hi = Math.log(Math.max.apply(null, vals));
  var pts = curve.map(function (p, i) {
    var y = h - (Math.log(Math.max(p.v, 1e-6)) - lo) / ((hi - lo) || 1) * (h - 8) - 4;
    return (i / (curve.length - 1) * w).toFixed(1) + ',' + y.toFixed(1);
  }).join(' ');
  return '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" style="width:100%;height:' + h + 'px;display:block">' +
    '<polyline points="' + pts + '" fill="none" stroke="' + (color || 'var(--accent)') + '" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>';
}

function donut() {
  var el = document.getElementById('donut'), leg = document.getElementById('legend');
  var ks = keysOf(W).sort(function (a, b) { return W[b] - W[a]; });
  if (!ks.length) return;
  var r = 74, sw = 26, C = 2 * Math.PI * r, off = 0, out = '';
  out += '<circle cx="100" cy="100" r="' + r + '" fill="none" stroke="var(--hairline)" stroke-width="' + sw + '"/>';
  ks.forEach(function (k, i) {
    var len = W[k] * C;
    out += '<circle cx="100" cy="100" r="' + r + '" fill="none" stroke="' + COLORS[k] + '" stroke-width="' + sw +
      '" stroke-dasharray="' + len.toFixed(2) + ' ' + (C - len).toFixed(2) + '" stroke-dashoffset="' + (-off).toFixed(2) +
      '" transform="rotate(-90 100 100)" style="opacity:0">' +
      '<animate attributeName="opacity" from="0" to="1" dur="0.35s" begin="' + (i * 0.09) + 's" fill="freeze"/></circle>';
    off += len;
  });
  var eq = ks.reduce(function (s, k) { return s + (k === 'BOND' ? 0 : W[k]); }, 0);
  out += '<text x="100" y="95" text-anchor="middle" font-family="Manrope,sans-serif" font-size="27" font-weight="800" fill="#0B1F3B">' + Math.round(eq * 100) + '%</text>';
  out += '<text x="100" y="115" text-anchor="middle" font-size="10.5" fill="#93A1B5" letter-spacing="0.06em">STOCKS</text>';
  el.innerHTML = out;
  leg.innerHTML = ks.map(function (k) {
    return '<div class="legrow"><span class="dot" style="background:' + COLORS[k] + '"></span>' + NAMES[k] + '<b>' + Math.round(W[k] * 100) + '%</b></div>';
  }).join('');
  document.getElementById('mixNote').innerHTML = UNKNOWN > 0.5
    ? 'Rescaled: ' + Math.round(UNKNOWN) + '% of your target sits in custom sleeves (gold, REITs and the like) with no long history here.'
    : 'Straight from the allocation you set on the calculator.';
}

/* ---------- tabs ---------- */

window.showTab = function (which) {
  ['hist', 'lev'].forEach(function (t) {
    var cap = t[0].toUpperCase() + t.slice(1);
    document.getElementById('pane' + cap).classList.toggle('on', t === which);
    document.getElementById('tab' + cap).classList.toggle('on', t === which);
  });
};
window.setUI = function (k, v) {
  UI[k] = (k === 'lev' || k === 'spread') ? parseFloat(v) : v;
  /* each product borrows at a different price, so move the slider with it */
  if (k === 'method') UI.spread = METHODS[v].spread;
  if (k === 'years') UI.years = parseInt(v, 10);
  if (k === 'lev' || k === 'spread' || k === 'asset' || k === 'method' || k === 'years') renderLev();
  else renderHist();
};

/* ---------- history tab ---------- */

function renderHist() {
  var el = document.getElementById('histBody');
  if (RET === 'missing') { el.innerHTML = '<div class="note">History data has not loaded. It rebuilds monthly from the Ken French library and FRED.</div>'; return; }
  if (!RET) return;
  var ks = keysOf(W);
  if (!ks.length) { el.innerHTML = '<div class="note">Set a target allocation on the calculator first.</div>'; return; }

  var M = RET.months, earliest = firstUsable(W);
  if (earliest < 0) { el.innerHTML = '<div class="note">No overlapping history for that mix.</div>'; return; }
  var from = UI.start ? Math.max(earliest, M.indexOf(UI.start)) : earliest;
  var to = M.length - 1;

  var mine = runPlain(W, from, to, UI.rebal);
  var allUS = runPlain({ US:1 }, from, to, UI.rebal);
  var sixty = runPlain({ US:0.6, BOND:0.4 }, from, to, UI.rebal);
  var drift = runPlain(W, from, to, 'none');

  var infl = 1, im = 0;
  for (var i = from; i <= to; i++) if (RET.series.CPI[i] != null) { infl *= 1 + RET.series.CPI[i]; im++; }
  var g = cagr(mine.val, mine.n);
  var real = im ? (1 + g) / Math.pow(infl, 12 / im) - 1 : null;

  var yrs = Object.keys(mine.byYear).filter(function (y) {
    var n = 0; for (var j = from; j <= to; j++) if (M[j].slice(0, 4) === y) n++;
    return n === 12;
  }).map(function (y) { return { y:y, r:mine.byYear[y] - 1 }; }).sort(function (a, b) { return a.r - b.r; });
  var worst = yrs[0], best = yrs[yrs.length - 1];
  var down = yrs.filter(function (x) { return x.r < 0; }).length;

  var opts = [M[earliest], '199001', '200001', '201001', '201501', '202001']
    .filter(function (v, i, a) { return a.indexOf(v) === i && M.indexOf(v) >= earliest; })
    .map(function (v) { return '<option value="' + v + '"' + (v === M[from] ? ' selected' : '') + '>' + v.slice(0, 4) + '</option>'; }).join('');

  var rows = [['All US stocks', allUS], ['60/40 US', sixty], ['Never rebalanced', drift]].map(function (p) {
    return '<tr><td class="dim">' + p[0] + '</td><td class="dim num">' + money(1e4 * p[1].val) + '</td><td class="dim num">' +
      pct(cagr(p[1].val, p[1].n)) + '</td><td class="dim num">' + pct(p[1].maxDD) + '</td></tr>';
  }).join('');

  el.innerHTML =
    '<div class="note" style="margin-bottom:18px">' +
      '<b>What this is.</b> Your target allocation, held every month since ' + M[from].slice(0, 4) + ' and rebalanced ' +
      (UI.rebal === 'annual' ? 'once a year' : UI.rebal === 'monthly' ? 'every month' : 'never') + '. ' +
      'These are real returns that already happened, not a projection. Nobody actually held this exact mix the whole time, ' +
      'and the next thirty years will not look like the last.' +
    '</div>' +
    '<div class="ctlbar">' +
      '<label class="ctl">From <select onchange="setUI(&#39;start&#39;,this.value)">' + opts + '</select></label>' +
      '<label class="ctl">Rebalance <select onchange="setUI(&#39;rebal&#39;,this.value)">' +
        '<option value="annual"' + (UI.rebal === 'annual' ? ' selected' : '') + '>Yearly</option>' +
        '<option value="monthly"' + (UI.rebal === 'monthly' ? ' selected' : '') + '>Monthly</option>' +
        '<option value="none"' + (UI.rebal === 'none' ? ' selected' : '') + '>Never</option>' +
      '</select></label>' +
      '<span style="color:var(--faint);font-size:13px">' + M[from].slice(0, 4) + '&ndash;' + M[to].slice(0, 4) + ', ' + Math.round(mine.n / 12) + ' years</span>' +
    '</div>' +
    '<div class="strip">' +
      '<div class="stat"><div class="k">$10,000 became</div><div class="v num">' + money(1e4 * mine.val) + '</div><div class="s">by ' + M[to].slice(0, 4) + '</div></div>' +
      '<div class="stat"><div class="k">A year</div><div class="v num">' + pct(g) + '</div><div class="s">compounded</div></div>' +
      '<div class="stat"><div class="k">After inflation</div><div class="v num">' + (real == null ? '&mdash;' : pct(real)) + '</div><div class="s">real buying power</div></div>' +
      '<div class="stat"><div class="k">Worst drop</div><div class="v num down">' + pct(mine.maxDD) + '</div><div class="s">peak to bottom</div></div>' +
    '</div>' +
    '<div class="card">' + sparkline(mine.curve, 640, 150) +
      '<div style="font-size:11.5px;color:var(--faint);margin-top:6px">$10,000 growing. Log scale, so a straight line means steady percentage growth.</div></div>' +
    '<div class="card"><table>' +
      '<tr><th>&nbsp;</th><th>Ended with</th><th>A year</th><th>Worst drop</th></tr>' +
      '<tr class="me"><td>Your mix</td><td class="num">' + money(1e4 * mine.val) + '</td><td class="num">' + pct(g) + '</td><td class="num">' + pct(mine.maxDD) + '</td></tr>' +
      rows + '</table>' +
      '<div class="note" style="margin-top:12px"><b>Reading this.</b> &ldquo;Never rebalanced&rdquo; is the same mix left alone, so you can see what rebalancing actually did. &ldquo;Worst drop&rdquo; is peak to bottom, the number that decides whether you would have stuck with it.</div>' +
    '</div>' +
    (worst ? '<div class="note">Worst year <b>' + worst.y + '</b>, ' + pct(worst.r) + '. Best <b>' + best.y + '</b>, +' + pct(best.r) +
      '. ' + yrs.length + ' full years, ' + down + ' negative.</div>' : '');
}

/* ---------- leverage tab ---------- */

function seg(key, options, current) {
  return '<div class="seg">' + options.map(function (o) {
    return '<button class="' + (o[0] === current ? 'on' : '') + '" onclick="setUI(&#39;' + key + '&#39;,&#39;' + o[0] + '&#39;)">' + o[1] + '</button>';
  }).join('') + '</div>';
}

function assetWeights() {
  if (UI.asset === 'us') return { US:1 };
  if (UI.asset === 'global') { var m = MARKET_INTL / 100; return { US:1 - m, INTL:m }; }
  return W;
}

function leverageCurve(w, from, to, spread, method, VARS) {
  var out = [];
  for (var L = 1; L <= 3.001; L += 0.1) {
    var r = run(w, from, to, 'monthly', L, spread, method, VARS);
    out.push({ L:Math.round(L * 10) / 10, g:r.wiped ? -1 : cagr(r.val, r.n), dd:r.maxDD, wiped:!!r.wiped });
  }
  return out;
}

function renderLev() {
  var el = document.getElementById('levBody');
  if (RET === 'missing') { el.innerHTML = '<div class="note">History data has not loaded yet.</div>'; return; }
  if (!RET) return;

  var w = assetWeights(), ks = keysOf(w);
  if (!ks.length) { el.innerHTML = '<div class="note">Set an allocation first.</div>'; return; }
  var M = RET.months, to = M.length - 1;
  var earliest = firstUsable(w);
  if (earliest < 0) { el.innerHTML = '<div class="note">No history for that mix.</div>'; return; }
  /* Clamps to whatever history actually exists, so asking for 100 years of a
     mix that only starts in 1990 quietly gives you 1990 rather than an error. */
  var from = Math.max(earliest, to - UI.years * 12 + 1);

  /* blended monthly return of this asset mix, for the daily-reset decay estimate */
  var blend = M.map(function (_, i) {
    var tot = 0;
    for (var q = 0; q < ks.length; q++) {
      var vv = RET.series[ks[q]][i];
      if (vv == null) return null;
      tot += w[ks[q]] * vv;
    }
    return tot;
  });
  var VARS = rollingVar(blend, 36);

  var base = run(w, from, to, 'monthly', 1, 0, 'margin', VARS);
  var lev  = run(w, from, to, 'monthly', UI.lev, UI.spread, UI.method, VARS);
  var curve = leverageCurve(w, from, to, UI.spread, UI.method, VARS);

  /* Kelly from the realised excess return and vol of this exact window */
  var xs = [], S = RET.series, i, j;
  for (i = from; i <= to; i++) {
    var skip = false;
    for (j = 0; j < ks.length; j++) if (S[ks[j]][i] == null) { skip = true; break; }
    if (skip || S.CASH[i] == null) continue;
    var rr0 = 0; for (j = 0; j < ks.length; j++) rr0 += w[ks[j]] * S[ks[j]][i];
    xs.push(rr0 - S.CASH[i]);
  }
  var mean = xs.reduce(function (a, b) { return a + b; }, 0) / xs.length;
  var vari = xs.reduce(function (a, b) { return a + (b - mean) * (b - mean); }, 0) / (xs.length - 1);
  var muA = mean * 12, sdA = Math.sqrt(vari * 12);
  var kelly = muA / (sdA * sdA);

  var bestPt = curve.reduce(function (a, b) { return b.g > a.g ? b : a; }, curve[0]);
  var here = curve.filter(function (p) { return Math.abs(p.L - UI.lev) < 0.051; })[0] || curve[0];

  /* topPad leaves room for the peak label. At 14 it rendered off the top. */
  var cw = 640, ch = 210, pad = 34, topPad = 44;
  var gs = curve.map(function (p) { return p.g; }).filter(function (v) { return v > -1; });
  var gmin = Math.min.apply(null, gs), gmax = Math.max.apply(null, gs);
  var span = (gmax - gmin) || 0.01;
  var X = function (L) { return pad + (L - 1) / 2 * (cw - pad - 12); };
  var Y = function (g) { return ch - pad - (g - gmin) / span * (ch - pad - topPad); };
  var path = curve.filter(function (p) { return p.g > -1; })
    .map(function (p, k) { return (k ? 'L' : 'M') + X(p.L).toFixed(1) + ' ' + Y(p.g).toFixed(1); }).join(' ');
  var chart = '<svg viewBox="0 0 ' + cw + ' ' + ch + '" style="width:100%;height:210px;display:block">' +
    '<line x1="' + pad + '" y1="' + (ch - pad) + '" x2="' + (cw - 12) + '" y2="' + (ch - pad) + '" stroke="var(--border)"/>' +
    [1, 1.5, 2, 2.5, 3].map(function (L) {
      return '<text x="' + X(L) + '" y="' + (ch - pad + 15) + '" font-size="10.5" fill="#93A1B5" text-anchor="middle">' + L + 'x</text>';
    }).join('') +
    '<path d="' + path + '" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round"/>' +
    '<circle cx="' + X(bestPt.L) + '" cy="' + Y(bestPt.g) + '" r="5" fill="var(--green)"/>' +
    '<text x="' + X(bestPt.L) + '" y="' + (Y(bestPt.g) - 13) + '" font-size="11" font-weight="700" fill="#17A374" text-anchor="middle">best: ' + bestPt.L + 'x</text>' +
    (here.g > -1 ? '<circle cx="' + X(here.L) + '" cy="' + Y(here.g) + '" r="5" fill="var(--ink)"/>' +
      '<text x="' + X(here.L) + '" y="' + (Y(here.g) + 21) + '" font-size="10.5" font-weight="600" fill="#0B1F3B" text-anchor="middle">you: ' + here.L + 'x</text>' : '') +
    '</svg>';

  /* say out loud what the curve means at the current setting */
  var atPeak = Math.abs(bestPt.L - UI.lev) < 0.051;
  var reading;
  if (bestPt.L >= 3) {
    reading = '<b>The curve never turns down inside 3x here.</b> At this borrowing cost more leverage kept paying across the whole range, which usually means this stretch of history was unusually kind. Push the interest slider up and it will turn over.';
  } else if (atPeak) {
    reading = '<b>You are sitting on the peak.</b> ' + UI.lev.toFixed(1) + 'x earned ' + pct(here.g) + ' a year against ' + pct(curve[0].g) + ' with no leverage. Going further would have earned less, not more.';
  } else if (UI.lev < bestPt.L) {
    reading = '<b>The peak was ' + bestPt.L + 'x.</b> You are at ' + UI.lev.toFixed(1) + 'x earning ' + pct(here.g) + ' a year. The top of the hump earned ' + pct(bestPt.g) + '. Worth knowing, not worth chasing, because the drawdown up there is brutal.';
  } else {
    reading = '<b>You are past the peak.</b> The best was ' + bestPt.L + 'x at ' + pct(bestPt.g) + ' a year. At ' + UI.lev.toFixed(1) + 'x you earned ' + pct(here.g) + ', so more risk bought less money. This is the part people do not expect.';
  }

  var wiped = lev.wiped;
  var breakeven = (100 / UI.lev).toFixed(0);
  var baseG = cagr(base.val, base.n), levG = wiped ? -1 : cagr(lev.val, lev.n);
  var M0 = M[from].slice(0, 4), M1 = M[to].slice(0, 4);
  var actualYears = Math.round(base.n / 12);

  var compare = Object.keys(METHODS).map(function (k) {
    var r2 = run(w, from, to, 'monthly', UI.lev, METHODS[k].spread, k, VARS);
    return { k:k, m:METHODS[k], g:r2.wiped ? null : cagr(r2.val, r2.n), dd:r2.maxDD, wiped:r2.wiped };
  });

  /* one sentence a stranger can act on, before any of the detail */
  var verdict;
  if (wiped) {
    verdict = '<b>At ' + UI.lev.toFixed(1) + 'x this blew up.</b> Borrowing that much did not just underperform, it went to zero in ' + wiped.slice(0,4) + '. Nothing after that mattered.';
  } else {
    var delta = levG - baseG;
    verdict = '<b>Over the last ' + actualYears + ' years, ' + UI.lev.toFixed(1) + 'x with ' +
      METHODS[UI.method].label.toLowerCase() + ' earned ' + pct(Math.abs(delta)) + ' a year ' + (delta >= 0 ? 'more' : 'less') +
      ' than not borrowing at all</b> &mdash; ' + pct(levG) + ' versus ' + pct(baseG) + '. ' +
      'The price was a ' + pct(lev.maxDD) + ' drop at the worst point, against ' + pct(base.maxDD) + ' unlevered. ' +
      (delta >= 0
        ? 'Whether that trade is worth it is the only real question here.'
        : 'You took much more risk and ended up with less. That is the trap.');
  }

  el.innerHTML =
    '<div class="note" style="margin-bottom:18px">' +
      '<b>What leverage is.</b> Borrowing money so you own more than you paid for. ' +
      'At 2x, every $1 of yours holds $2 of stocks and owes $1. Gains double. So do losses. ' +
      'Pick how you would borrow, how much, and see what it would have done.' +
    '</div>' +
    '<div class="ctlgrid">' +
      '<div class="field"><span class="lbl">Invested in</span>' +
        seg('asset', [['mix','Your mix'],['us','US stocks'],['global','Global stocks']], UI.asset) + '</div>' +
      '<div class="field"><span class="lbl">How you borrow</span>' +
        seg('method', [['margin','Margin'],['letf','Leveraged ETF'],['leaps','LEAPS']], UI.method) + '</div>' +
    '</div>' +
    '<div class="note" style="margin-bottom:18px"><b>' + METHODS[UI.method].label + '.</b> ' + METHODS[UI.method].blurb +
      '<br><span style="color:var(--faint)"><b>What it costs you:</b> ' + METHODS[UI.method].range +
      ' over T-bills. ' + METHODS[UI.method].note + '</span></div>' +
    '<div class="ctlgrid">' +
      '<div class="field"><span class="lbl">How much leverage</span>' +
        '<div style="display:flex;align-items:center;gap:12px">' +
          '<input type="range" min="1" max="3" step="0.1" value="' + UI.lev + '" oninput="setUI(&#39;lev&#39;,this.value)" style="width:190px">' +
          '<span class="readout num">' + UI.lev.toFixed(1) + 'x</span></div></div>' +
      '<div class="field"><span class="lbl">Interest above T-bills</span>' +
        '<div style="display:flex;align-items:center;gap:12px">' +
          '<input type="range" min="0" max="5" step="0.05" value="' + UI.spread + '" oninput="setUI(&#39;spread&#39;,this.value)" style="width:150px">' +
          '<span class="readout num">' + UI.spread.toFixed(2) + '%</span></div>' +
        '<span style="font-size:12px;color:var(--faint);line-height:1.5;max-width:250px;display:block">' +
          'Typical for ' + (UI.method === 'margin' ? 'margin' : METHODS[UI.method].label.toLowerCase() + 's') +
          ': <b style="color:var(--muted)">' + METHODS[UI.method].range + '</b>' +
          (Math.abs(UI.spread - METHODS[UI.method].spread) > 0.001
            ? ' &middot; <a href="#" onclick="setUI(&#39;spread&#39;,' + METHODS[UI.method].spread + ');return false" style="color:var(--accent)">back to ' + METHODS[UI.method].spread.toFixed(2) + '%</a>'
            : '') +
        '</span></div>' +
      '<div class="field"><span class="lbl">How far back</span>' +
        seg('years', [['100','100'],['50','50'],['30','30'],['15','15']], String(UI.years)) +
        '<span style="font-size:12px;color:var(--faint)">' + M0 + '&ndash;' + M1 +
          (actualYears < UI.years ? ' &middot; only ' + actualYears + ' available' : ' &middot; ' + actualYears + ' years') +
        '</span></div>' +
    '</div>' +
    '<div class="strip">' +
      '<div class="stat"><div class="k">No leverage</div><div class="v num">' + pct(baseG) + '</div><div class="s">a year</div></div>' +
      '<div class="stat"><div class="k">At ' + UI.lev.toFixed(1) + 'x</div><div class="v num ' + (wiped ? 'down' : (levG > baseG ? 'up' : 'down')) + '">' + (wiped ? 'wiped out' : pct(levG)) + '</div><div class="s">a year, all costs in</div></div>' +
      '<div class="stat"><div class="k">Worst drop</div><div class="v num down">' + (wiped ? '-100%' : pct(lev.maxDD)) + '</div><div class="s">peak to bottom</div></div>' +
      '<div class="stat"><div class="k">Worst month</div><div class="v num down">' + pct(lev.worstMonth) + '</div><div class="s">-' + breakeven + '% ends it</div></div>' +
    '</div>' +
    '<div class="verdict">' + verdict + '</div>' +
    (wiped ? '<div class="danger" style="margin-bottom:16px"><b>Gone in ' + wiped.slice(0, 4) + '.</b> At ' + UI.lev.toFixed(1) + 'x, one month down more than ' + breakeven + '% takes everything. There is no recovering from zero, and being right afterwards does not help.</div>' : '') +
    '<div class="card">' +
      '<div class="big-title">How much leverage was best?</div>' +
      '<div class="note" style="margin-bottom:14px">Each point is a different amount of borrowing. Left edge is none, right edge is 3x. Height is what you would have earned per year. <b>The hump is the whole point:</b> borrowing helps until it does not, then it actively hurts.</div>' +
      chart +
      '<div class="note" style="margin-top:14px">' + reading + '</div>' +
    '</div>' +
    '<div class="card"><div class="big-title">The same ' + UI.lev.toFixed(1) + 'x, three different ways</div>' +
      '<table class="mcompare">' +
        '<tr><th style="text-align:left">Method</th><th>Interest</th><th>A year</th><th>Worst drop</th></tr>' +
        compare.map(function (c) {
          var me = c.k === UI.method;
          return '<tr' + (me ? ' class="me"' : '') + '><td' + (me ? '' : ' class="dim"') + '>' + c.m.label + (me ? ' &larr;' : '') + '</td>' +
            '<td class="num' + (me ? '' : ' dim') + '">+' + c.m.spread.toFixed(2) + '%</td>' +
            '<td class="num' + (me ? '' : ' dim') + '">' + (c.wiped ? 'wiped out' : pct(c.g)) + '</td>' +
            '<td class="num' + (me ? '' : ' dim') + '">' + (c.wiped ? '-100%' : pct(c.dd)) + '</td></tr>';
        }).join('') +
      '</table>' +
      '<div class="note" style="margin-top:12px">Each row uses that product&rsquo;s own typical borrowing cost, so this compares the products rather than the slider. Leveraged ETFs also pay a ' + LETF_ER.toFixed(2) + '% expense ratio and lose ground to resetting daily. LEAPS give up about ' + (DIV_YIELD * 100).toFixed(1) + '% a year in dividends, because you hold options rather than shares.</div>' +
    '</div>' +
    '<details class="acc"><summary>What is &ldquo;interest above T-bills&rdquo;?<span class="hint">and which fund you would actually buy</span></summary><div class="accbody">' +
      '<div class="note" style="margin-bottom:14px">To use leverage you borrow money, and borrowing is not free. That slider is the rate you pay.<br><br><b>T-bills</b> are short-term US government IOUs, the cheapest borrowing rate that exists, because the government is the safest borrower there is. Nobody lends to you at that rate. The slider is how many percentage points <i>above</i> it you pay. At 1.50%, if T-bills pay 4%, you are borrowing at about 5.5%.</div>' +
      '<table style="margin-bottom:14px">' +
        '<tr><th style="text-align:left">How you borrow</th><th>Over T-bills</th><th style="text-align:left">And what else it costs</th></tr>' +
        '<tr><td><b>Futures</b><br><span class="dim" style="font-size:12.5px">/ES, or /MES at a fifth the size</span></td>' +
          '<td class="num"><b>0.1&ndash;0.5%</b></td>' +
          '<td style="text-align:left" class="dim">The cheapest money a retail account can get, because you are borrowing from the market rather than a broker. Needs futures approval, and the contract rolls four times a year. Not a beginner move.</td></tr>' +
        '<tr><td><b>Box spread</b><br><span class="dim" style="font-size:12.5px">SPX options</span></td>' +
          '<td class="num"><b>0.1&ndash;0.4%</b></td>' +
          '<td style="text-align:left" class="dim">A fixed-term loan built out of four options. Cheap and clean if you get the trade right, and genuinely dangerous if you do not. Needs the highest options tier.</td></tr>' +
        '<tr><td><b>Portfolio margin</b><br><span class="dim" style="font-size:12.5px">usually Interactive Brokers</span></td>' +
          '<td class="num"><b>0.5&ndash;1.5%</b></td>' +
          '<td style="text-align:left" class="dim">Nothing on top, and you keep the dividends. Needs a decent balance to qualify, and the rate falls as the balance grows.</td></tr>' +
        '<tr><td><b>Leveraged ETF</b><br><span class="dim" style="font-size:12.5px">SSO 2x, UPRO 3x, TQQQ 3x Nasdaq</span></td>' +
          '<td class="num"><b>0.4&ndash;0.8%</b></td>' +
          '<td style="text-align:left" class="dim"><b>Plus a 0.90% expense ratio</b> on the whole position, not just the borrowed part &mdash; at 2x that is roughly another 1.8% of your own money each year. <b>Plus daily-reset decay</b>, which costs you more the choppier the market is. The headline financing looks cheap; the all-in cost is not.</td></tr>' +
        '<tr><td><b>LEAPS</b><br><span class="dim" style="font-size:12.5px">deep in-the-money calls, 1&ndash;2 years out</span></td>' +
          '<td class="num"><b>0.5&ndash;1.5%</b></td>' +
          '<td style="text-align:left" class="dim">The rate is not quoted anywhere &mdash; it is baked into what the call costs. Add a few tenths of a percent in bid-ask each time you roll. <b>Plus you give up the dividend</b>, about 1.8% a year on the entire position, because you own options and not shares. That is usually the largest line here.</td></tr>' +
        '<tr><td><b>Ordinary margin</b><br><span class="dim" style="font-size:12.5px">Schwab, Fidelity, E*TRADE, Robinhood</span></td>' +
          '<td class="num"><b>2&ndash;5%</b></td>' +
          '<td style="text-align:left" class="dim">What most people can actually get, and where the math stops working. Drag the slider up there and watch the peak collapse toward 1x.</td></tr>' +
      '</table>' +
      '<div class="note" style="margin-bottom:10px"><b>Financing is not the whole bill.</b> The slider only moves the interest. The fund fee, the daily reset and the forgone dividend are charged separately and are already in every number on this page &mdash; which is why a leveraged ETF can show the cheapest interest and still finish behind plain margin.</div>' +
      '<div class="warn"><b>Look up your own number.</b> Every broker publishes its margin rate and it moves with the Fed. Those ranges are ballparks, not quotes. If you cannot find yours, assume it is worse than you hoped.</div>' +
    '</div></details>' +
    '<details class="acc"><summary>Why is there a peak at all?<span class="hint">the math behind the hump</span></summary><div class="accbody">' +
      '<table style="margin-bottom:14px">' +
        '<tr><th style="text-align:left">&nbsp;</th><th>Value</th></tr>' +
        '<tr><td>How much this beat T-bills, per year</td><td class="num">' + pct(muA) + '</td></tr>' +
        '<tr><td>How much it bounced around, per year</td><td class="num">' + pct(sdA) + '</td></tr>' +
        '<tr><td>Kelly leverage, the growth-maximising amount</td><td class="num"><b' + (kelly > 3 ? ' class="down"' : '') + '>' + kelly.toFixed(2) + 'x</b></td></tr>' +
        '<tr><td>Half Kelly, what most academics suggest</td><td class="num">' + (kelly / 2).toFixed(2) + 'x</td></tr>' +
        '<tr><td>What worked best in this window</td><td class="num">' + (bestPt.L >= 3 ? '3x or more' : bestPt.L + 'x') + '</td></tr>' +
      '</table>' +
      '<div class="note">Leverage multiplies your return but squares your drag. Double your exposure and you double the gain, but you quadruple the penalty volatility takes out of compounding. Past a point the penalty wins. That turning point is called Kelly, after the 1956 paper.</div>' +
      (kelly > 3 ? '<div class="danger" style="margin-top:12px"><b>Ignore that Kelly number.</b> It divides by volatility, so anything calm returns a huge answer &mdash; a bond-heavy mix can print 8x or 10x. Low measured volatility is not low risk, it usually means the bad day has not happened yet in this window. Levering quiet assets is how Long-Term Capital Management died in 1998.</div>' : '') +
    '</div></details>' +
    '<details class="acc"><summary>Why none of this is a recommendation<span class="hint">four reasons to be careful</span></summary><div class="accbody">' +
      '<div class="warn" style="margin-bottom:10px"><b>It was computed with hindsight.</b> Kelly needs the true expected return and volatility. Nobody has those. Feed it a return estimate two points too high and it hands you far too much leverage, confidently.</div>' +
      '<div class="warn" style="margin-bottom:10px"><b>Full Kelly is violent.</b> It maximises long-run growth and says nothing about the ride. Halving it costs about a quarter of the growth and removes most of the pain, which is why half Kelly is the usual advice.</div>' +
      '<div class="warn" style="margin-bottom:10px"><b>Borrowing cost decides everything.</b> Futures sit near T-bills; ordinary margin runs 3 to 5 points above, and at that price leverage stops working almost immediately.</div>' +
      '<div class="warn" style="margin-bottom:10px"><b>Surviving the path is the whole problem.</b> This rebalances monthly and cannot be margin-called mid-month. Reality can. A 2x fund through 1929 to 1932 did not come back.</div>' +
      '<div class="danger"><b>The leveraged ETF numbers are still a best case.</b> Real funds reset every single day. This estimates that decay from monthly data, which catches most of it but not all. In a genuinely violent month the real fund does worse than shown.</div>' +
    '</div></details>' +
    '<details class="acc"><summary>Where the idea comes from<span class="hint">Kelly, Merton, Lifecycle Investing</span></summary><div class="accbody">' +
      '<div class="note"><b>Kelly (1956), later Thorp.</b> Maximise the log of wealth and you maximise long-run growth. The answer is excess return divided by variance.<br><br>' +
      '<b>Merton (1969).</b> The same formula with risk aversion built in, so anyone more cautious than a pure growth maximiser lands lower.<br><br>' +
      '<b>Ayres and Nalebuff, Lifecycle Investing (2010).</b> The argument for a young investor using leverage is not extra return, it is spreading market exposure across more years instead of stacking it into your forties. They cap it at 2:1 and wind it down as the portfolio grows. The standard criticism is exactly the path problem above.</div>' +
    '</div></details>';
}

/* ---------- boot ---------- */

buildWeights();
donut();

fetch('returns.json', { cache:'no-store' })
  .then(function (r) { if (!r.ok) throw 0; return r.json(); })
  .then(function (d) { if (!d || !d.months || !d.series) throw 0; RET = d; })
  .catch(function () { RET = 'missing'; })
  .then(function () { renderHist(); renderLev(); });

})();


