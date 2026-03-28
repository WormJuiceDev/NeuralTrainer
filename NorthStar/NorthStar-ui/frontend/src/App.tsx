import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import "./App.css";

type DesktopStatus = "bound" | "online" | "offline";
type MessageSource = "user" | "desktop";

type LocationCapability = {
  permission_state: string;
  location_supported: boolean;
  background_supported: boolean;
  last_known_accuracy_meters: number | null;
  last_location_at: string | null;
};

type DesktopBinding = {
  desktop_id: string;
  desktop_name: string;
  user_handle: string;
  device_token: string;
  bound_at: string;
  last_heartbeat_at: string | null;
  status: DesktopStatus;
  location_capability: LocationCapability;
};

type CompanionMessage = {
  message_id: string;
  user_handle: string;
  source: MessageSource;
  text: string;
  created_at: string;
};

type LocationEvent = {
  event_id: string;
  user_handle: string;
  latitude: number;
  longitude: number;
  accuracy_meters: number | null;
  source: string;
  captured_at: string;
};

type CallStatus = "pending" | "accepted" | "declined" | "ended" | "missed";

type CompanionCallSession = {
  call_id: string;
  user_handle: string;
  desktop_id: string;
  desktop_name: string;
  device_token: string;
  requested_at: string;
  responded_at: string | null;
  status: CallStatus;
  note: string;
};

type CallReviewSentiment = "helpful" | "welcome" | "mistimed" | "intrusive";

type CallReviewRecord = {
  review_id: string;
  call_id: string;
  user_handle: string;
  sentiment: CallReviewSentiment;
  notes: string;
  created_at: string;
};

type PendingCallReviewRecord = CallReviewRecord & {
  pending_sync: boolean;
};

type CompanionCallTurn = {
  turn_id: string;
  call_id: string;
  user_handle: string;
  created_at: string;
  source: string;
  status: string;
  input_audio_base64: string;
  transcript_text: string | null;
  reply_text: string | null;
  reply_mode: string | null;
  reply_audio_base64: string | null;
  sample_rate: number | null;
  completed_at: string | null;
};

type CompanionWebRtcSignal = {
  signal_id: string;
  call_id: string;
  user_handle: string;
  source: string;
  target: string;
  signal_kind: string;
  payload_json: string;
  created_at: string;
};

type PushCapability = {
  notificationSupported: boolean;
  serviceWorkerSupported: boolean;
  permission: string;
  serviceWorkerReady: boolean;
};

type PushStatus = {
  vapid_public_key: string;
  registered_subscriptions: number;
  push_supported: boolean;
};

type QueuedLocationEvent = {
  latitude: number;
  longitude: number;
  accuracy_meters: number | null;
  source: string;
  captured_at: string;
};

type CompanionEvent =
  | {
      kind: "desktop_bound";
      desktop_id: string;
      desktop_name: string;
      user_handle: string;
      at: string;
    }
  | {
      kind: "heartbeat_received";
      desktop_id: string;
      status: DesktopStatus;
      at: string;
    }
  | {
      kind: "location_capability_updated";
      desktop_id: string;
      permission_state: string;
      location_supported: boolean;
      background_supported: boolean;
      at: string;
    }
  | {
      kind: "message_created";
      message_id: string;
      user_handle: string;
      source: MessageSource;
      at: string;
    }
  | {
      kind: "location_uploaded";
      event_id: string;
      user_handle: string;
      at: string;
    }
  | {
      kind: "push_subscription_updated";
      user_handle: string;
      subscriptions: number;
      at: string;
    }
  | {
      kind: "call_requested";
      call_id: string;
      user_handle: string;
      desktop_name: string;
      at: string;
    }
  | {
      kind: "call_updated";
      call_id: string;
      user_handle: string;
      status: CallStatus;
      at: string;
    }
  | {
      kind: "call_review_created";
      review_id: string;
      call_id: string;
      user_handle: string;
      sentiment: CallReviewSentiment;
      at: string;
    };

type StoredSession = {
  sessionToken: string;
  userHandle: string;
  displayName: string;
};

type AppView = "chats" | "settings";
type SettingsSection = "menu" | "account" | "desktop" | "audio" | "notifications" | "location" | "debug";

const DEFAULT_API =
  import.meta.env.VITE_API_BASE ||
  (typeof window !== "undefined" ? window.location.origin : "http://127.0.0.1:3100");
const SESSION_STORAGE_KEY = "northstar.session";
const DEVICE_STORAGE_KEY = "northstar.deviceToken";
const LOCATION_QUEUE_KEY = "northstar.locationQueue";
const CALL_REVIEW_QUEUE_KEY = "northstar.pendingCallReviews";
const AUDIO_SETTINGS_KEY = "northstar.audioSettings";
const DEBUG_SETTINGS_KEY = "northstar.debugSettings";
const LIVE_CHANNEL_CHUNK_SIZE = 6_000;
const LIVE_CHANNEL_BUFFER_HIGH_WATER = 96_000;
const LIVE_CHANNEL_BUFFER_LOW_WATER = 32_000;
const MOBILE_OUTBOUND_CALL_NOTE = "North Star is calling from your phone.";
const LIVE_CALL_OPENING_TEXT = "Hi, you wanted to talk?";
const NORTHSTAR_MOBILE_VERSION = "v61";
const MIN_SETUP_TONE_MS = 1500;
const LIVE_TURN_DATA_CHANNEL_MAX_BASE64 = 180_000;

type AudioSettings = {
  openingGain: number;
  replyGain: number;
  turnEndDelaySeconds: number;
};

type DebugSettings = {
  debugCall: boolean;
};

const defaultAudioSettings: AudioSettings = {
  openingGain: 1,
  replyGain: 2.3,
  turnEndDelaySeconds: 2,
};

const defaultDebugSettings: DebugSettings = {
  debugCall: false,
};

const CALL_STATUS_LABELS: Record<CallStatus, string> = {
  pending: "Ringing",
  accepted: "Connected",
  declined: "Declined",
  ended: "Finished",
  missed: "Missed",
};

const SENTIMENT_LABELS: Record<CallReviewSentiment, string> = {
  helpful: "Helpful",
  welcome: "Welcome",
  mistimed: "Mistimed",
  intrusive: "Too intrusive",
};

type LiveCallDiagnostics = {
  phase: string;
  signalingState: string;
  iceGatheringState: string;
  iceConnectionState: string;
  connectionState: string;
  dataChannelState: string;
  remoteTrackState: string;
  lastSignal: string;
  localIceCandidates: number;
  remoteIceCandidates: number;
  localCandidateKinds: string;
  remoteCandidateKinds: string;
  icePolicy: string;
  iceServerKinds: string;
  issue: string;
};

type LiveInputMeter = {
  rms: number;
  peak: number;
  speaking: boolean;
  trackEnabled: boolean;
  trackMuted: boolean;
  trackReadyState: string;
};

type LiveTurnTransportStats = {
  liveTurnsSent: number;
  liveTurnChunksSent: number;
  lastLiveTurnRequestId: string;
};

type LiveConversationPhase =
  | "idle"
  | "connecting_transport"
  | "waiting_for_opening_audio"
  | "ready_for_user"
  | "assistant_processing"
  | "assistant_speaking";

type RtcIceServer = {
  urls: string[];
  username: string | null;
  credential: string | null;
};

const defaultLiveCallDiagnostics: LiveCallDiagnostics = {
  phase: "idle",
  signalingState: "idle",
  iceGatheringState: "idle",
  iceConnectionState: "idle",
  connectionState: "idle",
  dataChannelState: "idle",
  remoteTrackState: "waiting",
  lastSignal: "none",
  localIceCandidates: 0,
  remoteIceCandidates: 0,
  localCandidateKinds: "none",
  remoteCandidateKinds: "none",
  icePolicy: "all",
  iceServerKinds: "stun",
  issue: "",
};

const defaultLiveInputMeter: LiveInputMeter = {
  rms: 0,
  peak: 0,
  speaking: false,
  trackEnabled: false,
  trackMuted: true,
  trackReadyState: "missing",
};

const defaultLiveTurnTransportStats: LiveTurnTransportStats = {
  liveTurnsSent: 0,
  liveTurnChunksSent: 0,
  lastLiveTurnRequestId: "none",
};

const LIVE_WEBRTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun.cloudflare.com:3478" },
  ],
};

function detectCandidateKind(candidateLine: string) {
  const match = candidateLine.match(/\btyp\s+([a-z0-9]+)/i);
  return match?.[1]?.toLowerCase() ?? "unknown";
}

function mergeCandidateKindList(current: string, nextKind: string) {
  const existing = current === "none" ? [] : current.split(",").map((value) => value.trim()).filter(Boolean);
  if (!existing.includes(nextKind)) {
    existing.push(nextKind);
  }
  return existing.length ? existing.join(", ") : "none";
}

function describeIceServerKinds(servers: RTCIceServer[]) {
  const kinds = new Set<string>();
  servers.forEach((server) => {
    const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
    urls.forEach((url) => {
      if (typeof url !== "string") return;
      const normalized = url.trim().toLowerCase();
      if (normalized.startsWith("turn:")) {
        kinds.add("turn");
      } else if (normalized.startsWith("turns:")) {
        kinds.add("turns");
      } else if (normalized.startsWith("stun:")) {
        kinds.add("stun");
      }
    });
  });
  return Array.from(kinds).join(", ") || "none";
}

function hasStableLiveMedia(peer: RTCPeerConnection | null, remoteStream: MediaStream | null) {
  return Boolean(
    peer
    && peer.connectionState === "connected"
    && peer.iceConnectionState === "connected"
    && remoteStream,
  );
}

function formatDateTime(value: string | null, options?: Intl.DateTimeFormatOptions) {
  if (!value) return "Not yet";
  return new Date(value).toLocaleString([], options);
}

function formatTime(value: string | null) {
  return formatDateTime(value, { hour: "2-digit", minute: "2-digit" });
}

function formatStatus(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatPermission(value: string) {
  switch (value) {
    case "granted":
      return "Allowed";
    case "prompt":
      return "Ask first";
    case "denied":
      return "Blocked";
    case "unsupported":
      return "Unavailable";
    default:
      return "Not checked yet";
  }
}

function formatAvailability(value: boolean, positive = "Ready", negative = "Not ready") {
  return value ? positive : negative;
}

function locationSummary(state: LocationCapability, watching: boolean, queuedEvents: number) {
  if (!state.location_supported) return "Location sharing is not ready on this phone yet.";
  if (watching) return queuedEvents > 0 ? `Live sharing is on. ${queuedEvents} update${queuedEvents === 1 ? "" : "s"} waiting to sync.` : "Live sharing is on.";
  if (state.permission_state === "denied") return "Location sharing is blocked on this phone.";
  if (state.last_location_at) return `Last location update ${formatDateTime(state.last_location_at)}.`;
  return "Location sharing is available when you need it.";
}

function pushSummary(status: PushStatus | null, capability: PushCapability) {
  if (!capability.notificationSupported) return "Notifications are not available on this browser.";
  if (capability.permission !== "granted") return "Allow notifications so North Star can tap you on the shoulder.";
  if (!capability.serviceWorkerReady) return "The app is still getting notifications ready on this device.";
  if (!status?.push_supported) return "North Star push is still warming up on the server.";
  if ((status.registered_subscriptions ?? 0) === 0) return "This phone still needs to register for push.";
  return "North Star can wake this phone for new calls, messages, and updates.";
}

function previewText(value: string, maxLength = 72) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3)}...`;
}

function replyAudioUrl(base64: string | null) {
  if (!base64) return null;
  return `data:audio/wav;base64,${base64}`;
}

function createSetupToneUrl() {
  const sampleRate = 24_000;
  const durationSeconds = 2.5;
  const totalSamples = Math.floor(sampleRate * durationSeconds);
  const pcm = new Int16Array(totalSamples);
  const attackSeconds = 0.02;
  const releaseSeconds = 0.08;

  const addDualTone = (startSeconds: number, toneSeconds: number, frequencyA: number, frequencyB: number, gain = 0.22) => {
    const startIndex = Math.floor(startSeconds * sampleRate);
    const toneSamples = Math.floor(toneSeconds * sampleRate);
    const attackSamples = Math.max(1, Math.floor(attackSeconds * sampleRate));
    const releaseSamples = Math.max(1, Math.floor(releaseSeconds * sampleRate));
    for (let offset = 0; offset < toneSamples && startIndex + offset < pcm.length; offset += 1) {
      let envelope = 1;
      if (offset < attackSamples) {
        envelope = offset / attackSamples;
      } else if (offset > toneSamples - releaseSamples) {
        envelope = Math.max(0, (toneSamples - offset) / releaseSamples);
      }
      const time = offset / sampleRate;
      const sample =
        gain
        * envelope
        * (
          Math.sin(2 * Math.PI * frequencyA * time)
          + Math.sin(2 * Math.PI * frequencyB * time)
        )
        * 0.5;
      pcm[startIndex + offset] = Math.max(-32767, Math.min(32767, Math.round(sample * 32767)));
    }
  };

  addDualTone(0.0, 0.42, 425, 480);
  addDualTone(1.25, 0.42, 425, 480);

  const buffer = new ArrayBuffer(44 + pcm.length * 2);
  const view = new DataView(buffer);
  const writeAscii = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + pcm.length * 2, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, "data");
  view.setUint32(40, pcm.length * 2, true);
  for (let index = 0; index < pcm.length; index += 1) {
    view.setInt16(44 + index * 2, pcm[index], true);
  }
  return URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
}

function callWasStartedFromPhone(call: CompanionCallSession | null) {
  if (!call) return false;
  return call.note.trim() === MOBILE_OUTBOUND_CALL_NOTE;
}

function getLiveOpeningText(call: CompanionCallSession | null) {
  if (!call) {
    return LIVE_CALL_OPENING_TEXT;
  }
  if (callWasStartedFromPhone(call)) {
    return LIVE_CALL_OPENING_TEXT;
  }
  const trimmedNote = call.note.trim();
  return trimmedNote.length > 0 ? trimmedNote : "Hey, I wanted to check in with you for a minute.";
}

function getLiveCallStatusCopy(
  liveConversationPhase: LiveConversationPhase,
  callLoopMuted: boolean,
) {
  if (callLoopMuted) {
    return {
      headline: "Microphone muted",
      detail: "North Star will keep the line open until you unmute.",
    };
  }
  if (liveConversationPhase === "connecting_transport") {
    return {
      headline: "Connecting the line",
      detail: "Stay on the line while North Star finishes connecting everything.",
    };
  }
  if (liveConversationPhase === "waiting_for_opening_audio") {
    return {
      headline: "NeuralTrainer is joining",
      detail: "The line is ready. Hold on while NeuralTrainer opens the conversation.",
    };
  }
  if (liveConversationPhase === "assistant_processing") {
    return {
      headline: "North Star is responding",
      detail: "Hold on for a moment while NeuralTrainer prepares the reply.",
    };
  }
  if (liveConversationPhase === "assistant_speaking") {
    return {
      headline: "North Star is speaking",
      detail: "NeuralTrainer is answering you out loud right now.",
    };
  }
  if (liveConversationPhase === "ready_for_user") {
    return {
      headline: "North Star is listening",
      detail: "Speak naturally. North Star is waiting for what you say next.",
    };
  }
  return {
    headline: "Call is live",
    detail: "North Star is keeping the line open for you.",
  };
}

function PhoneIcon({ kind }: { kind: "accept" | "decline" | "menu" | "mic" | "send" | "hangup" }) {
  if (kind === "menu") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "mic") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 15a4 4 0 0 0 4-4V7a4 4 0 0 0-8 0v4a4 4 0 0 0 4 4Z" fill="currentColor" />
        <path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "send") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 20 21 12 3 4l2 7 9 1-9 1 2 7Z" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={kind === "decline" || kind === "hangup" ? "phone-icon--hangup" : undefined}>
      <path d="M6.6 10.8c1.7 3.2 3.5 5 6.6 6.6l2.2-2.2c.3-.3.8-.4 1.2-.3 1 .3 2 .4 3 .4.7 0 1.2.5 1.2 1.2V20c0 .7-.5 1.2-1.2 1.2C9.3 21.2 2.8 14.7 2.8 6.4 2.8 5.7 3.3 5.2 4 5.2h3.5c.7 0 1.2.5 1.2 1.2 0 1 .2 2 .4 3 .1.4 0 .9-.3 1.2l-2.2 2.2Z" fill="currentColor" />
    </svg>
  );
}

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const normalized = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(normalized);
  const bytes = Uint8Array.from(raw, (character) => character.charCodeAt(0));
  return bytes.buffer;
}

function audioBufferToWavBase64(channelData: Float32Array[], sampleRate: number) {
  const trimmedChunks = trimCallAudioSilence(channelData, sampleRate);
  const normalizedChunks = normalizeCallAudio(trimmedChunks);
  const totalSamples = normalizedChunks.reduce((count, chunk) => count + chunk.length, 0);
  const bytesPerSample = 2;
  const blockAlign = bytesPerSample;
  const buffer = new ArrayBuffer(44 + totalSamples * bytesPerSample);
  const view = new DataView(buffer);
  const writeString = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + totalSamples * bytesPerSample, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, totalSamples * bytesPerSample, true);

  let offset = 44;
  for (const chunk of normalizedChunks) {
    for (let index = 0; index < chunk.length; index += 1) {
      const sample = Math.max(-1, Math.min(1, chunk[index]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return window.btoa(binary);
}

function float32ChunkToPcm16Base64(chunk: Float32Array) {
  const buffer = new ArrayBuffer(chunk.length * 2);
  const view = new DataView(buffer);
  for (let index = 0; index < chunk.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, chunk[index]));
    view.setInt16(index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return window.btoa(binary);
}

function trimCallAudioSilence(channelData: Float32Array[], sampleRate: number) {
  const flattened = new Float32Array(channelData.reduce((count, chunk) => count + chunk.length, 0));
  let offset = 0;
  for (const chunk of channelData) {
    flattened.set(chunk, offset);
    offset += chunk.length;
  }
  if (flattened.length === 0) {
    return channelData;
  }

  const threshold = 0.008;
  const paddingSamples = Math.floor(sampleRate * 0.18);
  let first = -1;
  let last = -1;
  for (let index = 0; index < flattened.length; index += 1) {
    if (Math.abs(flattened[index]) >= threshold) {
      first = index;
      break;
    }
  }
  for (let index = flattened.length - 1; index >= 0; index -= 1) {
    if (Math.abs(flattened[index]) >= threshold) {
      last = index;
      break;
    }
  }
  if (first === -1 || last === -1) {
    return channelData;
  }

  const start = Math.max(0, first - paddingSamples);
  const end = Math.min(flattened.length, last + paddingSamples);
  const trimmed = flattened.slice(start, end);
  if (trimmed.length === 0 || trimmed.length === flattened.length) {
    return channelData;
  }
  return [trimmed];
}

function normalizeCallAudio(channelData: Float32Array[]) {
  let peak = 0;
  let energy = 0;
  let sampleCount = 0;

  for (const chunk of channelData) {
    for (let index = 0; index < chunk.length; index += 1) {
      const sample = chunk[index];
      const absSample = Math.abs(sample);
      if (absSample > peak) {
        peak = absSample;
      }
      energy += sample * sample;
      sampleCount += 1;
    }
  }

  if (sampleCount === 0 || peak === 0) {
    return channelData;
  }

  const rms = Math.sqrt(energy / sampleCount);
  const targetRms = 0.18;
  const desiredGain = rms > 0 ? targetRms / rms : 1;
  const peakLimitedGain = 0.92 / peak;
  const gain = Math.max(0.7, Math.min(peakLimitedGain, desiredGain, 6));

  return channelData.map((chunk) => {
    const normalized = new Float32Array(chunk.length);
    for (let index = 0; index < chunk.length; index += 1) {
      const shaped = Math.tanh(chunk[index] * gain * 1.35);
      normalized[index] = Math.max(-0.98, Math.min(0.98, shaped));
    }
    return normalized;
  });
}

function App() {
  const [view, setView] = useState<AppView>("chats");
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("menu");
  const [apiBase, setApiBase] = useState(DEFAULT_API);
  const [displayName, setDisplayName] = useState("Savvy");
  const [userHandle, setUserHandle] = useState("savvy");
  const [desktopName, setDesktopName] = useState("neuraltrainer-pc");
  const [sessionToken, setSessionToken] = useState("");
  const [deviceToken, setDeviceToken] = useState("");
  const [state, setState] = useState<DesktopBinding[]>([]);
  const [events, setEvents] = useState<CompanionEvent[]>([]);
  const [messages, setMessages] = useState<CompanionMessage[]>([]);
  const [messageDraft, setMessageDraft] = useState("");
  const [locationEvents, setLocationEvents] = useState<LocationEvent[]>([]);
  const [callSessions, setCallSessions] = useState<CompanionCallSession[]>([]);
  const [callReviews, setCallReviews] = useState<CallReviewRecord[]>([]);
  const [pendingCallReviews, setPendingCallReviews] = useState<PendingCallReviewRecord[]>([]);
  const [callTurns, setCallTurns] = useState<CompanionCallTurn[]>([]);
  const [selectedCallId, setSelectedCallId] = useState("");
  const [postCallReviewCallId, setPostCallReviewCallId] = useState("");
  const [pushCapability, setPushCapability] = useState<PushCapability>({
    notificationSupported: false,
    serviceWorkerSupported: false,
    permission: "unknown",
    serviceWorkerReady: false,
  });
  const [pushStatus, setPushStatus] = useState<PushStatus | null>(null);
  const [locationQueue, setLocationQueue] = useState<QueuedLocationEvent[]>([]);
  const [locationState, setLocationState] = useState<LocationCapability>({
    permission_state: "unknown",
    location_supported: false,
    background_supported: false,
    last_known_accuracy_meters: null,
    last_location_at: null,
  });
  const [watchingLocation, setWatchingLocation] = useState(false);
  const [recordingTurn, setRecordingTurn] = useState(false);
  const [callLoopState, setCallLoopState] = useState<"idle" | "connecting" | "opening" | "listening" | "processing" | "speaking">("idle");
  const [callLoopMuted, setCallLoopMuted] = useState(false);
  const [liveConversationPhase, setLiveConversationPhase] = useState<LiveConversationPhase>("idle");
  const [liveReplyAudioSrc, setLiveReplyAudioSrc] = useState<string | null>(null);
  const [audioSettings, setAudioSettings] = useState<AudioSettings>(defaultAudioSettings);
  const [debugSettings, setDebugSettings] = useState<DebugSettings>(defaultDebugSettings);
  const [message, setMessage] = useState("North Star is ready to keep you and NeuralTrainer in sync.");

  const watchIdRef = useRef<number | null>(null);
  const callTurnAudioChunksRef = useRef<Float32Array[]>([]);
  const callTurnStreamRef = useRef<MediaStream | null>(null);
  const callTurnAudioContextRef = useRef<AudioContext | null>(null);
  const callTurnProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const callTurnSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const callTurnSinkRef = useRef<GainNode | null>(null);
  const threadViewportRef = useRef<HTMLDivElement | null>(null);
  const liveReplyAudioRef = useRef<HTMLAudioElement | null>(null);
  const liveReplyAudioContextRef = useRef<AudioContext | null>(null);
  const liveReplyAudioSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const liveReplyAudioGainRef = useRef<GainNode | null>(null);
  const lastPlayedReplyTurnIdRef = useRef<string | null>(null);
  const previousAcceptedCallIdRef = useRef<string | null>(null);
  const handsFreeCallIdRef = useRef<string | null>(null);
  const pendingRecordingStartCallIdRef = useRef<string | null>(null);
  const recordingTurnActiveRef = useRef(false);
  const speechDetectedRef = useRef(false);
  const silenceFrameCountRef = useRef(0);
  const silenceDurationMsRef = useRef(0);
  const speechFrameCountRef = useRef(0);
  const sendingTurnRef = useRef(false);
  const liveStreamingTurnRequestIdRef = useRef<string | null>(null);
  const liveStreamingTurnStartPromiseRef = useRef<Promise<string> | null>(null);
  const callTurnUsesLivePeerStreamRef = useRef(false);
  const livePeerRef = useRef<RTCPeerConnection | null>(null);
  const liveDataChannelRef = useRef<RTCDataChannel | null>(null);
  const liveSignalCallIdRef = useRef<string | null>(null);
  const processedLiveSignalIdsRef = useRef<Set<string>>(new Set());
  const liveReplyChunksRef = useRef<Map<string, string[]>>(new Map());
  const liveOpeningChunksRef = useRef<Map<string, string[]>>(new Map());
  const liveReplyStreamChunkPartsRef = useRef<Map<string, string[]>>(new Map());
  const liveStreamReplyQueueRef = useRef<Array<{ requestId: string; chunkIndex: number; audioBase64: string }>>([]);
  const liveStreamReplySeenChunksRef = useRef<Map<string, Set<number>>>(new Map());
  const liveStreamReplyRequestIdRef = useRef<string | null>(null);
  const liveStreamReplyPlayingRef = useRef(false);
  const liveStreamReplyCompletedRef = useRef(false);
  const liveRemoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const liveRemoteStreamRef = useRef<MediaStream | null>(null);
  const liveRemotePlaybackTimerRef = useRef<number | null>(null);
  const liveRemoteAudioContextRef = useRef<AudioContext | null>(null);
  const liveRemoteAudioSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const liveRemoteAudioGainRef = useRef<GainNode | null>(null);
  const livePeerInputStreamRef = useRef<MediaStream | null>(null);
  const liveInputMeterAudioContextRef = useRef<AudioContext | null>(null);
  const liveInputMeterSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const liveInputMeterProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const liveInputMeterSinkRef = useRef<GainNode | null>(null);
  const liveRtcIceServersRef = useRef<RTCIceServer[] | null>(null);
  const liveNegotiationStartedAtRef = useRef<number | null>(null);
  const outboundCallIdsRef = useRef<Set<string>>(new Set());
  const liveOpeningRequestedCallIdRef = useRef<string | null>(null);
  const liveOpeningStartedCallIdRef = useRef<string | null>(null);
  const liveOpeningCompletedCallIdRef = useRef<string | null>(null);
  const liveOpeningPlaybackTimerRef = useRef<number | null>(null);
  const liveOpeningRequestTimeoutRef = useRef<number | null>(null);
  const liveSetupTonePlayerRef = useRef<HTMLAudioElement | null>(null);
  const liveSetupToneUrlRef = useRef<string | null>(null);
  const liveSetupToneStartedAtRef = useRef<number | null>(null);
  const liveDataChannelRecoveryTimerRef = useRef<number | null>(null);
  const [liveCallDiagnostics, setLiveCallDiagnostics] = useState<LiveCallDiagnostics>(defaultLiveCallDiagnostics);
  const [liveInputMeter, setLiveInputMeter] = useState<LiveInputMeter>(defaultLiveInputMeter);
  const [liveTurnTransportStats, setLiveTurnTransportStats] = useState<LiveTurnTransportStats>(defaultLiveTurnTransportStats);
  const [liveFallbackAllowed, setLiveFallbackAllowed] = useState(false);
  const wsBase = useMemo(() => apiBase.replace(/^http/i, "ws"), [apiBase]);

  function teardownLiveInputMeter() {
    liveInputMeterProcessorRef.current?.disconnect();
    liveInputMeterSourceRef.current?.disconnect();
    liveInputMeterSinkRef.current?.disconnect();
    liveInputMeterAudioContextRef.current?.close().catch(() => undefined);
    liveInputMeterProcessorRef.current = null;
    liveInputMeterSourceRef.current = null;
    liveInputMeterSinkRef.current = null;
    liveInputMeterAudioContextRef.current = null;
    setLiveInputMeter(defaultLiveInputMeter);
  }

  function teardownLiveRemoteAudioBoost() {
    const audio = liveRemoteAudioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      audio.srcObject = null;
    }
    const context = liveRemoteAudioContextRef.current;
    if (context && context.state === "running") {
      void context.suspend().catch(() => undefined);
    }
  }

  function currentReplyPlaybackGain() {
    return liveConversationPhase === "waiting_for_opening_audio"
      ? audioSettings.openingGain
      : audioSettings.replyGain;
  }

  function teardownLiveReplyAudioBoost() {
    const audio = liveReplyAudioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      audio.removeAttribute("src");
      audio.load();
    }
    const context = liveReplyAudioContextRef.current;
    if (context && context.state === "running") {
      void context.suspend().catch(() => undefined);
    }
  }

  function failOpenIntoListening(message: string) {
    if (!activeAcceptedCall) {
      return;
    }
    completeLiveOpening(activeAcceptedCall.call_id, { message });
    if (callLoopMuted) {
      setCallLoopState("idle");
      setLiveConversationPhase("idle");
      return;
    }
    setCallLoopState("listening");
    setLiveConversationPhase("ready_for_user");
    if (!recordingTurn) {
      void resumeLiveHandsFreeListening(activeAcceptedCall);
    }
  }

  async function ensureLiveReplyAudioBoost() {
    const audio = liveReplyAudioRef.current;
    if (!audio) {
      return;
    }
    audio.volume = 1;
    let context = liveReplyAudioContextRef.current;
    if (!context) {
      context = new AudioContext();
      const source = context.createMediaElementSource(audio);
      const gain = context.createGain();
      gain.gain.value = currentReplyPlaybackGain();
      source.connect(gain);
      gain.connect(context.destination);
      liveReplyAudioContextRef.current = context;
      liveReplyAudioSourceRef.current = source;
      liveReplyAudioGainRef.current = gain;
    } else if (liveReplyAudioGainRef.current) {
      liveReplyAudioGainRef.current.gain.value = currentReplyPlaybackGain();
    }
    if (context.state === "suspended") {
      await context.resume().catch(() => undefined);
    }
  }

  async function ensureLiveRemoteAudioBoost() {
    const audio = liveRemoteAudioRef.current;
    if (!audio) {
      return;
    }
    audio.volume = 1;
    let context = liveRemoteAudioContextRef.current;
    if (!context) {
      context = new AudioContext();
      const source = context.createMediaElementSource(audio);
      const gain = context.createGain();
      gain.gain.value = audioSettings.replyGain;
      source.connect(gain);
      gain.connect(context.destination);
      liveRemoteAudioContextRef.current = context;
      liveRemoteAudioSourceRef.current = source;
      liveRemoteAudioGainRef.current = gain;
    } else if (liveRemoteAudioGainRef.current) {
      liveRemoteAudioGainRef.current.gain.value = audioSettings.replyGain;
    }
    if (context.state === "suspended") {
      await context.resume().catch(() => undefined);
    }
  }

  function startLiveInputMeter(stream: MediaStream) {
    teardownLiveInputMeter();
    const track = stream.getAudioTracks()[0] ?? null;
    if (!track) {
      setLiveInputMeter(defaultLiveInputMeter);
      return;
    }

    const context = new AudioContext({ sampleRate: 16000 });
    const source = context.createMediaStreamSource(stream);
    const processor = context.createScriptProcessor(2048, 1, 1);
    const sink = context.createGain();
    sink.gain.value = 0;
    source.connect(processor);
    processor.connect(sink);
    sink.connect(context.destination);
    liveInputMeterAudioContextRef.current = context;
    liveInputMeterSourceRef.current = source;
    liveInputMeterProcessorRef.current = processor;
    liveInputMeterSinkRef.current = sink;

    const syncTrackState = () => {
      setLiveInputMeter((current) => ({
        ...current,
        trackEnabled: track.enabled,
        trackMuted: track.muted,
        trackReadyState: track.readyState,
      }));
    };

    track.onmute = syncTrackState;
    track.onunmute = syncTrackState;
    track.onended = syncTrackState;
    syncTrackState();

    if (context.state === "suspended") {
      void context.resume().catch(() => undefined);
    }

    processor.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0);
      let sum = 0;
      let peak = 0;
      for (let index = 0; index < input.length; index += 1) {
        const sample = input[index];
        const abs = Math.abs(sample);
        if (abs > peak) {
          peak = abs;
        }
        sum += sample * sample;
      }
      const rms = Math.sqrt(sum / input.length);
      setLiveInputMeter({
        rms,
        peak,
        speaking: rms > 0.008 || peak > 0.06,
        trackEnabled: track.enabled,
        trackMuted: track.muted,
        trackReadyState: track.readyState,
      });
    };
  }

  function ensureLiveSetupTonePlayer() {
    if (liveSetupTonePlayerRef.current) {
      return liveSetupTonePlayerRef.current;
    }
    const audio = new Audio();
    audio.loop = true;
    audio.preload = "auto";
    audio.setAttribute("playsinline", "true");
    liveSetupTonePlayerRef.current = audio;
    return audio;
  }

  function stopLiveSetupTone() {
    const audio = liveSetupTonePlayerRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    liveSetupToneStartedAtRef.current = null;
  }

  function resetLiveStreamReplyState() {
    liveReplyStreamChunkPartsRef.current = new Map();
    liveStreamReplyQueueRef.current = [];
    liveStreamReplySeenChunksRef.current = new Map();
    liveStreamReplyRequestIdRef.current = null;
    liveStreamReplyPlayingRef.current = false;
    liveStreamReplyCompletedRef.current = false;
  }

  function finishLiveStreamReplyPlayback() {
    liveStreamReplyPlayingRef.current = false;
    if (liveStreamReplyQueueRef.current.length > 0) {
      const next = liveStreamReplyQueueRef.current.shift();
      if (next) {
        liveStreamReplyPlayingRef.current = true;
        setLiveReplyAudioSrc(replyAudioUrl(next.audioBase64));
      }
      return;
    }
    if (!liveStreamReplyCompletedRef.current) {
      return;
    }
    resetLiveStreamReplyState();
    handleLiveReplyEnded();
  }

  function queueLiveStreamReplyChunk(requestId: string, chunkIndex: number, audioBase64: string) {
    const activeRequestId = liveStreamReplyRequestIdRef.current;
    if (activeRequestId && activeRequestId !== requestId) {
      resetLiveStreamReplyState();
    }
    liveStreamReplyRequestIdRef.current = requestId;
    const seen = liveStreamReplySeenChunksRef.current.get(requestId) ?? new Set<number>();
    if (seen.has(chunkIndex)) {
      return;
    }
    seen.add(chunkIndex);
    liveStreamReplySeenChunksRef.current.set(requestId, seen);
    liveStreamReplyQueueRef.current.push({ requestId, chunkIndex, audioBase64 });
    liveStreamReplyQueueRef.current.sort((left, right) => left.chunkIndex - right.chunkIndex);
    if (!liveStreamReplyPlayingRef.current) {
      const next = liveStreamReplyQueueRef.current.shift();
      if (next) {
        liveStreamReplyPlayingRef.current = true;
        setLiveReplyAudioSrc(replyAudioUrl(next.audioBase64));
      }
    }
  }

  function queueLiveStreamReplyChunkPart(
    requestId: string,
    chunkIndex: number,
    partIndex: number,
    totalParts: number,
    audioSlice: string,
  ) {
    const key = `${requestId}:${chunkIndex}`;
    const parts = liveReplyStreamChunkPartsRef.current.get(key) ?? new Array(totalParts).fill("");
    parts[partIndex] = audioSlice;
    liveReplyStreamChunkPartsRef.current.set(key, parts);
    if (parts.filter(Boolean).length !== totalParts) {
      return;
    }
    liveReplyStreamChunkPartsRef.current.delete(key);
    queueLiveStreamReplyChunk(requestId, chunkIndex, parts.join(""));
  }

  function hasPendingLiveStreamReplyParts() {
    return liveReplyStreamChunkPartsRef.current.size > 0;
  }

  function completeLiveOpening(callId: string, options?: { message?: string }) {
    if (liveOpeningRequestTimeoutRef.current !== null) {
      window.clearTimeout(liveOpeningRequestTimeoutRef.current);
      liveOpeningRequestTimeoutRef.current = null;
    }
    if (liveOpeningPlaybackTimerRef.current !== null) {
      window.clearTimeout(liveOpeningPlaybackTimerRef.current);
      liveOpeningPlaybackTimerRef.current = null;
    }
    liveOpeningCompletedCallIdRef.current = callId;
    liveOpeningStartedCallIdRef.current = null;
    stopLiveSetupTone();
    if (options?.message) {
      setMessage(options.message);
    }
  }

  async function startLiveSetupTone() {
    try {
      const audio = ensureLiveSetupTonePlayer();
      if (!liveSetupToneUrlRef.current) {
        liveSetupToneUrlRef.current = createSetupToneUrl();
      }
      if (audio.src !== liveSetupToneUrlRef.current) {
        audio.src = liveSetupToneUrlRef.current;
      }
      audio.loop = true;
      audio.volume = 0.22;
      if (!audio.paused) {
        return;
      }
      audio.currentTime = 0;
      await audio.play();
      liveSetupToneStartedAtRef.current = Date.now();
    } catch {
      return;
    }
  }

  function delayForMinimumSetupToneLead() {
    const startedAt = liveSetupToneStartedAtRef.current;
    if (!startedAt) {
      return Promise.resolve();
    }
    const elapsed = Date.now() - startedAt;
    const remaining = MIN_SETUP_TONE_MS - elapsed;
    if (remaining <= 0) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      window.setTimeout(resolve, remaining);
    });
  }

  useEffect(() => {
    const storedSession = localStorage.getItem(SESSION_STORAGE_KEY);
    if (storedSession) {
      try {
        const parsed = JSON.parse(storedSession) as StoredSession;
        setSessionToken(parsed.sessionToken);
        setUserHandle(parsed.userHandle);
        setDisplayName(parsed.displayName);
      } catch {
        localStorage.removeItem(SESSION_STORAGE_KEY);
      }
    }

    const storedDeviceToken = localStorage.getItem(DEVICE_STORAGE_KEY);
    if (storedDeviceToken) {
      setDeviceToken(storedDeviceToken);
    }

    const storedPendingReviews = localStorage.getItem(CALL_REVIEW_QUEUE_KEY);
    if (storedPendingReviews) {
      try {
        setPendingCallReviews(JSON.parse(storedPendingReviews) as PendingCallReviewRecord[]);
      } catch {
        localStorage.removeItem(CALL_REVIEW_QUEUE_KEY);
      }
    }

    const storedQueue = localStorage.getItem(LOCATION_QUEUE_KEY);
    if (storedQueue) {
      try {
        const parsed = JSON.parse(storedQueue) as QueuedLocationEvent[];
        setLocationQueue(parsed);
      } catch {
        localStorage.removeItem(LOCATION_QUEUE_KEY);
      }
    }

    const storedAudioSettings = localStorage.getItem(AUDIO_SETTINGS_KEY);
    if (storedAudioSettings) {
      try {
        const parsed = JSON.parse(storedAudioSettings) as Partial<AudioSettings>;
        setAudioSettings({
          openingGain:
            typeof parsed.openingGain === "number" && Number.isFinite(parsed.openingGain)
              ? parsed.openingGain
              : defaultAudioSettings.openingGain,
          replyGain:
            typeof parsed.replyGain === "number" && Number.isFinite(parsed.replyGain)
              ? parsed.replyGain
              : defaultAudioSettings.replyGain,
          turnEndDelaySeconds:
            typeof parsed.turnEndDelaySeconds === "number" && Number.isFinite(parsed.turnEndDelaySeconds)
              ? parsed.turnEndDelaySeconds
              : defaultAudioSettings.turnEndDelaySeconds,
        });
      } catch {
        localStorage.removeItem(AUDIO_SETTINGS_KEY);
      }
    }

    const storedDebugSettings = localStorage.getItem(DEBUG_SETTINGS_KEY);
    if (storedDebugSettings) {
      try {
        const parsed = JSON.parse(storedDebugSettings) as Partial<DebugSettings>;
        setDebugSettings({
          debugCall: typeof parsed.debugCall === "boolean" ? parsed.debugCall : defaultDebugSettings.debugCall,
        });
      } catch {
        localStorage.removeItem(DEBUG_SETTINGS_KEY);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(LOCATION_QUEUE_KEY, JSON.stringify(locationQueue));
  }, [locationQueue]);

  useEffect(() => {
    localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(audioSettings));
  }, [audioSettings]);

  useEffect(() => {
    localStorage.setItem(DEBUG_SETTINGS_KEY, JSON.stringify(debugSettings));
  }, [debugSettings]);

  useEffect(() => {
    void ensureLiveReplyAudioBoost().catch(() => undefined);
    if (liveRemoteAudioGainRef.current) {
      liveRemoteAudioGainRef.current.gain.value = audioSettings.replyGain;
    }
  }, [audioSettings, liveConversationPhase, liveReplyAudioSrc]);

  useEffect(() => {
    if (!sessionToken) return;

    let cancelled = false;
    void refreshAll();

    const socket = new WebSocket(`${wsBase}/api/companion/events`);
    socket.onmessage = (event) => {
      if (cancelled) return;
      try {
        const parsed = JSON.parse(event.data) as CompanionEvent;
        if ("user_handle" in parsed && parsed.user_handle !== userHandle) {
          return;
        }
        setEvents((current) => [parsed, ...current].slice(0, 12));
        if (parsed.kind === "call_requested") {
          setView("chats");
          setSelectedCallId(parsed.call_id);
          setMessage(`${parsed.desktop_name} is calling you through North Star.`);
        } else if (parsed.kind === "call_updated") {
          setView("chats");
          setSelectedCallId(parsed.call_id);
          setMessage(parsed.status === "accepted" ? "Call is connecting." : `Call ${CALL_STATUS_LABELS[parsed.status].toLowerCase()}.`);
        } else if (parsed.kind === "message_created" && parsed.source === "desktop") {
          setView("chats");
          setMessage("NeuralTrainer sent a new message.");
        }
        void refreshAll();
      } catch {
        return;
      }
    };

    return () => {
      cancelled = true;
      socket.close();
    };
  }, [sessionToken, wsBase, userHandle]);

  useEffect(() => {
    function applyDeepLink(navType: string | null, navId: string | null) {
      if (!navType || !navId) return;
      if (navType.toUpperCase() === "CALL") {
        setView("chats");
        setSelectedCallId(navId);
        setMessage("Opened from a call notification.");
      } else if (navType.toUpperCase() === "CHAT") {
        setView("chats");
        setMessage("Opened from a companion message.");
      }
    }

    const params = new URLSearchParams(window.location.search);
    applyDeepLink(params.get("navType"), params.get("navId"));

    function onServiceWorkerMessage(event: MessageEvent) {
      if (event.data?.type === "DEEP_LINK") {
        applyDeepLink(event.data.navType ?? null, event.data.navId ?? null);
      }
    }

    navigator.serviceWorker?.addEventListener("message", onServiceWorkerMessage);
    return () => navigator.serviceWorker?.removeEventListener("message", onServiceWorkerMessage);
  }, []);

  useEffect(() => {
    return () => stopWatchingLocation();
  }, []);

  useEffect(() => {
    let active = true;
    async function preparePushCapability() {
      const notificationSupported = "Notification" in window;
      const serviceWorkerSupported = "serviceWorker" in navigator;
      let permission = notificationSupported ? Notification.permission : "unsupported";
      let serviceWorkerReady = false;

      if (serviceWorkerSupported) {
        try {
          await navigator.serviceWorker.register("/service-worker.js");
          await navigator.serviceWorker.ready;
          serviceWorkerReady = true;
        } catch {
          serviceWorkerReady = false;
        }
      }

      if (active) {
        setPushCapability({
          notificationSupported,
          serviceWorkerSupported,
          permission,
          serviceWorkerReady,
        });
      }
    }
    void preparePushCapability();
    return () => {
      active = false;
    };
  }, []);

  async function authedFetch(path: string, init?: RequestInit) {
    const headers = new Headers(init?.headers || {});
    headers.set("Content-Type", headers.get("Content-Type") || "application/json");
    headers.set("x-northstar-session", sessionToken);
    return fetch(`${apiBase}${path}`, { ...init, headers });
  }

  function waitForIceGathering(peer: RTCPeerConnection) {
    if (peer.iceGatheringState === "complete") {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      const handleStateChange = () => {
        if (peer.iceGatheringState === "complete") {
          peer.removeEventListener("icegatheringstatechange", handleStateChange);
          resolve();
        }
      };
      peer.addEventListener("icegatheringstatechange", handleStateChange);
      window.setTimeout(() => {
        peer.removeEventListener("icegatheringstatechange", handleStateChange);
        resolve();
      }, 2500);
    });
  }

  function updateLiveCallDiagnostics(patch: Partial<LiveCallDiagnostics>) {
    setLiveCallDiagnostics((current) => {
      const next = { ...current, ...patch };
      console.info("[NorthStar live mobile]", next);
      return next;
    });
  }

  function mapRtcIceServers(servers: RtcIceServer[]): RTCIceServer[] {
    if (servers.length === 0) {
      return LIVE_WEBRTC_CONFIG.iceServers ?? [];
    }
    return servers.map((server) => ({
      urls: server.urls,
      username: server.username ?? undefined,
      credential: server.credential ?? undefined,
    }));
  }

  function shouldPreferLiveRelay(servers: RTCIceServer[]) {
    return servers.some((server) => {
      const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
      return urls.some((url) => typeof url === "string" && url.trim().toLowerCase().startsWith("turn:"));
    });
  }

  async function getLiveRtcConfig() {
    if (liveRtcIceServersRef.current) {
      const icePolicy = shouldPreferLiveRelay(liveRtcIceServersRef.current) ? "relay" : "all";
      updateLiveCallDiagnostics({
        icePolicy,
        iceServerKinds: describeIceServerKinds(liveRtcIceServersRef.current),
      });
      return {
        iceServers: liveRtcIceServersRef.current,
        iceTransportPolicy: icePolicy,
      } satisfies RTCConfiguration;
    }
    try {
      const response = await authedFetch("/api/companion/rtc-config", { method: "GET" });
      if (!response.ok) {
        throw new Error("RTC config request failed");
      }
      const payload = (await response.json()) as { ice_servers?: RtcIceServer[] };
      liveRtcIceServersRef.current = mapRtcIceServers(payload.ice_servers ?? []);
    } catch {
      liveRtcIceServersRef.current = LIVE_WEBRTC_CONFIG.iceServers ?? [];
    }
    const icePolicy = shouldPreferLiveRelay(liveRtcIceServersRef.current) ? "relay" : "all";
    updateLiveCallDiagnostics({
      icePolicy,
      iceServerKinds: describeIceServerKinds(liveRtcIceServersRef.current),
    });
    return {
      iceServers: liveRtcIceServersRef.current,
      iceTransportPolicy: icePolicy,
    } satisfies RTCConfiguration;
  }

  function teardownLivePeerConnection(options?: { resetProcessedSignals?: boolean; preserveSetupTone?: boolean; preserveReplyPlayback?: boolean }) {
    const resetProcessedSignals = options?.resetProcessedSignals ?? true;
    const preserveSetupTone = options?.preserveSetupTone ?? false;
    const preserveReplyPlayback = options?.preserveReplyPlayback ?? false;
    liveDataChannelRef.current?.close();
    livePeerRef.current?.close();
    if (liveRemotePlaybackTimerRef.current !== null) {
      window.clearTimeout(liveRemotePlaybackTimerRef.current);
      liveRemotePlaybackTimerRef.current = null;
    }
    if (liveRemoteAudioRef.current) {
      liveRemoteAudioRef.current.srcObject = null;
    }
    teardownLiveReplyAudioBoost();
    teardownLiveRemoteAudioBoost();
    livePeerInputStreamRef.current?.getTracks().forEach((track) => track.stop());
    teardownLiveInputMeter();
    liveDataChannelRef.current = null;
    livePeerRef.current = null;
    liveSignalCallIdRef.current = null;
    liveOpeningRequestedCallIdRef.current = null;
    liveOpeningStartedCallIdRef.current = null;
    liveOpeningCompletedCallIdRef.current = null;
    if (liveOpeningRequestTimeoutRef.current !== null) {
      window.clearTimeout(liveOpeningRequestTimeoutRef.current);
      liveOpeningRequestTimeoutRef.current = null;
    }
    if (liveOpeningPlaybackTimerRef.current !== null) {
      window.clearTimeout(liveOpeningPlaybackTimerRef.current);
      liveOpeningPlaybackTimerRef.current = null;
    }
    if (liveDataChannelRecoveryTimerRef.current !== null) {
      window.clearTimeout(liveDataChannelRecoveryTimerRef.current);
      liveDataChannelRecoveryTimerRef.current = null;
    }
    if (!preserveSetupTone) {
      stopLiveSetupTone();
      liveSetupTonePlayerRef.current = null;
    }
    if (resetProcessedSignals) {
      processedLiveSignalIdsRef.current = new Set();
    }
    liveReplyChunksRef.current = new Map();
    liveOpeningChunksRef.current = new Map();
    liveStreamingTurnRequestIdRef.current = null;
    liveStreamingTurnStartPromiseRef.current = null;
    if (!preserveReplyPlayback) {
      resetLiveStreamReplyState();
    }
    liveRemoteStreamRef.current = null;
    livePeerInputStreamRef.current = null;
    liveNegotiationStartedAtRef.current = null;
    setLiveFallbackAllowed(false);
    setLiveCallDiagnostics(defaultLiveCallDiagnostics);
    setLiveTurnTransportStats(defaultLiveTurnTransportStats);
  }

  function waitForLiveDataChannelCapacity(channel: RTCDataChannel) {
    if (channel.readyState !== "open") {
      return Promise.reject(new Error("Live data channel is not open."));
    }
    if (channel.bufferedAmount <= LIVE_CHANNEL_BUFFER_HIGH_WATER) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        window.clearTimeout(timeout);
        channel.removeEventListener("bufferedamountlow", handleBufferedLow);
        channel.removeEventListener("close", handleClosed);
        channel.removeEventListener("error", handleClosed);
      };
      const handleBufferedLow = () => {
        if (channel.bufferedAmount <= LIVE_CHANNEL_BUFFER_LOW_WATER) {
          cleanup();
          resolve();
        }
      };
      const handleClosed = () => {
        cleanup();
        reject(new Error("Live data channel closed while waiting to send."));
      };
      const timeout = window.setTimeout(() => {
        cleanup();
        resolve();
      }, 800);
      channel.bufferedAmountLowThreshold = LIVE_CHANNEL_BUFFER_LOW_WATER;
      channel.addEventListener("bufferedamountlow", handleBufferedLow);
      channel.addEventListener("close", handleClosed);
      channel.addEventListener("error", handleClosed);
      handleBufferedLow();
    });
  }

  function waitForLiveChannelSendYield() {
    return new Promise<void>((resolve) => {
      window.setTimeout(resolve, 0);
    });
  }

  async function sendLiveChannelJson(channel: RTCDataChannel, payload: unknown) {
    await waitForLiveDataChannelCapacity(channel);
    if (channel.readyState !== "open") {
      throw new Error("Live data channel is not open.");
    }
    channel.send(JSON.stringify(payload));
  }

  async function sendChunkedLiveTurn(channel: RTCDataChannel, requestId: string, audioBase64: string) {
    if (audioBase64.length <= LIVE_CHANNEL_CHUNK_SIZE) {
      setLiveTurnTransportStats((current) => ({
        liveTurnsSent: current.liveTurnsSent + 1,
        liveTurnChunksSent: current.liveTurnChunksSent,
        lastLiveTurnRequestId: requestId,
      }));
      await sendLiveChannelJson(channel, {
        type: "live_turn",
        requestId,
        audioBase64,
      });
      return;
    }

    const total = Math.ceil(audioBase64.length / LIVE_CHANNEL_CHUNK_SIZE);
    setLiveTurnTransportStats((current) => ({
      liveTurnsSent: current.liveTurnsSent + 1,
      liveTurnChunksSent: current.liveTurnChunksSent + total,
      lastLiveTurnRequestId: requestId,
    }));
    for (let index = 0; index < total; index += 1) {
      const slice = audioBase64.slice(index * LIVE_CHANNEL_CHUNK_SIZE, (index + 1) * LIVE_CHANNEL_CHUNK_SIZE);
      await sendLiveChannelJson(channel, {
        type: "live_turn_chunk",
        requestId,
        index,
        total,
        audioSlice: slice,
      });
      await waitForLiveChannelSendYield();
    }
  }

  function canUseLiveSpeechStreaming(callId: string) {
    return (
      liveSignalCallIdRef.current === callId
      && !!liveDataChannelRef.current
      && liveDataChannelRef.current.readyState === "open"
    );
  }

  async function beginLiveSpeechTurn(channel: RTCDataChannel, callId: string, sampleRate: number) {
    const activeRequestId = liveStreamingTurnRequestIdRef.current;
    if (activeRequestId) {
      return activeRequestId;
    }
    const existingStart = liveStreamingTurnStartPromiseRef.current;
    if (existingStart) {
      return existingStart;
    }
    const requestId = `${callId}-${Date.now()}`;
    liveStreamingTurnRequestIdRef.current = requestId;
    const startPromise = (async () => {
      try {
        await sendLiveChannelJson(channel, {
          type: "live_speech_start",
          requestId,
          sampleRate,
          audioFormat: "pcm16le",
        });
        setLiveTurnTransportStats((current) => ({
          liveTurnsSent: current.liveTurnsSent + 1,
          liveTurnChunksSent: current.liveTurnChunksSent,
          lastLiveTurnRequestId: requestId,
        }));
        return requestId;
      } catch (error) {
        if (liveStreamingTurnRequestIdRef.current === requestId) {
          liveStreamingTurnRequestIdRef.current = null;
        }
        throw error;
      } finally {
        if (liveStreamingTurnRequestIdRef.current === requestId || !liveStreamingTurnRequestIdRef.current) {
          liveStreamingTurnStartPromiseRef.current = null;
        }
      }
    })();
    liveStreamingTurnStartPromiseRef.current = startPromise;
    return startPromise;
  }

  async function sendLiveSpeechFrame(channel: RTCDataChannel, callId: string, chunk: Float32Array, sampleRate: number) {
    const requestId = await beginLiveSpeechTurn(channel, callId, sampleRate);
    await sendLiveChannelJson(channel, {
      type: "live_speech_frame",
      requestId,
      sampleRate,
      audioFormat: "pcm16le",
      audioBase64: float32ChunkToPcm16Base64(chunk),
    });
    setLiveTurnTransportStats((current) => ({
      liveTurnsSent: current.liveTurnsSent,
      liveTurnChunksSent: current.liveTurnChunksSent + 1,
      lastLiveTurnRequestId: requestId,
    }));
  }

  async function finishLiveSpeechTurn(channel: RTCDataChannel) {
    const startPromise = liveStreamingTurnStartPromiseRef.current;
    if (startPromise) {
      await startPromise.catch(() => undefined);
    }
    const requestId = liveStreamingTurnRequestIdRef.current;
    if (!requestId) {
      return false;
    }
    await sendLiveChannelJson(channel, {
      type: "live_speech_end",
      requestId,
    });
    liveStreamingTurnRequestIdRef.current = null;
    liveStreamingTurnStartPromiseRef.current = null;
    return true;
  }

  async function sendMobileWebRtcSignal(callId: string, signalKind: string, payload: RTCSessionDescriptionInit | RTCIceCandidateInit) {
    await authedFetch("/api/companion/webrtc-signals", {
      method: "POST",
      body: JSON.stringify({
        call_id: callId,
        signal_kind: signalKind,
        payload_json: JSON.stringify(payload),
      }),
    });
  }

  async function pullMobileWebRtcSignals(callId: string) {
    const response = await authedFetch(`/api/companion/webrtc-signals?call_id=${encodeURIComponent(callId)}`, { method: "GET" });
    if (!response.ok) {
      return [] as CompanionWebRtcSignal[];
    }
    const payload = (await response.json()) as { signals?: CompanionWebRtcSignal[] };
    return payload.signals ?? [];
  }

  function attachLivePeer(callId: string, peer: RTCPeerConnection, channel?: RTCDataChannel) {
    liveSignalCallIdRef.current = callId;
    updateLiveCallDiagnostics({
      phase: "mobile_peer_attached",
      signalingState: peer.signalingState,
      iceGatheringState: peer.iceGatheringState,
      iceConnectionState: peer.iceConnectionState,
      connectionState: peer.connectionState,
      dataChannelState: channel?.readyState ?? "waiting",
      remoteTrackState: "waiting",
      issue: "",
    });
    if (channel) {
      liveDataChannelRef.current = channel;
      channel.onopen = () => {
        setMessage("North Star live call channel connected.");
        updateLiveCallDiagnostics({
          phase: "mobile_data_channel_open",
          dataChannelState: channel.readyState,
          issue: "",
        });
      };
      channel.onmessage = (event) => {
        try {
          const payload = JSON.parse(String(event.data)) as
            | {
                type: "live_reply";
                requestId: string;
                result: {
                  transcriptText: string;
                  replyText: string;
                  replyAudioBase64?: string;
                  sampleRate?: number;
                  remoteAudio?: boolean;
                  replyDurationMs?: number;
                };
              }
            | {
                type: "live_reply_chunk";
                requestId: string;
                index: number;
                total: number;
                payloadSlice: string;
              }
            | {
                type: "live_opening_audio";
                openerId: string;
                text: string;
                audioBase64: string;
              }
            | {
                type: "live_opening_chunk";
                openerId: string;
                index: number;
                total: number;
                payloadSlice: string;
              }
            | {
                type: "live_opening_error";
                openerId: string;
                message?: string;
              }
            | {
                type: "live_reply_remote_audio_started";
                requestId: string;
                textChunk?: string;
              }
            | {
                type: "live_reply_stream_chunk";
                requestId: string;
                chunkIndex: number;
                textChunk?: string;
                audioBase64: string;
                sampleRate?: number;
              }
            | {
                type: "live_reply_stream_chunk_part";
                requestId: string;
                chunkIndex: number;
                partIndex: number;
                totalParts: number;
                audioSlice: string;
                textChunk?: string;
                sampleRate?: number;
              }
            | {
                type: "live_reply_stream_complete";
                requestId: string;
                transcriptText?: string;
                replyText?: string;
                replyMode?: string;
              }
            | {
                type: "live_reply_stream_error";
                requestId: string;
                message?: string;
              }
            | { type: "live_reply_error"; message?: string }
            | { type: string };
          if (payload.type === "live_reply_stream_chunk") {
            const requestId = "requestId" in payload ? payload.requestId : "";
            const chunkIndex = "chunkIndex" in payload ? payload.chunkIndex : -1;
            const audioBase64 = "audioBase64" in payload ? payload.audioBase64 : "";
            if (!requestId || chunkIndex < 0 || !audioBase64) {
              return;
            }
            setCallLoopState("speaking");
            setLiveConversationPhase("assistant_speaking");
            setMessage("NeuralTrainer is answering.");
            queueLiveStreamReplyChunk(requestId, chunkIndex, audioBase64);
            return;
          }
          if (payload.type === "live_reply_stream_chunk_part") {
            const requestId = "requestId" in payload ? payload.requestId : "";
            const chunkIndex = "chunkIndex" in payload ? payload.chunkIndex : -1;
            const partIndex = "partIndex" in payload ? payload.partIndex : -1;
            const totalParts = "totalParts" in payload ? payload.totalParts : 0;
            const audioSlice = "audioSlice" in payload ? payload.audioSlice : "";
            if (!requestId || chunkIndex < 0 || partIndex < 0 || totalParts <= 0 || !audioSlice) {
              return;
            }
            setCallLoopState("speaking");
            setLiveConversationPhase("assistant_speaking");
            setMessage("NeuralTrainer is answering.");
            queueLiveStreamReplyChunkPart(requestId, chunkIndex, partIndex, totalParts, audioSlice);
            return;
          }
          if (payload.type === "live_reply_remote_audio_started") {
            setCallLoopState("speaking");
            setLiveConversationPhase("assistant_speaking");
            setMessage("NeuralTrainer is answering.");
            return;
          }
          if (payload.type === "live_reply_stream_complete") {
            liveStreamReplyCompletedRef.current = true;
            setCallLoopState("speaking");
            setLiveConversationPhase("assistant_speaking");
            void refreshCallSessions();
            void refreshCallTurns(callId);
            if (
              !liveStreamReplyPlayingRef.current
              && liveStreamReplyQueueRef.current.length === 0
              && !hasPendingLiveStreamReplyParts()
            ) {
              finishLiveStreamReplyPlayback();
            }
            return;
          }
          if (payload.type === "live_reply_stream_error") {
            liveStreamReplyCompletedRef.current = true;
            const errorMessage = "message" in payload ? payload.message : "";
            setMessage(errorMessage || "North Star could not stream that spoken turn live.");
            setLiveFallbackAllowed(true);
            if (!liveStreamReplyPlayingRef.current && liveStreamReplyQueueRef.current.length === 0) {
              resetLiveStreamReplyState();
              if (!recordingTurn && activeAcceptedCall?.call_id === callId && !callLoopMuted) {
                setCallLoopState("listening");
                setLiveConversationPhase("ready_for_user");
                void startRemoteTurnRecording(activeAcceptedCall, { handsFree: true });
              }
            }
            return;
          }
          if (payload.type === "live_reply_chunk") {
            const requestId = "requestId" in payload ? payload.requestId : "";
            const index = "index" in payload ? payload.index : -1;
            const total = "total" in payload ? payload.total : 0;
            const payloadSlice = "payloadSlice" in payload ? payload.payloadSlice : "";
            if (!requestId || index < 0 || total <= 0 || !payloadSlice) {
              return;
            }
            const chunks = liveReplyChunksRef.current.get(requestId) ?? new Array(total).fill("");
            chunks[index] = payloadSlice;
            liveReplyChunksRef.current.set(requestId, chunks);
            if (chunks.filter(Boolean).length !== total) {
              return;
            }
            liveReplyChunksRef.current.delete(requestId);
            const mergedPayload = JSON.parse(chunks.join("")) as {
              transcriptText: string;
              replyText: string;
              replyAudioBase64: string;
              sampleRate: number;
            };
            setCallLoopState("speaking");
            setLiveConversationPhase("assistant_speaking");
            setLiveReplyAudioSrc(replyAudioUrl(mergedPayload.replyAudioBase64));
            setMessage("NeuralTrainer answered.");
            void refreshCallSessions();
            void refreshCallTurns(callId);
            return;
          }
            if (payload.type === "live_reply") {
            const result = "result" in payload ? payload.result : null;
            if (!result) {
              return;
            }
            setCallLoopState("speaking");
            setLiveConversationPhase("assistant_speaking");
            setMessage("NeuralTrainer answered.");
            if (result.remoteAudio) {
              setLiveReplyAudioSrc(null);
              if (liveRemotePlaybackTimerRef.current !== null) {
                window.clearTimeout(liveRemotePlaybackTimerRef.current);
              }
              liveRemotePlaybackTimerRef.current = window.setTimeout(() => {
                liveRemotePlaybackTimerRef.current = null;
                handleLiveReplyEnded();
              }, result.replyDurationMs ?? 1500);
            } else if (result.replyAudioBase64) {
              setLiveReplyAudioSrc(replyAudioUrl(result.replyAudioBase64));
            } else {
              return;
            }
            void refreshCallSessions();
            if (!result.remoteAudio) {
              void refreshCallTurns(callId);
            }
            return;
            }
          if (payload.type === "live_opening_chunk") {
            const openerId = "openerId" in payload ? payload.openerId : "";
            const index = "index" in payload ? payload.index : -1;
            const total = "total" in payload ? payload.total : 0;
            const payloadSlice = "payloadSlice" in payload ? payload.payloadSlice : "";
            if (!openerId || index < 0 || total <= 0 || !payloadSlice || liveOpeningRequestedCallIdRef.current !== callId) {
              return;
            }
            const chunks = liveOpeningChunksRef.current.get(openerId) ?? new Array(total).fill("");
            chunks[index] = payloadSlice;
            liveOpeningChunksRef.current.set(openerId, chunks);
            if (chunks.filter(Boolean).length !== total) {
              return;
            }
            liveOpeningChunksRef.current.delete(openerId);
            const mergedPayload = JSON.parse(chunks.join("")) as {
              text: string;
              audioBase64: string;
            };
            liveOpeningStartedCallIdRef.current = callId;
            setCallLoopState("opening");
            setLiveConversationPhase("waiting_for_opening_audio");
            setMessage(mergedPayload.text || "NeuralTrainer is opening the conversation.");
            if (liveOpeningRequestTimeoutRef.current !== null) {
              window.clearTimeout(liveOpeningRequestTimeoutRef.current);
              liveOpeningRequestTimeoutRef.current = null;
            }
            void delayForMinimumSetupToneLead().then(() => {
              if (liveOpeningRequestedCallIdRef.current !== callId) {
                return;
              }
              stopLiveSetupTone();
              setLiveReplyAudioSrc(replyAudioUrl(mergedPayload.audioBase64));
            });
            return;
          }
          if (payload.type === "live_opening_audio") {
            const openerId = "openerId" in payload ? payload.openerId : "";
            const audioBase64 = "audioBase64" in payload ? payload.audioBase64 : "";
            if (!openerId || !audioBase64 || liveOpeningRequestedCallIdRef.current !== callId) {
              return;
            }
            liveOpeningStartedCallIdRef.current = callId;
            setCallLoopState("opening");
            setLiveConversationPhase("waiting_for_opening_audio");
            setMessage(("text" in payload ? payload.text : "") || "NeuralTrainer is opening the conversation.");
            if (liveOpeningRequestTimeoutRef.current !== null) {
              window.clearTimeout(liveOpeningRequestTimeoutRef.current);
              liveOpeningRequestTimeoutRef.current = null;
            }
            void delayForMinimumSetupToneLead().then(() => {
              if (liveOpeningRequestedCallIdRef.current !== callId) {
                return;
              }
              stopLiveSetupTone();
              setLiveReplyAudioSrc(replyAudioUrl(audioBase64));
            });
            return;
          }
          if (payload.type === "live_opening_error") {
            completeLiveOpening(callId, {
              message: ("message" in payload ? payload.message : "") || "NeuralTrainer joined the line.",
            });
            setCallLoopState("listening");
            setLiveConversationPhase("ready_for_user");
            if (!recordingTurn && activeAcceptedCall?.call_id === callId && !callLoopMuted) {
              void startRemoteTurnRecording(activeAcceptedCall, { handsFree: true, reuseLiveStream: livePathReady });
            }
            return;
          }
          if (payload.type === "live_reply_error") {
            const errorMessage = "message" in payload ? payload.message : "";
            setMessage(errorMessage || "North Star could not process that spoken turn live.");
            setLiveFallbackAllowed(true);
            if (!recordingTurn && activeAcceptedCall?.call_id === callId && !callLoopMuted) {
              setCallLoopState("listening");
              setLiveConversationPhase("ready_for_user");
              void startRemoteTurnRecording(activeAcceptedCall, { handsFree: true });
            }
          }
        } catch {
          return;
        }
      };
      channel.onclose = () => {
        if (liveDataChannelRef.current === channel) {
          liveDataChannelRef.current = null;
        }
        const mediaStillStable = hasStableLiveMedia(peer, liveRemoteStreamRef.current);
        updateLiveCallDiagnostics({
          phase: mediaStillStable ? "mobile_data_channel_closed_media_still_live" : "mobile_data_channel_closed",
          dataChannelState: "closed",
          issue: mediaStillStable ? "" : "Mobile data channel closed before the live path completed.",
        });
        if (mediaStillStable) {
          setMessage("North Star kept the live media path open.");
          if (liveDataChannelRecoveryTimerRef.current !== null) {
            window.clearTimeout(liveDataChannelRecoveryTimerRef.current);
          }
          liveDataChannelRecoveryTimerRef.current = window.setTimeout(() => {
            liveDataChannelRecoveryTimerRef.current = null;
            if (activeAcceptedCall?.call_id === callId) {
              void ensureLiveCallOffer(callId);
            }
          }, 700);
        }
      };
      channel.onerror = () => {
        updateLiveCallDiagnostics({
          phase: "mobile_data_channel_error",
          dataChannelState: channel.readyState,
          issue: "Mobile data channel reported an error.",
        });
      };
    }
    peer.onicecandidate = (event) => {
      if (!event.candidate || liveSignalCallIdRef.current !== callId) {
        return;
      }
      updateLiveCallDiagnostics({
        phase: "mobile_ice_candidate_sent",
        iceGatheringState: peer.iceGatheringState,
        lastSignal: "ice_candidate_sent",
        localIceCandidates: liveCallDiagnostics.localIceCandidates + 1,
        localCandidateKinds: mergeCandidateKindList(
          liveCallDiagnostics.localCandidateKinds,
          detectCandidateKind(event.candidate.candidate),
        ),
      });
      void sendMobileWebRtcSignal(callId, "ice_candidate", event.candidate.toJSON()).catch(() => undefined);
    };
    peer.onsignalingstatechange = () => {
      updateLiveCallDiagnostics({
        phase: "mobile_signaling_state_changed",
        signalingState: peer.signalingState,
      });
    };
    peer.onicegatheringstatechange = () => {
      updateLiveCallDiagnostics({
        phase: "mobile_ice_gathering_state_changed",
        iceGatheringState: peer.iceGatheringState,
      });
    };
    peer.oniceconnectionstatechange = () => {
      updateLiveCallDiagnostics({
        phase: "mobile_ice_connection_state_changed",
        iceConnectionState: peer.iceConnectionState,
        issue: peer.iceConnectionState === "failed" ? "ICE connection failed on mobile." : "",
      });
    };
    peer.onconnectionstatechange = () => {
      if (liveSignalCallIdRef.current !== callId) return;
      const mediaStillStable = hasStableLiveMedia(peer, liveRemoteStreamRef.current);
      updateLiveCallDiagnostics({
        phase: "mobile_connection_state_changed",
        connectionState: peer.connectionState,
        issue:
          (
            peer.connectionState === "failed"
            || peer.connectionState === "disconnected"
          ) && !mediaStillStable
            ? "Mobile peer connection dropped before the live call was stable."
            : "",
      });
      if (peer.connectionState === "connected") {
        setMessage("North Star live call channel connected.");
      } else if ((peer.connectionState === "failed" || peer.connectionState === "disconnected") && !mediaStillStable) {
        setMessage("North Star fell back to the existing call path.");
      }
    };
    peer.ontrack = (event) => {
      const stream = event.streams[0];
      if (!stream) {
        return;
      }
      liveRemoteStreamRef.current = stream;
      updateLiveCallDiagnostics({
        phase: "mobile_remote_track_received",
        remoteTrackState: "received",
      });
      if (liveRemoteAudioRef.current) {
        liveRemoteAudioRef.current.srcObject = stream;
        void ensureLiveRemoteAudioBoost().then(() => {
          void liveRemoteAudioRef.current?.play().catch(() => undefined);
        });
      }
    };
  }

  async function ensureLiveCallOffer(callId: string) {
    const existingPeer = livePeerRef.current;
    const existingChannel = liveDataChannelRef.current;
    const existingChannelUsable =
      !!existingChannel
      && existingChannel.readyState !== "closing"
      && existingChannel.readyState !== "closed";
    const existingPeerUsable =
      liveSignalCallIdRef.current === callId
      && existingPeer
      && existingPeer.connectionState !== "closed"
      && existingPeer.connectionState !== "failed"
      && existingPeer.iceConnectionState !== "failed"
      && existingPeer.iceConnectionState !== "closed"
      && existingChannelUsable;
    if (existingPeerUsable) {
      return;
    }
    teardownLivePeerConnection({
      resetProcessedSignals: false,
      preserveSetupTone: liveConversationPhase === "connecting_transport" || liveConversationPhase === "waiting_for_opening_audio",
      preserveReplyPlayback:
        liveConversationPhase === "assistant_speaking"
        || liveStreamReplyPlayingRef.current
        || liveStreamReplyQueueRef.current.length > 0,
    });
    liveNegotiationStartedAtRef.current = Date.now();
    setLiveFallbackAllowed(false);
    const peer = new RTCPeerConnection(await getLiveRtcConfig());
    updateLiveCallDiagnostics({
      phase: "mobile_requesting_microphone",
      connectionState: peer.connectionState,
      signalingState: peer.signalingState,
      iceGatheringState: peer.iceGatheringState,
      iceConnectionState: peer.iceConnectionState,
      lastSignal: "offer_pending",
    });
    const inputStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    livePeerInputStreamRef.current = inputStream;
    startLiveInputMeter(inputStream);
    inputStream.getTracks().forEach((track) => {
      peer.addTrack(track, inputStream);
    });
    updateLiveCallDiagnostics({
      phase: "mobile_microphone_attached",
      dataChannelState: "creating",
    });
    const channel = peer.createDataChannel("northstar-call");
    attachLivePeer(callId, peer, channel);
    livePeerRef.current = peer;
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    await waitForIceGathering(peer);
    if (peer.localDescription) {
      await sendMobileWebRtcSignal(callId, "offer", peer.localDescription);
      updateLiveCallDiagnostics({
        phase: "mobile_offer_sent",
        lastSignal: "offer_sent",
        signalingState: peer.signalingState,
        iceGatheringState: peer.iceGatheringState,
      });
    }
  }

  async function handleMobileWebRtcSignal(callId: string, signal: CompanionWebRtcSignal) {
    if (processedLiveSignalIdsRef.current.has(signal.signal_id)) {
      return;
    }
    processedLiveSignalIdsRef.current.add(signal.signal_id);

    if (signal.signal_kind === "answer") {
      const peer = livePeerRef.current;
      if (!peer) return;
      await peer.setRemoteDescription(JSON.parse(signal.payload_json) as RTCSessionDescriptionInit);
      updateLiveCallDiagnostics({
        phase: "mobile_answer_applied",
        lastSignal: "answer_applied",
        signalingState: peer.signalingState,
      });
      return;
    }

    if (signal.signal_kind === "ice_candidate") {
      const peer = livePeerRef.current;
      if (!peer) {
        updateLiveCallDiagnostics({
          phase: "mobile_ice_candidate_skipped",
          lastSignal: "ice_candidate_received_without_peer",
          issue: "Mobile received an ICE candidate before the peer was ready.",
        });
        return;
      }
      const parsedCandidate = JSON.parse(signal.payload_json) as RTCIceCandidateInit;
      await peer.addIceCandidate(parsedCandidate);
      updateLiveCallDiagnostics({
        phase: "mobile_ice_candidate_applied",
        lastSignal: "ice_candidate_applied",
        iceConnectionState: peer.iceConnectionState,
        remoteIceCandidates: liveCallDiagnostics.remoteIceCandidates + 1,
        remoteCandidateKinds: mergeCandidateKindList(
          liveCallDiagnostics.remoteCandidateKinds,
          detectCandidateKind(parsedCandidate.candidate ?? ""),
        ),
      });
    }

    if (signal.signal_kind === "reconnect_request") {
      updateLiveCallDiagnostics({
        phase: "mobile_reconnect_requested",
        lastSignal: "reconnect_requested",
        issue: "",
      });
      await ensureLiveCallOffer(callId);
    }
  }

  async function refreshAll() {
    await Promise.all([
      refreshState(),
      refreshMessages(),
      refreshLocationEvents(),
      refreshCallSessions(),
      refreshCallReviews(),
      refreshPushStatus(),
    ]);
  }

  async function refreshState() {
    const response = await authedFetch(`/api/companion/state?user_handle=${encodeURIComponent(userHandle)}`);
    if (!response.ok) {
      setMessage("North Star state could not be loaded.");
      return;
    }
    const payload = (await response.json()) as { desktops: DesktopBinding[] };
    setState(payload.desktops);
  }

  async function refreshMessages() {
    const response = await authedFetch("/api/companion/messages", { method: "GET" });
    if (!response.ok) return;
    const payload = (await response.json()) as { messages: CompanionMessage[] };
    setMessages(payload.messages);
  }

  async function refreshLocationEvents() {
    const response = await authedFetch("/api/companion/location-events", { method: "GET" });
    if (!response.ok) return;
    const payload = (await response.json()) as { events: LocationEvent[] };
    setLocationEvents(payload.events);
  }

  async function refreshCallSessions() {
    const response = await authedFetch("/api/companion/call-sessions", { method: "GET" });
    if (!response.ok) return;
    const payload = (await response.json()) as { calls: CompanionCallSession[] };
    setCallSessions(payload.calls);
  }

  async function refreshCallReviews() {
    const response = await authedFetch("/api/companion/call-reviews", { method: "GET" });
    if (!response.ok) return;
    const payload = (await response.json()) as { reviews: CallReviewRecord[] };
    setCallReviews(payload.reviews);
  }

  async function refreshCallTurns(callId?: string) {
    const targetCallId = callId ?? selectedCallId;
    if (!targetCallId) {
      setCallTurns([]);
      return;
    }
    const response = await authedFetch(`/api/companion/call-turns?call_id=${encodeURIComponent(targetCallId)}`, { method: "GET" });
    if (!response.ok) return;
    const payload = (await response.json()) as { turns: CompanionCallTurn[] };
    setCallTurns(payload.turns);
  }

  async function refreshPushStatus() {
    const response = await authedFetch("/api/companion/push-subscriptions", { method: "GET" });
    if (!response.ok) return;
    const payload = (await response.json()) as PushStatus;
    setPushStatus(payload);
  }

  async function createSession() {
    const response = await fetch(`${apiBase}/api/auth/dev-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_handle: userHandle,
        display_name: displayName,
      }),
    });
    const payload = (await response.json()) as {
      session_token?: string;
      user_handle?: string;
      display_name?: string;
      error?: string;
    };
    if (!response.ok || !payload.session_token || !payload.user_handle || !payload.display_name) {
      setMessage(payload.error || "Session creation failed.");
      return;
    }

    const storedSession: StoredSession = {
      sessionToken: payload.session_token,
      userHandle: payload.user_handle,
      displayName: payload.display_name,
    };
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(storedSession));
    setSessionToken(payload.session_token);
    setUserHandle(payload.user_handle);
    setDisplayName(payload.display_name);
    setMessage("This phone is now signed in to North Star.");
  }

  async function bindDesktop() {
    if (!sessionToken) {
      setMessage("Create a companion session first.");
      return;
    }

    const response = await authedFetch("/api/companion/bind-desktop", {
      method: "POST",
      body: JSON.stringify({ desktop_name: desktopName }),
    });
    const payload = (await response.json()) as { device_token?: string; error?: string };
    if (!response.ok || !payload.device_token) {
      setMessage(payload.error || "Desktop binding failed.");
      return;
    }
    localStorage.setItem(DEVICE_STORAGE_KEY, payload.device_token);
    setDeviceToken(payload.device_token);
    setMessage("This phone is now linked to your desktop.");
    await refreshState();
  }

  async function checkLocationCapability() {
    if (!("geolocation" in navigator)) {
      setLocationState({
        permission_state: "unsupported",
        location_supported: false,
        background_supported: false,
        last_known_accuracy_meters: null,
        last_location_at: null,
      });
      setMessage("This device/browser does not expose geolocation.");
      return;
    }

    let permissionState = "unknown";
    if ("permissions" in navigator && navigator.permissions.query) {
      try {
        const permission = await navigator.permissions.query({
          name: "geolocation" as PermissionName,
        });
        permissionState = permission.state;
      } catch {
        permissionState = "unknown";
      }
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocationState({
          permission_state: permissionState === "unknown" ? "granted" : permissionState,
          location_supported: true,
          background_supported: false,
          last_known_accuracy_meters: position.coords.accuracy,
          last_location_at: new Date().toISOString(),
        });
        setMessage("Location sharing is available on this phone.");
      },
      () => {
        setLocationState({
          permission_state: permissionState === "unknown" ? "denied" : permissionState,
          location_supported: true,
          background_supported: false,
          last_known_accuracy_meters: null,
          last_location_at: null,
        });
        setMessage("North Star still needs location permission on this phone.");
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 },
    );
  }

  async function sendHeartbeat() {
    if (!deviceToken) {
      setMessage("Bind a desktop first.");
      return;
    }

    const response = await fetch(`${apiBase}/api/companion/desktop-heartbeat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        device_token: deviceToken,
        status: "online",
        location_capability: locationState,
      }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({ error: "Heartbeat failed." }))) as { error?: string };
      setMessage(payload.error || "Heartbeat failed.");
      return;
    }

    setMessage("Desktop heartbeat sent to North Star.");
    await refreshState();
  }

  async function sendMessage() {
    if (!messageDraft.trim()) return;

    const response = await authedFetch("/api/companion/messages", {
      method: "POST",
      body: JSON.stringify({ text: messageDraft.trim() }),
    });
    if (!response.ok) {
      setMessage("Message send failed.");
      return;
    }
    setMessageDraft("");
    setMessage("Message sent to NeuralTrainer.");
    await refreshMessages();
  }

  async function startCallFromPhone() {
    if (!sessionToken) {
      setMessage("Create a companion session first.");
      return;
    }
    if (!deviceToken) {
      setMessage("Link your desktop first.");
      return;
    }
    if (activeAcceptedCall) {
      setSelectedCallId(activeAcceptedCall.call_id);
      setMessage("The line is already open.");
      return;
    }
    if (incomingCall) {
      setSelectedCallId(incomingCall.call_id);
      setMessage("There is already an incoming call waiting.");
      return;
    }

    void startLiveSetupTone();

    const response = await authedFetch("/api/companion/call-sessions/from-mobile", {
      method: "POST",
      body: JSON.stringify({
        note: MOBILE_OUTBOUND_CALL_NOTE,
      }),
    });
    if (!response.ok) {
      stopLiveSetupTone();
      setMessage("North Star could not reach NeuralTrainer just then.");
      return;
    }

    const call = (await response.json()) as CompanionCallSession;
    stopRemoteTurnRecording();
    setCallLoopMuted(false);
    setCallLoopState("idle");
    setLiveConversationPhase("connecting_transport");
    setLiveReplyAudioSrc(null);
    lastPlayedReplyTurnIdRef.current = null;
    setCallTurns([]);
    setView("chats");
    setSelectedCallId(call.call_id);
    setMenuOpen(false);
    outboundCallIdsRef.current.add(call.call_id);
    setMessage("Calling NeuralTrainer now.");
    await refreshCallSessions();
  }

  function queueCallReview(
    callId: string,
    sentiment: CallReviewSentiment,
    notes = "",
    options?: { collapse?: boolean; message?: string },
  ) {
    const draft: PendingCallReviewRecord = {
      review_id: `pending-${callId}`,
      call_id: callId,
      user_handle: userHandle,
      sentiment,
      notes: notes.trim(),
      created_at: new Date().toISOString(),
      pending_sync: true,
    };

    setPendingCallReviews((current) => [
      draft,
      ...current.filter((review) => review.call_id !== callId),
    ]);
    setPostCallReviewCallId("");
    if (options?.collapse !== false) {
      setSelectedCallId("");
    }
    setMessage(options?.message ?? "Review noted. North Star will sync it when available.");
    void syncPendingCallReviews([draft]);
  }

  async function respondToCall(callId: string, action: "accept" | "decline" | "missed" | "end") {
    const response = await authedFetch("/api/companion/call-sessions/respond", {
      method: "POST",
      body: JSON.stringify({ call_id: callId, action }),
    });
    if (!response.ok) {
      setMessage("Call action failed.");
      return;
    }
    if (action === "decline") {
      queueCallReview(callId, "intrusive", "", {
        collapse: true,
        message: "Call declined.",
      });
    } else if (action === "accept") {
      void startLiveSetupTone();
      setSelectedCallId(callId);
      setMessage("Call is connecting.");
      setLiveConversationPhase("connecting_transport");
    } else if (action === "end") {
      const endingCall = callSessions.find((call) => call.call_id === callId) ?? null;
      if (endingCall && !callWasStartedFromPhone(endingCall)) {
        setPostCallReviewCallId(callId);
        setSelectedCallId(callId);
      } else {
        setPostCallReviewCallId("");
        setSelectedCallId("");
      }
      setMessage("Call ended.");
      setLiveConversationPhase("idle");
    } else {
      setMessage(`Call marked as ${action}.`);
      setLiveConversationPhase("idle");
    }
    await refreshCallSessions();
  }

  function submitCallReview(callId: string, sentiment: CallReviewSentiment) {
    queueCallReview(callId, sentiment);
  }

  async function syncPendingCallReviews(overrides?: PendingCallReviewRecord[]) {
    const queue = overrides ?? pendingCallReviews;
    if (!sessionToken || queue.length === 0) {
      return;
    }

    let syncedAny = false;
    const stillPending: PendingCallReviewRecord[] = [];

    for (const review of queue) {
      try {
        const response = await authedFetch("/api/companion/call-reviews", {
          method: "POST",
          body: JSON.stringify({
            call_id: review.call_id,
            sentiment: review.sentiment,
            notes: review.notes.trim(),
          }),
        });
        if (!response.ok) {
          stillPending.push(review);
          continue;
        }
        syncedAny = true;
      } catch {
        stillPending.push(review);
      }
    }

    setPendingCallReviews((current) => {
      const untouched = overrides ? current.filter((review) => !queue.some((item) => item.call_id === review.call_id)) : [];
      return [...stillPending, ...untouched];
    });

    if (syncedAny) {
      await refreshCallReviews();
    }
  }

  async function requestNotificationPermission() {
    if (!("Notification" in window)) {
      setMessage("Notifications are not supported on this device.");
      return;
    }
    const permission = await Notification.requestPermission();
    setPushCapability((current) => ({ ...current, permission }));
    setMessage(`Notification permission is now ${formatPermission(permission)}.`);
  }

  async function registerPushSubscription() {
    if (!sessionToken) {
      setMessage("Create a North Star session first.");
      return;
    }
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setMessage("This device/browser does not support web push subscriptions.");
      return;
    }

    if (pushCapability.permission !== "granted") {
      await requestNotificationPermission();
      if (Notification.permission !== "granted") {
        return;
      }
    }

    const registration = await navigator.serviceWorker.ready;
    const statusResponse = await authedFetch("/api/companion/push-subscriptions", { method: "GET" });
    if (!statusResponse.ok) {
      setMessage("North Star push status could not be loaded.");
      return;
    }
    const status = (await statusResponse.json()) as PushStatus;
    setPushStatus(status);

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(status.vapid_public_key),
      });
    }

    const serialized = subscription.toJSON() as {
      endpoint?: string;
      keys?: { p256dh?: string; auth?: string };
    };
    if (!serialized.endpoint || !serialized.keys?.p256dh || !serialized.keys?.auth) {
      setMessage("Push subscription was created, but the browser returned incomplete key material.");
      return;
    }

    const response = await authedFetch("/api/companion/push-subscriptions", {
      method: "POST",
      body: JSON.stringify({
        endpoint: serialized.endpoint,
        keys: {
          p256dh: serialized.keys.p256dh,
          auth: serialized.keys.auth,
        },
      }),
    });
    if (!response.ok) {
      setMessage("North Star could not store this push subscription.");
      return;
    }

    setMessage("This phone can now receive North Star wake notifications.");
    await refreshPushStatus();
  }

  function enqueueLocation(coords: GeolocationCoordinates, source: string) {
    const event: QueuedLocationEvent = {
      latitude: coords.latitude,
      longitude: coords.longitude,
      accuracy_meters: coords.accuracy,
      source,
      captured_at: new Date().toISOString(),
    };
    setLocationQueue((current) => [...current.slice(-49), event]);
    setLocationState((current) => ({
      ...current,
      permission_state: current.permission_state === "unknown" ? "granted" : current.permission_state,
      location_supported: true,
      last_known_accuracy_meters: coords.accuracy,
      last_location_at: event.captured_at,
    }));
  }

  async function flushLocationQueue() {
    if (!sessionToken || locationQueue.length === 0) return;

    let sent = 0;
    for (const event of locationQueue) {
      const response = await authedFetch("/api/companion/location-events", {
        method: "POST",
        body: JSON.stringify({
          latitude: event.latitude,
          longitude: event.longitude,
          accuracy_meters: event.accuracy_meters,
          source: event.source,
        }),
      });
      if (!response.ok) {
        setMessage("North Star paused location syncing because one update failed.");
        break;
      }
      sent += 1;
    }

    if (sent > 0) {
      setLocationQueue((current) => current.slice(sent));
      setMessage(`Synced ${sent} queued location update${sent === 1 ? "" : "s"} to North Star.`);
      await refreshLocationEvents();
    }
  }

  function startWatchingLocation() {
    if (!("geolocation" in navigator)) {
      setMessage("Geolocation is not available on this device.");
      return;
    }
    if (watchIdRef.current !== null) {
      setWatchingLocation(true);
      return;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        enqueueLocation(position.coords, "mobile_watch");
        setWatchingLocation(true);
      },
      () => {
        setWatchingLocation(false);
        setMessage("Live location sharing stopped because the phone could not keep reading location.");
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 10000 },
    );

    setMessage("Live location sharing is now running on this phone.");
  }

  function stopWatchingLocation() {
    if (watchIdRef.current !== null && "geolocation" in navigator) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setWatchingLocation(false);
  }

  async function uploadLocationNow() {
    if (!("geolocation" in navigator)) {
      setMessage("Geolocation is not available on this device.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        enqueueLocation(position.coords, "mobile_manual");
        await flushLocationQueue();
      },
      () => {
      setMessage("North Star could not capture your location just then.");
      },
      { enableHighAccuracy: true, timeout: 7000, maximumAge: 0 },
    );
  }

  function resetHandsFreeDetection() {
    speechDetectedRef.current = false;
    silenceFrameCountRef.current = 0;
    silenceDurationMsRef.current = 0;
    speechFrameCountRef.current = 0;
    callTurnAudioChunksRef.current = [];
  }

  async function startRemoteTurnRecording(targetCall = selectedCall, options?: { handsFree?: boolean; reuseLiveStream?: boolean }) {
    if (!targetCall) {
      setMessage("Choose a call first.");
      return;
    }
    if (
      recordingTurnActiveRef.current
      || !!callTurnAudioContextRef.current
      || pendingRecordingStartCallIdRef.current === targetCall.call_id
    ) {
      return;
    }
    pendingRecordingStartCallIdRef.current = targetCall.call_id;
    setSelectedCallId(targetCall.call_id);
    handsFreeCallIdRef.current = options?.handsFree ? targetCall.call_id : null;
    try {
      const stream = options?.reuseLiveStream && livePeerInputStreamRef.current
        ? livePeerInputStreamRef.current
        : await navigator.mediaDevices.getUserMedia({ audio: true });
      const context = new AudioContext({ sampleRate: 16000 });
      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(4096, 1, 1);
      const sink = context.createGain();
      sink.gain.value = 0;
      resetHandsFreeDetection();

      processor.onaudioprocess = (event) => {
        const input = event.inputBuffer.getChannelData(0);
        const chunk = new Float32Array(input);
        callTurnAudioChunksRef.current.push(chunk);
        const liveChannel = canUseLiveSpeechStreaming(targetCall.call_id) ? liveDataChannelRef.current : null;
        const sampleRate = context.sampleRate;
        if (!options?.handsFree || sendingTurnRef.current) {
          if (!options?.handsFree && liveChannel) {
            void sendLiveSpeechFrame(liveChannel, targetCall.call_id, chunk, sampleRate).catch(() => undefined);
          }
          return;
        }

        let sum = 0;
        for (let index = 0; index < chunk.length; index += 1) {
          sum += chunk[index] * chunk[index];
        }
        const rms = Math.sqrt(sum / chunk.length);
        const speaking = rms > 0.01;
        const chunkDurationMs = (chunk.length / sampleRate) * 1000;
        const requiredSilenceMs = Math.max(250, audioSettings.turnEndDelaySeconds * 1000);

        if (speaking) {
          speechDetectedRef.current = true;
          silenceFrameCountRef.current = 0;
          silenceDurationMsRef.current = 0;
          speechFrameCountRef.current += 1;
          if (liveChannel) {
            void sendLiveSpeechFrame(liveChannel, targetCall.call_id, chunk, sampleRate).catch(() => undefined);
          }
        } else if (speechDetectedRef.current) {
          if (liveChannel) {
            void sendLiveSpeechFrame(liveChannel, targetCall.call_id, chunk, sampleRate).catch(() => undefined);
          }
          silenceFrameCountRef.current += 1;
          silenceDurationMsRef.current += chunkDurationMs;
          if (speechFrameCountRef.current >= 3 && silenceDurationMsRef.current >= requiredSilenceMs) {
            void stopAndSendRemoteTurn(targetCall, { handsFree: true });
          }
        }
      };

      source.connect(processor);
      processor.connect(sink);
      sink.connect(context.destination);

      callTurnStreamRef.current = stream;
      callTurnUsesLivePeerStreamRef.current = Boolean(options?.reuseLiveStream && livePeerInputStreamRef.current === stream);
      callTurnAudioContextRef.current = context;
      callTurnProcessorRef.current = processor;
      callTurnSourceRef.current = source;
      callTurnSinkRef.current = sink;
      recordingTurnActiveRef.current = true;
      pendingRecordingStartCallIdRef.current = null;
      setRecordingTurn(true);
      setCallLoopState(options?.handsFree ? "listening" : "idle");
      setMessage(options?.handsFree ? "NeuralTrainer is listening." : "Listening now. Send the turn when you're ready.");
    } catch {
      pendingRecordingStartCallIdRef.current = null;
      stopRemoteTurnRecording();
      setMessage("This phone could not open the microphone for North Star.");
    }
  }

  function teardownRemoteTurnRecording() {
    callTurnProcessorRef.current?.disconnect();
    callTurnSourceRef.current?.disconnect();
    callTurnSinkRef.current?.disconnect();
    callTurnAudioContextRef.current?.close().catch(() => undefined);
    if (!callTurnUsesLivePeerStreamRef.current) {
      callTurnStreamRef.current?.getTracks().forEach((track) => track.stop());
    }
    callTurnProcessorRef.current = null;
    callTurnSourceRef.current = null;
    callTurnSinkRef.current = null;
    callTurnAudioContextRef.current = null;
    callTurnStreamRef.current = null;
    callTurnUsesLivePeerStreamRef.current = false;
  }

  function stopRemoteTurnRecording() {
    recordingTurnActiveRef.current = false;
    pendingRecordingStartCallIdRef.current = null;
    setRecordingTurn(false);
    handsFreeCallIdRef.current = null;
    resetHandsFreeDetection();
    teardownRemoteTurnRecording();
  }

  async function stopAndSendRemoteTurn(targetCall = selectedCall, options?: { handsFree?: boolean }) {
    if (!targetCall) {
      setMessage("Choose a call first.");
      return;
    }
    const context = callTurnAudioContextRef.current;
    const liveChannel = canUseLiveSpeechStreaming(targetCall.call_id) ? liveDataChannelRef.current : null;
    const streamedRequestId = liveStreamingTurnRequestIdRef.current;
    if (
      !context
      || (
        callTurnAudioChunksRef.current.length === 0
        && !streamedRequestId
      )
      || (options?.handsFree && !speechDetectedRef.current && !streamedRequestId)
    ) {
      stopRemoteTurnRecording();
      if (options?.handsFree) {
        setCallLoopState("listening");
        setLiveConversationPhase("ready_for_user");
        void startRemoteTurnRecording(targetCall, { handsFree: true, reuseLiveStream: livePathReady });
      } else {
        setMessage("No voice was captured yet.");
      }
      return;
    }

    sendingTurnRef.current = true;
    setCallLoopState("processing");
    setLiveConversationPhase("assistant_processing");

    try {
      if (liveChannel && streamedRequestId) {
        stopRemoteTurnRecording();
        await finishLiveSpeechTurn(liveChannel);
        setMessage("Live speech turn sent. Waiting for NeuralTrainer's reply.");
        return;
      }

      const audioBase64 = audioBufferToWavBase64(callTurnAudioChunksRef.current, context.sampleRate);
      stopRemoteTurnRecording();
      const shouldUseStableTurnUpload =
        audioBase64.length > LIVE_TURN_DATA_CHANNEL_MAX_BASE64;
      if (
        !shouldUseStableTurnUpload
        &&
        liveSignalCallIdRef.current === targetCall.call_id
        && liveDataChannelRef.current
        && liveDataChannelRef.current.readyState === "open"
      ) {
        const requestId = `${targetCall.call_id}-${Date.now()}`;
        await sendChunkedLiveTurn(liveDataChannelRef.current, requestId, audioBase64);
        setMessage("Turn sent live. Waiting for NeuralTrainer's reply.");
        return;
      }

      const response = await authedFetch("/api/companion/call-turns/from-mobile", {
        method: "POST",
        body: JSON.stringify({
          call_id: targetCall.call_id,
          audio_base64: audioBase64,
        }),
      });
      if (!response.ok) {
        setMessage("North Star could not send that spoken turn.");
        if (options?.handsFree) {
          setCallLoopState("listening");
          setLiveConversationPhase("ready_for_user");
          void startRemoteTurnRecording(targetCall, { handsFree: true, reuseLiveStream: livePathReady });
        }
        return;
      }
      setMessage(
        shouldUseStableTurnUpload
          ? "Turn sent on the stable path. Waiting for NeuralTrainer's reply."
          : "Turn sent. Waiting for NeuralTrainer's reply.",
      );
      await refreshCallTurns(targetCall.call_id);
    } finally {
      liveStreamingTurnRequestIdRef.current = null;
      sendingTurnRef.current = false;
    }
  }

  const mostRecentDesktop = state[0];
  const selectedCall =
    callSessions.find((call) => call.call_id === selectedCallId) ??
    callSessions[0] ??
    null;
  const effectiveCallReviews = useMemo(() => {
    const reviewMap = new Map<string, CallReviewRecord | PendingCallReviewRecord>();
    for (const review of callReviews) {
      reviewMap.set(review.call_id, review);
    }
    for (const review of pendingCallReviews) {
      reviewMap.set(review.call_id, review);
    }
    return Array.from(reviewMap.values());
  }, [callReviews, pendingCallReviews]);
  const orderedMessages = [...messages];
  const orderedCalls = [...callSessions].sort(
    (left, right) => new Date(right.requested_at).getTime() - new Date(left.requested_at).getTime(),
  );
  const threadItems = useMemo(
    () =>
      [
        ...orderedMessages.map((entry) => ({
          kind: "message" as const,
          id: entry.message_id,
          createdAt: entry.created_at,
          message: entry,
        })),
        ...callSessions.filter((call) => call.status === "pending").map((call) => ({
          kind: "call" as const,
          id: call.call_id,
          createdAt: call.requested_at,
          call,
        })),
      ].sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()),
    [orderedMessages, callSessions],
  );
  const selectedCallTurns = useMemo(
    () =>
      [...callTurns].sort(
        (left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime(),
      ),
    [callTurns],
  );
  const activeAcceptedCall =
    callSessions.find((call) => call.status === "accepted") ??
    null;
  const incomingCall =
    callSessions.find((call) => call.status === "pending") ??
    null;
  const postCallReviewCall =
    (postCallReviewCallId
      ? callSessions.find((call) => call.call_id === postCallReviewCallId && call.status === "ended") ?? null
      : null);
  const callOverlayCall = activeAcceptedCall ?? incomingCall ?? postCallReviewCall;
  const latestReplyTurn =
    [...selectedCallTurns]
      .reverse()
      .find((turn) => turn.call_id === activeAcceptedCall?.call_id && Boolean(turn.reply_audio_base64)) ??
    null;
  const liveCallStatus = getLiveCallStatusCopy(liveConversationPhase, callLoopMuted);
  const lastMessage = orderedMessages[0] ?? null;
  const activeCallCount = callSessions.filter((call) => call.status === "accepted" || call.status === "pending").length;
  const outboundSelectedCall =
    callOverlayCall && (outboundCallIdsRef.current.has(callOverlayCall.call_id) || callWasStartedFromPhone(callOverlayCall))
      ? callOverlayCall
      : null;
  const livePathReady =
    Boolean(
      activeAcceptedCall
      && liveSignalCallIdRef.current === activeAcceptedCall.call_id
      && (
        (liveDataChannelRef.current && liveDataChannelRef.current.readyState === "open")
        || hasStableLiveMedia(livePeerRef.current, liveRemoteStreamRef.current)
      ),
    );
  const livePathNegotiating =
    Boolean(
      activeAcceptedCall
      && liveSignalCallIdRef.current === activeAcceptedCall.call_id
      && !livePathReady
      && !liveFallbackAllowed,
    );
  const shouldAutoOpenLiveCall = Boolean(activeAcceptedCall);
  const liveOpeningStarted =
    Boolean(activeAcceptedCall && liveOpeningStartedCallIdRef.current === activeAcceptedCall.call_id);
  const liveConversationReadyTarget =
    Boolean(
      activeAcceptedCall
      && (
        liveFallbackAllowed
        || (
          livePathReady
          && (
            !shouldAutoOpenLiveCall
            || liveOpeningCompletedCallIdRef.current === activeAcceptedCall.call_id
          )
        )
      ),
    );
  const shouldPlaySetupTone =
    Boolean(
      callOverlayCall
      && (
        liveConversationPhase === "connecting_transport"
        || liveConversationPhase === "waiting_for_opening_audio"
      ),
    );
  const liveDataChannelOpen = liveCallDiagnostics.dataChannelState === "open";
  const liveConversationReadyFlag =
    liveConversationPhase === "ready_for_user"
    || liveConversationPhase === "assistant_processing"
    || liveConversationPhase === "assistant_speaking";
  const openingAudioStatus =
    !shouldAutoOpenLiveCall
      ? "not needed"
      : liveOpeningCompletedCallIdRef.current === activeAcceptedCall?.call_id
        ? "played"
        : liveOpeningStarted
          ? "received"
          : liveOpeningRequestedCallIdRef.current === activeAcceptedCall?.call_id
            ? "waiting"
            : "pending";
  const livePathLabel = livePathReady
    ? "Live channel connected"
    : livePathNegotiating
      ? "Connecting live path"
      : "Fallback voice path";
  const locationReady = locationState.location_supported && locationState.permission_state !== "denied";
  const pushReady = Boolean(pushStatus?.push_supported && (pushStatus?.registered_subscriptions ?? 0) > 0);
  const sessionReady = Boolean(sessionToken);
  const desktopReady = Boolean(deviceToken);
  const connectionSummary = sessionReady && desktopReady
    ? `Connected to ${mostRecentDesktop?.desktop_name || "your desktop"}`
    : "Finish linking this phone to your desktop companion";
  const desktopLocationState = mostRecentDesktop?.location_capability ?? locationState;
  const locationHeadline = locationSummary(desktopLocationState, watchingLocation, locationQueue.length);
  const notificationsHeadline = pushSummary(pushStatus, pushCapability);
  const callScreenTitle =
    selectedCall?.status === "pending"
      ? "Incoming call"
      : selectedCall?.status === "accepted"
        ? "Live with NeuralTrainer"
        : "Call recap";
  const compactStats = [
    { label: "Session", value: sessionReady ? "Ready" : "Missing" },
    { label: "Desktop", value: desktopReady ? "Linked" : "Pending" },
    { label: "Push", value: pushReady ? "On" : "Setup" },
    { label: "Location", value: locationReady ? "On" : "Needs access" },
  ];
  const settingsMenuItems: Array<{ section: SettingsSection; label: string; helper: string }> = [
    { section: "account", label: "Account", helper: "Identity and API" },
    { section: "desktop", label: "Desktop", helper: "Linked machine" },
    { section: "audio", label: "Audio", helper: "Opening and reply loudness" },
    { section: "notifications", label: "Notifications", helper: "Push wake-ups" },
    { section: "location", label: "Location", helper: "Shared context" },
    { section: "debug", label: "Debug", helper: "Call diagnostics and hidden details" },
  ];
  const currentSettingsMeta = settingsMenuItems.find((item) => item.section === settingsSection) ?? null;
  const topBarTitle =
    view === "chats"
      ? `NeuralTrainer ${NORTHSTAR_MOBILE_VERSION}`
      : settingsSection === "menu"
        ? "Settings"
        : currentSettingsMeta?.label ?? "Settings";
  const topBarSubtitle =
    view === "chats"
      ? (activeCallCount > 0 ? `${activeCallCount} call active` : (pushReady ? "Companion chat" : "Chat ready, push still syncing"))
      : settingsSection === "menu"
        ? "Companion preferences"
        : currentSettingsMeta?.helper ?? "Companion preferences";

  function openSettings(target: SettingsSection) {
    setSettingsSection(target);
    setView("settings");
    setMenuOpen(false);
  }

  function goToView(target: AppView) {
    setView(target);
    setMenuOpen(false);
  }

  function toggleCallLoopMute() {
    if (livePathReady && livePeerInputStreamRef.current) {
      const nextMuted = !callLoopMuted;
      livePeerInputStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !nextMuted;
      });
      setCallLoopMuted(nextMuted);
      if (nextMuted) {
        setCallLoopState("idle");
        stopRemoteTurnRecording();
      } else {
        if (liveConversationReadyFlag) {
          setCallLoopState("listening");
          setLiveConversationPhase("ready_for_user");
        }
      }
      return;
    }
    if (callLoopMuted) {
      setCallLoopMuted(false);
      if (activeAcceptedCall && !recordingTurn && liveConversationReadyFlag) {
        setLiveConversationPhase("ready_for_user");
        void startRemoteTurnRecording(activeAcceptedCall, { handsFree: true });
      }
      return;
    }
    setCallLoopMuted(true);
    setCallLoopState("idle");
    stopRemoteTurnRecording();
  }

  async function resumeLiveHandsFreeListening(call: CompanionCallSession) {
    if (callLoopMuted || recordingTurn || handsFreeCallIdRef.current === call.call_id) {
      return;
    }
    const liveChannel = canUseLiveSpeechStreaming(call.call_id) ? liveDataChannelRef.current : null;
    if (livePathReady && liveChannel) {
      try {
        await waitForLiveDataChannelCapacity(liveChannel);
      } catch {
        return;
      }
      if (!canUseLiveSpeechStreaming(call.call_id) || recordingTurn || handsFreeCallIdRef.current === call.call_id) {
        return;
      }
      await startRemoteTurnRecording(call, { handsFree: true, reuseLiveStream: true });
      return;
    }
    await startRemoteTurnRecording(call, { handsFree: true });
  }

  function handleLiveReplyEnded() {
    if (liveStreamReplyPlayingRef.current || liveStreamReplyQueueRef.current.length > 0 || liveStreamReplyCompletedRef.current) {
      setLiveReplyAudioSrc(null);
      finishLiveStreamReplyPlayback();
      return;
    }
    setLiveReplyAudioSrc(null);
    if (activeAcceptedCall && liveOpeningStartedCallIdRef.current === activeAcceptedCall.call_id) {
      completeLiveOpening(activeAcceptedCall.call_id, {
        message: "The line is open. North Star is listening for the next thing you say.",
      });
      setLiveConversationPhase("ready_for_user");
    }
    if (!activeAcceptedCall || callLoopMuted) {
      setCallLoopState("idle");
      setLiveConversationPhase("idle");
      return;
    }
    if (!liveConversationReadyFlag) {
      setCallLoopState(livePathReady && shouldAutoOpenLiveCall ? "opening" : "connecting");
      setLiveConversationPhase(livePathReady && shouldAutoOpenLiveCall ? "waiting_for_opening_audio" : "connecting_transport");
      return;
    }
    setCallLoopState("listening");
    setLiveConversationPhase("ready_for_user");
    if (!recordingTurn) {
      void resumeLiveHandsFreeListening(activeAcceptedCall);
    }
  }

  useEffect(() => {
    if (!selectedCall && selectedCallId) {
      setSelectedCallId("");
      return;
    }
    if (!selectedCall) return;
    setSelectedCallId(selectedCall.call_id);
  }, [selectedCall?.call_id, selectedCallId]);

  useEffect(() => {
    if (!callOverlayCall || selectedCallId === callOverlayCall.call_id) return;
    setSelectedCallId(callOverlayCall.call_id);
  }, [callOverlayCall?.call_id, selectedCallId]);

  useEffect(() => {
    if (activeAcceptedCall?.call_id) {
      previousAcceptedCallIdRef.current = activeAcceptedCall.call_id;
      return;
    }
    const previousAcceptedCallId = previousAcceptedCallIdRef.current;
    if (!previousAcceptedCallId) {
      return;
    }
    const endedCall = callSessions.find((call) => call.call_id === previousAcceptedCallId) ?? null;
    const alreadyReviewed = effectiveCallReviews.some((review) => review.call_id === previousAcceptedCallId);
    if (endedCall?.status === "ended" && !alreadyReviewed && !callWasStartedFromPhone(endedCall)) {
      setPostCallReviewCallId(previousAcceptedCallId);
      setSelectedCallId(previousAcceptedCallId);
    }
    previousAcceptedCallIdRef.current = null;
  }, [activeAcceptedCall?.call_id, callSessions, effectiveCallReviews]);

  useEffect(() => {
    if (!postCallReviewCallId) {
      return;
    }
    const trackedCall = callSessions.find((call) => call.call_id === postCallReviewCallId) ?? null;
    const alreadyReviewed = effectiveCallReviews.some((review) => review.call_id === postCallReviewCallId);
    if (!trackedCall || trackedCall.status !== "ended" || alreadyReviewed || callWasStartedFromPhone(trackedCall)) {
      setPostCallReviewCallId("");
    }
  }, [postCallReviewCallId, callSessions, effectiveCallReviews]);

  useEffect(() => {
    if (shouldPlaySetupTone) {
      void startLiveSetupTone();
      return;
    }
    stopLiveSetupTone();
  }, [shouldPlaySetupTone]);

  useEffect(() => {
    if (!activeAcceptedCall) {
      handsFreeCallIdRef.current = null;
      setCallLoopState("idle");
      setLiveConversationPhase(
        Boolean(callOverlayCall && outboundSelectedCall && callOverlayCall.status === "pending")
          ? "connecting_transport"
          : "idle",
      );
      setCallLoopMuted(false);
      setLiveFallbackAllowed(false);
      stopRemoteTurnRecording();
      teardownLivePeerConnection({
        preserveSetupTone: liveConversationPhase === "connecting_transport" || liveConversationPhase === "waiting_for_opening_audio",
      });
      return;
    }
    if (!liveConversationReadyTarget) {
      stopRemoteTurnRecording();
      setCallLoopState(livePathReady && shouldAutoOpenLiveCall ? "opening" : "connecting");
      setLiveConversationPhase(livePathReady && shouldAutoOpenLiveCall ? "waiting_for_opening_audio" : "connecting_transport");
      return;
    }
    if (livePathReady) {
      setCallLoopState("listening");
      setLiveConversationPhase("ready_for_user");
      if (callLoopMuted || recordingTurn || handsFreeCallIdRef.current === activeAcceptedCall.call_id || callLoopState === "processing" || callLoopState === "speaking") {
        return;
      }
      void startRemoteTurnRecording(activeAcceptedCall, { handsFree: true, reuseLiveStream: true });
      return;
    }
    if (callLoopMuted || recordingTurn || handsFreeCallIdRef.current === activeAcceptedCall.call_id || callLoopState === "processing" || callLoopState === "speaking") {
      return;
    }
    setLiveConversationPhase("ready_for_user");
    void startRemoteTurnRecording(activeAcceptedCall, { handsFree: true });
  }, [activeAcceptedCall?.call_id, callOverlayCall?.status, outboundSelectedCall?.call_id, callLoopMuted, recordingTurn, callLoopState, livePathReady, liveFallbackAllowed, liveConversationReadyTarget, shouldAutoOpenLiveCall]);

  useEffect(() => {
    if (!activeAcceptedCall) {
      teardownLivePeerConnection();
      return;
    }

    let cancelled = false;
    const callId = activeAcceptedCall.call_id;

    async function syncSignals() {
      try {
        await ensureLiveCallOffer(callId);
        const signals = await pullMobileWebRtcSignals(callId);
        if (cancelled || liveSignalCallIdRef.current !== callId) {
          return;
        }
        for (const signal of signals) {
          await handleMobileWebRtcSignal(callId, signal);
        }
      } catch {
        // Keep the current phone call loop working while live transport is being introduced.
      }
    }

    void syncSignals();
    const timer = window.setInterval(() => {
      void syncSignals();
    }, 1500);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeAcceptedCall?.call_id]);

  useEffect(() => {
    if (
      !activeAcceptedCall
      || livePathReady
      || liveFallbackAllowed
      || liveCallDiagnostics.connectionState === "connected"
      || liveCallDiagnostics.iceConnectionState === "connected"
    ) {
      return;
    }
    const timer = window.setTimeout(() => {
      setLiveFallbackAllowed(true);
      updateLiveCallDiagnostics({
        phase: "mobile_live_negotiation_timed_out",
        issue: "Live path did not stabilize quickly enough, so North Star opened the fallback voice path.",
      });
    }, 9000);
    return () => window.clearTimeout(timer);
  }, [
    activeAcceptedCall?.call_id,
    livePathReady,
    liveFallbackAllowed,
    liveCallDiagnostics.connectionState,
    liveCallDiagnostics.iceConnectionState,
  ]);

  useEffect(() => {
    if (!liveCallDiagnostics.issue || livePathReady) {
      return;
    }
    setLiveFallbackAllowed(true);
  }, [liveCallDiagnostics.issue, livePathReady]);

  useEffect(() => {
    if (livePathReady) {
      setLiveFallbackAllowed(false);
    }
  }, [livePathReady]);

  useEffect(() => {
    if (
      !activeAcceptedCall
      || !livePathReady
      || !shouldAutoOpenLiveCall
      || !liveDataChannelOpen
      || liveOpeningRequestedCallIdRef.current === activeAcceptedCall.call_id
      || liveOpeningCompletedCallIdRef.current === activeAcceptedCall.call_id
      || !liveDataChannelRef.current
      || liveDataChannelRef.current.readyState !== "open"
    ) {
      return;
    }
    liveOpeningRequestedCallIdRef.current = activeAcceptedCall.call_id;
    setCallLoopState("opening");
    setLiveConversationPhase("waiting_for_opening_audio");
    setMessage("The line is ready. NeuralTrainer is saying hello.");
    if (liveOpeningRequestTimeoutRef.current !== null) {
      window.clearTimeout(liveOpeningRequestTimeoutRef.current);
    }
    liveOpeningRequestTimeoutRef.current = window.setTimeout(() => {
      liveOpeningRequestTimeoutRef.current = null;
      if (!activeAcceptedCall || liveOpeningCompletedCallIdRef.current === activeAcceptedCall.call_id) {
        return;
      }
      completeLiveOpening(activeAcceptedCall.call_id, {
        message: "The line is open. Speak naturally while NeuralTrainer catches up.",
      });
      setCallLoopState("listening");
      setLiveConversationPhase("ready_for_user");
    }, 7000);
    void sendLiveChannelJson(liveDataChannelRef.current, {
      type: "live_opening_request",
      openerId: activeAcceptedCall.call_id,
      text: getLiveOpeningText(activeAcceptedCall),
    }).catch(() => {
      if (liveOpeningRequestedCallIdRef.current === activeAcceptedCall.call_id) {
        liveOpeningRequestedCallIdRef.current = null;
      }
    });
  }, [activeAcceptedCall?.call_id, liveDataChannelOpen, livePathReady, shouldAutoOpenLiveCall]);

  useEffect(() => {
    setLiveReplyAudioSrc(null);
    lastPlayedReplyTurnIdRef.current = null;
    setCallTurns([]);
  }, [activeAcceptedCall?.call_id]);

  useEffect(() => {
    void refreshCallTurns(selectedCallId);
  }, [selectedCallId]);

  useEffect(() => {
    if (!selectedCall || !["accepted", "ended"].includes(selectedCall.status)) return;
    const timer = window.setInterval(() => {
      void refreshCallTurns(selectedCall.call_id);
      void refreshCallSessions();
    }, 1500);
    return () => window.clearInterval(timer);
  }, [selectedCall?.call_id, selectedCall?.status]);

  useEffect(() => {
    localStorage.setItem(CALL_REVIEW_QUEUE_KEY, JSON.stringify(pendingCallReviews));
  }, [pendingCallReviews]);

  useEffect(() => {
    if (!sessionToken || pendingCallReviews.length === 0) return;
    void syncPendingCallReviews();
    const timer = window.setInterval(() => {
      void syncPendingCallReviews();
    }, 10000);
    return () => window.clearInterval(timer);
  }, [sessionToken, pendingCallReviews]);

  useEffect(() => {
    return () => {
      stopRemoteTurnRecording();
      teardownLivePeerConnection();
    };
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [view, settingsSection]);

  useEffect(() => {
    const thread = threadViewportRef.current;
    if (!thread) return;
    thread.scrollTop = thread.scrollHeight;
  }, [threadItems.length, selectedCallTurns.length, recordingTurn]);

  useEffect(() => {
    if (!activeAcceptedCall) {
      setLiveReplyAudioSrc(null);
      lastPlayedReplyTurnIdRef.current = null;
      return;
    }
    if (!latestReplyTurn?.reply_audio_base64 || latestReplyTurn.turn_id === lastPlayedReplyTurnIdRef.current) {
      return;
    }
    lastPlayedReplyTurnIdRef.current = latestReplyTurn.turn_id;
    setCallLoopState("speaking");
    setLiveReplyAudioSrc(replyAudioUrl(latestReplyTurn.reply_audio_base64));
  }, [activeAcceptedCall?.call_id, latestReplyTurn?.turn_id, latestReplyTurn?.reply_audio_base64]);

  useEffect(() => {
    if (!liveReplyAudioSrc || !liveReplyAudioRef.current) return;
    liveReplyAudioRef.current.currentTime = 0;
    void ensureLiveReplyAudioBoost()
      .then(() => liveReplyAudioRef.current?.play())
      .catch(() => {
        if (activeAcceptedCall && liveOpeningStartedCallIdRef.current === activeAcceptedCall.call_id) {
          failOpenIntoListening("NeuralTrainer joined the line. Speak naturally while the opener catches up.");
        }
      });
  }, [liveReplyAudioSrc]);

  useEffect(() => {
    if (!liveRemoteAudioRef.current || !liveRemoteStreamRef.current) {
      return;
    }
    liveRemoteAudioRef.current.srcObject = liveRemoteStreamRef.current;
    void ensureLiveRemoteAudioBoost().then(() => {
      void liveRemoteAudioRef.current?.play().catch(() => undefined);
    });
  }, [activeAcceptedCall?.call_id]);

  const chatsView = (
    <section className="app-panel app-panel--chat">
      <aside className="conversation-rail">
        <button className="conversation-card conversation-card--active" onClick={() => setView("chats")}>
          <div className="avatar-badge avatar-badge--large">{(displayName || "N").slice(0, 1).toUpperCase()}</div>
          <div className="conversation-copy">
            <div className="conversation-copy-row">
              <strong>NeuralTrainer</strong>
              <span>{lastMessage ? formatTime(lastMessage.created_at) : "Now"}</span>
            </div>
            <p>{lastMessage ? previewText(lastMessage.text) : connectionSummary}</p>
          </div>
        </button>

        <div className="status-strip">
          {compactStats.map((item) => (
            <article key={item.label} className="status-pill-card">
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </article>
          ))}
        </div>
      </aside>

      <section className="chat-surface">
        <div className="message-thread" ref={threadViewportRef}>
          <div className="thread-day-chip">Today</div>
          {threadItems.length === 0 ? (
            <div className="empty-state compact">
              <h3>No messages yet</h3>
              <p>Your desktop replies will land here like a real messenger thread.</p>
            </div>
          ) : (
            threadItems.map((entry) => {
              if (entry.kind === "message") {
                return (
                  <article
                    key={entry.id}
                    className={`bubble ${entry.message.source === "desktop" ? "bubble--desktop" : "bubble--user"}`}
                  >
                    <p>{entry.message.text}</p>
                    <span>{formatTime(entry.message.created_at)}</span>
                  </article>
                );
              }

              const call = entry.call;
              const review = effectiveCallReviews.find((item) => item.call_id === call.call_id) ?? null;
              return (
                <article key={entry.id} className={`chat-call-card chat-call-card--${call.status}`}>
                  <div className="chat-call-card-header">
                    <div>
                      <strong>{call.desktop_name}</strong>
                      <span>{CALL_STATUS_LABELS[call.status]} · {formatTime(call.requested_at)}</span>
                    </div>
                  </div>
                  {call.status === "pending" ? (
                    <p>{call.note || "NeuralTrainer is reaching out through North Star."}</p>
                  ) : null}

                  {call.status === "pending" ? (
                    <div className="call-actions">
                      <button onClick={() => void respondToCall(call.call_id, "accept")}>Accept</button>
                      <button className="secondary" onClick={() => void respondToCall(call.call_id, "decline")}>Decline</button>
                      <button className="secondary" onClick={() => void respondToCall(call.call_id, "missed")}>Missed</button>
                    </div>
                  ) : null}

                  {review && (call.status === "declined" || call.status === "missed") ? (
                    <div className="chat-call-footer">
                      <span>{call.status === "declined" ? "Declined" : "Call missed"}</span>
                    </div>
                  ) : null}
                </article>
              );
            })
          )}
        </div>

        <div className="composer composer--messenger">
          <textarea
            value={messageDraft}
            onChange={(event) => setMessageDraft(event.target.value)}
            placeholder="Type a message"
            rows={1}
          />
          <button className="send-button" onClick={sendMessage} disabled={!messageDraft.trim()}>
            Send
          </button>
        </div>
      </section>
    </section>
  );

  let settingsContent: ReactNode;
  if (settingsSection === "menu") {
    settingsContent = (
      <section className="settings-menu">
        <article className="settings-summary-card">
          <div>
            <p className="eyebrow">Companion</p>
            <h3>{displayName || "North Star"}</h3>
            <p>{connectionSummary}</p>
          </div>
          <div className="settings-summary-grid">
            {compactStats.map((item) => (
              <div key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
        </article>
        <div className="settings-menu-list">
          {settingsMenuItems.map((item) => (
            <button key={item.section} className="settings-nav-item" onClick={() => openSettings(item.section)}>
              <div>
                <strong>{item.label}</strong>
                <span>{item.helper}</span>
              </div>
              <small>Open</small>
            </button>
          ))}
        </div>
      </section>
    );
  } else if (settingsSection === "account") {
    settingsContent = (
      <section className="settings-page">
        <label className="field">
          <span>API base</span>
          <input value={apiBase} onChange={(event) => setApiBase(event.target.value)} />
        </label>
        <label className="field">
          <span>Display name</span>
          <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
        </label>
        <label className="field">
          <span>User handle</span>
          <input value={userHandle} onChange={(event) => setUserHandle(event.target.value)} />
        </label>
        <div className="composer-actions">
          <button onClick={createSession}>Create session</button>
          <button className="secondary" onClick={refreshAll}>Refresh</button>
        </div>
      </section>
    );
  } else if (settingsSection === "desktop") {
    settingsContent = (
      <section className="settings-page">
        <label className="field">
          <span>Desktop name</span>
          <input value={desktopName} onChange={(event) => setDesktopName(event.target.value)} />
        </label>
        <div className="settings-facts settings-facts--single">
          <div>
            <dt>Status</dt>
            <dd>{mostRecentDesktop ? formatStatus(mostRecentDesktop.status) : "Not linked"}</dd>
          </div>
          <div>
            <dt>Last heartbeat</dt>
            <dd>{formatDateTime(mostRecentDesktop?.last_heartbeat_at ?? null)}</dd>
          </div>
        </div>
        <div className="composer-actions">
          <button onClick={bindDesktop}>Link desktop</button>
          <button className="secondary" onClick={sendHeartbeat}>Heartbeat</button>
        </div>
      </section>
    );
  } else if (settingsSection === "audio") {
    settingsContent = (
      <section className="settings-page">
        <p className="helper-copy">Adjust the phone-side playback and turn timing. Opening speech and reply speech can be tuned separately, and the live turn end delay controls how long North Star waits after you stop speaking.</p>
        <label className="field">
          <span>Opening speech gain</span>
          <input
            type="number"
            min={0}
            max={4}
            step={0.05}
            value={audioSettings.openingGain}
            onChange={(event) => setAudioSettings((current) => ({
              ...current,
              openingGain: Number(event.target.value) || 0,
            }))}
          />
        </label>
        <label className="field">
          <span>Reply speech gain</span>
          <input
            type="number"
            min={0}
            max={4}
            step={0.05}
            value={audioSettings.replyGain}
            onChange={(event) => setAudioSettings((current) => ({
              ...current,
              replyGain: Number(event.target.value) || 0,
            }))}
          />
        </label>
        <label className="field">
          <span>Turn end delay</span>
          <input
            type="number"
            min={0.25}
            max={6}
            step={0.25}
            value={audioSettings.turnEndDelaySeconds}
            onChange={(event) => setAudioSettings((current) => ({
              ...current,
              turnEndDelaySeconds: Number(event.target.value) || 0,
            }))}
          />
        </label>
        <div className="settings-facts settings-facts--single">
          <div>
            <dt>Opening gain</dt>
            <dd>{audioSettings.openingGain.toFixed(2)}x</dd>
          </div>
          <div>
            <dt>Reply gain</dt>
            <dd>{audioSettings.replyGain.toFixed(2)}x</dd>
          </div>
          <div>
            <dt>Turn end delay</dt>
            <dd>{audioSettings.turnEndDelaySeconds.toFixed(2)}s</dd>
          </div>
        </div>
      </section>
    );
  } else if (settingsSection === "notifications") {
    settingsContent = (
      <section className="settings-page">
        <p className="helper-copy">{notificationsHeadline}</p>
        <div className="settings-facts settings-facts--single">
          <div>
            <dt>Permission</dt>
            <dd>{formatPermission(pushCapability.permission)}</dd>
          </div>
          <div>
            <dt>Subscriptions</dt>
            <dd>{pushStatus?.registered_subscriptions ?? 0}</dd>
          </div>
        </div>
        <div className="composer-actions">
          <button onClick={requestNotificationPermission}>Allow notifications</button>
          <button className="secondary" onClick={registerPushSubscription} disabled={!sessionToken || !pushCapability.serviceWorkerReady}>
            Turn on push
          </button>
        </div>
      </section>
    );
  } else if (settingsSection === "location") {
    settingsContent = (
      <section className="settings-page">
        <p className="helper-copy">{locationHeadline}</p>
        <div className="settings-facts settings-facts--single">
          <div>
            <dt>Permission</dt>
            <dd>{formatPermission(locationState.permission_state)}</dd>
          </div>
          <div>
            <dt>Queue</dt>
            <dd>{locationQueue.length} waiting</dd>
          </div>
          <div>
            <dt>Accuracy</dt>
            <dd>{locationState.last_known_accuracy_meters === null ? "n/a" : `${Math.round(locationState.last_known_accuracy_meters)}m`}</dd>
          </div>
        </div>
        <div className="composer-actions">
          <button onClick={checkLocationCapability}>Check</button>
          <button className="secondary" onClick={uploadLocationNow}>Send now</button>
          <button className="secondary" onClick={watchingLocation ? stopWatchingLocation : startWatchingLocation}>
            {watchingLocation ? "Stop live" : "Start live"}
          </button>
          <button className="secondary" onClick={flushLocationQueue} disabled={locationQueue.length === 0}>
            Upload queue
          </button>
        </div>
      </section>
    );
  } else {
    settingsContent = (
      <section className="settings-page settings-page--diagnostics">
        <label className="toggle-field">
          <div>
            <strong>Debug call</strong>
            <p className="helper-copy">Show the live call diagnostics overlay during active calls.</p>
          </div>
          <input
            type="checkbox"
            checked={debugSettings.debugCall}
            onChange={(event) => setDebugSettings((current) => ({
              ...current,
              debugCall: event.target.checked,
            }))}
          />
        </label>
        <div className="diagnostic-block">
          <h4>Recent activity</h4>
          <ul className="mini-list">
            {events.length === 0 ? <li>Waiting for websocket events.</li> : events.slice(0, 5).map((event, index) => (
              <li key={`${event.kind}-${index}`}>
                {formatStatus(event.kind)} / {formatDateTime(event.at)}
              </li>
            ))}
          </ul>
        </div>
        <div className="diagnostic-block">
          <h4>Recent location</h4>
          <ul className="mini-list">
            {locationEvents.length === 0 ? <li>No uploaded location events yet.</li> : locationEvents.slice(0, 5).map((entry) => (
              <li key={entry.event_id}>
                {entry.latitude.toFixed(5)}, {entry.longitude.toFixed(5)} / {entry.source}
              </li>
            ))}
          </ul>
        </div>
        <div className="diagnostic-block">
          <h4>Keys</h4>
          <p className="helper-copy">Session: {sessionToken ? previewText(sessionToken, 18) : "Not created yet"}</p>
          <p className="helper-copy">Device: {deviceToken ? previewText(deviceToken, 18) : "Not bound yet"}</p>
        </div>
      </section>
    );
  }

  const settingsView = (
    <section className={`app-panel app-panel--settings ${settingsSection === "menu" ? "app-panel--settings-scroll" : ""}`}>
      {settingsContent}
    </section>
  );

  const liveCallScreen = callOverlayCall ? (
    <section className={`call-overlay call-overlay--${callOverlayCall.status}`}>
      <audio ref={liveReplyAudioRef} autoPlay playsInline src={liveReplyAudioSrc ?? undefined} className="call-audio" onEnded={handleLiveReplyEnded} />
      <audio ref={liveRemoteAudioRef} autoPlay playsInline className="call-audio" />
      <div className="call-overlay-backdrop" />
      <div className="call-overlay-panel">
        <div className="call-overlay-copy">
          <div className="call-screen-avatar">{callOverlayCall.desktop_name.slice(0, 1).toUpperCase()}</div>
          <p className="eyebrow">North Star</p>
          <h2>{callOverlayCall.desktop_name}</h2>
          <p>
            {callOverlayCall.status === "pending"
              ? "Incoming call"
              : callOverlayCall.status === "accepted"
                ? liveCallStatus.headline
                : callOverlayCall.status === "ended"
                  ? "How did that call feel?"
                : CALL_STATUS_LABELS[callOverlayCall.status]}
          </p>
          <p className="call-overlay-note">
            {callOverlayCall.status === "accepted"
              ? liveCallStatus.detail
              : callOverlayCall.status === "ended"
                ? "Give North Star a quick sense of how that call landed, then you will return to chat."
                  : callOverlayCall.note || "NeuralTrainer is calling you now."}
          </p>
        </div>

        {callOverlayCall.status === "pending" ? (
          <div className="call-overlay-actions call-overlay-actions--incoming">
            <button className="call-icon-button call-icon-button--decline" onClick={() => void respondToCall(callOverlayCall.call_id, "decline")} aria-label="Decline call">
              <PhoneIcon kind="decline" />
            </button>
            <button className="call-icon-button call-icon-button--accept" onClick={() => void respondToCall(callOverlayCall.call_id, "accept")} aria-label="Accept call">
              <PhoneIcon kind="accept" />
            </button>
          </div>
        ) : null}

        {callOverlayCall.status === "accepted" ? (
          <>
            <div className="call-live-feed">
              <article className="call-live-chip call-live-chip--trainer">
                <strong>North Star</strong>
                <p>{liveCallStatus.headline}</p>
              </article>
              {debugSettings.debugCall ? (
                <div className="call-live-diagnostics-grid">
                  <article className="call-live-chip call-live-chip--trainer">
                    <strong>Call path</strong>
                    <p>{livePathLabel}</p>
                  </article>
                  <article className="call-live-chip call-live-chip--trainer">
                    <strong>Phase</strong>
                    <p>{formatStatus(liveCallDiagnostics.phase)}</p>
                  </article>
                  <article className="call-live-chip call-live-chip--trainer">
                    <strong>Peer</strong>
                    <p>{formatStatus(liveCallDiagnostics.connectionState)}</p>
                  </article>
                  <article className="call-live-chip call-live-chip--trainer">
                    <strong>ICE</strong>
                    <p>{formatStatus(liveCallDiagnostics.iceConnectionState)}</p>
                  </article>
                  <article className="call-live-chip call-live-chip--trainer">
                    <strong>Signal</strong>
                    <p>{formatStatus(liveCallDiagnostics.lastSignal)}</p>
                  </article>
                  <article className="call-live-chip call-live-chip--trainer">
                    <strong>Channel</strong>
                    <p>{formatStatus(liveCallDiagnostics.dataChannelState)}</p>
                  </article>
                  <article className="call-live-chip call-live-chip--trainer">
                    <strong>Remote audio</strong>
                    <p>{formatStatus(liveCallDiagnostics.remoteTrackState)}</p>
                  </article>
                  <article className="call-live-chip call-live-chip--trainer">
                    <strong>ICE candidates</strong>
                    <p>{liveCallDiagnostics.localIceCandidates} out / {liveCallDiagnostics.remoteIceCandidates} in</p>
                  </article>
                  <article className="call-live-chip call-live-chip--trainer">
                    <strong>ICE policy</strong>
                    <p>{formatStatus(liveCallDiagnostics.icePolicy)}</p>
                  </article>
                  <article className="call-live-chip call-live-chip--trainer">
                    <strong>ICE servers</strong>
                    <p>{liveCallDiagnostics.iceServerKinds}</p>
                  </article>
                  <article className="call-live-chip call-live-chip--trainer">
                    <strong>Candidate kinds</strong>
                    <p>{liveCallDiagnostics.localCandidateKinds} / {liveCallDiagnostics.remoteCandidateKinds}</p>
                  </article>
                  <article className="call-live-chip call-live-chip--trainer">
                    <strong>Phone mic</strong>
                    <p>{liveInputMeter.speaking ? "Speech detected" : "Waiting for voice"}</p>
                  </article>
                  <article className="call-live-chip call-live-chip--trainer">
                    <strong>Mic track</strong>
                    <p>{liveInputMeter.trackEnabled ? "enabled" : "disabled"} / {liveInputMeter.trackMuted ? "muted" : "live"} / {liveInputMeter.trackReadyState}</p>
                  </article>
                  <article className="call-live-chip call-live-chip--trainer">
                    <strong>Mic level</strong>
                    <p>rms {liveInputMeter.rms.toFixed(4)} / peak {liveInputMeter.peak.toFixed(4)}</p>
                  </article>
                  <article className="call-live-chip call-live-chip--trainer">
                    <strong>Live turns sent</strong>
                    <p>{liveTurnTransportStats.liveTurnsSent} turns / {liveTurnTransportStats.liveTurnChunksSent} chunks</p>
                  </article>
                  <article className="call-live-chip call-live-chip--trainer">
                    <strong>Last turn id</strong>
                    <p>{liveTurnTransportStats.lastLiveTurnRequestId}</p>
                  </article>
                  <article className="call-live-chip call-live-chip--trainer">
                    <strong>Conversation ready</strong>
                    <p>{liveConversationReadyFlag ? "yes" : "no"}</p>
                  </article>
                  <article className="call-live-chip call-live-chip--trainer">
                    <strong>Opening audio</strong>
                    <p>{openingAudioStatus}</p>
                  </article>
                </div>
              ) : null}
              {debugSettings.debugCall && liveCallDiagnostics.issue ? (
                <div className="empty-state compact">
                  <h3>Live call issue</h3>
                  <p>{liveCallDiagnostics.issue}</p>
                </div>
              ) : null}
              <div className="empty-state compact">
                <h3>{liveConversationReadyFlag ? "Call is live" : "Connecting call"}</h3>
                <p>{liveCallStatus.detail}</p>
              </div>
            </div>

            <div className="call-overlay-actions">
              <button className={`call-icon-button ${callLoopMuted ? "call-icon-button--muted" : "call-icon-button--speak"}`} onClick={toggleCallLoopMute} aria-label={callLoopMuted ? "Unmute call microphone" : "Mute call microphone"}>
                <PhoneIcon kind="mic" />
              </button>
              <button className="call-icon-button call-icon-button--hangup" onClick={() => void respondToCall(callOverlayCall.call_id, "end")} aria-label="End call">
                <PhoneIcon kind="hangup" />
              </button>
            </div>
          </>
        ) : null}
        {callOverlayCall.status === "ended" ? (
          <div className="call-live-feed call-live-feed--review">
            <div className="empty-state compact">
              <h3>Quick check-in</h3>
              <p>How did that finished call feel?</p>
            </div>
            <div className="review-choices review-choices--overlay">
              <button onClick={() => submitCallReview(callOverlayCall.call_id, "helpful")}>Helpful</button>
              <button onClick={() => submitCallReview(callOverlayCall.call_id, "welcome")}>Welcome</button>
              <button onClick={() => submitCallReview(callOverlayCall.call_id, "mistimed")}>Mistimed</button>
              <button onClick={() => submitCallReview(callOverlayCall.call_id, "intrusive")}>Intrusive</button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  ) : null;

  return (
    <main className="northstar-app">
      <div className="app-frame">
        <header className="topbar">
          <div className="topbar-title-row">
            <strong className="topbar-title">{topBarTitle}</strong>
          </div>
          <div className="topbar-main-row">
            <div className="topbar-leading">
              {view === "settings" && settingsSection !== "menu" ? (
                <button className="icon-button" onClick={() => setSettingsSection("menu")} aria-label="Back to settings menu">
                  Back
                </button>
              ) : (
                <div className="avatar-badge topbar-avatar">{(displayName || "N").slice(0, 1).toUpperCase()}</div>
              )}
              <div className="topbar-copy">
                <span>{topBarSubtitle}</span>
              </div>
            </div>

            <div className="topbar-actions">
              {view === "chats" ? (
                <button
                  className="icon-button"
                  onClick={() => void startCallFromPhone()}
                  aria-label="Call NeuralTrainer"
                  disabled={!desktopReady || activeCallCount > 0}
                  title={!desktopReady ? "Link your desktop first" : activeCallCount > 0 ? "A call is already active" : "Call NeuralTrainer"}
                >
                  <PhoneIcon kind="accept" />
                </button>
              ) : null}
              <button className="icon-button" onClick={() => void refreshAll()}>Refresh</button>
              <button
                className="icon-button menu-button"
                onClick={() => setMenuOpen((current) => !current)}
                aria-label="Open menu"
                aria-expanded={menuOpen}
              >
                <span />
                <span />
                <span />
              </button>
            </div>
          </div>

          {menuOpen ? (
            <>
              <button className="menu-scrim" onClick={() => setMenuOpen(false)} aria-label="Close menu" />
              <div className="overflow-menu">
                <button onClick={() => goToView("chats")}>Chats</button>
                <button onClick={() => void startCallFromPhone()} disabled={!desktopReady || activeCallCount > 0}>
                  Call NeuralTrainer
                </button>
                <button onClick={() => openSettings("menu")}>Settings home</button>
                {settingsMenuItems.map((item) => (
                  <button key={item.section} onClick={() => openSettings(item.section)}>
                    {item.label}
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </header>

        <section className="app-content">
          {view === "chats" ? chatsView : null}
          {view === "settings" ? settingsView : null}
        </section>
        {liveCallScreen}
      </div>
    </main>
  );
}

export default App;
