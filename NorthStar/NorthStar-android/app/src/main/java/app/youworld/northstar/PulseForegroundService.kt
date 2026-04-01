package app.youworld.northstar

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import java.time.Instant

class PulseForegroundService : Service() {
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
  private lateinit var store: SettingsStore
  private val api = NorthStarApi()
  private lateinit var fusedLocationClient: FusedLocationProviderClient
  private var loopJob: Job? = null

  override fun onCreate() {
    super.onCreate()
    store = SettingsStore(this)
    fusedLocationClient = LocationServices.getFusedLocationProviderClient(this)
    createNotificationChannel()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    startForeground(NOTIFICATION_ID, buildNotification())
    store.setBackgroundSyncEnabled(true)
    if (loopJob == null) {
      loopJob = scope.launch { runLoop() }
    }
    return START_STICKY
  }

  override fun onDestroy() {
    loopJob?.cancel()
    scope.cancel()
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  private suspend fun runLoop() {
    while (scope.isActive) {
      try {
        syncOnce()
      } catch (_: Exception) {
        // Keep retrying on the next pass.
      }
      delay(20_000)
    }
  }

  private suspend fun syncOnce() {
    val sessionToken = store.sessionToken().trim()
    val apiBase = store.apiBase().trim().trimEnd('/')
    val userHandle = store.userHandle().trim()
    if (sessionToken.isBlank() || apiBase.isBlank() || userHandle.isBlank()) return

    val capability = currentCapability()
    val deviceToken = store.deviceToken().trim()
    if (deviceToken.isNotBlank()) {
      api.heartbeat(apiBase, deviceToken, capability)
    }

    val pulses = api.pendingPulses(apiBase, sessionToken)
    if (pulses.isEmpty()) return
    if (!capability.locationSupported || capability.permissionState != "granted") return

    val location = fusedLocationClient.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, null).await() ?: return
    api.uploadLocation(
      apiBase = apiBase,
      sessionToken = sessionToken,
      latitude = location.latitude,
      longitude = location.longitude,
      accuracyMeters = location.accuracy.toDouble(),
      source = "android_native_background",
    )
    pulses.forEach { pulse ->
      api.completePulse(apiBase, sessionToken, pulse.pulseId)
    }
  }

  private fun currentCapability(): LocationCapabilityPayload {
    val coarseGranted = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
    val fineGranted = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
    val locationGranted = coarseGranted || fineGranted
    val backgroundGranted =
      Build.VERSION.SDK_INT < Build.VERSION_CODES.Q ||
        ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_BACKGROUND_LOCATION) == PackageManager.PERMISSION_GRANTED
    return LocationCapabilityPayload(
      permissionState = if (locationGranted) "granted" else "denied",
      locationSupported = locationGranted,
      backgroundSupported = locationGranted && backgroundGranted,
      lastKnownAccuracyMeters = null,
      lastLocationAt = Instant.now().toString(),
    )
  }

  private fun buildNotification(): Notification =
    NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(android.R.drawable.ic_menu_mylocation)
      .setContentTitle(getString(R.string.background_notification_title))
      .setContentText(getString(R.string.background_notification_text))
      .setOngoing(true)
      .build()

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val channel = NotificationChannel(CHANNEL_ID, "North Star Background", NotificationManager.IMPORTANCE_LOW)
    manager.createNotificationChannel(channel)
  }

  companion object {
    private const val CHANNEL_ID = "northstar_background_sync"
    private const val NOTIFICATION_ID = 4107

    fun start(context: Context) {
      val intent = Intent(context, PulseForegroundService::class.java)
      ContextCompat.startForegroundService(context, intent)
    }

    fun stop(context: Context) {
      context.stopService(Intent(context, PulseForegroundService::class.java))
    }
  }
}
