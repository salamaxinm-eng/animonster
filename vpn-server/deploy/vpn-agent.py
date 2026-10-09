#!/usr/bin/env python3
"""Poll AniMonster for VPN device jobs and reconcile DE-2 configuration."""

import base64
import json
import logging
import os
import re
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

ROOT = Path('/opt/animonster-vpn')
SECRETS = ROOT / 'secrets'
MANAGED = ROOT / 'managed'
STATE = MANAGED / 'devices.json'
BASE_AWG = MANAGED / 'base-awg0.conf'
BASE_XRAY = MANAGED / 'base-xray.json'
AWG = SECRETS / 'awg0.conf'
XRAY = SECRETS / 'xray.json'
COMPOSE = ROOT / 'deploy/compose.yaml'
IMAGE = 'animonster/amneziawg-go:3.1.20260828'
LOG = logging.getLogger('vpn-agent')


def run(*args, input_text=None):
    result = subprocess.run(args, input=input_text, text=True, capture_output=True, check=True)
    return result.stdout.strip()


def atomic_write(path, content, owner=None):
    temp = path.with_name(path.name + '.tmp')
    with open(temp, 'w', encoding='utf-8') as file:
        file.write(content)
        file.flush()
        os.fsync(file.fileno())
    os.chmod(temp, 0o600)
    if owner is not None:
        os.chown(temp, owner, owner)
    os.replace(temp, path)


def initialize():
    MANAGED.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(MANAGED, 0o700)
    if not BASE_AWG.exists():
        atomic_write(BASE_AWG, AWG.read_text(encoding='utf-8'))
    if not BASE_XRAY.exists():
        atomic_write(BASE_XRAY, XRAY.read_text(encoding='utf-8'))
    if not STATE.exists():
        atomic_write(STATE, '{}\n')


def load_state():
    return json.loads(STATE.read_text(encoding='utf-8'))


def awg_key(command, input_text=None):
    return run('docker', 'run', '--rm', '-i', IMAGE, 'awg', command, input_text=input_text)


def template_values():
    source = (SECRETS / 'awg-pilot.conf').read_text(encoding='utf-8')
    values = {}
    for line in source.splitlines():
        if '=' in line:
            key, value = line.split('=', 1)
            values[key.strip()] = value.strip()
    return values


def render_awg(state):
    base = BASE_AWG.read_text(encoding='utf-8').rstrip() + '\n'
    peers = []
    for device_id, device in sorted(state.items()):
        peers.append(f'\n# managed:{device_id}\n[Peer]\n'
                     f'PublicKey = {device["awg_public"]}\n'
                     f'PresharedKey = {device["awg_psk"]}\n'
                     f'AllowedIPs = 10.88.0.{device["slot"]}/32\n')
    return base + ''.join(peers)


def render_xray(state):
    config = json.loads(BASE_XRAY.read_text(encoding='utf-8'))
    users = config['inbounds'][0]['settings']['users']
    for device_id, device in sorted(state.items()):
        users.append({'id': device['xray_uuid'], 'flow': 'xtls-rprx-vision',
                      'email': f'{device_id}@vpn.animonster.su'})
    return json.dumps(config, indent=2) + '\n'


def reconcile(state):
    old_awg = AWG.read_text(encoding='utf-8')
    old_xray = XRAY.read_text(encoding='utf-8')
    wanted_awg = render_awg(state)
    wanted_xray = render_xray(state)
    if old_awg == wanted_awg and old_xray == wanted_xray:
        return
    try:
        atomic_write(AWG, wanted_awg)
        atomic_write(XRAY, wanted_xray, owner=65532)
        run('docker', 'compose', '-f', str(COMPOSE), 'up', '-d', '--force-recreate', 'awg', 'xray')
        for attempt in range(20):
            try:
                run('docker', 'exec', 'deploy-awg-1', 'awg', 'show', 'awg0')
                break
            except subprocess.CalledProcessError:
                if attempt == 19:
                    raise
                time.sleep(0.5)
        run('docker', 'exec', 'deploy-xray-1', 'xray', 'run', '-test', '-config', '/etc/xray/config.json')
    except Exception:
        atomic_write(AWG, old_awg)
        atomic_write(XRAY, old_xray, owner=65532)
        run('docker', 'compose', '-f', str(COMPOSE), 'up', '-d', '--force-recreate', 'awg', 'xray')
        raise


def new_device(device_id, slot, expires_at):
    values = template_values()
    private = awg_key('genkey')
    public = awg_key('pubkey', private + '\n')
    psk = awg_key('genpsk')
    user_id = str(uuid.uuid4())
    obfuscation = [
        'Jc', 'Jmin', 'Jmax', 'S1', 'S2', 'S3', 'S4', 'H1', 'H2', 'H3', 'H4',
        'HeaderProtectionKey', 'ContentPaddingAddition', 'RandomTrailers', 'DisableCookies',
    ]
    interface = '\n'.join(f'{key} = {values[key]}' for key in obfuscation)
    awg = (f'[Interface]\nAddress = 10.88.0.{slot}/32\nDNS = 1.1.1.1\nMTU = 1280\n'
           f'PrivateKey = {private}\n{interface}\n\n[Peer]\n'
           f'PublicKey = {values["PublicKey"]}\nPresharedKey = {psk}\n'
           f'Endpoint = {values["Endpoint"]}\nAllowedIPs = 0.0.0.0/0\n'
           'PersistentKeepalive = 25\n')
    base = json.loads(BASE_XRAY.read_text(encoding='utf-8'))
    reality = base['inbounds'][0]['streamSettings']['realitySettings']
    keypair = (SECRETS / 'xray-keypair.txt').read_text(encoding='utf-8')
    public_key = re.search(r'^Password \(PublicKey\): (.+)$', keypair, re.MULTILINE)
    if not public_key:
        raise RuntimeError('XRay public key missing')
    host = os.environ.get('VPN_PUBLIC_IP', '31.77.10.81')
    port = base['inbounds'][0]['port']
    sni = reality['serverNames'][0]
    sid = reality['shortIds'][0]
    query = urllib.parse.urlencode({'encryption': 'none', 'security': 'reality',
        'sni': sni, 'fp': 'chrome', 'pbk': public_key.group(1), 'sid': sid,
        'flow': 'xtls-rprx-vision', 'type': 'tcp'})
    xray = f'vless://{user_id}@{host}:{port}?{query}#AniMonster-DE2-{slot}\n'
    return {'slot': slot, 'expires_at': expires_at, 'awg_public': public,
            'awg_psk': psk, 'xray_uuid': user_id,
            'profile': {'awg': awg, 'xray': xray}}


def process(job):
    device_id = job['device_id']
    device = job['device']
    state = load_state()
    if job['action'] == 'create':
        if device_id not in state:
            if not device or not 3 <= int(device['slot']) <= 253:
                raise RuntimeError('Invalid device slot')
            state[device_id] = new_device(device_id, int(device['slot']), int(device['expires_at']))
            atomic_write(STATE, json.dumps(state, indent=2) + '\n')
        reconcile(state)
        return state[device_id]['profile']
    if job['action'] == 'revoke':
        state.pop(device_id, None)
        atomic_write(STATE, json.dumps(state, indent=2) + '\n')
        reconcile(state)
        return None
    if job['action'] == 'renew':
        if device_id in state:
            state[device_id]['expires_at'] = int(device['expires_at'])
            atomic_write(STATE, json.dumps(state, indent=2) + '\n')
        return None
    raise RuntimeError('Unknown job action')


def sweep_expired():
    state = load_state()
    current = int(time.time() * 1000)
    expired = [key for key, value in state.items() if value['expires_at'] <= current]
    if expired:
        for key in expired:
            del state[key]
        atomic_write(STATE, json.dumps(state, indent=2) + '\n')
        reconcile(state)
        LOG.info('Expired %d device(s)', len(expired))


def request(method, payload=None):
    site = os.environ['VPN_SITE_URL'].rstrip('/')
    if not site.startswith('https://'):
        raise RuntimeError('VPN_SITE_URL must use HTTPS')
    token = os.environ['VPN_AGENT_TOKEN']
    url = site + '/api/vpn/agent'
    body = json.dumps(payload).encode() if payload is not None else None
    headers = {'Authorization': f'Bearer {token}'}
    if body is not None:
        headers['Content-Type'] = 'application/json'
    message = urllib.request.Request(url, data=body, headers=headers, method=method)
    with urllib.request.urlopen(message, timeout=20) as response:
        return json.load(response)


def main():
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
    initialize()
    while True:
        try:
            sweep_expired()
            result = request('GET')
            job = result.get('job')
            if not job:
                time.sleep(5)
                continue
            try:
                profile = process(job)
                response = {'id': job['id'], 'leaseId': job['lease_id']}
                if profile:
                    response['profile'] = profile
            except Exception as error:
                LOG.exception('VPN job %s failed', job['id'])
                response = {'id': job['id'], 'leaseId': job['lease_id'], 'error': str(error)[:200]}
            request('POST', response)
        except (urllib.error.URLError, TimeoutError, ValueError, KeyError, RuntimeError) as error:
            LOG.warning('Agent waiting for site: %s', error)
            time.sleep(10)


if __name__ == '__main__':
    main()
