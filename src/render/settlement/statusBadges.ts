import { Group, Sprite, SpriteMaterial, TextureLoader, SRGBColorSpace, type Object3D } from "three";
import { content } from "../../content/builtin";
import { itemStatusCard } from "../../presentation/itemStatus";
import type { EntityView } from "../../sim/game/observation";
const images = import.meta.glob("../../../assets/ui/icons/**/*.png", {query:"?url",import:"default",eager:true}) as Record<string,string>;
/** Small world-space badges above each observed recipient, not just the aura bearer. */
export class StatusBadges {
  private readonly materials = new Map<string, SpriteMaterial>();
  private readonly groups = new WeakMap<Object3D, {root:Group; key:string}>();
  update(object: Object3D, entity: EntityView, tick: number, height: number): void {
    const statuses = itemStatusCard(entity, tick, content);
    let entry = this.groups.get(object);
    if (!entry && !statuses.length) return;
    if (!entry) { entry={root:new Group(),key:""}; object.add(entry.root); this.groups.set(object,entry); }
    entry.root.visible = statuses.length > 0 && !entity.remembered && !entity.unit?.contained && (entity.hp ?? 0)>0;
    entry.root.position.y = height + .42;
    entry.root.rotation.y = -object.rotation.y;
    const key=statuses.map(s=>s.key).join("|");
    if (entry.key===key) return;
    entry.key=key; entry.root.clear();
    statuses.forEach((s,i)=>{
      let material=this.materials.get(s.icon);
      if(!material){
        const path=content.asset(s.icon).image;
        const map=new TextureLoader().load(images[`../../../${path}`]);map.colorSpace=SRGBColorSpace;
        material=new SpriteMaterial({map,depthTest:false,depthWrite:false,toneMapped:false});
        this.materials.set(s.icon,material);
      }
      const badge=new Sprite(material);badge.scale.set(.34,.34,1);
      const columns=Math.min(6,statuses.length);
      badge.position.set((i%6-(columns-1)/2)*.37,Math.floor(i/6)*.37,0);badge.renderOrder=12;
      entry!.root.add(badge);
    });
  }
  dispose():void {for(const material of this.materials.values()){material.map?.dispose();material.dispose();}this.materials.clear();}
}
