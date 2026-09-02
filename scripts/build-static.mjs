import { copyFile, mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const outputDirectory = join(projectRoot, 'public');
const files = [
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
const bundles = ['admin', 'auth', 'feed', 'legal', 'member', 'profile', 'theme'];
const staticAssets = ['admin-frame-gold.gif'];

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await mkdir(join(outputDirectory, 'assets'), { recursive: true });
await Promise.all(files.map(([source, destination]) =>
  copyFile(join(projectRoot, source), join(outputDirectory, destination))
));
await Promise.all(staticAssets.map((asset) =>
  copyFile(join(projectRoot, 'assets', asset), join(outputDirectory, 'assets', asset))
));

try {
  for (const name of bundles) {
    await build({
      entryPoints: [join(projectRoot, `src/${name}.js`)],
      bundle: true,
      format: 'esm',
      minify: true,
      platform: 'browser',
      target: 'es2022',
      outfile: join(outputDirectory, `assets/${name}.js`)
    });
  }
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error);
  throw new Error(`Generation des bundles statiques impossible: ${detail}`, { cause: error });
}

console.log(`Static output generated: public/ (${files.length - 1} pages, 1 stylesheet, ${bundles.length} bundles and ${staticAssets.length} media asset).`);
