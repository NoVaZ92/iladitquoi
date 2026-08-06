import { authenticateRequest } from '../lib/auth-user.js';
import { sanitizePublicText } from '../lib/privacy-filter.js';
import { getSupabaseAdminHeaders, getSupabaseConfig } from '../lib/supabase-config.js';

const MAX_CHARS = 355;
const ALLOWED_THEMES = new Set(['leger', 'drole', 'touchant', 'epuisant', 'surprenant', 'apprentissage']);

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'method_not_allowed' });

  const { url, publishableKey, secretKey } = getSupabaseConfig();
  if (!url || !secretKey) return response.status(503).json({ error: 'service_not_configured' });

  const identity = await authenticateRequest(request, { url, publishableKey });
  if (identity.status === 'absent') return response.status(401).json({ error: 'authentication_required' });
  if (identity.status === 'invalid') return response.status(401).json({ error: 'invalid_session' });
  if (identity.status === 'unavailable') return response.status(502).json({ error: 'authentication_unavailable' });

  const body = typeof request.body === 'object' && request.body ? request.body : {};
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const requestedTheme = typeof body.theme === 'string' ? body.theme.trim().toLocaleLowerCase() : 'leger';
  if (!text || text.length > MAX_CHARS) return response.status(422).json({ error: 'invalid_submission' });

  const profileQuery = new URLSearchParams({ id: `eq.${identity.user.id}`, select: 'pseudonym,profession', limit: '1' });
  let profile;
  try {
    const profileResponse = await fetch(`${url}/rest/v1/profiles?${profileQuery}`, {
      headers: getSupabaseAdminHeaders(secretKey),
      signal: AbortSignal.timeout(5000)
    });
    if (!profileResponse.ok) return response.status(502).json({ error: 'profile_unavailable' });
    [profile] = await profileResponse.json();
  } catch {
    return response.status(502).json({ error: 'profile_unavailable' });
  }
  if (!profile?.profession) return response.status(409).json({ error: 'profile_required' });

  const privacy = sanitizePublicText(text);
  const payload = {
    author_id: identity.user.id,
    author_label: profile.pseudonym || 'Mon carnet',
    profession: profile.profession,
    theme: ALLOWED_THEMES.has(requestedTheme) ? requestedTheme : 'leger',
    body: privacy.text,
    visibility: 'private',
    moderation_status: 'published',
    moderation_reason: privacy.changed ? `Filtre automatique : ${privacy.flags.join(', ')} masqué(s) avant stockage.` : null
  };
  try {
    const upstream = await fetch(`${url}/rest/v1/anecdotes`, {
      method: 'POST',
      headers: { ...getSupabaseAdminHeaders(secretKey), 'content-type': 'application/json', prefer: 'return=representation' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000)
    });
    if (!upstream.ok) return response.status(502).json({ error: 'persistence_failed' });
    const [anecdote] = await upstream.json();
    return response.status(201).json({
      anecdote: { id: anecdote.id, submitted_at: anecdote.submitted_at },
      privacy: { changed: privacy.changed, flags: privacy.flags }
    });
  } catch {
    return response.status(502).json({ error: 'persistence_failed' });
  }
}
