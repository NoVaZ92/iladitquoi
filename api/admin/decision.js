import { getSupabaseAdminHeaders } from '../../lib/supabase-config.js';
import { getModeratorContext } from '../../lib/moderator.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cleanNote(value) {
  return typeof value === 'string' ? value.trim().slice(0, 500) : '';
}

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'method_not_allowed' });
  const context = await getModeratorContext(request);
  if (context.error) return response.status(context.status).json({ error: context.error });

  const body = typeof request.body === 'object' && request.body ? request.body : {};
  const anecdoteId = typeof body.anecdoteId === 'string' ? body.anecdoteId : '';
  const status = body.status === 'published' || body.status === 'refused' ? body.status : '';
  const authorMessage = cleanNote(body.authorMessage);
  const internalNote = cleanNote(body.internalNote);
  const reportIds = Array.isArray(body.reportIds) ? [...new Set(body.reportIds)].filter((id) => typeof id === 'string' && UUID_PATTERN.test(id)).slice(0, 100) : [];
  if (!UUID_PATTERN.test(anecdoteId) || !status) return response.status(422).json({ error: 'invalid_decision' });
  if (status === 'refused' && authorMessage.length < 3) return response.status(422).json({ error: 'author_message_required' });

  const { config, identity } = context;
  const headers = { ...getSupabaseAdminHeaders(config.secretKey), 'content-type': 'application/json' };
  const updatePayload = { moderation_status: status };
  if (status === 'refused') updatePayload.moderation_reason = authorMessage;

  try {
    const anecdoteResponse = await fetch(`${config.url}/rest/v1/anecdotes?${new URLSearchParams({
      id: `eq.${anecdoteId}`,
      visibility: 'eq.public',
      moderation_status: status === 'published' ? 'eq.pending' : 'in.(pending,published)'
    })}`, {
      method: 'PATCH',
      headers: { ...headers, prefer: 'return=representation' },
      body: JSON.stringify(updatePayload),
      signal: AbortSignal.timeout(5000)
    });
    if (!anecdoteResponse.ok) return response.status(502).json({ error: 'decision_failed' });
    const [anecdote] = await anecdoteResponse.json();
    if (!anecdote) return response.status(404).json({ error: 'anecdote_not_found' });

    const auditResponse = await fetch(`${config.url}/rest/v1/moderation_decisions`, {
      method: 'POST',
      headers: { ...headers, prefer: 'return=minimal' },
      body: JSON.stringify({
        anecdote_id: anecdoteId,
        moderator_id: identity.user.id,
        status,
        internal_note: internalNote || null,
        author_message: authorMessage || null
      }),
      signal: AbortSignal.timeout(5000)
    });
    let resolvedReports = 0;
    if (reportIds.length) {
      const reportResponse = await fetch(`${config.url}/rest/v1/reports?${new URLSearchParams({ id: `in.(${reportIds.join(',')})`, anecdote_id: `eq.${anecdoteId}` })}`, {
        method: 'PATCH',
        headers: { ...headers, prefer: 'return=representation' },
        body: JSON.stringify({ resolved_at: new Date().toISOString(), resolved_by: identity.user.id }),
        signal: AbortSignal.timeout(5000)
      });
      if (!reportResponse.ok) return response.status(502).json({ error: 'report_resolution_failed' });
      resolvedReports = (await reportResponse.json()).length;
    }
    return response.status(200).json({ anecdote, auditRecorded: auditResponse.ok, resolvedReports });
  } catch {
    return response.status(502).json({ error: 'decision_failed' });
  }
}
