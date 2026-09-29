// Runs every E2E suite in sequence: node tests/e2e/run.js
'use strict';
const { spawnSync } = require('child_process');
const path = require('path');
const suites = ['baseline-kings.js', 'party-quiz.js', 'party-deck.js', 'wedding.js', 'wedding-games.js'];
let failed = 0;
for (const s of suites) {
  console.log(`\n▶ ${s}`);
  const r = spawnSync(process.execPath, [path.join(__dirname, s)], { stdio: 'inherit', cwd: path.join(__dirname, '../..') });
  if (r.status !== 0) failed++;
}
console.log(failed ? `\n${failed} suite(s) failed` : '\nAll E2E suites passed');
process.exit(failed ? 1 : 0);
