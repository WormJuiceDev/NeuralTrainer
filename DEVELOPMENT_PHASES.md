# Development Phases

## Purpose

This document defines the build order for the product build phases of the life companion.

The goal is not to build a giant system all at once.
The goal is to build only enough, in the right order, to reach the first meaningful full-featured lived test.

Each phase should produce something usable and emotionally testable.

Important sequencing note:

- lived validation is not the same thing as phase completion
- the build phases should complete the intended feature surface first
- longer real-life validation happens after the core planned feature runway is functional

## Phase 0: Project Skeleton

Purpose:

- create a clean Rust + React + Tauri workspace
- set up SQLite
- define the first core data models
- create a minimal desktop shell

This phase should produce:

- a running desktop app
- a local database
- basic settings/config handling
- a place to inspect logs and state

This phase should not include:

- Telegram integration
- location logic
- local model reasoning
- outreach decisions

Success means:

- the project runs locally
- data can be stored and loaded
- the app has a clean base for the next phases

## Phase 1: Memory and Manual Input

Purpose:

- let the system begin as something you can teach directly
- create the first stable memory model before adding automatic inference

Build:

- boundary storage
- meaningful place storage
- manual reflection entry
- manual event tagging
- outreach feedback storage
- sleep/protected-time settings

This phase should produce:

- a UI where you can enter:
  - places that matter
  - things that matter
  - things it should avoid
  - whether past outreach felt right or wrong
- persistent memory records in SQLite

Why this phase matters:

- it gives the companion a shape before it starts guessing
- it reduces the chance of building a “smart” system with no personal grounding

Success means:

- the app can remember meaningful personal context
- you can inspect and edit that context directly

## Phase 2: Passive Context Collection

Purpose:

- allow the companion to observe basic life rhythm without reaching out yet

Build:

- time-of-day tracking
- weekly rhythm tracking
- simple location ingestion
- movement vs stillness detection
- likely sleep window detection
- repeated-place detection

This phase should produce:

- a passive timeline of:
  - where you were
  - how long you stayed
  - whether you were moving or still
  - which places repeat
  - likely sleep windows

This phase should not yet include:

- messages
- calls
- life interpretation

Success means:

- the system can form a baseline of your rhythm
- it can detect repeated places and unusual pauses
- it can do that locally and cheaply

## Phase 3: Place and Pattern Meaning

Purpose:

- turn raw context into early meaning without yet interrupting you

Build:

- place significance scoring
- repeated return detection
- meaningful deviation detection
- “saved moment” creation
- low-confidence vs medium-confidence distinction

This phase should produce:

- silent saved moments such as:
  - unusual long pause
  - meaningful place exit
  - new place with repeat return potential
  - shift away from normal weekly rhythm

Important:

- this phase should store moments quietly
- it should not message or call yet

Success means:

- the companion starts showing that it can notice something
- without risking trust through premature interruption

## Phase 4: Telegram Messaging

Purpose:

- introduce the first real outward behavior in the gentlest form

Build:

- Telegram bot integration
- outbound message delivery
- response capture
- message cooldown rules
- protected-time enforcement

Use deterministic logic first:

- only message for medium-confidence moments
- include light reasoning in the message
- allow easy user feedback afterward

This phase should produce:

- real Telegram messages that:
  - mention what was noticed
  - explain why it stood out
  - acknowledge uncertainty
  - do not demand a response

Success means:

- messages arrive reliably
- they feel specific rather than generic
- they are rare enough not to become noise

## Phase 5: Local Model Reflection Layer

Purpose:

- make the companion sound more alive and context-aware without turning the model into the system controller

Build:

- LM Studio integration
- prompt formatting from context + memory + boundaries
- drafting and rewriting of messages
- post-interaction reflective summaries

The local model should help with:

- tone
- interpretation
- gentle reflection
- summarizing what a moment meant

The local model should not control:

- whether outreach is allowed
- sleep rules
- protected zones
- emergency rules
- message frequency

Success means:

- messages sound grounded and personal
- the companion’s language improves without sacrificing trust

## Phase 6: Call Request Layer

Purpose:

- add the first deeper form of outreach

Build:

- call-request decision path
- call-request message phrasing
- acceptance/decline handling
- stronger confidence threshold
- stricter cooldowns than regular messages

This phase should produce:

- “Can I call you for a moment?” style outreach
- context-aware justification for why it is asking
- memory updates from yes/no response

This phase does not yet require full live voice integration.

Success means:

- the companion can ask to enter a moment
- and the request feels earned rather than intrusive

## Phase 7: Post-Moment Memory Growth

Purpose:

- help the system become more personal over time

Build:

- memory reinforcement rules
- memory decay rules
- “confirm before keeping” handling for sensitive memory
- outreach success/failure learning
- repeated place meaning growth

This phase should produce:

- a companion that becomes more shaped by your real life
- not just more data-heavy

Success means:

- it remembers better over time
- but does not become creepy or bloated

## Phase 8: Optional Safety Layer

Purpose:

- add the one justified no-permission interruption path

Build only if it can be done:

- from reliable no-cost nearby safety signals
- with clear geographic relevance
- without recurring service cost

This phase should produce:

- nearby danger awareness
- emergency override for calls or urgent messages

Success means:

- the feature is trustworthy and rare
- otherwise it should be excluded

## Phase 9: Voice / Live Call Experiment

Purpose:

- build the first real spoken interaction loop before long lived validation begins
- test whether a real spoken interaction adds enough value to justify complexity

Build only after the message and call-request system already feels meaningful.

Possible pieces:

- Telegram-compatible handoff flow
- local speech-to-text
- local model response generation
- text-to-speech
- post-call summary into memory

This phase is intentionally late because:

- it adds complexity fast
- it is not needed to prove the core idea
- it should be earned by earlier phases

Success means:

- a call feels like companionship
- not like a demo of voice technology

## Post-Build Lived Validation

Purpose:

- use the fully built companion in real life for long enough to discover what breaks, what drifts, and what actually feels welcome

This stage begins only after the planned build phases are functionally present, including voice / live call experimentation if that is part of the intended product.

Build:

- no major new feature surfaces
- only debugging, tuning, reflection, and correction from lived use

Success means:

- real-life tempo reveals refinement work rather than missing core capability

## Development Rule

Do not start a later phase just because it is exciting.

A phase is ready only when the previous one has produced something that feels:

- stable
- respectful
- emotionally believable

## First Real Milestone

The first milestone worth caring about is not live calling.

It is this:

- the companion notices a meaningful moment
- sends a specific Telegram message
- the message feels justified
- and afterward you feel more accompanied than interrupted

If that does not happen, the later phases do not matter yet.
