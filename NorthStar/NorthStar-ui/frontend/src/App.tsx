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
type SettingsSection = "menu" | "account" | "desktop" | "notifications" | "location" | "diagnostics";

const DEFAULT_API =
  import.meta.env.VITE_API_BASE ||
  (typeof window !== "undefined" ? window.location.origin : "http://127.0.0.1:3100");
const SESSION_STORAGE_KEY = "northstar.session";
const DEVICE_STORAGE_KEY = "northstar.deviceToken";
const LOCATION_QUEUE_KEY = "northstar.locationQueue";
const CALL_REVIEW_QUEUE_KEY = "northstar.pendingCallReviews";

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

function getLiveCallStatusCopy(
  callLoopState: "idle" | "listening" | "processing" | "speaking",
  callLoopMuted: boolean,
) {
  if (callLoopMuted) {
    return {
      headline: "Microphone muted",
      detail: "North Star will keep the line open until you unmute.",
    };
  }
  if (callLoopState === "processing") {
    return {
      headline: "North Star is responding",
      detail: "Hold on for a moment while NeuralTrainer prepares the reply.",
    };
  }
  if (callLoopState === "speaking") {
    return {
      headline: "North Star is speaking",
      detail: "NeuralTrainer is answering you out loud right now.",
    };
  }
  if (callLoopState === "listening") {
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
  const totalSamples = channelData.reduce((count, chunk) => count + chunk.length, 0);
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
  for (const chunk of channelData) {
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
  const [callLoopState, setCallLoopState] = useState<"idle" | "listening" | "processing" | "speaking">("idle");
  const [callLoopMuted, setCallLoopMuted] = useState(false);
  const [liveReplyAudioSrc, setLiveReplyAudioSrc] = useState<string | null>(null);
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
  const lastPlayedReplyTurnIdRef = useRef<string | null>(null);
  const handsFreeCallIdRef = useRef<string | null>(null);
  const speechDetectedRef = useRef(false);
  const silenceFrameCountRef = useRef(0);
  const speechFrameCountRef = useRef(0);
  const sendingTurnRef = useRef(false);
  const wsBase = useMemo(() => apiBase.replace(/^http/i, "ws"), [apiBase]);

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
  }, []);

  useEffect(() => {
    localStorage.setItem(LOCATION_QUEUE_KEY, JSON.stringify(locationQueue));
  }, [locationQueue]);

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
          setMessage(parsed.status === "accepted" ? "Call connected." : `Call ${CALL_STATUS_LABELS[parsed.status].toLowerCase()}.`);
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
      setSelectedCallId(callId);
      setMessage("Call connected.");
    } else if (action === "end") {
      setSelectedCallId("");
      setMessage("Call ended.");
    } else {
      setMessage(`Call marked as ${action}.`);
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
    speechFrameCountRef.current = 0;
    callTurnAudioChunksRef.current = [];
  }

  async function startRemoteTurnRecording(targetCall = selectedCall, options?: { handsFree?: boolean }) {
    if (!targetCall) {
      setMessage("Choose a call first.");
      return;
    }
    setSelectedCallId(targetCall.call_id);
    handsFreeCallIdRef.current = options?.handsFree ? targetCall.call_id : null;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
        if (!options?.handsFree || sendingTurnRef.current) {
          return;
        }

        let sum = 0;
        for (let index = 0; index < chunk.length; index += 1) {
          sum += chunk[index] * chunk[index];
        }
        const rms = Math.sqrt(sum / chunk.length);
        const speaking = rms > 0.01;

        if (speaking) {
          speechDetectedRef.current = true;
          silenceFrameCountRef.current = 0;
          speechFrameCountRef.current += 1;
        } else if (speechDetectedRef.current) {
          silenceFrameCountRef.current += 1;
          if (speechFrameCountRef.current >= 3 && silenceFrameCountRef.current >= 10) {
            void stopAndSendRemoteTurn(targetCall, { handsFree: true });
          }
        }
      };

      source.connect(processor);
      processor.connect(sink);
      sink.connect(context.destination);

      callTurnStreamRef.current = stream;
      callTurnAudioContextRef.current = context;
      callTurnProcessorRef.current = processor;
      callTurnSourceRef.current = source;
      callTurnSinkRef.current = sink;
      setRecordingTurn(true);
      setCallLoopState(options?.handsFree ? "listening" : "idle");
      setMessage(options?.handsFree ? "NeuralTrainer is listening." : "Listening now. Send the turn when you're ready.");
    } catch {
      stopRemoteTurnRecording();
      setMessage("This phone could not open the microphone for North Star.");
    }
  }

  function teardownRemoteTurnRecording() {
    callTurnProcessorRef.current?.disconnect();
    callTurnSourceRef.current?.disconnect();
    callTurnSinkRef.current?.disconnect();
    callTurnAudioContextRef.current?.close().catch(() => undefined);
    callTurnStreamRef.current?.getTracks().forEach((track) => track.stop());
    callTurnProcessorRef.current = null;
    callTurnSourceRef.current = null;
    callTurnSinkRef.current = null;
    callTurnAudioContextRef.current = null;
    callTurnStreamRef.current = null;
  }

  function stopRemoteTurnRecording() {
    setRecordingTurn(false);
    resetHandsFreeDetection();
    teardownRemoteTurnRecording();
  }

  async function stopAndSendRemoteTurn(targetCall = selectedCall, options?: { handsFree?: boolean }) {
    if (!targetCall) {
      setMessage("Choose a call first.");
      return;
    }
    const context = callTurnAudioContextRef.current;
    if (!context || callTurnAudioChunksRef.current.length === 0 || (options?.handsFree && !speechDetectedRef.current)) {
      stopRemoteTurnRecording();
      if (options?.handsFree) {
        setCallLoopState("listening");
        void startRemoteTurnRecording(targetCall, { handsFree: true });
      } else {
        setMessage("No voice was captured yet.");
      }
      return;
    }

    sendingTurnRef.current = true;
    const audioBase64 = audioBufferToWavBase64(callTurnAudioChunksRef.current, context.sampleRate);
    stopRemoteTurnRecording();
    setCallLoopState("processing");

    try {
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
          void startRemoteTurnRecording(targetCall, { handsFree: true });
        }
        return;
      }
      setMessage("Turn sent. Waiting for NeuralTrainer's reply.");
      await refreshCallTurns(targetCall.call_id);
    } finally {
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
        ...callSessions.map((call) => ({
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
  const callOverlayCall = activeAcceptedCall ?? incomingCall;
  const latestReplyTurn =
    [...selectedCallTurns].reverse().find((turn) => Boolean(turn.reply_audio_base64)) ??
    null;
  const meaningfulLiveTurns = selectedCallTurns.filter((turn) => Boolean(turn.transcript_text || turn.reply_text));
  const liveCallStatus = getLiveCallStatusCopy(callLoopState, callLoopMuted);
  const lastMessage = orderedMessages[0] ?? null;
  const activeCallCount = callSessions.filter((call) => call.status === "accepted" || call.status === "pending").length;
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
    { section: "notifications", label: "Notifications", helper: "Push wake-ups" },
    { section: "location", label: "Location", helper: "Shared context" },
    { section: "diagnostics", label: "Diagnostics", helper: "Hidden details" },
  ];
  const currentSettingsMeta = settingsMenuItems.find((item) => item.section === settingsSection) ?? null;
  const topBarTitle =
    view === "chats"
      ? "NeuralTrainer"
      : settingsSection === "menu"
        ? "Settings"
        : currentSettingsMeta?.label ?? "Settings";
  const topBarSubtitle =
    view === "chats"
      ? (activeCallCount > 0 ? `${activeCallCount} call active` : (pushReady ? "Secure companion chat" : "Chat ready, push still syncing"))
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
    if (callLoopMuted) {
      setCallLoopMuted(false);
      if (activeAcceptedCall && !recordingTurn) {
        void startRemoteTurnRecording(activeAcceptedCall, { handsFree: true });
      }
      return;
    }
    setCallLoopMuted(true);
    setCallLoopState("idle");
    stopRemoteTurnRecording();
  }

  function handleLiveReplyEnded() {
    setLiveReplyAudioSrc(null);
    if (!activeAcceptedCall || callLoopMuted) {
      setCallLoopState("idle");
      return;
    }
    setCallLoopState("listening");
    if (!recordingTurn) {
      void startRemoteTurnRecording(activeAcceptedCall, { handsFree: true });
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
    if (!activeAcceptedCall) {
      handsFreeCallIdRef.current = null;
      setCallLoopState("idle");
      setCallLoopMuted(false);
      stopRemoteTurnRecording();
      return;
    }
    if (callLoopMuted || recordingTurn || handsFreeCallIdRef.current === activeAcceptedCall.call_id || callLoopState === "processing" || callLoopState === "speaking") {
      return;
    }
    void startRemoteTurnRecording(activeAcceptedCall, { handsFree: true });
  }, [activeAcceptedCall?.call_id, callLoopMuted, recordingTurn, callLoopState]);

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
    void liveReplyAudioRef.current.play().catch(() => undefined);
  }, [liveReplyAudioSrc]);

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
              const callTurnsForEntry = selectedCallId === call.call_id ? selectedCallTurns : [];
              const canOpenCallCard =
                call.status === "pending" ||
                call.status === "accepted" ||
                ((call.status === "ended" || call.status === "missed") && !review);
              return (
                <article key={entry.id} className={`chat-call-card chat-call-card--${call.status}`}>
                  <div className="chat-call-card-header">
                    <div>
                      <strong>{call.desktop_name}</strong>
                      <span>{CALL_STATUS_LABELS[call.status]} · {formatTime(call.requested_at)}</span>
                    </div>
                    {canOpenCallCard ? (
                      <button className="ghost-button" onClick={() => setSelectedCallId(call.call_id)}>
                        Open
                      </button>
                    ) : null}
                  </div>
                  {call.status === "pending" || call.status === "accepted" ? (
                    <p>{call.note || "NeuralTrainer is reaching out through North Star."}</p>
                  ) : null}

                  {call.status === "pending" ? (
                    <div className="call-actions">
                      <button onClick={() => void respondToCall(call.call_id, "accept")}>Accept</button>
                      <button className="secondary" onClick={() => void respondToCall(call.call_id, "decline")}>Decline</button>
                      <button className="secondary" onClick={() => void respondToCall(call.call_id, "missed")}>Missed</button>
                    </div>
                  ) : null}

                  {call.status === "accepted" && selectedCallId === call.call_id ? (
                    <div className="inline-call-live">
                      <p className="helper-copy">
                        Stay in chat while talking. Record a turn and North Star will bring the reply back here.
                      </p>
                      <div className="call-actions">
                        {recordingTurn ? (
                          <button onClick={() => void stopAndSendRemoteTurn(call)}>Send spoken turn</button>
                        ) : (
                          <button onClick={() => void startRemoteTurnRecording(call)}>Record spoken turn</button>
                        )}
                        <button className="secondary" onClick={() => void respondToCall(call.call_id, "end")}>End call</button>
                      </div>
                      {callTurnsForEntry.length > 0 ? (
                        <div className="inline-turn-stack">
                          {callTurnsForEntry.slice(-2).map((turn) => {
                            const audioSrc = replyAudioUrl(turn.reply_audio_base64);
                            return (
                              <div key={turn.turn_id} className="inline-turn-card">
                                <strong>{turn.source === "mobile" ? "You" : "NeuralTrainer"}</strong>
                                <p>{turn.reply_text || turn.transcript_text || "Waiting for the next part of the call."}</p>
                                {audioSrc ? <audio controls src={audioSrc} /> : null}
                              </div>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {(call.status === "ended" || call.status === "declined" || call.status === "missed") ? (
                    <div className="chat-call-footer">
                      <span>
                        {call.status === "declined"
                          ? "Declined"
                          : call.status === "missed"
                            ? "Call missed"
                          : review
                            ? "Call ended"
                            : "How did that call feel?"}
                      </span>
                      {selectedCallId === call.call_id && !review && call.status !== "declined" ? (
                        <div className="review-choices review-choices--inline">
                          <button onClick={() => submitCallReview(call.call_id, "helpful")}>Helpful</button>
                          <button onClick={() => submitCallReview(call.call_id, "welcome")}>Welcome</button>
                          <button onClick={() => submitCallReview(call.call_id, "mistimed")}>Mistimed</button>
                          <button onClick={() => submitCallReview(call.call_id, "intrusive")}>Intrusive</button>
                        </div>
                      ) : null}
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
                : CALL_STATUS_LABELS[callOverlayCall.status]}
          </p>
          <p className="call-overlay-note">
            {callOverlayCall.status === "accepted" ? liveCallStatus.detail : callOverlayCall.note || "NeuralTrainer is calling you now."}
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
              {meaningfulLiveTurns.length > 0 ? (
                meaningfulLiveTurns.slice(-4).map((turn) => (
                  <article key={turn.turn_id} className={`call-live-chip call-live-chip--${turn.source === "mobile" ? "you" : "trainer"}`}>
                    <strong>{turn.source === "mobile" ? "You said" : "North Star"}</strong>
                    <p>{turn.source === "mobile" ? turn.transcript_text : turn.reply_text}</p>
                  </article>
                ))
              ) : (
                <div className="empty-state compact">
                  <h3>Call is live</h3>
                  <p>Speak naturally. NeuralTrainer will answer here and out loud.</p>
                </div>
              )}
              <article className="call-live-chip call-live-chip--trainer">
                <strong>North Star</strong>
                <p>{liveCallStatus.headline}</p>
              </article>
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
      </div>
    </section>
  ) : null;

  return (
    <main className="northstar-app">
      <div className="app-frame">
        <header className="topbar">
          <div className="topbar-leading">
            {view === "settings" && settingsSection !== "menu" ? (
              <button className="icon-button" onClick={() => setSettingsSection("menu")} aria-label="Back to settings menu">
                Back
              </button>
            ) : (
              <div className="avatar-badge topbar-avatar">{(displayName || "N").slice(0, 1).toUpperCase()}</div>
            )}
            <div className="topbar-copy">
              <strong>{topBarTitle}</strong>
              <span>{topBarSubtitle}</span>
            </div>
          </div>

          <div className="topbar-actions">
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

          {menuOpen ? (
            <>
              <button className="menu-scrim" onClick={() => setMenuOpen(false)} aria-label="Close menu" />
              <div className="overflow-menu">
                <button onClick={() => goToView("chats")}>Chats</button>
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
