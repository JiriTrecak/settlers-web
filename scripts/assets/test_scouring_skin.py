"""Independent fixtures for pose decoding; optional checks against authorized caches."""
import math, struct, unittest
from pathlib import Path
import numpy as np
from scouring_skin import skeleton, pose_record


def string(s):
    b=s.encode()+b'\0';return struct.pack('<H',len(b))+b

def matrix(rows):return struct.pack('<16f',*np.array(rows).T.flatten())

class PoseTests(unittest.TestCase):
    def test_source_quaternion_convention_and_rigid_model_space(self):
        identity=np.eye(4);child=np.array([[0,-1,0,2],[1,0,0,3],[0,0,1,4],[0,0,0,1]],dtype=float)
        data=bytearray(struct.pack('<I',0))
        for i,(name,parent,local) in enumerate([('RootNode',-2,identity),('Shield',0,child)]):
            data+=struct.pack('<h',parent)+string(name)+matrix(local)+struct.pack('<III',i,0,0)
        table=len(data);data+=struct.pack('<I',2)+string('RootNode')+string('Shield')
        data+=struct.pack('<I',1)+string('stand')+struct.pack('<ffI',1,30,2)
        for i in range(2):
            data+=struct.pack('<I',i)
            # Source quaternion is conjugated relative to glTF's +90 Z rotation.
            values=[(0,0,0,1),(1,1,1,0),(0,0,0,0)] if i==0 else [(0,0,-math.sqrt(.5),math.sqrt(.5)),(1,1,1,0),(2,3,4,0)]
            for value in values:data+=struct.pack('<I8f',1,0,0,0,0,*value)
        data+=struct.pack('<H',0)
        nodes,world,clips=skeleton(bytes(data),table)
        np.testing.assert_allclose(world[1],child,atol=1e-6)
        self.assertEqual(clips[0]['name'],'stand')
        record={'stride':28,'nv':1,'nodeName':'Shield','positions':[(2,4,4)]}
        positions,normals=pose_record(bytes(data),record,nodes,world,[(0,1,0)])
        # A rigid vertex already in model space must not be transformed twice.
        np.testing.assert_allclose(positions,[[2,4,4]],atol=1e-6)
        np.testing.assert_allclose(normals,[[0,1,0]],atol=1e-6)
        with self.assertRaises((AssertionError,struct.error)):
            skeleton(bytes(data[:-12]),table)

    def test_supplied_neutral_skeletons(self):
        root=Path.home()/'Library/Application Support/CrossOver/Bottles/Steam/drive_c/Program Files (x86)/Steam/steamapps/common/The Scouring/MeshCache'
        if not root.exists():self.skipTest('Authorized source pack is not installed')
        for name,count in [('goblin',35),('troll',30),('wolf',25),('bandit_a',29),('bandit_b',29)]:
            with self.subTest(name=name):
                data=(root/('units_neutral_'+name)).read_bytes()
                table=data.find(b'RootNode\0',data.find(b'RootNode\0')+1)-6
                nodes,world,clips=skeleton(data,table)
                self.assertEqual(len(nodes),count)
                self.assertIn('stand',[c['name'] for c in clips]);self.assertIn('run',[c['name'] for c in clips])
                # The pelvis is not animated in stand: its decoded quaternion must
                # independently agree with the stored native frame orientation.
                index=next(i for i,n in enumerate(nodes) if n['name'].endswith('Pelvis'))
                local=np.linalg.inv(world[nodes[index]['parent']])@world[index]
                np.testing.assert_allclose(local[:3,:3],nodes[index]['local'][:3,:3],atol=2e-4)

if __name__=='__main__':unittest.main()
