import { ItemEffects } from "./itemEffects";
import {dropPosition} from './dropPosition';
import {isStunned} from './effects';
import type { GameContext } from "./context";
import { precise } from "./motion";
import { distance2 } from "./spatial";
import type { Entity } from "./state";

/** Hero slots own item identities. Pickup and removal are atomic simulation operations. */
export class Inventory {
  constructor(private readonly c: GameContext, private readonly items = new ItemEffects(c)) {}
  pickupError(hero:Entity,target:Entity|undefined):string|null {
    if(!hero.equipment || !this.c.def(hero).behaviors.inventory) return "This unit has no inventory";
    if(!target?.item || !this.c.def(target).itemEffect || target.item.quantity!==1 ||
      (target.owner!=="none" && target.owner!==hero.owner)) return "Cannot pick up this item";
    if(!hero.equipment.includes(null)) return "Inventory is full";
    return null;
  }
  plan() {
    for(const hero of this.c.activeUnits()) {
      const order=hero.unit!.order;
      if(order?.type!=="pickup")continue;
      const target=this.c.get(order.target),error=this.pickupError(hero,target);
      if(error){this.stop(hero,error);continue;}
      if(isStunned(hero,this.c.registry)||hero.spellcasting?.pending)continue;
      if(distance2(precise(hero),target!)<=this.c.def(hero).behaviors.inventory!.pickupRange**2){
        hero.unit!.route=[];hero.unit!.goal=null;continue;
      }
      if(!hero.unit!.route.length && hero.unit!.retryAt<=this.c.state.tick) {
        const goal=this.c.spatial.nearest(target!,4,hero.id);
        if(!goal || !this.c.spatial.route(hero,goal)){this.stop(hero,"Item is unreachable");continue;}
        hero.unit!.retryAt=this.c.state.tick+20;
      }
    }
  }
  advance() {
    for(const hero of this.c.activeUnits()) {
      const order=hero.unit!.order;if(order?.type!=="pickup")continue;
      const target=this.c.get(order.target);
      if(this.pickupError(hero,target))continue;
      if(isStunned(hero,this.c.registry)||hero.spellcasting?.pending)continue;
      if(distance2(precise(hero),target!)>this.c.def(hero).behaviors.inventory!.pickupRange**2)continue;
      const slot = hero.equipment!.indexOf(null);
      hero.equipment![slot]=target!.definition;
      hero.equipmentState ??= hero.equipment!.map(() => null);
      hero.equipmentState[slot] = target!.item?.runtime ? {...target!.item.runtime} : null;
      this.c.remove(target!);
      this.stop(hero);
    }
  }
  private stop(hero:Entity,message?:string) {
    hero.unit!.order=null;hero.unit!.route=[];hero.unit!.goal=null;
    if(message)this.c.event(hero.owner,message);
  }
  drop(hero:Entity,slot:number):string|null {
    const definition=hero.equipment?.[slot];
    if(!definition)return "Inventory slot is empty";
    const dropped = this.c.create({id:"",definition,owner:"none",position:dropPosition(this.c,hero,hero.id),rotation:0,initialState:{quantity:1}});
    if(hero.equipmentState?.[slot]) dropped.item!.runtime = {...hero.equipmentState[slot]!};
    if(hero.equipmentState) hero.equipmentState[slot]=null;
    hero.equipment![slot]=null;
    hero.hp=Math.min(hero.hp!,this.c.stats(hero).maxHp);
    if(hero.spellcasting) hero.spellcasting.mana=Math.min(hero.spellcasting.mana,this.c.stats(hero).maxMana);
    return null;
  }
  use(hero:Entity,slot:number):string|null {
    return this.items.use(hero,slot);
  }
  onDeath(hero:Entity) {
    if(this.c.def(hero).hero)return;
    for(let slot=0;slot<(hero.equipment?.length ?? 0);slot++)if(hero.equipment![slot])this.drop(hero,slot);
  }
}
