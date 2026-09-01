import { getSupabaseAdminHeaders } from './supabase-config.js';

export const PUBLIC_SLUG_PATTERN = /^[a-f0-9]{18}$/;

export function levelFromXp(xp) {
  return Math.max(1, Math.floor((Number(xp) || 0) / 100) + 1);
}

function idsFilter(ids) {
  return `in.(${ids.join(',')})`;
}

export function publicBadge(badge) {
  return {
    key: badge.badge_key,
    label: badge.label,
    description: badge.description,
    icon: badge.icon,
    frameKey: badge.frame_key || null
  };
}

export function publicAuthor(profile, badges = []) {
  if (!profile) return null;
  const isAdmin = profile.role === 'admin';
  const selectedBadge = badges.find((badge) => badge.badge_key === profile.active_frame_key);
  return {
    publicSlug: profile.public_slug,
    pseudonym: profile.pseudonym,
    profession: profile.profession || 'Métier du soin',
    avatarUrl: profile.avatar_url || null,
    frameKey: isAdmin ? 'admin' : selectedBadge?.frame_key || null,
    displayRole: isAdmin ? 'Admin' : null
  };
}

export async function loadPublicAuthors({ url, secretKey, anecdotes, fetcher = fetch }) {
  const visibleIds = [...new Set(anecdotes
    .filter((item) => item.author_id && item.display_anonymously !== true)
    .map((item) => item.author_id))];
  if (!visibleIds.length) return new Map();

  const headers = getSupabaseAdminHeaders(secretKey);
  const profilesQuery = new URLSearchParams({
    select: 'id,public_slug,pseudonym,profession,role,xp,avatar_url,active_frame_key',
    id: idsFilter(visibleIds)
  });
  const badgesQuery = new URLSearchParams({
    select: 'profile_id,badge_key,badge_definitions!inner(badge_key,label,description,icon,frame_key,sort_order)',
    profile_id: idsFilter(visibleIds)
  });
  const [profilesResponse, badgesResponse] = await Promise.all([
    fetcher(`${url}/rest/v1/profiles?${profilesQuery}`, { headers, signal: AbortSignal.timeout(5000) }),
    fetcher(`${url}/rest/v1/profile_badges?${badgesQuery}`, { headers, signal: AbortSignal.timeout(5000) })
  ]);
  if (!profilesResponse.ok || !badgesResponse.ok) throw new Error('profiles_unavailable');

  const [profiles, badgeRows] = await Promise.all([profilesResponse.json(), badgesResponse.json()]);
  const badgesByProfile = new Map();
  badgeRows.forEach((row) => {
    const definition = row.badge_definitions;
    if (!definition) return;
    const list = badgesByProfile.get(row.profile_id) || [];
    list.push({ ...definition, badge_key: row.badge_key });
    list.sort((left, right) => (left.sort_order || 0) - (right.sort_order || 0));
    badgesByProfile.set(row.profile_id, list);
  });
  return new Map(profiles.map((profile) => [profile.id, {
    profile,
    badges: badgesByProfile.get(profile.id) || [],
    author: publicAuthor(profile, badgesByProfile.get(profile.id) || [])
  }]));
}

export function serializePublicAnecdote(anecdote, authorsById) {
  const { author_id: authorId, display_anonymously: displayAnonymously, ...publicFields } = anecdote;
  const authorRecord = authorId && displayAnonymously !== true ? authorsById.get(authorId) : null;
  return {
    ...publicFields,
    author_label: authorRecord?.profile.pseudonym || publicFields.author_label || 'Anonyme',
    profession: authorRecord?.profile.profession || publicFields.profession,
    author: authorRecord?.author || null
  };
}
