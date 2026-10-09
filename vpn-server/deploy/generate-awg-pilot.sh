#!/bin/bash
set -euo pipefail
umask 077

root=/opt/animonster-vpn
secrets="$root/secrets"
image=animonster/amneziawg-go:3.1.20260828
mkdir -p "$secrets"
chmod 700 "$secrets"
if [[ -e "$secrets/awg0.conf" || -e "$secrets/awg-pilot.conf" ]]; then
  echo 'AWG configuration already exists; refusing to replace keys' >&2
  exit 1
fi

awg() { docker run --rm -i "$image" awg "$@"; }
server_private=$(awg genkey)
server_public=$(printf '%s\n' "$server_private" | awg pubkey)
client_private=$(awg genkey)
client_public=$(printf '%s\n' "$client_private" | awg pubkey)
preshared=$(awg genpsk)
header_key=$(awg genkey)

cat > "$secrets/awg0.conf" <<EOF
[Interface]
Address = 10.88.0.1/24
ListenPort = 51821
PrivateKey = $server_private
Jc = 6
Jmin = 10
Jmax = 50
S1 = 76
S2 = 47
S3 = 33
S4 = 12
H1 = 1
H2 = 2
H3 = 3
H4 = 4
HeaderProtectionKey = $header_key
ContentPaddingAddition = 10-100
RandomTrailers = on
DisableCookies = on
PostUp = iptables -I FORWARD -i %i -j ACCEPT
PostUp = iptables -I FORWARD -o %i -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT
PostUp = iptables -t nat -I POSTROUTING -s 10.88.0.0/24 -o ens3 -j MASQUERADE
PostDown = iptables -D FORWARD -i %i -j ACCEPT
PostDown = iptables -D FORWARD -o %i -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT
PostDown = iptables -t nat -D POSTROUTING -s 10.88.0.0/24 -o ens3 -j MASQUERADE

[Peer]
PublicKey = $client_public
PresharedKey = $preshared
AllowedIPs = 10.88.0.2/32
EOF

cat > "$secrets/awg-pilot.conf" <<EOF
[Interface]
Address = 10.88.0.2/32
DNS = 1.1.1.1
MTU = 1280
PrivateKey = $client_private
Jc = 6
Jmin = 10
Jmax = 50
S1 = 76
S2 = 47
S3 = 33
S4 = 12
H1 = 1
H2 = 2
H3 = 3
H4 = 4
HeaderProtectionKey = $header_key
ContentPaddingAddition = 10-100
RandomTrailers = on
DisableCookies = on

[Peer]
PublicKey = $server_public
PresharedKey = $preshared
Endpoint = 31.77.10.81:51821
AllowedIPs = 0.0.0.0/0, ::/0
PersistentKeepalive = 25
EOF
chmod 600 "$secrets/awg0.conf" "$secrets/awg-pilot.conf"
echo 'AWG server and pilot client configurations generated'
