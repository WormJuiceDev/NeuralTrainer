# Build Sequence Checklist

## Purpose

This checklist turns the MVP build plan into a direct execution sequence.

The goal is to remove ambiguity.
Each item should be something that can be built, checked, and then moved on from.

This is the checklist to use when the actual build starts.

---

## Phase 0: Repository and App Skeleton

- [ ] Create a new Tauri + React + TypeScript project
- [ ] Set up Rust workspace structure for app logic
- [ ] Add SQLite dependency and choose database library
- [ ] Add a basic app settings store
- [ ] Add a diagnostics/log panel in the UI
- [ ] Confirm the app launches locally on this machine
- [ ] Confirm settings can be written and read locally

Done means:

- the app runs
- local persistence works
- there is a place to inspect state

---

## Phase 1: Manual Memory Foundation

- [ ] Create settings screen
- [ ] Add timezone setting
- [ ] Add likely sleep window settings
- [ ] Add outreach preference settings
- [ ] Add emergency setting toggle
- [ ] Create boundaries screen
- [ ] Add protected time rule entry
- [ ] Add blocked topic rule entry
- [ ] Add call allowed / not allowed setting
- [ ] Create meaningful places screen
- [ ] Add manual place creation
- [ ] Add place editing
- [ ] Add place notes
- [ ] Create manual reflection screen
- [ ] Add “this mattered” reflection entry
- [ ] Add “this week feels heavy / beautiful / uncertain” reflection entry
- [ ] Add “do not bring this up” reflection entry
- [ ] Create memory inspection view

Done means:

- you can manually shape the companion before it starts inferring

---

## Phase 2: Passive Context Capture

- [ ] Define location input format
- [ ] Implement local event ingestion for location updates
- [ ] Record raw location events
- [ ] Detect movement vs stillness
- [ ] Create place visit records from raw movement/location
- [ ] Detect repeated places
- [ ] Infer likely sleep windows from time patterns
- [ ] Show visit history in the UI
- [ ] Show repeated places in the UI
- [ ] Show inferred sleep window in the UI

Done means:

- the system can tell where you have been
- how long you stayed
- and what repeats

---

## Phase 3: Saved Moments

- [ ] Implement simple weekly rhythm baseline
- [ ] Implement unusual pause detection
- [ ] Implement meaningful departure detection
- [ ] Implement unusual return detection
- [ ] Create saved moment records
- [ ] Mark saved moments as silent by default
- [ ] Build saved moments list in UI
- [ ] Let saved moments show:
  - [ ] what was observed
  - [ ] why it stood out
  - [ ] confidence

Done means:

- the system notices plausible moments without interrupting yet

Checkpoint:

- [ ] review whether saved moments feel relevant rather than noisy

---

## Phase 4: Telegram Connection

- [ ] Create Telegram bot configuration settings
- [ ] Store Telegram chat/user identifiers
- [ ] Implement outbound message sending
- [ ] Implement message delivery logging
- [ ] Implement inbound reply capture
- [ ] Link replies to outreach events
- [ ] Add Telegram connection test button
- [ ] Confirm a message can be sent from the app to Telegram

Done means:

- the app can reach you reliably through Telegram

---

## Phase 5: Message Decision Path

- [ ] Implement message cooldown rules
- [ ] Implement sleep/protected-time enforcement
- [ ] Implement medium-confidence threshold for message outreach
- [ ] Link saved moments to outreach candidates
- [ ] Suppress low-confidence moments
- [ ] Create outreach event records
- [ ] Show outreach history in the UI

Done means:

- the system can decide message vs silence using deterministic rules

---

## Phase 6: Grounded Message Composer

- [ ] Build structured message generator in Rust
- [ ] Ensure messages include:
  - [ ] what was noticed
  - [ ] why it stood out
  - [ ] uncertainty
  - [ ] invitation or room for silence
- [ ] Prevent generic motivational wording
- [ ] Prevent managerial wording
- [ ] Add optional LM Studio drafting/rewrite pass
- [ ] Store final sent text in outreach history

Done means:

- messages feel like they came from observed context
- not from vague “wise AI” phrasing

Checkpoint:

- [ ] review real example messages before enabling automatic send

---

## Phase 7: Feedback Loop

- [ ] Add outreach feedback controls in UI
- [ ] Add “helpful” feedback
- [ ] Add “mistimed” feedback
- [ ] Add “intrusive” feedback
- [ ] Add “welcome” feedback
- [ ] Link feedback to outreach events
- [ ] Adjust confidence weighting based on feedback
- [ ] Reinforce or weaken place significance accordingly
- [ ] Reinforce or weaken outreach timing patterns accordingly

Done means:

- the system can begin learning trust from your responses

---

## Phase 8: Review Surface

- [ ] Build memory items list
- [ ] Build place significance view
- [ ] Build saved moments detail view
- [ ] Build outreach history detail view
- [ ] Show why the system thought a moment mattered
- [ ] Allow correction of:
  - [ ] place meaning
  - [ ] outreach quality
  - [ ] blocked topics
  - [ ] protected times
- [ ] Allow marking a place as meaningful or not meaningful

Done means:

- the system is inspectable and corrigible

---

## MVP Reality Check

Before moving beyond MVP, confirm:

- [ ] it has sent at least one message that felt justified
- [ ] it has respected sleep and protected times
- [ ] it has stayed quiet when it should
- [ ] it has learned from at least some feedback
- [ ] it feels more like presence than notification spam

If any of those are not true:

- [ ] do not build calls yet
- [ ] improve judgment, message quality, or boundaries first

---

## Explicitly Deferred

Do not start these during the MVP build:

- [ ] live voice calling
- [ ] emergency safety feed integration
- [ ] weather awareness
- [ ] calendar integration
- [ ] biometrics
- [ ] rich place classification
- [ ] deeper emotional inference
- [ ] autonomous tool use

These only come later if the MVP already feels real.
