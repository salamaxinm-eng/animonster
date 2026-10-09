#!/bin/bash
set -euo pipefail
umask 077

root=/opt/animonster-vpn
secrets="$root/secrets"
image=ghcr.io/xtls/xray-core:26.7.28
mkdir -p "$secrets"
chmod 700 "$secrets"
if [[ -e "$secrets/xray.json" || -e "$secrets/xray-pilot.txt" ]]; then
  echo 'XRay configuration already exists; refusing to replace keys' >&2
  exit 1
fi

if [[ ! -s "$secrets/xray-keypair.txt" ]]; then
  docker run --rm "$image" x25519 > "$secrets/xray-keypair.txt"
  chmod 600 "$secrets/xray-keypair.txt"
fi
private=$(sed -n 's/^PrivateKey: //p' "$secrets/xray-keypair.txt")
public=$(sed -n 's/^Password (PublicKey): //p' "$secrets/xray-keypair.txt")
[[ -n "$private" && -n "$public" ]] || { echo 'Invalid XRay keypair' >&2; exit 1; }
uuid=$(cat /proc/sys/kernel/random/uuid)
short_id=$(od -An -N8 -tx1 /dev/urandom | tr -d ' \n')

cat > "$secrets/xray.json" <<EOF
{
  "log": { "loglevel": "warning" },
  "inbounds": [{
    "tag": "vpn-reality",
    "listen": "0.0.0.0",
    "port": 8443,
    "protocol": "vless",
    "settings": {
      "users": [{ "id": "$uuid", "flow": "xtls-rprx-vision", "email": "pilot@animonster.su" }],
      "decryption": "none"
    },
    "streamSettings": {
      "network": "tcp",
      "security": "reality",
      "realitySettings": {
        "show": false,
        "target": "animonster.su:443",
        "xver": 0,
        "serverNames": ["animonster.su"],
        "privateKey": "$private",
        "shortIds": ["$short_id"]
      }
    }
  }],
  "outbounds": [{ "protocol": "freedom", "tag": "direct" }]
}
EOF

printf 'vless://%s@31.77.10.81:8443?encryption=none&security=reality&sni=animonster.su&fp=chrome&pbk=%s&sid=%s&flow=xtls-rprx-vision&type=tcp#AniMonster-DE2-Reality\n' \
  "$uuid" "$public" "$short_id" > "$secrets/xray-pilot.txt"
chmod 600 "$secrets/xray.json" "$secrets/xray-pilot.txt"
chown 65532:65532 "$secrets/xray.json"
echo 'XRay server and pilot client configurations generated'
