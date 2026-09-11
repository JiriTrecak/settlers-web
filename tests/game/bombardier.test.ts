import {heading} from '../../src/sim/game/facing';
import {expect,it} from 'vitest';
import {commandCard,queueCard} from '../../src/presentation/commands';
import {game,placed,run,worker} from './helpers';
const workshop='building.ants.bombardier-workshop',bomb='unit.ants.bombardier',research='research.ants.saturating-shells';
it('gates the Workshop and its recruitment, refunds Root, and transforms a physical worker',()=>{
 const g=game([placed('workshop',workshop,205,210)]),w=worker(g),b=g.entities.find(e=>e.placement==='workshop')!,m=g.context.get(g.state.objectives[w.owner])!;
 m.inventory={'item.amber':1000,'item.wood':1000,'item.root':100};
 const build=()=>commandCard(g.view(w.owner),[w.id],w.owner,g.registry).find(c=>c.targetDefinition===workshop)!;
 const recruit=()=>commandCard(g.view(w.owner),[b.id],w.owner,g.registry).find(c=>c.targetDefinition===bomb)!;
 expect(build().enabled).toBe(false);expect(recruit().reason).toContain('Great Mound');
 m.definition='building.ants.great-mound';run(g,1);expect(build().enabled).toBe(true);
 expect(g.command(w.owner,recruit().immediate!).accepted).toBe(true);expect(m.inventory['item.root']).toBe(60);
 run(g,1);
 const cancel=queueCard(g.view(w.owner),b.id,w.owner,g.registry)[0].cancel!;
 expect(g.command(w.owner,cancel).accepted).toBe(true);expect(m.inventory['item.root']).toBe(100);
 expect(g.command(w.owner,recruit().immediate!).accepted).toBe(true);
 for(let i=0;i<2000&&!g.entities.some(e=>e.definition===bomb);i++)g.tick();
 expect(g.entities.some(e=>e.definition===bomb)).toBe(true);expect(m.inventory).toMatchObject({'item.amber':780,'item.wood':920,'item.root':60});
 expect(g.registry.get(workshop).behaviors.storage!.dropoff).not.toBe(true);
});
it('purchases permanent shell research and applies it to the real mortar at release',()=>{
 const g=game([placed('forge','building.ants.ironroot-forge',220,220),placed('bomb',bomb,205,210),{...placed('target','unit.ants.warrior',212,210),owner:'player.2'}]);
 const m=g.context.get(g.state.objectives['player.1'])!,f=g.entities.find(e=>e.placement==='forge')!,a=g.entities.find(e=>e.placement==='bomb')!,b=g.entities.find(e=>e.placement==='target')!;
 m.definition='building.ants.great-mound';m.inventory={'item.amber':1000,'item.wood':1000,'item.root':100};
 expect(g.command('player.1',{type:'research',actor:f.id,research}).accepted).toBe(true);
 // Advance research without introducing an unrelated battle before the release assertion.
 for(let i=0;i<2000;i++)g.research.tick();
 expect(g.state.research['player.1']).toContain(research);
 a.rotation=heading(a,b);a.unit!.target=b.id;g.combat.resolve();expect(a.unit!.attack?.impact).toBe(22);expect(g.state.shells).toHaveLength(0);
 g.state.tick=22;g.combat.resolve();expect(g.state.shells[0]).toMatchObject({radius:3,slowPermille:350,damage:42,damageType:'siege',impact:62});
});
