// Portable entry point: prefer a configured Python, then installed/bundled image runtimes.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
if (!args.length || args[0] === 'serve') {
  console.log('Visual review now uses the shared asset workbench: http://127.0.0.1:5175/');
  const running = await fetch('http://127.0.0.1:5175/', {signal: AbortSignal.timeout(1500)}).then(r=>r.ok).catch(()=>false);
  if (running) process.exit(0);
  const child = spawn(process.execPath, [path.join(root, '../../node_modules/vite/bin/vite.js'), '--config', 'tooling/vite.config.ts'], {cwd:path.join(root,'../..'),stdio:'inherit'});
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
  child.on('error', error => {console.error(error.message);process.exitCode=1;});
  child.on('exit', code => {process.exitCode=code??1;});
} else {
const candidates = [process.env.BUILDING_PYTHON,
  path.join(root, '.venv/bin/python3'), 'python3',
  path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3')].filter(Boolean);
const python = candidates.find(p => spawnSync(p, ['-c', 'import PIL,numpy'], { stdio: 'ignore' }).status === 0);
if (!python) {
  console.error('Building Studio needs Python with Pillow and NumPy. Setup:\n  python3 -m venv experiments/building-studio/.venv\n  experiments/building-studio/.venv/bin/pip install -r experiments/building-studio/requirements.txt');
  process.exit(1);
}
const child = spawn(python, [path.join(root, 'studio.py'), ...(args.length ? args : ['serve'])], { stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });

}
