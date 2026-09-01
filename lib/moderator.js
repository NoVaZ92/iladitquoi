import { authenticateRequest } from './auth-user.js';
import { getSupabaseAdminHeaders, getSupabaseConfig } from './supabase-config.js';

export async function getModeratorContext(request) {
  const config = getSupabaseConfig();
  if (!config.url || !config.secretKey) return { error: 'service_not_configured', status: 503 };

  const identity = await authenticateRequest(request, config);
  if (identity.status === 'absent') return { error: 'authentication_required', status: 401 };
  if (identity.status === 'invalid') return { error: 'invalid_session', status: 401 };
  if (identity.status === 'unavailable') return { error: 'authentication_unavailable', status: 502 };

  const profileQuery = new URLSearchParams({
    id: `eq.${identity.user.id}`,
    select: 'id,pseudonym,role',
    limit: '1'
  });
  try {
    const profileResponse = await fetch(`${config.url}/rest/v1/profiles?${profileQuery}`, {
      headers: getSupabaseAdminHeaders(config.secretKey),
      signal: AbortSignal.timeout(5000)
    });
    if (!profileResponse.ok) return { error: 'profile_unavailable', status: 502 };
    const [profile] = await profileResponse.json();
    if (!profile || !['moderator', 'admin'].includes(profile.role)) return { error: 'forbidden', status: 403 };
    return { config, identity, profile };
  } catch {
    return { error: 'profile_unavailable', status: 502 };
  }
}

export async function getAdminContext(request) {
  const context = await getModeratorContext(request);
  if (context.error) return context;
  if (context.profile.role !== 'admin') return { error: 'forbidden', status: 403 };
  return context;
}
