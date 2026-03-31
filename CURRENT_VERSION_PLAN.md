# Current Version Plan

Status date: 2026-03-30

This file is the active implementation plan from here forward.

The lived-moment delivery phase is now materially complete enough to move on.

## Aim

Move from:

- a companion that can interpret lived moments and act through messages or calls

to:

- a companion that can participate in the real world around the user without paid dependencies

This phase is about giving the companion enough zero-cost world awareness to:

- notice what is nearby
- notice what is changing outside the user
- suggest genuinely interesting nearby openings
- surface real cautions and warnings when the world calls for them
- do so through a cleaner phone experience that behaves like an installable companion app instead of a developer-operated surface

The goal is not tourism spam, map clutter, or generic recommendation behavior.

The goal is:

- grounded nearby discovery while adventuring
- useful weather-aware guidance
- official-warning awareness where feasible
- background-ready phone companionship
- pull-based location awareness that feels invisible and low-friction
- all of it at zero recurring cost

## Hard Constraint For This Phase

Every new real-world input added in this phase must be usable with no paid dependency.

This means:

- no paid map APIs
- no paid weather APIs
- no paid place-discovery APIs
- no paid alerting providers
- no usage-based commercial services

If a source only works for paid production usage, it does not qualify for this phase.

Allowed direction:

- open data
- public feeds
- official no-cost APIs
- careful use of public infrastructure with caching and restraint

## Baseline We Are Starting From

Already true:

- `NeuralTrainer` is the local Windows companion runtime and brain
- `North Star` is the phone/web/server companion surface
- the companion can classify moments, opportunities, safeguards, relational bridges, and contact rhythm
- the companion can stay silent, draft messages, dispatch messages, and hold live calls for manual review
- live calls work in both directions
- realtime phone-to-desktop speech streaming works
- live reply streaming works
- push notifications exist on `North Star`
- phone location can already be sent from `North Star` to `NeuralTrainer`
- user-facing message and call surfaces are now materially coherent enough for first-pass use

So this plan starts after the internal lived-moment and delivery layer has become real enough to trust.

## Core Design Rule

The companion should not merely know where the user is.

It should be able to ask:

- what is actually around the user right now?
- what conditions are active around them right now?
- is any of this worth surfacing?
- is this a moment for enrichment, caution, rerouting, or silence?

That means:

- location is not enough on its own
- the outside world must be modeled explicitly
- nearby suggestions should be filterable and user-shaped
- warnings should come from real public signals where possible
- phone behavior should feel passive and permission-based, not manually operated

## Product Direction For This Phase

This phase has two major tracks that must land together.

### Track 1: Zero-Cost Real-World Presence

The companion should become able to combine the user's current place and movement with free real-world inputs such as:

- nearby points of interest
- nearby natural and cultural features
- local weather
- short-horizon weather change
- daylight state
- air quality
- official public warning signals where available

This is the layer that lets the companion say useful things like:

- there is something genuinely interesting nearby
- rain is likely soon, so this route may stop feeling good
- daylight is running out
- a real warning applies to this area

### Track 2: North Star As A Background Companion App

`North Star` should behave more like an installable companion app and less like a user-operated web control panel.

This means:

- it should be installable from Chrome on Android as a proper PWA
- the user should grant location permission once rather than manage continuous sharing manually
- after permission is granted and the desktop is linked, `NeuralTrainer` should be able to request a location pulse when needed
- `North Star` should remain reachable in the background as much as the platform allows for push, call signaling, and location pulse response

The desired model is:

- user grants permission
- companion asks when it needs a pulse
- phone responds
- user does not babysit live location mode

## Pillar Directions For This Phase

### Pillar 1: Nearby Discovery Worth Suggesting

The companion should be able to notice nearby places that may actually be worth surfacing while the user is out in the world.

This means it should become capable of:

- querying nearby real-world candidates from zero-cost sources
- distinguishing ordinary businesses from genuinely interesting places
- favoring places that fit wandering, exploration, and meaningful discovery
- letting the user define and expand what kinds of places count as interesting

Core question:

- what is near the user right now that may genuinely be worth noticing?

### Pillar 2: Practical World Awareness

The companion should be able to notice world conditions that materially affect whether something is advisable, enjoyable, or worth adjusting.

This means it should become capable of:

- reading current weather and short-horizon change
- noticing wind, rain, cold, heat, poor air quality, and fading daylight
- shaping suggestions according to those conditions
- withholding or redirecting suggestions when the world makes them less fitting

Core question:

- what is happening in the surrounding conditions that changes what makes sense right now?

### Pillar 3: Public Warning Awareness

The companion should be able to react when real public warning signals matter to the user's current area.

This means it should become capable of:

- ingesting no-cost official or quasi-official warning feeds where available
- matching warning geography to the user's context
- distinguishing caution-worthy warnings from ignore-worthy noise
- warning without becoming theatrical or alarmist

Core question:

- is there a real public warning affecting this area that the user should know now?

### Pillar 4: User-Shaped Discovery Filters

The companion should not hardcode one permanent definition of what counts as interesting.

The user should be able to expand and tune discovery filters inside `NeuralTrainer`.

This means it should become capable of:

- showing the current nearby-interest categories
- allowing categories to be enabled, disabled, reordered, or expanded
- allowing the user to add new tags or filter families over time
- using those filters in the real-world discovery scoring pipeline

Core question:

- what kinds of nearby things does this user actually want surfaced?

### Pillar 5: Background Companion Reachability

`North Star` should feel installable, reachable, and low-friction enough that the desktop can rely on it as a living companion surface.

This means it should become capable of:

- presenting as an installable PWA on Android Chrome
- preserving service worker and notification behavior cleanly
- replacing the current user-facing live location controls with a permission-and-pulse model
- supporting desktop-requested location pulses within platform limits

Core question:

- can the phone remain available enough in the background that the companion can quietly do what it needs?

## Current Version Goals

### Goal 1: Real-World Signal Layer

Build the first backend layer for zero-cost external signals using sources such as:

- OpenStreetMap Overpass
- OpenStreetMap Nominatim used sparingly and with cache
- Wikipedia Geosearch
- Open-Meteo
- MeteoAlarm
- KNMI open data where it adds value
- sunrise/sunset data

This should produce normalized external signals such as:

- nearby interesting place candidates
- weather state
- weather shift
- daylight state
- air-quality caution
- public warning candidates

### Goal 2: Nearby Discovery Ranking

Build the first nearby discovery pipeline that can:

- gather nearby candidates
- filter them against user-interest categories
- rank them by relevance, novelty, context, and conditions
- surface only the strongest suggestions

The system should become capable of producing suggestion-ready signals such as:

- nearby worthwhile place
- nearby scenic opening
- nearby cultural point
- nearby nature opening
- nearby curiosity worth a short detour

### Goal 3: Weather And Condition Shaping

Build the first practical world-conditioning layer that can:

- adjust nearby suggestions for weather and daylight
- create caution signals from conditions
- suppress poor-fit opportunities
- reroute a suggestion toward something more suitable

### Goal 4: Warning And Safety Matching

Build the first warning pipeline that can:

- ingest public warning signals
- match them to current user area
- rate urgency and relevance
- choose between silence, caution, warning message, or stronger escalation

### Goal 5: North Star Installability And Pull-Based Location

Rework the phone-side model so:

- `North Star` is installable from Chrome on Android
- the user grants location permission once
- the desktop can request a location pulse when needed
- the user no longer has to manually run live location mode
- the phone remains ready for push, call signaling, and pulse response in the background as much as platform behavior allows

This goal must also become ultra user friendly after the first functional pass.

That means:

- the user should not need to understand sessions, bindings, subscriptions, or setup sequencing
- location pulses should auto-refresh and auto-answer whenever permissions and push are already in place
- the phone should not need manual refreshes to discover pending pulse requests
- setup failures should explain themselves plainly instead of reading like developer/operator states
- the product should feel like a companion app, not a debugging console

### Goal 6: User-Editable Discovery Preferences

Expose nearby-interest filtering in `NeuralTrainer` so the user can:

- inspect the current discovery categories
- enable or disable them
- expand them over time
- shape what counts as interesting nearby

## System Capabilities Needed In This Phase

This phase should introduce or deepen:

- zero-cost external data source adapters
- caching and freshness rules for world signals
- nearby point-of-interest querying
- nearby point-of-interest filtering by category
- user-editable nearby-interest category management
- world-signal normalization
- weather interpretation
- warning interpretation
- distance and walkability heuristics
- suggestion suppression under poor conditions
- desktop-requested location pulse flow
- installable PWA readiness on `North Star`
- background-friendly phone signaling behavior

## Suggested Working Order

### Step 1

Build the real-world signal scaffolding:

- source adapters
- normalized world-signal models
- cache tables and freshness policy
- initial Open-Meteo and daylight integration

### Step 2

Build nearby discovery from zero-cost sources:

- Overpass querying
- Wikipedia Geosearch enrichment
- category filtering
- first ranking pass

### Step 3

Expose user-editable discovery filters in `NeuralTrainer`:

- visible categories
- enable/disable
- expansion path for more filters
- scoring integration

### Step 4

Build warning and condition shaping:

- MeteoAlarm and related warning ingestion
- Dutch-relevant warning handling
- weather-conditioned suggestion shaping
- caution and warning action signals

### Step 5

Rework `North Star` location and installability:

- installable PWA behavior from Chrome on Android
- permission-based location model
- desktop-triggered location pulse flow
- removal of user-managed continuous location controls from the main experience

### Step 6

Use the new world-awareness layer inside the companion experience:

- nearby suggestion generation
- weather-aware reranking
- caution/warning delivery through `North Star`
- call escalation only where truly justified

## Completion Condition For This Phase

This phase is complete when:

- the companion can ingest zero-cost real-world signals reliably enough to use them
- the companion can surface nearby interesting places that are filterable and user-shaped
- the companion can adjust suggestions based on weather, daylight, and other practical conditions
- the companion can react to public warning signals where feasible
- `North Star` is installable from Chrome on Android
- location sharing becomes permission-based and pulse-based rather than a manually toggled continuous mode
- the user can feel that the companion knows not just their inner life and movement, but something real about the world immediately around them

And after the first functional pass is proven, the next cleanup pass must make the onboarding and pulse flow radically simpler so a normal user is not forced into developer-like recovery steps.

## Update Rule

When this plan changes, update this file directly instead of creating a new numbered version-plan document.
