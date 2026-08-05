import health from '../api/health.js';
import ready from '../api/ready.js';
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
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_ANON_KEY;
  response = createResponse();
  ready({}, response);
  if (response.statusCode !== 503 || response.body.configured !== false) throw new Error('Readiness non configurée invalide');

  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
  process.env.SUPABASE_ANON_KEY = 'anon-key';
  process.env.PUBLIC_APP_ORIGIN = 'https://anecdotes.example';
  globalThis.fetch = async () => ({ ok: true, async json() { return []; } });
  response = createResponse();
  await ready({}, response);
  if (response.statusCode !== 200 || response.body.configured !== true) throw new Error('Readiness configurée invalide');

  let lastRequest;
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

  globalThis.fetch = async (url) => {
    lastRequest = { url: String(url) };
    return {
      ok: true,
      async json() { return [{ id: 'published-1' }]; }
    };
  };
  response = createResponse();
  await feed({ method: 'GET' }, response);
  if (response.statusCode !== 200 || !lastRequest.url.includes('moderation_status=eq.published')) throw new Error('Fil public invalide');

  console.log('4 contrats API vérifiés.');
} finally {
  process.env = originalEnv;
  globalThis.fetch = originalFetch;
}
