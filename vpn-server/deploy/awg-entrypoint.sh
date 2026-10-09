#!/bin/bash
set -eu

config=/etc/amnezia/awg0.conf
awg-quick up "$config"

cleanup() {
  awg-quick down "$config" || true
}
trap cleanup EXIT
trap 'exit 0' TERM INT

while :; do
  sleep 3600 &
  wait $! || true
done
