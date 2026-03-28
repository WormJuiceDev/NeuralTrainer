# NeuralTrainer Roadmap

Status date: 2026-03-28

This file is the single roadmap source of truth for the project.

Use this together with `PROJECT_BRIEF.md`.

## Direction

NeuralTrainer is a local-first life companion.

The goal is:

- presence
- meaning
- honest reflection
- lived contact
- trust in life

It is not a productivity tool, dashboard product, or general-purpose assistant.

## Done

These are already true in the codebase and product baseline:

- `NeuralTrainer` is the local Windows companion runtime and brain
- `North Star` is the phone-first web/PWA/server companion surface
- the server is the public signaling and reachability layer
- TURN is deployed and active for live calls
- Telegram is removed from the active product path
- Youniverse is not part of the runtime architecture
- North Star works as its own deployed product surface
- live calls work in both directions
- realtime phone-to-desktop speech streaming exists
- the desktop accepts live pushed audio chunks into a speech stream worker
- partial transcript updates happen during live speech
- live reply streaming exists
- opener playback exists and the call advances correctly afterward
- call prompting is already split by direction and is in refinement mode

## Current

The project is no longer in an early buildout phase.

The current stage is:

- working live companion baseline
- active companion-first desktop UI and manual context phase
- active preparation for deeper memory and post-call growth refinement

The main work now is making the desktop reflect the philosophy clearly before the next memory/intelligence step is defined.

## Next

These are the next priorities:

### 1. Companion-first UI and context data

- Home as the default opening surface
- Context as the manual teaching surface
- Settings as the place for technical/runtime/debug-heavy tools
- a dedicated manual context model for the person-centered Home screen

### 2. Memory and review growth

- strengthen post-call review integration
- improve local memory shaping from good and bad calls
- make the companion learn more clearly from lived interaction

### 3. Broader companion intelligence

- meaningful context detection
- saved moments
- outreach discernment
- rhythm, place, and phase awareness
- reaching out rarely, but well

## Later

Future live-call engineering polish can return if needed, but it is not an active roadmap item now.

## Rules

1. This file is authoritative.
2. Roadmap language must match the codebase reality.
3. Once something is materially true in code, move it out of future work.
4. Do not leave old competing roadmap truths beside the current roadmap.
