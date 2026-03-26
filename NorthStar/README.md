# North Star

Dedicated mobile companion app for NeuralTrainer.

North Star is intentionally separate from Youniverse.
Youniverse is only the FAQ/reference for proven infrastructure patterns such as:

- web push
- service worker behavior
- mobile update/versioning habits
- deploy structure

North Star is the companion endpoint for:

- outside-home reachability
- mobile notifications
- companion chat
- location upload
- call signaling
- phone-side spoken turns that are answered by the NeuralTrainer desktop brain

## Layout

- `NorthStar/` - Rust backend (`axum`)
- `NorthStar-ui/frontend/` - React/Vite mobile-first PWA
- `Deploy.sh` - jail-side deploy script
- `run_northstar.sh` - runtime launcher used by the deploy script
- `northstar.env.example` - backend runtime environment template
- `dist/` - prebuilt frontend copied into the jail share before deploy

## Current Runtime Shape

NeuralTrainer stays on the Windows PC and remains the local brain:

- LM Studio
- Moonshine STT
- Kokoro TTS
- judgment and memory

North Star is the public/mobile-facing companion:

- session + desktop binding
- heartbeat and desktop presence
- push subscriptions
- companion thread
- location event upload
- call request flow
- phone-side spoken turn upload
- reply playback from the PC brain

## Local Development

### Backend

```sh
cd NorthStar
cargo run
```

Default bind:

- `0.0.0.0:3100`

Optional environment:

- `NORTHSTAR_BIND_ADDR`
- `NORTHSTAR_STATE_PATH`
- `NORTHSTAR_VAPID_SUBJECT`
- `NORTHSTAR_ALLOWED_ORIGINS`

### Frontend

```sh
cd NorthStar-ui/frontend
npm install
npm run build
```

For jail deploys, copy the built frontend output into the top-level North Star share as:

```sh
dist/
```

That mirrors the proven Youniverse deploy pattern:

- backend source in `/root/app/NorthStar`
- prebuilt frontend in `/root/app/dist`
- deploy run with `sh /root/app/Deploy.sh`

For local dev, create `.env` from `.env.example` if needed:

```sh
VITE_API_BASE=http://127.0.0.1:3100
```

In production, the frontend should usually call the same public origin as the site itself, so `VITE_API_BASE` can be omitted.

## Pre-Deploy Docs

Before creating the new jail, use:

- `JAIL_PREDEPLOY_GUIDE.md`

That guide is the handoff point before the real server/jail deployment begins.
