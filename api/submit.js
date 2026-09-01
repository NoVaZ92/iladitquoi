import { getSupabaseAdminHeaders, getSupabaseConfig } from '../lib/supabase-config.js';
import { authenticateRequest } from '../lib/auth-user.js';
import { sanitizePublicText } from '../lib/privacy-filter.js';
import { enforceRateLimit, RATE_LIMITS } from '../lib/rate-limit.js';

const MAX_CHARS = 355;
const ALLOWED_THEMES = new Set(['leger', 'drole', 'touchant', 'epuisant', 'surprenant', 'apprentissage']);

function allowOrigin(request, response) {
  const configuredOrigin = process.env.PUBLIC_APP_ORIGIN;
  if (configuredOrigin && request.headers.origin === configuredOrigin) response.setHeader('Access-Control-Allow-Origin', configuredOrigin);
  response.setHeader('Vary', 'Origin');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export default async function handler(request, response) {
  allowOrigin(request, response);
  if (request.method === 'OPTIONS') return response.status(204).end();
  if (request.method !== 'POST') return response.status(405).json({ error: 'method_not_allowed' });

  const { url, publishableKey, secretKey } = getSupabaseConfig();
  if (!url || !secretKey) return response.status(503).json({ error: 'service_not_configured' });

  const body = typeof request.body === 'object' && request.body ? request.body : {};
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const submittedProfession = typeof body.profession === 'string' ? body.profession.trim().slice(0, 80) : '';
  const requestedTheme = typeof body.theme === 'string' ? body.theme.trim().toLocaleLowerCase() : 'leger';
  const theme = ALLOWED_THEMES.has(requestedTheme) ? requestedTheme : 'leger';
  const anonymous = body.anonymous === true;
  if (!text || text.length > MAX_CHARS) return response.status(422).json({ error: 'invalid_submission' });

  const identity = await authenticateRequest(request, { url, publishableKey });
  if (identity.status === 'invalid') return response.status(401).json({ error: 'invalid_session' });
  if (identity.status === 'unavailable') return response.status(502).json({ error: 'authentication_unavailable' });
  if (!anonymous && identity.status !== 'authenticated') return response.status(401).json({ error: 'authentication_required' });
  if (!await enforceRateLimit(request, response, {
    url,
    secretKey,
    userId: identity.user?.id,
    rule: RATE_LIMITS.publicSubmission
  })) return;

  let profile = null;
  if (identity.user) {
    const profileQuery = new URLSearchParams({ id: `eq.${identity.user.id}`, select: 'pseudonym,profession', limit: '1' });
    let profileResponse;
    try {
      profileResponse = await fetch(`${url}/rest/v1/profiles?${profileQuery}`, {
        headers: getSupabaseAdminHeaders(secretKey),
        signal: AbortSignal.timeout(5000)
      });
    } catch {
      return response.status(502).json({ error: 'profile_unavailable' });
    }
    if (!profileResponse.ok) return response.status(502).json({ error: 'profile_unavailable' });
    [profile] = await profileResponse.json();
    if (!profile) return response.status(409).json({ error: 'profile_required' });
  }

  const profession = identity.user ? profile.profession || submittedProfession : submittedProfession;
  if (!profession) return response.status(422).json({ error: 'profession_required' });
  const privacy = sanitizePublicText(text);

  const payload = {
    body: privacy.text,
    profession,
    theme,
    visibility: 'public',
    moderation_status: 'pending',
    author_label: anonymous ? 'Anonyme' : profile.pseudonym,
    display_anonymously: anonymous,
    moderation_reason: privacy.changed ? `Filtre automatique : ${privacy.flags.join(', ')} masqué(s) avant stockage.` : null,
    ...(identity.user ? { author_id: identity.user.id } : {})
  };
  let upstream;
  try {
    upstream = await fetch(`${url}/rest/v1/anecdotes`, {
      method: 'POST',
      headers: {
        ...getSupabaseAdminHeaders(secretKey),
        'content-type': 'application/json',
        prefer: 'return=representation'
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000)
    });
  } catch {
    return response.status(502).json({ error: 'persistence_failed' });
  }
  if (!upstream.ok) return response.status(502).json({ error: 'persistence_failed' });
  const [anecdote] = await upstream.json();
  return response.status(201).json({
    id: anecdote.id,
    status: anecdote.moderation_status,
    privacy: { changed: privacy.changed, flags: privacy.flags }
  });
}
