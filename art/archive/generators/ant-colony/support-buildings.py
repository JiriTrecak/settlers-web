"""Original Ant dwellings, watch post and stone workshop; shared material language."""
from pathlib import Path
ANT_ASSETS=globals().get('ANT_ASSETS',{'house','tower','stonemason'})
exec(Path('/Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/scripts/ant-colony/models.py').read_text().split('for kind,off in ')[0])
def post(x,y,h):
 beam('Heavy bark post',(x,y,.08),(x,y,h),.28,wood[1])
 box('Cut post crown',(x,y,h),(.34,.34,.13),cut,.03)
 box('Iron joint binding',(x,y,h-.20),(.30,.30,.11),iron,.02)
def foundation(w,d):
 for row in range(2):
  for j in range(5):
   x=(j-2)*w/5
   for y in [-d/2,d/2]:box('Stone footing',(x,y,.17+row*.25),(w/5-.035,.45,.25),rock[(j+row)%3],.05)
 for x in [-w/2,w/2]:box('Side footing',(x,0,.25),(.42,d,.45),rock[0],.045)
def house():
 foundation(2.6,2.3)
 for x in [-1.22,1.22]:
  for y in [-1.0,1.0]:post(x,y,1.9)
 for row in range(5):
  z=.60+row*.24
  for x in [-1.22,1.22]:box('Dwelling side boards',(x,0,z),(.17,2.0,.23),wood[(row%2)+1],.024)
  box('Dwelling rear boards',(0,1.0,z),(2.4,.17,.23),wood[1],.024)
  for x in [-.95,.95]:box('Door side panel',(x,-1,z),(.48,.17,.23),wood[2],.022)
 box('Dark doorway',(0,-.90,.90),(.85,.10,1.25),dark,.02)
 for x in [-.49,.49]:beam('Door jamb',(x,-1.15,.35),(x,-1.15,1.6),.16,wood[0])
 beam('Door lintel',(-.56,-1.15,1.62),(.56,-1.15,1.62),.18,wood[2])
 arch_roof(0,0,1.90,1.62,1.02,2.65,3,6,pitched=True)
 for step in range(2):box('Doorstep',(0,-1.26-step*.28,.20-step*.06),(1.05,.48,.22),rock[1],.05)
 # Small side window, framed in iron with warm resin light behind it.
 box('Window recess',(1.315,.18,1.30),(.025,.50,.47),dark,.02)
 for y in [-.10,.46]:beam('Window surround',(1.35,y,1.03),(1.35,y,1.56),.06,wood[2])
 beam('Window crossbar',(1.36,-.08,1.28),(1.36,.44,1.28),.04,iron)
 lamp(.86,-1.16,1.50)
 for side in [-1,1]:tube('Dwelling root brace',[(side*1.25,.70,.65),(side*1.65,.8,.15),(side*1.9,.92,.015)],.13,wood[0])
 export('house',(16,12,0))
def tower():
 foundation(2.6,2.5)
 for x in [-1.1,1.1]:
  for y in [-1.1,1.1]:
   post(x,y,3.65)
   beam('Tower root buttress',(x*1.55,y*1.55,.1),(x,y,1.6),.24,wood[0])
 for z in [1.05,2.7]:
  for y in [-1.1,1.1]:beam('Tower crossbeam',(-1.1,y,z),(1.1,y,z),.22,wood[1])
 for x in [-1.1,1.1]:
  beam('Tower diagonal',(x,-1.0,.6),(x,1,2.7),.17,wood[2])
 for j in range(8):box('Lookout floor',(0,(j-3.5)*.31,2.75),(2.8,.30,.18),wood[2],.02)
 for y in [-1.16,1.16]:
  beam('Lookout handrail',(-1.25,y,3.65),(1.25,y,3.65),.17,wood[2])
  for j in range(5):box('Carapace parapet',((j-2)*.48,y,3.25),(.43,.16,.7),red[j%3],.07)
 for x in [-1.16,1.16]:beam('Lookout side rail',(x,-1.1,3.65),(x,1.1,3.65),.17,wood[2])
 for x in [-.32,.32]:beam('Ladder rail',(x,-1.7,.08),(x,-1.18,2.78),.08,wood[1])
 for j in range(9):beam('Ladder rung',(-.34,-1.7+j*.058,.25+j*.28),(.34,-1.7+j*.058,.25+j*.28),.075,wood[2])
 for x in [-1.1,1.1]:
  for y in [-1.05,1.05]:beam('Canopy stanchion',(x,y,3.5),(x,y,4.53),.18,wood[1])
 arch_roof(0,.28,4.05,1.55,.67,2.35,3,6)
 banner(-1.2,.9,4.1)
 export('tower',(22,12,0))
def stonemason():
 for x in [-1.7,1.7]:
  for y in [-1.2,1.2]:post(x,y,2.1)
 for row in range(5):box('Rear workshop boards',(0,1.18,.55+row*.28),(3.4,.18,.26),wood[(row%2)+1],.025)
 for x in [-1.7,1.7]:
  beam('Workshop brace',(x,-1.2,1.4),(x,-.55,2.12),.16,wood[2])
  box('Stone bench pier',(x*.63,-1.1,.40),(.6,.65,.8),rock[1],.065)
 box('Dressing bench',(0,-1.12,.90),(2.9,.95,.22),wood[0],.035)
 box('Work stone',(0,-1.2,1.22),(1.0,.72,.43),rock[2],.07)
 beam('Mallet haft',(.45,-1.35,1.45),(.98,-1.35,1.08),.07,wood[2])
 box('Iron mallet head',(.49,-1.35,1.43),(.28,.36,.19),iron,.035)
 beam('Stone chisel',(-.22,-1.3,1.44),(-.29,-1.3,1.87),.04,silver)
 arch_roof(0,.12,2.14,2.04,.86,3.1,3,7)
 lamp(1.65,-1.28,1.58)
 for j in range(9):
  a=j*2.399;box('Stone offcut',(math.cos(a)*.95,-2.0+math.sin(a)*.48,.08),(.14+j%3*.045,.16,.14),rock[j%3],.025)
 # Upright slab and a large hammer are visible role markers from the RTS camera.
 box('Raw standing slab',(-1.3,.15,.63),(.64,.9,1.25),rock[0],.08)
 beam('Large hammer handle',(-1.78,-1.55,.12),(-1.43,-1.55,1.22),.07,wood[2])
 box('Large hammer head',(-1.43,-1.55,1.22),(.42,.24,.24),silver,.035)
 export('stonemason',(16,0,0))
if 'house' in ANT_ASSETS:house()
if 'tower' in ANT_ASSETS:tower()
if 'stonemason' in ANT_ASSETS:stonemason()
bpy.data.libraries.write(OUT+'/Ant-colony-source.blend',{col},fake_user=True)
open(OUT+'/model-manifest.json','w').write(json.dumps(exports,indent=2))
result={'assets':['house','tower','stonemason']}
