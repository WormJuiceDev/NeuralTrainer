# Version 4 Plan

## Purpose

Version 4 is the voice and live-conversation build.

The goal is to make the companion able to enter a moment through an actual spoken exchange before long lived validation begins.

Version 1 proved the core message path.

Version 2 made memory and learning more trustworthy.

Version 3 improved discernment and explainability.

Version 4 should make the companion able to speak and listen in a way that still feels earned.

---

## Version 4 goal

Build the first real call and voice loop so the companion can:

- ask to call
- start a real voice interaction
- hear what is said
- respond in a grounded conversational way
- summarize the call back into memory

This version should make real spoken interaction possible.

It should not yet add emergency interruption or broad assistant behavior.

---

## What Version 4 should add

- call handoff from Telegram or a local call surface
- local speech-to-text
- local text-to-speech
- conversation turn handling
- bounded spoken response generation
- post-call memory summary
- call outcome logging
- automated test harnesses for the non-voice control logic

Current TTS choice:

- Kokoro 82M
- model id `kokoro-82m`
- sample rate `24000`
- default voice `af_heart`

---

## What Version 4 should not add

- emergency safety interruption
- open-ended general assistant tasks
- broad web dependence
- cloud-first voice infrastructure unless truly required
- long autonomous conversations without boundaries
- more outreach frequency by default

---

## Core principle

Version 4 should make the companion:

- more present
- more responsive
- more humanly available

Not:

- more performative
- more chatty
- more agent-like

---

## Workstream 1: Call Handoff and Session Model

### Purpose

Create the transition from a call request into an actual call/session state.

### Build

- call session records
- accepted-call handoff flow
- local session state in the desktop app
- call start / call end logging
- missed / declined / interrupted outcome handling

### Done means

- the system can move from "Would it help if I call?" to a real tracked session

---

## Workstream 2: Local Voice Stack

### Purpose

Give the companion the minimum viable ears and voice.

### Build

- local speech-to-text integration
- local text-to-speech integration
- voice device selection
- input/output diagnostics
- latency and failure visibility

### Done means

- the system can hear and speak locally well enough for testing

---

## Workstream 3: Spoken Conversation Loop

### Purpose

Make live interaction feel like companionship rather than a technical demo.

### Build

- bounded turn-taking
- grounded conversational prompt path
- respect for silence and uncertainty
- simple interruption / stop speaking handling
- short response style tuned for calls rather than text

### Done means

- a short spoken exchange feels coherent and emotionally believable

---

## Workstream 4: Post-Call Memory and Review

### Purpose

Let the system learn from calls without turning them into opaque hidden state.

### Build

- post-call summary capture
- memory updates from call outcomes
- review surface for call history
- explanation of what the system kept from a call
- explicit correction path for sensitive or wrong call summaries

### Done means

- calls shape memory in a way that is visible and corrigible

---

## Workstream 5: Automation Before Lived Validation

### Purpose

Automate everything around calls that can be tested without spending weeks in real life.

### Automate aggressively

- call-request to session-state transitions
- accepted / declined / missed call outcomes
- post-call summary creation rules
- call-derived memory creation
- sensitive call memory confirmation requirements
- session cleanup on interruption or failure
- bounded call confidence updates

### Keep manual review only for

- whether the spoken pacing feels right
- whether the voice feels calm and believable
- whether a call feels welcome instead of theatrical

### Done means

- Version 4 is mostly functionally testable before long real-life use

---

## Suggested build order

### Milestone 1: Call session foundation

Build:

- session records
- runtime call state
- handoff from call request to session

Prove:

- the system can represent real calls cleanly

### Milestone 2: Local voice stack

Build:

- speech-to-text
- text-to-speech
- diagnostics and device controls

Prove:

- local voice IO works reliably enough to test

### Milestone 3: Spoken conversation loop

Build:

- turn-taking
- spoken response generation
- stop / interruption handling

Prove:

- a short call can happen end to end

### Milestone 4: Post-call memory and review

Build:

- summaries
- call outcome learning
- review UI

Prove:

- calls become inspectable memory rather than hidden transcript sludge

### Milestone 5: Automation completion

Build:

- Version 4 simulation and regression coverage for all non-audio control logic

Prove:

- most call behavior is regression-testable before lived validation

---

## Version 4 success test

Version 4 is successful if:

- a call can be requested, accepted, and completed end to end
- the spoken interaction feels grounded rather than gimmicky
- the system stays bounded and respectful during a call
- the call produces a visible, correctable post-call memory trace
- the product is functionally ready for longer lived validation

---

## Final test

At the end of Version 4, the question is:

- "Can the companion now actually enter a moment through voice in a way that feels real?"

If yes, then the product is ready for the longer lived validation stage.
