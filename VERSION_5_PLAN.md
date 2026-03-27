# Version 5 Plan

## Purpose

Version 5 is the live-call transport rebuild.

Version 4 proved that North Star can complete a remote spoken call loop end to end.
What it did not solve is phone-call latency. The current path still behaves like recorded turns moving back and forth, not like a live call.

Version 5 should turn North Star from a working remote voice feature into a real live companion call surface.

---

## Current reality

North Star is already responsible for:

- remote companion chat
- call request and accept flow
- phone-side spoken turns
- desktop-side reply generation
- call review and reflection import
- remote location transport

Telegram is no longer a product target.

The current call path is:

1. phone records a turn locally
2. phone uploads a full WAV over HTTP
3. desktop polls for the next pending turn
4. desktop runs STT, LLM, and TTS
5. desktop uploads a completed reply audio file
6. phone downloads and plays that finished reply

That path was good enough to prove the experience, but it guarantees delay.

---

## Version 5 goal

Move North Star calls from turn-upload transport to real live media transport.

The end state should be:

- call audio flows live between phone and desktop
- connection state drives call state
- replies arrive with much less dead air
- hangup is reflected immediately on both sides
- the user experience feels like a phone call, not a remote voice test harness

---

## What Version 5 should add

- real live media path for North Star calls
- WebRTC-based call transport using the existing signaling routes
- desktop-side signal helpers and session ownership
- mobile-side peer connection flow
- connection-state-driven call lifecycle
- lower-latency reply playback
- graceful fallback to the current turn-upload path while migration is in progress

---

## What Version 5 should not add

- Telegram call restoration
- more settings-heavy setup surfaces
- cloud-first voice infrastructure unless truly required
- extra debug UI in the phone call surface
- broad assistant sprawl unrelated to the companion call loop

---

## Core principle

Version 5 should make North Star:

- faster
- more call-like
- simpler to use
- less visibly technical

Not:

- more configurable
- more diagnostic
- more dependent on manual recovery steps

---

## Workstream 1: Lock The Current Product Flow

### Purpose

Finish stabilizing the call path that already works so the migration has a safe fallback.

### Build

- reliable call start and hangup sync between phone and desktop
- correct first-turn reset between calls
- no carry-over playback from prior calls
- no mid-call push noise
- simpler user-facing call status language

### Done means

- the current turn-upload call path feels stable enough to keep as fallback during migration

---

## Workstream 2: Desktop WebRTC Ownership

### Purpose

Give NeuralTrainer explicit ownership of live North Star call transport.

### Build

- typed desktop helpers for North Star WebRTC signal send/pull
- live-call session binding to a specific remote call id
- desktop media transport worker for an active North Star call
- connection-state-driven auto-start and auto-end

### Done means

- the desktop side can participate in a real North Star live call session instead of only polling for completed turns

---

## Workstream 3: Mobile Live Media Path

### Purpose

Turn the phone call screen into a real media endpoint.

### Build

- `RTCPeerConnection` setup in North Star mobile
- microphone stream sent live during an accepted call
- live remote audio playback without waiting for a completed file
- call-state handling driven by peer connection health

### Done means

- the phone is no longer uploading only completed spoken turns during a live call

---

## Workstream 4: Turn-Taking On Live Transport

### Purpose

Preserve natural conversation once transport becomes live.

### Build

- live VAD / turn detection around the media stream
- cleaner response timing
- interruption behavior while North Star is speaking
- optional barge-in later if it truly helps

### Done means

- the call feels like a conversation, not just a faster file exchange

---

## Workstream 5: Remove The Old Bottlenecks

### Purpose

Retire the slowest parts of the current architecture once live transport is proven.

### Build

- reduce or remove desktop polling from the active call path
- remove reply-file roundtrip from the primary call path
- keep the old turn-upload path only as fallback until confidence is high
- simplify call lifecycle logic around the live session

### Done means

- the main North Star call path is the live one, and the older path is no longer the default experience

---

## Suggested build order

### Milestone 1: Exact migration plan and desktop signal helpers

Build:

- Version 5 plan
- typed desktop signal APIs
- call-id-bound session ownership

Prove:

- the codebase is ready to move call setup onto the live path without guessing

### Milestone 2: Mobile and desktop signaling handshake

Build:

- offer / answer / ICE exchange through North Star signaling routes

Prove:

- phone and desktop can establish a live peer connection for a call

### Milestone 3: First live audio transport

Build:

- live phone mic upstream
- live desktop audio downstream

Prove:

- a North Star call can carry actual media without the full-turn upload loop

### Milestone 4: Live turn-taking polish

Build:

- VAD timing
- speak / listen state improvements
- interruption handling

Prove:

- the live call feels natural enough to keep using

### Milestone 5: Fallback reduction

Build:

- make the live path primary
- keep the current HTTP turn path only as fallback until confidence is high

Prove:

- North Star is now a true live call product path

---

## Version 5 success test

Version 5 is successful if:

- a North Star call opens with one obvious action on either side
- the phone and desktop establish a live media session
- reply delay is much closer to a real call
- hangup ends the call on both sides without manual cleanup
- the experience no longer feels like recorded turns being passed around

---

## Final test

At the end of Version 5, the question is:

- "Does a North Star call now feel like an actual live phone conversation?"

If yes, North Star has moved beyond the proof-of-concept voice loop and into the real companion-call architecture.
