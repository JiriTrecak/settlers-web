import {SpellCorpses,type CorpseView} from '../abilities/corpses';
import {allEffects} from '../../content/abilities/schema';
import {spellAppearance,spellFormOpacity} from '../abilities/forms';
import { colonySupply, type Supply } from "./supply";
import {spellHidden,spellDetection,concealmentOpacity} from '../abilities/concealment';
import {SectorIndex} from '../../shared/spatial/sectors';
import {VisionMask,type VisionSource} from './visionMask';
import { workerPopulation } from "./population";
import type {AbilityEvent} from "../abilities/runtime";
import { isStunned } from "./effects";
import { atPoint, precise } from "./motion";
import { summarizeGoods, type GoodsSummary } from "./goodsView";
import { simulationHash } from "./checksum";
import { z } from "zod";
import type { Owner, Stock } from "../../content/schema";
import { ownerSchema, ownerSlot, surfaceSchema } from "../../content/schema";
import { GameContext } from "./context";
import { alive, fellingStateSchema, type Entity, type Fact, type GameState, type UnitOrder } from "./state";
import { resolvedStatsSchema, type entityStats } from "./stats";

function copyOrder(order:UnitOrder):UnitOrder {
  if(order.type==='move')return {...order,destination:{...order.destination}};
  if(order.type==='patrol')return {...order,destination:{...order.destination},...(order.origin?{origin:{...order.origin}}:{})};
  return {...order};
}

export type EntityView = {
  /** Owner-private control state, shared by command adapters; never parse job labels. */
  control?: {
    order: NonNullable<Entity["unit"]>["order"];
    orderQueue: NonNullable<Entity["unit"]>["orderQueue"];
    employment: number | null;
    job: {
      type: import("./state").Job["type"];
      target: number;
      source: number | null;
      item: string | null;
      phase: import("./state").Job["phase"];
    } | null;
    pendingMove: NonNullable<Entity["unit"]>["pendingMove"];
    releasing: boolean;
    stunned: boolean;
  };
  itemStatuses?: Entity["itemStatuses"];
  equipmentState?: Entity["equipmentState"];
  hostile?: boolean;
  id: number;
  definition: string;
  owner: Owner;
  x: number;
  y: number;
  surface?:string;
  rotation: number;
  elevation?:number;
  hp: number | null;
  stats?: ReturnType<typeof entityStats>;
  progression?: Entity["progression"];
  equipment?: Entity["equipment"];
  abilities?: Entity["abilities"];
  spellStatuses?: Entity["spellStatuses"];
  summoned?: boolean;
  summonOrigin?: {source:number;ability:string};
  concealmentOpacity?: number;
  activeAbilities?: string[];
  appearance?: Entity["appearance"];
  remembered?: boolean;
  inventory?: Stock;
  construction?: { progress: number };
  upgrade?: Entity["upgrade"];
  research?: Entity["research"];
  resource?: Entity["resource"];
  gathering?: { workers: number; capacity: number };
  item?: Entity["item"];
  unit?: {
    flight?:{height:number};
    moving: boolean;
    strolling?: boolean;
    charging?: boolean;
    casting?: { ability: string; startTick: number; resolveTick: number; finishTick:number; channel?:{endTick:number} };
    contained: boolean;
    garrison?:NonNullable<Entity["unit"]>["garrison"];
    cargo: NonNullable<Entity["unit"]>["cargo"];
    target: number | null;
    commandedTarget?: number | null;
    work?: { animation: "build" | "chop"; x: number; y: number; cycle?: {ticks: number; progress: number} };
    cooldown: number;
    attack?: Omit<NonNullable<NonNullable<Entity["unit"]>["attack"]>,"target"> & {target:number|null};

  };
  production?: Entity["production"];
  revival?: Entity["revival"];
  spellReturn?: Entity["spellReturn"];
  job?: string;
};
export type FogDeckNode = {cell:number;height:number};
export type FogView = {
  /** Union for the flat minimap and atmospheric mask. */
  cells: Uint8Array; revision: number; owner: number;
  /** Ground first, followed by sparse deck nodes; height is in centimetres. */
  floors?: {cells:Uint8Array;decks:readonly FogDeckNode[]};
};
const observedDeathSchema = z
  .object({
    id: z.int().positive(),
    definition: z.string(),
    x: z.number(),
    y: z.number(),
    tick: z.int().nonnegative(),
  })
  .strict();
type ObservedDeath = z.infer<typeof observedDeathSchema>;
export type SettlementView = {
  corpses?: readonly CorpseView[];
  mission?: GameState["mission"];
  heroLevelCap?: number;
  missionObjectives?: import('../../shared/scenario/schema').MissionDefinition['objectives'];
  tick?: number;
  research?: GameState["research"];
  /** Bounded, saved eyewitness reports. AI can confirm kills without reading hidden deaths. */
  observedDeaths?: readonly ObservedDeath[];
  fallenHeroes?: readonly EntityView[];
  shells?: GameState["shells"];
  missiles?: GameState["missiles"];
  heroReturns?:import('../abilities/runtime').HeroReturnView[];
  abilityEvents?: AbilityEvent[];
  abilityDeliveries?: import('../abilities/runtime').AbilityDeliveryView[];
  goods?: GoodsSummary[];
  population?: ReturnType<typeof workerPopulation>;
  supply?: Supply;
  revision: number;
  entities: readonly EntityView[];
  fog?: FogView;
  outcome: GameState["outcome"];
  events: readonly Fact[];
  /** Ephemeral, visibility-filtered presentation cues; never targetable entities. */
  deaths?: readonly EntityView[];
  objectives: Readonly<Record<string, number>>;
};
type Memory = {
  owner: Owner;
  cells: Uint8Array;
  visibleCells: Set<number>;
  entities: Map<number, EntityView>;
  observedDeaths: ObservedDeath[];
};
const memoryEntity = z
  .object({
    surface: surfaceSchema.optional(),
    id: z.number().int().positive(),
    definition: z.string(),
    owner: ownerSchema,
    x: z.number().int().min(0).max(511),
    y: z.number().int().min(0).max(511),
    rotation: z.number(),
    hp: z.number().int().nonnegative().nullable(),
    stats: resolvedStatsSchema.optional(),
    appearance: z
      .object({ asset: z.string().optional(), scale: z.number().optional() })
      .optional(),
    construction: z
      .object({ progress: z.number().int().nonnegative() })
      .optional(),
    resource: z
      .object({
        amount: z.number().int().nonnegative(),
        growingUntil: z.number().int().nullable(),
        felling: fellingStateSchema.optional(),
      })
      .optional(),
    gathering: z
      .object({
        workers: z.number().int().nonnegative(),
        capacity: z.number().int().positive(),
      })
      .strict()
      .optional(),
    item: z.object({ quantity: z.number().int().positive() }).optional(),
  })
  .strict();
export const knowledgeSchema = z.array(
  z
    .object({
      owner: ownerSchema,
      cells: z.array(z.number().int().min(0).max(2)).max(8388608),
      entities: z.array(memoryEntity),
      observedDeaths: z.array(observedDeathSchema).max(1280),
    })
    .strict(),
);

/** Simulation-owned knowledge. No UI consumer receives authoritative entity objects. */
export class Observation {
  readonly timings:Record<string,number>={};
  private readonly memories: Memory[];
  private readonly masks = new Map<Owner, VisionMask>();
  private readonly deathCues: {
    entity: EntityView;
    tick: number;
    viewers: Owner[];
  }[] = [];
  recordDeath(e: Entity) {
    if (!e.unit || e.unit.contained) return;
    this.deathCues.push({
      entity: this.describe(e, false),
      tick: this.c.state.tick,
      viewers: this.memories
        .filter(
          (m) => e.owner === m.owner || this.previouslyVisible(m.owner, e),
        )
        .map((m) => m.owner),
    });
    for (const m of this.memories)
      if (e.owner === m.owner || this.previouslyVisible(m.owner, e)) {
        m.observedDeaths.push({
          id: e.id,
          definition: e.definition,
          x: e.x,
          y: e.y,
          tick: this.c.state.tick,
        });
        if (m.observedDeaths.length > 1280) m.observedDeaths.shift();
      }
    this.cache.clear();
  }
  private readonly cache = new Map<Owner | undefined, SettlementView>();
  private actors:Entity[]=[];
  private forest:EntityView[]=[];
  private readonly forestSlots=new Map<number,number>();
  private stationary:Entity[]=[];
  private structureRevision=-1;
  private readonly gatherers=new Map<number,number>();
  private projectWork(){
    this.gatherers.clear();
    const sources=new Map<number,number|null>();
    for(const job of this.c.state.jobs)if(job.type==='harvest')sources.set(job.worker,job.source);
    for(const worker of this.c.liveUnits()){
      const source=sources.get(worker.id),order=worker.unit!.order,target=order?.type==='gather'?order.target:null;
      if(source!=null)this.gatherers.set(source,(this.gatherers.get(source)??0)+1);
      if(target!=null&&target!==source)this.gatherers.set(target,(this.gatherers.get(target)??0)+1);
    }
  }
  private job(id:number|null|undefined){return this.c.job(id);}
  private readonly forestIds=new Set<number>();
  private readonly visibleStatics=new Map<Owner,Set<number>>();
  private readonly staticCoverage=new Map<Owner,Map<number,number>>();
  private readonly staleStatics=new Map<Owner,Set<number>>();
  private readonly fogProjection = new WeakMap<Uint8Array,Pick<FogView,'cells'|'floors'>>();
  private readonly deckNodes: readonly FogDeckNode[];
  constructor(
    private readonly c: GameContext,
    owners: readonly Owner[],
    private readonly available: (e: Entity, item: string) => number,
    private readonly hostility?: (owner: Owner, e: Entity) => boolean,
  ) {
    this.projectActors=this.c.profile.wrap('Actor projection',this.projectActors.bind(this));
    this.projectKnowledge=this.c.profile.wrap('Known scenery projection',this.projectKnowledge.bind(this));
    this.projectColony=this.c.profile.wrap('Colony summaries',this.projectColony.bind(this));
    this.orderEntities=this.c.profile.wrap('Entity ordering',this.orderEntities.bind(this));
    this.visible=this.c.profile.wrap('Live visibility query',this.visible.bind(this));
    this.detects=this.c.profile.wrap('Stealth detection',this.detects.bind(this));
    this.nearbySensors=this.c.profile.wrap('Nearby sensor index',this.nearbySensors.bind(this));
    this.sightFootprint=this.c.profile.wrap('Terrain sight footprint',this.sightFootprint.bind(this));
    this.deckNodes=this.c.spatial.layers?.nodes.slice(this.c.spatial.size**2).map(n=>({cell:n.cell,height:n.height}))??[];
    this.memories = owners.map((owner) => ({
      owner,
      cells: new Uint8Array(this.c.spatial.layers?.nodes.length??this.c.spatial.size ** 2),
      visibleCells: new Set(),
      entities: new Map(),
      observedDeaths: [],
    }));
  }
  private sightFootprint(sensor:VisionSource){
    if(!this.c.spatial.layers&&!sensor.ignoreTerrain)return this.c.spatial.tactical.visibleSpans(sensor,sensor.radius);
    const nodes=this.c.spatial.visibleNodes(sensor,sensor.radius,sensor.ignoreTerrain);
    return this.c.spatial.layers?[...nodes].sort((a,b)=>a-b):nodes;
  }
  private nativeSharesVision(owner:Owner,sensor:Entity):boolean {
    return sensor.owner===owner || (sensor.owner!=="none" && this.hostility?.(owner,sensor)===false);
  }
  private containmentSightTick=-1;
  private containmentSightRevision=-1;
  private readonly containmentSight=new Map<number,Entity[]>();
  /** Borrow only ordinary sight. Ownership, control and stealth detection remain independent. */
  private sharesVision(owner:Owner,sensor:Entity):boolean {
    if(this.nativeSharesVision(owner,sensor))return true;
    if(!sensor.id||owner==='none')return false;
    if(this.c.state.tick!==this.containmentSightTick||this.c.observationRevision!==this.containmentSightRevision)this.refreshContainmentSight();
    const recipients=this.containmentSight.get(sensor.id);
    if(recipients)for(const recipient of recipients)if(this.nativeSharesVision(owner,recipient))return true;
    return false;
  }
  private refreshContainmentSight(){
    this.containmentSight.clear();
    for(const e of this.c.indexedUnits()){
      const s=e.spellContainment;if(!s||!alive(e)||e.unit?.contained!==s.host||s.expires<=this.c.state.tick)continue;
      const host=this.c.get(s.host),a=this.c.registry.abilityLibrary.abilities.find(a=>a.id===s.ability);
      if(!host||!alive(host)||host.owner!==s.owner||host.unit?.contained||host.unit?.release||!a||!allEffects(a).some(op=>op.op==='contain'&&op.id===s.operation&&op.shareVision))continue;
      const recipients=this.containmentSight.get(s.host)??[];recipients.push(e);this.containmentSight.set(s.host,recipients);
    }
    this.containmentSightTick=this.c.state.tick;this.containmentSightRevision=this.c.observationRevision;
  }

  private spellSensors(owner:Owner){
    return this.c.state.spellVisions.filter(v=>v.expires>this.c.state.tick&&this.sharesVision(owner,{owner:v.owner as Owner} as Entity));
  }
  private spellVisible(owner:Owner,e:Entity){
    const point=this.c.spatial.elevatedPoint(e);
    return this.spellSensors(owner).some(v=>(point.x-v.point.x)**2+(point.y-v.point.y)**2<=v.radius**2&&(v.ignoreTerrain||this.c.spatial.visible(v.point,point)));
  }
  /** Detection never grants ordinary sight; both checks must pass for hostile targets. */
  detects(owner:Owner,e:Entity,observer?:Entity):boolean {
    if(!spellHidden(e,this.c.registry,this.c.state.tick)||this.nativeSharesVision(owner,e)&&owner!=='none'||observer?.id===e.id)return true;
    const p=this.c.spatial.elevatedPoint(e),sensors=owner==='none'?(observer?[observer]:[]):this.c.liveSensors().filter(s=>this.nativeSharesVision(owner,s));
    if(sensors.some(s=>!s.unit?.contained&&!s.unit?.release&&alive(s)&&(()=>{const r=spellDetection(s,this.c.registry,this.c.state.tick),o=precise(s);return r>0&&(p.x-o.x)**2+(p.y-o.y)**2<=r*r&&this.c.spatial.visible(this.c.spatial.elevatedPoint(s),p);})()))return true;
    return this.spellSensors(owner).some(v=>v.detectInvisible&&(p.x-v.point.x)**2+(p.y-v.point.y)**2<=v.radius*v.radius&&(v.ignoreTerrain||this.c.spatial.visible(v.point,p)));
  }
  private readonly sightSectors=new SectorIndex<Entity>();
  private readonly sightRecords=new Map<number,{entity:Entity;x:number;y:number;radius:number}>();
  private sightTick=-1;
  private sightStructure=-1;
  private sightMotion=-1;
  private refreshSightSensor(sensor:Entity){
    const radius=alive(sensor)?(this.c.def(sensor).vision??0)+1:0;
    if(radius<=1){
      if(this.sightRecords.delete(sensor.id)){this.sightSectors.delete(sensor.id);return -1;}
      return 0;
    }
    const p=precise(sensor),old=this.sightRecords.get(sensor.id);
    if(old?.entity===sensor&&old.x===p.x&&old.y===p.y&&old.radius===radius)return 0;
    this.sightRecords.set(sensor.id,{entity:sensor,x:p.x,y:p.y,radius});
    this.sightSectors.set(sensor.id,sensor,{minX:p.x-radius,minY:p.y-radius,maxX:p.x+radius,maxY:p.y+radius});
    return 1;
  }
  private nearbySensors(e:Entity):Iterable<Entity> {
    const c=this.c,changed=this.sightMotion!==c.motionRevision;
    if(this.sightTick!==c.state.tick||this.sightStructure!==c.observationRevision||changed){
      let checked=0,updated=0,removed=0;
      const refresh=(sensor:Entity)=>{checked++;const change=this.refreshSightSensor(sensor);if(change>0)updated++;else if(change<0)removed++;};
      const movers=this.sightTick===c.state.tick&&this.sightStructure===c.observationRevision&&changed
        ?c.sightMovesSince(this.sightMotion):null;
      if(movers){
        c.profile.count('Incremental sensor refreshes');
        for(const sensor of movers)if(c.get(sensor.id)===sensor)refresh(sensor);
      }else{
        // Tick boundaries still reconcile direct lifecycle writes. Bounds are
        // rewritten only for changed sensors; an explicit editor refresh and
        // untracked motion revision take this same conservative path.
        c.profile.count('Full sensor reconciliations');
        const sensors=c.liveSensors(),ids=new Set(sensors.map(s=>s.id));
        for(const sensor of sensors)refresh(sensor);
        for(const id of this.sightRecords.keys())if(!ids.has(id)){
          this.sightRecords.delete(id);this.sightSectors.delete(id);removed++;
        }
      }
      c.profile.count('Sensor records checked',checked);c.profile.count('Sensor entries updated',updated);c.profile.count('Sensor entries removed',removed);
      this.sightTick=c.state.tick;this.sightStructure=c.observationRevision;this.sightMotion=c.motionRevision;
    }
    const p=precise(e),f=this.c.def(e).footprint,rotated=Math.round(e.rotation/90)%2!==0;
    const x=f?(rotated?f.depth:f.width)/2:0,y=f?(rotated?f.width:f.depth)/2:0;
    return this.sightSectors.query({minX:p.x-x-1,minY:p.y-y-1,maxX:p.x+x+1,maxY:p.y+y+1});
  }
  visible(owner: Owner, e: Entity): boolean {
    if(!this.detects(owner,e))return false;
    if(e.owner===owner||this.spellVisible(owner,e))return true;
    const candidates=this.nearbySensors(e);
    if(this.c.spatial.layers||this.c.spatial.airborne(e)){
      for(const sensor of candidates)if(alive(sensor)&&this.sharesVision(owner,sensor)&&!sensor.unit?.contained&&!sensor.unit?.release&&
        this.c.spatial.range(sensor,e)<=(this.c.def(sensor).vision??0)**2&&this.c.spatial.visible(this.c.spatial.elevatedPoint(sensor),this.c.spatial.elevatedPoint(e)))return true;
      return false;
    }
    const cells=this.fogFootprint(e);
    for(const sensor of candidates)if(alive(sensor)&&this.sharesVision(owner,sensor)&&!sensor.unit?.contained&&!sensor.unit?.release&&
      cells.some(i=>i>=0&&((i%this.c.spatial.size-sensor.x)**2+(Math.floor(i/this.c.spatial.size)-sensor.y)**2)<=(this.c.def(sensor).vision??0)**2&&
        this.c.spatial.tactical.visible(this.c.spatial.elevatedPoint(sensor),this.c.spatial.point(i))))return true;
    return false;
  }
  previouslyVisible(owner: Owner, e: Entity): boolean {
    if (e.owner === owner) return true;
    if(!this.detects(owner,e))return false;
    for(const m of this.memories)if(m.owner===owner){
      for(const i of this.fogFootprint(e))if(i>=0&&m.cells[i]===2)
        return !this.c.spatial.layers||this.visible(owner,e);
      return false;
    }
    return false;
  }

  explored(owner: Owner, indices: readonly number[]) {
    const m = this.memories.find((p) => p.owner === owner);
    return !!m && indices.every((i) => i >= 0 && m.cells[i] > 0);
  }
  currentlyVisible(owner: Owner, indices: readonly number[]) {
    const memory = this.memories.find((m) => m.owner === owner);
    return !!memory && indices.every((i) => i >= 0 && memory.cells[i] === 2);
  }
  private staticCells:Int32Array|undefined;
  private readonly resourceViews=new Map<number,EntityView>();
  private readonly privateResourceViews=new WeakMap<EntityView,EntityView>();
  private readonly hostileResourceViews=new WeakMap<EntityView,EntityView>();
  private readonly rememberedViews=new WeakMap<EntityView,EntityView>();
  private staticRecords = new Map<number, {definition:string;x:number;y:number;rotation:number;surface?:string}>();
  private staticOverlaps = new Map<number, number[]>();
  private resourceOwnerView(view:EntityView,observer?:Owner):EntityView {
    if (!observer) return view;
    let result=this.hostileResourceViews.get(view);
    if(!result){result={...view,hostile:false};this.hostileResourceViews.set(view,result);}
    return result;
  }
  /** Neutral foliage changes only on harvest/regrowth. Reuse immutable projections
   * until a source value changes; remembered fog keeps the previous projection. */
  private cachedResource(e:Entity,observer?:Owner):EntityView|undefined {
    if(e.owner!=="none"||!e.resource||e.unit||e.item||e.construction||e.itemStatuses?.length)return undefined;
    const definition=this.c.def(e);
    if(definition.kind!=="resource"||definition.body||definition.gatheringCapacity)return undefined;
    const old=this.resourceViews.get(e.id),r=e.resource,f=r.felling,previous=old?.resource,of=previous?.felling;
    const appearance=e.appearance,oa=old?.appearance;
    if(old&&old.definition===e.definition&&old.x===e.x&&old.y===e.y&&old.surface===e.surface&&old.rotation===e.rotation&&old.hp===e.hp&&
      previous?.amount===r.amount&&previous.growingUntil===r.growingUntil&&f?.hp===of?.hp&&f?.lastHitTick===of?.lastHitTick&&f?.fallTick===of?.fallTick&&f?.direction.x===of?.direction.x&&f?.direction.y===of?.direction.y&&
      appearance?.asset===oa?.asset&&appearance?.scale===oa?.scale)return this.resourceOwnerView(old,observer);
    const view:EntityView={id:e.id,definition:e.definition,owner:e.owner,x:e.x,y:e.y,rotation:e.rotation,hp:e.hp,
      ...(e.surface?{surface:e.surface}:{}),resource:{...r,...(f?{felling:{...f,direction:{...f.direction}}}:{})},
      ...(appearance?{appearance:{...appearance}}:{}),...(e.itemStatuses?{itemStatuses:[]} : {})};
    this.resourceViews.set(e.id,view);return this.resourceOwnerView(view,observer);
  }
  private describe(
    e: Entity,
    privateData: boolean,
    observer?: Owner,
  ): EntityView {
    if(!e.resource||e.owner!=="none")return this.describeActor(e,privateData,observer);
    // Observer/reveal mode also includes every forest resource. Neutral foliage
    // has no commands; avoid running private unit/job projection for each tree.
    const foliagePrivate = !e.progression && !e.abilities && !e.equipment && !e.equipmentState &&
      !e.production && !e.revival && !e.upgrade && !e.research && Object.keys(e.inventory).length === 0;
    const resource=(!privateData || foliagePrivate)?this.cachedResource(e,observer):undefined;
    if(resource){
      if(!privateData)return resource;
      return this.privateForestView(resource);
    }
    return this.describeActor(e,privateData,observer);
  }
  private privateForestView(resource:EntityView):EntityView {
    let view=this.privateResourceViews.get(resource);
    if(!view){view={...resource,inventory:{},job:"Available"};this.privateResourceViews.set(resource,view);}
    return view;
  }
  /** Keep the forest projection fast path small; actors have richer private state. */
  private describeActor(e:Entity,privateData:boolean,observer?:Owner):EntityView {
    const position=precise(e),definition=this.c.def(e),appearance=spellAppearance(e,this.c.registry);
    const result:EntityView={id:e.id,definition:e.definition,owner:e.owner,x:position.x,y:position.y,rotation:e.rotation,hp:e.hp};
    if(e.surface)result.surface=e.surface;
    if(this.c.spatial.airborne(e))result.elevation=this.c.spatial.elevation(e);
    if(observer)result.hostile=this.hostility?.(observer,e)??false;
    if(definition.body)result.stats=this.c.stats(e);
    if(privateData&&e.spellReturn)result.spellReturn=structuredClone(e.spellReturn);
    if(privateData&&e.revival)result.revival=structuredClone(e.revival);
    if(privateData&&e.progression){
      result.progression={...e.progression};
      if(e.progression.bonuses)result.progression.bonuses={...e.progression.bonuses};
    }
    if(e.spellStatuses){
      result.spellStatuses=e.spellStatuses.map(({sourceContext:_sourceContext,...status})=>structuredClone(status));
      result.concealmentOpacity=concealmentOpacity(e,this.c.registry,this.c.state.tick)*spellFormOpacity(e,this.c.registry);
    }
    if(e.summoned){result.summoned=true;if(privateData)result.summonOrigin={source:e.summoned.source,ability:e.summoned.ability};}
    if(privateData&&e.abilities){result.abilities=structuredClone(e.abilities);result.activeAbilities=this.c.state.spellInstances.filter(i=>i.source===e.id).map(i=>i.ability);}
    if(e.itemStatuses)result.itemStatuses=structuredClone(e.itemStatuses);
    if(privateData&&e.equipmentState)result.equipmentState=structuredClone(e.equipmentState);
    if(privateData&&e.equipment)result.equipment=[...e.equipment];
    if(appearance)result.appearance={...appearance};
    if(e.construction)result.construction={progress:e.construction.progress};
    if(privateData&&e.upgrade)result.upgrade={...e.upgrade};
    if(privateData&&e.research)result.research=structuredClone(e.research);
    if(e.resource)result.resource=structuredClone(e.resource);
    if(definition.gatheringCapacity)result.gathering={workers:this.gatherers.get(e.id)??0,capacity:definition.gatheringCapacity};
    if(e.item)result.item={...e.item};
    if(e.unit){
      const u=e.unit,unit:NonNullable<EntityView['unit']>={
        moving:u.lastMovedTick===this.c.state.tick,strolling:!!u.idle?.walking,
        charging:u.charge?.target!=null&&u.charge.expires>this.c.state.tick,
        contained:!!(u.contained||u.release),cargo:u.cargo?{...u.cargo}:null,
        target:privateData?u.target:null,commandedTarget:privateData&&u.order?.type==='attack'?u.order.target:null,cooldown:u.cooldown,
      };
      if(u.flight)unit.flight={height:u.flight.height};
      const pending=e.abilities?.pending;
      if(pending&&pending.startTick<=this.c.state.tick){
        unit.casting={ability:pending.ability,startTick:pending.startTick,resolveTick:pending.releaseTick,finishTick:pending.finishTick};
        if(pending.channel)unit.casting.channel={endTick:pending.channel.endTick};
      }
      if(u.garrison)unit.garrison={...u.garrison};
      if(u.attack){
        const target=privateData?undefined:this.c.get(u.attack.target);
        unit.attack={...u.attack,target:privateData||observer&&target&&this.visible(observer,target)?u.attack.target:null};
      }
      result.unit=unit;
    }
    if (
      e.unit &&
      result.unit &&
      !e.unit.route.length &&
      !result.unit.contained &&
      (e.unit.goal === null ||
        atPoint(e, this.c.spatial.point(e.unit.goal)))
    ) {
      const job = this.job(e.unit!.job);
      const workplace = this.c.get(job?.target);
      const creation =
        job?.type === "construct" || job?.type === "repair"
          ? workplace && this.c.def(workplace).creation
          : job?.type === "harvest" && job.phase !== "return" && job.item
            ? this.c.registry.get(job.item).creation
            : undefined;
      const target =
        job?.type === "harvest" ? this.c.get(job.source) : workplace;
      const strike = creation?.method === "harvest" && creation.impactTick !== undefined;
      const progress = job?.phase === "fall" && target?.resource?.felling?.fallTick != null && strike
        ? creation.impactTick! + this.c.state.tick - target.resource.felling.fallTick
        : job?.progress ?? 0;
      if (
        creation &&
        "workAnimation" in creation &&
        creation.workAnimation &&
        (!strike || progress < creation.workTicks) &&
        !isStunned(e, this.c.registry) &&
        target
      )
        result.unit.work = {
          animation: creation.workAnimation,
          x: target.x,
          y: target.y,
          ...(strike ? {cycle: {ticks: creation.workTicks, progress}} : {}),
        };
    }
    if (privateData) {
      if (e.unit) {
        const j = this.job(e.unit!.job);
        result.control = {
          order: e.unit.order?copyOrder(e.unit.order):null,
          orderQueue: e.unit.orderQueue.map(copyOrder),
          employment: e.unit.employment,
          job: j
            ? {
                type: j.type,
                target: j.target,
                source: j.source,
                item: j.item,
                phase: j.phase,
              }
            : null,
          pendingMove: e.unit.pendingMove ? { ...e.unit.pendingMove } : null,
          releasing: !!e.unit.release,
          stunned: isStunned(e, this.c.registry),
        };
      }
      result.inventory = { ...e.inventory };
      if (e.production) result.production = structuredClone(e.production);
      const job = this.job(e.unit?.job),
        workplace = this.c.get(e.unit?.employment),
        label = workplace
          ? this.c.def(workplace).behaviors.production?.jobName
          : null;
      result.job = e.unit?.pendingMove
        ? "Delivering before move"
        : e.unit?.release
          ? "Waiting for release"
          : e.unit?.contained
            ? "Training"
            : e.unit?.cargo && !job
              ? "Cargo blocked"
              : job
                ? `${label ? label + " · " : ""}${job.type}`
                : label
                  ? `${label} · waiting`
                  : e.unit?.order
                    ? "Following order"
                    : "Available";
    }
    return result;
  }
  // Membership is weak and cells are private/read-only to consumers. Unit motion,
  // placement edits, definition changes, floors and restored entities all
  // select fresh footprints; unchanged buildings need no repeated array creation.
  private readonly footprints=new WeakMap<object,{definition:string;x:number;y:number;rotation:number;surface?:string;cells:number[]}>();
  private fogFootprint(e:Pick<Entity,"definition"|"x"|"y"|"rotation"|"surface">):number[]{
    const old=this.footprints.get(e);
    if(old&&old.definition===e.definition&&old.x===e.x&&old.y===e.y&&old.rotation===e.rotation&&old.surface===e.surface)return old.cells;
    const cells=this.c.spatial.footprint(e);
    this.footprints.set(e,{definition:e.definition,x:e.x,y:e.y,rotation:e.rotation,surface:e.surface,cells});return cells;
  }
  private classifyEntity(e:Entity,stationary:Entity[]):void {
    if(alive(e)&&!e.unit&&(e.resource||this.c.def(e).kind==="building"))stationary.push(e);
    const resource=e.resource&&!e.progression&&!e.abilities&&!e.equipment&&!e.equipmentState&&
      !e.production&&!e.revival&&!e.upgrade&&!e.research&&Object.keys(e.inventory).length===0?this.cachedResource(e):undefined;
    if(resource){this.forestSlots.set(e.id,this.forest.length);this.forest.push(this.privateForestView(resource));this.forestIds.add(e.id);}
    else this.actors.push(e);
  }
  private projectEntities(live=this.c.state.entities):Entity[] {
    const stationary:Entity[]=[];
    this.actors=[];this.forest=[];this.forestIds.clear();this.forestSlots.clear();
    for(const e of live)this.classifyEntity(e,stationary);
    return stationary;
  }
  /** Receipts must explain every revision. Unknown edits/forms and restoration
   * retain full classification; creation/removal touches only affected records. */
  private updateEntityMembership():readonly {type:'add'|'remove'|'retain';entity:Entity}[]|null {
    const changes=this.c.observationEntityChanges;
    if(this.structureRevision<0||!changes.length||this.c.observationRevision-this.structureRevision!==changes.length)return null;
    const removed=new Set(changes.filter(c=>c.type==='remove').map(c=>c.entity.id));
    if(removed.size){
      this.actors=this.actors.filter(e=>!removed.has(e.id));
      if([...removed].some(id=>this.staticRecords.has(id)))this.stationary=this.stationary.filter(e=>!removed.has(e.id));
      if([...removed].some(id=>this.forestIds.has(id))){
        this.forest=this.forest.filter(e=>!removed.has(e.id));this.forestSlots.clear();
        for(let i=0;i<this.forest.length;i++)this.forestSlots.set(this.forest[i]!.id,i);
      }
      for(const id of removed){this.forestIds.delete(id);this.resourceViews.delete(id);}
    }
    for(const {type,entity} of changes)if(type==='add'&&!removed.has(entity.id))this.classifyEntity(entity,this.stationary);
    // A fallen hero can be removed and retained in the same batch. Its final
    // membership, including original ordering, must survive those two receipts.
    const retained=new Set(changes.filter(c=>c.type==='retain').map(c=>c.entity.id));
    if(retained.size){
      this.actors=this.actors.filter(e=>!retained.has(e.id));
      for(const id of retained){const e=this.c.get(id);if(e)this.classifyEntity(e,this.stationary);}
      this.actors.sort((a,b)=>a.id-b.id);
    }
    this.structureRevision=this.c.observationRevision;
    // The caller consumes/clears the journal before refreshing static coverage.
    return [...changes];
  }
  /** Edit only the former/new footprint. Overlap order matches full classification. */
  private updateStaticMembership(changes:readonly {entity:Entity}[],changed:Set<number>):void {
    const cells=this.staticCells!;
    for(const {entity} of changes){
      if(changed.has(entity.id))continue;
      const id=entity.id,old=this.staticRecords.get(id),current=this.c.get(id);
      const next=current&&alive(current)&&!current.unit&&(current.resource||this.c.def(current).kind==='building')?current:undefined;
      if(!old&&!next)continue;
      changed.add(id);
      if(old){
        for(const cell of this.fogFootprint(old))if(cell>=0){
          const overlap=this.staticOverlaps.get(cell);
          if(overlap){
            const remaining=overlap.filter(key=>key!==id);cells[cell]=remaining[0]??0;
            if(remaining.length>1)this.staticOverlaps.set(cell,remaining);else this.staticOverlaps.delete(cell);
          }else if(cells[cell]===id)cells[cell]=0;
        }
        this.staticRecords.delete(id);
      }
      if(next){
        this.staticRecords.set(id,{definition:next.definition,x:next.x,y:next.y,rotation:next.rotation,surface:next.surface});
        for(const cell of this.fogFootprint(next))if(cell>=0){
          if(cells[cell]){const ids=this.staticOverlaps.get(cell)??[cells[cell]];ids.push(id);this.staticOverlaps.set(cell,ids);}
          else cells[cell]=id;
        }
      }
    }
  }
  /** Explicit external updates rescan state; fixed ticks consume simulation change receipts. */
  update(incremental=false) {
    this.sightTick=-1;this.containmentSightTick=-1;this.containmentSight.clear();
    const started=performance.now();let maskMs=0,knowledgeMs=0;
    this.cache.clear();
    while (
      this.deathCues.length &&
      this.c.state.tick - this.deathCues[0].tick > 80
    )
      this.deathCues.shift();
    const changedResources=new Set([...this.c.changedResources].map(e=>e.id));
    let rebuild=!incremental||this.structureRevision!==this.c.observationRevision;
    const receipts=rebuild&&incremental?this.c.profile.measure('Entity membership receipts',()=>this.updateEntityMembership()):null;
    if(receipts)rebuild=false;
    if(rebuild){
      this.c.profile.count('Full entity classifications');this.c.profile.count('Entities classified',this.c.state.entities.length);
      this.stationary=this.c.profile.measure('Entity classification',()=>this.projectEntities());this.structureRevision=this.c.observationRevision;
      for(const id of this.resourceViews.keys())if(!this.c.get(id))this.resourceViews.delete(id);
    }else for(const e of this.c.changedResources){
      const index=this.forestSlots.get(e.id);
      if(index!==undefined)this.forest[index]=this.privateForestView(this.cachedResource(e)!);
    }
    this.c.changedResources.clear();this.c.observationEntityChanges.length=0;this.projectWork();
    const initializeStatic=!this.staticCells;
    const stationary=this.stationary,staticCells=this.staticCells??=new Int32Array(this.c.spatial.layers?.nodes.length??this.c.spatial.size**2);
    let staticChanged=rebuild&&(initializeStatic || stationary.length !== this.staticRecords.size || stationary.some(e => {
      const old=this.staticRecords.get(e.id);
      return !old || old.x!==e.x || old.y!==e.y || old.rotation!==e.rotation || old.definition!==e.definition || old.surface!==e.surface;
    }));
    const changedStaticIds=new Set<number>();
    if(staticChanged) {
      const previous=this.staticRecords;this.staticRecords=new Map();
      staticCells.fill(0); this.staticOverlaps.clear();
      for (const e of stationary) {
        const old=previous.get(e.id);
        if(!old||old.definition!==e.definition||old.x!==e.x||old.y!==e.y||old.rotation!==e.rotation||old.surface!==e.surface)changedStaticIds.add(e.id);
        this.staticRecords.set(e.id,{definition:e.definition,x:e.x,y:e.y,rotation:e.rotation,surface:e.surface});
        for(const cell of this.fogFootprint(e))if(cell>=0){
          if(staticCells[cell]){const ids=this.staticOverlaps.get(cell)??[staticCells[cell]];ids.push(e.id);this.staticOverlaps.set(cell,ids);}
          else staticCells[cell]=e.id;
        }
      }
      for(const id of previous.keys())if(!this.staticRecords.has(id))changedStaticIds.add(id);
    }
    if(receipts){this.c.profile.count('Membership receipts',receipts.length);this.updateStaticMembership(receipts,changedStaticIds);staticChanged=changedStaticIds.size>0;}
    this.timings['Observation · static index']=performance.now()-started;
    const overlaps=this.staticOverlaps;
    // Resolve each sensor once for this observation pass. Shared vision only
    // filters these live records per observer; it does not reclassify the world.
    const sensorStarted=performance.now();
    const visionSensors=this.c.profile.measure('Vision sensors',()=>this.c.liveSensors()
      .filter(e=>!e.unit?.contained&&!e.unit?.release)
      .map(e=>({entity:e,source:{id:e.id,x:e.x,y:e.y,surface:e.surface,
        elevation:this.c.spatial.elevation(e)+(e.unit?.garrison?.height??0),radius:this.c.def(e).vision??0}})));
    maskMs+=performance.now()-sensorStarted;
    for (const m of this.memories) {
      const maskStarted=performance.now();
      m.observedDeaths = m.observedDeaths.filter(
        (d) => this.c.state.tick - d.tick <= 400,
      );
      const sensors=this.c.profile.measure('Observer sensor selection',()=>{
        this.c.profile.count('Observer passes');this.c.profile.count('Sensor eligibility checks',visionSensors.length);
        return visionSensors.filter(s=>this.sharesVision(m.owner,s.entity));
      });
      let mask=this.masks.get(m.owner);
      if(!mask){mask=new VisionMask(m.cells,this.c.profile);this.masks.set(m.owner,mask);}
      const visionChanged=this.c.profile.measure('Sight masks',()=>mask!.update([...sensors.map(s=>s.source),...this.spellSensors(m.owner).map(v=>({id:-v.id,...v.point,radius:v.radius,ignoreTerrain:v.ignoreTerrain}))],sensor=>this.sightFootprint(sensor)));
      m.cells=mask.cells;m.visibleCells=mask.visible;
      maskMs+=performance.now()-maskStarted;
      const knowledgeStarted=performance.now();
      this.c.profile.measure('Scenery knowledge',()=>{
      let observedStatic=this.visibleStatics.get(m.owner),coverage=this.staticCoverage.get(m.owner);
      const refresh=new Set(changedResources);
      if(!observedStatic||!coverage||(staticChanged&&!receipts)){
        observedStatic=new Set<number>();coverage=new Map<number,number>();
        this.c.profile.count('Full coverage rebuilds');this.c.profile.count('Coverage cells scanned',m.visibleCells.size);
        for(const cell of m.visibleCells){
          const ids=overlaps.get(cell),id=staticCells[cell];
          if(ids)for(const id of ids)coverage.set(id,(coverage.get(id)??0)+1);
          else if(id)coverage.set(id,(coverage.get(id)??0)+1);
        }
        for(const id of coverage.keys()){observedStatic.add(id);refresh.add(id);}
        this.visibleStatics.set(m.owner,observedStatic);this.staticCoverage.set(m.owner,coverage);
      }else if(visionChanged){
        this.c.profile.count('Incremental coverage updates');this.c.profile.count('Coverage cells scanned',mask.changedCells.length);
        for(const cell of mask.changedCells){
          const ids=overlaps.get(cell),id=staticCells[cell],delta=m.cells[cell]===2?1:-1;
          for(const key of ids??(id?[id]:[])){
            // Edited footprints are reconciled below against the new mask. Their
            // old coverage cannot be adjusted using only the new cell index.
            if(changedStaticIds.has(key))continue;
            const count=(coverage.get(key)??0)+delta;
            if(count>0){coverage.set(key,count);if(!observedStatic.has(key)){observedStatic.add(key);refresh.add(key);}}
            else{coverage.delete(key);observedStatic.delete(key);}
          }
        }
      }
      if(receipts)for(const id of changedStaticIds){
        const record=this.staticRecords.get(id);
        let count=0;
        if(record)for(const cell of this.fogFootprint(record))if(cell>=0&&m.cells[cell]===2)count++;
        if(count){coverage.set(id,count);observedStatic.add(id);refresh.add(id);}
        else{coverage.delete(id);observedStatic.delete(id);}
      }
      let stale=this.staleStatics.get(m.owner);
      // Remembered footprints become stale only when that scenery changes.
      // Moving a scout never needs to inspect the whole remembered forest.
      const inspect=stale?changedStaticIds:m.entities.keys();
      if(!stale){stale=new Set();this.staleStatics.set(m.owner,stale);}
      for(const id of inspect){
        const e=m.entities.get(id),current=this.staticRecords.get(id);
        if(e&&(!current||current.definition!==e.definition||current.x!==e.x||current.y!==e.y||
          current.rotation!==e.rotation||current.surface!==e.surface))stale.add(id);
        else stale.delete(id);
      }
      if(visionChanged||staticChanged)
        for(const id of stale){
          if(observedStatic.has(id))continue;
          const e=m.entities.get(id)!;
          if(this.fogFootprint(e).some(i=>i>=0&&m.cells[i]===2)&&
            (!this.c.spatial.layers||this.spellVisible(m.owner,e as Entity)||sensors.some(({entity,source})=>(entity.x-e.x)**2+(entity.y-e.y)**2<=source.radius**2&&this.c.spatial.visible(this.c.spatial.elevatedPoint(entity),e)))){
            m.entities.delete(id);stale.delete(id);
          }
        }
      // Actors/buildings can change every tick. Forest resources only change on
      // harvest/regrowth, structural edits, or newly revealed coverage.
      if(rebuild||this.c.spatial.layers)for(const id of observedStatic)refresh.add(id);
      for(const e of this.actors)if(!e.unit&&observedStatic.has(e.id))refresh.add(e.id);
      for(const id of refresh)if(observedStatic.has(id)){
        const e=this.c.get(id)!;
        if(!this.c.spatial.layers||this.visible(m.owner,e)){
          m.entities.set(id,this.forestIds.has(id)?this.resourceViews.get(id)!:this.describe(e,false));stale.delete(id);
        }
      }
      this.c.profile.count('Static records refreshed',refresh.size);
      this.c.profile.count('Changed static records',changedStaticIds.size);
      });
      knowledgeMs+=performance.now()-knowledgeStarted;
    }
    this.timings['Observation · sight masks']=maskMs;
    this.timings['Observation · scenery knowledge']=knowledgeMs;
  }
  /** The same observer policy drives physical missiles and their linked visual deliveries. */
  missileRecords(owner?:Owner){
    const memory=this.memories.find(p=>p.owner===owner);
    return this.c.state.missiles.filter(s=>!owner||(s.viewers.includes(owner)&&memory?.cells[this.c.spatial.cell(s.destination)]===2));
  }
  view(owner?: Owner): SettlementView {
    const cached = this.cache.get(owner);
    if (cached) return cached;
    const m = this.memories.find((p) => p.owner === owner),
      known = new Map<number, EntityView>();
    if (owner !== undefined && !m) throw new Error("Unknown observation owner");
    const visible = new Map<number, EntityView>();
    const visibleForest=owner&&!this.c.spatial.layers?this.visibleStatics.get(owner):undefined;
    const full: EntityView[] = owner ? [] : [...this.forest];
    const actors=this.projectActors(owner,visible,full);
    this.projectKnowledge(m,owner,visible,known,visibleForest);
    const result: SettlementView = {
      corpses:new SpellCorpses(this.c).views().filter(c=>!owner||this.currentlyVisible(owner,[Math.round(c.y)*this.c.spatial.size+Math.round(c.x)])).map(c=>({...c,relation:!owner?undefined:(this.hostility?.(owner,{id:c.id,owner:c.owner,...(c.camp?{unit:{camp:c.camp}}:{})} as Entity)?'enemy':c.owner==='none'?'neutral':'ally')})),
      research: structuredClone(owner ? {[owner]: this.c.state.research[owner] ?? []} : this.c.state.research),
      observedDeaths: m ? m.observedDeaths.map((d) => ({ ...d })) : [],
      fallenHeroes: this.c.indexedUnits()
        .filter((e) => e.fallen && (!owner || e.owner === owner))
        .map((e) => this.describe(e, true, owner)),
      missiles: this.missileRecords(owner).map(s=>structuredClone(s)),
      shells: this.c.state.shells.filter(s=>!owner || s.viewers.includes(owner)).map(s=>structuredClone(s)),
      deaths: this.deathCues
        .filter((cue) => !owner || cue.viewers.includes(owner))
        .map((cue) => cue.entity),
      ...this.projectColony(owner,actors),
      revision: this.c.state.tick,
      entities: this.orderEntities(owner ? [...known.values()] : full),
      ...(m
        ? {
            fog: {
              ...this.projectFog(m.cells),
              revision: this.c.state.tick,
              owner: ownerSlot(m.owner),
            },
          }
        : {}),
      outcome: structuredClone(this.c.state.outcome),
      ...(this.c.state.mission ? {missionObjectives:this.c.map.mission?.objectives,heroLevelCap:this.c.map.mission?.heroLevelCap,mission:structuredClone(this.c.state.mission),tick:this.c.state.tick}:{}),
      events: this.c.state.facts
        .filter((f) => !owner || f.owner === owner)
        .map((f) => ({ ...f })),
      objectives: owner
        ? { [owner]: this.c.state.objectives[owner] }
        : { ...this.c.state.objectives },
    };
    this.cache.set(owner, result);
    return result;
  }
  private projectActors(owner:Owner|undefined,visible:Map<number,EntityView>,full:EntityView[]){
    const actors=this.actors.filter(alive);
    for (const e of actors) {
      if (!owner) full.push(this.describe(e, true));
      else if (e.owner === owner || this.previouslyVisible(owner, e))
        visible.set(e.id, this.describe(e, e.owner === owner, owner));
    }
    return actors;
  }
  private projectKnowledge(m:Memory|undefined,owner:Owner|undefined,visible:Map<number,EntityView>,known:Map<number,EntityView>,visibleForest:Set<number>|undefined){
    if (m)
      for (const [id, e] of m.entities) {
        let observed=visible.get(id);
        if(!observed&&this.forestIds.has(id)){
          const entity=this.c.get(id)!;
          // Reuse the sight mask's static coverage, while still applying live
          // concealment/detection. Layered floors retain their full sight query.
          if(visibleForest?visibleForest.has(id)&&this.detects(owner!,entity):this.previouslyVisible(owner!,entity))
            observed=this.resourceOwnerView(this.resourceViews.get(id)!,owner);
        }
        if(!observed){
          observed=this.rememberedViews.get(e);
          if(!observed){observed={...structuredClone(e),remembered:true};this.rememberedViews.set(e,observed);}
        }
        known.set(id,observed);
      }
    for (const [id, e] of visible) known.set(id, e);
  }
  private orderEntities(entities:EntityView[]){return entities.sort((a,b)=>a.id-b.id);}
  private projectColony(owner:Owner|undefined,actors:Entity[]){
    if(!owner)return {};
    return {
      supply:colonySupply(this.c.populationCandidates(),owner,this.c.registry),
      population:workerPopulation(this.c.populationCandidates(),owner,this.c.registry),
      goods:summarizeGoods(actors,owner,this.c.registry,this.available),
    };
  }
  private projectFog(nodes:Uint8Array):Pick<FogView,'cells'|'floors'>{
    if(!this.deckNodes.length)return {cells:nodes};
    let result=this.fogProjection.get(nodes);
    if(!result){
      const count=this.c.spatial.size**2,cells=nodes.slice(0,count);
      for(let i=0;i<this.deckNodes.length;i++){const cell=this.deckNodes[i]!.cell;cells[cell]=Math.max(cells[cell]!,nodes[count+i]!);}
      result={cells,floors:{cells:nodes,decks:this.deckNodes}};this.fogProjection.set(nodes,result);
    }
    return result;
  }
  checksum() {
    // The visible-cell index is a derived acceleration structure. Its insertion
    // order differs after restore and must not participate in lockstep state.
    return simulationHash(
      this.memories.map(({ visibleCells: _index, ...memory }) => memory),
    );
  }
  snapshot() {
    return this.memories.map((m) => ({
      owner: m.owner,
      cells: Array.from(m.cells),
      entities: [...m.entities.values()].map((e) => structuredClone(e)),
      observedDeaths: m.observedDeaths.map((d) => ({ ...d })),
    }));
  }
  validateSnapshot(raw: unknown) {
    const rows = knowledgeSchema.parse(raw);
    if (
      rows.length !== this.memories.length ||
      new Set(rows.map((r) => r.owner)).size !== rows.length ||
      this.memories.some((m) => !rows.some((r) => r.owner === m.owner))
    )
      throw new Error("Invalid knowledge owners");
    for (const row of rows) {
      if (row.cells.length !== (this.c.spatial.layers?.nodes.length??this.c.spatial.size ** 2))
        throw new Error("Invalid knowledge dimensions");
      const ids = new Set<number>();
      for (const e of row.entities) {
        const d = this.c.registry.get(e.definition);
        if (
          ids.has(e.id) || !this.c.spatial.validPoint(e) ||
          !["resource", "building"].includes(d.kind) ||
          (e.hp !== null && (!d.body || e.hp > d.body.maxHp))
        )
          throw new Error("Invalid remembered entity");
        ids.add(e.id);
      }
    }
    return rows;
  }
  restore(raw: unknown) {
    const rows = this.validateSnapshot(raw);
    this.masks.clear();this.visibleStatics.clear();this.staticCoverage.clear();this.staleStatics.clear();this.structureRevision=-1;
    this.staticRecords.clear();this.staticCells=undefined;this.staticOverlaps.clear();this.sightSectors.clear();this.sightRecords.clear();this.sightTick=-1;this.containmentSightTick=-1;this.containmentSight.clear();
    this.resourceViews.clear();
    this.projectEntities();this.projectWork();
    this.deathCues.length = 0;
    for (const m of this.memories) {
      const row = rows.find((r) => r.owner === m.owner)!;
      m.cells = Uint8Array.from(row.cells);
      m.visibleCells = new Set();
      for (let i = 0; i < m.cells.length; i++)
        if (m.cells[i] === 2) m.visibleCells.add(i);
      m.entities = new Map(row.entities.map((e) => [e.id, e]));
      m.observedDeaths = row.observedDeaths.map((d) => ({ ...d }));
    }
    this.cache.clear();
  }
}
