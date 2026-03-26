# Data Model

## Purpose

This document defines the first-version data model for the life companion.

The goal is not to design a perfect permanent schema.
The goal is to define the minimum set of entities needed to support:

- memory
- rhythm learning
- place meaning
- outreach decisions
- response learning
- manual correction

The schema should stay local-first, inspectable, and easy to evolve.

## Design principles

- keep stable truths separate from temporary context
- store what was observed separately from what was inferred
- make it possible to inspect why the system reached out
- allow memory to decay without deleting important history
- never force sensitive inferences into permanent truth without confirmation

## Core entities

The first version needs these main entity types:

1. settings
2. places
3. place visits
4. rhythm summaries
5. manual reflections
6. memory items
7. saved moments
8. outreach events
9. outreach feedback
10. safety or protected rules

---

## 1. Settings

Purpose:

- store global user and system preferences

Examples:

- timezone
- likely sleep window
- protected hours
- preferred outreach style
- whether emergency interruption is enabled
- Telegram identifiers
- LM Studio endpoint settings

Suggested fields:

- `id`
- `key`
- `value_json`
- `updated_at`

Notes:

- keep this simple and flexible
- a key/value table is enough for version 1

---

## 2. Places

Purpose:

- represent meaningful or repeated locations over time

Examples:

- parents' place
- jam session venue
- coffee place
- discovered bench
- unnamed repeated reflection spot

Suggested fields:

- `id`
- `label`
- `latitude`
- `longitude`
- `radius_meters`
- `place_kind`
- `meaning_kind`
- `is_user_named`
- `significance_score`
- `first_seen_at`
- `last_seen_at`
- `visit_count`
- `is_protected`
- `notes`

Meaning notes:

- `place_kind` is descriptive:
  - home
  - family
  - social
  - nature
  - cafe
  - transit
  - unknown

- `meaning_kind` is relational:
  - belonging
  - reflection
  - discovery
  - return
  - uncertain
  - mixed

Important:

- a place may start unnamed
- meaning should be allowed to evolve over time

---

## 3. Place Visits

Purpose:

- record each visit or stay in a place

This is one of the most important tables because it supports:

- rhythm learning
- repeated return detection
- unusual pause detection
- place significance growth

Suggested fields:

- `id`
- `place_id` nullable
- `started_at`
- `ended_at`
- `duration_seconds`
- `arrival_mode`
- `departure_mode`
- `was_stationary`
- `confidence`
- `raw_context_json`

Examples of `arrival_mode` / `departure_mode`:

- walking
- driving
- unknown

Examples of stored context:

- whether it followed a meaningful visit
- whether it was longer than usual
- whether it happened during a heavy week

Important:

- raw visit history should remain more factual than interpretive

---

## 4. Rhythm Summaries

Purpose:

- store derived baseline patterns for weekly life rhythm

Examples:

- usually at jam session on Wednesday evening
- usually home by late night
- often visits parents on a certain day
- often pauses in certain areas on weekends

Suggested fields:

- `id`
- `pattern_kind`
- `day_of_week`
- `time_window_start`
- `time_window_end`
- `place_id` nullable
- `strength_score`
- `last_reinforced_at`
- `is_active`
- `notes`

Examples of `pattern_kind`:

- recurring_place_visit
- recurring_quiet_period
- recurring_social_period
- recurring_outdoor_period
- recurring_sleep_window

Important:

- this table stores learned summaries, not raw event history

---

## 5. Manual Reflections

Purpose:

- store things you explicitly tell the system

Examples:

- this mattered
- this place means something
- this week feels heavy
- do not bring this topic up
- this outreach felt right

Suggested fields:

- `id`
- `created_at`
- `reflection_kind`
- `text`
- `linked_place_id` nullable
- `linked_moment_id` nullable
- `weight`
- `expires_at` nullable
- `is_sensitive`

Examples of `reflection_kind`:

- meaning
- boundary
- week_state
- correction
- value
- place_note

Important:

- this is one of the main ways the user shapes the companion directly

---

## 6. Memory Items

Purpose:

- store higher-level remembered truths or semi-truths

This table is separate from manual reflections because it includes:

- learned memory
- promoted memory
- confirmed memory

Suggested fields:

- `id`
- `memory_type`
- `content`
- `confidence`
- `source_kind`
- `source_ref_id` nullable
- `status`
- `created_at`
- `updated_at`
- `reinforced_at` nullable
- `decays_after` nullable
- `requires_confirmation`

Examples of `memory_type`:

- stable
- evolving
- short_lived
- sensitive

Examples of `source_kind`:

- manual
- inferred
- outreach_summary
- repeated_pattern

Examples of `status`:

- active
- fading
- archived
- awaiting_confirmation

Important:

- this is the main table for “what the companion thinks it knows”
- keep the source traceable

---

## 7. Saved Moments

Purpose:

- record moments that may matter, even when the system stays silent

Examples:

- unusually long pause in a meaningful place
- leaving parents' place after a long stay
- reflective stop in a newly discovered location
- rhythm break during a heavy week

Suggested fields:

- `id`
- `created_at`
- `place_id` nullable
- `moment_kind`
- `observed_context_json`
- `inferred_significance`
- `confidence`
- `action_taken`
- `was_promoted_to_outreach`
- `resolved_at` nullable

Examples of `moment_kind`:

- long_pause
- meaningful_departure
- unusual_return
- rhythm_break
- possible_reflection

Examples of `action_taken`:

- silent_save
- messaged
- call_requested
- suppressed

Important:

- this is where the system proves restraint
- not every noticed moment should become an interruption

---

## 8. Outreach Events

Purpose:

- store every message, call request, or other outward action

Suggested fields:

- `id`
- `created_at`
- `saved_moment_id` nullable
- `outreach_kind`
- `channel`
- `reason_summary`
- `message_text`
- `confidence`
- `was_delivered`
- `delivery_metadata_json`
- `response_state`

Examples of `outreach_kind`:

- message
- call_request
- emergency_message
- emergency_call

Examples of `response_state`:

- no_response
- accepted
- declined
- replied
- expired

Important:

- every outreach should have a traceable reason
- this table is central for trust review

---

## 9. Outreach Feedback

Purpose:

- store explicit or inferred feedback about how outreach landed

Suggested fields:

- `id`
- `outreach_event_id`
- `feedback_kind`
- `score`
- `notes`
- `created_at`

Examples of `feedback_kind`:

- helpful
- mistimed
- intrusive
- welcome
- neutral
- no_feedback

Important:

- this lets the system learn timing and trust
- user feedback should carry more weight than inference

---

## 10. Safety and Protected Rules

Purpose:

- store hard boundaries the judgment engine must obey

Examples:

- do not message at night
- do not call when at a certain place
- do not bring up a specific topic
- emergency calls allowed only for safety events

Suggested fields:

- `id`
- `rule_kind`
- `scope_kind`
- `scope_ref_id` nullable
- `value_json`
- `is_active`
- `created_at`
- `updated_at`

Examples of `rule_kind`:

- protected_time
- protected_place
- blocked_topic
- outreach_cooldown
- emergency_override

Examples of `scope_kind`:

- global
- place
- topic
- channel

Important:

- this is hard-rule territory
- these rules should override model suggestions

---

## Relationships

High-level relationships:

- a `place` has many `place_visits`
- a `place_visit` may contribute to a `saved_moment`
- a `saved_moment` may produce an `outreach_event`
- an `outreach_event` may receive `outreach_feedback`
- a `manual_reflection` may create or reinforce a `memory_item`
- a `memory_item` may be linked back to a `place`, `saved_moment`, or reflection source

---

## Observed vs inferred data

This distinction matters.

Observed data:

- location
- visit duration
- time of day
- response/no response
- manual reflections

Inferred data:

- place significance
- life-phase interpretation
- whether a pause may have mattered
- whether a pattern is meaningful

Rule:

- never store inferred meaning as if it were raw fact

---

## Minimal first schema

If the build needs to stay extremely small, start with these tables first:

- settings
- places
- place_visits
- manual_reflections
- memory_items
- saved_moments
- outreach_events
- outreach_feedback
- rules

Then add:

- rhythm_summaries

after enough raw visit data exists to justify it.

---

## Migration philosophy

The schema should be allowed to evolve.

Version 1 should optimize for:

- clarity
- inspectability
- easy local debugging

not for:

- perfect normalization
- premature complexity

If a field is likely to change shape early, prefer JSON sidecar fields plus a few strong core columns.
