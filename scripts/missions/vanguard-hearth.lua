function on_start()
 mission.set("stage", "gather")
 mission.begin_objective("gather")
 mission.say("Marshal", "unit.ants.marshal", "The watch is safe, but a patrol cannot hold this road forever. This clearing will be our home. Send workers to amber and trees. Each trip brings ten to the Mound. Keep me alive, and protect our Mound.", 13, true)
end
function on_tick()
 if not mission.alive("marshal") or not mission.alive("mound") then mission.objective("The colony has lost its Marshal or Mound."); mission.lose(); return end
 local stage=mission.get("stage")
 -- Players may build early; completed infrastructure is accepted as proof of gathering.
 if stage=="gather" and ((mission.stock("player.1","item.amber")>=100 and mission.stock("player.1","item.wood")>=60) or (mission.count("player.1","building.ants.barracks")>=1 and mission.count("player.1","building.ants.house")>=1)) then
  mission.complete_objective("gather");mission.begin_objective("settle");mission.set("stage","settle")
  mission.say("Vanguard scout","unit.ants.archer","A Worker House gives us more free ants. A Barracks gives them a new purpose. Workers busy gathering stay at their jobs unless you release them.",10,true)
 elseif stage=="settle" and mission.count("player.1","building.ants.barracks")>=1 and mission.count("player.1","building.ants.house")>=1 then
  mission.complete_objective("settle");mission.begin_objective("archers");mission.set("stage","archers")
  mission.say("Marshal","unit.ants.marshal","Train two archers at the Barracks. Each needs amber, lumber, and a free worker who walks inside. Put our warriors in front when the fighting starts.",10,true)
 elseif stage=="archers" and mission.count("player.1","unit.ants.archer")>=2 then
  mission.complete_objective("archers");mission.begin_objective("defend");mission.set("stage","raid")
  mission.spawn("raider-one");mission.spawn("raider-two");mission.spawn("raider-three")
  mission.attack_move("raider-one",70,188);mission.attack_move("raider-two",70,188);mission.attack_move("raider-three",70,188)
  mission.say("Vanguard scout","unit.ants.archer","Wolves on the eastern road! Our archers are ready. Keep them behind the line!",7,true)
 elseif stage=="raid" and not mission.alive("raider-one") and not mission.alive("raider-two") and not mission.alive("raider-three") then
  mission.complete_objective("defend");mission.begin_objective("outpost");mission.set("stage","outpost")
  mission.say("Marshal","unit.ants.marshal","We held. Follow the lanterns beyond the pond and clear the old gate. Leave enough workers here to keep the colony growing.",9)
 elseif stage=="outpost" and not mission.alive("gate-ogre") and not mission.alive("gate-wolf-one") and not mission.alive("gate-wolf-two") then
  mission.complete_objective("outpost");mission.set("stage","victory")
  mission.say("Marshal","unit.ants.marshal","A roof, a watch, and a road we can defend. Now we are a colony. Beyond this gate, the old roots are turning bitter. We find out why at first light.",11,true)
 elseif stage=="victory" then mission.win() end
 if not mission.get("cache_seen") and mission.in_region("marshal","cache") then mission.set("cache_seen",true);mission.begin_objective("cache");mission.say("Marshal","unit.ants.marshal","An old supply hollow. Clear the beasts if you want what they have left behind.",6) end
 if mission.get("cache_seen") and not mission.get("cache_done") and not mission.alive("cache-wolf-one") and not mission.alive("cache-wolf-two") then mission.set("cache_done",true);mission.complete_objective("cache") end
end
