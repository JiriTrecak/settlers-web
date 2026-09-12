"""First army: authored barracks, spear/shield warrior and bow archer."""
from pathlib import Path
R=Path('/Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web')
ANT_ASSETS={'barracks','warrior','archer'}
source=(R/'scripts/ant-colony/models.py').read_text()
exec(source.split("for kind,off in [('fort'")[0])
# Compact fortified drill hall: open doorway, armor roof, crossed weapons and targets.
for x in [-2.0,2.0]:
 for y in [-1.7,1.7]:
  box('Stone pier',(x,y,.22),(.7,.7,.44),rock[1],.08)
  beam('Timber frame',(x,y,.4),(x,y,2.8),.38,wood[1])
  for z in [.7,2.55]:box('Iron binding',(x,y,z),(.42,.42,.15),iron,.02)
for row in range(6):
 log((0,1.7,.5+row*.3),4.2,.16)
 for x in [-2,2]:log((x,0,.5+row*.3),3.5,.16,(0,1,0))
for y in [-1.7,1.7]:beam('Roof lintel',(-2.2,y,2.6),(2.2,y,2.6),.32,wood[2])
arch_roof(0,0,2.6,2.4,1.15,4,3,6)
# Doorway sign: shield and two spears, unmistakable at RTS scale.
for side in [-1,1]:
 beam('Crossed spear',(side*-.8,-2.08,2.3),(side*.8,-2.08,3.65),.055,wood[2])
 ell('Sign spearhead',(side*.87,-2.08,3.75),(.09,.045,.19),silver,8,4)
ell('Garrison shield',(0,-2.15,2.9),(.42,.10,.48),iron,10,5)
ell('Painted shield face',(0,-2.24,2.9),(.32,.035,.37),flagmat,10,5)
ell('Shield boss',(0,-2.29,2.9),(.10,.055,.10),silver,8,4)
banner(1.75,-1.95,2.0)
lamp(-1.6,-1.95,1.8)
# Practice target and ready weapon rack flank the clear entrance.
cyl('Target stand',(-2.5,-2.4,0),(-2.5,-2.4,1.4),.08,wood[1])
for radius,material,dy in [(.42,cut,0),(.27,flagmat,-.055),(.11,iron,-.10)]:
 ell('Archery target',(-2.5,-2.45+dy,1.32),(radius,.07,radius),material,12,5)
for x in [1.7,2.5]:beam('Rack upright',(x,-2.2,.1),(x,-2.2,1.7),.12,wood[1])
beam('Weapon rack',(1.5,-2.2,1.4),(2.7,-2.2,1.4),.12,wood[2])
for x in [1.8,2.15,2.5]:
 cyl('Training spear',(x,-2.3,.1),(x,-2.3,2),.035,wood[2])
 ell('Training spear tip',(x,-2.3,2.1),(.065,.035,.15),silver,8,4)
export('barracks',(0,0,0))
ant(True)
ell('Warrior shield rim',(-.52,-.4,1.07),(.34,.09,.42),silver,12,6)
ell('Warrior shield paint',(-.52,-.48,1.07),(.28,.04,.35),flagmat,12,6)
ell('Shield boss',(-.52,-.53,1.07),(.09,.07,.09),iron,10,5)
export('warrior',(7,0,0))
ant(False)
# Tall bow held beside the body, taut string, quiver and visible arrow fletching.
tube('Wooden recurve bow',[(.45,-.35,.32),(.69,-.40,.55),(.77,-.43,1.02),(.69,-.40,1.5),(.45,-.35,1.75)],.045,wood[2])
beam('Bow string',(.45,-.35,.32),(.45,-.35,1.75),.009,cut)
cyl('Back quiver',(-.20,.34,.8),(-.20,.42,1.4),.13,wood[0])
for dx in [-.08,0,.08]:
 beam('Arrow in quiver',(-.2+dx,.42,1.25),(-.2+dx,.47,1.72),.012,wood[2])
 ell('Arrow feathers',(-.2+dx,.47,1.65),(.04,.018,.085),cut,6,3)
export('archer',(10,0,0))
bpy.ops.wm.save_as_mainfile(filepath=OUT+'/Ant-military-source.blend')
print('MILITARY_EXPORTS',json.dumps(exports[-3:]))
