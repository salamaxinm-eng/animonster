#!/usr/bin/env python3
"""Local-only Transmission RPC for inspecting and selectively downloading demo sources."""
import argparse
import base64
import json
import shutil
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

RPC = 'http://127.0.0.1:9092/transmission/rpc'
SESSION = ''


def rpc(method, arguments):
    global SESSION
    for _ in range(2):
        request = urllib.request.Request(RPC, json.dumps({'method': method, 'arguments': arguments}).encode(),
                                         {'X-Transmission-Session-Id': SESSION, 'Content-Type': 'application/json'})
        try:
            with urllib.request.urlopen(request, timeout=15) as response:
                result = json.load(response)
            if result['result'] != 'success':
                raise RuntimeError(result['result'])
            return result['arguments']
        except urllib.error.HTTPError as error:
            if error.code != 409:
                raise
            SESSION = error.headers['X-Transmission-Session-Id']
    raise RuntimeError('Transmission session failed')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('hash', help='40-character hexadecimal torrent info hash')
    parser.add_argument('--files', help='Comma separated file indices to download. Omit to inspect only.')
    args = parser.parse_args()
    if len(args.hash) != 40 or any(char not in '0123456789abcdefABCDEF' for char in args.hash):
        parser.error('Invalid torrent hash')
    target = Path('/var/lib/animonster-media/downloads')
    magnet = 'magnet:?xt=urn:btih:' + args.hash + '&tr=' + urllib.parse.quote('http://bt3.t-ru.org/ann?magnet', safe='')
    metadata = target / (args.hash.lower() + '.torrent')
    if not metadata.exists() and shutil.which('aria2c'):
        # Transmission metadata exchange can stall against some peers; aria2 only fetches the torrent metadata.
        subprocess.run(['aria2c', '--bt-metadata-only=true', '--bt-save-metadata=true', '--seed-time=0',
                        '--stop=90', '--listen-port=51416', '--dht-listen-port=51416', '--dir=' + str(target), magnet],
                       check=False, timeout=100)
    existing = rpc('torrent-get', {'ids': [args.hash.lower()], 'fields': ['id', 'files']})['torrents']
    if metadata.exists() and existing and not existing[0]['files']:
        rpc('torrent-remove', {'ids': [existing[0]['id']], 'delete-local-data': False})
    payload = {'metainfo': base64.b64encode(metadata.read_bytes()).decode()} if metadata.exists() else {'filename': magnet}
    result = rpc('torrent-add', {**payload, 'download-dir': str(target), 'paused': True})
    torrent = result.get('torrent-added') or result.get('torrent-duplicate')
    identity = torrent['id']
    rpc('torrent-set', {'ids': [identity], 'downloadLimited': True, 'downloadLimit': 512, 'seedRatioMode': 2})
    # Fetch metadata first, then stop before committing disk space to a full season.
    for _ in range(120):
        info = rpc('torrent-get', {'ids': [identity], 'fields': ['id', 'files', 'metadataPercentComplete', 'errorString']})['torrents'][0]
        if info['metadataPercentComplete'] >= 1 and info['files']:
            break
        rpc('torrent-start', {'ids': [identity]})
        time.sleep(2)
    else:
        rpc('torrent-stop', {'ids': [identity]})
        raise RuntimeError('Metadata unavailable; retry when peers are reachable')
    rpc('torrent-stop', {'ids': [identity]})
    files = info['files']
    for index, item in enumerate(files):
        print(json.dumps({'index': index, **item}, ensure_ascii=False))
    if args.files is None:
        return
    wanted = [int(value) for value in args.files.split(',')]
    if not wanted or any(index < 0 or index >= len(files) for index in wanted):
        raise ValueError('Invalid file indices')
    remaining = sum(files[index]['length'] - files[index]['bytesCompleted'] for index in wanted)
    disk = shutil.disk_usage(target)
    if disk.free - remaining < disk.total * .20:
        raise RuntimeError('Download must leave 20% disk space free')
    rpc('torrent-set', {'ids': [identity], 'files-unwanted': [i for i in range(len(files)) if i not in wanted],
                       'files-wanted': wanted, 'downloadLimited': True, 'downloadLimit': 8192, 'seedRatioMode': 1, 'seedRatioLimit': 0})
    rpc('torrent-start', {'ids': [identity]})
    print('Selected download started. Seeding stops at completion.')


if __name__ == '__main__':
    main()
