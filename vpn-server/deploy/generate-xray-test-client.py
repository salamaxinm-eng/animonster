#!/usr/bin/env python3
"""Derive a local XRay SOCKS test client from the private pilot URI."""

import json
import os
from pathlib import Path
from urllib.parse import parse_qs, urlparse

secrets = Path('/opt/animonster-vpn/secrets')
uri = urlparse((secrets / 'xray-pilot.txt').read_text().strip())
query = parse_qs(uri.query)

config = {
    'log': {'loglevel': 'warning'},
    'inbounds': [{
        'listen': '0.0.0.0',
        'port': 10808,
        'protocol': 'socks',
        'settings': {'auth': 'noauth', 'udp': False},
    }],
    'outbounds': [{
        'protocol': 'vless',
        'settings': {'vnext': [{
            'address': uri.hostname,
            'port': uri.port,
            'users': [{
                'id': uri.username,
                'encryption': 'none',
                'flow': query['flow'][0],
            }],
        }]},
        'streamSettings': {
            'network': 'tcp',
            'security': 'reality',
            'realitySettings': {
                'serverName': query['sni'][0],
                'fingerprint': query['fp'][0],
                'password': query['pbk'][0],
                'shortId': query['sid'][0],
                'spiderX': '/',
            },
        },
    }],
}

output = secrets / 'xray-client-test.json'
output.write_text(json.dumps(config, indent=2) + '\n')
output.chmod(0o600)
os.chown(output, 65532, 65532)
print('XRay test client configuration generated')
