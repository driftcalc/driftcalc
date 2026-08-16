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
    req.setTimeout(TIMEOUT_MS, () => {
      req.destroy(new Error(`timed out after ${TIMEOUT_MS / 1000}s: ${url}`));
    });
    req.on('error', reject);
  });
}

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
 * Monthly rows look like  YYYYMM,  n.nn,  n.nn ...
 * A value of -99.99 means "no data".
 */

function parseFrench(text, wantedCols) {
  const lines = text.split(/\r?\n/);
  let header = null, headerCols = null;
  const out = new Map();

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      // A blank line ends a table. STOP once we have one.
      // These files stack several tables that all use the same YYYYMM keys and
      // the same column names: value-weighted returns, then equal-weighted
      // returns, then number of firms, then average firm size. Continuing would
      // silently overwrite the value-weighted returns with whatever came last.
      // That bug shipped once and made small-cap value look like 22%/yr.
      if (out.size) break;
      header = null;
      continue;
    }
    const cells = line.split(',').map(s => s.trim());

    if (cells[0] === '' && cells.length > 1) {
      if (out.size) break;                 // a second header = a second table
      headerCols = cells.slice(1);
      header = true;
      continue;
    }
    if (!header) continue;
    if (!/^\d{6}$/.test(cells[0])) {
      if (out.size) break;                 // annual section or trailing prose
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

/* ---------- FRED ---------- */
function parseFred(text) {
  const out = new Map();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const m = line.match(/^(\d{4})-(\d{2})-\d{2}[,\s]+(-?[\d.]+)\s*$/);
    if (!m) continue;
    const v = Number(m[3]);
    if (!Number.isFinite(v)) continue;
    out.set(m[1] + m[2], v);
  }
  if (!out.size) throw new Error('FRED returned no usable rows; first 200 chars: ' + text.slice(0, 200));
  return out;
}

/* ---------- bond total returns from the 10-year constant-maturity yield ---------- */

export function priceBond(couponAnnualPct, yieldAnnualPct, yearsLeft) {
  const c = couponAnnualPct / 2;
  const y = yieldAnnualPct / 100 / 2;
  const n = yearsLeft * 2;
  const whole = Math.floor(n);
  const frac = n - whole;
  let pv = 0;
  for (let k = 0; k <= whole; k++) {
    const t = frac + k;
    if (t <= 1e-9 || t > n + 1e-9) continue;
    pv += c / Math.pow(1 + y, t);
  }
  pv += 100 / Math.pow(1 + y, n);
  return pv;                                    // dirty price, accrued included
}

export function bondReturns(gs10) {
  const keys = [...gs10.keys()].sort();
  const out = new Map();
  for (let i = 1; i < keys.length; i++) {
    const y0 = gs10.get(keys[i - 1]);
    const y1 = gs10.get(keys[i]);
    if (!(y0 > 0) || !(y1 > 0)) continue;
    const p1 = priceBond(y0, y1, 10 - 1 / 12);
    out.set(keys[i], p1 / 100 - 1);
  }
  return out;
}

/* ---------- does this actually look like a monthly return series? ----------
 * Cheap shape checks that catch the failure mode where we parse the wrong
 * table and end up with firm counts or ratios instead of returns. A real
 * equity series over decades has deep negative months and a sane spread.
 */
function assertReturns(label, values, opts) {
  const v = values.filter(x => x != null);
  const o = opts || {};
  const minDrop = o.minDrop == null ? -0.05 : o.minDrop;
  if (v.length < 100) throw new Error(`${label}: only ${v.length} months parsed`);
  const min = Math.min(...v), max = Math.max(...v);
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (v.length - 1));

  if (min > minDrop)
    throw new Error(`${label}: worst month is only ${(min * 100).toFixed(2)}%. That is not a return series — wrong table parsed?`);
  if (max > 1.0)
    throw new Error(`${label}: a +${(max * 100).toFixed(0)}% month. Wrong table parsed?`);
  if (sd > 0.30)
    throw new Error(`${label}: monthly volatility ${(sd * 100).toFixed(1)}% is implausible`);
  const annual = Math.pow(1 + mean, 12) - 1;
  if (annual > 0.35)
    throw new Error(`${label}: implies ${(annual * 100).toFixed(0)}%/yr. Too good to be true, so it isn't.`);
  console.log(`  ${label.padEnd(6)} ok  ${v.length} months, worst ${(min * 100).toFixed(1)}%, monthly sd ${(sd * 100).toFixed(2)}%`);
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
  const fredUrls = id => [`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`];
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

  console.log('\nShape checks:');
  assertReturns('US', series.US);
  assertReturns('USSCV', series.USSCV);
  assertReturns('INTL', series.INTL);
  assertReturns('BOND', series.BOND, { minDrop: -0.02 });
  assertReturns('CASH', series.CASH, { minDrop: 0 });

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
      USSCV: 'Ken French Data Library, 6 Portfolios on Size and Book-to-Market, value weighted (SMALL HiBM)',
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

  console.log('\nSanity checks against published history:');
  check(months, series.US, '2008', -0.37, 'US 2008');
  check(months, series.US, '2013', 0.33, 'US 2013');
  check(months, series.US, '1974', -0.27, 'US 1974');
  check(months, series.USSCV, '2008', -0.35, 'Small value 2008');
  check(months, series.USSCV, '2021', 0.32, 'Small value 2021');
  check(months, series.INTL, '2008', -0.43, 'International 2008');
  check(months, series.BOND, '2022', -0.17, 'Bonds 2022');

  console.log('\nLong-run, whole sample:');
  longRun(series.US, 'US', 0.10);
  longRun(series.USSCV, 'US small value', 0.135);
  longRun(series.CASH, 'Cash', 0.033);
}

function longRun(arr, label, expected) {
  let g = 1, n = 0;
  arr.forEach(v => { if (v != null) { g *= 1 + v; n++; } });
  const c = Math.pow(g, 12 / n) - 1;
  const ok = Math.abs(c - expected) < 0.03;
  console.log(`  ${label}: ${(c * 100).toFixed(2)}%/yr over ${(n / 12).toFixed(0)}y (expected roughly ${(expected * 100).toFixed(1)}%)  ${ok ? 'OK' : 'CHECK THIS'}`);
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

if (process.argv[1] && process.argv[1].endsWith('build-returns.mjs')) {
  main().catch(e => { console.error('\nFAILED:', e.message); process.exit(1); });
}

