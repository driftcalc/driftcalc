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

var RET = null, W = {}, UNKNOWN = 0;
var UI = { start:null, rebal:'annual', lev:2, spread:1.0, asset:'mix' };

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
    var v = +t[c] || 0;
    if (v <= 0) continue;
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

/* Constant leverage, reset monthly, borrowing the levered part at cash + spread.
   This is the same mechanic as a levered fund, just at monthly rather than daily
   resolution. Because leverage is reset every month, the sleeve weights are
   always exactly w, so the blended asset return is a plain weighted sum. */
function run(w, from, to, _rebal, lev, spreadAnnual) {
  var M = RET.months, S = RET.series, ks = keysOf(w);
  lev = lev || 1; spreadAnnual = spreadAnnual || 0;
  var monthlySpread = spreadAnnual / 100 / 12;
  var val = 1, i, j;
  var curve = [], byYear = {}, peak = 1, maxDD = 0, wiped = null, worstMonth = 0;

  for (i = from; i <= to; i++) {
    var skip = false;
    for (j = 0; j < ks.length; j++) if (S[ks[j]][i] == null) { skip = true; break; }
    if (skip || S.CASH[i] == null) continue;

    var r = 0;
    for (j = 0; j < ks.length; j++) r += w[ks[j]] * S[ks[j]][i];
    var lr = lev * r - (lev - 1) * (S.CASH[i] + monthlySpread);
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
    ? 'Rescaled: ' + Math.round(UNKNOWN) + '% of your target sits in custom sleeves with no long history.'
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
  if (k === 'lev' || k === 'spread' || k === 'asset') renderLev(); else renderHist();
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
      '<div class="stat"><div class="k">$10,000 became</div><div class="v num">' + money(1e4 * mine.val) + '</div></div>' +
      '<div class="stat"><div class="k">A year</div><div class="v num">' + pct(g) + '</div></div>' +
      '<div class="stat"><div class="k">After inflation</div><div class="v num">' + (real == null ? '&mdash;' : pct(real)) + '</div></div>' +
      '<div class="stat"><div class="k">Worst drop</div><div class="v num down">' + pct(mine.maxDD) + '</div></div>' +
    '</div>' +
    '<div class="card">' + sparkline(mine.curve, 640, 150) +
      '<div style="font-size:11.5px;color:var(--faint);margin-top:6px">$10,000 growing, log scale</div></div>' +
    '<div class="card"><table>' +
      '<tr><th>&nbsp;</th><th>Ended with</th><th>A year</th><th>Worst drop</th></tr>' +
      '<tr class="me"><td>Your mix</td><td class="num">' + money(1e4 * mine.val) + '</td><td class="num">' + pct(g) + '</td><td class="num">' + pct(mine.maxDD) + '</td></tr>' +
      rows + '</table></div>' +
    (worst ? '<div class="note">Worst year <b>' + worst.y + '</b>, ' + pct(worst.r) + '. Best <b>' + best.y + '</b>, +' + pct(best.r) +
      '. ' + yrs.length + ' full years, ' + down + ' negative.</div>' : '');
}

/* ---------- leverage tab ---------- */

function assetWeights() {
  if (UI.asset === 'us') return { US:1 };
  if (UI.asset === 'global') { var m = MARKET_INTL / 100; return { US:1 - m, INTL:m }; }
  return W;
}

function leverageCurve(w, from, to, spread) {
  var out = [];
  for (var L = 1; L <= 3.001; L += 0.1) {
    var r = run(w, from, to, 'monthly', L, spread);
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
  var M = RET.months, from = firstUsable(w), to = M.length - 1;
  if (from < 0) { el.innerHTML = '<div class="note">No history for that mix.</div>'; return; }

  var base = run(w, from, to, 'monthly', 1, 0);
  var lev  = run(w, from, to, 'monthly', UI.lev, UI.spread);
  var curve = leverageCurve(w, from, to, UI.spread);

  /* Kelly from the realised excess return and vol of this exact series */
  var xs = [], S = RET.series, i, j;
  for (i = from; i <= to; i++) {
    var skip = false;
    for (j = 0; j < ks.length; j++) if (S[ks[j]][i] == null) { skip = true; break; }
    if (skip || S.CASH[i] == null) continue;
    var r = 0; for (j = 0; j < ks.length; j++) r += w[ks[j]] * S[ks[j]][i];
    xs.push(r - S.CASH[i]);
  }
  var mean = xs.reduce(function (a, b) { return a + b; }, 0) / xs.length;
  var vari = xs.reduce(function (a, b) { return a + (b - mean) * (b - mean); }, 0) / (xs.length - 1);
  var muA = mean * 12, sdA = Math.sqrt(vari * 12);
  var kelly = muA / (sdA * sdA);

  var bestPt = curve.reduce(function (a, b) { return b.g > a.g ? b : a; }, curve[0]);
  var here = curve.filter(function (p) { return Math.abs(p.L - UI.lev) < 0.051; })[0] || curve[0];

  var cw = 640, ch = 190, pad = 34;
  var gs = curve.map(function (p) { return p.g; }).filter(function (v) { return v > -1; });
  var gmin = Math.min.apply(null, gs), gmax = Math.max.apply(null, gs);
  var span = (gmax - gmin) || 0.01;
  var X = function (L) { return pad + (L - 1) / 2 * (cw - pad - 12); };
  var Y = function (g) { return ch - pad - (g - gmin) / span * (ch - pad - 14); };
  var path = curve.filter(function (p) { return p.g > -1; })
    .map(function (p, k) { return (k ? 'L' : 'M') + X(p.L).toFixed(1) + ' ' + Y(p.g).toFixed(1); }).join(' ');
  var chart = '<svg viewBox="0 0 ' + cw + ' ' + ch + '" style="width:100%;height:190px;display:block">' +
    '<line x1="' + pad + '" y1="' + (ch - pad) + '" x2="' + (cw - 12) + '" y2="' + (ch - pad) + '" stroke="var(--border)"/>' +
    [1, 1.5, 2, 2.5, 3].map(function (L) {
      return '<text x="' + X(L) + '" y="' + (ch - pad + 15) + '" font-size="10.5" fill="#93A1B5" text-anchor="middle">' + L + 'x</text>';
    }).join('') +
    '<path d="' + path + '" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round"/>' +
    '<circle cx="' + X(bestPt.L) + '" cy="' + Y(bestPt.g) + '" r="5" fill="var(--green)"/>' +
    '<text x="' + X(bestPt.L) + '" y="' + (Y(bestPt.g) - 11) + '" font-size="11" font-weight="600" fill="#17A374" text-anchor="middle">peak ' + bestPt.L + 'x</text>' +
    (here.g > -1 ? '<circle cx="' + X(here.L) + '" cy="' + Y(here.g) + '" r="4.5" fill="var(--ink)"/>' : '') +
    '</svg><div style="font-size:11.5px;color:var(--faint)">Return per year at each leverage level, after borrowing costs. It stops paying past the peak.</div>';

  var wiped = lev.wiped;
  el.innerHTML =
    '<div class="ctlbar">' +
      '<label class="ctl">On <select onchange="setUI(&#39;asset&#39;,this.value)">' +
        '<option value="mix"' + (UI.asset === 'mix' ? ' selected' : '') + '>Your mix</option>' +
        '<option value="us"' + (UI.asset === 'us' ? ' selected' : '') + '>US stocks</option>' +
        '<option value="global"' + (UI.asset === 'global' ? ' selected' : '') + '>Global stocks</option>' +
      '</select></label>' +
      '<label class="ctl">Leverage <input type="range" min="1" max="3" step="0.1" value="' + UI.lev + '" oninput="setUI(&#39;lev&#39;,this.value)" style="width:150px"><b class="num" style="color:var(--ink);min-width:34px">' + UI.lev.toFixed(1) + 'x</b></label>' +
      '<label class="ctl">Borrow cost over T-bills <input type="range" min="0" max="4" step="0.25" value="' + UI.spread + '" oninput="setUI(&#39;spread&#39;,this.value)" style="width:120px"><b class="num" style="color:var(--ink);min-width:38px">' + UI.spread.toFixed(2) + '%</b></label>' +
      '<span style="color:var(--faint);font-size:13px">' + M[from].slice(0,4) + '&ndash;' + M[to].slice(0,4) + ', ' + Math.round(base.n/12) + ' years</span>' +
    '</div>' +
    '<div class="strip">' +
      '<div class="stat"><div class="k">Unlevered</div><div class="v num">' + pct(cagr(base.val, base.n)) + '</div></div>' +
      '<div class="stat"><div class="k">At ' + UI.lev.toFixed(1) + 'x</div><div class="v num ' + (wiped ? 'down' : (cagr(lev.val, lev.n) > cagr(base.val, base.n) ? 'up' : 'down')) + '">' + (wiped ? 'wiped out' : pct(cagr(lev.val, lev.n))) + '</div></div>' +
      '<div class="stat"><div class="k">Worst drop</div><div class="v num down">' + (wiped ? '-100%' : pct(lev.maxDD)) + '</div></div>' +
      '<div class="stat"><div class="k">Worst month</div><div class="v num down">' + pct(lev.worstMonth) + '</div></div>' +
    '</div>' +
    (wiped ? '<div class="danger" style="margin-bottom:16px"><b>Gone in ' + wiped.slice(0, 4) + '.</b> At ' + UI.lev.toFixed(1) + 'x a single month down more than ' + (100 / UI.lev).toFixed(0) + '% takes everything. There is no recovering from zero, and no amount of being right afterwards fixes it.</div>' : '') +
    '<div class="card">' + chart + '</div>' +
    '<div class="card"><div class="big-title">What the math says</div>' +
      '<table>' +
        '<tr><th>&nbsp;</th><th>Value</th></tr>' +
        '<tr><td>Excess return over T-bills, per year</td><td class="num">' + pct(muA) + '</td></tr>' +
        '<tr><td>Volatility, per year</td><td class="num">' + pct(sdA) + '</td></tr>' +
        '<tr><td>Kelly leverage, excess &divide; variance</td><td class="num"><b' + (kelly > 3 ? ' class="down"' : '') + '>' + kelly.toFixed(2) + 'x</b></td></tr>' +
        '<tr><td>Half Kelly, what most academics actually suggest</td><td class="num">' + (kelly / 2).toFixed(2) + 'x</td></tr>' +
        '<tr><td>Best leverage in this exact history</td><td class="num">' + (bestPt.L >= 3 ? '3x or more' : bestPt.L + 'x') + '</td></tr>' +
      '</table>' +
      '<div class="note" style="margin-top:14px">Leverage multiplies your return but squares your drag. Compounded return runs roughly <code>L(&mu;&minus;r) + r &minus; L&sup2;&sigma;&sup2;/2</code>, so the gain is linear and the penalty is quadratic. Past a point, more leverage means less money. That peak is Kelly.</div>' +
      (kelly > 3 ? '<div class="danger" style="margin-top:12px"><b>Ignore that number.</b> Kelly divides by variance, so anything calm enough returns a huge answer &mdash; a bond-heavy mix can print 8x or 10x. Low measured volatility is not the same as low risk, it usually just means the bad day has not happened yet in this window. Levering quiet assets is how Long-Term Capital Management died in 1998 and how risk parity funds got hurt in 2020 and 2022.</div>' : '') +
    '</div>' +
    '<div class="card"><div class="big-title">Why that is not a recommendation</div>' +
      '<div class="warn" style="margin-bottom:12px"><b>It was computed with hindsight.</b> Kelly needs the true expected return and volatility. Nobody has those. Feed it a return estimate two points too high and it hands you far too much leverage, confidently.</div>' +
      '<div class="warn" style="margin-bottom:12px"><b>Full Kelly is violent.</b> It maximises long-run growth and says nothing about the ride. Halving it costs about a quarter of the growth and removes most of the pain, which is why half Kelly is the usual advice.</div>' +
      '<div class="warn" style="margin-bottom:12px"><b>Borrowing cost decides everything.</b> Move the slider. Futures and box spreads sit near T-bills; retail margin runs 3 to 5 points above, and at that price leverage stops working almost immediately.</div>' +
      '<div class="warn"><b>Surviving the path is the whole problem.</b> This model rebalances monthly and cannot be margin-called mid-month. Reality can. A daily-reset 2x fund through 1929 to 1932 did not come back.</div>' +
    '</div>' +
    '<div class="card"><div class="big-title">Where the idea comes from</div>' +
      '<div class="note">' +
      '<b>Kelly (1956), later Thorp.</b> Maximise the log of wealth and you maximise long-run growth. The answer is excess return divided by variance.<br><br>' +
      '<b>Merton (1969).</b> Same formula with risk aversion underneath: <code>(&mu;&minus;r)/(&gamma;&sigma;&sup2;)</code>. Log utility is &gamma;=1, which is Kelly. Anyone more cautious lands lower.<br><br>' +
      '<b>Ayres and Nalebuff, Lifecycle Investing (2010).</b> The argument for a young investor using leverage is not extra return, it is spreading market exposure across more years instead of stacking it into your forties. They cap it at 2:1 and wind it down as the portfolio grows. The standard criticism is exactly the path problem above.' +
      '</div>' +
    '</div>';
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

