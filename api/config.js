import { getSupabaseConfig } from '../lib/supabase-config.js';

export default function handler(_request, response) {
  const { url, publishableKey } = getSupabaseConfig();
  const legal = {
    publisherName: process.env.LEGAL_PUBLISHER_NAME || '',
    publishingDirector: process.env.LEGAL_PUBLISHING_DIRECTOR || '',
    contactEmail: process.env.LEGAL_CONTACT_EMAIL || '',
    postalAddress: process.env.LEGAL_POSTAL_ADDRESS || '',
    lastUpdated: process.env.LEGAL_LAST_UPDATED || '7 août 2026'
  };
  response.setHeader('Cache-Control', 'no-store');
  if (!url || !publishableKey) return response.status(503).json({ configured: false, legal });
  response.status(200).json({
    configured: true,
    supabaseUrl: url,
    supabasePublishableKey: publishableKey,
    supabaseAnonKey: publishableKey,
    legal
  });
}
