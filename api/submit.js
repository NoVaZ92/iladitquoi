import { getSupabaseAdminHeaders, getSupabaseConfig } from '../lib/supabase-config.js';

const MAX_CHARS = 355;

function sanitizePublicText(value) {
  const phone = /(?<!\d)(?:\+33\s?|0)[1-9](?:[\s.-]?\d{2}){4}(?!\d)/g;
  const email = /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/gi;
  const titledName = /\b(?:M|Mme|Monsieur|Madame|Dr|Docteur)\.?\s+[A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ'-]+(?:\s+[A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ'-]+)?/g;
  return value.replace(email, '[coordonnée masquée]').replace(phone, '[coordonnée masquée]').replace(titledName, '[personne]');
}

function allowOrigin(request, response) {
  const configuredOrigin = process.env.PUBLIC_APP_ORIGIN;
  if (configuredOrigin && request.headers.origin === configuredOrigin) response.setHeader('Access-Control-Allow-Origin', configuredOrigin);
  response.setHeader('Vary', 'Origin');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(request, response) {
  allowOrigin(request, response);
  if (request.method === 'OPTIONS') return response.status(204).end();
  if (request.method !== 'POST') return response.status(405).json({ error: 'method_not_allowed' });

  const { url, secretKey } = getSupabaseConfig();
  if (!url || !secretKey) return response.status(503).json({ error: 'service_not_configured' });

  const body = typeof request.body === 'object' && request.body ? request.body : {};
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const profession = typeof body.profession === 'string' ? body.profession.trim().slice(0, 80) : '';
  const theme = typeof body.theme === 'string' ? body.theme.trim().slice(0, 40) : 'leger';
  const anonymous = body.anonymous === true;
  if (!text || text.length > MAX_CHARS || !profession) return response.status(422).json({ error: 'invalid_submission' });

  const payload = {
    body: sanitizePublicText(text),
    profession,
    theme,
    visibility: 'public',
    moderation_status: 'pending',
    author_label: anonymous ? 'Anonyme' : 'Membre'
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
  return response.status(201).json({ id: anecdote.id, status: anecdote.moderation_status });
}
