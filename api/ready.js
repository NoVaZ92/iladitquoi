export default async function handler(_request, response) {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY } = process.env;
  const configured = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY && SUPABASE_ANON_KEY);
  response.setHeader('Cache-Control', 'no-store');
  if (!configured) return response.status(503).json({ status: 'configuration_required', configured: false });

  try {
    const upstream = await fetch(`${SUPABASE_URL}/rest/v1/anecdotes?select=id&limit=1`, {
      headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` }
    });
    if (!upstream.ok) return response.status(503).json({ status: 'dependency_unavailable', configured: true });
  } catch {
    return response.status(503).json({ status: 'dependency_unavailable', configured: true });
  }

  return response.status(200).json({ status: 'ready', configured: true });
}
