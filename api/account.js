import { authenticateRequest } from '../lib/auth-user.js';
import { enforceRateLimit, RATE_LIMITS } from '../lib/rate-limit.js';
import { getSupabaseAdminHeaders, getSupabaseConfig } from '../lib/supabase-config.js';

const AVATAR_EXTENSIONS = ['jpg', 'png', 'gif'];

async function deleteAvatarFiles(url, headers, userId) {
  const deletions = AVATAR_EXTENSIONS.map(async (extension) => {
    try {
      const upstream = await fetch(`${url}/storage/v1/object/avatars/${userId}/avatar.${extension}`, {
        method: 'DELETE',
        headers,
        signal: AbortSignal.timeout(5000)
      });
      return upstream.ok || upstream.status === 404;
    } catch {
      return false;
    }
  });
  return (await Promise.all(deletions)).every(Boolean);
}

export default async function handler(request, response) {
  if (request.method !== 'DELETE') return response.status(405).json({ error: 'method_not_allowed' });

  const { url, publishableKey, secretKey } = getSupabaseConfig();
  if (!url || !secretKey) return response.status(503).json({ error: 'service_not_configured' });

  const identity = await authenticateRequest(request, { url, publishableKey });
  if (identity.status === 'absent') return response.status(401).json({ error: 'authentication_required' });
  if (identity.status === 'invalid') return response.status(401).json({ error: 'invalid_session' });
  if (identity.status === 'unavailable') return response.status(502).json({ error: 'authentication_unavailable' });
  if (!await enforceRateLimit(request, response, {
    url,
    secretKey,
    userId: identity.user.id,
    rule: RATE_LIMITS.accountDeletion
  })) return;

  const headers = getSupabaseAdminHeaders(secretKey);
  const userId = identity.user.id;
  try {
    const profileQuery = new URLSearchParams({ id: `eq.${userId}`, select: 'role', limit: '1' });
    const profileResponse = await fetch(`${url}/rest/v1/profiles?${profileQuery}`, {
      headers,
      signal: AbortSignal.timeout(5000)
    });
    if (!profileResponse.ok) return response.status(502).json({ error: 'account_deletion_failed' });
    const [profile] = await profileResponse.json();
    if (profile?.role === 'admin') return response.status(403).json({ error: 'protected_admin_account' });

    const avatarsDeleted = await deleteAvatarFiles(url, headers, userId);
    if (!avatarsDeleted) return response.status(502).json({ error: 'account_cleanup_failed' });

    const anecdotesDeleted = await fetch(`${url}/rest/v1/anecdotes?author_id=eq.${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      headers: { ...headers, prefer: 'return=minimal' },
      signal: AbortSignal.timeout(5000)
    });
    if (!anecdotesDeleted.ok) return response.status(502).json({ error: 'account_cleanup_failed' });

    const accountDeleted = await fetch(`${url}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      headers,
      signal: AbortSignal.timeout(5000)
    });
    if (!accountDeleted.ok) return response.status(502).json({ error: 'account_deletion_failed' });
  } catch {
    return response.status(502).json({ error: 'account_deletion_failed' });
  }

  response.setHeader('Cache-Control', 'no-store');
  return response.status(204).end();
}
