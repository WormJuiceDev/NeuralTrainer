# Version 2 Plan

## Purpose

Version 2 is not about making the companion louder.

It is about making it more trustworthy over time.

Version 1 proved that the system can:

- notice meaningful moments
- stay silent when it should
- send grounded Telegram messages
- ask to call when the moment feels earned

Version 2 should make that system learn more responsibly.

The theme of Version 2 is:

**trustworthy learning**

---

## Version 2 goal

Build a stronger post-moment learning layer so the companion:

- remembers better when something truly keeps mattering
- forgets gracefully when context fades
- asks for confirmation before keeping sensitive interpretations
- becomes more shaped by real outcomes instead of accumulating raw data

This version should deepen the existing companion.

It should not expand into emergency interruption, live voice, or broad assistant behavior.

---

## What Version 2 should add

- memory reinforcement from repeated evidence
- memory decay for stale short-lived context
- explicit confirm / dismiss handling for sensitive memory
- call-request outcome learning
- better explanation of why a memory exists
- stronger review and pruning controls
- automated simulation coverage for memory and learning behavior

---

## What Version 2 should not add

- emergency safety interruption
- live voice calls
- weather or calendar awareness
- broad task automation
- rich external sensors
- deeper psychological interpretation
- anything that increases outreach frequency before learning quality is strong

---

## Core principle

Version 2 should make the companion:

- more earned
- more corrigible
- more adaptive

Not:

- more confident by default
- more talkative
- more invasive

---

## Workstream 1: Finish Phase 7 Properly

### Purpose

Complete the memory growth phase so memory behaves like an evolving relationship, not a database bucket.

### Build

- repeated evolving memory can promote into stable memory
- short-lived memory decays into fading, then archived
- sensitive memory requires explicit confirmation when appropriate
- feedback affects both outreach behavior and memory confidence
- call-request outcomes affect future interpretation and memory weighting
- stale unsupported memory can be pruned without manual cleanup

### Done means

- repeated evidence strengthens memory
- stale context fades without feeling lost or random
- sensitive memory is never silently kept just because it appeared once

---

## Workstream 2: Memory Review UX

### Purpose

Make memory understandable enough that review feels calm and useful.

### Build

- show why each memory exists
- show what source created it
- show whether it is stable, evolving, short-lived, or sensitive
- show what last reinforced it
- show what will make it fade
- allow explicit actions:
  - keep it
  - let it go
  - keep active
  - archive

### Done means

- the user can understand the current memory model without reading code
- correction feels easy and local

---

## Workstream 3: Outcome-Based Learning

### Purpose

Tie memory growth more tightly to actual life outcomes rather than only structural signals.

### Build

- `helpful` feedback can strengthen related outreach patterns
- `mistimed` and `intrusive` feedback can soften related memory and decision weight
- `welcome` feedback can increase trust in similar moments
- accepted vs declined call requests can shape future call confidence
- repeated place meaning can strengthen from successful outreach around that place

### Done means

- the companion changes because of lived interaction
- not just because more rows were stored

---

## Workstream 4: Automation-First Validation

### Purpose

Automate as much of Version 2 as possible so progress does not depend on waiting for real-life tempo.

### Automate aggressively

- reinforcement rules
- decay transitions
- stable-memory promotion
- sensitive-memory confirmation requirements
- sensitive-memory dismissal
- feedback-driven confidence changes
- place-meaning growth
- call-request outcome learning
- memory review actions
- no-op passes where nothing should change

### Keep manual review only for

- whether wording still feels human
- whether a memory feels fair rather than creepy
- whether a confirm / dismiss prompt feels emotionally appropriate

### Required simulation scenarios

- repeated_place_promotes_to_stable_memory
- stale_week_state_fades_then_archives
- sensitive_memory_waits_for_confirmation
- dismissed_sensitive_memory_stays_archived
- helpful_feedback_reinforces_related_memory
- intrusive_feedback_softens_related_memory
- accepted_call_request_increases_future_call_readiness
- declined_call_request_softens_future_call_readiness
- no_new_evidence_causes_no_memory_change

### Required automated checks

- one pass creates only the expected memory items
- stale memories fade only when decay conditions are met
- archived memories are not silently revived
- sensitive memories do not become stable without confirmation or repeated support
- feedback changes are bounded and do not explode confidence
- place significance stays clamped within safe limits

### Done means

- most Version 2 logic can be regression-tested locally
- manual testing is used for judgment and feel, not basic correctness

---

## Suggested build order

### Milestone 1: Memory State Transitions

Build:

- stable promotion rules
- clearer decay lifecycle
- explicit memory-item actions

Prove:

- memory can move between active, fading, archived, and confirmed states cleanly

### Milestone 2: Outcome Learning

Build:

- feedback-to-memory reinforcement rules
- call accept / decline learning
- bounded confidence updates

Prove:

- memory changes because of outcomes, not just inference

### Milestone 3: Review Surface Upgrade

Build:

- better “why this exists” view
- reinforce / fade explanation
- cleaner memory action controls

Prove:

- memory review is understandable without code knowledge

### Milestone 4: Automation Suite

Build:

- Version 2 simulation scenarios
- expanded backend regression suite
- one-click automated validation run

Prove:

- Version 2 can be iterated quickly without waiting on real life

### Milestone 5: Validation Readiness

Build:

- nothing major new
- only small tuning that improves inspectability and correctness
- no dependence on multi-week lived use to declare the build complete

Prove:

- the richer memory model is ready for later lived validation once the broader product surface is complete

---

## Version 2 success test

Version 2 is successful if:

- the memory model becomes more accurate over time
- stale context fades instead of lingering forever
- sensitive memory is clearly confirm-before-keep
- feedback and call outcomes measurably shape future behavior
- the system still feels more respectful than clever

If those are not true, Version 2 is not done.

---

## Final test

At the end of Version 2, the question is:

- "Does the companion now learn in a way that feels earned, understandable, and reversible?"

If yes, then the system is ready to consider later phases.

If not, do not add voice or emergency behavior yet.
