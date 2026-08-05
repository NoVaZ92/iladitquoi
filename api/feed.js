export default async function handler(request, response) {
  if (request.method !== 'GET') return response.status(405).json({ error: 'method_not_allowed' });
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return response.status(503).json({ error: 'service_not_configured' });

  const query = new URLSearchParams({
    select: 'id,author_label,profession,theme,body,vote_score,published_at',
    visibility: 'eq.public',
    moderation_status: 'eq.published',
    order: 'vote_score.desc,published_at.desc',
    limit: '50'
  });
  const upstream = await fetch(`${SUPABASE_URL}/rest/v1/anecdotes?${query}`, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
    }
  });
  if (!upstream.ok) return response.status(502).json({ error: 'feed_unavailable' });
  response.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
  return response.status(200).json({ anecdotes: await upstream.json() });
}
