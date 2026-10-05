import {it,expect} from 'vitest';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import sharp from 'sharp';
import {prepareImage,verifyImage} from '../../scripts/releases/media';
import {releaseEntry,releaseImage,emptyChanges} from '../../src/shared/release/schema';

it('normalizes images, bounds dimensions, strips metadata and detects changed media',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'canopy-gallery-'));
 try{
  const source=join(folder,'source.png');
  await sharp({create:{width:2000,height:1000,channels:3,background:'#967acf'}}).png().withMetadata().toFile(source);
  const {image,bytes}=await prepareImage(source,'A forest scene','Forest preview');
  expect(image).toMatchObject({width:1600,height:800,caption:'Forest preview'});expect(bytes.length).toBeLessThanOrEqual(768*1024);
  const metadata=await sharp(bytes).metadata();expect(metadata.exif).toBeUndefined();expect(metadata.format).toBe('webp');
  await writeFile(join(folder,image.file),bytes);await expect(verifyImage(folder,image)).resolves.toBe(join(folder,image.file));
  await expect(verifyImage(folder,{...image,width:1200})).rejects.toThrow('dimensions');
  await writeFile(join(folder,image.file),Buffer.from('modified'));await expect(verifyImage(folder,image)).rejects.toThrow('hash mismatch');
 }finally{await rm(folder,{recursive:true,force:true});}
});
it('rejects unsafe gallery paths and preserves legacy release JSON',()=>{
 const old={...emptyChanges(),version:'0.2.0',publishedAt:'2026-10-05T12:00:00Z',title:'Existing release'};
 expect(releaseEntry.parse(old)).toEqual(old);
 for(const file of ['../secret.webp','https://example.com/image.webp','file:///secret','a.webp'])expect(releaseImage.safeParse({file,alt:'Preview',width:100,height:100}).success).toBe(false);
 const image={file:'a'.repeat(64)+'.webp',alt:'Preview',width:100,height:100};
 expect(releaseEntry.safeParse({...old,images:Array(9).fill(image)}).success).toBe(false);
 expect(releaseEntry.safeParse({...old,images:[image,image]}).success).toBe(false);
});
it('appends gallery images to the shared log and freezes references without touching old releases',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'canopy-gallery-cli-'));
 try{
  await mkdir(join(folder,'releases'));await mkdir(join(folder,'src-tauri'));
  const old={...emptyChanges(),version:'0.2.0',publishedAt:'2026-10-05T12:00:00Z',title:'Existing release'};
  await writeFile(join(folder,'releases/log.json'),JSON.stringify({schemaVersion:1,unreleased:{...emptyChanges(),added:['Gallery']},releases:[old]}));
  await writeFile(join(folder,'src-tauri/tauri.conf.json'),JSON.stringify({version:'0.2.0'}));
  const source=join(folder,'shot.png');await sharp({create:{width:64,height:32,channels:3,background:'#359755'}}).png().toFile(source);
  const script=resolve('scripts/releases/log.ts');const run=(...args:string[])=>execFileSync(process.execPath,['--import',resolve('node_modules/tsx/dist/loader.mjs'),script,...args],{cwd:folder,encoding:'utf8',stdio:'pipe'});
  run('image','--file',source,'--caption','New scene');
  let log=JSON.parse(await readFile(join(folder,'releases/log.json'),'utf8'));
  expect(log.unreleased.images[0].alt).toBe('New scene');expect(log.releases).toEqual([old]);
  await verifyImage(join(folder,'releases/media'),log.unreleased.images[0]);
  expect(()=>run('image','--file',source,'--caption','Duplicate')).toThrow();
  run('check');run('prepare','0.2.1','--title','Gallery release');
  log=JSON.parse(await readFile(join(folder,'releases/log.json'),'utf8'));
  expect(log.releases[0].images).toHaveLength(1);expect(log.unreleased.images).toBeUndefined();expect(log.releases[1]).toEqual(old);
 }finally{await rm(folder,{recursive:true,force:true});}
});
