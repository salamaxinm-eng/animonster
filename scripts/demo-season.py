#!/usr/bin/env python3
"""Remux a season into continuous HLS timestamps without re-encoding."""
import argparse
import fcntl
import hashlib
import json
import os
import re
import subprocess
import tempfile
from pathlib import Path


def clock(seconds):
    ms=round(seconds*1000)
    return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02}.{ms%1000:03}'


def seconds(stamp):
    h,m,s=stamp.split(':');return int(h)*3600+int(m)*60+float(s)


def media_file(root,prefix,url):
    if not url.startswith(prefix+'/') or not re.fullmatch(r'[a-zA-Z0-9/_-]+\.(m3u8|vtt|jpg|mp4)',url[len(prefix)+1:]):
        raise ValueError('Unexpected media path')
    file=(root/'published'/url[len(prefix)+1:]).resolve(strict=True)
    if not file.is_relative_to((root/'published').resolve()):raise ValueError('Media outside publication')
    return file


def playlist(root,prefix,url):
    text=media_file(root,prefix,url).read_text()
    if '#EXT-X-ENDLIST' not in text:raise ValueError('Incomplete playlist')
    rows=[];duration=None
    for line in text.splitlines():
        if line.startswith('#EXTINF:'):duration=float(line.split(':')[1].rstrip(','))
        elif line and not line.startswith('#'):
            if duration is None or not re.fullmatch(r'\d+\.ts',line):raise ValueError('Unexpected segment')
            rows.append([duration,url.rsplit('/',1)[0]+'/'+line]);duration=None
    if not rows:raise ValueError('Empty playlist')
    return rows


def media_duration(file):
    return float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',str(file)],text=True))


def remux(folder,name,files,lengths,kind,work):
    playlist_file=folder/(name+'.m3u8')
    if playlist_file.exists() and '#EXT-X-ENDLIST' in playlist_file.read_text():return
    target=folder/name;target.mkdir(exist_ok=True,mode=0o750)
    with tempfile.TemporaryDirectory(prefix='season-concat-',dir=work) as temp:
        concat=Path(temp)/'inputs.ffconcat'
        concat.write_text('ffconcat version 1.0\n'+''.join("file '"+str(file).replace("'","'\\''")+f"'\nduration {length:.6f}\n" for file,length in zip(files,lengths)))
        subprocess.run(['ffmpeg','-hide_banner','-loglevel','warning','-nostdin','-y','-f','concat','-safe','0','-i',str(concat),'-map','0:v:0' if kind=='video' else '0:a:0','-an' if kind=='video' else '-vn','-c','copy','-avoid_negative_ts','make_zero','-f','hls','-hls_time','6','-hls_playlist_type','vod','-hls_flags','independent_segments','-hls_base_url',name+'/','-hls_segment_filename',str(target/'%05d.ts'),str(playlist_file)],check=True)
    playlist_file.chmod(0o640)
    for segment in target.glob('*.ts'):segment.chmod(0o640)


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--root',type=Path,default=Path('/var/lib/animonster-media/enhanced'));p.add_argument('--public-prefix',default='/demo-media/enhanced');a=p.parse_args()
    root=a.root.resolve();prefix=a.public_prefix.rstrip('/')
    with (root/'import.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        publish(root,prefix)


def publish(root,prefix):
    catalog_file=root/'catalog.json';catalog=json.loads(catalog_file.read_text());episodes=catalog['episodes']
    if len(episodes)<2:return
    # A season only exposes voices and qualities present in every ready episode.
    voice_ids=set(v['id'] for v in episodes[0]['voices'])
    for e in episodes[1:]:voice_ids &= {v['id'] for v in e['voices']}
    identity=hashlib.sha256(('continuous-timestamps-v2'+json.dumps(episodes,sort_keys=True)).encode()).hexdigest()[:16]
    folder=root/'published'/('season-'+identity);folder.mkdir(exist_ok=True,mode=0o750);base=prefix+'/'+folder.name
    if any(v.get('master','').startswith(base+'/') for v in catalog.get('season',{}).get('voices',[])):
        return
    chapters=[];references=[];offset=0.0
    for e in episodes:
        release=e['voices'][0]['master'].rsplit('/',1)[0]
        ref=playlist(root,prefix,release+'/s0-v1080/index.m3u8')
        source=next(q['download']['url'] for q in e['voices'][0]['qualities'] if q['height']==1080)
        length=media_duration(media_file(root,prefix,source))
        if abs(length-e['duration'])>1:raise ValueError('Episode length mismatch')
        references.append(ref);chapters.append({'episode':e['number'],'start':offset,'stop':offset+length});offset+=length
    voices=[]
    for vid in sorted(voice_ids):
        selected=[next(v for v in e['voices'] if v['id']==vid) for e in episodes]
        heights=set(q['height'] for q in selected[0]['qualities'])
        for v in selected[1:]:heights &= {q['height'] for q in v['qualities']}
        lengths=[chapter['stop']-chapter['start'] for chapter in chapters]
        audio_files=[media_file(root,prefix,next(q['download']['url'] for q in v['qualities'] if q['height']==1080)) for v in selected]
        if any(abs(media_duration(file)-length)>.5 for file,length in zip(audio_files,lengths)):raise ValueError('Audio length mismatch')
        remux(folder,vid+'-audio',audio_files,lengths,'audio',root/'work')
        common=['#EXTM3U','#EXT-X-VERSION:3',f'#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="{vid}",DEFAULT=YES,AUTOSELECT=YES,URI="{vid}-audio.m3u8"']
        adaptive=common.copy();qualities=[]
        for height in sorted(heights):
            video_name=f'video-{height}.m3u8';groups=[]
            for v,ref in zip(selected,references):
                rows=playlist(root,prefix,v['master'].rsplit('/',1)[0]+f'/s0-v{height}/index.m3u8')
                if len(rows)!=len(ref):raise ValueError('Video segment count mismatch')
                drift=0.0
                for actual,expected in zip(rows[:-1],ref[:-1]):
                    drift+=actual[0]-expected[0]
                    if abs(drift)>=.05:raise ValueError('Video boundaries do not match')
                if abs(rows[-1][0]-ref[-1][0])>=.25:raise ValueError('Video tail mismatch')
                groups.append([[expected[0],actual[1]] for actual,expected in zip(rows,ref)])
            video_files=[media_file(root,prefix,next(q['download']['url'] for q in v['qualities'] if q['height']==height)) for v in selected]
            remux(folder,video_name.removesuffix('.m3u8'),video_files,lengths,'video',root/'work')
            bandwidth={360:1200000,480:1800000,720:3500000,1080:8000000}[height]
            variant=[f'#EXT-X-STREAM-INF:BANDWIDTH={bandwidth},RESOLUTION={round(height*16/9/2)*2}x{height},AUDIO="audio"',video_name]
            name=f'{vid}-{height}.m3u8';(folder/name).write_text('\n'.join(common+variant)+'\n');(folder/name).chmod(0o640);adaptive+=variant
            qualities.append({'height':height,'url':base+'/'+name})
        if qualities:
            name=vid+'-master.m3u8';(folder/name).write_text('\n'.join(adaptive)+'\n');(folder/name).chmod(0o640)
            voices.append({'id':vid,'title':selected[0]['title'],'master':base+'/'+name,'qualities':qualities})
    season={'id':folder.name,'duration':offset,'chapters':chapters,'voices':voices}
    for kind in ('subtitles','preview'):
        contents=['WEBVTT',''];available=True
        for e,chapter in zip(episodes,chapters):
            tracks=e.get('subtitles',[]);url=(tracks[0]['url'] if tracks else None) if kind=='subtitles' else e.get('preview')
            if not url:available=False;break
            text=media_file(root,prefix,url).read_text()
            for block in re.split(r'\n\s*\n',text):
                match=re.search(r'(\d+:\d\d:\d\d\.\d+) --> (\d+:\d\d:\d\d\.\d+)([^\n]*)\n(.*)',block,re.S)
                if not match:continue
                start=seconds(match[1]);stop=min(seconds(match[2]),chapter['stop']-chapter['start'])
                if start>=stop:continue
                body=match[4]
                if kind=='preview':
                    if not re.fullmatch(r'[a-zA-Z0-9_-]+\.jpg#xywh=\d+,\d+,\d+,\d+\s*',body):raise ValueError('Invalid preview')
                    body=url.rsplit('/',1)[0]+'/'+body.strip()
                contents.extend([f'{clock(chapter["start"]+start)} --> {clock(chapter["start"]+stop)}{match[3]}',body,''])
        if available:
            name=kind+'.vtt';(folder/name).write_text('\n'.join(contents));(folder/name).chmod(0o640)
            if kind=='preview':season['preview']=base+'/'+name
            else:season['subtitles']=[{'title':'Русские · DEEP','language':'ru','url':base+'/'+name}]
    if not voices:raise ValueError('No common season voice')
    catalog['season']=season;tmp=catalog_file.with_suffix('.season.tmp');tmp.write_text(json.dumps(catalog,ensure_ascii=False,indent=2));tmp.chmod(0o644);os.replace(tmp,catalog_file)
    print(f'Continuous season ready: {len(chapters)} episodes, {offset:.3f}s, {len(voices)} voices',flush=True)


if __name__=='__main__':main()
