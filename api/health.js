import { getSupabaseAdminHeaders, getSupabaseConfig } from '../lib/supabase-config.js';
import { createHash } from 'node:crypto';

function rateLimitProbe() {
  const minute = new Date().toISOString().slice(0, 16);
  return {
    p_action: 'readiness_probe',
    p_subject_hash: createHash('sha256').update(`iladitquoi:${minute}`).digest('hex'),
    p_limit: 10000,
    p_window_seconds: 120
  };
}

async function readiness(response) {
  const { url, publishableKey, secretKey } = getSupabaseConfig();
  const configured = Boolean(url && publishableKey && secretKey);
  response.setHeader('Cache-Control', 'no-store');
  if (!configured) return response.status(503).json({ status: 'configuration_required', configured: false });

  try {
    const schemaQueries = [
      '/rest/v1/anecdotes?select=id,display_anonymously&limit=1',
      '/rest/v1/profiles?select=public_slug,active_frame_key&limit=1',
      '/rest/v1/badge_definitions?select=badge_key&limit=1'
    ];
    for (const query of schemaQueries) {
      const upstream = await fetch(`${url}${query}`, {
        headers: getSupabaseAdminHeaders(secretKey),
        signal: AbortSignal.timeout(5000)
      });
      if (upstream.status === 401 || upstream.status === 403) {
        return response.status(503).json({ status: 'credentials_invalid', configured: true });
      }
      if (upstream.status === 400 || upstream.status === 404) {
        return response.status(503).json({ status: 'schema_required', configured: true });
      }
      if (!upstream.ok) return response.status(503).json({ status: 'dependency_unavailable', configured: true });
    }

    const checks = [
      { rpc: 'rate_limit_ready', body: {}, status: 'rate_limit_structure_unavailable', valid: (body) => body === true },
      { rpc: 'consume_rate_limit', body: rateLimitProbe(), status: 'rate_limit_write_unavailable', valid: (body) => Array.isArray(body) && body[0]?.allowed === true },
      { rpc: 'account_deletion_ready', body: {}, status: 'account_deletion_unavailable', valid: (body) => body === true }
    ];
    for (const check of checks) {
      const health = await fetch(`${url}/rest/v1/rpc/${check.rpc}`, {
        method: 'POST',
        headers: { ...getSupabaseAdminHeaders(secretKey), 'content-type': 'application/json' },
        body: JSON.stringify(check.body),
        signal: AbortSignal.timeout(5000)
      });
      if (health.status === 401 || health.status === 403) {
        return response.status(503).json({ status: 'credentials_invalid', configured: true });
      }
      if (health.status === 404) {
        return response.status(503).json({ status: 'schema_required', configured: true });
      }
      if (!health.ok || !check.valid(await health.json())) {
        return response.status(503).json({ status: check.status, configured: true });
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
