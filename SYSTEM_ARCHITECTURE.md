# System Architecture

## Goal

Build a small, local-first life companion that can:

- observe a limited set of context signals
- remember what matters over time
- decide whether to stay silent, message, or ask to call
- use a local model to shape interpretation and tone
- communicate through Telegram

The first version should stay narrow, trustworthy, and zero-recurring-cost.

## High-level architecture

The system has five core layers:

1. **Input layer**
2. **Memory layer**
3. **Judgment layer**
4. **Companion layer**
5. **Interface layer**

---

## 1. Input layer

This layer gathers the first-version inputs.

### Inputs

- location context
- movement context
- time context
- manual reflection input
- communication response context

### Sources

- phone-shared location or Telegram location updates
- local device time and sleep heuristics
- simple behavioral pattern tracking from location history
- manual notes or tags entered in the UI
- Telegram message/call response events

### Responsibility

- collect raw signals
- normalize them into usable events
- avoid overcollection
- remain local-first

---

## 2. Memory layer

This layer stores the companion’s understanding of life patterns.

### Storage

- SQLite database

### Memory categories

- stable memory
- evolving memory
- short-lived memory
- sensitive memory

### Responsibility

- persist meaningful places and boundaries
- track repeated patterns and deviations
- record outreach history
- store manual reflections
- age or decay short-lived memory
- require confirmation before promoting sensitive inferences

---

## 3. Judgment layer

This is the core decision engine.

It decides:

- whether a moment is worth noticing
- whether it should stay silent, message, or ask to call
- whether the moment is protected and should be left alone

### Inputs used by judgment

- current location and movement
- weekly rhythm baseline
- known meaningful places
- recent emotional or reflective context
- outreach history
- sleep/protected rules
- confidence level

### Responsibility

- infer significance from accumulated context rather than single triggers
- enforce boundary rules
- compute confidence
- choose the appropriate outreach mode
- reject outreach when confidence is low or trust would be harmed

### Important principle

The judgment layer should be mostly deterministic code, not free-form model behavior.

---

## 4. Companion layer

This layer shapes how the system speaks and remembers after interaction.

### Uses local model for

- interpreting a moment in human language
- drafting a message or call request
- choosing tone
- reflecting after an interaction
- helping summarize what the moment meant

### Does not control

- whether outreach is allowed
- sleep boundaries
- protected zones
- hard rules
- safety gating

### Responsibility

- turn structured context into respectful language
- avoid vague, generic “wise AI” phrasing
- lightly reveal reasoning so the outreach feels grounded
- help store a useful reflection afterward

---

## 5. Interface layer

This is how you interact with the companion.

### User-facing channels

- Telegram message
- Telegram call request
- desktop app for review, settings, memory, and reflection

### Desktop app responsibilities

- configure boundaries
- inspect memory
- define meaningful places
- review recent outreach
- add manual reflections
- mark outreach as helpful or unhelpful
- inspect why the system thought something mattered

---

## Main flow

1. Inputs arrive from location, time, and behavior.
2. The input layer converts them into normalized events.
3. The memory layer updates recent context and retrieves relevant history.
4. The judgment layer evaluates whether this is a meaningful moment.
5. If the answer is no, the system stays silent or stores a silent moment.
6. If the answer is yes, it chooses message or call request.
7. The companion layer drafts the outreach using structured context.
8. The outreach is sent through Telegram.
9. Your response is recorded.
10. The memory layer updates what was learned from the interaction.

---

## First-version modules

### A. Context collector

Tracks:

- current location
- movement/stillness
- time of day
- day of week
- likely sleep

### B. Place engine

Tracks:

- known meaningful places
- revisited places
- rough place meaning
- place-based pattern history

### C. Rhythm engine

Tracks:

- recurring weekly pattern
- deviations from normal rhythm
- unusual pauses and transitions

### D. Memory engine

Tracks:

- boundaries
- reflections
- meaningful recent events
- outreach success/failure
- place significance over time

### E. Judgment engine

Decides:

- silent save
- message
- ask to call
- no outreach

### F. Language engine

Uses the local model to produce:

- messages
- call requests
- reflective summaries

### G. Telegram connector

Handles:

- sending messages
- asking to call
- receiving replies

### H. Desktop review app

Lets you:

- inspect memory
- configure boundaries
- add reflections
- review what the system learned

---

## Zero-cost architecture rule

The architecture should depend only on:

- local runtime
- local storage
- free data sources
- local model inference
- Telegram as the communication channel

If a component needs a paid service, it does not belong in the first-version core.

---

## First-version trust rule

The system should be designed so that:

- silence is always an option
- every interruption is explainable
- memory is earned
- boundaries override cleverness
- trust matters more than feature count
