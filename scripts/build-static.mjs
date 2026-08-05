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
  ['auth.html', 'auth.html']
];

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await mkdir(join(outputDirectory, 'assets'), { recursive: true });
await Promise.all([
  ...files.map(([source, destination]) =>
    copyFile(join(projectRoot, source), join(outputDirectory, destination))
  ),
  execFileAsync(esbuildExecutable, [
    join(projectRoot, 'src/auth.js'),
    '--bundle',
    '--format=esm',
    '--minify',
    '--platform=browser',
    '--target=es2022',
    `--outfile=${join(outputDirectory, 'assets/auth.js')}`
  ])
]);

console.log(`Static output generated: public/ (${files.length} pages and 1 bundle).`);
