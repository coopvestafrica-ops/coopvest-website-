/**
 * Contact form handler - POST /api/contact
 *
 * Delivers website enquiries by email. Two delivery paths are supported so the
 * site can reuse whichever mail setup is already in place:
 *
 *   1. Resend HTTP API  - used when RESEND_API_KEY is set. No dependencies.
 *   2. SMTP             - used when SMTP_HOST/SMTP_USER/SMTP_PASS are set,
 *                         matching the backend's existing Gmail configuration.
 *
 * Environment variables:
 *   RESEND_API_KEY   enables delivery via Resend
 *   SMTP_HOST        e.g. smtp.gmail.com
 *   SMTP_PORT        e.g. 465 (default 465; 587 switches to STARTTLS)
 *   SMTP_SECURE      "true" for implicit TLS on 465 (default true)
 *   SMTP_USER        the sending mailbox
 *   SMTP_PASS        the mailbox password or app password
 *   CONTACT_TO       where enquiries are delivered (default coopvestafrica@gmail.com)
 *   CONTACT_FROM     sender (default "Coopvest Website <coopvestafrica@gmail.com>")
 *   CONTACT_REPLY_TO optional Reply-To (default: the enquirer's own address)
 *   ALLOWED_ORIGINS  optional comma-separated extra origins allowed to post
 *
 * If no provider is configured the endpoint returns 503 rather than telling the
 * visitor their message was sent when it was not.
 *
 * The form is public, so the handler is deliberately defensive: it validates and
 * length-caps every field, ignores the honeypot, rate-limits per client, and
 * never echoes configuration or provider errors back to the caller.
 */

const MAX = {
  name: 120,
  email: 200,
  phone: 40,
  topic: 120,
  message: 5000,
};

const TOPICS = new Set([
  'Join by Direct Deposit (pay myself)',
  'Join through my employer (Salary Deduction)',
  'Employer / institution partnership',
  'Existing account or contribution query',
  'Loan enquiry',
  'Media or other enquiry',
]);

// Best-effort in-memory limiter. Serverless instances are recycled and may run
// in parallel, so this stops casual abuse rather than a determined attacker.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const hits = new Map();

function rateLimited(key) {
  const now = Date.now();
  const recent = (hits.get(key) || []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);

  if (hits.size > 5000) {
    for (const [k, times] of hits) {
      if (!times.some((t) => now - t < WINDOW_MS)) hits.delete(k);
    }
  }
  return recent.length > MAX_PER_WINDOW;
}

function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

/** Allow same-origin posts plus any explicitly configured origins. */
function originAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // same-origin fetches and tooling omit Origin

  let host;
  try {
    host = new URL(origin).host;
  } catch {
    return false;
  }

  if (req.headers.host && host === req.headers.host) return true;

  const extra = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => {
      try {
        return new URL(value).host;
      } catch {
        return value;
      }
    });

  return extra.includes(host);
}

function clean(value, limit) {
  if (typeof value !== 'string') return '';
  // Strip control characters so nothing can be smuggled into mail headers.
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, limit);
}

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function badRequest(res, errors) {
  return res.status(400).json({ ok: false, error: 'validation_failed', errors });
}

function fromHeader() {
  return process.env.CONTACT_FROM || 'Coopvest Website <coopvestafrica@gmail.com>';
}

/** Which delivery path is configured, if any. */
function provider() {
  if (process.env.RESEND_API_KEY) return 'resend';
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) return 'smtp';
  return null;
}

async function deliverViaResend({ to, replyTo, subject, text, html }) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromHeader(),
      to: [to],
      reply_to: replyTo,
      subject,
      text,
      html,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`resend ${response.status} ${detail.slice(0, 300)}`);
  }
}

async function deliverViaSmtp({ to, replyTo, subject, text, html }) {
  // Imported lazily so the module loads (and the Resend path works) even in an
  // environment where nodemailer is not installed.
  const nodemailer = await import('nodemailer');

  const port = Number(process.env.SMTP_PORT || 465);
  const transporter = nodemailer.default.createTransport({
    host: process.env.SMTP_HOST,
    port,
    // 465 is implicit TLS; 587 upgrades with STARTTLS.
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: fromHeader(),
    to,
    replyTo,
    subject,
    text,
    html,
  });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  if (!originAllowed(req)) {
    return res.status(403).json({ ok: false, error: 'origin_not_allowed' });
  }

  if (rateLimited(clientIp(req))) {
    return res.status(429).json({
      ok: false,
      error: 'too_many_requests',
      message: 'Too many messages. Please try again later.',
    });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ ok: false, error: 'invalid_json' });
    }
  }
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ ok: false, error: 'invalid_body' });
  }

  // Honeypot: a hidden field real users never fill. Report success so bots do
  // not learn they were filtered.
  if (clean(body.website, 100)) {
    return res.status(200).json({ ok: true });
  }

  const name = clean(body.name, MAX.name);
  const email = clean(body.email, MAX.email);
  const phone = clean(body.phone, MAX.phone);
  const topic = clean(body.topic, MAX.topic);
  const message = clean(body.message, MAX.message);

  const errors = {};
  if (name.length < 2) errors.name = 'Please enter your full name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) errors.email = 'Enter a valid email address.';
  if (phone && !/^[+()\d\s-]{7,20}$/.test(phone)) errors.phone = 'Enter a valid phone number.';
  if (!TOPICS.has(topic)) errors.topic = 'Please choose what your message is about.';
  if (message.length < 10) errors.message = 'Please add a little more detail.';

  if (Object.keys(errors).length) return badRequest(res, errors);

  const to = process.env.CONTACT_TO || 'coopvestafrica@gmail.com';
  const replyTo = process.env.CONTACT_REPLY_TO || email;
  const via = provider();

  if (!via) {
    // Fail loudly rather than telling the visitor their message was sent.
    console.error('contact: no mail provider configured (set RESEND_API_KEY or SMTP_*)');
    return res.status(503).json({
      ok: false,
      error: 'email_not_configured',
      message:
        'Our contact form is not accepting messages yet. Please email coopvestafrica@gmail.com directly.',
    });
  }

  const subject = `[Website] ${topic}: ${name}`;
  const text = [
    'New enquiry from the Coopvest Africa website',
    '',
    `Name:    ${name}`,
    `Email:   ${email}`,
    phone && `Phone:   ${phone}`,
    `Topic:   ${topic}`,
    '',
    message,
  ]
    .filter(Boolean)
    .join('\n');

  const html = `
    <h2 style="font-family:sans-serif">New website enquiry</h2>
    <table cellpadding="6" style="font-family:sans-serif;font-size:14px;border-collapse:collapse">
      <tr><td><strong>Name</strong></td><td>${escapeHtml(name)}</td></tr>
      <tr><td><strong>Email</strong></td><td>${escapeHtml(email)}</td></tr>
      ${phone ? `<tr><td><strong>Phone</strong></td><td>${escapeHtml(phone)}</td></tr>` : ''}
      <tr><td><strong>Topic</strong></td><td>${escapeHtml(topic)}</td></tr>
    </table>
    <p style="font-family:sans-serif;font-size:14px;white-space:pre-wrap;margin-top:16px">${escapeHtml(message)}</p>
  `;

  try {
    const payload = { to, replyTo, subject, text, html };
    if (via === 'resend') {
      await deliverViaResend(payload);
    } else {
      await deliverViaSmtp(payload);
    }
  } catch (err) {
    // Log for operators; never return provider detail to the visitor.
    console.error(`contact: delivery via ${via} failed:`, err && err.message);
    return res.status(502).json({
      ok: false,
      error: 'delivery_failed',
      message:
        'We could not send your message just now. Please email coopvestafrica@gmail.com directly.',
    });
  }

  return res.status(200).json({ ok: true });
}
