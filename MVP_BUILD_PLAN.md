# MVP Build Plan

## Purpose

This document turns the project foundation into the first concrete implementation plan.

It is not meant to cover the whole future system.
It is meant to answer:

- what we build first
- in what order
- what each milestone must prove
- when version 1 is meaningful enough to stop as an MVP build

## MVP goal

Build a local-first desktop companion that can:

- observe basic life rhythm
- remember meaningful places and boundaries
- detect a small set of potentially meaningful pauses or departures
- decide whether to stay silent or send a Telegram message
- explain lightly why it reached out
- learn from your feedback

For the MVP, this is enough.

It does not need:

- live voice calls
- rich map intelligence
- broad task automation
- deep emotional modeling
- perfect judgment

## MVP success test

The MVP is successful if it can create at least one real moment where:

- something in life happens
- the system notices it
- the message feels specific and justified
- you feel more accompanied than interrupted

If that does not happen, the MVP is not done, even if the code technically works.

---

## Milestone 1: Local App Skeleton

Build:

- Tauri app shell
- React frontend
- Rust backend commands
- SQLite setup
- settings storage
- log or diagnostics view

Deliverables:

- app launches locally
- database file is created
- settings can be saved and loaded

Done means:

- the app runs on your machine without external paid services
- you can inspect whether local state is being stored

---

## Milestone 2: Manual Memory Foundation

Build:

- meaningful places UI
- boundaries UI
- protected time and likely sleep settings
- manual reflection entry
- memory inspection view

Deliverables:

- you can add and edit places
- you can define “do not reach out” rules
- you can add notes like:
  - this place matters
  - this week feels heavy
  - do not bring this topic up

Done means:

- the companion has a first personal shape before any automatic inference

---

## Milestone 3: Passive Context Capture

Build:

- location input path
- movement vs stillness detection
- place visit recording
- repeated place detection
- likely sleep inference

Deliverables:

- raw visits saved in SQLite
- repeated places recognized
- simple timeline visible in the app

Done means:

- the system can tell where you have been, how long you stayed, and what repeats

Important note:

- do not build outreach yet
- first prove the context collector works

---

## Milestone 4: Saved Moments Only

Build:

- basic rhythm baseline
- unusual pause detection
- meaningful departure detection
- silent saved moments

Deliverables:

- the system can quietly store moments such as:
  - long pause
  - meaningful place exit
  - unusual return
  - rhythm break

Done means:

- the system shows early discernment without interrupting you

This is the first emotional checkpoint:

- do the saved moments feel plausibly relevant
- or do they already feel noisy and dumb

If they feel dumb here, do not move on yet.

---

## Milestone 5: Telegram Messaging

Build:

- Telegram bot connection
- outbound message sending
- message history
- reply capture
- cooldown rules
- sleep/protected enforcement

Deliverables:

- the app can send a message to you through Telegram
- the message is linked to a saved moment
- replies are stored

Done means:

- the system can reach you reliably
- without violating obvious boundaries

---

## Milestone 6: Grounded Message Drafting

Build:

- structured message composer in Rust
- optional LM Studio phrasing pass
- message reasoning template:
  - what it noticed
  - why it stood out
  - uncertainty
  - invitation

Deliverables:

- messages mention the actual context
- messages do not sound generic
- messages do not sound managerial

Done means:

- the message feels like it saw something
- not like it generated motivational filler

This is the core milestone of the MVP.

---

## Milestone 7: Feedback Loop

Build:

- outreach feedback UI
- “this was right” / “this was off” handling
- reinforcement and softening rules
- memory updates from message outcomes

Deliverables:

- you can review recent outreach
- you can mark it as:
  - helpful
  - mistimed
  - intrusive
  - welcome
- future confidence changes based on that feedback

Done means:

- the system is no longer static
- it begins learning trust

---

## Milestone 8: Review Surface

Build:

- saved moments list
- outreach history list
- memory inspection view
- place significance view
- rule and boundary editor

Deliverables:

- you can see what it noticed
- you can see why it reached out
- you can see what it thinks matters
- you can correct it

Done means:

- the system is inspectable
- not a hidden black box

---

## MVP stop line

Stop after milestone 8 for the MVP build.

Do not expand the MVP scope just because later phases are exciting.

At that point, ask:

- did it reach out well at least once
- did it respect silence
- did it feel personal enough to keep on
- did it increase trust or irritation

If the answer is not good enough, improve message quality and judgment first.

If the answer is good enough, the product can move into later build versions such as:

- call requests
- post-moment memory growth
- richer discernment
- voice / live conversation

Longer lived validation can still be deferred until those later intended build phases are functionally present.

---

## Explicitly deferred after MVP

Not part of the MVP:

- call requests
- live voice conversation
- emergency safety feeds
- weather or public event context
- richer place semantics
- deep emotional inference
- large-scale memory sophistication

These only come later if the MVP already feels real.

---

## Suggested implementation order inside the codebase

1. Tauri app + SQLite
2. settings and rules
3. places and reflections
4. visit logging
5. saved moment generation
6. Telegram integration
7. message composer
8. feedback loop
9. review UI

This keeps the project moving from:

- foundation
- to observation
- to restraint
- to outreach
- to learning

instead of jumping too early into “smart” behavior

---

## Hard rule during MVP

Any feature that makes the system:

- noisier
- less explainable
- more invasive
- more assistant-like
- or more dependent on paid services

should be rejected for now.
