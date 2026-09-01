import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const outputDirectory = join(projectRoot, 'public');
const expectedFiles = ['admin.html', 'assets', 'auth.html', 'finalized.html', 'index.html', 'legal.html', 'profile.html', 'rules.html', 'theme.css'];
const vercelConfig = JSON.parse(await readFile(join(projectRoot, 'vercel.json'), 'utf8'));

if (vercelConfig.outputDirectory !== 'public') {
  throw new Error('vercel.json doit publier le dossier public');
}

const outputFiles = (await readdir(outputDirectory)).sort();
if (JSON.stringify(outputFiles) !== JSON.stringify(expectedFiles)) {
  throw new Error(`Sortie statique inattendue: ${outputFiles.join(', ')}`);
}

const copies = [
  ['theme.css', 'theme.css'],
  ['finalized.html', 'index.html'],
  ['finalized.html', 'finalized.html'],
  ['profile.html', 'profile.html'],
  ['auth.html', 'auth.html'],
  ['rules.html', 'rules.html'],
  ['legal.html', 'legal.html'],
  ['admin.html', 'admin.html']
];

for (const [source, destination] of copies) {
  const [sourceContent, outputContent] = await Promise.all([
    readFile(join(projectRoot, source), 'utf8'),
    readFile(join(outputDirectory, destination), 'utf8')
  ]);
  if (sourceContent !== outputContent) {
    throw new Error(`${destination} ne correspond pas a ${source}`);
  }
}

const assetFiles = await readdir(join(outputDirectory, 'assets'));
if (JSON.stringify(assetFiles.sort()) !== JSON.stringify(['admin.js', 'auth.js', 'feed.js', 'legal.js', 'profile.js', 'theme.js'])) {
  throw new Error(`Bundles inattendus: ${assetFiles.join(', ')}`);
}
for (const asset of assetFiles) {
  const bundle = await readFile(join(outputDirectory, 'assets', asset), 'utf8');
  if (bundle.length < 1000 || bundle.includes('SUPABASE_SECRET_KEY')) {
    throw new Error(`Bundle navigateur invalide: ${asset}`);
  }
}

console.log(`Sortie Vercel vérifiée: ${copies.length - 1} pages, 1 feuille de style et ${assetFiles.length} bundles navigateur présents.`);
