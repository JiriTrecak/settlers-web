/** Editor conversion at authoring time; the output has no source-map dependency.
 * Run with: npx vite-node --config vitest.config.ts scripts/maps/import-warcraft.ts source.w3x target.utcmap */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {readWarcraftMap} from '../../src/editor/import/warcraft/read';
import {convertWarcraftMap} from '../../src/editor/import/warcraft/convert';
import {stringifyUtcMap} from '../../src/shared/map/utcmap';
import {playableMapError} from '../../src/shared/map/playable';
const [source,target]=process.argv.slice(2);
if(!source||!target||!target.endsWith('.utcmap'))throw Error('Provide source.w3x and target.utcmap');
const {map,report}=convertWarcraftMap(readWarcraftMap(new Uint8Array(readFileSync(source))));
const error=playableMapError(map);if(error)throw Error(error);
mkdirSync(dirname(target),{recursive:true});writeFileSync(target,stringifyUtcMap(map));
process.stdout.write(JSON.stringify({target,...report},null,2)+'\n');
