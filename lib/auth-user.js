export async function authenticateRequest(request, { url, publishableKey }, fetcher = fetch) {
  const authorization = request.headers?.authorization || request.headers?.Authorization || '';
  if (!authorization) return { status: 'absent', user: null };
  if (!publishableKey || !authorization.startsWith('Bearer ')) return { status: 'invalid', user: null };

  let upstream;
  try {
    upstream = await fetcher(`${url}/auth/v1/user`, {
      headers: { apikey: publishableKey, authorization },
      signal: AbortSignal.timeout(5000)
    });
  } catch {
    return { status: 'unavailable', user: null };
  }
  if (upstream.status === 401 || upstream.status === 403) return { status: 'invalid', user: null };
  if (!upstream.ok) return { status: 'unavailable', user: null };
  const user = await upstream.json();
  return user?.id ? { status: 'authenticated', user } : { status: 'invalid', user: null };
}
