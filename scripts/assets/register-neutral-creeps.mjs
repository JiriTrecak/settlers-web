/** Materialize the neutral creature roster as real game definitions. */
import fs from 'node:fs';

const path='content/game.json';
const game=JSON.parse(fs.readFileSync(path,'utf8'));
const specs=JSON.parse(fs.readFileSync('scripts/assets/neutral-creeps.json','utf8'));
const camps=JSON.parse(fs.readFileSync('content/neutral-camps.json','utf8'));
const bySlug=new Map(specs.map(spec=>[spec.slug,spec]));
for(const camp of camps){
 if(!['small','medium','hard'].includes(camp.difficulty))throw Error(`Bad camp tier: ${camp.id}`);
 for(const slug of Object.keys(camp.members)){
  const spec=bySlug.get(slug);
  if(!spec||spec.camp!==camp.id||spec.tier!==camp.difficulty)throw Error(`Camp and creature mismatch: ${camp.id}/${slug}`);
 }
}
for(const spec of specs)if(!camps.some(camp=>camp.id===spec.camp&&camp.members[spec.slug]))throw Error(`Creature has no camp: ${spec.slug}`);

const oldIds=new Set(specs.map(spec=>`unit.neutral.${spec.slug}`));
game.definitions=game.definitions.filter(def=>!oldIds.has(def.id));
const levels={small:1,medium:3,hard:6};
const yields={small:25,medium:80,hard:180};
const radius={small:.29,medium:.42,hard:.68};
for(const spec of specs){
 const ranged=spec.attack==='ranged';
 const boss=spec.slug==='hollow-stag'||spec.slug==='rotwood-ancient';
 const large=spec.height>=2.7;
 const camp=camps.find(camp=>camp.id===spec.camp);
 const bodyRadius=radius[spec.tier]*(spec.body==='quadruped'?1.35:spec.body==='spider'?1.15:1)*(boss?1.45:1);
 game.definitions.push({
  id:`unit.neutral.${spec.slug}`,kind:'unit',name:spec.name,
  description:`${camp.name} · ${ranged?'ranged':'melee'} forest creature. ${camp.theme}`,
  asset:`asset.neutral.${spec.slug}`,icon:`icon.neutral.${spec.slug}`,selectionClass:'army',
  dimensions:{radius:Number(bodyRadius.toFixed(3)),height:spec.height,formationSpacing:Number((bodyRadius*2.25).toFixed(3))},
  body:{maxHp:spec.hp,armor:spec.armor,armorType:spec.armor>=2?'heavy':'light'},
  vision:large?12:10,behaviorSets:['behavior-set.neutral'],
  behaviors:{
   movement:{speed:spec.body==='flyer'?8:large?6:7},
   combat:{damage:spec.damage,damageType:ranged?'piercing':'melee',
    range:ranged?(large?10:8):large?2.2:1.5,
    cooldownTicks:ranged?60:large?66:50,aggroRange:ranged?12:10,
    attack:{windupTicks:ranged?17:14,recoveryTicks:ranged?14:12,rangeBuffer:.75},
    ...(ranged?{projectile:{speed:32}}:{}),
   },
  },level:boss?9:levels[spec.tier]+(large?1:0),
  experienceYield:yields[spec.tier]*(boss?3:1),supplyCost:1,
 });
}
fs.writeFileSync(path,JSON.stringify(game,null,2).replaceAll('’','\\u2019').replaceAll('–','\\u2013')+'\n');
console.log(`Registered ${specs.length} neutral creature definitions across ${camps.length} camp families.`);
