# cheapllm.shop — measured protocol

Everything below was observed against the live panel on 2026-11-21 with plain
HTTP. No captcha appears in any step.

## Endpoints

| Step | Request | Answer |
| --- | --- | --- |
| sign up | `POST /api/signup` `{email,password,website:"",consent:true}` | `201 {"ok":true,"key":{"id":…,"key":"sk-cheap-…"},"verify":true}` + `Set-Cookie: cl_sess=…` |
| confirm | `GET /verify?token=…` (link from the mail) | `302 /dashboard?verified=1` (+ fresh `cl_sess`) |
| who am I | `GET /api/me` (cookie) | `{"user":{"verified":true,"verificationRequired":true,…}}` |
| resend | `POST /api/verify/resend` (cookie) | `429` while the last mail is "a few minutes" old |
| models | `GET /v1/models` (Bearer) | one model: `deepseek-v4.1-flash-1017`, `context_length 131072` |
| chat | `POST /v1/chat/completions` (Bearer) | OpenAI-shaped completion |
| config | `GET /api/config` | prices, free tier, model, beta flag |
| status | `GET /api/status`, `/api/live` | queue and latency counters |
| keys | `GET/POST/DELETE /api/keys` (cookie) | panel key management (this tool takes the signup key only) |

## Gates observed

- **Unverified account:** `/v1/chat/completions` → `403` `{"code":"email_not_verified"}`.
  `/v1/models` still answers 200, so model listing is not proof of a working key.
- **Concurrency:** a second parallel request on one account → `429`
  `{"code":"concurrency_limit"}` in ~300 ms. One in-flight request per account.
- **Queue:** a single request can answer `429 {"code":"overloaded"}` after long
  retries; the panel publishes free-tier first-token p50 ≈ 10 s, p90 ≈ 77 s.
- **Signup limit:** after 5 new accounts an address gets
  `429 {"error":"Too many new accounts from this address. Try again in an hour."}`
  A different exit signs up immediately — the limit is per address.
- **Mail rail:** a confirm mail sent to an `inbound-mailtrap.io` address arrived
  once and then never again (two later signups, resend refused), while
  `@outlook.com` / `@hotmail.com` aliases received it in 10–60 s.
- **Quota:** the post-beta free tier is 5 000 input + 1 000 output tokens per
  hour per account, shared by all keys of that account. During the beta a
  7 013-token prompt was accepted, so the hourly numbers are not enforced today.

## Model answers

`deepseek-v4.1-flash-1017` is a reasoning model: short answers can arrive in
`message.reasoning_content` instead of `message.content`. The gate accepts either,
and `max_tokens` below ~32 frequently returns empty content.

## Key shape

`sk-cheap-` + 32 characters. Only the full key is usable; the panel stores a
fingerprint and shows a `hint` afterwards.

## Identity

The panel is behind Cloudflare but the JSON endpoints answer plain HTTP clients.
For per-account isolation this tool pins one exit, one User-Agent and one TLS
cipher order per account; the exit is claimed once (`outputs/exits-used.txt`).
