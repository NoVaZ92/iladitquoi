import { getSupabaseAdminHeaders } from '../../lib/supabase-config.js';
import { getModeratorContext } from '../../lib/moderator.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'method_not_allowed' });
  const context = await getModeratorContext(request);
  if (context.error) return response.status(context.status).json({ error: context.error });
  const reportId = typeof request.body?.reportId === 'string' ? request.body.reportId : '';
  if (!UUID_PATTERN.test(reportId)) return response.status(422).json({ error: 'invalid_report' });

  const { config, identity } = context;
  try {
    const upstream = await fetch(`${config.url}/rest/v1/reports?${new URLSearchParams({ id: `eq.${reportId}`, resolved_at: 'is.null' })}`, {
      method: 'PATCH',
      headers: { ...getSupabaseAdminHeaders(config.secretKey), 'content-type': 'application/json', prefer: 'return=representation' },
      body: JSON.stringify({ resolved_at: new Date().toISOString(), resolved_by: identity.user.id }),
      signal: AbortSignal.timeout(5000)
    });
    if (!upstream.ok) return response.status(502).json({ error: 'report_resolution_failed' });
    const [report] = await upstream.json();
    return report ? response.status(200).json({ report }) : response.status(404).json({ error: 'report_not_found' });
  } catch {
    return response.status(502).json({ error: 'report_resolution_failed' });
  }
}
