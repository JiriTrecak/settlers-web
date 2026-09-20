import struct
import unittest
from pathlib import Path
from scouring_occlusion import decode_odf, plant_occlusion_classes


def fixture():
    header=[0]*31
    header[:7]=[124,0x801007,3,2,0,4,0]
    header[18:26]=[32,64,0,8,255,0,0,0]
    header[26:]=[0x1008,0x200000,0,0,0]
    return struct.pack('<6f',-1,-2,-3,1,2,3)+b'DDS '+struct.pack('<31I',*header)+bytes(range(24))


class OcclusionTests(unittest.TestCase):
    def test_preserves_linear_voxels_and_axis_order(self):
        info,data=decode_odf(fixture())
        self.assertEqual(info['size'],[2,3,4])
        self.assertEqual(info['axes'],['x','z','y'])
        self.assertEqual(info['boundsMin'],[-1,-2,-3])
        self.assertEqual(data,bytes(range(24)))

    def test_rejects_truncation_unknown_formats_and_invalid_bounds(self):
        for data in [fixture()[:-1],fixture()+b'\0',struct.pack('<f',float('nan'))+fixture()[4:]]:
            with self.assertRaises(ValueError):decode_odf(data)
        for offset,value in [(28,123),(28+21*4,32),(28+6*4,1),(28+27*4,0),(28+3*4,0)]:
            data=bytearray(fixture());struct.pack_into('<I',data,offset,value)
            with self.assertRaises(ValueError):decode_odf(data)

    def test_xml_inherits_active_settings_and_ignores_comments(self):
        from tempfile import TemporaryDirectory
        with TemporaryDirectory() as temp:
            root=Path(temp)
            (root/'large.xml').write_text('<PlantBrand><Occlusion Intensity="0.75" Size="(18;18)" /></PlantBrand>')
            (root/'variant.xml').write_text('<_parent File="large"/><PlantBrand/>')
            (root/'small.xml').write_text('<PlantBrand><!--<Occlusion Intensity="0.15"/>--></PlantBrand>')
            result=plant_occlusion_classes(root,['large','variant','small'])
            self.assertEqual(result['variant']['attributes'],result['large']['attributes'])
            self.assertEqual(result['small']['attributes'],{})
            self.assertEqual(len(result['variant']['inheritance']),2)

    def test_all_supplied_volumes_match_stored_dimensions(self):
        folder=Path.home()/'Library/Application Support/CrossOver/Bottles/Steam/drive_c/Program Files (x86)/Steam/steamapps/common/The Scouring/Media/odf'
        if not folder.exists():self.skipTest('Authorized pack not installed')
        files=sorted(folder.iterdir());self.assertEqual(len(files),46)
        for path in files:
            with self.subTest(name=path.name):
                raw=path.read_bytes();info,data=decode_odf(raw)
                # Independent byte retention; no row flipping or color conversion.
                self.assertEqual(data,raw[152:])
                if path.name=='wooden_bridge_small':
                    self.assertEqual(info['size'],[103,198,15])
                    self.assertEqual(len(data),305910)

if __name__=='__main__':unittest.main()
