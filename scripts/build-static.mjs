import { copyFile, mkdir, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const outputDirectory = join(projectRoot, 'public');
const execFileAsync = promisify(execFile);
const esbuildScript = join(projectRoot, 'node_modules', 'esbuild', 'bin', 'esbuild');
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

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await mkdir(join(outputDirectory, 'assets'), { recursive: true });
await Promise.all([
  ...files.map(([source, destination]) =>
    copyFile(join(projectRoot, source), join(outputDirectory, destination))
  ),
  ...bundles.map((name) => execFileAsync(process.execPath, [
    esbuildScript,
    join(projectRoot, `src/${name}.js`),
    '--bundle',
    '--format=esm',
    '--minify',
    '--platform=browser',
    '--target=es2022',
    `--outfile=${join(outputDirectory, `assets/${name}.js`)}`
  ]))
]);

console.log(`Static output generated: public/ (${files.length - 1} pages, 1 stylesheet and ${bundles.length} bundles).`);
