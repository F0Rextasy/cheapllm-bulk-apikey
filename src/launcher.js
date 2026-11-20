#!/usr/bin/env node
'use strict';
/**
 * Interactive launcher — `npm start`.
 *
 * One click to mint: pick 1, answer "how many keys", done. The only optional
 * input is `proxies.txt` in the repo root; when it exists the launcher passes it
 * with --pool so every key takes its own exclusive exit, otherwise the run goes
 * direct (the panel allows 5 new accounts per address per hour).
 *
 * There is no captcha and no token to paste, so nothing else is asked.
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const CLI = path.join(__dirname, 'cli.js');
const CONFIG = path.join(ROOT, 'launcher.config.json');
const PROXIES = path.join(ROOT, 'proxies.txt');

const DEFAULTS = { count: 10, txt: 'keys.txt' };
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q, fallback) =>
  new Promise((resolve) => {
    const hint = fallback ? ` [${fallback}]` : '';
    rl.question(`  ${q}${hint}: `, (a) => resolve(String(a || '').trim() || String(fallback || '')));
  });

function loadConfig() {
  try {
    return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(CONFIG, 'utf8')) };
  } catch (e) {
    return { ...DEFAULTS };
  }
}
function saveConfig(cfg) {
  try {
    fs.writeFileSync(CONFIG, JSON.stringify(cfg, null, 2) + '\n', { mode: 0o600 });
  } catch (e) {
    /* read-only checkout: the answers just are not remembered */
  }
}

function run(args) {
  console.log('');
  const res = spawnSync(process.execPath, [CLI, ...args], { cwd: ROOT, stdio: 'inherit' });
  if (res.status !== 0) console.log(`  ! exited with code ${res.status}`);
}

function runScript(file, args = []) {
  console.log('');
  const res = spawnSync(process.execPath, [file, ...args], { cwd: ROOT, stdio: 'inherit' });
  if (res.status !== 0) console.log(`  ! exited with code ${res.status}`);
}

function banner() {
  console.log('');
  console.log('  cheapllm-bulk-apikey — one account per key, fully automatic');
  console.log('  key shape sk-cheap-… · no captcha · proxy optional');
  console.log('');
}

async function mintFlow(cfg) {
  cfg.count = parseInt(await ask('How many keys do you want (any number)', cfg.count), 10) || cfg.count;
  saveConfig(cfg);
  const args = ['--count', String(cfg.count)];
  if (fs.existsSync(PROXIES)) {
    args.push('--pool', PROXIES);
    console.log(`  using ${path.relative(ROOT, PROXIES)} — one exclusive exit per key`);
  } else {
    console.log('  no proxies.txt — direct run: the panel allows 5 new accounts per address per hour');
    console.log('  (add one proxy line per key to proxies.txt and rerun for larger batches)');
  }
  args.push('--auto');
  run(args);
}

async function verifyFlow() {
  const args = ['verify'];
  if (fs.existsSync(PROXIES)) args.push('--pool', PROXIES);
  run(args);
}

async function main() {
  const cfg = loadConfig();
  banner();
  console.log('  1) Mint keys       — ask how many, then run to the end');
  console.log('  2) Verify keys     — live chat check for every saved key');
  console.log('  3) Show keys       — print the key list');
  console.log('  4) Connect to 9Router — register the keys with a local 9Router');
  console.log('  5) Help            — CLI options');
  console.log('  q) Quit\n');
  const choice = (await ask('Choose', '1')).toLowerCase();

  if (choice === '1') await mintFlow(cfg);
  else if (choice === '2') await verifyFlow();
  else if (choice === '3') {
    const file = path.join(ROOT, cfg.txt);
    const lines = fs.existsSync(file)
      ? fs.readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => l && !l.startsWith('#'))
      : [];
    console.log(lines.length ? '\n' + lines.join('\n') : `\n  ! no keys in ${cfg.txt} yet`);
  } else if (choice === '4') {
    const keys = path.join(ROOT, cfg.txt);
    if (!fs.existsSync(keys)) console.log(`\n  ! no key list at ${cfg.txt} — mint some first (menu 1)`);
    else runScript(path.join(__dirname, 'connect-9router.js'), ['--keys', keys]);
  } else if (choice === '5') run(['--help']);
  rl.close();
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('Interactive launcher: `node src/launcher.js`, then pick 1 and answer how many keys.');
  console.log('  npm start          same thing');
  console.log('  npm run mint       non-interactive: node src/cli.js --count 1');
  process.exit(0);
}

main().catch((e) => {
  console.error('[fatal]', e.message);
  process.exit(1);
});
