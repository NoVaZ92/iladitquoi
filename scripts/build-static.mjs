import { copyFile, mkdir, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const outputDirectory = join(projectRoot, 'public');
const execFileAsync = promisify(execFile);
const esbuildExecutable = join(projectRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'esbuild.cmd' : 'esbuild');
const files = [
  ['finalized.html', 'index.html'],
  ['finalized.html', 'finalized.html'],
  ['profile.html', 'profile.html'],
  ['auth.html', 'auth.html'],
  ['rules.html', 'rules.html']
];
const bundles = ['auth', 'feed', 'profile'];

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await mkdir(join(outputDirectory, 'assets'), { recursive: true });
await Promise.all([
  ...files.map(([source, destination]) =>
    copyFile(join(projectRoot, source), join(outputDirectory, destination))
  ),
  ...bundles.map((name) => execFileAsync(esbuildExecutable, [
      join(projectRoot, `src/${name}.js`),
      '--bundle',
      '--format=esm',
      '--minify',
      '--platform=browser',
      '--target=es2022',
      `--outfile=${join(outputDirectory, `assets/${name}.js`)}`
    ]))
]);

console.log(`Static output generated: public/ (${files.length} pages and ${bundles.length} bundles).`);
