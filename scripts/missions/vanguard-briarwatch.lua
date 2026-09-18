-- The Defense of Briarwatch. All dialogue is original to Under the Canopy.
-- Optional branches are independent of the main stage and never overwrite speech.
local hero = 'unit.ants.marshal'
local villager = 'unit.ants.civilian'
local function flag(k) return mission.get(k) == true end
local function done(k) mission.set(k,true) end
local function group_alive(prefix,n)
 for i=0,n-1 do if mission.alive(prefix..'-'..i) then return true end end
 return false
end
local function spawn_group(prefix,n)
 for i=0,n-1 do mission.spawn(prefix..'-'..i) end
end
local function speaker(name,portrait,text,seconds,cinematic,actor)
 mission.say(name,portrait,text,seconds,cinematic,actor)
end
function on_start()
 mission.begin_scene(43,48)
 mission.face('marshal',39,43)
 mission.face('elder',43,48)
 mission.begin_objective('defend')
 mission.set('stage','intro-elder')
 speaker('Elder Rusk',hero,'Smoke beyond the stream. The Briar raiders have split their force: one party holds the ridge, another has entered the village.',7,true,'elder')
end
function on_tick()
 if not mission.alive('marshal') then mission.objective('The Marshal has fallen. Briarwatch is lost.');mission.lose();return end
 -- Destructible rewards are physical, fixed items, spawned exactly once.
 local caches={ 'start-heal','start-protection','town-mana' }
 for i=1,3 do local id=caches[i]
  if not flag(id..'-opened') and not mission.alive(id) then done(id..'-opened');mission.spawn(id..'-drop') end
 end
 if flag('house') and not flag('house-collapsed') and not mission.alive('town-burned') then done('house-collapsed');mission.spawn('cottage-ruins') end
 if mission.dialogue_busy() then return end
 local stage=mission.get('stage')
 if stage=='intro-elder' then
  mission.set('stage','intro-marshal')
  speaker('Marshal',hero,'Then take the ridge. I will reach Briarwatch before they carry anyone away. Guards, stay together. We may be all the help that village gets.',7,true,'marshal');return
 elseif stage=='intro-marshal' then
  mission.end_scene();mission.move('elder',29,72);mission.set('stage','road');return
 elseif stage=='captain-scene' then
  mission.end_scene();mission.set('stage','captain-fight');return
 elseif stage=='victory-scene' then
  mission.spawn('messenger');mission.move('messenger',178,69);mission.set('stage','aftermath')
  speaker('Survivor',villager,'You saved the square, Marshal. But they took our kin through the northern roots. Please—do not leave them there.',7,true);return
 elseif stage=='aftermath' then
  mission.set('stage','victory')
  speaker('Marshal',hero,'We will find them. Tend the wounded and light the watch lamps. Briarwatch stands, and no one here will face the dark alone.',7,true,'marshal');return
 elseif stage=='victory' then mission.end_scene();mission.win();return end

 -- The volunteers join as the same entities; wounded volunteers retain their injuries.
 if not flag('volunteers') and mission.in_region('marshal','hamlet') then
  done('volunteers')
  mission.transform('volunteer-one','unit.ants.warrior','player.1')
  mission.transform('volunteer-two','unit.ants.warrior','player.1')
  mission.follow('volunteer-one','marshal');mission.follow('volunteer-two','marshal')
  speaker('Briarwatch Volunteer',villager,'We know this road. Give us a place in your line, Marshal. Our families are across that stream.',6,true);return
 end
 if not flag('rescue-started') and mission.alive('caretaker') and mission.in_region('marshal','caretaker') then
  done('rescue-started');mission.begin_objective('rescue')
  speaker('Caretaker Nella',villager,'Pip went looking for glowcaps beside the eastern trail. I heard shouting, and then nothing. Please find him.',7,true,'caretaker');return
 end
 if not flag('youngling-free') and not mission.alive('rescue-cage') and not group_alive('rescue',3) then
  done('youngling-free');mission.spawn('youngling');mission.follow('youngling','marshal')
  speaker('Pip','unit.ants.youngling','I knew someone would come! I can keep up. Please take me home.',5,true);return
 end
 if flag('rescue-started') and not flag('rescue-finished') then
  if not mission.alive('caretaker') or (flag('youngling-free') and not mission.alive('youngling')) then
   done('rescue-finished');mission.fail_objective('rescue')
   speaker('Marshal',hero,'We were too late. Keep the others close. No more lives lost on this road.',5);return
  elseif flag('youngling-free') and mission.in_region('youngling','caretaker') and mission.in_region('marshal','caretaker') then
   -- Retry after a slot is freed. Completion never silently loses the reward.
   if mission.give_item('marshal','item.briar-rescue-ring') then
    done('rescue-finished');mission.complete_objective('rescue');mission.move('youngling',46,140)
    speaker('Caretaker Nella',villager,'Pip! Stay beside me. Marshal, take this ring. It guarded our family for years; let it guard you now.',7,true,'caretaker');return
   elseif not flag('rescue-full') then
    done('rescue-full');speaker('Caretaker Nella',villager,'I have a ring for you. Make room in your satchel, and come back to me.',5);return
   end
  end
 end
 if not flag('ambush') and mission.in_region('marshal','ambush') then
  done('ambush');spawn_group('ambush',4)
  mission.transform('traveler','unit.briar.cutthroat','none','ambush');mission.attack('traveler','marshal')
  for i=0,3 do mission.attack('ambush-'..i,'marshal') end
  speaker('Stranded Traveler',villager,'A Marshal, all this way from his mound? Boys—look what followed me home!',5,true,'traveler');return
 end
 if not flag('ledger-started') and mission.alive('merchant') and mission.in_region('marshal','merchant') then
  done('ledger-started');mission.begin_objective('ledger');spawn_group('thieves',3)
  for i=0,2 do mission.move('thieves-'..i,168+i*2,207) end
  speaker('Pell the Merchant',villager,'Thieves! They took my leaf ledger—the names of every family I supply. They are running southeast, into the fern hollow!',8,true,'merchant');return
 end
 if flag('ledger-started') and not flag('ledger-finished') and not mission.alive('merchant') then
  done('ledger-finished');mission.fail_objective('ledger');speaker('Marshal',hero,'Pell is gone. Keep the ledger safe; its names still belong to living families.',5);return
 end
 if flag('ledger-started') and not flag('ledger-finished') and mission.in_region('marshal','merchant') and mission.has_item('marshal','item.briar-ledger') then
  mission.take_item('marshal','item.briar-ledger');mission.spawn('merchant-reward');done('ledger-finished');mission.complete_objective('ledger')
  speaker('Pell the Merchant',villager,'My ledger! I thought those names were gone for good. Take this vigor seed, Marshal. Its strength stays with you. You have earned it.',7,true,'merchant');return
 end
 if not flag('gate') and mission.in_region('marshal','gate') then
  done('gate');spawn_group('gate',2);mission.spawn('fleeing-villager');mission.move('fleeing-villager',183,158)
  mission.attack('gate-0','fleeing-villager');mission.attack('gate-1','fleeing-villager')
  speaker('Briarwatch Villager',villager,'They are in the square! The watch is still fighting—hurry!',5,false);return
 end
 if not flag('town') and mission.in_region('marshal','town') then
  done('town');spawn_group('town',2);spawn_group('west',2);mission.spawn('town-villager-one');mission.move('town-villager-one',181,125)
  mission.attack('town-0','town-villager-one');mission.attack('west-0','defender-0');mission.attack('west-1','defender-1')
  mission.attack('defender-0','west-0');mission.attack('defender-1','west-1');mission.attack('defender-2','west-0')
  speaker('Marshal',hero,'Briarwatch! Rally to me. Guards, clear the streets and give the villagers room to run.',6,false,'marshal');return
 end
 if flag('town') and not flag('defenders') and mission.in_region('marshal','defenders') and not group_alive('west',2) then
  done('defenders')
  for i=0,2 do if mission.alive('defender-'..i) then mission.transfer('defender-'..i,'player.1');mission.follow('defender-'..i,'marshal') end end
  if group_alive('defender',3) then speaker('Briarwatch Guard','unit.ants.warrior','The captain holds the northern square. We can still fight. Lead us there!',6,true)
  else speaker('Marshal',hero,'The watch held this street until the end. We finish what they started.',5) end;return
 end
 if not flag('house') and mission.in_region('marshal','house') then
  done('house');mission.damage('town-burned',10000);spawn_group('house',2);mission.spawn('town-villager-two');mission.move('town-villager-two',190,118)
  mission.attack('house-0','town-villager-two')
  speaker('Briarwatch Villager',villager,'The raiders came through the cottage! Get away from the doorway!',5,false);return
 end
 if stage=='road' and mission.alive('captain-0') and mission.in_region('marshal','captain') then
  mission.complete_objective('defend');mission.begin_objective('captain');mission.begin_scene(174,65);mission.set('stage','captain-scene')
  mission.move('captive-one',157,42);mission.move('captive-two',160,40)
  speaker('Briar Captain','unit.briar.chieftain','Take the captives through the roots. I will deal with these stragglers myself.',6,true,'captain-0');return
 end
 if (stage=='captain-fight' or stage=='road') and not group_alive('captain',3) then
  if stage=='road' then mission.complete_objective('defend');mission.begin_objective('captain') end
  mission.complete_objective('captain');mission.set('stage','victory-scene');mission.begin_scene(174,65)
  speaker('Marshal',hero,'Their captain is down. Hold the square! Search the houses and bring out anyone still trapped inside.',6,true,'marshal');return
 end
end
