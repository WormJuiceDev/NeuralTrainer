export type AppSettings = {
  timezone: string;
  sleepWindowStart: string;
  sleepWindowEnd: string;
  outreachPreference: "balanced" | "quiet" | "test";
  emergencyBypassEnabled: boolean;
  messageCooldownMinutes: number;
  mediumConfidenceThreshold: number;
  callRequestsEnabled: boolean;
  callCooldownMinutes: number;
  callConfidenceThreshold: number;
  lmStudioEndpoint: string;
  lmStudioApiKey: string;
  lmStudioModel: string;
  ttsProvider: string;
  ttsEndpoint: string;
  ttsApiKey: string;
  ttsModelId: string;
  ttsSampleRate: number;
  ttsDefaultVoice: string;
  ttsModelPath: string;
  ttsVoicesPath: string;
  callTranscriptCleanupPrompt: string;
  callOutboundOutreachPrompt: string;
  callInboundMainReplyPrompt: string;
  callOutboundMainReplyPrompt: string;
  callInboundStreamedReplyPrompt: string;
  callOutboundStreamedReplyPrompt: string;
  callInboundExplanationPrompt: string;
  callOutboundExplanationPrompt: string;
  callOpenerPrompt: string;
  northStarEndpoint: string;
  northStarUserHandle: string;
  northStarDisplayName: string;
  northStarSessionToken: string;
  northStarDeviceToken: string;
  northStarLastLocationEventId: string;
};

export type NorthStarDesktopBinding = {
  desktopId: string;
  desktopName: string;
  userHandle: string;
  deviceToken: string;
  boundAt: string;
  lastHeartbeatAt: string | null;
  status: string;
};

export type NorthStarMessage = {
  messageId: string;
  userHandle: string;
  source: string;
  text: string;
  createdAt: string;
};

export type NorthStarLocationEvent = {
  eventId: string;
  userHandle: string;
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  source: string;
  capturedAt: string;
};

export type NorthStarCallSession = {
  callId: string;
  userHandle: string;
  desktopId: string;
  desktopName: string;
  deviceToken: string;
  requestedAt: string;
  respondedAt: string | null;
  status: string;
  note: string;
};

export type NorthStarCallReview = {
  reviewId: string;
  callId: string;
  userHandle: string;
  sentiment: string;
  notes: string;
  createdAt: string;
};

export type NorthStarCallTurn = {
  turnId: string;
  callId: string;
  userHandle: string;
  createdAt: string;
  source: string;
  status: string;
  inputAudioBase64: string;
  transcriptText: string | null;
  replyText: string | null;
  replyMode: string | null;
  replyAudioBase64: string | null;
  sampleRate: number | null;
  completedAt: string | null;
};

export type NorthStarWebRtcSignal = {
  signalId: string;
  callId: string;
  userHandle: string;
  source: string;
  target: string;
  signalKind: string;
  payloadJson: string;
  createdAt: string;
};

export type NorthStarRtcIceServer = {
  urls: string[];
  username: string | null;
  credential: string | null;
};

export type NorthStarSnapshot = {
  configured: boolean;
  sessionReady: boolean;
  desktopBound: boolean;
  endpoint: string;
  userHandle: string;
  displayName: string;
  desktopName: string;
  sessionTokenMasked: string;
  deviceTokenMasked: string;
  desktops: NorthStarDesktopBinding[];
  messages: NorthStarMessage[];
  locationEvents: NorthStarLocationEvent[];
  callSessions: NorthStarCallSession[];
  callReviews: NorthStarCallReview[];
  detail: string;
};

export type NorthStarRuntimeSnapshot = {
  configured: boolean;
  sessionReady: boolean;
  desktopBound: boolean;
  callSessions: NorthStarCallSession[];
};

export type NorthStarTurnProcessingResult = {
  processed: boolean;
  detail: string;
  callId: string | null;
  turnId: string | null;
  reply: CallTurnResult | null;
};

export type SettingsEntry = {
  key: string;
  valueJson: string;
  updatedAt: string;
};

export type DiagnosticStatus = {
  appDataDir: string;
  dbPath: string;
  dbExists: boolean;
  settingsCount: number;
  schemaVersion: number;
  lastInitializedAt: string;
  recentEvents: string[];
};

export type Place = {
  id: number;
  label: string;
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number;
  placeKind: string;
  meaningKind: string;
  isUserNamed: boolean;
  significanceScore: number;
  isProtected: boolean;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type CreatePlaceInput = {
  label: string;
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number;
  placeKind: string;
  meaningKind: string;
  isUserNamed: boolean;
  isProtected: boolean;
  notes: string;
};

export type UpdatePlaceInput = {
  id: number;
  meaningKind: string;
  significanceScore: number;
  isProtected: boolean;
  notes: string;
};

export type ProtectedRule = {
  id: number;
  ruleKind: string;
  scopeKind: string;
  scopeRefId: number | null;
  valueJson: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CreateRuleInput = {
  ruleKind: string;
  scopeKind: string;
  scopeRefId: number | null;
  valueJson: string;
  isActive: boolean;
};

export type UpdateRuleInput = {
  id: number;
  isActive: boolean;
  valueJson: string;
};

export type ManualReflection = {
  id: number;
  createdAt: string;
  reflectionKind: string;
  text: string;
  linkedPlaceId: number | null;
  linkedMomentId: number | null;
  weight: number;
  expiresAt: string | null;
  isSensitive: boolean;
};

export type CreateReflectionInput = {
  reflectionKind: string;
  text: string;
  linkedPlaceId: number | null;
  weight: number;
  expiresAt: string | null;
  isSensitive: boolean;
};

export type ReflectionKindCount = {
  reflectionKind: string;
  count: number;
};

export type MemoryOverview = {
  placeCount: number;
  protectedRuleCount: number;
  reflectionCount: number;
  protectedPlaceCount: number;
  reflectionKindBreakdown: ReflectionKindCount[];
};

export type PhaseOneSnapshot = {
  places: Place[];
  rules: ProtectedRule[];
  reflections: ManualReflection[];
  overview: MemoryOverview;
};

export type MemoryItem = {
  id: number;
  memoryType: string;
  content: string;
  confidence: number;
  sourceKind: string;
  sourceRefId: number | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  reinforcedAt: string | null;
  decaysAfter: string | null;
  requiresConfirmation: boolean;
};

export type MemoryGrowthSnapshot = {
  memoryItems: MemoryItem[];
  activeCount: number;
  fadingCount: number;
  awaitingConfirmationCount: number;
  archivedCount: number;
};

export type UpdateMemoryItemInput = {
  id: number;
  action: "confirm" | "dismiss" | "archive" | "revive";
};

export type LocationEventInput = {
  occurredAt: string;
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  speedMps: number | null;
  source: string;
};

export type RawLocationEvent = {
  id: number;
  occurredAt: string;
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  speedMps: number | null;
  movementState: string;
  source: string;
  createdAt: string;
};

export type PlaceVisit = {
  id: number;
  placeId: number | null;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number;
  arrivalMode: string;
  departureMode: string;
  wasStationary: boolean;
  confidence: number;
  rawContextJson: string;
};

export type RepeatedPlaceSummary = {
  key: string;
  label: string;
  visitCount: number;
  totalDurationSeconds: number;
  averageDurationSeconds: number;
  latitude: number;
  longitude: number;
};

export type InferredSleepWindow = {
  start: string;
  end: string;
  confidence: number;
  supportingVisitCount: number;
};

export type PassiveContextSnapshot = {
  rawEvents: RawLocationEvent[];
  visits: PlaceVisit[];
  repeatedPlaces: RepeatedPlaceSummary[];
  inferredSleepWindow: InferredSleepWindow;
};

export type SavedMoment = {
  id: number;
  createdAt: string;
  visitId: number | null;
  placeId: number | null;
  momentKind: string;
  observedContextJson: string;
  inferredSignificance: string;
  confidence: number;
  actionTaken: string;
  wasPromotedToOutreach: boolean;
  resolvedAt: string | null;
};

export type RhythmBaselineEntry = {
  dayOfWeek: number;
  hourBucket: number;
  visitCount: number;
  averageDurationSeconds: number;
};

export type PhaseThreeSnapshot = {
  savedMoments: SavedMoment[];
  rhythmBaseline: RhythmBaselineEntry[];
};

export type OutreachEvent = {
  id: number;
  createdAt: string;
  savedMomentId: number | null;
  outreachKind: string;
  channel: string;
  reasonSummary: string;
  messageText: string;
  confidence: number;
  wasDelivered: boolean;
  deliveryMetadataJson: string;
  responseState: string;
};

export type CallSession = {
  id: number;
  createdAt: string;
  outreachEventId: number | null;
  savedMomentId: number | null;
  handoffKind: string;
  sessionState: string;
  startedAt: string | null;
  endedAt: string | null;
  outcome: string;
  notes: string;
  transcriptSummary: string;
  durationSeconds: number;
};

export type CallTurnRecord = {
  id: number;
  sessionId: number;
  createdAt: string;
  transcriptText: string;
  replyText: string;
  replyMode: string;
};

export type CallSessionSnapshot = {
  activeSession: CallSession | null;
  activeSessionTurns: CallTurnRecord[];
  recentSessions: CallSession[];
  acceptedCallRequestCount: number;
  activeSessionCount: number;
};

export type StartCallSessionInput = {
  outreachEventId: number | null;
  handoffKind: string;
  notes: string;
};

export type EndCallSessionInput = {
  sessionId: number;
  outcome: "completed" | "interrupted" | "missed" | "declined";
  transcriptSummary: string;
  notes: string;
};

export type MomentDecision = {
  id: number;
  savedMomentId: number;
  decidedAt: string;
  decisionKind: string;
  reasonSummary: string;
  decisionMetadataJson: string;
  createdOutreachEventId: number | null;
};

export type DecisionSnapshot = {
  decisions: MomentDecision[];
  outreachEvents: OutreachEvent[];
};

export type DecisionRunResult = {
  promotedCount: number;
  suppressedCount: number;
  decisions: MomentDecision[];
};

export type RealityCheckItem = {
  key: string;
  label: string;
  passed: boolean;
  detail: string;
};

export type MvpRealityCheckSnapshot = {
  rawEventCount: number;
  visitCount: number;
  savedMomentCount: number;
  decisionCount: number;
  sentOutreachCount: number;
  feedbackCount: number;
  draftOutreachCount: number;
  items: RealityCheckItem[];
  nextActions: string[];
};

export type SimulationScenario = {
  key: string;
  label: string;
  description: string;
};

export type SimulationRunInput = {
  scenarioKey: string;
  clearExisting: boolean;
};

export type SimulationRunResult = {
  scenarioKey: string;
  scenarioLabel: string;
  seededEventCount: number;
  promotedCount: number;
  suppressedCount: number;
  draftCount: number;
  draftPreview: string | null;
  summary: string;
};

export type SimulationSuiteCheck = {
  key: string;
  label: string;
  passed: boolean;
  detail: string;
};

export type SimulationSuiteResult = {
  scenarioResults: SimulationRunResult[];
  checks: SimulationSuiteCheck[];
  passedCount: number;
  totalCount: number;
  summary: string;
};

export type OutreachFeedback = {
  id: number;
  outreachEventId: number;
  feedbackKind: string;
  score: number;
  notes: string;
  createdAt: string;
};

export type SubmitFeedbackInput = {
  outreachEventId: number;
  feedbackKind: string;
  notes: string;
};

export type VoiceSnapshot = {
  provider: string;
  modelId: string;
  sampleRate: number;
  defaultVoice: string;
  modelPath: string;
  voicesPath: string;
  previewsDir: string;
  speechModelPath: string;
  filesReady: boolean;
  missingFiles: string[];
  runtimeReady: boolean;
  runtimeDetail: string;
  managedRuntime: boolean;
  runtimeEndpoint: string;
  runtimeRoot: string;
  runtimeStdoutLog: string;
  runtimeStderrLog: string;
  speechReady: boolean;
  speechRuntimeReady: boolean;
  speechRuntimeDetail: string;
  exampleVoices: string[];
};

export type VoiceSynthesisResult = {
  provider: string;
  voice: string;
  text: string;
  sampleRate: number;
  outputPath: string;
  audioBase64: string;
};

export type CallTurnResult = {
  sessionId: number;
  transcriptText: string;
  replyText: string;
  replyMode: string;
  replyVoice: string;
  replyOutputPath: string;
  replyAudioBase64: string;
  sampleRate: number;
};

export type SpeechStreamSnapshot = {
  active: boolean;
  startedAt: string | null;
  partialText: string;
  finalText: string;
  status: string;
  lastError: string | null;
};

export type StartSpeechStreamInput = {
  sessionId: number;
};

export type StopSpeechStreamInput = {
  sessionId: number;
};

export type PushSpeechStreamAudioInput = {
  sessionId: number;
  audioBase64: string;
  sampleRate: number;
  audioFormat?: string | null;
};

export type RunCallTurnInput = {
  sessionId: number;
  durationSeconds: number;
};
