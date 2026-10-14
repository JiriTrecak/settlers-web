/** Shared harness for ability capability tests.
 * - `testSettings` fills encounter settings with test-owned units instead of the engine's shipped defaults.
 * - `encounterSource` is the test content source; the engine's neutral encounter roster (hard-coded shipped ids in
 *   src/content/abilities/encounter.ts, ENGINE-COUPLED) is aliased onto test neutral units so `relationship:'neutral'`
 *   fixtures run on test content only.
 * - `encounter` creates an ability encounter on that source.
 * - `editorWorkspace`/`useEditorWorkspace` give spell-editor services a test workspace whose content also aliases the
 *   engine's default encounter units (ENGINE-COUPLED: SpellEditorService validates `preview.load` with its default
 *   settings before applying the requested ones, so the default caster id must exist in the workspace).
 * - `editorService(root)` builds a SpellEditorService that works on a plain test workspace (see its comment).
 * - `runLockstep` drives two delayed lockstep peers from an encounter snapshot and checks checksums every tick. */
import {afterAll,beforeAll,expect} from 'vitest';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {encounterSettingsSchema,neutralEncounterModels,type EncounterSettings} from '../../src/content/abilities/encounter';
import {createAbilityEncounter} from '../../src/sim/abilities/encounter';
import type {AbilityDefinition,AbilityPresentation} from '../../src/content/abilities/schema';
import type {ContentSource} from '../../src/content/registry';
import type {Game} from '../../src/sim/game/game';
import {Room,Lockstep,MemoryChannel} from '../../src/net';
import {World} from '../../src/sim/world/world';
import {localMatch} from '../../src/shared';
import {testAbilities,testSource} from '../fixtures/content';
import {testWorkspace} from '../fixtures/content/workspace';
import {SpellEditorService} from '../../tooling/spell-editor/server/service';

const neutralModels=['unit.test.neutral-barkguard','unit.test.neutral-rootling','unit.test.neutral-twigcaster'];

/** Encounter settings whose caster and targets default to the test warrior. */
export function testSettings(settings:Record<string,unknown>={}):EncounterSettings{
 return encounterSettingsSchema.parse({casterDefinition:'unit.test.warrior',targetDefinition:'unit.test.warrior',...settings});
}

type Definitions={definitions:unknown[]};
function alias(base:Definitions,id:string,model:string){
 if(base.definitions.some(d=>(d as {id:string}).id===id))return;
 const source=base.definitions.find(d=>(d as {id:string}).id===model);
 if(!source)throw Error('Missing test unit '+model);
 base.definitions.push({...structuredClone(source) as object,id});
}
/** Aliases the engine's hard-coded encounter unit ids (defaults and neutral roster) onto test units. */
function aliasEncounterUnits<T extends Definitions>(base:T):T{
 const defaults=encounterSettingsSchema.parse({});
 for(const id of new Set([defaults.casterDefinition,defaults.targetDefinition]))alias(base,id,'unit.test.warrior');
 [...new Set(neutralEncounterModels)].forEach((id,i)=>alias(base,id,neutralModels[i%neutralModels.length]));
 return base;
}
/** Test content plus aliases for the engine's hard-coded encounter unit ids. */
export function encounterSource(base:ContentSource=testSource()):ContentSource{
 return aliasEncounterUnits(base);
}

/** A disposable test workspace for spell-editor services (see header). */
export async function editorWorkspace(){
 const workspace=await testWorkspace(),file=path.join(workspace.root,'content/game.json');
 await writeFile(file,JSON.stringify(aliasEncounterUnits(JSON.parse(await readFile(file,'utf8')))));
 return workspace;
}
/** A spell-editor service whose pre-load encounter settings use test units (ENGINE-COUPLED: the service validates the
 * first `preview.load` with its private default settings, which name a shipped unit). Works on any test workspace. */
export function editorService(root:string){
 const service=new SpellEditorService(root);
 (service as unknown as {settings:EncounterSettings}).settings=testSettings();
 return service;
}
/** One shared editor workspace per test file. */
export function useEditorWorkspace(){
 let workspace:Awaited<ReturnType<typeof editorWorkspace>>|undefined;
 beforeAll(async()=>{workspace=await editorWorkspace();});
 afterAll(()=>workspace?.dispose());
 return ()=>{if(!workspace)throw Error('Editor workspace is not ready');return workspace.root;};
}

export function presentationOf(ability:AbilityDefinition):AbilityPresentation{
 const p=testAbilities.presentations.find(p=>p.id===ability.presentation);
 if(!p)throw Error('Missing test presentation '+ability.presentation);
 return p;
}

export function testAbility(id:string):AbilityDefinition{
 const a=testAbilities.abilities.find(a=>a.id===id);
 if(!a)throw Error('Missing test ability '+id);
 return a;
}

/** An ability encounter built only from test content. */
export function encounter(ability:AbilityDefinition,settings:Record<string,unknown>={},options:{preview?:boolean;source?:ContentSource;presentation?:AbilityPresentation}={}){
 return createAbilityEncounter(ability,options.presentation??presentationOf(ability),testSettings(settings),options.preview??false,encounterSource(options.source));
}

type Action=Parameters<Lockstep['send']>[0];
/** Runs two lockstep peers seeded from `game`, sending `action` from peer 0. Peer 1 is cold-restored from a JSON
 * snapshot at each tick in `restoreAt` (or when `onTick` returns true); checksums must match every tick. */
export function runLockstep(game:Game,action:Action,ticks:number,options:{seed?:number;restoreAt?:number[];onTick?:(tick:number,leader:World,follower:World)=>boolean|void}={}){
 const seed=options.seed??42,opts={map:game.map,slots:game.slots,registry:game.registry,seed};
 const worlds=[new World(opts),new World(opts)];for(const w of worlds)w.settlement.restore(game.snapshot());
 const room=new Room({...localMatch({mapId:'lockstep-harness',mapRevision:'test',seed,slotCount:2,me:0,delay:3}),slots:[...game.slots]});
 const channels=[new MemoryChannel(room,0),new MemoryChannel(room,1)],peers=channels.map((c,i)=>new Lockstep(c,i,3));
 const restore=()=>{const save=JSON.parse(JSON.stringify(worlds[1].snapshot()));worlds[1]=new World(opts);worlds[1].restore(save);};
 peers[0].send(action);
 try{
  for(let tick=1;tick<=ticks;tick++){
   peers[tick%2].confirm(tick);peers[1-tick%2].confirm(tick);
   for(let i=0;i<2;i++){
    const commit=peers[i].take(tick)!;expect(commit).toBeTruthy();
    for(const slot of commit.slots)slot.actions.forEach((a,seq)=>worlds[i].enqueue(a,commit.tick,{player:slot.player,seq}));
    worlds[i].tick();
   }
   if(options.onTick?.(tick,worlds[0],worlds[1])||options.restoreAt?.includes(tick))restore();
   expect(worlds[1].checksum(),`tick ${tick}`).toBe(worlds[0].checksum());
  }
 }finally{channels.forEach(c=>c.destroy());}
 return worlds[0];
}
