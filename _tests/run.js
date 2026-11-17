/* Runs every *.test.js in this folder, one at a time, and exits non-zero if any
   failed. From the repo root:  node _tests/run.js
   Or one file:                  node _tests/quiz.test.js */
const { spawnSync } = require('child_process');
const fs = require('fs'), path = require('path');
const only = process.argv.slice(2);
const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js') && (!only.length || only.some(o => f.indexOf(o) > -1))).sort();
let bad = [];
const t0 = Date.now();
for (const f of files) {
  process.stdout.write('\n== ' + f + '\n');
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { stdio: 'inherit', timeout: 15 * 60 * 1000 });
  if (r.status !== 0) bad.push(f);
}
console.log('\n' + (bad.length ? 'FAILED: ' + bad.join(', ') : 'Everything passed') +
  ' (' + files.length + ' files, ' + Math.round((Date.now() - t0) / 1000) + 's)');
process.exit(bad.length ? 1 : 0);
