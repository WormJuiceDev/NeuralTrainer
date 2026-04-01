package app.youworld.northstar

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    if (intent?.action != Intent.ACTION_BOOT_COMPLETED) return
    val store = SettingsStore(context)
    if (store.backgroundSyncEnabled()) {
      PulseForegroundService.start(context)
    }
  }
}
