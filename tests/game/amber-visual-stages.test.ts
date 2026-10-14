import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {expect,it} from 'vitest';
import {game,placed,slots} from './helpers';
import {Game} from '../../src/sim/game/game';
import {content} from '../../src/content/builtin';
import {resourceDepositVisual} from '../../src/render/settlement/resourceDepositVisual';

it('retains the authored starting yield and full variant through observations and saved matches',()=>{
 const g=game([{...placed('crystal','building.test.neutral-amber-mine',220,240,{amount:2700}),owner:'none',appearance:{asset:'asset.test.resource-amber-crystal-5'}}]);
 const e=g.entities.find(e=>e.placement==='crystal')!,d=g.registry.get(e.definition);
 expect(e.resource!.initialAmount).toBe(2700);
 expect(resourceDepositVisual(d,e.resource!.amount,e.resource!.initialAmount,e.appearance?.asset)).toBe('asset.test.resource-amber-crystal-5');
 // One third remaining selects the authored low stage, relative to the placement's own starting yield.
 e.resource!.amount=900;g.observation.update();
 const view=g.view().entities.find(v=>v.id===e.id)!;
 expect(view.resource!.initialAmount).toBe(2700);
 expect(resourceDepositVisual(d,view.resource!.amount,view.resource!.initialAmount,view.appearance?.asset)).toBe('asset.test.resource-amber-crystal-low');
 const restored=new Game(g.map,slots,g.registry);restored.restore(g.snapshot());
 expect(restored.entities.find(v=>v.id===e.id)!.resource).toEqual(e.resource);
 expect(restored.snapshot()).toEqual(g.snapshot());
});

// Content validation: every shipped map places deposits with declared full variants and positive yields.
const maps=(dir:string):string[]=>readdirSync(dir,{withFileTypes:true}).flatMap(f=>f.isDirectory()?maps(join(dir,f.name)):f.name.endsWith('.utcmap')?[join(dir,f.name)]:[]);
it.each(maps('assets/maps'))('%s places deposits only with declared visual variants',file=>{
 const map=JSON.parse(readFileSync(file,'utf8'));
 for(const e of map.entities as any[]){
  const visuals=content.find(e.definition)?.resourceVisuals;
  if(!visuals)continue;
  if(e.appearance?.asset)expect(visuals.variants,e.id).toContain(e.appearance.asset);
  if(e.initialState?.amount!==undefined)expect(e.initialState.amount,e.id).toBeGreaterThan(0);
 }
});
