import health from '../api/health.js';
import ready from '../api/ready.js';
import publicConfig from '../api/config.js';
import feed from '../api/feed.js';
import submit from '../api/submit.js';

function createResponse() {
  return {
    headers: {},
    statusCode: null,
    body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    end() { return this; }
  };
}

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;

try {
  let response = createResponse();
  health({}, response);
  if (response.statusCode !== 200 || response.body.status !== 'ok') throw new Error('Health check invalide');

  delete process.env.SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SECRET_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_PUBLISHABLE_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  delete process.env.SUPABASE_ANON_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  response = createResponse();
  await ready({}, response);
  if (response.statusCode !== 503 || response.body.configured !== false) throw new Error('Readiness non configurée invalide');

  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_example';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_example';
  process.env.PUBLIC_APP_ORIGIN = 'https://anecdotes.example';
  let lastRequest;
  globalThis.fetch = async (url, options = {}) => {
    lastRequest = { url: String(url), options };
    return { ok: true, async json() { return []; } };
  };
  response = createResponse();
  await ready({}, response);
  if (response.statusCode !== 200 || response.body.configured !== true) throw new Error('Readiness configurée invalide');
  if (lastRequest.options.headers.apikey !== 'sb_secret_example' || lastRequest.options.headers.authorization) {
    throw new Error('En-têtes de clé secrète Supabase invalides');
  }

  globalThis.fetch = async () => ({ ok: false, status: 404 });
  response = createResponse();
  await ready({}, response);
  if (response.statusCode !== 503 || response.body.status !== 'schema_required') throw new Error('Diagnostic de migration Supabase invalide');

  response = createResponse();
  publicConfig({}, response);
  if (response.statusCode !== 200 || response.body.supabasePublishableKey !== 'sb_publishable_example') {
    throw new Error('Configuration publique Supabase invalide');
  }

  globalThis.fetch = async (url, options = {}) => {
    lastRequest = { url: String(url), options };
    return {
      ok: true,
      async json() { return [{ id: 'anecdote-1', moderation_status: 'pending' }]; }
    };
  };
  response = createResponse();
  await submit({
    method: 'POST',
    headers: { origin: 'https://anecdotes.example' },
    body: { text: 'Écrire à test@example.com ou appeler 0612345678', profession: 'Infirmière', theme: 'leger', anonymous: true }
  }, response);
  const submission = JSON.parse(lastRequest.options.body);
  if (response.statusCode !== 201 || !submission.body.includes('[coordonnée masquée]')) throw new Error('Soumission ou masquage invalide');
  if (lastRequest.options.headers.authorization) throw new Error('Une clé secrète Supabase ne doit pas être envoyée comme Bearer JWT');

  response = createResponse();
  await submit({
    method: 'POST',
    headers: { origin: 'https://anecdotes.example' },
    body: { text: 'Une anecdote liée à mon profil', profession: 'Infirmière', theme: 'leger', anonymous: false }
  }, response);
  if (response.statusCode !== 401 || response.body.error !== 'authentication_required') {
    throw new Error('Une soumission nominative sans session doit être refusée');
  }

  globalThis.fetch = async () => ({ ok: false, status: 401 });
  response = createResponse();
  await submit({
    method: 'POST',
    headers: { origin: 'https://anecdotes.example', authorization: 'Bearer expired-token' },
    body: { text: 'Une anecdote avec une session expirée', profession: 'Infirmière', theme: 'leger', anonymous: false }
  }, response);
  if (response.statusCode !== 401 || response.body.error !== 'invalid_session') {
    throw new Error('Une session expirée doit être refusée');
  }

  globalThis.fetch = async (url, options = {}) => {
    lastRequest = { url: String(url), options };
    if (lastRequest.url.endsWith('/auth/v1/user')) {
      return { ok: true, status: 200, async json() { return { id: 'user-123', email: 'membre@example.com' }; } };
    }
    if (lastRequest.url.includes('/rest/v1/profiles?')) {
      return { ok: true, status: 200, async json() { return [{ pseudonym: 'NuitCalme' }]; } };
    }
    return {
      ok: true,
      status: 201,
      async json() { return [{ id: 'anecdote-auth', moderation_status: 'pending' }]; }
    };
  };
  response = createResponse();
  await submit({
    method: 'POST',
    headers: { origin: 'https://anecdotes.example', authorization: 'Bearer user-token' },
    body: { text: 'Une anecdote liée à mon profil', profession: 'Infirmière', theme: 'leger', anonymous: false }
  }, response);
  const authenticatedSubmission = JSON.parse(lastRequest.options.body);
  if (response.statusCode !== 201 || authenticatedSubmission.author_id !== 'user-123' || authenticatedSubmission.author_label !== 'NuitCalme') {
    throw new Error('Association de la soumission au profil invalide');
  }

  response = createResponse();
  await submit({
    method: 'POST',
    headers: { origin: 'https://anecdotes.example', authorization: 'Bearer user-token' },
    body: { text: 'Une anecdote anonyme mais suivie', profession: 'Infirmière', theme: 'leger', anonymous: true }
  }, response);
  const anonymousMemberSubmission = JSON.parse(lastRequest.options.body);
  if (response.statusCode !== 201 || anonymousMemberSubmission.author_id !== 'user-123' || anonymousMemberSubmission.author_label !== 'Anonyme') {
    throw new Error('Le suivi privé d’une soumission anonyme connectée est invalide');
  }

  delete process.env.SUPABASE_SECRET_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'legacy-service-role-key';
  globalThis.fetch = async (url, options = {}) => {
    lastRequest = { url: String(url), options };
    return {
      ok: true,
      async json() { return [{ id: 'published-1' }]; }
    };
  };
  response = createResponse();
  await feed({ method: 'GET' }, response);
  if (response.statusCode !== 200 || !lastRequest.url.includes('moderation_status=eq.published')) throw new Error('Fil public invalide');
  if (lastRequest.options.headers.authorization !== 'Bearer legacy-service-role-key') throw new Error('Compatibilité service_role invalide');

  console.log('11 contrats API vérifiés.');
} finally {
  process.env = originalEnv;
  globalThis.fetch = originalFetch;
}
