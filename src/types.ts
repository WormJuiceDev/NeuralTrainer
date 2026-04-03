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
  callInboundOpenerPrompt: string;
  callInboundOpenerFallback: string;
  callOpenerPrompt: string;
  callOutboundOpenerFallback: string;
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

export type NorthStarPairingCode = {
  code: string;
  userHandle: string;
  displayName: string;
  desktopName: string;
  expiresAt: string;
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

export type InterpretedMemoryItem = {
  id: number;
  memoryKey: string;
  sourceKind: string;
  sourceRefId: number | null;
  sourceCategoryKey: string;
  sourceEntryTitle: string;
  memoryType: string;
  summary: string;
  detail: string;
  tags: string[];
  confidence: number;
  salience: number;
  sensitivity: string;
  declaredByUser: boolean;
  status: string;
  createdAt: string;
  updatedAt: string;
  interpretedAt: string;
  lastObservedAt: string;
  archivedAt: string | null;
};

export type DetectorRecord = {
  id: number;
  detectorKey: string;
  detectorType: string;
  targetKind: string;
  targetRefId: number | null;
  targetKey: string;
  direction: string;
  strength: number;
  confidence: number;
  durationSeconds: number;
  repeatCount: number;
  summary: string;
  evidenceJson: string;
  createdAt: string;
  lastSeenAt: string;
};

export type MemoryEvolutionState = {
  id: number;
  memoryItemId: number;
  declaredConfidence: number;
  observedConfidence: number;
  detectorBalance: number;
  observedSupportScore: number;
  observedChallengeScore: number;
  divergenceScore: number;
  cumulativeSupportScore: number;
  cumulativeChallengeScore: number;
  cumulativeDivergenceScore: number;
  supportSourceCount: number;
  challengeSourceCount: number;
  sourceCoherenceScore: number;
  sustainedDivergenceScore: number;
  phaseShiftScore: number;
  phaseShiftState: string;
  truthAlignment: string;
  currentStatus: string;
  reinforcementScore: number;
  driftScore: number;
  tensionScore: number;
  volatilityScore: number;
  emergenceScore: number;
  protectionScore: number;
  declaredTruthSummary: string;
  observedTruthSummary: string;
  observedEvidenceSummary: string;
  phaseShiftSummary: string;
  alignmentSummary: string;
  lastEvolvedAt: string;
  lastConfirmedAt: string | null;
};

export type TectonicTimelineSnapshot = {
  id: number;
  snapshotKind: string;
  recordedAt: string;
  windowStart: string;
  windowEnd: string;
  totalDetectorActivity: number;
  activeMemoryCount: number;
  summaryJson: string;
};

export type MemorySystemCount = {
  key: string;
  count: number;
};

export type MemorySystemOverview = {
  totalMemoryCount: number;
  activeMemoryCount: number;
  historicalMemoryCount: number;
  detectorCount: number;
  tectonicSnapshotCount: number;
  lastPassAt: string | null;
  memoryTypeBreakdown: MemorySystemCount[];
  detectorTypeBreakdown: MemorySystemCount[];
  evolutionStatusBreakdown: MemorySystemCount[];
};

export type MemorySystemSnapshot = {
  memoryItems: InterpretedMemoryItem[];
  detectorRecords: DetectorRecord[];
  evolutionStates: MemoryEvolutionState[];
  tectonicTimeline: TectonicTimelineSnapshot[];
  overview: MemorySystemOverview;
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

export type LivedMomentMemoryInfluence = {
  memoryItemId: number;
  memoryKey: string;
  memoryType: string;
  summary: string;
  confidence: number;
  salience: number;
  relevanceScore: number;
  sensitivity: string;
  currentStatus: string | null;
  phaseShiftState: string | null;
  phaseShiftScore: number | null;
};

export type LivedMomentDetectorPressure = {
  detectorType: string;
  totalStrength: number;
  averageConfidence: number;
  sampleCount: number;
  summary: string;
};

export type LivedMomentAssessment = {
  kind: string;
  score: number;
  confidence: number;
  summary: string;
  evidence: string[];
};

export type LivedMomentSignal = {
  kind: string;
  score: number;
  confidence: number;
  reason: string;
};

export type LivedMomentOpportunity = {
  kind: string;
  score: number;
  confidence: number;
  timing: string;
  summary: string;
};

export type LivedMomentSafeguard = {
  kind: string;
  score: number;
  confidence: number;
  urgency: string;
  summary: string;
};

export type LivedMomentSituationalSignal = {
  kind: string;
  score: number;
  confidence: number;
  direction: string;
  summary: string;
};

export type LivedMomentRelationalBridge = {
  title: string;
  categoryKey: string;
  score: number;
  confidence: number;
  bridgeKind: string;
  recentContactState: string;
  reason: string;
};

export type LivedMomentContactRhythmOption = {
  level: string;
  score: number;
  confidence: number;
  reason: string;
};

export type LivedMomentSnapshot = {
  capturedAt: string;
  timezone: string;
  localTime: string;
  localDate: string;
  localDayOfWeek: string;
  timeBucket: string;
  isLikelySleepWindow: boolean;
  rhythmState: string;
  rhythmConfidence: number;
  latestLocationEvent: RawLocationEvent | null;
  activeVisit: PlaceVisit | null;
  matchedPlace: Place | null;
  repeatedPlace: RepeatedPlaceSummary | null;
  recentSavedMoments: SavedMoment[];
  relatedMemories: LivedMomentMemoryInfluence[];
  detectorPressures: LivedMomentDetectorPressure[];
  dominantPhaseShiftState: string;
  dominantPhaseShiftScore: number;
  dominantPhaseShiftSummary: string;
  assessments: LivedMomentAssessment[];
  actionableSignals: LivedMomentSignal[];
  opportunities: LivedMomentOpportunity[];
  safeguards: LivedMomentSafeguard[];
  situationalSignals: LivedMomentSituationalSignal[];
  relationalBridges: LivedMomentRelationalBridge[];
  contactRhythmOptions: LivedMomentContactRhythmOption[];
  primaryAssessment: string;
  recommendedSignal: string;
  contactRhythmHint: string;
  recommendedContactMode: string;
  recentContactLoad: number;
  recentContactSummary: string;
  actionBias: string;
  summary: string;
};

export type WorldSignalSourceStatus = {
  sourceKey: string;
  label: string;
  status: string;
  detail: string;
  checkedAt: string;
};

export type RealWorldWeatherSnapshot = {
  temperatureCelsius: number | null;
  apparentTemperatureCelsius: number | null;
  weatherCode: number | null;
  weatherSummary: string;
  windSpeedKph: number | null;
  precipitationProbabilityPercent: number | null;
  precipitationMm: number | null;
  isDay: boolean | null;
  cautionLevel: string;
  summary: string;
};

export type RealWorldDaylightSnapshot = {
  sunriseAt: string | null;
  sunsetAt: string | null;
  daylightState: string;
  minutesUntilTransition: number | null;
  summary: string;
};

export type NearbyInterestFilter = {
  id: number;
  categoryKey: string;
  label: string;
  description: string;
  tags: string[];
  isEnabled: boolean;
  displayOrder: number;
  isUserDefined: boolean;
  createdAt: string;
  updatedAt: string;
};

export type NearbyDiscoveryCandidate = {
  title: string;
  source: string;
  categoryKey: string;
  distanceMeters: number | null;
  score: number;
  tags: string[];
  summary: string;
};

export type CreateNearbyInterestFilterInput = {
  label: string;
  description: string;
  tags: string[];
};

export type UpdateNearbyInterestFilterInput = {
  id: number;
  label: string;
  description: string;
  tags: string[];
  isEnabled: boolean;
};

export type RealWorldPresenceSnapshot = {
  capturedAt: string;
  timezone: string;
  locationAvailable: boolean;
  latitude: number | null;
  longitude: number | null;
  locationSummary: string;
  weather: RealWorldWeatherSnapshot | null;
  daylight: RealWorldDaylightSnapshot | null;
  warningSummary: string;
  sourceStatuses: WorldSignalSourceStatus[];
  nearbyInterestFilters: NearbyInterestFilter[];
  nearbyCandidates: NearbyDiscoveryCandidate[];
  summary: string;
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

export type DraftedOutreachDispatchResult = {
  outreachEvent: OutreachEvent;
  dispatchedPayload: string;
  channel: string;
  northStarDetail: string;
};

export type DraftedOutreachAutoDispatchResult = {
  dispatched: boolean;
  dispatch: DraftedOutreachDispatchResult | null;
  detail: string;
  heldOutreachEvent: OutreachEvent | null;
  eligibilityReason: string | null;
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

export type CompanionContextCategory = {
  key: string;
  label: string;
  description: string;
  icon: string;
  displayOrder: number;
  isSystem: boolean;
  isDeleted: boolean;
  deletedAt: string | null;
};

export type CompanionContextEntry = {
  id: number;
  categoryKey: string;
  title: string;
  body: string;
  tags: string[];
  notes: string;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CompanionContextSection = {
  category: CompanionContextCategory;
  entries: CompanionContextEntry[];
};

export type CompanionContextSnapshot = {
  categories: CompanionContextSection[];
};

export type CompanionHomeSnapshot = {
  categories: CompanionContextSection[];
};

export type CreateCompanionContextEntryInput = {
  categoryKey: string;
  title: string;
  body: string;
  tags: string[];
  notes: string;
};

export type CreateCompanionContextCategoryInput = {
  label: string;
  description: string;
  icon: string;
};

export type UpdateCompanionContextCategoryIconInput = {
  categoryKey: string;
  icon: string;
};

export type UpdateCompanionContextEntryInput = {
  id: number;
  title: string;
  body: string;
  tags: string[];
  notes: string;
  isActive: boolean;
};

export type ReorderCompanionContextEntriesInput = {
  categoryKey: string;
  entryIds: number[];
};

export type DeleteCompanionContextCategoryInput = {
  categoryKey: string;
};
