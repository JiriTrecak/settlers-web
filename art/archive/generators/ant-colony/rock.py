from pathlib import Path
ANT_ASSETS={'rock'}
R=Path('/Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web')
exec((R/'scripts/ant-colony/forest.py').read_text().split('for i in range(3):')[0])
exports=[a for a in json.load(open(OUT+'/forest-manifest.json')) if a['id']!='rock']
bank_stone();export('rock',(15,-8,0))
bpy.data.libraries.write(OUT+'/Ant-forest-source.blend',{col},fake_user=True)
open(OUT+'/forest-manifest.json','w').write(json.dumps(exports,indent=2))
result={'asset':'rock'}
