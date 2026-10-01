import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const blender = '/Applications/Blender.app/Contents/MacOS/Blender';
const specs = JSON.parse(fs.readFileSync('scripts/assets/neutral-creeps.json'));
const script = path.resolve('scripts/assets/build-neutral-creep.py');
for (const [index, spec] of specs.entries()) {
  const output = path.resolve(`.asset-work/build/neutral-creeps/${spec.slug}/model.glb`);
  if (fs.existsSync(output) && process.argv.includes('--resume')) continue;
  const run = spawnSync(blender, ['-b', '--factory-startup', '-P', script, '--', spec.slug], {
    encoding: 'utf8', timeout: 180_000,
  });
  if (run.status !== 0) {
    process.stdout.write(run.stdout ?? '');
    process.stderr.write(run.stderr ?? '');
    console.error(`Failed at ${spec.slug}; the completed work folders are preserved.`);
    process.exit(run.status || 1);
  }
  const stats = (run.stdout || '').split('\n').findLast(line => line.startsWith('{"slug"'));
  console.log(`${index + 1}/${specs.length} ${stats ?? spec.slug}`);
}
