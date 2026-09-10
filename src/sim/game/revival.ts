import type {GameContext} from './context';
import type {Entity} from './state';
/** Fallen heroes retain identity and progression in authoritative state, outside the live battlefield. */
export class Revival {
 constructor(private readonly c:GameContext){}
 retain(hero:Entity){
  hero.hp=0;hero.fallen=true;hero.unit=this.c.freshUnit();hero.inventory={};delete hero.effects;delete hero.itemStatuses;delete hero.itemHits;
  if(hero.spellcasting)hero.spellcasting.pending=null;
  this.c.state.entities.push(hero);this.c.state.entities.sort((a,b)=>a.id-b.id);this.c.reindex();
 }
 enqueue(building:Entity,id:number):string|null {
  const policy=this.c.def(building).behaviors.revival,hero=this.c.get(id);
  if(!policy||!building.revival||building.construction)return 'Select a completed revival building';
  if(!hero?.fallen||hero.owner!==building.owner)return 'Choose one of your fallen heroes';
  if(this.c.state.entities.some(e=>e.revival?.queue.some(q=>q.hero===id)))return 'Hero is already being revived';
  if(building.revival.queue.length>=policy.queueCapacity)return 'Revival queue is full';
  building.revival.queue.push({hero:id,progress:0});return null;
 }
 cancel(building:Entity,id:number):string|null {
  const queue=building.revival?.queue,index=queue?.findIndex(q=>q.hero===id)??-1;
  if(!queue||index<0)return 'Hero is not queued here';queue.splice(index,1);return null;
 }
 tick(){
  for(const building of this.c.live()){
   const queue=building.revival?.queue,entry=queue?.[0],policy=this.c.def(building).behaviors.revival;
   if(!entry||!policy||building.construction||!this.c.ready(building))continue;
   const hero=this.c.get(entry.hero);if(!hero?.fallen){queue!.shift();continue;}
   entry.progress=Math.min(policy.workTicks,entry.progress+1);if(entry.progress<policy.workTicks)continue;
   const location=this.c.spatial.nearest(this.c.spatial.entrance(building),12,hero.id);if(!location)continue;
   hero.x=location.x;hero.y=location.y;hero.unit=this.c.freshUnit();hero.hp=this.c.stats(hero).maxHp;hero.regeneration={health:0,mana:0};delete hero.fallen;
   hero.readyTick=this.c.state.tick+1;
   if(hero.spellcasting){hero.spellcasting.mana=this.c.stats(hero).maxMana;hero.spellcasting.pending=null;}
   queue!.shift();this.c.event(hero.owner,`${this.c.def(hero).name} has returned`);
  }
 }
}
