"""Materialize role-named canonical sources into a disposable Blender workspace.
The work directory is never an editable master. Build manifests map tool-facing
names to canonical resource roles, retaining provider inputs without duplicates.
"""
from pathlib import Path
import json, shutil
ROOT=Path(__file__).resolve().parents[2]

def canonical_builds(root=ROOT):
    for folder in sorted((root/'art/assets').iterdir()):
        manifest=folder/'asset.json'
        if not manifest.is_file():continue
        asset=json.loads(manifest.read_text())
        for r in asset['resources']:
            if r['role']=='build':
                filename='build'+('' if r['index']==1 else '_'+str(r['index']))+'.json'
                yield asset,json.loads((folder/filename).read_text())

def resource_path(root,ref):
    folder=root/'art/assets'/ref['asset']
    if folder.parent.resolve()!=(root/'art/assets').resolve():raise ValueError('Invalid asset reference')
    asset=json.loads((folder/'asset.json').read_text())
    r=next(r for r in asset['resources'] if r['role']==ref['role'] and r['index']==ref['index'])
    return folder/(r['role']+('' if r['index']==1 else '_'+str(r['index']))+'.'+r['format'])

def materialize(name,category='buildings',root=ROOT):
    builds=list(canonical_builds(root))
    selected=next(((a,b) for a,b in builds if a['id']==name or b['slug']==name and b['category']==category),None)
    if not selected:raise ValueError('No canonical build source: '+name)
    # Historical recipes share woodland inputs; reconstruct those names only in
    # an ignored build area, keeping one authoritative copy in each asset package.
    for asset,build in builds:
        target=root/'.asset-work/build'/build['category']/build['slug']
        if not target.resolve().is_relative_to((root/'.asset-work/build').resolve()):raise ValueError('Invalid build directory')
        target.mkdir(parents=True,exist_ok=True)
        for logical,ref in build['files'].items():
            dest=target/logical
            if not dest.resolve().is_relative_to(target.resolve()):raise ValueError('Invalid build filename')
            dest.parent.mkdir(parents=True,exist_ok=True)
            source=resource_path(root,ref)
            # copy2 preserves timestamps, making repeated preparation inexpensive.
            if not dest.exists() or dest.stat().st_size!=source.stat().st_size or dest.stat().st_mtime_ns!=source.stat().st_mtime_ns:
                shutil.copy2(source,dest)
    asset,build=selected
    target=root/'.asset-work/build'/build['category']/build['slug']
    (target/'.canonical-id').write_text(asset['id'])
    return target

if __name__=='__main__':
    import sys
    print(materialize(sys.argv[1],sys.argv[2] if len(sys.argv)>2 else 'buildings'))
