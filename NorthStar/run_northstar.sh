#!/bin/sh

set -eu

if [ -f /usr/local/etc/northstar.env ]; then
  set -a
  # shellcheck disable=SC1091
  . /usr/local/etc/northstar.env
  set +a
fi

export NORTHSTAR_BIND_ADDR="${NORTHSTAR_BIND_ADDR:-0.0.0.0:3100}"
export NORTHSTAR_STATE_PATH="${NORTHSTAR_STATE_PATH:-/var/db/northstar/state/northstar_state.json}"
export NORTHSTAR_VAPID_SUBJECT="${NORTHSTAR_VAPID_SUBJECT:-mailto:northstar@youworld.app}"

exec /usr/local/bin/NorthStar
