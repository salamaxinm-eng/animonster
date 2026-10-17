#!/usr/bin/env python3
"""Deploy the additive title-blocking admin migration and application safely."""
import json
import subprocess
import sys
import tarfile
import time
import urllib.request
from pathlib import Path

ROOT = Path('/root/animonster')
BACKUP = Path('/root/animonster-title-admin-20261017')


def run(*args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)


def prepare():
    BACKUP.mkdir(mode=0o700, exist_ok=False)
    container = json.loads(subprocess.check_output(['docker', 'inspect', 'animonster-app-1']))[0]
    (BACKUP / 'previous-image.txt').write_text(container['Image'])
    run('docker', 'tag', container['Image'], 'animonster-app:before-title-admin-20261017')
    with (BACKUP / 'database.dump').open('wb') as output:
        run('docker', 'exec', 'animonster-postgres-1', 'pg_dump', '-U', 'animonster',
            '-d', 'animonster', '-Fc', stdout=output)
    with tarfile.open('/root/title-admin-files.tar.gz') as bundle:
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
    print('Backed up database, current files and previous app image.', flush=True)
    run('docker', 'compose', '--env-file', '.env.production', 'build', 'app', 'migrate', cwd=ROOT)


def activate():
    run('docker', 'compose', '--env-file', '.env.production', 'run', '--rm', '--no-deps',
        'migrate', cwd=ROOT)
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
    run('docker', 'tag', (BACKUP / 'previous-image.txt').read_text().strip(), 'animonster-app:latest')
    run('docker', 'compose', '--env-file', '.env.production', 'up', '-d', '--no-deps',
        '--no-build', 'app', cwd=ROOT)
    raise RuntimeError('Health check failed; previous image restored. Additive migration retained.')


if __name__ == '__main__':
    {'prepare': prepare, 'activate': activate}[sys.argv[1]]()
