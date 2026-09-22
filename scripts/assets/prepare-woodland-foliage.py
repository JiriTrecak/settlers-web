from pathlib import Path
import json,shutil,sys
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'experiments/building-studio'));from palette import extract
names=['grass-low','grass-messy','grass-high-a','grass-high-b','lily-a','lily-b','daisies']
for name in names:
 slug='woodland-'+name;asset=ROOT/'art/sources/environment'/slug;asset.mkdir(parents=True,exist_ok=True)
 config={'name':slug.replace('-',' ').title(),'blend':slug+'.blend','recipe':'model.py','preserve_textures':True,'camera':{'azimuth':35,'elevation':38,'scale':4,'target':[0,0,.4]},'render':{'width':800,'height':700,'samples':32},'light':{'key_energy':600,'fill_energy':350,'rim_energy':250,'scale':.7,'target':[0,0,.4]}}
 (asset/'asset.json').write_text(json.dumps(config,indent=2)+'\n');(asset/'model.py').write_text("from pathlib import Path\nimport sys\nROOT=Path(__file__).resolve().parents[4]\nsys.path.insert(0,str(ROOT/'art/recipes'))\nfrom woodland_foliage import build\nbuild(Path(__file__).resolve().parent)\n")
 for target in ['albedo.png','reference.png']:shutil.copyfile(ROOT/'art/sources/textures/woodland-grass-cards/albedo.png',asset/target)
 (asset/'samples.json').write_text(json.dumps({'olive':{'u':.14,'v':.39,'radius':3}},indent=2)+'\n');extract(asset)
 (asset/'generation.json').write_text(json.dumps({'method':'authored','recipe':'art/recipes/woodland_foliage.py','originalPixels':True,'texture':'Original six-cell meadow tuft artwork; lily and daisy surfaces are original plain materials.','seed':471},indent=2)+'\n')
(ROOT/'art/recipes/woodland-foliage.json').write_text(json.dumps(names,indent=2)+'\n')
