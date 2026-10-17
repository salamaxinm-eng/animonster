#!/usr/bin/env python3
"""Verify regional title access without following player or payment redirects."""
import json
import urllib.error
import urllib.request


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


client = urllib.request.build_opener(NoRedirect)


def check(base, path, ip, expected):
    request = urllib.request.Request(base + path, headers={'X-AniMonster-Client-IP': ip})
    try:
        response = client.open(request, timeout=30)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        content = response.read().decode('utf-8')
        assert response.status == expected, (path, response.status, expected)
        if expected == 451:
            assert 'Тайтл заблокирован' in content
            assert response.headers.get('Cache-Control') == 'private, no-store'
            assert '<iframe' not in content and 'kodik.info/' not in content
        if path.startswith('/anime/'):
            assert ('Тайтл заблокирован' in content) == (expected == 451)
        print(json.dumps({'base': base, 'path': path, 'claimed_ip': ip,
                          'status': response.status, 'cache': response.headers.get('Cache-Control')},
                         ensure_ascii=False), flush=True)


origin = 'http://10.77.0.2:3000'
for anime_id in [60058, 57334, 60543]:
    for path in [f'/anime/{anime_id}', f'/anime/{anime_id}?episode=1',
                 f'/api/videos?id={anime_id}', f'/api/catalog?anime_id={anime_id}',
                 f'/api/kodik/player?anime_id={anime_id}&translation=1&episode=1']:
        check(origin, path, '77.88.8.8', 451)
    check(origin, f'/anime/{anime_id}', '8.8.8.8', 200)
check(origin, '/anime/60058', '2a02:6b8::1', 451)
check(origin, '/anime/60058', '8.8.8.8', 200)
check(origin, '/anime/21', '77.88.8.8', 200)
check(origin, '/vpn', '77.88.8.8', 200)
check(origin, '/api/health', '77.88.8.8', 200)
check(origin, '/api/admin/title-restrictions', '77.88.8.8', 404)
# These requests originate on the German server. The public edge must replace
# either forged IP; both must remain unrestricted regardless of the header.
for forged in ['77.88.8.8', '8.8.8.8']:
    check('https://animonster.su', '/anime/60058', forged, 200)
