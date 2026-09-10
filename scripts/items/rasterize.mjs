/** Export editable SVG sources to the game's square 128px PNG contract. */
import { createRequire } from 'node:module';
import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const require=createRequire(import.meta.url);
const sharp=require(process.env.ITEM_SHARP_MODULE || 'sharp');
const folder=fileURLToPath(new URL('../../assets/ui/icons/items-v1/',import.meta.url));
for(const file of await readdir(folder))if(file.endsWith('.svg'))await sharp(`${folder}/${file}`).resize(128,128).png().toFile(`${folder}/${file.replace('.svg','.png')}`);
