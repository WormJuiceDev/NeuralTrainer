# North Star Jail Pre-Deploy Guide

This document finishes the project prep up to the point where the new North Star jail needs to be created and wired on the server.

It does **not** perform the jail deployment itself.

## What Is Already Ready

Code-side, North Star is ready for the jail handoff:

- backend compiles
- frontend builds
- deploy script exists
- runtime launcher exists
- runtime env template exists
- service worker and push registration are wired
- NeuralTrainer desktop already knows how to talk to North Star

## Intended Server Shape

North Star should be its **own jail**, separate from:

- `rust-app`
- `signaling-server`
- `youniverse-app`
- `postgres`

Recommended naming:

- jail name: `northstar-app`

Expected responsibilities for the new jail:

- serve North Star backend on internal port `3100`
- serve North Star frontend static files
- host North Star runtime state and VAPID key

## Files To Transfer Before Deploy

Copy these into the new jail app folder, recommended:

- `/root/app/NorthStar`
- `/root/app/Deploy.sh`
- `/root/app/run_northstar.sh`
- `/root/app/northstar.env.example`
- `/root/app/dist`

Important:

- the frontend should be built before deploy
- the built output should be copied into the top-level `dist/` folder
- do not rely on building the frontend from the mounted share inside the jail

## Backend Runtime Assumptions

North Star now supports these environment variables:

- `NORTHSTAR_BIND_ADDR`
  - default: `0.0.0.0:3100`
- `NORTHSTAR_STATE_PATH`
  - default: `/var/db/northstar/state/northstar_state.json` once deployed through the runtime launcher
- `NORTHSTAR_VAPID_SUBJECT`
  - default: `mailto:northstar@youworld.app`
- `NORTHSTAR_ALLOWED_ORIGINS`
  - comma-separated browser origins
  - example: `https://northstar.your-domain.example`

The deploy script installs `/usr/local/etc/northstar.env` from the example file if it does not exist yet.

## Frontend Runtime Assumptions

The frontend now resolves its API base like this:

1. `VITE_API_BASE` if defined at build time
2. otherwise `window.location.origin`

That means production can stay same-origin by default, which is the preferred deploy shape.

For local dev only, use:

- `NorthStar-ui/frontend/.env.example`

with:

- `VITE_API_BASE=http://127.0.0.1:3100`

## Deploy Script Expectations

`Deploy.sh` now expects this structure inside the jail:

- `/root/app/NorthStar`
- `/root/app/run_northstar.sh`
- `/root/app/northstar.env.example`
- `/root/app/dist`

It will:

1. build the backend
2. install the `NorthStar` binary to `/usr/local/bin/NorthStar`
3. install `/usr/local/bin/run_northstar.sh`
4. ensure `/var/db/northstar/state`
5. install `/usr/local/etc/northstar.env` if missing
6. install frontend files into `/usr/local/www/northstar-ui`
7. start North Star through `/usr/sbin/daemon -f /usr/local/bin/run_northstar.sh`

This is intentionally aligned with the proven Youniverse flow:

- mount project share into `/root/app`
- run `sh /root/app/Deploy.sh`

## What Still Needs Your Guidance

These are the actual deployment-time decisions that still belong to the server step:

1. the jail name and creation
2. the jail IP
3. the public domain/subdomain for North Star
4. nginx routing for that domain
5. TLS certificate wiring
6. whether North Star uses its own database later or stays file-backed for now
7. whether push should use a dedicated contact email instead of `northstar@youworld.app`

## Recommended First Deploy Target

Use a dedicated public subdomain, for example:

- `northstar.youworld.app`

And keep the API and frontend on the same origin to avoid unnecessary browser CORS problems.

## Stop Point

At this point, the codebase is prepared.

The next step is the **actual new jail deployment and routing setup**, which is where guided server work should begin.
