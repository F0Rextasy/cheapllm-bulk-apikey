'use strict';

/**
 * 9Router connector for cheapllm.shop API keys.
 *
 * Registers cheapllm.shop as an OpenAI-compatible provider-node in 9Router and
 * attaches API keys as connections to it. The provider prefix `cheapllm` keeps
 * them separate from every other station in the same router.
 *
 * 9Router: npm install -g 9router && 9router   # dashboard http://localhost:20128
 *
 * The shapes below were exercised against a live 9Router:
 *   POST /api/auth/login        {password}            -> session cookie
 *   GET  /api/provider-nodes                          -> {nodes}
 *   POST /api/provider-nodes    {name,prefix,apiType,type,baseUrl} -> {node}
 *   POST /api/providers         {provider:nodeId,apiKey,name,priority,defaultModel} -> {connection}
 *   POST /api/keys              {name}                -> {key}
 */

const fs = require('fs');
const UA = 'cheapllm-bulk-9router/1.0';

async function login(base, password) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
    body: JSON.stringify({ password: password ?? '123456' }),
    signal: AbortSignal.timeout(15000),
  });
  const sc = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  const cookie = sc.map((c) => c.split(';')[0]).join('; ');
  return { ok: res.ok, cookie, body: (await res.text()).slice(0, 200) };
}

async function apiCall(base, cookie, pathname, init = {}) {
  const res = await fetch(`${base}${pathname}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': UA,
      ...(cookie ? { Cookie: cookie } : {}),
      ...(init.headers || {}),
    },
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-JSON error body */ }
  return { status: res.status, ok: res.ok, json, text: text.slice(0, 400) };
}

async function ensureProviderNode(base, cookie, { name, prefix, baseUrl }) {
  const list = await apiCall(base, cookie, '/api/provider-nodes');
  const nodes = (list.json && list.json.nodes) || [];
  const existing = nodes.find((n) => n.name === name || n.prefix === prefix);
  if (existing) return { node: existing, created: false };
  const created = await apiCall(base, cookie, '/api/provider-nodes', {
    method: 'POST',
    body: JSON.stringify({ name, prefix, apiType: 'chat', type: 'openai-compatible', baseUrl }),
  });
  if (!created.ok) throw new Error(`create provider-node failed ${created.status}: ${created.text}`);
  return { node: created.json.node, created: true };
}

/**
 * One proxy pool per account exit, bound to that account's connection. The
 * pool is created with strictProxy so a dead exit errors instead of letting the
 * router send the request out of the machine's own address.
 */
async function ensureProxyPool(base, cookie, { name, proxyUrl }) {
  const list = await apiCall(base, cookie, '/api/proxy-pools?includeUsage=true');
  const pools = Array.isArray(list.json) ? list.json : (list.json && (list.json.proxyPools || list.json.pools)) || [];
  const existing = pools.find((p) => p.name === name);
  if (existing) return { pool: existing, created: false };
  const type = /^socks/i.test(proxyUrl) ? 'socks5' : 'http';
  const created = await apiCall(base, cookie, '/api/proxy-pools', {
    method: 'POST',
    body: JSON.stringify({ name, proxyUrl, type, strictProxy: true, isActive: true }),
  });
  if (!created.ok) throw new Error(`create proxy pool failed ${created.status}: ${created.text}`);
  return { pool: created.json, created: true };
}

async function ensureConnection(base, cookie, { nodeId, name, apiKey, defaultModel, proxyPoolId }) {
  const list = await apiCall(base, cookie, '/api/providers');
  const conns = (list.json && list.json.connections) || [];
  const existing = conns.find((c) => c.provider === nodeId && c.name === name);
  if (existing) return { connection: existing, created: false };
  const body = { provider: nodeId, apiKey, name, priority: 1, defaultModel: defaultModel || null };
  if (proxyPoolId) body.proxyPoolId = proxyPoolId;
  // POST /api/connections on current 9router builds; older upstream answers
  // only /api/providers, so a 404/405 there is retried once on the other path.
  let created = await apiCall(base, cookie, '/api/connections', { method: 'POST', body: JSON.stringify(body) });
  if (created.status === 404 || created.status === 405) {
    created = await apiCall(base, cookie, '/api/providers', { method: 'POST', body: JSON.stringify(body) });
  }
  if (!created.ok && created.status !== 409) {
    throw new Error(`create connection failed ${created.status}: ${created.text}`);
  }
  return { connection: created.json && created.json.connection, created: true };
}

async function ensureClientKey(base, cookie, name = 'cheapllm') {
  const list = await apiCall(base, cookie, '/api/keys');
  const keys = Array.isArray(list.json) ? list.json : (list.json && list.json.keys) || [];
  const existing = keys.find((k) => k.name === name && k.isActive);
  if (existing) return { key: existing.key, created: false };
  const created = await apiCall(base, cookie, '/api/keys', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
  if (!created.ok) throw new Error(`create client key failed ${created.status}: ${created.text}`);
  return { key: created.json.key, created: true };
}

async function connect({
  base = 'http://localhost:20128',
  password = '123456',
  apiKey,
  name = 'cheapllm',
  prefix = 'cheapllm',
  baseUrl = 'https://cheapllm.shop/v1',
  defaultModel = 'deepseek-v4.1-flash-1017',
  clientKeyName = 'cheapllm',
}) {
  if (!apiKey) throw new Error('connect(): apiKey is required');
  const { ok, cookie, body } = await login(base, password);
  if (!ok && !/already|success|ok/i.test(body)) throw new Error(`9Router login failed: ${body}`);
  const { node } = await ensureProviderNode(base, cookie, { name, prefix, baseUrl });
  const { connection } = await ensureConnection(base, cookie, { nodeId: node.id, name, apiKey, defaultModel });
  const clientKey = await ensureClientKey(base, cookie, clientKeyName);
  return { clientKey: clientKey.key, nodeId: node.id, connectionId: connection && connection.id, baseUrl: `${base}/v1` };
}

async function connectBulk({
  base = 'http://localhost:20128',
  password = '123456',
  keysFile,
  accountsFile = 'outputs/accounts.jsonl',
  prefix = 'cheapllm',
  baseUrl = 'https://cheapllm.shop/v1',
  defaultModel = 'deepseek-v4.1-flash-1017',
}) {
  const keys = fs
    .readFileSync(keysFile, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split(/[\s,]+/)[0]);

  // Account records carry the exit each key was minted on. Binding that exit to
  // the connection keeps the panel request on the same address as the signup.
  const exits = new Map();
  if (accountsFile && fs.existsSync(accountsFile)) {
    for (const line of fs.readFileSync(accountsFile, 'utf8').split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const row = JSON.parse(line);
        if (row.key && row.exit && row.exit !== 'direct') exits.set(row.key, row.exit);
      } catch (e) {
        /* a half-written ledger line is skipped, not fatal */
      }
    }
  }

  console.log(`connecting ${keys.length} keys to 9Router at ${base} (${exits.size} with a dedicated exit)`);
  const { ok, cookie, body } = await login(base, password);
  if (!ok && !/already|success|ok/i.test(body)) throw new Error(`9Router login failed: ${body}`);
  const { node } = await ensureProviderNode(base, cookie, { name: 'cheapllm', prefix, baseUrl });

  const results = [];
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const name = `${prefix}-${String(i + 1).padStart(3, '0')}`;
    try {
      let proxyPoolId = null;
      const exitLine = exits.get(key);
      if (exitLine) {
        const pool = await ensureProxyPool(base, cookie, { name: `${prefix}-exit-${String(i + 1).padStart(3, '0')}`, proxyUrl: exitLine });
        proxyPoolId = pool.pool && pool.pool.id;
      }
      const { connection, created } = await ensureConnection(base, cookie, { nodeId: node.id, name, apiKey: key, defaultModel, proxyPoolId });
      results.push({ i: i + 1, key: key.slice(0, 16) + '…', connectionId: connection && connection.id, proxyPoolId, created });
      console.log(`  [${i + 1}/${keys.length}] ${name} -> ${created ? 'created' : 'exists'}${proxyPoolId ? ' (exit pinned)' : ''}`);
    } catch (e) {
      console.error(`  [${i + 1}/${keys.length}] ${name} -> FAILED: ${e.message}`);
      results.push({ i: i + 1, key: key.slice(0, 16) + '…', error: e.message });
    }
  }

  const clientKey = await ensureClientKey(base, cookie, prefix);
  console.log(`\n9Router client key: ${clientKey.key}`);
  console.log(`Endpoint: ${base}/v1`);
  console.log(`Models:   ${prefix}/${defaultModel}`);

  return { clientKey: clientKey.key, nodeId: node.id, results };
}

async function listRouterModels(base, clientKey, { filter = 'cheapllm/' } = {}) {
  const res = await fetch(`${base}/v1/models`, {
    headers: { Authorization: `Bearer ${clientKey}`, 'User-Agent': UA },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`router /v1/models -> ${res.status}`);
  const data = await res.json();
  const ids = (data.data || []).map((m) => m.id);
  return filter ? ids.filter((id) => id.includes(filter)) : ids;
}

module.exports = {
  login,
  apiCall,
  ensureProviderNode,
  ensureProxyPool,
  ensureConnection,
  ensureClientKey,
  connect,
  connectBulk,
  listRouterModels,
  UA,
};


if (require.main === module) {
  const argv = process.argv.slice(2);
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const m = argv[i].match(/^--([^=]+)(?:=(.*))?$/);
    if (!m) continue;
    const next = argv[i + 1];
    args[m[1]] = m[2] !== undefined ? m[2] : next && !next.startsWith('--') ? argv[++i] : true;
  }
  if (args.help) {
    console.log('Usage: node src/connect-9router.js --keys keys.txt [--accounts outputs/accounts.jsonl] [--base http://localhost:20128] [--password 123456] [--model deepseek-v4.1-flash-1017]');
    process.exit(0);
  }
  connectBulk({
    base: args.base || 'http://localhost:20128',
    password: args.password || '123456',
    keysFile: args.keys || 'keys.txt',
    accountsFile: args.accounts || 'outputs/accounts.jsonl',
    prefix: args.prefix || 'cheapllm',
    baseUrl: args.url || 'https://cheapllm.shop/v1',
    defaultModel: args.model || 'deepseek-v4.1-flash-1017',
  }).catch((e) => {
    console.error('[fatal]', e.message);
    process.exit(1);
  });
}