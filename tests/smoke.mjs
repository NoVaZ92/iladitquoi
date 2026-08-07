import { readFile, readdir } from 'node:fs/promises';
import { sanitizePublicText } from '../lib/privacy-filter.js';
import { PROFESSIONS } from '../lib/professions.js';

const names = [
  'finalized.html', 'profile.html', 'auth.html', 'rules.html', 'admin.html',
  'src/admin.js', 'src/feed.js', 'src/profile.js', 'src/auth.js',
  'api/health.js', 'api/config.js', 'api/feed.js', 'api/anecdote.js', 'api/report.js', 'api/submit.js', 'api/private.js', 'api/private-share.js', 'api/account.js', 'api/admin/queue.js', 'api/admin/decision.js', 'api/admin/report.js',
  'lib/supabase-config.js', 'lib/auth-user.js', 'lib/moderator.js', 'lib/rate-limit.js', 'lib/vote-handler.js',
  'supabase/migrations/0001_initial_schema.sql', 'supabase/migrations/0002_authentication.sql', 'supabase/migrations/0003_publication_timestamp.sql', 'supabase/migrations/0004_profile_avatars.sql', 'supabase/migrations/0005_persistent_votes.sql', 'supabase/migrations/0006_refused_anecdote_retention.sql', 'supabase/migrations/0007_rate_limits.sql', 'supabase/migrations/0008_private_note_management.sql', 'supabase/migrations/0009_profile_privilege_protection.sql', 'supabase/migrations/0010_account_deletion.sql', 'supabase/migrations/0011_saved_anecdotes.sql', 'supabase/migrations/0012_hidden_moderation_status.sql', 'supabase/migrations/0013_moderation_notifications.sql', 'supabase/migrations/0014_owner_public_anecdote_deletion.sql',
  'scripts/build-static.mjs', 'package.json', 'vercel.json', '.nvmrc'
];
const source = Object.fromEntries(await Promise.all(names.map(async (name) => [name, await readFile(name, 'utf8')])));
const packageJson = JSON.parse(source['package.json']);
const vercelConfig = JSON.parse(source['vercel.json']);

async function countApiFunctions(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const counts = await Promise.all(entries.map((entry) => {
    const path = `${directory}/${entry.name}`;
    return entry.isDirectory() ? countApiFunctions(path) : entry.isFile() && entry.name.endsWith('.js') ? 1 : 0;
  }));
  return counts.reduce((total, count) => total + count, 0);
}

const contracts = [
  ['finalized.html', 'id="anecdote-editor"', 'composeur'],
  ['finalized.html', 'src="/assets/feed.js"', 'bundle du fil'],
  ['finalized.html', '>iladitquoi<', 'marque'],
  ['finalized.html', '@media (max-width: 800px)', 'mise en page mobile'],
  ['finalized.html', 'grid-template-columns: 256px minmax(620px, 1fr) 344px', 'mise en page grand écran'],
  ['finalized.html', '--xp-progress', 'jauge XP dynamique'],
  ['finalized.html', 'href="/rules.html"', 'lien vers les règles'],
  ['finalized.html', 'id="report-dialog"', 'motif de signalement structuré'],
  ['auth.html', 'id="resend-confirmation"', 'renvoi de confirmation e-mail'],
  ['profile.html', 'data-profile-tab="pending"', 'suivi de modération'],
  ['profile.html', 'Décisions de modération', 'titre explicite de la modération'],
  ['profile.html', 'id="delete-public-anecdote-dialog"', 'confirmation de suppression d’une anecdote publique'],
  ['profile.html', 'id="revoke-private-links-dialog"', 'confirmation de révocation des liens privés'],
  ['profile.html', 'id="delete-private-note-dialog"', 'confirmation de suppression des notes privées'],
  ['profile.html', 'saved-remove-button', 'retrait des sélections depuis le profil'],
  ['profile.html', 'data-admin-link', 'accès administration conditionnel'],
  ['auth.html', 'id="signup-form"', 'création de compte e-mail'],
  ['auth.html', 'accept="image/jpeg,image/png,image/gif"', 'import d’avatar restreint'],
  ['rules.html', 'Filtre automatique', 'règles de confidentialité'],
  ['admin.html', 'src="/assets/admin.js"', 'page administration'],
  ['admin.html', 'id="queue-list"', 'file de validation'],
  ['admin.html', 'id="admin-search"', 'recherche de modération'],
  ['admin.html', 'id="admin-app" aria-busy="true"', 'état de chargement visible'],
  ['src/admin.js', 'ClipboardCheck, createIcons, Eye', 'moteur des icônes de la modération'],
  ['src/admin.js', "fetch('/api/admin/decision'", 'décision de modération'],
  ['src/admin.js', "Rechargez la page ou reconnectez-vous", 'erreur administrateur visible'],
  ['src/admin.js', "fetch('/api/admin/report'", 'résolution de signalement'],
  ['src/admin.js', 'window.setInterval', 'rafraîchissement automatique de la modération'],
  ['api/admin/queue.js', 'getModeratorContext', 'file sécurisée'],
  ['api/admin/decision.js', 'author_message_required', 'motif de refus requis'],
  ['api/admin/report.js', 'resolved_by', 'traçabilité des signalements'],
  ['lib/moderator.js', "['moderator', 'admin']", 'contrôle de rôle serveur'],
  ['src/feed.js', "fetch('/api/submit'", 'soumission cloud'],
  ['src/feed.js', 'fetch(`/api/feed?${query}`', 'fil Supabase trié'],
  ['src/feed.js', 'rate_limit_exceeded', 'message utilisateur de limitation'],
  ['src/feed.js', '`${location.origin}/a/${anecdote.id}`', 'lien de partage du déploiement courant'],
  ['src/feed.js', "location.pathname.match(/^\\/a\\/", 'lecture de la route courte dans le navigateur'],
  ['src/feed.js', "fetch('/api/report'", 'signalement cloud'],
  ['src/feed.js', 'reasonCode: reason.value', 'motif de signalement structuré'],
  ['src/feed.js', "fetch('/api/private'", 'carnet privé cloud'],
  ['src/feed.js', "fetch('/api/vote'", 'votes persistants'],
  ['src/feed.js', 'setSavedAnecdote', 'synchronisation des sélections connectées'],
  ['src/feed.js', 'sharedPrivateToken', 'lecture du lien privé dans le navigateur'],
  ['src/feed.js', 'hasMore', 'pagination du fil'],
  ['src/feed.js', 'syncFeedUrl', 'filtres partageables du fil'],
  ['src/feed.js', 'searchTimer', 'recherche du fil côté serveur'],
  ['src/feed.js', 'import { PROFESSIONS, populateProfessionSelect }', 'métiers disponibles pour les filtres du navigateur'],
  ['src/auth.js', 'signInWithPassword', 'connexion e-mail'],
  ['src/auth.js', 'progressWithinLevel', 'progression XP dynamique'],
  ['src/auth.js', 'resetPasswordForEmail', 'récupération du mot de passe'],
  ['src/auth.js', "supabase.auth.resend", 'renvoi de confirmation e-mail'],
  ['src/auth.js', 'Motif du refus', 'motif de modération visible'],
  ['src/auth.js', 'Motif du retrait', 'motif de retrait visible'],
  ['src/auth.js', 'account_notifications', 'notifications de modération du profil'],
  ['src/auth.js', 'deleteOwnedPublicAnecdote', 'suppression propriétaire d’une anecdote publique'],
  ['src/auth.js', 'revokePrivateLinks', 'révocation des liens privés du propriétaire'],
  ['src/auth.js', 'deletePrivateAnecdote', 'suppression des notes privées du propriétaire'],
  ['src/auth.js', 'exportPersonalData', 'export des données personnelles'],
  ['src/auth.js', 'moderation_notifications', 'export des notifications de modération'],
  ['src/auth.js', 'deleteAccount', 'suppression du compte'],
  ['src/auth.js', 'migrateLocalSavedPosts', 'migration des sélections locales'],
  ['src/auth.js', 'getSavedAnecdotes', 'lecture des sélections synchronisées'],
  ['src/profile.js', 'setSavedAnecdote?.(post.id, false)', 'retrait synchronisé d’une sélection'],
  ['src/auth.js', 'migrateLegacyPrivateNotes', 'migration du carnet privé local'],
  ['src/auth.js', "supabase.storage\n        .from('avatars')", 'envoi de l’avatar vers Supabase Storage'],
  ['api/health.js', "status: 'ok'", 'health check'],
  ['api/health.js', 'configuration_required', 'readiness'],
  ['api/health.js', 'rate_limit_ready', 'readiness de la protection anti-abus'],
  ['api/health.js', 'account_deletion_ready', 'readiness de la suppression de compte'],
  ['api/config.js', 'configured', 'configuration publique'],
  ['api/feed.js', "request.query?.sort === 'new'", 'tri serveur'],
  ['api/feed.js', 'boundedInteger', 'pagination serveur bornée'],
  ['api/feed.js', 'PROFESSIONS.includes', 'filtre métier serveur contrôlé'],
  ['api/feed.js', 'normalizedSearch', 'recherche serveur normalisée'],
  ['api/anecdote.js', 'anecdote_not_found', 'anecdote partagée'],
  ['api/report.js', '/rest/v1/reports', 'persistance du signalement'],
  ['api/report.js', 'REPORT_REASONS', 'motifs de signalement contrôlés'],
  ['api/report.js', "status: 'already_reported'", 'déduplication des signalements connectés'],
  ['api/report.js', 'RATE_LIMITS.report', 'limite des signalements'],
  ['api/submit.js', 'sanitizePublicText', 'filtre serveur'],
  ['api/submit.js', 'profile.profession', 'métier du profil'],
  ['api/submit.js', 'RATE_LIMITS.publicSubmission', 'limite des publications'],
  ['api/private.js', "visibility: 'private'", 'persistance du carnet privé'],
  ['api/private.js', 'RATE_LIMITS.privateNote', 'limite des notes privées'],
  ['api/private-share.js', 'tokenHash', 'jeton privé haché'],
  ['api/private-share.js', 'RATE_LIMITS.privateShare', 'limite de création des liens privés'],
  ['api/account.js', 'RATE_LIMITS.accountDeletion', 'limite de suppression de compte'],
  ['api/account.js', '/auth/v1/admin/users/', 'suppression Auth du compte'],
  ['lib/rate-limit.js', "createHmac('sha256'", 'pseudonymisation des sujets de limitation'],
  ['lib/rate-limit.js', "response.status(429)", 'réponse de limitation explicite'],
  ['lib/vote-handler.js', 'cast_anecdote_vote', 'vote atomique'],
  ['lib/vote-handler.js', 'RATE_LIMITS.vote', 'limite des votes'],
  ['lib/supabase-config.js', 'SUPABASE_SECRET_KEY', 'clé secrète actuelle'],
  ['lib/supabase-config.js', 'SUPABASE_SERVICE_ROLE_KEY', 'compatibilité clé historique'],
  ['lib/auth-user.js', '/auth/v1/user', 'validation de session'],
  ['supabase/migrations/0001_initial_schema.sql', 'enable row level security', 'RLS Supabase'],
  ['supabase/migrations/0002_authentication.sql', 'protect_profile_privileges', 'protection des rôles'],
  ['supabase/migrations/0003_publication_timestamp.sql', 'anecdotes_publication_timestamp', 'date de publication automatique'],
  ['supabase/migrations/0004_profile_avatars.sql', "insert into storage.buckets", 'bucket avatars sécurisé'],
  ['supabase/migrations/0005_persistent_votes.sql', 'cannot_vote_own_anecdote', 'protection contre l’auto-vote'],
  ['supabase/migrations/0006_refused_anecdote_retention.sql', 'members delete their own refused anecdotes', 'RLS de suppression des anecdotes refusées'],
  ['supabase/migrations/0006_refused_anecdote_retention.sql', 'author_id = (select auth.uid())', 'propriété requise pour la suppression'],
  ['supabase/migrations/0006_refused_anecdote_retention.sql', "updated_at < now() - interval '30 days'", 'délai de conservation des refus'],
  ['supabase/migrations/0006_refused_anecdote_retention.sql', 'purge-refused-anecdotes-after-30-days', 'purge automatique des anecdotes refusées'],
  ['supabase/migrations/0007_rate_limits.sql', 'private.rate_limit_buckets', 'compteurs anti-abus privés'],
  ['supabase/migrations/0007_rate_limits.sql', 'grant execute on function public.consume_rate_limit', 'RPC anti-abus réservée au serveur'],
  ['supabase/migrations/0007_rate_limits.sql', 'public.rate_limit_ready', 'diagnostic de migration anti-abus'],
  ['supabase/migrations/0007_rate_limits.sql', 'purge-expired-rate-limit-buckets', 'purge des compteurs anti-abus'],
  ['supabase/migrations/0008_private_note_management.sql', 'members delete their own private anecdotes', 'RLS de suppression des notes privées'],
  ['supabase/migrations/0008_private_note_management.sql', 'owners revoke active private links', 'RLS de révocation des liens privés'],
  ['supabase/migrations/0009_profile_privilege_protection.sql', 'role and xp cannot be changed from a member session', 'protection contre l’auto-promotion'],
  ['supabase/migrations/0010_account_deletion.sql', 'on delete set null', 'conservation des décisions après suppression du modérateur'],
  ['supabase/migrations/0011_saved_anecdotes.sql', 'members save published anecdotes', 'RLS des sélections publiées'],
  ['supabase/migrations/0012_hidden_moderation_status.sql', "add value if not exists 'hidden'", 'statut de retrait distinct'],
  ['supabase/migrations/0013_moderation_notifications.sql', 'account_notifications', 'notifications de modération persistées'],
  ['supabase/migrations/0013_moderation_notifications.sql', 'members delete their own moderated anecdotes', 'RLS de suppression après retrait'],
  ['supabase/migrations/0014_owner_public_anecdote_deletion.sql', 'members delete their own public anecdotes', 'RLS de suppression des publications'],
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

const sentenceStart = sanitizePublicText('Incroyable journée au service.');
if (sentenceStart.changed || sentenceStart.text !== 'Incroyable journée au service.') throw new Error('Un premier mot en majuscule ne doit pas être pris pour un prénom');
const lowercaseName = sanitizePublicText("paul s'amuse au travail.");
if (lowercaseName.changed || lowercaseName.text !== "paul s'amuse au travail.") throw new Error('Un prénom isolé doit être laissé à la modération humaine');
const titledName = sanitizePublicText('Le Dr Martin arrive dans le service.');
if (!titledName.changed || titledName.text.includes('Martin') || !titledName.flags.includes('nom avec civilité')) throw new Error('Un nom précédé d’une civilité doit rester masqué');
const privilegeMigration = source['supabase/migrations/0009_profile_privilege_protection.sql'];
if (privilegeMigration.includes('not public.is_moderator()') || !privilegeMigration.includes('auth.uid() = old.id')) {
  throw new Error('Un modérateur ne doit pas pouvoir modifier son propre rôle');
}

if (packageJson.name !== 'iladitquoi') throw new Error('Nom du package incorrect');
if (packageJson.engines?.node !== '24.x') throw new Error('Runtime Node 24 non verrouillée');
if (packageJson.dependencies?.['@supabase/supabase-js'] !== '2.112.1') throw new Error('Version Supabase JS non verrouillée');
if (packageJson.dependencies?.lucide !== '1.27.0') throw new Error('Version Lucide non verrouillée');
if (packageJson.devDependencies?.esbuild !== '0.28.1') throw new Error('Version esbuild non verrouillée');
if (source['.nvmrc'].trim() !== '24') throw new Error('.nvmrc doit cibler Node 24');
if (vercelConfig.outputDirectory !== 'public') throw new Error('Dossier de sortie Vercel incorrect');
if (!vercelConfig.rewrites.some((route) => route.source === '/a/:id' && route.destination.includes('anecdote=:id'))) throw new Error('Route courte de partage absente');
if (!vercelConfig.rewrites.some((route) => route.source === '/p/:token' && route.destination.includes('private=:token'))) throw new Error('Route courte privée absente');
if (!vercelConfig.rewrites.some((route) => route.source === '/api/vote' && route.destination.includes('action=vote'))) throw new Error('Route de vote regroupée absente');
if (!vercelConfig.rewrites.some((route) => route.source === '/admin' && route.destination === '/admin.html')) throw new Error('Route administration absente');
if (!vercelConfig.rewrites.some((route) => route.source === '/ready' && route.destination === '/api/health?ready=1')) throw new Error('Route readiness groupée absente');
if (Object.values(vercelConfig.functions || {}).some((config) => config && typeof config === 'object' && 'runtime' in config)) throw new Error('Runtime Vercel invalide');
if (await countApiFunctions('api') > 12) throw new Error('Le plan Vercel Hobby accepte au maximum 12 fonctions par déploiement');
const globalHeaders = vercelConfig.headers?.find((entry) => entry.source === '/(.*)')?.headers || [];
if (!globalHeaders.some((header) => header.key === 'Content-Security-Policy' && header.value.includes("default-src 'self'"))) throw new Error('Politique de sécurité du navigateur absente');
if (!globalHeaders.some((header) => header.key === 'Cross-Origin-Opener-Policy' && header.value === 'same-origin')) throw new Error('Isolation de fenêtre absente');

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
