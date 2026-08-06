import { getSupabaseAdminHeaders } from '../../lib/supabase-config.js';
import { getModeratorContext } from '../../lib/moderator.js';

function idsFilter(ids) {
  return ids.length ? `in.(${ids.join(',')})` : '';
}

export default async function handler(request, response) {
  if (request.method !== 'GET') return response.status(405).json({ error: 'method_not_allowed' });
  const context = await getModeratorContext(request);
  if (context.error) return response.status(context.status).json({ error: context.error });

  const { config, profile } = context;
  const headers = getSupabaseAdminHeaders(config.secretKey);
  const pendingQuery = new URLSearchParams({
    select: 'id,author_id,author_label,profession,theme,body,moderation_reason,submitted_at,vote_score,visibility',
    visibility: 'eq.public',
    moderation_status: 'eq.pending',
    order: 'submitted_at.asc',
    limit: '100'
  });
  const reportsQuery = new URLSearchParams({
    select: 'id,anecdote_id,reporter_id,reason,created_at',
    resolved_at: 'is.null',
    order: 'created_at.asc',
    limit: '100'
  });

  try {
    const [pendingResponse, reportsResponse] = await Promise.all([
      fetch(`${config.url}/rest/v1/anecdotes?${pendingQuery}`, { headers, signal: AbortSignal.timeout(5000) }),
      fetch(`${config.url}/rest/v1/reports?${reportsQuery}`, { headers, signal: AbortSignal.timeout(5000) })
    ]);
    if (!pendingResponse.ok || !reportsResponse.ok) return response.status(502).json({ error: 'queue_unavailable' });
    const [pending, reports] = await Promise.all([pendingResponse.json(), reportsResponse.json()]);
    const anecdoteIds = [...new Set(reports.map((report) => report.anecdote_id).filter(Boolean))];
    const reporterIds = [...new Set(reports.map((report) => report.reporter_id).filter(Boolean))];
    const [anecdotesResponse, reportersResponse] = await Promise.all([
      anecdoteIds.length
        ? fetch(`${config.url}/rest/v1/anecdotes?${new URLSearchParams({ select: 'id,author_label,profession,theme,body,moderation_status,moderation_reason,submitted_at', id: idsFilter(anecdoteIds), visibility: 'eq.public' })}`, { headers, signal: AbortSignal.timeout(5000) })
        : Promise.resolve({ ok: true, json: async () => [] }),
      reporterIds.length
        ? fetch(`${config.url}/rest/v1/profiles?${new URLSearchParams({ select: 'id,pseudonym', id: idsFilter(reporterIds) })}`, { headers, signal: AbortSignal.timeout(5000) })
        : Promise.resolve({ ok: true, json: async () => [] })
    ]);
    if (!anecdotesResponse.ok || !reportersResponse.ok) return response.status(502).json({ error: 'queue_unavailable' });
    const [reportedAnecdotes, reporters] = await Promise.all([anecdotesResponse.json(), reportersResponse.json()]);
    const anecdotesById = new Map(reportedAnecdotes.map((anecdote) => [anecdote.id, anecdote]));
    const reportersById = new Map(reporters.map((reporter) => [reporter.id, reporter.pseudonym]));
    response.setHeader('Cache-Control', 'no-store');
    return response.status(200).json({
      moderator: { pseudonym: profile.pseudonym, role: profile.role },
      pending,
      reports: reports.map((report) => ({
        ...report,
        anecdote: anecdotesById.get(report.anecdote_id) || null,
        reporter_label: report.reporter_id ? reportersById.get(report.reporter_id) || 'Compte supprimé' : 'Visiteur anonyme'
      }))
    });
  } catch {
    return response.status(502).json({ error: 'queue_unavailable' });
  }
}
