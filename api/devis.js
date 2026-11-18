'use strict';

const nodemailer = require('nodemailer');
const net = require('node:net');
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

function smtpConfig() {
  const host = (process.env.SMTP_HOST || '').trim().toLowerCase();
  const port = Number(process.env.SMTP_PORT);
  const user = (process.env.SMTP_USER || '').trim();
  let pass = process.env.SMTP_PASSWORD || '';
  // Google displays application passwords in four groups; normalize only that format.
  if (host === 'smtp.gmail.com' && /^(?:[a-z]{16}|[a-z]{4}( [a-z]{4}){3})$/i.test(pass.trim())) {
    pass = pass.trim().replace(/ /g, '');
  }
  const from = process.env.QUOTE_FROM_EMAIL || 'PF Nettoyage <devis@pfnettoyage.ch>';
  const to = process.env.QUOTE_TO_EMAIL || 'pfnettoyage@gmail.com';
  const cc = (process.env.QUOTE_CC_EMAIL || '').trim();
  if (!host || /[^a-z0-9.-]/.test(host) || ![465, 587].includes(port) || !EMAIL.test(user) || !pass.trim() ||
      !mailbox(from) || !mailbox(to) || (cc && !mailbox(cc))) {
    const error = new Error('smtp_configuration_missing_or_invalid');
    error.code = 'SMTP_CONFIG';
    throw error;
  }
  return {
    transport: {
      host, port, secure: port === 465, requireTLS: port === 587,
      auth: { user, pass },
      connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000,
      logger: false, debug: false,
    },
    from, to, cc: cc || undefined,
  };
}

function safeError(error) {
  const knownCodes = new Set(['SMTP_CONFIG', 'EAUTH', 'ECONNECTION', 'ESOCKET', 'ETIMEDOUT', 'EENVELOPE', 'EMESSAGE', 'EPDF', 'ERECIPIENT']);
  return {
    code: knownCodes.has(error && error.code) ? error.code : 'SEND_FAILED',
    responseCode: Number.isInteger(error && error.responseCode) ? error.responseCode : undefined,
    command: /^(AUTH(?: LOGIN| PLAIN| XOAUTH2)?|CONN|EHLO|HELO|STARTTLS|MAIL FROM|RCPT TO|DATA)$/.test(error && error.command || '') ? error.command : undefined,
    category: error && error.responseCode === 535 ? 'smtp_authentication_rejected' :
      error && error.code === 'SMTP_CONFIG' ? 'smtp_configuration' : 'smtp_delivery',
  };
}

function assertAccepted(info, recipient) {
  const target = mailbox(recipient).toLowerCase();
  if (!info || !Array.isArray(info.accepted) || !info.accepted.some(address => mailbox(String(address)).toLowerCase() === target)) {
    const error = new Error('recipient_not_accepted');
    error.code = 'ERECIPIENT';
    throw error;
  }
}

function pointText(point) {
  return point ? [point.address, point.commune, point.region].filter(Boolean).join(', ') : '';
}

function createMailer(options) {
  let activeSocket;
  let closed = false;
  const transport = nodemailer.createTransport({
    ...options,
    // Keep access to the underlying socket so a global deadline can cancel it.
    // Nodemailer upgrades this connected plain socket to TLS on 465/587.
    getSocket(socketOptions, callback) {
      if (closed) return callback(Object.assign(new Error('send_cancelled'), { code: 'ETIMEDOUT' }));
      const socket = net.connect({ host: socketOptions.host, port: socketOptions.port });
      activeSocket = socket;
      let returned = false;
      socket.once('error', error => {
        if (returned) return;
        returned = true;
        callback(error);
      });
      socket.once('connect', () => {
        if (returned || closed) return;
        returned = true;
        callback(null, { connection: socket });
      });
    },
  });
  return {
    sendMail: message => transport.sendMail(message),
    close() {
      if (closed) return;
      closed = true;
      if (activeSocket) activeSocket.destroy();
      if (typeof transport.close === 'function') transport.close();
    },
  };
}

async function sendWithDeadline(transport, message) {
  let timer;
  const deadline = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      const error = Object.assign(new Error('smtp_deadline_exceeded'), { code: 'ETIMEDOUT' });
      reject(error);
      transport.close();
    }, SEND_DEADLINE_MS);
  });
  try {
    return await Promise.race([transport.sendMail(message), deadline]);
  } finally {
    clearTimeout(timer);
  }
}


async function resendMail(message, reference, stage) {
  const rawKey = process.env.RESEND_API_KEY || '';
  let key = rawKey.trim();
  // Remove only a pair of wrapping quotes accidentally copied into Vercel.
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1).trim();
  }
  if (!key || !key.startsWith('re_') || /\s/.test(key)) {
    const error = new Error('resend_not_configured');
    error.code = 'RESEND_UNAVAILABLE';
    throw error;
  }
  const recipient = mailbox(message.to);
  const attachmentData = (message.attachments || []).map(file => ({
    filename: file.filename,
    content: file.content.toString('base64'),
  }));
  const payload = {
    from: message.from,
    to: [recipient],
    subject: message.subject,
    text: message.text,
    attachments: attachmentData,
  };
  if (message.replyTo) payload.reply_to = [mailbox(message.replyTo)];
  if (message.cc) payload.cc = [mailbox(message.cc)];
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json',
      'Idempotency-Key': reference + '-' + stage,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) {
    // Only read and log a vetted error identifier, never response text or secrets.
    let providerCode = 'unknown';
    try {
      const info = await response.json();
      const candidate = typeof info?.name === 'string' ? info.name : typeof info?.code === 'string' ? info.code : '';
      if (/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(candidate)) providerCode = candidate;
    } catch {}
    console.error('resend_send_failed', {
      reference, stage, httpStatus: response.status, providerCode,
      keyFormat: key.startsWith('re_') && !/\s/.test(key) ? 'valid_prefix' : 'invalid_format',
      normalized: key !== rawKey
    });
    const error = new Error('resend_rejected');
    error.code = 'RESEND_REJECTED';
    throw error;
  }
  const result = await response.json();
  if (!result || !result.id) throw Object.assign(new Error('resend_missing_id'), { code: 'RESEND_REJECTED' });
  console.log('resend_accepted', { reference, stage, pdfAttached: attachmentData.length > 0 });
  return { accepted: [recipient], provider: 'resend' };
}

async function sendWithFallback(transport, message, reference, stage, forceResend) {
  if (forceResend) return resendMail(message, reference, stage);
  try {
    return await sendWithDeadline(transport, message);
  } catch (error) {
    // Only retry known SMTP authentication/configuration refusals.
    // Do not retry timeouts or uncertain deliveries to avoid duplicates.
    if (error.code !== 'EAUTH' && error.code !== 'SMTP_CONFIG') throw error;
    console.warn('smtp_auth_fallback', { reference, stage, code: error.code, responseCode: error.responseCode });
    return resendMail(message, reference, stage);
  }
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
    config = smtpConfig();
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
  let transport;
  try {
    transport = createMailer(config.transport);
    const result = await sendWithFallback(transport, {
      from: config.from, to: config.to, cc: config.cc,
      replyTo: p.email || undefined,
      subject: 'Demande de devis - ' + p.service,
      text,
    }, reference, 'quote', false);
    assertAccepted(result, config.to);
    console.log('quote_sent', { reference, accepted: true, pdfAttached: false });
    return res.status(200).json({ ok: true, reference });
  } catch (error) {
    console.error('quote_send_failed', { reference, ...safeError(error) });
    return res.status(502).json({ ok: false, error: 'sending_failed' });
  } finally {
    if (transport && typeof transport.close === 'function') transport.close();
  }
};
