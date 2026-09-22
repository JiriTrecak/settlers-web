"""Prepare independent source folders for the original scenery collection."""
from pathlib import Path
import json,shutil,sys
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'experiments/building-studio'))
from palette import extract
items={'moss-boulder':(5,1),'river-stones':(3.7,.4),'rock-ledge':(6,1),'fallen-log':(7,1),'hollow-log':(8,1.2),'giant-stump':(12,2),'ruined-watchtower':(10,3),'broken-trader-cart':(8,1),'amber-lantern':(5,1.4),'mushroom-lantern':(5,1.4),'root-arch-bridge':(20,1),'trail-sign':(4,1.1),'log-bench':(5,.7),'woodpile':(4,.7),'acorn-cache':(3,.5),'amber-deposit':(7,1),'supply-crate':(3,.6),'rain-barrel':(3,.7),'mushroom-cluster':(3.4,.6),'stone-spring':(5,.5),'leaf-shelter':(5,1),'abandoned-camp':(4,.4),'snapped-root':(6,.7)}
for name,(scale,z) in items.items():
 slug='woodland-'+name;asset=ROOT/'art/sources/environment'/slug;asset.mkdir(parents=True,exist_ok=True)
 config={'name':slug.replace('-',' ').title(),'blend':slug+'.blend','recipe':'model.py','preserve_textures':True,'seed':813,'camera':{'azimuth':35,'elevation':32,'scale':scale,'target':[0,0,z]},'render':{'width':1000,'height':800,'samples':32},'light':{'key_energy':1200,'fill_energy':650,'rim_energy':500,'scale':max(.5,scale/9),'target':[0,0,z]},'design':'Original neutral scenery; construction and unseen sides independently authored. Palette reference is our own bound-twig bridge.'}
 (asset/'asset.json').write_text(json.dumps(config,indent=2)+'\n')
 (asset/'model.py').write_text("from pathlib import Path\nimport sys\nROOT=Path(__file__).resolve().parents[4]\nsys.path.insert(0,str(ROOT/'art/recipes'))\nfrom woodland_details import build\nbuild(Path(__file__).resolve().parent)\n")
 shutil.copyfile(ROOT/'art/sources/textures/woodland-bark/albedo.png',asset/'albedo.png')
 shutil.copyfile(ROOT/'art/sources/textures/woodland-rock/albedo.png',asset/'albedo_2.png')
 shutil.copyfile(ROOT/'art/sources/environment/leafbound-twig-bridge/render.png',asset/'reference.png')
 (asset/'samples.json').write_text(json.dumps({'wood':{'u':.48,'v':.52,'radius':3},'shade':{'u':.4,'v':.65,'radius':3}},indent=2)+'\n')
 extract(asset)
 (asset/'generation.json').write_text(json.dumps({'method':'authored','recipe':'art/recipes/woodland_details.py','seed':813,'textures':'Original ImageGen bark, woodland-bark source package. Original painted rock; other surfaces use original constant material colors.','design':config['design']},indent=2)+'\n')
(ROOT/'art/recipes/woodland-details.json').write_text(json.dumps(list(items),indent=2)+'\n')
print('Prepared',len(items),'original scenery assets')
