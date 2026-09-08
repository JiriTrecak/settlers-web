"""Focused regressions for exact color extraction, save watching, and safe render publication."""
import json
from pathlib import Path
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

import numpy as np
from PIL import Image

import palette
import studio


class PaletteTests(unittest.TestCase):
    def test_exact_pixel_robust_pixel_and_linear_conversion(self):
        with tempfile.TemporaryDirectory() as temp:
            path=Path(temp)
            pixels=np.full((7,7,3),[128,64,32],dtype=np.uint8)
            pixels[3,3]=[255,0,127]
            Image.fromarray(pixels).save(path/'reference.png')
            (path/'samples.json').write_text(json.dumps({'wood':{'u':.5,'v':.5,'radius':2}}))
            sample=palette.extract(path)['samples']['wood']
            self.assertEqual(sample['pixel']['rgb'],[255,0,127])
            self.assertEqual(sample['representative']['rgb'],[128,64,32])
            self.assertAlmostEqual(sample['representative']['linear_rgb'][0],.2158605,places=6)
            self.assertEqual((sample['x'],sample['y']),(3,3))
            self.assertTrue((path/'samples.png').exists())


class QueueTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.root=Path(self.temp.name)
        self.asset=self.root/'test-hall';self.asset.mkdir()
        (self.asset/'asset.json').write_text(json.dumps({'name':'Test hall','blend':'hall.blend','recipe':'model.py'}))
        (self.asset/'hall.blend').write_bytes(b'original')
        self.patcher=patch.object(studio,'ASSETS',self.root);self.patcher.start()
        self.app=studio.Studio('test-hall')

    def tearDown(self):
        self.app.close()
        if self.app.watch_thread:self.app.watch_thread.join(3)
        self.patcher.stop();self.temp.cleanup()

    def test_save_is_debounced_and_does_not_repeat(self):
        calls=[];event=threading.Event()
        self.app.request=lambda *args:(calls.append(args),event.set())
        self.app.watch()
        (self.asset/'hall.blend').write_bytes(b'saved edit')
        self.assertTrue(event.wait(4),'Save did not trigger a render')
        time.sleep(.9)
        self.assertEqual(calls,[('render',)])

    def test_save_during_render_keeps_queued_build(self):
        self.app.running=True
        self.app.request('build')
        self.app.request('render')
        self.assertEqual(self.app.pending,('build','saved'))

    def test_failed_render_retains_last_good_image(self):
        saved=b'last good image'
        (self.asset/'render.png').write_bytes(saved)
        self.app._blender=lambda *args:(_ for _ in ()).throw(RuntimeError('render failed'))
        with self.assertRaisesRegex(RuntimeError,'render failed'):
            self.app.run('render')
        self.assertEqual((self.asset/'render.png').read_bytes(),saved)
        self.assertEqual(list(self.asset.glob('.render-*.png')),[])

    def test_asset_and_recipe_paths_cannot_escape(self):
        with self.assertRaises(ValueError):studio.asset_path('../outside')
        config={'name':'Test','blend':'../../other.blend','recipe':'model.py'}
        (self.asset/'asset.json').write_text(json.dumps(config))
        with self.assertRaises(ValueError):studio.config_for(self.asset)


if __name__=='__main__':unittest.main()
