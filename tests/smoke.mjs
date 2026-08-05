import { readFile } from 'node:fs/promises';

const files = ['finalized.html', 'profile.html', 'api/health.js', 'api/ready.js', 'api/config.js', 'api/feed.js', 'api/submit.js', 'supabase/migrations/0001_initial_schema.sql', 'package.json', 'vercel.json', '.nvmrc', 'lib/supabase-config.js', 'auth.html', 'src/auth.js', 'lib/auth-user.js', 'supabase/migrations/0002_authentication.sql', 'scripts/build-static.mjs'];
const contents = await Promise.all(files.map((file) => readFile(file, 'utf8')));
const packageJson = JSON.parse(contents[8]);
const vercelConfig = JSON.parse(contents[9]);

const contracts = [
  [contents[0], 'id="anecdote-editor"', 'composeur'],
  [contents[0], "fetch('/api/submit'", 'soumission cloud'],
  [contents[0], "fetch('/api/feed'", 'chargement du fil cloud'],
  [contents[1], 'data-profile-tab="pending"', 'suivi de modération'],
  [contents[2], "status: 'ok'", 'health check'],
  [contents[3], 'configuration_required', 'vérification de disponibilité'],
  [contents[4], 'configured', 'configuration publique'],
  [contents[5], 'moderation_status', 'fil public cloud'],
  [contents[6], 'sanitizePublicText', 'filtre de confidentialité serveur'],
  [contents[6], 'authenticateRequest', 'identité de soumission'],
  [contents[7], 'enable row level security', 'RLS Supabase'],
  [contents[11], 'SUPABASE_SECRET_KEY', 'clé secrète Supabase actuelle'],
  [contents[11], 'SUPABASE_SERVICE_ROLE_KEY', 'compatibilité clé Supabase historique'],
  [contents[12], 'id="signup-form"', 'formulaire de création de compte'],
  [contents[12], 'id="google-login"', 'connexion Google'],
  [contents[13], 'signInWithPassword', 'connexion par mot de passe'],
  [contents[13], 'signInWithOAuth', 'authentification OAuth'],
  [contents[13], 'resetPasswordForEmail', 'récupération du mot de passe'],
  [contents[14], '/auth/v1/user', 'validation de session serveur'],
  [contents[15], 'protect_profile_privileges', 'protection des rôles et XP'],
  [contents[16], '--bundle', 'bundle navigateur local']
];

for (const [content, needle, label] of contracts) {
  if (!content.includes(needle)) throw new Error(`Contrat manquant: ${label}`);
}

if (packageJson.engines?.node !== '24.x') throw new Error('Runtime Node 24 non verrouillée');
if (packageJson.dependencies?.['@supabase/supabase-js'] !== '2.112.1') throw new Error('Version Supabase JS non verrouillée');
if (packageJson.devDependencies?.esbuild !== '0.28.1') throw new Error('Version esbuild non verrouillée');
if (Object.values(vercelConfig.functions || {}).some((config) => config && typeof config === 'object' && 'runtime' in config)) {
  throw new Error('Les runtimes Node officiels doivent être détectés depuis package.json, pas déclarés dans vercel.json');
}
if (contents[10].trim() !== '24') throw new Error('.nvmrc doit cibler Node 24');
if (contents[0].includes('content: "Bonjour, GardeDeNuit"')) throw new Error('Le compte de démonstration ne doit pas être présenté comme la session courante');
if (!contents[0].includes('data-auth-link') || !contents[1].includes('data-profile-pseudonym')) throw new Error('Points de montage de session manquants');

const authSource = contents[13];
for (const [formId, readStatement] of [
  ['signin-form', 'const values = new FormData(form);'],
  ['signup-form', 'const values = new FormData(form);'],
  ['reset-form', 'const email = String(new FormData(form).get(\'email\')).trim();']
]) {
  const handlerStart = authSource.indexOf(`document.querySelector('#${formId}')`);
  const nextHandler = authSource.indexOf("document.querySelector('#", handlerStart + 1);
  const readPosition = authSource.indexOf(readStatement, handlerStart);
  const busyPosition = authSource.indexOf('setBusy(form, true);', handlerStart);
  if (handlerStart < 0 || readPosition < handlerStart || readPosition >= nextHandler || busyPosition < readPosition || busyPosition >= nextHandler) {
    throw new Error(`Le formulaire ${formId} doit lire ses valeurs avant de désactiver ses champs`);
  }
}

console.log(`${contracts.length + 10} contrats de livraison vérifiés.`);
