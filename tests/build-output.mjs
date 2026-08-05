import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const outputDirectory = join(projectRoot, 'public');
const expectedFiles = ['finalized.html', 'index.html', 'profile.html'];
const vercelConfig = JSON.parse(await readFile(join(projectRoot, 'vercel.json'), 'utf8'));

if (vercelConfig.outputDirectory !== 'public') {
  throw new Error('vercel.json doit publier le dossier public');
}

const outputFiles = (await readdir(outputDirectory)).sort();
if (JSON.stringify(outputFiles) !== JSON.stringify(expectedFiles)) {
  throw new Error(`Sortie statique inattendue: ${outputFiles.join(', ')}`);
}

const copies = [
  ['finalized.html', 'index.html'],
  ['finalized.html', 'finalized.html'],
  ['profile.html', 'profile.html']
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

console.log('Sortie Vercel vérifiée: public/ contient les 3 pages attendues.');
