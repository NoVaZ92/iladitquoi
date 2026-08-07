import { getSupabaseAdminHeaders, getSupabaseConfig } from '../lib/supabase-config.js';

function boundedInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

export default async function handler(request, response) {
  if (request.method !== 'GET') return response.status(405).json({ error: 'method_not_allowed' });
  const { url, secretKey } = getSupabaseConfig();
  if (!url || !secretKey) return response.status(503).json({ error: 'service_not_configured' });
  const sort = request.query?.sort === 'new' ? 'new' : 'top';
  const page = boundedInteger(request.query?.page, 0, 0, 1000);
  const limit = boundedInteger(request.query?.limit, 20, 5, 50);

  const query = new URLSearchParams({
    select: 'id,author_label,profession,theme,body,vote_score,published_at,submitted_at',
    visibility: 'eq.public',
    moderation_status: 'eq.published',
    order: sort === 'new'
      ? 'published_at.desc.nullslast,submitted_at.desc,id.desc'
      : 'vote_score.desc,published_at.desc.nullslast,submitted_at.desc,id.desc',
    offset: String(page * limit),
    limit: String(limit + 1)
  });
  let upstream;
  try {
    upstream = await fetch(`${url}/rest/v1/anecdotes?${query}`, {
      headers: getSupabaseAdminHeaders(secretKey),
      signal: AbortSignal.timeout(5000)
    });
  } catch {
    return response.status(502).json({ error: 'feed_unavailable' });
  }
  if (!upstream.ok) return response.status(502).json({ error: 'feed_unavailable' });
  response.setHeader('Cache-Control', 'no-store');
  const anecdotes = await upstream.json();
  return response.status(200).json({
    anecdotes: anecdotes.slice(0, limit),
    page,
    hasMore: anecdotes.length > limit
  });
}
