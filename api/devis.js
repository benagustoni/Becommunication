'use strict';

const { randomUUID } = require('node:crypto');

// Best-effort instance-local protection; this is not a shared rate-limit store.
const recent = new Map();
const EMAIL = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/;
const COOLDOWN_MS = 60000;
const SEND_DEADLINE_MS = 20000;

function cleanString(value, max, required = false) {
  if (value === undefined || value === null) value = '';
  if (typeof value !== 'string') throw new Error('invalid_input');
  const text = value.trim();
  if (text.length > max || (required && !text) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) {
    throw new Error('invalid_input');
  }
  return text;
}

function cleanPoint(value, needsAddress = false) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_input');
  return {
    region: cleanString(value.region, 120, true),
    commune: cleanString(value.commune, 120, true),
    address: cleanString(value.address, 300, needsAddress),
  };
}

function parseQuote(body) {
  const p = {
    name: cleanString(body.name, 160, true),
    telephone: cleanString(body.telephone, 80, true),
    email: cleanString(body.email, 254),
    service: cleanString(body.service, 160, true),
    description: cleanString(body.description, 12000, true),
    pieces: cleanString(body.pieces, 40),
    desiredDate: cleanString(body.desiredDate, 10),
  };
  if (/[\r\n]/.test(p.name + p.telephone + p.email + p.service) || (p.email && !EMAIL.test(p.email))) {
    throw new Error('invalid_input');
  }
  if (p.desiredDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.desiredDate)) throw new Error('invalid_input');
    const date = new Date(p.desiredDate + 'T12:00:00Z');
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== p.desiredDate) {
      throw new Error('invalid_input');
    }
  }
  if (p.service === 'Déménagement') {
    p.from = cleanPoint(body.from, true);
    p.to = cleanPoint(body.to, true);
    p.location = null;
  } else {
    p.location = cleanPoint(body.location);
    p.from = null;
    p.to = null;
  }
  return p;
}

function mailbox(value) {
  if (typeof value !== 'string' || /[\r\n]/.test(value)) return '';
  const match = value.trim().match(/^(?:[^<>]+\s*)?<([^<>]+)>$/);
  const address = match ? match[1].trim() : value.trim();
  return EMAIL.test(address) ? address : '';
}

function gmailConfig() {
  const clientId = (process.env.GMAIL_CLIENT_ID || '').trim();
  const clientSecret = (process.env.GMAIL_CLIENT_SECRET || '').trim();
  const refreshToken = (process.env.GMAIL_REFRESH_TOKEN || '').trim();
  const from = process.env.QUOTE_FROM_EMAIL || 'PF Nettoyage <devis@pfnettoyage.ch>';
  const to = process.env.QUOTE_TO_EMAIL || 'pfnettoyage@gmail.com';
  const cc = (process.env.QUOTE_CC_EMAIL || '').trim();
  if (!clientId || !clientSecret || !refreshToken || !mailbox(from) || !mailbox(to) || (cc && !mailbox(cc))) {
    throw Object.assign(new Error('gmail_oauth_configuration_missing'), { code: 'GMAIL_CONFIG' });
  }
  return { clientId, clientSecret, refreshToken, from, to, cc: cc || undefined };
}

function safeError(error) {
  const code = error && error.code;
  return {
    code: ['GMAIL_CONFIG', 'GMAIL_OAUTH', 'GMAIL_API', 'ETIMEDOUT'].includes(code) ? code : 'SEND_FAILED',
    category: code === 'GMAIL_CONFIG' ? 'gmail_configuration' :
      code === 'GMAIL_OAUTH' ? 'gmail_authorization' : 'gmail_delivery',
  };
}

function b64url(buffer) {
  return buffer.toString('base64').replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/g, '');
}

function encodeSubject(value) {
  return '=?UTF-8?B?' + Buffer.from(value, 'utf8').toString('base64') + '?=';
}

async function sendViaGmail(config, message) {
  const signal = AbortSignal.timeout(SEND_DEADLINE_MS);
  let authResponse;
  try {
    authResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.clientId, client_secret: config.clientSecret,
        refresh_token: config.refreshToken, grant_type: 'refresh_token',
      }),
      signal,
    });
  } catch (error) {
    throw Object.assign(new Error('gmail_oauth_unreachable'), { code: error.name === 'TimeoutError' ? 'ETIMEDOUT' : 'GMAIL_OAUTH' });
  }
  if (!authResponse.ok) throw Object.assign(new Error('gmail_oauth_rejected'), { code: 'GMAIL_OAUTH' });
  const token = await authResponse.json();
  if (typeof token.access_token !== 'string' || !token.access_token) {
    throw Object.assign(new Error('gmail_access_token_missing'), { code: 'GMAIL_OAUTH' });
  }

  // MIME headers are validated; body is encoded to prevent header injection.
  const headers = [
    'From: ' + config.from,
    'To: ' + config.to,
    ...(config.cc ? ['Cc: ' + config.cc] : []),
    ...(message.replyTo ? ['Reply-To: ' + message.replyTo] : []),
    'Subject: ' + encodeSubject(message.subject),
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
  ];
  const mime = headers.join('\\r\\n') + '\\r\\n\\r\\n' +
    Buffer.from(message.text, 'utf8').toString('base64').replace(/.{1,76}/g, '$&\\r\\n');
  let response;
  try {
    response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token.access_token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw: b64url(Buffer.from(mime, 'utf8')) }),
      signal,
    });
  } catch (error) {
    throw Object.assign(new Error('gmail_api_unreachable'), { code: error.name === 'TimeoutError' ? 'ETIMEDOUT' : 'GMAIL_API' });
  }
  if (!response.ok) throw Object.assign(new Error('gmail_api_rejected'), { code: 'GMAIL_API' });
  const result = await response.json();
  if (typeof result.id !== 'string' || !result.id) throw Object.assign(new Error('gmail_message_id_missing'), { code: 'GMAIL_API' });
  return result.id;
}

function pointText(point) {
  return point ? [point.address, point.commune, point.region].filter(Boolean).join(', ') : '';
}

module.exports = async function devis(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }
  let body = req.body;
  let p;
  try {
    if (typeof body === 'string') {
      if (Buffer.byteLength(body, 'utf8') > 20000) throw new Error('invalid_input');
      body = JSON.parse(body);
    }
    if (!body || typeof body !== 'object' || Array.isArray(body) || Buffer.byteLength(JSON.stringify(body), 'utf8') > 20000) throw new Error('invalid_input');
    if (body.honey) return res.status(200).json({ ok: true, confirmation: 'skipped' });
    p = parseQuote(body);
  } catch {
    return res.status(400).json({ ok: false, error: 'invalid_request' });
  }

  let config;
  try {
    config = gmailConfig();
  } catch (error) {
    console.error('quote_send_failed', safeError(error));
    return res.status(503).json({ ok: false, error: 'sending_unavailable' });
  }
  const ip = String(req.headers && req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();
  const now = Date.now();
  for (const [key, time] of recent) if (now - time >= COOLDOWN_MS) recent.delete(key);
  if (recent.has(ip)) {
    res.setHeader('Retry-After', String(Math.ceil((COOLDOWN_MS - (now - recent.get(ip))) / 1000)));
    return res.status(429).json({ ok: false, error: 'please_wait' });
  }
  recent.set(ip, now);
  const reference = 'PF-' + randomUUID();
  p.reference = reference;
  p.receivedAt = new Date(now).toISOString();
  const text = [
    'DEMANDE DE DEVIS PF NETTOYAGE', 'Référence : ' + reference,
    'Nom : ' + p.name, 'Téléphone : ' + p.telephone,
    'E-mail : ' + (p.email || 'Non communiqué'), 'Prestation : ' + p.service,
    'Date souhaitée : ' + (p.desiredDate || 'À convenir'), 'Pièces : ' + (p.pieces || 'Non précisé'),
    ...(p.location ? ['Lieu : ' + pointText(p.location)] : ['Départ : ' + pointText(p.from), 'Arrivée : ' + pointText(p.to)]),
    '', p.description, '', 'Demande sans engagement. Aucun rendez-vous confirmé automatiquement.',
  ].join('\n');
  try {
    await sendViaGmail(config, {
      replyTo: p.email || undefined,
      subject: 'Demande de devis - ' + p.service,
      text,
    });
    console.log('quote_sent', { reference, accepted: true, provider: 'gmail_api', pdfAttached: false });
    return res.status(200).json({ ok: true, reference });
  } catch (error) {
    console.error('quote_send_failed', { reference, ...safeError(error) });
    return res.status(502).json({ ok: false, error: 'sending_failed' });
  }
};
