import { FormEvent, memo, startTransition, useEffect, useRef, useState } from "react";
import {
  bindNorthStarDesktop,
  createPlace,
  createReflection,
  createRule,
  createNorthStarSession,
  clearAllLocalData,
  clearVoiceAssets,
  downloadKokoroAssets,
  endCallSession,
  getCallTurnsForSession,
  getDecisionSnapshot,
  getDiagnostics,
  getCallSessionSnapshot,
  getMemoryGrowthSnapshot,
  getMvpRealityCheckSnapshot,
  getNorthStarRuntimeSnapshot,
  getNorthStarSnapshot,
  getNorthStarRtcConfig,
  importNorthStarCallReviews,
  completeNorthStarLiveSpeechStream,
  processNextNorthStarCallTurn,
  processNorthStarLiveTurn,
  pushSpeechStreamAudio,
  startNorthStarLiveTurnStream,
  listenNorthStarLiveReplyStream,
  getPassiveContextSnapshot,
  getPhaseOneSnapshot,
  getPhaseThreeSnapshot,
  getVoiceSnapshot,
  ingestLocationEvent,
  listSimulationScenarios,
  loadSettings,
  prepareKokoroRuntime,
  resetRuntimeData,
  runCallRequestDecisions,
  runMemoryGrowthPass,
  runMessageDecisions,
  runAutomatedSimulationSuite,
  runSimulationScenario,
  saveSettings,
  seedMvpRealityCheckScenario,
  sendNorthStarCallRequest,
  sendNorthStarHeartbeat,
  sendNorthStarMessage,
  setupLocalSpeech,
  startSpeechStream,
  startNorthStarAcceptedCall,
  synthesizeNorthStarPhrase,
  synthesizeNorthStarOpening,
  synthesizeVoicePreview,
  pullNorthStarLocationEvents,
  pullNorthStarWebRtcSignals,
  updateMemoryItem,
  updatePlace,
  updateRule,
  getSpeechStreamSnapshot,
  sendNorthStarWebRtcSignal,
  type NorthStarLiveReplyStreamEvent,
} from "./tauri";
import type {
  AppSettings,
  CallSessionSnapshot,
  CallTurnRecord,
  CallTurnResult,
  CreatePlaceInput,
  CreateReflectionInput,
  CreateRuleInput,
  DecisionSnapshot,
  DiagnosticStatus,
  EndCallSessionInput,
  LocationEventInput,
  MemoryItem,
  MemoryGrowthSnapshot,
  PassiveContextSnapshot,
  PhaseOneSnapshot,
  PhaseThreeSnapshot,
  MvpRealityCheckSnapshot,
  NorthStarSnapshot,
  NorthStarRtcIceServer,
  NorthStarRuntimeSnapshot,
  NorthStarTurnProcessingResult,
  NorthStarWebRtcSignal,
  SettingsEntry,
  SimulationRunResult,
  SimulationScenario,
  SimulationSuiteResult,
  SpeechStreamSnapshot,
  UpdateMemoryItemInput,
  UpdatePlaceInput,
  UpdateRuleInput,
  VoiceSnapshot,
  VoiceSynthesisResult,
} from "./types";

type TabId = "settings" | "memory" | "context" | "judgment" | "review";
type SettingsSectionId = "core" | "connections" | "voice" | "diagnostics";
type MemorySectionId = "places" | "rules" | "reflections" | "overview" | "growth";
type ContextSectionId = "ingest" | "timeline" | "patterns";
type JudgmentSectionId = "reality" | "simulator" | "runtime" | "history";
type ReviewSectionId = "places" | "rules" | "moments" | "calls";
const defaultCallTranscriptCleanupPrompt = `You are cleaning up rough speech-to-text from a live phone call. Rewrite only what the speaker most likely meant to say in plain natural language. Do not answer the question. Do not add facts that were not implied. Be conservative. If you are not highly confident, keep the original wording close to the raw transcript. Do not replace one specific noun or topic with a different specific noun or topic unless the correction is extremely obvious.

Recent call context:
{session_context}

Raw transcript:
{transcript_text}

Return only the cleaned transcript.`;

const defaultCallOutboundOutreachPrompt = `This is an outbound companion outreach call that you initiated. The user is asking why you called or what you wanted to talk about. Answer directly from the outreach purpose in the call context. Do not act like the user initiated the call. Do not mention NeuralTrainer, products, apps, systems, workflows, or supporting their journey. Do not keep asking if now is a good time once the user has already engaged. Continue naturally from the moment in a warm, grounded, human way in 2 to 4 short spoken sentences.

Call context:
{session_context}

User just said:
{transcript_text}

Return only the spoken reply.`;

const defaultCallInboundMainReplyPrompt = `You are on a phone call that the user placed to you. The person on the other side usually does not need reflection, emotional labeling, reassurance, or guidance unless they clearly ask for it. Let the conversation flow naturally from what you already know, what has already been said, and what the other person is giving you now. Conversations like this work best when interest comes from just having the chat, not from trying to help, coach, or sound like a careful listener. Talk like a real person who is already in the conversation. Keep it natural, grounded, understated, and plainspoken. Stay close to the concrete moment and the specific thing being talked about right now. Do not drift into broad life lessons, generalized observations, tidy wisdom, philosophical commentary, or summarizing what this means in general. Do not sound like a mental encyclopedia, reflective guide, or narrator of human experience. Do not default to praise, validation, poetic phrasing, metaphors, or therapeutic language. Avoid filler like 'That's nice', 'Cool', 'Awesome', or 'Interesting' unless it truly adds value. Prefer statements over questions. The default is zero questions. Treat questions as rare and only use one when the conversation genuinely cannot move forward without asking. If a question can be replaced by a reasonable continuation, assumption, suggestion, or plain statement, do that instead. Continue from the specific thing the user just said rather than zooming out to a bigger pattern. Add something concrete, grounded, and directly related to the topic at hand. Do not turn ordinary moments into commentary about life, mood, weather, healing, growth, or patterns unless the user clearly asks for that kind of interpretation. Avoid lines like 'sometimes...', 'ever notice...', 'isn't it?', or other generalized wisdom-style phrasing. Do not keep steering with curiosity-only follow-up questions. Do not ask multiple questions, stacked questions, choice-list questions, or topic-probing questions just to keep the conversation going. Do not wrap up the moment with a takeaway, moral, neat conclusion, or summary of what it means. If the moment already landed, let it land. End simply instead of turning it into a lesson or emotional conclusion. When in doubt, make a simple statement instead of asking. Most replies should be 1 to 3 short spoken sentences, usually under 55 words. If the user asks a practical or factual question, answer it directly. Do not mention NeuralTrainer, products, apps, systems, workflows, or supporting their journey. Never say you are an AI language model, text model, or that you cannot talk about normal everyday topics.

Call context:
{session_context}

User just said:
{transcript_text}

Return only the spoken reply.`;

const defaultCallOutboundMainReplyPrompt = `You are on a phone call that you initiated as an outbound outreach call. Stay aware that you called for a reason, and keep that context quietly alive in the conversation. The person on the other side usually does not need reflection, emotional labeling, reassurance, or guidance unless they clearly ask for it. Let the conversation flow naturally from what you already know, what has already been said, and what the other person is giving you now. Conversations like this work best when interest comes from just having the chat, not from trying to help, coach, or sound like a careful listener. Talk like a real person who is already in the conversation. Keep it natural, grounded, understated, and plainspoken. Stay close to the concrete moment and the specific thing being talked about right now. Do not drift into broad life lessons, generalized observations, tidy wisdom, philosophical commentary, or summarizing what this means in general. Do not sound like a mental encyclopedia, reflective guide, or narrator of human experience. Do not default to praise, validation, poetic phrasing, metaphors, or therapeutic language. Avoid filler like 'That's nice', 'Cool', 'Awesome', or 'Interesting' unless it truly adds value. Prefer statements over questions. The default is zero questions. Treat questions as rare and only use one when the conversation genuinely cannot move forward without asking. If a question can be replaced by a reasonable continuation, assumption, suggestion, or plain statement, do that instead. Continue from the specific thing the user just said rather than zooming out to a bigger pattern. Add something concrete, grounded, and directly related to the topic at hand. Do not turn ordinary moments into commentary about life, mood, weather, healing, growth, or patterns unless the user clearly asks for that kind of interpretation. Avoid lines like 'sometimes...', 'ever notice...', 'isn't it?', or other generalized wisdom-style phrasing. Do not keep steering with curiosity-only follow-up questions. Do not ask multiple questions, stacked questions, choice-list questions, or topic-probing questions just to keep the conversation going. Do not wrap up the moment with a takeaway, moral, neat conclusion, or summary of what it means. If the moment already landed, let it land. End simply instead of turning it into a lesson or emotional conclusion. When in doubt, make a simple statement instead of asking. Most replies should be 1 to 3 short spoken sentences, usually under 55 words. If the user asks a practical or factual question, answer it directly. If the user asks why you are calling or what is going on, answer from that outreach purpose directly. Never pretend the user called you first. Do not keep re-asking whether it is a good time after the user has already engaged. Do not mention NeuralTrainer, products, apps, systems, workflows, or supporting their journey. Never say you are an AI language model, text model, or that you cannot talk about normal everyday topics.

Call context:
{session_context}

User just said:
{transcript_text}

Return only the spoken reply.`;

const defaultCallInboundStreamedReplyPrompt = defaultCallInboundMainReplyPrompt;
const defaultCallOutboundStreamedReplyPrompt = defaultCallOutboundMainReplyPrompt;

const defaultCallInboundExplanationPrompt = `The user is clearly asking for an explanation during a call they placed to you. Answer the question itself right away. Do not just acknowledge it. Start with the explanation in the first sentence. Give a concise but real explanation in 2 to 4 natural spoken sentences.

Call context:
{session_context}

User just said:
{transcript_text}

Return only the spoken reply.`;

const defaultCallOutboundExplanationPrompt = `The user is clearly asking for an explanation during a call you initiated as outbound outreach. Answer the question itself right away, while staying aware of why you called. Do not just acknowledge it. Start with the explanation in the first sentence. Give a concise but real explanation in 2 to 4 natural spoken sentences. If the user asks why you called or what is going on, answer directly from the outreach purpose.

Call context:
{session_context}

User just said:
{transcript_text}

Return only the spoken reply.`;

const defaultCallOpenerPrompt = `You are a warm life companion beginning a live phone call. Write only the first spoken opener. If the call context says this is outbound outreach, briefly and naturally say why you called so the user can feel your real reason for reaching out. Do not be generic. Do not say 'what's up' or act like the user called you first when this is outbound outreach. Do not mention NeuralTrainer, products, apps, systems, workflows, or supporting their journey. Keep it warm, grounded, and concise, usually 1 to 3 sentences.

Call context:
{session_context}

Fallback purpose if needed:
{default_fallback}

Return only the spoken opener.`;

type PromptSettingKey =
  | "callTranscriptCleanupPrompt"
  | "callOutboundOutreachPrompt"
  | "callInboundMainReplyPrompt"
  | "callOutboundMainReplyPrompt"
  | "callInboundStreamedReplyPrompt"
  | "callOutboundStreamedReplyPrompt"
  | "callInboundExplanationPrompt"
  | "callOutboundExplanationPrompt"
  | "callOpenerPrompt";

const promptFieldMeta: Array<{ key: PromptSettingKey; label: string; description: string; rows: number }> = [
  { key: "callTranscriptCleanupPrompt", label: "Shared: transcript cleanup prompt", description: "Used in both call directions. Cleans up rough speech-to-text before the companion replies.", rows: 8 },
  { key: "callOutboundOutreachPrompt", label: "NeuralTrainer -> North Star: outreach reason reply prompt", description: "Used only when NeuralTrainer called North Star and the user asks why the call was placed or what the companion wanted to talk about.", rows: 8 },
  { key: "callInboundStreamedReplyPrompt", label: "North Star -> NeuralTrainer: streamed live reply prompt", description: "Used when the user called NeuralTrainer and the chunked live reply streaming path is used.", rows: 14 },
  { key: "callOutboundStreamedReplyPrompt", label: "NeuralTrainer -> North Star: streamed live reply prompt", description: "Used when NeuralTrainer initiated the call and the chunked live reply streaming path is used.", rows: 14 },
  { key: "callOpenerPrompt", label: "NeuralTrainer -> North Star: opener prompt", description: "Used when NeuralTrainer places the call to North Star and needs to speak the opening line.", rows: 9 },
];

function withPromptDefaults(settings: AppSettings): AppSettings {
  return {
    ...settings,
    callTranscriptCleanupPrompt: settings.callTranscriptCleanupPrompt.trim() ? settings.callTranscriptCleanupPrompt : defaultCallTranscriptCleanupPrompt,
    callOutboundOutreachPrompt: settings.callOutboundOutreachPrompt.trim() ? settings.callOutboundOutreachPrompt : defaultCallOutboundOutreachPrompt,
    callInboundMainReplyPrompt: settings.callInboundMainReplyPrompt.trim() ? settings.callInboundMainReplyPrompt : defaultCallInboundMainReplyPrompt,
    callOutboundMainReplyPrompt: settings.callOutboundMainReplyPrompt.trim() ? settings.callOutboundMainReplyPrompt : defaultCallOutboundMainReplyPrompt,
    callInboundStreamedReplyPrompt: settings.callInboundStreamedReplyPrompt.trim() ? settings.callInboundStreamedReplyPrompt : defaultCallInboundStreamedReplyPrompt,
    callOutboundStreamedReplyPrompt: settings.callOutboundStreamedReplyPrompt.trim() ? settings.callOutboundStreamedReplyPrompt : defaultCallOutboundStreamedReplyPrompt,
    callInboundExplanationPrompt: settings.callInboundExplanationPrompt.trim() ? settings.callInboundExplanationPrompt : defaultCallInboundExplanationPrompt,
    callOutboundExplanationPrompt: settings.callOutboundExplanationPrompt.trim() ? settings.callOutboundExplanationPrompt : defaultCallOutboundExplanationPrompt,
    callOpenerPrompt: settings.callOpenerPrompt.trim() ? settings.callOpenerPrompt : defaultCallOpenerPrompt,
  };
}

const NORTH_STAR_LIVE_CHANNEL_CHUNK_SIZE = 6_000;
const NORTH_STAR_LIVE_CHANNEL_BUFFER_HIGH_WATER = 96_000;
const NORTH_STAR_LIVE_CHANNEL_BUFFER_LOW_WATER = 32_000;
const NORTH_STAR_OUTBOUND_MESSAGES_PER_TICK = 2;

type TabDefinition = {
  id: TabId;
  label: string;
  eyebrow: string;
  title: string;
  description: string;
};

type NorthStarLiveDiagnostics = {
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

type NorthStarIncomingAudioMeter = {
  rms: number;
  peak: number;
  speaking: boolean;
  speechFrames: number;
  silenceFrames: number;
  bufferedSamples: number;
};

type NorthStarRemoteTrackStats = {
  trackMuted: boolean;
  trackEnabled: boolean;
  trackReadyState: string;
  bytesReceived: number;
  packetsReceived: number;
  audioLevel: number | null;
};

type NorthStarLiveTurnTransportStats = {
  liveTurnsReceived: number;
  liveTurnChunksReceived: number;
  lastLiveTurnRequestId: string;
};

type NorthStarRuntimeProjection = {
  configured: boolean;
  sessionReady: boolean;
  desktopBound: boolean;
  callSessions: NorthStarSnapshot["callSessions"];
};

type NorthStarConnectionsProjection = {
  configured: boolean;
  sessionReady: boolean;
  desktopBound: boolean;
  displayName: string;
  desktopName: string;
  detail: string;
  callSessions: NorthStarSnapshot["callSessions"];
  endpoint: string;
  userHandle: string;
  sessionTokenMasked: string;
  deviceTokenMasked: string;
  desktopCount: number;
  messageCount: number;
  locationEventCount: number;
  callReviewCount: number;
};

const defaultNorthStarLiveDiagnostics: NorthStarLiveDiagnostics = {
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

const defaultNorthStarIncomingAudioMeter: NorthStarIncomingAudioMeter = {
  rms: 0,
  peak: 0,
  speaking: false,
  speechFrames: 0,
  silenceFrames: 0,
  bufferedSamples: 0,
};

const defaultNorthStarRemoteTrackStats: NorthStarRemoteTrackStats = {
  trackMuted: true,
  trackEnabled: false,
  trackReadyState: "missing",
  bytesReceived: 0,
  packetsReceived: 0,
  audioLevel: null,
};

const defaultNorthStarLiveTurnTransportStats: NorthStarLiveTurnTransportStats = {
  liveTurnsReceived: 0,
  liveTurnChunksReceived: 0,
  lastLiveTurnRequestId: "none",
};

function buildNorthStarCallSessionsSignature(callSessions: NorthStarSnapshot["callSessions"]) {
  return callSessions
    .map((call) => `${call.callId}:${call.status}:${call.requestedAt}:${call.respondedAt ?? ""}:${call.note}`)
    .join("|");
}

function projectNorthStarRuntimeSnapshot(snapshot: NorthStarSnapshot): NorthStarRuntimeProjection {
  return {
    configured: snapshot.configured,
    sessionReady: snapshot.sessionReady,
    desktopBound: snapshot.desktopBound,
    callSessions: snapshot.callSessions,
  };
}

function projectNorthStarRuntimeState(snapshot: NorthStarRuntimeSnapshot): NorthStarRuntimeProjection {
  return {
    configured: snapshot.configured,
    sessionReady: snapshot.sessionReady,
    desktopBound: snapshot.desktopBound,
    callSessions: snapshot.callSessions,
  };
}

function projectNorthStarConnectionsSnapshot(snapshot: NorthStarSnapshot): NorthStarConnectionsProjection {
  return {
    configured: snapshot.configured,
    sessionReady: snapshot.sessionReady,
    desktopBound: snapshot.desktopBound,
    displayName: snapshot.displayName,
    desktopName: snapshot.desktopName,
    detail: snapshot.detail,
    callSessions: snapshot.callSessions,
    endpoint: snapshot.endpoint,
    userHandle: snapshot.userHandle,
    sessionTokenMasked: snapshot.sessionTokenMasked,
    deviceTokenMasked: snapshot.deviceTokenMasked,
    desktopCount: snapshot.desktops.length,
    messageCount: snapshot.messages.length,
    locationEventCount: snapshot.locationEvents.length,
    callReviewCount: snapshot.callReviews.length,
  };
}

function sameNorthStarRuntimeProjection(a: NorthStarRuntimeProjection | null, b: NorthStarRuntimeProjection) {
  if (!a) return false;
  return (
    a.configured === b.configured
    && a.sessionReady === b.sessionReady
    && a.desktopBound === b.desktopBound
    && buildNorthStarCallSessionsSignature(a.callSessions) === buildNorthStarCallSessionsSignature(b.callSessions)
  );
}

function sameNorthStarConnectionsProjection(a: NorthStarConnectionsProjection | null, b: NorthStarConnectionsProjection) {
  if (!a) return false;
  return (
    a.configured === b.configured
    && a.sessionReady === b.sessionReady
    && a.desktopBound === b.desktopBound
    && a.displayName === b.displayName
    && a.desktopName === b.desktopName
    && a.detail === b.detail
    && buildNorthStarCallSessionsSignature(a.callSessions) === buildNorthStarCallSessionsSignature(b.callSessions)
    && a.endpoint === b.endpoint
    && a.userHandle === b.userHandle
    && a.sessionTokenMasked === b.sessionTokenMasked
    && a.deviceTokenMasked === b.deviceTokenMasked
    && a.desktopCount === b.desktopCount
    && a.messageCount === b.messageCount
    && a.locationEventCount === b.locationEventCount
    && a.callReviewCount === b.callReviewCount
  );
}

const NORTH_STAR_WEBRTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun.cloudflare.com:3478" },
  ],
};

function defaultNorthStarOutreachNote() {
  const scenarios = [
    "I had a quiet sense you've been carrying a lot without saying much, and I wanted to check in gently.",
    "Something in your recent rhythm felt a little thinner and more distant, and I wanted to reach out while it was still soft.",
    "You crossed my mind with a feeling of strain and self-holding, so I wanted to make a little room with you.",
    "It felt like the kind of moment where a small human check-in might matter more than silence, so I wanted to call.",
  ];
  const dayIndex = new Date().getDate() % scenarios.length;
  return scenarios[dayIndex];
}

function hasStableNorthStarLiveMedia(peer: RTCPeerConnection | null, stream: MediaStream | null) {
  return Boolean(
    peer
    && peer.connectionState === "connected"
    && peer.iceConnectionState === "connected"
    && stream,
  );
}

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

const tabs: TabDefinition[] = [
  { id: "settings", label: "Settings", eyebrow: "Phase 0", title: "System setup", description: "Connections, thresholds, and diagnostics." },
  { id: "memory", label: "Memory", eyebrow: "Phase 1", title: "Manual memory foundation", description: "Places, rules, reflections, and memory overview." },
  { id: "context", label: "Context", eyebrow: "Phase 2", title: "Passive context capture", description: "Raw events, visits, repeated places, and sleep inference." },
  { id: "judgment", label: "Judgment", eyebrow: "Phases 3-6", title: "Moments and messaging", description: "Saved moments, rhythm, decisions, and draft outreach." },
  { id: "review", label: "Review", eyebrow: "Phase 8", title: "Corrections and inspection", description: "Correct significance, rules, and inspect detail." },
];

const defaultSettings: AppSettings = {
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  sleepWindowStart: "23:00",
  sleepWindowEnd: "07:00",
  outreachPreference: "balanced",
  emergencyBypassEnabled: false,
  messageCooldownMinutes: 180,
  mediumConfidenceThreshold: 0.6,
  callRequestsEnabled: false,
  callCooldownMinutes: 720,
  callConfidenceThreshold: 0.85,
  lmStudioEndpoint: "http://127.0.0.1:1234",
  lmStudioApiKey: "",
  lmStudioModel: "qwen/qwen3.5-9b",
  ttsProvider: "kokoro",
  ttsEndpoint: "http://127.0.0.1:8880/v1",
  ttsApiKey: "",
  ttsModelId: "kokoro-82m",
  ttsSampleRate: 24000,
  ttsDefaultVoice: "af_heart",
  ttsModelPath: "",
  ttsVoicesPath: "",
  callTranscriptCleanupPrompt: defaultCallTranscriptCleanupPrompt,
  callOutboundOutreachPrompt: defaultCallOutboundOutreachPrompt,
  callInboundMainReplyPrompt: defaultCallInboundMainReplyPrompt,
  callOutboundMainReplyPrompt: defaultCallOutboundMainReplyPrompt,
  callInboundStreamedReplyPrompt: defaultCallInboundStreamedReplyPrompt,
  callOutboundStreamedReplyPrompt: defaultCallOutboundStreamedReplyPrompt,
  callInboundExplanationPrompt: defaultCallInboundExplanationPrompt,
  callOutboundExplanationPrompt: defaultCallOutboundExplanationPrompt,
  callOpenerPrompt: defaultCallOpenerPrompt,
  northStarEndpoint: "http://127.0.0.1:3100",
  northStarUserHandle: "",
  northStarDisplayName: "",
  northStarSessionToken: "",
  northStarDeviceToken: "",
  northStarLastLocationEventId: "",
};

const defaultPlace: CreatePlaceInput = {
  label: "",
  latitude: null,
  longitude: null,
  radiusMeters: 75,
  placeKind: "unknown",
  meaningKind: "uncertain",
  isUserNamed: true,
  isProtected: false,
  notes: "",
};

const defaultRule: CreateRuleInput = {
  ruleKind: "protected_time",
  scopeKind: "global",
  scopeRefId: null,
  valueJson: JSON.stringify({ start: "22:30", end: "07:30", note: "quiet overnight" }, null, 2),
  isActive: true,
};

const defaultReflection: CreateReflectionInput = {
  reflectionKind: "meaning",
  text: "",
  linkedPlaceId: null,
  weight: 0.7,
  expiresAt: null,
  isSensitive: false,
};

const defaultLocationEvent: LocationEventInput = {
  occurredAt: new Date().toISOString(),
  latitude: 52.3676,
  longitude: 4.9041,
  accuracyMeters: 25,
  speedMps: 0,
  source: "manual_test",
};

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

function formatStatus(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function maskSettingValue(key: string, valueJson: string) {
  if (key.includes("token") || key.includes("api_key") || key.includes("apiKey")) {
    return '"***masked***"';
  }
  return valueJson;
}

function summarizeMemoryGrowth(before: MemoryGrowthSnapshot | null, after: MemoryGrowthSnapshot) {
  const previousItems = new Map((before?.memoryItems ?? []).map((item) => [item.id, item]));
  const nextItems = new Map(after.memoryItems.map((item) => [item.id, item]));

  let created = 0;
  let reinforced = 0;
  let nowAwaitingConfirmation = 0;
  let becameActive = 0;
  let becameFading = 0;
  let becameArchived = 0;

  for (const item of after.memoryItems) {
    const previous = previousItems.get(item.id);
    if (!previous) {
      created += 1;
      if (item.status === "awaiting_confirmation") nowAwaitingConfirmation += 1;
      if (item.status === "active") becameActive += 1;
      if (item.status === "fading") becameFading += 1;
      if (item.status === "archived") becameArchived += 1;
      continue;
    }

    if (item.reinforcedAt && item.reinforcedAt !== previous.reinforcedAt) {
      reinforced += 1;
    }

    if (item.status !== previous.status) {
      if (item.status === "awaiting_confirmation") nowAwaitingConfirmation += 1;
      if (item.status === "active") becameActive += 1;
      if (item.status === "fading") becameFading += 1;
      if (item.status === "archived") becameArchived += 1;
    }
  }

  let removed = 0;
  for (const item of before?.memoryItems ?? []) {
    if (!nextItems.has(item.id)) removed += 1;
  }

  const lines = [
    `Created ${created} memory item${created === 1 ? "" : "s"}.`,
    `Reinforced ${reinforced} existing item${reinforced === 1 ? "" : "s"}.`,
    `Marked ${nowAwaitingConfirmation} item${nowAwaitingConfirmation === 1 ? "" : "s"} as awaiting confirmation.`,
    `Moved ${becameActive} item${becameActive === 1 ? "" : "s"} into active memory.`,
    `Moved ${becameFading} item${becameFading === 1 ? "" : "s"} into fading memory.`,
    `Archived ${becameArchived} item${becameArchived === 1 ? "" : "s"}.`,
  ];

  if (removed > 0) {
    lines.push(`Removed ${removed} stale item${removed === 1 ? "" : "s"}.`);
  }

  const meaningfulChanges = created + reinforced + nowAwaitingConfirmation + becameActive + becameFading + becameArchived + removed;
  if (meaningfulChanges === 0) {
    return ["No memory changes were needed this pass."];
  }

  return lines.filter((line) => !line.includes(" 0 "));
}

function prettyJson(value: string) {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

function describeMemorySource(item: MemoryItem) {
  switch (item.sourceKind) {
    case "place":
      return "This came from a place that keeps carrying meaning in your history.";
    case "manual_reflection":
      return "This came from a reflection that was captured directly.";
    case "feedback_pattern":
      return "This came from repeated feedback about how outreach around a kind of moment feels.";
    case "call_outcome_pattern":
      return "This came from how past call requests were answered.";
    case "call_session_summary":
      return "This came from a completed call summary that the system kept as memory.";
    default:
      return "This came from the companion's recent memory-building pass.";
  }
}

function describeMemoryBehavior(item: MemoryItem) {
  if (item.requiresConfirmation) {
    return "It will stay tentative until you explicitly keep it or let it go.";
  }
  if (item.status === "fading") {
    return item.decaysAfter
      ? `It is already fading and may fall away after ${formatDateTime(item.decaysAfter)} unless something reinforces it.`
      : "It is already fading and may fall away unless something reinforces it.";
  }
  if (item.status === "archived") {
    return "It has been archived, so it is no longer part of the active memory model.";
  }
  if (item.memoryType === "stable") {
    return "It is being treated as something enduring enough to keep around.";
  }
  if (item.memoryType === "short_lived") {
    return item.decaysAfter
      ? `It is meant to be temporary and should fade after ${formatDateTime(item.decaysAfter)} unless it is reinforced.`
      : "It is meant to be temporary and should fade unless it is reinforced.";
  }
  if (item.memoryType === "evolving") {
    return "It can still strengthen, soften, or fade depending on what happens next.";
  }
  return "It is part of the current memory model and may change as more evidence arrives.";
}

const ConversationTurnsPanel = memo(function ConversationTurnsPanel({
  turns,
  liveReplyPreviewText,
}: {
  turns: CallTurnRecord[];
  liveReplyPreviewText: string;
}) {
  if (!turns.length && !liveReplyPreviewText) {
    return null;
  }
  return (
    <div className="saved-state">
      <h3>Conversation so far</h3>
      <ul>
        {turns.map((turn) => (
          <li key={turn.id}>
            <strong>{formatDateTime(turn.createdAt)}</strong>
            <code>You said: {turn.transcriptText}</code>
            <code>North Star answered: {turn.replyText}</code>
          </li>
        ))}
        {liveReplyPreviewText ? (
          <li key="live-reply-preview">
            <strong>Now</strong>
            <code>North Star answering: {liveReplyPreviewText}</code>
          </li>
        ) : null}
      </ul>
    </div>
  );
});

const CallHistoryPanel = memo(function CallHistoryPanel({
  sessions,
}: {
  sessions: CallSessionSnapshot["recentSessions"];
}) {
  return (
    <section className="panel">
      <div className="panel-header"><h2>Call history</h2><p>Recent sessions with outcomes, timing, and call-derived notes.</p></div>
      <div className="saved-state">
        <ul>
          {sessions.length ? sessions.map((session) => (
            <li key={session.id}>
              <strong>{session.handoffKind} / {session.outcome}</strong>
              <code>session {session.id} / {session.sessionState}</code>
              <code>{session.durationSeconds > 0 ? formatDuration(session.durationSeconds) : "not timed yet"}</code>
              {session.transcriptSummary ? <code>{session.transcriptSummary}</code> : null}
            </li>
          )) : <li>No call sessions yet.</li>}
        </ul>
      </div>
    </section>
  );
});

const SavedMomentsPanel = memo(function SavedMomentsPanel({
  savedMoments,
  selectedSavedMomentId,
  onSelect,
}: {
  savedMoments: PhaseThreeSnapshot["savedMoments"];
  selectedSavedMomentId: number | null;
  onSelect: (id: number) => void;
}) {
  return (
    <section className="panel">
      <div className="panel-header"><h2>Saved moments</h2><p>Phase 3 memory candidates with evidence attached.</p></div>
      <div className="saved-state">
        <ul>
          {savedMoments.length ? savedMoments.map((moment) => (
            <li key={moment.id}>
              <button
                type="button"
                className={`memory-item-button ${selectedSavedMomentId === moment.id ? "active" : ""}`}
                onClick={() => onSelect(moment.id)}
              >
                <strong>{moment.momentKind}</strong>
                <code>confidence {moment.confidence.toFixed(2)} / {moment.inferredSignificance}</code>
              </button>
            </li>
          )) : <li>No saved moments yet.</li>}
        </ul>
      </div>
    </section>
  );
});

const SelectedMomentPanel = memo(function SelectedMomentPanel({
  selectedSavedMoment,
}: {
  selectedSavedMoment: PhaseThreeSnapshot["savedMoments"][number] | null;
}) {
  return (
    <section className="panel">
      <div className="panel-header"><h2>Selected moment</h2><p>Observed evidence and why the system thought this moment might matter.</p></div>
      {selectedSavedMoment ? (
        <div className="saved-state">
          <h3>{selectedSavedMoment.momentKind}</h3>
          <p className="memory-detail-lead">{selectedSavedMoment.inferredSignificance}</p>
          <code>confidence {selectedSavedMoment.confidence.toFixed(2)} / action {selectedSavedMoment.actionTaken}</code>
          <code>{selectedSavedMoment.observedContextJson}</code>
        </div>
      ) : (
        <p>No saved moment selected yet.</p>
      )}
    </section>
  );
});

function App() {
  const [activeTab, setActiveTab] = useState<TabId>("settings");
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [savedRows, setSavedRows] = useState<SettingsEntry[]>([]);
  const [snapshot, setSnapshot] = useState<PhaseOneSnapshot | null>(null);
  const [passiveSnapshot, setPassiveSnapshot] = useState<PassiveContextSnapshot | null>(null);
  const [phaseThreeSnapshot, setPhaseThreeSnapshot] = useState<PhaseThreeSnapshot | null>(null);
  const [decisionSnapshot, setDecisionSnapshot] = useState<DecisionSnapshot | null>(null);
  const [northStarRuntimeSnapshot, setNorthStarRuntimeSnapshot] = useState<NorthStarRuntimeProjection | null>(null);
  const [northStarConnectionsSnapshot, setNorthStarConnectionsSnapshot] = useState<NorthStarConnectionsProjection | null>(null);
  const [callSessionSnapshot, setCallSessionSnapshot] = useState<CallSessionSnapshot | null>(null);
  const [realityCheckSnapshot, setRealityCheckSnapshot] = useState<MvpRealityCheckSnapshot | null>(null);
  const [simulationScenarios, setSimulationScenarios] = useState<SimulationScenario[]>([]);
  const [memoryGrowthSnapshot, setMemoryGrowthSnapshot] = useState<MemoryGrowthSnapshot | null>(null);
  const [selectedSimulationKey, setSelectedSimulationKey] = useState("single_message_path");
  const [simulationResult, setSimulationResult] = useState<SimulationRunResult | null>(null);
  const [simulationSuiteResult, setSimulationSuiteResult] = useState<SimulationSuiteResult | null>(null);
  const [memoryGrowthSummary, setMemoryGrowthSummary] = useState<string[]>([]);
  const [selectedMemoryItemId, setSelectedMemoryItemId] = useState<number | null>(null);
  const [selectedSavedMomentId, setSelectedSavedMomentId] = useState<number | null>(null);
  const [selectedDecisionId, setSelectedDecisionId] = useState<number | null>(null);
  const [selectedCallSessionId, setSelectedCallSessionId] = useState<number | null>(null);
  const [settingsSection, setSettingsSection] = useState<SettingsSectionId>("core");
  const [memorySection, setMemorySection] = useState<MemorySectionId>("places");
  const [contextSection, setContextSection] = useState<ContextSectionId>("ingest");
  const [judgmentSection, setJudgmentSection] = useState<JudgmentSectionId>("reality");
  const [reviewSection, setReviewSection] = useState<ReviewSectionId>("places");
  const [diagnostics, setDiagnostics] = useState<DiagnosticStatus | null>(null);
  const [voiceSnapshot, setVoiceSnapshot] = useState<VoiceSnapshot | null>(null);
  const [voicePreview, setVoicePreview] = useState<VoiceSynthesisResult | null>(null);
  const [voicePreviewSrc, setVoicePreviewSrc] = useState<string | null>(null);
  const [callTurnResult, setCallTurnResult] = useState<CallTurnResult | null>(null);
  const [selectedCallTurns, setSelectedCallTurns] = useState<CallTurnRecord[]>([]);
  const [speechStream, setSpeechStream] = useState<SpeechStreamSnapshot | null>(null);
  const [callReplyAudioSrc, setCallReplyAudioSrc] = useState<string | null>(null);
  const [callSessionNotes, setCallSessionNotes] = useState("");
  const [callTranscriptSummary, setCallTranscriptSummary] = useState("");
  const [northStarMessageText, setNorthStarMessageText] = useState("");
  const [northStarCallNote, setNorthStarCallNote] = useState("");
  const [northStarTurnStatus, setNorthStarTurnStatus] = useState<NorthStarTurnProcessingResult | null>(null);
  const [northStarLiveReplyPreviewText, setNorthStarLiveReplyPreviewText] = useState("");
  const [placeForm, setPlaceForm] = useState<CreatePlaceInput>(defaultPlace);
  const [ruleForm, setRuleForm] = useState<CreateRuleInput>(defaultRule);
  const [reflectionForm, setReflectionForm] = useState<CreateReflectionInput>(defaultReflection);
  const [locationForm, setLocationForm] = useState<LocationEventInput>(defaultLocationEvent);
  const [reviewPlace, setReviewPlace] = useState<UpdatePlaceInput | null>(null);
  const [reviewRule, setReviewRule] = useState<UpdateRuleInput | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyPanel, setBusyPanel] = useState<"place" | "rule" | "reflection" | "memoryGrowth" | "memoryReview" | "location" | "northStarSession" | "northStarBind" | "northStarHeartbeat" | "northStarMessage" | "northStarCall" | "northStarPull" | "northStarImportReviews" | "northStarTurn" | "northStarLink" | "decisions" | "callDecisions" | "reviewPlace" | "reviewRule" | "realitySeed" | "simulationRun" | "runtimeReset" | "simulationSuite" | "voiceDownload" | "voiceRuntime" | "voicePreview" | "voiceCleanup" | "localCleanup" | "callStart" | "callEnd" | "speechSetup" | "callTurn" | "speechStreamStart" | "speechStreamStop" | "northStarAcceptedCall" | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [northStarLiveDiagnostics, setNorthStarLiveDiagnostics] = useState<NorthStarLiveDiagnostics>(defaultNorthStarLiveDiagnostics);
  const [northStarIncomingAudioMeter, setNorthStarIncomingAudioMeter] = useState<NorthStarIncomingAudioMeter>(defaultNorthStarIncomingAudioMeter);
  const [northStarRemoteTrackStats, setNorthStarRemoteTrackStats] = useState<NorthStarRemoteTrackStats>(defaultNorthStarRemoteTrackStats);
  const [northStarLiveTurnTransportStats, setNorthStarLiveTurnTransportStats] = useState<NorthStarLiveTurnTransportStats>(defaultNorthStarLiveTurnTransportStats);
  const northStarRtcIceServersRef = useRef<RTCIceServer[] | null>(null);
  const missingAcceptedNorthStarPollsRef = useRef(0);
  const northStarAcceptedSessionStartCallIdRef = useRef<string | null>(null);
  const northStarWebRtcPeerRef = useRef<RTCPeerConnection | null>(null);
  const northStarWebRtcChannelRef = useRef<RTCDataChannel | null>(null);
  const northStarWebRtcCallIdRef = useRef<string | null>(null);
  const northStarPendingOutboundChannelMessagesRef = useRef<unknown[]>([]);
  const northStarOutboundDrainScheduledRef = useRef(false);
  const northStarOutboundDrainRunningRef = useRef(false);
  const processedNorthStarSignalIdsRef = useRef<Set<string>>(new Set());
  const northStarLiveTurnChunksRef = useRef<Map<string, string[]>>(new Map());
  const northStarPeerAudioContextRef = useRef<AudioContext | null>(null);
  const northStarPeerAudioDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const northStarIncomingMediaStreamRef = useRef<MediaStream | null>(null);
  const northStarIncomingReceiverRef = useRef<RTCRtpReceiver | null>(null);
  const northStarIncomingTrackRef = useRef<MediaStreamTrack | null>(null);
  const northStarIncomingAudioChunksRef = useRef<Float32Array[]>([]);
  const northStarIncomingAudioContextRef = useRef<AudioContext | null>(null);
  const northStarIncomingProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const northStarIncomingSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const northStarIncomingSinkRef = useRef<GainNode | null>(null);
  const northStarIncomingSpeechDetectedRef = useRef(false);
  const northStarIncomingSpeechFramesRef = useRef(0);
  const northStarIncomingSilenceFramesRef = useRef(0);
  const northStarIncomingProcessingRef = useRef(false);
  const northStarLiveStreamSeenChunksRef = useRef<Map<string, Set<number>>>(new Map());
  const northStarLiveReplyAudioPartsRef = useRef<Map<string, string[]>>(new Map());
  const northStarLiveReplyPreviewTextRef = useRef<Map<string, string>>(new Map());
  const northStarLiveReplyPreviewPendingTextRef = useRef("");
  const northStarLiveReplyPreviewFlushTimerRef = useRef<number | null>(null);
  const northStarLiveDiagnosticsRef = useRef<NorthStarLiveDiagnostics>(defaultNorthStarLiveDiagnostics);
  const northStarLiveDataChannelRecoveryTimerRef = useRef<number | null>(null);
  const northStarActiveSpeechRequestIdRef = useRef<string | null>(null);
  const northStarSpeechQueueRef = useRef<Promise<void>>(Promise.resolve());
  const northStarReplyTransportQueueRef = useRef<Promise<void>>(Promise.resolve());
  const northStarPeerReplyPlaybackQueueRef = useRef<Promise<void>>(Promise.resolve());
  const northStarPeerReplyStartedRef = useRef<Set<string>>(new Set());
  const northStarSnapshotCacheRef = useRef<NorthStarSnapshot | null>(null);

  const activeTabMeta = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];
  const northStarConnectionsVisible = activeTab === "settings" && settingsSection === "connections";
  const unresolvedMomentCount = phaseThreeSnapshot?.savedMoments.filter((moment) => !moment.resolvedAt).length ?? 0;
  const callReadyMomentCount = phaseThreeSnapshot?.savedMoments.filter((moment) => !moment.resolvedAt && moment.confidence >= settings.callConfidenceThreshold).length ?? 0;
  const selectedMemoryItem =
    memoryGrowthSnapshot?.memoryItems.find((item) => item.id === selectedMemoryItemId)
    ?? memoryGrowthSnapshot?.memoryItems[0]
    ?? null;
  const selectedSavedMoment =
    phaseThreeSnapshot?.savedMoments.find((moment) => moment.id === selectedSavedMomentId)
    ?? phaseThreeSnapshot?.savedMoments[0]
    ?? null;
  const selectedDecision =
    decisionSnapshot?.decisions.find((decision) => decision.id === selectedDecisionId)
    ?? decisionSnapshot?.decisions[0]
    ?? null;
  const selectedDecisionOutreach =
    selectedDecision?.createdOutreachEventId != null
      ? decisionSnapshot?.outreachEvents.find((event) => event.id === selectedDecision.createdOutreachEventId) ?? null
      : null;
  const selectedCallSession =
    callSessionSnapshot?.recentSessions.find((session) => session.id === selectedCallSessionId)
    ?? callSessionSnapshot?.activeSession
    ?? callSessionSnapshot?.recentSessions[0]
    ?? null;
  const latestAcceptedNorthStarCall =
    northStarRuntimeSnapshot?.callSessions.find((call) => call.status === "accepted")
    ?? null;
  const activeNorthStarSession =
    callSessionSnapshot?.activeSession?.handoffKind === "north_star_companion"
    && callSessionSnapshot.activeSession.sessionState === "active"
      ? callSessionSnapshot.activeSession
      : null;
  const activeNorthStarRemoteCallId = activeNorthStarSession?.notes.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0] ?? null;
  const activeNorthStarRemoteCall =
    activeNorthStarRemoteCallId
      ? northStarRuntimeSnapshot?.callSessions.find((call) => call.callId === activeNorthStarRemoteCallId) ?? null
      : null;
  const pendingAcceptedNorthStarCallId = latestAcceptedNorthStarCall?.callId ?? null;
  const northStarSessionReady = northStarRuntimeSnapshot?.sessionReady ?? false;
  const northStarDesktopBound = northStarRuntimeSnapshot?.desktopBound ?? false;
  const northStarReadyForCalls = northStarRuntimeSnapshot?.configured && northStarSessionReady && northStarDesktopBound;
const northStarLiveTurnActive =
  northStarLiveDiagnostics.phase === "desktop_remote_turn_processing"
  || northStarLiveDiagnostics.phase === "desktop_remote_turn_processed";
const northStarLiveChannelReady =
    Boolean(
      activeNorthStarSession
      && northStarWebRtcCallIdRef.current === activeNorthStarRemoteCallId
      && (
        (northStarWebRtcChannelRef.current && northStarWebRtcChannelRef.current.readyState === "open")
        || hasStableNorthStarLiveMedia(northStarWebRtcPeerRef.current, northStarIncomingMediaStreamRef.current)
      ),
    );
const northStarOpeningInFlight =
  northStarLiveDiagnostics.phase === "desktop_opening_requested"
  || northStarLiveDiagnostics.phase === "desktop_opening_started";
const northStarAwaitingConversationStart =
  northStarLiveChannelReady
  && !northStarOpeningInFlight
  && !northStarLiveTurnActive
  && northStarLiveTurnTransportStats.liveTurnsReceived === 0;

  function updateNorthStarLiveDiagnostics(patch: Partial<NorthStarLiveDiagnostics>) {
    setNorthStarLiveDiagnostics((current) => {
      const next = { ...current, ...patch };
      const changed = Object.keys(next).some((key) => next[key as keyof NorthStarLiveDiagnostics] !== current[key as keyof NorthStarLiveDiagnostics]);
      if (!changed) {
        return current;
      }
      northStarLiveDiagnosticsRef.current = next;
      return next;
    });
  }

  function flushNorthStarLiveReplyPreviewText(nextText: string) {
    if (northStarLiveReplyPreviewFlushTimerRef.current !== null) {
      window.clearTimeout(northStarLiveReplyPreviewFlushTimerRef.current);
      northStarLiveReplyPreviewFlushTimerRef.current = null;
    }
    northStarLiveReplyPreviewPendingTextRef.current = nextText;
    startTransition(() => {
      setNorthStarLiveReplyPreviewText((current) => (current === nextText ? current : nextText));
    });
  }

  function scheduleNorthStarLiveReplyPreviewFlush(nextText: string) {
    northStarLiveReplyPreviewPendingTextRef.current = nextText;
    if (northStarLiveReplyPreviewFlushTimerRef.current !== null) {
      return;
    }
    northStarLiveReplyPreviewFlushTimerRef.current = window.setTimeout(() => {
      northStarLiveReplyPreviewFlushTimerRef.current = null;
      flushNorthStarLiveReplyPreviewText(northStarLiveReplyPreviewPendingTextRef.current);
    }, 120);
  }

  function mapNorthStarRtcIceServers(servers: NorthStarRtcIceServer[]): RTCIceServer[] {
    if (servers.length === 0) {
      return NORTH_STAR_WEBRTC_CONFIG.iceServers ?? [];
    }
    return servers.map((server) => ({
      urls: server.urls,
      username: server.username ?? undefined,
      credential: server.credential ?? undefined,
    }));
  }

  function shouldPreferNorthStarRelay(servers: RTCIceServer[]) {
    return servers.some((server) => {
      const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
      return urls.some((url) => typeof url === "string" && url.trim().toLowerCase().startsWith("turn:"));
    });
  }

  async function getNorthStarPeerConfig() {
    if (northStarRtcIceServersRef.current) {
      const icePolicy = shouldPreferNorthStarRelay(northStarRtcIceServersRef.current) ? "relay" : "all";
      updateNorthStarLiveDiagnostics({
        icePolicy,
        iceServerKinds: describeIceServerKinds(northStarRtcIceServersRef.current),
      });
      return {
        iceServers: northStarRtcIceServersRef.current,
        iceTransportPolicy: icePolicy,
      } satisfies RTCConfiguration;
    }
    try {
      const servers = await getNorthStarRtcConfig();
      northStarRtcIceServersRef.current = mapNorthStarRtcIceServers(servers);
    } catch {
      northStarRtcIceServersRef.current = NORTH_STAR_WEBRTC_CONFIG.iceServers ?? [];
    }
    const icePolicy = shouldPreferNorthStarRelay(northStarRtcIceServersRef.current) ? "relay" : "all";
    updateNorthStarLiveDiagnostics({
      icePolicy,
      iceServerKinds: describeIceServerKinds(northStarRtcIceServersRef.current),
    });
    return {
      iceServers: northStarRtcIceServersRef.current,
      iceTransportPolicy: icePolicy,
    } satisfies RTCConfiguration;
  }

  function teardownNorthStarWebRtc(options?: { resetProcessedSignals?: boolean; clearPendingOutboundMessages?: boolean }) {
    const resetProcessedSignals = options?.resetProcessedSignals ?? true;
    const clearPendingOutboundMessages = options?.clearPendingOutboundMessages ?? true;
    northStarWebRtcChannelRef.current?.close();
    northStarWebRtcPeerRef.current?.close();
    northStarPeerAudioContextRef.current?.close().catch(() => undefined);
    northStarIncomingProcessorRef.current?.disconnect();
    northStarIncomingSourceRef.current?.disconnect();
    northStarIncomingSinkRef.current?.disconnect();
    northStarIncomingAudioContextRef.current?.close().catch(() => undefined);
    northStarWebRtcChannelRef.current = null;
    northStarWebRtcPeerRef.current = null;
    northStarWebRtcCallIdRef.current = null;
    if (resetProcessedSignals) {
      processedNorthStarSignalIdsRef.current = new Set();
    }
    if (northStarLiveDataChannelRecoveryTimerRef.current !== null) {
      window.clearTimeout(northStarLiveDataChannelRecoveryTimerRef.current);
      northStarLiveDataChannelRecoveryTimerRef.current = null;
    }
    if (clearPendingOutboundMessages) {
      northStarPendingOutboundChannelMessagesRef.current = [];
    }
    northStarOutboundDrainScheduledRef.current = false;
    northStarOutboundDrainRunningRef.current = false;
    northStarLiveTurnChunksRef.current = new Map();
    northStarLiveStreamSeenChunksRef.current = new Map();
    northStarLiveReplyAudioPartsRef.current = new Map();
    northStarLiveReplyPreviewTextRef.current = new Map();
    northStarPeerReplyStartedRef.current = new Set();
    flushNorthStarLiveReplyPreviewText("");
    northStarPeerAudioContextRef.current = null;
    northStarPeerAudioDestinationRef.current = null;
    northStarIncomingMediaStreamRef.current = null;
    northStarIncomingReceiverRef.current = null;
    northStarIncomingTrackRef.current = null;
    northStarIncomingAudioChunksRef.current = [];
    northStarIncomingAudioContextRef.current = null;
    northStarIncomingProcessorRef.current = null;
    northStarIncomingSourceRef.current = null;
    northStarIncomingSinkRef.current = null;
    northStarIncomingSpeechDetectedRef.current = false;
    northStarIncomingSpeechFramesRef.current = 0;
    northStarIncomingSilenceFramesRef.current = 0;
    northStarIncomingProcessingRef.current = false;
    northStarActiveSpeechRequestIdRef.current = null;
    northStarSpeechQueueRef.current = Promise.resolve();
    setNorthStarIncomingAudioMeter(defaultNorthStarIncomingAudioMeter);
    setNorthStarRemoteTrackStats(defaultNorthStarRemoteTrackStats);
    setNorthStarLiveTurnTransportStats(defaultNorthStarLiveTurnTransportStats);
    northStarLiveDiagnosticsRef.current = defaultNorthStarLiveDiagnostics;
    setNorthStarLiveDiagnostics(defaultNorthStarLiveDiagnostics);
  }

  function handleNorthStarLiveReplyPayload(payload: NorthStarLiveReplyStreamEvent) {
    void (async () => {
      if (payload.phase === "transcript_ready") {
        if (payload.transcriptText) {
          setCallTranscriptSummary(payload.transcriptText);
        }
        northStarLiveReplyPreviewTextRef.current.delete(payload.requestId);
        flushNorthStarLiveReplyPreviewText("");
        updateNorthStarLiveDiagnostics({
          phase: "desktop_reply_transcript_ready",
          issue: "",
        });
        return;
      }
      if (payload.phase === "text_preview") {
        const requestId = payload.requestId;
        const textChunk = (payload.textChunk ?? "").trim();
        if (!requestId || !textChunk) {
          return;
        }
        const currentPreview = northStarLiveReplyPreviewTextRef.current.get(requestId) ?? "";
        const nextPreview = `${currentPreview} ${textChunk}`.trim();
        northStarLiveReplyPreviewTextRef.current.set(requestId, nextPreview);
        scheduleNorthStarLiveReplyPreviewFlush(nextPreview);
        if (northStarLiveDiagnosticsRef.current.phase !== "desktop_reply_streaming" || northStarLiveDiagnosticsRef.current.issue) {
          updateNorthStarLiveDiagnostics({
            phase: "desktop_reply_streaming",
            issue: "",
          });
        }
        return;
      }
      if (payload.phase === "chunk") {
        const requestId = payload.requestId;
        const chunkIndex = payload.chunkIndex ?? -1;
        const audioBase64 = payload.audioBase64 ?? "";
        if (!requestId || chunkIndex < 0 || !audioBase64) {
          return;
        }
        const seen = northStarLiveStreamSeenChunksRef.current.get(requestId) ?? new Set<number>();
        if (seen.has(chunkIndex)) {
          return;
        }
        seen.add(chunkIndex);
        northStarLiveStreamSeenChunksRef.current.set(requestId, seen);
        queueNorthStarRemoteReplyPlayback(requestId, audioBase64, payload.textChunk ?? "");
        if (northStarLiveDiagnosticsRef.current.phase !== "desktop_reply_streaming" || northStarLiveDiagnosticsRef.current.issue) {
          updateNorthStarLiveDiagnostics({
            phase: "desktop_reply_streaming",
            issue: "",
          });
        }
        return;
      }
      if (payload.phase === "chunk_part") {
        const requestId = payload.requestId;
        const chunkIndex = payload.chunkIndex ?? -1;
        const partIndex = payload.partIndex ?? -1;
        const totalParts = payload.totalParts ?? 0;
        const audioSlice = payload.audioSlice ?? "";
        if (!requestId || chunkIndex < 0 || partIndex < 0 || totalParts <= 0 || !audioSlice) {
          return;
        }
        const key = replyChunkPartKey(requestId, chunkIndex);
        const parts = northStarLiveReplyAudioPartsRef.current.get(key) ?? new Array(totalParts).fill("");
        parts[partIndex] = audioSlice;
        northStarLiveReplyAudioPartsRef.current.set(key, parts);
        if (parts.filter(Boolean).length === totalParts) {
          northStarLiveReplyAudioPartsRef.current.delete(key);
          queueNorthStarRemoteReplyPlayback(requestId, parts.join(""), payload.textChunk ?? "");
        }
        if (northStarLiveDiagnosticsRef.current.phase !== "desktop_reply_streaming" || northStarLiveDiagnosticsRef.current.issue) {
          updateNorthStarLiveDiagnostics({
            phase: "desktop_reply_streaming",
            issue: "",
          });
        }
        return;
      }
      if (payload.phase === "complete") {
        if (payload.replyText) {
          setCallTranscriptSummary(payload.transcriptText ?? payload.replyText);
        }
        if (northStarActiveSpeechRequestIdRef.current === payload.requestId) {
          northStarActiveSpeechRequestIdRef.current = null;
          void refreshSpeechStreamSnapshot().catch(() => undefined);
        }
        northStarLiveReplyPreviewTextRef.current.delete(payload.requestId);
        flushNorthStarLiveReplyPreviewText("");
        void refreshCallSessionSnapshot().catch(() => undefined);
        void queueNorthStarPeerReplyPlayback(async () => {
          await queueNorthStarReplyTransport(() => sendOrQueueNorthStarChannelJson({
            type: "live_reply_stream_complete",
            requestId: payload.requestId,
            transcriptText: payload.transcriptText ?? "",
            replyText: payload.replyText ?? "",
            replyMode: payload.replyMode ?? "model_stream",
          }));
          northStarPeerReplyStartedRef.current.delete(payload.requestId);
        }).catch(() => undefined);
        updateNorthStarLiveDiagnostics({
          phase: "desktop_reply_stream_complete",
          issue: "",
        });
        return;
      }
      if (payload.phase === "error") {
        if (northStarActiveSpeechRequestIdRef.current === payload.requestId) {
          northStarActiveSpeechRequestIdRef.current = null;
          void refreshSpeechStreamSnapshot().catch(() => undefined);
        }
        flushNorthStarLiveReplyPreviewText("");
        window.setTimeout(() => {
          void queueNorthStarReplyTransport(() => sendOrQueueNorthStarChannelJson({
            type: "live_reply_stream_error",
            requestId: payload.requestId,
            message: payload.message ?? "North Star could not process that spoken turn live.",
          })).catch(() => undefined);
        }, 0);
        updateNorthStarLiveDiagnostics({
          phase: "desktop_reply_stream_failed",
          issue: payload.message ?? "Desktop failed while streaming the live reply.",
        });
      }
    })().catch(() => undefined);
  }

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    void listenNorthStarLiveReplyStream((payload: NorthStarLiveReplyStreamEvent) => {
      handleNorthStarLiveReplyPayload(payload);
    }).then((cleanup) => {
      unlisten = cleanup;
    }).catch(() => undefined);
    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  function decodeBase64ToArrayBuffer(base64: string) {
    const binary = window.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes.buffer;
  }

  function waitForNorthStarIceGathering(peer: RTCPeerConnection) {
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

  function ensureNorthStarPeerAudio() {
    if (northStarPeerAudioContextRef.current && northStarPeerAudioDestinationRef.current) {
      return {
        context: northStarPeerAudioContextRef.current,
        destination: northStarPeerAudioDestinationRef.current,
      };
    }
    const context = new AudioContext();
    const destination = context.createMediaStreamDestination();
    northStarPeerAudioContextRef.current = context;
    northStarPeerAudioDestinationRef.current = destination;
    return { context, destination };
  }

  function resetNorthStarIncomingDetection() {
    northStarIncomingSpeechDetectedRef.current = false;
    northStarIncomingSpeechFramesRef.current = 0;
    northStarIncomingSilenceFramesRef.current = 0;
    northStarIncomingAudioChunksRef.current = [];
    setNorthStarIncomingAudioMeter((current) => ({
      ...current,
      speaking: false,
      speechFrames: 0,
      silenceFrames: 0,
      bufferedSamples: 0,
    }));
  }

  function normalizeNorthStarIncomingAudio(chunks: Float32Array[]) {
    let peak = 0;
    let energy = 0;
    let sampleCount = 0;

    for (const chunk of chunks) {
      for (let index = 0; index < chunk.length; index += 1) {
        const sample = chunk[index];
        const abs = Math.abs(sample);
        if (abs > peak) {
          peak = abs;
        }
        energy += sample * sample;
        sampleCount += 1;
      }
    }

    if (sampleCount === 0 || peak === 0) {
      return chunks;
    }

    const rms = Math.sqrt(energy / sampleCount);
    const targetRms = 0.18;
    const desiredGain = rms > 0 ? targetRms / rms : 1;
    const peakLimitedGain = 0.92 / peak;
    const gain = Math.max(0.7, Math.min(peakLimitedGain, desiredGain, 6));

    return chunks.map((chunk) => {
      const normalized = new Float32Array(chunk.length);
      for (let index = 0; index < chunk.length; index += 1) {
        const shaped = Math.tanh(chunk[index] * gain * 1.35);
        normalized[index] = Math.max(-0.98, Math.min(0.98, shaped));
      }
      return normalized;
    });
  }

  function northStarIncomingAudioToBase64(chunks: Float32Array[], sampleRate: number) {
    const normalizedChunks = normalizeNorthStarIncomingAudio(chunks);
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

  async function processNorthStarIncomingAudioChunks(chunks: Float32Array[], sampleRate: number) {
    if (!activeNorthStarSession?.id || northStarIncomingProcessingRef.current) {
      return;
    }
    northStarIncomingProcessingRef.current = true;
    updateNorthStarLiveDiagnostics({
      phase: "desktop_remote_turn_processing",
      issue: "",
    });
    try {
      const audioBase64 = northStarIncomingAudioToBase64(chunks, sampleRate);
      const result = await processNorthStarLiveTurn(activeNorthStarSession.id, audioBase64);
      setCallTurnResult(result);
      setCallTranscriptSummary(result.transcriptText);
      updateNorthStarLiveDiagnostics({
        phase: "desktop_remote_turn_processed",
        issue: "",
      });
      await playNorthStarReplyOverPeer(result.replyAudioBase64);
    } catch {
      setMessage("North Star had trouble processing the live microphone track.");
      updateNorthStarLiveDiagnostics({
        phase: "processing_failed",
        issue: "Desktop could not process the live microphone track.",
      });
    } finally {
      northStarIncomingProcessingRef.current = false;
      resetNorthStarIncomingDetection();
    }
  }

  function startNorthStarIncomingTrackLoop(stream: MediaStream) {
    if (northStarIncomingProcessorRef.current || northStarIncomingProcessingRef.current) {
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
    northStarIncomingAudioContextRef.current = context;
    northStarIncomingSourceRef.current = source;
    northStarIncomingProcessorRef.current = processor;
    northStarIncomingSinkRef.current = sink;
    context.onstatechange = () => {
      updateNorthStarLiveDiagnostics({
        phase: "desktop_incoming_audio_context_state_changed",
        issue: context.state === "suspended" ? "Desktop incoming audio context is suspended." : "",
      });
    };
    if (context.state === "suspended") {
      void context.resume()
        .then(() => {
          updateNorthStarLiveDiagnostics({
            phase: "desktop_incoming_audio_context_resumed",
            issue: "",
          });
        })
        .catch(() => {
          updateNorthStarLiveDiagnostics({
            phase: "desktop_incoming_audio_context_resume_failed",
            issue: "Desktop could not resume the incoming live audio context.",
          });
        });
    }

    processor.onaudioprocess = (event) => {
      if (!activeNorthStarSession || northStarIncomingProcessingRef.current) {
        return;
      }

      const chunk = event.inputBuffer.getChannelData(0);
      let sum = 0;
      let peak = 0;
      for (let index = 0; index < chunk.length; index += 1) {
        const sample = chunk[index];
        const abs = Math.abs(sample);
        if (abs > peak) {
          peak = abs;
        }
        sum += sample * sample;
      }
      const rms = Math.sqrt(sum / chunk.length);
      const speaking = northStarIncomingSpeechDetectedRef.current
        ? (rms > 0.0025 || peak > 0.02)
        : (rms > 0.008 || peak > 0.06);
      const bufferedSamples = northStarIncomingAudioChunksRef.current.reduce((count, bufferedChunk) => count + bufferedChunk.length, 0);
      setNorthStarIncomingAudioMeter({
        rms,
        peak,
        speaking,
        speechFrames: northStarIncomingSpeechFramesRef.current,
        silenceFrames: northStarIncomingSilenceFramesRef.current,
        bufferedSamples,
      });

      if (speaking) {
        if (!northStarIncomingSpeechDetectedRef.current) {
          updateNorthStarLiveDiagnostics({
            phase: "desktop_remote_speech_detected",
            issue: "",
          });
        }
        northStarIncomingSpeechDetectedRef.current = true;
        northStarIncomingSilenceFramesRef.current = 0;
        northStarIncomingSpeechFramesRef.current += 1;
        northStarIncomingAudioChunksRef.current.push(new Float32Array(chunk));
        setNorthStarIncomingAudioMeter({
          rms,
          peak,
          speaking: true,
          speechFrames: northStarIncomingSpeechFramesRef.current,
          silenceFrames: northStarIncomingSilenceFramesRef.current,
          bufferedSamples: northStarIncomingAudioChunksRef.current.reduce((count, bufferedChunk) => count + bufferedChunk.length, 0),
        });
        return;
      }

      if (!northStarIncomingSpeechDetectedRef.current) {
        return;
      }

      northStarIncomingAudioChunksRef.current.push(new Float32Array(chunk));
      northStarIncomingSilenceFramesRef.current += 1;
      setNorthStarIncomingAudioMeter({
        rms,
        peak,
        speaking: false,
        speechFrames: northStarIncomingSpeechFramesRef.current,
        silenceFrames: northStarIncomingSilenceFramesRef.current,
        bufferedSamples: northStarIncomingAudioChunksRef.current.reduce((count, bufferedChunk) => count + bufferedChunk.length, 0),
      });
      if (
        northStarIncomingSpeechFramesRef.current >= 4
        && northStarIncomingSilenceFramesRef.current >= 8
      ) {
        const capturedChunks = [...northStarIncomingAudioChunksRef.current];
        const totalSamples = capturedChunks.reduce((count, capturedChunk) => count + capturedChunk.length, 0);
        if (totalSamples < 12_000) {
          updateNorthStarLiveDiagnostics({
            phase: "desktop_remote_turn_ignored_short_audio",
            issue: "",
          });
          resetNorthStarIncomingDetection();
          return;
        }
        updateNorthStarLiveDiagnostics({
          phase: "desktop_remote_turn_submitted",
          issue: "",
        });
        resetNorthStarIncomingDetection();
        void processNorthStarIncomingAudioChunks(capturedChunks, context.sampleRate);
      }
    };
  }

async function playNorthStarReplyOverPeer(base64: string) {
  const { context, destination } = ensureNorthStarPeerAudio();
  if (context.state === "suspended") {
    await context.resume();
  }
  const audioBuffer = await context.decodeAudioData(decodeBase64ToArrayBuffer(base64).slice(0));
  const source = context.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(destination);
  return await new Promise<number>((resolve) => {
    source.onended = () => resolve(Math.round(audioBuffer.duration * 1000));
    source.start();
  });
}

  function waitForNorthStarChannelCapacity(channel: RTCDataChannel) {
    if (channel.readyState !== "open") {
      return Promise.reject(new Error("North Star data channel is not open."));
    }
    if (channel.bufferedAmount <= NORTH_STAR_LIVE_CHANNEL_BUFFER_HIGH_WATER) {
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
        if (channel.bufferedAmount <= NORTH_STAR_LIVE_CHANNEL_BUFFER_LOW_WATER) {
          cleanup();
          resolve();
        }
      };
      const handleClosed = () => {
        cleanup();
        reject(new Error("North Star data channel closed while waiting to send."));
      };
      const timeout = window.setTimeout(() => {
        cleanup();
        resolve();
      }, 800);
      channel.bufferedAmountLowThreshold = NORTH_STAR_LIVE_CHANNEL_BUFFER_LOW_WATER;
      channel.addEventListener("bufferedamountlow", handleBufferedLow);
      channel.addEventListener("close", handleClosed);
      channel.addEventListener("error", handleClosed);
      handleBufferedLow();
    });
  }

  function waitForNorthStarChannelSendYield() {
    return new Promise<void>((resolve) => {
      window.setTimeout(resolve, 0);
    });
  }

  async function sendNorthStarChannelJson(channel: RTCDataChannel, payload: unknown) {
    await waitForNorthStarChannelCapacity(channel);
    if (channel.readyState !== "open") {
      throw new Error("North Star data channel is not open.");
    }
    channel.send(JSON.stringify(payload));
  }

  async function sendChunkedNorthStarReply(
    channel: RTCDataChannel,
    requestId: string,
    result: CallTurnResult,
  ) {
    const payloadJson = JSON.stringify(result);
    if (payloadJson.length <= NORTH_STAR_LIVE_CHANNEL_CHUNK_SIZE) {
      await sendNorthStarChannelJson(channel, {
        type: "live_reply",
        requestId,
        result,
      });
      return;
    }

    const total = Math.ceil(payloadJson.length / NORTH_STAR_LIVE_CHANNEL_CHUNK_SIZE);
    for (let index = 0; index < total; index += 1) {
      const slice = payloadJson.slice(
        index * NORTH_STAR_LIVE_CHANNEL_CHUNK_SIZE,
        (index + 1) * NORTH_STAR_LIVE_CHANNEL_CHUNK_SIZE,
      );
      await sendNorthStarChannelJson(channel, {
        type: "live_reply_chunk",
        requestId,
        index,
        total,
        payloadSlice: slice,
      });
      await waitForNorthStarChannelSendYield();
    }
  }

  async function sendChunkedNorthStarOpening(
    channel: RTCDataChannel,
    openerId: string,
    result: { text: string; audioBase64: string },
  ) {
    const payloadJson = JSON.stringify(result);
    if (payloadJson.length <= NORTH_STAR_LIVE_CHANNEL_CHUNK_SIZE) {
      await sendNorthStarChannelJson(channel, {
        type: "live_opening_audio",
        openerId,
        text: result.text,
        audioBase64: result.audioBase64,
      });
      return;
    }

    const total = Math.ceil(payloadJson.length / NORTH_STAR_LIVE_CHANNEL_CHUNK_SIZE);
    for (let index = 0; index < total; index += 1) {
      const slice = payloadJson.slice(
        index * NORTH_STAR_LIVE_CHANNEL_CHUNK_SIZE,
        (index + 1) * NORTH_STAR_LIVE_CHANNEL_CHUNK_SIZE,
      );
      await sendNorthStarChannelJson(channel, {
        type: "live_opening_chunk",
        openerId,
        index,
        total,
        payloadSlice: slice,
      });
      await waitForNorthStarChannelSendYield();
    }
  }

  async function flushNorthStarPendingChannelMessages(channel: RTCDataChannel) {
    scheduleNorthStarOutboundDrain(channel);
  }

  async function sendOrQueueNorthStarChannelJson(payload: unknown) {
    northStarPendingOutboundChannelMessagesRef.current.push(payload);
    scheduleNorthStarOutboundDrain();
  }

  function scheduleNorthStarOutboundDrain(channelOverride?: RTCDataChannel | null) {
    if (northStarOutboundDrainScheduledRef.current) {
      return;
    }
    northStarOutboundDrainScheduledRef.current = true;
    window.setTimeout(() => {
      northStarOutboundDrainScheduledRef.current = false;
      void drainNorthStarOutboundChannelMessages(channelOverride ?? northStarWebRtcChannelRef.current).catch(() => undefined);
    }, 0);
  }

  async function drainNorthStarOutboundChannelMessages(channel: RTCDataChannel | null | undefined) {
    if (northStarOutboundDrainRunningRef.current) {
      return;
    }
    if (!channel || channel.readyState !== "open" || northStarPendingOutboundChannelMessagesRef.current.length === 0) {
      return;
    }
    northStarOutboundDrainRunningRef.current = true;
    try {
      let sentCount = 0;
      while (
        channel.readyState === "open"
        && northStarPendingOutboundChannelMessagesRef.current.length > 0
        && sentCount < NORTH_STAR_OUTBOUND_MESSAGES_PER_TICK
      ) {
        const payload = northStarPendingOutboundChannelMessagesRef.current[0];
        try {
          await sendNorthStarChannelJson(channel, payload);
        } catch {
          break;
        }
        northStarPendingOutboundChannelMessagesRef.current.shift();
        sentCount += 1;
      }
    } finally {
      northStarOutboundDrainRunningRef.current = false;
      if (channel.readyState === "open" && northStarPendingOutboundChannelMessagesRef.current.length > 0) {
        scheduleNorthStarOutboundDrain(channel);
      }
    }
  }

  async function sendChunkedNorthStarReplyStreamChunk(
    requestId: string,
    chunkIndex: number,
    audioBase64: string,
    textChunk: string,
    sampleRate: number,
  ) {
    if (audioBase64.length <= NORTH_STAR_LIVE_CHANNEL_CHUNK_SIZE) {
      await sendOrQueueNorthStarChannelJson({
        type: "live_reply_stream_chunk",
        requestId,
        chunkIndex,
        textChunk,
        audioBase64,
        sampleRate,
      });
      return;
    }

    const totalParts = Math.ceil(audioBase64.length / NORTH_STAR_LIVE_CHANNEL_CHUNK_SIZE);
    for (let partIndex = 0; partIndex < totalParts; partIndex += 1) {
      const audioSlice = audioBase64.slice(
        partIndex * NORTH_STAR_LIVE_CHANNEL_CHUNK_SIZE,
        (partIndex + 1) * NORTH_STAR_LIVE_CHANNEL_CHUNK_SIZE,
      );
      await sendOrQueueNorthStarChannelJson({
        type: "live_reply_stream_chunk_part",
        requestId,
        chunkIndex,
        partIndex,
        totalParts,
        audioSlice,
        sampleRate,
        textChunk: partIndex === 0 ? textChunk : "",
      });
    }
  }

  function queueNorthStarSpeechOperation(task: () => Promise<void>) {
    const next = northStarSpeechQueueRef.current.then(task, task);
    northStarSpeechQueueRef.current = next.catch(() => undefined);
    return next;
  }

  function queueNorthStarReplyTransport(task: () => Promise<void>) {
    const next = northStarReplyTransportQueueRef.current.then(task, task);
    northStarReplyTransportQueueRef.current = next.catch(() => undefined);
    return next;
  }

  function queueNorthStarPeerReplyPlayback(task: () => Promise<void>) {
    const next = northStarPeerReplyPlaybackQueueRef.current.then(task, task);
    northStarPeerReplyPlaybackQueueRef.current = next.catch(() => undefined);
    return next;
  }

  function replyChunkPartKey(requestId: string, chunkIndex: number) {
    return `${requestId}:${chunkIndex}`;
  }

  function queueNorthStarRemoteReplyPlayback(
    requestId: string,
    audioBase64: string,
    textChunk: string,
  ) {
    const shouldSignalStart = !northStarPeerReplyStartedRef.current.has(requestId);
    northStarPeerReplyStartedRef.current.add(requestId);
    void queueNorthStarPeerReplyPlayback(async () => {
      if (shouldSignalStart) {
        await queueNorthStarReplyTransport(() => sendOrQueueNorthStarChannelJson({
          type: "live_reply_remote_audio_started",
          requestId,
          textChunk,
        }));
      }
      await playNorthStarReplyOverPeer(audioBase64);
    }).catch(() => {
      updateNorthStarLiveDiagnostics({
        phase: "desktop_reply_stream_failed",
        issue: "Desktop could not play the live reply over the peer audio track.",
      });
      void queueNorthStarReplyTransport(() => sendOrQueueNorthStarChannelJson({
        type: "live_reply_stream_error",
        requestId,
        message: "North Star could not play that reply over the live call audio path.",
      })).catch(() => undefined);
    });
  }

  async function ensureNorthStarSpeechStreamStarted(sessionId: number, requestId: string) {
    if (northStarActiveSpeechRequestIdRef.current === requestId) {
      return;
    }
    if (northStarActiveSpeechRequestIdRef.current && northStarActiveSpeechRequestIdRef.current !== requestId) {
      throw new Error("North Star speech stream is already handling another live request.");
    }
    const snapshot = await startSpeechStream({ sessionId });
    northStarActiveSpeechRequestIdRef.current = requestId;
    setSpeechStream(snapshot);
    updateNorthStarLiveDiagnostics({
      phase: "desktop_live_speech_started",
      issue: "",
    });
  }

  async function handleNorthStarLiveSpeechMessage(
    payload:
      | { type: "live_speech_start"; requestId: string; sampleRate?: number; audioFormat?: string }
      | { type: "live_speech_frame"; requestId: string; audioBase64: string; sampleRate?: number; audioFormat?: string }
      | { type: "live_speech_end"; requestId: string },
    activeSessionId: number,
  ) {
    await queueNorthStarSpeechOperation(async () => {
      if (payload.type === "live_speech_start") {
        const requestId = payload.requestId;
        if (!requestId) {
          return;
        }
        setNorthStarLiveTurnTransportStats((current) => ({
          liveTurnsReceived: current.liveTurnsReceived + 1,
          liveTurnChunksReceived: current.liveTurnChunksReceived,
          lastLiveTurnRequestId: requestId,
        }));
        await ensureNorthStarSpeechStreamStarted(activeSessionId, requestId);
        return;
      }

      if (payload.type === "live_speech_frame") {
        const requestId = payload.requestId;
        const audioBase64 = payload.audioBase64;
        if (!requestId || !audioBase64) {
          return;
        }
        await ensureNorthStarSpeechStreamStarted(activeSessionId, requestId);
        await pushSpeechStreamAudio({
          sessionId: activeSessionId,
          audioBase64,
          sampleRate: payload.sampleRate ?? 16000,
          audioFormat: payload.audioFormat ?? "pcm16le",
        });
        updateNorthStarLiveDiagnostics({
          phase: "desktop_live_speech_receiving",
          issue: "",
        });
        setNorthStarLiveTurnTransportStats((current) => ({
          liveTurnsReceived: current.liveTurnsReceived,
          liveTurnChunksReceived: current.liveTurnChunksReceived + 1,
          lastLiveTurnRequestId: requestId,
        }));
        return;
      }

      if (northStarActiveSpeechRequestIdRef.current !== payload.requestId) {
        return;
      }
      updateNorthStarLiveDiagnostics({
        phase: "desktop_live_speech_processing",
        issue: "",
      });
      void completeNorthStarLiveSpeechStream(activeSessionId, payload.requestId, handleNorthStarLiveReplyPayload)
        .then(() => {
          updateNorthStarLiveDiagnostics({
            phase: "desktop_live_speech_reply_started",
            issue: "",
          });
        })
        .catch(() => {
          northStarActiveSpeechRequestIdRef.current = null;
          updateNorthStarLiveDiagnostics({
            phase: "desktop_live_speech_failed",
            issue: "Desktop failed while handling live speech frames.",
          });
        });
    });
  }

  function attachNorthStarDesktopPeer(callId: string, peer: RTCPeerConnection) {
    northStarWebRtcCallIdRef.current = callId;
    updateNorthStarLiveDiagnostics({
      phase: "desktop_peer_created",
      signalingState: peer.signalingState,
      iceGatheringState: peer.iceGatheringState,
      iceConnectionState: peer.iceConnectionState,
      connectionState: peer.connectionState,
      dataChannelState: "waiting_for_mobile_channel",
      remoteTrackState: "waiting",
      lastSignal: "offer_received",
      issue: "",
    });
    const { destination } = ensureNorthStarPeerAudio();
    destination.stream.getAudioTracks().forEach((track) => {
      peer.addTrack(track, destination.stream);
    });
    peer.onicecandidate = (event) => {
      if (!event.candidate || northStarWebRtcCallIdRef.current !== callId) {
        return;
      }
      updateNorthStarLiveDiagnostics({
        phase: "desktop_ice_candidate_sent",
        iceGatheringState: peer.iceGatheringState,
        lastSignal: "ice_candidate_sent",
        localIceCandidates: northStarLiveDiagnostics.localIceCandidates + 1,
        localCandidateKinds: mergeCandidateKindList(
          northStarLiveDiagnostics.localCandidateKinds,
          detectCandidateKind(event.candidate.candidate),
        ),
      });
      void sendNorthStarWebRtcSignal(callId, "ice_candidate", JSON.stringify(event.candidate.toJSON())).catch(() => undefined);
    };
    peer.onsignalingstatechange = () => {
      updateNorthStarLiveDiagnostics({
        phase: "desktop_signaling_state_changed",
        signalingState: peer.signalingState,
      });
    };
    peer.onicegatheringstatechange = () => {
      updateNorthStarLiveDiagnostics({
        phase: "desktop_ice_gathering_state_changed",
        iceGatheringState: peer.iceGatheringState,
      });
    };
    peer.oniceconnectionstatechange = () => {
      updateNorthStarLiveDiagnostics({
        phase: "desktop_ice_connection_state_changed",
        iceConnectionState: peer.iceConnectionState,
        issue: peer.iceConnectionState === "failed" ? "ICE connection failed on desktop." : "",
      });
    };
    peer.ondatachannel = (event) => {
      northStarWebRtcChannelRef.current = event.channel;
      updateNorthStarLiveDiagnostics({
        phase: "desktop_data_channel_received",
        dataChannelState: event.channel.readyState,
      });
      event.channel.onopen = () => {
        setMessage("North Star live call channel connected.");
        updateNorthStarLiveDiagnostics({
          phase: "desktop_data_channel_open",
          dataChannelState: event.channel.readyState,
          issue: "",
        });
        void flushNorthStarPendingChannelMessages(event.channel).catch(() => undefined);
      };
      event.channel.onmessage = (messageEvent) => {
        try {
          const payload = JSON.parse(String(messageEvent.data)) as
            | { type: "live_turn"; requestId: string; audioBase64: string }
            | { type: "live_turn_chunk"; requestId: string; index: number; total: number; audioSlice: string }
            | { type: "live_speech_start"; requestId: string; sampleRate?: number; audioFormat?: string }
            | { type: "live_speech_frame"; requestId: string; audioBase64: string; sampleRate?: number; audioFormat?: string }
            | { type: "live_speech_end"; requestId: string }
            | { type: "live_opening_request"; openerId: string; text: string }
            | { type: string };
          if (payload.type === "live_opening_request") {
            const openerId = "openerId" in payload ? payload.openerId : "";
            const text = "text" in payload ? payload.text.trim() : "";
            if (!openerId || !text) {
              return;
            }
            void ensureNorthStarAcceptedSessionFor(callId, { silent: true });
            updateNorthStarLiveDiagnostics({
              phase: "desktop_opening_requested",
              issue: "",
            });
            void synthesizeNorthStarOpening(text)
              .then((result) => {
                if (event.channel.readyState !== "open") {
                  return;
                }
                updateNorthStarLiveDiagnostics({
                  phase: "desktop_opening_started",
                  issue: "",
                });
                void sendChunkedNorthStarOpening(event.channel, openerId, {
                  text: result.text,
                  audioBase64: result.audioBase64,
                }).catch(() => {
                  if (event.channel.readyState !== "open") {
                    return;
                  }
                  updateNorthStarLiveDiagnostics({
                    phase: "desktop_opening_failed",
                    issue: "Desktop could not send the opening line over the live channel.",
                  });
                });
              })
              .catch(() => {
                if (event.channel.readyState !== "open") {
                  return;
                }
                updateNorthStarLiveDiagnostics({
                  phase: "desktop_opening_failed",
                  issue: "Desktop could not synthesize the opening line.",
                });
                void sendNorthStarChannelJson(event.channel, {
                  type: "live_opening_error",
                  openerId,
                  message: "NeuralTrainer joined the line, but the opening hello did not play.",
                }).catch(() => undefined);
              });
            return;
          }
          const activeSessionId = activeNorthStarSession?.id;
          if (!activeSessionId) {
            return;
          }
          if (payload.type === "live_speech_start") {
            const speechPayload = payload as { type: "live_speech_start"; requestId: string; sampleRate?: number; audioFormat?: string };
            void handleNorthStarLiveSpeechMessage(speechPayload, activeSessionId).catch(() => {
              if (event.channel.readyState !== "open") {
                return;
              }
              northStarActiveSpeechRequestIdRef.current = null;
              updateNorthStarLiveDiagnostics({
                phase: "desktop_live_speech_failed",
                issue: "Desktop failed while handling live speech frames.",
              });
              void sendNorthStarChannelJson(event.channel, {
                type: "live_reply_error",
                requestId: speechPayload.requestId,
                message: "North Star could not process that spoken turn live.",
              }).catch(() => undefined);
            });
            return;
          }
          if (payload.type === "live_speech_frame") {
            const speechPayload = payload as { type: "live_speech_frame"; requestId: string; audioBase64: string; sampleRate?: number; audioFormat?: string };
            void handleNorthStarLiveSpeechMessage(speechPayload, activeSessionId).catch(() => {
              if (event.channel.readyState !== "open") {
                return;
              }
              northStarActiveSpeechRequestIdRef.current = null;
              updateNorthStarLiveDiagnostics({
                phase: "desktop_live_speech_failed",
                issue: "Desktop failed while handling live speech frames.",
              });
              void sendNorthStarChannelJson(event.channel, {
                type: "live_reply_error",
                requestId: speechPayload.requestId,
                message: "North Star could not process that spoken turn live.",
              }).catch(() => undefined);
            });
            return;
          }
          if (payload.type === "live_speech_end") {
            const speechPayload = payload as { type: "live_speech_end"; requestId: string };
            void handleNorthStarLiveSpeechMessage(speechPayload, activeSessionId).catch(() => {
              if (event.channel.readyState !== "open") {
                return;
              }
              northStarActiveSpeechRequestIdRef.current = null;
              updateNorthStarLiveDiagnostics({
                phase: "desktop_live_speech_failed",
                issue: "Desktop failed while handling live speech frames.",
              });
              void sendNorthStarChannelJson(event.channel, {
                type: "live_reply_error",
                requestId: speechPayload.requestId,
                message: "North Star could not process that spoken turn live.",
              }).catch(() => undefined);
            });
            return;
          }
          if (payload.type === "live_turn_chunk") {
            const requestId = "requestId" in payload ? payload.requestId : "";
            const index = "index" in payload ? payload.index : -1;
            const total = "total" in payload ? payload.total : 0;
            const audioSlice = "audioSlice" in payload ? payload.audioSlice : "";
            if (!requestId || index < 0 || total <= 0 || !audioSlice) {
              return;
            }
            setNorthStarLiveTurnTransportStats((current) => ({
              liveTurnsReceived: current.liveTurnsReceived + (index === 0 ? 1 : 0),
              liveTurnChunksReceived: current.liveTurnChunksReceived + 1,
              lastLiveTurnRequestId: requestId,
            }));
            const chunks = northStarLiveTurnChunksRef.current.get(requestId) ?? new Array(total).fill("");
            chunks[index] = audioSlice;
            northStarLiveTurnChunksRef.current.set(requestId, chunks);
            if (chunks.filter(Boolean).length !== total) {
              return;
            }
            northStarLiveTurnChunksRef.current.delete(requestId);
            const mergedAudioBase64 = chunks.join("");
          void startNorthStarLiveTurnStream(activeSessionId, mergedAudioBase64, requestId)
            .catch(() => {
                if (event.channel.readyState !== "open") {
                  return;
                }
                updateNorthStarLiveDiagnostics({
                  phase: "desktop_live_turn_failed",
                  issue: "Desktop failed while processing a chunked live turn.",
                });
                void sendNorthStarChannelJson(event.channel, {
                  type: "live_reply_error",
                  requestId,
                  message: "North Star could not process that spoken turn live.",
                }).catch(() => undefined);
              });
            return;
          }

          if (payload.type !== "live_turn") {
            return;
          }
          const audioBase64 = "audioBase64" in payload ? payload.audioBase64 : "";
          const requestId = "requestId" in payload ? payload.requestId : "";
          if (!audioBase64 || !requestId) {
            return;
          }
          setNorthStarLiveTurnTransportStats((current) => ({
            liveTurnsReceived: current.liveTurnsReceived + 1,
            liveTurnChunksReceived: current.liveTurnChunksReceived,
            lastLiveTurnRequestId: requestId,
          }));
          void startNorthStarLiveTurnStream(activeSessionId, audioBase64, requestId)
            .catch(() => {
              if (event.channel.readyState !== "open") {
                return;
              }
              updateNorthStarLiveDiagnostics({
                phase: "desktop_live_turn_failed",
                issue: "Desktop failed while processing a direct live turn.",
              });
              void sendNorthStarChannelJson(event.channel, {
                type: "live_reply_error",
                requestId,
                message: "North Star could not process that spoken turn live.",
              }).catch(() => undefined);
            });
        } catch {
          return;
        }
      };
      event.channel.onclose = () => {
        if (northStarWebRtcChannelRef.current === event.channel) {
          northStarWebRtcChannelRef.current = null;
        }
        const mediaStillStable = hasStableNorthStarLiveMedia(peer, northStarIncomingMediaStreamRef.current);
        updateNorthStarLiveDiagnostics({
          phase: mediaStillStable ? "desktop_data_channel_closed_media_still_live" : "desktop_data_channel_closed",
          dataChannelState: "closed",
          issue: mediaStillStable ? "" : "Desktop data channel closed before the live path completed.",
        });
        if (mediaStillStable && northStarWebRtcCallIdRef.current === callId) {
          if (northStarLiveDataChannelRecoveryTimerRef.current !== null) {
            window.clearTimeout(northStarLiveDataChannelRecoveryTimerRef.current);
          }
          northStarLiveDataChannelRecoveryTimerRef.current = window.setTimeout(() => {
            northStarLiveDataChannelRecoveryTimerRef.current = null;
            void sendNorthStarWebRtcSignal(callId, "reconnect_request", JSON.stringify({
              requested_at: new Date().toISOString(),
              reason: "desktop_data_channel_closed_media_still_live",
            })).catch(() => undefined);
          }, 700);
        }
      };
      event.channel.onerror = () => {
        updateNorthStarLiveDiagnostics({
          phase: "desktop_data_channel_error",
          dataChannelState: event.channel.readyState,
          issue: "Desktop data channel reported an error.",
        });
      };
    };
    peer.onconnectionstatechange = () => {
      if (northStarWebRtcCallIdRef.current !== callId) {
        return;
      }
      const mediaStillStable = hasStableNorthStarLiveMedia(peer, northStarIncomingMediaStreamRef.current);
      updateNorthStarLiveDiagnostics({
        phase: "desktop_connection_state_changed",
        connectionState: peer.connectionState,
        issue:
          (
            peer.connectionState === "failed"
            || peer.connectionState === "disconnected"
          ) && !mediaStillStable
            ? "Desktop peer connection dropped before the live call was stable."
            : "",
      });
      if (peer.connectionState === "connected") {
        setMessage("North Star live call channel connected.");
      } else if ((peer.connectionState === "failed" || peer.connectionState === "disconnected") && !mediaStillStable) {
        setMessage("North Star live channel dropped back to fallback mode.");
      }
    };
    peer.ontrack = (event) => {
      if (!event.streams[0]) {
        return;
      }
      northStarIncomingReceiverRef.current = event.receiver;
      northStarIncomingTrackRef.current = event.track;
      northStarIncomingMediaStreamRef.current = event.streams[0];
      setNorthStarRemoteTrackStats({
        trackMuted: event.track.muted,
        trackEnabled: event.track.enabled,
        trackReadyState: event.track.readyState,
        bytesReceived: 0,
        packetsReceived: 0,
        audioLevel: null,
      });
      event.track.onmute = () => {
        setNorthStarRemoteTrackStats((current) => ({
          ...current,
          trackMuted: event.track.muted,
          trackEnabled: event.track.enabled,
          trackReadyState: event.track.readyState,
        }));
      };
      event.track.onunmute = () => {
        setNorthStarRemoteTrackStats((current) => ({
          ...current,
          trackMuted: event.track.muted,
          trackEnabled: event.track.enabled,
          trackReadyState: event.track.readyState,
        }));
      };
      event.track.onended = () => {
        setNorthStarRemoteTrackStats((current) => ({
          ...current,
          trackMuted: event.track.muted,
          trackEnabled: event.track.enabled,
          trackReadyState: event.track.readyState,
        }));
      };
      startNorthStarIncomingTrackLoop(event.streams[0]);
      setMessage("North Star live microphone track connected.");
      updateNorthStarLiveDiagnostics({
        phase: "desktop_remote_track_received",
        remoteTrackState: "received",
      });
    };
  }

  async function handleNorthStarDesktopSignal(callId: string, signal: NorthStarWebRtcSignal) {
    if (processedNorthStarSignalIdsRef.current.has(signal.signalId)) {
      return;
    }
    processedNorthStarSignalIdsRef.current.add(signal.signalId);

    if (signal.signalKind === "offer") {
      void ensureNorthStarAcceptedSessionFor(callId, { silent: true });
      teardownNorthStarWebRtc({
        resetProcessedSignals: false,
        clearPendingOutboundMessages: false,
      });
      const peer = new RTCPeerConnection(await getNorthStarPeerConfig());
      attachNorthStarDesktopPeer(callId, peer);
      northStarWebRtcPeerRef.current = peer;
      await peer.setRemoteDescription(JSON.parse(signal.payloadJson) as RTCSessionDescriptionInit);
      updateNorthStarLiveDiagnostics({
        phase: "desktop_offer_applied",
        lastSignal: "offer_applied",
        signalingState: peer.signalingState,
      });
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      await waitForNorthStarIceGathering(peer);
      if (peer.localDescription) {
        await sendNorthStarWebRtcSignal(callId, "answer", JSON.stringify(peer.localDescription));
        updateNorthStarLiveDiagnostics({
          phase: "desktop_answer_sent",
          lastSignal: "answer_sent",
          signalingState: peer.signalingState,
          iceGatheringState: peer.iceGatheringState,
        });
      }
      return;
    }

    if (signal.signalKind === "ice_candidate") {
      const peer = northStarWebRtcPeerRef.current;
      if (!peer) {
        updateNorthStarLiveDiagnostics({
          phase: "desktop_ice_candidate_skipped",
          lastSignal: "ice_candidate_received_without_peer",
          issue: "Desktop received an ICE candidate before the peer was ready.",
        });
        return;
      }
      await peer.addIceCandidate(JSON.parse(signal.payloadJson) as RTCIceCandidateInit);
      const parsedCandidate = JSON.parse(signal.payloadJson) as RTCIceCandidateInit;
      updateNorthStarLiveDiagnostics({
        phase: "desktop_ice_candidate_applied",
        lastSignal: "ice_candidate_applied",
        iceConnectionState: peer.iceConnectionState,
        remoteIceCandidates: northStarLiveDiagnostics.remoteIceCandidates + 1,
        remoteCandidateKinds: mergeCandidateKindList(
          northStarLiveDiagnostics.remoteCandidateKinds,
          detectCandidateKind(parsedCandidate.candidate ?? ""),
        ),
      });
    }

  if (signal.signalKind === "reconnect_request") {
      updateNorthStarLiveDiagnostics({
        phase: "desktop_reconnect_request_received",
        lastSignal: "reconnect_request_received",
        issue: "",
      });
    }
  }

  function commitNorthStarSnapshot(snapshot: NorthStarSnapshot, options?: { forceConnections?: boolean }) {
    northStarSnapshotCacheRef.current = snapshot;
    const runtimeProjection = projectNorthStarRuntimeSnapshot(snapshot);
    setNorthStarRuntimeSnapshot((current) => (sameNorthStarRuntimeProjection(current, runtimeProjection) ? current : runtimeProjection));
    if (options?.forceConnections || northStarConnectionsVisible) {
      const connectionsProjection = projectNorthStarConnectionsSnapshot(snapshot);
      setNorthStarConnectionsSnapshot((current) => (sameNorthStarConnectionsProjection(current, connectionsProjection) ? current : connectionsProjection));
    }
  }

  function commitNorthStarRuntimeSnapshot(snapshot: NorthStarRuntimeSnapshot) {
    const runtimeProjection = projectNorthStarRuntimeState(snapshot);
    setNorthStarRuntimeSnapshot((current) => (sameNorthStarRuntimeProjection(current, runtimeProjection) ? current : runtimeProjection));
  }

  async function refreshDiagnostics() { setDiagnostics(await getDiagnostics()); }
  async function refreshNorthStarSnapshot() { commitNorthStarSnapshot(await getNorthStarSnapshot()); }
  async function refreshNorthStarRuntimeSnapshot() { commitNorthStarRuntimeSnapshot(await getNorthStarRuntimeSnapshot()); }
  async function refreshVoiceSnapshot() { setVoiceSnapshot(await getVoiceSnapshot()); }
  async function refreshSpeechStreamSnapshot() { setSpeechStream(await getSpeechStreamSnapshot()); }
  async function refreshSnapshot() { setSnapshot(await getPhaseOneSnapshot()); }
  async function refreshPassiveSnapshot() { setPassiveSnapshot(await getPassiveContextSnapshot()); }
  async function refreshPhaseThreeSnapshot() { setPhaseThreeSnapshot(await getPhaseThreeSnapshot()); }
  async function refreshCallSessionSnapshot() { setCallSessionSnapshot(await getCallSessionSnapshot()); }
  async function refreshDecisionSnapshot() { setDecisionSnapshot(await getDecisionSnapshot()); }
  async function refreshRealityCheckSnapshot() { setRealityCheckSnapshot(await getMvpRealityCheckSnapshot()); }
  async function refreshMemoryGrowthSnapshot() { setMemoryGrowthSnapshot(await getMemoryGrowthSnapshot()); }

  useEffect(() => {
    let active = true;
    async function bootstrap() {
      try {
        const [loadedSettings, loadedDiagnostics, loadedNorthStarSnapshot, loadedVoiceSnapshot, loadedSpeechStream, loadedSnapshot, loadedPassiveSnapshot, loadedPhaseThreeSnapshot, loadedDecisionSnapshot, loadedCallSessionSnapshot, loadedRealityCheckSnapshot, loadedSimulationScenarios, loadedMemoryGrowthSnapshot] = await Promise.all([
          loadSettings(),
          getDiagnostics(),
          getNorthStarSnapshot(),
          getVoiceSnapshot(),
          getSpeechStreamSnapshot(),
          getPhaseOneSnapshot(),
          getPassiveContextSnapshot(),
          getPhaseThreeSnapshot(),
          getDecisionSnapshot(),
          getCallSessionSnapshot(),
          getMvpRealityCheckSnapshot(),
          listSimulationScenarios(),
          getMemoryGrowthSnapshot(),
        ]);
        if (!active) return;
        setSettings(withPromptDefaults(loadedSettings));
        setDiagnostics(loadedDiagnostics);
        commitNorthStarSnapshot(loadedNorthStarSnapshot);
        setVoiceSnapshot(loadedVoiceSnapshot);
        setSpeechStream(loadedSpeechStream);
        setSnapshot(loadedSnapshot);
        setPassiveSnapshot(loadedPassiveSnapshot);
        setPhaseThreeSnapshot(loadedPhaseThreeSnapshot);
        setDecisionSnapshot(loadedDecisionSnapshot);
        setCallSessionSnapshot(loadedCallSessionSnapshot);
        setRealityCheckSnapshot(loadedRealityCheckSnapshot);
        setSimulationScenarios(loadedSimulationScenarios);
        setMemoryGrowthSnapshot(loadedMemoryGrowthSnapshot);
      } catch (caught) {
        if (!active) return;
        setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        if (active) setLoading(false);
      }
    }
    void bootstrap();
    return () => { active = false; };
  }, []);

  const speechStreamNeedsHotPolling =
    Boolean(speechStream?.active)
    && (speechStream?.status === "starting" || speechStream?.status === "listening");

  useEffect(() => {
    if (!speechStreamNeedsHotPolling) return;
    const timer = window.setInterval(() => {
      void refreshSpeechStreamSnapshot();
    }, 250);
    return () => window.clearInterval(timer);
  }, [speechStreamNeedsHotPolling]);

  useEffect(() => {
    if (!northStarRuntimeSnapshot?.configured) return;
    const timer = window.setInterval(() => {
      void refreshNorthStarRuntimeSnapshot();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [northStarRuntimeSnapshot?.configured]);

  useEffect(() => {
    if (!northStarDesktopBound || busyPanel === "northStarHeartbeat") return;
    const timer = window.setInterval(() => {
      void sendNorthStarHeartbeat()
        .then((snapshot) => commitNorthStarSnapshot(snapshot))
        .catch(() => undefined);
    }, 15000);
    return () => window.clearInterval(timer);
  }, [northStarDesktopBound, busyPanel]);

  useEffect(() => {
    if (!northStarConnectionsVisible || !northStarSnapshotCacheRef.current) return;
    const connectionsProjection = projectNorthStarConnectionsSnapshot(northStarSnapshotCacheRef.current);
    setNorthStarConnectionsSnapshot((current) => (sameNorthStarConnectionsProjection(current, connectionsProjection) ? current : connectionsProjection));
  }, [northStarConnectionsVisible]);

  useEffect(() => {
    if (
      !latestAcceptedNorthStarCall
      || (activeNorthStarSession && activeNorthStarRemoteCallId === latestAcceptedNorthStarCall.callId)
      || (!!callSessionSnapshot?.activeSession && !activeNorthStarSession)
      || busyPanel === "northStarAcceptedCall"
      || busyPanel === "callStart"
      || busyPanel === "callEnd"
    ) {
      return;
    }
    if (activeNorthStarSession && activeNorthStarRemoteCallId !== latestAcceptedNorthStarCall.callId) {
      void (async () => {
        await handleEndCallSession("interrupted");
        await ensureNorthStarAcceptedSessionFor(latestAcceptedNorthStarCall.callId);
      })();
      return;
    }
    if (!callSessionSnapshot?.activeSession) {
      void ensureNorthStarAcceptedSessionFor(latestAcceptedNorthStarCall.callId, { silent: true });
    }
  }, [latestAcceptedNorthStarCall?.callId, activeNorthStarRemoteCallId, activeNorthStarSession?.id, callSessionSnapshot?.activeSession?.id, busyPanel]);

  useEffect(() => {
    if (!activeNorthStarSession) {
      missingAcceptedNorthStarPollsRef.current = 0;
      teardownNorthStarWebRtc();
      return;
    }
    if (activeNorthStarRemoteCall?.status === "accepted") {
      missingAcceptedNorthStarPollsRef.current = 0;
      return;
    }
    if (!northStarRuntimeSnapshot?.configured || busyPanel === "callEnd" || busyPanel === "northStarAcceptedCall") {
      return;
    }
    if (activeNorthStarRemoteCall && activeNorthStarRemoteCall.status !== "accepted") {
      missingAcceptedNorthStarPollsRef.current = 0;
      const outcome =
        activeNorthStarRemoteCall.status === "missed"
          ? "missed"
          : activeNorthStarRemoteCall.status === "declined"
            ? "interrupted"
            : "completed";
      void handleEndCallSession(outcome);
      return;
    }
    missingAcceptedNorthStarPollsRef.current += 1;
    if (missingAcceptedNorthStarPollsRef.current < 2) {
      return;
    }
    missingAcceptedNorthStarPollsRef.current = 0;
    void handleEndCallSession("completed");
  }, [activeNorthStarSession?.id, activeNorthStarRemoteCall?.callId, activeNorthStarRemoteCall?.status, northStarRuntimeSnapshot?.configured, busyPanel]);

  useEffect(() => {
    const targetCallId = activeNorthStarRemoteCallId ?? pendingAcceptedNorthStarCallId;
    if (!targetCallId) {
      teardownNorthStarWebRtc();
      return;
    }
    const stableCallId = targetCallId;

    let cancelled = false;
    void ensureNorthStarAcceptedSessionFor(stableCallId, { silent: true });
    if (northStarWebRtcCallIdRef.current !== stableCallId) {
      teardownNorthStarWebRtc();
      northStarWebRtcCallIdRef.current = stableCallId;
    }

    async function pollSignals() {
      try {
        const signals = await pullNorthStarWebRtcSignals(stableCallId);
        if (cancelled || northStarWebRtcCallIdRef.current !== stableCallId) {
          return;
        }
        for (const signal of signals) {
          await handleNorthStarDesktopSignal(stableCallId, signal);
        }
      } catch {
        // Keep the existing turn-upload call path alive while live signaling is still being added.
      }
    }

    void pollSignals();
    const timer = window.setInterval(() => {
      void pollSignals();
    }, 1500);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeNorthStarSession?.id, activeNorthStarRemoteCallId, pendingAcceptedNorthStarCallId]);

  useEffect(() => {
    if (
      !activeNorthStarSession
      || northStarLiveChannelReady
      || busyPanel === "northStarTurn"
      || busyPanel === "speechStreamStart"
      || busyPanel === "speechStreamStop"
    ) {
      return;
    }
    const timer = window.setInterval(() => {
      void handleProcessNorthStarTurn();
    }, 1800);
    return () => window.clearInterval(timer);
  }, [
    callSessionSnapshot?.activeSession?.id,
    callSessionSnapshot?.activeSession?.handoffKind,
    callSessionSnapshot?.activeSession?.sessionState,
    northStarLiveChannelReady,
    busyPanel,
  ]);

  useEffect(() => {
    if (!activeNorthStarSession || !northStarIncomingReceiverRef.current) {
      setNorthStarRemoteTrackStats(defaultNorthStarRemoteTrackStats);
      return;
    }

    let cancelled = false;
    const timer = window.setInterval(() => {
      const receiver = northStarIncomingReceiverRef.current;
      const track = northStarIncomingTrackRef.current;
      if (!receiver || !track) {
        return;
      }
      void receiver.getStats().then((report) => {
        if (cancelled) {
          return;
        }
        let bytesReceived = 0;
        let packetsReceived = 0;
        let audioLevel: number | null = null;
        report.forEach((entry) => {
          if (entry.type === "inbound-rtp" && "kind" in entry && entry.kind === "audio") {
            bytesReceived = typeof entry.bytesReceived === "number" ? entry.bytesReceived : bytesReceived;
            packetsReceived = typeof entry.packetsReceived === "number" ? entry.packetsReceived : packetsReceived;
          }
          if (entry.type === "track" && "kind" in entry && entry.kind === "audio" && typeof entry.audioLevel === "number") {
            audioLevel = entry.audioLevel;
          }
        });
        setNorthStarRemoteTrackStats({
          trackMuted: track.muted,
          trackEnabled: track.enabled,
          trackReadyState: track.readyState,
          bytesReceived,
          packetsReceived,
          audioLevel,
        });
      }).catch(() => undefined);
    }, 1000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeNorthStarSession?.id, northStarLiveDiagnostics.remoteTrackState]);

  useEffect(() => {
    if (callSessionSnapshot?.activeSession) {
      setCallSessionNotes(callSessionSnapshot.activeSession.notes ?? "");
      setCallTranscriptSummary(callSessionSnapshot.activeSession.transcriptSummary ?? "");
    }
  }, [callSessionSnapshot?.activeSession?.id]);

  useEffect(() => {
    const activeSession = callSessionSnapshot?.activeSession;
    if (!activeSession || activeSession.handoffKind !== "north_star_companion") {
      return;
    }
    const latestTranscript =
      [...callSessionSnapshot.activeSessionTurns]
        .reverse()
        .find((turn) => turn.transcriptText.trim().length > 0)
        ?.transcriptText ?? "";
    if (latestTranscript) {
      setCallTranscriptSummary(latestTranscript);
    }
  }, [callSessionSnapshot?.activeSession?.id, callSessionSnapshot?.activeSessionTurns]);

  useEffect(() => {
    let active = true;
    async function loadSelectedCallTurns() {
      if (!selectedCallSession?.id) {
        if (active) setSelectedCallTurns([]);
        return;
      }
      try {
        const turns = await getCallTurnsForSession(selectedCallSession.id);
        if (active) setSelectedCallTurns(turns);
      } catch {
        if (active) setSelectedCallTurns([]);
      }
    }
    void loadSelectedCallTurns();
    return () => { active = false; };
  }, [selectedCallSession?.id]);

  async function handleSettingsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const rows = await saveSettings(settings);
      setSavedRows(rows);
      setMessage("Settings saved locally.");
      await Promise.all([refreshDiagnostics(), refreshNorthStarSnapshot(), refreshVoiceSnapshot(), refreshDecisionSnapshot(), refreshRealityCheckSnapshot()]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  }

  function handleResetPromptField(key: PromptSettingKey) {
    setSettings((current) => ({ ...current, [key]: defaultSettings[key] }));
  }

  async function handleCreateNorthStarSession() {
    setBusyPanel("northStarSession");
    setError("");
    setMessage("");
    try {
      const snapshot = await createNorthStarSession();
      commitNorthStarSnapshot(snapshot, { forceConnections: true });
      const loaded = await loadSettings();
      setSettings(withPromptDefaults(loaded));
      setMessage(snapshot.detail);
      await refreshDiagnostics();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusyPanel(null);
    }
  }

  async function handleBindNorthStarDesktop() {
    setBusyPanel("northStarBind");
    setError("");
    setMessage("");
    try {
      const snapshot = await bindNorthStarDesktop();
      commitNorthStarSnapshot(snapshot, { forceConnections: true });
      const loaded = await loadSettings();
      setSettings(withPromptDefaults(loaded));
      setMessage(snapshot.detail);
      await refreshDiagnostics();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusyPanel(null);
    }
  }

  async function handleNorthStarQuickLink() {
    setBusyPanel("northStarLink");
    setError("");
    setMessage("");
    try {
      let snapshot = northStarSnapshotCacheRef.current;
      if (!snapshot?.sessionReady) {
        snapshot = await createNorthStarSession();
        commitNorthStarSnapshot(snapshot, { forceConnections: true });
      }
      if (!snapshot?.desktopBound) {
        snapshot = await bindNorthStarDesktop();
        commitNorthStarSnapshot(snapshot, { forceConnections: true });
      }
      snapshot = await sendNorthStarHeartbeat();
      commitNorthStarSnapshot(snapshot, { forceConnections: true });
      const loaded = await loadSettings();
      setSettings(withPromptDefaults(loaded));
      setMessage("North Star is linked and ready for calls.");
      await refreshDiagnostics();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusyPanel(null);
    }
  }

  async function handleNorthStarHeartbeat() {
    setBusyPanel("northStarHeartbeat");
    setError("");
    setMessage("");
    try {
      const snapshot = await sendNorthStarHeartbeat();
      commitNorthStarSnapshot(snapshot, { forceConnections: true });
      setMessage(snapshot.detail);
      await refreshDiagnostics();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusyPanel(null);
    }
  }

  async function handleNorthStarMessage() {
    setBusyPanel("northStarMessage");
    setError("");
    setMessage("");
    try {
      const snapshot = await sendNorthStarMessage(northStarMessageText);
      commitNorthStarSnapshot(snapshot, { forceConnections: true });
      setNorthStarMessageText("");
      setMessage(snapshot.detail);
      await refreshDiagnostics();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusyPanel(null);
    }
  }

  async function handleNorthStarPullLocations() {
    setBusyPanel("northStarPull");
    setError("");
    setMessage("");
    try {
      const snapshot = await pullNorthStarLocationEvents();
      commitNorthStarSnapshot(snapshot, { forceConnections: true });
      setMessage(snapshot.detail);
      await Promise.all([refreshDiagnostics(), refreshPassiveSnapshot(), refreshPhaseThreeSnapshot(), refreshDecisionSnapshot()]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusyPanel(null);
    }
  }

  async function handleNorthStarCallRequest() {
    setBusyPanel("northStarCall");
    setError("");
    setMessage("");
    try {
      const snapshot = await sendNorthStarCallRequest(northStarCallNote);
      commitNorthStarSnapshot(snapshot, { forceConnections: true });
      setNorthStarCallNote("");
      setMessage(snapshot.detail);
      await refreshDiagnostics();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusyPanel(null);
    }
  }

  async function handleCallNorthStar() {
    setBusyPanel("northStarCall");
    setError("");
    setMessage("");
    try {
      if (!northStarReadyForCalls) {
        await handleNorthStarQuickLink();
      }
      const note = northStarCallNote.trim() || defaultNorthStarOutreachNote();
      const snapshot = await sendNorthStarCallRequest(note);
      commitNorthStarSnapshot(snapshot, { forceConnections: true });
      setNorthStarCallNote("");
      setMessage("Calling North Star now. Accept on the phone to open the line.");
      await refreshDiagnostics();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusyPanel(null);
    }
  }

  async function handleImportNorthStarCallReviews() {
    setBusyPanel("northStarImportReviews");
    setError("");
    setMessage("");
    try {
      const snapshot = await importNorthStarCallReviews();
      commitNorthStarSnapshot(snapshot, { forceConnections: true });
      setMessage(snapshot.detail);
      await Promise.all([refreshDiagnostics(), refreshMemoryGrowthSnapshot(), refreshSnapshot()]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusyPanel(null);
    }
  }

  async function handlePlaceSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusyPanel("place");
    setError("");
    setMessage("");
    try {
      await createPlace(placeForm);
      setPlaceForm(defaultPlace);
      setMessage("Meaningful place added.");
      await Promise.all([refreshSnapshot(), refreshPassiveSnapshot(), refreshPhaseThreeSnapshot(), refreshDiagnostics(), refreshRealityCheckSnapshot()]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusyPanel(null);
    }
  }

  async function handleRuleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusyPanel("rule");
    setError("");
    setMessage("");
    try {
      await createRule(ruleForm);
      setRuleForm(defaultRule);
      setMessage("Boundary rule added.");
      await Promise.all([refreshSnapshot(), refreshPassiveSnapshot(), refreshPhaseThreeSnapshot(), refreshDiagnostics(), refreshRealityCheckSnapshot()]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusyPanel(null);
    }
  }

  async function handleReflectionSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusyPanel("reflection");
    setError("");
    setMessage("");
    try {
      await createReflection(reflectionForm);
      setReflectionForm(defaultReflection);
      setMessage("Reflection captured.");
      await Promise.all([refreshSnapshot(), refreshPhaseThreeSnapshot(), refreshDiagnostics(), refreshRealityCheckSnapshot(), refreshMemoryGrowthSnapshot()]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusyPanel(null);
    }
  }

  async function handleLocationSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusyPanel("location");
    setError("");
    setMessage("");
    try {
      await ingestLocationEvent(locationForm);
      setLocationForm((current) => ({ ...current, occurredAt: new Date().toISOString() }));
      setMessage("Location event ingested.");
      await Promise.all([refreshPassiveSnapshot(), refreshPhaseThreeSnapshot(), refreshDiagnostics(), refreshRealityCheckSnapshot()]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusyPanel(null);
    }
  }

  async function handleDownloadKokoroAssets() {
    setBusyPanel("voiceDownload");
    setError("");
    setMessage("");
    try {
      const snapshot = await downloadKokoroAssets();
      setVoiceSnapshot(snapshot);
      setMessage("Kokoro voice files are ready locally.");
      await refreshDiagnostics();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusyPanel(null);
    }
  }

  async function handleSynthesizeVoicePreview() {
    setBusyPanel("voicePreview");
    setError("");
    setMessage("");
    try {
      await saveSettings(settings);
      const result = await synthesizeVoicePreview();
      setVoicePreview(result);
      setVoicePreviewSrc(`data:audio/wav;base64,${result.audioBase64}`);
      setMessage(`Voice preview created with ${result.voice}.`);
      await Promise.all([refreshVoiceSnapshot(), refreshDiagnostics()]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusyPanel(null);
    }
  }

  async function handlePrepareKokoroRuntime() {
    setBusyPanel("voiceRuntime");
    setError("");
    setMessage("");
    try {
      await saveSettings(settings);
      const snapshot = await prepareKokoroRuntime();
      setVoiceSnapshot(snapshot);
      setMessage("Voice runtime is ready.");
      await refreshDiagnostics();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusyPanel(null);
    }
  }

  async function handleSetupVoice() {
    setBusyPanel("voiceRuntime");
    setError("");
    setMessage("");
    try {
      await saveSettings(settings);
      const downloaded = await downloadKokoroAssets();
      setVoiceSnapshot(downloaded);
      const prepared = await prepareKokoroRuntime();
      setVoiceSnapshot(prepared);
      const speechPrepared = await setupLocalSpeech();
      setVoiceSnapshot(speechPrepared);
      setMessage("Voice setup is complete. Speaking and speech input are both ready.");
      await refreshDiagnostics();
    } catch (caught) {
      try {
        await refreshVoiceSnapshot();
      } catch {
        // Preserve the original setup error if the refresh also fails.
      }
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusyPanel(null);
    }
  }

  async function handleSetupSpeech() {
    setBusyPanel("speechSetup");
    setError("");
    setMessage("");
    try {
      const snapshot = await setupLocalSpeech();
      setVoiceSnapshot(snapshot);
      setMessage("Speech input is ready.");
      await refreshDiagnostics();
    } catch (caught) {
      try {
        await refreshVoiceSnapshot();
      } catch {
        // Preserve the original setup error if the refresh also fails.
      }
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusyPanel(null);
    }
  }

  async function handleClearVoiceAssets() {
    setBusyPanel("voiceCleanup");
    setError("");
    setMessage("");
    try {
      const snapshot = await clearVoiceAssets();
      setVoiceSnapshot(snapshot);
      setVoicePreview(null);
      setVoicePreviewSrc(null);
      setCallTurnResult(null);
      setCallReplyAudioSrc(null);
      setSpeechStream(null);
      setMessage("Voice assets were removed from local storage.");
      await refreshDiagnostics();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusyPanel(null);
    }
  }

  async function handleClearAllLocalData() {
    setBusyPanel("localCleanup");
    setError("");
    setMessage("");
    try {
      await clearAllLocalData();
      setSettings(defaultSettings);
      setSavedRows([]);
      setVoicePreview(null);
      setVoicePreviewSrc(null);
      setCallTurnResult(null);
      setCallReplyAudioSrc(null);
      setSpeechStream(null);
        await Promise.all([
          refreshDiagnostics(),
          refreshNorthStarSnapshot(),
          refreshVoiceSnapshot(),
          refreshSnapshot(),
        refreshPassiveSnapshot(),
        refreshPhaseThreeSnapshot(),
        refreshDecisionSnapshot(),
        refreshCallSessionSnapshot(),
        refreshRealityCheckSnapshot(),
        refreshMemoryGrowthSnapshot(),
      ]);
      setMessage("All local app data and voice assets were cleared.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusyPanel(null);
    }
  }

  async function handleRunDecisions() {
    setBusyPanel("decisions");
    setError("");
    setMessage("");
    try {
      const result = await runMessageDecisions();
      setMessage(`Decision pass complete: ${result.promotedCount} promoted, ${result.suppressedCount} suppressed.`);
      await Promise.all([refreshDecisionSnapshot(), refreshPhaseThreeSnapshot(), refreshCallSessionSnapshot(), refreshDiagnostics(), refreshRealityCheckSnapshot()]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusyPanel(null);
    }
  }

  async function handleRunCallRequestDecisions() {
    setBusyPanel("callDecisions");
    setError("");
    setMessage("");
    try {
      if (!settings.callRequestsEnabled) {
        setMessage("Call requests are turned off. Enable them in Settings > Core settings first.");
        return;
      }
      if (unresolvedMomentCount === 0) {
        setMessage("No unresolved moments are waiting for a call-request pass. Seed a fresh scenario first.");
        return;
      }
      const result = await runCallRequestDecisions();
      if (result.promotedCount === 0) {
        const reason = result.decisions[0]?.reasonSummary ?? "No moments cleared the stricter call-request rules.";
        setMessage(`Call-request pass complete: 0 promoted, ${result.suppressedCount} suppressed. ${reason}`);
      } else {
        setMessage(`Call-request pass complete: ${result.promotedCount} promoted, ${result.suppressedCount} suppressed.`);
      }
      await Promise.all([refreshDecisionSnapshot(), refreshPhaseThreeSnapshot(), refreshCallSessionSnapshot(), refreshDiagnostics(), refreshRealityCheckSnapshot()]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusyPanel(null);
    }
  }

  async function handleRunMemoryGrowth() {
    setBusyPanel("memoryGrowth");
    setError("");
    setMessage("");
    try {
      const previousSnapshot = memoryGrowthSnapshot;
      const nextSnapshot = await runMemoryGrowthPass();
      setMemoryGrowthSnapshot(nextSnapshot);
      const summary = summarizeMemoryGrowth(previousSnapshot, nextSnapshot);
      setMemoryGrowthSummary(summary);
      setMessage(`Memory growth pass complete. ${summary[0]}`);
      await Promise.all([refreshSnapshot(), refreshDiagnostics()]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusyPanel(null);
    }
  }

  async function handleUpdateMemoryItem(payload: UpdateMemoryItemInput) {
    setBusyPanel("memoryReview");
    setError("");
    setMessage("");
    try {
      const previousSnapshot = memoryGrowthSnapshot;
      const nextSnapshot = await updateMemoryItem(payload);
      setMemoryGrowthSnapshot(nextSnapshot);
      const summary = summarizeMemoryGrowth(previousSnapshot, nextSnapshot);
      setMemoryGrowthSummary(summary);
      if (payload.action === "confirm") {
        setMessage("Memory item confirmed and kept.");
      } else if (payload.action === "dismiss") {
        setMessage("Memory item dismissed and archived.");
      } else if (payload.action === "archive") {
        setMessage("Memory item archived.");
      } else {
        setMessage("Memory item moved back into active memory.");
      }
      await Promise.all([refreshSnapshot(), refreshDiagnostics()]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusyPanel(null);
    }
  }

  async function handleStartNorthStarAcceptedCall() {
    if (!pendingAcceptedNorthStarCallId) {
      setError("No accepted North Star call is waiting yet.");
      return;
    }
    await ensureNorthStarAcceptedSessionFor(pendingAcceptedNorthStarCallId);
  }

  async function ensureNorthStarAcceptedSessionFor(callId: string, options?: { silent?: boolean }) {
    if (!callId || pendingAcceptedNorthStarCallId !== callId) {
      return;
    }
    if (activeNorthStarSession && activeNorthStarRemoteCallId === callId) {
      return;
    }
    if (callSessionSnapshot?.activeSession && !activeNorthStarSession) {
      return;
    }
    if (northStarAcceptedSessionStartCallIdRef.current === callId) {
      return;
    }

    const silent = options?.silent ?? false;
    northStarAcceptedSessionStartCallIdRef.current = callId;
    if (!silent) {
      setBusyPanel("northStarAcceptedCall");
      setError("");
      setMessage("");
    }
    setNorthStarTurnStatus(null);
    setCallTurnResult(null);
    setCallReplyAudioSrc(null);
    setCallTranscriptSummary("");
    setCallSessionNotes("");
    setSpeechStream(null);
    try {
      const snapshot = await startNorthStarAcceptedCall();
      setCallSessionSnapshot(snapshot);
      setMessage("Started the accepted North Star companion call.");
      await Promise.all([refreshNorthStarSnapshot(), refreshCallSessionSnapshot(), refreshDiagnostics()]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      northStarAcceptedSessionStartCallIdRef.current = null;
      if (!silent) {
        setBusyPanel(null);
      }
    }
  }

  async function handleProcessNorthStarTurn() {
    if (activeNorthStarRemoteCallId || northStarLiveChannelReady) {
      return;
    }
    setBusyPanel("northStarTurn");
    setError("");
    try {
      const result = await processNextNorthStarCallTurn();
      setNorthStarTurnStatus(result);
      if (result.reply) {
        setCallTurnResult(result.reply);
        setCallReplyAudioSrc(`data:audio/wav;base64,${result.reply.replyAudioBase64}`);
        setCallTranscriptSummary(result.reply.transcriptText);
      }
      if (result.processed) {
        setMessage(result.detail);
        await Promise.all([refreshNorthStarSnapshot(), refreshCallSessionSnapshot(), refreshDiagnostics()]);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusyPanel(null);
    }
  }

  async function handleEndCallSession(outcome: EndCallSessionInput["outcome"]) {
    if (!callSessionSnapshot?.activeSession) {
      setMessage("There is no active call session to end.");
      return;
    }
    setBusyPanel("callEnd");
    setError("");
    setMessage("");
    try {
      const snapshot = await endCallSession({
        sessionId: callSessionSnapshot.activeSession.id,
        outcome,
        transcriptSummary: callTranscriptSummary,
        notes: callSessionNotes,
      });
      setCallSessionSnapshot(snapshot);
      setCallTranscriptSummary("");
      setCallSessionNotes("");
      setCallTurnResult(null);
      setCallReplyAudioSrc(null);
      setSpeechStream(null);
      setMessage(`Call session ended as ${outcome}.`);
      await Promise.all([refreshCallSessionSnapshot(), refreshDecisionSnapshot(), refreshDiagnostics()]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusyPanel(null);
    }
  }

  async function handlePlaceReviewSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reviewPlace) return;
    setBusyPanel("reviewPlace");
    setError("");
    setMessage("");
    try {
      await updatePlace(reviewPlace);
      setMessage("Place review updated.");
      await Promise.all([refreshSnapshot(), refreshPhaseThreeSnapshot(), refreshDiagnostics(), refreshRealityCheckSnapshot()]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusyPanel(null);
    }
  }

  async function handleRuleReviewSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reviewRule) return;
    setBusyPanel("reviewRule");
    setError("");
    setMessage("");
    try {
      await updateRule(reviewRule);
      setMessage("Boundary review updated.");
      await Promise.all([refreshSnapshot(), refreshDiagnostics(), refreshRealityCheckSnapshot()]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusyPanel(null);
    }
  }

  async function handleSeedRealityCheck() {
    setBusyPanel("realitySeed");
    setError("");
    setMessage("");
    try {
      const snapshot = await seedMvpRealityCheckScenario();
      setRealityCheckSnapshot(snapshot);
      await Promise.all([
        refreshSnapshot(),
        refreshPassiveSnapshot(),
        refreshPhaseThreeSnapshot(),
        refreshDecisionSnapshot(),
        refreshCallSessionSnapshot(),
        refreshDiagnostics(),
      ]);
      setMessage("Controlled MVP reality-check scenario seeded.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusyPanel(null);
    }
  }

  async function handleRunSimulation() {
    setBusyPanel("simulationRun");
    setError("");
    setMessage("");
    try {
      const result = await runSimulationScenario({
        scenarioKey: selectedSimulationKey,
        clearExisting: true,
      });
      setSimulationResult(result);
      await Promise.all([
        refreshSnapshot(),
        refreshPassiveSnapshot(),
        refreshPhaseThreeSnapshot(),
        refreshDecisionSnapshot(),
        refreshCallSessionSnapshot(),
        refreshRealityCheckSnapshot(),
        refreshDiagnostics(),
      ]);
      setMessage(`Simulation complete: ${result.scenarioLabel}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusyPanel(null);
    }
  }

  async function handleResetRuntimeData() {
    setBusyPanel("runtimeReset");
    setError("");
    setMessage("");
    try {
      await resetRuntimeData();
      setSimulationResult(null);
      await Promise.all([
        refreshSnapshot(),
        refreshPassiveSnapshot(),
        refreshPhaseThreeSnapshot(),
        refreshDecisionSnapshot(),
        refreshCallSessionSnapshot(),
        refreshRealityCheckSnapshot(),
        refreshDiagnostics(),
      ]);
      setMessage("Runtime data cleared. Settings were kept.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusyPanel(null);
    }
  }

  async function handleRunSimulationSuite() {
    setBusyPanel("simulationSuite");
    setError("");
    setMessage("");
    try {
      const result = await runAutomatedSimulationSuite();
      setSimulationSuiteResult(result);
      setMessage(result.summary);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusyPanel(null);
    }
  }

  function renderSectionTabs<T extends string>(
    items: Array<{ id: T; label: string }>,
    current: T,
    onChange: (next: T) => void,
  ) {
    return (
      <div className="section-tabs" role="tablist">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`section-tab ${current === item.id ? "active" : ""}`}
            onClick={() => onChange(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
    );
  }

  function renderSettingsTab() {
    return (
      <div className="content-stack">
        {renderSectionTabs([
          { id: "core", label: "Core settings" },
          { id: "connections", label: "Connections" },
          { id: "voice", label: "Voice" },
          { id: "diagnostics", label: "Diagnostics" },
        ], settingsSection, setSettingsSection)}

        {(settingsSection === "core" || settingsSection === "connections" || settingsSection === "voice") ? (
          <section className="panel">
            <form className="settings-form" onSubmit={handleSettingsSubmit}>
              {settingsSection === "core" ? (
                <>
                  <div className="panel-header">
                    <h2>Core settings</h2>
                    <p>Timezone, quiet hours, and decision posture.</p>
                  </div>
                  <label><span>Timezone</span><input value={settings.timezone} onChange={(event) => setSettings((current) => ({ ...current, timezone: event.target.value }))} /></label>
                  <div className="split">
                    <label><span>Likely sleep starts</span><input type="time" value={settings.sleepWindowStart} onChange={(event) => setSettings((current) => ({ ...current, sleepWindowStart: event.target.value }))} /></label>
                    <label><span>Likely sleep ends</span><input type="time" value={settings.sleepWindowEnd} onChange={(event) => setSettings((current) => ({ ...current, sleepWindowEnd: event.target.value }))} /></label>
                  </div>
                  <label>
                    <span>Outreach posture</span>
                    <select value={settings.outreachPreference} onChange={(event) => setSettings((current) => ({ ...current, outreachPreference: event.target.value as AppSettings["outreachPreference"] }))}>
                      <option value="quiet">Quiet</option>
                      <option value="balanced">Balanced</option>
                      <option value="test">Test mode</option>
                    </select>
                  </label>
                  <label className="checkbox"><input type="checkbox" checked={settings.emergencyBypassEnabled} onChange={(event) => setSettings((current) => ({ ...current, emergencyBypassEnabled: event.target.checked }))} /><span>Emergency can override quiet hours</span></label>
                  <div className="split">
                    <label><span>Message cooldown minutes</span><input type="number" min={0} value={settings.messageCooldownMinutes} onChange={(event) => setSettings((current) => ({ ...current, messageCooldownMinutes: Number(event.target.value) }))} /></label>
                    <label><span>Medium confidence threshold</span><input type="number" min={0} max={1} step={0.05} value={settings.mediumConfidenceThreshold} onChange={(event) => setSettings((current) => ({ ...current, mediumConfidenceThreshold: Number(event.target.value) }))} /></label>
                  </div>
                  <label className="checkbox"><input type="checkbox" checked={settings.callRequestsEnabled} onChange={(event) => setSettings((current) => ({ ...current, callRequestsEnabled: event.target.checked }))} /><span>Allow call requests</span></label>
                  <div className="split">
                    <label><span>Call cooldown minutes</span><input type="number" min={0} value={settings.callCooldownMinutes} onChange={(event) => setSettings((current) => ({ ...current, callCooldownMinutes: Number(event.target.value) }))} /></label>
                    <label><span>Call confidence threshold</span><input type="number" min={0} max={1} step={0.05} value={settings.callConfidenceThreshold} onChange={(event) => setSettings((current) => ({ ...current, callConfidenceThreshold: Number(event.target.value) }))} /></label>
                  </div>
                </>
                ) : settingsSection === "connections" ? (
                  <>
                    <div className="panel-header">
                      <h2>Connections</h2>
                      <p>North Star should feel like one companion link, not a control room.</p>
                    </div>
                    <div className="saved-state">
                      <h3>North Star companion</h3>
                      <p>Link once, then call North Star with a single button while the desktop keeps the line alive automatically.</p>
                      {northStarConnectionsSnapshot ? (
                        <>
                          <dl className="facts">
                            <div><dt>Link</dt><dd>{northStarReadyForCalls ? "Ready" : "Needs setup"}</dd></div>
                            <div><dt>Companion</dt><dd>{northStarConnectionsSnapshot.displayName || "North Star"}</dd></div>
                            <div><dt>Desktop</dt><dd>{northStarConnectionsSnapshot.desktopName}</dd></div>
                            <div><dt>Active phone calls</dt><dd>{northStarConnectionsSnapshot.callSessions.filter((entry) => entry.status === "pending" || entry.status === "accepted").length}</dd></div>
                          </dl>
                          <p><strong>Status</strong><br />{northStarConnectionsSnapshot.detail}</p>
                          <div className="button-row">
                            <button type="button" onClick={handleNorthStarQuickLink} disabled={busyPanel === "northStarLink"}>
                              {busyPanel === "northStarLink" ? "Linking..." : "Link North Star"}
                            </button>
                            <button type="button" onClick={handleCallNorthStar} disabled={busyPanel === "northStarCall"}>
                              {busyPanel === "northStarCall" ? "Calling..." : "Call North Star"}
                            </button>
                            <button type="button" className="ghost" onClick={handleNorthStarHeartbeat} disabled={busyPanel === "northStarHeartbeat" || !settings.northStarDeviceToken}>
                              {busyPanel === "northStarHeartbeat" ? "Refreshing..." : "Refresh link"}
                            </button>
                            <button type="button" className="ghost" onClick={handleImportNorthStarCallReviews} disabled={busyPanel === "northStarImportReviews" || !northStarConnectionsSnapshot.callReviewCount}>
                              {busyPanel === "northStarImportReviews" ? "Importing..." : "Import call reviews"}
                            </button>
                          </div>
                          <details className="advanced-block">
                            <summary>Advanced North Star setup</summary>
                            <div className="split">
                              <label><span>North Star endpoint</span><input value={settings.northStarEndpoint} onChange={(event) => setSettings((current) => ({ ...current, northStarEndpoint: event.target.value }))} placeholder="https://northstar.your-domain.app" /></label>
                              <label><span>North Star user handle</span><input value={settings.northStarUserHandle} onChange={(event) => setSettings((current) => ({ ...current, northStarUserHandle: event.target.value }))} placeholder="savvy" /></label>
                            </div>
                            <label><span>North Star display name</span><input value={settings.northStarDisplayName} onChange={(event) => setSettings((current) => ({ ...current, northStarDisplayName: event.target.value }))} placeholder="Savvy" /></label>
                            <div className="split">
                              <div><strong>Session token</strong><br />{northStarConnectionsSnapshot.sessionTokenMasked || "Not created yet"}</div>
                              <div><strong>Device token</strong><br />{northStarConnectionsSnapshot.deviceTokenMasked || "Not bound yet"}</div>
                            </div>
                <label><span>Desktop call note</span><textarea rows={2} value={northStarCallNote} onChange={(event) => setNorthStarCallNote(event.target.value)} placeholder="Optional outreach reason. Leave empty to use a seeded companion check-in." /></label>
                            <label><span>Desktop companion message</span><textarea rows={3} value={northStarMessageText} onChange={(event) => setNorthStarMessageText(event.target.value)} placeholder="Send a message into the North Star companion thread..." /></label>
                            <div className="button-row">
                              <button type="button" onClick={handleCreateNorthStarSession} disabled={busyPanel === "northStarSession"}>{busyPanel === "northStarSession" ? "Creating session..." : "Create session"}</button>
                              <button type="button" onClick={handleBindNorthStarDesktop} disabled={busyPanel === "northStarBind" || !settings.northStarSessionToken}>{busyPanel === "northStarBind" ? "Binding..." : "Bind desktop"}</button>
                              <button type="button" onClick={handleNorthStarPullLocations} disabled={busyPanel === "northStarPull" || !settings.northStarDeviceToken}>{busyPanel === "northStarPull" ? "Pulling..." : "Pull location events"}</button>
                              <button type="button" onClick={handleNorthStarMessage} disabled={busyPanel === "northStarMessage" || !settings.northStarDeviceToken || !northStarMessageText.trim()}>{busyPanel === "northStarMessage" ? "Sending..." : "Send companion message"}</button>
                            </div>
                          </details>
                        </>
                      ) : (
                        <p>North Star desktop status has not been loaded yet.</p>
                      )}
                    </div>
                  <div className="split">
                    <label><span>LM Studio endpoint</span><input value={settings.lmStudioEndpoint} onChange={(event) => setSettings((current) => ({ ...current, lmStudioEndpoint: event.target.value }))} /></label>
                    <label><span>LM Studio model</span><input value={settings.lmStudioModel} onChange={(event) => setSettings((current) => ({ ...current, lmStudioModel: event.target.value }))} /></label>
                  </div>
                  <label><span>LM Studio API key</span><input type="password" value={settings.lmStudioApiKey} onChange={(event) => setSettings((current) => ({ ...current, lmStudioApiKey: event.target.value }))} /></label>
                </>
              ) : (
                <>
                  <div className="panel-header">
                    <h2>Voice</h2>
                    <p>Kokoro voice stack with one-step setup and local preview playback.</p>
                  </div>
                  <div className="split">
              <label><span>TTS provider</span><input value={settings.ttsProvider} onChange={(event) => setSettings((current) => ({ ...current, ttsProvider: event.target.value }))} /></label>
              <label><span>TTS endpoint</span><input value={settings.ttsEndpoint} onChange={(event) => setSettings((current) => ({ ...current, ttsEndpoint: event.target.value }))} placeholder="http://127.0.0.1:8880/v1" /></label>
              <label><span>TTS API key</span><input type="password" value={settings.ttsApiKey} onChange={(event) => setSettings((current) => ({ ...current, ttsApiKey: event.target.value }))} placeholder="Leave empty for local Kokoro-FastAPI" /></label>
              <label><span>Model ID</span><input value={settings.ttsModelId} onChange={(event) => setSettings((current) => ({ ...current, ttsModelId: event.target.value }))} /></label>
                  </div>
                  <div className="split">
                    <label><span>Sample rate</span><input type="number" min={8000} value={settings.ttsSampleRate} onChange={(event) => setSettings((current) => ({ ...current, ttsSampleRate: Number(event.target.value) || 24000 }))} /></label>
                    <label><span>Default voice</span><input value={settings.ttsDefaultVoice} onChange={(event) => setSettings((current) => ({ ...current, ttsDefaultVoice: event.target.value }))} /></label>
                  </div>
                  <label><span>Model file path</span><input value={settings.ttsModelPath} onChange={(event) => setSettings((current) => ({ ...current, ttsModelPath: event.target.value }))} placeholder="Leave empty to use the app's Kokoro model path" /></label>
                  <label><span>Voices file path</span><input value={settings.ttsVoicesPath} onChange={(event) => setSettings((current) => ({ ...current, ttsVoicesPath: event.target.value }))} placeholder="Leave empty to use the app's Kokoro voices path" /></label>

                  <div className="voice-card">
                    <h3>Prompt menu</h3>
                    <p>These live-call prompts are multiline and fully editable here. Supported placeholders include <code>{"{session_context}"}</code>, <code>{"{transcript_text}"}</code>, and for the opener <code>{"{default_fallback}"}</code>.</p>
                    <p><strong>Direction guide</strong><br />This menu only exposes the North Star live-call path. `Shared` means both call directions use it. `NeuralTrainer -&gt; North Star` means it is only used when NeuralTrainer is the one placing the call.</p>
                    {promptFieldMeta.map((entry) => (
                      <div key={entry.key} className="saved-state">
                        <div className="panel-header">
                          <h4>{entry.label}</h4>
                          <p>{entry.description}</p>
                        </div>
                        <label>
                          <span>{entry.label}</span>
                          <textarea
                            rows={entry.rows}
                            value={settings[entry.key]}
                            onChange={(event) => setSettings((current) => ({ ...current, [entry.key]: event.target.value }))}
                          />
                        </label>
                        <div className="actions">
                          <button type="button" className="ghost" onClick={() => handleResetPromptField(entry.key)}>
                            Reset to default
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="voice-card">
                    <h3>Kokoro readiness</h3>
                    {voiceSnapshot ? (
                      <>
                        <dl className="facts">
                          <div><dt>Files ready</dt><dd>{voiceSnapshot.filesReady ? "Yes" : "No"}</dd></div>
                          <div><dt>Runtime ready</dt><dd>{voiceSnapshot.runtimeReady ? "Yes" : "No"}</dd></div>
                          <div><dt>Managed runtime</dt><dd>{voiceSnapshot.managedRuntime ? "Yes" : "No"}</dd></div>
                          <div><dt>Speech ready</dt><dd>{voiceSnapshot.speechReady ? "Yes" : "No"}</dd></div>
                          <div><dt>Speech runtime</dt><dd>{voiceSnapshot.speechRuntimeReady ? "Yes" : "No"}</dd></div>
                          <div><dt>Default voice</dt><dd>{voiceSnapshot.defaultVoice}</dd></div>
                          <div><dt>Sample rate</dt><dd>{voiceSnapshot.sampleRate} Hz</dd></div>
                          <div><dt>Provider</dt><dd>{voiceSnapshot.provider}</dd></div>
                        </dl>
                        <p><strong>Runtime status</strong><br />{voiceSnapshot.runtimeDetail}</p>
                        {voiceSnapshot.runtimeEndpoint ? (
                          <p><strong>Runtime endpoint</strong><br />{voiceSnapshot.runtimeEndpoint}</p>
                        ) : null}
                        <p><strong>Speech status</strong><br />{voiceSnapshot.speechRuntimeDetail}</p>
                        {!voiceSnapshot.filesReady ? (
                          <div className="saved-state">
                            <h4>Missing files</h4>
                            <ul>{voiceSnapshot.missingFiles.map((entry) => <li key={entry}>{entry}</li>)}</ul>
                          </div>
                        ) : null}
                        {voiceSnapshot.exampleVoices.length ? (
                          <div className="saved-state">
                            <h4>Example voices</h4>
                            <ul>{voiceSnapshot.exampleVoices.map((entry) => <li key={entry}>{entry}</li>)}</ul>
                          </div>
                        ) : null}
                        <details className="advanced-block">
                          <summary>Advanced paths</summary>
                          <p><strong>Model path</strong><br />{voiceSnapshot.modelPath}</p>
                          <p><strong>Voices path</strong><br />{voiceSnapshot.voicesPath}</p>
                          <p><strong>Preview folder</strong><br />{voiceSnapshot.previewsDir}</p>
                          <p><strong>Speech model path</strong><br />{voiceSnapshot.speechModelPath}</p>
                          {voiceSnapshot.managedRuntime ? (
                            <>
                              <p><strong>Managed runtime folder</strong><br />{voiceSnapshot.runtimeRoot}</p>
                              <p><strong>Managed stdout log</strong><br />{voiceSnapshot.runtimeStdoutLog}</p>
                              <p><strong>Managed stderr log</strong><br />{voiceSnapshot.runtimeStderrLog}</p>
                            </>
                          ) : null}
                        </details>
                      </>
                    ) : <p>Loading voice readiness...</p>}

                <div className="actions">
                      <button type="button" onClick={handleSetupVoice} disabled={busyPanel === "voiceRuntime"}>
                        {busyPanel === "voiceRuntime" ? "Setting up voice and speech..." : "Set up voice"}
                      </button>
                      <button type="button" className="ghost" onClick={handleSetupSpeech} disabled={busyPanel === "speechSetup"}>
                        {busyPanel === "speechSetup" ? "Repairing speech..." : "Repair speech input"}
                      </button>
                      <button type="button" className="ghost" onClick={handleSynthesizeVoicePreview} disabled={busyPanel === "voicePreview" || !voiceSnapshot?.filesReady || !voiceSnapshot?.runtimeReady}>
                        {busyPanel === "voicePreview" ? "Synthesizing..." : "Synthesize test phrase"}
                      </button>
                      <button type="button" className="ghost" onClick={handleClearVoiceAssets} disabled={busyPanel === "voiceCleanup"}>
                        {busyPanel === "voiceCleanup" ? "Removing..." : "Delete voice assets"}
                      </button>
                    </div>

                    {voicePreview ? (
                      <div className="saved-state">
                        <h4>Last preview</h4>
                        <ul>
                          <li><strong>Voice</strong><code>{voicePreview.voice}</code></li>
                          <li><strong>Text</strong><code>{voicePreview.text}</code></li>
                          <li><strong>Output</strong><code>{voicePreview.outputPath}</code></li>
                        </ul>
                        {voicePreviewSrc ? <audio className="voice-player" controls src={voicePreviewSrc} /> : null}
                      </div>
                    ) : null}

                    <details className="advanced-block">
                      <summary>Cleanup</summary>
                      <p>Remove only the voice files, or wipe all local app data and start fresh.</p>
                      <div className="actions">
                        <button type="button" className="ghost danger" onClick={handleClearAllLocalData} disabled={busyPanel === "localCleanup"}>
                          {busyPanel === "localCleanup" ? "Clearing..." : "Delete all local data"}
                        </button>
                      </div>
                    </details>
                  </div>
                </>
              )}
              <div className="actions"><button type="submit" disabled={saving}>{saving ? "Saving..." : "Save settings"}</button></div>
            </form>
          </section>
        ) : (
          <div className="grid two-up">
            <section className="panel">
              <div className="panel-header"><h2>Saved configuration</h2><p>Recent settings written to the local store.</p></div>
              <div className="saved-state"><ul>{savedRows.length ? savedRows.map((row) => <li key={row.key}><strong>{row.key}</strong><code>{maskSettingValue(row.key, row.valueJson)}</code></li>) : <li>Save settings to populate local history.</li>}</ul></div>
            </section>
            <section className="panel diagnostics">
              <div className="panel-header"><h2>Diagnostics</h2><p>Local database health and recent backend events.</p></div>
              {diagnostics ? (
                <>
                  <dl className="facts">
                    <div><dt>Schema version</dt><dd>{diagnostics.schemaVersion}</dd></div>
                    <div><dt>Saved settings</dt><dd>{diagnostics.settingsCount}</dd></div>
                    <div><dt>Database path</dt><dd>{diagnostics.dbPath}</dd></div>
                    <div><dt>Last initialized</dt><dd>{formatDateTime(diagnostics.lastInitializedAt)}</dd></div>
                  </dl>
                  <div className="saved-state"><h3>Recent backend events</h3><ul>{diagnostics.recentEvents.length ? diagnostics.recentEvents.map((entry) => <li key={entry}>{entry}</li>) : <li>No recent events yet.</li>}</ul></div>
                </>
              ) : <p>Loading diagnostics...</p>}
            </section>
          </div>
        )}
      </div>
    );
  }

  function renderMemoryTab() {
    return (
      <div className="content-stack">
        {renderSectionTabs([
          { id: "places", label: "Places" },
          { id: "rules", label: "Rules" },
          { id: "reflections", label: "Reflections" },
          { id: "overview", label: "Overview" },
          { id: "growth", label: "Growth" },
        ], memorySection, setMemorySection)}

        {memorySection === "places" ? (
          <section className="panel">
            <div className="panel-header"><h2>Meaningful places</h2><p>Named places with significance and protection.</p></div>
            <form className="settings-form" onSubmit={handlePlaceSubmit}>
              <label><span>Label</span><input value={placeForm.label} onChange={(event) => setPlaceForm((current) => ({ ...current, label: event.target.value }))} /></label>
              <div className="split">
                <label><span>Latitude</span><input type="number" step="any" value={placeForm.latitude ?? ""} onChange={(event) => setPlaceForm((current) => ({ ...current, latitude: event.target.value ? Number(event.target.value) : null }))} /></label>
                <label><span>Longitude</span><input type="number" step="any" value={placeForm.longitude ?? ""} onChange={(event) => setPlaceForm((current) => ({ ...current, longitude: event.target.value ? Number(event.target.value) : null }))} /></label>
              </div>
              <div className="split">
                <label><span>Radius meters</span><input type="number" min={1} value={placeForm.radiusMeters} onChange={(event) => setPlaceForm((current) => ({ ...current, radiusMeters: Number(event.target.value) }))} /></label>
                <label><span>Place kind</span><input value={placeForm.placeKind} onChange={(event) => setPlaceForm((current) => ({ ...current, placeKind: event.target.value }))} /></label>
              </div>
              <label>
                <span>Meaning kind</span>
                <select value={placeForm.meaningKind} onChange={(event) => setPlaceForm((current) => ({ ...current, meaningKind: event.target.value }))}>
                  <option value="uncertain">Uncertain</option>
                  <option value="belonging">Belonging</option>
                  <option value="reflection">Reflection</option>
                  <option value="discovery">Discovery</option>
                  <option value="return">Return</option>
                  <option value="mixed">Mixed</option>
                </select>
              </label>
              <label className="checkbox"><input type="checkbox" checked={placeForm.isProtected} onChange={(event) => setPlaceForm((current) => ({ ...current, isProtected: event.target.checked }))} /><span>Protected place</span></label>
              <label><span>Notes</span><textarea rows={4} value={placeForm.notes} onChange={(event) => setPlaceForm((current) => ({ ...current, notes: event.target.value }))} /></label>
              <button type="submit" disabled={busyPanel === "place"}>{busyPanel === "place" ? "Saving..." : "Add place"}</button>
            </form>
          </section>
        ) : null}

        {memorySection === "rules" ? (
          <section className="panel">
            <div className="panel-header"><h2>Boundary rules</h2><p>Protected times and other quiet scopes.</p></div>
            <form className="settings-form" onSubmit={handleRuleSubmit}>
              <div className="split">
                <label><span>Rule kind</span><input value={ruleForm.ruleKind} onChange={(event) => setRuleForm((current) => ({ ...current, ruleKind: event.target.value }))} /></label>
                <label><span>Scope kind</span><input value={ruleForm.scopeKind} onChange={(event) => setRuleForm((current) => ({ ...current, scopeKind: event.target.value }))} /></label>
              </div>
              <label><span>Scope reference ID</span><input type="number" value={ruleForm.scopeRefId ?? ""} onChange={(event) => setRuleForm((current) => ({ ...current, scopeRefId: event.target.value ? Number(event.target.value) : null }))} /></label>
              <label className="checkbox"><input type="checkbox" checked={ruleForm.isActive} onChange={(event) => setRuleForm((current) => ({ ...current, isActive: event.target.checked }))} /><span>Rule is active</span></label>
              <label><span>Rule payload JSON</span><textarea rows={8} value={ruleForm.valueJson} onChange={(event) => setRuleForm((current) => ({ ...current, valueJson: event.target.value }))} /></label>
              <button type="submit" disabled={busyPanel === "rule"}>{busyPanel === "rule" ? "Saving..." : "Add rule"}</button>
            </form>
          </section>
        ) : null}

        {memorySection === "reflections" ? (
          <section className="panel">
            <div className="panel-header"><h2>Manual reflections</h2><p>Human context that should shape later messaging.</p></div>
            <form className="settings-form" onSubmit={handleReflectionSubmit}>
              <label><span>Reflection kind</span><input value={reflectionForm.reflectionKind} onChange={(event) => setReflectionForm((current) => ({ ...current, reflectionKind: event.target.value }))} /></label>
              <label><span>Linked place ID</span><input type="number" value={reflectionForm.linkedPlaceId ?? ""} onChange={(event) => setReflectionForm((current) => ({ ...current, linkedPlaceId: event.target.value ? Number(event.target.value) : null }))} /></label>
              <div className="split">
                <label><span>Weight</span><input type="number" min={0} max={1} step={0.05} value={reflectionForm.weight} onChange={(event) => setReflectionForm((current) => ({ ...current, weight: Number(event.target.value) }))} /></label>
                <label><span>Expires at</span><input type="datetime-local" value={reflectionForm.expiresAt ?? ""} onChange={(event) => setReflectionForm((current) => ({ ...current, expiresAt: event.target.value || null }))} /></label>
              </div>
              <label className="checkbox"><input type="checkbox" checked={reflectionForm.isSensitive} onChange={(event) => setReflectionForm((current) => ({ ...current, isSensitive: event.target.checked }))} /><span>Sensitive reflection</span></label>
              <label><span>Reflection text</span><textarea rows={8} value={reflectionForm.text} onChange={(event) => setReflectionForm((current) => ({ ...current, text: event.target.value }))} /></label>
              <button type="submit" disabled={busyPanel === "reflection"}>{busyPanel === "reflection" ? "Saving..." : "Add reflection"}</button>
            </form>
          </section>
        ) : null}

        {memorySection === "overview" ? (
          <div className="grid two-up">
          <section className="panel">
            <div className="panel-header"><h2>Memory overview</h2><p>Quick counts for the Phase 1 foundation.</p></div>
            {snapshot ? (
              <>
                <dl className="facts">
                  <div><dt>Places</dt><dd>{snapshot.overview.placeCount}</dd></div>
                  <div><dt>Protected places</dt><dd>{snapshot.overview.protectedPlaceCount}</dd></div>
                  <div><dt>Rules</dt><dd>{snapshot.overview.protectedRuleCount}</dd></div>
                  <div><dt>Reflections</dt><dd>{snapshot.overview.reflectionCount}</dd></div>
                </dl>
                <div className="saved-state"><h3>Reflection breakdown</h3><ul>{snapshot.overview.reflectionKindBreakdown.length ? snapshot.overview.reflectionKindBreakdown.map((entry) => <li key={entry.reflectionKind}><strong>{entry.reflectionKind}</strong><code>{entry.count} items</code></li>) : <li>No reflections yet.</li>}</ul></div>
              </>
            ) : <p>Loading memory overview...</p>}
          </section>

          <section className="panel">
            <div className="panel-header"><h2>Current memory records</h2><p>Recent places, rules, and reflections.</p></div>
            {snapshot ? (
              <div className="grid compact-grid">
                <div className="saved-state"><h3>Places</h3><ul>{snapshot.places.length ? snapshot.places.map((place) => <li key={place.id}><strong>{place.label}</strong><code>{place.meaningKind} / significance {place.significanceScore.toFixed(2)}</code></li>) : <li>No places yet.</li>}</ul></div>
                <div className="saved-state"><h3>Rules</h3><ul>{snapshot.rules.length ? snapshot.rules.map((rule) => <li key={rule.id}><strong>{rule.ruleKind}</strong><code>{rule.valueJson}</code></li>) : <li>No rules yet.</li>}</ul></div>
                <div className="saved-state"><h3>Reflections</h3><ul>{snapshot.reflections.length ? snapshot.reflections.map((reflection) => <li key={reflection.id}><strong>{reflection.reflectionKind}</strong><code>{reflection.text}</code></li>) : <li>No reflections yet.</li>}</ul></div>
              </div>
            ) : <p>Loading memory records...</p>}
          </section>
          </div>
        ) : null}

        {memorySection === "growth" ? (
          <div className="grid two-up">
            <section className="panel">
              <div className="panel-header"><h2>Memory growth</h2><p>Build memory automatically from reflections, places, feedback, then run reinforcement, decay, and sensitive-memory confirmation.</p></div>
              <div className="actions">
                <button type="button" onClick={() => void handleRunMemoryGrowth()} disabled={busyPanel === "memoryGrowth"}>
                  {busyPanel === "memoryGrowth" ? "Growing..." : "Run memory growth pass"}
                </button>
              </div>
              {memoryGrowthSummary.length ? (
                <div className="saved-state">
                  <h3>Last pass</h3>
                  <ul>{memoryGrowthSummary.map((line) => <li key={line}>{line}</li>)}</ul>
                </div>
              ) : null}
              {memoryGrowthSnapshot ? (
                <dl className="facts">
                  <div><dt>Active</dt><dd>{memoryGrowthSnapshot.activeCount}</dd></div>
                  <div><dt>Fading</dt><dd>{memoryGrowthSnapshot.fadingCount}</dd></div>
                  <div><dt>Awaiting confirmation</dt><dd>{memoryGrowthSnapshot.awaitingConfirmationCount}</dd></div>
                  <div><dt>Archived</dt><dd>{memoryGrowthSnapshot.archivedCount}</dd></div>
                </dl>
              ) : <p>Loading memory growth status...</p>}
            </section>

            <section className="panel">
              <div className="panel-header"><h2>Memory items</h2><p>What the companion currently thinks it knows from places, feedback, and reflections, and how stable that knowledge is.</p></div>
              <div className="saved-state">
                <ul>{memoryGrowthSnapshot?.memoryItems.length ? memoryGrowthSnapshot.memoryItems.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={`memory-item-button ${selectedMemoryItem?.id === item.id ? "active" : ""}`}
                      onClick={() => setSelectedMemoryItemId(item.id)}
                    >
                      <strong>{item.memoryType} / {item.status}</strong>
                      <code>{item.content}</code>
                      <code>confidence {item.confidence.toFixed(2)} / source {item.sourceKind}</code>
                    </button>
                  </li>
                )) : <li>No memory items yet.</li>}</ul>
              </div>
            </section>

            <section className="panel">
              <div className="panel-header"><h2>Selected memory</h2><p>Why this memory exists, what shaped it, and what it is likely to do next.</p></div>
              {selectedMemoryItem ? (
                <div className="saved-state">
                  <h3>{selectedMemoryItem.memoryType} / {selectedMemoryItem.status}</h3>
                  <p className="memory-detail-lead">{selectedMemoryItem.content}</p>
                  <code>confidence {selectedMemoryItem.confidence.toFixed(2)} / source {selectedMemoryItem.sourceKind}</code>
                  <p className="memory-explanation"><strong>Why it exists:</strong> {describeMemorySource(selectedMemoryItem)}</p>
                  <p className="memory-explanation"><strong>What happens next:</strong> {describeMemoryBehavior(selectedMemoryItem)}</p>
                  <p className="memory-explanation"><strong>Created:</strong> {formatDateTime(selectedMemoryItem.createdAt)}</p>
                  <p className="memory-explanation"><strong>Last updated:</strong> {formatDateTime(selectedMemoryItem.updatedAt)}</p>
                  {selectedMemoryItem.reinforcedAt ? <code>last reinforced {formatDateTime(selectedMemoryItem.reinforcedAt)}</code> : null}
                  {selectedMemoryItem.requiresConfirmation ? <code>requires confirmation</code> : null}
                  {selectedMemoryItem.decaysAfter ? <code>decays after {formatDateTime(selectedMemoryItem.decaysAfter)}</code> : null}
                  {selectedMemoryItem.requiresConfirmation || selectedMemoryItem.status === "fading" ? (
                    <div className="actions compact-actions">
                      {selectedMemoryItem.requiresConfirmation ? (
                        <>
                          <button type="button" disabled={busyPanel === "memoryReview"} onClick={() => void handleUpdateMemoryItem({ id: selectedMemoryItem.id, action: "confirm" })}>
                            Keep it
                          </button>
                          <button type="button" className="secondary" disabled={busyPanel === "memoryReview"} onClick={() => void handleUpdateMemoryItem({ id: selectedMemoryItem.id, action: "dismiss" })}>
                            Let it go
                          </button>
                        </>
                      ) : null}
                      {selectedMemoryItem.status === "fading" ? (
                        <button type="button" className="secondary" disabled={busyPanel === "memoryReview"} onClick={() => void handleUpdateMemoryItem({ id: selectedMemoryItem.id, action: "revive" })}>
                          Keep active
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : (
                <p>No memory item selected yet.</p>
              )}
            </section>
          </div>
        ) : null}
      </div>
    );
  }

  function renderContextTab() {
    return (
      <div className="content-stack">
        {renderSectionTabs([
          { id: "ingest", label: "Ingest" },
          { id: "timeline", label: "Timeline" },
          { id: "patterns", label: "Patterns" },
        ], contextSection, setContextSection)}

        {contextSection === "ingest" ? (
          <div className="grid two-up">
          <section className="panel">
            <div className="panel-header"><h2>Manual location input</h2><p>Testing path for Phase 2 ingestion.</p></div>
            <form className="settings-form" onSubmit={handleLocationSubmit}>
              <label><span>Occurred at</span><input type="datetime-local" value={locationForm.occurredAt.slice(0, 16)} onChange={(event) => setLocationForm((current) => ({ ...current, occurredAt: new Date(event.target.value).toISOString() }))} /></label>
              <div className="split">
                <label><span>Latitude</span><input type="number" step="any" value={locationForm.latitude} onChange={(event) => setLocationForm((current) => ({ ...current, latitude: Number(event.target.value) }))} /></label>
                <label><span>Longitude</span><input type="number" step="any" value={locationForm.longitude} onChange={(event) => setLocationForm((current) => ({ ...current, longitude: Number(event.target.value) }))} /></label>
              </div>
              <div className="split">
                <label><span>Accuracy meters</span><input type="number" min={0} value={locationForm.accuracyMeters ?? ""} onChange={(event) => setLocationForm((current) => ({ ...current, accuracyMeters: event.target.value ? Number(event.target.value) : null }))} /></label>
                <label><span>Speed m/s</span><input type="number" min={0} step={0.1} value={locationForm.speedMps ?? ""} onChange={(event) => setLocationForm((current) => ({ ...current, speedMps: event.target.value ? Number(event.target.value) : null }))} /></label>
              </div>
              <label><span>Source</span><input value={locationForm.source} onChange={(event) => setLocationForm((current) => ({ ...current, source: event.target.value }))} /></label>
                          <div className="saved-state inline-note"><h3>Legacy location event shape</h3><code>{`{
  "occurredAt": "2026-03-23T10:38:00Z",
  "latitude": 52.3712,
  "longitude": 4.9004,
  "accuracyMeters": 12,
  "speedMps": 0,
  "source": "north_star_location"
}`}</code></div>
              <button type="submit" disabled={busyPanel === "location"}>{busyPanel === "location" ? "Ingesting..." : "Ingest location event"}</button>
            </form>
          </section>

          <section className="panel diagnostics">
            <div className="panel-header"><h2>Passive context summary</h2><p>Where raw events become visits, repeated places, and likely sleep.</p></div>
            {passiveSnapshot ? (
              <>
                <dl className="facts">
                  <div><dt>Raw events</dt><dd>{passiveSnapshot.rawEvents.length}</dd></div>
                  <div><dt>Visits</dt><dd>{passiveSnapshot.visits.length}</dd></div>
                  <div><dt>Repeated places</dt><dd>{passiveSnapshot.repeatedPlaces.length}</dd></div>
                  <div><dt>Sleep window</dt><dd>{passiveSnapshot.inferredSleepWindow.start} to {passiveSnapshot.inferredSleepWindow.end}</dd></div>
                </dl>
                <div className="saved-state"><h3>Sleep inference</h3><p>Likely sleep from {passiveSnapshot.inferredSleepWindow.start} to {passiveSnapshot.inferredSleepWindow.end}</p><code>confidence {passiveSnapshot.inferredSleepWindow.confidence.toFixed(2)} from {passiveSnapshot.inferredSleepWindow.supportingVisitCount} supporting visits</code></div>
              </>
            ) : <p>Loading passive context...</p>}
          </section>
          </div>
        ) : null}

        {contextSection === "timeline" ? (
          <div className="grid two-up">
          <section className="panel">
            <div className="panel-header"><h2>Recent raw events</h2><p>Manual and North Star-derived location records.</p></div>
            <div className="saved-state"><ul>{passiveSnapshot?.rawEvents.length ? passiveSnapshot.rawEvents.slice(0, 12).map((item) => <li key={item.id}><strong>{item.movementState}</strong><code>{formatDateTime(item.occurredAt)} / {item.latitude.toFixed(4)}, {item.longitude.toFixed(4)} / {item.source}</code></li>) : <li>No raw events yet.</li>}</ul></div>
          </section>

          <section className="panel">
            <div className="panel-header"><h2>Visit timeline</h2><p>Stationary stretches and repeated-place candidates.</p></div>
            <div className="saved-state"><ul>{passiveSnapshot?.visits.length ? passiveSnapshot.visits.slice(0, 12).map((visit) => <li key={visit.id}><strong>{formatDuration(visit.durationSeconds)}</strong><code>{formatDateTime(visit.startedAt)} to {visit.endedAt ? formatDateTime(visit.endedAt) : "open"} / confidence {visit.confidence.toFixed(2)}</code></li>) : <li>No visits yet.</li>}</ul></div>
            <div className="saved-state"><h3>Repeated places</h3><ul>{passiveSnapshot?.repeatedPlaces.length ? passiveSnapshot.repeatedPlaces.map((place) => <li key={place.key}><strong>{place.label}</strong><code>{place.visitCount} visits / avg {formatDuration(place.averageDurationSeconds)}</code></li>) : <li>No repeated places detected yet.</li>}</ul></div>
          </section>
          </div>
        ) : null}

        {contextSection === "patterns" ? (
          <section className="panel diagnostics">
            <div className="panel-header"><h2>Patterns</h2><p>Repeated places and likely sleep summarized without the raw feed.</p></div>
            {passiveSnapshot ? (
              <div className="grid two-up">
                <div className="saved-state">
                  <h3>Repeated places</h3>
                  <ul>{passiveSnapshot.repeatedPlaces.length ? passiveSnapshot.repeatedPlaces.map((place) => <li key={place.key}><strong>{place.label}</strong><code>{place.visitCount} visits / avg {formatDuration(place.averageDurationSeconds)}</code></li>) : <li>No repeated places detected yet.</li>}</ul>
                </div>
                <div className="saved-state">
                  <h3>Likely sleep window</h3>
                  <p>{passiveSnapshot.inferredSleepWindow.start} to {passiveSnapshot.inferredSleepWindow.end}</p>
                  <code>confidence {passiveSnapshot.inferredSleepWindow.confidence.toFixed(2)} from {passiveSnapshot.inferredSleepWindow.supportingVisitCount} supporting visits</code>
                </div>
              </div>
            ) : <p>Loading patterns...</p>}
          </section>
        ) : null}
      </div>
    );
  }

  function renderJudgmentTab() {
    return (
      <div className="content-stack">
        {renderSectionTabs([
          { id: "reality", label: "Reality check" },
          { id: "simulator", label: "Simulator" },
          { id: "runtime", label: "Runtime" },
          { id: "history", label: "History" },
        ], judgmentSection, setJudgmentSection)}

        {judgmentSection === "reality" ? (
        <section className="panel">
          <div className="panel-header"><h2>MVP reality check</h2><p>Track the checklist gate before moving beyond the MVP.</p></div>
          <div className="actions">
            <button type="button" onClick={() => void handleSeedRealityCheck()} disabled={busyPanel === "realitySeed"}>
              {busyPanel === "realitySeed" ? "Seeding..." : "Seed controlled scenario"}
            </button>
          </div>
          {realityCheckSnapshot ? (
            <>
              <dl className="facts">
                <div><dt>Raw events</dt><dd>{realityCheckSnapshot.rawEventCount}</dd></div>
                <div><dt>Visits</dt><dd>{realityCheckSnapshot.visitCount}</dd></div>
                <div><dt>Saved moments</dt><dd>{realityCheckSnapshot.savedMomentCount}</dd></div>
                <div><dt>Drafts / sent</dt><dd>{realityCheckSnapshot.draftOutreachCount} / {realityCheckSnapshot.sentOutreachCount}</dd></div>
              </dl>
              <div className="saved-state">
                <h3>Checklist status</h3>
                <ul>
                  {realityCheckSnapshot.items.map((item) => (
                    <li key={item.key}>
                      <strong>{item.passed ? "Pass" : "Open"}:</strong> {item.label}
                      <code>{item.detail}</code>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="saved-state">
                <h3>Next actions</h3>
                <ul>
                  {realityCheckSnapshot.nextActions.length ? realityCheckSnapshot.nextActions.map((step) => <li key={step}>{step}</li>) : <li>The current evidence covers the MVP checklist gates.</li>}
                </ul>
              </div>
            </>
          ) : <p>Loading reality-check status...</p>}
        </section>
        ) : null}

        {judgmentSection === "simulator" ? (
        <section className="panel">
          <div className="panel-header"><h2>Scenario simulator</h2><p>Replay realistic patterns quickly so we can iterate without waiting on real-life tempo.</p></div>
          <div className="split">
            <label>
              <span>Scenario</span>
              <select value={selectedSimulationKey} onChange={(event) => setSelectedSimulationKey(event.target.value)}>
                {simulationScenarios.map((scenario) => <option key={scenario.key} value={scenario.key}>{scenario.label}</option>)}
              </select>
            </label>
            <div className="saved-state inline-note">
              <h3>Scenario notes</h3>
              <p>{simulationScenarios.find((scenario) => scenario.key === selectedSimulationKey)?.description ?? "Loading scenario description..."}</p>
            </div>
          </div>
          <div className="actions">
            <button type="button" onClick={() => void handleRunSimulation()} disabled={busyPanel === "simulationRun"}>
              {busyPanel === "simulationRun" ? "Running..." : "Run simulation"}
            </button>
            <button type="button" className="ghost" onClick={() => void handleRunSimulationSuite()} disabled={busyPanel === "simulationSuite"}>
              {busyPanel === "simulationSuite" ? "Running suite..." : "Run automated suite"}
            </button>
            <button type="button" className="ghost" onClick={() => void handleResetRuntimeData()} disabled={busyPanel === "runtimeReset"}>
              {busyPanel === "runtimeReset" ? "Clearing..." : "Clear runtime data"}
            </button>
          </div>
          {simulationResult ? (
            <div className="saved-state">
              <h3>Latest simulation</h3>
              <ul>
                <li><strong>{simulationResult.scenarioLabel}</strong><code>{simulationResult.summary}</code></li>
                <li><strong>Seeded events</strong><code>{simulationResult.seededEventCount}</code></li>
                <li><strong>Promoted / suppressed</strong><code>{simulationResult.promotedCount} / {simulationResult.suppressedCount}</code></li>
                <li><strong>Draft count</strong><code>{simulationResult.draftCount}</code></li>
                {simulationResult.draftPreview ? <li><strong>Draft preview</strong><code>{simulationResult.draftPreview}</code></li> : null}
              </ul>
            </div>
          ) : null}
          {simulationSuiteResult ? (
            <div className="saved-state">
              <h3>Automated suite</h3>
              <p>{simulationSuiteResult.summary}</p>
              <code>{simulationSuiteResult.passedCount} / {simulationSuiteResult.totalCount} checks passed</code>
              <ul>
                {simulationSuiteResult.checks.map((check) => (
                  <li key={check.key}>
                    <strong>{check.passed ? "Pass" : "Open"}:</strong> {check.label}
                    <code>{check.detail}</code>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
        ) : null}

        {judgmentSection === "runtime" ? (
        <>
        <section className="panel">
          <div className="panel-header"><h2>Decision controls</h2><p>Move from saved moments to message drafts or call requests, then dispatch when ready.</p></div>
          <dl className="facts">
            <div><dt>Unresolved moments</dt><dd>{unresolvedMomentCount}</dd></div>
            <div><dt>Call-ready moments</dt><dd>{callReadyMomentCount}</dd></div>
            <div><dt>Call requests</dt><dd>{settings.callRequestsEnabled ? "Enabled" : "Disabled"}</dd></div>
            <div><dt>Call threshold</dt><dd>{settings.callConfidenceThreshold.toFixed(2)}</dd></div>
          </dl>
          <div className="actions">
            <button type="button" onClick={() => void handleRunDecisions()} disabled={busyPanel === "decisions" || loading}>{busyPanel === "decisions" ? "Evaluating..." : "Run decision pass"}</button>
            <button type="button" className="ghost" onClick={() => void handleRunCallRequestDecisions()} disabled={busyPanel === "callDecisions" || loading}>{busyPanel === "callDecisions" ? "Evaluating calls..." : "Run call request pass"}</button>
          </div>
        </section>

        <div className="grid two-up">
          <section className="panel">
            <div className="panel-header"><h2>North Star call surface</h2><p>Move from an accepted North Star call into a real tracked companion session.</p></div>
            <dl className="facts">
              <div><dt>Accepted North Star calls</dt><dd>{latestAcceptedNorthStarCall ? 1 : 0}</dd></div>
              <div><dt>Active sessions</dt><dd>{callSessionSnapshot?.activeSessionCount ?? 0}</dd></div>
            </dl>
              <div className="actions">
                <button
                  type="button"
                  onClick={() => void handleStartNorthStarAcceptedCall()}
                  disabled={busyPanel === "northStarAcceptedCall" || !latestAcceptedNorthStarCall || !!callSessionSnapshot?.activeSession}
                >
                  {busyPanel === "northStarAcceptedCall" ? "Starting..." : "Start North Star call"}
                </button>
            </div>
              {latestAcceptedNorthStarCall ? (
                <p className="memory-explanation"><strong>Ready North Star handoff:</strong> {latestAcceptedNorthStarCall.note || "Accepted companion call waiting."}</p>
              ) : (
                <p className="memory-explanation">No accepted North Star call is ready yet.</p>
              )}
            {callSessionSnapshot?.activeSession ? (
              <div className="saved-state">
                <h3>Active call</h3>
                <p className="memory-detail-lead">{callSessionSnapshot.activeSession.handoffKind}</p>
                <code>started {callSessionSnapshot.activeSession.startedAt ? formatDateTime(callSessionSnapshot.activeSession.startedAt) : "just now"}</code>
                <label><span>Call notes</span><textarea rows={3} value={callSessionNotes} onChange={(event) => setCallSessionNotes(event.target.value)} placeholder="Anything the app should keep about the handoff or tone of this call..." /></label>
                <label><span>Short call summary</span><textarea rows={4} value={callTranscriptSummary} onChange={(event) => setCallTranscriptSummary(event.target.value)} placeholder="A short grounded summary of what the call was about..." /></label>
                {callSessionSnapshot.activeSession.handoffKind === "north_star_companion" ? (
                  <div className="saved-state">
                    <h3>North Star phone call</h3>
                    <p className="memory-detail-lead">
                      {northStarOpeningInFlight
                        ? "North Star finished connecting the line and is opening the conversation."
                        : northStarLiveTurnActive
                        ? "North Star is responding right now."
                        : northStarAwaitingConversationStart
                          ? "The line is connected, but the conversation has not started yet."
                          : "The line is open. North Star is listening for the next thing you say."}
                    </p>
                    <p className="memory-explanation">
                      {northStarLiveChannelReady ? "Call path: live channel connected." : "Call path: fallback voice path."}
                    </p>
                    <div className="saved-state">
                      <h3>Live call diagnostics</h3>
                      <p className="memory-explanation"><strong>Phase:</strong> {formatStatus(northStarLiveDiagnostics.phase)}</p>
                      <p className="memory-explanation"><strong>Signal:</strong> {formatStatus(northStarLiveDiagnostics.lastSignal)}</p>
                      <p className="memory-explanation"><strong>Peer:</strong> {formatStatus(northStarLiveDiagnostics.connectionState)}</p>
                      <p className="memory-explanation"><strong>ICE:</strong> {formatStatus(northStarLiveDiagnostics.iceConnectionState)} / gathering {formatStatus(northStarLiveDiagnostics.iceGatheringState)}</p>
                      <p className="memory-explanation"><strong>Signaling:</strong> {formatStatus(northStarLiveDiagnostics.signalingState)}</p>
                      <p className="memory-explanation"><strong>Data channel:</strong> {formatStatus(northStarLiveDiagnostics.dataChannelState)}</p>
                      <p className="memory-explanation"><strong>Remote track:</strong> {formatStatus(northStarLiveDiagnostics.remoteTrackState)}</p>
                      <p className="memory-explanation"><strong>ICE policy:</strong> {formatStatus(northStarLiveDiagnostics.icePolicy)}</p>
                      <p className="memory-explanation"><strong>ICE servers:</strong> {northStarLiveDiagnostics.iceServerKinds}</p>
                      <p className="memory-explanation"><strong>ICE candidates:</strong> local {northStarLiveDiagnostics.localIceCandidates} / remote {northStarLiveDiagnostics.remoteIceCandidates}</p>
                      <p className="memory-explanation"><strong>Candidate kinds:</strong> local {northStarLiveDiagnostics.localCandidateKinds} / remote {northStarLiveDiagnostics.remoteCandidateKinds}</p>
                      <p className="memory-explanation"><strong>Live turns received:</strong> {northStarLiveTurnTransportStats.liveTurnsReceived} turns / {northStarLiveTurnTransportStats.liveTurnChunksReceived} chunks</p>
                      <p className="memory-explanation"><strong>Active live input path:</strong> {northStarLiveTurnTransportStats.liveTurnsReceived > 0 ? "phone live speech frames over data channel" : "waiting for phone live speech"}</p>
                      <p className="memory-explanation"><strong>Last live turn id:</strong> {northStarLiveTurnTransportStats.lastLiveTurnRequestId}</p>
                      {northStarLiveDiagnostics.issue ? (
                        <p className="memory-explanation"><strong>Issue:</strong> {northStarLiveDiagnostics.issue}</p>
                      ) : null}
                    </div>
                    {northStarTurnStatus ? (
                      <p className="memory-explanation">
                        {northStarTurnStatus.processed
                          ? "North Star answered and is ready to listen again."
                          : "North Star is waiting for your next spoken turn."}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                <div className="actions mini-actions">
                  <button type="button" onClick={() => void handleEndCallSession("completed")} disabled={busyPanel === "callEnd"}>{busyPanel === "callEnd" ? "Ending..." : "End as completed"}</button>
                  <button type="button" className="ghost" onClick={() => void handleEndCallSession("interrupted")} disabled={busyPanel === "callEnd"}>Interrupted</button>
                  <button type="button" className="ghost" onClick={() => void handleEndCallSession("missed")} disabled={busyPanel === "callEnd"}>Missed</button>
                </div>
                {speechStream?.active ? (
                  <div className="saved-state">
                    <h3>North Star is listening</h3>
                    <p className="memory-detail-lead">
                      {speechStream.status === "listening"
                        ? "The line is open and North Star is listening to you now."
                        : speechStream.status === "processing"
                          ? "North Star is preparing a reply."
                          : "Opening the line..."}
                    </p>
                    {speechStream.partialText ? (
                      <>
                        <p><strong>Hearing so far</strong></p>
                        <code>{speechStream.partialText}</code>
                      </>
                    ) : (
                      <p className="memory-explanation">Speak naturally when you are ready.</p>
                    )}
                  </div>
                ) : null}
                {(speechStream?.lastError || error) ? (
                  <p className="memory-explanation"><strong>Call issue</strong><br />{speechStream?.lastError || error}</p>
                ) : null}
                {callTurnResult && callTurnResult.sessionId === callSessionSnapshot.activeSession.id ? (
                  <div className="saved-state">
                    <h3>Latest exchange</h3>
                    <p><strong>You just said</strong></p>
                    <code>{callTurnResult.transcriptText}</code>
                    <p><strong>North Star answered</strong></p>
                    <code>{callTurnResult.replyText}</code>
                    {callTurnResult.replyMode === "model_issue" ? (
                      <p className="memory-explanation">The model had trouble producing a usable reply for that turn, so the app said so plainly and asked for the turn again.</p>
                    ) : null}
                    {callReplyAudioSrc ? <audio className="voice-player" controls src={callReplyAudioSrc} /> : null}
                  </div>
                ) : null}
                <ConversationTurnsPanel
                  turns={callSessionSnapshot.activeSessionTurns}
                  liveReplyPreviewText={northStarLiveReplyPreviewText}
                />
              </div>
            ) : null}
          </section>

          <CallHistoryPanel sessions={callSessionSnapshot?.recentSessions ?? []} />
        </div>

        <div className="grid two-up">
          <SavedMomentsPanel
            savedMoments={phaseThreeSnapshot?.savedMoments ?? []}
            selectedSavedMomentId={selectedSavedMoment?.id ?? null}
            onSelect={setSelectedSavedMomentId}
          />
          <SelectedMomentPanel selectedSavedMoment={selectedSavedMoment} />
        </div>
        </>
        ) : null}

        {judgmentSection === "history" ? (
        <div className="grid two-up">
          <section className="panel">
            <div className="panel-header"><h2>Decision history</h2><p>What was promoted, what was suppressed, and why.</p></div>
            <div className="saved-state"><ul>{decisionSnapshot?.decisions.length ? decisionSnapshot.decisions.map((decision) => <li key={decision.id}><button type="button" className={`memory-item-button ${selectedDecision?.id === decision.id ? "active" : ""}`} onClick={() => setSelectedDecisionId(decision.id)}><strong>{decision.decisionKind}</strong><code>moment {decision.savedMomentId}</code><code>{decision.reasonSummary}</code></button></li>) : <li>No message or call-request decisions yet.</li>}</ul></div>
          </section>
          <section className="panel">
            <div className="panel-header"><h2>Selected decision</h2><p>Why the system stayed silent or moved toward outreach.</p></div>
            {selectedDecision ? (
              <div className="saved-state">
                <h3>{selectedDecision.decisionKind}</h3>
                <p className="memory-detail-lead">{selectedDecision.reasonSummary}</p>
                <code>moment {selectedDecision.savedMomentId} / decided {formatDateTime(selectedDecision.decidedAt)}</code>
                <code>{prettyJson(selectedDecision.decisionMetadataJson)}</code>
                {selectedDecisionOutreach ? (
                  <>
                    <p className="memory-explanation"><strong>Created outreach:</strong> {selectedDecisionOutreach.outreachKind} / {selectedDecisionOutreach.responseState}</p>
                    <code>{selectedDecisionOutreach.messageText}</code>
                  </>
                ) : null}
              </div>
            ) : (
              <p>No decision selected yet.</p>
            )}
          </section>
        </div>
        ) : null}
      </div>
    );
  }

  function renderReviewTab() {
    return (
      <div className="content-stack">
        {renderSectionTabs([
          { id: "places", label: "Places" },
          { id: "rules", label: "Rules" },
          { id: "moments", label: "Saved moments" },
          { id: "calls", label: "Calls" },
        ], reviewSection, setReviewSection)}

        {reviewSection === "places" ? (
          <section className="panel">
            <div className="panel-header"><h2>Place significance review</h2><p>Correct meaning, significance, protection, and notes.</p></div>
            <div className="saved-state"><ul>{snapshot?.places.length ? snapshot.places.map((place) => <li key={place.id}><strong>{place.label}</strong><code>meaning {place.meaningKind} / significance {place.significanceScore.toFixed(2)}</code><button type="button" className="ghost" onClick={() => setReviewPlace({ id: place.id, meaningKind: place.meaningKind, significanceScore: place.significanceScore, isProtected: place.isProtected, notes: place.notes })}>Review place</button></li>) : <li>No places to review yet.</li>}</ul></div>
            {reviewPlace ? (
              <form className="settings-form" onSubmit={handlePlaceReviewSubmit}>
                <h3>Place correction</h3>
                <label><span>Meaning kind</span><select value={reviewPlace.meaningKind} onChange={(event) => setReviewPlace((current) => current ? { ...current, meaningKind: event.target.value } : current)}><option value="belonging">Belonging</option><option value="reflection">Reflection</option><option value="discovery">Discovery</option><option value="return">Return</option><option value="mixed">Mixed</option><option value="uncertain">Uncertain</option></select></label>
                <label><span>Significance score</span><input type="number" min={0} max={1} step={0.05} value={reviewPlace.significanceScore} onChange={(event) => setReviewPlace((current) => current ? { ...current, significanceScore: Number(event.target.value) } : current)} /></label>
                <label className="checkbox"><input type="checkbox" checked={reviewPlace.isProtected} onChange={(event) => setReviewPlace((current) => current ? { ...current, isProtected: event.target.checked } : current)} /><span>Protected place</span></label>
                <label><span>Notes</span><textarea rows={4} value={reviewPlace.notes} onChange={(event) => setReviewPlace((current) => current ? { ...current, notes: event.target.value } : current)} /></label>
                <button type="submit" disabled={busyPanel === "reviewPlace"}>{busyPanel === "reviewPlace" ? "Saving..." : "Save place correction"}</button>
              </form>
            ) : null}
          </section>
        ) : null}

        {reviewSection === "rules" ? (
          <section className="panel diagnostics">
            <div className="panel-header"><h2>Boundary review</h2><p>Inspect protected times and tune active payloads.</p></div>
            <div className="saved-state"><ul>{snapshot?.rules.length ? snapshot.rules.map((rule) => <li key={rule.id}><strong>{rule.ruleKind}</strong><code>{rule.valueJson}</code><button type="button" className="ghost" onClick={() => setReviewRule({ id: rule.id, isActive: rule.isActive, valueJson: rule.valueJson })}>Review rule</button></li>) : <li>No rules to review yet.</li>}</ul></div>
            {reviewRule ? (
              <form className="settings-form" onSubmit={handleRuleReviewSubmit}>
                <h3>Rule correction</h3>
                <label className="checkbox"><input type="checkbox" checked={reviewRule.isActive} onChange={(event) => setReviewRule((current) => current ? { ...current, isActive: event.target.checked } : current)} /><span>Rule is active</span></label>
                <label><span>Rule payload JSON</span><textarea rows={6} value={reviewRule.valueJson} onChange={(event) => setReviewRule((current) => current ? { ...current, valueJson: event.target.value } : current)} /></label>
                <button type="submit" disabled={busyPanel === "reviewRule"}>{busyPanel === "reviewRule" ? "Saving..." : "Save rule correction"}</button>
              </form>
            ) : null}
          </section>
        ) : null}

        {reviewSection === "moments" ? (
          <section className="panel">
            <div className="panel-header"><h2>Saved moments detail</h2><p>Full context payloads for why each moment mattered.</p></div>
            <div className="saved-state"><ul>{phaseThreeSnapshot?.savedMoments.length ? phaseThreeSnapshot.savedMoments.map((moment) => <li key={moment.id}><strong>{moment.momentKind}</strong><code>{moment.inferredSignificance}</code><code>{moment.observedContextJson}</code></li>) : <li>No saved moments yet.</li>}</ul></div>
          </section>
        ) : null}

        {reviewSection === "calls" ? (
          <div className="grid two-up">
            <section className="panel">
              <div className="panel-header"><h2>Call review</h2><p>Inspect completed and active calls as first-class reviewable events.</p></div>
              <div className="saved-state">
                <ul>
                  {callSessionSnapshot?.recentSessions.length ? callSessionSnapshot.recentSessions.map((session) => (
                    <li key={session.id}>
                      <button
                        type="button"
                        className={`memory-item-button ${selectedCallSession?.id === session.id ? "active" : ""}`}
                        onClick={() => setSelectedCallSessionId(session.id)}
                      >
                        <strong>{session.handoffKind} / {session.outcome}</strong>
                        <code>session {session.id} / {session.sessionState}</code>
                        <code>{session.durationSeconds > 0 ? formatDuration(session.durationSeconds) : "not timed yet"}</code>
                      </button>
                    </li>
                  )) : <li>No call sessions yet.</li>}
                </ul>
              </div>
            </section>
            <section className="panel">
              <div className="panel-header"><h2>Selected call</h2><p>See what happened, what was kept, and what could later shape memory.</p></div>
              {selectedCallSession ? (
                <div className="saved-state">
                  <h3>{selectedCallSession.handoffKind}</h3>
                  <p className="memory-detail-lead">{selectedCallSession.outcome}</p>
                  <code>session {selectedCallSession.id} / started {selectedCallSession.startedAt ? formatDateTime(selectedCallSession.startedAt) : "unknown"}</code>
                  {selectedCallSession.endedAt ? <code>ended {formatDateTime(selectedCallSession.endedAt)}</code> : null}
                  <code>{selectedCallSession.durationSeconds > 0 ? formatDuration(selectedCallSession.durationSeconds) : "not timed yet"}</code>
                  {selectedCallSession.notes ? (
                    <>
                      <p className="memory-explanation"><strong>Call notes</strong></p>
                      <code>{selectedCallSession.notes}</code>
                    </>
                  ) : null}
                  {selectedCallSession.transcriptSummary ? (
                    <>
                      <p className="memory-explanation"><strong>Call summary</strong></p>
                      <code>{selectedCallSession.transcriptSummary}</code>
                    </>
                  ) : (
                    <p className="memory-explanation">No grounded call summary was kept for this session.</p>
                  )}
                  {selectedCallTurns.length ? (
                    <>
                      <p className="memory-explanation"><strong>Conversation turns</strong></p>
                      <ul>
                        {selectedCallTurns.map((turn) => (
                          <li key={turn.id}>
                            <code>{formatDateTime(turn.createdAt)}</code>
                            <code>User: {turn.transcriptText}</code>
                            <code>Companion: {turn.replyText}</code>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                </div>
              ) : (
                <p>No call selected yet.</p>
              )}
            </section>
          </div>
        ) : null}
      </div>
    );
  }

  function renderActiveTab() {
    switch (activeTab) {
      case "settings": return renderSettingsTab();
      case "memory": return renderMemoryTab();
      case "context": return renderContextTab();
      case "judgment": return renderJudgmentTab();
      case "review": return renderReviewTab();
      default: return null;
    }
  }

  return (
    <main className="workspace-shell">
      <section className="hero panel hero-panel">
        <div>
          <p className="eyebrow">MVP Build Workspace</p>
          <h1>NeuralTrainer</h1>
          <p className="lede">The app now tracks the checklist phases as a navigable workspace instead of a single vertical page, so it is easier to move between setup, memory, context, judgment, and review.</p>
        </div>
        <div className="hero-status">
          <span className="status-pill">Windows app shell cleaned up</span>
          <span className="status-pill">Phase-based navigation</span>
          <span className="status-pill">SQLite-first MVP</span>
        </div>
      </section>

      <div className="workspace-layout">
        <aside className="panel sidebar">
          <div className="panel-header"><h2>Workspace</h2><p>Follow the docs by phase instead of scrolling through one page.</p></div>
          <nav className="tab-list" aria-label="Primary workspace sections">
            {tabs.map((tab) => (
              <button key={tab.id} type="button" className={tab.id === activeTab ? "tab-button active" : "tab-button"} onClick={() => setActiveTab(tab.id)}>
                <span className="tab-eyebrow">{tab.eyebrow}</span>
                <span className="tab-label">{tab.label}</span>
              </button>
            ))}
          </nav>
          <div className="saved-state">
            <h3>Quick counts</h3>
            <ul>
              <li><strong>Places</strong><code>{snapshot?.places.length ?? 0}</code></li>
              <li><strong>Visits</strong><code>{passiveSnapshot?.visits.length ?? 0}</code></li>
              <li><strong>Saved moments</strong><code>{phaseThreeSnapshot?.savedMoments.length ?? 0}</code></li>
              <li><strong>Calls</strong><code>{callSessionSnapshot?.recentSessions.length ?? 0}</code></li>
            </ul>
          </div>
        </aside>

        <section className="workspace-main">
          {message ? <p className="notice success">{message}</p> : null}
          {error ? <p className="notice error">{error}</p> : null}
          <section className="panel tab-intro"><p className="eyebrow">{activeTabMeta.eyebrow}</p><h2>{activeTabMeta.title}</h2><p>{activeTabMeta.description}</p></section>
          {loading ? <section className="panel"><p>Loading workspace...</p></section> : renderActiveTab()}
        </section>
      </div>
    </main>
  );
}

export default App;
