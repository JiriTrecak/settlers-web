import {readFile,writeFile} from 'node:fs/promises';
import {resizeModelTextures} from '../../../tooling/asset-studio/server/authoring/textureExport';
const source=new URL('../../../.asset-work/ant-army-2026-10-11/archer/refinement.glb',import.meta.url);
const target=new URL('./preview.glb',import.meta.url);
await writeFile(target,await resizeModelTextures(await readFile(source),1024));
console.log('Prepared unpublished Archer preview with runtime-sized textures.');
