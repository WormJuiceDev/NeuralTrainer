# Version 8 Plan

## Goal
Reduce desktop UI hitches without losing the intended North Star live-call behavior.

The main direction for Version 8 is:

- keep background acquisition alive
- stop broad visual churn for hidden surfaces
- commit only the amount of UI work that is actually needed right now
- preserve active-call responsiveness as the highest priority

## Problem Shape

The current desktop app still has a game-thread style problem:

- background polling keeps producing fresh state
- large state objects are committed high in the React tree
- hidden panels still pay render costs
- some hot paths still do too much work in one UI-thread slice

This is likely contributing to both:

- periodic idle hitches
- larger visible freezes during live North Star reply handling

## Version 8 Architecture

### 1. Separate cache from visible state

Each high-churn domain should have:

- a background cache/ref that can stay fresh
- a smaller visible projection that only drives the active UI

For North Star specifically:

- full snapshot cache stays off the hot render path
- lean runtime projection stays active for call logic
- richer Connections-panel projection is only promoted when that panel is visible

### 2. Visible-tab-first commits

Hidden tabs should not receive normal visual state churn.

Rules:

- active call surfaces stay live
- active tab stays live
- hidden tabs can keep cached data without forcing render work
- opening a tab promotes the latest cached snapshot into visible state

### 3. Budgeted UI updates

When multiple updates arrive:

- stage them first
- commit small patches instead of replacing broad trees
- favor high-priority surfaces before lower-priority lists/history panels

### 4. Priority tiers

High priority:

- active call controls
- live reply preview
- connection state
- errors that affect the current session

Medium priority:

- currently visible tab data
- active diagnostics section when visible

Low priority:

- hidden tab histories
- review lists
- dormant North Star support data

## Rollout Order

### Slice 1

North Star cache/projection split:

- keep full snapshot in a background cache
- keep a lean runtime projection for always-needed call state
- only promote the richer Connections view model when the Connections panel is visible

### Slice 2

Stop unnecessary state replacement:

- skip commits when the relevant projection did not meaningfully change
- avoid hidden-surface rerenders from no-op refreshes

### Slice 3

Extract hot visible surfaces into narrower components:

- active live-call panel
- connections panel
- review/history panels

This limits rerender spread from unrelated state changes.

### Slice 4

Introduce a small commit scheduler:

- queue lower-priority patches
- flush a limited amount per tick
- let paint/input happen between slices

### Slice 5

Tune polling cadence after the state model is cleaner:

- keep active-call polling fast where needed
- back off hidden/idle surfaces

## Safety Rules

- do not destabilize the now-reliable live-call baseline
- do not slow active-call signaling blindly
- do not mix broad UI performance changes with unrelated call-logic changes in one step
- rebuild automatically after each code-changing slice

## First Implementation Target

Implement Slice 1 now:

- North Star full snapshot cache
- lean runtime projection in React state
- visible-only Connections projection
- no hidden-panel visual churn for rich North Star support data
