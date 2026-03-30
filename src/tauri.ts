import { Channel, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  AppSettings,
  CallSessionSnapshot,
  CallTurnRecord,
  CallTurnResult,
  CompanionContextEntry,
  CompanionContextSnapshot,
  CompanionHomeSnapshot,
  CompanionContextCategory,
  CreateCompanionContextCategoryInput,
  CreateCompanionContextEntryInput,
  CreatePlaceInput,
  CreateReflectionInput,
  CreateRuleInput,
  EndCallSessionInput,
  DecisionRunResult,
  DecisionSnapshot,
  DraftedOutreachAutoDispatchResult,
  DiagnosticStatus,
  DraftedOutreachDispatchResult,
  LocationEventInput,
  LivedMomentSnapshot,
  ManualReflection,
  MemoryGrowthSnapshot,
  MemorySystemSnapshot,
  MvpRealityCheckSnapshot,
  NorthStarRuntimeSnapshot,
  NorthStarSnapshot,
  NorthStarRtcIceServer,
  NorthStarTurnProcessingResult,
  NorthStarWebRtcSignal,
  SimulationRunInput,
  SimulationRunResult,
  SimulationScenario,
  SimulationSuiteResult,
  SpeechStreamSnapshot,
  StartSpeechStreamInput,
  StopSpeechStreamInput,
  PushSpeechStreamAudioInput,
  ReorderCompanionContextEntriesInput,
  DeleteCompanionContextCategoryInput,
  VoiceSnapshot,
  VoiceSynthesisResult,
  PassiveContextSnapshot,
  PhaseOneSnapshot,
  PhaseThreeSnapshot,
  Place,
  ProtectedRule,
  RawLocationEvent,
  RunCallTurnInput,
  SettingsEntry,
  StartCallSessionInput,
  UpdateCompanionContextEntryInput,
  UpdateCompanionContextCategoryIconInput,
  UpdateMemoryItemInput,
  UpdatePlaceInput,
  UpdateRuleInput,
} from "./types";

export const loadSettings = () => invoke<AppSettings>("load_settings");

export const saveSettings = (settings: AppSettings) =>
  invoke<SettingsEntry[]>("save_settings", { payload: settings });

export const getDiagnostics = () => invoke<DiagnosticStatus>("get_diagnostics");

export const getCompanionContextSnapshot = () =>
  invoke<CompanionContextSnapshot>("get_companion_context_snapshot");

export const getCompanionHomeSnapshot = () =>
  invoke<CompanionHomeSnapshot>("get_companion_home_snapshot");

export const createCompanionContextCategory = (payload: CreateCompanionContextCategoryInput) =>
  invoke<CompanionContextCategory>("create_companion_context_category", { payload });

export const updateCompanionContextCategoryIcon = (payload: UpdateCompanionContextCategoryIconInput) =>
  invoke<CompanionContextCategory>("update_companion_context_category_icon", { payload });

export const createCompanionContextEntry = (payload: CreateCompanionContextEntryInput) =>
  invoke<CompanionContextEntry>("create_companion_context_entry", { payload });

export const updateCompanionContextEntry = (payload: UpdateCompanionContextEntryInput) =>
  invoke<CompanionContextEntry>("update_companion_context_entry", { payload });

export const archiveCompanionContextEntry = (id: number) =>
  invoke<CompanionContextEntry>("archive_companion_context_entry", { id });

export const reorderCompanionContextEntries = (payload: ReorderCompanionContextEntriesInput) =>
  invoke<CompanionContextSnapshot>("reorder_companion_context_entries", { payload });

export const deleteCompanionContextCategory = (payload: DeleteCompanionContextCategoryInput) =>
  invoke<CompanionContextSnapshot>("delete_companion_context_category", { payload });

export const getNorthStarSnapshot = () =>
  invoke<NorthStarSnapshot>("get_north_star_snapshot");

export const getNorthStarRuntimeSnapshot = () =>
  invoke<NorthStarRuntimeSnapshot>("get_north_star_runtime_snapshot");

export const createNorthStarSession = () =>
  invoke<NorthStarSnapshot>("create_north_star_session");

export const bindNorthStarDesktop = () =>
  invoke<NorthStarSnapshot>("bind_north_star_desktop");

export const sendNorthStarHeartbeat = () =>
  invoke<NorthStarSnapshot>("send_north_star_heartbeat");

export const sendNorthStarMessage = (text: string) =>
  invoke<NorthStarSnapshot>("send_north_star_message", { text });

export const sendNorthStarCallRequest = (note: string) =>
  invoke<NorthStarSnapshot>("send_north_star_call_request", { note });

export const dispatchDraftedOutreach = (outreachEventId: number) =>
  invoke<DraftedOutreachDispatchResult>("dispatch_drafted_outreach", { outreachEventId });

export const dispatchNextDraftedOutreach = () =>
  invoke<DraftedOutreachAutoDispatchResult>("dispatch_next_drafted_outreach");

export const autoDispatchEligibleOutreach = () =>
  invoke<DraftedOutreachAutoDispatchResult>("auto_dispatch_eligible_outreach");

export const pullNorthStarLocationEvents = () =>
  invoke<NorthStarSnapshot>("pull_north_star_location_events");

export const importNorthStarCallReviews = () =>
  invoke<NorthStarSnapshot>("import_north_star_call_reviews");

export const processNextNorthStarCallTurn = () =>
  invoke<NorthStarTurnProcessingResult>("process_next_north_star_call_turn");

export const processNorthStarLiveTurn = (sessionId: number, audioBase64: string) =>
  invoke<CallTurnResult>("process_north_star_live_turn", { sessionId, audioBase64 });

export type NorthStarLiveReplyStreamEvent = {
  requestId: string;
  phase: string;
  transcriptText?: string | null;
  replyText?: string | null;
  replyMode?: string | null;
  textChunk?: string | null;
  audioBase64?: string | null;
  audioSlice?: string | null;
  sampleRate?: number | null;
  chunkIndex?: number | null;
  partIndex?: number | null;
  totalParts?: number | null;
  message?: string | null;
};

export const startNorthStarLiveTurnStream = (sessionId: number, audioBase64: string, requestId: string) =>
  invoke<void>("start_north_star_live_turn_stream", { sessionId, audioBase64, requestId });

export const completeNorthStarLiveSpeechStream = (
  sessionId: number,
  requestId: string,
  handler: (payload: NorthStarLiveReplyStreamEvent) => void,
) =>
  invoke<void>("complete_north_star_live_speech_stream", {
    sessionId,
    requestId,
    handler: new Channel<NorthStarLiveReplyStreamEvent>(handler),
  });

export const listenNorthStarLiveReplyStream = (
  handler: (payload: NorthStarLiveReplyStreamEvent) => void,
) => listen<NorthStarLiveReplyStreamEvent>("north-star-live-reply-stream", (event) => handler(event.payload));

export const sendNorthStarWebRtcSignal = (callId: string, signalKind: string, payloadJson: string) =>
  invoke<void>("send_north_star_webrtc_signal", { callId, signalKind, payloadJson });

export const pullNorthStarWebRtcSignals = (callId: string) =>
  invoke<NorthStarWebRtcSignal[]>("pull_north_star_webrtc_signals", { callId });

export const getNorthStarRtcConfig = () =>
  invoke<NorthStarRtcIceServer[]>("get_north_star_rtc_config");

export const getVoiceSnapshot = () => invoke<VoiceSnapshot>("get_voice_snapshot");

export const getCallSessionSnapshot = () =>
  invoke<CallSessionSnapshot>("get_call_session_snapshot");

export const getCallTurnsForSession = (sessionId: number) =>
  invoke<CallTurnRecord[]>("get_call_turns_for_session", { sessionId });

export const downloadKokoroAssets = () =>
  invoke<VoiceSnapshot>("download_kokoro_assets");

export const prepareKokoroRuntime = () =>
  invoke<VoiceSnapshot>("prepare_kokoro_runtime");

export const setupLocalSpeech = () =>
  invoke<VoiceSnapshot>("setup_local_speech");

export const synthesizeVoicePreview = () =>
  invoke<VoiceSynthesisResult>("synthesize_voice_preview");

export const synthesizeNorthStarPhrase = (text: string) =>
  invoke<VoiceSynthesisResult>("synthesize_north_star_phrase", { text });

export const synthesizeNorthStarOpening = (fallbackText: string) =>
  invoke<VoiceSynthesisResult>("synthesize_north_star_opening", { fallbackText });

export const getSpeechStreamSnapshot = () =>
  invoke<SpeechStreamSnapshot>("get_speech_stream_snapshot");

export const startSpeechStream = (payload: StartSpeechStreamInput) =>
  invoke<SpeechStreamSnapshot>("start_speech_stream", { payload });

export const pushSpeechStreamAudio = (payload: PushSpeechStreamAudioInput) =>
  invoke<SpeechStreamSnapshot>("push_speech_stream_audio", { payload });

export const stopSpeechStreamAndReply = (payload: StopSpeechStreamInput) =>
  invoke<CallTurnResult>("stop_speech_stream_and_reply", { payload });

export const runCallTurn = (payload: RunCallTurnInput) =>
  invoke<CallTurnResult>("run_call_turn", { payload });

export const clearVoiceAssets = () =>
  invoke<VoiceSnapshot>("clear_voice_assets");

export const clearAllLocalData = () =>
  invoke<void>("clear_all_local_data");

export const getPhaseOneSnapshot = () =>
  invoke<PhaseOneSnapshot>("get_phase_one_snapshot");

export const createPlace = (payload: CreatePlaceInput) =>
  invoke<Place>("create_place", { payload });

export const updatePlace = (payload: UpdatePlaceInput) =>
  invoke<Place>("update_place", { payload });

export const createRule = (payload: CreateRuleInput) =>
  invoke<ProtectedRule>("create_rule", { payload });

export const updateRule = (payload: UpdateRuleInput) =>
  invoke<ProtectedRule>("update_rule", { payload });

export const createReflection = (payload: CreateReflectionInput) =>
  invoke<ManualReflection>("create_reflection", { payload });

export const getMemoryGrowthSnapshot = () =>
  invoke<MemoryGrowthSnapshot>("get_memory_growth_snapshot");

export const runMemoryGrowthPass = () =>
  invoke<MemoryGrowthSnapshot>("run_memory_growth_pass");

export const getMemorySystemSnapshot = () =>
  invoke<MemorySystemSnapshot>("get_memory_system_snapshot");

export const runContextMemoryPass = () =>
  invoke<MemorySystemSnapshot>("run_context_memory_pass");

export const seedContextMemoryExample = (scenarioKey: "support" | "contradiction") =>
  invoke<MemorySystemSnapshot>("seed_context_memory_example", { scenarioKey });

export const updateMemoryItem = (payload: UpdateMemoryItemInput) =>
  invoke<MemoryGrowthSnapshot>("update_memory_item", { payload });

export const ingestLocationEvent = (payload: LocationEventInput) =>
  invoke<RawLocationEvent>("ingest_location_event", { payload });

export const getPassiveContextSnapshot = () =>
  invoke<PassiveContextSnapshot>("get_passive_context_snapshot");

export const getPhaseThreeSnapshot = () =>
  invoke<PhaseThreeSnapshot>("get_phase_three_snapshot");

export const getLivedMomentSnapshot = () =>
  invoke<LivedMomentSnapshot>("get_lived_moment_snapshot");

export const runMessageDecisions = () =>
  invoke<DecisionRunResult>("run_message_decisions");

export const runCallRequestDecisions = () =>
  invoke<DecisionRunResult>("run_call_request_decisions");

export const getDecisionSnapshot = () =>
  invoke<DecisionSnapshot>("get_decision_snapshot");

export const getMvpRealityCheckSnapshot = () =>
  invoke<MvpRealityCheckSnapshot>("get_mvp_reality_check_snapshot");

export const seedMvpRealityCheckScenario = () =>
  invoke<MvpRealityCheckSnapshot>("seed_mvp_reality_check_scenario");

export const resetRuntimeData = () => invoke<void>("reset_runtime_data");

export const listSimulationScenarios = () =>
  invoke<SimulationScenario[]>("list_simulation_scenarios");

export const runSimulationScenario = (payload: SimulationRunInput) =>
  invoke<SimulationRunResult>("run_simulation_scenario", { payload });

export const runAutomatedSimulationSuite = () =>
  invoke<SimulationSuiteResult>("run_automated_simulation_suite");

export const startCallSession = (payload: StartCallSessionInput) =>
  invoke<CallSessionSnapshot>("start_call_session", { payload });

export const startNorthStarAcceptedCall = () =>
  invoke<CallSessionSnapshot>("start_north_star_accepted_call");

export const endCallSession = (payload: EndCallSessionInput) =>
  invoke<CallSessionSnapshot>("end_call_session", { payload });
