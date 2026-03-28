# Version 7 Plan

## Purpose

Version 7 is the realtime North Star audio-streaming pass.

Version 6 improved the call experience, setup tone, opening behavior, and reply-side streaming.
What it did not fix is the core architectural gap:

- North Star still captures a full spoken turn on the phone
- North Star still wraps that full turn into WAV + base64
- North Star still uploads the completed turn only after end-of-turn detection

That means the current "live" path is still turn-batched.
It does not yet behave like a true phone-call stream feeding realtime STT.

Version 7 should replace full-turn upload with true live audio streaming from phone to desktop.

---

## Version 7 goal

Make North Star feed live phone audio into NeuralTrainer continuously so realtime STT can operate during the utterance rather than after it.

The intended end state is:

1. phone call connects
2. phone microphone produces small live audio frames
3. frames are pushed continuously to NeuralTrainer
4. NeuralTrainer speech worker updates partial transcript while the user is still talking
5. desktop decides when a reply should begin
6. reply generation and reply audio remain incremental

---

## Current mismatch

What we want:

- realtime incoming speech stream
- realtime partial transcript
- low-latency reply preparation

What the code currently does:

- phone-side whole-turn buffering
- phone-side WAV/base64 packaging
- chunked upload of the completed turn
- desktop-side processing begins only after turn completion

Version 7 is specifically about removing that mismatch.

---

## Core principle

North Star should behave like a call, not like a push-to-upload voice note.

That means:

- small live frames
- continuous flow
- desktop-owned speech state
- less dependence on end-of-turn buffering on the phone

---

## Workstreams

### Workstream 1: Remote Speech Worker

Build a desktop speech worker that can accept remote audio frames over stdin instead of only listening to the local microphone.

Done means:

- the worker can be started once
- audio chunks can be appended live
- partial/final transcript updates are surfaced into app state

### Workstream 2: Desktop Command Surface

Add commands for:

- starting a stream session
- pushing audio frames into the stream
- stopping the stream and generating a reply
- reading partial transcript state

Done means:

- North Star has a real remote-stream API surface instead of full-turn upload only

### Workstream 3: North Star Phone Audio Frames

Replace whole-turn WAV upload with small frame sends from the phone.

Done means:

- the phone no longer waits for a whole utterance before sending audio upstream

### Workstream 4: End-Of-Turn Ownership

Move conversational turn ownership away from phone-side batch packaging and toward desktop-side speech-state decisions.

Done means:

- desktop can decide when enough speech/silence exists to commit to reply generation

### Workstream 5: Bandwidth Shaping

Once realtime remote streaming works, reduce bandwidth in a call-like way instead of falling back to HTTP uploads.

Priority options:

- 8 kHz mono
- narrower voice-band capture
- stronger silence trimming
- companded telephone-style speech representation

Done means:

- the realtime path is stable without abandoning the live channel goal

---

## Suggested build order

### Milestone 1

- add remote speech worker mode in Python
- add Rust worker management and stream snapshot updates
- add command to push audio frames

### Milestone 2

- make phone send live frames
- start stream at call readiness
- stop stream when desktop decides to reply

### Milestone 3

- tune framing, silence handling, and interruption behavior
- reduce audio bandwidth for call-like transport

---

## Success test

Version 7 is successful if:

- phone audio reaches NeuralTrainer continuously while the user is still speaking
- desktop partial transcript changes during live speech
- NeuralTrainer no longer depends on a completed WAV turn from the phone
- the call feels materially closer to a real phone conversation

