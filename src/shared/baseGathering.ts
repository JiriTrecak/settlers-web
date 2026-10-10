import type {ContentRegistry} from '../content/registry';
import type {Owner} from '../content/schema';

export type BaseWorkforce = {workers:number;recommendedWorkers:number};
type GatheringEntity = {id:number;definition:string;owner:Owner;x:number;y:number;hp:number|null;construction?:unknown;resource?:{amount:number}};
/** Each resource belongs to the nearest completed compatible base per owner.
 * Counts assignments, including return trips, rather than proximity of walking units.
 * Derived presentation only: no economy state or duplicated persistent assignments. */
export function baseGathering(entities:readonly GatheringEntity[], registry:ContentRegistry, assignments:ReadonlyMap<number,number>=new Map()):Map<number,BaseWorkforce>{
 const bases=entities.filter(e=>e.owner!=='none'&&(e.hp===null||e.hp>0)&&!e.construction&&registry.get(e.definition).behaviors.storage?.gathering);
 const result=new Map(bases.map(e=>[e.id,{workers:0,recommendedWorkers:0}]));
 const byId=new Map(entities.map(e=>[e.id,e]));
 const sites=new Map<number,Map<Owner,number>>();
 for(const source of entities){
  const definition=registry.get(source.definition);
  if(!source.resource||!definition.harvesting||(source.hp!==null&&source.hp<=0))continue;
  const owners=new Map<Owner,GatheringEntity>();
  for(const base of bases){
   const rule=registry.get(base.definition).behaviors.storage!.gathering!;
   const recipe=registry.get(rule.item).creation;
   if(recipe?.method!=='harvest'||recipe.source!==source.definition)continue;
   const distance=(e:GatheringEntity)=>(e.x-source.x)**2+(e.y-source.y)**2;
   if(distance(base)>rule.radius**2)continue;
   const previous=owners.get(base.owner);
   if(!previous||distance(base)<distance(previous)||(distance(base)===distance(previous)&&base.id<previous.id))owners.set(base.owner,base);
  }
  sites.set(source.id,new Map([...owners].map(([owner,base])=>[owner,base.id])));
  if(source.resource.amount>0)for(const base of owners.values())result.get(base.id)!.recommendedWorkers+=definition.harvesting.recommendedWorkers;
 }
 for(const [worker,source] of assignments){
  const owner=byId.get(worker)?.owner,base=owner===undefined?undefined:sites.get(source)?.get(owner);
  if(base!==undefined)result.get(base)!.workers++;
 }
 return result;
}
