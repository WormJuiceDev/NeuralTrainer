package app.youworld.northstar

import org.json.JSONArray
import org.json.JSONObject

data class SessionRecord(
  val sessionToken: String,
  val userHandle: String,
  val displayName: String,
)

data class LocationCapabilityPayload(
  val permissionState: String,
  val locationSupported: Boolean,
  val backgroundSupported: Boolean,
  val lastKnownAccuracyMeters: Double?,
  val lastLocationAt: String?,
) {
  fun toJson(): JSONObject = JSONObject()
    .put("permission_state", permissionState)
    .put("location_supported", locationSupported)
    .put("background_supported", backgroundSupported)
    .put("last_known_accuracy_meters", lastKnownAccuracyMeters)
    .put("last_location_at", lastLocationAt)
}

data class DesktopBinding(
  val desktopName: String,
  val deviceToken: String,
  val status: String,
)

data class CompanionMessage(
  val messageId: String,
  val source: String,
  val text: String,
  val createdAt: String,
)

data class CompanionCallSession(
  val callId: String,
  val desktopName: String,
  val deviceToken: String,
  val requestedAt: String,
  val respondedAt: String?,
  val status: String,
  val note: String,
)

data class CompanionWebRtcSignal(
  val signalId: String,
  val signalKind: String,
  val payloadJson: String,
)

data class RtcIceServerConfig(
  val urls: List<String>,
  val username: String?,
  val credential: String?,
)

data class LocationPulseRequest(
  val pulseId: String,
)

data class NativeLiveCallDiagnostics(
  val phase: String = "idle",
  val dataChannelState: String = "idle",
  val dataChannelBufferedAmount: Long = 0L,
  val recorderSource: String = "none",
  val recorderState: String = "idle",
  val currentRequestId: String = "none",
  val readCount: Int = 0,
  val readFailures: Int = 0,
  val lastReadBytes: Int = 0,
  val rms: Double = 0.0,
  val peak: Double = 0.0,
  val speaking: Boolean = false,
  val speechFrames: Int = 0,
  val silenceMs: Int = 0,
  val turnMs: Int = 0,
  val sendAttempts: Int = 0,
  val sendSuccesses: Int = 0,
  val sendFailures: Int = 0,
  val lastEvent: String = "idle",
)

fun parseStateResponse(json: String): List<DesktopBinding> {
  val root = JSONObject(json)
  val desktops = root.optJSONArray("desktops") ?: JSONArray()
  return buildList {
    for (index in 0 until desktops.length()) {
      val item = desktops.optJSONObject(index) ?: continue
      add(
        DesktopBinding(
          desktopName = item.optString("desktop_name"),
          deviceToken = item.optString("device_token"),
          status = item.optString("status"),
        ),
      )
    }
  }
}

fun parsePulseResponse(json: String): List<LocationPulseRequest> {
  val root = JSONObject(json)
  val requests = root.optJSONArray("requests") ?: JSONArray()
  return buildList {
    for (index in 0 until requests.length()) {
      val item = requests.optJSONObject(index) ?: continue
      val pulseId = item.optString("pulse_id")
      if (pulseId.isNotBlank()) add(LocationPulseRequest(pulseId))
    }
  }
}

fun parseMessagesResponse(json: String): List<CompanionMessage> {
  val root = JSONObject(json)
  val messages = root.optJSONArray("messages") ?: JSONArray()
  return buildList {
    for (index in 0 until messages.length()) {
      val item = messages.optJSONObject(index) ?: continue
      add(
        CompanionMessage(
          messageId = item.optString("message_id"),
          source = item.optString("source"),
          text = item.optString("text"),
          createdAt = item.optString("created_at"),
        ),
      )
    }
  }
}

fun parseCallSessionsResponse(json: String): List<CompanionCallSession> {
  val root = JSONObject(json)
  val calls = root.optJSONArray("calls") ?: JSONArray()
  return buildList {
    for (index in 0 until calls.length()) {
      val item = calls.optJSONObject(index) ?: continue
      add(
        CompanionCallSession(
          callId = item.optString("call_id"),
          desktopName = item.optString("desktop_name"),
          deviceToken = item.optString("device_token"),
          requestedAt = item.optString("requested_at"),
          respondedAt = item.optString("responded_at").ifBlank { null },
          status = item.optString("status"),
          note = item.optString("note"),
        ),
      )
    }
  }
}

fun parseWebRtcSignalsResponse(json: String): List<CompanionWebRtcSignal> {
  val root = JSONObject(json)
  val signals = root.optJSONArray("signals") ?: JSONArray()
  return buildList {
    for (index in 0 until signals.length()) {
      val item = signals.optJSONObject(index) ?: continue
      add(
        CompanionWebRtcSignal(
          signalId = item.optString("signal_id"),
          signalKind = item.optString("signal_kind"),
          payloadJson = item.optString("payload_json"),
        ),
      )
    }
  }
}

fun parseRtcConfigResponse(json: String): List<RtcIceServerConfig> {
  val root = JSONObject(json)
  val servers = root.optJSONArray("ice_servers") ?: JSONArray()
  return buildList {
    for (index in 0 until servers.length()) {
      val item = servers.optJSONObject(index) ?: continue
      val urlsValue = item.opt("urls")
      val urls = when (urlsValue) {
        is JSONArray -> buildList {
          for (urlIndex in 0 until urlsValue.length()) {
            val value = urlsValue.optString(urlIndex)
            if (value.isNotBlank()) add(value)
          }
        }
        is String -> listOf(urlsValue)
        else -> emptyList()
      }
      add(
        RtcIceServerConfig(
          urls = urls,
          username = item.optString("username").ifBlank { null },
          credential = item.optString("credential").ifBlank { null },
        ),
      )
    }
  }
}
