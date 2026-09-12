"""Deterministic editable forest showcase for the vivid woodland art target."""
import json, math, base64, struct, subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[2]
source=json.loads((root/'assets/maps/showcase/Verdant-River.utcmap').read_text())
m={'v':1,'name':'Verdant Forest','stamps':[],'landscape':{'rivers':[],'strokes':[],'cover':[],'environment':{'hour':8.2,'season':'summer','playing':False},'water':source['landscape']['water']}}
h=[]
for z in range(289):
 for x in range(289):
  wx,wz=x-16,z-16
  y=2.2+.45*math.sin(wx*.12)*math.sin(wz*.1)+1.6*math.exp(-((wx-141)**2+(wz-108)**2)/180)+.8*math.exp(-((wx-105)**2+(wz-145)**2)/130)
  h.append(round(y*100))
m['height']=base64.b64encode(struct.pack('<'+'h'*len(h),*h)).decode()
(root/'assets/maps/showcase/Verdant-Forest.utcmap').write_text(json.dumps(m,separators=(',',':')))
subprocess.run(['node','--import','tsx',str(root/'scripts/blender/compose-forest.ts')],check=True,cwd=root)
m=json.loads((root/'assets/maps/showcase/Verdant-Forest.utcmap').read_text())
c=[['editor_landscape',{'action':'load','map':m}],['editor_landscape',{'action':'view','grid':False}],['editor_screenshot',{'x':126,'z':126,'gameCam':True,'gameZoom':1,'keep':True,'aspect':16/9,'maxWidth':1280,'animationTime':12,'format':'jpeg'}]]
(root/'tmp/visual-audit/forest-call.json').write_text(json.dumps(c))
