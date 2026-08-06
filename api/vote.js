import { authenticateRequest } from '../lib/auth-user.js';
import { getSupabaseConfig } from '../lib/supabase-config.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'method_not_allowed' });
  const { url, publishableKey } = getSupabaseConfig();
  if (!url || !publishableKey) return response.status(503).json({ error: 'service_not_configured' });

  const body = typeof request.body === 'object' && request.body ? request.body : {};
  const anecdoteId = typeof body.anecdoteId === 'string' ? body.anecdoteId : '';
  const value = body.value === 1 || body.value === -1 ? body.value : 0;
  if (!UUID_PATTERN.test(anecdoteId) || !value) return response.status(422).json({ error: 'invalid_vote' });

  const identity = await authenticateRequest(request, { url, publishableKey });
  if (identity.status === 'absent') return response.status(401).json({ error: 'authentication_required' });
  if (identity.status === 'invalid') return response.status(401).json({ error: 'invalid_session' });
  if (identity.status === 'unavailable') return response.status(502).json({ error: 'authentication_unavailable' });

  const authorization = request.headers?.authorization || request.headers?.Authorization;
  try {
    const upstream = await fetch(`${url}/rest/v1/rpc/cast_anecdote_vote`, {
      method: 'POST',
      headers: { apikey: publishableKey, authorization, 'content-type': 'application/json' },
      body: JSON.stringify({ p_anecdote_id: anecdoteId, p_value: value }),
      signal: AbortSignal.timeout(5000)
    });
    if (upstream.status === 401 || upstream.status === 403) return response.status(403).json({ error: 'vote_forbidden' });
    if (!upstream.ok) return response.status(502).json({ error: 'vote_unavailable' });
    const [result] = await upstream.json();
    if (!result) return response.status(502).json({ error: 'vote_unavailable' });
    response.setHeader('Cache-Control', 'no-store');
    return response.status(200).json({ voteScore: result.vote_score, userVote: result.user_vote || 0 });
  } catch {
    return response.status(502).json({ error: 'vote_unavailable' });
  }
}
