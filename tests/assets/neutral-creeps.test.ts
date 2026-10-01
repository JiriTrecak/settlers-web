import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {content} from '../../src/content/builtin';
import {emptyUtcMap} from '../../src/shared/map/utcmap';
import {Game} from '../../src/sim/game/game';
import {heading} from '../../src/sim/game/facing';
import {placed,slots} from '../game/helpers';
import specs from '../../scripts/assets/neutral-creeps.json';
import camps from '../../content/neutral-camps.json';

describe('published neutral camp roster',()=>{
 it('loads every creature as a skinned, attack-capable model within the unit budget',()=>{
  expect(camps).toHaveLength(10);
  expect(specs).toHaveLength(26);
  for(const spec of specs){
   const id=`unit.neutral.${spec.slug}`;
   const def=content.get(id);
   const asset=content.asset(def.asset);
   expect(def.kind,id).toBe('unit');
   expect(def.body?.maxHp,id).toBe(spec.hp);
   expect(def.behaviors.campDefense,id).toBeDefined();
   expect(def.behaviors.combat?.projectile!==undefined,id).toBe(spec.attack==='ranged');
   expect(asset.file,id).toMatch(/\.glb$/);
   const bytes=readFileSync(asset.file!);
   const length=bytes.readUInt32LE(12);
   const gltf=JSON.parse(bytes.subarray(20,20+length).toString());
   const triangles=gltf.meshes.flatMap((mesh:{primitives:{indices:number}[]})=>mesh.primitives)
    .reduce((sum:number,p:{indices:number})=>sum+gltf.accessors[p.indices].count/3,0);
   expect(triangles,id).toBeLessThanOrEqual(5000);
   expect(gltf.skins,id).toHaveLength(1);
   expect(gltf.animations.map((clip:{name:string})=>clip.name).sort(),id)
    .toEqual(['idle','walk','run','attack','hit','death'].sort());
   if(spec.attack==='ranged')expect(gltf.nodes.some((node:{name?:string})=>node.name==='socket_projectile'),id).toBe(true);
  }
 });
 it('instantiates all ten themed camps with their authored HP and attack roles',()=>{
  const centers=camps.map((_,i)=>({x:70+(i%5)*28,y:85+Math.floor(i/5)*55}));
  const entities=[];
  const authored=[];
  for(const [i,camp] of camps.entries()){
   const home=centers[i];
   const members:string[]=[];
   let n=0;
   for(const [slug,count] of Object.entries(camp.members))for(let j=0;j<count;j++){
    const id=`${camp.id}.${n++}`;
    members.push(id);
    entities.push({...placed(id,`unit.neutral.${slug}`,home.x+(j%3)*2,home.y+Math.floor(j/3)*2),owner:'none' as const});
   }
   authored.push({id:camp.id,members,home,aggroRange:12,leash:18,aggression:'players' as const});
  }
  const game=new Game({...emptyUtcMap(),entities,camps:authored},slots,content);
  expect(game.entities.filter(entity=>entity.owner==='none'&&entity.unit?.camp)).toHaveLength(entities.length);
  for(const actor of game.entities.filter(entity=>entity.owner==='none'&&entity.unit?.camp))
   expect(actor.hp,actor.definition).toBe(content.get(actor.definition).body?.maxHp);
 });
 it('applies melee hits and releases ranged missiles from the new creature definitions',()=>{
  for(const [slug,distance,ranged] of [['webling',2,false],['spitter',5,true]] as const){
   const neutral={...placed('creep',`unit.neutral.${slug}`,205,230),owner:'none' as const};
   const game=new Game({...emptyUtcMap(),entities:[neutral,placed('defender','unit.ants.warrior',205+distance,230)],
    camps:[{id:'test-den',members:['creep'],home:neutral.position,aggroRange:10,leash:18,aggression:'players'}]},slots,content);
   const creep=game.entities.find(entity=>entity.placement==='creep')!;
   const defender=game.entities.find(entity=>entity.placement==='defender')!;
   const hp=defender.hp!;
   creep.rotation=heading(creep,defender);
   creep.unit!.target=defender.id;
   game.combat.resolve();
   expect(creep.unit!.attack,slug).toBeDefined();
   game.state.tick=creep.unit!.attack!.impact;
   game.combat.resolve();
   if(ranged)expect(game.state.missiles.some(missile=>missile.source===creep.id),slug).toBe(true);
   else expect(defender.hp,slug).toBeLessThan(hp);
  }
 });
});
