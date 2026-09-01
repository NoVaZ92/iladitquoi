import { getSupabaseAdminHeaders, getSupabaseConfig } from '../lib/supabase-config.js';
import { loadPublicAuthors, serializePublicAnecdote } from '../lib/public-profile.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function handler(request, response) {
  if (request.method !== 'GET') return response.status(405).json({ error: 'method_not_allowed' });
  const id = typeof request.query?.id === 'string' ? request.query.id : '';
  if (!UUID_PATTERN.test(id)) return response.status(400).json({ error: 'invalid_id' });

  const { url, secretKey } = getSupabaseConfig();
  if (!url || !secretKey) return response.status(503).json({ error: 'service_not_configured' });
  const query = new URLSearchParams({
    id: `eq.${id}`,
    select: 'id,author_id,author_label,profession,theme,body,vote_score,published_at,submitted_at,display_anonymously',
    visibility: 'eq.public',
    moderation_status: 'eq.published',
    limit: '1'
  });

  try {
    const upstream = await fetch(`${url}/rest/v1/anecdotes?${query}`, {
      headers: getSupabaseAdminHeaders(secretKey),
      signal: AbortSignal.timeout(5000)
    });
    if (!upstream.ok) return response.status(502).json({ error: 'anecdote_unavailable' });
    const [anecdote] = await upstream.json();
    response.setHeader('Cache-Control', 'no-store');
    const authorsById = anecdote ? await loadPublicAuthors({ url, secretKey, anecdotes: [anecdote] }) : new Map();
    return anecdote
      ? response.status(200).json({ anecdote: serializePublicAnecdote(anecdote, authorsById) })
      : response.status(404).json({ error: 'anecdote_not_found' });
  } catch {
    return response.status(502).json({ error: 'anecdote_unavailable' });
  }
}
