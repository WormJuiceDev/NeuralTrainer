import { invoke } from "@tauri-apps/api/core";
import type {
  AppSettings,
  CallSessionSnapshot,
  CallTurnRecord,
  CallTurnResult,
  CompleteTelegramUserLoginInput,
  CreatePlaceInput,
  CreateReflectionInput,
  CreateRuleInput,
  EndCallSessionInput,
  DecisionRunResult,
  DecisionSnapshot,
  DiagnosticStatus,
  LocationEventInput,
  ManualReflection,
  MemoryGrowthSnapshot,
  MvpRealityCheckSnapshot,
  NorthStarSnapshot,
  NorthStarTurnProcessingResult,
  OutreachDispatchResult,
  SubmitFeedbackInput,
  SimulationRunInput,
  SimulationRunResult,
  SimulationScenario,
  SimulationSuiteResult,
  TelegramConnectionSnapshot,
  TelegramCallTransportSnapshot,
  TelegramCallActionResult,
  TelegramSendResult,
  TelegramUserActionResult,
  TelegramUserSnapshot,
  SpeechStreamSnapshot,
  StartSpeechStreamInput,
  StopSpeechStreamInput,
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
  UpdateMemoryItemInput,
  UpdatePlaceInput,
  UpdateRuleInput,
} from "./types";

export const loadSettings = () => invoke<AppSettings>("load_settings");

export const saveSettings = (settings: AppSettings) =>
  invoke<SettingsEntry[]>("save_settings", { payload: settings });

export const getDiagnostics = () => invoke<DiagnosticStatus>("get_diagnostics");

export const getNorthStarSnapshot = () =>
  invoke<NorthStarSnapshot>("get_north_star_snapshot");

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

export const pullNorthStarLocationEvents = () =>
  invoke<NorthStarSnapshot>("pull_north_star_location_events");

export const importNorthStarCallReviews = () =>
  invoke<NorthStarSnapshot>("import_north_star_call_reviews");

export const processNextNorthStarCallTurn = () =>
  invoke<NorthStarTurnProcessingResult>("process_next_north_star_call_turn");

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

export const getSpeechStreamSnapshot = () =>
  invoke<SpeechStreamSnapshot>("get_speech_stream_snapshot");

export const startSpeechStream = (payload: StartSpeechStreamInput) =>
  invoke<SpeechStreamSnapshot>("start_speech_stream", { payload });

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

export const updateMemoryItem = (payload: UpdateMemoryItemInput) =>
  invoke<MemoryGrowthSnapshot>("update_memory_item", { payload });

export const ingestLocationEvent = (payload: LocationEventInput) =>
  invoke<RawLocationEvent>("ingest_location_event", { payload });

export const getPassiveContextSnapshot = () =>
  invoke<PassiveContextSnapshot>("get_passive_context_snapshot");

export const getPhaseThreeSnapshot = () =>
  invoke<PhaseThreeSnapshot>("get_phase_three_snapshot");

export const sendTestTelegramMessage = () =>
  invoke<TelegramSendResult>("send_test_telegram_message");

export const pollTelegramUpdates = () =>
  invoke<TelegramConnectionSnapshot>("poll_telegram_updates");

export const getTelegramConnectionSnapshot = () =>
  invoke<TelegramConnectionSnapshot>("get_telegram_connection_snapshot");

export const getTelegramUserSnapshot = () =>
  invoke<TelegramUserSnapshot>("get_telegram_user_snapshot");

export const getTelegramCallTransportSnapshot = () =>
  invoke<TelegramCallTransportSnapshot>("get_telegram_call_transport_snapshot");

export const prepareTelegramUserRuntime = () =>
  invoke<TelegramUserSnapshot>("prepare_telegram_user_runtime");

export const prepareTelegramCallTransport = () =>
  invoke<TelegramCallTransportSnapshot>("prepare_telegram_call_transport");

export const startTelegramTestCall = () =>
  invoke<TelegramCallActionResult>("start_telegram_test_call");

export const sendTelegramUserLoginCode = () =>
  invoke<TelegramUserActionResult>("send_telegram_user_login_code");

export const completeTelegramUserLogin = (payload: CompleteTelegramUserLoginInput) =>
  invoke<TelegramUserActionResult>("complete_telegram_user_login", { payload });

export const logoutTelegramUser = () =>
  invoke<TelegramUserActionResult>("logout_telegram_user");

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

export const dispatchDraftedOutreach = () =>
  invoke<OutreachDispatchResult>("dispatch_drafted_outreach");

export const startCallSession = (payload: StartCallSessionInput) =>
  invoke<CallSessionSnapshot>("start_call_session", { payload });

export const startNorthStarAcceptedCall = () =>
  invoke<CallSessionSnapshot>("start_north_star_accepted_call");

export const endCallSession = (payload: EndCallSessionInput) =>
  invoke<CallSessionSnapshot>("end_call_session", { payload });

export const submitOutreachFeedback = (payload: SubmitFeedbackInput) =>
  invoke<TelegramConnectionSnapshot>("submit_outreach_feedback", { payload });
