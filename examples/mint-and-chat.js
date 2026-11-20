'use strict';
// Library use: mint one key, then talk to the model — no CLI involved.
//   node examples/mint-and-chat.js [proxy-line]
const fs = require('fs');
const crypto = require('crypto');
const { parseProxy } = require('../src/lib/proxy');
const { TempTf } = require('../src/lib/temptf');
const panel = require('../src/lib/panel');

(async () => {
  const proxy = process.argv[2] ? parseProxy(process.argv[2]) : null;
  const box = new TempTf({ proxy, log: console.log });
  await box.createAccount();

  const password = 'Ch' + crypto.randomBytes(12).toString('base64url');
  const http = panel.transport(proxy, panel.identityFor(box.address));

  const signup = await panel.signup(http, { email: box.address, password });
  if (!signup.key) throw new Error(`signup ${signup.status}`);
  console.log('key', signup.key.slice(0, 13) + '…');

  const link = await box.waitForLink({
    accept: (u) => u.includes('/verify?token='),
    match: (m) => /cheapllm/i.test(m.from + ' ' + m.subject),
  });
  await panel.verify(http, link);

  const answer = await panel.chat(http, signup.key, { prompt: 'Reply with the single word pong.' });
  if (!answer.ok) throw new Error(`gate failed: ${answer.status} ${answer.error}`);
  console.log('model says', JSON.stringify(answer.text));
  fs.mkdirSync('outputs', { recursive: true });
  fs.appendFileSync('keys.txt', signup.key + '\n');
  fs.appendFileSync('outputs/accounts.jsonl', JSON.stringify({ email: box.address, password, key: signup.key, at: new Date().toISOString() }) + '\n');
})();
