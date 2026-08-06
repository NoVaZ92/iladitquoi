import { readFile } from 'node:fs/promises';
import { sanitizePublicText } from '../lib/privacy-filter.js';
import { PROFESSIONS } from '../lib/professions.js';

const names = [
  'finalized.html', 'profile.html', 'auth.html', 'rules.html', 'admin.html',
  'src/admin.js', 'src/feed.js', 'src/profile.js', 'src/auth.js',
  'api/health.js', 'api/ready.js', 'api/config.js', 'api/feed.js', 'api/anecdote.js', 'api/report.js', 'api/submit.js', 'api/admin/queue.js', 'api/admin/decision.js', 'api/admin/report.js',
  'lib/supabase-config.js', 'lib/auth-user.js', 'lib/moderator.js',
  'supabase/migrations/0001_initial_schema.sql', 'supabase/migrations/0002_authentication.sql', 'supabase/migrations/0003_publication_timestamp.sql',
  'scripts/build-static.mjs', 'package.json', 'vercel.json', '.nvmrc'
];
const source = Object.fromEntries(await Promise.all(names.map(async (name) => [name, await readFile(name, 'utf8')])));
const packageJson = JSON.parse(source['package.json']);
const vercelConfig = JSON.parse(source['vercel.json']);

const contracts = [
  ['finalized.html', 'id="anecdote-editor"', 'composeur'],
  ['finalized.html', 'src="/assets/feed.js"', 'bundle du fil'],
  ['finalized.html', '>iladitquoi<', 'marque'],
  ['finalized.html', '@media (max-width: 800px)', 'mise en page mobile'],
  ['finalized.html', 'grid-template-columns: 256px minmax(620px, 1fr) 344px', 'mise en page grand écran'],
  ['finalized.html', 'href="/rules.html"', 'lien vers les règles'],
  ['profile.html', 'data-profile-tab="pending"', 'suivi de modération'],
  ['profile.html', 'data-admin-link', 'accès administration conditionnel'],
  ['auth.html', 'id="signup-form"', 'création de compte e-mail'],
  ['rules.html', 'Filtre automatique', 'règles de confidentialité'],
  ['admin.html', 'src="/assets/admin.js"', 'page administration'],
  ['admin.html', 'id="queue-list"', 'file de validation'],
  ['admin.html', 'id="admin-app" aria-busy="true"', 'état de chargement visible'],
  ['src/admin.js', "fetch('/api/admin/decision'", 'décision de modération'],
  ['src/admin.js', "Rechargez la page ou reconnectez-vous", 'erreur administrateur visible'],
  ['src/admin.js', "fetch('/api/admin/report'", 'résolution de signalement'],
  ['api/admin/queue.js', 'getModeratorContext', 'file sécurisée'],
  ['api/admin/decision.js', 'author_message_required', 'motif de refus requis'],
  ['api/admin/report.js', 'resolved_by', 'traçabilité des signalements'],
  ['lib/moderator.js', "['moderator', 'admin']", 'contrôle de rôle serveur'],
  ['src/feed.js', "fetch('/api/submit'", 'soumission cloud'],
  ['src/feed.js', 'fetch(`/api/feed?sort=${sort}`', 'fil Supabase trié'],
  ['src/feed.js', '`${location.origin}/a/${anecdote.id}`', 'lien de partage du déploiement courant'],
  ['src/feed.js', "location.pathname.match(/^\\/a\\/", 'lecture de la route courte dans le navigateur'],
  ['src/feed.js', "fetch('/api/report'", 'signalement cloud'],
  ['src/auth.js', 'signInWithPassword', 'connexion e-mail'],
  ['src/auth.js', 'resetPasswordForEmail', 'récupération du mot de passe'],
  ['api/health.js', "status: 'ok'", 'health check'],
  ['api/ready.js', 'configuration_required', 'readiness'],
  ['api/config.js', 'configured', 'configuration publique'],
  ['api/feed.js', "request.query?.sort === 'new'", 'tri serveur'],
  ['api/anecdote.js', 'anecdote_not_found', 'anecdote partagée'],
  ['api/report.js', '/rest/v1/reports', 'persistance du signalement'],
  ['api/submit.js', 'sanitizePublicText', 'filtre serveur'],
  ['api/submit.js', 'profile.profession', 'métier du profil'],
  ['lib/supabase-config.js', 'SUPABASE_SECRET_KEY', 'clé secrète actuelle'],
  ['lib/supabase-config.js', 'SUPABASE_SERVICE_ROLE_KEY', 'compatibilité clé historique'],
  ['lib/auth-user.js', '/auth/v1/user', 'validation de session'],
  ['supabase/migrations/0001_initial_schema.sql', 'enable row level security', 'RLS Supabase'],
  ['supabase/migrations/0002_authentication.sql', 'protect_profile_privileges', 'protection des rôles'],
  ['supabase/migrations/0003_publication_timestamp.sql', 'anecdotes_publication_timestamp', 'date de publication automatique'],
  ['scripts/build-static.mjs', "const bundles = ['admin', 'auth', 'feed', 'profile']", 'bundles navigateur']
];

for (const [file, needle, label] of contracts) {
  if (!source[file].includes(needle)) throw new Error(`Contrat manquant: ${label}`);
}

for (const file of ['finalized.html', 'profile.html', 'auth.html', 'src/auth.js', 'src/feed.js']) {
  if (/google-login|signInWithOAuth|anecdotesdusoin\.fr|GardeDeNuit/.test(source[file])) {
    throw new Error(`Ancien contenu détecté dans ${file}`);
  }
}
if (/data-demo|À 3 h 12|Le stylo qui a sauvé/.test(source['finalized.html'])) throw new Error('Une anecdote de démonstration reste dans la page publique');
if (PROFESSIONS.length < 40 || !PROFESSIONS.includes('Orthophoniste') || !PROFESSIONS.includes('Dentiste')) throw new Error('Liste des métiers incomplète');

const privacy = sanitizePublicText("Amine envoie alors l'argent à son pote Mouloude !");
if (!privacy.changed || privacy.text.includes('Amine') || privacy.text.includes('Mouloude') || !privacy.flags.includes('prénom potentiel')) {
  throw new Error('Le filtre ne masque pas les prénoms potentiels');
}

if (packageJson.name !== 'iladitquoi') throw new Error('Nom du package incorrect');
if (packageJson.engines?.node !== '24.x') throw new Error('Runtime Node 24 non verrouillée');
if (packageJson.dependencies?.['@supabase/supabase-js'] !== '2.112.1') throw new Error('Version Supabase JS non verrouillée');
if (packageJson.dependencies?.lucide !== '1.27.0') throw new Error('Version Lucide non verrouillée');
if (packageJson.devDependencies?.esbuild !== '0.28.1') throw new Error('Version esbuild non verrouillée');
if (source['.nvmrc'].trim() !== '24') throw new Error('.nvmrc doit cibler Node 24');
if (vercelConfig.outputDirectory !== 'public') throw new Error('Dossier de sortie Vercel incorrect');
if (!vercelConfig.rewrites.some((route) => route.source === '/a/:id' && route.destination.includes('anecdote=:id'))) throw new Error('Route courte de partage absente');
if (!vercelConfig.rewrites.some((route) => route.source === '/admin' && route.destination === '/admin.html')) throw new Error('Route administration absente');
if (Object.values(vercelConfig.functions || {}).some((config) => config && typeof config === 'object' && 'runtime' in config)) throw new Error('Runtime Vercel invalide');

const authSource = source['src/auth.js'];
for (const [formId, readStatement] of [
  ['signin-form', 'const values = new FormData(form);'],
  ['signup-form', 'const values = new FormData(form);'],
  ['reset-form', "const email = String(new FormData(form).get('email')).trim();"]
]) {
  const handlerStart = authSource.indexOf(`document.querySelector('#${formId}')`);
  const nextHandler = authSource.indexOf("document.querySelector('#", handlerStart + 1);
  const readPosition = authSource.indexOf(readStatement, handlerStart);
  const busyPosition = authSource.indexOf('setBusy(form, true);', handlerStart);
  if (handlerStart < 0 || readPosition < handlerStart || readPosition >= nextHandler || busyPosition < readPosition || busyPosition >= nextHandler) {
    throw new Error(`Le formulaire ${formId} doit lire ses valeurs avant de désactiver ses champs`);
  }
}

console.log(`${contracts.length + 15} contrats de livraison vérifiés.`);
