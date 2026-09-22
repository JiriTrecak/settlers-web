"""Prepare original texture sources and reproducible studio folders (no imported pixels)."""
from pathlib import Path
import json, shutil, math
import numpy as np
from PIL import Image
root=Path(__file__).resolve().parents[2];base=root/'art/sources/environment'
n=512;y,x=np.mgrid[:n,:n];u=x/n;v=y/n
# Broad vertical bark plates with periodic grain; restrained painterly relief.
rng=np.random.default_rng(91)
grain=np.sin((u*18+.10*np.sin(v*math.tau*3))*math.tau)
fine=np.sin((u*51+.19*np.sin(v*math.tau*2))*math.tau)
shade=1+.15*grain+.05*fine+.045*np.sin(v*math.tau*8+u*20)+rng.normal(0,.012,(n,n))
bark=np.clip(shade[:,:,None]*np.array([113,88,61]),0,255).astype('uint8')
for slug in ['woodland-pine-a','woodland-pine-b','woodland-pine-sapling','woodland-pine-stump','leafbound-twig-bridge']:
 d=base/slug;d.mkdir(parents=True,exist_ok=True);bridge='bridge' in slug;stump='stump' in slug;small='sapling' in slug
 ref=d/'render.png'
 if ref.exists():Image.open(ref).convert('RGB').save(d/'reference.png')
 Image.fromarray(bark).save(d/('albedo.png' if bridge or stump else 'albedo_2.png'))
 if not bridge and not stump and slug!='woodland-pine-a':shutil.copyfile(base/'woodland-pine-a/albedo.png',d/'albedo.png')
 config={'name':slug.replace('-',' ').title(),'blend':slug+'.blend','recipe':'model.py','preserve_textures':True,'seed':91,'camera':{'azimuth':35,'elevation':35 if bridge else 22,'scale':29 if bridge else 3.2 if stump else 4.2 if small else 15,'target':[0,0,1 if bridge else .4 if stump else 1.4 if small else 5.5]},'render':{'width':1200,'height':900,'samples':32},'light':{'key_energy':1200,'fill_energy':650,'rim_energy':500,'scale':3 if bridge else .6 if stump else 1 if small else 2,'target':[0,0,1 if bridge else 4]}}
 (d/'asset.json').write_text(json.dumps(config,indent=2));(d/'samples.json').write_text(json.dumps({'pine-mid':{'u':.185,'v':.41,'radius':4},'timber':{'u':.46,'v':.53,'radius':4},'bark':{'u':.34,'v':.67,'radius':4}},indent=2))
 (d/'model.py').write_text("from pathlib import Path\nimport sys\nROOT=Path(__file__).resolve().parents[4]\nsys.path.insert(0,str(ROOT/'art/recipes'))\nfrom woodland_originals import build\nbuild(Path(__file__).resolve().parent)\n")
print('Prepared five original assets')
