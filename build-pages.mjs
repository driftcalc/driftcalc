#!/usr/bin/env node
/*
 * build-pages.mjs — generates the comparison pages under compare/ from returns.json.
 *
 * Run it:   node build-pages.mjs
 * Output:   compare/<slug>.html, compare.html, and the block between the
 *           generated markers in sitemap.xml
 *
 * Node 18+ only. No npm install, no dependencies — stdlib only, same as
 * build-returns.mjs. Run it after that one, because it reads what it writes.
 *
 * WHY THESE ARE STATIC
 *   The numbers are computed here and baked into the HTML. The pages carry no
 *   JavaScript of their own and never fetch returns.json. A search engine and a
 *   reader both get the answer in the markup, and the page cannot show one
 *   number to a crawler and a different one to a person.
 *
 * WHY THERE ARE EIGHT OF THEM AND NOT HUNDREDS
 *   Every pair here has a different answer, and several of them cut against the
 *   obvious story. Generating every combination of every mix would produce a
 *   few of these and a long tail of pages saying nothing, which is how a site
 *   gets classed as thin content. Add a pair when it has something to say.
 */

import fs from 'node:fs';

/* ---------- the mixes ---------- */
const MIX = {
  us:         { name: 'US total market',    short: 'US total market',
                blurb: 'One fund, every US listed company, weighted by size.',
                w: { US: 1 } },
  sixtyforty: { name: 'a 60/40 portfolio',  short: '60/40',
                blurb: '60% US stocks, 40% intermediate Treasuries, rebalanced once a year.',
                w: { US: 0.6, BOND: 0.4 } },
  ninetyten:  { name: 'a 90/10 portfolio',  short: '90/10',
                blurb: '90% US stocks, 10% intermediate Treasuries, rebalanced once a year.',
                w: { US: 0.9, BOND: 0.1 } },
  global:     { name: 'global stocks',      short: 'global stocks',
                blurb: 'US and developed international at roughly their market weights, 62/38.',
                w: { US: 0.62, INTL: 0.38 } },
  threefund:  { name: 'the three-fund portfolio', short: 'three-fund',
                blurb: 'US stocks, international stocks and bonds, 37/23/40, rebalanced once a year.',
                w: { US: 0.372, INTL: 0.228, BOND: 0.40 } },
  scv:        { name: 'a small-value tilt', short: 'small-value tilt',
                blurb: '78% US total market, 22% US small-cap value, rebalanced once a year.',
                w: { US: 0.78, USSCV: 0.22 } },
  longbond:   { name: 'long Treasuries',    short: 'long Treasuries',
                blurb: 'A rolling par 20-year Treasury, the duration the 20+ year funds track.',
                w: { LONGBOND: 1 } },
  cash:       { name: 'cash',               short: 'cash',
                blurb: 'One-month Treasury bills, rolled. The safest thing there is.',
                w: { CASH: 1 } },
};

/* Each pair earns its page by having an answer of its own. The question is
   written as a reader would ask it, not as a slug. */
const PAIRS = [
  { a: 'sixtyforty', b: 'us',        slug: '60-40-vs-100-percent-stocks',
    q: 'What did 60/40 cost against all stocks?' },
  { a: 'us',         b: 'global',    slug: 'us-only-vs-global-stocks',
    q: 'Was holding only US stocks a mistake?' },
  { a: 'us',         b: 'scv',       slug: 'total-market-vs-small-cap-value-tilt',
    q: 'Did a small-cap value tilt pay?' },
  { a: 'ninetyten',  b: 'sixtyforty', slug: '90-10-vs-60-40',
    q: 'How much did the last 30% of bonds cost?' },
  { a: 'us',         b: 'cash',      slug: 'stocks-vs-cash',
    q: 'What has cash really returned?' },
  { a: 'us',         b: 'longbond',  slug: 'stocks-vs-long-treasuries',
    q: 'Stocks or long Treasuries?' },
  { a: 'threefund',  b: 'us',        slug: 'three-fund-vs-us-only',
    q: 'Has the three-fund portfolio beaten just buying America?' },
  { a: 'sixtyforty', b: 'longbond',  slug: '60-40-vs-long-treasuries',
    q: 'Is 60/40 just a worse bond fund?' },
];

/* ---------- maths ---------- */
const J = JSON.parse(fs.readFileSync('returns.json', 'utf8'));
const MONTHS = J.months, S = J.series;

/* The series do not cover the same months: bonds start in 1953, international
   in 1990, and the newest months are null until a source publishes. A null left
   in a loop reads as a flat month because 1 + null is 1, so every window here is
   the longest stretch where every series the page needs is real. */
function longestRun(keys) {
  const ok = [];
  for (let i = 0; i < MONTHS.length; i++) {
    if (keys.every(k => S[k] && S[k][i] !== null && S[k][i] !== undefined)) ok.push(i);
  }
  if (!ok.length) return null;
  let bestLo = ok[0], bestLen = 1, lo = ok[0], len = 1;
  for (let k = 1; k <= ok.length; k++) {
    if (k < ok.length && ok[k] === ok[k - 1] + 1) { len++; continue; }
    if (len > bestLen) { bestLen = len; bestLo = lo; }
    if (k < ok.length) { lo = ok[k]; len = 1; }
  }
  return bestLen < 120 ? null : [bestLo, bestLo + bestLen];
}

/* Annual rebalancing, which is what a Boglehead does in practice and is also the
   only assumption here that costs nothing to state plainly. */
function run(w, lo, hi) {
  const keys = Object.keys(w);
  let bal = { ...w }, v = 1, peak = 1, dd = 0;
  const path = [];
  for (let i = lo; i < hi; i++) {
    for (const k of keys) bal[k] *= 1 + S[k][i];
    const tot = keys.reduce((t, k) => t + bal[k], 0);
    v *= tot;
    if (v > peak) peak = v;
    if (v / peak - 1 < dd) dd = v / peak - 1;
    for (const k of keys) bal[k] /= tot;
    if ((i - lo + 1) % 12 === 0) bal = { ...w };
    path.push(v);
  }
  const n = hi - lo;
  return { cagr: Math.pow(v, 12 / n) - 1, dd, n, final: v, path };
}

function inflation(lo, hi) {
  let f = 1;
  for (let i = lo; i < hi; i++) f *= 1 + S.CPI[i];
  return Math.pow(f, 12 / (hi - lo)) - 1;
}

const realOf = (nom, inf) => (1 + nom) / (1 + inf) - 1;
const pct  = x => (x * 100).toFixed(2) + '%';
const pct1 = x => (x * 100).toFixed(1) + '%';
const money = x => '$' + Math.round(x).toLocaleString('en-US');
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const ym = s => MONTH_NAMES[parseInt(String(s).slice(4, 6), 10) - 1] + ' ' + String(s).slice(0, 4);
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export { longestRun, run, inflation, MIX, PAIRS };

/* ---------- the growth chart ----------
 * Log scale, because on a linear axis a hundred years of compounding is a flat
 * line and then a cliff, which tells you nothing about the middle.
 */
function chart(aPath, bPath, lo, hi, aColour, bColour) {
  const W = 720, H = 220, PAD = 4;
  const all = aPath.concat(bPath);
  const min = Math.min(...all), max = Math.max(...all);
  const loY = Math.log(Math.max(min, 1e-6)), hiY = Math.log(max);
  const n = aPath.length;
  const step = Math.max(1, Math.floor(n / 240));
  const line = (path, colour) => {
    const pts = [];
    for (let i = 0; i < n; i += step) {
      const x = (i / (n - 1)) * W;
      const y = H - PAD - ((Math.log(Math.max(path[i], 1e-6)) - loY) / (hiY - loY)) * (H - PAD * 2);
      pts.push(x.toFixed(1) + ',' + y.toFixed(1));
    }
    const lastY = H - PAD - ((Math.log(Math.max(path[n - 1], 1e-6)) - loY) / (hiY - loY)) * (H - PAD * 2);
    pts.push(W + ',' + lastY.toFixed(1));
    return `<polyline fill="none" stroke="${colour}" stroke-width="2.5" stroke-linejoin="round" points="${pts.join(' ')}"/>`;
  };
  /* decade gridlines, so the x axis means something */
  let grid = '';
  for (let i = 0; i < n; i++) {
    const m = MONTHS[lo + i];
    if (m.slice(4) === '01' && Number(m.slice(0, 4)) % 10 === 0) {
      const x = ((i / (n - 1)) * W).toFixed(1);
      grid += `<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="#E3E8F0" stroke-width="1"/>`
           +  `<text x="${x}" y="${H - 6}" font-size="10" fill="#93A1B5" font-family="Inter,sans-serif">${m.slice(0, 4)}</text>`;
    }
  }
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="none" role="img" `
       + `aria-label="Growth of the two mixes on a log scale, ${MONTHS[lo].slice(0,4)} to ${MONTHS[hi-1].slice(0,4)}">`
       + grid + line(bPath, bColour) + line(aPath, aColour) + '</svg>';
}

/* ---------- one comparison ---------- */
function compute(pair) {
  const A = MIX[pair.a], B = MIX[pair.b];
  const keys = [...new Set([...Object.keys(A.w), ...Object.keys(B.w), 'CPI'])];
  const r = longestRun(keys);
  if (!r) return null;
  const [lo, hi] = r;
  const ra = run(A.w, lo, hi), rb = run(B.w, lo, hi);
  const inf = inflation(lo, hi);
  return {
    pair, A, B, lo, hi, inf,
    a: { ...ra, real: realOf(ra.cagr, inf) },
    b: { ...rb, real: realOf(rb.cagr, inf) },
    from: MONTHS[lo], to: MONTHS[hi - 1],
    years: (hi - lo) / 12,
  };
}

/* The sentence a reader came for. It has to follow the data rather than the
   title, because several of these pairs do not go the way people expect. */
function verdict(c) {
  const gap = c.a.cagr - c.b.cagr;
  const lead = gap >= 0 ? c.A : c.B;
  const trail = gap >= 0 ? c.B : c.A;
  const leadR = gap >= 0 ? c.a : c.b;
  const trailR = gap >= 0 ? c.b : c.a;
  const pp = Math.abs(gap) * 100;
  const deeper = leadR.dd < trailR.dd;
  return {
    lead, trail, leadR, trailR, pp, deeper,
    headline: `${cap(lead.name)} won, by ${pp.toFixed(1)} points a year`,
    sentence:
      `Over ${c.years.toFixed(0)} years, ${lead.name} returned ${pct(leadR.cagr)} a year against ` +
      `${pct(trailR.cagr)} for ${trail.name}. That is ${pp.toFixed(1)} percentage points a year, and ` +
      `on ${money(10000)} left alone it is the difference between ${money(leadR.final * 10000)} and ` +
      `${money(trailR.final * 10000)}. ` +
      (deeper
        ? `It also fell further on the way: ${pct1(Math.abs(leadR.dd))} against ${pct1(Math.abs(trailR.dd))}.`
        : `And it fell less on the way: ${pct1(Math.abs(leadR.dd))} against ${pct1(Math.abs(trailR.dd))}.`),
  };
}
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

/* ---------- page shell ---------- */
const A_COLOUR = '#2E6BE6', B_COLOUR = '#93A1B5';

function head(title, desc, canonical) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: https://driftcalc.goatcounter.com; connect-src 'self' https://driftcalc.goatcounter.com; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
<title>${esc(title)} &middot; Drift Calculator</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:site_name" content="Drift Calculator">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="https://driftcalc.com/og-compare.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="https://driftcalc.com/og-compare.png">
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta name="theme-color" content="#0B1F3B">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Manrope:wght@600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/site.css">
<style>
/* Only what these pages do differently. Everything else is site.css. */
.sub{color:var(--muted);margin-top:14px;font-size:16.5px;max-width:640px}
.vs{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:4px}
.vs .card{display:flex;flex-direction:column;gap:3px}
.vs .nm{font-family:var(--disp);font-size:17px;font-weight:800;letter-spacing:-.02em}
.vs .bl{font-size:13px;color:var(--muted);line-height:1.5;margin-bottom:10px}
.vs .big{font-family:var(--disp);font-size:36px;font-weight:800;letter-spacing:-.03em;line-height:1.1}
.vs .lbl2{font-size:11.5px;text-transform:uppercase;letter-spacing:.07em;color:var(--faint);font-weight:600;margin-top:10px}
.vs .row{display:flex;justify-content:space-between;font-size:13.5px;padding:5px 0;border-top:1px solid var(--hairline)}
.vs .row b{font-family:var(--disp)}
.swatch{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:7px;vertical-align:middle}
.chart{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow);padding:16px 14px 6px;margin-top:4px;overflow:hidden}
.key{display:flex;gap:18px;flex-wrap:wrap;font-size:13px;color:var(--muted);margin:10px 2px 0}
.idx{display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:16px;margin-top:4px}
a.card{text-decoration:none;color:inherit;display:flex;flex-direction:column;gap:6px;transition:border-color .15s,box-shadow .15s}
a.card:hover{border-color:#C9DAFB;box-shadow:0 2px 10px rgba(16,24,40,.07)}
.idx .q{font-family:var(--disp);font-size:16.5px;font-weight:800;letter-spacing:-.02em;line-height:1.3}
.idx .ans{font-size:13.5px;color:var(--muted);line-height:1.55}
.idx .win{font-size:13px;color:var(--accent);font-weight:600;margin-top:auto;padding-top:8px}
@media(max-width:599.98px){ .vs{grid-template-columns:1fr} h1{font-size:29px} }
</style>
</head>
<body>

<header><div class="wrap">
  <a class="logo" href="/">
    <span class="mk"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M4 20V10M10 20V4M16 20v-7M22 20V7" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg></span>
    Drift Calculator
  </a>
  <div class="hbtns">
    <a class="btn nav" href="/">Calculator</a>
    <a class="btn nav" href="/tools.html">Tools</a>
    <a class="btn nav" href="/backtest.html">Backtest</a>
  </div>
</div></header>
`;
}

const FOOT = `
<footer><div class="wrap">
  <b>Drift Calc</b> is an educational calculator for portfolio arithmetic. It is not investment advice,
  tax advice, or a recommendation of any security or strategy, and it knows nothing about your situation.
  Past returns are a record, not a forecast. The figures here come from the same monthly total-return data
  the <a href="/backtest.html">backtest</a> uses, with no fund fees, spreads or taxes subtracted. Talk to a
  qualified professional before making decisions. Nothing on this page is stored or sent anywhere.
</div></footer>

<script src="/count.js"></script>
</body>
</html>
`;

function side(mix, r, colour, inf) {
  return `    <div class="card">
      <div class="nm"><span class="swatch" style="background:${colour}"></span>${esc(cap(mix.name))}</div>
      <div class="bl">${esc(mix.blurb)}</div>
      <div class="big num">${pct(r.cagr)}</div>
      <div class="lbl2">A year, before inflation</div>
      <div class="row"><span>After inflation</span><b class="num">${pct(r.real)}</b></div>
      <div class="row"><span>Worst fall</span><b class="num">${pct1(Math.abs(r.dd))}</b></div>
      <div class="row"><span>$10,000 became</span><b class="num">${money(r.final * 10000)}</b></div>
    </div>`;
}

function page(c) {
  const v = verdict(c);
  const title = c.pair.q;      /* the question mark belongs in the title too */
  const desc = `${cap(v.lead.name)} returned ${pct(v.leadR.cagr)} a year against ${pct(v.trailR.cagr)} for ` +
    `${v.trail.name}, ${c.from.slice(0, 4)} to ${c.to.slice(0, 4)}, on monthly total returns. ` +
    `Worst falls ${pct1(Math.abs(v.leadR.dd))} and ${pct1(Math.abs(v.trailR.dd))}.`;
  const canonical = `https://driftcalc.com/compare/${c.pair.slug}.html`;

  return head(title, desc, canonical) + `
<div class="wrap">

  <div class="hero">
    <h1>${esc(c.pair.q)}</h1>
    <p class="sub">${esc(ym(c.from))} to ${esc(ym(c.to))}, ${c.years.toFixed(0)} years of monthly total returns.
      Both mixes rebalanced once a year, both measured over the same months.</p>
  </div>

  <div class="answer">
    <div class="k">The answer</div>
    <div class="big num">${esc(v.pp.toFixed(1))} pts a year</div>
    <div class="say">${esc(v.sentence)}</div>
    <div class="assume">Nominal returns unless the row says otherwise. No fund fees, spreads or taxes.</div>
  </div>

  <section class="blk">
    <h2>Side by side</h2>
    <div class="vs">
${side(c.A, c.a, A_COLOUR, c.inf)}
${side(c.B, c.b, B_COLOUR, c.inf)}
    </div>
    <div class="note">Inflation over these months ran ${pct(c.inf)} a year, which is what turns the
      first number into the second. The worst fall is peak to bottom on month-end values, so the
      real one was worse than the figure shown.</div>
  </section>

  <section class="blk">
    <h2>Growth of $10,000</h2>
    <div class="chart">${chart(c.a.path, c.b.path, c.lo, c.hi, A_COLOUR, B_COLOUR)}</div>
    <div class="key">
      <span><span class="swatch" style="background:${A_COLOUR}"></span>${esc(cap(c.A.name))}</span>
      <span><span class="swatch" style="background:${B_COLOUR}"></span>${esc(cap(c.B.name))}</span>
    </div>
    <div class="note">Log scale. On a straight axis a lifetime of compounding is a flat line and
      then a cliff, which hides everything that happened in between. Here a constant slope means
      a constant percentage gain, so the two lines can be compared at any point.</div>
  </section>

  <section class="blk">
    <h2>What this leaves out</h2>
    <div class="note">
      <b>The window is doing a lot of the work.</b> These are the months where every series
      involved exists, which is ${esc(ym(c.from))} onward. Pick a different start and the answer
      can change sides. That is a fact about backtests, not about these two mixes.
      <br><br>
      <b>Nobody earned these numbers.</b> They are index returns. A real holder paid a fund fee,
      paid a spread on every trade, paid tax on dividends in a taxable account, and rebalanced
      late or not at all.
      <br><br>
      <b>The worst fall is the part that decides it.</b> A number you can read in a second took
      years to sit through, and the mix someone can hold through a fall beats the one
      they sell.
      <br><br>
      Run your own mix on the <a href="/backtest.html">backtest</a>, or put your real accounts into
      the <a href="/">drift calculator</a> and see where the next contribution should go.
    </div>
  </section>

  <section class="blk">
    <h2>Other comparisons</h2>
    <div class="note" style="background:none;padding:0">
      <a href="/compare.html">Every comparison on the site &rarr;</a>
    </div>
  </section>

</div>
` + FOOT;
}

/* ---------- the index ---------- */
function indexPage(results) {
  const desc = 'Straight comparisons of the portfolios index investors argue about, ' +
    'each run on monthly total returns over the longest window both sides share.';
  const cards = results.map(c => {
    const v = verdict(c);
    return `    <a class="card" href="/compare/${esc(c.pair.slug)}.html">
      <span class="q">${esc(c.pair.q)}</span>
      <span class="ans">${esc(cap(v.lead.name))} at ${pct(v.leadR.cagr)} a year against ${pct(v.trailR.cagr)}, ${esc(c.from.slice(0,4))} to ${esc(c.to.slice(0,4))}.</span>
      <span class="win">Read the comparison &rarr;</span>
    </a>`;
  }).join('\n\n');

  return head('Portfolio comparisons', desc, 'https://driftcalc.com/compare.html') + `
<div class="wrap">

  <div class="hero">
    <h1>Portfolio <em>comparisons</em></h1>
    <p class="sub">The arguments index investors keep having, each settled against the real
      monthly record rather than a hunch. Every page uses the longest window both sides share,
      rebalances once a year, and shows the fall as well as the return.</p>
  </div>

  <div class="idx">
${cards}
  </div>

  <section class="blk">
    <h2>How to read these</h2>
    <div class="note">
      <b>A backtest is a record, not a forecast.</b> Each of these answers one question over one
      stretch of months, and several of them would answer it differently over a different stretch.
      Where that matters, the page says so.
      <br><br>
      <b>Nobody earned these returns.</b> They are index returns with no fund fee, no spread and no
      tax taken out, and they assume a rebalance every year that nobody forgot.
      <br><br>
      These are generated from the same monthly data the <a href="/backtest.html">backtest</a> runs
      on, and rebuilt when that data is. To run a mix of your own instead of one of these, the
      backtest takes any weights you like.
    </div>
  </section>

</div>
` + FOOT;
}

/* ---------- sitemap, between markers so the hand-written part survives ---------- */
function updateSitemap(results) {
  const START = '  <!-- generated:compare -->';
  const END = '  <!-- /generated:compare -->';
  let xml = fs.readFileSync('sitemap.xml', 'utf8');
  const block = [START,
    '  <url><loc>https://driftcalc.com/compare.html</loc><changefreq>monthly</changefreq><priority>0.7</priority></url>',
    ...results.map(c =>
      `  <url><loc>https://driftcalc.com/compare/${c.pair.slug}.html</loc><changefreq>monthly</changefreq><priority>0.6</priority></url>`),
    END].join('\n');

  if (xml.includes(START) && xml.includes(END)) {
    xml = xml.slice(0, xml.indexOf(START)) + block + xml.slice(xml.indexOf(END) + END.length);
  } else {
    xml = xml.replace('</urlset>', block + '\n</urlset>');
  }
  fs.writeFileSync('sitemap.xml', xml);
  return results.length + 1;
}

/* ---------- main ---------- */
function main() {
  fs.mkdirSync('compare', { recursive: true });
  const results = [];
  const skipped = [];

  for (const pair of PAIRS) {
    const c = compute(pair);
    if (!c) { skipped.push(pair.slug); continue; }
    fs.writeFileSync(`compare/${pair.slug}.html`, page(c));
    const v = verdict(c);
    results.push(c);
    console.log(`  ${pair.slug.padEnd(40)} ${c.from}-${c.to} ${String(c.years.toFixed(0)).padStart(3)}y  ` +
      `${cap(v.lead.short || v.lead.name)} by ${v.pp.toFixed(1)}pp`);
  }

  if (!results.length) throw new Error('no comparison produced a window; returns.json is wrong');
  if (skipped.length) console.log(`  skipped (no usable window): ${skipped.join(', ')}`);

  fs.writeFileSync('compare.html', indexPage(results));
  const n = updateSitemap(results);

  console.log(`\nWrote ${results.length} comparison pages, compare.html, and ${n} sitemap entries.`);

  /* the same shape guard the returns build uses: a page that claims something
     absurd means the data changed shape, and shipping it is worse than failing */
  for (const c of results) {
    for (const [k, r] of [['A', c.a], ['B', c.b]]) {
      if (!isFinite(r.cagr) || r.cagr > 0.35 || r.cagr < -0.5)
        throw new Error(`${c.pair.slug} leg ${k}: ${pct(r.cagr)} a year is not plausible. CHECK THIS`);
      if (r.dd > 0 || r.dd < -0.999)
        throw new Error(`${c.pair.slug} leg ${k}: drawdown ${pct(r.dd)} is not plausible. CHECK THIS`);
    }
  }
  console.log('Shape checks passed.');
}

if (process.argv[1] && process.argv[1].endsWith('build-pages.mjs')) {
  try { main(); } catch (e) { console.error('\nFAILED:', e.message); process.exit(1); }
}
