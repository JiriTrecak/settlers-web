import {missionInventory} from "./inventory";
import {turnToward} from "../game/facing";
import {precise} from "../game/motion";
import {runMissionLua,type Scalar,type LuaHost} from '../../shared/scenario/lua';
import {emptyMissionState,missionStateSchema,missionCameraSchema} from '../../shared/scenario/schema';
import {ownerSchema} from '../../content/schema';
import {alive} from '../game/state';
import type {Game} from '../game/game';
/** Map scripts use stable placement IDs; numeric simulation IDs stay private. */
export class Mission {
  constructor(private readonly game:Game) {game.state.mission=emptyMissionState();}
  tick():void {
    const g=this.game, state=g.state.mission!, definition=g.map.mission!;
    if(state.error || g.state.outcome)return;
    state.facing=state.facing.filter(target=>{
      const e=g.entities.find(e=>e.placement===target.id);
      if(!e?.unit||!alive(e)||e.unit.order)return false;
      return !turnToward(e,target,(g.registry.get(e.definition).behaviors.movement?.turnRate??720)/40);
    });
    if(state.started && g.state.tick%4!==0)return;
    const draft=structuredClone(state), operations:(()=>void)[]=[];
    const string=(v:Scalar,max=120)=>{if(typeof v!=='string'||!v.length||v.length>max)throw new Error('Expected a nonempty string');return v;};
    const number=(v:Scalar,min=0,max=g.map.size-1)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw new Error(`Expected a number in ${min}..${max}`);return v;};
    const placement=(raw:Scalar)=>{const id=string(raw),p=g.map.entities.find(p=>p.id===id);if(!p)throw new Error(`Unknown entity ID: ${id}`);return p;};
    const entity=(raw:Scalar)=>{const p=placement(raw);return g.entities.find(e=>e.placement===p.id);};
    const objective=(id:Scalar)=>{const o=definition.objectives?.find(o=>o.id===string(id));if(!o)throw new Error(`Unknown objective: ${id}`);return o;};
    let calls=0;
    const host:LuaHost={
      ...missionInventory(g,entity,operations),
      dialogue_busy:()=>!!draft.dialogue&&(draft.dialogue.cinematic?draft.dialogue.remaining>0:draft.dialogue.until>g.state.tick),
      tick:()=>g.state.tick,
      get:key=>Object.hasOwn(draft.variables,string(key))?draft.variables[string(key)]:null,
      set:(key,value)=>{const k=string(key);if(value===null)delete draft.variables[k];else Object.defineProperty(draft.variables,k,{value,writable:true,enumerable:true,configurable:true});},
      count:(rawOwner,rawDefinition)=>{
        const owner=ownerSchema.parse(rawOwner),definition=string(rawDefinition),d=g.registry.find(definition);
        if(!d||!['unit','building'].includes(d.kind))throw new Error('Count requires a unit or building definition');
        return g.entities.filter(e=>e.owner===owner&&e.definition===definition&&g.context.ready(e)&&!e.construction&&!e.fallen).length;
      },
      stock:(rawOwner,rawItem)=>{
        const owner=ownerSchema.parse(rawOwner),item=string(rawItem),d=g.registry.find(item);
        if(!d||d.kind!=='item'||!d.currency)throw new Error('Stock requires an economy currency item');
        return g.entities.filter(e=>e.owner===owner&&alive(e)).reduce((sum,e)=>sum+g.economy.available(e,item),0);
      },
      alive:id=>{const e=entity(id);return !!e&&alive(e);},
      damage:(id,amount,source)=>{
        const target=entity(id),attacker=source==null?undefined:entity(source);
        const damage=number(amount,1,100000);
        if(!Number.isInteger(damage))throw new Error('Damage must be an integer');
        if(!target||!alive(target)||target.hp===null)return false;
        if(source!=null&&(!attacker||!alive(attacker)))return false;
        draft.pendingDamage.push({target:target.id,source:attacker?.id??0,damage,damageType:'spell',owner:'none'});
        return true;
      },
      recover:id=>{
        const p=placement(id);
        if(g.registry.get(p.definition).kind!=='unit')throw new Error('Recovery requires a unit');
        operations.push(()=>{
          const e=entity(id);if(!e?.unit||!alive(e)||e.fallen)return;
          const stats=g.context.stats(e);e.hp=stats.maxHp;
          if(e.spellcasting)e.spellcasting.mana=stats.maxMana;
        });
      },
      begin_scene:(x,y)=>{draft.scene={x:number(x),y:number(y)};},
      end_scene:()=>{draft.scene=null;},
      camera:(mode,id,lookAt,distance,height,fov,seconds)=>{
        const p=placement(id),subject=entity(id);
        if(g.registry.get(p.definition).kind!=='unit')throw new Error('Camera subject must be a unit');
        if(lookAt!==undefined&&lookAt!==null){const target=placement(lookAt);if(g.registry.get(target.definition).kind!=='unit')throw new Error('Camera look-at must be a unit');}
        const shot=missionCameraSchema.parse({mode,entity:p.id,...(lookAt!=null?{lookAt}:{}),...(distance!=null?{distance}:{}),...(height!=null?{height}:{}),...(fov!=null?{fov}:{}),transitionMs:seconds==null?350:number(seconds,0,5)*1000});
        draft.scene={x:subject?.x??p.position.x,y:subject?.y??p.position.y,camera:shot};
      },
      arrived:(id,x,y)=>{const e=entity(id);if(!e?.unit||!alive(e))return false;const p=precise(e);return !e.unit.order&&Math.hypot(p.x-number(x),p.y-number(y))<.5;},
      face:(id,x,y)=>{
        const p=placement(id),target={id:p.id,x:number(x),y:number(y)};
        if(!g.registry.get(p.definition).behaviors.movement)throw new Error(`${p.id} cannot turn`);
        draft.facing=draft.facing.filter(t=>t.id!==p.id);draft.facing.push(target);
        operations.push(()=>{const e=entity(id);if(e?.unit&&alive(e))g.economy.interrupt(e);});
      },
      facing_done:()=>draft.facing.length===0,
      position:id=>{const e=entity(id);return e?[e.x,e.y]:[null,null];},
      in_region:(id,region)=>{const e=entity(id),r=definition.regions.find(r=>r.id===string(region));if(!r)throw new Error(`Unknown region: ${region}`);return !!e&&alive(e)&&Math.hypot(e.x-r.x,e.y-r.y)<=r.radius;},
      spawn:id=>{
        const p=placement(id);if(p.activation!=='script')throw new Error(`${p.id} is not a scripted spawn`);
        if(draft.spawned.includes(p.id))throw new Error(`${p.id} was already spawned`);
        draft.spawned.push(p.id);operations.push(()=>{const e=g.context.create(p),camp=g.map.camps.find(c=>c.members.includes(p.id));if(e.unit&&camp)e.unit.camp=camp.id;});
      },
      move:(id,x,y)=>{
        const p=placement(id),destination={x:Math.round(number(x)),y:Math.round(number(y))};
        if(!g.registry.get(p.definition).behaviors.movement)throw new Error(`${p.id} cannot move`);
        operations.push(()=>{const e=entity(id);if(e&&alive(e))g.orders.issue(e,{type:'move',destination,attackMove:false});});
      },
      attack_move:(id,x,y)=>{
        const p=placement(id),destination={x:Math.round(number(x)),y:Math.round(number(y))};
        const behavior=g.registry.get(p.definition).behaviors;
        if(!behavior.combat||!behavior.movement)throw new Error(`${p.id} cannot attack-move`);
        operations.push(()=>{const e=entity(id);if(e?.unit&&alive(e))g.orders.issue(e,{type:'move',destination,attackMove:true});});
      },
      follow:(id,target)=>{
        const p=placement(id);placement(target);
        if(!g.registry.get(p.definition).behaviors.movement)throw new Error(`${p.id} cannot follow`);
        operations.push(()=>{const e=entity(id),t=entity(target);if(e?.unit&&t&&alive(e)&&alive(t))g.orders.issue(e,{type:'follow',target:t.id,escort:true});});
      },
      attack:(id,target)=>{placement(id);placement(target);operations.push(()=>{const e=entity(id),t=entity(target);if(e?.unit&&t&&alive(e)&&alive(t))g.orders.issue(e,{type:'attack',target:t.id,force:true});});},
      transfer:(id,rawOwner)=>{
        const p=placement(id),owner=ownerSchema.parse(rawOwner),e=entity(id),d=g.registry.get(e?.definition??p.definition);
        if(owner!=='none'&&!g.map.playerStarts.some(s=>owner===`player.${s.player}`))throw new Error('Missing owner slot');
        if(d.kind!=='unit'||d.behaviors.campDefense||d.behaviors.work)throw new Error('Transfer requires a non-camp military unit');
        if(e?.unit?.contained||e?.unit?.release)throw new Error('Cannot transfer a contained unit');
        operations.push(()=>{const unit=entity(id);if(unit?.unit&&alive(unit)){g.economy.interrupt(unit);unit.owner=owner;}});
      },
      transform:(id,rawDefinition,rawOwner,rawCamp)=>{
        placement(id);
        const e=entity(id),target=g.registry.find(string(rawDefinition)),owner=ownerSchema.parse(rawOwner);
        if(owner!=='none'&&!g.map.playerStarts.some(s=>owner===`player.${s.player}`))throw new Error('Missing owner slot');
        const camp=rawCamp==null?undefined:g.map.camps.find(c=>c.id===string(rawCamp));
        if(rawCamp!=null&&(!camp||owner!=='none'||g.state.clearedCamps.includes(camp.id)))throw new Error('Transformation requires an uncleared neutral camp');
        if(!target||target.kind!=='unit'||target.hero||target.behaviors.progression||target.behaviors.inventory||target.behaviors.spellcasting|| (!!target.behaviors.campDefense!==!!camp))throw new Error('Transformation target must be an ordinary unit with a matching camp assignment');
        if(!e?.unit||!alive(e))return false;
        const source=g.registry.get(e.definition);
        if(source.hero||source.behaviors.progression||e.equipment||e.spellcasting||source.behaviors.campDefense||e.unit.contained||e.unit.release)throw new Error('Transformation requires an ordinary uncontained unit');
        operations.push(()=>{
          const fraction=e.hp!/g.context.stats(e).maxHp,position=e.unit!.position;
          g.economy.interrupt(e);
          e.definition=target.id;e.owner=owner;e.unit=g.context.freshUnit();e.unit.position=position;if(camp)e.unit.camp=camp.id;
          delete e.appearance;delete e.effects;delete e.itemStatuses;delete e.slows;
          e.hp=Math.max(1,Math.round(g.context.stats(e).maxHp*fraction));
          e.regeneration={health:0,mana:0};
          g.context.reindex();
        });
        return true;
      },
      begin_objective:id=>{
        const o=objective(id);if(draft.objectiveStates[o.id])throw new Error(`Objective already started: ${o.id}`);
        if(!o.optional && definition.objectives?.some(other=>!other.optional&&draft.objectiveStates[other.id]==='active'))throw new Error('Complete the current primary objective before starting another');
        draft.objectiveStates[o.id]='active';if(!o.optional)draft.objective=o.description;
      },
      complete_objective:id=>{const o=objective(id);if(draft.objectiveStates[o.id]!=='active')throw new Error(`Objective is not active: ${o.id}`);draft.objectiveStates[o.id]='completed';},
      fail_objective:id=>{const o=objective(id);if(draft.objectiveStates[o.id]!=='active')throw new Error(`Objective is not active: ${o.id}`);draft.objectiveStates[o.id]='failed';},
      objective:text=>{draft.objective=string(text,500);},
      say:(speaker,portrait,text,seconds,cinematic,actor)=>{
        if(cinematic !== undefined && cinematic !== null && typeof cinematic !== "boolean") throw new Error("Cinematic must be a boolean");
        const d=g.registry.find(string(portrait));if(!d)throw new Error('Portrait must be an entity definition ID');
        const subject=actor==null?undefined:entity(actor);
        if(actor!=null&&(!subject?.unit||!alive(subject)||subject.definition!==d.id))throw new Error('Dialogue actor must be a living unit matching the portrait');
        draft.dialogue={actor:subject?.id,durationTicks:Math.round(number(seconds,1,60)*40),id:draft.nextDialogue++,speaker:string(speaker,80),portrait:d.id,text:string(text,2000),cinematic:cinematic===true,remaining:cinematic===true?Math.round(number(seconds,1,60)*40):0,until:g.state.tick+Math.round(number(seconds,1,60)*40)};
      },
      win:()=>operations.push(()=>{g.state.outcome={winner:'player.1',defeated:[]};}),
      lose:()=>operations.push(()=>{g.state.outcome={winner:null,defeated:['player.1']};}),
    };
    for(const [name,fn] of Object.entries(host))host[name]=(...args)=>{if(++calls>256)throw new Error('Mission API call budget exceeded');return fn(...args);};
    try {
      runMissionLua(definition.script,state.started?'on_tick':'on_start',host);
      draft.started=true;
      if(Object.keys(draft.variables).length>128)throw new Error('Mission state exceeds 128 variables');
      missionStateSchema.parse(draft);
      for(const op of operations)op();
      g.state.mission=draft;
      if(operations.length)g.spatial.rebuild();
    } catch(error) {state.scene=null;state.facing=[];state.error=error instanceof Error?error.message:String(error);g.context.event('player.1',`Mission script stopped: ${state.error}`,'error');}
  }
}
