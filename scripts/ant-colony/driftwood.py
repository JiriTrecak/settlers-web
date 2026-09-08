from pathlib import Path
ANT_ASSETS={'driftwood'}
source=Path('/Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/scripts/ant-colony/models.py').read_text().split('for kind,off in ')[0]
exec(source)
# Hollow, broken stream-bank stump with an uneven rim and projecting splinters.
n=11;verts=[]
heights=[1.35+.40*math.sin(j*2.3)+(.55 if j in [2,7] else 0) for j in range(n)]
for ring in range(3):
 for j in range(n):
  a=j*math.tau/n;r=.48 if ring==0 else .42 if ring==1 else .30
  verts.append((r*math.cos(a),r*math.sin(a),0 if ring==0 else heights[j]))
mesh('Weathered hollow bark',verts,[(j,(j+1)%n,n+(j+1)%n,n+j) for j in range(n)],wood[0])
mesh('Pale broken end grain',verts,[(n+j,n+(j+1)%n,2*n+(j+1)%n,2*n+j) for j in range(n)],cut)
mesh('Dark hollow core',[(.30*math.cos(j*math.tau/n),.30*math.sin(j*math.tau/n),.55) for j in range(n)],[tuple(range(n))],dark)
for j in [1,4,8]:
 a=j*math.tau/n
 tube('Snapped branch',[(.3*math.cos(a),.3*math.sin(a),.7),(.75*math.cos(a),.75*math.sin(a),1.05),(1.10*math.cos(a),1.10*math.sin(a),1.14)],.12,wood[1])
for j in range(5):
 a=j*math.tau/5
 tube('Splayed stump root',[(0,0,.25),(.5*math.cos(a),.5*math.sin(a),.12),(.95*math.cos(a),.95*math.sin(a),.02)],.11,wood[0])
for j in range(3):
 a=j*2.2;ell('Root moss',(.42*math.cos(a),.42*math.sin(a),.10),(.27,.20,.11),leaf[0],8,4)
export('driftwood',(12,-10,0))
bpy.data.libraries.write(OUT+'/Ant-colony-source.blend',{col},fake_user=True)
open(OUT+'/model-manifest.json','w').write(json.dumps(exports,indent=2))
result={'assets':exports}
