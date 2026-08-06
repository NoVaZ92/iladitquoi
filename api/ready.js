import { getSupabaseAdminHeaders, getSupabaseConfig } from '../lib/supabase-config.js';

export default async function handler(_request, response) {
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

    const rateLimitHealth = await fetch(`${url}/rest/v1/rpc/rate_limit_ready`, {
      method: 'POST',
      headers: { ...getSupabaseAdminHeaders(secretKey), 'content-type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(5000)
    });
    if (rateLimitHealth.status === 401 || rateLimitHealth.status === 403) {
      return response.status(503).json({ status: 'credentials_invalid', configured: true });
    }
    if (rateLimitHealth.status === 404) {
      return response.status(503).json({ status: 'schema_required', configured: true });
    }
    if (!rateLimitHealth.ok || await rateLimitHealth.json() !== true) {
      return response.status(503).json({ status: 'dependency_unavailable', configured: true });
    }

    const accountDeletionHealth = await fetch(`${url}/rest/v1/rpc/account_deletion_ready`, {
      method: 'POST',
      headers: { ...getSupabaseAdminHeaders(secretKey), 'content-type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(5000)
    });
    if (accountDeletionHealth.status === 401 || accountDeletionHealth.status === 403) {
      return response.status(503).json({ status: 'credentials_invalid', configured: true });
    }
    if (accountDeletionHealth.status === 404) {
      return response.status(503).json({ status: 'schema_required', configured: true });
    }
    if (!accountDeletionHealth.ok || await accountDeletionHealth.json() !== true) {
      return response.status(503).json({ status: 'dependency_unavailable', configured: true });
    }
  } catch {
    return response.status(503).json({ status: 'dependency_unavailable', configured: true });
  }

  return response.status(200).json({ status: 'ready', configured: true });
}
