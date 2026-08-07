import health from '../api/health.js';
import publicConfig from '../api/config.js';
import anecdote from '../api/anecdote.js';
import account from '../api/account.js';
import adminDecision from '../api/admin/decision.js';
import adminQueue from '../api/admin/queue.js';
import adminReport from '../api/admin/report.js';
import feed from '../api/feed.js';
import report from '../api/report.js';
import privateAnecdote from '../api/private.js';
import privateShare from '../api/private-share.js';
import submit from '../api/submit.js';
import vote from '../lib/vote-handler.js';

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

function allowedRateLimitResponse(url) {
  return String(url).endsWith('/rest/v1/rpc/consume_rate_limit')
    ? { ok: true, status: 200, async json() { return [{ allowed: true, retry_after_seconds: 0 }]; } }
    : null;
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
  await health({ query: { ready: '1' } }, response);
  if (response.statusCode !== 503 || response.body.configured !== false) throw new Error('Readiness non configurée invalide');

  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_example';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_example';
  process.env.PUBLIC_APP_ORIGIN = 'https://anecdotes.example';
  let lastRequest;
  globalThis.fetch = async (url, options = {}) => {
    lastRequest = { url: String(url), options };
    if (lastRequest.url.endsWith('/rest/v1/rpc/rate_limit_ready') || lastRequest.url.endsWith('/rest/v1/rpc/account_deletion_ready')) {
      return { ok: true, status: 200, async json() { return true; } };
    }
    if (lastRequest.url.endsWith('/rest/v1/rpc/consume_rate_limit')) {
      return { ok: true, status: 200, async json() { return [{ allowed: true, retry_after_seconds: 0 }]; } };
    }
    return { ok: true, async json() { return []; } };
  };
  response = createResponse();
  await health({ query: { ready: '1' } }, response);
  if (response.statusCode !== 200 || response.body.configured !== true) throw new Error('Readiness configurée invalide');
  if (lastRequest.options.headers.apikey !== 'sb_secret_example' || lastRequest.options.headers.authorization) {
    throw new Error('En-têtes de clé secrète Supabase invalides');
  }

  globalThis.fetch = async (url) => {
    if (String(url).endsWith('/rest/v1/rpc/consume_rate_limit')) {
      return { ok: true, status: 200, async json() { return [{ allowed: false, retry_after_seconds: 1 }]; } };
    }
    return { ok: true, status: 200, async json() { return true; } };
  };
  response = createResponse();
  await health({ query: { ready: '1' } }, response);
  if (response.statusCode !== 503 || response.body.status !== 'rate_limit_write_unavailable') {
    throw new Error('La readiness doit exécuter le limiteur anti-abus');
  }

  globalThis.fetch = async () => ({ ok: false, status: 404 });
  response = createResponse();
  await health({ query: { ready: '1' } }, response);
  if (response.statusCode !== 503 || response.body.status !== 'schema_required') throw new Error('Diagnostic de migration Supabase invalide');

  globalThis.fetch = async (url) => String(url).endsWith('/rest/v1/rpc/rate_limit_ready')
    ? { ok: false, status: 404, async json() { return {}; } }
    : { ok: true, status: 200, async json() { return []; } };
  response = createResponse();
  await health({ query: { ready: '1' } }, response);
  if (response.statusCode !== 503 || response.body.status !== 'schema_required') {
    throw new Error('La readiness doit détecter une migration anti-abus absente');
  }

  response = createResponse();
  publicConfig({}, response);
  if (response.statusCode !== 200 || response.headers['Cache-Control'] !== 'no-store' || response.body.supabasePublishableKey !== 'sb_publishable_example') {
    throw new Error('Configuration publique Supabase invalide');
  }

  let rateLimitCalls = 0;
  globalThis.fetch = async (url, options = {}) => {
    lastRequest = { url: String(url), options };
    rateLimitCalls += 1;
    return { ok: true, status: 200, async json() { return [{ allowed: false, retry_after_seconds: 45 }]; } };
  };
  response = createResponse();
  await submit({
    method: 'POST',
    headers: { origin: 'https://anecdotes.example', 'x-vercel-forwarded-for': '203.0.113.42' },
    body: { text: 'Une soumission trop rapprochée', profession: 'Infirmière', theme: 'leger', anonymous: true }
  }, response);
  const rateLimitPayload = JSON.parse(lastRequest.options.body);
  if (response.statusCode !== 429 || response.headers['Retry-After'] !== '45' || rateLimitCalls !== 1) {
    throw new Error('Limitation de débit invalide');
  }
  if (!/^[0-9a-f]{64}$/.test(rateLimitPayload.p_subject_hash) || lastRequest.options.body.includes('203.0.113.42')) {
    throw new Error('Une adresse IP ne doit jamais être stockée en clair par la limitation');
  }

  globalThis.fetch = async () => ({ ok: false, status: 404, async json() { return {}; } });
  response = createResponse();
  await submit({
    method: 'POST',
    headers: { origin: 'https://anecdotes.example', 'x-vercel-forwarded-for': '203.0.113.43' },
    body: { text: 'Une soumission sans limiteur disponible', profession: 'Infirmière', theme: 'leger', anonymous: true }
  }, response);
  if (response.statusCode !== 503 || response.body.error !== 'rate_limit_unavailable') {
    throw new Error('Une écriture doit échouer si le limiteur est indisponible');
  }

  globalThis.fetch = async (url, options = {}) => {
    lastRequest = { url: String(url), options };
    const rateLimit = allowedRateLimitResponse(url);
    if (rateLimit) return rateLimit;
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

  globalThis.fetch = async (url, options = {}) => {
    lastRequest = { url: String(url), options };
    const rateLimit = allowedRateLimitResponse(url);
    if (rateLimit) return rateLimit;
    return { ok: true, async json() { return [{ id: 'privacy-test', moderation_status: 'pending' }]; } };
  };
  response = createResponse();
  await submit({
    method: 'POST',
    headers: { origin: 'https://anecdotes.example' },
    body: { text: 'Le Dr Martin arrive dans le service.', profession: 'Infirmière', theme: 'drole', anonymous: true }
  }, response);
  const namedSubmission = JSON.parse(lastRequest.options.body);
  if (response.statusCode !== 201 || namedSubmission.body.includes('Martin') || !namedSubmission.moderation_reason?.startsWith('Filtre automatique')) {
    throw new Error('Le filtre serveur doit masquer et signaler un nom précédé d’une civilité');
  }

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
    const rateLimit = allowedRateLimitResponse(url);
    if (rateLimit) return rateLimit;
    if (lastRequest.url.endsWith('/auth/v1/user')) {
      return { ok: true, status: 200, async json() { return { id: 'user-123', email: 'membre@example.com' }; } };
    }
    if (lastRequest.url.includes('/rest/v1/profiles?')) {
      return { ok: true, status: 200, async json() { return [{ pseudonym: 'NuitCalme', profession: 'Orthophoniste' }]; } };
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
    body: { text: 'Une anecdote liée à mon profil', profession: 'Dentiste', theme: 'leger', anonymous: false }
  }, response);
  const authenticatedSubmission = JSON.parse(lastRequest.options.body);
  if (response.statusCode !== 201 || authenticatedSubmission.author_id !== 'user-123' || authenticatedSubmission.author_label !== 'NuitCalme' || authenticatedSubmission.profession !== 'Orthophoniste') {
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

  globalThis.fetch = async (url, options = {}) => {
    lastRequest = { url: String(url), options };
    const rateLimit = allowedRateLimitResponse(url);
    if (rateLimit) return rateLimit;
    if (lastRequest.url.endsWith('/auth/v1/user')) return { ok: true, status: 200, async json() { return { id: 'user-123' }; } };
    if (lastRequest.url.includes('/rest/v1/profiles?')) return { ok: true, status: 200, async json() { return [{ pseudonym: 'NuitCalme', profession: 'Orthophoniste' }]; } };
    return { ok: true, status: 201, async json() { return [{ id: 'private-1', submitted_at: '2026-08-06T10:00:00Z' }]; } };
  };
  response = createResponse();
  await privateAnecdote({ method: 'POST', headers: { authorization: 'Bearer user-token' }, body: { text: 'Le Dr Martin garde cette idée dans le carnet.', theme: 'drole' } }, response);
  const privatePayload = JSON.parse(lastRequest.options.body);
  if (response.statusCode !== 201 || privatePayload.visibility !== 'private' || privatePayload.moderation_status !== 'published' || privatePayload.body.includes('Martin')) {
    throw new Error('Enregistrement du carnet privé invalide');
  }

  const deletedAccountId = '823e4567-e89b-42d3-a456-426614174007';
  const accountRequests = [];
  globalThis.fetch = async (url, options = {}) => {
    const request = { url: String(url), options };
    accountRequests.push(request);
    const rateLimit = allowedRateLimitResponse(url);
    if (rateLimit) return rateLimit;
    if (request.url.endsWith('/auth/v1/user')) return { ok: true, status: 200, async json() { return { id: deletedAccountId }; } };
    if (request.url.includes('/storage/v1/object/avatars/')) return { ok: false, status: 404, async json() { return {}; } };
    if (request.url.includes('/rest/v1/anecdotes?') && request.options.method === 'DELETE') return { ok: true, status: 204, async json() { return {}; } };
    if (request.url.endsWith(`/auth/v1/admin/users/${deletedAccountId}`) && request.options.method === 'DELETE') return { ok: true, status: 204, async json() { return {}; } };
    return { ok: false, status: 500, async json() { return {}; } };
  };
  response = createResponse();
  await account({ method: 'DELETE', headers: { authorization: 'Bearer user-token' } }, response);
  const anecdotesDelete = accountRequests.find((request) => request.url.includes('/rest/v1/anecdotes?') && request.options.method === 'DELETE');
  const authDelete = accountRequests.find((request) => request.url.endsWith(`/auth/v1/admin/users/${deletedAccountId}`));
  if (response.statusCode !== 204 || !anecdotesDelete || !authDelete) {
    throw new Error('Suppression de compte et des contenus invalide');
  }

  const privateId = '623e4567-e89b-42d3-a456-426614174005';
  globalThis.fetch = async (url, options = {}) => {
    lastRequest = { url: String(url), options };
    const rateLimit = allowedRateLimitResponse(url);
    if (rateLimit) return rateLimit;
    if (lastRequest.url.endsWith('/auth/v1/user')) return { ok: true, status: 200, async json() { return { id: 'user-123' }; } };
    if (lastRequest.url.includes('/rest/v1/anecdotes?')) return { ok: true, status: 200, async json() { return [{ id: privateId }]; } };
    if (lastRequest.url.endsWith('/rest/v1/private_share_links')) return { ok: true, status: 201, async json() { return []; } };
    return { ok: false, status: 500, async json() { return []; } };
  };
  response = createResponse();
  await privateShare({ method: 'POST', headers: { authorization: 'Bearer user-token' }, body: { anecdoteId: privateId } }, response);
  if (response.statusCode !== 201 || !/^[A-Za-z0-9_-]{24,}$/.test(response.body.token) || !lastRequest.options.body.includes('token_hash')) {
    throw new Error('Création du lien privé invalide');
  }

  globalThis.fetch = async (url) => {
    const value = String(url);
    if (value.includes('/rest/v1/private_share_links?')) return { ok: true, status: 200, async json() { return [{ anecdote_id: privateId, expires_at: null }]; } };
    if (value.includes('/rest/v1/anecdotes?')) return { ok: true, status: 200, async json() { return [{ id: privateId, profession: 'Orthophoniste', theme: 'drole', body: 'Note privée', submitted_at: '2026-08-06T10:00:00Z' }]; } };
    return { ok: false, status: 500, async json() { return []; } };
  };
  response = createResponse();
  await privateShare({ method: 'GET', query: { token: 'a'.repeat(24) } }, response);
  if (response.statusCode !== 200 || response.body.anecdote.author_label !== 'Note privée partagée' || response.body.anecdote.private_share !== true) {
    throw new Error('Lecture du lien privé invalide');
  }

  const votedId = '723e4567-e89b-42d3-a456-426614174006';
  globalThis.fetch = async (url, options = {}) => {
    lastRequest = { url: String(url), options };
    const rateLimit = allowedRateLimitResponse(url);
    if (rateLimit) return rateLimit;
    if (lastRequest.url.endsWith('/auth/v1/user')) return { ok: true, status: 200, async json() { return { id: 'user-123' }; } };
    if (lastRequest.url.endsWith('/rest/v1/rpc/cast_anecdote_vote')) return { ok: true, status: 200, async json() { return [{ vote_score: 12, user_vote: 1 }]; } };
    return { ok: false, status: 500, async json() { return []; } };
  };
  response = createResponse();
  await vote({ method: 'POST', headers: { authorization: 'Bearer user-token' }, body: { anecdoteId: votedId, value: 1 } }, response);
  if (response.statusCode !== 200 || response.body.voteScore !== 12 || response.body.userVote !== 1 || !lastRequest.options.body.includes(votedId)) {
    throw new Error('Vote persistant invalide');
  }

  delete process.env.SUPABASE_SECRET_KEY;
  response = createResponse();
  await vote({ method: 'POST', headers: { authorization: 'Bearer user-token' }, body: { anecdoteId: votedId, value: 1 } }, response);
  if (response.statusCode !== 503 || response.body.error !== 'service_not_configured') {
    throw new Error('Le vote ne doit pas contourner le limiteur sans clé serveur');
  }
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_example';

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

  response = createResponse();
  await feed({ method: 'GET', query: { sort: 'new' } }, response);
  if (response.statusCode !== 200 || response.body.page !== 0 || !decodeURIComponent(lastRequest.url).includes('order=published_at.desc.nullslast,submitted_at.desc,id.desc') || !lastRequest.url.includes('offset=0') || !lastRequest.url.includes('limit=21')) {
    throw new Error('Tri des nouveautés invalide');
  }

  response = createResponse();
  await feed({ method: 'GET', query: { page: '2', limit: '50', profession: 'Orthophoniste', theme: 'drole', search: 'patiente (à vérifier)' } }, response);
  const feedQuery = new URL(lastRequest.url).searchParams;
  if (response.statusCode !== 200 || response.body.page !== 2 || feedQuery.get('offset') !== '100' || feedQuery.get('limit') !== '51' || feedQuery.get('profession') !== 'eq.Orthophoniste' || feedQuery.get('theme') !== 'eq.drole' || feedQuery.get('or') !== '(body.ilike.*patiente à vérifier*,author_label.ilike.*patiente à vérifier*,profession.ilike.*patiente à vérifier*)') {
    throw new Error('Pagination du fil invalide');
  }

  const sharedId = '123e4567-e89b-42d3-a456-426614174000';
  globalThis.fetch = async (url, options = {}) => {
    lastRequest = { url: String(url), options };
    return { ok: true, async json() { return [{ id: sharedId, body: 'Anecdote partagée' }]; } };
  };
  response = createResponse();
  await anecdote({ method: 'GET', query: { id: sharedId } }, response);
  if (response.statusCode !== 200 || response.body.anecdote.id !== sharedId || !lastRequest.url.includes(`id=eq.${sharedId}`)) {
    throw new Error('Lecture du lien partagé invalide');
  }

  globalThis.fetch = async (url, options = {}) => {
    lastRequest = { url: String(url), options };
    const rateLimit = allowedRateLimitResponse(url);
    if (rateLimit) return rateLimit;
    if (lastRequest.url.includes('/rest/v1/anecdotes?')) {
      return { ok: true, status: 200, async json() { return [{ id: sharedId }]; } };
    }
    return { ok: true, status: 201, async json() { return []; } };
  };
  response = createResponse();
  await report({
    method: 'POST',
    headers: {},
    body: { anecdoteId: sharedId, reason: 'Ancien format libre.' }
  }, response);
  if (response.statusCode !== 422 || response.body.error !== 'invalid_report') {
    throw new Error('Un signalement doit utiliser un motif structuré');
  }
  response = createResponse();
  await report({
    method: 'POST',
    headers: {},
    body: { anecdoteId: sharedId, reasonCode: 'identification', details: 'La personne concernée est reconnaissable.' }
  }, response);
  const reportPayload = JSON.parse(lastRequest.options.body);
  if (response.statusCode !== 201 || reportPayload.anecdote_id !== sharedId || reportPayload.reporter_id !== null || !reportPayload.reason.startsWith('Une personne ou un lieu peut être identifié') || !lastRequest.url.endsWith('/rest/v1/reports')) {
    throw new Error('Signalement public invalide');
  }

  let reportInsertions = 0;
  globalThis.fetch = async (url, options = {}) => {
    lastRequest = { url: String(url), options };
    const rateLimit = allowedRateLimitResponse(url);
    if (rateLimit) return rateLimit;
    if (lastRequest.url.endsWith('/auth/v1/user')) return { ok: true, status: 200, async json() { return { id: 'reporter-123' }; } };
    if (lastRequest.url.includes('/rest/v1/anecdotes?')) return { ok: true, status: 200, async json() { return [{ id: sharedId }]; } };
    if (lastRequest.url.includes('/rest/v1/reports?')) return { ok: true, status: 200, async json() { return [{ id: 'existing-report' }]; } };
    if (lastRequest.url.endsWith('/rest/v1/reports')) {
      reportInsertions += 1;
      return { ok: true, status: 201, async json() { return []; } };
    }
    return { ok: false, status: 500, async json() { return []; } };
  };
  response = createResponse();
  await report({
    method: 'POST',
    headers: { authorization: 'Bearer reporter-token' },
    body: { anecdoteId: sharedId, reasonCode: 'inappropriate', details: '' }
  }, response);
  if (response.statusCode !== 200 || response.body.status !== 'already_reported' || reportInsertions !== 0) {
    throw new Error('Un compte ne doit pas pouvoir dupliquer un signalement ouvert');
  }

  response = createResponse();
  await adminQueue({ method: 'GET', headers: {} }, response);
  if (response.statusCode !== 401 || response.body.error !== 'authentication_required') {
    throw new Error('La file de modération doit exiger une session');
  }

  globalThis.fetch = async (url) => {
    if (String(url).endsWith('/auth/v1/user')) return { ok: true, status: 200, async json() { return { id: '223e4567-e89b-42d3-a456-426614174001' }; } };
    return { ok: true, status: 200, async json() { return [{ id: '223e4567-e89b-42d3-a456-426614174001', pseudonym: 'Membre', role: 'member' }]; } };
  };
  response = createResponse();
  await adminQueue({ method: 'GET', headers: { authorization: 'Bearer member-token' } }, response);
  if (response.statusCode !== 403 || response.body.error !== 'forbidden') {
    throw new Error('Un membre ne doit pas accéder à la modération');
  }

  globalThis.fetch = async (url) => {
    const value = String(url);
    if (value.endsWith('/auth/v1/user')) return { ok: true, status: 200, async json() { return { id: '323e4567-e89b-42d3-a456-426614174002' }; } };
    if (value.includes('/rest/v1/profiles?')) return { ok: true, status: 200, async json() { return [{ id: '323e4567-e89b-42d3-a456-426614174002', pseudonym: 'Admin', role: 'admin' }]; } };
    if (value.includes('/rest/v1/reports?')) return { ok: false, status: 404, async json() { return { error: 'missing_table' }; } };
    return { ok: true, status: 200, async json() { return [{ id: '423e4567-e89b-42d3-a456-426614174003', body: 'Anecdote en attente' }]; } };
  };
  response = createResponse();
  await adminQueue({ method: 'GET', headers: { authorization: 'Bearer moderator-token' } }, response);
  if (response.statusCode !== 200 || response.body.pending.length !== 1 || response.body.reportsAvailable !== false) {
    throw new Error('Une panne de signalements ne doit pas bloquer la file de modération');
  }

  const moderatorId = '323e4567-e89b-42d3-a456-426614174002';
  const pendingId = '423e4567-e89b-42d3-a456-426614174003';
  const reportId = '523e4567-e89b-42d3-a456-426614174004';
  const requests = [];
  globalThis.fetch = async (url, options = {}) => {
    const request = { url: String(url), options };
    requests.push(request);
    if (request.url.endsWith('/auth/v1/user')) {
      return { ok: true, status: 200, async json() { return { id: moderatorId, email: 'admin@example.com' }; } };
    }
    if (request.url.includes('/rest/v1/profiles?')) {
      if (request.url.includes('%2Crole')) return { ok: true, status: 200, async json() { return [{ id: moderatorId, pseudonym: 'Admin', role: 'admin' }]; } };
      if (request.url.includes('select=id%2Cpseudonym')) return { ok: true, status: 200, async json() { return [{ id: moderatorId, pseudonym: 'Admin' }]; } };
      return { ok: true, status: 200, async json() { return [{ id: moderatorId, pseudonym: 'Admin', role: 'admin' }]; } };
    }
    if (request.url.includes('/rest/v1/anecdotes?') && request.options.method === 'PATCH') {
      return { ok: true, status: 200, async json() { return [{ id: pendingId, author_id: moderatorId, moderation_status: 'refused' }]; } };
    }
    if (request.url.includes('/rest/v1/anecdotes?') && request.url.includes('moderation_status=eq.pending')) {
      return { ok: true, status: 200, async json() { return [{ id: pendingId, author_label: 'Anonyme', profession: 'Infirmière', theme: 'leger', body: 'À relire', submitted_at: '2026-08-06T10:00:00Z' }]; } };
    }
    if (request.url.includes('/rest/v1/anecdotes?')) {
      return { ok: true, status: 200, async json() { return [{ id: pendingId, author_label: 'Anonyme', profession: 'Infirmière', theme: 'leger', body: 'À relire', moderation_status: 'pending', submitted_at: '2026-08-06T10:00:00Z' }]; } };
    }
    if (request.url.includes('/rest/v1/reports?') && (!request.options.method || request.options.method === 'GET')) {
      return { ok: true, status: 200, async json() { return [{ id: reportId, anecdote_id: pendingId, reporter_id: moderatorId, reason: 'Détail à vérifier', created_at: '2026-08-06T10:05:00Z' }]; } };
    }
    if (request.url.endsWith('/rest/v1/moderation_decisions')) {
      return { ok: true, status: 201, async json() { return []; } };
    }
    if (request.url.endsWith('/rest/v1/account_notifications')) {
      return { ok: true, status: 201, async json() { return []; } };
    }
    if (request.url.includes('/rest/v1/reports?') && request.options.method === 'PATCH') {
      return { ok: true, status: 200, async json() { return [{ id: reportId }]; } };
    }
    return { ok: false, status: 500, async json() { return []; } };
  };

  response = createResponse();
  await adminQueue({ method: 'GET', headers: { authorization: 'Bearer moderator-token' } }, response);
  if (response.statusCode !== 200 || response.body.pending.length !== 1 || response.body.reports[0].reporter_label !== 'Admin') {
    throw new Error('File de modération administrateur invalide');
  }

  response = createResponse();
  await adminDecision({
    method: 'POST',
    headers: { authorization: 'Bearer moderator-token' },
    body: { anecdoteId: pendingId, status: 'refused', authorMessage: 'Le détail est trop identifiable.', internalNote: 'Relecture équipe', reportIds: [reportId] }
  }, response);
  const decisionRequest = requests.find((request) => request.url.endsWith('/rest/v1/moderation_decisions'));
  const notificationRequest = requests.find((request) => request.url.endsWith('/rest/v1/account_notifications'));
  if (response.statusCode !== 200 || !decisionRequest || !notificationRequest || JSON.parse(decisionRequest.options.body).moderator_id !== moderatorId || JSON.parse(notificationRequest.options.body).kind !== 'anecdote_refused' || response.body.resolvedReports !== 1) {
    throw new Error('Décision de modération invalide');
  }

  response = createResponse();
  await adminReport({ method: 'POST', headers: { authorization: 'Bearer moderator-token' }, body: { reportId } }, response);
  if (response.statusCode !== 200 || response.body.report.id !== reportId) {
    throw new Error('Clôture de signalement invalide');
  }

  console.log('33 contrats API vérifiés.');
} finally {
  process.env = originalEnv;
  globalThis.fetch = originalFetch;
}
