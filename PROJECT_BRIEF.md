# Life Companion Project Brief

## Name
Neural Trainer, reimagined as a life companion.

## Purpose
Create a personal AI companion that helps you stay in relationship with life, not just with tasks. It should notice meaningful moments, understand your patterns over time, and reach out in ways that deepen presence, meaning, honest reflection, lived contact, and trust in life.

## Problem
Most AI systems are built to automate, optimize, or answer on demand. That is not the need here. The need is for something that can accompany life as it happens, notice when a moment may matter, and respond with care. The value is not in raw intelligence. The value is in discernment, timing, tone, and trust.

## Core Idea
The system learns three kinds of context:

- Behavioral context: your recurring rhythms and meaningful deviations from them
- Place context: locations that carry discovery, reflection, belonging, or chosen return
- Emotional context: the life phase you seem to be sensing, processing, and responding to

Using those together, it decides whether to:

- stay silent
- send a message
- ask permission to call

## North Star
A life companion that learns the patterns, places, and phases that matter to me, and reaches out at the right moments to deepen presence, meaning, honest reflection, lived contact, and trust in life.

## What Success Looks Like

- It reaches out rarely, but well
- Its interruptions feel earned
- It helps turn moments into reflection, not noise
- It becomes more attuned to you over time
- It feels like something you created that can, in turn, care for you

## Primary Channels

- Telegram message
- Telegram call request / call
- Silent saved moment for later reflection

## Principles

- It should help you live the day more deeply, not more efficiently
- It should respond to accumulated context, not simplistic triggers
- It should know when to leave you alone
- It should preserve agency and never become overbearing
- It should stay sustainable and low-cost
- It should feel personal without becoming invasive
- It should avoid interrupting sleep and learn sleep patterns well enough to respect them

## Not In Scope

- general task automation
- productivity workflows
- reminder spam
- broad agent tooling
- "do everything" assistant behavior

## First Version
A small companion that:

- knows a few meaningful places
- recognizes a few recurring weekly patterns
- stores lightweight memory of recent meaningful events
- can send Telegram messages
- can ask to call when confidence is high
- records what mattered after the interaction
- detects likely sleep periods and suppresses outreach unless explicitly allowed

## First Use Cases

- after leaving a meaningful place, it checks in
- when you pause unusually long in a place that may matter, it reaches out gently
- when a week has carried emotional weight, it reflects that back at the right moment
- when you are likely asleep, it stays silent and waits

## Decision Filter
A feature belongs only if it strengthens one or more of:

- presence
- meaning
- honest reflection
- lived contact
- trust in life

If a feature does not strengthen one or more of those, it probably does not belong.
