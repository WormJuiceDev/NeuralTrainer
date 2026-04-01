import { FormEvent, memo, startTransition, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  BriefcaseBusiness,
  Compass,
  Gamepad2,
  Heart,
  Home,
  MapPinned,
  Music4,
  PawPrint,
  Sparkles,
  Target,
  Users,
  UtensilsCrossed,
} from "lucide-react";
import QRCode from "qrcode";
import humanoidFigure from "../Designs/Humanoid.png";
import {
  archiveCompanionContextEntry,
  bindNorthStarDesktop,
  createCompanionContextCategory,
  createCompanionContextEntry,
  createPlace,
  createReflection,
  createRule,
  createNorthStarPairingCode,
  autoDispatchEligibleOutreach,
  createNearbyInterestFilter,
  createNorthStarSession,
  clearAllLocalData,
  clearVoiceAssets,
  downloadKokoroAssets,
  dispatchDraftedOutreach,
  dispatchNextDraftedOutreach,
  endCallSession,
  getCallTurnsForSession,
  getCompanionContextSnapshot,
  getCompanionHomeSnapshot,
  getDecisionSnapshot,
  getDiagnostics,
  getCallSessionSnapshot,
  getMemoryGrowthSnapshot,
  getMemorySystemSnapshot,
  getMvpRealityCheckSnapshot,
  getLivedMomentSnapshot,
  getRealWorldPresenceSnapshot,
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
  runContextMemoryPass,
  seedContextMemoryExample,
  runMemoryGrowthPass,
  runMessageDecisions,
  runAutomatedSimulationSuite,
  runSimulationScenario,
  saveSettings,
  seedMvpRealityCheckScenario,
  sendNorthStarCallRequest,
  sendNorthStarHeartbeat,
  sendNorthStarMessage,
  requestNorthStarLocationPulse,
  setupLocalSpeech,
  startSpeechStream,
  startNorthStarAcceptedCall,
  synthesizeNorthStarPhrase,
  synthesizeNorthStarOpening,
  synthesizeVoicePreview,
  pullNorthStarLocationEvents,
  pullNorthStarWebRtcSignals,
  deleteCompanionContextCategory,
  reorderCompanionContextEntries,
  updateCompanionContextCategoryIcon,
  updateCompanionContextEntry,
  updateMemoryItem,
  updateNearbyInterestFilter,
  updatePlace,
  updateRule,
  getSpeechStreamSnapshot,
  sendNorthStarWebRtcSignal,
  type NorthStarLiveReplyStreamEvent,
} from "./tauri";
import type {
  AppSettings,
  CallSession,
  CallSessionSnapshot,
  CallTurnRecord,
  CallTurnResult,
  CompanionContextCategory,
  CompanionContextEntry,
  CompanionContextSnapshot,
  CompanionHomeSnapshot,
  CreateCompanionContextCategoryInput,
  CreateCompanionContextEntryInput,
  CreatePlaceInput,
  CreateReflectionInput,
  CreateRuleInput,
  DecisionSnapshot,
  DraftedOutreachAutoDispatchResult,
  DiagnosticStatus,
  DraftedOutreachDispatchResult,
  EndCallSessionInput,
  LivedMomentSnapshot,
  LocationEventInput,
  NearbyInterestFilter,
  MemoryItem,
  MemoryGrowthSnapshot,
  MemorySystemSnapshot,
  PassiveContextSnapshot,
  PhaseOneSnapshot,
  PhaseThreeSnapshot,
  MvpRealityCheckSnapshot,
  NorthStarPairingCode,
  NorthStarSnapshot,
  NorthStarRtcIceServer,
  NorthStarRuntimeSnapshot,
  NorthStarTurnProcessingResult,
  NorthStarWebRtcSignal,
  RealWorldPresenceSnapshot,
  ReorderCompanionContextEntriesInput,
  SettingsEntry,
  SimulationRunResult,
  SimulationScenario,
  SimulationSuiteResult,
  SpeechStreamSnapshot,
  UpdateCompanionContextEntryInput,
  UpdateCompanionContextCategoryIconInput,
  UpdateMemoryItemInput,
  UpdateNearbyInterestFilterInput,
  UpdatePlaceInput,
  UpdateRuleInput,
  VoiceSnapshot,
  VoiceSynthesisResult,
} from "./types";

type TabId = "home" | "context" | "tectonics" | "settings";
type SettingsSectionId = "overview" | "companion" | "core" | "connections" | "location" | "voice" | "memory" | "passive" | "judgment" | "review" | "diagnostics";
type MemorySectionId = "places" | "rules" | "reflections" | "overview" | "growth" | "tectonics";
type ContextSectionId = string;
type PassiveSectionId = "ingest" | "timeline" | "patterns" | "moment" | "world";
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

const MAX_INTERPRETED_MEMORIES_UI = 80;
const MAX_DETECTOR_RECORDS_UI = 80;
const MAX_TECTONIC_TIMELINE_UI = 48;
const TECTONIC_PLAYBACK_INTERVAL_MS = 1800;

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
  desktops: NorthStarSnapshot["desktops"];
  desktopCount: number;
  messageCount: number;
  locationEventCount: number;
  callReviewCount: number;
};

type NorthStarConnectionHealth = {
  label: string;
  headline: string;
  guidance: string;
  actionLabel: string;
  busyLabel: string;
  canCall: boolean;
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

function buildNorthStarDesktopBindingsSignature(desktops: NorthStarSnapshot["desktops"]) {
  return desktops
    .map((desktop) => `${desktop.desktopId}:${desktop.deviceToken}:${desktop.status}:${desktop.lastHeartbeatAt ?? ""}:${desktop.userHandle}`)
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
    desktops: snapshot.desktops,
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
    && buildNorthStarDesktopBindingsSignature(a.desktops) === buildNorthStarDesktopBindingsSignature(b.desktops)
    && a.desktopCount === b.desktopCount
    && a.messageCount === b.messageCount
    && a.locationEventCount === b.locationEventCount
    && a.callReviewCount === b.callReviewCount
  );
}

function getNorthStarConnectionHealth(
  snapshot: NorthStarConnectionsProjection | null,
  savedDeviceToken: string,
): NorthStarConnectionHealth {
  if (!snapshot) {
    return {
      label: "Checking",
      headline: "Checking the phone connection status.",
      guidance: "If this does not settle, use Connect North Star once and the desktop will rebuild the link.",
      actionLabel: "Connect North Star",
      busyLabel: "Connecting...",
      canCall: false,
    };
  }

  if (!snapshot.configured) {
    return {
      label: "Needs setup",
      headline: "Add your North Star address and companion identity first.",
      guidance: "Use the same North Star user handle on the phone and the desktop so they stay in the same shared state.",
      actionLabel: "Connect North Star",
      busyLabel: "Connecting...",
      canCall: false,
    };
  }

  if (!snapshot.sessionReady) {
    return {
      label: "Needs session",
      headline: "This desktop still needs its North Star session.",
      guidance: "Connect once and the desktop will create its session, bind itself, and refresh the phone link automatically.",
      actionLabel: "Connect North Star",
      busyLabel: "Connecting...",
      canCall: false,
    };
  }

  const trimmedDeviceToken = savedDeviceToken.trim();
  if (!trimmedDeviceToken) {
    return {
      label: "Waiting for phone link",
      headline: "The desktop session is ready, but this machine is not linked to your phone yet.",
      guidance: "Use Connect North Star and then open North Star on the phone so it can confirm the shared link.",
      actionLabel: "Connect North Star",
      busyLabel: "Connecting...",
      canCall: false,
    };
  }

  const matchingDesktop = snapshot.desktops.find((desktop) => desktop.deviceToken === trimmedDeviceToken) ?? null;
  if (!matchingDesktop) {
    return {
      label: "Needs repair",
      headline: "This saved desktop link no longer matches the phone-side connection.",
      guidance: "Repair the connection to create a fresh shared binding instead of relying on an old token or the wrong handle.",
      actionLabel: "Repair connection",
      busyLabel: "Repairing...",
      canCall: false,
    };
  }

  if (matchingDesktop.status === "offline") {
    return {
      label: "Reconnect",
      headline: "The phone still knows this desktop, but the live link has gone quiet.",
      guidance: "Refresh the connection to announce this desktop again and bring calls, pulses, and presence updates back online.",
      actionLabel: "Refresh connection",
      busyLabel: "Refreshing...",
      canCall: true,
    };
  }

  return {
    label: "Ready",
    headline: "Desktop and phone are connected.",
    guidance: "Calls, messages, and location pulses can use this shared link without any extra setup ritual.",
    actionLabel: "Refresh connection",
    busyLabel: "Refreshing...",
    canCall: true,
  };
}

function buildNorthStarPairingUrl(endpoint: string, code: string, userHandle: string, displayName: string, desktopName: string) {
  const trimmedEndpoint = endpoint.trim().replace(/\/+$/, "");
  if (!trimmedEndpoint || !code.trim()) {
    return "";
  }
  const params = new URLSearchParams({
    endpoint: trimmedEndpoint,
    pairCode: code.trim(),
    userHandle: userHandle.trim(),
    displayName: displayName.trim(),
    desktopName: desktopName.trim(),
  });
  return `northstar://pair/${encodeURIComponent(code.trim())}?${params.toString()}`;
}

function deriveNorthStarDisplayName(userHandle: string) {
  const trimmed = userHandle.trim();
  if (!trimmed) {
    return "North Star";
  }
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
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
  { id: "home", label: "Home", eyebrow: "Companion", title: "Life context at a glance", description: "A person-centered map of what matters, what is active, and what still needs to be taught." },
  { id: "context", label: "Context", eyebrow: "Manual Context", title: "Teach the companion directly", description: "Enter the people, places, values, and living details the companion should actually know." },
  { id: "tectonics", label: "Tectonics", eyebrow: "Movement", title: "Deep movement over time", description: "A dedicated visual surface for the global change the companion is noticing beneath the visible layer." },
  { id: "settings", label: "Settings", eyebrow: "System", title: "Runtime and legacy tools", description: "Keep the operational surfaces close at hand without making them the app's identity." },
];

const companionCategoryIconOptions = [
  { value: "spark", label: "Sparkles", icon: Sparkles },
  { value: "users", label: "People", icon: Users },
  { value: "family", label: "Family", icon: Heart },
  { value: "map", label: "Places", icon: MapPinned },
  { value: "briefcase", label: "Career", icon: BriefcaseBusiness },
  { value: "home", label: "Home", icon: Home },
  { value: "target", label: "Goals", icon: Target },
  { value: "food", label: "Food", icon: UtensilsCrossed },
  { value: "paw", label: "Pet", icon: PawPrint },
  { value: "music", label: "Music", icon: Music4 },
  { value: "compass", label: "Principles", icon: Compass },
  { value: "heart", label: "Heart", icon: Gamepad2 },
] as const;

const companionCategoryIcons = Object.fromEntries(
  companionCategoryIconOptions.map((option) => [option.value, option.icon]),
) as Record<string, (props: { className?: string; strokeWidth?: number }) => ReactNode>;

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

const defaultCompanionContextEntry: CreateCompanionContextEntryInput = {
  categoryKey: "friends",
  title: "",
  body: "",
  tags: [],
  notes: "",
};

const defaultCompanionContextCategory: CreateCompanionContextCategoryInput = {
  label: "",
  description: "",
  icon: "spark",
};

function renderCompanionCategoryIcon(icon: string, className?: string) {
  const Icon = companionCategoryIcons[icon] ?? companionCategoryIcons.spark;
  return <Icon className={className} strokeWidth={1.8} />;
}

function normalizeCompanionAngle(angle: number) {
  let normalized = angle;
  while (normalized < -180) normalized += 360;
  while (normalized > 180) normalized -= 360;
  return normalized;
}

function buildCompanionMapLayout(
  categories: CompanionHomeSnapshot["categories"],
): Array<{ key: string; style: CSSProperties; connectorClass: string }> {
  const placements: Array<{ key: string; style: CSSProperties; connectorClass: string }> = [];
  const occupied: Array<{ left: number; top: number; width: number; height: number }> = [];
  const count = Math.max(categories.length, 1);
  const width = 18.5;
  const height = 15;
  const margin = 4;
  const centerX = 50;
  const centerY = 50;
  const protectedCenterRadius = 24;
  const cardHalfDiagonal = Math.sqrt((width / 2) ** 2 + (height / 2) ** 2);

  const overlaps = (left: number, top: number) =>
    occupied.some((rect) => {
      const horizontalOverlap = Math.abs(rect.left - left) < (rect.width + width) / 2 + 1.2;
      const verticalOverlap = Math.abs(rect.top - top) < (rect.height + height) / 2 + 1.2;
      return horizontalOverlap && verticalOverlap;
    });

  const overlapsProtectedCenter = (left: number, top: number) =>
    Math.hypot(left - centerX, top - centerY) < protectedCenterRadius + cardHalfDiagonal;

  for (let index = 0; index < categories.length; index += 1) {
    const baseAngle = -90 + (360 / count) * index;
    let fallbackAngle = (baseAngle * Math.PI) / 180;
    let fallbackRadiusX = 33;
    let fallbackRadiusY = 31;
    let chosenLeft = Math.min(
      100 - width / 2 - margin,
      Math.max(width / 2 + margin, centerX + Math.cos(fallbackAngle) * fallbackRadiusX),
    );
    let chosenTop = Math.min(
      100 - height / 2 - margin,
      Math.max(height / 2 + margin, centerY + Math.sin(fallbackAngle) * fallbackRadiusY),
    );
    let connectorClass = "connector-right";
    let placed = false;

    for (let radiusStep = 0; radiusStep < 10 && !placed; radiusStep += 1) {
      const radiusX = 33 + radiusStep * 4.8;
      const radiusY = 31 + radiusStep * 4.1;
      const angleOffsets = [0, -8, 8, -16, 16, -24, 24, -32, 32, -40, 40, -52, 52];
      fallbackRadiusX = radiusX;
      fallbackRadiusY = radiusY;

      for (const angleOffset of angleOffsets) {
        const angle = (baseAngle + angleOffset) * (Math.PI / 180);
        fallbackAngle = angle;
        const left = Math.min(100 - width / 2 - margin, Math.max(width / 2 + margin, centerX + Math.cos(angle) * radiusX));
        const top = Math.min(100 - height / 2 - margin, Math.max(height / 2 + margin, centerY + Math.sin(angle) * radiusY));
        if (overlaps(left, top) || overlapsProtectedCenter(left, top)) {
          continue;
        }

        const horizontalDelta = left - centerX;
        const normalizedAngle = normalizeCompanionAngle(baseAngle + angleOffset);
        connectorClass =
          Math.abs(horizontalDelta) < 7 || Math.abs(normalizedAngle) > 145
            ? "connector-none"
            : horizontalDelta < 0
              ? "connector-right"
              : "connector-left";
        chosenLeft = left;
        chosenTop = top;
        placed = true;
        break;
      }
    }

    if (!placed) {
      const forcedRadius = Math.max(fallbackRadiusX, protectedCenterRadius + cardHalfDiagonal + 4);
      const forcedRadiusY = Math.max(fallbackRadiusY, protectedCenterRadius + cardHalfDiagonal + 4);
      chosenLeft = Math.min(
        100 - width / 2 - margin,
        Math.max(width / 2 + margin, centerX + Math.cos(fallbackAngle) * forcedRadius),
      );
      chosenTop = Math.min(
        100 - height / 2 - margin,
        Math.max(height / 2 + margin, centerY + Math.sin(fallbackAngle) * forcedRadiusY),
      );
      const horizontalDelta = chosenLeft - centerX;
      const normalizedAngle = normalizeCompanionAngle((fallbackAngle * 180) / Math.PI);
      connectorClass =
        Math.abs(horizontalDelta) < 7 || Math.abs(normalizedAngle) > 145
          ? "connector-none"
          : horizontalDelta < 0
            ? "connector-right"
            : "connector-left";
    }

    occupied.push({ left: chosenLeft, top: chosenTop, width, height });
    placements.push({
      key: categories[index].category.key,
      connectorClass,
      style: {
        left: `${chosenLeft}%`,
        top: `${chosenTop}%`,
      },
    });
  }

  return placements;
}

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

function parseTagList(value: string) {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function formatTagList(tags: string[]) {
  return tags.join(", ");
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

function parseJsonObject(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function decisionExplainability(value: string) {
  const metadata = parseJsonObject(value);
  const livedMoment = metadata?.livedMoment && typeof metadata.livedMoment === "object" && !Array.isArray(metadata.livedMoment)
    ? metadata.livedMoment as Record<string, unknown>
    : null;

  return {
    metadata,
    pillar: typeof livedMoment?.pillar === "string" ? livedMoment.pillar : null,
    primaryAssessment: typeof livedMoment?.primaryAssessment === "string" ? livedMoment.primaryAssessment : null,
    recommendedSignal: typeof livedMoment?.recommendedSignal === "string" ? livedMoment.recommendedSignal : null,
    recommendedContactMode: typeof livedMoment?.recommendedContactMode === "string" ? livedMoment.recommendedContactMode : null,
    contactRhythmHint: typeof livedMoment?.contactRhythmHint === "string" ? livedMoment.contactRhythmHint : null,
    escalationStage: typeof livedMoment?.escalationStage === "string" ? livedMoment.escalationStage : null,
    topOpportunity: typeof livedMoment?.topOpportunity === "string" ? livedMoment.topOpportunity : null,
    topSafeguard: typeof livedMoment?.topSafeguard === "string" ? livedMoment.topSafeguard : null,
    topSituationalSignal: typeof livedMoment?.topSituationalSignal === "string" ? livedMoment.topSituationalSignal : null,
    topRelationalBridge: typeof livedMoment?.topRelationalBridge === "string" ? livedMoment.topRelationalBridge : null,
    recentContactSummary: typeof livedMoment?.recentContactSummary === "string" ? livedMoment.recentContactSummary : null,
    adjustedConfidence: typeof metadata?.adjustedConfidence === "number" ? metadata.adjustedConfidence : null,
    threshold: typeof metadata?.threshold === "number" ? metadata.threshold : null,
    feedbackBias: typeof metadata?.feedbackBias === "number" ? metadata.feedbackBias : null,
    livedMomentBias: typeof metadata?.livedMomentBias === "number" ? metadata.livedMomentBias : null,
    kind: typeof metadata?.kind === "string" ? metadata.kind : null,
    cooldownMinutes: typeof metadata?.cooldownMinutes === "number" ? metadata.cooldownMinutes : null,
    minutesSinceLastOutreach: typeof metadata?.minutesSinceLastOutreach === "number" ? metadata.minutesSinceLastOutreach : null,
  };
}

function autoDispatchAssessmentForEvent(eventId: number, snapshot: DecisionSnapshot | null) {
  const decision = snapshot?.decisions.find((item) => item.createdOutreachEventId === eventId);
  const explainability = decision ? decisionExplainability(decision.decisionMetadataJson) : null;
  const mode = explainability?.recommendedContactMode;
  const basisParts = [
    explainability?.primaryAssessment ? explainabilityLabel(explainability.primaryAssessment) : null,
    explainability?.recommendedSignal ? explainabilityLabel(explainability.recommendedSignal) : null,
    explainability?.recommendedContactMode ? explainabilityLabel(explainability.recommendedContactMode) : null,
  ].filter((value): value is string => Boolean(value));
  const basis = basisParts.length ? `Basis: ${basisParts.join(" / ")}.` : "Basis: not enough lived-moment context was attached.";

  switch (mode) {
    case "send_light_message":
      return { eligible: true, reason: "Ready to auto-send as a light message.", basis };
    case "make_soft_suggestion":
      return { eligible: true, reason: "Ready to auto-send as a soft suggestion.", basis };
    case "send_warning":
      return { eligible: true, reason: "Ready to auto-send as a timely warning.", basis };
    case "suggest_human_contact":
      return { eligible: false, reason: "Keeping this as a manual send because it points toward human contact.", basis };
    case "escalate_to_call":
      return { eligible: false, reason: "Keeping this as a manual send because it feels closer to a live call.", basis };
    case "stay_silent":
      return { eligible: false, reason: "Not auto-sending because this moment still leans quiet.", basis };
    default:
      return { eligible: false, reason: "Keeping this as a manual send for now.", basis };
  }
}

function explainabilityLabel(kind: string | null | undefined) {
  if (!kind) return "Unknown";
  switch (kind) {
    case "lived_moment_enrichment":
      return "Lived moment enrichment";
    case "situational_safeguarding":
      return "Situational safeguarding";
    case "relational_bridging":
      return "Relational bridging";
    case "phase_navigation":
      return "Phase navigation";
    case "opportunity_guidance":
      return "Opportunity guidance";
    case "ordinary":
      return "Ordinary";
    case "open":
      return "Open";
    case "exploratory":
      return "Exploratory";
    case "vulnerable":
      return "Vulnerable";
    case "urgent":
      return "Urgent";
    case "protective":
      return "Protective";
    case "connective":
      return "Connective";
    case "opportunity-rich":
      return "Open opportunity";
    case "transition-heavy":
      return "Transition threshold";
    case "enrich_this_moment":
      return "Enrich this moment";
    case "surface_this_opening":
      return "Surface this opening";
    case "warn_now":
      return "Warn now";
    case "stay_quiet":
      return "Stay quiet";
    case "watch_for_escalation":
      return "Watch for escalation";
    case "send_light_message":
      return "Light message";
    case "make_soft_suggestion":
      return "Soft suggestion";
    case "suggest_human_contact":
      return "Suggest human contact";
    case "send_warning":
      return "Warning message";
    case "escalate_to_call":
      return "Live call";
    case "silence":
      return "Silence";
    case "light_message":
      return "Light message";
    case "soft_suggestion":
      return "Soft suggestion";
    case "bridging_suggestion":
      return "Bridge toward contact";
    case "warning_message":
      return "Warning message";
    case "call_escalation":
      return "Live call";
    case "low_confidence":
      return "Low confidence";
    case "protected_time":
      return "Protected time";
    case "batch_limit":
      return "Another stronger moment already won";
    case "message_cooldown":
      return "Message cooldown";
    case "call_cooldown":
      return "Call cooldown";
    case "eligible_call_request":
      return "Eligible for call request";
    default:
      return formatStatus(kind);
  }
}

function decisionKindLabel(kind: string) {
  switch (kind) {
    case "promote_to_outreach":
      return "Sent toward a message";
    case "promote_to_call_request":
      return "Sent toward a live call";
    case "suppress":
      return "Stayed quiet";
    default:
      return formatStatus(kind);
  }
}

function decisionSummaryText(decision: DecisionSnapshot["decisions"][number], explainability: ReturnType<typeof decisionExplainability>) {
  if (decision.decisionKind === "promote_to_outreach") {
    return "The system chose to move toward a message.";
  }
  if (decision.decisionKind === "promote_to_call_request") {
    return "The system chose to move toward a live call.";
  }
  if (explainability.kind === "protected_time") {
    return "The system stayed quiet because the moment fell inside protected quiet time.";
  }
  if (explainability.kind === "low_confidence") {
    return "The system stayed quiet because the moment did not feel strong enough yet.";
  }
  if (explainability.kind === "batch_limit") {
    return "The system stayed quiet because another stronger moment had already been chosen.";
  }
  if (explainability.kind === "message_cooldown" || explainability.kind === "call_cooldown") {
    return "The system stayed quiet because the recent contact cooldown was still active.";
  }
  return decision.reasonSummary;
}

function outreachKindLabel(kind: string) {
  switch (kind) {
    case "message":
      return "Message";
    case "call_request":
      return "Live call";
    default:
      return formatStatus(kind);
  }
}

function outreachStateLabel(state: string) {
  switch (state) {
    case "drafted":
      return "In queue";
    case "sent":
      return "Sent";
    case "accepted":
      return "Accepted";
    case "declined":
      return "Declined";
    case "replied":
      return "Replied";
    case "call_started":
      return "Call started";
    case "completed":
      return "Completed";
    case "interrupted":
      return "Interrupted";
    case "missed":
      return "Missed";
    default:
      return formatStatus(state);
  }
}

function livedMomentMetaLabel(value: string) {
  switch (value) {
    case "settled":
      return "Settled";
    case "off_rhythm":
      return "Off rhythm";
    case "emerging":
      return "Emerging";
    case "quiet":
      return "Quiet";
    case "light":
      return "Light";
    case "gentle":
      return "Gentle";
    case "protective":
      return "Protective";
    case "urgent":
      return "Urgent";
    case "enrich":
      return "Enrich";
    case "protect":
      return "Protect";
    case "connect":
      return "Connect";
    case "orient":
      return "Orient";
    case "wait":
      return "Wait";
    case "rising":
      return "Rising";
    case "stable":
      return "Stable";
    case "fading":
      return "Fading";
    case "immediate":
      return "Immediate";
    case "near_term":
      return "Near term";
    case "ambient":
      return "Ambient";
    case "low":
      return "Low";
    case "medium":
      return "Medium";
    case "high":
      return "High";
    case "recent":
      return "Recent";
    case "cooling":
      return "Cooling";
    case "dormant":
      return "Dormant";
    default:
      return explainabilityLabel(value);
  }
}

function callHandoffLabel(value: string) {
  switch (value) {
    case "north_star_companion":
      return "North Star companion call";
    case "accepted_handoff":
      return "Accepted North Star handoff";
    default:
      return formatStatus(value);
  }
}

function callSessionStateLabel(value: string) {
  switch (value) {
    case "starting":
      return "Starting";
    case "active":
      return "Active";
    case "ended":
      return "Ended";
    default:
      return formatStatus(value);
  }
}

function callOutcomeLabel(value: string) {
  switch (value) {
    case "pending":
      return "Call underway";
    case "completed":
      return "Completed";
    case "interrupted":
      return "Interrupted";
    case "missed":
      return "Missed";
    case "declined":
      return "Declined";
    default:
      return formatStatus(value);
  }
}

function callFlowSummary(session: CallSession) {
  if (session.sessionState === "active" || session.outcome === "pending") {
    return "The call is currently underway.";
  }
  switch (session.outcome) {
    case "completed":
      return "The call ran to completion and kept a grounded summary.";
    case "interrupted":
      return "The call began but did not finish cleanly.";
    case "missed":
      return "The live check-in did not fully connect.";
    case "declined":
      return "The live check-in was declined.";
    default:
      return "The call path was created and tracked here.";
  }
}

function durationLabel(seconds: number) {
  return seconds > 0 ? formatDuration(seconds) : "No duration recorded yet";
}

function simulationDraftPreviewLabel(scenarioKey: string, preview: string | null) {
  if (!preview) return null;
  if (scenarioKey === "accepted_call_request_starts_session") {
    const [handoff, state] = preview.split("/").map((part) => part.trim());
    return `${callHandoffLabel(handoff)} / ${callSessionStateLabel(state)}`;
  }
  return preview;
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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function parseTectonicSummary(summaryJson: string) {
  try {
    const parsed = JSON.parse(summaryJson) as {
      detectorTypeBreakdown?: Array<{ key?: string; count?: number }>;
      evolutionStatusBreakdown?: Array<{ key?: string; count?: number }>;
  truthAlignmentBreakdown?: Array<{ key?: string; count?: number }>;
  divergentMemoryCount?: number;
  cumulativeDivergenceAverage?: number;
  crossSourceMemoryCount?: number;
  sourceCoherenceAverage?: number;
  sustainedShiftMemoryCount?: number;
  phaseShiftAverage?: number;
  phaseShiftBreakdown?: Array<{ key?: string; count?: number }>;
  targetKindBreakdown?: Array<{ key?: string; count?: number }>;
      directionBreakdown?: Array<{ key?: string; count?: number }>;
      regionContinuity?: Array<{
        regionId?: string;
        targetKind?: string;
        dominantDirection?: string;
        dominantDetectorType?: string;
        activity?: number;
        activityDelta?: number;
        divergencePressure?: number;
        detectorCount?: number;
        persistenceFrames?: number;
        centerLatitude?: number;
        longitudeStart?: number;
        longitudeEnd?: number;
      }>;
    };
    return {
      detectorTypeBreakdown: Array.isArray(parsed.detectorTypeBreakdown) ? parsed.detectorTypeBreakdown : [],
      evolutionStatusBreakdown: Array.isArray(parsed.evolutionStatusBreakdown) ? parsed.evolutionStatusBreakdown : [],
    truthAlignmentBreakdown: Array.isArray(parsed.truthAlignmentBreakdown) ? parsed.truthAlignmentBreakdown : [],
    divergentMemoryCount: typeof parsed.divergentMemoryCount === "number" ? parsed.divergentMemoryCount : 0,
    cumulativeDivergenceAverage: typeof parsed.cumulativeDivergenceAverage === "number" ? parsed.cumulativeDivergenceAverage : 0,
    crossSourceMemoryCount: typeof parsed.crossSourceMemoryCount === "number" ? parsed.crossSourceMemoryCount : 0,
    sourceCoherenceAverage: typeof parsed.sourceCoherenceAverage === "number" ? parsed.sourceCoherenceAverage : 0,
    sustainedShiftMemoryCount: typeof parsed.sustainedShiftMemoryCount === "number" ? parsed.sustainedShiftMemoryCount : 0,
    phaseShiftAverage: typeof parsed.phaseShiftAverage === "number" ? parsed.phaseShiftAverage : 0,
    phaseShiftBreakdown: Array.isArray(parsed.phaseShiftBreakdown) ? parsed.phaseShiftBreakdown : [],
    targetKindBreakdown: Array.isArray(parsed.targetKindBreakdown) ? parsed.targetKindBreakdown : [],
      directionBreakdown: Array.isArray(parsed.directionBreakdown) ? parsed.directionBreakdown : [],
      regionContinuity: Array.isArray(parsed.regionContinuity) ? parsed.regionContinuity : [],
    };
  } catch {
    return {
      detectorTypeBreakdown: [],
      evolutionStatusBreakdown: [],
    truthAlignmentBreakdown: [],
    divergentMemoryCount: 0,
    cumulativeDivergenceAverage: 0,
    crossSourceMemoryCount: 0,
    sourceCoherenceAverage: 0,
    sustainedShiftMemoryCount: 0,
    phaseShiftAverage: 0,
    phaseShiftBreakdown: [],
    targetKindBreakdown: [],
      directionBreakdown: [],
      regionContinuity: [],
    };
  }
}

type SphereProjectedPoint = {
  x: number;
  y: number;
  z: number;
};

type SpherePulsePoint = SphereProjectedPoint & {
  phaseWeight: number;
};

function projectSpherePoint(
  latitude: number,
  longitude: number,
  rotationX: number,
  rotationY: number,
  radius: number,
) {
  const lat = latitude * (Math.PI / 180);
  const lon = longitude * (Math.PI / 180);
  let x = radius * Math.cos(lat) * Math.cos(lon);
  let y = radius * Math.sin(lat);
  let z = radius * Math.cos(lat) * Math.sin(lon);

  const cosY = Math.cos(rotationY);
  const sinY = Math.sin(rotationY);
  const xAfterY = (x * cosY) + (z * sinY);
  const zAfterY = (-x * sinY) + (z * cosY);

  const cosX = Math.cos(rotationX);
  const sinX = Math.sin(rotationX);
  const yAfterX = (y * cosX) - (zAfterY * sinX);
  const zAfterX = (y * sinX) + (zAfterY * cosX);

  const perspective = 280 / (280 - zAfterX);
  return {
    x: xAfterY * perspective,
    y: yAfterX * perspective,
    z: zAfterX,
  };
}

function buildSpherePolyline(
  points: SphereProjectedPoint[],
  width: number,
  height: number,
) {
  return points
    .map((point) => `${(width / 2) + point.x},${(height / 2) + point.y}`)
    .join(" ");
}

function buildSphereBandPolygon(
  topLatitude: number,
  bottomLatitude: number,
  longitudeStart: number,
  longitudeEnd: number,
  rotationX: number,
  rotationY: number,
  radius: number,
) {
  const topPoints = Array.from({ length: 28 }, (_, index) => {
    const longitude = longitudeStart + (((longitudeEnd - longitudeStart) / 27) * index);
    return projectSpherePoint(topLatitude, longitude, rotationX, rotationY, radius);
  });
  const bottomPoints = Array.from({ length: 28 }, (_, index) => {
    const longitude = longitudeEnd - (((longitudeEnd - longitudeStart) / 27) * index);
    return projectSpherePoint(bottomLatitude, longitude, rotationX, rotationY, radius);
  });
  return buildSpherePolyline([...topPoints, ...bottomPoints], 420, 420);
}

function territoryBandStyle(targetKind: string, index: number) {
  const styles: Record<string, { fill: string; stroke: string }> = {
    interaction_field: {
      fill: "rgba(111, 230, 255, 0.15)",
      stroke: "rgba(111, 230, 255, 0.34)",
    },
    interaction_boundary: {
      fill: "rgba(255, 191, 111, 0.13)",
      stroke: "rgba(255, 191, 111, 0.3)",
    },
    conversation_theme: {
      fill: "rgba(255, 124, 148, 0.12)",
      stroke: "rgba(255, 124, 148, 0.28)",
    },
    outreach_path: {
      fill: "rgba(152, 133, 255, 0.13)",
      stroke: "rgba(152, 133, 255, 0.28)",
    },
    memory_item: {
      fill: "rgba(105, 195, 255, 0.1)",
      stroke: "rgba(105, 195, 255, 0.24)",
    },
    category: {
      fill: "rgba(114, 255, 173, 0.11)",
      stroke: "rgba(114, 255, 173, 0.24)",
    },
  };

  return styles[targetKind] ?? [
    {
      fill: "rgba(116, 221, 255, 0.12)",
      stroke: "rgba(116, 221, 255, 0.24)",
    },
    {
      fill: "rgba(255, 191, 111, 0.11)",
      stroke: "rgba(255, 191, 111, 0.22)",
    },
    {
      fill: "rgba(255, 124, 148, 0.1)",
      stroke: "rgba(255, 124, 148, 0.2)",
    },
  ][index % 3];
}

function directionArcStyle(direction: string, index: number) {
  const styles: Record<string, { stroke: string }> = {
    warming: { stroke: "rgba(111, 230, 255, 0.8)" },
    sheltering: { stroke: "rgba(255, 191, 111, 0.76)" },
    guarding: { stroke: "rgba(255, 208, 122, 0.76)" },
    resisting: { stroke: "rgba(255, 124, 148, 0.82)" },
    pressing: { stroke: "rgba(255, 124, 148, 0.78)" },
    unsettling: { stroke: "rgba(199, 148, 255, 0.78)" },
    appearing: { stroke: "rgba(137, 226, 255, 0.82)" },
    steadying: { stroke: "rgba(112, 198, 255, 0.8)" },
    shifting: { stroke: "rgba(164, 214, 255, 0.72)" },
    swinging: { stroke: "rgba(199, 148, 255, 0.8)" },
    removing: { stroke: "rgba(255, 166, 122, 0.78)" },
    receding: { stroke: "rgba(255, 166, 122, 0.74)" },
  };

  return styles[direction] ?? [
    { stroke: "rgba(111, 230, 255, 0.8)" },
    { stroke: "rgba(255, 191, 111, 0.76)" },
    { stroke: "rgba(199, 148, 255, 0.78)" },
  ][index % 3];
}

const TectonicsSpherePanel = memo(function TectonicsSpherePanel({
  timeline,
  sideContent,
}: {
  timeline: MemorySystemSnapshot["tectonicTimeline"];
  sideContent?: React.ReactNode;
}) {
  const chronologicalTimeline = useMemo(() => [...timeline], [timeline]);
  const [playbackIndex, setPlaybackIndex] = useState(0);
  const [autoplay, setAutoplay] = useState(true);
  const [rotation, setRotation] = useState({ x: -0.42, y: 0.58 });
  const dragStateRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);

  useEffect(() => {
    if (!chronologicalTimeline.length) {
      setPlaybackIndex(0);
      return;
    }
    setPlaybackIndex((current) => clamp(current, 0, chronologicalTimeline.length - 1));
  }, [chronologicalTimeline.length]);

  useEffect(() => {
    if (!autoplay || chronologicalTimeline.length <= 1) return;
    const timer = window.setInterval(() => {
      setPlaybackIndex((current) => (current + 1) % chronologicalTimeline.length);
    }, TECTONIC_PLAYBACK_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [autoplay, chronologicalTimeline.length]);

  const activeSnapshot = chronologicalTimeline[playbackIndex] ?? null;
  const parsedSummary = activeSnapshot ? parseTectonicSummary(activeSnapshot.summaryJson) : null;
  const dominantDetector = parsedSummary?.detectorTypeBreakdown[0]?.key ?? "quiet";
  const dominantEvolution = parsedSummary?.evolutionStatusBreakdown[0]?.key ?? "forming";
  const dominantPhaseShift = parsedSummary?.phaseShiftBreakdown[0]?.key ?? "stable";
  const detectorActivity = activeSnapshot?.totalDetectorActivity ?? 0;
  const phaseShiftAverage = parsedSummary?.phaseShiftAverage ?? 0;
  const glowStrength = clamp(0.22 + (detectorActivity / 28) + (phaseShiftAverage * 0.12), 0.24, 0.92);
  const playbackPhase = chronologicalTimeline.length > 1 ? playbackIndex / (chronologicalTimeline.length - 1) : 0;

  const meridians = useMemo(() => {
    const longitudes = [-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150];
    return longitudes.map((longitude) =>
      Array.from({ length: 73 }, (_, index) => projectSpherePoint(-90 + (index * 2.5), longitude, rotation.x, rotation.y, 132)),
    );
  }, [rotation.x, rotation.y]);

  const parallels = useMemo(() => {
    const latitudes = [-75, -60, -45, -30, -15, 0, 15, 30, 45, 60, 75];
    return latitudes.map((latitude) =>
      Array.from({ length: 97 }, (_, index) => projectSpherePoint(latitude, -180 + (index * 3.75), rotation.x, rotation.y, 132)),
    );
  }, [rotation.x, rotation.y]);

  const pulseNodes = useMemo(() => {
    const detectorCount = parsedSummary?.detectorTypeBreakdown.length ?? 0;
    const nodeCount = clamp(detectorCount * 2 + 4, 4, 14);
    const phaseWeight = clamp((parsedSummary?.phaseShiftAverage ?? 0) * 0.4, 0, 0.4);
    return Array.from({ length: nodeCount }, (_, index): SpherePulsePoint => {
      const latitude = -55 + (((index * 29) + (playbackIndex * 7)) % 110);
      const longitude = -180 + (((index * 47) + (playbackIndex * 19)) % 360);
      const point = projectSpherePoint(latitude, longitude, rotation.x, rotation.y, 132);
      return { ...point, phaseWeight };
    }).sort((left, right) => left.z - right.z);
  }, [parsedSummary, playbackIndex, rotation.x, rotation.y]);

  const territoryBands = useMemo(() => {
    const regions = (parsedSummary?.regionContinuity ?? []).slice(0, 4);
    return regions.map((region, index) => {
      const detectorCount = region.detectorCount ?? 0;
      const density = clamp(detectorCount / 20, 0.15, 1);
      const persistence = clamp((region.persistenceFrames ?? 1) / 7, 0.18, 1);
      const divergencePressure = clamp((region.divergencePressure ?? 0) / 3.5, 0, 1);
      const phaseShift = Math.sin((playbackPhase * Math.PI * 2) + index) * (5 + (persistence * 4));
      const centerLatitude = (region.centerLatitude ?? (-32 + (index * 28))) + phaseShift;
      const thickness = 9 + (density * 7);
      const topLatitude = centerLatitude - thickness;
      const bottomLatitude = centerLatitude + thickness;
      const longitudeStart = (region.longitudeStart ?? (-132 + (index * 18))) - (density * 16) + (phaseShift * 0.8);
      const longitudeEnd = (region.longitudeEnd ?? (72 + (index * 20))) + (density * 18) + (phaseShift * 0.8);
      const intensity = clamp(0.32 + (density * 0.28) + (persistence * 0.34) + (divergencePressure * 0.16) + ((region.activityDelta ?? 0) * 0.05), 0.28, 0.98);
      return {
        key: region.regionId ?? `territory-${index}`,
        count: detectorCount,
        label: region.targetKind ?? `territory-${index}`,
        path: buildSphereBandPolygon(topLatitude, bottomLatitude, longitudeStart, longitudeEnd, rotation.x, rotation.y, 118),
        style: territoryBandStyle(region.targetKind ?? "", index),
        intensity,
        persistenceFrames: region.persistenceFrames ?? 1,
      };
    });
  }, [parsedSummary, playbackPhase, rotation.x, rotation.y]);

  const directionArcs = useMemo(() => {
    const regions = (parsedSummary?.regionContinuity ?? []).slice(0, 4);
    return regions.map((region, index) => {
      const count = region.detectorCount ?? 0;
      const sweep = clamp(count / 18, 0.15, 1);
      const persistence = clamp((region.persistenceFrames ?? 1) / 7, 0.2, 1);
      const divergencePressure = clamp((region.divergencePressure ?? 0) / 3.5, 0, 1);
      const drift = Math.cos((playbackPhase * Math.PI * 2) + index) * (6 + (persistence * 4));
      const latitude = ((region.centerLatitude ?? (-18 + (index * 24))) + 12) + drift;
      const longitudeStart = (region.longitudeStart ?? (-160 + (index * 12))) - (sweep * 18);
      const longitudeStep = 5.2 + (sweep * 2.1);
      const line = Array.from({ length: 49 }, (_, pointIndex) =>
        projectSpherePoint(latitude, longitudeStart + (pointIndex * longitudeStep), rotation.x, rotation.y, 144 + (sweep * 6)),
      );
      return {
        key: region.regionId ?? `direction-${index}`,
        count,
        points: buildSpherePolyline(line, 420, 420),
        label: region.dominantDirection ?? `direction-${index}`,
        style: directionArcStyle(region.dominantDirection ?? "", index),
        dashOffset: ((playbackIndex * 12) + (index * 18)) * (autoplay ? 1 : 0.35),
        opacity: clamp(0.36 + (sweep * 0.26) + (persistence * 0.26) + (divergencePressure * 0.12) + ((region.activityDelta ?? 0) * 0.04), 0.36, 0.96),
      };
    });
  }, [autoplay, parsedSummary, playbackIndex, playbackPhase, rotation.x, rotation.y]);

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    dragStateRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragStateRef.current || dragStateRef.current.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - dragStateRef.current.x;
    const deltaY = event.clientY - dragStateRef.current.y;
    dragStateRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    setRotation((current) => ({
      x: clamp(current.x - (deltaY * 0.008), -1.2, 1.2),
      y: current.y + (deltaX * 0.008),
    }));
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (dragStateRef.current?.pointerId === event.pointerId) {
      dragStateRef.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  const playbackReadout = (
    <div className="saved-state tectonics-sphere-readout">
      <h3>{activeSnapshot ? formatDateTime(activeSnapshot.recordedAt) : "No tectonic movement yet"}</h3>
      {activeSnapshot ? (
        <>
          <p className="memory-detail-lead">Dominant detector: {dominantDetector}. Dominant evolution: {dominantEvolution}.</p>
          <p className="memory-explanation">Temporal phase read: {dominantPhaseShift}. Sustained shifts {parsedSummary?.sustainedShiftMemoryCount ?? 0} / average phase shift {phaseShiftAverage.toFixed(2)}.</p>
          <code>activity {activeSnapshot.totalDetectorActivity.toFixed(2)} / active memories {activeSnapshot.activeMemoryCount}</code>
          <div className="tectonics-playback-row">
            <button
              type="button"
              className="ghost"
              onClick={() => setAutoplay((current) => !current)}
              disabled={chronologicalTimeline.length <= 1}
            >
              {autoplay ? "Pause loop" : "Resume loop"}
            </button>
            <span className="status-pill muted">
              frame {chronologicalTimeline.length ? playbackIndex + 1 : 0} / {chronologicalTimeline.length}
            </span>
          </div>
          {chronologicalTimeline.length > 1 ? (
            <input
              type="range"
              min={0}
              max={chronologicalTimeline.length - 1}
              value={playbackIndex}
              onChange={(event) => {
                setPlaybackIndex(Number(event.target.value));
                setAutoplay(false);
              }}
            />
          ) : null}
          <div className="tectonics-chip-row">
            {(parsedSummary?.detectorTypeBreakdown ?? []).slice(0, 4).map((entry) => (
              <span key={`detector-${entry.key ?? "unknown"}`} className="status-pill">{entry.key ?? "unknown"} {entry.count ?? 0}</span>
            ))}
            {(parsedSummary?.phaseShiftBreakdown ?? []).slice(0, 3).map((entry) => (
              <span key={`phase-${entry.key ?? "unknown"}`} className="status-pill muted">{entry.key ?? "unknown"} {entry.count ?? 0}</span>
            ))}
          </div>
        </>
      ) : (
        <p>Run the context-memory pass to generate the first tectonic frame.</p>
      )}
    </div>
  );

  return (
    <section className="panel tectonics-sphere-panel">
      <div className="panel-header">
        <h2>Tectonic sphere</h2>
        <p>Deep movement under the visible surface. Drag to rotate, and let the last week loop through what the companion has been noticing.</p>
      </div>
      <div className="tectonics-sphere-layout">
        <div className="tectonics-sphere-main">
          <div
            className="tectonics-sphere-stage"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            <div
              className="tectonics-sphere-glow"
              style={{ opacity: glowStrength, transform: `translate(-50%, -50%) scale(${1 + (glowStrength * 0.14)})` }}
            />
            <svg viewBox="0 0 420 420" className="tectonics-sphere-svg" aria-label="Tectonic sphere visualization">
              <defs>
                <linearGradient id="tectonics-pole-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="rgba(116, 221, 255, 0.42)" />
                  <stop offset="28%" stopColor="rgba(88, 183, 236, 0.22)" />
                  <stop offset="50%" stopColor="rgba(72, 154, 214, 0.14)" />
                  <stop offset="72%" stopColor="rgba(58, 117, 186, 0.18)" />
                  <stop offset="100%" stopColor="rgba(30, 63, 126, 0.34)" />
                </linearGradient>
                <radialGradient id="tectonics-core-glow" cx="50%" cy="46%" r="58%">
                  <stop offset="0%" stopColor="rgba(116, 221, 255, 0.28)" />
                  <stop offset="52%" stopColor="rgba(78, 167, 224, 0.14)" />
                  <stop offset="100%" stopColor="rgba(16, 33, 68, 0)" />
                </radialGradient>
              </defs>
              <circle cx="210" cy="210" r="118" className="tectonics-sphere-core" fill="url(#tectonics-pole-gradient)" />
              <circle cx="210" cy="210" r="118" className="tectonics-sphere-core-glow" fill="url(#tectonics-core-glow)" />
              {territoryBands.map((band) => (
                <polygon
                  key={`band-${band.key}`}
                  points={band.path}
                  className="tectonics-territory-band"
                  style={{ fill: band.style.fill, stroke: band.style.stroke, opacity: band.intensity }}
                />
              ))}
              {meridians.map((line, index) => (
                <polyline
                  key={`meridian-${index}`}
                  points={buildSpherePolyline(line, 420, 420)}
                  className="tectonics-wire tectonics-wire-meridian"
                />
              ))}
              {parallels.map((line, index) => (
                <polyline
                  key={`parallel-${index}`}
                  points={buildSpherePolyline(line, 420, 420)}
                  className="tectonics-wire tectonics-wire-parallel"
                />
              ))}
              {pulseNodes.map((node, index) => (
                <circle
                  key={`pulse-${index}`}
                  cx={210 + node.x}
                  cy={210 + node.y}
                  r={(3.5 + ((index % 3) * 1.3)) + ((node.phaseWeight ?? 0) * 4)}
                  className="tectonics-pulse"
                  style={{ opacity: clamp(0.42 + ((node.z + 132) / 264) + ((node.phaseWeight ?? 0) * 0.18), 0.28, 0.98) }}
                />
              ))}
              {directionArcs.map((arc) => (
                <polyline
                  key={`direction-${arc.key}`}
                  points={arc.points}
                  className="tectonics-direction-arc"
                  style={{ stroke: arc.style.stroke, strokeDashoffset: arc.dashOffset, opacity: arc.opacity }}
                />
              ))}
            </svg>
            <div className="tectonics-overlay-note">
              <span>Drag to rotate</span>
              {territoryBands.length ? (
                <div className="tectonics-overlay-legend">
                  {territoryBands.map((band) => (
                    <span key={`legend-territory-${band.key}`} className="tectonics-overlay-chip" title={`${band.label} / ${band.persistenceFrames} frames`}>
                      <span className="tectonics-overlay-swatch" style={{ background: band.style.fill, borderColor: band.style.stroke }} />
                      {band.label} {band.count}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
          {playbackReadout}
        </div>
        {sideContent ? <div className="tectonics-sphere-side">{sideContent}</div> : null}
      </div>
    </section>
  );
});

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
              <strong>{callHandoffLabel(session.handoffKind)} / {callOutcomeLabel(session.outcome)}</strong>
              <code>session {session.id} / {callSessionStateLabel(session.sessionState)}</code>
              <code>{durationLabel(session.durationSeconds)}</code>
              <code>{callFlowSummary(session)}</code>
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
  const [activeTab, setActiveTab] = useState<TabId>("home");
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [savedRows, setSavedRows] = useState<SettingsEntry[]>([]);
  const [companionContextSnapshot, setCompanionContextSnapshot] = useState<CompanionContextSnapshot | null>(null);
  const [companionHomeSnapshot, setCompanionHomeSnapshot] = useState<CompanionHomeSnapshot | null>(null);
  const [snapshot, setSnapshot] = useState<PhaseOneSnapshot | null>(null);
  const [passiveSnapshot, setPassiveSnapshot] = useState<PassiveContextSnapshot | null>(null);
  const [phaseThreeSnapshot, setPhaseThreeSnapshot] = useState<PhaseThreeSnapshot | null>(null);
  const [livedMomentSnapshot, setLivedMomentSnapshot] = useState<LivedMomentSnapshot | null>(null);
  const [realWorldPresenceSnapshot, setRealWorldPresenceSnapshot] = useState<RealWorldPresenceSnapshot | null>(null);
  const [nearbyInterestFilters, setNearbyInterestFilters] = useState<NearbyInterestFilter[]>([]);
  const [decisionSnapshot, setDecisionSnapshot] = useState<DecisionSnapshot | null>(null);
  const [northStarRuntimeSnapshot, setNorthStarRuntimeSnapshot] = useState<NorthStarRuntimeProjection | null>(null);
  const [northStarConnectionsSnapshot, setNorthStarConnectionsSnapshot] = useState<NorthStarConnectionsProjection | null>(null);
  const [callSessionSnapshot, setCallSessionSnapshot] = useState<CallSessionSnapshot | null>(null);
  const [realityCheckSnapshot, setRealityCheckSnapshot] = useState<MvpRealityCheckSnapshot | null>(null);
  const [simulationScenarios, setSimulationScenarios] = useState<SimulationScenario[]>([]);
  const [memoryGrowthSnapshot, setMemoryGrowthSnapshot] = useState<MemoryGrowthSnapshot | null>(null);
  const [memorySystemSnapshot, setMemorySystemSnapshot] = useState<MemorySystemSnapshot | null>(null);
  const [selectedSimulationKey, setSelectedSimulationKey] = useState("single_message_path");
  const [simulationResult, setSimulationResult] = useState<SimulationRunResult | null>(null);
  const [simulationSuiteResult, setSimulationSuiteResult] = useState<SimulationSuiteResult | null>(null);
  const [memoryGrowthSummary, setMemoryGrowthSummary] = useState<string[]>([]);
  const [contextMemorySummary, setContextMemorySummary] = useState<string[]>([]);
  const [companionCategoryForm, setCompanionCategoryForm] = useState<CreateCompanionContextCategoryInput>(defaultCompanionContextCategory);
  const [selectedCategoryIcon, setSelectedCategoryIcon] = useState("spark");
  const [companionContextForm, setCompanionContextForm] = useState<CreateCompanionContextEntryInput>(defaultCompanionContextEntry);
  const [companionContextTagsInput, setCompanionContextTagsInput] = useState("");
  const [editingCompanionContextEntryId, setEditingCompanionContextEntryId] = useState<number | null>(null);
  const [selectedMemoryItemId, setSelectedMemoryItemId] = useState<number | null>(null);
  const [selectedInterpretedMemoryItemId, setSelectedInterpretedMemoryItemId] = useState<number | null>(null);
  const [selectedSavedMomentId, setSelectedSavedMomentId] = useState<number | null>(null);
  const [selectedDecisionId, setSelectedDecisionId] = useState<number | null>(null);
  const [selectedCallSessionId, setSelectedCallSessionId] = useState<number | null>(null);
  const [settingsSection, setSettingsSection] = useState<SettingsSectionId>("overview");
  const [memorySection, setMemorySection] = useState<MemorySectionId>("places");
  const [contextSection, setContextSection] = useState<ContextSectionId>("friends");
  const [passiveSection, setPassiveSection] = useState<PassiveSectionId>("ingest");
  const [judgmentSection, setJudgmentSection] = useState<JudgmentSectionId>("reality");
  const [reviewSection, setReviewSection] = useState<ReviewSectionId>("places");
  const [diagnostics, setDiagnostics] = useState<DiagnosticStatus | null>(null);
  const [voiceSnapshot, setVoiceSnapshot] = useState<VoiceSnapshot | null>(null);
  const [voicePreview, setVoicePreview] = useState<VoiceSynthesisResult | null>(null);
  const [voicePreviewSrc, setVoicePreviewSrc] = useState<string | null>(null);
  const [newNearbyFilterLabel, setNewNearbyFilterLabel] = useState("");
  const [newNearbyFilterDescription, setNewNearbyFilterDescription] = useState("");
  const [newNearbyFilterTags, setNewNearbyFilterTags] = useState("");
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
  const [busyPanel, setBusyPanel] = useState<"companionCategoryCreate" | "companionCategoryDelete" | "companionCategoryUpdate" | "companionContextCreate" | "companionContextUpdate" | "companionContextReorder" | "companionContextArchive" | "place" | "rule" | "reflection" | "memoryGrowth" | "contextMemory" | "contextMemorySeed" | "memoryReview" | "location" | "northStarSession" | "northStarBind" | "northStarHeartbeat" | "northStarMessage" | "northStarCall" | "northStarPull" | "northStarPulse" | "northStarImportReviews" | "northStarTurn" | "northStarLink" | "northStarPairing" | "northStarReset" | "draftDispatch" | "decisions" | "callDecisions" | "reviewPlace" | "reviewRule" | "realitySeed" | "simulationRun" | "runtimeReset" | "simulationSuite" | "voiceDownload" | "voiceRuntime" | "voicePreview" | "voiceCleanup" | "localCleanup" | "callStart" | "callEnd" | "speechSetup" | "callTurn" | "speechStreamStart" | "speechStreamStop" | "northStarAcceptedCall" | "worldPresence" | "nearbyInterestFilter" | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [lastDraftDispatch, setLastDraftDispatch] = useState<DraftedOutreachDispatchResult | null>(null);
  const [lastAutoDispatch, setLastAutoDispatch] = useState<DraftedOutreachAutoDispatchResult | null>(null);
  const [northStarLiveDiagnostics, setNorthStarLiveDiagnostics] = useState<NorthStarLiveDiagnostics>(defaultNorthStarLiveDiagnostics);
  const [northStarIncomingAudioMeter, setNorthStarIncomingAudioMeter] = useState<NorthStarIncomingAudioMeter>(defaultNorthStarIncomingAudioMeter);
  const [northStarRemoteTrackStats, setNorthStarRemoteTrackStats] = useState<NorthStarRemoteTrackStats>(defaultNorthStarRemoteTrackStats);
  const [northStarLiveTurnTransportStats, setNorthStarLiveTurnTransportStats] = useState<NorthStarLiveTurnTransportStats>(defaultNorthStarLiveTurnTransportStats);
  const northStarRtcIceServersRef = useRef<RTCIceServer[] | null>(null);
  const missingAcceptedNorthStarPollsRef = useRef(0);
  const northStarAcceptedSessionStartCallIdRef = useRef<string | null>(null);
  const staleAcceptedHandoffCleanupRef = useRef<number | null>(null);
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
  const [northStarPairingCode, setNorthStarPairingCode] = useState<NorthStarPairingCode | null>(null);
  const [northStarPairingQrSrc, setNorthStarPairingQrSrc] = useState<string | null>(null);

  const activeTabMeta = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];
  const northStarConnectionsVisible = activeTab === "settings" && settingsSection === "connections";
  const unresolvedMomentCount = phaseThreeSnapshot?.savedMoments.filter((moment) => !moment.resolvedAt).length ?? 0;
  const callReadyMomentCount = phaseThreeSnapshot?.savedMoments.filter((moment) => !moment.resolvedAt && moment.confidence >= settings.callConfidenceThreshold).length ?? 0;
  const selectedMemoryItem =
    memoryGrowthSnapshot?.memoryItems.find((item) => item.id === selectedMemoryItemId)
    ?? memoryGrowthSnapshot?.memoryItems[0]
    ?? null;
  const selectedInterpretedMemoryItem =
    memorySystemSnapshot?.memoryItems.find((item) => item.id === selectedInterpretedMemoryItemId)
    ?? memorySystemSnapshot?.memoryItems[0]
    ?? null;
  const visibleInterpretedMemoryItems = memorySystemSnapshot?.memoryItems.slice(0, MAX_INTERPRETED_MEMORIES_UI) ?? [];
  const visibleDetectorRecords = memorySystemSnapshot?.detectorRecords.slice(0, MAX_DETECTOR_RECORDS_UI) ?? [];
  const visibleTectonicTimeline = memorySystemSnapshot?.tectonicTimeline.slice(-MAX_TECTONIC_TIMELINE_UI).reverse() ?? [];
  const latestTectonicSummary = memorySystemSnapshot?.tectonicTimeline.length
    ? parseTectonicSummary(memorySystemSnapshot.tectonicTimeline[memorySystemSnapshot.tectonicTimeline.length - 1].summaryJson)
    : null;
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
  const selectedDecisionExplainability =
    selectedDecision ? decisionExplainability(selectedDecision.decisionMetadataJson) : null;
  const selectedDecisionOutreachMetadata =
    selectedDecisionOutreach ? parseJsonObject(selectedDecisionOutreach.deliveryMetadataJson) : null;
  const draftedOutreachEvents =
    (decisionSnapshot?.outreachEvents ?? []).filter((event) => event.responseState === "drafted");
  const selectedCallSession =
    callSessionSnapshot?.recentSessions.find((session) => session.id === selectedCallSessionId)
    ?? callSessionSnapshot?.activeSession
    ?? callSessionSnapshot?.recentSessions[0]
    ?? null;
  const companionCategories = companionContextSnapshot?.categories ?? [];
  const companionCategoryTabs = companionCategories.map((section) => section.category);
  const selectedCompanionSection =
    companionCategories.find((section) => section.category.key === contextSection)
    ?? companionCategories[0]
    ?? null;
  const homeMapLayout = buildCompanionMapLayout(companionHomeSnapshot?.categories ?? []);
  const visibleCompanionCategoryCount = companionCategories.length;
  const companionContextEntryCount =
    companionContextSnapshot?.categories.reduce((sum, section) => sum + section.entries.length, 0)
    ?? 0;
  const populatedCompanionCategoryCount =
    companionHomeSnapshot?.categories.filter((section) => section.entries.length > 0).length
    ?? 0;
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
  const northStarConnectionHealth = getNorthStarConnectionHealth(northStarConnectionsSnapshot, settings.northStarDeviceToken);
  const northStarActivePhoneCallCount = northStarConnectionsSnapshot?.callSessions.filter((entry) => entry.status === "pending" || entry.status === "accepted").length ?? 0;
  const northStarIdentityLocked = Boolean(settings.northStarSessionToken.trim());
  const northStarDesktopBinding = settings.northStarDeviceToken.trim()
    ? northStarConnectionsSnapshot?.desktops.find((desktop) => desktop.deviceToken === settings.northStarDeviceToken.trim()) ?? null
    : northStarConnectionsSnapshot?.desktops[0] ?? null;
  const northStarPairingUrl = northStarPairingCode
    ? buildNorthStarPairingUrl(
      settings.northStarEndpoint,
      northStarPairingCode.code,
      settings.northStarUserHandle,
      settings.northStarDisplayName,
      northStarConnectionsSnapshot?.desktopName || settings.northStarDisplayName || "NeuralTrainer",
    )
    : "";
  const northStarSessionTokenDisplay = northStarConnectionsSnapshot?.sessionTokenMasked || (settings.northStarSessionToken.trim() ? "Saved locally" : "Not created yet");
  const northStarDeviceTokenDisplay = northStarConnectionsSnapshot?.deviceTokenMasked || (settings.northStarDeviceToken.trim() ? "Saved locally" : "Not bound yet");
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
  async function refreshCompanionContextSnapshot() { setCompanionContextSnapshot(await getCompanionContextSnapshot()); }
  async function refreshCompanionHomeSnapshot() { setCompanionHomeSnapshot(await getCompanionHomeSnapshot()); }
  async function refreshNorthStarSnapshot() { commitNorthStarSnapshot(await getNorthStarSnapshot()); }
  async function refreshNorthStarRuntimeSnapshot() { commitNorthStarRuntimeSnapshot(await getNorthStarRuntimeSnapshot()); }
  async function refreshVoiceSnapshot() { setVoiceSnapshot(await getVoiceSnapshot()); }
  async function refreshSpeechStreamSnapshot() { setSpeechStream(await getSpeechStreamSnapshot()); }
  async function refreshSnapshot() { setSnapshot(await getPhaseOneSnapshot()); }
  async function refreshPassiveSnapshot() { setPassiveSnapshot(await getPassiveContextSnapshot()); }
  async function refreshPhaseThreeSnapshot() { setPhaseThreeSnapshot(await getPhaseThreeSnapshot()); }
  async function refreshLivedMomentSnapshot() { setLivedMomentSnapshot(await getLivedMomentSnapshot()); }
  async function refreshRealWorldPresenceSnapshot() {
    const snapshot = await getRealWorldPresenceSnapshot();
    setRealWorldPresenceSnapshot(snapshot);
    setNearbyInterestFilters(snapshot.nearbyInterestFilters);
  }
  async function refreshRealWorldPresenceSnapshotSafe() {
    try {
      await refreshRealWorldPresenceSnapshot();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }
  async function refreshCallSessionSnapshot() { setCallSessionSnapshot(await getCallSessionSnapshot()); }
  async function refreshDecisionSnapshot() { setDecisionSnapshot(await getDecisionSnapshot()); }
  async function refreshRealityCheckSnapshot() { setRealityCheckSnapshot(await getMvpRealityCheckSnapshot()); }
  async function refreshMemoryGrowthSnapshot() { setMemoryGrowthSnapshot(await getMemoryGrowthSnapshot()); }
  async function refreshMemorySystemSnapshot() { setMemorySystemSnapshot(await getMemorySystemSnapshot()); }

  useEffect(() => {
    if (!companionCategories.length) {
      return;
    }
    const hasSelectedCategory = companionCategories.some((section) => section.category.key === contextSection);
    if (!hasSelectedCategory) {
      const fallbackCategoryKey = companionCategories[0]?.category.key;
      if (fallbackCategoryKey) {
        setContextSection(fallbackCategoryKey);
        setCompanionContextForm((current) => ({
          ...current,
          categoryKey: fallbackCategoryKey,
        }));
      }
    }
  }, [companionCategories, contextSection]);

  useEffect(() => {
    const activeSession = callSessionSnapshot?.activeSession;
    if (
      !activeSession
      || activeSession.handoffKind !== "accepted_handoff"
      || activeSession.sessionState !== "active"
      || busyPanel === "callEnd"
    ) {
      staleAcceptedHandoffCleanupRef.current = null;
      return;
    }
    if (staleAcceptedHandoffCleanupRef.current === activeSession.id) {
      return;
    }
    staleAcceptedHandoffCleanupRef.current = activeSession.id;
    void handleEndCallSession("interrupted");
  }, [
    callSessionSnapshot?.activeSession?.id,
    callSessionSnapshot?.activeSession?.handoffKind,
    callSessionSnapshot?.activeSession?.sessionState,
    busyPanel,
  ]);

  useEffect(() => {
    let active = true;
    async function bootstrap() {
      try {
        const results = await Promise.allSettled([
          loadSettings(),
          getDiagnostics(),
          getCompanionContextSnapshot(),
          getCompanionHomeSnapshot(),
          getNorthStarSnapshot(),
          getVoiceSnapshot(),
          getSpeechStreamSnapshot(),
          getPhaseOneSnapshot(),
          getPassiveContextSnapshot(),
          getPhaseThreeSnapshot(),
          getLivedMomentSnapshot(),
          getDecisionSnapshot(),
          getCallSessionSnapshot(),
          getMvpRealityCheckSnapshot(),
          listSimulationScenarios(),
          getMemoryGrowthSnapshot(),
          getMemorySystemSnapshot(),
        ]);
        if (!active) return;

        const firstError = results.find((result) => result.status === "rejected");
        if (firstError?.status === "rejected") {
          const reason = firstError.reason;
          setError(reason instanceof Error ? reason.message : String(reason));
        }

        const [
          loadedSettings,
          loadedDiagnostics,
          loadedCompanionContextSnapshot,
          loadedCompanionHomeSnapshot,
          loadedNorthStarSnapshot,
          loadedVoiceSnapshot,
          loadedSpeechStream,
          loadedSnapshot,
          loadedPassiveSnapshot,
          loadedPhaseThreeSnapshot,
          loadedLivedMomentSnapshot,
          loadedDecisionSnapshot,
          loadedCallSessionSnapshot,
          loadedRealityCheckSnapshot,
          loadedSimulationScenarios,
          loadedMemoryGrowthSnapshot,
          loadedMemorySystemSnapshot,
        ] = results;

        if (loadedSettings.status === "fulfilled") {
          setSettings(withPromptDefaults(loadedSettings.value));
        }
        if (loadedDiagnostics.status === "fulfilled") {
          setDiagnostics(loadedDiagnostics.value);
        }
        if (loadedCompanionContextSnapshot.status === "fulfilled") {
          setCompanionContextSnapshot(loadedCompanionContextSnapshot.value);
        }
        if (loadedCompanionHomeSnapshot.status === "fulfilled") {
          setCompanionHomeSnapshot(loadedCompanionHomeSnapshot.value);
        }
        if (loadedNorthStarSnapshot.status === "fulfilled") {
          commitNorthStarSnapshot(loadedNorthStarSnapshot.value);
        }
        if (loadedVoiceSnapshot.status === "fulfilled") {
          setVoiceSnapshot(loadedVoiceSnapshot.value);
        }
        if (loadedSpeechStream.status === "fulfilled") {
          setSpeechStream(loadedSpeechStream.value);
        }
        if (loadedSnapshot.status === "fulfilled") {
          setSnapshot(loadedSnapshot.value);
        }
        if (loadedPassiveSnapshot.status === "fulfilled") {
          setPassiveSnapshot(loadedPassiveSnapshot.value);
        }
        if (loadedPhaseThreeSnapshot.status === "fulfilled") {
          setPhaseThreeSnapshot(loadedPhaseThreeSnapshot.value);
        }
        if (loadedLivedMomentSnapshot.status === "fulfilled") {
          setLivedMomentSnapshot(loadedLivedMomentSnapshot.value);
        }
        if (loadedDecisionSnapshot.status === "fulfilled") {
          setDecisionSnapshot(loadedDecisionSnapshot.value);
        }
        if (loadedCallSessionSnapshot.status === "fulfilled") {
          setCallSessionSnapshot(loadedCallSessionSnapshot.value);
        }
        if (loadedRealityCheckSnapshot.status === "fulfilled") {
          setRealityCheckSnapshot(loadedRealityCheckSnapshot.value);
        }
        if (loadedSimulationScenarios.status === "fulfilled") {
          setSimulationScenarios(loadedSimulationScenarios.value);
        }
        if (loadedMemoryGrowthSnapshot.status === "fulfilled") {
          setMemoryGrowthSnapshot(loadedMemoryGrowthSnapshot.value);
        }
        if (loadedMemorySystemSnapshot.status === "fulfilled") {
          setMemorySystemSnapshot(loadedMemorySystemSnapshot.value);
        }
        void refreshRealWorldPresenceSnapshotSafe();
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
    if (!northStarPairingUrl) {
      setNorthStarPairingQrSrc(null);
      return;
    }
    let cancelled = false;
    void QRCode.toDataURL(northStarPairingUrl, {
      margin: 1,
      width: 220,
      color: {
        dark: "#0b141a",
        light: "#f6fbff",
      },
    }).then((value: string) => {
      if (!cancelled) {
        setNorthStarPairingQrSrc(value);
      }
    }).catch(() => {
      if (!cancelled) {
        setNorthStarPairingQrSrc(null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [northStarPairingUrl]);

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

  useEffect(() => {
    setCompanionContextForm((current) => ({ ...current, categoryKey: contextSection }));
  }, [contextSection]);

  useEffect(() => {
    if (!companionCategories.length) {
      return;
    }
    const exists = companionCategories.some((section) => section.category.key === contextSection);
    if (!exists) {
      setContextSection(companionCategories[0].category.key);
    }
  }, [companionCategories, contextSection]);

  useEffect(() => {
    if (selectedCompanionSection) {
      setSelectedCategoryIcon(selectedCompanionSection.category.icon || "spark");
    }
  }, [selectedCompanionSection?.category.key, selectedCompanionSection?.category.icon]);

  function resetCompanionContextForm(categoryKey = contextSection) {
    setEditingCompanionContextEntryId(null);
    setCompanionContextForm({
      ...defaultCompanionContextEntry,
      categoryKey,
    });
    setCompanionContextTagsInput("");
  }

  function beginEditingCompanionContextEntry(entry: CompanionContextEntry) {
    setEditingCompanionContextEntryId(entry.id);
    setContextSection(entry.categoryKey as ContextSectionId);
    setCompanionContextForm({
      categoryKey: entry.categoryKey,
      title: entry.title,
      body: entry.body,
      tags: entry.tags,
      notes: entry.notes,
    });
    setCompanionContextTagsInput(formatTagList(entry.tags));
  }

  async function handleCompanionContextSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusyPanel(editingCompanionContextEntryId ? "companionContextUpdate" : "companionContextCreate");
    setError("");
    setMessage("");
    try {
      const payloadBase = {
        ...companionContextForm,
        categoryKey: contextSection,
        title: companionContextForm.title.trim(),
        body: companionContextForm.body.trim(),
        tags: parseTagList(companionContextTagsInput),
        notes: companionContextForm.notes.trim(),
      };

      if (editingCompanionContextEntryId) {
        await updateCompanionContextEntry({
          id: editingCompanionContextEntryId,
          title: payloadBase.title,
          body: payloadBase.body,
          tags: payloadBase.tags,
          notes: payloadBase.notes,
          isActive: true,
        });
        setMessage("Companion context entry updated.");
      } else {
        await createCompanionContextEntry(payloadBase);
        setMessage("Companion context entry added.");
      }

      await Promise.all([refreshCompanionContextSnapshot(), refreshCompanionHomeSnapshot()]);
      resetCompanionContextForm(contextSection);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusyPanel(null);
    }
  }

  async function handleArchiveCompanionContextEntry(id: number) {
    setBusyPanel("companionContextArchive");
    setError("");
    setMessage("");
    try {
      await archiveCompanionContextEntry(id);
      await Promise.all([refreshCompanionContextSnapshot(), refreshCompanionHomeSnapshot()]);
      if (editingCompanionContextEntryId === id) {
        resetCompanionContextForm(contextSection);
      }
      setMessage("Companion context entry archived.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusyPanel(null);
    }
  }

  async function moveCompanionContextEntry(entryId: number, direction: -1 | 1) {
    if (!selectedCompanionSection) {
      return;
    }
    const orderedIds = selectedCompanionSection.entries.map((entry) => entry.id);
    const currentIndex = orderedIds.indexOf(entryId);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= orderedIds.length) {
      return;
    }
    const reorderedIds = [...orderedIds];
    const [moved] = reorderedIds.splice(currentIndex, 1);
    reorderedIds.splice(nextIndex, 0, moved);

    setBusyPanel("companionContextReorder");
    setError("");
    setMessage("");
    try {
      const snapshot = await reorderCompanionContextEntries({
        categoryKey: selectedCompanionSection.category.key,
        entryIds: reorderedIds,
      });
      setCompanionContextSnapshot(snapshot);
      await refreshCompanionHomeSnapshot();
      setMessage("Companion context order updated.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusyPanel(null);
    }
  }

  async function handleDeleteCompanionCategory(categoryKey: ContextSectionId) {
    setBusyPanel("companionCategoryDelete");
    setError("");
    setMessage("");
    try {
      const snapshot = await deleteCompanionContextCategory({ categoryKey });
      setCompanionContextSnapshot(snapshot);
      await refreshCompanionHomeSnapshot();
      setContextSection(snapshot.categories[0]?.category.key ?? "friends");
      resetCompanionContextForm(snapshot.categories[0]?.category.key ?? "friends");
      setMessage("Category deleted from active companion context.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusyPanel(null);
    }
  }

  async function handleUpdateCompanionCategoryIcon(payload: UpdateCompanionContextCategoryIconInput) {
    setBusyPanel("companionCategoryUpdate");
    setError("");
    setMessage("");
    try {
      await updateCompanionContextCategoryIcon(payload);
      await Promise.all([refreshCompanionContextSnapshot(), refreshCompanionHomeSnapshot()]);
      setMessage("Category icon updated.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusyPanel(null);
    }
  }

  async function handleCompanionCategorySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusyPanel("companionCategoryCreate");
    setError("");
    setMessage("");
    try {
      const category = await createCompanionContextCategory({
        label: companionCategoryForm.label.trim(),
        description: companionCategoryForm.description.trim(),
        icon: companionCategoryForm.icon,
      });
      await Promise.all([refreshCompanionContextSnapshot(), refreshCompanionHomeSnapshot()]);
      setContextSection(category.key);
      setCompanionCategoryForm(defaultCompanionContextCategory);
      setMessage("Companion context category added.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusyPanel(null);
    }
  }

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

  async function persistCurrentSettings(nextSettings: AppSettings = settings) {
    await saveSettings(nextSettings);
  }

  function handleResetPromptField(key: PromptSettingKey) {
    setSettings((current) => ({ ...current, [key]: defaultSettings[key] }));
  }

  async function ensureNorthStarLinkedSnapshot() {
    let snapshot = northStarSnapshotCacheRef.current;
    if (!snapshot?.sessionReady) {
      snapshot = await createNorthStarSession();
      commitNorthStarSnapshot(snapshot, { forceConnections: true });
    }
    const currentDeviceToken = settings.northStarDeviceToken.trim();
    const linkedDesktopExists = Boolean(currentDeviceToken && snapshot?.desktops.some((desktop) => desktop.deviceToken === currentDeviceToken));
    if (!currentDeviceToken || !linkedDesktopExists) {
      snapshot = await bindNorthStarDesktop();
      commitNorthStarSnapshot(snapshot, { forceConnections: true });
    }
    snapshot = await sendNorthStarHeartbeat();
    commitNorthStarSnapshot(snapshot, { forceConnections: true });
    return snapshot;
  }

  async function handleCreateNorthStarSession() {
    setBusyPanel("northStarSession");
    setError("");
    setMessage("");
    try {
      await persistCurrentSettings();
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
      await persistCurrentSettings();
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
      await persistCurrentSettings();
      const currentDeviceToken = settings.northStarDeviceToken.trim();
      const linkedDesktopExists = Boolean(currentDeviceToken && northStarSnapshotCacheRef.current?.desktops.some((desktop) => desktop.deviceToken === currentDeviceToken));
      await ensureNorthStarLinkedSnapshot();
      const loaded = await loadSettings();
      setSettings(withPromptDefaults(loaded));
      setMessage(linkedDesktopExists ? "North Star connection refreshed." : "North Star is linked and ready for calls.");
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
      await persistCurrentSettings();
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

  async function handlePrepareNorthStarPairing() {
    setBusyPanel("northStarPairing");
    setError("");
    setMessage("");
    try {
      const normalizedUserHandle = settings.northStarUserHandle.trim();
      const desiredHandle = normalizedUserHandle.toLowerCase();
      const currentHandle = northStarConnectionsSnapshot?.userHandle.trim().toLowerCase() ?? "";
      const nextSettings = withPromptDefaults({
        ...settings,
        northStarUserHandle: normalizedUserHandle,
        northStarDisplayName: deriveNorthStarDisplayName(normalizedUserHandle),
        northStarSessionToken: currentHandle && desiredHandle && currentHandle !== desiredHandle ? "" : settings.northStarSessionToken,
        northStarDeviceToken: currentHandle && desiredHandle && currentHandle !== desiredHandle ? "" : settings.northStarDeviceToken,
        northStarLastLocationEventId: currentHandle && desiredHandle && currentHandle !== desiredHandle ? "" : settings.northStarLastLocationEventId,
      });
      setSettings(nextSettings);
      if (currentHandle && desiredHandle && currentHandle !== desiredHandle) {
        northStarSnapshotCacheRef.current = null;
        setNorthStarConnectionsSnapshot(null);
        setNorthStarRuntimeSnapshot(null);
      }
      await persistCurrentSettings(nextSettings);
      await ensureNorthStarLinkedSnapshot();
      const pairing = await createNorthStarPairingCode();
      setNorthStarPairingCode(pairing);
      setMessage("Phone pairing is ready. Scan the QR code in North Star on the phone.");
      await refreshDiagnostics();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusyPanel(null);
    }
  }

  async function handleResetNorthStarConnection() {
    if (!window.confirm("Clear the saved North Star session and desktop link on this computer?")) {
      return;
    }
    setBusyPanel("northStarReset");
    setError("");
    setMessage("");
    try {
      const nextSettings = withPromptDefaults({
        ...settings,
        northStarSessionToken: "",
        northStarDeviceToken: "",
        northStarLastLocationEventId: "",
      });
      setSettings(nextSettings);
      await saveSettings(nextSettings);
      northStarSnapshotCacheRef.current = null;
      setNorthStarConnectionsSnapshot(null);
      setNorthStarRuntimeSnapshot(null);
      setNorthStarPairingCode(null);
      setNorthStarPairingQrSrc(null);
      setMessage("North Star link cleared on this desktop. You can now reconnect or switch handles safely.");
      await Promise.all([refreshNorthStarSnapshot(), refreshNorthStarRuntimeSnapshot(), refreshDiagnostics()]);
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
      await persistCurrentSettings();
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
      await persistCurrentSettings();
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

  async function handleNorthStarRequestLocationPulse() {
    setBusyPanel("northStarPulse");
    setError("");
    setMessage("");
    try {
      await persistCurrentSettings();
      const baselineEventCount = northStarConnectionsSnapshot?.locationEventCount ?? 0;
      let snapshot = await requestNorthStarLocationPulse();
      commitNorthStarSnapshot(snapshot, { forceConnections: true });
      setMessage(snapshot.detail);
      await refreshDiagnostics();

      for (let attempt = 0; attempt < 6; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 5000));
        snapshot = await pullNorthStarLocationEvents();
        commitNorthStarSnapshot(snapshot, { forceConnections: true });
        if (snapshot.locationEvents.length > baselineEventCount) {
          setMessage(snapshot.detail);
          await Promise.all([refreshDiagnostics(), refreshPassiveSnapshot(), refreshPhaseThreeSnapshot(), refreshDecisionSnapshot()]);
          return;
        }
      }

      setMessage("Location pulse was sent, but no fresh phone location arrived yet.");
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
      await persistCurrentSettings();
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
      await persistCurrentSettings();
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
      await Promise.all([refreshPassiveSnapshot(), refreshPhaseThreeSnapshot(), refreshLivedMomentSnapshot(), refreshRealWorldPresenceSnapshot(), refreshDiagnostics(), refreshRealityCheckSnapshot()]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusyPanel(null);
    }
  }

  async function handleRefreshLivedMoment() {
    setError("");
    setMessage("");
    setBusyPanel("worldPresence");
    try {
      await Promise.all([refreshLivedMomentSnapshot(), refreshRealWorldPresenceSnapshot()]);
      setMessage("Lived-moment and world-presence interpretation refreshed.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusyPanel(null);
    }
  }

  function parseNearbyInterestTags(raw: string) {
    return raw
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  async function handleCreateNearbyInterestFilter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setBusyPanel("nearbyInterestFilter");
    try {
      const filters = await createNearbyInterestFilter({
        label: newNearbyFilterLabel.trim(),
        description: newNearbyFilterDescription.trim(),
        tags: parseNearbyInterestTags(newNearbyFilterTags),
      });
      setNearbyInterestFilters(filters);
      await refreshRealWorldPresenceSnapshot();
      setNewNearbyFilterLabel("");
      setNewNearbyFilterDescription("");
      setNewNearbyFilterTags("");
      setMessage("Added a nearby-interest filter for world discovery.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusyPanel(null);
    }
  }

  async function handleToggleNearbyInterestFilter(filter: NearbyInterestFilter) {
    setError("");
    setMessage("");
    setBusyPanel("nearbyInterestFilter");
    try {
      const payload: UpdateNearbyInterestFilterInput = {
        id: filter.id,
        label: filter.label,
        description: filter.description,
        tags: filter.tags,
        isEnabled: !filter.isEnabled,
      };
      const filters = await updateNearbyInterestFilter(payload);
      setNearbyInterestFilters(filters);
      await refreshRealWorldPresenceSnapshot();
      setMessage(`${filter.label} is now ${filter.isEnabled ? "hidden from" : "included in"} nearby discovery.`);
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

  async function handleDispatchDraftedOutreach(outreachEventId: number) {
    setBusyPanel("draftDispatch");
    setError("");
    setMessage("");
    try {
      const result = await dispatchDraftedOutreach(outreachEventId);
      setLastDraftDispatch(result);
      setMessage(result.northStarDetail);
      await Promise.all([
        refreshDecisionSnapshot(),
        refreshCallSessionSnapshot(),
        refreshDiagnostics(),
      ]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusyPanel(null);
    }
  }

  async function handleDispatchNextDraftedOutreach() {
    setBusyPanel("draftDispatch");
    setError("");
    setMessage("");
    try {
      const result = await dispatchNextDraftedOutreach();
      setLastAutoDispatch(result);
      if (result.dispatch) {
        setLastDraftDispatch(result.dispatch);
      }
      setMessage(result.detail);
      await Promise.all([
        refreshDecisionSnapshot(),
        refreshCallSessionSnapshot(),
        refreshDiagnostics(),
      ]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusyPanel(null);
    }
  }

  async function handleAutoDispatchEligibleOutreach() {
    setBusyPanel("draftDispatch");
    setError("");
    setMessage("");
    try {
      const result = await autoDispatchEligibleOutreach();
      setLastAutoDispatch(result);
      if (result.dispatch) {
        setLastDraftDispatch(result.dispatch);
      }
      setMessage(result.detail);
      await Promise.all([
        refreshDecisionSnapshot(),
        refreshCallSessionSnapshot(),
        refreshDiagnostics(),
      ]);
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

  async function handleRunContextMemory() {
    setBusyPanel("contextMemory");
    setError("");
    setMessage("");
    try {
      const nextSnapshot = await runContextMemoryPass();
      setMemorySystemSnapshot(nextSnapshot);
      const summary = [
        `${nextSnapshot.overview.totalMemoryCount} interpreted memories tracked.`,
        `${nextSnapshot.overview.detectorCount} detector records are active.`,
        `${nextSnapshot.overview.tectonicSnapshotCount} tectonic snapshots captured.`,
      ];
      setContextMemorySummary(summary);
      setMessage(`Context-to-memory pass complete. ${summary[0]}`);
      await Promise.all([refreshDiagnostics(), refreshCompanionContextSnapshot(), refreshCompanionHomeSnapshot(), refreshLivedMomentSnapshot(), refreshRealWorldPresenceSnapshot()]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusyPanel(null);
    }
  }

  async function handleSeedContextMemoryExample(scenarioKey: "support" | "contradiction") {
    setBusyPanel("contextMemorySeed");
    setError("");
    setMessage("");
    try {
      const nextSnapshot = await seedContextMemoryExample(scenarioKey);
      setMemorySystemSnapshot(nextSnapshot);
      setSelectedInterpretedMemoryItemId(
        nextSnapshot.memoryItems.find((item) => item.sourceEntryTitle === "[Seed] Akai MPC")?.id ?? nextSnapshot.memoryItems[0]?.id ?? null,
      );
      await Promise.all([
        refreshCompanionContextSnapshot(),
        refreshCompanionHomeSnapshot(),
        refreshLivedMomentSnapshot(),
        refreshRealWorldPresenceSnapshot(),
      ]);
      setContextMemorySummary([
        `${nextSnapshot.overview.totalMemoryCount} interpreted memories tracked.`,
        `${nextSnapshot.overview.detectorCount} detector records are active.`,
        `${nextSnapshot.overview.tectonicSnapshotCount} tectonic snapshots captured.`,
      ]);
      setMessage(
        scenarioKey === "support"
          ? "Seeded a support example for [Seed] Akai MPC and ran the context-memory pass."
          : "Seeded a contradiction example for [Seed] Akai MPC and ran the context-memory pass.",
      );
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
      await Promise.all([refreshSnapshot(), refreshDiagnostics(), refreshLivedMomentSnapshot(), refreshRealWorldPresenceSnapshot()]);
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
        refreshLivedMomentSnapshot(),
        refreshRealWorldPresenceSnapshot(),
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
        refreshLivedMomentSnapshot(),
        refreshRealWorldPresenceSnapshot(),
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
    if (!window.confirm("Clear generated runtime and memory data while keeping settings and manual context?")) {
      return;
    }
    setBusyPanel("runtimeReset");
    setError("");
    setMessage("");
    try {
      await resetRuntimeData();
      setSimulationResult(null);
      setSimulationSuiteResult(null);
      setSelectedMemoryItemId(null);
      setSelectedInterpretedMemoryItemId(null);
      setSelectedSavedMomentId(null);
      setSelectedDecisionId(null);
      setSelectedCallSessionId(null);
      await Promise.all([
        refreshSnapshot(),
        refreshMemoryGrowthSnapshot(),
        refreshMemorySystemSnapshot(),
        refreshCompanionContextSnapshot(),
        refreshCompanionHomeSnapshot(),
        refreshPassiveSnapshot(),
        refreshPhaseThreeSnapshot(),
        refreshLivedMomentSnapshot(),
        refreshRealWorldPresenceSnapshot(),
        refreshDecisionSnapshot(),
        refreshCallSessionSnapshot(),
        refreshRealityCheckSnapshot(),
        refreshNorthStarSnapshot(),
        refreshDiagnostics(),
      ]);
      setMessage("Generated runtime and memory data were cleared. Settings and manual context were kept.");
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
    items: Array<{ id: T; label: ReactNode }>,
    current: T | string,
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
          { id: "companion", label: "Companion" },
          { id: "connections", label: "Connections" },
          { id: "location", label: "Location" },
          { id: "voice", label: "Voice" },
          { id: "diagnostics", label: "Diagnostics" },
        ], settingsSection, setSettingsSection)}

        {(settingsSection === "companion" || settingsSection === "core" || settingsSection === "connections" || settingsSection === "location" || settingsSection === "voice") ? (
          <section className="panel">
            <form className="settings-form" onSubmit={handleSettingsSubmit}>
              {(settingsSection === "companion" || settingsSection === "core") ? (
                <>
                  <div className="panel-header">
                    <h2>Companion settings</h2>
                    <p>Quiet hours, baseline outreach posture, and the small system choices that shape how the companion behaves around you.</p>
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
                      <p>Enter the North Star user handle once, then pair the phone by scanning the QR code. Everything else should happen automatically.</p>
                      <label>
                        <span>North Star user handle</span>
                        <input
                          value={settings.northStarUserHandle}
                          onChange={(event) => setSettings((current) => ({
                            ...current,
                            northStarUserHandle: event.target.value,
                            northStarDisplayName: deriveNorthStarDisplayName(event.target.value),
                          }))}
                          placeholder="savvy"
                        />
                      </label>
                      {northStarConnectionsSnapshot ? (
                        <>
                          <dl className="facts">
                            <div><dt>Link</dt><dd>{northStarConnectionHealth.label}</dd></div>
                            <div><dt>Companion</dt><dd>{northStarConnectionsSnapshot.displayName || "North Star"}</dd></div>
                            <div><dt>Desktop</dt><dd>{northStarConnectionsSnapshot.desktopName}</dd></div>
                          </dl>
                          <p><strong>Status</strong><br />{northStarConnectionHealth.headline}</p>
                          <div className="button-row">
                            <button type="button" onClick={handlePrepareNorthStarPairing} disabled={busyPanel === "northStarPairing" || !settings.northStarUserHandle.trim()}>
                              {busyPanel === "northStarPairing" ? "Preparing pairing..." : "Pair a phone"}
                            </button>
                          </div>
                          {northStarPairingCode ? (
                            <div className="saved-state">
                              <h4>Phone pairing</h4>
                              <p>Open North Star on the phone and scan this QR code. The phone will pick up the handle and connect by itself.</p>
                              {northStarPairingQrSrc ? (
                                <img src={northStarPairingQrSrc} alt="North Star phone pairing QR code" style={{ width: 220, maxWidth: "100%", borderRadius: "0.75rem", background: "#f6fbff", padding: "0.75rem" }} />
                              ) : (
                                <p>QR code is preparing...</p>
                              )}
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <>
                          <p>Pairing can still start from here even if live North Star status has not loaded yet.</p>
                          <div className="button-row">
                            <button type="button" onClick={handlePrepareNorthStarPairing} disabled={busyPanel === "northStarPairing" || !settings.northStarUserHandle.trim()}>
                              {busyPanel === "northStarPairing" ? "Preparing pairing..." : "Pair a phone"}
                            </button>
                          </div>
                          {northStarPairingCode ? (
                            <div className="saved-state">
                              <h4>Phone pairing</h4>
                              <p>Open North Star on the phone and scan this QR code. The phone will pick up the handle and connect by itself.</p>
                              {northStarPairingQrSrc ? (
                                <img src={northStarPairingQrSrc} alt="North Star phone pairing QR code" style={{ width: 220, maxWidth: "100%", borderRadius: "0.75rem", background: "#f6fbff", padding: "0.75rem" }} />
                              ) : (
                                <p>QR code is preparing...</p>
                              )}
                            </div>
                          ) : null}
                        </>
                      )}
                    </div>
                  <div className="split">
                    <label><span>LM Studio endpoint</span><input value={settings.lmStudioEndpoint} onChange={(event) => setSettings((current) => ({ ...current, lmStudioEndpoint: event.target.value }))} /></label>
                    <label><span>LM Studio model</span><input value={settings.lmStudioModel} onChange={(event) => setSettings((current) => ({ ...current, lmStudioModel: event.target.value }))} /></label>
                  </div>
                  <label><span>LM Studio API key</span><input type="password" value={settings.lmStudioApiKey} onChange={(event) => setSettings((current) => ({ ...current, lmStudioApiKey: event.target.value }))} /></label>
                </>
              ) : settingsSection === "location" ? (
                <>
                  <div className="panel-header">
                    <h2>Location</h2>
                    <p>Request a fresh location from North Star and confirm that the phone is answering pulses when needed.</p>
                  </div>
                  <div className="saved-state">
                    <h3>North Star location link</h3>
                    <p>If the phone is paired and location permission is allowed, NeuralTrainer can ask North Star for a fresh location pulse whenever it needs one.</p>
                    <dl className="facts">
                      <div><dt>Link</dt><dd>{northStarConnectionHealth.label}</dd></div>
                      <div><dt>Desktop</dt><dd>{northStarConnectionsSnapshot?.desktopName || "Waiting"}</dd></div>
                      <div><dt>Phone location events</dt><dd>{northStarConnectionsSnapshot?.locationEventCount ?? 0}</dd></div>
                      <div><dt>Desktop binding</dt><dd>{northStarDesktopBinding?.status || "Waiting"}</dd></div>
                    </dl>
                    <p><strong>Status</strong><br />{northStarConnectionsSnapshot?.detail || "North Star location status will appear here once the phone link is active."}</p>
                    <div className="button-row">
                      <button type="button" onClick={handleNorthStarRequestLocationPulse} disabled={busyPanel === "northStarPulse" || !settings.northStarUserHandle.trim()}>
                        {busyPanel === "northStarPulse" ? "Requesting..." : "Request phone location"}
                      </button>
                      <button type="button" className="ghost" onClick={handleNorthStarPullLocations} disabled={busyPanel === "northStarPull" || !settings.northStarUserHandle.trim()}>
                        {busyPanel === "northStarPull" ? "Syncing..." : "Sync latest phone locations"}
                      </button>
                    </div>
                    <p>The normal expected flow is: request the pulse here, North Star answers it on the phone, then the fresh location shows up in Passive Context.</p>
                  </div>
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
          { id: "tectonics", label: "Tectonics" },
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

        {memorySection === "tectonics" ? (
          <div className="grid two-up">
            <section className="panel">
              <div className="panel-header"><h2>Context to memory</h2><p>Interpret manual companion context into active memory, detector movement, and tectonic timeline snapshots.</p></div>
              <div className="actions">
                <button type="button" onClick={() => void handleRunContextMemory()} disabled={busyPanel === "contextMemory"}>
                  {busyPanel === "contextMemory" ? "Interpreting..." : "Run context-memory pass"}
                </button>
                <button type="button" className="ghost" onClick={() => void handleSeedContextMemoryExample("support")} disabled={busyPanel === "contextMemorySeed"}>
                  {busyPanel === "contextMemorySeed" ? "Seeding..." : "Seed support example"}
                </button>
                <button type="button" className="ghost" onClick={() => void handleSeedContextMemoryExample("contradiction")} disabled={busyPanel === "contextMemorySeed"}>
                  {busyPanel === "contextMemorySeed" ? "Seeding..." : "Seed contradiction example"}
                </button>
                <button type="button" className="ghost danger" onClick={() => void handleResetRuntimeData()} disabled={busyPanel === "runtimeReset"}>
                  {busyPanel === "runtimeReset" ? "Clearing..." : "Clear generated data"}
                </button>
              </div>
              <p className="memory-explanation">Clears derived memory, tectonic snapshots, passive/runtime traces, and call or outreach history while keeping settings and manual context.</p>
              <p className="memory-explanation">The seed buttons create or refresh a clearly named manual entry, `[Seed] Akai MPC`, add matching lived call and review evidence, and run the pass for you.</p>
              {contextMemorySummary.length ? (
                <div className="saved-state">
                  <h3>Last pass</h3>
                  <ul>{contextMemorySummary.map((line) => <li key={line}>{line}</li>)}</ul>
                </div>
              ) : null}
              {memorySystemSnapshot ? (
                <>
                  <dl className="facts">
                    <div><dt>Interpreted memories</dt><dd>{memorySystemSnapshot.overview.totalMemoryCount}</dd></div>
                    <div><dt>Active</dt><dd>{memorySystemSnapshot.overview.activeMemoryCount}</dd></div>
                    <div><dt>Historical</dt><dd>{memorySystemSnapshot.overview.historicalMemoryCount}</dd></div>
                    <div><dt>Detectors</dt><dd>{memorySystemSnapshot.overview.detectorCount}</dd></div>
                    <div><dt>Tectonic snapshots</dt><dd>{memorySystemSnapshot.overview.tectonicSnapshotCount}</dd></div>
                    <div><dt>Last pass</dt><dd>{memorySystemSnapshot.overview.lastPassAt ? formatDateTime(memorySystemSnapshot.overview.lastPassAt) : "not run yet"}</dd></div>
                  </dl>
                  <div className="saved-state">
                    <h3>Breakdown</h3>
                    <ul>{memorySystemSnapshot.overview.memoryTypeBreakdown.length ? memorySystemSnapshot.overview.memoryTypeBreakdown.map((item) => <li key={item.key}><strong>{item.key}</strong><code>{item.count}</code></li>) : <li>No interpreted memories yet.</li>}</ul>
                  </div>
                </>
              ) : <p>Loading context-memory system...</p>}
            </section>

            <section className="panel">
              <div className="panel-header"><h2>Interpreted memories</h2><p>Chosen self-description turned into active memory items with declared truth, salience, and lifecycle state.</p></div>
              <div className="saved-state scroll-panel">
                {memorySystemSnapshot && memorySystemSnapshot.memoryItems.length > visibleInterpretedMemoryItems.length ? (
                  <p className="panel-limit-note">Showing the first {visibleInterpretedMemoryItems.length} of {memorySystemSnapshot.memoryItems.length} interpreted memories.</p>
                ) : null}
                <ul>{visibleInterpretedMemoryItems.length ? visibleInterpretedMemoryItems.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={`memory-item-button ${selectedInterpretedMemoryItem?.id === item.id ? "active" : ""}`}
                      onClick={() => setSelectedInterpretedMemoryItemId(item.id)}
                    >
                      <strong>{item.memoryType} / {item.status}</strong>
                      <code>{item.sourceEntryTitle} / {item.sourceCategoryKey}</code>
                      <code>confidence {item.confidence.toFixed(2)} / salience {item.salience.toFixed(2)} / sensitivity {item.sensitivity}</code>
                    </button>
                  </li>
                )) : <li>No interpreted memories yet.</li>}</ul>
              </div>
            </section>

            <section className="panel">
              <div className="panel-header"><h2>Selected interpreted memory</h2><p>What the companion is carrying from manual context, and how detector movement is changing that reading.</p></div>
              {selectedInterpretedMemoryItem ? (
                <div className="saved-state">
                  <h3>{selectedInterpretedMemoryItem.sourceEntryTitle}</h3>
                  <p className="memory-detail-lead">{selectedInterpretedMemoryItem.summary}</p>
                  <code>{selectedInterpretedMemoryItem.memoryType} / {selectedInterpretedMemoryItem.status}</code>
                  <code>declared by user {selectedInterpretedMemoryItem.declaredByUser ? "yes" : "no"} / confidence {selectedInterpretedMemoryItem.confidence.toFixed(2)} / salience {selectedInterpretedMemoryItem.salience.toFixed(2)}</code>
                  <p className="memory-explanation"><strong>Detail:</strong> {selectedInterpretedMemoryItem.detail}</p>
                  {selectedInterpretedMemoryItem.tags.length ? <p className="memory-explanation"><strong>Tags:</strong> {selectedInterpretedMemoryItem.tags.join(", ")}</p> : null}
                  <p className="memory-explanation"><strong>Created:</strong> {formatDateTime(selectedInterpretedMemoryItem.createdAt)}</p>
                  <p className="memory-explanation"><strong>Last observed:</strong> {formatDateTime(selectedInterpretedMemoryItem.lastObservedAt)}</p>
                  {memorySystemSnapshot?.evolutionStates.find((state) => state.memoryItemId === selectedInterpretedMemoryItem.id) ? (
                    <>
                      <p className="memory-explanation"><strong>Evolution state:</strong> {memorySystemSnapshot.evolutionStates.find((state) => state.memoryItemId === selectedInterpretedMemoryItem.id)?.currentStatus}</p>
                      <p className="memory-explanation"><strong>Truth alignment:</strong> {memorySystemSnapshot.evolutionStates.find((state) => state.memoryItemId === selectedInterpretedMemoryItem.id)?.truthAlignment}</p>
                      <p className="memory-explanation"><strong>Phase shift:</strong> {memorySystemSnapshot.evolutionStates.find((state) => state.memoryItemId === selectedInterpretedMemoryItem.id)?.phaseShiftState}</p>
                      <code>{memorySystemSnapshot.evolutionStates.find((state) => state.memoryItemId === selectedInterpretedMemoryItem.id)?.observedTruthSummary}</code>
                      <code>{memorySystemSnapshot.evolutionStates.find((state) => state.memoryItemId === selectedInterpretedMemoryItem.id)?.observedEvidenceSummary}</code>
                      <code>{memorySystemSnapshot.evolutionStates.find((state) => state.memoryItemId === selectedInterpretedMemoryItem.id)?.phaseShiftSummary}</code>
                      <code>{memorySystemSnapshot.evolutionStates.find((state) => state.memoryItemId === selectedInterpretedMemoryItem.id)?.alignmentSummary}</code>
                      <code>declared {memorySystemSnapshot.evolutionStates.find((state) => state.memoryItemId === selectedInterpretedMemoryItem.id)?.declaredConfidence.toFixed(2)} / observed {memorySystemSnapshot.evolutionStates.find((state) => state.memoryItemId === selectedInterpretedMemoryItem.id)?.observedConfidence.toFixed(2)} / divergence {memorySystemSnapshot.evolutionStates.find((state) => state.memoryItemId === selectedInterpretedMemoryItem.id)?.divergenceScore.toFixed(2)}</code>
                      <code>cumulative support {memorySystemSnapshot.evolutionStates.find((state) => state.memoryItemId === selectedInterpretedMemoryItem.id)?.cumulativeSupportScore.toFixed(2)} / cumulative challenge {memorySystemSnapshot.evolutionStates.find((state) => state.memoryItemId === selectedInterpretedMemoryItem.id)?.cumulativeChallengeScore.toFixed(2)} / cumulative divergence {memorySystemSnapshot.evolutionStates.find((state) => state.memoryItemId === selectedInterpretedMemoryItem.id)?.cumulativeDivergenceScore.toFixed(2)}</code>
                      <code>support sources {memorySystemSnapshot.evolutionStates.find((state) => state.memoryItemId === selectedInterpretedMemoryItem.id)?.supportSourceCount ?? 0} / challenge sources {memorySystemSnapshot.evolutionStates.find((state) => state.memoryItemId === selectedInterpretedMemoryItem.id)?.challengeSourceCount ?? 0} / source coherence {(memorySystemSnapshot.evolutionStates.find((state) => state.memoryItemId === selectedInterpretedMemoryItem.id)?.sourceCoherenceScore ?? 0).toFixed(2)}</code>
                      <code>sustained divergence {(memorySystemSnapshot.evolutionStates.find((state) => state.memoryItemId === selectedInterpretedMemoryItem.id)?.sustainedDivergenceScore ?? 0).toFixed(2)} / phase shift score {(memorySystemSnapshot.evolutionStates.find((state) => state.memoryItemId === selectedInterpretedMemoryItem.id)?.phaseShiftScore ?? 0).toFixed(2)}</code>
                    </>
                  ) : null}
                </div>
              ) : (
                <p>No interpreted memory selected yet.</p>
              )}
            </section>

            <section className="panel">
              <div className="panel-header"><h2>Detector movement</h2><p>The kinds of movement the companion is noticing, not final truths.</p></div>
              <div className="saved-state scroll-panel">
                {memorySystemSnapshot && memorySystemSnapshot.detectorRecords.length > visibleDetectorRecords.length ? (
                  <p className="panel-limit-note">Showing the first {visibleDetectorRecords.length} of {memorySystemSnapshot.detectorRecords.length} detector records.</p>
                ) : null}
                <ul>{visibleDetectorRecords.length ? visibleDetectorRecords.map((record) => (
                  <li key={record.id}>
                    <strong>{record.detectorType} / {record.direction}</strong>
                    <code>{record.summary}</code>
                    <code>strength {record.strength.toFixed(2)} / confidence {record.confidence.toFixed(2)} / seen {record.repeatCount} times</code>
                  </li>
                )) : <li>No detector movement yet.</li>}</ul>
              </div>
            </section>

            <section className="panel">
              <div className="panel-header"><h2>Tectonic timeline</h2><p>Snapshots of the last movement window that the future sphere view will animate.</p></div>
              <div className="saved-state scroll-panel">
                {memorySystemSnapshot && memorySystemSnapshot.tectonicTimeline.length > visibleTectonicTimeline.length ? (
                  <p className="panel-limit-note">Showing the most recent {visibleTectonicTimeline.length} of {memorySystemSnapshot.tectonicTimeline.length} tectonic snapshots.</p>
                ) : null}
                <ul>{visibleTectonicTimeline.length ? visibleTectonicTimeline.map((snapshot) => (
                  <li key={snapshot.id}>
                    <strong>{formatDateTime(snapshot.recordedAt)}</strong>
                    <code>activity {snapshot.totalDetectorActivity.toFixed(2)} / active memories {snapshot.activeMemoryCount}</code>
                    <code>{prettyJson(snapshot.summaryJson)}</code>
                  </li>
                )) : <li>No tectonic snapshots yet.</li>}</ul>
              </div>
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
          { id: "world", label: "World presence" },
          { id: "moment", label: "Lived moment" },
        ], passiveSection, (next) => setPassiveSection(next as PassiveSectionId))}

        {passiveSection === "ingest" ? (
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

        {passiveSection === "timeline" ? (
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

        {passiveSection === "patterns" ? (
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

        {passiveSection === "world" ? (
          <div className="content-stack">
            <section className="panel">
              <div className="panel-header">
                <h2>World presence</h2>
                <p>The first zero-cost outside-world layer grounded from the latest location pulse.</p>
              </div>
              <div className="actions">
                <button type="button" onClick={() => void handleRefreshLivedMoment()} disabled={busyPanel === "worldPresence"}>
                  {busyPanel === "worldPresence" ? "Refreshing..." : "Refresh world read"}
                </button>
              </div>
              {realWorldPresenceSnapshot ? (
                <>
                  <dl className="facts">
                    <div><dt>Location</dt><dd>{realWorldPresenceSnapshot.locationAvailable ? "available" : "waiting"}</dd></div>
                    <div><dt>Timezone</dt><dd>{realWorldPresenceSnapshot.timezone}</dd></div>
                    <div><dt>Weather</dt><dd>{realWorldPresenceSnapshot.weather?.weatherSummary ?? "not grounded yet"}</dd></div>
                    <div><dt>Daylight</dt><dd>{livedMomentMetaLabel(realWorldPresenceSnapshot.daylight?.daylightState ?? "unknown")}</dd></div>
                  </dl>
                  <div className="saved-state">
                    <h3>Current world read</h3>
                    <p className="memory-detail-lead">{realWorldPresenceSnapshot.summary}</p>
                    <code>{realWorldPresenceSnapshot.locationSummary}</code>
                    <code>{realWorldPresenceSnapshot.warningSummary}</code>
                  </div>
                </>
              ) : <p>Loading world-presence scaffolding...</p>}
            </section>

            {realWorldPresenceSnapshot ? (
              <div className="grid two-up">
                <section className="panel">
                  <div className="panel-header"><h2>Conditions</h2><p>No-cost weather and daylight context shaping what may fit nearby.</p></div>
                  <div className="saved-state">
                    <ul>
                      {realWorldPresenceSnapshot.weather ? (
                        <li>
                          <strong>{realWorldPresenceSnapshot.weather.weatherSummary}</strong>
                          <code>{realWorldPresenceSnapshot.weather.summary}</code>
                          <code>temperature {realWorldPresenceSnapshot.weather.temperatureCelsius?.toFixed(1) ?? "n/a"}C / feels like {realWorldPresenceSnapshot.weather.apparentTemperatureCelsius?.toFixed(1) ?? "n/a"}C</code>
                          <code>wind {realWorldPresenceSnapshot.weather.windSpeedKph?.toFixed(1) ?? "n/a"} kph / precipitation chance {realWorldPresenceSnapshot.weather.precipitationProbabilityPercent?.toFixed(0) ?? "n/a"}%</code>
                        </li>
                      ) : <li>No weather context yet.</li>}
                      {realWorldPresenceSnapshot.daylight ? (
                        <li>
                          <strong>{livedMomentMetaLabel(realWorldPresenceSnapshot.daylight.daylightState)}</strong>
                          <code>{realWorldPresenceSnapshot.daylight.summary}</code>
                          {realWorldPresenceSnapshot.daylight.minutesUntilTransition != null ? <code>{realWorldPresenceSnapshot.daylight.minutesUntilTransition} minutes until the next daylight transition</code> : null}
                        </li>
                      ) : <li>No daylight context yet.</li>}
                    </ul>
                  </div>
                </section>

                <section className="panel">
                  <div className="panel-header"><h2>Source status</h2><p>The no-cost world sources the current slice is using or waiting on.</p></div>
                  <div className="saved-state">
                    <ul>{realWorldPresenceSnapshot.sourceStatuses.map((source) => (
                      <li key={source.sourceKey}>
                        <strong>{source.label}</strong>
                        <code>{livedMomentMetaLabel(source.status)}</code>
                        <code>{source.detail}</code>
                        <code>checked {formatDateTime(source.checkedAt)}</code>
                      </li>
                    ))}</ul>
                  </div>
                </section>
              </div>
            ) : null}

            {realWorldPresenceSnapshot ? (
              <section className="panel">
                <div className="panel-header"><h2>Nearby candidates</h2><p>The first real nearby openings gathered from zero-cost map and story sources.</p></div>
                <div className="saved-state">
                  <ul>{realWorldPresenceSnapshot.nearbyCandidates.length ? realWorldPresenceSnapshot.nearbyCandidates.map((candidate) => (
                    <li key={`${candidate.source}-${candidate.title}`}>
                      <strong>{candidate.title}</strong>
                      <code>{formatStatus(candidate.categoryKey)} / {formatStatus(candidate.source)}</code>
                      <code>score {candidate.score.toFixed(2)}{candidate.distanceMeters != null ? ` / ${Math.round(candidate.distanceMeters)}m away` : ""}</code>
                      <code>{candidate.summary}</code>
                      {candidate.tags.length ? <code>{candidate.tags.join(", ")}</code> : null}
                    </li>
                  )) : <li>No nearby candidates are grounded enough yet.</li>}</ul>
                </div>
              </section>
            ) : null}

            <div className="grid two-up">
              <section className="panel">
                <div className="panel-header"><h2>Nearby-interest filters</h2><p>The categories that decide what counts as worth surfacing while adventuring.</p></div>
                <div className="saved-state">
                  <ul>{nearbyInterestFilters.length ? nearbyInterestFilters.map((filter) => (
                    <li key={filter.id}>
                      <strong>{filter.label}</strong>
                      <code>{filter.description}</code>
                      <code>{filter.tags.join(", ") || "No tags yet."}</code>
                      <code>{filter.isEnabled ? "Included in discovery" : "Hidden from discovery"}{filter.isUserDefined ? " / user-defined" : " / built-in"}</code>
                      <button type="button" className="ghost" onClick={() => void handleToggleNearbyInterestFilter(filter)} disabled={busyPanel === "nearbyInterestFilter"}>
                        {filter.isEnabled ? "Disable" : "Enable"}
                      </button>
                    </li>
                  )) : <li>No nearby-interest filters yet.</li>}</ul>
                </div>
              </section>

              <section className="panel">
                <div className="panel-header"><h2>Add filter</h2><p>Expand what the companion should consider interesting nearby.</p></div>
                <form className="editor" onSubmit={(event) => void handleCreateNearbyInterestFilter(event)}>
                  <label>
                    <span>Label</span>
                    <input value={newNearbyFilterLabel} onChange={(event) => setNewNearbyFilterLabel(event.target.value)} placeholder="Hidden gardens" />
                  </label>
                  <label>
                    <span>Description</span>
                    <textarea rows={3} value={newNearbyFilterDescription} onChange={(event) => setNewNearbyFilterDescription(event.target.value)} placeholder="Quiet or unusual gardens, green courtyards, and secluded plant spaces." />
                  </label>
                  <label>
                    <span>Tags</span>
                    <input value={newNearbyFilterTags} onChange={(event) => setNewNearbyFilterTags(event.target.value)} placeholder="garden, courtyard, greenhouse" />
                  </label>
                  <div className="actions">
                    <button type="submit" disabled={busyPanel === "nearbyInterestFilter" || !newNearbyFilterLabel.trim()}>
                      {busyPanel === "nearbyInterestFilter" ? "Saving..." : "Add nearby-interest filter"}
                    </button>
                  </div>
                </form>
              </section>
            </div>
          </div>
        ) : null}

        {passiveSection === "moment" ? (
          <div className="content-stack">
            <section className="panel">
              <div className="panel-header">
                <h2>Lived-moment interpretation</h2>
                <p>The first combined read of rhythm, place, memory, detector pressure, and phase movement.</p>
              </div>
              <div className="actions">
                <button type="button" onClick={() => void handleRefreshLivedMoment()}>Refresh moment read</button>
                <button type="button" className="ghost" onClick={() => void handleSeedContextMemoryExample("support")} disabled={busyPanel === "contextMemorySeed"}>
                  {busyPanel === "contextMemorySeed" ? "Seeding..." : "Seed support context"}
                </button>
                <button type="button" className="ghost" onClick={() => void handleSeedRealityCheck()} disabled={busyPanel === "realitySeed"}>
                  {busyPanel === "realitySeed" ? "Seeding..." : "Seed controlled scenario"}
                </button>
              </div>
              <p className="memory-explanation">Use the existing prefills here instead of waiting on real-life data. The support seed enriches interpreted memory; the controlled scenario adds visits, saved moments, and judgment traces.</p>
              {livedMomentSnapshot ? (
                <>
                  <dl className="facts">
                    <div><dt>Primary read</dt><dd>{explainabilityLabel(livedMomentSnapshot.primaryAssessment)}</dd></div>
                    <div><dt>Recommended signal</dt><dd>{explainabilityLabel(livedMomentSnapshot.recommendedSignal)}</dd></div>
                    <div><dt>Contact rhythm</dt><dd>{livedMomentMetaLabel(livedMomentSnapshot.contactRhythmHint)}</dd></div>
                    <div><dt>Recommended contact mode</dt><dd>{explainabilityLabel(livedMomentSnapshot.recommendedContactMode)}</dd></div>
                    <div><dt>Action bias</dt><dd>{livedMomentMetaLabel(livedMomentSnapshot.actionBias)}</dd></div>
                    <div><dt>Rhythm state</dt><dd>{livedMomentMetaLabel(livedMomentSnapshot.rhythmState)}</dd></div>
                    <div><dt>Time</dt><dd>{livedMomentSnapshot.localDayOfWeek}, {livedMomentSnapshot.localTime}</dd></div>
                    <div><dt>Sleep window</dt><dd>{livedMomentSnapshot.isLikelySleepWindow ? "inside likely quiet time" : "outside likely quiet time"}</dd></div>
                    <div><dt>Recent contact load</dt><dd>{livedMomentSnapshot.recentContactLoad.toFixed(2)}</dd></div>
                  </dl>
                  <div className="saved-state">
                    <h3>Current read</h3>
                    <p className="memory-detail-lead">{livedMomentSnapshot.summary}</p>
                    <code>captured {formatDateTime(livedMomentSnapshot.capturedAt)} / timezone {livedMomentSnapshot.timezone} / bucket {livedMomentMetaLabel(livedMomentSnapshot.timeBucket)}</code>
                    <code>dominant phase shift {livedMomentMetaLabel(livedMomentSnapshot.dominantPhaseShiftState)} / score {livedMomentSnapshot.dominantPhaseShiftScore.toFixed(2)}</code>
                    <code>{livedMomentSnapshot.recentContactSummary}</code>
                    <code>{livedMomentSnapshot.dominantPhaseShiftSummary}</code>
                  </div>
                </>
              ) : <p>Loading lived-moment interpretation...</p>}
            </section>

            {livedMomentSnapshot ? (
              <div className="grid two-up">
                <section className="panel">
                  <div className="panel-header"><h2>Assessment stack</h2><p>Action-shaping readings, not final truths.</p></div>
                  <div className="saved-state">
                    <ul>
                      {livedMomentSnapshot.assessments.length ? livedMomentSnapshot.assessments.map((assessment) => (
                        <li key={assessment.kind}>
                          <strong>{explainabilityLabel(assessment.kind)}</strong>
                          <code>score {assessment.score.toFixed(2)} / confidence {assessment.confidence.toFixed(2)}</code>
                          <code>{assessment.summary}</code>
                          {assessment.evidence.map((line, index) => <code key={`${assessment.kind}-${index}`}>{line}</code>)}
                        </li>
                      )) : <li>No current assessments yet.</li>}
                    </ul>
                  </div>
                </section>

                <section className="panel">
                  <div className="panel-header"><h2>Action signals</h2><p>The first explicit “what should happen now?” layer built from the read.</p></div>
                  <div className="saved-state">
                    <ul>
                      {livedMomentSnapshot.actionableSignals.length ? livedMomentSnapshot.actionableSignals.map((signal) => (
                        <li key={signal.kind}>
                          <strong>{explainabilityLabel(signal.kind)}</strong>
                          <code>score {signal.score.toFixed(2)} / confidence {signal.confidence.toFixed(2)}</code>
                          <code>{signal.reason}</code>
                        </li>
                      )) : <li>No action signals are grounded enough yet.</li>}
                    </ul>
                  </div>
                </section>
              </div>
            ) : null}

            {livedMomentSnapshot ? (
              <div className="grid two-up">
                <section className="panel">
                  <div className="panel-header"><h2>Situational signals</h2><p>The concrete now-conditions shaping opportunity or caution.</p></div>
                  <div className="saved-state">
                    <ul>{livedMomentSnapshot.situationalSignals.length ? livedMomentSnapshot.situationalSignals.map((signal) => (
                      <li key={signal.kind}>
                        <strong>{explainabilityLabel(signal.kind)}</strong>
                        <code>score {signal.score.toFixed(2)} / confidence {signal.confidence.toFixed(2)} / {livedMomentMetaLabel(signal.direction)}</code>
                        <code>{signal.summary}</code>
                      </li>
                    )) : <li>No situational signals are strongly in play yet.</li>}</ul>
                  </div>
                </section>

                <section className="panel">
                  <div className="panel-header"><h2>Opportunities</h2><p>The openings the system thinks may exist in this moment right now.</p></div>
                  <div className="saved-state">
                    <ul>{livedMomentSnapshot.opportunities.length ? livedMomentSnapshot.opportunities.map((opportunity) => (
                      <li key={opportunity.kind}>
                        <strong>{explainabilityLabel(opportunity.kind)}</strong>
                        <code>score {opportunity.score.toFixed(2)} / confidence {opportunity.confidence.toFixed(2)} / timing {livedMomentMetaLabel(opportunity.timing)}</code>
                        <code>{opportunity.summary}</code>
                      </li>
                    )) : <li>No meaningful opportunities are grounded enough yet.</li>}</ul>
                  </div>
                </section>

                <section className="panel">
                  <div className="panel-header"><h2>Safeguards</h2><p>The cautions or protections that may matter in the same moment.</p></div>
                  <div className="saved-state">
                    <ul>{livedMomentSnapshot.safeguards.length ? livedMomentSnapshot.safeguards.map((safeguard) => (
                      <li key={safeguard.kind}>
                        <strong>{explainabilityLabel(safeguard.kind)}</strong>
                        <code>score {safeguard.score.toFixed(2)} / confidence {safeguard.confidence.toFixed(2)} / urgency {livedMomentMetaLabel(safeguard.urgency)}</code>
                        <code>{safeguard.summary}</code>
                      </li>
                    )) : <li>No safeguards are strongly in play yet.</li>}</ul>
                  </div>
                </section>
              </div>
            ) : null}

            {livedMomentSnapshot ? (
              <div className="grid two-up">
                <section className="panel">
                  <div className="panel-header"><h2>Contact rhythm</h2><p>The pacing options the system thinks are proportionate right now.</p></div>
                  <div className="saved-state">
                    <ul>{livedMomentSnapshot.contactRhythmOptions.length ? livedMomentSnapshot.contactRhythmOptions.map((option) => (
                      <li key={option.level}>
                        <strong>{explainabilityLabel(option.level)}</strong>
                        <code>score {option.score.toFixed(2)} / confidence {option.confidence.toFixed(2)}</code>
                        <code>{option.reason}</code>
                      </li>
                    )) : <li>No contact pacing options are grounded enough yet.</li>}</ul>
                  </div>
                </section>

                <section className="panel">
                  <div className="panel-header"><h2>Relational bridges</h2><p>The people or living bonds that may fit this moment if contact matters.</p></div>
                  <div className="saved-state">
                    <ul>{livedMomentSnapshot.relationalBridges.length ? livedMomentSnapshot.relationalBridges.map((bridge) => (
                      <li key={`${bridge.categoryKey}-${bridge.title}`}>
                        <strong>{bridge.title}</strong>
                        <code>{formatStatus(bridge.categoryKey)} / {livedMomentMetaLabel(bridge.bridgeKind)}</code>
                        <code>score {bridge.score.toFixed(2)} / confidence {bridge.confidence.toFixed(2)} / {livedMomentMetaLabel(bridge.recentContactState)}</code>
                        <code>{bridge.reason}</code>
                      </li>
                    )) : <li>No fitting relational bridge is grounded enough yet.</li>}</ul>
                  </div>
                </section>
              </div>
            ) : null}

            {livedMomentSnapshot ? (
              <div className="grid two-up">
                <section className="panel">
                  <div className="panel-header"><h2>Context anchors</h2><p>What the read is grounding itself in right now.</p></div>
                  <div className="saved-state">
                    <h3>Place and movement</h3>
                    {livedMomentSnapshot.matchedPlace ? (
                      <ul>
                        <li><strong>{livedMomentSnapshot.matchedPlace.label}</strong><code>{livedMomentSnapshot.matchedPlace.placeKind} / {livedMomentSnapshot.matchedPlace.meaningKind}</code><code>significance {livedMomentSnapshot.matchedPlace.significanceScore.toFixed(2)} / protected {livedMomentSnapshot.matchedPlace.isProtected ? "yes" : "no"}</code></li>
                      </ul>
                    ) : (
                      <ul><li>No named place is currently matched.</li></ul>
                    )}
                    {livedMomentSnapshot.latestLocationEvent ? <code>latest location {formatDateTime(livedMomentSnapshot.latestLocationEvent.occurredAt)} / {livedMomentSnapshot.latestLocationEvent.movementState}</code> : <code>No recent location event.</code>}
                    {livedMomentSnapshot.activeVisit ? <code>active visit {formatDuration(livedMomentSnapshot.activeVisit.durationSeconds)} / confidence {livedMomentSnapshot.activeVisit.confidence.toFixed(2)}</code> : <code>No open visit right now.</code>}
                    {livedMomentSnapshot.repeatedPlace ? <code>repeated place {livedMomentSnapshot.repeatedPlace.label} / {livedMomentSnapshot.repeatedPlace.visitCount} visits / avg {formatDuration(livedMomentSnapshot.repeatedPlace.averageDurationSeconds)}</code> : null}
                  </div>
                  <div className="saved-state">
                    <h3>Detector pressure</h3>
                    <ul>{livedMomentSnapshot.detectorPressures.length ? livedMomentSnapshot.detectorPressures.slice(0, 6).map((pressure) => (
                      <li key={pressure.detectorType}>
                        <strong>{formatStatus(pressure.detectorType)}</strong>
                        <code>strength {pressure.totalStrength.toFixed(2)} / confidence {pressure.averageConfidence.toFixed(2)} / samples {pressure.sampleCount}</code>
                        <code>{pressure.summary}</code>
                      </li>
                    )) : <li>No detector pressure yet.</li>}</ul>
                  </div>
                </section>
              </div>
            ) : null}

            {livedMomentSnapshot ? (
              <div className="grid two-up">
                <section className="panel">
                  <div className="panel-header"><h2>Related memories</h2><p>The manual or interpreted truths most relevant to the current moment.</p></div>
                  <div className="saved-state">
                    <ul>{livedMomentSnapshot.relatedMemories.length ? livedMomentSnapshot.relatedMemories.map((memory) => (
                      <li key={memory.memoryItemId}>
                        <strong>{memory.memoryType}</strong>
                        <code>{memory.summary}</code>
                        <code>relevance {memory.relevanceScore.toFixed(2)} / confidence {memory.confidence.toFixed(2)} / salience {memory.salience.toFixed(2)}</code>
                        <code>sensitivity {memory.sensitivity}{memory.currentStatus ? ` / status ${memory.currentStatus}` : ""}{memory.phaseShiftState ? ` / phase ${memory.phaseShiftState}` : ""}</code>
                      </li>
                    )) : <li>No interpreted memories are strongly tied to this moment yet.</li>}</ul>
                  </div>
                </section>

                <section className="panel">
                  <div className="panel-header"><h2>Recent saved moments</h2><p>The nearby judgment history the current read can lean on.</p></div>
                  <div className="saved-state">
                    <ul>{livedMomentSnapshot.recentSavedMoments.length ? livedMomentSnapshot.recentSavedMoments.map((moment) => (
                      <li key={moment.id}>
                        <strong>{moment.momentKind}</strong>
                        <code>{moment.inferredSignificance}</code>
                        <code>{formatDateTime(moment.createdAt)} / confidence {moment.confidence.toFixed(2)} / action {moment.actionTaken}</code>
                      </li>
                    )) : <li>No recent saved moments yet.</li>}</ul>
                  </div>
                </section>
              </div>
            ) : null}
          </div>
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
              {busyPanel === "runtimeReset" ? "Clearing..." : "Clear generated data"}
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
                {simulationResult.draftPreview ? <li><strong>Draft preview</strong><code>{simulationDraftPreviewLabel(simulationResult.scenarioKey, simulationResult.draftPreview) ?? simulationResult.draftPreview}</code></li> : null}
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
            <div><dt>Drafted outreach</dt><dd>{draftedOutreachEvents.length}</dd></div>
          </dl>
          <div className="actions">
            <button type="button" onClick={() => void handleRunDecisions()} disabled={busyPanel === "decisions" || loading}>{busyPanel === "decisions" ? "Evaluating..." : "Run decision pass"}</button>
            <button type="button" className="ghost" onClick={() => void handleRunCallRequestDecisions()} disabled={busyPanel === "callDecisions" || loading}>{busyPanel === "callDecisions" ? "Evaluating calls..." : "Run call request pass"}</button>
            <button type="button" className="ghost" onClick={() => void handleDispatchNextDraftedOutreach()} disabled={busyPanel === "draftDispatch" || !draftedOutreachEvents.length}>
              {busyPanel === "draftDispatch" ? "Dispatching..." : "Dispatch next draft"}
            </button>
            <button type="button" className="ghost" onClick={() => void handleAutoDispatchEligibleOutreach()} disabled={busyPanel === "draftDispatch" || !draftedOutreachEvents.length}>
              {busyPanel === "draftDispatch" ? "Sending..." : "Auto-send safe draft"}
            </button>
          </div>
          <div className="saved-state">
            <h3>Draft dispatch queue</h3>
            <ul>
              {draftedOutreachEvents.length ? draftedOutreachEvents.map((event) => {
                const metadata = parseJsonObject(event.deliveryMetadataJson);
                const autoDispatchAssessment = autoDispatchAssessmentForEvent(event.id, decisionSnapshot);
                return (
                  <li key={event.id}>
                    <strong>{outreachKindLabel(event.outreachKind)}</strong>
                    <code>{event.reasonSummary}</code>
                    <code>{event.messageText}</code>
                    <code>{autoDispatchAssessment.reason}</code>
                    <code>{autoDispatchAssessment.basis}</code>
                    {metadata?.structuredDraft && typeof metadata.structuredDraft === "string" ? (
                      <code>Structured draft: {metadata.structuredDraft}</code>
                    ) : null}
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => void handleDispatchDraftedOutreach(event.id)}
                      disabled={busyPanel === "draftDispatch"}
                    >
                      {busyPanel === "draftDispatch" ? "Dispatching..." : "Dispatch through North Star"}
                    </button>
                  </li>
                );
              }) : <li>No drafted outreach is waiting right now.</li>}
            </ul>
            {lastDraftDispatch ? (
              <code>
                Last send: {outreachKindLabel(lastDraftDispatch.outreachEvent.outreachKind)} via {formatStatus(lastDraftDispatch.channel)}.
                {" "}Payload: {lastDraftDispatch.dispatchedPayload}
              </code>
            ) : null}
            {lastAutoDispatch && !lastAutoDispatch.dispatched ? <code>{lastAutoDispatch.detail}</code> : null}
            {lastAutoDispatch?.heldOutreachEvent && lastAutoDispatch.eligibilityReason ? (
              <code>
                Kept in queue: {outreachKindLabel(lastAutoDispatch.heldOutreachEvent.outreachKind)}.
                {" "}{lastAutoDispatch.eligibilityReason}
              </code>
            ) : null}
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
                <p className="memory-detail-lead">{callHandoffLabel(callSessionSnapshot.activeSession.handoffKind)}</p>
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
            <div className="saved-state"><ul>{decisionSnapshot?.decisions.length ? decisionSnapshot.decisions.map((decision) => {
              const explainability = decisionExplainability(decision.decisionMetadataJson);
              const summary = decisionSummaryText(decision, explainability);
              return (
                <li key={decision.id}>
                  <button type="button" className={`memory-item-button ${selectedDecision?.id === decision.id ? "active" : ""}`} onClick={() => setSelectedDecisionId(decision.id)}>
                    <strong>{decisionKindLabel(decision.decisionKind)}</strong>
                    <code>moment {decision.savedMomentId}</code>
                    {explainability.pillar ? <code>{explainabilityLabel(explainability.pillar)}</code> : null}
                    {explainability.recommendedContactMode ? <code>{explainabilityLabel(explainability.recommendedContactMode)}</code> : null}
                    <code>{summary}</code>
                  </button>
                </li>
              );
            }) : <li>No message or call-request decisions yet.</li>}</ul></div>
          </section>
          <section className="panel">
            <div className="panel-header"><h2>Selected decision</h2><p>Why the system stayed silent or moved toward outreach.</p></div>
            {selectedDecision ? (
              <div className="saved-state">
                <h3>{decisionKindLabel(selectedDecision.decisionKind)}</h3>
                <p className="memory-detail-lead">{decisionSummaryText(selectedDecision, selectedDecisionExplainability ?? decisionExplainability(selectedDecision.decisionMetadataJson))}</p>
                <code>moment {selectedDecision.savedMomentId} / decided {formatDateTime(selectedDecision.decidedAt)}</code>
                {selectedDecisionExplainability ? (
                  <>
                    <dl className="facts">
                      {selectedDecisionExplainability.pillar ? <div><dt>Pillar</dt><dd>{explainabilityLabel(selectedDecisionExplainability.pillar)}</dd></div> : null}
                      {selectedDecisionExplainability.primaryAssessment ? <div><dt>Moment read</dt><dd>{explainabilityLabel(selectedDecisionExplainability.primaryAssessment)}</dd></div> : null}
                      {selectedDecisionExplainability.recommendedSignal ? <div><dt>Signal</dt><dd>{explainabilityLabel(selectedDecisionExplainability.recommendedSignal)}</dd></div> : null}
                      {selectedDecisionExplainability.recommendedContactMode ? <div><dt>Contact mode</dt><dd>{explainabilityLabel(selectedDecisionExplainability.recommendedContactMode)}</dd></div> : null}
                      {selectedDecisionExplainability.escalationStage ? <div><dt>Escalation path</dt><dd>{explainabilityLabel(selectedDecisionExplainability.escalationStage)}</dd></div> : null}
                      {selectedDecisionExplainability.kind ? <div><dt>Decision context</dt><dd>{explainabilityLabel(selectedDecisionExplainability.kind)}</dd></div> : null}
                    </dl>
                    {(selectedDecisionExplainability.topOpportunity
                      || selectedDecisionExplainability.topSafeguard
                      || selectedDecisionExplainability.topSituationalSignal
                      || selectedDecisionExplainability.topRelationalBridge
                      || selectedDecisionExplainability.recentContactSummary) ? (
                      <div className="saved-state">
                        <h3>Why this happened</h3>
                        {selectedDecisionExplainability.topOpportunity ? <code>Opportunity in play: {explainabilityLabel(selectedDecisionExplainability.topOpportunity)}</code> : null}
                        {selectedDecisionExplainability.topSafeguard ? <code>Safeguard in play: {explainabilityLabel(selectedDecisionExplainability.topSafeguard)}</code> : null}
                        {selectedDecisionExplainability.topSituationalSignal ? <code>Situational signal in play: {explainabilityLabel(selectedDecisionExplainability.topSituationalSignal)}</code> : null}
                        {selectedDecisionExplainability.topRelationalBridge ? <code>Relational bridge in play: {selectedDecisionExplainability.topRelationalBridge}</code> : null}
                        {selectedDecisionExplainability.recentContactSummary ? <code>{selectedDecisionExplainability.recentContactSummary}</code> : null}
                      </div>
                    ) : null}
                    {(selectedDecisionExplainability.adjustedConfidence != null || selectedDecisionExplainability.minutesSinceLastOutreach != null) ? (
                      <div className="saved-state">
                        <h3>Decision diagnostics</h3>
                        {selectedDecisionExplainability.adjustedConfidence != null ? (
                          <code>
                            adjusted confidence {selectedDecisionExplainability.adjustedConfidence.toFixed(2)}
                            {selectedDecisionExplainability.threshold != null ? ` / threshold ${selectedDecisionExplainability.threshold.toFixed(2)}` : ""}
                            {selectedDecisionExplainability.feedbackBias != null ? ` / feedback bias ${selectedDecisionExplainability.feedbackBias.toFixed(2)}` : ""}
                            {selectedDecisionExplainability.livedMomentBias != null ? ` / lived-moment bias ${selectedDecisionExplainability.livedMomentBias.toFixed(2)}` : ""}
                          </code>
                        ) : null}
                        {selectedDecisionExplainability.minutesSinceLastOutreach != null ? (
                          <code>
                            last outreach {selectedDecisionExplainability.minutesSinceLastOutreach} minutes ago
                            {selectedDecisionExplainability.cooldownMinutes != null ? ` / cooldown ${selectedDecisionExplainability.cooldownMinutes} minutes` : ""}
                          </code>
                        ) : null}
                      </div>
                    ) : null}
                  </>
                ) : null}
                {selectedDecisionOutreach ? (
                  <>
                    <p className="memory-explanation"><strong>Created outreach:</strong> {outreachKindLabel(selectedDecisionOutreach.outreachKind)} / {outreachStateLabel(selectedDecisionOutreach.responseState)}</p>
                    <code>{selectedDecisionOutreach.messageText}</code>
                    {selectedDecisionOutreachMetadata?.structuredDraft && typeof selectedDecisionOutreachMetadata.structuredDraft === "string" ? (
                      <code>Structured draft: {selectedDecisionOutreachMetadata.structuredDraft}</code>
                    ) : null}
                    {selectedDecisionOutreachMetadata?.northStarDetail && typeof selectedDecisionOutreachMetadata.northStarDetail === "string" ? (
                      <code>Delivery note: {selectedDecisionOutreachMetadata.northStarDetail}</code>
                    ) : null}
                    {selectedDecisionOutreachMetadata?.callOutcome && typeof selectedDecisionOutreachMetadata.callOutcome === "string" ? (
                      <code>Call outcome: {outreachStateLabel(selectedDecisionOutreachMetadata.callOutcome)}</code>
                    ) : null}
                  </>
                ) : null}
                <div className="saved-state">
                  <h3>Raw decision trace</h3>
                  <code>{prettyJson(selectedDecision.decisionMetadataJson)}</code>
                </div>
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
                        <strong>{callHandoffLabel(session.handoffKind)} / {callOutcomeLabel(session.outcome)}</strong>
                        <code>session {session.id} / {callSessionStateLabel(session.sessionState)}</code>
                        <code>{durationLabel(session.durationSeconds)}</code>
                        <code>{callFlowSummary(session)}</code>
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
                  <h3>{callHandoffLabel(selectedCallSession.handoffKind)}</h3>
                  <p className="memory-detail-lead">{callOutcomeLabel(selectedCallSession.outcome)}</p>
                  <code>session {selectedCallSession.id} / started {selectedCallSession.startedAt ? formatDateTime(selectedCallSession.startedAt) : "unknown"}</code>
                  <code>{callSessionStateLabel(selectedCallSession.sessionState)}</code>
                  {selectedCallSession.endedAt ? <code>ended {formatDateTime(selectedCallSession.endedAt)}</code> : null}
                  <code>{durationLabel(selectedCallSession.durationSeconds)}</code>
                  <code>{callFlowSummary(selectedCallSession)}</code>
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

  function renderHomeTab() {
    const homeSections = companionHomeSnapshot?.categories ?? [];
    return (
      <div className="screen-stack">
        <section className="screen-panel screen-panel-hero screen-panel-hero-compact">
          <div className="screen-panel-copy">
            <p className="eyebrow">Home</p>
            <h2>Life context at a glance</h2>
            <p>A literal context map of the life the companion is learning.</p>
            </div>
            <div className="screen-kpis">
              <div className="screen-kpi"><span>Active categories</span><strong>{populatedCompanionCategoryCount}/{visibleCompanionCategoryCount}</strong></div>
              <div className="screen-kpi"><span>Manual entries</span><strong>{companionContextEntryCount}</strong></div>
              <div className="screen-kpi"><span>Saved moments</span><strong>{phaseThreeSnapshot?.savedMoments.length ?? 0}</strong></div>
            </div>
        </section>

        <section className="panel companion-map-panel literal-shell-panel">
          <div className="companion-map">
            <div className="companion-map-orbit">
              <div className="companion-map-grid" />
                <div className="companion-map-figure">
                  <img src={humanoidFigure} alt="Humanoid context anchor" className="companion-humanoid" />
                </div>
                {homeSections.map((section, index) => {
                  const placement = homeMapLayout[index];
                  const topEntry = section.entries[0] ?? null;
                  return (
                    <button
                      key={section.category.key}
                      type="button"
                      className={`companion-map-card ${placement?.connectorClass ?? "connector-right"} ${section.entries.length ? "is-populated" : "is-empty"}`}
                      style={placement?.style}
                      onClick={() => {
                        setContextSection(section.category.key as ContextSectionId);
                        setActiveTab("context");
                      }}
                    >
                      <span className="companion-map-label">
                        <span className="companion-map-icon">{renderCompanionCategoryIcon(section.category.icon, "companion-map-icon-svg")}</span>
                        {section.category.label}
                      </span>
                      {section.entries.length ? (
                        <>
                        <strong>{topEntry?.title}</strong>
                        <p>{topEntry?.body}</p>
                        {topEntry?.tags.length ? <div className="tag-row">{topEntry.tags.slice(0, 3).map((tag) => <span key={tag} className="tag-chip">{tag}</span>)}</div> : null}
                        <span className="companion-map-meta">
                          {section.entries.length === 1 ? "1 active entry" : `${section.entries.length} active entries`}
                        </span>
                      </>
                    ) : (
                      <>
                        <strong>Still waiting to be taught</strong>
                        <p>{section.category.description}</p>
                        <span className="companion-map-meta">Add context manually</span>
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      </div>
    );
  }

  function renderTectonicsTab() {
    return (
      <div className="screen-stack">
        <section className="screen-panel screen-panel-hero screen-panel-hero-compact">
          <div className="screen-panel-copy">
            <p className="eyebrow">Tectonics</p>
            <h2>Deep movement over time</h2>
            <p>The visual layer for what the companion is noticing as slow global change, not just a list of records.</p>
          </div>
          <div className="screen-kpis">
            <div className="screen-kpi"><span>Frames</span><strong>{memorySystemSnapshot?.overview.tectonicSnapshotCount ?? 0}</strong></div>
            <div className="screen-kpi"><span>Detectors</span><strong>{memorySystemSnapshot?.overview.detectorCount ?? 0}</strong></div>
            <div className="screen-kpi"><span>Memories</span><strong>{memorySystemSnapshot?.overview.totalMemoryCount ?? 0}</strong></div>
          </div>
        </section>

        <TectonicsSpherePanel
          timeline={memorySystemSnapshot?.tectonicTimeline ?? []}
          sideContent={
            <>
              <section className="panel tectonics-side-panel">
                <div className="panel-header"><h2>Current movement mix</h2><p>The most active detector and evolution currents shaping the present frame.</p></div>
                {memorySystemSnapshot ? (
                  <div className="saved-state scroll-panel tectonics-side-scroll">
                    <h3>Detector currents</h3>
                    <ul>{memorySystemSnapshot.overview.detectorTypeBreakdown.length ? memorySystemSnapshot.overview.detectorTypeBreakdown.map((item) => <li key={item.key}><strong>{item.key}</strong><code>{item.count}</code></li>) : <li>No detector movement yet.</li>}</ul>
                    <h3>Evolution currents</h3>
                    <ul>{memorySystemSnapshot.overview.evolutionStatusBreakdown.length ? memorySystemSnapshot.overview.evolutionStatusBreakdown.map((item) => <li key={item.key}><strong>{item.key}</strong><code>{item.count}</code></li>) : <li>No evolution movement yet.</li>}</ul>
                    <h3>Truth alignment</h3>
                    <ul>{latestTectonicSummary?.truthAlignmentBreakdown.length ? latestTectonicSummary.truthAlignmentBreakdown.map((item) => <li key={item.key}><strong>{item.key}</strong><code>{item.count ?? 0}</code></li>) : <li>No alignment read yet.</li>}</ul>
                    <h3>Divergence carry-over</h3>
                    <ul>
                      <li><strong>Diverging memories</strong><code>{latestTectonicSummary?.divergentMemoryCount ?? 0}</code></li>
                      <li><strong>Average cumulative divergence</strong><code>{(latestTectonicSummary?.cumulativeDivergenceAverage ?? 0).toFixed(2)}</code></li>
                      <li><strong>Cross-source memories</strong><code>{latestTectonicSummary?.crossSourceMemoryCount ?? 0}</code></li>
                      <li><strong>Average source coherence</strong><code>{(latestTectonicSummary?.sourceCoherenceAverage ?? 0).toFixed(2)}</code></li>
                      <li><strong>Sustained shifts</strong><code>{latestTectonicSummary?.sustainedShiftMemoryCount ?? 0}</code></li>
                      <li><strong>Average phase shift</strong><code>{(latestTectonicSummary?.phaseShiftAverage ?? 0).toFixed(2)}</code></li>
                    </ul>
                    <h3>Phase shifts</h3>
                    <ul>{latestTectonicSummary?.phaseShiftBreakdown.length ? latestTectonicSummary.phaseShiftBreakdown.map((item) => <li key={item.key}><strong>{item.key}</strong><code>{item.count ?? 0}</code></li>) : <li>No temporal phase read yet.</li>}</ul>
                    <h3>Movement territories</h3>
                    <ul>{latestTectonicSummary?.targetKindBreakdown.length ? latestTectonicSummary.targetKindBreakdown.map((item) => <li key={item.key}><strong>{item.key}</strong><code>{item.count ?? 0}</code></li>) : <li>No territorial split yet.</li>}</ul>
                    <h3>Motion directions</h3>
                    <ul>{latestTectonicSummary?.directionBreakdown.length ? latestTectonicSummary.directionBreakdown.map((item) => <li key={item.key}><strong>{item.key}</strong><code>{item.count ?? 0}</code></li>) : <li>No directional movement yet.</li>}</ul>
                  </div>
                ) : <p>Loading tectonic system...</p>}
              </section>

              <section className="panel tectonics-side-panel">
                <div className="panel-header"><h2>Recent movement notes</h2><p>A lightweight textual anchor beside the visualizer so the motion still stays legible.</p></div>
                <div className="saved-state scroll-panel tectonics-side-scroll">
                  <ul>{visibleDetectorRecords.length ? visibleDetectorRecords.slice(0, 12).map((record) => (
                    <li key={record.id}>
                      <strong>{record.detectorType} / {record.direction}</strong>
                      <code>{record.summary}</code>
                      <code>strength {record.strength.toFixed(2)} / confidence {record.confidence.toFixed(2)}</code>
                    </li>
                  )) : <li>No detector movement yet.</li>}</ul>
                </div>
              </section>
            </>
          }
        />
      </div>
    );
  }

  function renderCompanionContextTab() {
    return (
      <div className="screen-stack">
          <section className="screen-panel screen-panel-hero">
            <div className="panel-header">
              <h2>Manual companion context</h2>
              <p>Feed the exact life details the home map should reflect. This is the direct teaching surface behind the companion view.</p>
            </div>
              {renderSectionTabs(
                companionCategoryTabs.map((category) => ({
                  id: category.key,
                    label: <span className="section-tab-label">{renderCompanionCategoryIcon(category.icon, "section-tab-icon")}<span>{category.label}</span></span>,
                  })),
                contextSection,
                (next) => setContextSection(next as ContextSectionId),
            )}
          </section>

          <div className="companion-context-layout">
            <div className="companion-context-left-column">
              <section className="panel literal-shell-panel companion-context-half">
                <div className="panel-header">
                  <h2 className="companion-category-heading">{selectedCompanionSection ? <><span className="companion-category-heading-icon">{renderCompanionCategoryIcon(selectedCompanionSection.category.icon, "companion-category-heading-icon-svg")}</span><span>{selectedCompanionSection.category.label}</span></> : "Context category"}</h2>
                  <p>{selectedCompanionSection?.category.description ?? "Pick a category to begin."}</p>
                </div>
                {selectedCompanionSection ? (
                  <div className="button-row category-visibility-row">
                    <span className="status-pill muted">
                      {selectedCompanionSection.category.isSystem ? "System category" : "Custom category"}
                    </span>
                    <label className="companion-icon-picker">
                      <span>Icon</span>
                      <select
                        value={selectedCategoryIcon}
                        onChange={(event) => setSelectedCategoryIcon(event.target.value)}
                      >
                        {companionCategoryIconOptions.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => void handleUpdateCompanionCategoryIcon({
                        categoryKey: selectedCompanionSection.category.key,
                        icon: selectedCategoryIcon,
                      })}
                      disabled={busyPanel === "companionCategoryUpdate" || selectedCategoryIcon === selectedCompanionSection.category.icon}
                    >
                      {busyPanel === "companionCategoryUpdate" ? "Saving icon..." : "Save icon"}
                    </button>
                    <button
                      type="button"
                      className="ghost danger"
                      onClick={() => void handleDeleteCompanionCategory(
                        selectedCompanionSection.category.key as ContextSectionId,
                      )}
                      disabled={busyPanel === "companionCategoryDelete"}
                    >
                      {busyPanel === "companionCategoryDelete" ? "Deleting..." : "Delete category"}
                    </button>
                  </div>
                ) : null}
                <div className="companion-entry-list">
                  {selectedCompanionSection?.entries.length ? selectedCompanionSection.entries.map((entry, index) => (
                    <article key={entry.id} className={`companion-entry-card ${entry.isActive ? "" : "is-archived"}`}>
                      <div className="companion-entry-card-header">
                        <div>
                          <h3>{entry.title}</h3>
                          <p>{entry.body}</p>
                        </div>
                        <span className={`status-pill ${entry.isActive ? "" : "muted"}`}>{entry.isActive ? "Active" : "Archived"}</span>
                      </div>
                      {entry.tags.length ? (
                        <div className="tag-row">
                          {entry.tags.map((tag) => <span key={tag} className="tag-chip">{tag}</span>)}
                        </div>
                      ) : null}
                      {entry.notes ? <p className="memory-explanation"><strong>Notes</strong><br />{entry.notes}</p> : null}
                      <div className="button-row">
                        <button type="button" className="ghost" onClick={() => beginEditingCompanionContextEntry(entry)}>Edit</button>
                        <button type="button" className="ghost" onClick={() => void moveCompanionContextEntry(entry.id, -1)} disabled={busyPanel === "companionContextReorder" || index === 0}>Move up</button>
                        <button type="button" className="ghost" onClick={() => void moveCompanionContextEntry(entry.id, 1)} disabled={busyPanel === "companionContextReorder" || index === selectedCompanionSection.entries.length - 1}>Move down</button>
                        {entry.isActive ? (
                          <button type="button" className="ghost danger" onClick={() => void handleArchiveCompanionContextEntry(entry.id)} disabled={busyPanel === "companionContextArchive"}>Archive</button>
                        ) : null}
                      </div>
                    </article>
                  )) : (
                    <div className="empty-context-state">
                      <h3>No entries here yet</h3>
                      <p>This category is still empty. Add the first grounded detail you want the companion to hold onto.</p>
                    </div>
                  )}
                </div>
              </section>

              <section className="panel literal-shell-panel companion-context-half">
                <form className="settings-form companion-category-form" onSubmit={handleCompanionCategorySubmit}>
                  <div className="panel-header">
                    <h2>Add category</h2>
                    <p>Create a new context lane for anything that matters in your life. New categories automatically become companion context and can appear on Home.</p>
                  </div>
                  <label>
                    <span>Category name</span>
                    <input
                      value={companionCategoryForm.label}
                      onChange={(event) => setCompanionCategoryForm((current) => ({ ...current, label: event.target.value }))}
                      placeholder="Examples: Spiritual life, Health, Inner tensions"
                    />
                  </label>
                  <label>
                    <span>Description</span>
                    <textarea
                      rows={4}
                      value={companionCategoryForm.description}
                      onChange={(event) => setCompanionCategoryForm((current) => ({ ...current, description: event.target.value }))}
                      placeholder="Describe what belongs in this category when you teach the companion."
                    />
                  </label>
                  <label>
                    <span>Icon</span>
                    <select
                      value={companionCategoryForm.icon}
                      onChange={(event) => setCompanionCategoryForm((current) => ({ ...current, icon: event.target.value }))}
                    >
                        {companionCategoryIconOptions.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                  </label>
                  <div className="button-row">
                    <button type="submit" disabled={busyPanel === "companionCategoryCreate"}>
                      {busyPanel === "companionCategoryCreate" ? "Adding..." : "Add category"}
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => setCompanionCategoryForm(defaultCompanionContextCategory)}
                    >
                      Clear
                    </button>
                  </div>
                </form>
              </section>
            </div>

            <section className="panel literal-shell-panel">
              <form className="settings-form" onSubmit={handleCompanionContextSubmit}>
                <div className="panel-header">
                  <h2>{editingCompanionContextEntryId ? "Edit context entry" : "Add context entry"}</h2>
                  <p>Write this in direct human terms. This is not a debug payload. It is how the companion learns the shape of your life.</p>
                </div>
                <label>
                  <span>Category</span>
                  <select value={contextSection} onChange={(event) => setContextSection(event.target.value as ContextSectionId)}>
                    {companionCategoryTabs.map((category) => (
                      <option key={category.key} value={category.key}>{category.label}</option>
                    ))}
                  </select>
                </label>
              <label>
                <span>Title</span>
                <input
                  value={companionContextForm.title}
                  onChange={(event) => setCompanionContextForm((current) => ({ ...current, title: event.target.value }))}
                  placeholder="Short anchor for this context"
                />
              </label>
              <label>
                <span>Details</span>
                <textarea
                  rows={6}
                  value={companionContextForm.body}
                  onChange={(event) => setCompanionContextForm((current) => ({ ...current, body: event.target.value }))}
                  placeholder="Describe the person, place, principle, taste, or part of life in grounded language."
                />
              </label>
              <label>
                <span>Tags</span>
                <input
                  value={companionContextTagsInput}
                  onChange={(event) => setCompanionContextTagsInput(event.target.value)}
                  placeholder="comma, separated, tags"
                />
              </label>
              <label>
                <span>Notes</span>
                <textarea
                  rows={4}
                  value={companionContextForm.notes}
                  onChange={(event) => setCompanionContextForm((current) => ({ ...current, notes: event.target.value }))}
                  placeholder="Optional nuance, caveats, or background that still matters."
                />
              </label>
                <div className="button-row">
                  <button type="submit" disabled={busyPanel === "companionContextCreate" || busyPanel === "companionContextUpdate"}>
                    {busyPanel === "companionContextUpdate"
                    ? "Saving..."
                    : busyPanel === "companionContextCreate"
                      ? "Adding..."
                      : editingCompanionContextEntryId
                        ? "Save entry"
                        : "Add entry"}
                </button>
                  <button type="button" className="ghost" onClick={() => resetCompanionContextForm(contextSection)}>Clear form</button>
                </div>
              </form>
            </section>
        </div>
      </div>
    );
  }

  function renderSettingsExperience() {
    return (
      <div className="screen-stack">
        {renderSectionTabs([
          { id: "overview", label: "Overview" },
          { id: "companion", label: "Companion" },
          { id: "connections", label: "Connections" },
          { id: "location", label: "Location" },
          { id: "voice", label: "Voice" },
          { id: "memory", label: "Memory" },
          { id: "passive", label: "Passive Context" },
          { id: "judgment", label: "Judgment" },
          { id: "review", label: "Review" },
          { id: "diagnostics", label: "Diagnostics" },
        ], settingsSection, setSettingsSection)}

        {settingsSection === "overview" ? (
          <div className="grid two-up">
            <section className="panel literal-shell-panel">
              <div className="panel-header">
                <h2>Companion-first shell</h2>
                <p>The home screen now carries the philosophy. The technical tools still exist, but they live here instead of defining the opening mood.</p>
              </div>
              <div className="saved-state">
                <ul>
                  <li><strong>Manual context entries</strong><code>{companionContextEntryCount}</code></li>
                  <li><strong>Categories carrying active context</strong><code>{populatedCompanionCategoryCount}</code></li>
                  <li><strong>Places in legacy memory</strong><code>{snapshot?.places.length ?? 0}</code></li>
                  <li><strong>Saved moments</strong><code>{phaseThreeSnapshot?.savedMoments.length ?? 0}</code></li>
                </ul>
              </div>
              <div className="button-row">
                <button type="button" onClick={() => setActiveTab("home")}>Return to Home</button>
                <button type="button" className="ghost" onClick={() => setActiveTab("context")}>Edit companion context</button>
              </div>
            </section>
            <section className="panel literal-shell-panel">
              <div className="panel-header">
                <h2>Legacy workspace still intact</h2>
                <p>Nothing operational was removed in this phase. These areas are just relocated under Settings so the app opens like a companion instead of a debug console.</p>
              </div>
              <div className="saved-state">
                <ul>
                  <li><strong>Memory</strong><code>places, rules, reflections, memory growth</code></li>
                  <li><strong>Passive context</strong><code>events, visits, repeated places, sleep inference</code></li>
                  <li><strong>Judgment</strong><code>moments, simulation, runtime, live calls</code></li>
                  <li><strong>Review</strong><code>corrections, call inspection, saved-moment detail</code></li>
                </ul>
              </div>
            </section>
          </div>
        ) : null}

        {settingsSection === "companion" || settingsSection === "core" || settingsSection === "connections" || settingsSection === "location" || settingsSection === "voice" || settingsSection === "diagnostics"
          ? renderSettingsTab()
          : null}
        {settingsSection === "memory" ? renderMemoryTab() : null}
        {settingsSection === "passive" ? renderContextTab() : null}
        {settingsSection === "judgment" ? renderJudgmentTab() : null}
        {settingsSection === "review" ? renderReviewTab() : null}
      </div>
    );
  }

  function renderActiveTab() {
    switch (activeTab) {
      case "home": return renderHomeTab();
      case "context": return renderCompanionContextTab();
      case "tectonics": return renderTectonicsTab();
      case "settings": return renderSettingsExperience();
      default: return null;
    }
  }

  const profileLabel = settings.northStarDisplayName.trim() || "Companion Profile";

  return (
    <main className="literal-app-shell">
      <section className="literal-app-frame">
        <header className="literal-topbar">
          <div className="literal-brand">Neural Trainer</div>
          <div className="literal-profile-name">{profileLabel}</div>
        </header>

        <div className="literal-body">
          <aside className="literal-rail">
            <nav className="literal-rail-nav" aria-label="Primary workspace sections">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={tab.id === activeTab ? "literal-rail-item active" : "literal-rail-item"}
                  onClick={() => setActiveTab(tab.id)}
                >
                  <span className="literal-rail-icon">{tab.id === "home" ? "HM" : tab.id === "context" ? "CX" : tab.id === "tectonics" ? "TC" : "ST"}</span>
                  <span className="literal-rail-label">{tab.label}</span>
                </button>
              ))}
            </nav>
          </aside>

          <section className="literal-main-stage">
            {(message || error) ? (
              <div className="literal-notice-stack">
                {message ? <p className="notice success">{message}</p> : null}
                {error ? <p className="notice error">{error}</p> : null}
              </div>
            ) : null}

            {loading ? <section className="panel literal-shell-panel"><p>Loading workspace...</p></section> : renderActiveTab()}
          </section>
        </div>
      </section>
    </main>
  );
}

export default App;
