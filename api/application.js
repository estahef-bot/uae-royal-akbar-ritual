/**
 * Akbar Application endpoint (Vercel serverless function).
 *
 * Receives the "Akbar Application" form from index.html, validates it,
 * rate limits by client IP, and delivers it by email to info@royalakbar.ae
 * through the Resend REST API.
 *
 * Required environment variable (Vercel project settings):
 *   RESEND_API_KEY               API key used to send the email.
 *
 * Optional environment variables:
 *   APPLICATION_TO_EMAIL         Recipient mailbox.   Default: info@royalakbar.ae
 *   APPLICATION_FROM_EMAIL       Verified sender.     Default: Royal Akbar Ritual <applications@royalakbar.ae>
 *   APPLICATION_SUBJECT          Subject line; {name} is replaced with the applicant's name.
 *   APPLICATION_RATE_LIMIT       Submissions per IP per window.        Default: 5
 *   APPLICATION_RATE_WINDOW_MS   Rate-limit window in milliseconds.    Default: 3600000 (1 hour)
 *   UPSTASH_REDIS_REST_URL       Durable, cross-instance rate-limit store (optional but recommended).
 *   UPSTASH_REDIS_REST_TOKEN     Token for the store above.
 *
 * Privacy: no submitted form content is ever written to logs. Logs carry only
 * the outcome (accepted / rejected / provider failure) and the reason code.
 */
'use strict';

const MAX_BODY_BYTES = 8 * 1024;
const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const SEND_TIMEOUT_MS = 8000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const ALLOWED_REASONS = new Set(['akbar-application', 'other']);
const REASON_LABELS = {
  'akbar-application': 'Akbar Application',
  other: 'Other',
};

const GENERIC_ERROR =
  'We could not send your application. Please try again, or email info@royalakbar.ae directly.';

/**
 * Per-instance fallback counter. Vercel runs many isolated instances, so this
 * is only a backstop: set UPSTASH_REDIS_REST_URL to get a limit that holds
 * across the whole deployment.
 */
const hits = new Map();

function envInt(name, fallback) {
  const parsed = Number.parseInt(process.env[name], 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function config() {
  return {
    to: (process.env.APPLICATION_TO_EMAIL || 'info@royalakbar.ae').trim(),
    from: (
      process.env.APPLICATION_FROM_EMAIL || 'Royal Akbar Ritual <applications@royalakbar.ae>'
    ).trim(),
    subject: process.env.APPLICATION_SUBJECT || 'New Akbar Application — {name}',
    apiKey: (process.env.RESEND_API_KEY || '').trim(),
    limit: envInt('APPLICATION_RATE_LIMIT', 5),
    windowMs: envInt('APPLICATION_RATE_WINDOW_MS', 60 * 60 * 1000),
    redisUrl: (process.env.UPSTASH_REDIS_REST_URL || '').trim(),
    redisToken: (process.env.UPSTASH_REDIS_REST_TOKEN || '').trim(),
  };
}

function clientIp(req) {
  const forwarded = req.headers && req.headers['x-forwarded-for'];
  const first =
    typeof forwarded === 'string' && forwarded.length
      ? forwarded.split(',')[0].trim()
      : Array.isArray(forwarded) && forwarded.length
        ? String(forwarded[0]).split(',')[0].trim()
        : '';
  return first || (req.socket && req.socket.remoteAddress) || 'unknown';
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error('payload too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', () => reject(Object.assign(new Error('bad request'), { status: 400 })));
  });
}

async function parseSubmission(req) {
  const type = String((req.headers && req.headers['content-type']) || '').toLowerCase();
  if (!/^application\/(?:json|.*\+json)|^application\/x-www-form-urlencoded/.test(type)) {
    throw Object.assign(new Error('unsupported media type'), { status: 415 });
  }
  const raw = await readBody(req, MAX_BODY_BYTES);
  if (type.startsWith('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(raw));
  }
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (err) {
    throw Object.assign(new Error('invalid json'), { status: 400 });
  }
}

function clean(value, max) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ').trim().slice(0, max);
}

/** Returns { errors, data }. `errors` is empty when the submission is valid. */
function validate(payload) {
  const data = {
    name: clean(payload.name, 120),
    email: clean(payload.email, 254),
    reason: clean(payload.reason, 40),
    message: clean(payload.message, 2000),
  };
  const errors = {};

  if (data.name.length < 2) errors.name = 'Please enter your full name.';
  if (!EMAIL_RE.test(data.email) || data.email.length > 254) {
    errors.email = 'Please enter a valid email address.';
  }
  if (!ALLOWED_REASONS.has(data.reason)) errors.reason = 'Please choose a reason for your enquiry.';

  return { errors, data };
}

function memoryRateLimit(ip, limit, windowMs) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((ts) => now - ts < windowMs);
  if (recent.length >= limit) {
    hits.set(ip, recent);
    return { allowed: false, retryAfter: Math.ceil((windowMs - (now - recent[0])) / 1000) };
  }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) {
    for (const [key, stamps] of hits) {
      if (!stamps.some((ts) => now - ts < windowMs)) hits.delete(key);
    }
  }
  return { allowed: true, retryAfter: 0 };
}

/**
 * Durable limiter backed by Upstash Redis REST when configured. Fails open to
 * the in-memory limiter if the store is unreachable, so a Redis outage cannot
 * silently accept unlimited traffic nor hard-fail every submission.
 */
async function rateLimit(ip, cfg) {
  if (cfg.redisUrl && cfg.redisToken && cfg.limit > 0) {
    const key = `akbar-application:${ip}`;
    try {
      const res = await fetch(`${cfg.redisUrl}/pipeline`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cfg.redisToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([
          ['INCR', key],
          ['PEXPIRE', key, String(cfg.windowMs), 'NX'],
        ]),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });
      if (res.ok) {
        const [incr] = await res.json();
        const count = Number(incr && incr.result);
        if (Number.isFinite(count)) {
          return count > cfg.limit
            ? { allowed: false, retryAfter: Math.ceil(cfg.windowMs / 1000) }
            : { allowed: true, retryAfter: 0 };
        }
      }
    } catch (err) {
      /* fall through to the in-memory counter */
    }
  }
  return memoryRateLimit(ip, cfg.limit, cfg.windowMs);
}

function buildEmail(data, cfg) {
  const reason = REASON_LABELS[data.reason] || 'Other';
  const subject = cfg.subject.replace('{name}', data.name).replace('{reason}', reason);
  const lines = [
    'A new Akbar Application was submitted on royalakbar.ae.',
    '',
    `Full name: ${data.name}`,
    `Email:     ${data.email}`,
    `Reason:    ${reason}`,
    '',
    'Message:',
    data.message ? data.message : '(no message provided)',
    '',
    `Received:  ${new Date().toISOString()}`,
  ];
  return {
    from: cfg.from,
    to: [cfg.to],
    subject,
    reply_to: data.email,
    text: lines.join('\n'),
  };
}

async function sendEmail(message, apiKey) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      const err = new Error(`provider responded ${res.status}`);
      err.status = res.status === 429 ? 429 : 502;
      err.detail = detail.slice(0, 200);
      throw err;
    }
    await res.json().catch(() => ({}));
  } catch (err) {
    if (err.name === 'AbortError') {
      throw Object.assign(new Error('provider timeout'), { status: 504 });
    }
    if (!err.status) throw Object.assign(new Error('provider unreachable'), { status: 502 });
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function sendJson(res, status, body, extraHeaders) {
  const payload = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  Object.entries(extraHeaders || {}).forEach(([key, value]) => res.setHeader(key, value));
  res.end(payload);
}

function redirectBack(res, outcome) {
  res.statusCode = 303;
  res.setHeader('Location', `/?application=${outcome}#contact`);
  res.setHeader('Cache-Control', 'no-store');
  res.end();
}

async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Allow', 'POST');
    res.end();
    return;
  }
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: 'Method not allowed.' }, { Allow: 'POST' });
    return;
  }

  const cfg = config();
  if (!cfg.apiKey) {
    // Misconfiguration, not a visitor error: never leak the cause.
    console.error('[application] RESEND_API_KEY is not configured');
    sendJson(res, 503, { ok: false, error: GENERIC_ERROR });
    return;
  }

  let payload;
  try {
    payload = await parseSubmission(req);
  } catch (err) {
    sendJson(res, err.status || 400, { ok: false, error: GENERIC_ERROR });
    return;
  }

  const wantsJson = !String((req.headers && req.headers['content-type']) || '').includes(
    'x-www-form-urlencoded',
  );

  const ip = clientIp(req);
  const limit = await rateLimit(ip, cfg);
  if (!limit.allowed) {
    console.warn('[application] rate limited request');
    if (wantsJson) {
      sendJson(res, 429, { ok: false, error: 'rate_limited' }, { 'Retry-After': String(limit.retryAfter) });
    } else {
      redirectBack(res, 'rate_limited');
    }
    return;
  }

  const { errors, data } = validate(payload);
  if (Object.keys(errors).length) {
    if (wantsJson) sendJson(res, 422, { ok: false, errors });
    else redirectBack(res, 'invalid');
    return;
  }

  // Honeypot: real users never see this field. Accept silently so bots get no signal.
  if (clean(payload.company, 100)) {
    console.warn('[application] honeypot tripped; submission dropped');
    if (wantsJson) sendJson(res, 200, { ok: true });
    else redirectBack(res, 'received');
    return;
  }

  try {
    await sendEmail(buildEmail(data, cfg), cfg.apiKey);
  } catch (err) {
    console.error('[application] delivery failed:', err.status, err.detail || err.message);
    const status = err.status === 504 ? 504 : err.status === 429 ? 429 : 502;
    if (wantsJson) {
      sendJson(res, status, { ok: false, error: status === 429 ? 'rate_limited' : GENERIC_ERROR });
    } else {
      redirectBack(res, status === 429 ? 'rate_limited' : 'failed');
    }
    return;
  }

  console.log('[application] delivered to', cfg.to);
  if (wantsJson) sendJson(res, 200, { ok: true });
  else redirectBack(res, 'received');
}

module.exports = handler;
module.exports.validate = validate;
module.exports.buildEmail = buildEmail;
module.exports.rateLimit = rateLimit;
module.exports.config = config;
module.exports.resetRateLimit = () => hits.clear();
