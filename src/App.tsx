import { FormEvent, useEffect, useRef, useState } from "react";
import {
  bindNorthStarDesktop,
  createPlace,
  createReflection,
  createRule,
  createNorthStarSession,
  clearAllLocalData,
  clearVoiceAssets,
  completeTelegramUserLogin,
  dispatchDraftedOutreach,
  downloadKokoroAssets,
  endCallSession,
  getCallTurnsForSession,
  getDecisionSnapshot,
  getDiagnostics,
  getCallSessionSnapshot,
  getMemoryGrowthSnapshot,
  getMvpRealityCheckSnapshot,
  getNorthStarSnapshot,
  importNorthStarCallReviews,
  processNextNorthStarCallTurn,
  processNorthStarLiveTurn,
  getPassiveContextSnapshot,
  getPhaseOneSnapshot,
  getPhaseThreeSnapshot,
  getTelegramConnectionSnapshot,
  getTelegramCallTransportSnapshot,
  getTelegramUserSnapshot,
  getVoiceSnapshot,
  ingestLocationEvent,
  listSimulationScenarios,
  loadSettings,
  pollTelegramUpdates,
  prepareTelegramUserRuntime,
  prepareTelegramCallTransport,
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
  sendTestTelegramMessage,
  sendTelegramUserLoginCode,
  setupLocalSpeech,
  startTelegramTestCall,
  startSpeechStream,
  stopSpeechStreamAndReply,
  startCallSession,
  startNorthStarAcceptedCall,
  submitOutreachFeedback,
  synthesizeVoicePreview,
  logoutTelegramUser,
  pullNorthStarLocationEvents,
  pullNorthStarWebRtcSignals,
  updateMemoryItem,
  updatePlace,
  updateRule,
  getSpeechStreamSnapshot,
  sendNorthStarWebRtcSignal,
} from "./tauri";
import type {
  AppSettings,
  CallSessionSnapshot,
  CallTurnRecord,
  CallTurnResult,
  CompleteTelegramUserLoginInput,
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
  NorthStarTurnProcessingResult,
  NorthStarWebRtcSignal,
  SettingsEntry,
  SimulationRunResult,
  SimulationScenario,
  SimulationSuiteResult,
  SpeechStreamSnapshot,
  StartCallSessionInput,
  StartSpeechStreamInput,
  StopSpeechStreamInput,
  TelegramConnectionSnapshot,
  TelegramCallTransportSnapshot,
  TelegramCallActionResult,
  TelegramUserSnapshot,
  UpdateMemoryItemInput,
  UpdatePlaceInput,
  UpdateRuleInput,
  VoiceSnapshot,
  VoiceSynthesisResult,
} from "./types";

type TabId = "settings" | "memory" | "context" | "judgment" | "telegram" | "review";
type SettingsSectionId = "core" | "connections" | "voice" | "diagnostics";
type MemorySectionId = "places" | "rules" | "reflections" | "overview" | "growth";
type ContextSectionId = "ingest" | "timeline" | "patterns";
type JudgmentSectionId = "reality" | "simulator" | "runtime" | "history";
type TelegramSectionId = "controls" | "outbound" | "inbound" | "feedback";
type ReviewSectionId = "places" | "rules" | "moments" | "outreach" | "calls";
const NORTH_STAR_LIVE_CHANNEL_CHUNK_SIZE = 48_000;

type TabDefinition = {
  id: TabId;
  label: string;
  eyebrow: string;
  title: string;
  description: string;
};

const tabs: TabDefinition[] = [
  { id: "settings", label: "Settings", eyebrow: "Phase 0", title: "System setup", description: "Connections, thresholds, and diagnostics." },
  { id: "memory", label: "Memory", eyebrow: "Phase 1", title: "Manual memory foundation", description: "Places, rules, reflections, and memory overview." },
  { id: "context", label: "Context", eyebrow: "Phase 2", title: "Passive context capture", description: "Raw events, visits, repeated places, and sleep inference." },
  { id: "judgment", label: "Judgment", eyebrow: "Phases 3-6", title: "Moments and messaging", description: "Saved moments, rhythm, decisions, and draft outreach." },
  { id: "telegram", label: "Telegram", eyebrow: "Phases 4-7", title: "Delivery and feedback", description: "Bot controls, inbound updates, and learning signals." },
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
  telegramBotToken: "",
  telegramDefaultChatId: "",
  telegramLastUpdateId: 0,
  telegramUserApiId: "",
  telegramUserApiHash: "",
  telegramUserPhone: "",
  telegramUserCallTarget: "",
  lmStudioEndpoint: "http://127.0.0.1:1234",
  lmStudioApiKey: "",
  lmStudioModel: "qwen/qwen3.5-9b",
  ttsProvider: "kokoro",
  ttsModelId: "kokoro-82m",
  ttsSampleRate: 24000,
  ttsDefaultVoice: "af_heart",
  ttsModelPath: "",
  ttsVoicesPath: "",
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

function App() {
  const [activeTab, setActiveTab] = useState<TabId>("settings");
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [savedRows, setSavedRows] = useState<SettingsEntry[]>([]);
  const [snapshot, setSnapshot] = useState<PhaseOneSnapshot | null>(null);
  const [passiveSnapshot, setPassiveSnapshot] = useState<PassiveContextSnapshot | null>(null);
  const [phaseThreeSnapshot, setPhaseThreeSnapshot] = useState<PhaseThreeSnapshot | null>(null);
  const [decisionSnapshot, setDecisionSnapshot] = useState<DecisionSnapshot | null>(null);
  const [northStarSnapshot, setNorthStarSnapshot] = useState<NorthStarSnapshot | null>(null);
  const [telegramSnapshot, setTelegramSnapshot] = useState<TelegramConnectionSnapshot | null>(null);
  const [telegramUserSnapshot, setTelegramUserSnapshot] = useState<TelegramUserSnapshot | null>(null);
  const [telegramCallTransportSnapshot, setTelegramCallTransportSnapshot] = useState<TelegramCallTransportSnapshot | null>(null);
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
  const [telegramSection, setTelegramSection] = useState<TelegramSectionId>("controls");
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
  const [telegramLoginCode, setTelegramLoginCode] = useState("");
  const [telegramLoginPassword, setTelegramLoginPassword] = useState("");
  const [northStarMessageText, setNorthStarMessageText] = useState("");
  const [northStarCallNote, setNorthStarCallNote] = useState("");
  const [northStarTurnStatus, setNorthStarTurnStatus] = useState<NorthStarTurnProcessingResult | null>(null);
  const [placeForm, setPlaceForm] = useState<CreatePlaceInput>(defaultPlace);
  const [ruleForm, setRuleForm] = useState<CreateRuleInput>(defaultRule);
  const [reflectionForm, setReflectionForm] = useState<CreateReflectionInput>(defaultReflection);
  const [locationForm, setLocationForm] = useState<LocationEventInput>(defaultLocationEvent);
  const [reviewPlace, setReviewPlace] = useState<UpdatePlaceInput | null>(null);
  const [reviewRule, setReviewRule] = useState<UpdateRuleInput | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyPanel, setBusyPanel] = useState<"place" | "rule" | "reflection" | "memoryGrowth" | "memoryReview" | "location" | "telegramSend" | "telegramPoll" | "telegramUserRuntime" | "telegramCallRuntime" | "telegramUserCode" | "telegramUserLogin" | "telegramUserLogout" | "northStarSession" | "northStarBind" | "northStarHeartbeat" | "northStarMessage" | "northStarCall" | "northStarPull" | "northStarImportReviews" | "northStarTurn" | "northStarLink" | "decisions" | "callDecisions" | "dispatch" | "feedback" | "reviewPlace" | "reviewRule" | "realitySeed" | "simulationRun" | "runtimeReset" | "simulationSuite" | "voiceDownload" | "voiceRuntime" | "voicePreview" | "voiceCleanup" | "localCleanup" | "callStart" | "callEnd" | "speechSetup" | "callTurn" | "speechStreamStart" | "speechStreamStop" | "northStarAcceptedCall" | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const missingAcceptedNorthStarPollsRef = useRef(0);
  const northStarWebRtcPeerRef = useRef<RTCPeerConnection | null>(null);
  const northStarWebRtcChannelRef = useRef<RTCDataChannel | null>(null);
  const northStarWebRtcCallIdRef = useRef<string | null>(null);
  const processedNorthStarSignalIdsRef = useRef<Set<string>>(new Set());
  const northStarLiveTurnChunksRef = useRef<Map<string, string[]>>(new Map());
  const northStarPeerAudioContextRef = useRef<AudioContext | null>(null);
  const northStarPeerAudioDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const northStarIncomingMediaStreamRef = useRef<MediaStream | null>(null);
  const northStarIncomingRecorderRef = useRef<MediaRecorder | null>(null);
  const northStarIncomingChunksRef = useRef<Blob[]>([]);
  const northStarIncomingAudioContextRef = useRef<AudioContext | null>(null);
  const northStarIncomingProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const northStarIncomingSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const northStarIncomingSinkRef = useRef<GainNode | null>(null);
  const northStarIncomingSpeechDetectedRef = useRef(false);
  const northStarIncomingSpeechFramesRef = useRef(0);
  const northStarIncomingSilenceFramesRef = useRef(0);
  const northStarIncomingProcessingRef = useRef(false);

  const activeTabMeta = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];
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
  const latestAcceptedCallRequest =
    telegramSnapshot?.outreachEvents.find((event) => event.outreachKind === "call_request" && event.responseState === "accepted")
    ?? null;
  const latestAcceptedNorthStarCall =
    northStarSnapshot?.callSessions.find((call) => call.status === "accepted")
    ?? null;
  const activeNorthStarSession =
    callSessionSnapshot?.activeSession?.handoffKind === "north_star_companion"
    && callSessionSnapshot.activeSession.sessionState === "active"
      ? callSessionSnapshot.activeSession
      : null;
  const activeNorthStarRemoteCallId = activeNorthStarSession?.notes.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0] ?? null;
  const activeNorthStarRemoteCall =
    activeNorthStarRemoteCallId
      ? northStarSnapshot?.callSessions.find((call) => call.callId === activeNorthStarRemoteCallId) ?? null
      : null;
  const northStarSessionReady = northStarSnapshot?.sessionReady ?? false;
  const northStarDesktopBound = northStarSnapshot?.desktopBound ?? false;
  const northStarReadyForCalls = northStarSnapshot?.configured && northStarSessionReady && northStarDesktopBound;
  const northStarLiveChannelReady =
    Boolean(
      activeNorthStarSession
      && northStarWebRtcCallIdRef.current === activeNorthStarRemoteCallId
      && northStarWebRtcChannelRef.current
      && northStarWebRtcChannelRef.current.readyState === "open",
    );

  function teardownNorthStarWebRtc() {
    northStarWebRtcChannelRef.current?.close();
    northStarWebRtcPeerRef.current?.close();
    northStarPeerAudioContextRef.current?.close().catch(() => undefined);
    northStarIncomingProcessorRef.current?.disconnect();
    northStarIncomingSourceRef.current?.disconnect();
    northStarIncomingSinkRef.current?.disconnect();
    northStarIncomingAudioContextRef.current?.close().catch(() => undefined);
    if (northStarIncomingRecorderRef.current?.state === "recording") {
      northStarIncomingRecorderRef.current.stop();
    }
    northStarWebRtcChannelRef.current = null;
    northStarWebRtcPeerRef.current = null;
    northStarWebRtcCallIdRef.current = null;
    processedNorthStarSignalIdsRef.current = new Set();
    northStarLiveTurnChunksRef.current = new Map();
    northStarPeerAudioContextRef.current = null;
    northStarPeerAudioDestinationRef.current = null;
    northStarIncomingMediaStreamRef.current = null;
    northStarIncomingRecorderRef.current = null;
    northStarIncomingChunksRef.current = [];
    northStarIncomingAudioContextRef.current = null;
    northStarIncomingProcessorRef.current = null;
    northStarIncomingSourceRef.current = null;
    northStarIncomingSinkRef.current = null;
    northStarIncomingSpeechDetectedRef.current = false;
    northStarIncomingSpeechFramesRef.current = 0;
    northStarIncomingSilenceFramesRef.current = 0;
    northStarIncomingProcessingRef.current = false;
  }

  function decodeBase64ToArrayBuffer(base64: string) {
    const binary = window.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes.buffer;
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

  function blobToBase64(blob: Blob) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result;
        if (typeof result !== "string") {
          reject(new Error("Could not read audio data."));
          return;
        }
        const commaIndex = result.indexOf(",");
        resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
      };
      reader.onerror = () => reject(reader.error ?? new Error("Could not read audio data."));
      reader.readAsDataURL(blob);
    });
  }

  function resetNorthStarIncomingDetection() {
    northStarIncomingSpeechDetectedRef.current = false;
    northStarIncomingSpeechFramesRef.current = 0;
    northStarIncomingSilenceFramesRef.current = 0;
  }

  async function processNorthStarIncomingBlob(blob: Blob) {
    if (!activeNorthStarSession?.id || northStarIncomingProcessingRef.current) {
      return;
    }
    northStarIncomingProcessingRef.current = true;
    try {
      const audioBase64 = await blobToBase64(blob);
      const result = await processNorthStarLiveTurn(activeNorthStarSession.id, audioBase64);
      setCallTurnResult(result);
      setCallTranscriptSummary(result.transcriptText);
      await playNorthStarReplyOverPeer(result.replyAudioBase64);
      await Promise.all([refreshCallSessionSnapshot(), refreshDiagnostics()]);
    } catch {
      setMessage("North Star had trouble processing the live microphone track.");
    } finally {
      northStarIncomingProcessingRef.current = false;
      resetNorthStarIncomingDetection();
      if (northStarIncomingRecorderRef.current && northStarIncomingRecorderRef.current.state === "inactive") {
        northStarIncomingChunksRef.current = [];
        northStarIncomingRecorderRef.current.start();
      }
    }
  }

  function startNorthStarIncomingTrackLoop(stream: MediaStream) {
    if (northStarIncomingRecorderRef.current || northStarIncomingProcessingRef.current) {
      return;
    }

    const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
    northStarIncomingRecorderRef.current = recorder;
    northStarIncomingChunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        northStarIncomingChunksRef.current.push(event.data);
      }
    };
    recorder.onstop = () => {
      const blob = new Blob(northStarIncomingChunksRef.current, { type: "audio/webm" });
      northStarIncomingChunksRef.current = [];
      if (blob.size > 0) {
        void processNorthStarIncomingBlob(blob);
      }
    };
    recorder.start();

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

    processor.onaudioprocess = (event) => {
      if (!activeNorthStarSession || northStarIncomingProcessingRef.current) {
        return;
      }

      const chunk = event.inputBuffer.getChannelData(0);
      let sum = 0;
      for (let index = 0; index < chunk.length; index += 1) {
        sum += chunk[index] * chunk[index];
      }
      const rms = Math.sqrt(sum / chunk.length);
      const speaking = rms > 0.01;

      if (speaking) {
        northStarIncomingSpeechDetectedRef.current = true;
        northStarIncomingSilenceFramesRef.current = 0;
        northStarIncomingSpeechFramesRef.current += 1;
        if (recorder.state === "inactive") {
          northStarIncomingChunksRef.current = [];
          recorder.start();
        }
        return;
      }

      if (!northStarIncomingSpeechDetectedRef.current) {
        return;
      }

      northStarIncomingSilenceFramesRef.current += 1;
      if (
        northStarIncomingSpeechFramesRef.current >= 3
        && northStarIncomingSilenceFramesRef.current >= 10
        && recorder.state === "recording"
      ) {
        recorder.stop();
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
    source.start();
    return Math.round(audioBuffer.duration * 1000);
  }

  function sendChunkedNorthStarReply(
    channel: RTCDataChannel,
    requestId: string,
    result: CallTurnResult,
  ) {
    const payloadJson = JSON.stringify(result);
    if (payloadJson.length <= NORTH_STAR_LIVE_CHANNEL_CHUNK_SIZE) {
      channel.send(JSON.stringify({
        type: "live_reply",
        requestId,
        result,
      }));
      return;
    }

    const total = Math.ceil(payloadJson.length / NORTH_STAR_LIVE_CHANNEL_CHUNK_SIZE);
    for (let index = 0; index < total; index += 1) {
      const slice = payloadJson.slice(
        index * NORTH_STAR_LIVE_CHANNEL_CHUNK_SIZE,
        (index + 1) * NORTH_STAR_LIVE_CHANNEL_CHUNK_SIZE,
      );
      channel.send(JSON.stringify({
        type: "live_reply_chunk",
        requestId,
        index,
        total,
        payloadSlice: slice,
      }));
    }
  }

  function attachNorthStarDesktopPeer(callId: string, peer: RTCPeerConnection) {
    northStarWebRtcCallIdRef.current = callId;
    const { destination } = ensureNorthStarPeerAudio();
    destination.stream.getAudioTracks().forEach((track) => {
      peer.addTrack(track, destination.stream);
    });
    peer.onicecandidate = (event) => {
      if (!event.candidate || northStarWebRtcCallIdRef.current !== callId) {
        return;
      }
      void sendNorthStarWebRtcSignal(callId, "ice_candidate", JSON.stringify(event.candidate.toJSON())).catch(() => undefined);
    };
    peer.ondatachannel = (event) => {
      northStarWebRtcChannelRef.current = event.channel;
      event.channel.onopen = () => setMessage("North Star live call channel connected.");
      event.channel.onmessage = (messageEvent) => {
        const activeSessionId = activeNorthStarSession?.id;
        if (!activeSessionId) {
          return;
        }
        try {
          const payload = JSON.parse(String(messageEvent.data)) as
            | { type: "live_turn"; requestId: string; audioBase64: string }
            | { type: "live_turn_chunk"; requestId: string; index: number; total: number; audioSlice: string }
            | { type: string };
          if (payload.type === "live_turn_chunk") {
            const requestId = "requestId" in payload ? payload.requestId : "";
            const index = "index" in payload ? payload.index : -1;
            const total = "total" in payload ? payload.total : 0;
            const audioSlice = "audioSlice" in payload ? payload.audioSlice : "";
            if (!requestId || index < 0 || total <= 0 || !audioSlice) {
              return;
            }
            const chunks = northStarLiveTurnChunksRef.current.get(requestId) ?? new Array(total).fill("");
            chunks[index] = audioSlice;
            northStarLiveTurnChunksRef.current.set(requestId, chunks);
            if (chunks.filter(Boolean).length !== total) {
              return;
            }
            northStarLiveTurnChunksRef.current.delete(requestId);
            const mergedAudioBase64 = chunks.join("");
          void processNorthStarLiveTurn(activeSessionId, mergedAudioBase64)
            .then((result) => {
              if (event.channel.readyState !== "open") {
                return;
              }
              void playNorthStarReplyOverPeer(result.replyAudioBase64)
                .then((replyDurationMs) => {
                  event.channel.send(JSON.stringify({
                    type: "live_reply",
                    requestId,
                    result: {
                      transcriptText: result.transcriptText,
                      replyText: result.replyText,
                      remoteAudio: true,
                      replyDurationMs,
                    },
                  }));
                })
                .catch(() => {
                  sendChunkedNorthStarReply(event.channel, requestId, result);
                });
              void Promise.all([refreshCallSessionSnapshot(), refreshDiagnostics()]).catch(() => undefined);
            })
            .catch(() => {
                if (event.channel.readyState !== "open") {
                  return;
                }
                event.channel.send(JSON.stringify({
                  type: "live_reply_error",
                  requestId,
                  message: "North Star could not process that spoken turn live.",
                }));
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
          void processNorthStarLiveTurn(activeSessionId, audioBase64)
            .then((result) => {
              if (event.channel.readyState !== "open") {
                return;
              }
              void playNorthStarReplyOverPeer(result.replyAudioBase64)
                .then((replyDurationMs) => {
                  event.channel.send(JSON.stringify({
                    type: "live_reply",
                    requestId,
                    result: {
                      transcriptText: result.transcriptText,
                      replyText: result.replyText,
                      remoteAudio: true,
                      replyDurationMs,
                    },
                  }));
                })
                .catch(() => {
                  sendChunkedNorthStarReply(event.channel, requestId, result);
                });
              void Promise.all([refreshCallSessionSnapshot(), refreshDiagnostics()]).catch(() => undefined);
            })
            .catch(() => {
              if (event.channel.readyState !== "open") {
                return;
              }
              event.channel.send(JSON.stringify({
                type: "live_reply_error",
                requestId,
                message: "North Star could not process that spoken turn live.",
              }));
            });
        } catch {
          return;
        }
      };
      event.channel.onclose = () => {
        if (northStarWebRtcChannelRef.current === event.channel) {
          northStarWebRtcChannelRef.current = null;
        }
      };
    };
    peer.onconnectionstatechange = () => {
      if (northStarWebRtcCallIdRef.current !== callId) {
        return;
      }
      if (peer.connectionState === "connected") {
        setMessage("North Star live call channel connected.");
      } else if (peer.connectionState === "failed" || peer.connectionState === "disconnected") {
        setMessage("North Star live channel dropped back to fallback mode.");
      }
    };
    peer.ontrack = (event) => {
      if (!event.streams[0]) {
        return;
      }
      northStarIncomingMediaStreamRef.current = event.streams[0];
      startNorthStarIncomingTrackLoop(event.streams[0]);
      setMessage("North Star live microphone track connected.");
    };
  }

  async function handleNorthStarDesktopSignal(callId: string, signal: NorthStarWebRtcSignal) {
    if (processedNorthStarSignalIdsRef.current.has(signal.signalId)) {
      return;
    }
    processedNorthStarSignalIdsRef.current.add(signal.signalId);

    if (signal.signalKind === "offer") {
      teardownNorthStarWebRtc();
      const peer = new RTCPeerConnection();
      attachNorthStarDesktopPeer(callId, peer);
      northStarWebRtcPeerRef.current = peer;
      await peer.setRemoteDescription(JSON.parse(signal.payloadJson) as RTCSessionDescriptionInit);
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      if (peer.localDescription) {
        await sendNorthStarWebRtcSignal(callId, "answer", JSON.stringify(peer.localDescription));
      }
      return;
    }

    if (signal.signalKind === "ice_candidate") {
      const peer = northStarWebRtcPeerRef.current;
      if (!peer) {
        return;
      }
      await peer.addIceCandidate(JSON.parse(signal.payloadJson) as RTCIceCandidateInit);
    }
  }

  async function refreshDiagnostics() { setDiagnostics(await getDiagnostics()); }
  async function refreshNorthStarSnapshot() { setNorthStarSnapshot(await getNorthStarSnapshot()); }
  async function refreshVoiceSnapshot() { setVoiceSnapshot(await getVoiceSnapshot()); }
  async function refreshSpeechStreamSnapshot() { setSpeechStream(await getSpeechStreamSnapshot()); }
  async function refreshSnapshot() { setSnapshot(await getPhaseOneSnapshot()); }
  async function refreshPassiveSnapshot() { setPassiveSnapshot(await getPassiveContextSnapshot()); }
  async function refreshPhaseThreeSnapshot() { setPhaseThreeSnapshot(await getPhaseThreeSnapshot()); }
  async function refreshTelegramSnapshot() { setTelegramSnapshot(await getTelegramConnectionSnapshot()); }
  async function refreshTelegramUserSnapshot() { setTelegramUserSnapshot(await getTelegramUserSnapshot()); }
  async function refreshTelegramCallTransportSnapshot() { setTelegramCallTransportSnapshot(await getTelegramCallTransportSnapshot()); }
  async function refreshCallSessionSnapshot() { setCallSessionSnapshot(await getCallSessionSnapshot()); }
  async function refreshDecisionSnapshot() { setDecisionSnapshot(await getDecisionSnapshot()); }
  async function refreshRealityCheckSnapshot() { setRealityCheckSnapshot(await getMvpRealityCheckSnapshot()); }
  async function refreshMemoryGrowthSnapshot() { setMemoryGrowthSnapshot(await getMemoryGrowthSnapshot()); }

  useEffect(() => {
    let active = true;
    async function bootstrap() {
      try {
        const [loadedSettings, loadedDiagnostics, loadedNorthStarSnapshot, loadedVoiceSnapshot, loadedSpeechStream, loadedSnapshot, loadedPassiveSnapshot, loadedPhaseThreeSnapshot, loadedDecisionSnapshot, loadedTelegramSnapshot, loadedTelegramUserSnapshot, loadedTelegramCallTransportSnapshot, loadedCallSessionSnapshot, loadedRealityCheckSnapshot, loadedSimulationScenarios, loadedMemoryGrowthSnapshot] = await Promise.all([
          loadSettings(),
          getDiagnostics(),
          getNorthStarSnapshot(),
          getVoiceSnapshot(),
          getSpeechStreamSnapshot(),
          getPhaseOneSnapshot(),
          getPassiveContextSnapshot(),
          getPhaseThreeSnapshot(),
          getDecisionSnapshot(),
          getTelegramConnectionSnapshot(),
          getTelegramUserSnapshot(),
          getTelegramCallTransportSnapshot(),
          getCallSessionSnapshot(),
          getMvpRealityCheckSnapshot(),
          listSimulationScenarios(),
          getMemoryGrowthSnapshot(),
        ]);
        if (!active) return;
        setSettings(loadedSettings);
        setDiagnostics(loadedDiagnostics);
        setNorthStarSnapshot(loadedNorthStarSnapshot);
        setVoiceSnapshot(loadedVoiceSnapshot);
        setSpeechStream(loadedSpeechStream);
        setSnapshot(loadedSnapshot);
        setPassiveSnapshot(loadedPassiveSnapshot);
        setPhaseThreeSnapshot(loadedPhaseThreeSnapshot);
        setDecisionSnapshot(loadedDecisionSnapshot);
        setTelegramSnapshot(loadedTelegramSnapshot);
        setTelegramUserSnapshot(loadedTelegramUserSnapshot);
        setTelegramCallTransportSnapshot(loadedTelegramCallTransportSnapshot);
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

  useEffect(() => {
    if (!speechStream?.active) return;
    const timer = window.setInterval(() => {
      void refreshSpeechStreamSnapshot();
    }, 250);
    return () => window.clearInterval(timer);
  }, [speechStream?.active]);

  useEffect(() => {
    if (!northStarSnapshot?.configured) return;
    const timer = window.setInterval(() => {
      void refreshNorthStarSnapshot();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [northStarSnapshot?.configured]);

  useEffect(() => {
    if (!northStarDesktopBound || busyPanel === "northStarHeartbeat") return;
    const timer = window.setInterval(() => {
      void sendNorthStarHeartbeat()
        .then((snapshot) => setNorthStarSnapshot(snapshot))
        .catch(() => undefined);
    }, 15000);
    return () => window.clearInterval(timer);
  }, [northStarDesktopBound, busyPanel]);

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
        await handleStartNorthStarAcceptedCall();
      })();
      return;
    }
    if (!callSessionSnapshot?.activeSession) {
      void handleStartNorthStarAcceptedCall();
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
    if (!northStarSnapshot?.configured || busyPanel === "callEnd" || busyPanel === "northStarAcceptedCall") {
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
  }, [activeNorthStarSession?.id, activeNorthStarRemoteCall?.callId, activeNorthStarRemoteCall?.status, northStarSnapshot?.configured, busyPanel]);

  useEffect(() => {
    if (!activeNorthStarSession || !activeNorthStarRemoteCallId) {
      teardownNorthStarWebRtc();
      return;
    }

    let cancelled = false;
    const targetCallId = activeNorthStarRemoteCallId;
    if (northStarWebRtcCallIdRef.current !== targetCallId) {
      teardownNorthStarWebRtc();
      northStarWebRtcCallIdRef.current = targetCallId;
    }

    async function pollSignals() {
      try {
        const signals = await pullNorthStarWebRtcSignals(targetCallId);
        if (cancelled || northStarWebRtcCallIdRef.current !== targetCallId) {
          return;
        }
        for (const signal of signals) {
          await handleNorthStarDesktopSignal(targetCallId, signal);
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
  }, [activeNorthStarSession?.id, activeNorthStarRemoteCallId]);

  useEffect(() => {
    if (!activeNorthStarSession || busyPanel === "northStarTurn" || busyPanel === "speechStreamStart" || busyPanel === "speechStreamStop") {
      return;
    }
    const timer = window.setInterval(() => {
      void handleProcessNorthStarTurn();
    }, 1800);
    return () => window.clearInterval(timer);
  }, [callSessionSnapshot?.activeSession?.id, callSessionSnapshot?.activeSession?.handoffKind, callSessionSnapshot?.activeSession?.sessionState, busyPanel]);

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
      await Promise.all([refreshDiagnostics(), refreshNorthStarSnapshot(), refreshVoiceSnapshot(), refreshTelegramSnapshot(), refreshTelegramUserSnapshot(), refreshTelegramCallTransportSnapshot(), refreshDecisionSnapshot(), refreshRealityCheckSnapshot()]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateNorthStarSession() {
    setBusyPanel("northStarSession");
    setError("");
    setMessage("");
    try {
      const snapshot = await createNorthStarSession();
      setNorthStarSnapshot(snapshot);
      const loaded = await loadSettings();
      setSettings(loaded);
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
      setNorthStarSnapshot(snapshot);
      const loaded = await loadSettings();
      setSettings(loaded);
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
      let snapshot = northStarSnapshot;
      if (!snapshot?.sessionReady) {
        snapshot = await createNorthStarSession();
        setNorthStarSnapshot(snapshot);
      }
      if (!snapshot?.desktopBound) {
        snapshot = await bindNorthStarDesktop();
        setNorthStarSnapshot(snapshot);
      }
      snapshot = await sendNorthStarHeartbeat();
      setNorthStarSnapshot(snapshot);
      const loaded = await loadSettings();
      setSettings(loaded);
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
      setNorthStarSnapshot(snapshot);
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
      setNorthStarSnapshot(snapshot);
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
      setNorthStarSnapshot(snapshot);
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
      setNorthStarSnapshot(snapshot);
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
      const note = northStarCallNote.trim() || "NeuralTrainer is calling you now.";
      const snapshot = await sendNorthStarCallRequest(note);
      setNorthStarSnapshot(snapshot);
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
      setNorthStarSnapshot(snapshot);
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

  async function handleTelegramSend() {
    setBusyPanel("telegramSend");
    setError("");
    setMessage("");
    try {
      const result = await sendTestTelegramMessage();
      setMessage(`Telegram test message sent to chat ${result.telegramChatId}.`);
      await Promise.all([refreshTelegramSnapshot(), refreshDiagnostics(), refreshRealityCheckSnapshot()]);
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
      const snapshot = await prepareKokoroRuntime();
      setVoiceSnapshot(snapshot);
      setMessage("Kokoro Python runtime is ready.");
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
        refreshTelegramSnapshot(),
        refreshTelegramUserSnapshot(),
        refreshTelegramCallTransportSnapshot(),
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

  async function handleStartSpeechStream(payload: StartSpeechStreamInput) {
    setBusyPanel("speechStreamStart");
    setError("");
    setMessage("");
    try {
      setCallTurnResult(null);
      setCallReplyAudioSrc(null);
      const snapshot = await startSpeechStream(payload);
      setSpeechStream(snapshot);
      setMessage("Listening live. Speak naturally, then stop the stream when you're done.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusyPanel(null);
    }
  }

  async function handleStopSpeechStream(payload: StopSpeechStreamInput) {
    setBusyPanel("speechStreamStop");
    setError("");
    setMessage("");
    try {
      const result = await stopSpeechStreamAndReply(payload);
      setCallTurnResult(result);
      setCallReplyAudioSrc(`data:audio/wav;base64,${result.replyAudioBase64}`);
      setCallTranscriptSummary(result.transcriptText);
      setSpeechStream(await getSpeechStreamSnapshot());
      setMessage("Stopped listening and generated a spoken reply.");
      await Promise.all([refreshDiagnostics(), refreshCallSessionSnapshot()]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      try {
        await refreshSpeechStreamSnapshot();
      } catch {
        // Keep original error.
      }
    } finally {
      setBusyPanel(null);
    }
  }

  async function handleTelegramPoll() {
    setBusyPanel("telegramPoll");
    setError("");
    setMessage("");
    try {
      setTelegramSnapshot(await pollTelegramUpdates());
      setMessage("Telegram updates polled and local reply history refreshed.");
      await Promise.all([refreshPassiveSnapshot(), refreshPhaseThreeSnapshot(), refreshTelegramSnapshot(), refreshCallSessionSnapshot(), refreshDiagnostics(), refreshRealityCheckSnapshot()]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusyPanel(null);
    }
  }

  async function handlePrepareTelegramUserRuntime() {
    setBusyPanel("telegramUserRuntime");
    setError("");
    setMessage("");
    try {
      const snapshot = await prepareTelegramUserRuntime();
      setTelegramUserSnapshot(snapshot);
      setMessage("Telegram user runtime prepared.");
      await Promise.all([refreshDiagnostics(), refreshTelegramCallTransportSnapshot()]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusyPanel(null);
    }
  }

  async function handlePrepareTelegramCallTransport() {
    setBusyPanel("telegramCallRuntime");
    setError("");
    setMessage("");
    try {
      const snapshot = await prepareTelegramCallTransport();
      setTelegramCallTransportSnapshot(snapshot);
      setMessage("Telegram private-call transport runtime prepared.");
      await refreshDiagnostics();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusyPanel(null);
    }
  }

  async function handleStartTelegramTestCall() {
    setBusyPanel("telegramCallRuntime");
    setError("");
    setMessage("");
    try {
      const result = await startTelegramTestCall();
      setTelegramCallTransportSnapshot(result.snapshot);
      setMessage(result.detail);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusyPanel(null);
    }
  }

  async function handleSendTelegramUserCode() {
    setBusyPanel("telegramUserCode");
    setError("");
    setMessage("");
    try {
      const result = await sendTelegramUserLoginCode();
      setTelegramUserSnapshot(result.snapshot);
      setMessage(result.detail);
      setTelegramLoginCode("");
      await refreshTelegramCallTransportSnapshot();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusyPanel(null);
    }
  }

  async function handleCompleteTelegramUserLogin() {
    if (!telegramLoginCode.trim()) {
      setMessage("Enter the Telegram login code first.");
      return;
    }
    setBusyPanel("telegramUserLogin");
    setError("");
    setMessage("");
    try {
      const payload: CompleteTelegramUserLoginInput = {
        code: telegramLoginCode.trim(),
        password: telegramLoginPassword.trim() || null,
      };
      const result = await completeTelegramUserLogin(payload);
      setTelegramUserSnapshot(result.snapshot);
      setTelegramLoginCode("");
      setTelegramLoginPassword("");
      setMessage(result.detail);
      await refreshTelegramCallTransportSnapshot();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusyPanel(null);
    }
  }

  async function handleLogoutTelegramUser() {
    setBusyPanel("telegramUserLogout");
    setError("");
    setMessage("");
    try {
      const result = await logoutTelegramUser();
      setTelegramUserSnapshot(result.snapshot);
      setTelegramLoginCode("");
      setTelegramLoginPassword("");
      setMessage(result.detail);
      await refreshTelegramCallTransportSnapshot();
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
      await Promise.all([refreshDecisionSnapshot(), refreshPhaseThreeSnapshot(), refreshTelegramSnapshot(), refreshCallSessionSnapshot(), refreshDiagnostics(), refreshRealityCheckSnapshot()]);
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
      await Promise.all([refreshDecisionSnapshot(), refreshPhaseThreeSnapshot(), refreshTelegramSnapshot(), refreshCallSessionSnapshot(), refreshDiagnostics(), refreshRealityCheckSnapshot()]);
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
      await Promise.all([refreshSnapshot(), refreshTelegramSnapshot(), refreshDiagnostics()]);
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
      await Promise.all([refreshSnapshot(), refreshTelegramSnapshot(), refreshDiagnostics()]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusyPanel(null);
    }
  }

  async function handleDispatchDrafts() {
    setBusyPanel("dispatch");
    setError("");
    setMessage("");
    try {
      const result = await dispatchDraftedOutreach();
      setMessage(`Draft dispatch complete: ${result.sentCount} sent, ${result.failedCount} failed.`);
      await Promise.all([refreshDecisionSnapshot(), refreshTelegramSnapshot(), refreshCallSessionSnapshot(), refreshDiagnostics(), refreshRealityCheckSnapshot()]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusyPanel(null);
    }
  }

  async function handleStartCallSession(payload: StartCallSessionInput) {
    setBusyPanel("callStart");
    setError("");
    setMessage("");
    try {
      const snapshot = await startCallSession(payload);
      setCallSessionSnapshot(snapshot);
      setCallSessionNotes(payload.notes);
      setCallTurnResult(null);
      setCallReplyAudioSrc(null);
      setSpeechStream(null);
      setMessage("Call session started.");
      await Promise.all([refreshTelegramSnapshot(), refreshCallSessionSnapshot(), refreshDecisionSnapshot(), refreshDiagnostics()]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusyPanel(null);
    }
  }

  async function handleStartNorthStarAcceptedCall() {
    setBusyPanel("northStarAcceptedCall");
    setError("");
    setMessage("");
    setNorthStarTurnStatus(null);
    setCallTurnResult(null);
    setCallReplyAudioSrc(null);
    setCallTranscriptSummary("");
    setCallSessionNotes("");
    setSpeechStream(null);
    try {
      const snapshot = await startNorthStarAcceptedCall();
      setCallSessionSnapshot(snapshot);
      setMessage("Started a local call session from the accepted North Star request.");
      await Promise.all([refreshNorthStarSnapshot(), refreshCallSessionSnapshot(), refreshDiagnostics()]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusyPanel(null);
    }
  }

  async function handleProcessNorthStarTurn() {
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
      await Promise.all([refreshTelegramSnapshot(), refreshCallSessionSnapshot(), refreshDecisionSnapshot(), refreshDiagnostics()]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusyPanel(null);
    }
  }

  async function handleFeedback(feedbackKind: "helpful" | "mistimed" | "intrusive" | "welcome", outreachEventId: number) {
    setBusyPanel("feedback");
    setError("");
    setMessage("");
    try {
      setTelegramSnapshot(await submitOutreachFeedback({ outreachEventId, feedbackKind, notes: "" }));
      setMessage(`Recorded feedback: ${feedbackKind}.`);
      await Promise.all([refreshDecisionSnapshot(), refreshTelegramSnapshot(), refreshCallSessionSnapshot(), refreshDiagnostics(), refreshRealityCheckSnapshot()]);
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
        refreshTelegramSnapshot(),
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
        refreshTelegramSnapshot(),
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
        refreshTelegramSnapshot(),
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
                      {northStarSnapshot ? (
                        <>
                          <dl className="facts">
                            <div><dt>Link</dt><dd>{northStarReadyForCalls ? "Ready" : "Needs setup"}</dd></div>
                            <div><dt>Companion</dt><dd>{northStarSnapshot.displayName || "North Star"}</dd></div>
                            <div><dt>Desktop</dt><dd>{northStarSnapshot.desktopName}</dd></div>
                            <div><dt>Active phone calls</dt><dd>{northStarSnapshot.callSessions.filter((entry) => entry.status === "pending" || entry.status === "accepted").length}</dd></div>
                          </dl>
                          <p><strong>Status</strong><br />{northStarSnapshot.detail}</p>
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
                            <button type="button" className="ghost" onClick={handleImportNorthStarCallReviews} disabled={busyPanel === "northStarImportReviews" || !northStarSnapshot.callReviews.length}>
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
                              <div><strong>Session token</strong><br />{northStarSnapshot.sessionTokenMasked || "Not created yet"}</div>
                              <div><strong>Device token</strong><br />{northStarSnapshot.deviceTokenMasked || "Not bound yet"}</div>
                            </div>
                            <label><span>Desktop call note</span><textarea rows={2} value={northStarCallNote} onChange={(event) => setNorthStarCallNote(event.target.value)} placeholder="Optional note for the phone call request..." /></label>
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
                    <label><span>Telegram bot token</span><input type="password" value={settings.telegramBotToken} onChange={(event) => setSettings((current) => ({ ...current, telegramBotToken: event.target.value }))} /></label>
                    <div className="split">
                      <label><span>Telegram default chat ID</span><input value={settings.telegramDefaultChatId} onChange={(event) => setSettings((current) => ({ ...current, telegramDefaultChatId: event.target.value }))} /></label>
                    <label><span>Telegram last update ID</span><input value={settings.telegramLastUpdateId} disabled /></label>
                  </div>
                  <div className="split">
                    <label><span>Telegram user API ID</span><input value={settings.telegramUserApiId} onChange={(event) => setSettings((current) => ({ ...current, telegramUserApiId: event.target.value }))} /></label>
                    <label><span>Telegram user phone</span><input value={settings.telegramUserPhone} onChange={(event) => setSettings((current) => ({ ...current, telegramUserPhone: event.target.value }))} placeholder="+31..." /></label>
                  </div>
                  <label><span>Telegram user API hash</span><input type="password" value={settings.telegramUserApiHash} onChange={(event) => setSettings((current) => ({ ...current, telegramUserApiHash: event.target.value }))} /></label>
                  <label><span>Telegram call target</span><input value={settings.telegramUserCallTarget} onChange={(event) => setSettings((current) => ({ ...current, telegramUserCallTarget: event.target.value }))} placeholder="@username or phone" /></label>
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
                    <label><span>Model ID</span><input value={settings.ttsModelId} onChange={(event) => setSettings((current) => ({ ...current, ttsModelId: event.target.value }))} /></label>
                  </div>
                  <div className="split">
                    <label><span>Sample rate</span><input type="number" min={8000} value={settings.ttsSampleRate} onChange={(event) => setSettings((current) => ({ ...current, ttsSampleRate: Number(event.target.value) || 24000 }))} /></label>
                    <label><span>Default voice</span><input value={settings.ttsDefaultVoice} onChange={(event) => setSettings((current) => ({ ...current, ttsDefaultVoice: event.target.value }))} /></label>
                  </div>
                  <label><span>Model file path</span><input value={settings.ttsModelPath} onChange={(event) => setSettings((current) => ({ ...current, ttsModelPath: event.target.value }))} placeholder="Leave empty to use the app's Kokoro model path" /></label>
                  <label><span>Voices file path</span><input value={settings.ttsVoicesPath} onChange={(event) => setSettings((current) => ({ ...current, ttsVoicesPath: event.target.value }))} placeholder="Leave empty to use the app's Kokoro voices path" /></label>

                  <div className="voice-card">
                    <h3>Kokoro readiness</h3>
                    {voiceSnapshot ? (
                      <>
                        <dl className="facts">
                          <div><dt>Files ready</dt><dd>{voiceSnapshot.filesReady ? "Yes" : "No"}</dd></div>
                          <div><dt>Runtime ready</dt><dd>{voiceSnapshot.runtimeReady ? "Yes" : "No"}</dd></div>
                          <div><dt>Speech ready</dt><dd>{voiceSnapshot.speechReady ? "Yes" : "No"}</dd></div>
                          <div><dt>Speech runtime</dt><dd>{voiceSnapshot.speechRuntimeReady ? "Yes" : "No"}</dd></div>
                          <div><dt>Default voice</dt><dd>{voiceSnapshot.defaultVoice}</dd></div>
                          <div><dt>Sample rate</dt><dd>{voiceSnapshot.sampleRate} Hz</dd></div>
                          <div><dt>Provider</dt><dd>{voiceSnapshot.provider}</dd></div>
                        </dl>
                        <p><strong>Runtime status</strong><br />{voiceSnapshot.runtimeDetail}</p>
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
              <div className="saved-state inline-note"><h3>Telegram live location shape</h3><code>{`{
  "occurredAt": "2026-03-23T10:38:00Z",
  "latitude": 52.3712,
  "longitude": 4.9004,
  "accuracyMeters": 12,
  "speedMps": 0,
  "source": "telegram_location"
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
            <div className="panel-header"><h2>Recent raw events</h2><p>Manual and Telegram-derived location records.</p></div>
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
            <button type="button" className="ghost" onClick={() => void handleDispatchDrafts()} disabled={busyPanel === "dispatch" || loading}>{busyPanel === "dispatch" ? "Sending..." : "Send drafted outreach"}</button>
          </div>
        </section>

        <div className="grid two-up">
          <section className="panel">
            <div className="panel-header"><h2>Call surface</h2><p>Move from an accepted call request into a real tracked session.</p></div>
            <dl className="facts">
              <div><dt>Accepted call requests</dt><dd>{callSessionSnapshot?.acceptedCallRequestCount ?? 0}</dd></div>
              <div><dt>Active sessions</dt><dd>{callSessionSnapshot?.activeSessionCount ?? 0}</dd></div>
            </dl>
              <div className="actions">
                <button
                  type="button"
                  onClick={() => void handleStartCallSession({ outreachEventId: latestAcceptedCallRequest?.id ?? null, handoffKind: "accepted_handoff", notes: "Started from accepted Telegram call request." })}
                  disabled={busyPanel === "callStart" || !latestAcceptedCallRequest || !!callSessionSnapshot?.activeSession}
                >
                  {busyPanel === "callStart" ? "Starting..." : "Start accepted call"}
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => void handleStartNorthStarAcceptedCall()}
                  disabled={busyPanel === "northStarAcceptedCall" || !latestAcceptedNorthStarCall || !!callSessionSnapshot?.activeSession}
                >
                  {busyPanel === "northStarAcceptedCall" ? "Starting..." : "Start North Star call"}
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => void handleStartCallSession({ outreachEventId: null, handoffKind: "local_test_surface", notes: "Started from the local desktop call surface." })}
                  disabled={busyPanel === "callStart" || !!callSessionSnapshot?.activeSession}
              >
                Start local test call
              </button>
            </div>
              {latestAcceptedCallRequest ? (
                <p className="memory-explanation"><strong>Ready handoff:</strong> {latestAcceptedCallRequest.messageText}</p>
              ) : latestAcceptedNorthStarCall ? (
                <p className="memory-explanation"><strong>Ready North Star handoff:</strong> {latestAcceptedNorthStarCall.note || "Accepted companion call waiting."}</p>
              ) : (
                <p className="memory-explanation">No accepted Telegram or North Star call request is ready yet. You can still start a local test call.</p>
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
                      {busyPanel === "northStarTurn"
                        ? "North Star is responding right now."
                        : "The line is open. North Star is listening for the next thing you say."}
                    </p>
                    <p className="memory-explanation">
                      {northStarLiveChannelReady ? "Call path: live channel connected." : "Call path: fallback voice path."}
                    </p>
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
                  {speechStream?.active ? (
                    <button
                      type="button"
                      className="ghost"
                      title="Stop the live microphone stream and generate a spoken reply."
                      onClick={() => void handleStopSpeechStream({ sessionId: callSessionSnapshot.activeSession!.id })}
                      disabled={busyPanel === "speechStreamStop"}
                    >
                      {busyPanel === "speechStreamStop" ? "Replying..." : "Stop and reply"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="ghost"
                      title={!voiceSnapshot?.speechReady || !voiceSnapshot?.speechRuntimeReady ? "Set up voice in Settings > Voice first." : "Start listening live through this PC microphone."}
                      onClick={() => void handleStartSpeechStream({ sessionId: callSessionSnapshot.activeSession!.id })}
                      disabled={busyPanel === "speechStreamStart" || !voiceSnapshot?.speechReady || !voiceSnapshot?.speechRuntimeReady || !voiceSnapshot?.runtimeReady}
                    >
                      {busyPanel === "speechStreamStart"
                        ? "Starting..."
                        : (!voiceSnapshot?.speechReady || !voiceSnapshot?.speechRuntimeReady)
                          ? "Set up speech input first"
                          : "Start listening"}
                    </button>
                  )}
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
                {!voiceSnapshot?.speechReady || !voiceSnapshot?.speechRuntimeReady ? (
                  <p className="memory-explanation">If the microphone path is not ready yet, use Settings &gt; Voice and run Set up voice once. Repair speech input is only for fixing the local STT setup.</p>
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
                {callSessionSnapshot.activeSessionTurns.length ? (
                  <div className="saved-state">
                    <h3>Conversation so far</h3>
                    <ul>
                      {callSessionSnapshot.activeSessionTurns.map((turn) => (
                        <li key={turn.id}>
                          <strong>{formatDateTime(turn.createdAt)}</strong>
                          <code>You said: {turn.transcriptText}</code>
                          <code>North Star answered: {turn.replyText}</code>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>

          <section className="panel">
            <div className="panel-header"><h2>Call history</h2><p>Recent sessions with outcomes, timing, and call-derived notes.</p></div>
            <div className="saved-state">
              <ul>
                {callSessionSnapshot?.recentSessions.length ? callSessionSnapshot.recentSessions.map((session) => (
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
        </div>

        <div className="grid two-up">
          <section className="panel">
            <div className="panel-header"><h2>Saved moments</h2><p>Phase 3 memory candidates with evidence attached.</p></div>
            <div className="saved-state"><ul>{phaseThreeSnapshot?.savedMoments.length ? phaseThreeSnapshot.savedMoments.map((moment) => <li key={moment.id}><button type="button" className={`memory-item-button ${selectedSavedMoment?.id === moment.id ? "active" : ""}`} onClick={() => setSelectedSavedMomentId(moment.id)}><strong>{moment.momentKind}</strong><code>confidence {moment.confidence.toFixed(2)} / {moment.inferredSignificance}</code></button></li>) : <li>No saved moments yet.</li>}</ul></div>
          </section>
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

  function renderTelegramTab() {
    return (
      <div className="content-stack">
        {renderSectionTabs([
          { id: "controls", label: "Controls" },
          { id: "outbound", label: "Outbound" },
          { id: "inbound", label: "Inbound" },
          { id: "feedback", label: "Feedback" },
        ], telegramSection, setTelegramSection)}

        {telegramSection === "controls" ? (
        <div className="grid two-up">
          <section className="panel">
            <div className="panel-header"><h2>Telegram bot controls</h2><p>Bot testing, reply polling, and live location ingestion.</p></div>
            <div className="actions">
              <button type="button" onClick={() => void handleTelegramSend()} disabled={busyPanel === "telegramSend" || saving || loading}>{busyPanel === "telegramSend" ? "Sending..." : "Send Telegram test"}</button>
              <button type="button" className="ghost" onClick={() => void handleTelegramPoll()} disabled={busyPanel === "telegramPoll" || saving || loading}>{busyPanel === "telegramPoll" ? "Polling..." : "Poll replies"}</button>
            </div>
          </section>
          <section className="panel">
            <div className="panel-header"><h2>Telegram user account</h2><p>The MTProto user-account foundation needed before real Telegram call transport can exist.</p></div>
            <div className="saved-state">
              <ul>
                <li><strong>Configured</strong><code>{telegramUserSnapshot?.configured ? "Yes" : "No"}</code></li>
                <li><strong>Runtime ready</strong><code>{telegramUserSnapshot?.runtimeReady ? "Yes" : "No"}</code></li>
                <li><strong>Authorized</strong><code>{telegramUserSnapshot?.authorized ? "Yes" : "No"}</code></li>
                <li><strong>Phone</strong><code>{telegramUserSnapshot?.phone || settings.telegramUserPhone || "Not set"}</code></li>
                <li><strong>Session</strong><code>{telegramUserSnapshot?.sessionPath || "Not created yet"}</code></li>
                {telegramUserSnapshot?.meDisplay ? <li><strong>Connected as</strong><code>{telegramUserSnapshot.meDisplay}</code></li> : null}
              </ul>
              <p className="memory-explanation">{telegramUserSnapshot?.runtimeDetail || "Save your Telegram user account settings first, then prepare the MTProto runtime."}</p>
            </div>
            <div className="actions">
              <button type="button" onClick={() => void handlePrepareTelegramUserRuntime()} disabled={busyPanel === "telegramUserRuntime"}>{busyPanel === "telegramUserRuntime" ? "Preparing..." : "Prepare user runtime"}</button>
              <button type="button" className="ghost" onClick={() => void handleSendTelegramUserCode()} disabled={busyPanel === "telegramUserCode" || !telegramUserSnapshot?.configured || !telegramUserSnapshot?.runtimeReady}>{busyPanel === "telegramUserCode" ? "Sending code..." : "Send login code"}</button>
              <button type="button" className="ghost" onClick={() => void handleLogoutTelegramUser()} disabled={busyPanel === "telegramUserLogout" || !telegramUserSnapshot?.authorized}>{busyPanel === "telegramUserLogout" ? "Logging out..." : "Log out user"}</button>
            </div>
            <div className="split">
              <label><span>Login code</span><input value={telegramLoginCode} onChange={(event) => setTelegramLoginCode(event.target.value)} placeholder="Telegram code" /></label>
              <label><span>Password, if asked</span><input type="password" value={telegramLoginPassword} onChange={(event) => setTelegramLoginPassword(event.target.value)} placeholder="2FA password" /></label>
            </div>
            <div className="actions">
              <button type="button" onClick={() => void handleCompleteTelegramUserLogin()} disabled={busyPanel === "telegramUserLogin" || !telegramUserSnapshot?.pendingCode}>{busyPanel === "telegramUserLogin" ? "Connecting..." : "Complete login"}</button>
            </div>
          </section>
          <section className="panel">
            <div className="panel-header"><h2>Telegram call transport</h2><p>The private-call runtime foundation that has to exist before a real Telegram call can be attempted.</p></div>
            <div className="saved-state">
              <ul>
                <li><strong>Configured</strong><code>{telegramCallTransportSnapshot?.configured ? "Yes" : "No"}</code></li>
                <li><strong>User authorized</strong><code>{telegramCallTransportSnapshot?.userAuthorized ? "Yes" : "No"}</code></li>
                <li><strong>Runtime ready</strong><code>{telegramCallTransportSnapshot?.runtimeReady ? "Yes" : "No"}</code></li>
                <li><strong>Provider</strong><code>{telegramCallTransportSnapshot?.provider || "telegram_mtproto"}</code></li>
                <li><strong>Package</strong><code>{telegramCallTransportSnapshot?.packageName || "pytgvoip"}</code></li>
                <li><strong>Private calls supported</strong><code>{telegramCallTransportSnapshot?.privateCallsSupported ? "Yes" : "Not yet"}</code></li>
                <li><strong>Target</strong><code>{telegramCallTransportSnapshot?.target || settings.telegramUserCallTarget || "Not set"}</code></li>
                <li><strong>Pending call</strong><code>{telegramCallTransportSnapshot?.pendingCall ? "Yes" : "No"}</code></li>
                {telegramCallTransportSnapshot?.pendingCallTarget ? <li><strong>Pending target</strong><code>{telegramCallTransportSnapshot.pendingCallTarget}</code></li> : null}
                {telegramCallTransportSnapshot?.pendingCallState ? <li><strong>Pending state</strong><code>{telegramCallTransportSnapshot.pendingCallState}</code></li> : null}
              </ul>
              <p className="memory-explanation">{telegramCallTransportSnapshot?.runtimeDetail || "Prepare the Telegram user account first, then prepare the private-call transport runtime."}</p>
            </div>
            <div className="actions">
              <button
                type="button"
                onClick={() => void handlePrepareTelegramCallTransport()}
                disabled={busyPanel === "telegramCallRuntime" || !telegramUserSnapshot?.configured}
              >
                {busyPanel === "telegramCallRuntime" ? "Preparing..." : "Prepare call transport"}
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => void handleStartTelegramTestCall()}
                disabled={
                  busyPanel === "telegramCallRuntime"
                  || !telegramCallTransportSnapshot?.privateCallsSupported
                  || !(telegramCallTransportSnapshot?.target || settings.telegramUserCallTarget)
                }
              >
                {busyPanel === "telegramCallRuntime" ? "Working..." : "Start test call request"}
              </button>
            </div>
            <p className="memory-explanation">Prepare call transport installs the private-call runtime. Start test call request places the outgoing MTProto call request to the saved target.</p>
          </section>
        </div>
        ) : null}

        {telegramSection === "outbound" ? (
          <section className="panel">
            <div className="panel-header"><h2>Outbound history</h2><p>Sent, failed, and drafted outreach items plus feedback controls.</p></div>
            <div className="saved-state">
              <ul>
                {telegramSnapshot?.outreachEvents.length ? telegramSnapshot.outreachEvents.map((event) => (
                  <li key={event.id}>
                    <strong>{event.outreachKind} / {event.responseState}</strong>
                    <code>{event.messageText}</code>
                    {event.responseState === "sent" ? (
                      <div className="actions mini-actions">
                        <button type="button" className="ghost" onClick={() => void handleFeedback("helpful", event.id)} disabled={busyPanel === "feedback"}>Helpful</button>
                        <button type="button" className="ghost" onClick={() => void handleFeedback("mistimed", event.id)} disabled={busyPanel === "feedback"}>Mistimed</button>
                        <button type="button" className="ghost" onClick={() => void handleFeedback("intrusive", event.id)} disabled={busyPanel === "feedback"}>Intrusive</button>
                        <button type="button" className="ghost" onClick={() => void handleFeedback("welcome", event.id)} disabled={busyPanel === "feedback"}>Welcome</button>
                      </div>
                    ) : null}
                  </li>
                )) : <li>No Telegram outreach logged yet.</li>}
              </ul>
            </div>
          </section>
        ) : null}

        {telegramSection === "inbound" ? (
          <section className="panel">
            <div className="panel-header"><h2>Inbound messages</h2><p>Replies and location updates stored from polling.</p></div>
            <div className="saved-state"><ul>{telegramSnapshot?.inboundMessages.length ? telegramSnapshot.inboundMessages.map((messageItem) => <li key={messageItem.id}><strong>chat {messageItem.chatId}</strong><code>{messageItem.text}</code><code>{formatDateTime(messageItem.receivedAt)}</code></li>) : <li>No inbound Telegram messages stored yet.</li>}</ul></div>
          </section>
        ) : null}

        {telegramSection === "feedback" ? (
        <section className="panel">
          <div className="panel-header"><h2>Feedback history</h2><p>How conversations are teaching the decision layer over time.</p></div>
          <div className="saved-state"><ul>{telegramSnapshot?.feedbackEntries.length ? telegramSnapshot.feedbackEntries.map((entry) => <li key={entry.id}><strong>{entry.feedbackKind}</strong><code>event {entry.outreachEventId} / score {entry.score.toFixed(2)}</code><code>{formatDateTime(entry.createdAt)}</code></li>) : <li>No outreach feedback yet.</li>}</ul></div>
        </section>
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
          { id: "outreach", label: "Outreach detail" },
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

        {reviewSection === "outreach" ? (
          <section className="panel">
            <div className="panel-header"><h2>Outreach history detail</h2><p>Inspect reason summaries, delivery metadata, and final text.</p></div>
            <div className="saved-state"><ul>{telegramSnapshot?.outreachEvents.length ? telegramSnapshot.outreachEvents.map((event) => <li key={event.id}><strong>{event.responseState}</strong><code>{event.reasonSummary}</code><code>{event.deliveryMetadataJson}</code><code>{event.messageText}</code></li>) : <li>No outreach history yet.</li>}</ul></div>
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
      case "telegram": return renderTelegramTab();
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
              <li><strong>Outreach events</strong><code>{telegramSnapshot?.outreachEvents.length ?? 0}</code></li>
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
