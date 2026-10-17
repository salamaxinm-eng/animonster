#!/usr/bin/env python3
"""Back up and build the site, or add trusted IP forwarding to the public edge."""
import json
import shutil
import subprocess
import sys
import tarfile
import time
import urllib.request
from pathlib import Path

ROOT = Path('/root/animonster')
BACKUP = Path('/root/animonster-title-restrictions-20261017')


def run(*args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)


def prepare():
    archive = Path('/root/title-restrictions-files.tar.gz')
    BACKUP.mkdir(mode=0o700, exist_ok=False)
    inspect = json.loads(subprocess.check_output(['docker', 'inspect', 'animonster-app-1']))[0]
    old_image = inspect['Image']
    (BACKUP / 'previous-image.txt').write_text(old_image)
    run('docker', 'tag', old_image, 'animonster-app:before-title-restrictions-20261017')
    with (BACKUP / 'database.dump').open('wb') as output:
        run('docker', 'exec', 'animonster-postgres-1', 'pg_dump', '-U', 'animonster',
            '-d', 'animonster', '-Fc', stdout=output)
    with tarfile.open(archive) as bundle:
        members = bundle.getmembers()
        for member in members:
            if not member.isfile() or not (ROOT / member.name).resolve().is_relative_to(ROOT):
                raise RuntimeError('Unexpected archive member')
        with tarfile.open(BACKUP / 'files-before.tar.gz', 'w:gz') as backup:
            for member in members:
                path = ROOT / member.name
                if path.exists():
                    backup.add(path, arcname=member.name)
        (BACKUP / 'changed-files.json').write_text(json.dumps([item.name for item in members]))
        bundle.extractall(ROOT, members=members, filter='data')
    print('Source and database backed up; building app without stopping current service.', flush=True)
    run('docker', 'compose', '--env-file', '.env.production', 'build', 'app', cwd=ROOT)


def edge():
    BACKUP.mkdir(mode=0o700, exist_ok=False)
    path = ROOT / 'Caddyfile'
    before = path.read_text()
    anchor = '  reverse_proxy 10.77.0.2:3000 {\n'
    if before.count(anchor) != 1 or 'X-AniMonster-Client-IP' in before:
        raise RuntimeError('Unexpected edge configuration')
    shutil.copy2(path, BACKUP / 'Caddyfile')
    wanted = before.replace(anchor, anchor + '    header_up X-AniMonster-Client-IP {remote_host}\n')
    candidate = BACKUP / 'Caddyfile.candidate'
    candidate.write_text(wanted)
    run('docker', 'cp', str(candidate), 'animonster-caddy-1:/tmp/title-restrictions.Caddyfile')
    run('docker', 'exec', 'animonster-caddy-1', 'caddy', 'validate', '--config',
        '/tmp/title-restrictions.Caddyfile', '--adapter', 'caddyfile')
    # Keep the bind mount's inode so the container reads the new configuration.
    path.write_text(wanted)
    try:
        run('docker', 'exec', 'animonster-caddy-1', 'caddy', 'reload', '--config',
            '/etc/caddy/Caddyfile', '--adapter', 'caddyfile')
    except Exception:
        path.write_text(before)
        run('docker', 'exec', 'animonster-caddy-1', 'caddy', 'reload', '--config',
            '/etc/caddy/Caddyfile', '--adapter', 'caddyfile')
        raise
    print('Public edge forwards its TCP peer IP; existing tunnel upstream preserved.', flush=True)


def activate():
    run('docker', 'compose', '--env-file', '.env.production', 'up', '-d', '--no-deps',
        '--no-build', 'app', cwd=ROOT)
    for attempt in range(20):
        try:
            with urllib.request.urlopen('http://10.77.0.2:3000/api/health', timeout=2) as response:
                if response.status == 200:
                    print('New application is healthy.', flush=True)
                    return
        except Exception:
            time.sleep(2)
    old_image = (BACKUP / 'previous-image.txt').read_text().strip()
    run('docker', 'tag', old_image, 'animonster-app:latest')
    run('docker', 'compose', '--env-file', '.env.production', 'up', '-d', '--no-deps',
        '--no-build', 'app', cwd=ROOT)
    raise RuntimeError('Health check failed; restored previous image')


if __name__ == '__main__':
    {'prepare': prepare, 'edge': edge, 'activate': activate}[sys.argv[1]]()
