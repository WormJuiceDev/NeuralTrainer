# North Star Call Readiness Re-Plan

## Why this re-plan exists

The current setup-tone and opening-greeting work is failing because the underlying call state model is wrong.

We are still treating:

- `call accepted`

as if it already means:

- the conversation is live
- NeuralTrainer can already speak
- North Star may already listen for the next user turn

That assumption is false.

The result is the exact broken behavior we are seeing:

- the setup tone starts, then stops too early
- the UI jumps to the live call screen before the assistant is actually ready
- the opener handshake can stall
- North Star waits in a non-ready state
- user speech is ignored because turn capture is still gated behind the unfinished opening path

This is not a small bug.
It is a state-machine design problem.

---

## Observed failure

Current observed behavior:

1. user starts or accepts a call
2. North Star correctly moves into the call screen immediately
3. setup tone only plays briefly
4. opener path does not complete reliably
5. phone waits in a half-live state
6. turn capture remains blocked
7. `turns sent` stays at `0` while the user is speaking

That means the current flow has a dead zone between:

- "the call request was acknowledged"

and:

- "the assistant voice path is actually ready"

Right now that dead zone is not modeled explicitly, so the UI and logic fall into it.

---

## Root cause

The current implementation still conflates three separate moments:

1. call request accepted
2. live transport connected
3. assistant voice path ready

Those must become separate states.

Until they are separate, North Star cannot know when to:

- keep playing setup tone
- stop playing setup tone
- allow user speech
- ask the desktop for an opener
- fall back safely if the opener fails

---

## The correct model

Version 6 should use a stricter call lifecycle.

## Required phone-visible phases

North Star should model these phases explicitly:

- `ringing`
- `connecting_transport`
- `arming_assistant`
- `assistant_opening`
- `ready_for_user`
- `user_speaking`
- `assistant_processing`
- `assistant_speaking`
- `ended`

The important change is this:

`accepted` must no longer mean "the conversation is live."

It should only mean:

- the user wants to take the call
- keep the phone on the call screen
- continue setup until the assistant is truly ready

---

## New product rule

For outbound phone-started calls:

- the phone should switch to the call screen immediately
- that call screen should still behave like a normal call is connecting
- the setup tone should continue until NeuralTrainer is actually sending the opener
- the call should only become `ready_for_user` after that opener completes

For inbound accepted calls:

- the user may accept the call request
- and the phone should immediately show the call screen
- but that still should not imply that the assistant can hear speech yet
- the call screen should remain in a connecting/arming state until the assistant path is ready

---

## What needs to change

## 1. Separate transport readiness from conversation readiness

Build:

- `transport_connected` as an internal technical fact
- `conversation_ready` as the product-level fact
- `conversation_ready` only becomes true after:
  - WebRTC/data channel is established
  - desktop call session is bound
  - assistant opening decision is complete
  - opener audio is available or opener is intentionally skipped

Done means:

- the call screen does not switch into listening mode just because the peer connected

---

## 2. Stop using current call acceptance as the pickup moment

Build:

- switch to the call screen immediately after accept/start
- keep that call screen in a connecting state after accept/start
- do not show the true live listening state yet
- do not arm turn capture yet
- do not let `callLoopState` move to `listening` yet

Done means:

- the phone is already on the call screen, but it still behaves like it is "connecting the line" until the assistant is genuinely ready

---

## 3. Make setup tone own the entire pre-ready period

Build:

- tone starts on user gesture for outbound calls
- tone continues on the call screen throughout:
  - pending
  - transport connecting
  - desktop session binding
  - opener preparation
- tone stops only when:
  - NeuralTrainer starts sending opener speech, or
  - the system explicitly transitions into `ready_for_user`, or
  - the call fails/ends

Done means:

- no dead air before the assistant is actually ready

---

## 4. Move opener to a deterministic path

The current opener attempt mixed:

- peer-media assumptions
- local playback assumptions
- session-binding timing assumptions

That is too fragile for the first line of the call.

Build:

- desktop receives a specific `open_call_now` request
- desktop synthesizes the opener line first
- desktop sends the opener audio back over the data channel as a dedicated payload
- phone plays that payload locally
- phone acknowledges opener playback finished
- only then does phone transition to `ready_for_user`

Done means:

- the opener is a deterministic handshake, not a best-effort side effect

---

## 5. Add explicit failure escape routes

Right now the opener path can stall and block everything.

Build:

- opener synthesis timeout
- opener delivery timeout
- opener playback timeout
- fallback rule:
  - if opener fails, mark opener skipped
  - move to `ready_for_user`
  - do not leave the call stuck in `assistant_opening`

Done means:

- the user is never trapped in a dead state where the assistant neither speaks nor listens

---

## 6. Re-arm turn capture only after readiness

Build:

- phone mic/VAD capture must not start automatically during:
  - connecting_transport
  - arming_assistant
  - assistant_opening
- phone mic/VAD capture begins only in:
  - `ready_for_user`
  - or later turn-taking states after assistant speech ends

Done means:

- `turns sent = 0 while user speaks` can only happen if the call is honestly not ready yet

---

## 7. Make the UI reflect the real phase

Build:

- connecting screen copy:
  - "Connecting the line"
  - "Hold on while NeuralTrainer joins"
- opening copy:
  - "NeuralTrainer is joining the conversation"
- ready copy:
  - "Speak naturally"

Do not show:

- "North Star is listening"

until `ready_for_user` is true, even though the user is already on the call screen.

Done means:

- the phone never lies about when speech is actually possible

---

## Concrete implementation order

## Step 1: Introduce explicit mobile phase enum

Replace the current overloaded `callLoopState` usage for pre-live setup with a clearer phase model:

- `connecting_transport`
- `arming_assistant`
- `assistant_opening`
- `ready_for_user`
- `assistant_processing`
- `assistant_speaking`

Do this before any more tone/opener tweaks.

---

## Step 2: Gate the call screen on conversation readiness

Keep the accepted call overlay, but render it as a connecting experience until `ready_for_user`.

Do not start hands-free recording in accepted state by default.

---

## Step 3: Implement dedicated opener payload

Add a dedicated live-channel message pair:

- `live_opening_audio`
- `live_opening_finished`

This should be separate from:

- live turn reply messages

because the opener is a lifecycle event, not a reply to user speech.

---

## Step 4: Add opener failure timeout and forced transition

If opener fails:

- log it
- stop setup tone
- move to `ready_for_user`
- start listening

This prevents another deadlock.

---

## Step 5: Only after that, revisit streaming replies

Streaming reply work should wait until the first-call setup lifecycle is correct.

Otherwise we will be stacking a more complex reply pipeline on top of a broken readiness model.

---

## What should be reverted or simplified from the current attempt

The current attempt introduced good ideas, but some of it should be simplified before continuing:

- stop relying on `accepted` as a proxy for "picked up"
- stop treating opener completion as a side effect of general reply playback
- stop mixing peer-media playback assumptions into the opener path
- stop allowing setup tone ownership to depend on several loosely related booleans

The next pass should be more explicit and less clever.

---

## Success test for this re-plan

The call setup flow is correct only if:

1. user starts or accepts a call
2. phone switches to the call screen immediately
3. that call screen remains in a connecting state
4. setup tone continues
5. desktop prepares opener
6. opener audio begins sending and the setup tone stops
7. opener plays on the phone
8. only after opener completion does the UI switch to listening
9. speaking after that immediately produces turn activity

If any of those fail, the system should either:

- remain honestly in `connecting`

or:

- move into `ready_for_user`

but it must never sit in a half-live dead state again.

---
