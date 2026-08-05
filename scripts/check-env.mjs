const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY', 'PUBLIC_APP_ORIGIN'];
const missing = required.filter((name) => !process.env[name]);

if (missing.length) {
  console.error(`Variables manquantes : ${missing.join(', ')}`);
  console.error('Ajoutez-les dans les variables Vercel ou exportez-les avant cette commande.');
  process.exit(1);
}

try {
  const origin = new URL(process.env.PUBLIC_APP_ORIGIN);
  const supabase = new URL(process.env.SUPABASE_URL);
  if (origin.protocol !== 'https:' || supabase.protocol !== 'https:') throw new Error('HTTPS requis');
  if (origin.pathname !== '/' || supabase.pathname !== '/') throw new Error('Les URLs ne doivent pas contenir de chemin');
} catch (error) {
  console.error(`Configuration invalide : ${error.message}`);
  process.exit(1);
}

console.log('Variables de production valides.');
