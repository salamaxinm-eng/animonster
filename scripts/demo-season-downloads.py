#!/usr/bin/env python3
"""Prepare immutable MP4 season downloads with chapters and embedded subtitles."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile


def media_file(root,prefix,url):
    if not isinstance(url,str) or not url.startswith(prefix+'/') or not re.fullmatch(r'[a-zA-Z0-9/_-]+\.(m3u8|vtt|mp4)',url[len(prefix)+1:]):
        raise ValueError('Unexpected media path')
    result=(root/'published'/url[len(prefix)+1:]).resolve(strict=True)
    if not result.is_relative_to((root/'published').resolve()):raise ValueError('Media outside publication')
    return result


def chapter_metadata(chapters):
    return ';FFMETADATA1\n'+''.join(f'[CHAPTER]\nTIMEBASE=1/1000\nSTART={round(c["start"]*1000)}\nEND={round(c["stop"]*1000)}\ntitle=Серия {int(c["episode"])}\n' for c in chapters)


def verify(file,season):
    info=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_format','-show_streams','-show_chapters','-of','json',str(file)],text=True))
    codecs={stream['codec_name'] for stream in info['streams']}
    if not {'h264','aac'}.issubset(codecs) or abs(float(info['format']['duration'])-season['duration'])>1:
        raise ValueError('Combined MP4 duration or codecs mismatch')
    if season.get('subtitles') and 'mov_text' not in codecs:raise ValueError('Embedded subtitles missing')
    chapters=info.get('chapters',[])
    if len(chapters)!=len(season['chapters']):raise ValueError('MP4 chapters missing')
    for expected,actual in zip(season['chapters'],chapters):
        if abs(expected['start']-float(actual['start_time']))>.05 or abs(expected['stop']-float(actual['end_time']))>.05:
            raise ValueError('MP4 chapter boundary mismatch')
    if file.stat().st_size<=0:raise ValueError('Empty MP4')


def build(root,prefix):
    catalog_file=root/'catalog.json';catalog=json.loads(catalog_file.read_text());season=catalog.get('season')
    if not season or len(season['chapters'])<2:raise ValueError('Continuous season is not ready')
    release=season['voices'][0]['master'].split('/')[-2]
    if not re.fullmatch(r'season-[a-f0-9]{16}',release):raise ValueError('Unexpected season identity')
    folder=media_file(root,prefix,season['voices'][0]['master']).parent
    season['id']=release
    with tempfile.TemporaryDirectory(prefix='season-offline-',dir=root/'work') as work:
        work=Path(work);metadata=work/'chapters.ffmetadata';metadata.write_text(chapter_metadata(season['chapters']),encoding='utf-8')
        for voice in season['voices']:
            if not re.fullmatch(r'[a-z0-9_-]+',voice['id']):raise ValueError('Invalid voice')
            for quality in voice['qualities']:
                height=quality['height']
                if height not in (360,480,720,1080):raise ValueError('Invalid quality')
                playlist=media_file(root,prefix,quality['url'])
                if playlist.parent!=folder:raise ValueError('Season playlist outside its folder')
                target=folder/f'{voice["id"]}-{height}-season-offline.mp4'
                if not target.exists():
                    estimated=sum(next(q['download']['size'] for q in next(v for v in e['voices'] if v['id']==voice['id'])['qualities'] if q['height']==height) for e in catalog['episodes'] if any(c['episode']==e['number'] for c in season['chapters']))
                    disk=shutil.disk_usage(root)
                    if disk.free-estimated*1.15<disk.total*.20:raise RuntimeError('Combined download must leave 20% disk free')
                    temp=work/target.name
                    args=['ffmpeg','-hide_banner','-loglevel','warning','-nostdin','-y','-threads','2','-protocol_whitelist','file,crypto,data','-i',str(playlist)]
                    subtitles=season.get('subtitles',[])
                    if subtitles:args+=['-i',str(media_file(root,prefix,subtitles[0]['url']))]
                    metadata_index=2 if subtitles else 1
                    args+=['-f','ffmetadata','-i',str(metadata),'-map','0:v:0','-map','0:a:0']
                    if subtitles:args+=['-map','1:0','-c:s','mov_text','-metadata:s:s:0','language=rus','-metadata:s:s:0','title=Русские · DEEP','-disposition:s:0','0']
                    args+=['-c:v','copy','-c:a','copy','-map_metadata',str(metadata_index),'-map_chapters',str(metadata_index),'-movflags','+faststart',str(temp)]
                    subprocess.run(args,check=True)
                    verify(temp,season);temp.chmod(0o640);temp.rename(target)
                else:verify(target,season)
                quality['download']={'url':prefix+'/'+release+'/'+target.name,'size':target.stat().st_size}
                temp_catalog=catalog_file.with_suffix('.downloads.tmp');temp_catalog.write_text(json.dumps(catalog,ensure_ascii=False,indent=2));temp_catalog.chmod(0o644);os.replace(temp_catalog,catalog_file)
                print(f'Ready combined download: {voice["id"]}, {height}p, {target.stat().st_size} bytes, {len(season["chapters"])} episodes',flush=True)


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--root',type=Path,default=Path('/var/lib/animonster-media/enhanced'));parser.add_argument('--public-prefix',default='/demo-media/enhanced');args=parser.parse_args()
    root=args.root.resolve()
    with (root/'import.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX);build(root,args.public_prefix.rstrip('/'))


if __name__=='__main__':main()
