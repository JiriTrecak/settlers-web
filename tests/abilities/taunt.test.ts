import {expect,it} from 'vitest';
import {coreAbilities} from '../../src/content/abilities/core';
import {abilitySchema,releaseEffects} from '../../src/content/abilities/schema';
import {encounterSettingsSchema} from '../../src/content/abilities/encounter';
import {createAbilityEncounter} from '../../src/sim/abilities/encounter';
import {SpellStatuses} from '../../src/sim/abilities/statuses';
import {reconcileTaunt} from '../../src/sim/abilities/taunt';
const base=coreAbilities.abilities.find(a=>a.id==='ability.core.unstoppable')!;
const taunt={op:'status',target:'target',id:'challenge',amount:60,polarity:'negative',dispel:true,modifiers:{},taunt:true};
function fixture(ops:unknown[]=[taunt],settings={}){
 const a=abilitySchema.parse({...base,targeting:{...base.targeting,relations:['ally','enemy']},onRelease:ops});
 const f=createAbilityEncounter(a,coreAbilities.presentations.find(p=>p.id===a.presentation)!,encounterSettingsSchema.parse({relationship:'enemy',combat:true,distance:4,targetHealth:500,...settings}));
 const statuses=new SpellStatuses(f.game),c=f.game.context.get(f.caster)!,t=f.game.context.get(f.target)!;
 c.unit!.order={type:'hold'};
 const apply=(index=0,source=f.caster,target=f.target)=>statuses.apply(source,target,a,1,f.game.state.nextCast++,releaseEffects(a,1,'enemy')[index]);
 return {...f,a,c,t,statuses,apply};
}
function tick(f:ReturnType<typeof fixture>,n:number){for(let i=0;i<n;i++)f.game.tick();}
it('temporarily overrides a hold order, advances and attacks only the challenger',()=>{
 const f=fixture();f.t.unit!.order={type:'hold'};const x=f.t.x;
 expect(f.apply()).toBe(60);expect(f.t.unit!.taunt?.source).toBe(f.caster);
 tick(f,45);expect(f.t.x).toBeLessThan(x);expect(f.c.hp).toBeLessThan(500);
 expect(f.t.unit!.target).toBe(f.caster);expect(f.t.unit!.order).toEqual({type:'hold'});
 tick(f,16);expect(f.t.unit!.taunt).toBeUndefined();expect(f.t.unit!.order).toEqual({type:'hold'});
});
it('rejects replacement commands while controlled and resumes the saved move on expiry',()=>{
 const f=fixture();const destination={x:140,y:120};
 expect(f.game.command('player.2',{type:'move',actors:[f.target],destination}).accepted).toBe(true);
 const order=structuredClone(f.t.unit!.order);f.apply();
 expect(f.game.command('player.2',{type:'stop',actors:[f.target]}).accepted).toBe(false);
 tick(f,60);const x=f.t.x;tick(f,30);expect(f.t.x).toBeGreaterThan(x);expect(f.t.unit!.order).toEqual(order);
});
it('dispel immediately releases the forced target without consuming orders',()=>{
 const f=fixture();f.t.unit!.order={type:'hold'};f.apply();tick(f,5);
 const dispel={op:'dispel' as const,target:'target' as const,amount:0,damageType:'spell',polarity:'negative' as const};
 expect(f.statuses.apply(f.caster,f.target,f.a,1,f.game.state.nextCast++,dispel)).toBe(1);
 expect(f.t.unit!.taunt).toBeUndefined();expect(f.t.unit!.target).toBeNull();expect(f.t.unit!.order).toEqual({type:'hold'});
});
it('releases control when the source dies or becomes friendly',()=>{
 for(const death of [true,false]){
  const f=fixture();f.apply();if(death){f.c.hp=0;f.game.onCombatDeath(f.c);}else f.c.owner=f.t.owner;
  tick(f,1);expect(f.t.unit!.taunt).toBeUndefined();expect(f.t.unit!.target).not.toBe(f.caster);
 }
});
it('taunt immunity prevents incoming control and suppresses existing control until the ward expires',()=>{
 const ward={...taunt,id:'ward',taunt:undefined,amount:10,polarity:'positive',controlImmunity:['taunt']};
 const f=fixture([taunt,ward]);f.apply(1,f.target);expect(f.apply()).toBe(0);expect(f.t.unit!.taunt).toBeUndefined();
 tick(f,11);f.apply();expect(f.t.unit!.taunt).toBeDefined();f.apply(1,f.target);expect(f.t.unit!.taunt).toBeUndefined();
 tick(f,11);expect(f.t.unit!.taunt?.source).toBe(f.caster);
});
it('weaponless and friendly actors do not acquire forced combat',()=>{
 const f=fixture([taunt],{combat:false});expect(f.apply()).toBe(0);expect(f.t.unit!.taunt).toBeUndefined();
 const g=fixture();g.t.owner=g.c.owner;expect(g.apply()).toBe(0);expect(g.t.unit!.taunt).toBeUndefined();
});
it('disarm stops forced movement and attacks while retaining the taunt timer',()=>{
 const f=fixture([taunt,{...taunt,id:'disarm',taunt:undefined,disarm:true,amount:10}]);f.apply();f.apply(1);const x=f.t.x;
 tick(f,8);expect(f.t.x).toBe(x);expect(f.t.unit!.attack).toBeUndefined();expect(f.t.unit!.taunt).toBeDefined();
 tick(f,12);expect(f.t.x).toBeLessThan(x);
});
it('competing taunts choose the latest cast and fall back when its source dies',()=>{
 const f=fixture([taunt,{...taunt,id:'challenge2'}],{targetCount:2});
 const other=f.game.entities.find(e=>e.placement==='target-1')!;other.owner=f.c.owner;
 f.apply();f.apply(1,other.id);expect(f.t.unit!.taunt?.source).toBe(other.id);
 other.hp=0;reconcileTaunt(f.game,f.t);expect(f.t.unit!.taunt?.source).toBe(f.caster);
});
it('saves and replays temporary navigation deterministically, rejecting invalid return cells',()=>{
 const f=fixture();f.t.unit!.order={type:'hold'};f.apply();tick(f,5);
 const g=fixture();g.game.restore(f.game.snapshot());
 for(let i=0;i<80;i++){f.game.tick();g.game.tick();expect(g.game.checksum()).toBe(f.game.checksum());}
 const invalid=fixture();invalid.apply();const save=invalid.game.snapshot();save.state.entities.find(e=>e.id===invalid.target)!.unit!.taunt!.resumeGoal=1048575;
 expect(()=>invalid.game.restore(save)).toThrow(/taunt navigation/);
});
it('interrupts an enemy cast, blocks recasting, and retains non-control payload on immune targets',()=>{
 const f=fixture([{...taunt,modifiers:{armor:-3}},{...taunt,id:'ward',taunt:undefined,polarity:'positive',controlImmunity:['taunt']}]);
 expect(f.game.abilities.cast(f.caster,'preview',f.target)).toBeNull();expect(f.c.abilities!.pending).toBeDefined();
 f.apply(0,f.target,f.caster);expect(f.c.abilities!.pending).toBeNull();expect(f.game.abilities.cast(f.caster,'preview',f.target)).not.toBeNull();
 f.apply(1,f.target);expect(f.apply()).toBe(60);expect(f.t.unit!.taunt).toBeUndefined();
 expect(f.game.context.stats(f.t).armor).toBe(f.game.context.def(f.t).body!.armor-3);
});
it('a worker preserves its job, pauses production, and returns before work resumes',async()=>{
 const {game,placed}=await import('../game/helpers');
 const {content}=await import('../../src/content/builtin');
 const {authoredDefinitionSchema}=await import('../../src/content/schema');
 const {emptyUtcMap}=await import('../../src/shared/map/utcmap');
 const a=abilitySchema.parse({...base,onRelease:[{...taunt,amount:80}]});
 const start=emptyUtcMap().playerStarts[1];
 const g=game([{...placed('tree','resource.forest.tree',start.x+10,start.z+4,{amount:10}),owner:'none'}],draft=>{
  const worker=authoredDefinitionSchema.parse(draft.definitions.find(x=>(x as {id:string}).id==='unit.ants.settler'));
  worker.behaviors??={};worker.behaviors.combat=structuredClone(content.get('unit.ants.warrior').behaviors.combat);worker.disabledBehaviors=worker.disabledBehaviors?.filter(b=>b!=='combat');
  draft.definitions=draft.definitions.filter(x=>(x as {id:string}).id!==worker.id).concat(worker);
  const library=draft.abilityLibrary as typeof coreAbilities;
  library.abilities=library.abilities.filter(x=>x.id!==a.id).concat(a);
 });
 const workers=g.entities.filter(e=>e.owner==='player.2'&&g.registry.get(e.definition).behaviors.work),w=workers[0],tree=g.entities.find(e=>e.placement==='tree')!;
 g.command('player.2',{type:'stop',actors:workers.map(e=>e.id)});
 expect(g.command('player.2',{type:'gather',actors:[w.id],target:tree.id}).accepted).toBe(true);
 for(let i=0;i<800&&!g.state.jobs.some(j=>j.worker===w.id&&j.phase==='work');i++)g.tick();
 const job=g.state.jobs.find(j=>j.worker===w.id)!;expect(job.phase).toBe('work');
 const home={x:w.x,y:w.y},goal=w.unit!.goal??g.spatial.cell(w);
 const enemy=g.context.create(placed('challenger','unit.ants.warrior',w.x+6,w.y));enemy.unit!.order={type:'hold'};
 const statuses=new SpellStatuses(g),progress=job.progress;
 expect(statuses.apply(enemy.id,w.id,a,1,g.state.nextCast++,releaseEffects(a,1,'enemy')[0])).toBe(80);
 expect(w.unit!.taunt?.resumeGoal).toBe(goal);
 for(let i=0;i<35;i++)g.tick();
 expect(w.unit!.job).toBe(job.id);expect(job.progress).toBe(progress);expect(w.x).not.toBe(home.x);
 enemy.hp=0;g.onCombatDeath(enemy);g.tick();expect(w.unit!.taunt).toBeUndefined();expect(w.unit!.goal).toBe(goal);expect(job.progress).toBe(progress);
 for(let i=0;i<100&&job.progress===progress;i++)g.tick();expect(job.progress).toBeGreaterThan(progress);
 expect(Math.hypot(w.x-home.x,w.y-home.y)).toBeLessThan(1);
});
it('does not pursue or reveal an invisible challenger',()=>{
 const f=fixture([taunt,{...taunt,id:'veil',taunt:undefined,polarity:'positive',concealment:{fadeTicks:0,breakOnAttack:false,breakOnCast:false}}]);
 f.apply();f.apply(1,f.caster,f.caster);const x=f.t.x;tick(f,8);
 expect(f.t.unit!.taunt?.source).toBe(f.caster);expect(f.t.unit!.target).toBeNull();expect(f.t.x).toBe(x);
 expect(f.game.observation.visible('player.2',f.c)).toBe(false);
});
