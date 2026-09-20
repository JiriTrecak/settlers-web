"""Bounded Xc4 skeleton/animation reader for the supplied neutral-unit caches.

Exports the exact first stored `stand` key as a static reference pose. This does
not infer game animation timing, tier selection, or interpolation semantics.
"""
import math, struct
import numpy as np


def skeleton(data, frame_table_offset):
    nodes=[]
    for at in range(4+struct.unpack_from('<I',data)[0],frame_table_offset-82):
        n=struct.unpack_from('<H',data,at)[0]
        if not 2<=n<90:continue
        raw=data[at+2:at+2+n]
        if raw[-1]!=0 or not all(32<=c<127 for c in raw[:-1]):continue
        values=struct.unpack_from('<16f',data,at+2+n)
        if not (max(abs(values[j]) for j in (3,7,11))<1e-7 and values[15]==1 and all(math.isfinite(x) and abs(x)<1000 for x in values)):continue
        index=struct.unpack_from('<H',data,at+2+n+64)[0]
        parent=struct.unpack_from('<h',data,at-2)[0]
        if index!=len(nodes) or not (-2<=parent<index):continue
        nodes.append({'name':raw[:-1].decode(),'parent':parent,'local':np.array(values).reshape(4,4).T})
    assert nodes and nodes[0]['name']=='RootNode'
    p=frame_table_offset
    count=struct.unpack_from('<I',data,p)[0];p+=4
    assert count==len(nodes),(count,len(nodes),'Frame table does not match hierarchy')
    names=[]
    for _ in range(count):
        n=struct.unpack_from('<H',data,p)[0];p+=2
        assert 1<n<100 and data[p+n-1]==0
        names.append(data[p:p+n-1].decode());p+=n
    assert sorted(names)==sorted(n['name'] for n in nodes)
    clips=[];nclips=struct.unpack_from('<I',data,p)[0];p+=4
    assert 1<=nclips<100
    for ci in range(nclips):
        n=struct.unpack_from('<H',data,p)[0];p+=2
        assert 1<n<100
        name=data[p:p+n-1].decode();assert data[p+n-1]==0;p+=n
        duration,fps,tracks=struct.unpack_from('<ffI',data,p);p+=12
        assert 0<fps<=120 and 0<duration<1000 and tracks<=count
        channels={}
        for _ in range(tracks):
            frame=struct.unpack_from('<I',data,p)[0];p+=4
            assert frame<count and names[frame] not in channels
            values=[]
            for channel in range(3):
                nk=struct.unpack_from('<I',data,p)[0];p+=4
                assert 0<nk<10000
                keys=[struct.unpack_from('<8f',data,p+k*32) for k in range(nk)];p+=nk*32
                assert keys[0][0]==0 and all(all(math.isfinite(v) for v in k) for k in keys)
                assert all(a[0]<=b[0] for a,b in zip(keys,keys[1:]))
                values.append(keys)
            channels[names[frame]]=values
        flags=struct.unpack_from('<H',data,p)[0];p+=2
        assert flags in (0,1,256,257),(name,flags)
        clips.append({'flags':flags,'name':name,'duration':duration,'fps':fps,'channels':channels})
    stand=next(c for c in clips if c['name']=='stand')
    world=[]
    for node in nodes:
        channels=stand['channels'].get(node['name'])
        local=node['local']
        if channels:
            q,s,t=[np.array(k[0][4:]) for k in channels]
            # Cache quaternions use the conjugate of glTF/Three's convention.
            # Transpose rotation below; native local matrices independently confirm it.
            q=q/np.linalg.norm(q);x,y,z,w=q
            rotation=np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],
                               [2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],
                               [2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])
            local=np.eye(4);local[:3,:3]=rotation.T@np.diag(s[:3]);local[:3,3]=t[:3]
        world.append(world[node['parent']]@local if node['parent']>=0 else local)
    return nodes,world,[{'name':c['name'],'duration':c['duration'],'fps':c['fps'],'tracks':len(c['channels'])} for c in clips]


def pose_record(data, record, nodes, world, normals):
    """Skin cache positions/normals, or transform a rigid attachment by its frame."""
    import numpy as np
    if record['stride']==36:
        at=record['offset']+12+record['nv']*36+record['nt']*6+4+len(record['groups'])*12
        n=struct.unpack_from('<I',data,at)[0];at+=4
        assert 0<n<=len(nodes)
        inverse=[np.array(struct.unpack_from('<16f',data,at+i*64)).reshape(4,4).T for i in range(n)];at+=n*64
        joints=struct.unpack_from('<'+'H'*n,data,at)
        assert all(i<len(nodes) for i in joints)
        matrices=np.array([world[j]@inv for j,inv in zip(joints,inverse)])
        weights=np.array([list(v[28:32]) for v in record['vertices']],dtype=float)/255
        indices=np.array([list(v[32:36]) for v in record['vertices']])
        assert indices.max()<n and np.all(np.abs(weights.sum(axis=1)-1)<.012)
        # Normalized byte rounding can make four influences add to 254 or 256.
        # Preserve source weights; its shader performs the same weighted sum.
        skin=np.einsum('vi,vijk->vjk',weights,matrices[indices])
    else:
        ni=next(i for i,node in enumerate(nodes) if node['name']==record['nodeName'])
        native=[]
        for node in nodes:
            native.append(native[node['parent']]@node['local'] if node['parent']>=0 else node['local'])
        # Rigid cache positions are pretransformed into model space; only apply
        # the pose delta. Reapplying the DCC transform shrinks the shield 100×.
        skin=np.broadcast_to(world[ni]@np.linalg.inv(native[ni]),(record['nv'],4,4))
    positions=np.array([(*p,1) for p in record['positions']])
    transformed=np.einsum('vij,vj->vi',skin,positions)[:,:3]
    normal=np.einsum('vij,vj->vi',skin[:,:3,:3],np.array(normals))
    normal/=np.maximum(np.linalg.norm(normal,axis=1,keepdims=True),1e-9)
    assert np.isfinite(transformed).all() and abs(transformed).max()<100
    return transformed.tolist(),normal.tolist()
