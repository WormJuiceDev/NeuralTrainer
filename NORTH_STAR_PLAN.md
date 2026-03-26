# North Star Plan

## Purpose

North Star is the dedicated mobile-facing companion app for NeuralTrainer.

It is a separate product from Youniverse.

Youniverse is not the host for NeuralTrainer.
Youniverse is the proven reference implementation for:

- mobile web app structure
- auth flow
- push notifications
- service worker behavior
- chat foundations
- deployment patterns
- versioned mobile update behavior

North Star will reuse those lessons, but it will run as its own app and in its own jail.

North Star must also replace Telegram as the location source.

## Hard Boundaries

1. Youniverse must not be modified to carry NeuralTrainer.
2. North Star must be deployable independently.
3. NeuralTrainer remains the local AI brain on the Windows PC.
4. The server remains the public reachability layer.
5. North Star is dedicated to NeuralTrainer only.
6. North Star must provide full location support so Telegram can be removed from the product path.

## Product Roles

### NeuralTrainer

Runs on the Windows PC.

Responsibilities:

- LM Studio inference
- memory and judgment
- location interpretation
- local voice generation
- local speech recognition
- call reasoning
- secure outbound connection to server

### North Star

Runs on your server as its own app.

Responsibilities:

- mobile-facing companion UI
- auth
- push notifications
- companion chat
- live location sharing and passive location transport
- call signaling
- mobile call session UI
- post-call review and correction

### Server

Hosts North Star publicly and routes traffic to it.

Responsibilities:

- HTTPS
- websocket signaling
- push endpoints
- auth/session handling
- call session state
- relay/signaling for live calls

## Why This Is Better Than Extending Youniverse

1. It protects Youniverse completely.
2. North Star can be designed around NeuralTrainer from the start.
3. Call and companion flows can be first-class instead of bolted on.
4. Deployment remains simple because you already know how to host this kind of app.
5. We can copy the proven parts of Youniverse without inheriting its product constraints.
6. We can make location a first-class companion feature instead of depending on Telegram-specific behavior.

## What North Star Should Reuse From Youniverse

Use Youniverse as the implementation FAQ and reference source for:

- backend structure
- auth/session handling
- direct message style chat flows
- push subscription handling
- service worker setup
- PWA shell behavior
- version bump/update handling for mobile installs
- deployment workflow patterns

Do not treat Youniverse as a shared runtime.

## Deployment Shape

North Star should become a new jail alongside your current apps.

Suggested shape:

- `northstar-app` jail
- separate backend
- separate frontend build output
- separate route/domain or subdomain
- separate deployment script

Suggested public route:

- `northstar.youworld.app`

Alternative:

- `companion.youworld.app`

## Architecture

### 1. NeuralTrainer Desktop Node

The desktop app will maintain an authenticated outbound connection to North Star.

Why:

- avoids exposing your PC directly
- preserves your GPU-based local inference setup
- allows the server to act as rendezvous point

### 2. North Star Backend

Must be a separate backend app.

Responsibilities:

- account binding
- desktop presence
- push notifications
- companion messaging
- call signaling
- live call session metadata
- post-call review persistence

### 3. North Star Frontend

Must be a mobile-first web/PWA app.

Responsibilities:

- installable on phone
- receive push
- request and manage location permission clearly
- provide continuous or resumable location sharing behavior suitable for NeuralTrainer
- open into companion chat or call
- answer or decline companion calls
- show active call state
- show post-call review and memory corrections

## Functional Scope

### Phase 1: Companion foundation

Build:

- auth
- device/account binding
- desktop heartbeat
- websocket signaling foundation
- companion home screen
- location permission and location capability model

Done when:

- NeuralTrainer can appear online in North Star
- phone can see whether the companion is reachable
- North Star can report whether location support is available, denied, paused, or active

### Phase 2: Messaging and notifications

Build:

- private companion thread
- push notification types
- notification deep-links
- message/reach-out surface
- location event upload path
- background/resume-safe location batching where platform allows it

Done when:

- NeuralTrainer can reach the phone through North Star reliably
- NeuralTrainer can receive real location events from North Star without Telegram

### Phase 3: Call signaling

Build:

- call request creation
- accept / decline / timeout flow
- active session state
- mobile call screen shell

Done when:

- user can receive and accept a NeuralTrainer call request from outside home

### Phase 3.5: Full location replacement

Build:

- location session controls in North Star
- foreground and background behavior rules per platform
- visible location status in North Star
- desktop-side ingestion path for North Star location events
- removal of Telegram as required location dependency

Done when:

- North Star fully replaces Telegram for location ingestion in normal product use

### Phase 4: Live audio

Build:

- live signaling between phone and PC
- microphone and speaker handling
- transcript stream
- spoken reply playback
- multi-turn conversation state

Preferred media direction:

- WebRTC first

Done when:

- a real mobile conversation works between phone and NeuralTrainer PC

### Phase 5: Post-call learning

Build:

- post-call summary
- helpful / mistimed / intrusive / welcome feedback
- memory shaping from calls
- call review history

Done when:

- calls improve NeuralTrainer memory and judgment

## Security Model

North Star must use explicit device binding.

That means:

- user logs into North Star
- user pairs a desktop NeuralTrainer node
- server issues a desktop-specific credential
- desktop uses that credential for websocket/authenticated transport

This allows:

- revoking a desktop
- adding another desktop later
- keeping user auth separate from device identity

## Data Boundaries

### Stays in NeuralTrainer

- memory model
- raw local judgment traces
- saved moments
- transcript intelligence
- model settings
- local voice/STT settings

### Lives in North Star

- auth/session data
- push subscriptions
- device bindings
- message delivery state
- call signaling state
- post-call review records
- location transport state
- location permission state
- uploaded location event batches awaiting desktop ingestion if needed

North Star should store only what it needs to coordinate and present the mobile experience.

## Immediate Build Recommendation

Start by creating North Star as a separate app skeleton using Youniverse as the reference.

The first implementation slice should be:

1. North Star backend scaffold
2. North Star frontend/PWA scaffold
3. deploy script and jail plan
4. secure desktop binding and heartbeat
5. location capability and upload foundation

This proves the architecture before we build chat or call behavior.

## Practical Rule Going Forward

When we need a feature in North Star, we should ask:

- "How did Youniverse solve this?"

Then copy the pattern if it fits.

We should not ask:

- "How do we put this inside Youniverse?"

## Final Direction

NeuralTrainer will not hitch a ride inside Youniverse.

North Star will be a dedicated companion app informed by Youniverse, deployed separately, and built specifically for NeuralTrainer's outside-the-home call and companion experience.
