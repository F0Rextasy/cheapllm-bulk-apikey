# cheapllm-bulk-apikey

**Bulk-create cheapllm.shop accounts and their API keys — fully automatic, no captcha — and use the keys through an OpenAI-compatible endpoint (`sk-cheap-…`, DeepSeek V4.1 Flash 1017) or a local 9Router.**

- one command, one question: **how many keys**
- every key is proven with a **live chat 200** before it is written
- **proxy optional**: direct runs work; a `proxies.txt` gives each key its own exit

---

## 🚀 Quick start

```bash
git clone https://github.com/F0Rextasy/cheapllm-bulk-apikey
cd cheapllm-bulk-apikey
npm start
```

Then:

```
1) Mint keys       — ask how many, then run to the end
```

Type a number and press Enter. That is the whole flow: the tool creates a fresh
mailbox per account, signs up, reads the confirmation link from the inbox,
opens it, calls the API once, and only then appends the key to `keys.txt`.

Prefer no menu:

```bash
node src/cli.js --count 10            # 10 keys, direct
node src/cli.js --count 100 --pool proxies.txt   # 100 keys, one exit each
node src/cli.js verify                # live check for every saved key
```

## 🎁 What an account gets

| What | Value |
| --- | --- |
| Panel | [cheapllm.shop](https://cheapllm.shop) |
| Model | `deepseek-v4.1-flash-1017` (131 072-token context) |
| During the beta | free, no rate limit |
| After the beta | **5 000 input + 1 000 output tokens per hour per account**, no card |
| Beyond that | $0.05 / M input · $0.009 / M cached input · $0.42 / M output |
| Concurrency | 1 in-flight request per account, unlimited requests per minute |
| Keys per account | 25 on the panel; this tool takes **one key per account**, because the quota and the concurrency slot belong to the account |
| The unit that scales | **one account = one key** — `--count N` creates N accounts |

Check the live numbers any time: `curl https://cheapllm.shop/api/config`.

## 🧭 How it works

```
fresh mailbox (temp.tf)          signup               confirm            gate
─────────────────────────  →  POST /api/signup  →  GET /verify?token  →  POST /v1/chat
plus alias, real domain       201 + key + cookie     302 verified        200 + text
```

1. A fresh plus-alias mailbox is created on temp.tf (outlook/hotmail family) — or on mail.tm with `--rail mailtm`.
2. `POST /api/signup {email,password,website:"",consent:true}` answers **201** and the key in the same body.
3. The panel mails a confirm link. The tool polls the inbox, extracts `https://cheapllm.shop/verify?token=…`, and opens it (**302** to the dashboard).
4. The key is called once against `/v1/chat/completions`; a 200 with assistant text is the gate. Only then is the key written.

No captcha appears anywhere in this chain, so there is nothing to solve and no
token to paste.

## ✅ Quality gates

- **A key is written only after a live `chat 200` with real assistant text.** A failed gate never lands in `keys.txt`.
- `node src/cli.js verify` re-tests every saved key over the same pinned exits and reports LIVE/DEAD per key.
- Confirm-link timeouts, the panel's per-address limit and dead exits are surfaced as explicit errors — the tool never "guesses" a pass.
- A model that returns tool calls, empty content, or a different family is not what this repo claims; the gate demands assistant text from `deepseek-v4.1-flash-1017`.

## 🛰️ Proxies — optional

| Mode | How | Panel rule that applies |
| --- | --- | --- |
| Direct (default) | no `proxies.txt` | **5 new accounts per address per hour** — the panel answers `429 Too many new accounts from this address` after that |
| Pooled | put one proxy per line in `proxies.txt` | each key takes **one exclusive exit**; an exit is never reused |

With `--pool` the tool is **fail-closed**: if the exit dies mid-flow the key
fails with it; there is no silent fallback to your own address. `outputs/exits-used.txt`
records which exit carried which account, so batches never re-use one.

## 🔌 Connect to 9Router

Menu item `4`, or:

```bash
node src/connect-9router.js --keys keys.txt --base http://localhost:20128 --model deepseek-v4.1-flash-1017
```

This registers `cheapllm.shop` as an OpenAI-compatible provider (`prefix cheapllm`),
adds one connection per key, and prints a client key. Any OpenAI-compatible router
works the same way with `base_url: https://cheapllm.shop/v1`.

## ⚙️ CLI reference

```
node src/cli.js --count N [--pool proxies.txt] [--rail temptf|mailtm]
                [--delay ms] [--attempts 3] [--txt keys.txt]
                [--accounts outputs/accounts.jsonl] [--model …]
                [--auto] [--dry] [--allow-overlimit]
node src/cli.js verify [--pool proxies.txt]
```

| Flag | Meaning |
| --- | --- |
| `--count N` | how many accounts/keys |
| `--pool FILE` | one exit per key, exclusive claim, fail-closed |
| `--rail temptf\|mailtm` | mailbox backend (default `temptf`) |
| `--delay MS` | pause between accounts (default 5000) |
| `--attempts N` | exits a single key may burn before it is reported failed (default 3) |
| `--auto` | no prompts (the run is already automatic) |
| `--dry` | print the plan; makes no request and writes nothing |
| `--allow-overlimit` | direct mode only: skip the local 5-per-hour guard (the panel still refuses) |

## 📦 Output

| File | Content |
| --- | --- |
| `keys.txt` | one live key per line, appended only after a chat 200 |
| `outputs/accounts.jsonl` | e-mail, password, key, exit, rail, timestamp (local; gitignored) |
| `outputs/ledger-YYYY-MM-DD.jsonl` | every attempt with its status and timing |
| `outputs/exits-used.txt` | exits already spent (pooled runs) |

`keys.txt`, `accounts.jsonl`, `proxies.txt` and `outputs/` are gitignored — never
commit keys, accounts or proxy endpoints.

## 📁 Project structure

```
src/cli.js               mint, verify, dry run
src/launcher.js          the one-click menu (npm start)
src/connect-9router.js   9Router connector
src/lib/panel.js         signup / verify / chat, per-account identity
src/lib/temptf.js        temp.tf mailboxes + link polling
src/lib/mailtm.js        mail.tm mailboxes + link polling
src/lib/proxy.js         proxy parsing and tunnels (zero dependencies)
docs/PROTOCOL.md         the measured chain, endpoint by endpoint
examples/mint-and-chat.js
```

## ⚠️ Disclaimer

The free tier, the per-address limit and the confirm-mail behaviour are set by
cheapllm.shop and can change without notice. Creating many accounts from one
address is visible to the operator and their terms allow them to limit or suspend
accounts; use a proxy pool and modest batches. This project is not affiliated
with cheapllm.shop. Use it at your own risk and respect the provider's terms.

## 📄 License

MIT
