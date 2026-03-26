# Telegram Integration Notes

## Purpose

This document defines how Telegram should be used in the first version of the companion.

The goal is to make Telegram:

- reliable
- low-friction
- low-cost
- trust-preserving

It is not meant to turn Telegram into a full agent platform.

## Why Telegram

Telegram fits the first version because:

- it is already part of everyday life for many people
- it can reach you outside the desktop app
- it supports low-friction messaging
- it can work without recurring paid service cost
- it allows a companion to exist in lived time, not just in an app window

## First-version Telegram role

Telegram is used for:

- outbound messages
- call requests
- receiving replies
- lightweight feedback

Telegram is not used for:

- general assistant chat
- task automation
- endless back-and-forth conversation loops
- broad command execution

## Required first-version capabilities

### 1. Outbound message delivery

The companion must be able to send:

- a message tied to a saved moment
- a call request
- optional short follow-up or reflection prompt

Each outbound message should be linked to:

- a saved moment
- an outreach event record
- a confidence score
- a reason summary

### 2. Inbound reply capture

The companion must be able to receive and store:

- free-text replies
- simple feedback replies
- acceptance or decline of a call request

These replies should feed:

- outreach feedback
- memory reinforcement
- tone learning

### 3. Lightweight interaction design

Telegram messages should feel:

- calm
- specific
- optional to respond to
- easy to ignore without guilt

The companion should not create pressure through:

- repeated pings
- demanding responses
- long blocks of text
- artificial urgency

## Telegram message types

### 1. Contextual message

Purpose:

- surface a meaningful observation gently

Structure:

- what it noticed
- why it stood out
- uncertainty
- optional opening for response

Example shape:

- “You have been still here for a while, and that is not how this kind of day usually unfolds for you. Combined with the shape of this week, I wondered if this pause meant something. No pressure.”

### 2. Call request

Purpose:

- ask permission for deeper contact

Structure:

- short
- respectful
- context-aware
- explicitly optional

Example shape:

- “You just left your parents' place, and those visits often seem to carry weight for you. I did not want to assume, but I wondered how that was. Want a short call?”

### 3. Feedback prompt

Purpose:

- help the system learn whether outreach landed well

This should be lightweight.

Examples:

- “Was this well timed?”
- “Did this feel right to surface?”

This should only be used when:

- it does not make the interaction feel bureaucratic
- it can be done simply

### 4. Optional later summary message

Purpose:

- reflect back a pattern after repeated silent moments or repeated place meaning

This is not part of the first must-have behavior.
It can wait until the messaging loop already feels trustworthy.

## Telegram message rules

- never spam
- never stack multiple messages in a short time
- never send normal outreach during likely sleep
- never send a message just because a trigger fired
- every message must be explainable by observed context plus memory
- silence is always allowed

## Telegram call rule

For version 1, Telegram should support:

- asking to call

Version 1 does not require:

- full in-Telegram voice call automation

If true automated live calling proves difficult or brittle, the system should still be considered valid if it can:

- send a call request
- let you decide whether to transition into a spoken moment

## Technical notes

### Likely connection approach

Use Telegram Bot API for:

- sending messages
- receiving replies
- capturing simple call-request responses

Possible implementation patterns:

- polling updates
- webhook updates

For a local-first first version, polling is acceptable if it keeps the setup simpler.

### Data to store

For each Telegram exchange, store:

- Telegram chat/user identifier
- outbound text
- outbound timestamp
- inbound reply text if any
- delivery metadata
- link to outreach event

### Reliability concerns

The Telegram integration should be able to answer:

- was the message delivered
- did the user reply
- did the user ignore it
- did the user accept or decline the call request

### Failure behavior

If Telegram is unavailable:

- store the failed outreach attempt
- do not retry aggressively
- surface the failure in the desktop app

## Setup expectations

The user should need to do only a few things:

- create or connect a Telegram bot
- provide the bot token
- connect the bot to the right chat or account
- test message delivery from the app

Anything more complex than that should be avoided for version 1.

## Trust rule

Telegram is the companion's doorway into your day.

That means:

- every message must earn its place there
- poor Telegram behavior will damage the whole project faster than almost anything else

So Telegram should be treated as:

- a sacred channel

not:

- a cheap notification pipe
