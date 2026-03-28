# Version 6 Plan

## Purpose

Version 6 is the live-call experience pass.

Version 5 got North Star onto a stable live call path.
The phone and desktop can now establish a relay-backed live session, keep the call open, and handle multiple spoken turns in one call.

What Version 5 did not finish is the feeling of a real phone conversation.

The remaining gap is now mostly experiential:

- the call sounds silent while the connection chain is still booting
- the UI can imply the user may already speak before the system is truly ready
- replies are still whole-turn, not incremental streaming
- the assistant does not proactively open the conversation once the call is actually ready

Version 6 should turn the now-stable live path into a call flow that feels intentional, immediate, and understandable.

---

## Current reality

North Star now reliably handles:

- call request and accept
- live relay-backed WebRTC connection
- active live data channel
- phone-side mic capture for spoken turns
- desktop-side turn processing
- reply playback back to the phone
- multiple spoken turns in one active call

But the lived experience is still:

1. user answers or starts a call
2. North Star appears to be "listening" while setup is still underway
3. there is dead air during connection boot
4. user speaks only after the chain is truly ready
5. NeuralTrainer waits for a full spoken turn
6. NeuralTrainer waits for a full LLM response
7. NeuralTrainer waits for a full TTS render
8. only then does reply playback begin

That means the transport is live, but the call still does not feel like a natural phone conversation.

---

## Version 6 goal

Make North Star calls feel like a real connected call from the first second onward.

The end state should be:

- the phone plays a familiar call-setup tone while the live chain is still connecting
- the tone stops only when the entire conversation path is actually ready
- if the user initiated the call, NeuralTrainer greets first with a short opening line
- user speech is accepted only when the system is genuinely ready for it
- reply generation begins streaming instead of waiting for a full finished answer
- TTS playback begins as soon as early reply audio is available

---

## What Version 6 should add

- explicit pre-live call setup phase
- phone-side setup tone / ringback behavior during connection bootstrap
- clearer readiness gate between "connecting" and "you may speak now"
- automatic short assistant greeting after readiness when the call was user-initiated
- streaming LLM output pipeline for live calls
- incremental TTS generation from streamed assistant text
- chunked reply-audio transport and immediate playback on the phone
- stronger multi-turn state ownership around listen / think / speak transitions

---

## What Version 6 should not add

- dashboard-style debug UX on the phone
- Telegram reintroduction for any call or remote companion path
- more fallback-first logic becoming the default call path
- a settings maze for call behavior
- overly technical readiness language exposed to the user

---

## Core principle

Version 6 should make North Star calls feel:

- obviously connecting
- obviously ready
- obviously conversational
- fast enough that the user stops thinking about the pipeline

Not:

- ambiguous during setup
- silent while booting
- batchy after the user speaks
- dependent on debug knowledge to understand what is happening

---

## Product experience target

The intended user experience for an outbound user-initiated call is:

1. user starts the North Star call
2. North Star shows a connecting state and plays a normal call-setup tone
3. desktop, signaling, live transport, and turn path finish establishing
4. the setup tone stops
5. NeuralTrainer immediately says a short opener such as "Hi, you wanted to talk?"
6. user begins speaking naturally
7. NeuralTrainer starts replying quickly, with playback beginning before the full response is complete

The intended user experience for an inbound accepted call is similar, except the opening greeting may be skipped or made conditional so the assistant does not interrupt an already-purposeful pickup.

---

## Workstream 1: Honest Call Readiness

### Purpose

Separate "call exists" from "conversation path is truly ready."

### Build

- explicit setup phases for:
  - call requested
  - call accepted
  - live transport connecting
  - live turn path ready
  - assistant opening
  - ready for user speech
- one readiness gate shared by phone and desktop logic
- user-facing copy that does not imply the assistant can hear speech before readiness
- prevention of early speech capture while setup is still incomplete

### Done means

- the phone never suggests "speak now" before the full chain is actually ready

---

## Workstream 2: Setup Tone And Opening Greeting

### Purpose

Replace dead air during setup with familiar call behavior.

### Build

- looping phone-call setup tone while the chain is still being established
- deterministic stop conditions for the tone
- guardrails so the tone never overlaps with live assistant speech
- short opener from NeuralTrainer when the user initiated the call
- opener timing tied to true readiness, not merely accepted-call state

### Done means

- outbound calls feel alive immediately, even before live conversation begins

---

## Workstream 3: Streaming Reply Pipeline

### Purpose

Move the assistant reply path from whole-turn batch behavior to incremental speech output.

### Build

- streaming LLM token consumption for live calls
- segmentation rules for when partial text is stable enough for speech
- incremental / chunked TTS generation
- reply-audio chunk transport to North Star as chunks become available
- immediate phone playback of reply chunks with smooth continuation
- end-of-reply markers and cleanup rules

### Done means

- the user begins hearing the assistant speak before the full answer is finished generating

---

## Workstream 4: Live Turn State Machine

### Purpose

Make multi-turn conversation predictable once streaming is introduced.

### Build

- explicit listen / think / speak / interrupt phases
- ownership rules for which side controls each phase
- rules for what happens if the user speaks during assistant playback
- assistant-complete signaling that cleanly returns the system to listening
- timeout and recovery behavior that does not collapse the live call unnecessarily

### Done means

- multiple turns remain stable even after reply streaming is introduced

---

## Workstream 5: Observability Without Phone Debug Drift

### Purpose

Keep enough instrumentation to stabilize the new pipeline without turning the phone UI back into a debug surface.

### Build

- desktop-first diagnostics for streaming stages
- lightweight internal markers for:
  - setup tone active
  - readiness reached
  - opener sent
  - llm stream started
  - first tts chunk ready
  - first audio chunk played
- minimal, user-safe phone wording for connecting vs ready vs speaking

### Done means

- we can debug the stream pipeline without shipping a visibly technical call UI

---

## Suggested build order

### Milestone 1: Readiness model and setup UX

Build:

- explicit call readiness states
- setup tone behavior
- corrected phone copy and readiness gating

Prove:

- the phone no longer invites speech too early
- setup dead air is replaced with an expected call tone

### Milestone 2: Opening greeting

Build:

- outbound-call opener trigger
- safe timing after readiness
- overlap prevention with user speech

Prove:

- once the call is truly ready, the assistant can open the conversation naturally

### Milestone 3: Streaming LLM to TTS bridge

Build:

- streaming LLM output path
- chunkable assistant text units
- incremental TTS generation contract

Prove:

- the first spoken reply audio can begin before full answer completion

### Milestone 4: Phone playback stream

Build:

- chunked reply-audio transport
- immediate playback queue on North Star
- end-of-stream cleanup

Prove:

- the phone hears a progressive reply instead of one delayed finished blob

### Milestone 5: Multi-turn polish on streaming path

Build:

- interrupt-safe listen / think / speak transitions
- second-turn and later-turn validation on the streaming path

Prove:

- a full conversation remains stable while using streaming replies

---

## Engineering notes

Version 6 should assume:

- the stable multi-turn live call path from Version 5 is the base platform
- the phone-side live mic capture path is already good enough to carry turns
- the next latency win will come primarily from the reply side, not from more transport churn

Version 6 should therefore avoid re-litigating:

- TURN availability
- whether North Star should own the remote path
- whether Telegram should return
- whether fallback upload should remain the aspirational experience

Those are already settled.

---

## Open design decisions

These should be resolved early in Version 6:

- how short the setup tone loop should be
- whether inbound accepted calls should also receive an automatic opener
- how partial LLM text should be chunked before being handed to TTS
- whether reply chunks should be sentence-based, clause-based, or latency-window-based
- how interruption should behave once reply streaming has already started

---

## Version 6 success test

Version 6 is successful if:

- an outbound North Star call immediately sounds like a call is being connected
- the phone does not imply readiness before the chain is actually ready
- the setup tone stops at the correct moment
- NeuralTrainer opens the call naturally when appropriate
- reply playback starts quickly enough to feel incremental
- the user can complete multiple turns without the call falling apart
- the experience feels meaningfully closer to a real phone conversation than to a turn-by-turn voice exchange

---
