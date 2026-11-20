'use strict';
/**
 * cheapllm.shop panel client — plain HTTP, one pinned exit per account.
 *
 * Measured chain (2026-11-21, docs/PROTOCOL.md carries the raw transcript):
 *   POST /api/signup {email,password,website:'',consent:true} -> 201 {key:{key}}
 *   GET  /verify?token=…                                     -> 302 /dashboard?verified=1
 *   POST /v1/chat/completions                                -> 200 (403 email_not_verified until step 2)
 *
 * Identity per account: one UA and one TLS cipher order (part of the JA3), held
 * stable for the account and different across accounts.
 */
const https = require('https');
const crypto = require('crypto');
const { URL } = require('url');
const { createAgent } = require('./proxy');

const BASE = 'https://cheapllm.shop';
const MODEL = 'deepseek-v4.1-flash-1017';

const UAS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36',
];
const CIPHERS = [
  null,
  'TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256:TLS_AES_128_GCM_SHA256:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES128-GCM-SHA256',
  'TLS_CHACHA20_POLY1305_SHA256:TLS_AES_128_GCM_SHA256:TLS_AES_256_GCM_SHA384:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384',
];

const pick = (list, seed, salt) => list[crypto.createHash('sha1').update(salt + seed).digest()[0] % list.length];

/** Stable per-account client identity. */
function identityFor(seed) {
  return { ua: pick(UAS, seed, ''), ciphers: pick(CIPHERS, seed, 'c') };
}

/**
 * Request function bound to one proxy (null = direct) and one identity.
 * Returns {status, headers, body}; throws only on transport failure.
 */
function transport(proxy, { ua, ciphers }, { timeoutMs = 45000 } = {}) {
  const agent = proxy ? createAgent(proxy, ciphers ? { ciphers } : undefined) : undefined;
  return (url, { method = 'GET', headers = {}, body, timeout = timeoutMs } = {}) =>
    new Promise((resolve, reject) => {
      const u = new URL(url);
      const payload = body == null ? null : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
      const h = { 'user-agent': ua, ...headers };
      if (payload) {
        h['content-type'] = h['content-type'] || 'application/json';
        h['content-length'] = payload.length;
      }
      const lib = u.protocol === 'https:' ? https : require('http');
      const r = lib.request({ method, host: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80), path: u.pathname + u.search, headers: h, agent }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
      });
      r.setTimeout(timeout, () => r.destroy(new Error('timeout')));
      r.on('error', reject);
      if (payload) r.write(payload);
      r.end();
    });
}

const KEY_RE = /sk-cheap-[A-Za-z0-9_-]+/;
const LINK_RE = /https:\/\/cheapllm\.shop\/verify\?token=[A-Za-z0-9_-]+/;

function extractKey(text) {
  const m = String(text).match(KEY_RE);
  return m ? m[0] : null;
}
function extractVerifyLink(text) {
  const m = String(text).replace(/&amp;/g, '&').match(LINK_RE);
  return m ? m[0] : null;
}

async function signup(http, { email, password }) {
  const r = await http(`${BASE}/api/signup`, {
    method: 'POST',
    body: { email, password, website: '', consent: true },
  });
  const key = extractKey(r.body);
  const cookie = (r.headers['set-cookie'] || []).map((c) => c.split(';')[0]).join('; ');
  return { status: r.status, key, cookie, body: r.body };
}

async function verify(http, link) {
  const r = await http(link);
  return { status: r.status, location: r.headers.location || null, body: r.body };
}

async function apiMe(http, cookie) {
  const r = await http(`${BASE}/api/me`, { headers: { cookie } });
  return { status: r.status, verified: /"verified":true/.test(r.body), body: r.body };
}

/**
 * One chat call. `ok` requires assistant text (content or reasoning_content):
 * this model writes short answers into reasoning_content when max_tokens is low.
 */
async function chat(http, key, { prompt, model = MODEL, maxTokens = 64, timeout = 150000 } = {}) {
  const started = Date.now();
  const r = await http(`${BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}` },
    body: { model, messages: [{ role: 'user', content: prompt }], max_tokens: maxTokens },
    timeout,
  });
  let text = '';
  let error = null;
  try {
    const j = JSON.parse(r.body);
    text = (j.choices && j.choices[0] && j.choices[0].message && (j.choices[0].message.content || j.choices[0].message.reasoning_content)) || '';
    if (j.error) error = j.error.code || j.error.message || 'error';
  } catch (e) {
    error = 'unreadable response';
  }
  const retryAfter = Number(((r.body.match(/"retry_after"\s*:\s*(\d+)/) || [])[1]) || 0);
  return { ok: r.status === 200 && Boolean(text), status: r.status, text: String(text).trim(), error, retryAfter, ms: Date.now() - started };
}

module.exports = {
  BASE,
  MODEL,
  identityFor,
  transport,
  extractKey,
  extractVerifyLink,
  signup,
  verify,
  apiMe,
  chat,
};
