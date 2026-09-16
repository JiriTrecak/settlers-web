function on_start()
 mission.set("stage","scout");mission.begin_objective("find-root")
 mission.say("Marshal","unit.ants.marshal","Amber keeps us alive. The bitter Root could make us stronger. Take the southern bank around the pond. Find the vein, clear its guardians, and protect the workers who follow us.",12,true)
end
function on_tick()
 if not mission.alive("marshal") or not mission.alive("mound") then mission.objective("The expedition has lost its Marshal or Mound.");mission.lose();return end
 local stage=mission.get("stage")
 if stage=="scout" and mission.in_region("marshal","root-vein") then
  mission.complete_objective("find-root");mission.begin_objective("guardians");mission.set("stage","guardians")
  mission.say("Vanguard scout","unit.ants.archer","There it is. The beasts have made their den among the roots. Clear them before we bring the workers forward.",8,true)
 elseif stage=="guardians" and not mission.alive("root-ogre") and not mission.alive("root-wolf-one") and not mission.alive("root-wolf-two") then
  mission.complete_objective("guardians");mission.begin_objective("rootworks");mission.set("stage","rootworks")
  mission.say("Marshal","unit.ants.marshal","Build a Rootworks here, beside the vein. Workers carry ten Root each trip, but only five can gather at once. They bring it only to a Rootworks — the Mound cannot process it.",12,true)
 elseif stage=="rootworks" and mission.count("player.1","building.ants.rootworks")>=1 then
  mission.complete_objective("rootworks");mission.begin_objective("harvest-root");mission.set("stage","harvest")
  mission.say("Marshal","unit.ants.marshal","Assign workers directly to the corrupted root. Hold this clearing while they work. We need one hundred Root for the Great Mound.",9)
 elseif stage=="harvest" and (mission.stock("player.1","item.root")>=100 or mission.count("player.1","building.ants.great-mound")>=1) then
  mission.complete_objective("harvest-root");mission.begin_objective("great-mound");mission.set("stage","upgrade")
  mission.say("Marshal","unit.ants.marshal","The first loads are secured. Upgrade our Mound to a Great Mound. That will let the Barracks train Hunters — spearmen who charge to close the distance.",10,true)
 elseif stage=="upgrade" and mission.count("player.1","building.ants.great-mound")>=1 then
  mission.complete_objective("great-mound");mission.begin_objective("hunters");mission.set("stage","hunters")
  mission.say("Marshal","unit.ants.marshal","Train two Hunters. Their spears cost amber and lumber; Root opened the path to them. Bring them to the vein. Another pack is coming.",10,true)
 elseif stage=="hunters" and mission.count("player.1","unit.ants.hunter")>=2 and mission.in_region("marshal","root-vein") then
  mission.complete_objective("hunters");mission.begin_objective("hold-root");mission.set("stage","defend")
  local raiders={"counter-ogre","counter-wolf-one","counter-wolf-two","counter-wolf-three"}
  for i=1,4 do mission.spawn(raiders[i]);mission.attack_move(raiders[i],213,84) end
  mission.say("Vanguard scout","unit.ants.archer","Movement beyond the roots! Protect the workers. Hunters, take the flank!",7,true)
 elseif stage=="defend" and not mission.alive("counter-ogre") and not mission.alive("counter-wolf-one") and not mission.alive("counter-wolf-two") and not mission.alive("counter-wolf-three") then
  mission.complete_objective("hold-root");mission.set("stage","victory")
  mission.say("Marshal","unit.ants.marshal","The Root is ours to study, and ours to defend. We came beneath these trees with three soldiers. Now the forest knows a colony stands here.",10,true)
 elseif stage=="victory" then mission.win() end
 if not mission.get("cache_seen") and mission.in_region("marshal","cache") then mission.set("cache_seen",true);mission.begin_objective("cache") end
 if mission.get("cache_seen") and not mission.get("cache_done") and not mission.alive("cache-ogre") then mission.set("cache_done",true);mission.complete_objective("cache") end
end
