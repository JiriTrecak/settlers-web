function on_start()
 mission.set('stage','gallery');mission.begin_objective('gallery')
 mission.camera('first-person','archer-1','marshal',nil,1.5,55,0.6)
 mission.set('intro-camera',true)
 mission.say('Marshal','unit.ants.marshal','No wind. No sky. Only the tree around us. Keep to the amber lights. We find what poisons these roots, then we find our way home.',10,true, 'marshal')
end
function on_tick()
 if mission.get('intro-camera') then mission.end_scene();mission.set('intro-camera',nil) end
 if not mission.alive('marshal') then mission.lose();return end
 local stage=mission.get('stage')
 if stage=='gallery' and mission.in_region('marshal','gallery') then
  mission.complete_objective('gallery');mission.begin_objective('resin-room');mission.set('stage','resin')
  mission.say('Vanguard scout','unit.ants.archer','The root rises above the gallery. Archers can take its crown while the shields cover the lower passage. I see amber burning in a chamber to the east.',10,true, 'archer-1')
 elseif stage=='resin' and not mission.alive('resin-guard.0') and not mission.alive('resin-guard.1') then
  mission.complete_objective('resin-room');mission.begin_objective('heart');mission.set('stage','heart')
  mission.recover('marshal')
  for i=0,3 do mission.recover('guard-'..i) end
  for i=0,2 do mission.recover('archer-'..i) end
  mission.say('Marshal','unit.ants.marshal','The living resin restores our strength. Tend the wounded while we can. Something has nested around its source. Take the northern passage. No one goes alone.',10,true, 'marshal')
 elseif stage=='heart' and not mission.alive('heart-keeper.0') and not mission.alive('heart-keeper.1') and not mission.alive('heart-keeper.2') then
  mission.complete_objective('heart');mission.set('stage','victory')
  mission.say('Marshal','unit.ants.marshal','The Keeper is fallen. This is more than a mine, more than another resource to claim. The whole forest drinks from these roots. We must tell the colony.',11,true, 'marshal')
 elseif stage=='victory' then mission.win() end
 if not mission.get('cache') and mission.in_region('marshal','fungal-cache') then mission.set('cache','seen');mission.begin_objective('fungal-cache') end
 if mission.get('cache')=='seen' and not mission.alive('fungal-cache.0') and not mission.alive('fungal-cache.1') then mission.set('cache','done');mission.complete_objective('fungal-cache') end
end
