"""Import the authorized reference environment from the supplied Xc4 mesh cache.

Uses Pillow (including its BC7 decoder). No Blender re-meshing or texture baking:
positions, UVs, indices, material ranges and packed foliage metadata are retained.
This is a deliberately bounded decoder for the listed cache assets, not a general
Xc4 importer. Validate record counts/ranges and fail closed on a different format.
"""
from pathlib import Path
import argparse, gzip, hashlib, io, itertools, json, math, re, struct
import xml.etree.ElementTree as ET
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SOURCE = Path.home() / 'Library/Application Support/CrossOver/Bottles/Steam/drive_c/Program Files (x86)/Steam/steamapps/common/The Scouring'
EXPECTED = {'plants_fir_a': [(25,32,32),(624,662,40)],
            'plants_fir_b': [(577,618,40),(480,480,32),(25,32,32)],
            'plants_fir_small_a': [(144,144,32),(9,8,32)],
            'plants_stump_fir_a': [(729,657,32),(25,32,32)],
            'grass_grass_messy': [(18,10,28)], 'grass_grass_low': [(18,10,28)],
            'grass_daisy': [(37,26,28)]}

EXPECTED.update({
'grass_daisy': [(37, 26, 28)],
'grass_water_leaves_a': [(32, 16, 28)],
'grass_water_leaves_b': [(12, 6, 28)],
'grass_grass_high_a': [(18, 10, 28)],
'grass_grass_high_b': [(18, 10, 28)],
'grass_grass_messy': [(18, 10, 28)],
'grass_grass_low': [(18, 10, 28)],
'plants_gold_vein_a': [(756, 790, 40), (25, 32, 32)],
'plants_gold_vein_b': [(733, 710, 40), (25, 32, 32)],
'plants_small_rock_a': [(65, 56, 32), (25, 32, 32)],
'plants_small_rock_b': [(59, 50, 32), (25, 32, 32)],
'plants_small_rock_c': [(77, 66, 32), (25, 32, 32)],
'plants_fir_a': [(25, 32, 32), (624, 662, 40)],
'plants_fir_b': [(577, 618, 40), (480, 480, 32), (25, 32, 32)],
'plants_fir_small_a': [(144, 144, 32), (9, 8, 32)],
'plants_lying_snag_a': [(662, 546, 32), (45, 64, 32), (214, 304, 32)],
'plants_lying_snag_b': [(318, 296, 32), (382, 612, 32)],
'plants_lying_snag_c': [(636, 592, 32), (45, 64, 32), (78, 113, 32)],
'plants_lying_snag_d': [(1021, 926, 32), (138, 200, 32), (186, 261, 32)],
'plants_bush_a': [(296, 310, 32)],
'plants_bush_b': [(284, 299, 32)],
'models_mountain_chunk_a': [(841, 1472, 28)],
'models_mountain_chunk_b': [(884, 1496, 28)],
'models_mountain_chunk_c': [(806, 1438, 28)],
'models_ruins_blocks_04': [(753, 581, 28)],
'models_ruins_blocks_06': [(386, 295, 28), (26, 14, 28)],
'models_ruins_blocks_08': [(145, 118, 28)],
'models_ruins_blocks_03': [(623, 480, 28)],
'models_wooden_bridge_small': [(2439, 2290, 28), (8, 6, 28), (233, 297, 28), (162, 256, 28)],
'models_ruins_column_11': [(187, 123, 28)],
'models_monument_01': [(1063, 1435, 28)],
})

EXPECTED.update({
'models_dungeon_entrance':[(1011,706,28),(248,156,28),(4,2,28),(81,128,28)],
'models_neutral_outpost':[(2484,2056,28),(13,8,28),(66,58,28),(81,128,28),(174,336,28)],
'models_goblin_hut':[(2561,2224,28),(54,80,28),(288,168,28),(10,8,28),(457,623,28),(650,976,28)],
'models_neutral_bandit_tent':[(20,24,28),(415,475,28),(702,702,28),(55,50,28),(52,64,28)],
'models_neutral_troll_cave':[(1616,2172,28),(5,3,28),(25,32,28)],
'models_neutral_wolf_den_a':[(1134,1508,28),(25,32,28),(5,3,28),(310,616,28)],
'models_neutral_wolf_den_b':[(1732,2346,28),(25,32,28),(5,3,28),(622,1196,28)],
})

EXPECTED.update({
'units_neutral_goblin':[(2354,2787,36),(2945,3303,36),(3558,3980,36)],
'units_neutral_troll':[(2055,2809,36)],
'units_neutral_wolf':[(1095,1268,36)],
'units_neutral_bandit_a':[(102,136,28),(1743,2248,36)],
'units_neutral_bandit_b':[(102,136,28),(2012,2466,36)],
})

def sha(data): return hashlib.sha256(data).hexdigest()
def norm(v):
    d = math.sqrt(sum(x*x for x in v)) or 1
    return [x/d for x in v]

def mesh_records(data, expected):
    records=[]
    for offset in range(4+struct.unpack_from('<I',data)[0],len(data)-12):
        nv,nt,stride=struct.unpack_from('<III',data,offset)
        if (nv,nt,stride) not in expected: continue
        start=offset+12; end=start+nv*stride+nt*6
        if end+4>=len(data): continue
        indices=struct.unpack_from('<'+'H'*nt*3,data,start+nv*stride)
        if max(indices)>=nv: continue
        ng=struct.unpack_from('<I',data,end)[0]
        if not 1<=ng<=3 or end+4+ng*12>len(data): continue
        groups=[struct.unpack_from('<III',data,end+4+i*12) for i in range(ng)]
        if sum(g[2] for g in groups)!=nt or any(g[1]!=sum(p[2] for p in groups[:i]) for i,g in enumerate(groups)): continue
        vertices=[data[start+i*stride:start+(i+1)*stride] for i in range(nv)]
        positions=[struct.unpack_from('<3f',v) for v in vertices]
        assert all(math.isfinite(x) and abs(x)<100 for p in positions for x in p)
        node_names=[]
        for at in range(max(0,offset-160),offset-79):
            n=struct.unpack_from('<H',data,at)[0]
            if not 1<=n<=100 or at+2+n+64+15!=offset:continue
            raw=data[at+2:at+2+n]
            if raw[-1]==0 and all(32<=c<127 for c in raw[:-1]):node_names.append(raw[:-1].decode())
        assert len(node_names)==1,(offset,'Missing source node association')
        records.append(dict(nodeName=node_names[0],hidden=bool(data[offset-1]),offset=offset,nv=nv,nt=nt,stride=stride,vertices=vertices,positions=positions,indices=indices,groups=groups))
    assert [(r['nv'],r['nt'],r['stride']) for r in records]==expected, 'Unexpected geometry records'
    return records

class GLB:
    def __init__(self):
        self.blob=bytearray()
        self.doc={'asset':{'version':'2.0','generator':'UTC authorized Scouring cache importer'},'buffers':[{}],
                  'bufferViews':[],'accessors':[],'meshes':[],'nodes':[],'materials':[],
                  'textures':[],'images':[],'samplers':[{'magFilter':9729,'minFilter':9987,'wrapS':10497,'wrapT':10497}],
                  'scenes':[{'nodes':[0]}],'scene':0}
    def view(self,data):
        while len(self.blob)%4:self.blob.append(0)
        i=len(self.doc['bufferViews']);self.doc['bufferViews'].append({'buffer':0,'byteOffset':len(self.blob),'byteLength':len(data)})
        self.blob.extend(data);return i
    def accessor(self,rows,typ,component=5126):
        rows=[list(r) if isinstance(r,(tuple,list)) else [r] for r in rows]
        data=struct.pack('<'+('f' if component==5126 else 'H')*sum(map(len,rows)),*(v for r in rows for v in r))
        a={'bufferView':self.view(data),'componentType':component,'count':len(rows),'type':typ,
           'min':[min(r[i] for r in rows) for i in range(len(rows[0]))],
           'max':[max(r[i] for r in rows) for i in range(len(rows[0]))]}
        self.doc['accessors'].append(a);return len(self.doc['accessors'])-1
    def texture(self,data):
        i=len(self.doc['images']);self.doc['images'].append({'bufferView':self.view(data),'mimeType':'image/png'})
        self.doc['textures'].append({'sampler':0,'source':i});return i
    def save(self,path):
        self.doc['buffers'][0]['byteLength']=len(self.blob)
        encoded=json.dumps(self.doc,separators=(',',':')).encode();encoded+=b' '*((-len(encoded))%4)
        binary=bytes(self.blob);binary+=b'\0'*((-len(binary))%4)
        data=struct.pack('<III',0x46546c67,2,28+len(encoded)+len(binary))+struct.pack('<II',len(encoded),0x4e4f534a)+encoded+struct.pack('<II',len(binary),0x004e4942)+binary
        path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(data);return data

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--source',type=Path,default=DEFAULT_SOURCE);parser.add_argument('--only',nargs='+',choices=list(EXPECTED));args=parser.parse_args()
    provenance={'source':'The Scouring; supplied with permission for reference tests','meshes':{},'textures':{}}
    if args.only:
        provenance=json.loads((ROOT/'art/references/trees-water-study/import-manifest.json').read_text())
    texdir=ROOT/'assets/textures/reference/scouring';texdir.mkdir(parents=True,exist_ok=True)
    from scouring_cube import export_cube, export_brdf
    provenance['reflectionCube']=export_cube(args.source/'TextureCache/env_default__d_ggxrefl.dds',texdir/'reflection-cube.bin')
    provenance['brdfLut']=export_brdf(args.source/'TextureCache/env_ibl_brdf_lut.dds',texdir/'brdf-lut.bin')
    from scouring_occlusion import export_odf, plant_occlusion_classes, export_occlusion_sprite
    provenance['plantOcclusion']=plant_occlusion_classes(args.source/'Media/classes/plants',[k.removeprefix('plants_') for k in EXPECTED if k.startswith('plants_')])
    provenance['occlusionSprite']=export_occlusion_sprite(args.source/'TextureCache/env_radial_sprite__s_d.dds',texdir/'occlusion-sprite.bin')
    provenance['occlusionVolumes']={}
    # Only import volumes associated with our declared models. Missing volumes
    # are recorded explicitly; the pack does not supply one for every object.
    for key in EXPECTED:
        if not key.startswith('models_'):continue
        name=key.removeprefix('models_');odf=args.source/'Media/odf'/name
        provenance['occlusionVolumes'][key]=export_odf(odf,texdir/'occlusion'/f'{name}.bin') if odf.exists() else None
    def texture(name):
        key=Path(name).with_suffix('').as_posix().replace('/','_')
        source=args.source/'TextureCache'/f'{key}.dds';raw=source.read_bytes()
        im=Image.open(io.BytesIO(raw)).convert('RGBA');out=io.BytesIO();im.save(out,format='PNG');data=out.getvalue()
        (texdir/f'{key}.png').write_bytes(data)
        if key.startswith('tiles_'):
            # Browser canvas readback loses RGB precision when alpha stores roughness/height.
            # Gzip raw RGBA retains those independent channels exactly.
            (texdir/f'{key}.rgba.bin').write_bytes(gzip.compress(im.tobytes(),mtime=0))
        provenance['textures'][key]={'sourceSha256':sha(raw),'size':list(im.size),'outputSha256':sha(data)}
        return data
    def terrain_class(name):
        xml=ET.fromstring('<root>'+(args.source/'Media/classes/terraintypes'/f'{name}.xml').read_text()+'</root>')
        parent=xml.find('_parent');attrs,pre=terrain_class(parent.get('File')) if parent is not None else ({},{})
        own=xml.find('TerrainType');attrs.update(own.attrib)
        if own.find('_prebuild') is not None:pre.update(own.find('_prebuild').attrib)
        return attrs,pre
    def grass_class(name):
        xml=ET.fromstring('<root>'+(args.source/'Media/classes/grass'/f'{name}.xml').read_text()+'</root>')
        parent=xml.find('_parent');attrs=grass_class(parent.get('File')) if parent is not None else {}
        attrs.update(xml.find('GrassBrand').attrib);return attrs
    provenance['grass']={name.removeprefix('grass_'):grass_class(name.removeprefix('grass_')) for name in EXPECTED if name.startswith('grass_')}
    provenance['terrain']={}
    for tile in ['grass','dirt','soil','rockgrass','rock','stones','waterbed','graysoil','darkrock','darksoil','darkgrass']:
        attrs,pre=terrain_class(tile)
        for key in ['TextureAlbedoRoughness','TextureNormalHeight','TextureDisplacement']:
            if key in attrs:texture(attrs[key])
        provenance['terrain'][tile]={'attributes':attrs,'prebuild':pre}
    # Level-sized source color cache; preserve decoded channels for ground tint.
    ground_raw=(args.source/'Media/levels/level_eldenvale.dds').read_bytes()
    ground=Image.open(io.BytesIO(ground_raw)).convert('RGBA');assert ground.size==(240,464)
    ground_out=ROOT/'art/references/scouring-maps/eldenvale/ground-color.rgba'
    ground_out.write_bytes(ground.tobytes())
    provenance['groundColor']={'source':'Media/levels/level_eldenvale.dds','sourceSha256':sha(ground_raw),'size':list(ground.size),'rgbaSha256':sha(ground.tobytes())}
    texture('env/macro_color__d.tga')
    texture('env/water_waves__d_a_uncmp.tga')
    texture('env/water_caustics__d_uncmp.tga')
    # Four source layers in one atlas keep the terrain below WebGL sampler limits.
    # Channels are unchanged: AR = albedo/roughness, NH = normal/height.
    for channel in ['ar','nh']:
        atlas=Image.new('RGBA',(2048,2048))
        for i,tile in enumerate(['grass','dirt','soil','rockgrass']):
            im=Image.open(texdir/f'tiles_{tile}_{channel}__d_a.png')
            assert im.size==(1024,1024)
            atlas.paste(im,((i%2)*1024,(i//2)*1024))
        atlas.save(texdir/f'terrain-{channel}.png')
    for name,expected in EXPECTED.items():
        if args.only and name not in args.only:continue
        data=(args.source/'MeshCache'/name).read_bytes();xml=ET.fromstring(data[4:4+struct.unpack_from('<I',data)[0]].rstrip(b'\0'))
        source_mats=list(xml.findall('Material'));names=[m.get('Name','01 - Default') for m in source_mats]
        # The cache's material table can differ from the XML order (fir_a does).
        tables=[]
        for order in itertools.permutations(names):
            pattern=struct.pack('<I',len(order))+b''.join(struct.pack('<H',len(n)+1)+n.encode()+b'\0' for n in order)
            if pattern in data:tables.append(order)
        if not tables and len(source_mats)==1 and source_mats[0].get('Name') is None:
            # An unnamed XML material overrides the sole embedded material regardless of its DCC name.
            candidates=[]
            for offset in range(4+struct.unpack_from('<I',data)[0] if name.startswith('units_') else max(0,len(data)-512),len(data)-6):
                count,n=struct.unpack_from('<IH',data,offset)
                if count!=1 or not 2<=n<=128 or offset+6+n>len(data):continue
                value=data[offset+6:offset+6+n]
                if value[-1]==0 and all(32<=c<127 for c in value[:-1]):candidates.append(value[:-1].decode())
            assert len(candidates)==1,(name,'Ambiguous unnamed material table')
            names=candidates;tables=[tuple(candidates)]
        if not tables:
            for order in itertools.permutations([*names,'']):
                pattern=struct.pack('<I',len(order))+b''.join(struct.pack('<H',len(n)+1)+n.encode()+b'\0' for n in order)
                if data.count(pattern)==1:tables.append(order)
        assert len(tables)==1,(name,'Material table missing/ambiguous')
        ordered=[source_mats[names.index(n)] if n else None for n in tables[0]]
        records=mesh_records(data,expected)
        pose=None;clips=None
        if name.startswith('units_'):
            from scouring_skin import skeleton,pose_record
            pattern=struct.pack('<I',len(tables[0]))+b''.join(struct.pack('<H',len(n)+1)+n.encode()+b'\0' for n in tables[0])
            assert data.count(pattern)==1
            frame_offset=data.index(pattern)+len(pattern)
            assert data[frame_offset]==1
            pose_nodes,pose_world,clips=skeleton(data,frame_offset+1)
            pose=lambda record,normals:pose_record(data,record,pose_nodes,pose_world,normals)
            # The cache contains upgrade bodies together; the map specifies no tier.
            for record in records:
                if record['nodeName'] in ('archer_tier2','archer_tier3'):record['hidden']=True
        g=GLB();is_tree=name.startswith('plants_fir');height=max(p[1] for r in records for p in r['positions'])
        g.doc['nodes']=[{'name':'reference-root','children':[],'extras':{'referenceEnvironment':True}},
                        {'name':'reference-crown','children':[]}];g.doc['nodes'][0]['children']=[1]
        for mat in ordered:
            if mat is None:
                g.doc['materials'].append({'name':'_height helper','extras':{'heightHelper':True}});continue
            alpha=mat.get('IsAlphaKill')=='true';plant=mat.find('PlantMaterial');under=mat.get('Name')=='underlay'
            model=mat.find('ModelMaterial');grass=mat.find('GrassMaterial')
            texture_index=g.texture(texture(mat.get('AlbedoMap')))
            material={'name':'Scouring '+mat.get('Name',name),'pbrMetallicRoughness':{'baseColorTexture':{'index':texture_index},'metallicFactor':0,'roughnessFactor':1},
                      'doubleSided':mat.get('IsTwoSided')=='true','alphaMode':'MASK' if alpha else 'BLEND' if mat.get('Blending')=='alpha' else 'OPAQUE',
                      'extras':{'referenceEnvironment':True,'underlay':under,'sourceShader':'plant' if plant is not None or (model is None and grass is None and name.startswith('plants_')) else 'grass' if grass is not None else 'model','foliage':plant is not None and plant.get('IsFoliage')=='true','backsideLighting':float(mat.get('BacksideLighting','0')),'sourceAttributes':dict(mat.attrib),
                                'sourceShaderAttributes':dict(next(iter(mat)).attrib) if len(mat) else {}}}
            if alpha:material['alphaCutoff']=.4
            if mat.get('NormalMap'):material['normalTexture']={'index':g.texture(texture(mat.get('NormalMap')))}
            if mat.get('ShadingMap'):material['extras']['shadingTexture']=g.texture(texture(mat.get('ShadingMap')))
            g.doc['materials'].append(material)
        for ri,r in enumerate(records):
            if r['hidden'] and r['nodeName']!='_height':continue
            colored=r['stride'] in (32,40);uv_offset=16 if colored else 12;normal_offset=uv_offset+8
            uv=[struct.unpack_from('<2f',v,uv_offset) for v in r['vertices']]
            # D3DCOLOR is stored BGRA in little-endian cache records.
            normals=[norm([v[normal_offset+i]/127.5-1 for i in [2,1,0]]) for v in r['vertices']]
            metadata=[[v[12+i]/255 for i in [2,1,0,3]] for v in r['vertices']] if colored else [[.5,.5,.5,0] for v in r['vertices']]
            occlusion=[[v[normal_offset+3]/255]*3 for v in r['vertices']] if colored else [[1,1,1]]*r['nv']
            # Cache normal.w stores vertex occlusion; RGB metadata is NOT albedo.
            # Keep it separate for the runtime crown-normal / leaf-wind shader.
            positions=r['positions']
            if pose:positions,normals=pose(r,normals)
            attrs={'POSITION':g.accessor(positions,'VEC3'),'NORMAL':g.accessor(normals,'VEC3'),
                   'TEXCOORD_0':g.accessor(uv,'VEC2'),'_LEAF':g.accessor(metadata,'VEC4'),
                   'COLOR_0':g.accessor(occlusion,'VEC3')}
            for material,start,count in r['groups']:
                ix=r['indices'][start*3:(start+count)*3]
                if g.doc['materials'][material]['extras'].get('heightHelper'):
                    g.doc['nodes'][0]['extras'].setdefault('heightHelpers',[]).append({'positions':r['positions'],'indices':ix});continue
                prim={'attributes':attrs,'indices':g.accessor(ix,'SCALAR',5123),'material':material}
                mi=len(g.doc['meshes']);g.doc['meshes'].append({'primitives':[prim]})
                ni=len(g.doc['nodes']);under=g.doc['materials'][material]['extras']['underlay']
                g.doc['nodes'].append({'name':f'{name}-{ri}-{tables[0][material]}','mesh':mi,'extras':{'referenceEnvironment':True,'underlay':under,'plantHeight':height}})
                g.doc['nodes'][0 if under else 1]['children'].append(ni)
        if is_tree:
            animations=[]
            crown=[p for r in records if any(not g.doc['materials'][mat]['extras']['underlay'] for mat,_,_ in r['groups']) for p in r['positions']]
            def fallen_y(p,angle):return p[1]*math.cos(angle)-p[2]*math.sin(angle)
            def lift(angle):return max(0.,-min(fallen_y(p,angle) for p in crown))
            for clip,times,angles in [('hit',[0,.12,.32,.6],[0,.025,-.015,0]),('fall',[0,.4,1.2,1.8],[0,.1,.9,math.pi/2]),('decay',[0,6],[math.pi/2,math.pi/2])]:
                inp=g.accessor(times,'SCALAR');out=g.accessor([[math.sin(a/2),0,0,math.cos(a/2)] for a in angles],'VEC4')
                a={'name':clip,'samplers':[{'input':inp,'output':out,'interpolation':'LINEAR'}],'channels':[{'sampler':0,'target':{'node':1,'path':'rotation'}}]}
                if clip in ['fall','decay']:
                    heights=[lift(angle) for angle in angles]
                    if clip=='decay':heights[-1]=-max(fallen_y(p,math.pi/2) for p in crown)-.2
                    s=g.accessor([[0,y,0] for y in heights],'VEC3');a['samplers'].append({'input':inp,'output':s});a['channels'].append({'sampler':1,'target':{'node':1,'path':'translation'}})
                animations.append(a)
            g.doc['animations']=animations
        slug=name.removeprefix('units_').removeprefix('models_').replace('plants_','').replace('grass_grass_','grass_').replace('_','-');folder='trees' if name.startswith('plants_fir') or name.startswith('plants_stump') else 'grass' if name.startswith('grass_') else 'props'
        path=ROOT/f'assets/models/environment/{folder}/reference-{slug}/model.glb';output=g.save(path)
        provenance['meshes'][name]={'sourceSha256':sha(data),'output':str(path.relative_to(ROOT)),'outputSha256':sha(output),'triangles':sum(count for r in records if not r['hidden'] for mat,_,count in r['groups'] if ordered[mat] is not None),'primitives':len(g.doc['meshes']),
                                  'materialOrder':tables[0],'records':[{k:r[k] for k in ['offset','nv','nt','stride','groups','nodeName','hidden']} for r in records],
                                  'sourceClips':clips,'animation':'Stored stand first-key pose (static reference), tier 1' if pose else 'Static source geometry; UTC hit/fall/decay adapter clips' if is_tree else None}
        print(name,provenance['meshes'][name]['triangles'],'triangles')
    report=ROOT/'art/references/trees-water-study/import-manifest.json';report.write_text(json.dumps(provenance,indent=2)+'\n')

if __name__=='__main__':main()
