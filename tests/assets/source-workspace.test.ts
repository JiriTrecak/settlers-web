import {execFileSync} from 'node:child_process';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {expect,it} from 'vitest';
import {assetDefinitionSchema,resourceFilename} from '../../src/shared/authoring/asset';
it('resolves every canonical build input, with no second editable source tree',()=>{
 expect(existsSync('art/sources')).toBe(false);let builds=0;
 for(const folder of readdirSync('art/assets')){
  const a=assetDefinitionSchema.parse(JSON.parse(readFileSync('art/assets/'+folder+'/asset.json','utf8')));
  for(const r of a.resources.filter(r=>r.role==='build')){
   builds++;const build=JSON.parse(readFileSync('art/assets/'+folder+'/'+resourceFilename(r),'utf8'));
   for(const ref of Object.values(build.files) as any[]){const asset=assetDefinitionSchema.parse(JSON.parse(readFileSync('art/assets/'+ref.asset+'/asset.json','utf8'))),r=asset.resources.find(r=>r.role===ref.role&&r.index===ref.index);expect(r).toBeDefined();expect(existsSync('art/assets/'+ref.asset+'/'+resourceFilename(r!))).toBe(true);}
  }
 }
 expect(builds).toBeGreaterThan(50);
});
it('materializes a Blender build from role resources without modifying canonical assets',()=>{
 const file='art/assets/asset.models.units.ants-warrior/asset.json',before=readFileSync(file);
 const out=execFileSync('python3',['experiments/building-studio/source_workspace.py','asset.models.units.ants-warrior'],{encoding:'utf8'}).trim();
 expect(out.endsWith('/.asset-work/build/characters/ant-warrior-tripo')).toBe(true);
 expect(readFileSync(out+'/model.glb').equals(readFileSync('art/assets/asset.models.units.ants-warrior/geometry.glb'))).toBe(true);
 expect(readFileSync(file).equals(before)).toBe(true);
});
