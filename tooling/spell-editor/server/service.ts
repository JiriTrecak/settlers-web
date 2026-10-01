import {presentationImages} from '../../../src/content/abilities/resources';
import {content,builtinSource} from '../../../src/content/builtin';
import {ContentRegistry} from '../../../src/content/registry';
import {readAbilityLibrary} from '../../content/abilities';
import {readPublished} from '../../asset-studio/server/authoring/publication';
import {publishedResource} from '../../asset-studio/server/authoring/packages';
import {withWorkspaceWriteLock} from '../../asset-studio/server/writeLock';
import path from 'node:path';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {canonical} from '../../../src/content/registry';
import {value,ABILITY_ABI,abilityLibrarySchema} from '../../../src/content/abilities/schema';
import {documentSchema,spellCommandSchema,type SpellDocument,type SpellCommand} from '../shared/protocol';
import {commitFiles} from '../../asset-studio/server/transaction';
import {createAbilityEncounter} from '../../../src/sim/abilities/encounter';
import {encounterSettingsSchema} from '../../../src/content/abilities/encounter';
import type {AbilityEvent} from '../../../src/sim/abilities/runtime';

const bytes=(value:unknown)=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const hash=(value:unknown)=>createHash('sha256').update(canonical(value)).digest('hex');
export class SpellEditorService {
 private queue:Promise<unknown>=Promise.resolve();
 private document?:SpellDocument;private settings=encounterSettingsSchema.parse({});
 private encounter?:ReturnType<typeof createAbilityEncounter>;private events:AbilityEvent[]=[];private timelineEvents:AbilityEvent[]=[];
 private targeting=false;private active=false;private rank=1;private selectedTarget:number|undefined;
 private interventions:{tick:number;command:SpellCommand}[]=[];
 private aim={x:126,y:120};
 private playing=false;private speed=1;private accumulator=0;private epoch=Date.now();
 constructor(readonly root:string){}
 execute(raw:unknown):Promise<unknown>{const command=spellCommandSchema.parse(raw);const run=this.queue.then(()=>['save','publish','bind'].includes(command.op)?withWorkspaceWriteLock(this.root,()=>this.command(command)):this.command(command));this.queue=run.catch(()=>{});return run;}
 private folder(id:string){return path.join(this.root,'content/abilities',id);}
 private async read(id:string){
  const folder=this.folder(id),document=documentSchema.parse({definition:JSON.parse(await readFile(path.join(folder,'definition.json'),'utf8')),presentation:JSON.parse(await readFile(path.join(folder,'presentation.json'),'utf8'))});
  return {document,revision:hash(document)};
 }
 private async validate(document:SpellDocument){
  // Exercise the same complete ContentRegistry and Game construction as live preview.
  const fixture=createAbilityEncounter(document.definition,document.presentation,this.settings,true);
  await this.resources(document);
  return {valid:true,contentFingerprint:fixture.game.registry.fingerprint,capabilities:['target.unit','target.point','branch.relation','heal','damage','lifecycle.direct','lifecycle.channel','delivery.area-waves','delivery.projectile','delivery.chain','delivery.line','status.timed','status.periodic','aura','summon','dispel','autocast']};
 }
 private async resources(document:SpellDocument){
  const refs=presentationImages(document.presentation);if(!refs.length)return;
  const published=await readPublished(this.root);
  for(const ref of refs){const asset=published?.find(a=>a.id===ref.asset),resource=asset?.resources.find(r=>r.role===ref.role&&r.index===ref.index);
   if(!asset||!resource)throw Error('Missing published spell image '+ref.asset);
   const file=publishedResource(asset,ref),buffer=await readFile(path.join(this.root,file));
   if(buffer.length!==resource.bytes||createHash('sha256').update(buffer).digest('hex')!==resource.sha256)throw Error('Damaged published spell image '+ref.asset);
  }
 }
 private reset(){this.targeting=false;if(!this.document)throw Error('Load an ability first');this.encounter=createAbilityEncounter(this.document.definition,this.document.presentation,this.settings,true);this.events=[];this.timelineEvents=[];this.accumulator=0;this.epoch++;}
 private collect(){if(!this.encounter)return;const fresh=this.encounter.game.abilities.drainEvents();this.events.push(...fresh);for(const event of fresh){const index=this.timelineEvents.findIndex(e=>e.id===event.id);if(index<0)this.timelineEvents.push(event);else this.timelineEvents[index]=event;}if(this.events.length>4096)this.events.splice(0,this.events.length-4096);if(this.timelineEvents.length>4096)this.timelineEvents.splice(0,this.timelineEvents.length-4096);}
 private step(count:number){if(!this.encounter)return;const duration=this.duration();for(let i=0;i<count&&this.encounter.game.state.tick<duration;i++){this.encounter.game.tick(undefined,{passiveUnits:!this.settings.combat});for(const entry of this.interventions)if(entry.tick===this.encounter.game.state.tick)this.intervene(entry.command);this.collect();}this.collect();if(this.encounter.game.state.tick>=this.duration())this.playing=false;}
 advance(elapsedMs:number){if(!this.playing||!this.encounter||!this.active)return;this.accumulator+=Math.min(250,elapsedMs)*this.speed;const ticks=Math.floor(this.accumulator/25);this.accumulator-=ticks*25;this.step(ticks);}
 state(){
  const encounter=this.encounter;if(!encounter)return {loaded:false,epoch:this.epoch};
  const {game,caster}=encounter;const target=this.selectedTarget??encounter.target;
  return {loaded:true,active:this.active,targeting:this.targeting,rank:this.rank,duration:this.duration(),epoch:this.epoch,tick:game.state.tick,playing:this.playing,speed:this.speed,settings:this.settings,caster,target,aim:this.aim,events:this.events,timelineEvents:this.timelineEvents,checksum:game.checksum(),
   deliveries:game.abilities.observedDeliveries(),entities:game.entities.map(e=>({id:e.id,owner:e.owner,x:e.x,y:e.y,rotation:e.rotation,hp:e.hp,definition:e.definition,modelDefinition:encounter.models.get(e.definition)??e.definition,spellStatuses:e.spellStatuses,maxHp:game.context.stats(e).maxHp,abilities:e.abilities})),
   document:this.document};
 }
 private duration(){
  if(!this.document)return 200;const a=this.document.definition,r=a.ranks[this.rank-1];
  const channel=a.cast.channel?value(a.cast.channel.waves,r)*value(a.cast.channel.intervalTicks,r):0;
  const delivery=a.delivery?.kind==='line'?a.delivery.length/a.delivery.speed*40:a.delivery?.kind==='projectile'?a.targeting.kind==='self'?0:value(a.targeting.range,r)/a.delivery.speed*40:a.delivery?.kind==='chain'?value(a.delivery.bounces,r)*a.delivery.intervalTicks:0;
  const lasting=Math.max(0,...a.onRelease.flatMap(op=>op.op==='branch'?[...op.then,...op.else]:[op]).map(op=>op.op==='status'?value(op.amount,r):op.op==='summon'?op.durationTicks:0));
  return Math.min(12000,Math.ceil(Math.max(200,a.activation==='passive'?400:0,a.cast.prepareTicks+channel+delivery+a.cast.recoverTicks+Math.max(80,lasting,...this.document.presentation.cues.map(c=>Math.max(c.durationTicks,...[c.motion?.rotation,c.motion?.scale,c.motion?.opacity].map(m=>(m?.periodTicks??0)*2)))))));
 }
 private startTake(){
  this.active=false;this.playing=false;this.reset();const {game,caster,target}=this.encounter!;
  game.context.get(caster)!.abilities!.ranks.preview=this.rank;
  const spell=this.document!.definition;
  // Passive preview grants the ability; the actual game aura interpreter applies recipients.
  const result=spell.activation==='passive'?{accepted:true,actors:[caster]}:game.command('player.1',{type:'castAbility',actor:caster,binding:'preview',target:spell.targeting.kind==='point'?{kind:'point',position:this.aim}:{kind:'unit',entity:spell.targeting.kind==='self'?caster:this.selectedTarget??target}});
  this.active=result.accepted;if(!result.accepted)game.context.get(caster)!.abilities!.ranks.preview=0;
  this.collect();return result;
 }
 private intervene(command:SpellCommand){
  const {game,caster}=this.encounter!,target=this.selectedTarget??this.encounter!.target;
  if(command.op==='preview.autocast')return game.command('player.1',{type:'abilityAutocast',actor:caster,binding:'preview',enabled:command.enabled});
  if(command.op==='preview.attack')return game.command('player.1',{type:'attack',actors:[caster],target});
  if(command.op==='preview.stop')game.command('player.1',{type:'stop',actors:[caster]});
  if(command.op==='preview.kill'){const e=game.context.get(command.subject==='caster'?caster:target);if(e){e.hp=0;game.onCombatDeath(e);game.observation.update();}}
  if(command.op==='preview.stun'){const e=game.context.get(caster);if(e)e.stunnedUntil=game.state.tick+command.ticks;}
  if(command.op==='preview.displace'){const c=game.context.get(caster),t=game.context.get(target);if(c&&t&&caster!==target){t.x=c.x+command.distance;t.y=c.y;if(t.unit){t.unit.position=null;t.unit.segment=null;t.unit.route=[];t.unit.order=null;}game.observation.update();}}
 }
 private async command(command:SpellCommand):Promise<unknown>{
  switch(command.op){
   case 'list':{const entries=await readdir(path.join(this.root,'content/abilities'),{withFileTypes:true});return Promise.all(entries.filter(e=>e.isDirectory()&&e.name.startsWith('ability.')).map(async e=>{const {document,revision}=await this.read(e.name);return {id:document.definition.id,name:document.definition.name,icon:document.presentation.icon,revision};}));}
   case 'catalog':return {statusSpells:(await readAbilityLibrary(this.root)).abilities.filter(a=>a.onRelease.some(op=>op.op==='status'||op.op==='branch'&&[...op.then,...op.else].some(effect=>effect.op==='status'))).map(a=>({id:a.id,name:a.name})),icons:(await readPublished(this.root)??[]).filter(a=>a.kind==='icon'&&a.bindings.render.some(r=>r.id===a.id)).map(a=>({id:a.id,name:a.name,keywords:a.tags})),units:content.definitions.filter(d=>d.kind==='unit').map(d=>({id:d.id,name:d.name})),textures:(await readPublished(this.root)??[]).filter(a=>a.resources.some(r=>r.role==='image')).map(a=>({id:a.id,name:a.name,images:a.resources.filter(r=>r.role==='image').map(r=>r.index)}))};
   case 'binding.read':{const raw=JSON.parse(await readFile(path.join(this.root,'content/game.json'),'utf8'));const registry=new ContentRegistry({...raw,assets:builtinSource.assets,abilityLibrary:await readAbilityLibrary(this.root)});const d=registry.get(command.definition);if(d.kind!=='unit')throw Error('Only units can cast abilities');return {definition:d.id,caster:d.behaviors.abilities??null,revision:hash(raw)};}
   case 'bind':{const raw=JSON.parse(await readFile(path.join(this.root,'content/game.json'),'utf8'));if(hash(raw)!==command.expectedRevision)throw Error('Revision conflict: reload unit bindings');const d=raw.definitions.find((d:{id:string})=>d.id===command.definition);if(!d||d.kind!=='unit')throw Error('Unknown unit');d.behaviors.abilities=command.caster;d.disabledBehaviors=d.disabledBehaviors?.filter((b:string)=>b!=='abilities');new ContentRegistry({...raw,assets:builtinSource.assets,abilityLibrary:await readAbilityLibrary(this.root)});await commitFiles(this.root,[{path:'content/game.json',bytes:bytes(raw)}]);return {bound:true,revision:hash(raw),definition:d.id};}
   case 'read':return this.read(command.id);
   case 'validate':return this.validate(command.document);
   case 'save':{
    const document=command.document;await this.validate(document);let revision:string|null=null;
    try{revision=(await this.read(document.definition.id)).revision;}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
    if(revision!==command.expectedRevision)throw Error('Revision conflict: reload before saving');
    await commitFiles(this.root,[{path:`content/abilities/${document.definition.id}/definition.json`,bytes:bytes(document.definition)},{path:`content/abilities/${document.definition.id}/presentation.json`,bytes:bytes(document.presentation)}]);
    return {document,revision:hash(document)};
   }
   case 'publish':{
    const {document,revision}=await this.read(command.id);if(revision!==command.expectedRevision)throw Error('Revision conflict: reload before publishing');await this.validate(document);
    const previous=await readAbilityLibrary(this.root);
    if(previous.abilities.some(a=>a.id!==command.id&&a.presentation===document.presentation.id))throw Error('A presentation is already owned by another ability; use a unique presentation ID');
    const library=abilityLibrarySchema.parse({schemaVersion:1,
     abilities:previous.abilities.filter(a=>a.id!==command.id).concat(document.definition),
     presentations:previous.presentations.filter(p=>p.id!==document.presentation.id).concat(document.presentation)});
    await commitFiles(this.root,[{path:'content/abilities/published.json',bytes:bytes({schemaVersion:1,abi:ABILITY_ABI,library})}]);
    return {published:true,id:command.id};
   }
   case 'preview.load':{await this.validate(command.document);const encounter=createAbilityEncounter(command.document.definition,command.document.presentation,command.settings,true);this.document=command.document;this.settings=command.settings;this.encounter=encounter;this.rank=1;this.targeting=false;this.active=false;this.playing=false;this.selectedTarget=undefined;this.interventions=[];this.aim={x:Math.round(120+command.settings.distance),y:120};this.events=[];this.timelineEvents=[];this.accumulator=0;this.epoch++;return this.state();}
   case 'preview.state':return this.state();
   case 'preview.reset':this.active=false;this.playing=false;this.interventions=[];this.reset();return this.state();
   case 'preview.play':this.playing=command.playing&&this.active;this.speed=command.speed;return this.state();
   case 'preview.step':if(this.active)this.step(command.ticks);return this.state();
   case 'preview.aim':this.aim=command.position;if(this.active){this.active=false;this.playing=false;this.interventions=[];this.reset();}return this.state();
   case 'preview.target':{if(!this.encounter)throw Error('Load an ability first');if(command.entity&&!this.encounter.game.context.get(command.entity))throw Error('Unknown preview target');this.selectedTarget=command.entity;if(this.active){this.active=false;this.playing=false;this.interventions=[];this.reset();}return this.state();}
   case 'preview.beginCast':{
    if(!this.document)throw Error('Load an ability first');
    if(this.document.definition.activation==='passive'||this.document.definition.targeting.kind==='self')return this.command({op:'preview.cast'});
    this.active=false;this.playing=false;this.interventions=[];this.selectedTarget=0;this.reset();this.targeting=true;
    return {accepted:true,targeting:true,state:this.state()};
   }
   case 'preview.confirmTarget':{
    if(!this.targeting)throw Error('Press Cast before choosing a target');
    if(command.target.kind!==this.document!.definition.targeting.kind)throw Error('Wrong target kind');
    if(command.target.kind==='point')this.aim=command.target.position;else this.selectedTarget=command.target.entity;
    const result=await this.command({op:'preview.cast'}) as {accepted:boolean;reason?:string};
    // Invalid clicks keep the fresh fixture waiting for a valid target.
    if(!result.accepted)this.targeting=true;
    return {...result,state:this.state()};
   }
   case 'preview.cast':{this.interventions=[];const result=this.startTake();this.playing=result.accepted;if(result.accepted&&this.document!.definition.activation==='passive')this.step(1);return {...result,state:this.state()};}
   case 'preview.seek':{if(this.active){const log=this.interventions,history=this.timelineEvents;this.startTake();this.interventions=log;this.timelineEvents=history;for(const entry of log)if(entry.tick===0)this.intervene(entry.command);this.step(Math.min(command.tick,this.duration()));}this.playing=false;return this.state();}
   case 'preview.autocast':case 'preview.attack':{if(!this.encounter)throw Error('Load an ability first');const result=this.intervene(command);if(result?.accepted)this.interventions.push({tick:this.encounter.game.state.tick,command});return {...result,state:this.state()};}
   case 'preview.stop':case 'preview.kill':case 'preview.stun':case 'preview.displace':{if(!this.encounter)throw Error('Load an ability first');this.timelineEvents=this.timelineEvents.filter(e=>e.tick<=this.encounter!.game.state.tick);this.interventions=this.interventions.filter(e=>e.tick<=this.encounter!.game.state.tick);this.interventions.push({tick:this.encounter.game.state.tick,command});this.intervene(command);this.collect();return this.state();}
   case 'preview.replay':{this.interventions=[];const result=this.startTake();const pending=this.encounter!.game.context.get(this.encounter!.caster)?.abilities?.pending;this.step(command.tick+(command.from==='release'?(pending?.releaseTick??0):0));this.playing=false;return {result,state:this.state()};}
   case 'preview.rank':{if(!this.encounter||!this.document?.definition.ranks[command.rank-1])throw Error('Invalid rank');this.rank=command.rank;this.active=false;this.playing=false;this.interventions=[];this.reset();return this.state();}
  }
 }
}
