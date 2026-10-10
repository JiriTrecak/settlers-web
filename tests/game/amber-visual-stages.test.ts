import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {game,placed,slots} from './helpers';
import {Game} from '../../src/sim/game/game';
import {content} from '../../src/content/builtin';
import {resourceDepositVisual} from '../../src/render/settlement/resourceDepositVisual';

it('retains the authored starting yield and full variant through observations and saved matches',()=>{
 const g=game([{...placed('crystal','building.neutral.amber-mine',220,240,{amount:2700}),owner:'none',appearance:{asset:'asset.resource.amber-crystal-5'}}]);
 const e=g.entities.find(e=>e.placement==='crystal')!,d=content.get(e.definition);
 expect(e.resource!.initialAmount).toBe(2700);
 expect(resourceDepositVisual(d,e.resource!.amount,e.resource!.initialAmount,e.appearance?.asset)).toBe('asset.resource.amber-crystal-5');
 e.resource!.amount=900;g.observation.update();
 const view=g.view().entities.find(v=>v.id===e.id)!;
 expect(view.resource!.initialAmount).toBe(2700);
 expect(resourceDepositVisual(d,view.resource!.amount,view.resource!.initialAmount,view.appearance?.asset)).toBe('asset.resource.amber-crystal-low');
 const restored=new Game(g.map,slots,g.registry);restored.restore(g.snapshot());
 expect(restored.entities.find(v=>v.id===e.id)!.resource).toEqual(e.resource);
 expect(restored.snapshot()).toEqual(g.snapshot());
});
it.each(['echo-isles','turtle-rock'])('%s has one of every full variant per mineral site',name=>{
 const map=JSON.parse(readFileSync(`assets/maps/skirmish/${name}.utcmap`,'utf8'));
 const groups=new Map<string,any[]>();
 for(const e of map.entities.filter((e:any)=>e.definition==='building.neutral.amber-mine')){
  const id=e.id.slice(0,e.id.lastIndexOf('.'));groups.set(id,[...(groups.get(id)??[]),e]);
 }
 expect(groups.size).toBe(name==='echo-isles'?5:10);
 for(const nodes of groups.values()){
  expect(nodes.map(e=>e.appearance.asset).sort()).toEqual([...content.get('building.neutral.amber-mine').resourceVisuals!.variants].sort());
  expect(nodes.every(e=>e.initialState.amount>0)).toBe(true);
 }
});
