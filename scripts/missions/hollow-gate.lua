function on_start()
 mission.set('stage','crossing');mission.begin_objective('crossing')
 mission.say('Marshal','unit.ants.marshal','The Root runs beneath that fallen giant. The old lantern road will take us to its hollow. Stay together at the river; the forest has eyes on both banks.',11,true)
end
function on_tick()
 if not mission.alive('marshal') then mission.lose();return end
 local stage=mission.get('stage')
 if stage=='crossing' and mission.in_region('marshal','crossing') then
  mission.complete_objective('crossing');mission.begin_objective('gate');mission.set('stage','gate')
  mission.say('Vanguard scout','unit.ants.archer','A watch at the entrance. There is a root arch to the west: its crown gives our archers a firing position, and the lower trail passes beneath it.',10,true)
 elseif stage=='gate' and not mission.alive('gate-wardens.0') and not mission.alive('gate-wardens.1') and not mission.alive('gate-wardens.2') then
  mission.complete_objective('gate');mission.begin_objective('enter');mission.set('stage','enter')
  mission.say('Marshal','unit.ants.marshal','The entrance is clear. Gather the wounded. Beyond that amber light, we leave the canopy behind and enter the tree itself.',9,true)
 elseif stage=='enter' and mission.in_region('marshal','entrance') then
  mission.complete_objective('enter');mission.set('stage','victory')
  mission.say('Marshal','unit.ants.marshal','Listen. Something moves inside the heartwood. Shields forward. We go in together.',7,true)
 elseif stage=='victory' then mission.win() end
 local caches={'moss-cache','bitter-cache'}
 for i=1,2 do
  local name=caches[i]
  if not mission.get(name) and mission.in_region('marshal',name) then mission.set(name,'seen');mission.begin_objective(name) end
  if mission.get(name)=='seen' and not mission.alive(name..'.0') and not mission.alive(name..'.1') then mission.set(name,'done');mission.complete_objective(name) end
 end
end
