# Version 4 Remaining

## Purpose

This document defines the remaining work for Version 4.

Version 4 is no longer about proving that voice is possible.
That part is already working locally.

The remaining work is about making voice interaction:

- stable
- believable
- inspectable
- ready for the first real Telegram call test

---

## Current status

### Already working

- Kokoro local text-to-speech
- Moonshine local streaming speech-to-text
- local desktop call session start / stop flow
- live transcript during a call
- bounded spoken reply generation
- honest spoken fallback when the model fails
- call session history
- call-derived memory and review surface

### Still incomplete

- multi-turn call polish
- better spoken reply quality under live conditions
- Telegram call transport / handoff path
- stronger post-call correction and learning from spoken exchanges
- automation coverage for the remaining call lifecycle

---

## Remaining workstreams

## Workstream 1: Multi-Turn Conversation Quality

### Purpose

Make repeated call turns feel natural enough that the app is no longer just a working demo.

### Build

- better turn pacing between listening and reply
- stronger handling of short pauses and resumed speech
- cleaner interruption behavior mid-turn
- more reliable preservation of full utterances
- shorter and more natural spoken replies

### Done means

- several turns in a row work cleanly
- the app does not feel fragile after one or two exchanges

---

## Workstream 2: Spoken Reply Reliability

### Purpose

Reduce reply weirdness so the model layer stops being the weakest link in live calls.

### Build

- stronger filtering of unusable live-call replies
- better fallback behavior for model errors
- optional switch to a more suitable spoken-turn model if needed
- explicit handling of playful, warm, factual, and uncertain turn types

### Done means

- a live spoken reply is usually usable
- when it is not usable, the app handles that honestly and gracefully

---

## Workstream 3: Telegram Call Path

### Purpose

Move from local desktop call testing into the actual intended call surface.

### Build

- accepted Telegram call request handoff
- real Telegram-side call/session trigger path
- session state transition from Telegram acceptance into active call
- clear call availability / readiness status in the app

### Important note

This workstream is the gate for the first real Telegram call test.

Without it, the product can only do local desktop voice testing.

### Done means

- the system can move from a Telegram call request to an actual testable Telegram call/session path

---

## Workstream 4: Post-Call Learning and Correction

### Purpose

Make spoken interaction shape memory in a visible and corrigible way.

### Build

- stronger call-summary review
- correction flow for wrong or awkward call summaries
- memory updates from successful vs unsuccessful calls
- memory updates from interrupted, missed, or declined call paths

### Done means

- calls teach the system something useful
- wrong call memory can be corrected easily

---

## Workstream 5: Automation Completion

### Purpose

Automate the remaining non-audio call logic before real-world validation.

### Automate

- accepted call request to active session transition
- missed / interrupted / declined call outcomes
- call-derived memory creation
- sensitive call-memory confirmation
- call cleanup and state reset
- honest fallback on bad model turns

### Keep manual review only for

- whether pacing feels natural
- whether the voice feels believable
- whether the conversation feels welcome

### Done means

- the remaining Version 4 control logic is mostly regression-testable

---

## Release gate for the first real Telegram call test

The first real Telegram call test is ready only when all of these are true:

1. local multi-turn calls are stable across several turns
2. spoken replies are usually usable or honestly recovered
3. Telegram call transport / handoff is implemented
4. post-call review and memory are visible and corrigible
5. remaining non-audio call logic has automated coverage

If any of those are missing, keep testing locally first.

---

## Suggested completion order

1. Multi-turn conversation quality
2. Spoken reply reliability
3. Telegram call path
4. Post-call learning and correction
5. Automation completion

---

## Version 4 complete means

Version 4 is complete when:

- a local call feels coherent across several turns
- a real Telegram call/session can be tested
- spoken failures are handled honestly
- call outcomes become visible memory
- the remaining call control logic is automated enough to trust before lived validation

At that point, the product is ready for the first real Telegram call test.
