'use strict';
/**
 * temp.tf backend — real Microsoft-family mailboxes with a JSON reader.
 *
 * Why this one: cheapllm.shop drops confirm mail aimed at inbound-mailtrap.io
 * after the first send (measured 2026-11-21), while a genuine `@outlook.com` /
 * `@hotmail.com` address receives the confirm link in tens of seconds. temp.tf
 * hands out plus aliases on its own pool of real provider accounts:
 *
 *   GET  /api/account?providers=outlook,hotmail&dot=0&plus=1  -> {email}
 *   POST /api/check  {email, wait}                            -> {data:[…]}
 *
 * Rate limit: the account route is throttled per IP (`429` + `Retry-After`);
 * one address per mint, and a 429 is retried after the advertised delay.
 *
 *   createAccount() -> { address }
 *   waitForLink()   -> the first URL a predicate accepts, from the raw message
 */
const { fetchText } = require('./proxy');

const BASE = 'https://temp.tf';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class TempTf {
  /**
   * @param {{proxy?: object|null, providers?: string[], plus?: boolean, dot?: boolean, address?: string|null, log?: Function, timeoutMs?: number}} opts
   */
  constructor({ proxy = null, providers = ['outlook', 'hotmail'], plus = true, dot = false, address = null, log = () => {}, timeoutMs = 30000 } = {}) {
    this.proxy = proxy;
    this.providers = providers;
    this.plus = plus;
    this.dot = dot;
    this.preset = address;
    this.log = log;
    this.timeoutMs = timeoutMs;
    this.address = address || null;
  }

  async call(method, path_, { body, tries = 4 } = {}) {
    const url = `${BASE}${path_}`;
    for (let attempt = 0; ; attempt++) {
      // fetchText resolves the decoded body only (status lives on the socket), so
      // a throttle is detected from the body shape rather than a code.
      const text = await fetchText(this.proxy, url, {
        method,
        timeoutMs: this.timeoutMs,
        headers: {
          'user-agent': UA,
          accept: 'application/json',
          ...(body ? { 'content-type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      let json = null;
      try {
        json = JSON.parse(text);
      } catch (e) {
        json = null;
      }
      if (json === null) {
        if (attempt < tries) {
          await sleep(8000 * (attempt + 1));
          continue;
        }
        throw new Error(`temp.tf ${method} ${path_}: unreadable body ${String(text).slice(0, 160)}`);
      }
      if (json.error) {
        const detail = String(json.error);
        if (/too many|rate|limit/i.test(detail) && attempt < tries) {
          const ms = 10000 * (attempt + 1);
          this.log(`temp.tf: throttled (${detail}), retrying in ${Math.round(ms / 1000)}s`);
          await sleep(ms);
          continue;
        }
        throw new Error(`temp.tf ${method} ${path_}: ${detail}`);
      }
      return json;
    }
  }

  /** Fresh plus alias on a live Microsoft mailbox. */
  async createAccount({ providers = this.providers } = {}) {
    if (this.preset) {
      this.address = this.preset;
      return { address: this.address };
    }
    const q = new URLSearchParams({
      providers: providers.join(','),
      dot: this.dot ? '1' : '0',
      plus: this.plus ? '1' : '0',
    }).toString();
    const json = await this.call('GET', `/api/account?${q}`);
    const address = String((json && json.email) || '').trim();
    if (!/@/.test(address)) throw new Error(`temp.tf: no address in ${JSON.stringify(json).slice(0, 160)}`);
    this.address = address;
    this.log(`temp.tf: ${address}`);
    return { address };
  }

  /** Inbox messages, newest first, normalised to the `{id, subject, from, text, raw}` shape. */
  async messages() {
    if (!this.address) throw new Error('temp.tf: createAccount() first');
    const json = await this.call('POST', '/api/check', { body: { email: this.address, wait: false } });
    const list = Array.isArray(json) ? json : json && (json.data || json.messages);
    if (!Array.isArray(list)) return [];
    return list.map((m, i) => {
      const text = String(
        m.text || m.textBody || m.plain || m.body || m.html || m.htmlBody || m.snippet || m.preview || '',
      );
      return {
        id: String(m.id || m.messageId || i),
        subject: String(m.subject || m.title || ''),
        from: String(m.from || m.sender || (m.fromAddress && (m.fromAddress.address || m.fromAddress)) || ''),
        text: text.replace(/<[^>]+>/g, ' '),
        raw: m,
      };
    });
  }

  /**
   * Polls until a message carries a URL `accept` approves. The raw JSON is
   * scanned because the HTML is stripped from `text` and the link lives in it.
   */
  async waitForLink({ timeoutMs = 180000, pollMs = 5000, match = null, accept, log } = {}) {
    if (!this.address) throw new Error('temp.tf: createAccount() first');
    const say = log || this.log;
    const deadline = Date.now() + timeoutMs;
    const seen = new Set();
    while (Date.now() < deadline) {
      const list = await this.messages();
      for (const m of list) {
        if (seen.has(m.id)) continue;
        seen.add(m.id);
        if (match && !match(m)) continue;
        const raw = JSON.stringify(m.raw).replace(/&amp;/g, '&');
        const link = [...raw.matchAll(/https?:\/\/[^\s"'<>\\]+/g)].map((x) => x[0]).find((u) => accept(u));
        if (link) {
          say(`temp.tf: link from "${m.subject.slice(0, 40)}"`);
          return link;
        }
        say(`temp.tf: message without a usable link ("${m.subject.slice(0, 40)}")`);
      }
      await sleep(pollMs);
    }
    throw new Error(`temp.tf: no link for ${this.address} within ${Math.round(timeoutMs / 1000)}s`);
  }

  /** The alias is a plus tag on a pool mailbox; nothing to release. */
  close() {
    this.address = null;
  }
}

module.exports = { TempTf };
