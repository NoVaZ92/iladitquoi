import { authenticateRequest } from '../lib/auth-user.js';
import { getSupabaseAdminHeaders, getSupabaseConfig } from '../lib/supabase-config.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'method_not_allowed' });
  const { url, publishableKey, secretKey } = getSupabaseConfig();
  if (!url || !secretKey) return response.status(503).json({ error: 'service_not_configured' });

  const body = typeof request.body === 'object' && request.body ? request.body : {};
  const anecdoteId = typeof body.anecdoteId === 'string' ? body.anecdoteId : '';
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (!UUID_PATTERN.test(anecdoteId) || reason.length < 3 || reason.length > 500) {
    return response.status(422).json({ error: 'invalid_report' });
  }

  const identity = await authenticateRequest(request, { url, publishableKey });
  if (identity.status === 'invalid') return response.status(401).json({ error: 'invalid_session' });
  if (identity.status === 'unavailable') return response.status(502).json({ error: 'authentication_unavailable' });

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
