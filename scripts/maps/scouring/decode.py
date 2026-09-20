"""Audited reader for the supplied Scouring terrain cache (not an approximate generator).

Every record is bounded. Unknown fields remain named raw fields in the output.
A successful decode establishes structure, not renderer fidelity.
"""
from pathlib import Path
import argparse, base64, collections, hashlib, json, math, struct

SOURCE = Path.home() / 'Library/Application Support/CrossOver/Bottles/Steam/drive_c/Program Files (x86)/Steam/steamapps/common/The Scouring'
ROOT = Path(__file__).resolve().parents[3]

class DecodeError(ValueError): pass
class Reader:
    def __init__(self, data): self.data, self.at = data, 0
    def take(self, n):
        if n < 0 or self.at+n > len(self.data): raise DecodeError(f'Truncated record at {self.at}, length {n}')
        out = self.data[self.at:self.at+n]; self.at += n; return out
    def unpack(self, fmt): return struct.unpack('<'+fmt, self.take(struct.calcsize('<'+fmt)))
    def u32(self): return self.unpack('I')[0]
    def u16(self): return self.unpack('H')[0]
    def u8(self): return self.unpack('B')[0]
    def string(self):
        n=self.u16()
        if not 1 <= n <= 1024: raise DecodeError(f'Invalid string length {n} at {self.at-2}')
        s=self.take(n)
        if s[-1] or b'\0' in s[:-1]: raise DecodeError('Invalid terminated string')
        return s[:-1].decode('ascii')
    def strings(self, maximum=256):
        n=self.u32()
        if n>maximum: raise DecodeError(f'Invalid dictionary count {n}')
        return [self.string() for _ in range(n)]

def check(ok, message):
    if not ok: raise DecodeError(message)

def transform(r):
    xyz=list(r.unpack('3f')); packed=list(r.take(8))
    check(all(math.isfinite(v) and abs(v)<10000 for v in xyz),'Invalid transform')
    # BYTEDATA0 uses the same BGRA channel order as Grass.fxs (validated by all block IDs).
    q=[packed[i]/127.5-1 for i in (2,1,0,3)];length=math.sqrt(sum(v*v for v in q))
    return {'position':xyz,'quaternion':[v/length for v in q],'packedQuaternion':packed[:4],'packedUserData':packed[4:7],
            'scale':.25+3.75*packed[7]/255,'packedScale':packed[7]}

def decode(data):
    r=Reader(data); version=r.u32()
    check(version in (20250910,20260715),f'Unsupported terrain version {version}')
    out={'format':'scouring-terrain-interchange-v1','sourceSha256':hashlib.sha256(data).hexdigest(),
         'sourceVersion':version,'sourceTag':r.u32(),'macroTexture':r.string(),'environmentFlags':list(r.take(3)),
         'daytimes':[r.string() for _ in range(4)],'environmentMode':r.u32()}
    if version>=20260715: out['environmentScalars']=list(r.unpack('3f'))
    out['grassTypes']=r.strings();out['plantTypes']=r.strings();out['modelTypes']=r.strings()
    nx,nz,a,b,nlayer=r.unpack('5I')
    check(1<=nx<=128 and 1<=nz<=128 and 1<=nlayer<=64,'Invalid grid dimensions')
    out['grid']={'blocks':[nx,nz],'blockSize':16,'origin':[-nx*8,-nz*8],
                 'maskSize':[nx*24+1,nz*24+1],'heightSize':[nx*48+1,nz*48+1],
                 'headerFields':[a,b]}
    mw,mh=out['grid']['maskSize'];hw,hh=out['grid']['heightSize'];blobs={}
    layers=[]
    for i in range(nlayer):
        name=r.string();layer={'name':name}
        if i:
            layer['mask']=f'layer-{i:02d}-{name}.u8';blobs[layer['mask']]=r.take(mw*mh)
        layers.append(layer)
    out['layers']=layers;out['height']='height.u16';blobs[out['height']]=r.take(hw*hh*2)
    wa,wb=r.unpack('2I');check(wa<=128 and wb<=128,'Invalid auxiliary grid')
    out['auxiliaryGridSize']=[wa,wb];blobs['auxiliary-grid.u16']=r.take(wa*wb*2)
    blobs['terrain-auxiliary.u8']=r.take(mw*mh)
    out['sections']={'plants':r.at}
    chunks=r.u32();check(chunks<65536,'Invalid plant chunks');plants=[]
    for _ in range(chunks):
        n=r.u32();check(n<=2048,'Invalid plant chunk size')
        for _ in range(n):
            t=r.u16();check(t<len(out['plantTypes']),'Invalid plant type')
            plants.append({'type':t,**transform(r)})
    out['plants']=plants;out['sections']['blocks']=r.at
    blocks=[];grass=collections.defaultdict(bytearray);totals=collections.Counter()
    for z in range(nz):
        for x in range(nx):
            wx,wz,lo,hi=r.unpack('4f')
            check((wx,wz)==(-nx*8+x*16,-nz*8+z*16),f'Block position mismatch at {r.at-16}')
            check(math.isfinite(lo) and math.isfinite(hi) and lo<=hi,'Invalid block height bounds')
            sublayers=[]
            for _ in range(16):
                slots=list(r.take(6));n=r.u8()
                check(n<=6 and all(v<nlayer for v in slots[:n]),'Invalid subblock layers')
                sublayers.append(slots[:n])
            flag=r.u8();check(flag in (0,1),'Invalid optional water flag')
            block={'x':x,'z':z,'heightBounds':[lo,hi],'layers':sublayers}
            if flag:
                # 1540-byte optional payload, exact length independently validated on all 73 Eldenvale water blocks.
                # Preserve bytes until its map channels/last float are fully identified.
                key=f'water-block-{x}-{z}.bin';blobs[key]=r.take(1540);block['waterPayload']=key
            ng=r.u32();check(ng<=len(out['grassTypes']),'Invalid grass group count')
            seen=set()
            for _ in range(ng):
                t,n=r.unpack('HI');check(t<len(out['grassTypes']) and t not in seen and n<=65536,'Invalid grass group');seen.add(t)
                raw=r.take(n*8)
                for i in range(n):
                    q=raw[i*8:i*8+8]
                    check(tuple(q[:2])==(x,z),f'Grass block mismatch at {r.at-len(raw)+i*8}')
                grass[t].extend(raw);totals[t]+=n
            blocks.append(block)
    out['blocks']=blocks;out['grass']=[]
    for t,raw in sorted(grass.items()):
        key=f'grass-{t:02d}-{out["grassTypes"][t]}.bin';blobs[key]=bytes(raw)
        out['grass'].append({'type':t,'count':totals[t],'packedInstances':key,'stride':8})
    out['sections']['models']=r.at;models=[];n=r.u32();check(n<1000000,'Invalid model count')
    for _ in range(n):
        name=r.string();check(name in out['modelTypes'],'Unknown model reference');models.append({'type':name,**transform(r)})
    out['models']=models;out['sections']['plantBlockIndex']=r.at
    size=r.u32();end=r.at+size;indices=[]
    for _ in blocks:
        n=r.u32();check(n<=len(plants),'Invalid plant lookup count');ids=list(r.unpack(f'{n}I'))
        check(all(i<len(plants) for i in ids),'Invalid plant lookup ID');indices.append(ids)
    check(r.at==end,'Plant spatial index length mismatch');out['plantBlockIndex']=indices
    out['sections']['unresolvedTail']=r.at
    blobs['unresolved-tail.bin']=r.take(len(data)-r.at)
    out['unresolved']=['Environment header scalar meanings','Auxiliary terrain grids','Water block alpha channel and four trailing payload bytes',
                       'Trailing editor/region data']
    out['counts']={'plants':len(plants),'models':len(models),'blocks':len(blocks),'grass':sum(totals.values())}
    out['blobAudit']={k:{'bytes':len(v),'sha256':hashlib.sha256(v).hexdigest()} for k,v in blobs.items()}
    return out,blobs

def decode_gameplay(data):
    r=Reader(data);version=r.u32();check(version==20260620,f'Unsupported gameplay version {version}')
    starts=[];n=r.u32();check(n<=16,'Invalid player count')
    for _ in range(n):
        x,z,a,b=r.unpack('4i');starts.append({'position':[x/65536,z/65536],'fields':[a,b],'faction':r.string(),'flags':list(r.take(6))})
    sites=[];n=r.u32();check(n<10000,'Invalid neutral-site count')
    for _ in range(n):
        name=r.string();x,z,owner=r.unpack('2iH');sites.append({'type':name,'position':[x/65536,z/65536],'owner':owner})
    check(r.u32()==0,'Nonempty intermediate gameplay section is not decoded')
    units=[];n=r.u32();check(n<100000,'Invalid neutral count')
    for _ in range(n):
        name=r.string();x,z,dx,dz=r.unpack('4i');flags=list(r.take(8))
        units.append({'type':name,'position':[x/65536,z/65536],'direction':[dx/65536,dz/65536],'flags':flags})
    check(r.u32()==0,'Nonempty post-unit gameplay section is not decoded')
    nx,nz=r.unpack('2I');check(0<nx<=4096 and 0<nz<=4096,'Invalid gameplay grid')
    rect=[v/65536 for v in r.unpack('4i')]
    blobs={'gameplay-grid-a.bin':r.take(nx*nz*16),'gameplay-grid-b.bin':r.take(nx*nz*12)}
    tail_offset=r.at;blobs['gameplay-tail.bin']=r.take(len(data)-r.at)
    return {'version':version,'sourceSha256':hashlib.sha256(data).hexdigest(),'starts':starts,'sites':sites,'neutrals':units,
            'gridSize':[nx,nz],'gridRect':rect,'tailOffset':tail_offset,
            'unresolved':['Gameplay grid cell flags','Gameplay trailing rule settings','Faction and neutral behavior mapping']},blobs

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--source',type=Path,default=SOURCE);ap.add_argument('--map',default='level_eldenvale');ap.add_argument('--output',type=Path,default=ROOT/'art/references/scouring-maps/eldenvale');args=ap.parse_args()
    data=(args.source/'Media/levels'/f'{args.map}.tdata').read_bytes();doc,blobs=decode(data)
    gameplay,game_blobs=decode_gameplay((args.source/'Media/levels'/f'{args.map}.gdata').read_bytes());blobs.update(game_blobs)
    args.output.mkdir(parents=True,exist_ok=True)
    for key,raw in blobs.items():(args.output/key).write_bytes(raw)
    (args.output/'terrain.json').write_text(json.dumps(doc,separators=(',',':'))+'\n')
    (args.output/'gameplay.json').write_text(json.dumps(gameplay,indent=2)+'\n')
    print(json.dumps({'map':args.map,**doc['counts'],'unresolved':doc['unresolved']},indent=2))
if __name__=='__main__':main()
