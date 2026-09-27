import {expect,it} from 'vitest';
import {content} from '../../src/content/builtin';
import {publishedAssets} from '../../src/shared/assets/manifest';
const definitions=['building.ants.fort','building.ants.great-mound','building.ants.house','building.ants.barracks','building.ants.rootworks','building.ants.ironroot-forge','building.ants.bombardier-workshop','building.ants.tower','building.neutral.amber-mine','building.neutral.corrupted-root','unit.ants.settler','unit.ants.warrior','unit.ants.archer','unit.ants.bombardier','unit.ants.civilian','unit.ants.youngling'];
it('binds every supplied roster member to one published model rather than a placeholder',()=>{
 for(const id of definitions){
  const def=content.get(id),records=publishedAssets.filter(a=>a.render.some(r=>r.id===def.asset));
  expect(records,id).toHaveLength(1);expect(records[0].id,id).not.toBe('asset.placeholder.missing-model');
 }
 expect(content.get('building.ants.house').name).toBe('Mound');
 expect(content.get('building.ants.ironroot-forge').name).toBe('Chitin Works');
 expect(content.get('building.ants.house').footprint!.width).toBeLessThan(content.get('building.ants.fort').footprint!.width);
});
