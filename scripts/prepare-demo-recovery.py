#!/usr/bin/env python3
"""Wait for verified selected torrent files, then prepare playable demo and derived assets."""
import importlib.util
import json
import os
import re
import subprocess
import time
from pathlib import Path

ROOT=Path('/var/lib/animonster-media/enhanced')


def write(path,value):
    temp=path.with_suffix('.prepare.tmp')
    temp.write_text(json.dumps(value,ensure_ascii=False,indent=2))
    temp.chmod(0o644)
    os.replace(temp,path)


def main():
    import argparse
    parser=argparse.ArgumentParser()
    parser.add_argument('--episodes',default='1,2')
    wanted={int(number) for number in parser.parse_args().episodes.split(',')}
    if not wanted or any(number<1 or number>100 for number in wanted):
        raise ValueError('Invalid selected episodes')
    spec=importlib.util.spec_from_file_location('torrent','/opt/animonster-media/demo-torrent.py')
    torrent=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(torrent)
    previous=ROOT/'specs'/'rezero.json'
    episodes=json.loads(previous.read_text()).get('episodes',[]) if previous.exists() else []
    ready={item['number'] for item in json.loads((ROOT/'catalog.json').read_text()).get('episodes',[]) if item['number'] in wanted}
    season=['python3','/opt/animonster-media/demo-season.py','--root',str(ROOT),'--public-prefix','/demo-media/enhanced']
    subprocess.run(season,check=True)
    for _ in range(720):
        state=torrent.rpc('torrent-get',{'ids':['c6e8f23e5e39a27a4ddfcb6ecffc230438c9c0a9'],'fields':['id','files','fileStats']})['torrents'][0]
        for record,stats in zip(state['files'],state['fileStats']):
            match=re.search(r'S04E(\d+)\.',record['name'])
            if not match or not stats['wanted'] or stats['bytesCompleted']!=record['length']:
                continue
            number=int(match[1])
            if number not in wanted or number in ready:
                continue
            source=(ROOT/'downloads'/record['name']).resolve()
            if not source.is_relative_to(ROOT/'downloads') or not source.is_file() or source.stat().st_size!=record['length']:
                continue
            data=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_chapters','-of','json',str(source)],text=True))
            voices=[]
            for stream in data['streams']:
                if stream['codec_type']!='audio':continue
                tags=stream.get('tags',{});title=tags.get('title','')
                if 'anistar' in title.lower():identity,label='anistar','AniStar · Дубляж'
                elif 'anilibria' in title.lower():identity,label='anilibria','AniLibria · Многоголосая'
                elif tags.get('language')=='jpn':identity,label='original','Японский оригинал'
                else:identity,label='audio-'+str(stream['index']),title or 'Аудиодорожка'
                voice={'id':identity,'title':label,'audio_stream':stream['index']}
                for chapter in data.get('chapters',[]):
                    title=chapter.get('tags',{}).get('title','').lower()
                    kind='opening' if title in ('op','opening','опенинг') else 'ending' if title in ('ed','ending','outro','аутро') else None
                    if kind:voice[kind]={'start':float(chapter['start_time']),'stop':float(chapter['end_time'])}
                voices.append(voice)
            subtitles=[{'stream':s['index'],'title':'Русские · DEEP','language':'ru'} for s in data['streams'] if s['codec_type']=='subtitle' and s.get('tags',{}).get('language')=='rus']
            entry={'number':number,'title':f'Серия {number}','sources':[{'file':str(source),'voices':voices,'subtitles':subtitles}]}
            episodes=[item for item in episodes if item['number']!=number]+[entry]
            single={'title':'Re:Zero — жизнь с нуля в другом мире · ТВ-4','episodes':[entry]}
            path=ROOT/'specs'/f'episode-{number}.json';write(path,single)
            subprocess.run(['python3','/opt/animonster-media/demo-media.py','--root',str(ROOT),'--import-spec',str(path),'--fast-1080','--public-prefix','/demo-media/enhanced'],check=True)
            ready.add(number)
            print(f'Restored original 1080p episode {number}',flush=True)
            interim={'title':single['title'],'malId':61316,'episodes':sorted(episodes,key=lambda item:item['number'])}
            path=ROOT/'specs'/'rezero.json';write(path,interim)
            catalog=json.loads((ROOT/'catalog.json').read_text());catalog['malId']=61316;write(ROOT/'catalog.json',catalog)
            subprocess.run(['python3','/opt/animonster-media/demo-media-assets.py','--root',str(ROOT),'--spec',str(path),'--public-prefix','/demo-media/enhanced','--qualities','1080'],check=True)
            subprocess.run(season,check=True)
        if ready==wanted:
            torrent.rpc('torrent-stop',{'ids':[state['id']]})
            break
        time.sleep(5)
    else:raise RuntimeError('Source download did not complete within one hour')
    full={'title':'Re:Zero — жизнь с нуля в другом мире · ТВ-4','malId':61316,'episodes':sorted(episodes,key=lambda e:e['number'])}
    path=ROOT/'specs'/'rezero.json';write(path,full)
    catalog=json.loads((ROOT/'catalog.json').read_text());catalog['malId']=61316;write(ROOT/'catalog.json',catalog)
    command=['python3','/opt/animonster-media/demo-media-assets.py','--root',str(ROOT),'--spec',str(path),'--public-prefix','/demo-media/enhanced']
    subprocess.run(command+['--qualities','1080'],check=True)
    print('Previews and original-quality offline copies ready',flush=True)
    subprocess.run(command,check=True)
    subprocess.run(season,check=True)


if __name__=='__main__':main()
