# Current Version Plan

Status date: 2026-03-29

This file is the active implementation plan from here forward.

The previous detector-and-tectonics phase is now materially complete enough to move on.

## Aim

Move from:

- a companion that can interpret memory and detect life movement

to:

- a companion that can use what it knows to act meaningfully inside lived moments

This phase is about turning life awareness into timely, useful, restrained action.

The goal is not therapy, emotional handholding, or dashboard behavior.

The goal is:

- enriching lived moments while they are happening
- surfacing opportunities before they vanish
- helping orient the user inside changing life phases
- bridging the user back toward the right people when needed
- warning or escalating when reality calls for it
- doing all of this with intelligent pacing

## Baseline We Are Starting From

Already true:

- `NeuralTrainer` is the local Windows companion runtime and brain
- `North Star` is the phone/web/server companion surface
- live calls work in both directions
- realtime phone-to-desktop speech streaming works
- live reply streaming works
- manual companion context exists as a dedicated source of truth
- interpreted memory exists
- detectors exist and accumulate movement across multiple evidence sources
- memory evolution exists
- declared truth and observed truth are both modeled
- divergence, cross-source coherence, and temporal phase movement are modeled
- the user can inspect tectonic movement in the UI
- seeded testing paths exist for support, contradiction, and accumulated movement

So this plan starts after the internal memory-and-tectonics layer has become real enough to trust.

## Core Design Rule

The companion should not act because one event happened.

It should act because:

- it knows something about the user
- it notices the kind of moment the user is in
- it can judge whether the moment calls for silence, suggestion, orientation, warning, or escalation

That means:

- memory informs behavior
- detectors shape timing and confidence
- real-world context matters
- pacing matters
- intervention should feel earned

## Pillar Directions For This Phase

These are not optional alternatives.

They are the pillars of the phase.

### Pillar 1: Lived Moment Enrichment

The companion should notice when a moment has become unusually alive, open, meaningful, or exploratory and help deepen it while it is still happening.

This means it should become capable of:

- noticing when the user is outside normal rhythm
- recognizing when a moment may hold unusual possibility
- surfacing nearby or timely opportunities that could enrich the moment
- making suggestions that widen the moment without hijacking it

Core question:

- how can this moment become more alive, meaningful, fortunate, or memorable if the companion notices the right thing in time?

### Pillar 2: Situational Safeguarding

The companion should notice when the user may need warning, caution, or escalation because of the world around them.

This means it should become capable of:

- monitoring relevant external conditions
- judging whether those conditions matter to this user, in this place, at this time
- choosing whether to stay silent, send a message, or escalate to a call
- being protective without becoming alarmist

Core question:

- is something happening around the user that they may need to know now?

### Pillar 3: Relational Bridging

The companion should notice when the user may need human contact and help bridge them back toward the right people.

This does not mean replacing human relationship.

It means helping restore connection when the moment calls for it.

This means it should become capable of:

- knowing who matters in the user's life
- noticing when a certain kind of contact may help
- suggesting the right person at the right time
- helping the user make that move gently if needed

Core question:

- who or what kind of human contact might actually help right now?

### Pillar 4: Phase Navigation

The companion should notice when life is entering a threshold, drift, rupture, opening, return, or new phase and help orient the user inside it.

This means it should become capable of:

- recognizing that a week or period is different from normal
- distinguishing wobble from sustained phase change
- speaking in ways that help the user orient without overconcluding
- letting timing, tone, and intervention type depend on the phase the user appears to be in

Core question:

- what kind of phase is this, and what kind of companionship does that phase need?

### Pillar 5: Opportunity Guidance

The companion should notice openings that are easy to miss and surface them while they are still real.

This means it should become capable of:

- seeing small windows of possibility
- noticing practical, social, place-based, and emotional openings
- making suggestions while they are still actionable
- helping the user notice what might matter now rather than too late

Core question:

- what is possible right now that might matter if noticed in time?

### Underlying Regulator: Contact Rhythm Intelligence

All pillar behavior should be governed by contact rhythm intelligence.

This is the layer that decides:

- whether to stay silent
- whether to send a light message
- whether to ask permission
- whether to suggest
- whether to orient
- whether to warn
- whether to escalate to a call

This is not a standalone pillar.

It is the pacing and escalation system that makes all the others feel right.

Core question:

- what level of contact is appropriate for this moment?

## Current Version Goals

### Goal 1: Real-World Moment Interpretation

Build the first layer that combines:

- memory
- detector movement
- passive context
- location and timing
- external world signals

into a judgment about what kind of moment the user is currently in.

This should produce internal moment assessments such as:

- ordinary
- exploratory
- open
- vulnerable
- urgent
- protective
- connective
- opportunity-rich
- transition-heavy

These are not final truths.

They are action-shaping readings.

### Goal 2: Actionable Opportunity and Safeguard Detection

Build the first system that can notice:

- meaningful nearby opportunities
- relevant world-state risks
- context-sensitive openings
- time-sensitive warnings

without hardcoding one-off product behaviors.

The system should become capable of producing actionable moment signals such as:

- enrich this moment
- surface this opening
- warn now
- stay quiet
- watch for escalation

### Goal 3: Relational Recommendation Layer

Build the first system that can infer when human contact may matter and which contact may fit the moment.

This should use:

- relational memory
- recent movement
- current phase
- contact history

to shape gentle, grounded bridging behavior.

### Goal 4: Contact Rhythm and Escalation Engine

Build the decision layer that chooses:

- silence
- lightweight message
- soft suggestion
- stronger suggestion
- warning message
- follow-up
- call escalation

This should be sensitive to:

- urgency
- confidence
- user rhythm
- recent contact load
- current phase
- protective boundaries

### Goal 5: North Star Delivery as Lived Intervention

Use `North Star` as the action surface for moment-aware behavior.

That means the system should become able to:

- send useful, timely messages
- escalate to calls when appropriate
- carry relevant context into those messages or calls
- make interventions feel situational rather than generic

The important thing is not just sending something.

It is sending the right kind of contact at the right time.

## System Capabilities Needed In This Phase

This phase should introduce or deepen:

- moment classification from multiple signals
- external-world lookups relevant to place, timing, and safety
- opportunity scoring
- safeguard scoring
- relational bridging scoring
- contact rhythm scoring
- escalation thresholds
- memory-informed action selection
- message generation shaped by moment type
- call escalation shaped by urgency and silence/failure to respond

## Suggested Working Order

### Step 1

Build moment interpretation that combines:

- memory
- detectors
- passive context
- current location/time
- recent phase movement

into action-shaping moment states.

### Step 2

Build the first opportunity and safeguard pipeline that can score:

- enrichable moments
- actionable openings
- urgent warnings

using external context where relevant.

### Step 3

Build relational bridging recommendations from:

- relational memory
- recent strain or isolation
- current life phase
- known meaningful people

### Step 4

Build contact rhythm intelligence and escalation logic so the companion can decide:

- silence
- message
- suggestion
- warning
- call

### Step 5

Expose enough of this in the product so the user can understand:

- what kind of moment the system thinks this is
- why it acted or stayed silent
- what pillar was in play
- what escalation logic led to the behavior

## Completion Condition For This Phase

This phase is complete when:

- the companion can classify lived moments in actionable ways
- the companion can surface meaningful opportunities while they are still live
- the companion can issue relevant warnings when the situation calls for it
- the companion can suggest human reconnection when the moment calls for it
- the companion can pace itself through silence, message, and call escalation intelligently
- `North Star` becomes a real lived-moment intervention surface rather than only a conversation surface
- the user can feel that the system helps them live moments better, safer, or more fully while they are happening

## Update Rule

When this plan changes, update this file directly instead of creating a new numbered version-plan document.
