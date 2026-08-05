import { readFile } from 'node:fs/promises';

const files = ['finalized.html', 'profile.html', 'api/health.js', 'api/ready.js', 'api/config.js', 'api/feed.js', 'api/submit.js', 'supabase/migrations/0001_initial_schema.sql'];
const contents = await Promise.all(files.map((file) => readFile(file, 'utf8')));

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
  [contents[7], 'enable row level security', 'RLS Supabase']
];

for (const [content, needle, label] of contracts) {
  if (!content.includes(needle)) throw new Error(`Contrat manquant: ${label}`);
}

console.log(`${contracts.length} contrats de livraison vérifiés.`);
