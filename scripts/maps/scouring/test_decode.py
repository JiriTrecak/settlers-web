import struct, unittest
from decode import decode, DecodeError

def pack(fmt,*v):return struct.pack('<'+fmt,*v)
def string(s):return pack('H',len(s)+1)+s.encode()+b'\0'
def strings(items):return pack('I',len(items))+b''.join(map(string,items))
def fixture():
    b=pack('II',20260715,0)+string('env/macro_color__d.tga')+bytes([1,0,0])
    b+=b''.join(map(string,['day','day_to_night','night','night_to_day']))+pack('I3f',1,12,1,1)
    b+=strings(['grass_messy'])+strings(['fir_a'])+strings([])
    b+=pack('5I',1,1,2,2,2)+string('soil')+string('grass')+bytes([255])*625
    b+=pack('2401H',*([0x3e3e]*2401))+pack('2I',0,0)+bytes(625)
    b+=pack('IIH3f8B',1,1,0,0,15,0,128,128,128,255,0,0,0,51)
    b+=pack('4f',-8,-8,15,16)+bytes([0,1,0,0,0,0,2])*16+bytes([0])
    b+=pack('IHI',1,0,2)+bytes([0,0,0,0,0,51,0,0,0,0,255,255,128,255,0,0])
    b+=pack('IIII',0,8,1,0)
    return b

class DecodeTests(unittest.TestCase):
    def test_retains_exact_samples_instances_and_spatial_index(self):
        doc,blobs=decode(fixture())
        self.assertEqual(doc['counts'],dict(plants=1,models=0,blocks=1,grass=2))
        self.assertEqual(doc['grid']['heightSize'],[49,49])
        self.assertEqual(doc['plantBlockIndex'],[[0]])
        self.assertEqual(doc['plants'][0]['scale'],1)
        self.assertEqual(blobs['grass-00-grass_messy.bin'],bytes([0,0,0,0,0,51,0,0,0,0,255,255,128,255,0,0]))
        self.assertEqual(blobs['height.u16'],pack('2401H',*([0x3e3e]*2401)))
    def test_fails_on_truncated_structural_sections(self):
        for n in [0,4,80,1000,len(fixture())-1]:
            with self.subTest(n=n),self.assertRaises((DecodeError,UnicodeDecodeError)):decode(fixture()[:n])
    def test_rejects_mismatched_grass_block_and_lookup(self):
        original=fixture()
        for offset in [len(original)-32,len(original)-4]:
            b=bytearray(original);b[offset]=4
            with self.assertRaises(DecodeError):decode(bytes(b))
    def test_preserves_unknown_tail_instead_of_discarding_it(self):
        doc,blobs=decode(fixture()+b'unknown region data')
        self.assertEqual(blobs['unresolved-tail.bin'],b'unknown region data')
        self.assertTrue(doc['unresolved'])
if __name__=='__main__':unittest.main()
