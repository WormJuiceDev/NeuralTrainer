# North Star Streaming Reply Research Plan

Date: March 27, 2026

## Goal

Move North Star from the current whole-turn reply flow to a true streamed reply flow:

1. The LLM should begin returning text immediately.
2. TTS should begin emitting playable audio before the full reply is complete.
3. The phone should begin playback immediately and continue as chunks arrive.
4. The existing live-call transport should remain the outer shell for the call experience.

## Current Local Reality

The current code is still batch-oriented.

### LLM

The current live call reply path calls LM Studio with a normal blocking `POST /v1/chat/completions` request and waits for a full JSON response.

- [voice.rs](D:/Studio/CodexFarm/NeuralTrainer/src-tauri/src/voice.rs#L638)
- [voice.rs](D:/Studio/CodexFarm/NeuralTrainer/src-tauri/src/voice.rs#L648)

There is no `stream: true` flag and no SSE parsing in the current implementation.

### TTS

The current Kokoro worker returns one complete base64-encoded WAV for a full input string.

- [kokoro_speak.py](D:/Studio/CodexFarm/NeuralTrainer/src-tauri/scripts/kokoro_speak.py#L25)
- [kokoro_speak.py](D:/Studio/CodexFarm/NeuralTrainer/src-tauri/scripts/kokoro_speak.py#L48)
- [voice.rs](D:/Studio/CodexFarm/NeuralTrainer/src-tauri/src/voice.rs#L368)

The current local worker API is therefore "whole text in, whole audio out".

### Net Effect

The present live call pipeline is:

1. Capture a full spoken turn
2. Transcribe it
3. Wait for a full LM Studio reply
4. Synthesize a full Kokoro WAV
5. Send or play the finished reply

That is why the phone waits silently and then hears the full answer only after all processing finishes.

## External Research

### LM Studio

Official LM Studio docs confirm that streaming is supported.

- OpenAI-compatible endpoints include `POST /v1/chat/completions` and `POST /v1/responses`:
  [LM Studio OpenAI Compatibility Endpoints](https://lmstudio.ai/docs/developer/openai-compat)
- The chat completions endpoint supports the `stream` payload parameter:
  [LM Studio Chat Completions](https://lmstudio.ai/docs/developer/openai-compat/chat-completions)
- LM Studio also documents streaming over SSE:
  [LM Studio Streaming Events](https://lmstudio.ai/docs/developer/rest/streaming-events)
- LM Studio docs also show streamed chat prediction APIs in the SDK:
  [LM Studio Chat Completions SDK docs](https://lmstudio.ai/docs/python/llm-prediction/chat-completion)

Conclusion:

LM Studio is not the blocker. We can stream LLM output now.

### Kokoro

The current TTS stack in this repo uses `kokoro-onnx`.

- Official repo:
  [thewh1teagle/kokoro-onnx](https://github.com/thewh1teagle/kokoro-onnx)

The official README describes it as fast and near real-time, but its normal example/API shape is still whole-generation oriented. In our own current worker, `kokoro.create(...)` returns `samples, sample_rate`, and we convert that whole result to one WAV payload.

Conclusion:

The Kokoro model family can be fast, but the specific `kokoro-onnx` path we use today is not currently wired as a streaming audio emitter in this repo.

### Streaming Kokoro Server Option

There are Kokoro server projects that expose OpenAI-compatible speech endpoints with chunked streaming audio.

- [remsky/Kokoro-FastAPI](https://github.com/remsky/Kokoro-FastAPI)

That project documents:

- OpenAI-compatible `/v1/audio/speech`
- streamed byte responses
- `pcm` output for immediate playback

Important note:

This is not the same implementation we currently run. It would be a deliberate architecture change, not a small patch to the current worker.

## Product Symptoms Explained

The current user-visible behavior is consistent with the code:

1. Opener now plays because we successfully moved opener delivery onto the live data channel.
2. Later replies still wait because the desktop is still producing one full reply before sending it.
3. The repeated layered reply audio suggests duplicate playback sources or duplicate chunk handling, which should be fixed while we refactor playback for streaming.

## Architecture Decision

For true streaming, there are two realistic paths.

### Option A: Keep current local `kokoro-onnx`, fake streaming by sentence chunks

How it works:

1. Stream tokens from LM Studio
2. Buffer tokens until a sentence boundary or safe chunk boundary
3. Synthesize each finished chunk with current Kokoro worker
4. Send each audio chunk to the phone

Pros:

- Smaller change
- No extra service to deploy
- Reuses current voice assets

Cons:

- Not true low-latency TTS streaming
- First audio still waits for the first chunk boundary
- Prosody may feel stitched
- Harder to achieve a very natural "instant answer" feeling

Verdict:

Good fallback path, but not the best fit for the product goal.

### Option B: Add a streaming Kokoro speech server and stream PCM/audio chunks

How it works:

1. Stream LM Studio text deltas
2. Feed text progressively into a streaming-capable TTS service
3. Forward PCM/audio chunks over the live data channel
4. Phone plays chunks as they arrive

Pros:

- Closest to real phone-call behavior
- Earliest possible first audio
- Cleanest route to real incremental speech playback

Cons:

- Bigger architectural change
- Requires a local or hosted streaming TTS service
- Needs chunk queueing and playback sequencing on the phone

Verdict:

Recommended for the North Star target experience.

## Recommended Version 6.1 Build Order

### Phase 1: Stream LM Studio first

Implement streamed text generation before changing TTS.

Work:

1. Replace blocking LM Studio reply call with streaming mode.
2. Parse SSE or OpenAI-compatible streamed deltas.
3. Maintain a per-call live reply stream state on desktop.
4. Expose diagnostics:
   - first token received
   - tokens received
   - first audio chunk sent

Expected outcome:

We remove one major wait point and can begin chunking text early.

### Phase 2: Sentence-chunk bridge using current Kokoro

Before bringing in a streaming TTS server, add an incremental bridge layer.

Work:

1. Accumulate streamed LM Studio text.
2. Flush to TTS on sentence boundaries, clause boundaries, or a max character threshold.
3. Deduplicate overlap between chunks.
4. Send audio chunks to phone with sequence ids.
5. Phone queues and plays chunks in order.

Expected outcome:

Not perfect streaming, but much faster perceived responsiveness.

### Phase 3: Replace chunk bridge with real streaming TTS

Swap the TTS backend to a streaming-capable speech endpoint.

Work:

1. Add a new TTS provider mode, for example `kokoro_stream_server`.
2. Stream audio bytes from `/v1/audio/speech` or equivalent endpoint.
3. Forward chunks directly to mobile playback queue.
4. Preserve current Kokoro local worker as a fallback provider.

Expected outcome:

This gets us closest to the product goal.

## Additional Fix Needed: Echo / Canyon Reply

The repeated delayed playback must be fixed before or during streaming rollout.

Likely causes to inspect:

1. Reply audio is being played both from local mobile playback and from peer media.
2. Multiple reply chunks are being replayed or reattached after state refresh.
3. The same reply is being triggered more than once by duplicate live reply events.

Immediate guardrails for the refactor:

1. Exactly one reply playback owner on phone.
2. Exactly one reply stream id active at a time.
3. Ignore duplicate chunk sequence numbers.
4. Ignore stale reply events after a newer reply stream starts.

## Recommended Next Implementation Step

Do not jump straight to the streaming TTS server first.

The safest order is:

1. Stream LM Studio replies now.
2. Add ordered audio chunk playback on the phone.
3. Bridge current Kokoro with sentence-sized chunks.
4. Then swap in a true streaming TTS provider.

That sequence gives us forward progress without blocking on a full TTS infrastructure change.

