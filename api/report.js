import { authenticateRequest } from '../lib/auth-user.js';
import { getSupabaseAdminHeaders, getSupabaseConfig } from '../lib/supabase-config.js';
import { enforceRateLimit, RATE_LIMITS } from '../lib/rate-limit.js';
import voteHandler from '../lib/vote-handler.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REPORT_REASONS = Object.freeze({
  identification: 'Une personne ou un lieu peut être identifié',
  sensitive_data: 'Donnée de santé ou information personnelle sensible',
  inappropriate: 'Contenu inapproprié, agressif ou discriminatoire',
  other: 'Autre problème de modération'
});

function normalizedReason(code, details) {
  const label = REPORT_REASONS[code];
  const note = typeof details === 'string' ? details.trim().replace(/\s+/g, ' ').slice(0, 350) : '';
  if (!label || (code === 'other' && note.length < 3)) return '';
  return note ? `${label} : ${note}`.slice(0, 500) : label;
}

export default async function handler(request, response) {
  if (request.query?.action === 'vote') return voteHandler(request, response);
  if (request.method !== 'POST') return response.status(405).json({ error: 'method_not_allowed' });
  const { url, publishableKey, secretKey } = getSupabaseConfig();
  if (!url || !secretKey) return response.status(503).json({ error: 'service_not_configured' });

  const body = typeof request.body === 'object' && request.body ? request.body : {};
  const anecdoteId = typeof body.anecdoteId === 'string' ? body.anecdoteId : '';
  const reason = normalizedReason(body.reasonCode, body.details);
  if (!UUID_PATTERN.test(anecdoteId) || !reason) {
    return response.status(422).json({ error: 'invalid_report' });
  }

  const identity = await authenticateRequest(request, { url, publishableKey });
  if (identity.status === 'invalid') return response.status(401).json({ error: 'invalid_session' });
  if (identity.status === 'unavailable') return response.status(502).json({ error: 'authentication_unavailable' });
  if (!await enforceRateLimit(request, response, {
    url,
    secretKey,
    userId: identity.user?.id,
    rule: RATE_LIMITS.report
  })) return;

  const anecdoteQuery = new URLSearchParams({
    id: `eq.${anecdoteId}`,
    visibility: 'eq.public',
    moderation_status: 'eq.published',
    select: 'id',
    limit: '1'
  });
  try {
    const anecdoteResponse = await fetch(`${url}/rest/v1/anecdotes?${anecdoteQuery}`, {
      headers: getSupabaseAdminHeaders(secretKey),
      signal: AbortSignal.timeout(5000)
    });
    if (!anecdoteResponse.ok) return response.status(502).json({ error: 'report_failed' });
    const [anecdote] = await anecdoteResponse.json();
    if (!anecdote) return response.status(404).json({ error: 'anecdote_not_found' });
  } catch {
    return response.status(502).json({ error: 'report_failed' });
  }

  if (identity.user?.id) {
    const duplicateQuery = new URLSearchParams({
      select: 'id',
      anecdote_id: `eq.${anecdoteId}`,
      reporter_id: `eq.${identity.user.id}`,
      resolved_at: 'is.null',
      limit: '1'
    });
    try {
      const existing = await fetch(`${url}/rest/v1/reports?${duplicateQuery}`, {
        headers: getSupabaseAdminHeaders(secretKey),
        signal: AbortSignal.timeout(5000)
      });
      if (!existing.ok) return response.status(502).json({ error: 'report_failed' });
      if ((await existing.json()).length) return response.status(200).json({ status: 'already_reported' });
    } catch {
      return response.status(502).json({ error: 'report_failed' });
    }
  }

  const payload = {
    anecdote_id: anecdoteId,
    reporter_id: identity.user?.id || null,
    reason
  };
  try {
    const upstream = await fetch(`${url}/rest/v1/reports`, {
      method: 'POST',
      headers: {
        ...getSupabaseAdminHeaders(secretKey),
        'content-type': 'application/json',
        prefer: 'return=minimal'
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000)
    });
    if (!upstream.ok) return response.status(502).json({ error: 'report_failed' });
    return response.status(201).json({ status: 'reported' });
  } catch {
    return response.status(502).json({ error: 'report_failed' });
  }
}
