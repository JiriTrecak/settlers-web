import {visualEffectSchema} from '../../src/content/effects/schema';
import {expect,it} from 'vitest';
import {Mesh} from 'three';
import {AbilityEffects} from '../../src/render/abilities/abilityEffects';
import {sampleCueMotion} from '../../src/render/abilities/cueMotion';
import {presentationSchema} from '../../src/content/abilities/schema';
import {UNTIL_DEATH} from '../../src/sim/abilities/state';
import {testAbilities,testEffects} from '../fixtures/content';

it('keeps Doom embers alive independently of the caster and clears every layer with the victim',()=>{
 const fx=new AbilityEffects(()=>testEffects),fresh=new AbilityEffects(()=>testEffects),p=testAbilities.presentations.find(p=>p.id==='presentation.test.doom')!;
 const entity={id:2,x:4,y:5,hp:100,spellStatuses:[{ability:'ability.test.doom',status:'doom',cast:1,source:1,started:12,expires:UNTIL_DEATH,aura:false}]};
 try{
  fx.syncStatuses([entity],1200,()=>p);fx.update(1200);expect(fx.liveCues).toBe(2);
  const roots=[...fx.root.children];expect(roots.some(r=>r.children.some(c=>c.visible))).toBe(true);
  fx.syncStatuses([entity],2400,()=>p);fx.update(2400);expect(fx.root.children).toEqual(roots);
  fresh.syncStatuses([entity],2400,()=>p);fresh.update(2400);
  const particles=(v:AbilityEffects)=>v.root.children.flatMap(r=>r.children.map(c=>[c.visible,c.position.toArray(),c.scale.toArray()]));
  expect(particles(fx)).toEqual(particles(fresh));
  fx.syncStatuses([],2401,()=>p);expect(fx.liveCues).toBe(0);
 }finally{fx.dispose();fresh.dispose();}
});

it('samples independent rotation and eased/bouncing pulses at reproducible tick positions',()=>{
 const motion={rotation:{periodTicks:320,direction:'clockwise' as const},scale:{periodTicks:80,min:.7,max:1.1,easing:'bounce' as const},opacity:{periodTicks:80,min:.4,max:1,easing:'sine' as const}};
 expect(sampleCueMotion(motion,80).rotation).toBeCloseTo(-Math.PI/2);
 expect(sampleCueMotion(motion,320)).toEqual(sampleCueMotion(motion,0));
 expect(sampleCueMotion(motion,0).scale).toBeCloseTo(.7);
 expect(sampleCueMotion(motion,40).scale).toBeCloseTo(1.1);
 expect(sampleCueMotion(motion,40).opacity).toBe(1);
 for(let tick=0;tick<320;tick++){const sample=sampleCueMotion(motion,tick);expect(sample.scale).toBeGreaterThanOrEqual(.7);expect(sample.scale).toBeLessThanOrEqual(1.100001);}
 const earlier=sampleCueMotion(motion,19.5);sampleCueMotion(motion,240);expect(sampleCueMotion(motion,19.5)).toEqual(earlier);
});

// Test-owned sustained aura: a static glow, a rotating ring and a bouncing pulse, all bound to the status lifetime.
const auraEffect=()=>visualEffectSchema.parse({schemaVersion:1,id:'effect.test.inline-aura',name:'Aura',durationTicks:320,loop:true,layers:[
 {id:'glow',sustain:true,anchor:'target',shape:'glow',colour:'#823bcc',accent:'#ffffff',durationTicks:80,count:1,size:1.6,height:.045,orientation:'ground',follow:true},
 {id:'wreath',sustain:true,anchor:'target',shape:'ring',colour:'#ffffff',accent:'#ffffff',durationTicks:80,count:1,size:4.5,height:.06,orientation:'ground',follow:true,motion:{rotation:{periodTicks:320,direction:'clockwise'}}},
 {id:'pulse',sustain:true,anchor:'target',shape:'glow',colour:'#ffffff',accent:'#ffffff',durationTicks:80,count:1,size:2.6,height:.075,orientation:'ground',follow:true,motion:{scale:{periodTicks:80,min:.72,max:1.06,easing:'bounce'}}},
]});
const auraPresentation=()=>presentationSchema.parse({schemaVersion:1,id:'presentation.test.inline-aura',animations:{prepare:'idle',release:'idle',recover:'idle',fallback:'idle'},effects:[{id:'aura',effect:'effect.test.inline-aura',event:'statusApplied',anchor:'target',lifetime:'status'}]});

it('keeps every aura layer steady beyond five seconds, follows movement, reconstructs identically and clears on status loss',()=>{
 const effect=auraEffect(),p=auraPresentation(),fx=new AbilityEffects(()=>[effect]),fresh=new AbilityEffects(()=>[effect]);
 const entity={id:2,x:4,y:5,hp:100,spellStatuses:[{ability:'ability.test.inline-aura',cast:1,source:1,started:1,expires:2,aura:true}]};
 const sync=(tick:number)=>{entity.spellStatuses[0].started=tick;entity.spellStatuses[0].expires=tick+1;fx.syncStatuses([entity],tick,()=>p);fx.update(tick,()=>({x:9,y:12,height:3}));};
 try{
  sync(1);const roots=[...fx.root.children],visuals=roots.filter(r=>r.children.length);expect(visuals).toHaveLength(effect.layers.length);expect(fx.liveCues).toBe(roots.length);const glow=visuals[0].children[0] as Mesh;
  const opacity=(glow.material as any).opacity;
  sync(201);sync(801);expect(fx.root.children).toEqual(roots);expect((glow.material as any).opacity).toBe(opacity);
  expect(roots.every(r=>r.position.x===9&&r.position.z===12&&r.position.y===roots[0].position.y)).toBe(true);expect(roots[0].position.y).toBeCloseTo(3,1);
  fresh.syncStatuses([entity],801,()=>p);fresh.update(801);
  expect(fresh.root.children.filter(r=>r.children.length).map(r=>r.children[0].scale.toArray())).toEqual(visuals.map(r=>r.children[0].scale.toArray()));
  expect(fresh.root.children.filter(r=>r.children.length).map(r=>r.children[0].rotation.toArray())).toEqual(visuals.map(r=>r.children[0].rotation.toArray()));
  fx.syncStatuses([{...entity,spellStatuses:[]}],802,()=>p);expect(fx.liveCues).toBe(0);
  fx.syncStatuses([{...entity,hp:0}],801,()=>p);expect(fx.liveCues).toBe(0);
  fx.syncStatuses([entity],803,()=>p);expect(fx.liveCues).toBe(0);
 }finally{fx.dispose();fresh.dispose();}
});

it('validates animation ranges and status-bound lifecycle declarations',()=>{
 const p=auraPresentation();
 p.effects[0].event='released';expect(presentationSchema.safeParse(p).success).toBe(false);
 const e=auraEffect();
 e.layers[1].motion!.rotation!.periodTicks=0;expect(visualEffectSchema.safeParse(e).success).toBe(false);
 e.layers[1].motion!.rotation!.periodTicks=320;e.layers[2].motion!.scale!.max=.1;expect(visualEffectSchema.safeParse(e).success).toBe(false);
});
it('tracks two statuses from one cast independently, including shared unfiltered visual layers',()=>{
 const fx=new AbilityEffects(()=>testEffects);
 const p=presentationSchema.parse({schemaVersion:1,id:'presentation.test.multi-status',animations:{prepare:'idle',release:'idle',recover:'idle',fallback:'idle'},effects:[{id:'glow',event:'statusApplied',effect:'effect.test.frost-armor',lifetime:'status',anchor:'target'}]});
 const statuses=[{ability:'ability.test.multi-status',status:'armor',cast:7,source:1,started:1,expires:200,aura:false},{ability:'ability.test.multi-status',status:'ward',cast:7,source:1,started:1,expires:300,aura:false}];
 try{
  const e={id:2,x:4,y:5,hp:100,spellStatuses:statuses};
  fx.syncStatuses([e],2,()=>p);const count=fx.liveCues;expect(count).toBeGreaterThan(0);expect(count%2).toBe(0);
  fx.syncStatuses([{...e,spellStatuses:statuses.slice(1)}],3,()=>p);expect(fx.liveCues).toBe(count/2);
  fx.syncStatuses([{...e,spellStatuses:[]}],4,()=>p);expect(fx.liveCues).toBe(0);
 }finally{fx.dispose();}
});

it('reconstructs waiting hero effects at their original phase and clears them on return or visibility loss',()=>{
 const fx=new AbilityEffects(()=>testEffects),fresh=new AbilityEffects(()=>testEffects),p=testAbilities.presentations.find(p=>p.id==='presentation.test.reincarnation')!;
 const r={id:2,owner:'player.1',x:4,y:5,ability:'ability.test.reincarnation',cast:17,started:12,due:292};
 try{
  fx.syncReturns([r],13,()=>p);fx.update(13);expect(fx.liveCues).toBeGreaterThan(0);const roots=[...fx.root.children];
  fx.syncReturns([r],140,()=>p);fx.update(140);expect(fx.root.children).toEqual(roots);
  fresh.syncReturns([r],140,()=>p);fresh.update(140);
  const particles=(v:AbilityEffects)=>v.root.children.flatMap(r=>r.children.map(c=>[c.visible,c.position.toArray(),c.scale.toArray()]));
  expect(particles(fx)).toEqual(particles(fresh));
  fx.syncReturns([],141,()=>p);expect(fx.liveCues).toBe(0);
  fx.syncReturns([r],200,()=>p);expect(fx.liveCues).toBeGreaterThan(0);
  fx.update(1000);fx.syncReturns([r],1001,()=>p);expect(fx.liveCues).toBe(0);
  fresh.syncReturns([],294,()=>p);expect(fresh.liveCues).toBe(0);
 }finally{fx.dispose();fresh.dispose();}
});
