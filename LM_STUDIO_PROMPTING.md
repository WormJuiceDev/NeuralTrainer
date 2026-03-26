# LM Studio Prompting

## Purpose

This document defines how the local model should be used through LM Studio in the first version of the companion.

The goal is not to let the model run the system.
The goal is to let the model help the system speak and reflect in a way that feels grounded, kind, and personal.

## Core rule

The local model is a language and interpretation layer.

It is not:

- the boundary engine
- the safety engine
- the sleep engine
- the final outreach permission engine

Deterministic code decides:

- whether outreach is allowed
- whether the system stays silent
- whether the moment qualifies for a message or call request

The model helps decide:

- how to phrase it
- what tone fits
- how to lightly reflect the meaning of the moment

## First-version model uses

### 1. Message drafting

Input:

- observed context
- why it stood out
- known relevant memory
- confidence level
- desired outreach mode

Output:

- one grounded message draft

The model should produce something that:

- feels specific
- lightly reveals reasoning
- acknowledges uncertainty honestly
- does not sound generic
- does not sound like therapy software

### 2. Call request drafting

Input:

- high-confidence moment summary
- place or transition context
- relevant recent emotional context
- invitation style

Output:

- one short respectful call request

### 3. Post-interaction reflection summary

Input:

- original outreach reason
- user response
- optional free-text conversation summary

Output:

- a short structured reflection summary
- candidate memory reinforcement
- candidate memory decay or caution

### 4. Tone selection

Input:

- context
- intensity of moment
- user preferences

Output:

- suggested tone mode such as:
  - witnessing
  - gentle noticing
  - reflective
  - lightly warm
  - spacious

This should remain advisory to the surrounding system.

## First-version model non-uses

Do not use the model for:

- deciding whether sleep can be interrupted
- deciding whether protected zones can be ignored
- deciding emergency overrides
- inventing strong emotional conclusions as fact
- acting as a general assistant
- free-form automation

## Prompt design principles

- use structured inputs
- keep prompts short and explicit
- avoid asking for mystical or poetic language
- avoid flattering tone
- prefer honest, context-aware language
- always preserve uncertainty where uncertainty exists

## Message drafting prompt shape

The prompt should provide:

- observed facts
- relevant memory
- why the moment stood out
- confidence level
- outreach mode
- tone constraints

And ask for:

- a single message
- under a reasonable length
- grounded in the observed facts
- calm and respectful
- lightly reasoned
- not pushy

## Example structured input

- observed facts:
  - user has been stationary for 43 minutes
  - place is a repeated quiet stop
  - recent week includes meaningful family visit
- why it stood out:
  - longer than usual pause
  - this place has become more significant over time
- confidence:
  - medium
- outreach mode:
  - message
- tone constraints:
  - respectful
  - specific
  - non-managerial
  - no fake wisdom

## Example output qualities

Good output:

- mentions the actual situation
- explains lightly why it stood out
- leaves room for silence
- sounds like presence rather than performance

Bad output:

- vague inspiration
- empty empathy phrases
- generic therapy language
- over-certainty
- too much interpretation

## Uncertainty rule

The model should be encouraged to say things like:

- “I may be wrong, but...”
- “This stood out to me because...”
- “I did not want to assume, but...”

It should not say:

- “You are clearly...”
- “This definitely means...”
- “You need to...”

## Memory reflection rule

When helping summarize an interaction, the model should distinguish between:

- what was observed
- what the user explicitly said
- what is only a soft inference

The prompt should ask it to avoid turning soft inferences into permanent truths.

## LM Studio integration rules

- model inference must stay local
- prompts must avoid sending unnecessary sensitive detail when a lighter summary is enough
- responses should be logged in a debuggable way
- prompts and outputs should be inspectable during development

## Fallback rule

If LM Studio is unavailable or the model output is poor:

- the system must still be able to send a deterministic structured message

This matters because:

- the companion must not disappear just because the model layer is unavailable

## Trust rule

The model should make the companion sound more alive.

It should never make the companion feel:

- manipulative
- inflated
- fake-deep
- spiritually theatrical
- emotionally presumptuous

If the model pushes the companion in that direction, the prompt or role of the model should be reduced.
