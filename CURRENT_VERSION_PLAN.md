# Current Version Plan

Status date: 2026-03-28

This file replaces the old numbered version-plan sequence.

It is the active build plan from here forward.

## Aim

Move the desktop from a debug-heavy workspace into a companion-first application shell that reflects the philosophy directly and gives manual context a first-class place to live.

## Baseline we are starting from

Already true:

- North Star architecture is in place
- live calls work in both directions
- realtime phone-to-desktop speech streaming works
- live reply streaming works
- opener playback works
- Telegram is removed from the active product path

So this plan starts after the hard architecture work, not before it.

## Current version goals

### Goal 1: Companion-first desktop shell

Work:

- make `Home` the default opening experience
- make `Context` the direct teaching surface
- move technical and debug-heavy tools behind `Settings`
- keep existing operational surfaces intact while changing the presentation

### Goal 2: Dedicated manual context model

Work:

- store companion context in a dedicated backend model
- support manual entry by category
- support edit, archive, and reorder
- use that model as the source of truth for the new Home screen

### Goal 3: Prepare the ground for deeper memory work

Work:

- finish the UI/data layer that expresses the companion philosophy clearly
- then define how post-call and post-review memory should grow from there
- then bridge that memory into broader companion intelligence

## Suggested working order

### Step 1

Ship the new `Home`, `Context`, and `Settings` shell with persistent manual companion context.

### Step 2

Refine the context model and decide which additional categories or entry affordances are still needed.

### Step 3

Use that clearer foundation to define post-call memory and future behavior shaping.

## Not the focus right now

- reintroducing Telegram
- reviving Youniverse dependencies
- returning to a debug-console opening experience
- prompt refinement as an engineering roadmap item
- broad assistant features unrelated to the companion goal

## Update rule

When this plan changes, update this file directly instead of creating a new numbered version-plan document.
