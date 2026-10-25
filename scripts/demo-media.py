#!/usr/bin/env python3
"""Admin-only restartable MKV to HLS import. Run with a CPU/memory limited systemd unit."""
import argparse
import fcntl
import hashlib
import json
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path


def probe(path):
    return json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(path)], text=True))


def atomic_json(path, value):
    temporary = path.with_suffix('.tmp')
    with temporary.open('w', encoding='utf-8') as output:
        json.dump(value, output, ensure_ascii=False, indent=2)
        output.flush()
        os.fsync(output.fileno())
    os.replace(temporary, path)


def require_space(root, required):
    disk = shutil.disk_usage(root)
    if disk.free - required < disk.total * .20:
        raise RuntimeError('Insufficient disk: import must leave 20% free')


def rendition_heights(height):
    return [value for value in (480, 720, 1080) if value <= height]


def master(heights, audio, video_dirs, only=None):
    lines = ['#EXTM3U', '#EXT-X-VERSION:3', f'#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Audio",DEFAULT=YES,AUTOSELECT=YES,URI="{audio}"']
    for height in heights:
        if not only or only == height:
            bitrate = {480: 1800000, 720: 3500000, 1080: 7000000}[height]
            lines += [f'#EXT-X-STREAM-INF:BANDWIDTH={bitrate},AUDIO="audio"', f'{video_dirs[height]}/index.m3u8']
    return '\n'.join(lines) + '\n'


def ffmpeg(source, *options):
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'warning', '-nostdin', '-y', '-threads', '1', '-i', str(source), *options], check=True)


def package_episode(spec, root, work, fast_1080=False, public_prefix='/demo-media'):
    number = spec['number']
    if not isinstance(number, int) or number < 1 or not spec['sources']:
        raise ValueError('Invalid episode')
    identity = hashlib.sha256((json.dumps(spec, sort_keys=True) + str(fast_1080) + public_prefix).encode())
    sources, estimate, ids = [], 0, set()
    for source in spec['sources']:
        path = Path(source['file']).resolve(strict=True)
        if path.suffix.lower() not in ('.mkv', '.mp4'):
            raise ValueError('Only MKV/MP4 supported')
        identity.update(f'{path}:{path.stat().st_size}:{path.stat().st_mtime_ns}'.encode())
        data = probe(path)
        video = next(s for s in data['streams'] if s['codec_type'] == 'video')
        duration = float(data['format']['duration'])
        heights = rendition_heights(video['height'])
        if fast_1080:
            if video['height'] != 1080 or video['codec_name'] != 'h264' or video.get('pix_fmt') != 'yuv420p':
                raise ValueError('Fast import requires browser-compatible 1080p H.264 8-bit')
            heights = [1080]
        if not heights or not source['voices']:
            raise ValueError('At least 480p and one voice required')
        for voice in source['voices']:
            if not re.fullmatch(r'[a-z0-9_-]+', voice['id']) or voice['id'] in ids:
                raise ValueError('Invalid/duplicate voice id')
            ids.add(voice['id'])
            if not any(s['index'] == voice['audio_stream'] and s['codec_type'] == 'audio' for s in data['streams']):
                raise ValueError('Invalid audio mapping')
        estimate += int(duration * (sum({480: 1800000, 720: 3500000, 1080: 7000000}[h] for h in heights) + 256000 * len(source['voices'])) / 8 * 1.2)
        sources.append((source, path, data, video, duration, heights))
    release = f'ep-{number}-{identity.hexdigest()[:12]}'
    target = root / 'published' / release
    if (target / 'episode.json').exists():
        return json.loads((target / 'episode.json').read_text())
    require_space(root, estimate)
    staging = Path(tempfile.mkdtemp(prefix=f'ep-{number}-', dir=work))
    staging.chmod(0o750)
    try:
        result = {'number': number, 'title': spec.get('title', f'Серия {number}'), 'duration': sources[0][4], 'voices': [], 'subtitles': []}
        prefix = f'{public_prefix.rstrip("/")}/{release}'
        for source_number, (source, path, data, video, duration, heights) in enumerate(sources):
            video_dirs = {}
            for height in heights:
                directory = staging / f's{source_number}-v{height}'
                directory.mkdir()
                video_dirs[height] = directory.name
                encoding = ['-c:v', 'copy'] if fast_1080 else [
                    '-vf', f'scale=-2:{height}', '-c:v', 'libx264', '-threads', '1', '-preset', 'veryfast',
                    '-crf', '21', '-pix_fmt', 'yuv420p', '-force_key_frames', 'expr:gte(t,n_forced*6)', '-sc_threshold', '0',
                    '-maxrate', {480: '1500k', 720: '3200k', 1080: '6500k'}[height],
                    '-bufsize', {480: '3000k', 720: '6400k', 1080: '13000k'}[height]]
                ffmpeg(path, '-map', f'0:{video["index"]}', '-an', '-sn', *encoding,
                       '-f', 'hls', '-hls_time', '6', '-hls_playlist_type', 'vod', '-hls_flags', 'independent_segments',
                       '-hls_segment_filename', str(directory / '%05d.ts'), str(directory / 'index.m3u8'))
            for voice in source['voices']:
                directory = staging / f'a-{voice["id"]}'
                directory.mkdir()
                audio_stream = next(s for s in data['streams'] if s['index'] == voice['audio_stream'])
                audio_encoding = ['-c:a', 'copy'] if audio_stream['codec_name'] == 'aac' and audio_stream.get('profile') == 'LC' and audio_stream.get('channels', 0) <= 2 else ['-c:a', 'aac', '-ac', '2', '-b:a', '192k']
                ffmpeg(path, '-map', f'0:{voice["audio_stream"]}', '-vn', '-sn', *audio_encoding,
                       '-f', 'hls', '-hls_time', '6', '-hls_playlist_type', 'vod', '-hls_segment_filename', str(directory / '%05d.ts'), str(directory / 'index.m3u8'))
                audio = f'{directory.name}/index.m3u8'
                manifest = f'{voice["id"]}-master.m3u8'
                (staging / manifest).write_text(master(heights, audio, video_dirs))
                qualities = []
                for height in heights:
                    name = f'{voice["id"]}-{height}.m3u8'
                    (staging / name).write_text(master(heights, audio, video_dirs, only=height))
                    qualities.append({'height': height, 'url': f'{prefix}/{name}'})
                item = {'id': voice['id'], 'title': voice['title'], 'master': f'{prefix}/{manifest}', 'qualities': qualities}
                for kind in ('opening', 'ending'):
                    segment = voice.get(kind)
                    if segment and 0 <= segment['start'] < segment['stop'] <= duration:
                        item[kind] = segment
                result['voices'].append(item)
            if source_number == 0:
                for index, subtitle in enumerate(source.get('subtitles', [])):
                    name = f'sub-{index}.vtt'
                    if 'file' in subtitle:
                        ffmpeg(Path(subtitle['file']).resolve(strict=True), '-c:s', 'webvtt', str(staging / name))
                    else:
                        if not any(s['index'] == subtitle['stream'] and s['codec_type'] == 'subtitle' for s in data['streams']):
                            raise ValueError('Invalid subtitle mapping')
                        ffmpeg(path, '-map', f'0:{subtitle["stream"]}', '-c:s', 'webvtt', str(staging / name))
                    result['subtitles'].append({'title': subtitle['title'], 'language': subtitle.get('language', 'ru'), 'url': f'{prefix}/{name}'})
        for playlist in staging.rglob('*.m3u8'):
            text = playlist.read_text()
            references = re.findall(r'URI="([^"]+)"', text) + [line for line in text.splitlines() if line and not line.startswith('#')]
            if not references or any(not (playlist.parent / item).is_file() for item in references):
                raise RuntimeError('Incomplete HLS output')
        atomic_json(staging / 'episode.json', result)
        target.parent.mkdir(exist_ok=True)
        staging.rename(target)
        return result
    finally:
        if staging.exists():
            shutil.rmtree(staging)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path('/var/lib/animonster-media'))
    parser.add_argument('--probe', type=Path)
    parser.add_argument('--import-spec', type=Path)
    parser.add_argument('--fast-1080', action='store_true', help='Publish compatible original 1080p without re-encoding; adaptive variants can be imported later')
    parser.add_argument('--public-prefix',default='/demo-media')
    args = parser.parse_args()
    if args.probe:
        print(json.dumps(probe(args.probe), ensure_ascii=False, indent=2))
        return
    if not args.import_spec:
        parser.error('--probe or --import-spec required')
    root = args.root.resolve()
    root.mkdir(parents=True, exist_ok=True)
    work = root / 'work'
    work.mkdir(exist_ok=True)
    with (root / 'import.lock').open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        spec = json.loads(args.import_spec.read_text(encoding='utf-8'))
        path = root / 'catalog.json'
        catalog = json.loads(path.read_text()) if path.exists() else {'version': 1, 'title': spec['title'], 'episodes': []}
        for episode in spec['episodes']:
            output = package_episode(episode, root, work, fast_1080=args.fast_1080,public_prefix=args.public_prefix)
            catalog['episodes'] = sorted([item for item in catalog['episodes'] if item['number'] != output['number']] + [output], key=lambda item: item['number'])
            atomic_json(path, catalog)
            print(f'Ready: episode {output["number"]}, {len(output["voices"])} voices', flush=True)


if __name__ == '__main__':
    main()
