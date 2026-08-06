import { createHmac } from 'node:crypto';
import { getSupabaseAdminHeaders } from './supabase-config.js';

export const RATE_LIMITS = Object.freeze({
  publicSubmission: {
    action: 'public_submission',
    ip: { limit: 30, windowSeconds: 3600 },
    account: { limit: 8, windowSeconds: 600 }
  },
  privateNote: {
    action: 'private_note',
    ip: { limit: 180, windowSeconds: 3600 },
    account: { limit: 60, windowSeconds: 3600 }
  },
  vote: {
    action: 'vote',
    ip: { limit: 600, windowSeconds: 300 },
    account: { limit: 120, windowSeconds: 300 }
  },
  report: {
    action: 'report',
    ip: { limit: 30, windowSeconds: 3600 },
    account: { limit: 10, windowSeconds: 3600 }
  },
  privateShare: {
    action: 'private_share',
    ip: { limit: 90, windowSeconds: 3600 },
    account: { limit: 30, windowSeconds: 3600 }
  },
  accountDeletion: {
    action: 'account_deletion',
    ip: { limit: 3, windowSeconds: 86400 },
    account: { limit: 3, windowSeconds: 86400 }
  }
});

function headerValue(headers, name) {
  if (!headers) return '';
  if (typeof headers.get === 'function') return headers.get(name) || '';
  return headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()] || '';
}

function clientIp(request) {
  const forwarded =
    headerValue(request.headers, 'x-vercel-forwarded-for') ||
    headerValue(request.headers, 'x-forwarded-for') ||
    headerValue(request.headers, 'x-real-ip') ||
    request.socket?.remoteAddress ||
    'unknown';
  return String(forwarded).split(',')[0].trim().slice(0, 128) || 'unknown';
}

function subjectHash(type, value, secretKey) {
  return createHmac('sha256', secretKey).update(`${type}:${value}`).digest('hex');
}

async function consumeBucket({ url, secretKey, action, type, value, rule }) {
  try {
    const upstream = await fetch(`${url}/rest/v1/rpc/consume_rate_limit`, {
      method: 'POST',
      headers: {
        ...getSupabaseAdminHeaders(secretKey),
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        p_action: `${action}:${type}`,
        p_subject_hash: subjectHash(type, value, secretKey),
        p_limit: rule.limit,
        p_window_seconds: rule.windowSeconds
      }),
      signal: AbortSignal.timeout(3000)
    });
    if (!upstream.ok) return { allowed: false, unavailable: true };
    const payload = await upstream.json();
    const result = Array.isArray(payload) ? payload[0] : payload;
    if (result?.allowed === true) return { allowed: true };
    if (result?.allowed === false) {
      return { allowed: false, retryAfter: Math.max(1, Number(result.retry_after_seconds) || 1) };
    }
    return { allowed: false, unavailable: true };
  } catch {
    return { allowed: false, unavailable: true };
  }
}

export async function enforceRateLimit(request, response, { url, secretKey, userId = '', rule }) {
  if (!url || !secretKey || !rule) return true;
  const checks = [consumeBucket({
    url,
    secretKey,
    action: rule.action,
    type: 'ip',
    value: clientIp(request),
    rule: rule.ip
  })];
  if (userId && rule.account) {
    checks.push(consumeBucket({
      url,
      secretKey,
      action: rule.action,
      type: 'account',
      value: userId,
      rule: rule.account
    }));
  }

  const results = await Promise.all(checks);
  if (results.some((result) => result.unavailable)) {
    response.setHeader('Cache-Control', 'no-store');
    response.status(503).json({ error: 'rate_limit_unavailable' });
    return false;
  }
  const denied = results.filter((result) => !result.allowed);
  if (!denied.length) return true;

  const retryAfter = Math.max(...denied.map((result) => result.retryAfter || 1));
  response.setHeader('Retry-After', String(retryAfter));
  response.setHeader('Cache-Control', 'no-store');
  response.status(429).json({ error: 'rate_limit_exceeded', retryAfter });
  return false;
}
