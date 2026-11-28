'use strict';

const privacyFooter = 'Protection des données — PF Nettoyage utilise vos données pour traiter votre demande et vous recontacter. Pour en savoir plus et exercer vos droits : https://www.pfnettoyage.ch/confidentialite.html';

const nodemailer = require('nodemailer');
const net = require('node:net');
const { randomUUID } = require('node:crypto');
const { createQuoteAttachment } = require('../lib/quote-document.cjs');

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
    urgent: body.urgent === true,
    preferredTime: cleanString(body.preferredTime || 'À convenir', 80),
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
  if (!['À convenir', 'Matin (08h00–12h00)', 'Après-midi (13h00–18h00)', 'Soir (18h00–22h00)', 'Autre horaire'].includes(p.preferredTime) || (body.urgent !== undefined && typeof body.urgent !== 'boolean')) throw new Error('invalid_input');
  if (p.urgent && (!p.desiredDate || !p.preferredTime || p.preferredTime === 'À convenir')) {
    throw new Error('invalid_input');
  }
  p.urgentLocation = p.urgent ? cleanPoint(body.urgentLocation) : null;
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


const MAX_REQUEST_BYTES = 1700000;
const MAX_PHOTOS = 2;
const MAX_PHOTO_BYTES = 450000;
function photoAttachments(input) {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input) || input.length > MAX_PHOTOS) throw new Error('invalid_photos');
  return input.map((file, index) => {
    if (!file || typeof file !== 'object' || Array.isArray(file)) throw new Error('invalid_photos');
    const type = file.type;
    if (!['image/jpeg', 'image/png'].includes(type) || typeof file.data !== 'string' ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(file.data) || file.data.length > 610000) throw new Error('invalid_photos');
    const buf = Buffer.from(file.data,'base64');
    if (!buf.length || buf.length > MAX_PHOTO_BYTES || buf.toString('base64') !== file.data) throw new Error('invalid_photos');
    const jpeg = type === 'image/jpeg' && buf.length > 8 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff && buf[buf.length - 2] === 0xff && buf[buf.length - 1] === 0xd9;
    const png = type === 'image/png' && buf.length > 24 && buf.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && buf.subarray(buf.length-8,buf.length-4).toString('ascii') === 'IEND';
    if (!jpeg && !png) throw new Error('invalid_photos');
    return {filename:'Photo-devis-'+(index+1)+(jpeg?'.jpg':'.png'),content:buf,contentType:type};
  });
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
  const ccRaw = (process.env.QUOTE_CC_EMAIL || '').trim();
  const cc = ccRaw ? ccRaw.split(',').map(value => value.trim()) : [];
  const recipients = [to, ...cc];
  if (!host || /[^a-z0-9.-]/.test(host) || ![465, 587].includes(port) || !EMAIL.test(user) || !pass.trim() ||
      !mailbox(from) || recipients.some(value => !mailbox(value)) ||
      new Set(recipients.map(value => mailbox(value).toLowerCase())).size !== recipients.length) {
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
    from, to, cc: cc.length ? cc : undefined, recipients,
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


module.exports = async function devis(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  // Explicit CORS for PF Nettoyage's official mobile app only.
  const origin = String(req.headers && req.headers.origin || '');
  const allowedOrigins = new Set([
    'https://app.pfnettoyage.ch',
    'https://application.pfnettoyage.ch',
    'https://www.pfnettoyage.ch',
  ]);
  if (allowedOrigins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '600');
  }
  if (req.method === 'OPTIONS') {
    return res.status(allowedOrigins.has(origin) ? 204 : 403).end();
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }
  let body = req.body;
  let p;
  try {
    if (typeof body === 'string') {
      if (Buffer.byteLength(body, 'utf8') > MAX_REQUEST_BYTES) throw new Error('invalid_input');
      body = JSON.parse(body);
    }
    if (!body || typeof body !== 'object' || Array.isArray(body) || Buffer.byteLength(JSON.stringify(body), 'utf8') > MAX_REQUEST_BYTES) throw new Error('invalid_input');
    if (body.honey) return res.status(200).json({ ok: true, confirmation: 'skipped' });
    p = parseQuote(body);
    p.photos = photoAttachments(body.photos);
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
    'Intervention urgente : ' + (p.urgent ? 'Oui' : 'Non'), 'Créneau horaire souhaité : ' + p.preferredTime,
    ...(p.urgentLocation ? ['Lieu de l’intervention urgente : ' + pointText(p.urgentLocation)] : []),
    ...(p.location ? ['Lieu : ' + pointText(p.location)] : ['Départ : ' + pointText(p.from), 'Arrivée : ' + pointText(p.to)]),
    '', p.description, '', 'Demande sans engagement. Aucun rendez-vous confirmé automatiquement.',
  ].join('\n');
  let transport;
  try {
    const pdf = await createQuoteAttachment(p);
    if (!pdf || !Buffer.isBuffer(pdf.content) || pdf.content.length < 100 || pdf.content.subarray(0,5).toString() !== '%PDF-') {
      throw Object.assign(new Error('invalid_pdf'),{code:'EPDF'});
    }
    transport = createMailer(config.transport);
    const result = await sendWithDeadline(transport, {
      from: config.from, to: config.to, cc: config.cc,
      replyTo: p.email || undefined,
      subject: 'Demande de devis - ' + p.service,
      text: text + '\n\n' + privacyFooter, attachments: [pdf, ...p.photos],
    });
    // A confirmed primary recipient means the request was accepted.
    // Rejected optional CCs are logged separately to avoid telling the user to resend
    // and creating duplicate requests at the primary mailbox.
    assertAccepted(result, config.to);
    const missingCopies = (config.cc || []).filter(address => !result.accepted.some(accepted =>
      mailbox(String(accepted)).toLowerCase() === mailbox(address).toLowerCase())).length;
    if (missingCopies) console.error('quote_cc_not_accepted', { reference, missingCopies });
    console.log('quote_sent', { reference, accepted: true, recipientsAccepted: result.accepted.length, provider: 'smtp', pdfAttached: true, photoCount: p.photos.length });

    // Auto-acknowledgement only after the business mailbox has accepted the request.
    // It is optional: never claim a customer confirmation was sent if it failed.
    let confirmationSent = false;
    if (p.email) {
      try {
        // Use a separate connection: avoid impacting the accepted original message.
        const replyTransport = createMailer(config.transport);
        try {
          const customerReply = await sendWithDeadline(replyTransport, {
            from: config.from,
            to: p.email,
            replyTo: mailbox(config.from),
            subject: 'Confirmation de votre demande de devis – PF Nettoyage',
            text: [
              'Bonjour ' + p.name + ',',
              '',
              'Nous avons bien reçu votre demande de devis auprès de PF Nettoyage – Facility Services.',
              'Référence : ' + reference,
              'Un récapitulatif PDF de votre demande figure en pièce jointe.',
              '',
              'Notre équipe examinera votre demande et vous contactera prochainement.',
              'Votre demande est gratuite et sans engagement.',
              'La date d’intervention reste à confirmer.',
              '',
              'Cordialement,',
              'PF Nettoyage – Facility Services',
              'Téléphone : +41 79 967 02 95',
              'E-mail : devis@pfnettoyage.ch',
              'Site : https://www.pfnettoyage.ch',
              '',
              privacyFooter,
            ].join('\n'),
            attachments: [pdf],
          });
          assertAccepted(customerReply, p.email);
          confirmationSent = true;
          console.log('quote_customer_confirmation_sent', { reference, accepted: true });
        } finally {
          replyTransport.close();
        }
      } catch (confirmationError) {
        console.error('quote_customer_confirmation_failed', { reference, ...safeError(confirmationError) });
      }
    }
    return res.status(200).json({ ok: true, reference, confirmationSent, partialDelivery: missingCopies > 0 });
  } catch (error) {
    console.error('quote_send_failed', { reference, ...safeError(error) });
    return res.status(502).json({ ok: false, error: 'sending_failed' });
  } finally {
    if (transport && typeof transport.close === 'function') transport.close();
  }
};
