import { getSupabaseAdminHeaders, getSupabaseConfig } from './supabase-config.js';
import {
  levelFromXp, loadPublicAuthors, PUBLIC_SLUG_PATTERN, publicBadge,
  publicAuthor, serializePublicAnecdote
} from './public-profile.js';

function boundedPage(value) {
  const page = Number.parseInt(String(value || '0'), 10);
  return Number.isInteger(page) ? Math.min(1000, Math.max(0, page)) : 0;
}

export async function handlePublicProfile(request, response) {
  const slug = typeof request.query?.slug === 'string' ? request.query.slug.toLowerCase() : '';
  if (!PUBLIC_SLUG_PATTERN.test(slug)) return response.status(400).json({ error: 'invalid_slug' });

  const { url, secretKey } = getSupabaseConfig();
  if (!url || !secretKey) return response.status(503).json({ error: 'service_not_configured' });
  const headers = getSupabaseAdminHeaders(secretKey);
  const page = boundedPage(request.query?.page);
  const limit = 20;
  const profileQuery = new URLSearchParams({
    public_slug: `eq.${slug}`,
    select: 'id,public_slug,pseudonym,profession,role,xp,avatar_url,active_frame_key',
    limit: '1'
  });

  try {
    const profileResponse = await fetch(`${url}/rest/v1/profiles?${profileQuery}`, { headers, signal: AbortSignal.timeout(5000) });
    if (!profileResponse.ok) return response.status(502).json({ error: 'profile_unavailable' });
    const [profile] = await profileResponse.json();
    if (!profile) return response.status(404).json({ error: 'profile_not_found' });

    const badgesQuery = new URLSearchParams({
      profile_id: `eq.${profile.id}`,
      select: 'profile_id,badge_key,badge_definitions!inner(badge_key,label,description,icon,frame_key,sort_order)'
    });
    const anecdotesQuery = new URLSearchParams({
      author_id: `eq.${profile.id}`,
      visibility: 'eq.public', moderation_status: 'eq.published', display_anonymously: 'eq.false',
      select: 'id,author_id,author_label,profession,theme,body,vote_score,published_at,submitted_at,display_anonymously',
      order: 'published_at.desc.nullslast,submitted_at.desc,id.desc',
      offset: String(page * limit), limit: String(limit + 1)
    });
    const scoreQuery = new URLSearchParams({
      author_id: `eq.${profile.id}`,
      visibility: 'eq.public', moderation_status: 'eq.published', display_anonymously: 'eq.false',
      select: 'vote_score', limit: '10000'
    });
    const [badgesResponse, anecdotesResponse, scoresResponse] = await Promise.all([
      fetch(`${url}/rest/v1/profile_badges?${badgesQuery}`, { headers, signal: AbortSignal.timeout(5000) }),
      fetch(`${url}/rest/v1/anecdotes?${anecdotesQuery}`, { headers, signal: AbortSignal.timeout(5000) }),
      fetch(`${url}/rest/v1/anecdotes?${scoreQuery}`, { headers, signal: AbortSignal.timeout(5000) })
    ]);
    if (!badgesResponse.ok || !anecdotesResponse.ok || !scoresResponse.ok) return response.status(502).json({ error: 'profile_unavailable' });
    const [badgeRows, anecdotes, scores] = await Promise.all([badgesResponse.json(), anecdotesResponse.json(), scoresResponse.json()]);
    const badgeDefinitions = badgeRows.map((row) => ({ ...row.badge_definitions, badge_key: row.badge_key }))
      .filter((badge) => badge.badge_key)
      .sort((left, right) => (left.sort_order || 0) - (right.sort_order || 0));
    const authorMap = await loadPublicAuthors({ url, secretKey, anecdotes });
    const isAdmin = profile.role === 'admin';

    response.setHeader('Cache-Control', 'no-store');
    return response.status(200).json({
      profile: {
        ...publicAuthor(profile, badgeDefinitions),
        level: isAdmin ? null : levelFromXp(profile.xp),
        levelLabel: isAdmin ? 'Admin' : `Niveau ${levelFromXp(profile.xp)}`,
        xp: isAdmin ? null : Number(profile.xp) || 0,
        xpLabel: isAdmin ? '∞' : String(Number(profile.xp) || 0),
        badges: badgeDefinitions.map(publicBadge),
        stats: {
          publications: scores.length,
          score: scores.reduce((total, item) => total + (Number(item.vote_score) || 0), 0)
        }
      },
      anecdotes: anecdotes.slice(0, limit).map((item) => serializePublicAnecdote(item, authorMap)),
      page,
      hasMore: anecdotes.length > limit
    });
  } catch {
    return response.status(502).json({ error: 'profile_unavailable' });
  }
}
