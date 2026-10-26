#!/usr/bin/env python3
"""Build aligned quality variants, seek sprites and native offline files for the published demo."""
import argparse
import fcntl
import json
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path


def run(args):
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'warning', '-nostdin', '-y', '-threads', '2', *args], check=True)


def atomic_json(path, value):
    temp = path.with_suffix('.assets.tmp')
    with temp.open('w', encoding='utf-8') as output:
        json.dump(value, output, ensure_ascii=False, indent=2)
        output.flush()
        os.fsync(output.fileno())
    temp.chmod(0o644)
    os.replace(temp, path)


def durations(path):
    text = path.read_text()
    if '#EXT-X-ENDLIST' not in text:
        raise ValueError('Incomplete video playlist')
    return [float(item) for item in re.findall(r'#EXTINF:([\d.]+)', text)]


def aligned(a, b):
    # Copy muxing and re-encoding report the final B-frame tail differently.
    # Switching requires matching internal boundaries; the terminal tail has
    # no following segment and may differ by up to six frames at 24 fps.
    if not a or len(a) != len(b) or abs(a[-1]-b[-1]) >= .25:
        return False
    drift = 0.0
    for x, y in zip(a[:-1], b[:-1]):
        drift += y-x
        if abs(x-y) >= .05 or abs(drift) >= .05:
            return False
    return True


def clock(value):
    millis = round(value * 1000)
    return f'{millis//3600000:02}:{millis//60000%60:02}:{millis//1000%60:02}.{millis%1000:03}'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path('/var/lib/animonster-media'))
    parser.add_argument('--spec', type=Path, default=Path('/var/lib/animonster-media/specs/rezero.json'))
    parser.add_argument('--public-prefix', default='/demo-media')
    parser.add_argument('--qualities',default='360,480,720,1080')
    parser.add_argument('--streaming-only',action='store_true',help='Publish streams and previews without duplicating video into new per-voice MP4 files')
    args = parser.parse_args()
    requested_levels=sorted(set(int(value) for value in args.qualities.split(',')))
    if not requested_levels or any(value not in (360,480,720,1080) for value in requested_levels):
        raise ValueError('Invalid quality selection')
    root = args.root.resolve()
    with (root/'import.lock').open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        catalog = json.loads((root/'catalog.json').read_text())
        spec = json.loads(args.spec.read_text())
        catalog['malId'] = int(spec.get('malId', 61316))
        for episode in catalog['episodes']:
            levels=sorted(set(requested_levels)|{quality['height'] for quality in episode['voices'][0]['qualities']})
            number = episode['number']
            source_spec = next(item for item in spec['episodes'] if item['number'] == number)
            if len(source_spec['sources']) != 1:
                raise ValueError('Asset builder expects one shared video with multiple audio tracks')
            source = Path(source_spec['sources'][0]['file']).resolve(strict=True)
            prefix=args.public_prefix.rstrip('/')
            if not episode['voices'][0]['master'].startswith(prefix+'/'):
                raise ValueError('Unexpected media prefix')
            release = episode['voices'][0]['master'][len(prefix)+1:].split('/')[0]
            if not re.fullmatch(r'[a-z0-9_-]+', release):
                raise ValueError('Invalid publication directory')
            folder = root/'published'/release
            reference = durations(folder/'s0-v1080'/'index.m3u8')
            points = [0.0]
            for length in reference[:-1]:
                points.append(points[-1] + length)
            keyframes = ','.join(f'{point:.6f}' for point in points)
            for height in (360, 480, 720):
                if height not in levels:
                    continue
                target = folder/f's0-v{height}'
                if target.exists() and aligned(reference, durations(target/'index.m3u8')):
                    continue
                # Reuse completed work from the earlier encoder only when every segment boundary matches.
                candidates = list((root/'work').glob(f'asset-{release}-{height}-*'))
                reusable = None
                for candidate in candidates:
                    try:
                        if aligned(reference, durations(candidate/'index.m3u8')):
                            reusable = candidate
                            break
                    except (ValueError, FileNotFoundError):
                        pass
                stage = Path(tempfile.mkdtemp(prefix=f'asset-{release}-{height}-', dir=root/'work'))
                stage.chmod(0o750)
                try:
                    if reusable:
                        shutil.copytree(reusable, stage, dirs_exist_ok=True)
                    else:
                        print(f'Encoding episode {number}: {height}p', flush=True)
                        run(['-i', str(source), '-map', '0:v:0', '-an', '-sn', '-vf', f'scale=-2:{height}',
                             '-c:v', 'libx264', '-threads', '2', '-preset', 'superfast', '-crf', '21', '-pix_fmt', 'yuv420p',
                             '-force_key_frames', keyframes, '-sc_threshold', '0',
                             '-maxrate', {360: '900k', 480: '1500k', 720: '3200k'}[height],
                             '-bufsize', {360: '1800k', 480: '3000k', 720: '6400k'}[height],
                             '-f', 'segment', '-segment_times', ','.join(f'{point:.6f}' for point in points[1:]),
                             '-segment_time_delta', '0.021', '-segment_format', 'mpegts',
                             '-segment_list_type', 'm3u8', '-segment_list', str(stage/'index.m3u8'), str(stage/'%05d.ts')])
                        # The segment muxer includes the B-frame decode lead in its first
                        # EXTINF. MPEG-TS presentation timestamps already match the source;
                        # use the measured first segment duration for the playlist too.
                        measured = json.loads(subprocess.check_output([
                            'ffprobe', '-v', 'error', '-select_streams', 'v:0',
                            '-show_entries', 'stream=duration', '-of', 'json', str(stage/'00000.ts')], text=True))
                        first = float(measured['streams'][0]['duration'])
                        if abs(first-reference[0]) < .05:
                            playlist = stage/'index.m3u8'
                            playlist.write_text(re.sub(r'#EXTINF:[\d.]+', f'#EXTINF:{first:.6f}', playlist.read_text(), count=1))
                    if not aligned(reference, durations(stage/'index.m3u8')):
                        actual = durations(stage/'index.m3u8')
                        differences = [(i,a,b) for i,(a,b) in enumerate(zip(reference,actual)) if abs(a-b)>=.05]
                        raise RuntimeError(f'Variant timing differs: expected {len(reference)}, actual {len(actual)}, differences {differences[:12]}; preserved {stage}')
                    if target.exists():
                        raise RuntimeError('Unexpected existing variant: preserve published files')
                    stage.rename(target)
                except Exception:
                    print(f'Incomplete variant retained for diagnosis: {stage}', flush=True)
                    raise
            if not (folder/'preview.vtt').exists():
                stage = Path(tempfile.mkdtemp(prefix='preview-', dir=root/'work'))
                try:
                    run(['-skip_frame','nokey','-i', str(source), '-an', '-sn', '-vf', 'fps=1/10,scale=160:90:force_original_aspect_ratio=decrease,pad=160:90:(ow-iw)/2:(oh-ih)/2,tile=10x10', '-threads', '2', '-q:v', '4', str(stage/'preview-%03d.jpg')])
                    cues = ['WEBVTT', '']
                    for index in range(int(episode['duration']//10)+1):
                        page, tile = divmod(index, 100)
                        image = f'preview-{page+1:03}.jpg'
                        if not (stage/image).exists():
                            break
                        cues += [f'{clock(index*10)} --> {clock(min(episode["duration"], (index+1)*10))}',
                                 f'{image}#xywh={tile%10*160},{tile//10*90},160,90', '']
                    for image in stage.glob('*.jpg'):
                        image.chmod(0o640)
                        image.rename(folder/image.name)
                    (stage/'preview.vtt').write_text('\n'.join(cues))
                    (stage/'preview.vtt').chmod(0o640)
                    (stage/'preview.vtt').rename(folder/'preview.vtt')
                finally:
                    shutil.rmtree(stage)
            episode['preview'] = f'{prefix}/{release}/preview.vtt'
            for voice in episode['voices']:
                common = ['#EXTM3U', '#EXT-X-VERSION:3', f'#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Audio",DEFAULT=YES,AUTOSELECT=YES,URI="a-{voice["id"]}/index.m3u8"']
                adaptive = common.copy()
                qualities = []
                for height in levels:
                    bitrate = {360: 1200000, 480: 1800000, 720: 3500000, 1080: 8000000}[height]
                    width = round(height*16/9/2)*2
                    variant = [f'#EXT-X-STREAM-INF:BANDWIDTH={bitrate},RESOLUTION={width}x{height},AUDIO="audio"', f's0-v{height}/index.m3u8']
                    adaptive += variant
                    name = f'{voice["id"]}-{height}-v2.m3u8'
                    path = folder/name
                    if not path.exists():
                        path.write_text('\n'.join(common+variant)+'\n')
                        path.chmod(0o640)
                    mp4 = folder/f'{voice["id"]}-{height}-offline.mp4'
                    if not mp4.exists() and not args.streaming_only:
                        require = int(episode['duration']*bitrate/8*1.3)
                        disk = shutil.disk_usage(root)
                        if disk.free-require < disk.total*.20:
                            raise RuntimeError('Disk reserve below 20%')
                        temp = root/'work'/f'{release}-{voice["id"]}-{height}.mp4'
                        run(['-protocol_whitelist','file,http,https,tcp,tls,crypto,data','-i', str(path), '-map', '0:v:0', '-map', '0:a:0', '-c', 'copy', '-movflags', '+faststart', str(temp)])
                        temp.chmod(0o640)
                        temp.rename(mp4)
                    item = {'height': height, 'url': f'{prefix}/{release}/{name}'}
                    if mp4.exists():
                        item['download'] = {'url': f'{prefix}/{release}/{mp4.name}', 'size': mp4.stat().st_size}
                    qualities.append(item)
                name = f'{voice["id"]}-adaptive-{"-".join(map(str,levels))}-v2.m3u8'
                if not (folder/name).exists():
                    (folder/name).write_text('\n'.join(adaptive)+'\n')
                    (folder/name).chmod(0o640)
                voice['master'] = f'{prefix}/{release}/{name}'
                voice['qualities'] = qualities
            atomic_json(root/'catalog.json', catalog)
            mode="streams and previews" if args.streaming_only else "previews and offline MP4"
            print(f'Enhanced episode {number}: {len(levels)} qualities, {len(episode["voices"])} voices, {mode}', flush=True)


if __name__ == '__main__':
    main()
