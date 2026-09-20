"""Lossless decoder for supplied model ODFs (bounds + uncompressed R8 volume DDS).

DDS X/Y/Z axes correspond to model X/Z/Y, as sampled by TerrainCommon.fxh.
No voxelization, gamma conversion, padding or resampling is performed.
"""
import gzip
import hashlib
import json
import math
import struct
from pathlib import Path


def decode_odf(raw):
    if len(raw) < 152 or raw[24:28] != b'DDS ':
        raise ValueError('Expected six bounds floats followed by a DDS volume')
    bounds = struct.unpack_from('<6f', raw)
    if not all(math.isfinite(v) for v in bounds) or any(bounds[i] >= bounds[i+3] for i in range(3)):
        raise ValueError('Invalid ODF bounds')
    h = struct.unpack_from('<31I', raw, 28)
    if h[0] != 124 or h[1] != 0x801007:
        raise ValueError('Unsupported ODF DDS header')
    if tuple(h[18:26]) != (32, 64, 0, 8, 255, 0, 0, 0):
        raise ValueError('Expected uncompressed R8 ODF')
    if tuple(h[26:]) != (0x1008, 0x200000, 0, 0, 0) or h[4] != 0 or any(h[6:18]):
        raise ValueError('Unsupported ODF caps, mipmaps or row pitch')
    width, height, depth = h[3], h[2], h[5]
    if min(width, height, depth) < 1 or max(width, height, depth) > 4096:
        raise ValueError('Invalid ODF dimensions')
    voxels = raw[152:]
    if len(voxels) != width*height*depth:
        raise ValueError('ODF byte count disagrees with dimensions')
    return {'boundsMin': list(bounds[:3]), 'boundsMax': list(bounds[3:]),
            'size': [width, height, depth], 'axes': ['x', 'z', 'y'],
            'format': 'r8-unorm', 'colorSpace': 'linear'}, voxels


def export_odf(source: Path, destination: Path):
    raw = source.read_bytes()
    metadata, voxels = decode_odf(raw)
    metadata.update(source='Media/odf/'+source.name,
                    sourceSha256=hashlib.sha256(raw).hexdigest(),
                    decodedSha256=hashlib.sha256(voxels).hexdigest(), decodedBytes=len(voxels))
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(gzip.compress(voxels, mtime=0))
    destination.with_suffix('.json').write_text(json.dumps(metadata, indent=2)+'\n')
    return metadata


def plant_occlusion_classes(folder: Path, names):
    """Resolve active XML elements only; commented-out settings are not defaults."""
    import xml.etree.ElementTree as ET
    def load(name, seen=()):
        if name in seen:raise ValueError('Cyclic plant inheritance')
        path=folder/(name+'.xml')
        root=ET.fromstring('<root>'+path.read_text()+'</root>')
        parent=root.find('_parent')
        attrs,sources=load(parent.get('File'),(*seen,name)) if parent is not None else ({},[])
        sources=[*sources,{'source':str(path.name),'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}]
        own=root.find('PlantBrand/Occlusion')
        if own is not None:attrs={**attrs,**own.attrib}
        return attrs,sources
    return {name:{'attributes':attrs,'inheritance':sources} for name in names for attrs,sources in [load(name)]}


def export_occlusion_sprite(source: Path, destination: Path):
    from PIL import Image
    import io
    raw=source.read_bytes();image=Image.open(io.BytesIO(raw)).convert('RGBA')
    red=image.getchannel('R').tobytes()
    destination.write_bytes(gzip.compress(red,mtime=0))
    metadata={'source':'TextureCache/'+source.name,'sourceSha256':hashlib.sha256(raw).hexdigest(),
              'size':list(image.size),'channel':'r','colorSpace':'linear',
              'decodedSha256':hashlib.sha256(red).hexdigest(),'decodedBytes':len(red)}
    destination.with_suffix('.json').write_text(json.dumps(metadata,indent=2)+'\n')
    return metadata
