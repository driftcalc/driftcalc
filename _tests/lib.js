/* Shared test helpers. No npm: this uses the Playwright that Claude's cloud
   sessions have installed globally. See README.md. */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

let playwright;
try { playwright = require('playwright'); }
catch (e) {
  const { execSync } = require('child_process');
  playwright = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
}

const ROOT = path.resolve(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain', '.xml': 'application/xml' };

/* a tiny static server for the repo root, on a free port */
function serve() {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p.endsWith('/')) p += 'index.html';
      const file = path.join(ROOT, p);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, base: 'http://127.0.0.1:' + srv.address().port + '/' }));
  });
}

const PAGES = ['index.html', 'tools.html', 'backtest.html', 'compare.html', 'compounding.html', 'fees.html',
  'hfea.html', 'leverage.html', 'savings.html', 'waiting.html']
  .concat(fs.readdirSync(path.join(ROOT, 'compare')).filter(f => f.endsWith('.html')).map(f => 'compare/' + f));

async function setup() {
  const { srv, base } = await serve();
  const browser = await playwright.chromium.launch();
  return { base, browser, close: async () => { await browser.close(); srv.close(); } };
}

/* a fresh context per page, so storage never leaks between checks.
   opts.seed: {key: value} written to localStorage before any page script runs */
async function open(env, url, opts) {
  opts = opts || {};
  const ctx = await env.browser.newContext({ viewport: opts.viewport || { width: 1280, height: 900 } });
  if (opts.seed) await ctx.addInitScript(seed => {
    if (sessionStorage.getItem('__seeded')) return;
    for (const k in seed) localStorage.setItem(k, seed[k]);
    sessionStorage.setItem('__seeded', '1');
  }, opts.seed);
  const page = await ctx.newPage();
  page.errs = [];
  page.on('pageerror', e => page.errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/goatcounter|favicon/i.test(m.text())) page.errs.push('console: ' + m.text()); });
  await page.route(/goatcounter/, r => r.abort());
  if (url) await page.goto(env.base + url, { waitUntil: 'load' });
  if (opts.settle !== false) await page.waitForTimeout(opts.settle || 400);
  page.done = () => ctx.close();
  return page;
}

/* the words on screen, without script and style. Scanning raw HTML finds the
   words NaN and Infinity in the source and reports bugs that are not there. */
function visibleText(page, sel) {
  return page.evaluate(sel => {
    const root = (sel && document.querySelector(sel)) || document.body;
    const c = root.cloneNode(true);
    c.querySelectorAll('script,style,noscript,template').forEach(n => n.remove());
    return c.innerText !== undefined ? c.innerText : c.textContent;
  }, sel);
}

/* number-shaped junk that should never reach the screen */
const JUNK = /\bNaN\b|\bInfinity\b|undefined|\[object Object\]|\$-?NaN|e\+\d{2,}/;

/* collect results and report */
function suite(name) {
  const fails = [];
  let n = 0;
  return {
    ok(cond, msg) { n++; if (!cond) fails.push(msg); },
    report() {
      if (fails.length) { console.log('FAIL ' + name + ': ' + fails.length + ' of ' + n + ' checks'); fails.forEach(f => console.log('  - ' + f)); }
      else console.log('pass ' + name + ': ' + n + ' checks');
      return fails.length;
    }
  };
}

module.exports = { setup, open, visibleText, JUNK, suite, PAGES, ROOT };
