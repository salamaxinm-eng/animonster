#!/usr/bin/env python3
"""Copy published media metadata to the site atomically; preserve the last copy during outages."""
import json
import os
import subprocess
from pathlib import Path


def main():
    response = subprocess.check_output([
        'curl', '--fail', '--silent', '--show-error', '--max-time', '20',
        '--resolve', 'animonster.su:443:31.77.14.179',
        'https://animonster.su/demo-media/catalog.json',
    ])
    if len(response) > 1024 * 1024:
        raise ValueError('Catalog exceeds 1 MiB')
    catalog = json.loads(response)
    if catalog.get('version') != 1 or not isinstance(catalog.get('episodes'), list) or not catalog['episodes']:
        raise ValueError('Invalid/empty published catalog')
    root = Path('/var/lib/animonster-media')
    target = root / 'catalog.json'
    content = json.dumps(catalog, ensure_ascii=False, indent=2).encode()
    if target.exists() and target.read_bytes() == content:
        return
    temporary = root / 'catalog.sync.tmp'
    with temporary.open('wb') as output:
        output.write(content)
        output.flush()
        os.fsync(output.fileno())
    temporary.chmod(0o644)
    os.replace(temporary, target)
    print(f'Synced {len(catalog["episodes"])} ready episode(s)', flush=True)


if __name__ == '__main__':
    main()
