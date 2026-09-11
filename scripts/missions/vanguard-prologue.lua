-- Cinematic lines pause simulation. Omit the final true for an inline comment.
-- Explicit mission state survives callbacks and saved games.
function on_start()
  mission.set("stage", "entrance")
  mission.begin_scene(190, 195)
  mission.move("marshal", 189, 193)
  mission.move("vanguard-guard", 192, 196)
  mission.move("vanguard-scout", 187, 197)
end
function on_tick()
  if not mission.alive("marshal") then mission.objective("The Marshal has fallen. The Vanguard needs its leader."); mission.lose(); return end
  local opening = mission.get("stage")
  if opening == "entrance" then
    if mission.arrived("marshal", 189, 193) and mission.arrived("vanguard-guard", 192, 196) and mission.arrived("vanguard-scout", 187, 197) then
      mission.face("marshal", 190, 195)
      mission.face("vanguard-guard", 190, 195)
      mission.face("vanguard-scout", 190, 195)
      mission.set("stage", "gathering")
    end
    return
  elseif opening == "gathering" then
    if mission.facing_done() then
      mission.set("stage", "opening-briefing")
      mission.say("Marshal", "unit.ants.marshal", "The northern watch has gone silent. We follow the lantern road through the Hollow. Search the old outposts if you find them — whatever remains may keep us alive.", 10, true)
    end
    return
  elseif opening == "opening-briefing" then
    mission.end_scene()
    mission.set("stage", "journey")
    mission.begin_objective("reach-crossing")
  end
  if not mission.get("convoy_seen") and mission.in_region("marshal", "lost-convoy") then
    mission.set("convoy_seen", true)
    mission.begin_objective("convoy-cache")
    mission.say("Vanguard scout", "unit.ants.archer", "An abandoned supply camp. Those wolves are guarding something. A short detour might be worth it.", 6)
  end
  if not mission.get("shrine_seen") and mission.in_region("marshal", "moss-shrine") then
    mission.set("shrine_seen", true)
    mission.begin_objective("shrine-cache")
    mission.say("Marshal", "unit.ants.marshal", "The old trailkeepers left a cache here. Clear the grove and bring it with us.", 6)
  end
  if not mission.get("den_seen") and mission.in_region("marshal", "stone-den") then
    mission.set("den_seen", true)
    mission.begin_objective("den-cache")
    mission.say("Vanguard guard", "unit.ants.warrior", "An ogre by the lake. We can leave it be, Marshal — or take whatever it has been hoarding.", 6)
  end
  if mission.get("convoy_seen") and not mission.get("convoy_done") and not mission.alive("convoy-wolf-one") and not mission.alive("convoy-wolf-two") then
    mission.complete_objective("convoy-cache"); mission.set("convoy_done", true)
  end
  if mission.get("shrine_seen") and not mission.get("shrine_done") and not mission.alive("shrine-wolf-one") and not mission.alive("shrine-wolf-two") then
    mission.complete_objective("shrine-cache"); mission.set("shrine_done", true)
  end
  if mission.get("den_seen") and not mission.get("den_done") and not mission.alive("den-ogre-one") then
    mission.complete_objective("den-cache"); mission.set("den_done", true)
  end
  local stage = mission.get("stage")
  if stage == "journey" and mission.in_region("marshal", "old-crossing") then
    mission.spawn("ambusher-one"); mission.spawn("ambusher-two")
    mission.attack("ambusher-one", "marshal"); mission.attack("ambusher-two", "marshal")
    mission.set("stage", "ambush")
    mission.complete_objective("reach-crossing"); mission.begin_objective("clear-crossing")
    mission.say("Vanguard scout", "unit.ants.archer", "Movement in the roots! Wolves at the crossing. Shields forward!", 7, true)
  elseif stage == "ambush" and not mission.alive("ambusher-one") and not mission.alive("ambusher-two") then
    mission.set("stage", "find-watch")
    mission.complete_objective("clear-crossing"); mission.begin_objective("find-watch")
    mission.say("Marshal", "unit.ants.marshal", "The tracks continue north. The watch may still be alive. Stay together.", 7)
  elseif stage == "find-watch" and mission.in_region("marshal", "watch-rescue") then
    mission.complete_objective("find-watch"); mission.begin_objective("rescue-watch")
    mission.spawn("watch-captain"); mission.spawn("watch-ranger"); mission.spawn("watch-pursuer-one")
    local x, y = mission.position("marshal")
    mission.move("watch-captain", x + 2, y + 1); mission.move("watch-ranger", x - 2, y + 2)
    mission.attack("watch-pursuer-one", "watch-captain")
    mission.set("stage", "rescue")
    mission.set("watch_turn_at", mission.tick() + 200)
    mission.say("Watch captain", "unit.ants.warrior", "Marshal! Behind us — an ogre! Get it off our trail!", 7)
  elseif stage == "rescue" then
    if mission.get("watch_turn_at") and mission.tick() >= mission.get("watch_turn_at") then
      if mission.alive("watch-captain") then mission.attack("watch-captain", "watch-pursuer-one") end
      if mission.alive("watch-ranger") then mission.attack("watch-ranger", "watch-pursuer-one") end
      mission.set("watch_turn_at", nil)
    end
    if not mission.alive("watch-captain") and not mission.alive("watch-ranger") then
      mission.fail_objective("rescue-watch")
      mission.objective("The watch patrol was lost. At least one soldier had to survive.")
      mission.lose()
    elseif not mission.alive("watch-pursuer-one") then
      mission.complete_objective("rescue-watch")
      mission.set("stage", "watch-briefing")
      if mission.alive("watch-captain") then
        mission.say("Watch captain", "unit.ants.warrior", "We held Lantern Rise until the beasts broke through. The road bends around the lake and climbs west to the watch. Our signal fire is still there. Give the word, Marshal — we are coming with you.", 12, true)
      else
        mission.say("Watch ranger", "unit.ants.archer", "The captain bought me time. Lantern Rise is overrun — follow the road around the lake, then west. I will see our signal fire lit again. I am with you, Marshal.", 11, true)
      end
    end
  elseif stage == "watch-briefing" then
    if mission.alive("watch-captain") then mission.transfer("watch-captain", "player.1") end
    if mission.alive("watch-ranger") then mission.transfer("watch-ranger", "player.1") end
    mission.begin_objective("reclaim-rise")
    mission.set("stage", "onward")
    mission.say("Marshal", "unit.ants.marshal", "Fall in with the Vanguard. We take back Lantern Rise together.", 6)
  elseif stage == "onward" and mission.in_region("marshal", "lantern-rise") then
    mission.spawn("watch-wolf-one"); mission.spawn("watch-wolf-two"); mission.spawn("watch-wolf-three")
    mission.attack("watch-wolf-one", "marshal"); mission.attack("watch-wolf-two", "marshal"); mission.attack("watch-wolf-three", "marshal")
    mission.set("stage", "final")
    mission.objective("Defeat the three wolves occupying Lantern Rise.")
    mission.say("Marshal", "unit.ants.marshal", "The watch is overrun. We reclaim it here, together. For the colony!", 7, true)
  elseif stage == "final" and not mission.alive("watch-wolf-one") and not mission.alive("watch-wolf-two") and not mission.alive("watch-wolf-three") then
    mission.set("stage", "victory")
    mission.complete_objective("reclaim-rise")
    mission.objective("Lantern Rise is secure.")
    mission.say("Marshal", "unit.ants.marshal", "Light the watch. Let the colony see it through the trees. The road is open — and the Vanguard has found its way home.", 9, true)
  elseif stage == "victory" then mission.win() end
end
