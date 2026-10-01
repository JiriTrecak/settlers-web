import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve('.asset-work/build/neutral-creeps');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')));
const logPath = path.join(root, 'generation.json');
const state = fs.existsSync(logPath) ? JSON.parse(fs.readFileSync(logPath)) : {};
const driver = path.join(root, 'tripo_studio.mjs');

for (const item of manifest) {
  if (state[item.slug]?.uuid) continue;
  const run = spawnSync(process.execPath, [driver, 'generate', item.reference, '--polycount', '4500'], {
    encoding: 'utf8',
    timeout: 100_000,
  });
  process.stdout.write(run.stdout ?? '');
  process.stderr.write(run.stderr ?? '');
  if (run.status !== 0) {
    console.error(`Stopped after ${item.slug}. Check the Studio URL before retrying to avoid paying twice.`);
    process.exit(run.status || 1);
  }
  const result = run.stdout.trim().split('\n').map(line => {
    try { return JSON.parse(line); } catch { return null; }
  }).findLast(row => row?.uuid);
  if (!result) throw new Error(`${item.slug}: generation returned no asset UUID`);
  state[item.slug] = { ...result, model: 'H3.1', topology: 'Triangle', targetTriangles: 4500 };
  fs.writeFileSync(logPath, JSON.stringify(state, null, 2) + '\n');
  console.log(`${Object.keys(state).length}/${manifest.length}: ${item.slug} → ${result.uuid}`);
}
