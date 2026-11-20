#!/usr/bin/env node
'use strict';
/**
 * cheapllm.shop bulk API key CLI — one account per key, fully automatic.
 *
 *   node src/cli.js --count 10                 # direct (your own address)
 *   node src/cli.js --count 100 --pool proxies.txt   # one exit per key, fail-closed
 *   node src/cli.js verify                     # live chat check for every saved key
 *
 * The panel signs a key at signup and gates /v1 on an e-mail confirm link, so a
 * mint is: fresh mailbox -> POST /api/signup -> read the link -> GET /verify ->
 * live chat 200. No captcha is involved. The panel allows 5 new accounts per
 * address per hour; `--pool` exists to spread accounts across exits, and each
 * exit is claimed once (outputs/exits-used.txt).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { parseProxy, loadPoolFile } = require('./lib/proxy');
const { TempTf } = require('./lib/temptf');
const { MailTM } = require('./lib/mailtm');
const panel = require('./lib/panel');

const ROOT = path.resolve(__dirname, '..');
const DEFAULTS = {
  count: 1,
  rail: 'temptf',
  delay: 5000,
  txt: 'keys.txt',
  accounts: 'outputs/accounts.jsonl',
  ledgerDir: 'outputs',
  mailBase: 'https://api.mail.tm',
  model: panel.MODEL,
};

const DIRECT_PER_HOUR = 5; // panel rule: "Too many new accounts from this address. Try again in an hour."

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const m = argv[i].match(/^--([^=]+)(?:=(.*))?$/);
    if (!m) continue;
    const next = argv[i + 1];
    args[m[1]] = m[2] !== undefined ? m[2] : next && !next.startsWith('--') ? argv[++i] : true;
  }
  return args;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const ensureDir = (p) => fs.mkdirSync(path.resolve(ROOT, p), { recursive: true });
const resolve = (p) => path.resolve(ROOT, p);

function readLines(file) {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
}

/** Exclusive claim: an exit that already carried an account is never reused. */
function takeExit(poolLines, claimsFile) {
  const used = new Set(readLines(claimsFile));
  const line = poolLines.find((l) => !used.has(l));
  if (!line) return null;
  fs.appendFileSync(claimsFile, line + '\n');
  return line;
}

function directBudget(ledgerFile) {
  const cutoff = Date.now() - 3600e3;
  const used = readLines(ledgerFile)
    .map((l) => {
      try {
        return JSON.parse(l).at;
      } catch (e) {
        return null;
      }
    })
    .filter((at) => at && Date.parse(at) > cutoff).length;
  return { used, left: Math.max(0, DIRECT_PER_HOUR - used) };
}

async function makeMailbox({ rail, mailBase, proxy, log: say }) {
  if (rail === 'mailtm') {
    const box = new MailTM({ agent: proxy ? require('./lib/proxy').createAgent(proxy) : undefined, baseUrl: mailBase });
    const account = await box.createAccount();
    return { kind: 'mailtm', address: account.address, waitLink: (opts) => box.waitForLink(opts) };
  }
  const box = new TempTf({ proxy, log: say });
  await box.createAccount();
  return { kind: 'temptf', address: box.address, waitLink: (opts) => box.waitForLink(opts) };
}

async function mintOne({ i, n, poolLine, rail, mailBase, model, txt, accounts, ledger }) {
  const rec = { n: i, at: new Date().toISOString(), exit: poolLine || 'direct' };
  const t0 = Date.now();
  try {
    const proxy = poolLine ? parseProxy(poolLine) : null;
    if (poolLine && !proxy) throw new Error(`unparsable exit: ${poolLine}`);
    const box = await makeMailbox({ rail, mailBase, proxy, log });
    rec.rail = box.kind;
    rec.email = box.address;
    const password = 'Ch' + crypto.randomBytes(12).toString('base64url');
    rec.password = password;
    const identity = panel.identityFor((poolLine || 'direct') + box.address);
    const http = panel.transport(proxy, identity);
    log(`#${i}/${n} ${box.address} via ${poolLine ? 'exit ' + poolLine.replace(/\/\/[^@]*@/, '//***@') : 'direct address'}`);

    const s = await panel.signup(http, { email: box.address, password });
    rec.signupStatus = s.status;
    if (!s.key) throw new Error(`signup ${s.status}: ${s.body.slice(0, 160)}`);
    rec.key = s.key;

    const link = await box.waitLink({
      accept: (u) => panel.extractVerifyLink(u) === u || u.includes('/verify?token='),
      match: (m) => /cheapllm/i.test(m.from + ' ' + m.subject),
    });
    const v = await panel.verify(http, link);
    rec.verifyStatus = v.status;
    log(`#${i}/${n} key ${s.key.slice(0, 13)}… verify ${v.status}`);

    const gate = await panel.chat(http, s.key, { prompt: `Reply with the single word pong. [${crypto.randomBytes(3).toString('hex')}]`, model });
    if (!gate.ok) throw new Error(`chat gate failed: ${gate.status} ${gate.error || gate.text.slice(0, 80)}`);
    rec.chat = gate.text.slice(0, 40);

    fs.appendFileSync(resolve(txt), s.key + '\n');
    fs.appendFileSync(resolve(accounts), JSON.stringify({ email: box.address, password, key: s.key, at: rec.at, exit: rec.exit, rail: box.kind }) + '\n');
    rec.ok = true;
    log(`#${i}/${n} LIVE ${JSON.stringify(rec.chat)} (${gate.ms} ms)`);
  } catch (e) {
    rec.ok = false;
    rec.error = String(e.message).slice(0, 240);
    log(`#${i}/${n} FAIL ${rec.error}`);
  }
  rec.ms = Date.now() - t0;
  fs.appendFileSync(resolve(ledger), JSON.stringify(rec) + '\n');
  return rec;
}

async function verifyAll({ txt, pool, model }) {
  const keys = readLines(resolve(txt));
  if (!keys.length) {
    console.error(`no keys in ${txt} — mint first`);
    return 2;
  }
  const exits = pool ? readLines(resolve(pool)) : [];
  let live = 0;
  for (let i = 0; i < keys.length; i++) {
    const line = exits.length ? exits[i % exits.length] : null;
    const proxy = line ? parseProxy(line) : null;
    const http = panel.transport(proxy, panel.identityFor('verify' + i));
    let res = { ok: false, error: 'transport' };
    try {
      res = await panel.chat(http, keys[i], { prompt: `Reply with the single word pong. [${crypto.randomBytes(3).toString('hex')}]`, model });
    } catch (e) {
      res.error = e.message;
    }
    if (res.ok) live++;
    console.log(`  ${i + 1}/${keys.length} ${keys[i].slice(0, 16)}… ${res.ok ? 'LIVE ' + JSON.stringify(res.text.slice(0, 24)) : 'DEAD ' + (res.status || '') + ' ' + (res.error || '')}`);
  }
  console.log(`\n${live}/${keys.length} live`);
  return live === keys.length ? 0 : 1;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) {
    console.log(`cheapllm-bulk-apikey — one account per key, fully automatic

  node src/cli.js --count N [--pool proxies.txt] [--rail temptf|mailtm]
                  [--delay ms] [--txt keys.txt] [--accounts outputs/accounts.jsonl]
                  [--model ${DEFAULTS.model}] [--auto] [--dry] [--allow-overlimit]
  node src/cli.js verify [--pool proxies.txt]

Each key is only written after a live chat 200. With --pool every key takes one
exclusive exit (fail-closed: a broken exit fails the key, never falls back to
your own address). Without --pool the panel's own limit applies: ${DIRECT_PER_HOUR} new
accounts per address per hour (--allow-overlimit bypasses the local guard, and
the panel will refuse anyway).

The panel confirms each account by e-mail; the tool reads that link from a
temp.tf mailbox (default) or mail.tm. No captcha is involved.`);
    return 0;
  }
  if (args.verify || args['verify-only']) return verifyAll({ txt: args.txt || DEFAULTS.txt, pool: args.pool, model: args.model || DEFAULTS.model });

  const count = Number(args.count || DEFAULTS.count);
  const rail = String(args.rail || DEFAULTS.rail).toLowerCase();
  const delay = Number(args.delay || DEFAULTS.delay);
  const model = args.model || DEFAULTS.model;
  const txt = args.txt || DEFAULTS.txt;
  const accounts = args.accounts || DEFAULTS.accounts;
  const ledgerDir = DEFAULTS.ledgerDir;
  const ledger = path.join(ledgerDir, `ledger-${new Date().toISOString().slice(0, 10)}.jsonl`);
  const claimsFile = path.join(ledgerDir, 'exits-used.txt');
  const directFile = path.join(ledgerDir, 'direct-claims.jsonl');

  let poolLines = [];
  if (args.pool) {
    const file = resolve(args.pool);
    if (!fs.existsSync(file)) {
      console.error(`pool file not found: ${args.pool} (a direct run omits --pool)`);
      return 2;
    }
    poolLines = loadPoolFile(file).filter((p) => p && p.raw).map((p) => p.raw);
    if (!poolLines.length) {
      console.error(`no usable proxy lines in ${args.pool}`);
      return 2;
    }
  }

  if (args.dry) {
    const { left } = directBudget(directFile);
    console.log(`plan: ${count} key(s) · rail ${rail} · model ${model}`);
    console.log(`egress: ${poolLines.length ? `--pool ${args.pool} (${poolLines.length} lines, one exclusive exit per key)` : `direct — panel allows ${DIRECT_PER_HOUR}/address/hour, ${left} left this hour`}`);
    console.log(`outputs: ${txt} · ${accounts} · ${ledger}`);
    if (!poolLines.length && count > left && !args.allow_overlimit) console.log(`note: ${count} > ${left} left this hour; the panel will answer 429 after ${DIRECT_PER_HOUR}.`);
    return 0;
  }

  if (rail !== 'temptf' && rail !== 'mailtm') {
    console.error(`unknown --rail ${rail} (temptf|mailtm)`);
    return 2;
  }

  ensureDir(ledgerDir);

  void args.auto; // the whole run is automatic; --auto exists so scripts and prompts read explicitly

  let made = 0;
  let failures = 0;
  const attempts = Number(args.attempts || 3);
  const shuffled = poolLines.slice().sort(() => Math.random() - 0.5);
  // A dead or TLS-intercepting exit fails its account; the key moves to the next
  // exit instead of dying with it. Only a direct run can hit the panel's own cap.
  for (let i = 1; i <= count; i++) {
    let rec = null;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      let poolLine = null;
      if (shuffled.length) {
        poolLine = takeExit(shuffled, claimsFile);
        if (!poolLine) {
          console.error('exit pool exhausted — every line already carried an account; add fresh proxies to the pool');
          break;
        }
      } else {
        const { left } = directBudget(directFile);
        if (left <= 0 && !args.allow_overlimit) {
          console.error(`direct budget spent: ${DIRECT_PER_HOUR} accounts per address per hour (panel rule). Add a proxies.txt / --pool for more, or wait an hour.`);
          break;
        }
        fs.appendFileSync(directFile, JSON.stringify({ at: new Date().toISOString() }) + '\n');
      }
      rec = await mintOne({ i, n: count, poolLine, rail, mailBase: args['mail-base'] || DEFAULTS.mailBase, model, txt, accounts, ledger });
      if (rec.ok) break;
      const retriable = !/Too many new accounts from this address/.test(rec.error || '');
      if (!shuffled.length || !retriable || attempt === attempts) break;
      log(`#${i}/${count} burning exit and retrying (${attempt}/${attempts})`);
    }
    if (rec && rec.ok) made++;
    else {
      failures++;
      if (rec && /Too many new accounts from this address/.test(rec.error || '') && !shuffled.length) {
        console.error('panel rate limit hit — this address is done for the hour; rerun with a proxy pool to rotate exits');
        break;
      }
    }
    if (i < count) await sleep(delay);
  }
  console.log(`\ndone: ${made} live key(s), ${failures} failed of ${count} attempted`);
  return made > 0 ? 0 : 1;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error('[fatal]', e.message);
    process.exit(1);
  });
