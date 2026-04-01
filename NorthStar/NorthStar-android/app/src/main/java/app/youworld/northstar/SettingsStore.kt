package app.youworld.northstar

import android.content.Context
import android.content.SharedPreferences

class SettingsStore(context: Context) {
  private val prefs: SharedPreferences =
    context.getSharedPreferences("northstar_native", Context.MODE_PRIVATE)

  fun apiBase(): String = prefs.getString("api_base", "https://northstar.youworld.app") ?: "https://northstar.youworld.app"
  fun setApiBase(value: String) = prefs.edit().putString("api_base", value).apply()

  fun userHandle(): String = prefs.getString("user_handle", "") ?: ""
  fun setUserHandle(value: String) = prefs.edit().putString("user_handle", value).apply()

  fun displayName(): String = prefs.getString("display_name", "") ?: ""
  fun setDisplayName(value: String) = prefs.edit().putString("display_name", value).apply()

  fun desktopName(): String = prefs.getString("desktop_name", "") ?: ""
  fun setDesktopName(value: String) = prefs.edit().putString("desktop_name", value).apply()

  fun sessionToken(): String = prefs.getString("session_token", "") ?: ""
  fun setSessionToken(value: String) = prefs.edit().putString("session_token", value).apply()

  fun deviceToken(): String = prefs.getString("device_token", "") ?: ""
  fun setDeviceToken(value: String) = prefs.edit().putString("device_token", value).apply()

  fun backgroundSyncEnabled(): Boolean = prefs.getBoolean("background_sync_enabled", false)
  fun setBackgroundSyncEnabled(value: Boolean) = prefs.edit().putBoolean("background_sync_enabled", value).apply()

  fun pendingQrPairing(): Boolean = prefs.getBoolean("pending_qr_pairing", false)
  fun setPendingQrPairing(value: Boolean) = prefs.edit().putBoolean("pending_qr_pairing", value).apply()
}
