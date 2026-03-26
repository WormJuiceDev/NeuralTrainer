# Tech Stack

## Core direction

Use a local-first, zero-recurring-cost stack:

- no paid model APIs
- no paid map services
- no paid automation platforms
- no recurring infrastructure costs beyond home internet and electricity

## Recommended stack

- **Desktop app shell:** Tauri
- **Frontend:** React + TypeScript + Vite
- **Core runtime:** Rust
- **Database:** SQLite
- **Async runtime:** Tokio
- **HTTP / API calls:** reqwest
- **Configuration:** TOML and/or SQLite-backed settings
- **Background jobs:** Tokio tasks
- **Telegram integration:** Telegram Bot API via HTTP or Rust crate
- **Local model layer:** LM Studio via local HTTP API
- **Maps / place context:** OpenStreetMap-based free services, cached locally

## Why this stack fits

This project is no longer primarily an ML training product. It is a:

- local companion runtime
- memory system
- rules and heuristics engine
- outreach orchestrator
- optional local model interpretation layer

Rust fits that very well because it is:

- low-overhead
- reliable for long-running local processes
- good for background tasks
- strong for explicit system logic and boundaries
- well-suited to SQLite, scheduling, and local orchestration

React remains a good fit for:

- memory inspection
- boundary configuration
- place management
- reflection history
- communication history
- settings and review flows

## Important design principle

Do not put the whole system inside the LLM.

Use normal Rust code for:

- sleep rules
- protected zones
- timing windows
- memory weighting
- location and movement heuristics
- confidence thresholds
- outreach channel decisions

Use the local model for:

- interpretation
- reflection
- wording
- tone
- deciding among allowed response styles

In short:

- Rust decides **when** something is worth surfacing
- the model helps shape **how** it is understood and expressed

## Zero-cost rule

The system should rely only on:

- your own machine
- your own local network and internet
- free or open data sources
- local model inference

If a feature requires a paid external dependency, it should not be part of the core promise.

## First-version integrations

- Telegram for messages and call requests
- LM Studio for local model reasoning
- SQLite for memory and history
- free map/location services for rough place meaning

## Things to avoid early

- cloud model subscriptions
- paid geolocation platforms
- complex distributed infrastructure
- broad tool automation ecosystems
- anything that increases dependency before trust is established
