"""Decode the supplied BC7 reflection cube, retaining every authored mip."""
import gzip, hashlib, json, struct
from pathlib import Path
from PIL import Image

def export_brdf(source, destination):
    """Linear RG coefficients; retain DDS row order (shader uses 1-roughness)."""
    raw=source.read_bytes()
    assert raw[:4]==b'DDS ' and struct.unpack_from('<II',raw,12)==(64,64)
    assert struct.unpack_from('<6I',raw,84)==(0,32,0xff0000,0xff00,0xff,0xff000000)
    assert len(raw)==128+64*64*4
    rgba=bytearray(raw[128:])
    for i in range(0,len(rgba),4):rgba[i],rgba[i+2]=rgba[i+2],rgba[i]
    destination.write_bytes(gzip.compress(rgba,mtime=0))
    metadata={'source':source.name,'sourceSha256':hashlib.sha256(raw).hexdigest(),
              'width':64,'height':64,'decodedBytes':len(rgba),
              'decodedSha256':hashlib.sha256(rgba).hexdigest(),'colorSpace':'linear'}
    destination.with_suffix('.json').write_text(json.dumps(metadata,indent=2)+'\n')
    return metadata

def export_cube(source, destination):
    data=source.read_bytes()
    assert data[:4]==b'DDS ' and data[84:88]==b'DX10'
    height,width=struct.unpack_from('<II',data,12)
    levels=struct.unpack_from('<I',data,28)[0]
    fmt,dimension,flags,array,_=struct.unpack_from('<5I',data,128)
    assert (fmt,dimension,flags,array)==(98,3,4,1) and width==height
    offset=148; faces=[]
    for face in range(6):
        mips=[]
        for level in range(levels):
            size=max(1,width>>level); length=((size+3)//4)**2*16
            raw=data[offset:offset+length]; assert len(raw)==length
            rgba=Image.frombytes('RGBA',(size,size),raw,'bcn',(7,'BC7')).tobytes()
            mips.append(rgba);offset+=length
        faces.append(mips)
    assert offset==len(data), (offset,len(data))
    # Mip-major order makes browser-side upload deterministic and allocation small.
    decoded=b''.join(faces[face][level] for level in range(levels) for face in range(6))
    destination.write_bytes(gzip.compress(decoded,mtime=0))
    metadata={'source':source.name,'sourceSha256':hashlib.sha256(data).hexdigest(),
              'size':width,'levels':levels,'faceOrder':['+X','-X','+Y','-Y','+Z','-Z'],
              'decodedSha256':hashlib.sha256(decoded).hexdigest(),'decodedBytes':len(decoded)}
    destination.with_suffix('.json').write_text(json.dumps(metadata,indent=2)+'\n')
    return metadata

if __name__=='__main__':
    import argparse
    p=argparse.ArgumentParser();p.add_argument('source',type=Path);p.add_argument('destination',type=Path)
    a=p.parse_args();print(export_cube(a.source,a.destination))
