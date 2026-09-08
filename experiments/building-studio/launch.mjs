// Portable entry point: prefer a configured Python, then installed/bundled image runtimes.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const candidates = [process.env.BUILDING_PYTHON,
  path.join(root, '.venv/bin/python3'), 'python3',
  path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3')].filter(Boolean);
const python = candidates.find(p => spawnSync(p, ['-c', 'import PIL,numpy'], { stdio: 'ignore' }).status === 0);
if (!python) {
  console.error('Building Studio needs Python with Pillow and NumPy. Setup:\n  python3 -m venv experiments/building-studio/.venv\n  experiments/building-studio/.venv/bin/pip install -r experiments/building-studio/requirements.txt');
  process.exit(1);
}
const args = process.argv.slice(2);
const child = spawn(python, [path.join(root, 'studio.py'), ...(args.length ? args : ['serve'])], { stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
