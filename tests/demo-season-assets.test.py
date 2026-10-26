import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

# File locking is Linux infrastructure; these tests exercise the publication
# algorithm on both developer Windows machines and the Linux media server.
if os.name == 'nt':
    sys.modules['fcntl']=types.SimpleNamespace(LOCK_EX=2,flock=lambda *_:None)
spec=importlib.util.spec_from_file_location('season',Path(__file__).resolve().parents[1]/'scripts/demo-season.py')
season=importlib.util.module_from_spec(spec);spec.loader.exec_module(season)


class SeasonAssets(unittest.TestCase):
    def fixture(self,root):
        episodes=[]
        for number,length in ((1,12),(2,20)):
            folder=root/'published'/f'ep-{number}';folder.mkdir(parents=True)
            base=f'/demo-media/enhanced/ep-{number}'
            for name in ('s0-v1080','s0-v360','a-original'):
                target=folder/name;target.mkdir();(target/'00000.ts').write_bytes(b'encoded segment')
                (target/'index.m3u8').write_text(f'#EXTM3U\n#EXTINF:{length},\n00000.ts\n#EXT-X-ENDLIST\n')
            (folder/'sub.vtt').write_text('WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nHello\n')
            (folder/'preview.vtt').write_text('WEBVTT\n\n00:00:00.000 --> 00:00:10.000\npreview.jpg#xywh=0,0,160,90\n')
            for height in (360,1080):(folder/f'original-{height}.mp4').write_text(str(length))
            voices=[{'id':'original','title':'Original','master':base+'/master.m3u8','qualities':[{'height':h,'url':base+f'/original-{h}.m3u8','download':{'url':base+f'/original-{h}.mp4','size':2}} for h in (360,1080)]}]
            episodes.append({'number':number,'title':f'Episode {number}','duration':length,'voices':voices,'subtitles':[{'title':'Russian','language':'ru','url':base+'/sub.vtt'}],'preview':base+'/preview.vtt'})
        (root/'work').mkdir()
        value={'version':1,'title':'Test season','episodes':episodes};(root/'catalog.json').write_text(json.dumps(value));return value

    def build(self,root,native=False):
        def fake_remux(folder,name,files,lengths,kind,work,stream_index=None):
            self.assertEqual(len(files),2);self.assertEqual(sum(lengths),32)
            if native and kind=='audio':self.assertEqual(stream_index,2)
            target=folder/name;target.mkdir(exist_ok=True);(target/'00000.ts').write_bytes(b'joined')
            (folder/(name+'.m3u8')).write_text(f'#EXTM3U\n#EXTINF:{sum(lengths)},\n{name}/00000.ts\n#EXT-X-ENDLIST\n')
        def fake_duration(file):
            text=file.read_text()
            if '#EXTM3U' in text:
                return sum(float(line.split(':',1)[1].rstrip(',')) for line in text.splitlines() if line.startswith('#EXTINF:'))
            return float(text)
        with patch.object(season.shutil,'disk_usage',return_value=types.SimpleNamespace(total=1000000,free=900000)),patch.object(sys,'argv',['demo-season.py','--root',str(root)]+(['--source-spec',str(root/'sources.json')] if native else [])),patch.object(season,'media_duration',fake_duration),patch.object(season,'remux',fake_remux),contextlib.redirect_stdout(io.StringIO()):
            season.main()
        return json.loads((root/'catalog.json').read_text())

    def test_continuous_video_audio_subtitles_and_previews_share_one_timeline(self):
        with tempfile.TemporaryDirectory() as path:
            root=Path(path);self.fixture(root);result=self.build(root);data=result['season']
            self.assertEqual(data['duration'],32)
            self.assertEqual(data['chapters'],[{'episode':1,'start':0,'stop':12},{'episode':2,'start':12,'stop':32}])
            folder=root/'published'/data['voices'][0]['master'].split('/')[-2]
            for name in ('video-1080.m3u8','original-audio.m3u8'):
                text=(folder/name).read_text();self.assertNotIn('#EXT-X-DISCONTINUITY',text);self.assertIn('#EXTINF:32',text)
            self.assertIn('00:00:13.000 --> 00:00:15.000',(folder/'subtitles.vtt').read_text())
            self.assertIn('00:00:12.000 --> 00:00:22.000',(folder/'preview.vtt').read_text())
            self.assertIn('/demo-media/enhanced/ep-2/preview.jpg#xywh=',(folder/'preview.vtt').read_text())
            before=(root/'catalog.json').stat().st_mtime_ns;self.build(root);self.assertEqual(before,(root/'catalog.json').stat().st_mtime_ns)

    def test_only_common_qualities_are_advertised(self):
        with tempfile.TemporaryDirectory() as path:
            root=Path(path);catalog=self.fixture(root);catalog['episodes'][1]['voices'][0]['qualities']=catalog['episodes'][1]['voices'][0]['qualities'][1:]
            (root/'catalog.json').write_text(json.dumps(catalog));data=self.build(root)['season']
            self.assertEqual([q['height'] for q in data['voices'][0]['qualities']],[1080])

    def test_invalid_source_length_cannot_publish_a_season(self):
        with tempfile.TemporaryDirectory() as path:
            root=Path(path);self.fixture(root);(root/'published/ep-2/original-1080.mp4').write_text('10')
            with self.assertRaisesRegex(ValueError,'Episode length'):self.build(root)
            self.assertNotIn('season',json.loads((root/'catalog.json').read_text()))


    def test_missing_offline_inputs_require_verified_native_source_spec(self):
        with tempfile.TemporaryDirectory() as path:
            root=Path(path);catalog=self.fixture(root)
            for episode in catalog['episodes']:
                for voice in episode['voices']:
                    for quality in voice['qualities']:
                        quality.pop('download')
                        target=root/'published'/f"ep-{episode['number']}"/f"original-{quality['height']}.m3u8"
                        target.write_text(str(episode['duration']))
            (root/'catalog.json').write_text(json.dumps(catalog))
            with self.assertRaisesRegex(ValueError,'Native source specification'):
                self.build(root)

    def test_space_reserve_is_enforced_before_remuxing(self):
        with patch.object(season.shutil,'disk_usage',return_value=types.SimpleNamespace(total=1000,free=210)):
            with self.assertRaisesRegex(RuntimeError,'20%'):season.require_space(Path('.'),20)
        with patch.object(season.shutil,'disk_usage',return_value=types.SimpleNamespace(total=1000,free=900)):
            season.require_space(Path('.'),20)


    def test_native_mkv_inputs_preserve_voice_selection_without_mp4_copies(self):
        with tempfile.TemporaryDirectory() as path:
            root=Path(path);catalog=self.fixture(root);(root/'downloads').mkdir()
            private=[]
            for e in catalog['episodes']:
                source=root/'downloads'/f"episode-{e['number']}.mkv";source.write_text(str(e['duration']))
                private.append({'number':e['number'],'sources':[{'file':str(source),'voices':[{'id':'original','audio_stream':2}]}]})
                e['voices'][0]['qualities']=[q for q in e['voices'][0]['qualities'] if q['height']==1080]
            (root/'sources.json').write_text(json.dumps({'episodes':private}))
            (root/'catalog.json').write_text(json.dumps(catalog))
            result=self.build(root,native=True)
            self.assertEqual(len(result['season']['chapters']),2)
            self.assertEqual(result['season']['duration'],32)


if __name__=='__main__':unittest.main()
