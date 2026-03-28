import argparse
import base64
import io
import json
import numpy as np
import soundfile as sf
import sounddevice as sd
import sys
from kokoro_onnx import Kokoro
from moonshine_voice import MicTranscriber, ModelArch, TranscriptEventListener, Transcriber
import threading
import time

PREROLL_MS = 180
STOP_GRACE_MS = 350


def add_preroll_silence(samples, sample_rate: int):
    preroll_frames = max(1, int(sample_rate * (PREROLL_MS / 1000.0)))
    silence = np.zeros(preroll_frames, dtype=np.float32)
    waveform = np.asarray(samples, dtype=np.float32).flatten()
    return np.concatenate((silence, waveform))


def synthesize_bytes(kokoro: Kokoro, text: str, voice: str) -> str:
    samples, sample_rate = kokoro.create(
        text,
        voice=voice,
        speed=1.0,
        lang="en-us",
    )
    samples = add_preroll_silence(samples, sample_rate)
    buffer = io.BytesIO()
    sf.write(buffer, samples, sample_rate, format="WAV")
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def run_worker(kokoro: Kokoro) -> int:
    print(json.dumps({"ok": True, "status": "ready"}), flush=True)
    for line in sys.stdin:
        raw = line.strip()
        if not raw:
            continue
        try:
            payload = json.loads(raw)
            text = payload["text"]
            voice = payload["voice"]
            audio_base64 = synthesize_bytes(kokoro, text, voice)
            print(json.dumps({"ok": True, "audio_base64": audio_base64}), flush=True)
        except Exception as exc:
            print(json.dumps({"ok": False, "error": str(exc)}), flush=True)
    return 0


def record_and_transcribe(model_dir: str, duration: int, sample_rate: int, output: str) -> str:
    frames = int(duration * sample_rate)
    recording = sd.rec(frames, samplerate=sample_rate, channels=1, dtype="float32")
    sd.wait()
    sf.write(output, recording, sample_rate)
    audio_data = recording.astype(np.float32).flatten().tolist()
    with Transcriber(model_dir, ModelArch.TINY_STREAMING) as transcriber:
        transcript = transcriber.transcribe_without_streaming(audio_data, sample_rate)
    lines = getattr(transcript, "lines", []) or []
    text = " ".join(line.text.strip() for line in lines if getattr(line, "text", "").strip())
    return text.strip()


def transcribe_audio_file(model_dir: str, input_path: str) -> str:
    audio_data, sample_rate = sf.read(input_path, dtype="float32")
    if isinstance(audio_data, np.ndarray) and audio_data.ndim > 1:
        audio_data = np.mean(audio_data, axis=1)
    flattened = np.asarray(audio_data, dtype=np.float32).flatten().tolist()
    with Transcriber(model_dir, ModelArch.TINY_STREAMING) as transcriber:
        transcript = transcriber.transcribe_without_streaming(flattened, sample_rate)
    lines = getattr(transcript, "lines", []) or []
    text = " ".join(line.text.strip() for line in lines if getattr(line, "text", "").strip())
    return text.strip()


class JsonListener(TranscriptEventListener):
    def __init__(self):
        self.completed_lines = []
        self.current_line = ""
        self.lock = threading.Lock()

    def _combine(self, current_override=None):
        current = self.current_line if current_override is None else current_override
        pieces = [piece.strip() for piece in self.completed_lines if piece.strip()]
        if current and current.strip():
            pieces.append(current.strip())
        return " ".join(pieces).strip()

    def current_text(self):
        with self.lock:
            return self._combine()

    def on_line_text_changed(self, event):
        text = event.line.text.strip()
        with self.lock:
            self.current_line = text
            combined = self._combine()
        print(json.dumps({"event": "partial", "text": combined}), flush=True)

    def on_line_completed(self, event):
        text = event.line.text.strip()
        with self.lock:
            if text:
                if not self.completed_lines or self.completed_lines[-1] != text:
                    self.completed_lines.append(text)
            self.current_line = ""
            combined = self._combine()
        print(json.dumps({"event": "final", "text": combined}), flush=True)


def stream_microphone(model_dir: str, sample_rate: int) -> int:
    stop_event = threading.Event()

    def stdin_watcher():
        for raw in sys.stdin:
            if raw.strip().lower() == "stop":
                stop_event.set()
                break

    listener = JsonListener()
    mic = MicTranscriber(
        model_path=model_dir,
        model_arch=ModelArch.TINY_STREAMING,
        update_interval=0.2,
        samplerate=sample_rate,
        channels=1,
        blocksize=1024,
    )

    mic.add_listener(listener)
    watcher = threading.Thread(target=stdin_watcher, daemon=True)
    watcher.start()

    print(json.dumps({"event": "ready"}), flush=True)
    mic.start()
    try:
        while not stop_event.is_set():
            time.sleep(0.05)
    finally:
        final_transcript = mic.stop()
        final_text = listener.current_text()
        if final_transcript is not None and getattr(final_transcript, "lines", None):
            combined = " ".join(line.text.strip() for line in final_transcript.lines if getattr(line, "text", "").strip())
            if combined.strip():
                final_text = combined.strip()
        mic.close()
    print(json.dumps({"event": "stopped", "text": final_text}), flush=True)
    return 0


def run_speech_worker(model_dir: str, sample_rate: int) -> int:
    listener = JsonListener()
    transcriber = Transcriber(model_dir, ModelArch.TINY_STREAMING, update_interval=0.2)
    stream = None
    active = False

    print(json.dumps({"event": "worker_ready"}), flush=True)

    for raw in sys.stdin:
        command = raw.strip()
        if not command:
            continue
        try:
            payload = json.loads(command)
        except Exception as exc:
            print(json.dumps({"event": "error", "text": str(exc)}), flush=True)
            continue

        action = payload.get("command")
        if action == "start":
            if active:
                print(json.dumps({"event": "error", "text": "speech stream already active"}), flush=True)
                continue
            listener.completed_lines = []
            listener.current_line = ""
            if stream is not None:
                try:
                    stream.close()
                except Exception:
                    pass
            stream = transcriber.create_stream(0.2)
            stream.add_listener(listener)
            stream.start()
            active = True
            print(json.dumps({"event": "ready"}), flush=True)
            continue

        if action == "add_audio":
            if not active or stream is None:
                print(json.dumps({"event": "error", "text": "speech stream is not active"}), flush=True)
                continue
            audio_base64 = payload.get("audio_base64", "")
            audio_format = payload.get("audio_format", "pcm16le")
            chunk_sample_rate = int(payload.get("sample_rate", sample_rate))
            if not audio_base64:
                continue
            try:
                decoded = base64.b64decode(audio_base64)
                if audio_format == "pcm16le":
                    audio_data = np.frombuffer(decoded, dtype="<i2").astype(np.float32) / 32768.0
                elif audio_format == "f32le":
                    audio_data = np.frombuffer(decoded, dtype="<f4").astype(np.float32)
                else:
                    print(json.dumps({"event": "error", "text": f"unknown audio format: {audio_format}"}), flush=True)
                    continue
                if audio_data.size == 0:
                    continue
                stream.add_audio(audio_data.tolist(), chunk_sample_rate)
            except Exception as exc:
                print(json.dumps({"event": "error", "text": str(exc)}), flush=True)
            continue

        if action == "stop":
            if not active:
                print(json.dumps({"event": "stopped", "text": listener.current_text()}), flush=True)
                continue
            time.sleep(STOP_GRACE_MS / 1000.0)
            final_transcript = stream.stop() if stream is not None else None
            final_text = listener.current_text()
            if final_transcript is not None and getattr(final_transcript, "lines", None):
                combined = " ".join(line.text.strip() for line in final_transcript.lines if getattr(line, "text", "").strip())
                if combined.strip():
                    final_text = combined.strip()
            active = False
            if stream is not None:
                try:
                    stream.close()
                except Exception:
                    pass
                stream = None
            print(json.dumps({"event": "stopped", "text": final_text}), flush=True)
            continue

        if action == "shutdown":
            if active:
                try:
                    if stream is not None:
                        stream.stop()
                except Exception:
                    pass
            if stream is not None:
                try:
                    stream.close()
                except Exception:
                    pass
            transcriber.close()
            print(json.dumps({"event": "shutdown"}), flush=True)
            return 0

        print(json.dumps({"event": "error", "text": f"unknown speech command: {action}"}), flush=True)

    try:
        if active:
            if stream is not None:
                stream.stop()
    except Exception:
        pass
    if stream is not None:
        try:
            stream.close()
        except Exception:
            pass
    transcriber.close()
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--worker", action="store_true")
    parser.add_argument("--speech-worker", action="store_true")
    parser.add_argument("--model")
    parser.add_argument("--voices")
    parser.add_argument("--voice")
    parser.add_argument("--text")
    parser.add_argument("--output")
    parser.add_argument("--record-transcribe", action="store_true")
    parser.add_argument("--transcribe-file", action="store_true")
    parser.add_argument("--stream-mic", action="store_true")
    parser.add_argument("--stt-model")
    parser.add_argument("--input")
    parser.add_argument("--duration", type=int, default=5)
    parser.add_argument("--sample-rate", type=int, default=16000)
    args = parser.parse_args()

    if args.speech_worker:
        if not args.stt_model:
            raise SystemExit("stt-model is required for speech-worker mode")
        return run_speech_worker(args.stt_model, args.sample_rate)

    if args.stream_mic:
        if not args.stt_model:
            raise SystemExit("stt-model is required for stream-mic mode")
        return stream_microphone(args.stt_model, args.sample_rate)

    if args.record_transcribe:
        if not args.stt_model or not args.output:
            raise SystemExit("stt-model and output are required for record-transcribe mode")
        text = record_and_transcribe(args.stt_model, args.duration, args.sample_rate, args.output)
        print(json.dumps({"ok": True, "text": text}), flush=True)
        return 0

    if args.transcribe_file:
        if not args.stt_model or not args.input:
            raise SystemExit("stt-model and input are required for transcribe-file mode")
        text = transcribe_audio_file(args.stt_model, args.input)
        print(json.dumps({"ok": True, "text": text}), flush=True)
        return 0

    if not args.model or not args.voices:
        raise SystemExit("model and voices are required for synthesis mode")

    kokoro = Kokoro(args.model, args.voices)
    if args.worker:
        return run_worker(kokoro)

    if not args.voice or not args.text or not args.output:
        raise SystemExit("voice, text, and output are required outside worker mode")

    samples, sample_rate = kokoro.create(
        args.text,
        voice=args.voice,
        speed=1.0,
        lang="en-us",
    )
    samples = add_preroll_silence(samples, sample_rate)
    sf.write(args.output, samples, sample_rate)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
