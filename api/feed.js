import { getSupabaseAdminHeaders, getSupabaseConfig } from '../lib/supabase-config.js';
import { PROFESSIONS } from '../lib/professions.js';
import { loadPublicAuthors, serializePublicAnecdote } from '../lib/public-profile.js';
import { handlePublicProfile } from '../lib/public-profile-handler.js';

const ALLOWED_THEMES = new Set(['leger', 'drole', 'touchant', 'epuisant', 'surprenant', 'apprentissage']);

function boundedInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function normalizedSearch(value) {
  return String(value || '')
    .trim()
    .replace(/[^\p{L}\p{N}\s'-]/gu, '')
    .replace(/\s+/g, ' ')
    .slice(0, 64);
}

export default async function handler(request, response) {
  if (request.method !== 'GET') return response.status(405).json({ error: 'method_not_allowed' });
  if (request.query?.view === 'profile') return handlePublicProfile(request, response);
  const { url, secretKey } = getSupabaseConfig();
  if (!url || !secretKey) return response.status(503).json({ error: 'service_not_configured' });
  const sort = request.query?.sort === 'new' ? 'new' : 'top';
  const page = boundedInteger(request.query?.page, 0, 0, 1000);
  const limit = boundedInteger(request.query?.limit, 20, 5, 50);
  const profession = PROFESSIONS.includes(request.query?.profession) ? request.query.profession : '';
  const theme = ALLOWED_THEMES.has(request.query?.theme) ? request.query.theme : '';
  const search = normalizedSearch(request.query?.search);

  const query = new URLSearchParams({
    select: 'id,author_id,author_label,profession,theme,body,vote_score,published_at,submitted_at,display_anonymously',
    visibility: 'eq.public',
    moderation_status: 'eq.published',
    order: sort === 'new'
      ? 'published_at.desc.nullslast,submitted_at.desc,id.desc'
      : 'vote_score.desc,published_at.desc.nullslast,submitted_at.desc,id.desc',
    offset: String(page * limit),
    limit: String(limit + 1)
  });
  if (profession) query.set('profession', `eq.${profession}`);
  if (theme) query.set('theme', `eq.${theme}`);
  if (search) query.set('or', `(body.ilike.*${search}*,author_label.ilike.*${search}*,profession.ilike.*${search}*)`);
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
  let authorsById;
  try {
    authorsById = await loadPublicAuthors({ url, secretKey, anecdotes });
  } catch {
    return response.status(502).json({ error: 'feed_unavailable' });
  }
  return response.status(200).json({
    anecdotes: anecdotes.slice(0, limit).map((item) => serializePublicAnecdote(item, authorsById)),
    page,
    hasMore: anecdotes.length > limit
  });
}
