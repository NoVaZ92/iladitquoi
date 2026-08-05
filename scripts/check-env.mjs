import { getSupabaseConfig } from '../lib/supabase-config.js';

const { url, publishableKey, secretKey } = getSupabaseConfig();
const missing = [
  !url && 'SUPABASE_URL',
  !secretKey && 'SUPABASE_SECRET_KEY (ou SUPABASE_SERVICE_ROLE_KEY)',
  !publishableKey && 'SUPABASE_PUBLISHABLE_KEY (ou SUPABASE_ANON_KEY)',
  !process.env.PUBLIC_APP_ORIGIN && 'PUBLIC_APP_ORIGIN'
].filter(Boolean);

if (missing.length) {
  console.error(`Variables manquantes : ${missing.join(', ')}`);
  console.error('Ajoutez-les dans les variables Vercel ou exportez-les avant cette commande.');
  process.exit(1);
}

try {
  const origin = new URL(process.env.PUBLIC_APP_ORIGIN);
  const supabase = new URL(url);
  if (origin.protocol !== 'https:' || supabase.protocol !== 'https:') throw new Error('HTTPS requis');
  if (origin.pathname !== '/' || supabase.pathname !== '/') throw new Error('Les URLs ne doivent pas contenir de chemin');
} catch (error) {
  console.error(`Configuration invalide : ${error.message}`);
  process.exit(1);
}

console.log('Variables de production valides.');
