'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const { EventEmitter } = require('node:events');

const handlerPath = path.resolve(__dirname, '../api/devis.js');
let nextIp = 0;
const baseQuote = () => ({
  name: 'TEST TECHNIQUE', telephone: '+41 79 967 02 95',
  email: 'pfnettoyage@gmail.com', service: 'Nettoyage & entretien',
  description: 'Test autorisé, aucune intervention demandée.',
  location: { region: 'Région Montagnes', commune: 'La Chaux-de-Fonds' },
  desiredDate: '2026-11-30', pieces: '2', honey: '',
});

async function withHandler(options, run) {
  const vars = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'QUOTE_FROM_EMAIL', 'QUOTE_TO_EMAIL', 'QUOTE_CC_EMAIL'];
  const saved = Object.fromEntries(vars.map(key => [key, process.env[key]]));
  const defaults = { SMTP_HOST: 'smtp.gmail.com', SMTP_PORT: '465', SMTP_USER: 'info@pfnettoyage.ch', SMTP_PASSWORD: 'test-only-credential', QUOTE_FROM_EMAIL: 'PF Nettoyage <devis@pfnettoyage.ch>', QUOTE_TO_EMAIL: 'pfnettoyage@gmail.com', QUOTE_CC_EMAIL: '' };
  for (const key of vars) process.env[key] = defaults[key];
  for (const [key, value] of Object.entries(options.env || {})) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  const state = { mails: [], logs: [], pdfInputs: [], configs: [], sockets: [], closed: 0 };
  const load = Module._load;
  const consoleLog = console.log;
  const consoleError = console.error;
  console.log = (...args) => state.logs.push(args);
  console.error = (...args) => state.logs.push(args);
  Module._load = function (id, parent, isMain) {
    if (id === 'nodemailer') return {
      createTransport(config) {
        state.configs.push(config);
        return {
          async sendMail(mail) {
            state.mails.push(mail);
            if (options.sendMail) return options.sendMail(mail, state.mails.length, state);
            return { accepted: [mail.to] };
          },
          close() { state.closed += 1; },
        };
      },
    };
    if (id === 'node:net') return {
      connect() {
        const socket = new EventEmitter();
        socket.destroyed = false;
        socket.destroy = () => { socket.destroyed = true; };
        state.sockets.push(socket);
        queueMicrotask(() => socket.emit('connect'));
        return socket;
      },
    };
    if (id === '../lib/quote-document.cjs') return {
      async createQuoteAttachment(p) {
        state.pdfInputs.push(p);
        return options.pdfResult === undefined ? { filename: 'test.pdf', content: Buffer.from('%PDF-test'), contentType: 'application/pdf' } : options.pdfResult;
      },
    };
    return load.apply(this, arguments);
  };
  delete require.cache[handlerPath];
  let handler;
  try { handler = require(handlerPath); } finally { Module._load = load; }
  async function invoke(body = baseQuote(), extra = {}) {
    const req = { method: 'POST', body, headers: { 'x-forwarded-for': '192.0.2.' + (++nextIp) }, ...extra };
    const res = {
      headers: {}, setHeader(key, value) { this.headers[key] = value; },
      status(code) { this.statusCode = code; return this; },
      json(value) { this.body = value; return this; },
    };
    await handler(req, res);
    return res;
  }
  try { await run({ state, invoke }); } finally {
    console.log = consoleLog;
    console.error = consoleError;
    for (const key of vars) {
      if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
    }
  }
}

test('sends request and receipt with same PDF, desired sender, destination and reply-to', async () => {
  await withHandler({}, async ({ state, invoke }) => {
    const response = await invoke();
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.ok, true);
    assert.equal(response.body.confirmation, 'sent');
    assert.match(response.body.reference, /^PF-/);
    assert.equal(state.mails.length, 2);
    assert.equal(state.pdfInputs.length, 1);
    assert.equal(state.mails[0].from, 'PF Nettoyage <devis@pfnettoyage.ch>');
    assert.equal(state.mails[0].to, 'pfnettoyage@gmail.com');
    assert.equal(state.mails[0].replyTo, 'pfnettoyage@gmail.com');
    assert.equal(state.mails[1].replyTo, 'pfnettoyage@gmail.com');
    assert.equal(state.mails[0].attachments[0], state.mails[1].attachments[0]);
    assert.equal(state.mails[0].attachments[0].contentType, 'application/pdf');
    assert.match(state.mails[1].text, /Aucun rendez-vous ni tarif/);
    assert.equal(state.configs[0].secure, true);
    assert.equal(state.configs[0].requireTLS, false);
    assert.equal(state.closed, 1);
  });
});

test('requires encrypted STARTTLS on 587 and honors configured host', async () => {
  await withHandler({ env: { SMTP_HOST: 'smtp.example.com', SMTP_PORT: '587' } }, async ({ state, invoke }) => {
    await invoke();
    assert.equal(state.configs[0].host, 'smtp.example.com');
    assert.equal(state.configs[0].port, 587);
    assert.equal(state.configs[0].secure, false);
    assert.equal(state.configs[0].requireTLS, true);
  });
});

test('normalizes only recognized Google application-password formats', async () => {
  for (const [input, expected] of [
    ['  abcd efgh ijkl mnop\r\n', 'abcdefghijklmnop'],
    ['\nabcdefghijklmnop\n', 'abcdefghijklmnop'],
    [' other-format-credential \n', ' other-format-credential \n'],
  ]) {
    await withHandler({ env: { SMTP_PASSWORD: input } }, async ({ state, invoke }) => {
      assert.equal((await invoke()).statusCode, 200);
      assert.equal(state.configs[0].auth.pass, expected);
    });
  }
  await withHandler({ env: { SMTP_HOST: 'smtp.example.com', SMTP_PASSWORD: ' abcd efgh ijkl mnop\n' } }, async ({ state, invoke }) => {
    await invoke();
    assert.equal(state.configs[0].auth.pass, ' abcd efgh ijkl mnop\n');
  });
});

test('global receipt deadline closes active socket and preserves accepted request', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let receiptStarted;
  const started = new Promise(resolve => { receiptStarted = resolve; });
  await withHandler({ sendMail(mail, count, state) {
    if (count === 1) return { accepted: [mail.to] };
    state.configs[0].getSocket(state.configs[0], () => {});
    receiptStarted();
    return new Promise(() => {});
  } }, async ({ state, invoke }) => {
    const pending = invoke();
    await started;
    t.mock.timers.tick(20000);
    const response = await pending;
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.ok, true);
    assert.equal(response.body.confirmation, 'failed');
    assert.equal(state.mails.length, 2);
    assert.equal(state.closed, 1);
    assert.equal(state.sockets[0].destroyed, true);
    assert.equal(state.logs.filter(row => row[0] === 'quote_sent').length, 1);
    assert.equal(state.logs.find(row => row[0] === 'quote_confirmation_failed')[1].code, 'ETIMEDOUT');
  });
});

test('global main-send deadline closes active socket and never starts receipt', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let sendStarted;
  const started = new Promise(resolve => { sendStarted = resolve; });
  await withHandler({ sendMail(mail, count, state) {
    state.configs[0].getSocket(state.configs[0], () => {});
    sendStarted();
    return new Promise(() => {});
  } }, async ({ state, invoke }) => {
    const pending = invoke();
    await started;
    t.mock.timers.tick(20000);
    const response = await pending;
    assert.equal(response.statusCode, 502);
    assert.equal(response.body.ok, false);
    assert.equal(state.mails.length, 1);
    assert.equal(state.closed, 1);
    assert.equal(state.sockets[0].destroyed, true);
    assert.equal(state.logs[0][1].code, 'ETIMEDOUT');
  });
});

test('missing SMTP settings fail before creating transport or PDF', async () => {
  await withHandler({ env: { SMTP_PASSWORD: undefined } }, async ({ state, invoke }) => {
    const response = await invoke();
    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.body, { ok: false, error: 'sending_unavailable' });
    assert.equal(state.configs.length, 0);
    assert.equal(state.pdfInputs.length, 0);
    assert.equal(state.logs[0][1].category, 'smtp_configuration');
  });
});

test('535 authentication rejection is classified and sanitized', async () => {
  const sensitiveText = 'sensitive smtp debug content';
  await withHandler({ sendMail() { throw Object.assign(new Error(sensitiveText), { code: 'EAUTH', responseCode: 535, command: 'AUTH PLAIN', response: sensitiveText }); } }, async ({ state, invoke }) => {
    const response = await invoke();
    assert.equal(response.statusCode, 502);
    assert.equal(response.body.ok, false);
    assert.equal(state.mails.length, 1);
    assert.equal(state.logs[0][1].category, 'smtp_authentication_rejected');
    assert.equal(state.logs[0][1].responseCode, 535);
    assert.equal(state.logs[0][1].command, 'AUTH PLAIN');
    assert.ok(!JSON.stringify(state.logs).includes(sensitiveText));
    assert.equal(state.closed, 1);
  });
});

test('receipt failure preserves successful request and avoids asking client to resend', async () => {
  await withHandler({ sendMail(mail, count) { if (count === 2) throw Object.assign(new Error('delivery failed'), { code: 'EENVELOPE' }); return { accepted: [mail.to] }; } }, async ({ state, invoke }) => {
    const response = await invoke();
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.ok, true);
    assert.equal(response.body.confirmation, 'failed');
    assert.equal(state.mails.length, 2);
    assert.equal(state.logs.filter(row => row[0] === 'quote_sent').length, 1);
    assert.equal(state.logs.filter(row => row[0] === 'quote_confirmation_failed').length, 1);
  });
});

test('no customer email sends only the business request', async () => {
  await withHandler({}, async ({ state, invoke }) => {
    const response = await invoke({ ...baseQuote(), email: '' });
    assert.equal(response.body.confirmation, 'skipped');
    assert.equal(state.mails.length, 1);
    assert.equal(state.mails[0].replyTo, undefined);
  });
});

test('invalid PDF cannot silently drop attachment', async () => {
  await withHandler({ pdfResult: { filename: 'broken.pdf', content: '' } }, async ({ state, invoke }) => {
    const response = await invoke();
    assert.equal(response.statusCode, 502);
    assert.equal(state.mails.length, 0);
    assert.equal(state.logs[0][1].code, 'EPDF');
  });
});

test('rejects malformed, oversized and incomplete quote data before sending', async () => {
  await withHandler({}, async ({ state, invoke }) => {
    const invalid = [null, [], '{bad json', { ...baseQuote(), description: '' }, { ...baseQuote(), name: 'x'.repeat(161) }, { ...baseQuote(), email: 'a@example.com\r\nBcc:x@example.com' }, { ...baseQuote(), desiredDate: '2026-02-30' }, { ...baseQuote(), location: {} }, { ...baseQuote(), service: 'Déménagement', from: {}, to: {} }, { ...baseQuote(), description: 'é'.repeat(15000) }];
    for (const body of invalid) assert.equal((await invoke(body)).statusCode, 400);
    assert.equal(state.mails.length, 0);
    assert.equal(state.pdfInputs.length, 0);
  });
});

test('moving request includes both addresses in business mail and PDF input', async () => {
  await withHandler({}, async ({ state, invoke }) => {
    const p = { ...baseQuote(), service: 'Déménagement', from: { region: 'Montagnes', commune: 'La Chaux-de-Fonds', address: 'Adresse de test A' }, to: { region: 'Littoral', commune: 'Neuchâtel', address: 'Adresse de test B' } };
    assert.equal((await invoke(p)).statusCode, 200);
    assert.match(state.mails[0].text, /Adresse de test A/);
    assert.match(state.mails[0].text, /Adresse de test B/);
    assert.equal(state.pdfInputs[0].from.address, 'Adresse de test A');
    assert.equal(state.pdfInputs[0].to.address, 'Adresse de test B');
  });
});

test('rejects unsupported method and ignores honeypot without external effects', async () => {
  await withHandler({}, async ({ state, invoke }) => {
    const get = await invoke(undefined, { method: 'GET' });
    assert.equal(get.statusCode, 405);
    assert.equal(get.headers.Allow, 'POST');
    const bot = await invoke({ honey: 'spam' });
    assert.equal(bot.statusCode, 200);
    assert.equal(state.mails.length, 0);
    assert.equal(state.pdfInputs.length, 0);
  });
});

test('cooldown blocks a repeated request from same address', async () => {
  await withHandler({}, async ({ state, invoke }) => {
    const headers = { 'x-forwarded-for': '192.0.2.250' };
    assert.equal((await invoke(baseQuote(), { headers })).statusCode, 200);
    const repeated = await invoke(baseQuote(), { headers });
    assert.equal(repeated.statusCode, 429);
    assert.ok(Number(repeated.headers['Retry-After']) > 0);
    assert.equal(state.mails.length, 2);
  });
});
