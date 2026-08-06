import { createHash, randomBytes } from 'node:crypto';
import { authenticateRequest } from '../lib/auth-user.js';
import { getSupabaseAdminHeaders, getSupabaseConfig } from '../lib/supabase-config.js';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{24,128}$/;

function tokenHash(token) {
  return createHash('sha256').update(token).digest('hex');
}

export default async function handler(request, response) {
  const { url, publishableKey, secretKey } = getSupabaseConfig();
  if (!url || !secretKey) return response.status(503).json({ error: 'service_not_configured' });
  const headers = getSupabaseAdminHeaders(secretKey);

  if (request.method === 'POST') {
    const identity = await authenticateRequest(request, { url, publishableKey });
    if (identity.status === 'absent') return response.status(401).json({ error: 'authentication_required' });
    if (identity.status === 'invalid') return response.status(401).json({ error: 'invalid_session' });
    if (identity.status === 'unavailable') return response.status(502).json({ error: 'authentication_unavailable' });
    const anecdoteId = typeof request.body?.anecdoteId === 'string' ? request.body.anecdoteId : '';
    if (!anecdoteId) return response.status(422).json({ error: 'invalid_anecdote' });

    const anecdoteQuery = new URLSearchParams({
      id: `eq.${anecdoteId}`,
      author_id: `eq.${identity.user.id}`,
      visibility: 'eq.private',
      select: 'id',
      limit: '1'
    });
    try {
      const ownerResponse = await fetch(`${url}/rest/v1/anecdotes?${anecdoteQuery}`, { headers, signal: AbortSignal.timeout(5000) });
      if (!ownerResponse.ok) return response.status(502).json({ error: 'anecdote_unavailable' });
      const [anecdote] = await ownerResponse.json();
      if (!anecdote) return response.status(404).json({ error: 'anecdote_not_found' });

      const token = randomBytes(24).toString('base64url');
      const linkResponse = await fetch(`${url}/rest/v1/private_share_links`, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ anecdote_id: anecdote.id, token_hash: tokenHash(token) }),
        signal: AbortSignal.timeout(5000)
      });
      if (!linkResponse.ok) return response.status(502).json({ error: 'link_unavailable' });
      response.setHeader('Cache-Control', 'no-store');
      return response.status(201).json({ token });
    } catch {
      return response.status(502).json({ error: 'link_unavailable' });
    }
  }

  if (request.method !== 'GET') return response.status(405).json({ error: 'method_not_allowed' });
  const token = typeof request.query?.token === 'string' ? request.query.token : '';
  if (!TOKEN_PATTERN.test(token)) return response.status(404).json({ error: 'share_not_found' });

  const linkQuery = new URLSearchParams({ token_hash: `eq.${tokenHash(token)}`, revoked_at: 'is.null', select: 'anecdote_id,expires_at', limit: '1' });
  try {
    const linkResponse = await fetch(`${url}/rest/v1/private_share_links?${linkQuery}`, { headers, signal: AbortSignal.timeout(5000) });
    if (!linkResponse.ok) return response.status(502).json({ error: 'share_unavailable' });
    const [link] = await linkResponse.json();
    if (!link || (link.expires_at && new Date(link.expires_at) <= new Date())) return response.status(404).json({ error: 'share_not_found' });

    const anecdoteQuery = new URLSearchParams({
      id: `eq.${link.anecdote_id}`,
      visibility: 'eq.private',
      select: 'id,profession,theme,body,submitted_at',
      limit: '1'
    });
    const anecdoteResponse = await fetch(`${url}/rest/v1/anecdotes?${anecdoteQuery}`, { headers, signal: AbortSignal.timeout(5000) });
    if (!anecdoteResponse.ok) return response.status(502).json({ error: 'share_unavailable' });
    const [anecdote] = await anecdoteResponse.json();
    if (!anecdote) return response.status(404).json({ error: 'share_not_found' });
    response.setHeader('Cache-Control', 'private, no-store');
    return response.status(200).json({ anecdote: { ...anecdote, author_label: 'Note privée partagée', private_share: true } });
  } catch {
    return response.status(502).json({ error: 'share_unavailable' });
  }
}
