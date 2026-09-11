# Terrain and high ground

Height is part of the battlefield. A cliff can shelter a base, a ramp can funnel an army, and a scout on a ridge can reveal targets for ranged units below.

## Moving and building

Ground units can cross gentle slopes and authored ramps. Steep cliff faces block movement, including diagonal shortcuts around corners. Orders still use the same continuous movement and pathfinding system: clicking across a cliff sends the unit toward a reachable ramp.

Buildings need dry, level foundations. The maximum height difference across a footprint is **0.5 metres**. Bridge decks remain movement surfaces; buildings cannot be placed on them. Workers must reach the appropriate side of a tree, mine or building to work on it.

## Seeing uphill

Every observer uses the same **1.2-metre sight offset** above its ground level. This is an engine rule; a taller model does not see farther uphill.

- Terrain higher than that offset stays hidden from an observer below.
- Climbing a ramp gradually raises the observer's viewpoint and reveals the upper ground.
- Intervening ridges block sight. Standing back from a cliff rim can also conceal the ground immediately below it.
- Allied players share vision. A scout on the plateau can reveal enemies to an allied army below.
- Leaving the area preserves explored terrain, but enemy units disappear from current view. Previously seen static structures retain their last known appearance.

Debug reveal changes the picture, not the information available to the simulation or AI.

## Fighting across heights

Melee attacks cannot reach across a cliff edge. A visible enemy within horizontal range may still require an approach through a ramp.

Archers can attack uphill or downhill if a friendly observer reveals the target and terrain clears the shot. Another ridge can intercept the firing line. Ranged units look for an accessible firing position when their current position is obstructed. A released arrow does not deal damage through intervening terrain if the target moves behind it.

There is no elevation damage bonus or random uphill miss chance. Existing spell area effects keep their declared behaviour; this first pass does not add a separate terrain interaction to every spell.

## Authoring terrain

Open **Terrain** in the world editor:

1. Select **Plateau · cliff outline**. Set an absolute plateau height, click at least three outline points, and press **Apply curve**. The outline closes automatically. Switching to freehand paints a plateau with a round brush.
2. Select **Ramp · join two levels**. Click the lower endpoint on level ground, then the upper endpoint on level ground. Additional points curve the route. Press **Apply curve**. The ramp samples both endpoint heights; the radius controls half its width.
3. Extend a ramp if the editor reports it is too steep. The authoring limit is 0.65 metres of rise per metre of length. Keep tight curves broad enough for the intended army.
4. Paint ground materials, cover and scenery after shaping the heights. Save the map normally.

The editor's MCP `editor_landscape` tool exposes the same `plateau` and `ramp` operations. Terrain lives in the saved map heightfield; there is no second gameplay-only elevation layer.

## Try it

[Terrain Proving Ground](/maps/terrain-proving-ground) is a small scenario with a cliff, a wide ramp and an intervening ridge. It isolates movement, fog and firing rules.

[Four Crowns](/maps/four-crowns) is a **512 × 512** four-player battlefield. Four elevated starting colonies descend toward a central lake. A shore road and a higher circulation route connect expansion areas. It contains **48 camps**, including **eight T3 boss encounters**, **16 amber mines**, **12 root deposits**, and rich home forests. Two contested boss camps award legendary items; the other T3 encounters use the hard reward pool, preserving the game's legendary-loot limit.

Choose four separate teams for **1v1v1v1**, or set all four slots to AI to observe. Worldroot Hollow remains available.
