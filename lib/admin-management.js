import { getAdminContext } from './moderator.js';
import { getSupabaseAdminHeaders } from './supabase-config.js';
import { PUBLIC_SLUG_PATTERN } from './public-profile.js';

async function callRpc(context, name, body) {
  const upstream = await fetch(`${context.config.url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { ...getSupabaseAdminHeaders(context.config.secretKey), 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000)
  });
  if (!upstream.ok) throw new Error('admin_operation_failed');
  try { return await upstream.json(); } catch { return null; }
}

export async function handleAdminUsers(request, response) {
  if (!['GET', 'PATCH'].includes(request.method)) return response.status(405).json({ error: 'method_not_allowed' });
  const context = await getAdminContext(request);
  if (context.error) return response.status(context.status).json({ error: context.error });
  try {
    if (request.method === 'GET') {
      const query = typeof request.query?.q === 'string' ? request.query.q.trim().slice(0, 80) : '';
      if (query.length < 2) return response.status(200).json({ users: [] });
      const users = await callRpc(context, 'admin_search_users', { p_actor_id: context.identity.user.id, p_query: query });
      response.setHeader('Cache-Control', 'no-store');
      return response.status(200).json({ users });
    }
    const body = typeof request.body === 'object' && request.body ? request.body : {};
    const publicSlug = typeof body.publicSlug === 'string' ? body.publicSlug.toLowerCase() : '';
    if (!PUBLIC_SLUG_PATTERN.test(publicSlug) || typeof body.contributor !== 'boolean') return response.status(422).json({ error: 'invalid_role_change' });
    const [user] = await callRpc(context, 'admin_set_contributor', {
      p_actor_id: context.identity.user.id, p_public_slug: publicSlug, p_enabled: body.contributor
    });
    return response.status(200).json({ user });
  } catch {
    return response.status(502).json({ error: 'admin_operation_failed' });
  }
}

export async function handleAdminBadges(request, response) {
  if (!['POST', 'DELETE'].includes(request.method)) return response.status(405).json({ error: 'method_not_allowed' });
  const context = await getAdminContext(request);
  if (context.error) return response.status(context.status).json({ error: context.error });
  const body = typeof request.body === 'object' && request.body ? request.body : {};
  const publicSlug = typeof body.publicSlug === 'string' ? body.publicSlug.toLowerCase() : '';
  if (!PUBLIC_SLUG_PATTERN.test(publicSlug) || body.badgeKey !== 'pioneer') return response.status(422).json({ error: 'invalid_badge_change' });
  try {
    await callRpc(context, 'admin_set_special_badge', {
      p_actor_id: context.identity.user.id,
      p_public_slug: publicSlug,
      p_badge_key: body.badgeKey,
      p_enabled: request.method === 'POST'
    });
    return response.status(200).json({ badgeKey: body.badgeKey, enabled: request.method === 'POST' });
  } catch {
    return response.status(502).json({ error: 'badge_operation_failed' });
  }
}
