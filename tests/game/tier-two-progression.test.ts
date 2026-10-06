import {snapPlacement} from '../../src/shared/spatial/placement';
import {expect,it} from 'vitest';
import {commandCard} from '../../src/presentation/commands';
import {game,placed,worker} from './helpers';
import type {Game} from '../../src/sim/game/game';

it('constructs the Root economy, upgrades, trains both T2 units independently of workers and fights with researched shells across restore',()=>{
 const placements=[placed('supply','building.ants.house',245,245),{...placed('root','building.neutral.corrupted-root',235.5,171.5),owner:'none'}];
 const g=game(placements),w=worker(g),owner=w.owner,mound=g.context.get(g.state.objectives[owner])!;
 // Fund only the ordinary economy; all Root must physically arrive from the deposit.
 g.state.wallets[mound.owner]={'item.amber':5000,'item.wood':5000};
 const until=(sim:Game,condition:()=>boolean,limit=14000)=>{
  for(let i=0;i<limit&&!condition();i++)sim.tick();expect(condition()).toBe(true);
 };
 const explore=(x:number,y:number)=>{
  expect(g.command(owner,{type:'move',actors:[w.id],destination:{x:Math.round(x),y:Math.round(y)}}).accepted).toBe(true);
  until(g,()=>Math.hypot(w.x-x,w.y-y)<2);
 };
 const build=(definition:string,x:number,y:number)=>{
  explore(x,y+12);
  const result=g.command(owner,{type:'build',actors:[w.id],definition,position:snapPlacement(g.registry.get(definition),{x,y})});
  expect(result,definition+': '+result.reason).toMatchObject({accepted:true});
  const b=g.entities.find(e=>e.definition===definition)!;until(g,()=>!b.construction);return b;
 };
 // Tier 2 depends on amber and wood, not the advanced Root economy.
 expect(g.command(owner,{type:'upgrade',actor:mound.id}).accepted).toBe(true);
 expect(g.command(owner,{type:'cancelUpgrade',actor:mound.id}).accepted).toBe(true);
 explore(248,178);
 const works=build('building.ants.rootworks',237.5,189.5);
 const root=g.entities.find(e=>e.placement==='root')!;
 expect(g.command(owner,{type:'gather',actors:[w.id],target:root.id}).accepted).toBe(true);
 until(g,()=>(g.state.wallets[mound.owner]['item.root']??0)>=130,22000);
 expect(g.state.wallets[mound.owner]['item.root']).toBe(130);
 expect(root.resource!.amount).toBe(1370);
 expect(works.inventory['item.root']??0).toBe(0);
 expect(g.command(owner,{type:'stop',actors:[w.id]}).accepted).toBe(true);
 const barracks=build('building.ants.barracks',189.5,225.5);
 const forge=build('building.ants.ironroot-forge',189.5,201.5);
 const hunter='unit.ants.hunter',bomb='unit.ants.bombardier';
 const hunterCard=()=>commandCard(g.view(owner),[barracks.id],owner,g.registry).find(c=>c.targetDefinition===hunter)!;
 expect(hunterCard().enabled).toBe(false);
 expect(g.command(owner,{type:'upgrade',actor:mound.id}).accepted).toBe(true);
 until(g,()=>mound.definition==='building.ants.great-mound');
 expect(g.state.objectives[owner]).toBe(mound.id);
 const workshop=build('building.ants.bombardier-workshop',213.5,165.5);
 const workers=new Set(g.entities.filter(e=>g.registry.get(e.definition).behaviors.work).map(e=>e.id));
 expect(g.command(owner,{type:'produce',actor:barracks.id,definition:hunter}).accepted).toBe(true);
 expect(g.command(owner,{type:'produce',actor:workshop.id,definition:bomb}).accepted).toBe(true);
 until(g,()=>g.entities.some(e=>e.definition===hunter)&&g.entities.some(e=>e.definition===bomb));
 const h=g.entities.find(e=>e.definition===hunter)!,b=g.entities.find(e=>e.definition===bomb)!;
 expect(workers.has(h.id)).toBe(false);expect(workers.has(b.id)).toBe(false);
 for(const research of ['research.ants.driving-spear','research.ants.saturating-shells'])
  expect(g.command(owner,{type:'research',actor:forge.id,research}).accepted).toBe(true);
 until(g,()=>(g.state.research[owner]??[]).includes('research.ants.saturating-shells'));
 expect(g.state.wallets[mound.owner]['item.root']??0).toBe(0);
 const enemy=g.context.create({...placed('target','unit.ants.warrior',223,189),owner:'player.2'});
 g.observation.update();
 expect(g.command(owner,{type:'attack',actors:[b.id,h.id],target:enemy.id,force:false}).accepted).toBe(true);
 until(g,()=>g.state.shells.some(s=>!s.resolved),3000);
 expect(g.state.shells.find(s=>!s.resolved)).toMatchObject({radius:3,slowPermille:350});
 const restored=game(placements);restored.restore(g.snapshot());
 for(let i=0;i<1000&&(g.context.get(enemy.id)?.hp??0)>=g.registry.get(enemy.definition).body!.maxHp;i++){g.tick();restored.tick();}
 expect(restored.snapshot()).toEqual(g.snapshot());
 expect(g.context.get(enemy.id)?.hp??0).toBeLessThan(g.registry.get(enemy.definition).body!.maxHp);
},20000);
