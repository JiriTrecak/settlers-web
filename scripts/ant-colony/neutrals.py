"""Neutral forest creatures, built from editable low-poly parts."""
from pathlib import Path
R=Path('/Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web')
ANT_ASSETS={'wolf','ogre'}
exec((R/'scripts/ant-colony/models.py').read_text().split("for kind,off in [('fort'")[0])
fur=mat('wolf charcoal fur','666b69');pale=mat('wolf pale ruff','aeb3a8');nose=mat('wolf nose','202a29');skin=mat('ogre moss skin','71805b');cloth=mat('ogre leather','534438');bone=mat('neutral bone','ded1a4')
ell('Wolf torso',(0,.05,.82),(.32,.65,.32),fur,10,6)
ell('Wolf chest',(0,-.4,.9),(.35,.34,.40),pale,10,5)
for side in [-1,1]:
 for y in [-.4,.5]:
  cyl('Wolf leg',(side*.22,y,.76),(side*.24,y-.05,.2),.09,fur,n=8)
  ell('Wolf paw',(side*.24,y-.12,.13),(.12,.20,.10),fur,8,4)
ell('Wolf head',(0,-.67,1.20),(.25,.31,.28),fur,10,6)
ell('Wolf muzzle',(0,-.96,1.10),(.15,.27,.13),pale,8,4)
ell('Wolf nose',(0,-1.18,1.12),(.12,.06,.08),nose,8,4)
for side in [-1,1]:
 mesh('Pointed wolf ear',[(side*.08,-.61,1.34),(side*.27,-.52,1.34),(side*.22,-.51,1.72),(side*.15,-.7,1.38)],[(0,1,2),(0,2,3),(1,3,2),(0,3,1)],fur)
 ell('Amber wolf eye',(side*.17,-.91,1.29),(.04,.026,.045),gold,8,4)
tube('Bushy wolf tail',[(0,.59,.92),(0,.91,.84),(.09,1.18,.57),(.13,1.37,.51)],.13,fur)
export('wolf',(0,0,0))
for side in [-1,1]:
 ell('Heavy ogre foot',(side*.4,-.16,.19),(.33,.45,.19),skin,10,5)
 cyl('Ogre leg',(side*.4,0,.3),(side*.35,0,1.12),.25,skin,n=10)
ell('Ogre belly',(0,0,1.5),(.78,.47,.84),skin,12,7)
box('Ogre belt',(0,0,1.05),(1.36,.88,.20),cloth,.08)
ell('Ogre head',(0,-.01,2.38),(.47,.39,.5),skin,12,7)
ell('Ogre lower jaw',(0,-.3,2.18),(.39,.22,.23),skin,10,5)
for side in [-1,1]:
 ell('Ogre shoulder',(side*.76,0,1.94),(.34,.36,.35),skin,10,6)
 cyl('Ogre arm',(side*.78,0,1.95),(side*1.0,-.23,1.18),.22,skin,n=10)
 ell('Ogre hand',(side*1.0,-.25,1.15),(.25,.22,.26),skin,10,5)
 ell('Ogre eye',(side*.18,-.355,2.48),(.075,.045,.055),nose,8,4)
 beam('Heavy brow',(side*.05,-.39,2.59),(side*.33,-.33,2.58),.10,skin)
 ell('Ogre tusk',(side*.22,-.5,2.27),(.07,.06,.19),bone,8,4)
beam('Ogre club haft',(1,-.28,.8),(1.18,-.35,1.95),.16,wood[1])
ell('Ogre club head',(1.22,-.35,2.03),(.29,.27,.48),wood[0],8,5)
for z in [1.82,2.18]:box('Club iron band',(1.22,-.35,z),(.53,.50,.12),iron,.04)
ell('Ogre shoulder armor',(-.77,0,2.08),(.43,.40,.20),iron,10,5)
export('ogre',(4,0,0))
bpy.ops.wm.save_as_mainfile(filepath=OUT+'/Neutral-creatures-source.blend')
print('NEUTRAL_EXPORTS',json.dumps(exports[-2:]))
