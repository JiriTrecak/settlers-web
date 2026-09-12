#!/usr/bin/env python3
"""Read-only asset census and reference audit. Writes reports, never changes assets.

Run from any directory: python3 scripts/assets/audit.py
Full inventory is deliberately kept in ignored tmp/; summary is small enough for docs.
This is structural evidence, not an unused-file deletion oracle or a GLTF validator.
"""
import argparse, collections, datetime, gzip, hashlib, json, os, pathlib, re, struct, subprocess, zlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
MEDIA = {'.png','.jpg','.jpeg','.webp','.svg','.gif','.tga','.bmp','.hdr','.exr','.ktx2','.glb','.gltf','.bin','.blend','.blend1','.fbx','.obj','.mtl','.wav','.mp3','.ogg','.flac','.woff','.woff2','.ttf','.otf','.utcmap','.swatch'}
TEXT = {'.ts','.js','.mjs','.css','.html','.json','.py','.md','.mdc','.lua','.rs','.toml'}
SKIP = {'.git','node_modules','dist','target','.venv','__pycache__','.xwin-cache','.generated','.DS_Store'}
FULL_ROOTS = {'assets','experiments','inspiration','original','output'}

def dump(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False)+'\n')

def alpha_stats(data):
    """Decode 8-bit, non-interlaced PNG alpha including palette transparency.
    Unsupported encodings remain unknown, never reported as opaque or valid alpha.
    """
    w,h,depth,color,_,_,interlace=struct.unpack('>IIBBBBB',data[16:29])
    if depth!=8 or interlace: return {'inspection':'unsupported-encoding'}
    channels={0:1,2:3,3:1,4:2,6:4}[color]
    offset=8; packed=[]; transparency=b''
    while offset+12<=len(data):
        n=struct.unpack('>I',data[offset:offset+4])[0]; tag=data[offset+4:offset+8]; block=data[offset+8:offset+8+n];offset+=n+12
        if tag==b'IDAT':packed.append(block)
        if tag==b'tRNS':transparency=block
    if color in (0,2) and not transparency: return {'inspection':'decoded','transparent':0,'partial':0,'opaque':w*h}
    raw=zlib.decompress(b''.join(packed));stride=w*channels;prev=bytearray(stride);counts=[0,0,0];at=0
    for _ in range(h):
        filt=raw[at];row=bytearray(raw[at+1:at+1+stride]);at+=1+stride
        for i in range(stride):
            a=row[i-channels] if i>=channels else 0;b=prev[i];c=prev[i-channels] if i>=channels else 0
            if filt==1: row[i]=(row[i]+a)&255
            elif filt==2: row[i]=(row[i]+b)&255
            elif filt==3: row[i]=(row[i]+((a+b)//2))&255
            elif filt==4:
                p=a+b-c;pa,pb,pc=abs(p-a),abs(p-b),abs(p-c);row[i]=(row[i]+(a if pa<=pb and pa<=pc else b if pb<=pc else c))&255
            elif filt!=0:raise ValueError('invalid PNG filter')
        for i in range(0,stride,channels):
            if color in (4,6):a=row[i+channels-1]
            elif color==3:a=transparency[row[i]] if row[i]<len(transparency) else 255
            elif color==0:a=0 if row[i]==int.from_bytes(transparency,'big') else 255
            else:a=0 if tuple(row[i:i+3])==struct.unpack('>HHH',transparency) else 255
            counts[0 if a==0 else 2 if a==255 else 1]+=1
        prev=row
    return dict(inspection='decoded',transparent=counts[0],partial=counts[1],opaque=counts[2])

def model_info(data, ext):
    if ext=='.glb':
        magic,version,length=struct.unpack('<III',data[:12])
        if magic!=0x46546c67 or version!=2 or length!=len(data):raise ValueError('invalid GLB header')
        n,kind=struct.unpack('<II',data[12:20])
        if kind!=0x4e4f534a:raise ValueError('missing GLB JSON chunk')
        g=json.loads(data[20:20+n])
    else:g=json.loads(data)
    tris=0;nontris=[];access=g.get('accessors',[])
    for mesh in g.get('meshes',[]):
        for p in mesh.get('primitives',[]):
            idx=p.get('indices',p.get('attributes',{}).get('POSITION'))
            count=access[idx]['count'] if idx is not None else 0;mode=p.get('mode',4)
            if mode==4:tris+=count//3
            elif mode in (5,6):tris+=max(0,count-2)
            else:nontris.append(mode)
    return {'meshes':len(g.get('meshes',[])),'primitives':sum(len(m.get('primitives',[])) for m in g.get('meshes',[])),
      'trianglesStored':tris,'nonTriangleModes':nontris,'materials':[m.get('name','') for m in g.get('materials',[])],
      'animations':[a.get('name','') for a in g.get('animations',[])],'skins':len(g.get('skins',[])),
      'externalUris':[a['uri'] for key in ('images','buffers') for a in g.get(key,[]) if 'uri'in a and not a['uri'].startswith('data:')],
      'embeddedImages':sum('bufferView'in a or a.get('uri','').startswith('data:') for a in g.get('images',[]))}

def run():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--out',default='tmp/asset-audit');args=parser.parse_args()
    out=(ROOT/args.out).resolve()
    if ROOT not in out.parents:raise ValueError('Report directory must be inside project')
    records=[];excluded=[];texts=[]
    for d,dirs,files in os.walk(ROOT,followlinks=False):
        rel=pathlib.Path(d).relative_to(ROOT);parts=rel.parts
        keep=[]
        for name in sorted(dirs):
            p=pathlib.Path(d)/name;r=p.relative_to(ROOT).as_posix()
            skip=name in SKIP or p.is_symlink() or r in ('keys','.cursor','.codex','build','wiki/.vitepress','tmp/asset-audit') or p.resolve()==out
            # Browser profiles contain cookies/cache rather than game assets. Do not inspect.
            skip=skip or (r.startswith('tmp/') and any(x in name.lower() for x in ('chrome','chromium','profile')))
            if skip:excluded.append(r)
            else:keep.append(name)
        dirs[:]=keep
        for name in sorted(files):
            p=pathlib.Path(d)/name;r=p.relative_to(ROOT).as_posix();ext=p.suffix.lower()
            if name=='.DS_Store' or p.is_symlink():continue
            if parts and parts[0] in ('src','tooling','scripts','tests','content') and ext in TEXT and r!='scripts/assets/audit.py':
                texts.append((r,p.read_text(errors='replace')))
            if not ((parts and parts[0] in FULL_ROOTS) or ext in MEDIA):continue
            if name.startswith('.'):continue
            data=p.read_bytes();entry={'path':r,'bytes':len(data),'ext':ext,'sha256':hashlib.sha256(data).hexdigest()}
            try:
                if ext=='.png':
                    if data[:8]!=b'\x89PNG\r\n\x1a\n':raise ValueError('invalid PNG signature')
                    entry['image']={'width':int.from_bytes(data[16:20],'big'),'height':int.from_bytes(data[20:24],'big'),'bitDepth':data[24],'colorType':data[25]}
                    if r.startswith('assets/ui/'):entry['image']['alpha']=alpha_stats(data)
                if ext in ('.glb','.gltf'):entry['model']=model_info(data,ext)
            except Exception as e:entry['inspectionError']=str(e)
            records.append(entry)
    records.sort(key=lambda e:e['path']);by_path={e['path']:e for e in records}
    try:tracked=set(subprocess.check_output(['git','ls-files','-z'],cwd=ROOT).decode().split('\0'))
    except Exception:tracked=set()
    for e in records:e['tracked']=e['path'] in tracked
    game=json.loads((ROOT/'content/game.json').read_text());catalog=json.loads((ROOT/'assets/catalog.json').read_text());archive=json.loads((ROOT/'assets/catalog-archive.json').read_text())
    edges=[];missing=[]
    def edge(source,target,kind,ident=None):
        target=os.path.normpath(target).replace('\\','/');exists=(ROOT/target).is_file()
        x={'source':source,'target':target,'kind':kind,'exists':exists}
        if ident:x['id']=ident
        edges.append(x)
        if not exists:missing.append(x)
    for a in game['assets']:
        for key in ('image','file','harvestAnimation'):
            if a.get(key):edge('content/game.json',a[key],key,a['id'])
    for source,doc in [('assets/catalog.json',catalog),('assets/catalog-archive.json',archive)]:
        for a in doc['assets']:edge(source,'assets/'+a['file'],'catalog',a['id'])
    character=json.loads((ROOT/'assets/ant-colony/characters/character.json').read_text())
    for id,a in character['variants'].items():edge('assets/ant-colony/characters/character.json','assets/ant-colony/characters/'+a['file'],'character',id)
    for e in records:
        for uri in e.get('model',{}).get('externalUris',[]):
            if not re.match(r'^[a-z]+:',uri):edge(e['path'],str(pathlib.Path(e['path']).parent/uri),'model-dependency')
    literal=[];globs=[]
    for source,s in texts:
        for lineno,line in enumerate(s.splitlines(),1):
            if 'import.meta.glob'in line:globs.append({'source':source,'line':lineno,'text':line.strip()})
            for match in re.finditer(r'''["'`]([^"'`\n]*assets/[^"'`\n]+)["'`]''',line):
                token=match.group(1).split('?')[0]
                if '*'in token or '${'in token or not pathlib.Path(token).suffix:continue
                target=os.path.normpath(str(pathlib.Path(source).parent/token)) if token.startswith('.') else token.lstrip('/')
                literal.append({'source':source,'line':lineno,'target':target,'exists':(ROOT/target).is_file()})
    known_catalog={a['id'] for a in catalog['assets']};known_defs={a['id'] for a in game['definitions']}
    maps=[];map_errors=[]
    for p in sorted((ROOT/'assets/maps').rglob('*.utcmap')):
        m=json.loads(p.read_text());counts=collections.Counter(s['asset'] for s in m.get('stamps',[]));defs=collections.Counter(s['definition'] for s in m.get('entities',[]));path=p.relative_to(ROOT).as_posix()
        maps.append({'path':path,'name':m.get('name'),'size':m['size'],'stamps':sum(counts.values()),'scenery':dict(counts),'entities':dict(defs)})
        map_errors += [{'map':path,'kind':'scenery','id':id} for id in counts if id not in known_catalog]
        map_errors += [{'map':path,'kind':'definition','id':id} for id in defs if id not in known_defs]
    groups=collections.defaultdict(list)
    for e in records:
        if e['bytes'] and not e['path'].startswith('original/'):groups[e['sha256']].append(e)
    duplicates=[{'sha256':h,'bytesEach':es[0]['bytes'],'paths':[e['path'] for e in es]} for h,es in groups.items() if len(es)>1]
    duplicates.sort(key=lambda d:d['bytesEach']*(len(d['paths'])-1),reverse=True)
    def census(es):
        counter=collections.Counter(e['ext'] for e in es)
        return {'files':len(es),'bytes':sum(e['bytes'] for e in es),'trackedFiles':sum(e['tracked'] for e in es),'extensions':dict(counter.most_common())}
    roots={k:census([e for e in records if e['path'].split('/')[0]==k]) for k in sorted(set(e['path'].split('/')[0] for e in records))}
    asset_folders={k:census([e for e in records if e['path'].startswith(k+'/')]) for k in sorted(set('/'.join(e['path'].split('/')[:2]) for e in records if e['path'].startswith('assets/') and e['path'].count('/')>=2))}
    models=[e for e in records if e['path'].startswith('assets/') and 'model'in e];icons=[e for e in records if e['path'].startswith('assets/ui/icons/') and e['ext']=='.png'];declared_images={a['image'] for a in game['assets'] if a.get('image')}
    linked_models={e['target'] for e in edges if e['source']in('content/game.json','assets/catalog.json') and pathlib.Path(e['target']).suffix in ('.glb','.gltf')}
    source_models=[e for e in records if e['path'].startswith('experiments/') and e['ext']=='.glb']
    model_pairs=[{'runtime':e['path'],'exactSourceExports':[s['path'] for s in source_models if s['sha256']==e['sha256']]} for e in models if e['ext']=='.glb']
    summary={'schemaVersion':1,'generatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':{
      'inventory':'All regular files in assets/, experiments/, inspiration/, original/, output/; recognized media elsewhere. No symlinks followed.',
      'excluded':excluded,'byteMeaning':'Logical file bytes, not allocated disk blocks. No claim about GPU memory or download size.',
      'referenceLimits':'Direct content/catalog/character/model URI edges; four map stamp/entity IDs; literal source paths and glob locations. Dynamic paths, script outputs and semantic use need human review.',
      'modelLimits':'GLTF JSON/accessor census, stored triangles before scene instancing. Not a full GLTF or Blender validation.',
      'alphaLimits':'PNG headers everywhere; actual 8-bit non-interlaced alpha decoded only under assets/ui/. No perceptual quality judgement.'},
      'total':census(records),'roots':roots,'assetFolders':asset_folders,'gameAssets':len(game['assets']),'catalogEntries':len(catalog['assets']),'archiveCatalogEntries':len(archive['assets']),
      'models':{'inAssets':len(models),'bytes':sum(e['bytes'] for e in models),'linkedByCurrentContentOrCatalog':len(linked_models),
      'globIncludedWithoutCurrentContentOrCatalog':[e['path'] for e in models if e['path'] not in linked_models],
      'sourceExportHashMatches':sum(bool(p['exactSourceExports']) for p in model_pairs),'glbCount':len(model_pairs)},
      'icons':{'pngCount':len(icons),'declaredImagePaths':len(declared_images),'notDeclaredInContent':[e['path'] for e in icons if e['path'] not in declared_images],
      'dimensionViolations':[{'path':e['path'],'image':e.get('image')} for e in icons if not e.get('image') or e['image']['width']!=e['image']['height'] or e['image']['width']>128]},
      'runtimeSourceFiles':[e['path'] for e in records if e['path'].startswith('assets/') and e['ext'] in ('.blend','.blend1')],
      'woodlandImages':[{'path':e['path'],**e.get('image',{})} for e in records if e['path'].startswith('assets/ui/woodland/') and e['ext']=='.png'],
      'missingStructuredFiles':missing,'mapReferenceErrors':map_errors,'maps':maps,'inspectionErrors':[{'path':e['path'],'error':e['inspectionError']} for e in records if 'inspectionError'in e],
      'duplicateGroupCount':len(duplicates),'duplicateBytesBeyondFirst':sum(d['bytesEach']*(len(d['paths'])-1) for d in duplicates),
      'largestDuplicateGroups':duplicates[:12],'globs':globs}
    out.mkdir(parents=True,exist_ok=True)
    with gzip.open(out/'inventory.jsonl.gz','wt') as f:
        for e in records:f.write(json.dumps(e,separators=(',',':'))+'\n')
    dump(out/'summary.json',summary);dump(out/'references.json',{'structured':edges,'literal':literal});dump(out/'duplicates.json',duplicates);dump(out/'model-source-matches.json',model_pairs)
    print(json.dumps({'report':str(out),'total':summary['total'],'roots':roots,'missingStructuredFiles':missing,'mapErrors':map_errors,'icons':summary['icons'],'models':summary['models'],'inspectionErrors':summary['inspectionErrors']},indent=2))

if __name__=='__main__':run()
