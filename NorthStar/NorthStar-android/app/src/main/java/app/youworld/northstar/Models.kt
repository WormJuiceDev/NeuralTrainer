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

data class LocationPulseRequest(
  val pulseId: String,
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
