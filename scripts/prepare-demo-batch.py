#!/usr/bin/env python3
"""Publish every verified source as shared 1080p HLS, then build the season once."""
import argparse
import fcntl
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import time

HASH='c6e8f23e5e39a27a4ddfcb6ecffc230438c9c0a9'

def write(path,value):
    temp=path.with_suffix('.batch.tmp')
    temp.write_text(json.dumps(value,ensure_ascii=False,indent=2));temp.chmod(0o640);os.replace(temp,path)

def episode_spec(root,record):
    number=int(re.search(r'S04E(\d+)\.',record['name'])[1])
    source=(root/'downloads'/record['name']).resolve(strict=True)
    if not source.is_relative_to((root/'downloads').resolve()) or source.stat().st_size!=record['length']:
        raise ValueError('Source path or size mismatch')
    data=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_chapters','-of','json',str(source)],text=True))
    voices=[]
    for stream in data['streams']:
        if stream['codec_type']!='audio':continue
        tags=stream.get('tags',{});title=tags.get('title','')
        if 'anistar' in title.lower():identity,label='anistar','AniStar · Дубляж'
        elif 'anilibria' in title.lower():identity,label='anilibria','AniLibria · Многоголосая'
        elif tags.get('language')=='jpn':identity,label='original','Японский оригинал'
        else:continue
        voice={'id':identity,'title':label,'audio_stream':stream['index']}
        for chapter in data.get('chapters',[]):
            title=chapter.get('tags',{}).get('title','').lower()
            kind='opening' if title in ('op','opening','опенинг') else 'ending' if title in ('ed','ending','outro','аутро') else None
            if kind:voice[kind]={'start':float(chapter['start_time']),'stop':float(chapter['end_time'])}
        voices.append(voice)
    if {v['id'] for v in voices}!={'anistar','anilibria','original'}:
        raise ValueError('Expected all three source voices')
    subtitles=[{'stream':s['index'],'title':'Русские · DEEP','language':'ru'} for s in data['streams'] if s['codec_type']=='subtitle' and s.get('tags',{}).get('language')=='rus']
    if not subtitles:raise ValueError('Expected Russian subtitles')
    return {'number':number,'title':f'Серия {number}','sources':[{'file':str(source),'voices':voices,'subtitles':subtitles}]}

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--root',type=Path,default=Path('/var/lib/animonster-media/enhanced'))
    p.add_argument('--tools',type=Path,default=Path('/opt/animonster-media'))
    p.add_argument('--timeout',type=int,default=8*3600)
    args=p.parse_args();root=args.root.resolve();tools=args.tools.resolve()
    with (root/'batch-prepare.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        spec=importlib.util.spec_from_file_location('torrent',tools/'demo-torrent.py');torrent=importlib.util.module_from_spec(spec);spec.loader.exec_module(torrent)
        catalog_path=root/'catalog.json';spec_path=root/'specs/rezero.json'
        catalog=json.loads(catalog_path.read_text());private=json.loads(spec_path.read_text())
        entries={e['number']:e for e in private['episodes']};ready={e['number'] for e in catalog['episodes'] if e.get('preview') and len(e['voices'])==3}
        deadline=time.monotonic()+args.timeout;last_log=0
        def execute(script,*options):subprocess.run(['python3',str(tools/script),*options],check=True)
        while time.monotonic()<deadline:
            state=torrent.rpc('torrent-get',{'ids':[HASH],'fields':['id','files','fileStats','rateDownload','errorString']})['torrents'][0]
            numbered=sorted((int(re.search(r'S04E(\d+)\.',f['name'])[1]),i,f,st) for i,(f,st) in enumerate(zip(state['files'],state['fileStats'])))
            expected={n for n,_,_,_ in numbered}
            if expected!=set(range(1,20)):raise ValueError('Unexpected source episode set')
            total=sum(f['length'] for _,_,f,_ in numbered);done=sum(st['bytesCompleted'] for _,_,_,st in numbered)
            write(root/'batch-status.json',{'phase':'preparing','ready':sorted(ready),'expected':sorted(expected),'sourceBytes':total,'downloadedBytes':done,'rate':state['rateDownload'],'error':state['errorString'],'updatedAt':int(time.time()*1000)})
            if time.monotonic()-last_log>60:
                print(f'Download {done}/{total} bytes; {state["rateDownload"]} B/s; ready {len(ready)}/19',flush=True);last_log=time.monotonic()
            unfinished=[i for _,i,f,st in numbered if st['bytesCompleted']<f['length']]
            if unfinished:torrent.rpc('torrent-set',{'ids':[state['id']],'priority-high':unfinished[:1],'priority-normal':unfinished[1:]})
            for number,_,record,stats in numbered:
                if number in ready or stats['bytesCompleted']!=record['length']:continue
                entry=episode_spec(root,record);entries[number]=entry
                private={'title':catalog['title'],'malId':61316,'episodes':[entries[n] for n in sorted(entries)]};write(spec_path,private)
                one=root/'specs'/f'episode-{number}.json';write(one,{'title':catalog['title'],'episodes':[entry]})
                execute('demo-media.py','--root',str(root),'--import-spec',str(one),'--fast-1080','--public-prefix','/demo-media/enhanced')
                execute('demo-media-assets.py','--root',str(root),'--spec',str(spec_path),'--qualities','1080','--streaming-only','--public-prefix','/demo-media/enhanced')
                ready.add(number);print(f'Published episode {number}: 1080p, three voices, subtitles and previews',flush=True)
            if ready==expected:
                torrent.rpc('torrent-stop',{'ids':[state['id']]})
                break
            time.sleep(10)
        else:raise RuntimeError('Batch download deadline reached; safe to resume the same job')
        write(root/'batch-status.json',{'phase':'joining','ready':sorted(ready),'expected':sorted(expected),'updatedAt':int(time.time()*1000)})
        execute('demo-season.py','--root',str(root),'--public-prefix','/demo-media/enhanced','--source-spec',str(spec_path))
        catalog=json.loads(catalog_path.read_text())
        if len(catalog['season']['chapters'])!=19:raise ValueError('Final season chapter count mismatch')
        write(root/'batch-status.json',{'phase':'complete','ready':sorted(ready),'expected':sorted(expected),'updatedAt':int(time.time()*1000)})
        print('Complete: all 19 episodes and a continuous season are published',flush=True)

if __name__=='__main__':main()
