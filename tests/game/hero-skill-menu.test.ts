import {expect,it} from 'vitest';
import {game} from './helpers';
import {commandCard,commandMenu,commandPage,commandPageCount,shortcutCommand} from '../../src/presentation/commands';

// The test world's default starting hero declares four learnable skills bound to Q/W/E/R in columns 1-4,
// the last one gated behind a higher hero level.
it('shows every hero skill in slots 1–4 with Back separate, including locked and completed skills',()=>{
 const g=game(),h=g.entities.find(e=>e.owner==='player.1'&&g.registry.get(e.definition).hero)!;
 const bindings=g.context.def(h).behaviors.abilities!.bindings.filter(b=>b.learning&&b.command);
 expect(bindings).toHaveLength(4);
 const gated=bindings.filter(b=>b.learning!.requiredLevels[0]!>1);
 expect(gated.length).toBeGreaterThan(0);
 const menu=()=>commandMenu(commandCard(g.view(h.owner),[h.id],h.owner,g.registry),'category.hero.skills',g.registry).entries;
 const checkSlots=()=>{
  const entries=menu();expect(commandPageCount(entries)).toBe(1);
  const page=commandPage(entries,0),skills=page.filter(s=>s.binding.type==='learnAbility');
  expect(skills.map(s=>[s.binding.id,s.column,s.row])).toEqual(bindings.map(b=>[`learn:${b.id}`,b.command!.column,1]));
  expect(page.find(s=>s.binding.type==='back')).toMatchObject({column:1,row:3});
  expect(new Set(page.map(s=>`${s.column}:${s.row}`)).size).toBe(page.length);
  for(const [i,b] of bindings.entries())expect(shortcutCommand(entries,0,b.command!.hotkey.toLowerCase())?.id).toBe(skills[i].binding.id);
  return skills.map(s=>s.binding);
 };
 const initial=checkSlots();
 for(const [i,b] of bindings.entries()){
  const required=b.learning!.requiredLevels[0]!;
  expect(initial[i].enabled).toBe(required<=1);
  if(required>1)expect(initial[i].reason).toBe(`Requires level ${required}`);
 }
 // A level-1 hero has exactly one skill point to spend.
 const first=bindings.find(b=>b.learning!.requiredLevels[0]===1)!;
 expect(g.command(h.owner,{type:'learnAbility',actor:h.id,ability:first.id}).accepted).toBe(true);g.observation.update();
 expect(checkSlots().every(s=>!s.enabled)).toBe(true);
 h.progression!.experience=g.context.def(h).behaviors.progression!.levels.at(-1)!.experience;g.observation.update();
 for(const b of bindings){
  while(h.abilities!.ranks[b.id]<b.learning!.requiredLevels.length){
   const entry=checkSlots().find(s=>s.binding===b.id)!;expect(entry.enabled).toBe(true);
   if(entry.type!=='learnAbility')throw Error('Expected a learn command');
   expect(g.command(h.owner,entry.immediate!).accepted).toBe(true);g.observation.update();
  }
 }
 expect(checkSlots().map(s=>s.reason)).toEqual(Array(bindings.length).fill('Fully learned'));
 expect(checkSlots().every(s=>!s.enabled)).toBe(true);
});
