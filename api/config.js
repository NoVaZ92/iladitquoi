import { getSupabaseConfig } from '../lib/supabase-config.js';

export default function handler(_request, response) {
  const { url, publishableKey } = getSupabaseConfig();
  response.setHeader('Cache-Control', 'no-store');
  if (!url || !publishableKey) return response.status(503).json({ configured: false });
  response.status(200).json({
    configured: true,
    supabaseUrl: url,
    supabasePublishableKey: publishableKey,
    supabaseAnonKey: publishableKey
  });
}
