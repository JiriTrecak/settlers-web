import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve('.asset-work/build/neutral-creeps');
const state = JSON.parse(fs.readFileSync(path.join(root, 'generation.json')));
const driver = path.join(root, 'tripo_studio.mjs');

for (const [slug, generation] of Object.entries(state)) {
  const destination = path.join(root, slug, 'source.glb');
  if (fs.existsSync(destination)) continue;
  const name = `neutral-${slug}-${generation.uuid.slice(0, 8)}`;
  const run = spawnSync(process.execPath, [driver, 'export', generation.uuid, name, '--out', destination], {
    encoding: 'utf8', timeout: 900_000,
  });
  process.stdout.write(run.stdout ?? '');
  process.stderr.write(run.stderr ?? '');
  if (run.status !== 0) {
    console.error(`Stopped at ${slug}; source GLBs already exported remain in their work folders.`);
    process.exit(run.status || 1);
  }
  console.log(`Exported ${slug}`);
}
