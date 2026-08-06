import { getSupabaseAdminHeaders, getSupabaseConfig } from '../lib/supabase-config.js';

async function readiness(response) {
  const { url, publishableKey, secretKey } = getSupabaseConfig();
  const configured = Boolean(url && publishableKey && secretKey);
  response.setHeader('Cache-Control', 'no-store');
  if (!configured) return response.status(503).json({ status: 'configuration_required', configured: false });

  try {
    const upstream = await fetch(`${url}/rest/v1/anecdotes?select=id&limit=1`, {
      headers: getSupabaseAdminHeaders(secretKey),
      signal: AbortSignal.timeout(5000)
    });
    if (upstream.status === 401 || upstream.status === 403) {
      return response.status(503).json({ status: 'credentials_invalid', configured: true });
    }
    if (upstream.status === 404) {
      return response.status(503).json({ status: 'schema_required', configured: true });
    }
    if (!upstream.ok) return response.status(503).json({ status: 'dependency_unavailable', configured: true });

    for (const rpc of ['rate_limit_ready', 'account_deletion_ready']) {
      const health = await fetch(`${url}/rest/v1/rpc/${rpc}`, {
        method: 'POST',
        headers: { ...getSupabaseAdminHeaders(secretKey), 'content-type': 'application/json' },
        body: '{}',
        signal: AbortSignal.timeout(5000)
      });
      if (health.status === 401 || health.status === 403) {
        return response.status(503).json({ status: 'credentials_invalid', configured: true });
      }
      if (health.status === 404) {
        return response.status(503).json({ status: 'schema_required', configured: true });
      }
      if (!health.ok || await health.json() !== true) {
        return response.status(503).json({ status: 'dependency_unavailable', configured: true });
      }
    }
  } catch {
    return response.status(503).json({ status: 'dependency_unavailable', configured: true });
  }

  return response.status(200).json({ status: 'ready', configured: true });
}

export default async function handler(request, response) {
  if (request.query?.ready === '1') return readiness(response);
  response.status(200).json({ status: 'ok', service: 'iladitquoi' });
}
