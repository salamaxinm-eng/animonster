import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

if os.name=='nt':sys.modules['fcntl']=types.SimpleNamespace(LOCK_EX=2,flock=lambda *_:None)
spec=importlib.util.spec_from_file_location('downloads',Path(__file__).resolve().parents[1]/'scripts/demo-season-downloads.py')
downloads=importlib.util.module_from_spec(spec);spec.loader.exec_module(downloads)


class SeasonDownloads(unittest.TestCase):
    def fixture(self,root):
        release='season-0123456789abcdef';folder=root/'published'/release;folder.mkdir(parents=True);(root/'work').mkdir()
        (folder/'voice-360.m3u8').write_text('#EXTM3U\n#EXT-X-ENDLIST\n');(folder/'voice-master.m3u8').write_text('#EXTM3U\n')
        chapter_list=[{'episode':1,'start':0,'stop':10},{'episode':2,'start':10,'stop':20}]
        season={'duration':20,'chapters':chapter_list,'voices':[{'id':'voice','title':'Voice','master':'/demo-media/enhanced/'+release+'/voice-master.m3u8','qualities':[{'height':360,'url':'/demo-media/enhanced/'+release+'/voice-360.m3u8'}]}]}
        catalog={'version':1,'title':'Demo','season':season,'episodes':[{'number':number,'voices':[{'id':'voice','qualities':[{'height':360,'download':{'size':4}}]}]} for number in (1,2)]}
        (root/'catalog.json').write_text(json.dumps(catalog));return season

    def probe(self,season):
        return json.dumps({'format':{'duration':'20'},'streams':[{'codec_name':'h264'},{'codec_name':'aac'}],'chapters':[{'start_time':str(c['start']),'end_time':str(c['stop'])} for c in season['chapters']]})

    def test_portable_mp4_has_chapters_and_publishes_only_after_verification(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);season=self.fixture(root)
            def ffmpeg(args,**kw):
                self.assertIn('+faststart',args);self.assertIn('-map_chapters',args);Path(args[-1]).write_bytes(b'MP4')
            with patch.object(downloads.subprocess,'run',side_effect=ffmpeg),patch.object(downloads.subprocess,'check_output',return_value=self.probe(season)),patch.object(downloads.shutil,'disk_usage',return_value=types.SimpleNamespace(total=1000,free=900)):
                downloads.build(root,'/demo-media/enhanced')
            published=json.loads((root/'catalog.json').read_text())['season'];self.assertEqual(published['id'],'season-0123456789abcdef')
            file=published['voices'][0]['qualities'][0]['download'];self.assertEqual(file['size'],3);self.assertTrue(downloads.media_file(root,'/demo-media/enhanced',file['url']).is_file())
            self.assertIn('START=10000',downloads.chapter_metadata(season['chapters']));self.assertIn('title=Серия 2',downloads.chapter_metadata(season['chapters']))

    def test_invalid_mp4_cannot_be_advertised(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);season=self.fixture(root);broken=json.loads(self.probe(season));broken['chapters']=[]
            with patch.object(downloads.subprocess,'run',side_effect=lambda args,**kw:Path(args[-1]).write_bytes(b'bad')),patch.object(downloads.subprocess,'check_output',return_value=json.dumps(broken)),patch.object(downloads.shutil,'disk_usage',return_value=types.SimpleNamespace(total=1000,free=900)):
                with self.assertRaisesRegex(ValueError,'chapters'):downloads.build(root,'/demo-media/enhanced')
            self.assertNotIn('download',json.loads((root/'catalog.json').read_text())['season']['voices'][0]['qualities'][0]);self.assertFalse(list((root/'published').rglob('*.mp4')))

    def test_external_and_traversal_paths_are_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);self.fixture(root)
            for url in ('https://example.org/file.mp4','/demo-media/enhanced/../private.mp4','/demo-media/enhanced/a/../../private.mp4'):
                with self.assertRaises(ValueError):downloads.media_file(root,'/demo-media/enhanced',url)


if __name__=='__main__':unittest.main()
