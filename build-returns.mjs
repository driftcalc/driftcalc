#!/usr/bin/env node
/*
 * build-returns.mjs — generates returns.json for the Drift Calc backtester.
 *
 * Run it:   node build-returns.mjs
 * Output:   returns.json
 *
 * Node 18+ only. No npm install, no dependencies — stdlib only.
 * Normally this runs itself via .github/workflows/build-returns.yml.
 *
 * WHERE THE NUMBERS COME FROM
 *   US total market   Ken French, Mkt-RF + RF          monthly from 1926-07
 *   US small value    Ken French, 6 Portfolios 2x3     monthly from 1926-07
 *   International     Ken French, Developed ex US      monthly from 1990-07
 *   Cash              Ken French, RF (1-month T-bill)  monthly from 1926-07
 *   Bonds             FRED GS10, repriced monthly      monthly from 1953-04
 *   Inflation         FRED CPIAUCNS                    monthly from 1913-01
 *
 * Emerging markets is deliberately absent. Ken French publishes no EM series and
 * the MSCI EM index is licensed, so the backtester folds EM into international
 * and says so in the UI. Don't fake it.
 */

import https from 'node:https';
import zlib from 'node:zlib';
import fs from 'node:fs';

const FF = 'https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/';

/* ---------- fetch ---------- */

const TIMEOUT_MS = 45000;

function get(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('too many redirects: ' + url));
    const req = https.get(url, {
      headers: {
        // FRED stalls on requests that don't look like a browser.
        'User-Agent': 'Mozilla/5.0 (compatible; driftcalc-build/1.0)',
        'Accept': '*/*',
        'Accept-Encoding': 'identity',
      },
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(get(new URL(res.headers.location, url).href, redirects + 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    // Never hang forever. A stalled socket wedged the whole build once.
    req.setTimeout(TIMEOUT_MS, () => {
      req.destroy(new Error(`timed out after ${TIMEOUT_MS / 1000}s: ${url}`));
    });
    req.on('error', reject);
  });
}

/* Try each URL in turn, return the first that works. */
async function getAny(urls, label) {
  const errs = [];
  for (const u of urls) {
    try {
      const buf = await get(u);
      if (buf.length > 100) return buf;
      errs.push(`${u}: suspiciously small (${buf.length} bytes)`);
    } catch (e) { errs.push(`${u}: ${e.message}`); }
  }
  throw new Error(`could not fetch ${label}\n  ` + errs.join('\n  '));
}

/* ---------- unzip (single-entry zips, stored or deflated) ---------- */

function unzipFirst(buf) {
  if (buf.readUInt32LE(0) !== 0x04034b50) throw new Error('not a zip file');
  const method = buf.readUInt16LE(8);
  const compSize = buf.readUInt32LE(18);
  const nameLen = buf.readUInt16LE(26);
  const extraLen = buf.readUInt16LE(28);
  const start = 30 + nameLen + extraLen;
  // compSize is 0 when the zip uses a streaming data descriptor; fall back to
  // scanning for the central directory signature.
  let end;
  if (compSize > 0) {
    end = start + compSize;
  } else {
    end = buf.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]), start);
    if (end < 0) end = buf.length;
  }
  const body = buf.subarray(start, end);
  if (method === 0) return body.toString('latin1');
  if (method === 8) return zlib.inflateRawSync(body).toString('latin1');
  throw new Error('unsupported zip compression method ' + method);
}

/* ---------- Ken French CSV parsing ----------
 * These files are a stack of tables separated by blank lines, each preceded by
 * prose. Monthly rows look like  YYYYMM,  n.nn,  n.nn ...
 * Annual rows look like  YYYY,  ...  — we take monthly only.
 * A row of all -99.99 means "no data".
 */

function parseFrench(text, wantedCols) {
  const lines = text.split(/\r?\n/);
  let header = null, headerCols = null;
  const out = new Map();

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { header = null; continue; }
    const cells = line.split(',').map(s => s.trim());

    // A header row starts with an empty first cell.
    if (cells[0] === '' && cells.length > 1) {
      headerCols = cells.slice(1);
      header = true;
      continue;
    }
    if (!header) continue;
    if (!/^\d{6}$/.test(cells[0])) {
      // 4-digit year = annual section; anything else = prose.
      if (/^\d{4}$/.test(cells[0])) header = null;
      continue;
    }

    const vals = cells.slice(1).map(Number);
    const rec = {};
    let usable = false;
    for (const want of wantedCols) {
      const idx = headerCols.findIndex(h => h.toUpperCase() === want.toUpperCase());
      if (idx < 0) continue;
      const v = vals[idx];
      if (!Number.isFinite(v) || v <= -99) continue;
      rec[want] = v / 100;           // French publishes percent
      usable = true;
    }
    if (usable) out.set(cells[0], rec);
  }
  if (!out.size) throw new Error('parsed zero monthly rows — file format changed?');
  return out;
}

/* ---------- FRED ----------
 * Handles both shapes:
 *   fredgraph.csv   ->  observation_date,GS10   /  1953-04-01,2.83
 *   data/GS10.txt   ->  DATE          VALUE     /  1953-04-01    2.83
 * The .txt endpoint is a static file and far more reliable from CI than the
 * csv one, which is generated on demand and likes to stall.
 */
function parseFred(text) {
  const out = new Map();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const m = line.match(/^(\d{4})-(\d{2})-\d{2}[,\s]+(-?[\d.]+)\s*$/);
    if (!m) continue;                            // headers, prose, "." for missing
    const v = Number(m[3]);
    if (!Number.isFinite(v)) continue;
    out.set(m[1] + m[2], v);
  }
  if (!out.size) throw new Error('FRED returned no usable rows; first 200 chars: ' + text.slice(0, 200));
  return out;
}

/* ---------- bond total returns from the 10-year constant-maturity yield ----------
 * Hold a par 10-year Treasury for one month, then sell it and buy a fresh one.
 * Start of month: coupon rate = y0, price = 100 by construction.
 * End of month:   same bond has 9y11m left; reprice it at the new yield y1.
 * Semiannual coupons, standard bond math. No duration approximation.
 */

export function priceBond(couponAnnualPct, yieldAnnualPct, yearsLeft) {
  const c = couponAnnualPct / 2;                // semiannual coupon per 100 face
  const y = yieldAnnualPct / 100 / 2;           // semiannual yield per period
  const n = yearsLeft * 2;                      // periods to maturity, fractional
  const whole = Math.floor(n);
  const frac = n - whole;                       // periods until the next coupon
  let pv = 0;
  for (let k = 0; k <= whole; k++) {
    const t = frac + k;                         // coupon dates: frac, frac+1, ... n
    if (t <= 1e-9 || t > n + 1e-9) continue;    // skip a coupon sitting exactly at t=0
    pv += c / Math.pow(1 + y, t);
  }
  pv += 100 / Math.pow(1 + y, n);               // principal at maturity
  return pv;                                    // dirty price: accrued is already in here
}

export function bondReturns(gs10) {
  const keys = [...gs10.keys()].sort();
  const out = new Map();
  for (let i = 1; i < keys.length; i++) {
    const y0 = gs10.get(keys[i - 1]);
    const y1 = gs10.get(keys[i]);
    if (!(y0 > 0) || !(y1 > 0)) continue;
    // Discounting future cash flows already includes accrued interest, so do
    // NOT add a separate coupon term on top.
    const p1 = priceBond(y0, y1, 10 - 1 / 12);
    out.set(keys[i], p1 / 100 - 1);
  }
  return out;
}

/* ---------- main ---------- */

const round = (x, n = 6) => Number(x.toFixed(n));

async function main() {
  console.log('Downloading Ken French factor data...');
  const [ff3z, p6z, devz] = await Promise.all([
    get(FF + 'F-F_Research_Data_Factors_CSV.zip'),
    get(FF + '6_Portfolios_2x3_CSV.zip'),
    get(FF + 'Developed_ex_US_3_Factors_CSV.zip'),
  ]);

  console.log('Downloading FRED series...');
  const fredUrls = id => [
        `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`,
  ];
  const [gs10raw, cpiraw] = await Promise.all([
    getAny(fredUrls('GS10'), 'GS10 (10-year Treasury)'),
    getAny(fredUrls('CPIAUCNS'), 'CPIAUCNS (inflation)'),
  ]);

  const ff3 = parseFrench(unzipFirst(ff3z), ['Mkt-RF', 'RF']);
  const p6 = parseFrench(unzipFirst(p6z), ['SMALL HiBM']);
  const dev = parseFrench(unzipFirst(devz), ['Mkt-RF', 'RF']);
  const gs10 = parseFred(gs10raw.toString('utf8'));
  const cpi = parseFred(cpiraw.toString('utf8'));
  const bonds = bondReturns(gs10);

  console.log(`  US factors   ${ff3.size} months`);
  console.log(`  6 portfolios ${p6.size} months`);
  console.log(`  Developed    ${dev.size} months`);
  console.log(`  GS10         ${gs10.size} months -> ${bonds.size} bond returns`);
  console.log(`  CPI          ${cpi.size} months`);

  // Assemble a dense monthly table over the union of dates.
  const all = new Set([...ff3.keys(), ...dev.keys(), ...bonds.keys()]);
  const months = [...all].sort();

  const series = { US: [], USSCV: [], INTL: [], BOND: [], CASH: [], CPI: [] };
  const cpiKeys = [...cpi.keys()].sort();
  const cpiIdx = new Map(cpiKeys.map((k, i) => [k, i]));

  for (const m of months) {
    const us = ff3.get(m);
    const scv = p6.get(m);
    const dv = dev.get(m);
    series.US.push(us ? round(us['Mkt-RF'] + us.RF) : null);
    series.USSCV.push(scv && scv['SMALL HiBM'] != null ? round(scv['SMALL HiBM']) : null);
    series.INTL.push(dv ? round(dv['Mkt-RF'] + dv.RF) : null);
    series.BOND.push(bonds.has(m) ? round(bonds.get(m)) : null);
    series.CASH.push(us && us.RF != null ? round(us.RF) : null);

    const i = cpiIdx.has(m) ? cpiIdx.get(m) : -1;
    series.CPI.push(i > 0 ? round(cpi.get(m) / cpi.get(cpiKeys[i - 1]) - 1) : null);
  }

  const firstFull = months.findIndex((m, i) =>
    series.US[i] != null && series.INTL[i] != null && series.BOND[i] != null);

  const out = {
    _comment: 'Monthly TOTAL returns as decimals (0.0123 = +1.23%). Built by build-returns.mjs. Do not hand-edit.',
    generated: new Date().toISOString().slice(0, 10),
    start: months[0],
    end: months[months.length - 1],
    firstMonthWithAllClasses: months[firstFull],
    sources: {
      US: 'Ken French Data Library, Fama/French 3 Factors (Mkt-RF + RF)',
      USSCV: 'Ken French Data Library, 6 Portfolios Formed on Size and Book-to-Market (SMALL HiBM)',
      INTL: 'Ken French Data Library, Fama/French Developed ex US 3 Factors (Mkt-RF + RF)',
      BOND: 'FRED GS10, repriced monthly as a rolling par 10-year Treasury',
      CASH: 'Ken French Data Library, RF (one-month Treasury bill)',
      CPI: 'FRED CPIAUCNS, month-over-month change',
    },
    caveats: [
      'Emerging markets has no free long-history series, so EM is backtested as international.',
      'International starts July 1990. Backtests that include it cannot begin earlier.',
      'These are index returns with no fund fees, bid-ask spreads, or taxes subtracted.',
    ],
    months,
    series,
  };

  fs.writeFileSync('returns.json', JSON.stringify(out));
  const kb = (fs.statSync('returns.json').size / 1024).toFixed(0);
  console.log(`\nWrote returns.json — ${months.length} months, ${months[0]} to ${months[months.length - 1]}, ${kb} KB`);
  console.log(`All five classes available from ${months[firstFull]} onward.`);
  console.log('\nSanity checks:');
  check(months, series.US, '2008', -0.37, 'US 2008');
  check(months, series.US, '2013', 0.33, 'US 2013');
  check(months, series.BOND, '2022', -0.17, 'Bonds 2022');
}

function check(months, arr, year, expected, label) {
  let g = 1, n = 0;
  months.forEach((m, i) => {
    if (m.startsWith(year) && arr[i] != null) { g *= 1 + arr[i]; n++; }
  });
  if (!n) return console.log(`  ${label}: no data`);
  const actual = g - 1;
  const ok = Math.abs(actual - expected) < 0.06;
  console.log(`  ${label}: ${(actual * 100).toFixed(1)}%  (expected roughly ${(expected * 100).toFixed(0)}%)  ${ok ? 'OK' : 'CHECK THIS'}`);
}

// Only run when invoked directly, so the bond functions can be imported by tests.
if (process.argv[1] && process.argv[1].endsWith('build-returns.mjs')) {
  main().catch(e => { console.error('\nFAILED:', e.message); process.exit(1); });
}

