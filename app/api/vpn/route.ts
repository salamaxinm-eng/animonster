import { ApiError, body, fail, json, requireUser, sameOrigin } from '@/lib/server/core';
import { addVpnDevice, getVpnProfile, revokeVpnDevice, vpnOverview } from '@/lib/server/vpn';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const deviceId = new URL(request.url).searchParams.get('device');
    if (!deviceId) return json(await vpnOverview(user.id));
    const format = new URL(request.url).searchParams.get('format');
    const profile = await getVpnProfile(user.id, deviceId);
    if (format !== 'awg' && format !== 'xray')
      throw new ApiError('Неизвестный формат профиля');
    return new Response(format === 'awg' ? profile.awg : profile.xray, {
      headers: {
        'Content-Type': format === 'awg' ? 'application/octet-stream' : 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="animonster-${deviceId}.${format === 'awg' ? 'conf' : 'txt'}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const user = await requireUser(request);
    const input = await body(request);
    if (input.action === 'create') return json(await addVpnDevice(user.id, input.name), 202);
    if (input.action === 'revoke')
      return json(await revokeVpnDevice(user.id, String(input.id || '')));
    throw new ApiError('Неизвестное действие');
  } catch (error) {
    return fail(error);
  }
}
