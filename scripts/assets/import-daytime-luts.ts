/** Lossless import of the approved reference DDS volumes. Pass a TextureCache directory. */
import {readFileSync,writeFileSync,copyFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';

const input=process.argv[2];
if(!input)throw new Error('Usage: node --import tsx scripts/assets/import-daytime-luts.ts <TextureCache directory>');
const reference=resolve('art/references/daytimes'),output=resolve('assets/textures/grading');
mkdirSync(reference,{recursive:true});mkdirSync(output,{recursive:true});
const result:Record<string,{size:number;rgba:string;sourceSHA256:string}>={};
for(const id of ['day','day_to_night','night','night_to_day','identity']){
 const name=`env_lut_${id}__vol_uncmp.dds`,path=join(input,name),dds=readFileSync(path);
 const width=dds.readUInt32LE(16),height=dds.readUInt32LE(12),depth=dds.readUInt32LE(24);
 if(dds.toString('ascii',0,4)!=='DDS '||dds.readUInt32LE(4)!==124||width!==16||height!==16||depth!==16||
    dds.readUInt32LE(84)!==0||dds.readUInt32LE(88)!==32||dds.readUInt32LE(92)!==0xff0000||
    dds.readUInt32LE(96)!==0xff00||dds.readUInt32LE(100)!==0xff||dds.readUInt32LE(104)!==0||dds.length!==128+16**3*4)
  throw new Error(`Unexpected DDS format: ${name}`);
 const rgba=Buffer.from(dds.subarray(128));
 for(let i=0;i<rgba.length;i+=4){const b=rgba[i];rgba[i]=rgba[i+2];rgba[i+2]=b;rgba[i+3]=255;}
 copyFileSync(path,join(reference,name));
 if(id!=='identity')result[id]={size:16,rgba:rgba.toString('base64'),sourceSHA256:createHash('sha256').update(dds).digest('hex')};
}
writeFileSync(join(output,'scouring-reference-luts.json'),JSON.stringify(result)+'\n');
console.log('Imported four 16³ grading volumes; preserved source DDS files and the identity reference.');
