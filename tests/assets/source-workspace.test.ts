import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {expect,it} from 'vitest';
import {assetDefinitionSchema,resourceFilename} from '../../src/shared/authoring/asset';

// Content validation over every canonical asset package: each build manifest's inputs resolve to
// declared resources of existing packages.
it('resolves every canonical build input to a declared, present resource',()=>{
 for(const folder of readdirSync('art/assets')){
  const a=assetDefinitionSchema.parse(JSON.parse(readFileSync('art/assets/'+folder+'/asset.json','utf8')));
  for(const r of a.resources.filter(r=>r.role==='build')){
   const build=JSON.parse(readFileSync('art/assets/'+folder+'/'+resourceFilename(r),'utf8'));
   for(const ref of Object.values(build.files) as {asset:string;role:string;index:number}[]){
    const asset=assetDefinitionSchema.parse(JSON.parse(readFileSync('art/assets/'+ref.asset+'/asset.json','utf8')));
    const resource=asset.resources.find(r=>r.role===ref.role&&r.index===ref.index);
    expect(resource,`${folder} -> ${ref.asset}/${ref.role}:${ref.index}`).toBeDefined();
    expect(existsSync('art/assets/'+ref.asset+'/'+resourceFilename(resource!))).toBe(true);
   }
  }
 }
});
