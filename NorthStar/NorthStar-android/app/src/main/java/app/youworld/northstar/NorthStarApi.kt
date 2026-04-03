package app.youworld.northstar

import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL

class NorthStarApi {
  fun createSession(apiBase: String, userHandle: String, displayName: String): SessionRecord {
    val payload = JSONObject()
      .put("user_handle", userHandle)
      .put("display_name", displayName)
    val response = request("POST", "$apiBase/api/auth/dev-session", null, payload.toString())
    val json = JSONObject(response.body)
    if (!response.ok) error(json.optString("error", "Session creation failed."))
    return SessionRecord(
      sessionToken = json.getString("session_token"),
      userHandle = json.getString("user_handle"),
      displayName = json.getString("display_name"),
    )
  }

  fun bindDesktop(apiBase: String, sessionToken: String, desktopName: String): String {
    val payload = JSONObject().put("desktop_name", desktopName)
    val response = request("POST", "$apiBase/api/companion/bind-desktop", sessionToken, payload.toString())
    val json = JSONObject(response.body)
    if (!response.ok) error(json.optString("error", "Desktop binding failed."))
    return json.getString("device_token")
  }

  fun heartbeat(apiBase: String, deviceToken: String, capability: LocationCapabilityPayload) {
    val payload = JSONObject()
      .put("device_token", deviceToken)
      .put("status", "online")
      .put("location_capability", capability.toJson())
    val response = request("POST", "$apiBase/api/companion/desktop-heartbeat", null, payload.toString())
    if (!response.ok) error("Desktop heartbeat failed.")
  }

  fun state(apiBase: String, sessionToken: String, userHandle: String): List<DesktopBinding> {
    val response = request("GET", "$apiBase/api/companion/state?user_handle=${userHandle.urlEncode()}", sessionToken, null)
    if (!response.ok) error("North Star state could not be loaded.")
    return parseStateResponse(response.body)
  }

  fun messages(apiBase: String, sessionToken: String): List<CompanionMessage> {
    val response = request("GET", "$apiBase/api/companion/messages", sessionToken, null)
    if (!response.ok) error("North Star messages could not be loaded.")
    return parseMessagesResponse(response.body)
  }

  fun sendMessage(apiBase: String, sessionToken: String, text: String) {
    val payload = JSONObject().put("text", text)
    val response = request("POST", "$apiBase/api/companion/messages", sessionToken, payload.toString())
    if (!response.ok) error("North Star message send failed.")
  }

  fun callSessions(apiBase: String, sessionToken: String): List<CompanionCallSession> {
    val response = request("GET", "$apiBase/api/companion/call-sessions", sessionToken, null)
    if (!response.ok) error("North Star calls could not be loaded.")
    return parseCallSessionsResponse(response.body)
  }

  fun rtcConfig(apiBase: String, sessionToken: String): List<RtcIceServerConfig> {
    val response = request("GET", "$apiBase/api/companion/rtc-config", sessionToken, null)
    if (!response.ok) error("North Star RTC config could not be loaded.")
    return parseRtcConfigResponse(response.body)
  }

  fun sendWebRtcSignal(apiBase: String, sessionToken: String, callId: String, signalKind: String, payloadJson: String) {
    val payload = JSONObject()
      .put("call_id", callId)
      .put("signal_kind", signalKind)
      .put("payload_json", payloadJson)
    val response = request("POST", "$apiBase/api/companion/webrtc-signals", sessionToken, payload.toString())
    if (!response.ok) error("North Star live signal send failed.")
  }

  fun pullWebRtcSignals(apiBase: String, sessionToken: String, callId: String): List<CompanionWebRtcSignal> {
    val response = request("GET", "$apiBase/api/companion/webrtc-signals?call_id=${callId.urlEncode()}", sessionToken, null)
    if (!response.ok) error("North Star live signals could not be loaded.")
    return parseWebRtcSignalsResponse(response.body)
  }

  fun startCallFromPhone(apiBase: String, sessionToken: String, note: String, deviceToken: String?): CompanionCallSession {
    val payload = JSONObject().put("note", note)
    if (!deviceToken.isNullOrBlank()) {
      payload.put("device_token", deviceToken)
    }
    val response = request("POST", "$apiBase/api/companion/call-sessions/from-mobile", sessionToken, payload.toString())
    val json = JSONObject(response.body)
    if (!response.ok) error(json.optString("error", "North Star could not start the call."))
    return CompanionCallSession(
      callId = json.getString("call_id"),
      desktopName = json.getString("desktop_name"),
      deviceToken = json.optString("device_token"),
      requestedAt = json.getString("requested_at"),
      respondedAt = json.optString("responded_at").ifBlank { null },
      status = json.getString("status"),
      note = json.optString("note"),
    )
  }

  fun respondToCall(apiBase: String, sessionToken: String, callId: String, action: String) {
    val payload = JSONObject()
      .put("call_id", callId)
      .put("action", action)
    val response = request("POST", "$apiBase/api/companion/call-sessions/respond", sessionToken, payload.toString())
    if (!response.ok) error("North Star call action failed.")
  }

  fun pendingPulses(apiBase: String, sessionToken: String): List<LocationPulseRequest> {
    val response = request("GET", "$apiBase/api/companion/location-pulses", sessionToken, null)
    if (!response.ok) error("Pending pulse check failed.")
    return parsePulseResponse(response.body)
  }

  fun uploadLocation(apiBase: String, sessionToken: String, latitude: Double, longitude: Double, accuracyMeters: Double?, source: String) {
    val payload = JSONObject()
      .put("latitude", latitude)
      .put("longitude", longitude)
      .put("accuracy_meters", accuracyMeters)
      .put("source", source)
    val response = request("POST", "$apiBase/api/companion/location-events", sessionToken, payload.toString())
    if (!response.ok) error("Location upload failed.")
  }

  fun completePulse(apiBase: String, sessionToken: String, pulseId: String) {
    val payload = JSONObject().put("pulse_id", pulseId)
    val response = request("POST", "$apiBase/api/companion/location-pulses/complete", sessionToken, payload.toString())
    if (!response.ok) error("Location pulse completion failed.")
  }

  private fun request(method: String, rawUrl: String, sessionToken: String?, body: String?): HttpResult {
    val connection = (URL(rawUrl).openConnection() as HttpURLConnection).apply {
      requestMethod = method
      setRequestProperty("Accept", "application/json")
      setRequestProperty("Content-Type", "application/json")
      setRequestProperty("User-Agent", "NorthStarAndroid/1.0")
      connectTimeout = 15_000
      readTimeout = 15_000
      doInput = true
      if (!sessionToken.isNullOrBlank()) {
        setRequestProperty("x-northstar-session", sessionToken)
      }
      if (body != null) doOutput = true
    }

    if (body != null) {
      connection.outputStream.use { it.write(body.toByteArray()) }
    }

    val status = connection.responseCode
    val stream = if (status in 200..299) connection.inputStream else connection.errorStream ?: connection.inputStream
    val responseBody = stream?.use { input ->
      BufferedReader(InputStreamReader(input)).readText()
    }.orEmpty()

    return HttpResult(status in 200..299, responseBody)
  }
}

data class HttpResult(val ok: Boolean, val body: String)

private fun String.urlEncode(): String = java.net.URLEncoder.encode(this, Charsets.UTF_8.name())
