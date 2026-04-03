package app.youworld.northstar

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.MediaPlayer
import android.media.MediaRecorder
import android.util.Base64
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import org.json.JSONObject
import org.webrtc.DataChannel
import org.webrtc.DefaultVideoDecoderFactory
import org.webrtc.DefaultVideoEncoderFactory
import org.webrtc.EglBase
import org.webrtc.IceCandidate
import org.webrtc.MediaConstraints
import org.webrtc.MediaStream
import org.webrtc.PeerConnection
import org.webrtc.PeerConnectionFactory
import org.webrtc.RtpReceiver
import org.webrtc.SdpObserver
import org.webrtc.SessionDescription
import org.webrtc.audio.JavaAudioDeviceModule
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.Collections
import java.util.LinkedHashSet
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.coroutines.resume
import kotlin.math.abs
import kotlin.math.PI
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin
import kotlin.math.sqrt
import kotlin.math.tanh

class NativeLiveCallController(
  private val context: Context,
  private val api: NorthStarApi,
  private val isMicBoostEnabled: () -> Boolean,
  private val listener: Listener,
) {
  companion object {
    private const val TAG = "NativeLiveCall"
    private const val MOBILE_OUTBOUND_CALL_NOTE = "North Star is calling from your phone."
    private const val LIVE_CALL_OPENING_TEXT = "Hey you called me, whats up."
    private const val MIN_SETUP_TONE_MS = 1500L
    private const val OPENING_STATUS_DETAIL = "The line is ready. Hold on while NeuralTrainer opens the conversation."
    private const val LIVE_CHANNEL_BUFFER_HIGH_WATER = 96_000L
    private const val LIVE_CHANNEL_BUFFER_LOW_WATER = 32_000L
    private const val LIVE_SPEECH_MAX_TURN_MS = 12_000.0
  }

  interface Listener {
    fun onStatus(status: String, detail: String)
    fun onDataChannelReady()
    fun onDataChannelClosed()
    fun onReplyPlaybackStarted()
    fun onReplyPlaybackFinished()
    fun onDiagnosticsChanged(diagnostics: NativeLiveCallDiagnostics)
  }

  private enum class ConversationPhase {
    IDLE,
    CONNECTING_TRANSPORT,
    WAITING_FOR_OPENING_AUDIO,
    READY_FOR_USER,
    ASSISTANT_PROCESSING,
    ASSISTANT_SPEAKING,
  }

  private enum class PlaybackKind {
    OPENING,
    REPLY,
  }

  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
  private val eglBase: EglBase = EglBase.create()
  private val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
  private val audioDeviceModule = JavaAudioDeviceModule.builder(context).createAudioDeviceModule()
  private val factory: PeerConnectionFactory

  private var peerConnection: PeerConnection? = null
  private var dataChannel: DataChannel? = null
  private var activeApiBase: String? = null
  private var activeSessionToken: String? = null
  private var signalJob: Job? = null
  private var openingTimeoutJob: Job? = null
  private var openingCompletionWatchdogJob: Job? = null
  private var recorderJob: Job? = null
  private var reconnectJob: Job? = null
  private var mediaPlayer: MediaPlayer? = null
  private var setupTonePlayer: MediaPlayer? = null
  private var setupToneFile: File? = null
  private var activeCallId: String? = null
  private var activeCallNote = ""
  private var recorder: AudioRecord? = null
  private var recorderSource: Int? = null
  private var currentRequestId: String? = null
  private var awaitingSpeechAckRequestId: String? = null
  private var setupToneStartedAt: Long? = null
  private var dataChannelSendJob: Job? = null
  private var transportStartJob: Job? = null
  private var transportGeneration = 0L
  private val openingPlaybackInFlight = AtomicBoolean(false)
  private val openingRequested = AtomicBoolean(false)
  private val openingFinished = AtomicBoolean(false)
  private val replyPlaybackInFlight = AtomicBoolean(false)
  private val muted = AtomicBoolean(false)
  private val dataChannelOpen = AtomicBoolean(false)
  private val remoteTrackReceived = AtomicBoolean(false)
  private var phase = ConversationPhase.IDLE
  private var lastStatusHeadline = "Call is live"
  private var lastStatusDetail = "North Star is keeping the line open for you."
  private var diagnostics = NativeLiveCallDiagnostics()
  private var lastDiagnosticsDispatchAt = 0L
  private val liveReplyChunks = mutableMapOf<String, MutableList<String>>()
  private val liveOpeningChunks = mutableMapOf<String, MutableList<String>>()
  private val pendingRemoteIceCandidates = mutableListOf<IceCandidate>()
  private val processedSignalIds = Collections.synchronizedSet(LinkedHashSet<String>())

  init {
    PeerConnectionFactory.initialize(
      PeerConnectionFactory.InitializationOptions.builder(context)
        .createInitializationOptions(),
    )
    factory = PeerConnectionFactory.builder()
      .setAudioDeviceModule(audioDeviceModule)
      .setVideoDecoderFactory(DefaultVideoDecoderFactory(eglBase.eglBaseContext))
      .setVideoEncoderFactory(DefaultVideoEncoderFactory(eglBase.eglBaseContext, true, true))
      .createPeerConnectionFactory()
  }

  fun start(
    callId: String,
    apiBase: String,
    sessionToken: String,
    callNote: String = "",
    forceRestart: Boolean = false,
    preserveSetupTone: Boolean = true,
  ) {
    if (!forceRestart && activeCallId == callId && (peerConnection != null || transportStartJob?.isActive == true)) return
    if (activeCallId != callId) {
      processedSignalIds.clear()
    }
    stopTransport(preserveSetupTone = preserveSetupTone, clearCallIdentity = false)
    val generation = transportGeneration
    activeCallId = callId
    activeApiBase = apiBase
    activeSessionToken = sessionToken
    activeCallNote = callNote
    muted.set(false)
    dataChannelOpen.set(false)
    remoteTrackReceived.set(false)
    resetLiveConversationFlags()
    configureCallAudio(true)
    enterStatus(
      ConversationPhase.CONNECTING_TRANSPORT,
      "Connecting the line",
      "North Star is opening the live phone path to NeuralTrainer.",
    )
    startSetupTone()
    transportStartJob = scope.launch {
      try {
        val servers = api.rtcConfig(apiBase, sessionToken).map { server ->
          PeerConnection.IceServer.builder(server.urls)
            .setUsername(server.username ?: "")
            .setPassword(server.credential ?: "")
            .createIceServer()
        }
        val preferRelay = shouldPreferLiveRelay(servers)
        val rtcConfig = PeerConnection.RTCConfiguration(servers).apply {
          sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
          iceTransportsType = if (preferRelay) {
            PeerConnection.IceTransportsType.RELAY
          } else {
            PeerConnection.IceTransportsType.ALL
          }
        }
        val peer = factory.createPeerConnection(rtcConfig, object : PeerConnection.Observer {
          override fun onSignalingChange(newState: PeerConnection.SignalingState?) = Unit
          override fun onIceConnectionReceivingChange(receiving: Boolean) = Unit
          override fun onIceGatheringChange(newState: PeerConnection.IceGatheringState?) = Unit
          override fun onIceCandidatesRemoved(candidates: Array<out IceCandidate>?) = Unit
          override fun onAddStream(stream: MediaStream?) = Unit
          override fun onRemoveStream(stream: MediaStream?) = Unit
          override fun onDataChannel(channel: DataChannel?) = Unit
          override fun onRenegotiationNeeded() = Unit
          override fun onAddTrack(receiver: RtpReceiver?, mediaStreams: Array<out MediaStream>?) = Unit

          override fun onIceConnectionChange(newState: PeerConnection.IceConnectionState?) {
            if (newState == PeerConnection.IceConnectionState.CONNECTED && phase == ConversationPhase.CONNECTING_TRANSPORT) {
              reconnectJob?.cancel()
              reconnectJob = null
              enterStatus(
                ConversationPhase.CONNECTING_TRANSPORT,
                "Connecting the line",
                "The live path is up. NeuralTrainer is joining the conversation now.",
              )
            } else if (
              (newState == PeerConnection.IceConnectionState.FAILED || newState == PeerConnection.IceConnectionState.DISCONNECTED)
              && shouldAttemptReconnect()
            ) {
              scheduleReconnect("The live phone path dropped. North Star is reopening the line.")
            }
          }

          override fun onConnectionChange(newState: PeerConnection.PeerConnectionState?) {
            if (newState == PeerConnection.PeerConnectionState.CONNECTED) {
              reconnectJob?.cancel()
              reconnectJob = null
            } else if (
              (newState == PeerConnection.PeerConnectionState.FAILED || newState == PeerConnection.PeerConnectionState.DISCONNECTED)
              && shouldAttemptReconnect()
            ) {
              scheduleReconnect("The live phone path dropped. North Star is reopening the line.")
            }
          }

          override fun onIceCandidate(candidate: IceCandidate?) {
            val currentCall = activeCallId ?: return
            if (candidate == null) return
            scope.launch {
              api.sendWebRtcSignal(
                apiBase,
                sessionToken,
                currentCall,
                "ice_candidate",
                JSONObject().apply {
                  put("sdpMid", candidate.sdpMid)
                  put("sdpMLineIndex", candidate.sdpMLineIndex)
                  put("candidate", candidate.sdp)
                }.toString(),
              )
            }
          }

          override fun onTrack(transceiver: org.webrtc.RtpTransceiver?) {
            remoteTrackReceived.set(true)
            transceiver?.receiver?.track()?.setEnabled(true)
          }
        }) ?: error("Native live peer could not be created.")

        val channel = peer.createDataChannel("northstar-call", DataChannel.Init())
        attachDataChannel(channel)

        peerConnection = peer
        dataChannel = channel

        val offerConstraints = MediaConstraints().apply {
          mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveAudio", "true"))
          mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveVideo", "false"))
        }
        val offer = peer.createOfferSuspending(offerConstraints)
        peer.setLocalDescriptionSuspending(offer)
        peer.waitForIceGatheringComplete()
        api.sendWebRtcSignal(
          apiBase,
          sessionToken,
          callId,
          "offer",
          JSONObject().apply {
            put("type", peer.localDescription?.type?.canonicalForm())
            put("sdp", peer.localDescription?.description ?: "")
          }.toString(),
        )

        signalJob = scope.launch {
          while (isActive && transportGeneration == generation && activeCallId == callId) {
            try {
              api.pullWebRtcSignals(apiBase, sessionToken, callId).forEach { signal ->
                handleSignal(peer, signal)
              }
            } catch (_: Exception) {
            }
            delay(1000)
          }
        }
      } catch (caught: Exception) {
        enterStatus(
          ConversationPhase.CONNECTING_TRANSPORT,
          "Native live call failed",
          caught.message ?: "North Star could not start the native call transport.",
        )
      } finally {
        if (transportGeneration == generation) {
          transportStartJob = null
        }
      }
    }
  }

  fun stop() {
    stopTransport(preserveSetupTone = false, clearCallIdentity = true)
    activeApiBase = null
    activeSessionToken = null
    activeCallId = null
    activeCallNote = ""
    configureCallAudio(false)
    phase = ConversationPhase.IDLE
    lastStatusHeadline = "Call is live"
    lastStatusDetail = "North Star is keeping the line open for you."
  }

  private fun stopTransport(preserveSetupTone: Boolean, clearCallIdentity: Boolean) {
    transportGeneration += 1
    resetLiveConversationFlags()
    dataChannelOpen.set(false)
    remoteTrackReceived.set(false)
    openingTimeoutJob?.cancel()
    openingTimeoutJob = null
    openingCompletionWatchdogJob?.cancel()
    openingCompletionWatchdogJob = null
    reconnectJob?.cancel()
    reconnectJob = null
    dataChannelSendJob?.cancel()
    dataChannelSendJob = null
    transportStartJob?.cancel()
    transportStartJob = null
    stopHandsFreeListening()
    signalJob?.cancel()
    signalJob = null
    dataChannel?.close()
    dataChannel = null
    peerConnection?.close()
    peerConnection = null
    stopPlayback()
    if (!preserveSetupTone) {
      stopSetupTone()
    }
    currentRequestId = null
    liveReplyChunks.clear()
    liveOpeningChunks.clear()
    pendingRemoteIceCandidates.clear()
    phase = ConversationPhase.IDLE
    lastStatusHeadline = "Call is live"
    lastStatusDetail = "North Star is keeping the line open for you."
    diagnostics = NativeLiveCallDiagnostics()
    dispatchDiagnostics(force = true)
    if (clearCallIdentity) {
      activeCallId = null
      activeCallNote = ""
    }
  }

  private fun resetLiveConversationFlags() {
    openingRequested.set(false)
    openingPlaybackInFlight.set(false)
    openingFinished.set(false)
    replyPlaybackInFlight.set(false)
    currentRequestId = null
    awaitingSpeechAckRequestId = null
  }

  fun dispose() {
    stop()
    setupTonePlayer?.release()
    setupTonePlayer = null
    setupToneFile?.delete()
    setupToneFile = null
    scope.cancel()
    audioDeviceModule.release()
    eglBase.release()
  }

  fun isRunning(callId: String?): Boolean = callId != null && activeCallId == callId && peerConnection != null
  fun isMuted(): Boolean = muted.get()
  fun statusHeadline(): String = lastStatusHeadline
  fun statusDetail(): String = lastStatusDetail
  fun diagnostics(): NativeLiveCallDiagnostics = diagnostics
  fun shouldPlaySetupTone(): Boolean =
    !openingPlaybackInFlight.get()
      && !replyPlaybackInFlight.get()
      && (phase == ConversationPhase.CONNECTING_TRANSPORT || phase == ConversationPhase.WAITING_FOR_OPENING_AUDIO)

  fun startSetupTone() {
    scope.launch(Dispatchers.Main) {
      try {
        val player = ensureSetupTonePlayer()
        if (!player.isPlaying) {
          player.seekTo(0)
          player.start()
          setupToneStartedAt = System.currentTimeMillis()
        }
      } catch (_: Exception) {
      }
    }
  }

  fun stopSetupTone() {
    scope.launch(Dispatchers.Main) {
      setupTonePlayer?.runCatching {
        if (isPlaying) pause()
        seekTo(0)
      }
      setupToneStartedAt = null
    }
  }

  fun toggleMute() {
    val nextMuted = !muted.get()
    muted.set(nextMuted)
    if (nextMuted) {
      stopHandsFreeListening()
      enterStatus(
        ConversationPhase.READY_FOR_USER,
        "Microphone muted",
        "North Star will keep the line open until you unmute.",
      )
    } else if (phase == ConversationPhase.READY_FOR_USER) {
      enterStatus(
        ConversationPhase.READY_FOR_USER,
        "North Star is listening",
        "Speak naturally. North Star is waiting for what you say next.",
      )
      startHandsFreeListeningIfReady()
    }
  }

  private suspend fun handleSignal(peer: PeerConnection, signal: CompanionWebRtcSignal) {
    if (!processedSignalIds.add(signal.signalId)) {
      return
    }
    when (signal.signalKind) {
      "answer" -> {
        val payload = JSONObject(signal.payloadJson)
        val sdp = payload.optString("sdp")
        val type = payload.optString("type")
        if (sdp.isNotBlank() && type.isNotBlank()) {
          peer.setRemoteDescriptionSuspending(SessionDescription(SessionDescription.Type.fromCanonicalForm(type), sdp))
          if (pendingRemoteIceCandidates.isNotEmpty()) {
            pendingRemoteIceCandidates.forEach { candidate ->
              peer.addIceCandidate(candidate)
            }
            pendingRemoteIceCandidates.clear()
          }
        }
      }
      "ice_candidate" -> {
        val payload = JSONObject(signal.payloadJson)
        val candidate = payload.optString("candidate")
        if (candidate.isNotBlank()) {
          val iceCandidate = IceCandidate(
            payload.optString("sdpMid"),
            payload.optInt("sdpMLineIndex"),
            candidate,
          )
          if (peer.remoteDescription == null) {
            pendingRemoteIceCandidates += iceCandidate
          } else {
            peer.addIceCandidate(iceCandidate)
          }
        }
      }
      "reconnect_request" -> {
        enterStatus(
          ConversationPhase.CONNECTING_TRANSPORT,
          "Reconnecting the line",
          "NeuralTrainer asked North Star to refresh the live call path.",
        )
        restartTransport(preserveSetupTone = false)
      }
    }
  }

  private fun attachDataChannel(channel: DataChannel) {
    channel.registerObserver(object : DataChannel.Observer {
      override fun onBufferedAmountChange(previousAmount: Long) = Unit

      override fun onStateChange() {
        when (channel.state()) {
          DataChannel.State.OPEN -> {
            dataChannelOpen.set(true)
            updateDiagnostics(
              dataChannelState = channel.state().name,
              dataChannelBufferedAmount = channel.bufferedAmount(),
              lastEvent = "data_channel_open",
              force = true,
            )
            listener.onDataChannelReady()
            requestOpening()
          }
          DataChannel.State.CLOSED -> {
            dataChannelOpen.set(false)
            updateDiagnostics(
              dataChannelState = channel.state().name,
              dataChannelBufferedAmount = channel.bufferedAmount(),
              lastEvent = "data_channel_closed",
              force = true,
            )
            listener.onDataChannelClosed()
            if (shouldAttemptReconnect()) {
              scheduleReconnect("The live line slipped. North Star is reopening it now.")
            }
          }
          else -> Unit
        }
      }

      override fun onMessage(buffer: DataChannel.Buffer?) {
        val bytes = buffer?.data ?: return
        val payloadBytes = ByteArray(bytes.remaining())
        bytes.get(payloadBytes)
        val text = String(payloadBytes)
        val payload = runCatching { JSONObject(text) }.getOrNull() ?: return
        when (payload.optString("type")) {
            "live_opening_remote_audio_started" -> {
              markOpeningDeliveryStarted()
              stopSetupTone()
              scheduleOpeningCompletionWatchdog()
              listener.onReplyPlaybackStarted()
              enterStatus(
                ConversationPhase.WAITING_FOR_OPENING_AUDIO,
                "NeuralTrainer is joining",
                OPENING_STATUS_DETAIL,
              )
            }
            "live_opening_remote_audio_finished" -> {
              completeOpening(payload.optString("message").ifBlank { "The line is open. North Star is listening for the next thing you say." })
            }
            "live_opening_complete" -> {
              if (!openingPlaybackInFlight.get() && !openingFinished.get()) {
                completeOpening(payload.optString("message").ifBlank { "The line is open. North Star is listening for the next thing you say." })
              }
            }
            "live_opening_audio" -> handleOpeningAudio(payload)
            "live_opening_chunk" -> handleOpeningChunk(payload)
            "live_opening_error" -> {
              scope.launch {
                markOpeningDeliveryStarted()
                delayForMinimumSetupToneLead()
                stopSetupTone()
                completeOpening(payload.optString("message").ifBlank { "NeuralTrainer joined the line." })
              }
            }
            "live_reply_stream_chunk" -> {
              val audioBase64 = payload.optString("audioBase64")
              if (audioBase64.isNotBlank()) {
                playBase64Audio(audioBase64, PlaybackKind.REPLY, "North Star is speaking", "NeuralTrainer is answering you out loud right now.") {
                  handleReplyEnded()
                }
              }
            }
            "live_reply_stream_chunk_part" -> handleReplyChunkPart(payload)
            "live_reply_chunk" -> handleReplyChunk(payload)
            "live_reply" -> handleReply(payload)
            "live_reply_remote_audio_started" -> {
              awaitingSpeechAckRequestId = null
              replyPlaybackInFlight.set(true)
              listener.onReplyPlaybackStarted()
              enterStatus(
                ConversationPhase.ASSISTANT_SPEAKING,
                "North Star is speaking",
                "NeuralTrainer is answering you out loud right now.",
              )
            }
            "live_speech_processing_started" -> {
              val requestId = payload.optString("requestId")
              if (awaitingSpeechAckRequestId == null || requestId.isBlank() || awaitingSpeechAckRequestId == requestId) {
                awaitingSpeechAckRequestId = null
                enterStatus(
                  ConversationPhase.ASSISTANT_PROCESSING,
                  "North Star is responding",
                  "Hold on for a moment while NeuralTrainer prepares the reply.",
                )
              }
            }
            "live_reply_remote_audio_finished" -> handleReplyEnded()
            "live_reply_stream_complete" -> {
              if (mediaPlayer == null && !replyPlaybackInFlight.get()) {
                handleReplyEnded()
              }
            }
            "live_reply_error", "live_reply_stream_error" -> {
              awaitingSpeechAckRequestId = null
              handleReplyEnded()
            }
        }
      }
    })
  }

  private fun handleOpeningAudio(payload: JSONObject) {
    markOpeningDeliveryStarted()
    val textValue = OPENING_STATUS_DETAIL
    val audioBase64 = payload.optString("audioBase64")
    if (audioBase64.isBlank()) {
      completeOpening(textValue)
      return
    }
    scope.launch {
      delayForMinimumSetupToneLead()
      stopSetupTone()
      playBase64Audio(audioBase64, PlaybackKind.OPENING, "NeuralTrainer is joining", textValue) {
        completeOpening("The line is open. North Star is listening for the next thing you say.")
      }
    }
  }

  private fun handleOpeningChunk(payload: JSONObject) {
    val openerId = payload.optString("openerId")
    val index = payload.optInt("index", -1)
    val total = payload.optInt("total", 0)
    val payloadSlice = payload.optString("payloadSlice")
    if (openerId.isBlank() || index < 0 || total <= 0 || payloadSlice.isBlank()) return
    val chunks = liveOpeningChunks.getOrPut(openerId) { MutableList(total) { "" } }
    if (index < chunks.size) chunks[index] = payloadSlice
    if (chunks.any { it.isBlank() }) return
    liveOpeningChunks.remove(openerId)
    val merged = runCatching { JSONObject(chunks.joinToString("")) }.getOrNull() ?: return
    handleOpeningAudio(merged)
  }

  private fun handleReplyChunkPart(payload: JSONObject) {
    val requestId = payload.optString("requestId")
    val chunkIndex = payload.optInt("chunkIndex", -1)
    val partIndex = payload.optInt("partIndex", -1)
    val totalParts = payload.optInt("totalParts", 0)
    val audioSlice = payload.optString("audioSlice")
    if (requestId.isBlank() || chunkIndex < 0 || partIndex < 0 || totalParts <= 0 || audioSlice.isBlank()) return
    val key = "$requestId:$chunkIndex"
    val parts = liveReplyChunks.getOrPut(key) { MutableList(totalParts) { "" } }
    if (partIndex < parts.size) parts[partIndex] = audioSlice
    if (parts.any { it.isBlank() }) return
    liveReplyChunks.remove(key)
    playBase64Audio(parts.joinToString(""), PlaybackKind.REPLY, "North Star is speaking", "NeuralTrainer is answering you out loud right now.") {
      handleReplyEnded()
    }
  }

  private fun handleReplyChunk(payload: JSONObject) {
    val requestId = payload.optString("requestId")
    val index = payload.optInt("index", -1)
    val total = payload.optInt("total", 0)
    val payloadSlice = payload.optString("payloadSlice")
    if (requestId.isBlank() || index < 0 || total <= 0 || payloadSlice.isBlank()) return
    val chunks = liveReplyChunks.getOrPut(requestId) { MutableList(total) { "" } }
    if (index < chunks.size) chunks[index] = payloadSlice
    if (chunks.any { it.isBlank() }) return
    liveReplyChunks.remove(requestId)
    val merged = runCatching { JSONObject(chunks.joinToString("")) }.getOrNull() ?: return
    val audioBase64 = merged.optString("replyAudioBase64")
    if (audioBase64.isNotBlank()) {
      playBase64Audio(audioBase64, PlaybackKind.REPLY, "North Star is speaking", "NeuralTrainer is answering you out loud right now.") {
        handleReplyEnded()
      }
    } else {
      handleReplyEnded()
    }
  }

  private fun handleReply(payload: JSONObject) {
    val result = payload.optJSONObject("result") ?: return
    if (result.optBoolean("remoteAudio")) {
      listener.onReplyPlaybackStarted()
      enterStatus(
        ConversationPhase.ASSISTANT_SPEAKING,
        "North Star is speaking",
        "NeuralTrainer is answering you out loud right now.",
      )
      return
    }
    val audioBase64 = result.optString("replyAudioBase64")
    if (audioBase64.isNotBlank()) {
      playBase64Audio(audioBase64, PlaybackKind.REPLY, "North Star is speaking", "NeuralTrainer is answering you out loud right now.") {
        handleReplyEnded()
      }
    } else {
      handleReplyEnded()
    }
  }

  private fun requestOpening() {
    if (openingRequested.getAndSet(true)) return
    openingFinished.set(false)
    replyPlaybackInFlight.set(false)
    val channel = dataChannel ?: return
    if (channel.state() != DataChannel.State.OPEN) return
    enterStatus(
      ConversationPhase.WAITING_FOR_OPENING_AUDIO,
      "NeuralTrainer is joining",
      "The line is ready. Hold on while NeuralTrainer opens the conversation.",
    )
    sendJson(channel, JSONObject().apply {
      put("type", "live_opening_request")
      put("openerId", activeCallId ?: "")
      put("text", openingTextForActiveCall())
    }.toString())
    openingTimeoutJob?.cancel()
    openingTimeoutJob = scope.launch {
      delay(7000)
      if (phase == ConversationPhase.WAITING_FOR_OPENING_AUDIO && !openingPlaybackInFlight.get()) {
        delayForMinimumSetupToneLead()
        stopSetupTone()
        completeOpening("The line is open. Speak naturally while NeuralTrainer catches up.")
      }
    }
  }

  private fun markOpeningDeliveryStarted() {
    openingPlaybackInFlight.set(true)
    openingFinished.set(false)
    replyPlaybackInFlight.set(false)
    openingTimeoutJob?.cancel()
    openingTimeoutJob = null
  }

  private fun openingTextForActiveCall(): String {
    val note = activeCallNote.trim()
    return when {
      note.isBlank() -> LIVE_CALL_OPENING_TEXT
      note == MOBILE_OUTBOUND_CALL_NOTE -> LIVE_CALL_OPENING_TEXT
      else -> note
    }
  }

  private fun completeOpening(detail: String) {
    if (openingFinished.get()) {
      return
    }
    openingTimeoutJob?.cancel()
    openingTimeoutJob = null
    openingCompletionWatchdogJob?.cancel()
    openingCompletionWatchdogJob = null
    openingPlaybackInFlight.set(false)
    openingRequested.set(false)
    openingFinished.set(true)
    stopSetupTone()
    if (muted.get()) {
      enterStatus(
        ConversationPhase.READY_FOR_USER,
        "Microphone muted",
        "North Star will keep the line open until you unmute.",
      )
      return
    }
    enterStatus(
      ConversationPhase.READY_FOR_USER,
      "North Star is listening",
      "Speak naturally. North Star is waiting for what you say next.",
    )
    startHandsFreeListeningIfReady()
  }

  private suspend fun delayForMinimumSetupToneLead() {
    val startedAt = setupToneStartedAt ?: return
    val elapsed = System.currentTimeMillis() - startedAt
    val remaining = MIN_SETUP_TONE_MS - elapsed
    if (remaining > 0) delay(remaining)
  }

  private fun scheduleOpeningCompletionWatchdog() {
    openingCompletionWatchdogJob?.cancel()
    openingCompletionWatchdogJob = scope.launch {
      delay(8000)
      if (phase == ConversationPhase.WAITING_FOR_OPENING_AUDIO && openingPlaybackInFlight.get()) {
        completeOpening("The line is open. North Star is listening for the next thing you say.")
      }
    }
  }

  private fun startHandsFreeListeningIfReady() {
    if (
      muted.get()
      || recorderJob?.isActive == true
      || phase != ConversationPhase.READY_FOR_USER
      || (openingRequested.get() && !openingFinished.get())
      || openingPlaybackInFlight.get()
      || replyPlaybackInFlight.get()
    ) return
    val channel = dataChannel ?: return
    if (channel.state() != DataChannel.State.OPEN) return

    val sampleRate = 16_000
    val minBuffer = AudioRecord.getMinBufferSize(
      sampleRate,
      AudioFormat.CHANNEL_IN_MONO,
      AudioFormat.ENCODING_PCM_16BIT,
    ).coerceAtLeast(4096)
    val sourceCandidates = listOf(
      MediaRecorder.AudioSource.VOICE_COMMUNICATION,
      MediaRecorder.AudioSource.VOICE_RECOGNITION,
      MediaRecorder.AudioSource.MIC,
    )
    val audioRecord = sourceCandidates.firstNotNullOfOrNull { source ->
      runCatching {
        AudioRecord(
          source,
          sampleRate,
          AudioFormat.CHANNEL_IN_MONO,
          AudioFormat.ENCODING_PCM_16BIT,
          minBuffer,
        )
      }.getOrNull()?.takeIf { candidate ->
        if (candidate.state == AudioRecord.STATE_INITIALIZED) {
          recorderSource = source
          true
        } else {
          candidate.release()
          false
        }
      }
    }
    if (audioRecord == null) {
      updateDiagnostics(
        recorderSource = "none",
        recorderState = "failed_to_initialize",
        lastEvent = "recorder_init_failed",
        force = true,
      )
      enterStatus(
        ConversationPhase.READY_FOR_USER,
        "North Star is listening",
        "North Star could not reopen the microphone cleanly. Stay on the line and try speaking again.",
      )
      return
    }
    recorder = audioRecord
    recorderJob = scope.launch {
      try {
        var speechDetected = false
        var silenceDurationMs = 0.0
        var turnDurationMs = 0.0
        var speechFrames = 0
        var readFailures = 0
        val buffer = ByteArray(4096)
        audioRecord.startRecording()
        if (audioRecord.recordingState != AudioRecord.RECORDSTATE_RECORDING) {
          Log.w(TAG, "Recorder did not enter RECORDSTATE_RECORDING for source=${recorderSource ?: -1}.")
          updateDiagnostics(
            recorderSource = recorderSourceLabel(),
            recorderState = "start_failed",
            lastEvent = "recorder_start_failed",
            force = true,
          )
          enterStatus(
            ConversationPhase.READY_FOR_USER,
            "North Star is listening",
            "North Star could not start the microphone cleanly. Stay on the line and try speaking again.",
          )
          return@launch
        }
        Log.i(TAG, "Started recorder with source=${recorderSource ?: -1}.")
        updateDiagnostics(
          recorderSource = recorderSourceLabel(),
          recorderState = "recording",
          currentRequestId = currentRequestId ?: "none",
          lastEvent = "recorder_started",
          force = true,
        )
        while (isActive && activeCallId != null && !muted.get() && phase == ConversationPhase.READY_FOR_USER) {
          val read = audioRecord.read(buffer, 0, buffer.size)
          if (read <= 0) {
            readFailures += 1
            if (readFailures == 1 || readFailures % 25 == 0) {
              Log.w(TAG, "Recorder read returned $read while waiting for live speech.")
            }
            updateDiagnostics(
              recorderSource = recorderSourceLabel(),
              recorderState = "recording",
              readFailures = readFailures,
              lastReadBytes = read,
              currentRequestId = currentRequestId ?: "none",
              lastEvent = "recorder_read_$read",
            )
            continue
          }
          readFailures = 0
          val rawChunk = buffer.copyOf(read)
          val rms = pcm16Rms(rawChunk, rawChunk.size)
          val peak = pcm16Peak(rawChunk, rawChunk.size)
          val outgoingChunk = if (isMicBoostEnabled()) {
            normalizePcm16(buffer, read)
          } else {
            rawChunk
          }
          val chunkDurationMs = (read / 2.0 / sampleRate) * 1000.0
          val speaking = rms > 0.008 || peak > 0.06
          updateDiagnostics(
            recorderSource = recorderSourceLabel(),
            recorderState = "recording",
            readCount = diagnostics.readCount + 1,
            readFailures = 0,
            lastReadBytes = read,
            rms = rms,
            peak = peak,
            speaking = speaking,
            speechFrames = speechFrames,
            silenceMs = silenceDurationMs.toInt(),
            turnMs = turnDurationMs.toInt(),
            currentRequestId = currentRequestId ?: "none",
            lastEvent = if (speaking) "speech_detected" else "waiting_for_speech",
          )

          if (speaking) {
            speechDetected = true
            silenceDurationMs = 0.0
            turnDurationMs += chunkDurationMs
            speechFrames += 1
            if (currentRequestId == null) {
              currentRequestId = "${activeCallId}-${System.currentTimeMillis()}"
              val requestId = currentRequestId ?: return@launch
              sendJsonAwait(channel, JSONObject().apply {
                put("type", "live_speech_start")
                put("requestId", requestId)
                put("sampleRate", sampleRate)
                put("audioFormat", "pcm16le")
              }.toString())
              Log.i(TAG, "Sent live_speech_start requestId=$requestId.")
              updateDiagnostics(
                currentRequestId = requestId,
                speechFrames = speechFrames,
                silenceMs = 0,
                turnMs = turnDurationMs.toInt(),
                lastEvent = "live_speech_start_sent",
                force = true,
              )
            }
            sendSpeechFrame(channel, outgoingChunk, outgoingChunk.size, sampleRate)
            if (speechFrames >= 3 && turnDurationMs >= LIVE_SPEECH_MAX_TURN_MS) {
              Log.i(TAG, "Finishing live speech turn requestId=${currentRequestId ?: "unknown"} after max turn duration ${turnDurationMs.toInt()}ms.")
              finishSpeechTurn(channel)
              return@launch
            }
          } else if (speechDetected && currentRequestId != null) {
            sendSpeechFrame(channel, outgoingChunk, outgoingChunk.size, sampleRate)
            silenceDurationMs += chunkDurationMs
            turnDurationMs += chunkDurationMs
            if (speechFrames >= 3 && silenceDurationMs >= 2000.0) {
              finishSpeechTurn(channel)
              return@launch
            }
            if (speechFrames >= 3 && turnDurationMs >= LIVE_SPEECH_MAX_TURN_MS) {
              Log.i(TAG, "Finishing live speech turn requestId=${currentRequestId ?: "unknown"} after max turn duration ${turnDurationMs.toInt()}ms.")
              finishSpeechTurn(channel)
              return@launch
            }
          }
        }
      } finally {
        recorderJob = null
        releaseRecorder()
      }
    }
  }

  private fun stopHandsFreeListening() {
    recorderJob?.cancel()
    recorderJob = null
    releaseRecorder()
  }

  private fun releaseRecorder() {
    recorder?.runCatching {
      stop()
      release()
    }
    recorder = null
    recorderSource = null
    updateDiagnostics(
      recorderSource = "none",
      recorderState = "idle",
      rms = 0.0,
      peak = 0.0,
      speaking = false,
      speechFrames = 0,
      silenceMs = 0,
      turnMs = 0,
      currentRequestId = currentRequestId ?: "none",
      lastEvent = "recorder_released",
      force = true,
    )
  }

  private fun finishSpeechTurn(channel: DataChannel) {
    val requestId = currentRequestId ?: return
    currentRequestId = null
    awaitingSpeechAckRequestId = requestId
    releaseRecorder()
    enterStatus(
      ConversationPhase.ASSISTANT_PROCESSING,
      "Sending your words",
      "Hold on while North Star hands your voice to NeuralTrainer.",
    )
    scope.launch {
      sendJsonAwait(channel, JSONObject().apply {
        put("type", "live_speech_end")
        put("requestId", requestId)
      }.toString())
      Log.i(TAG, "Sent live_speech_end requestId=$requestId.")
      updateDiagnostics(
        currentRequestId = requestId,
        lastEvent = "live_speech_end_sent",
        force = true,
      )
    }
  }

  private fun handleReplyEnded() {
    awaitingSpeechAckRequestId = null
    replyPlaybackInFlight.set(false)
    listener.onReplyPlaybackFinished()
    if (muted.get()) {
      enterStatus(
        ConversationPhase.READY_FOR_USER,
        "Microphone muted",
        "North Star will keep the line open until you unmute.",
      )
      return
    }
    enterStatus(
      ConversationPhase.READY_FOR_USER,
      "North Star is listening",
      "Speak naturally. North Star is waiting for what you say next.",
    )
    startHandsFreeListeningIfReady()
  }

  private suspend fun sendSpeechFrame(channel: DataChannel, data: ByteArray, read: Int, sampleRate: Int) {
    val requestId = currentRequestId ?: return
    val payload = Base64.encodeToString(data.copyOf(read), Base64.NO_WRAP)
    sendJsonAwait(channel, JSONObject().apply {
      put("type", "live_speech_frame")
      put("requestId", requestId)
      put("sampleRate", sampleRate)
      put("audioFormat", "pcm16le")
      put("audioBase64", payload)
    }.toString())
    updateDiagnostics(
      currentRequestId = requestId,
      lastEvent = "live_speech_frame_sent",
    )
  }

  private fun playBase64Audio(audioBase64: String, kind: PlaybackKind, headline: String, detail: String, onComplete: () -> Unit) {
    if (audioBase64.isBlank()) {
      onComplete()
      return
    }
    val generation = transportGeneration
    stopHandsFreeListening()
    if (kind == PlaybackKind.REPLY) {
      replyPlaybackInFlight.set(true)
    }
    listener.onReplyPlaybackStarted()
    enterStatus(ConversationPhase.ASSISTANT_SPEAKING, headline, detail)
    scope.launch(Dispatchers.Main) {
      try {
        val bytes = Base64.decode(audioBase64, Base64.DEFAULT)
        val file = File.createTempFile("northstar-live-reply", ".wav", context.cacheDir)
        file.writeBytes(bytes)
        stopPlayback()
        mediaPlayer = MediaPlayer().apply {
          setAudioAttributes(
            AudioAttributes.Builder()
              .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
              .setUsage(AudioAttributes.USAGE_MEDIA)
              .build(),
          )
          setDataSource(file.absolutePath)
          setOnCompletionListener {
            file.delete()
            if (transportGeneration == generation) {
              onComplete()
            }
          }
          prepare()
          start()
        }
      } catch (_: Exception) {
        if (transportGeneration == generation) {
          onComplete()
        }
      }
    }
  }

  private fun stopPlayback() {
    mediaPlayer?.runCatching {
      stop()
      release()
    }
    mediaPlayer = null
  }

  private fun ensureSetupTonePlayer(): MediaPlayer {
    setupTonePlayer?.let { return it }
    val file = File.createTempFile("northstar-setup-tone", ".wav", context.cacheDir)
    file.writeBytes(createSetupToneWav())
    setupToneFile = file
    val player = MediaPlayer().apply {
      setAudioAttributes(
        AudioAttributes.Builder()
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
          .build(),
      )
      setDataSource(file.absolutePath)
      isLooping = true
      setVolume(0.22f, 0.22f)
      prepare()
    }
    setupTonePlayer = player
    return player
  }

  private fun createSetupToneWav(): ByteArray {
    val sampleRate = 24_000
    val durationSeconds = 2.5
    val totalSamples = (sampleRate * durationSeconds).toInt()
    val pcm = ShortArray(totalSamples)
    val attackSeconds = 0.02
    val releaseSeconds = 0.08

    fun addDualTone(startSeconds: Double, toneSeconds: Double, frequencyA: Double, frequencyB: Double, gain: Double = 0.22) {
      val startIndex = (startSeconds * sampleRate).toInt()
      val toneSamples = (toneSeconds * sampleRate).toInt()
      val attackSamples = maxOf(1, (attackSeconds * sampleRate).toInt())
      val releaseSamples = maxOf(1, (releaseSeconds * sampleRate).toInt())
      var offset = 0
      while (offset < toneSamples && startIndex + offset < pcm.size) {
        val envelope = when {
          offset < attackSamples -> offset.toDouble() / attackSamples.toDouble()
          offset > toneSamples - releaseSamples -> maxOf(0.0, (toneSamples - offset).toDouble() / releaseSamples.toDouble())
          else -> 1.0
        }
        val time = offset.toDouble() / sampleRate.toDouble()
        val sample = gain * envelope * ((sin(2 * PI * frequencyA * time) + sin(2 * PI * frequencyB * time)) * 0.5)
        pcm[startIndex + offset] = (sample * 32767.0).toInt().coerceIn(-32767, 32767).toShort()
        offset += 1
      }
    }

    addDualTone(0.0, 0.42, 425.0, 480.0)
    addDualTone(1.25, 0.42, 425.0, 480.0)

    val buffer = ByteBuffer.allocate(44 + pcm.size * 2).order(ByteOrder.LITTLE_ENDIAN)
    buffer.put("RIFF".toByteArray())
    buffer.putInt(36 + pcm.size * 2)
    buffer.put("WAVE".toByteArray())
    buffer.put("fmt ".toByteArray())
    buffer.putInt(16)
    buffer.putShort(1)
    buffer.putShort(1)
    buffer.putInt(sampleRate)
    buffer.putInt(sampleRate * 2)
    buffer.putShort(2)
    buffer.putShort(16)
    buffer.put("data".toByteArray())
    buffer.putInt(pcm.size * 2)
    pcm.forEach { buffer.putShort(it) }
    return buffer.array()
  }

  private fun queueJson(channel: DataChannel, text: String) {
    val generation = transportGeneration
    val previousJob = dataChannelSendJob
    dataChannelSendJob = scope.launch {
      previousJob?.join()
      waitForDataChannelCapacity(channel, generation)
      if (transportGeneration != generation || channel.state() != DataChannel.State.OPEN) {
        return@launch
      }
      val result = channel.send(DataChannel.Buffer(ByteBuffer.wrap(text.toByteArray()), false))
      updateDiagnostics(
        dataChannelState = channel.state().name,
        dataChannelBufferedAmount = channel.bufferedAmount(),
        sendAttempts = diagnostics.sendAttempts + 1,
        sendSuccesses = diagnostics.sendSuccesses + if (result) 1 else 0,
        sendFailures = diagnostics.sendFailures + if (result) 0 else 1,
        lastEvent = if (result) "channel_send_ok" else "channel_send_failed",
        force = !result,
      )
    }
  }

  private suspend fun sendJsonAwait(channel: DataChannel, text: String) {
    val generation = transportGeneration
    val previousJob = dataChannelSendJob
    val sendJob = scope.launch {
      previousJob?.join()
      waitForDataChannelCapacity(channel, generation)
      if (transportGeneration != generation || channel.state() != DataChannel.State.OPEN) {
        return@launch
      }
      val result = channel.send(DataChannel.Buffer(ByteBuffer.wrap(text.toByteArray()), false))
      updateDiagnostics(
        dataChannelState = channel.state().name,
        dataChannelBufferedAmount = channel.bufferedAmount(),
        sendAttempts = diagnostics.sendAttempts + 1,
        sendSuccesses = diagnostics.sendSuccesses + if (result) 1 else 0,
        sendFailures = diagnostics.sendFailures + if (result) 0 else 1,
        lastEvent = if (result) "channel_send_ok" else "channel_send_failed",
        force = true,
      )
    }
    dataChannelSendJob = sendJob
    sendJob.join()
  }

  private suspend fun waitForDataChannelCapacity(channel: DataChannel, generation: Long) {
    while (
      transportGeneration == generation
      && channel.state() == DataChannel.State.OPEN
      && channel.bufferedAmount() > LIVE_CHANNEL_BUFFER_HIGH_WATER
    ) {
      delay(20)
      if (channel.bufferedAmount() <= LIVE_CHANNEL_BUFFER_LOW_WATER) {
        break
      }
    }
  }

  private fun sendJson(channel: DataChannel, text: String) {
    queueJson(channel, text)
  }

  private fun recorderSourceLabel(): String = when (recorderSource) {
    MediaRecorder.AudioSource.VOICE_COMMUNICATION -> "VOICE_COMMUNICATION"
    MediaRecorder.AudioSource.VOICE_RECOGNITION -> "VOICE_RECOGNITION"
    MediaRecorder.AudioSource.MIC -> "MIC"
    else -> "unknown"
  }

  private fun updateDiagnostics(
    phase: String = diagnostics.phase,
    dataChannelState: String = diagnostics.dataChannelState,
    dataChannelBufferedAmount: Long = diagnostics.dataChannelBufferedAmount,
    recorderSource: String = diagnostics.recorderSource,
    recorderState: String = diagnostics.recorderState,
    currentRequestId: String = diagnostics.currentRequestId,
    readCount: Int = diagnostics.readCount,
    readFailures: Int = diagnostics.readFailures,
    lastReadBytes: Int = diagnostics.lastReadBytes,
    rms: Double = diagnostics.rms,
    peak: Double = diagnostics.peak,
    speaking: Boolean = diagnostics.speaking,
    speechFrames: Int = diagnostics.speechFrames,
    silenceMs: Int = diagnostics.silenceMs,
    turnMs: Int = diagnostics.turnMs,
    sendAttempts: Int = diagnostics.sendAttempts,
    sendSuccesses: Int = diagnostics.sendSuccesses,
    sendFailures: Int = diagnostics.sendFailures,
    lastEvent: String = diagnostics.lastEvent,
    force: Boolean = false,
  ) {
    diagnostics = NativeLiveCallDiagnostics(
      phase = phase,
      dataChannelState = dataChannelState,
      dataChannelBufferedAmount = dataChannelBufferedAmount,
      recorderSource = recorderSource,
      recorderState = recorderState,
      currentRequestId = currentRequestId,
      readCount = readCount,
      readFailures = readFailures,
      lastReadBytes = lastReadBytes,
      rms = rms,
      peak = peak,
      speaking = speaking,
      speechFrames = speechFrames,
      silenceMs = silenceMs,
      turnMs = turnMs,
      sendAttempts = sendAttempts,
      sendSuccesses = sendSuccesses,
      sendFailures = sendFailures,
      lastEvent = lastEvent,
    )
    dispatchDiagnostics(force)
  }

  private fun dispatchDiagnostics(force: Boolean = false) {
    val now = System.currentTimeMillis()
    if (!force && now - lastDiagnosticsDispatchAt < 250L) {
      return
    }
    lastDiagnosticsDispatchAt = now
    listener.onDiagnosticsChanged(diagnostics)
  }

  private fun enterStatus(nextPhase: ConversationPhase, headline: String, detail: String) {
    phase = nextPhase
    lastStatusHeadline = headline
    lastStatusDetail = detail
    updateDiagnostics(phase = nextPhase.name, force = true)
    listener.onStatus(headline, detail)
  }

  private fun configureCallAudio(enable: Boolean) {
    if (enable) {
      audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
      audioManager.isSpeakerphoneOn = true
    } else {
      audioManager.isSpeakerphoneOn = false
      audioManager.mode = AudioManager.MODE_NORMAL
    }
  }

  private fun pcm16Rms(buffer: ByteArray, read: Int): Double {
    var sum = 0.0
    var samples = 0
    var index = 0
    while (index + 1 < read) {
      val value = ((buffer[index + 1].toInt() shl 8) or (buffer[index].toInt() and 0xff)).toShort().toInt()
      val normalized = value / 32768.0
      sum += normalized * normalized
      samples += 1
      index += 2
    }
    if (samples == 0) return 0.0
    return sqrt(sum / samples)
  }

  private fun pcm16Peak(buffer: ByteArray, read: Int): Double {
    var peak = 0.0
    var index = 0
    while (index + 1 < read) {
      val value = ((buffer[index + 1].toInt() shl 8) or (buffer[index].toInt() and 0xff)).toShort().toInt()
      val normalized = abs(value / 32768.0)
      if (normalized > peak) {
        peak = normalized
      }
      index += 2
    }
    return peak
  }

  private fun normalizePcm16(buffer: ByteArray, read: Int): ByteArray {
    if (read <= 1) return buffer.copyOf(read)

    val samples = ShortArray(read / 2)
    var peak = 0.0
    var energy = 0.0
    var sampleIndex = 0
    var byteIndex = 0
    while (byteIndex + 1 < read) {
      val value = ((buffer[byteIndex + 1].toInt() shl 8) or (buffer[byteIndex].toInt() and 0xff)).toShort()
      samples[sampleIndex] = value
      val normalized = value.toInt() / 32768.0
      val absSample = abs(normalized)
      if (absSample > peak) {
        peak = absSample
      }
      energy += normalized * normalized
      sampleIndex += 1
      byteIndex += 2
    }

    if (sampleIndex == 0 || peak == 0.0) {
      return buffer.copyOf(read)
    }

    val rms = sqrt(energy / sampleIndex.toDouble())
    val targetRms = 0.18
    val desiredGain = if (rms > 0.0) targetRms / rms else 1.0
    val peakLimitedGain = 0.92 / peak
    val gain = max(0.7, min(peakLimitedGain, min(desiredGain, 6.0)))

    val normalizedBytes = ByteArray(sampleIndex * 2)
    val output = ByteBuffer.wrap(normalizedBytes).order(ByteOrder.LITTLE_ENDIAN)
    for (index in 0 until sampleIndex) {
      val sample = samples[index].toInt() / 32768.0
      val shaped = tanh(sample * gain * 1.35)
      val clamped = max(-0.98, min(0.98, shaped))
      output.putShort((clamped * 32767.0).toInt().coerceIn(-32767, 32767).toShort())
    }
    return normalizedBytes
  }

  private fun hasStableLiveMedia(): Boolean {
    val peer = peerConnection ?: return false
    val iceState = peer.iceConnectionState()
    return peer.connectionState() == PeerConnection.PeerConnectionState.CONNECTED &&
      (iceState == PeerConnection.IceConnectionState.CONNECTED || iceState == PeerConnection.IceConnectionState.COMPLETED) &&
      (remoteTrackReceived.get() || dataChannelOpen.get())
  }

  private fun hasReachedReconnectablePhase(): Boolean {
    return dataChannelOpen.get()
      || openingRequested.get()
      || openingFinished.get()
      || openingPlaybackInFlight.get()
      || replyPlaybackInFlight.get()
      || currentRequestId != null
      || awaitingSpeechAckRequestId != null
  }

  private fun shouldAttemptReconnect(): Boolean {
    if (!hasReachedReconnectablePhase()) {
      return false
    }
    if (hasStableLiveMedia()) {
      return false
    }
    return dataChannelOpen.get()
      || openingRequested.get()
      || openingFinished.get()
      || openingPlaybackInFlight.get()
      || replyPlaybackInFlight.get()
      || currentRequestId != null
      || awaitingSpeechAckRequestId != null
  }

  private fun scheduleReconnect(detail: String) {
    if (reconnectJob?.isActive == true) return
    val callId = activeCallId ?: return
    if (activeApiBase.isNullOrBlank() || activeSessionToken.isNullOrBlank()) return
    enterStatus(
      ConversationPhase.CONNECTING_TRANSPORT,
      "Call needs attention",
      detail,
    )
    reconnectJob = scope.launch {
      delay(700)
      if (activeCallId == callId) {
        restartTransport(preserveSetupTone = false)
      }
    }
  }

  private fun restartTransport(preserveSetupTone: Boolean) {
    val callId = activeCallId ?: return
    val apiBase = activeApiBase ?: return
    val sessionToken = activeSessionToken ?: return
    scope.launch {
      start(callId, apiBase, sessionToken, activeCallNote, forceRestart = true, preserveSetupTone = preserveSetupTone)
    }
  }
}

private suspend fun PeerConnection.createOfferSuspending(constraints: MediaConstraints): SessionDescription =
  kotlinx.coroutines.suspendCancellableCoroutine { continuation ->
    createOffer(object : SdpObserver {
      override fun onCreateSuccess(sessionDescription: SessionDescription?) {
        continuation.resume(sessionDescription ?: SessionDescription(SessionDescription.Type.OFFER, ""), null)
      }
      override fun onSetSuccess() = Unit
      override fun onCreateFailure(message: String?) {
        continuation.resumeWith(Result.failure(IllegalStateException(message ?: "Offer creation failed.")))
      }
      override fun onSetFailure(message: String?) = Unit
    }, constraints)
  }

private suspend fun PeerConnection.setLocalDescriptionSuspending(description: SessionDescription): Unit =
  kotlinx.coroutines.suspendCancellableCoroutine { continuation ->
    setLocalDescription(object : SdpObserver {
      override fun onSetSuccess() { continuation.resume(Unit, null) }
      override fun onCreateSuccess(sessionDescription: SessionDescription?) = Unit
      override fun onCreateFailure(message: String?) = Unit
      override fun onSetFailure(message: String?) {
        continuation.resumeWith(Result.failure(IllegalStateException(message ?: "setLocalDescription failed.")))
      }
    }, description)
  }

private suspend fun PeerConnection.setRemoteDescriptionSuspending(description: SessionDescription): Unit =
  kotlinx.coroutines.suspendCancellableCoroutine { continuation ->
    setRemoteDescription(object : SdpObserver {
      override fun onSetSuccess() { continuation.resume(Unit, null) }
      override fun onCreateSuccess(sessionDescription: SessionDescription?) = Unit
      override fun onCreateFailure(message: String?) = Unit
      override fun onSetFailure(message: String?) {
        continuation.resumeWith(Result.failure(IllegalStateException(message ?: "setRemoteDescription failed.")))
      }
    }, description)
  }

private fun shouldPreferLiveRelay(servers: List<PeerConnection.IceServer>): Boolean =
  servers.any { server ->
    server.urls.any { url -> url.trim().lowercase().startsWith("turn:") }
  }

private suspend fun PeerConnection.waitForIceGatheringComplete(timeoutMs: Long = 12000L): Unit =
  kotlinx.coroutines.withTimeoutOrNull(timeoutMs) {
    while (iceGatheringState() != PeerConnection.IceGatheringState.COMPLETE) {
      delay(100)
    }
  } ?: Unit
