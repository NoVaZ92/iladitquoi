import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const outputDirectory = join(projectRoot, 'public');
const expectedFiles = ['admin.html', 'assets', 'auth.html', 'finalized.html', 'index.html', 'legal.html', 'member.html', 'profile.html', 'rules.html', 'theme.css'];
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
  ['member.html', 'member.html'],
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
if (JSON.stringify(assetFiles.sort()) !== JSON.stringify(['admin-frame-gold.gif', 'admin.js', 'auth.js', 'feed.js', 'legal.js', 'member.js', 'profile.js', 'theme.js'])) {
  throw new Error(`Bundles inattendus: ${assetFiles.join(', ')}`);
}
const browserBundles = assetFiles.filter((asset) => asset.endsWith('.js'));
for (const asset of browserBundles) {
  const bundle = await readFile(join(outputDirectory, 'assets', asset), 'utf8');
  if (bundle.length < 1000 || bundle.includes('SUPABASE_SECRET_KEY')) {
    throw new Error(`Bundle navigateur invalide: ${asset}`);
  }
}

const [sourceAdminFrame, outputAdminFrame] = await Promise.all([
  readFile(join(projectRoot, 'assets', 'admin-frame-gold.gif')),
  readFile(join(outputDirectory, 'assets', 'admin-frame-gold.gif'))
]);
if (!sourceAdminFrame.subarray(0, 6).equals(Buffer.from('GIF89a')) || !sourceAdminFrame.equals(outputAdminFrame)) {
  throw new Error('Le GIF du cadre Admin est invalide ou absent de la sortie Vercel');
}
const graphicControlSignature = Buffer.from([0x21, 0xf9, 0x04]);
let animationFrames = 0;
let frameOffset = 0;
while ((frameOffset = sourceAdminFrame.indexOf(graphicControlSignature, frameOffset)) !== -1) {
  animationFrames += 1;
  frameOffset += graphicControlSignature.length;
}
if (animationFrames !== 32 || !sourceAdminFrame.includes(Buffer.from('NETSCAPE2.0'))) {
  throw new Error(`Le cadre Admin doit contenir une boucle animée de 32 images, reçu ${animationFrames}`);
}

console.log(`Sortie Vercel vérifiée: ${copies.length - 1} pages, 1 feuille de style, ${browserBundles.length} bundles navigateur et 1 GIF présents.`);
