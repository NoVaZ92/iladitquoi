import { getSupabaseAdminHeaders, getSupabaseConfig } from '../lib/supabase-config.js';

export default async function handler(request, response) {
  if (request.method !== 'GET') return response.status(405).json({ error: 'method_not_allowed' });
  const { url, secretKey } = getSupabaseConfig();
  if (!url || !secretKey) return response.status(503).json({ error: 'service_not_configured' });
  const sort = request.query?.sort === 'new' ? 'new' : 'top';

  const query = new URLSearchParams({
    select: 'id,author_label,profession,theme,body,vote_score,published_at,submitted_at',
    visibility: 'eq.public',
    moderation_status: 'eq.published',
    order: sort === 'new'
      ? 'published_at.desc.nullslast,submitted_at.desc'
      : 'vote_score.desc,published_at.desc.nullslast,submitted_at.desc',
    limit: '100'
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
  return response.status(200).json({ anecdotes: await upstream.json() });
}
