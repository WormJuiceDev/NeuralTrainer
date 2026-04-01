package app.youworld.northstar

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import app.youworld.northstar.databinding.ActivityMainBinding
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class MainActivity : AppCompatActivity() {
  private lateinit var binding: ActivityMainBinding
  private lateinit var store: SettingsStore
  private val api = NorthStarApi()
  private var pairingSeedReady = false

  private val locationPermissionLauncher =
    registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
      renderStatus("Location permissions updated.", detailSummary())
      maybeAutoFinishSetup()
    }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    binding = ActivityMainBinding.inflate(layoutInflater)
    setContentView(binding.root)

    store = SettingsStore(this)
    hydrateInputs()
    applyDeepLink(intent?.data)
    wireActions()
    maybeResumeBackgroundSync()
    renderStatus("Status: waiting for pairing", detailSummary())
    refreshState()
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    applyDeepLink(intent.data)
  }

  private fun hydrateInputs() {
    binding.apiBaseInput.setText(store.apiBase())
    binding.userHandleInput.setText(store.userHandle())
    binding.displayNameInput.setText(store.displayName())
    binding.desktopNameInput.setText(store.desktopName())
  }

  private fun applyDeepLink(uri: Uri?) {
    if (uri == null) return
    val pairCode = uri.getQueryParameter("pairCode")
      ?: uri.pathSegments.takeIf { it.firstOrNull() == "pair" }?.getOrNull(1)
      ?: ""
    val userHandle = uri.getQueryParameter("userHandle").orEmpty()
    val displayName = uri.getQueryParameter("displayName").orEmpty()
    val desktopName = uri.getQueryParameter("desktopName").orEmpty()

    if (userHandle.isNotBlank()) binding.userHandleInput.setText(userHandle)
    if (displayName.isNotBlank()) binding.displayNameInput.setText(displayName)
    if (desktopName.isNotBlank()) binding.desktopNameInput.setText(desktopName)
    if (userHandle.isNotBlank()) store.setUserHandle(userHandle)
    if (displayName.isNotBlank()) store.setDisplayName(displayName)
    if (desktopName.isNotBlank()) store.setDesktopName(desktopName)
    if (pairCode.isNotBlank()) {
      pairingSeedReady = true
      binding.pairButton.text = getString(R.string.finish_setup)
      renderStatus("Pairing details received from QR.", "Tap Pair this phone to finish the native connection.")
      maybeAutoFinishSetup()
    }
  }

  private fun wireActions() {
    binding.pairButton.setOnClickListener { pairPhone() }
    binding.locationPermissionButton.setOnClickListener { requestLocationPermissions() }
    binding.refreshButton.setOnClickListener { refreshState() }
  }

  private fun maybeResumeBackgroundSync() {
    if (store.backgroundSyncEnabled() && store.sessionToken().isNotBlank() && store.deviceToken().isNotBlank()) {
      PulseForegroundService.start(this)
    }
  }

  private fun maybeAutoFinishSetup() {
    if (!pairingSeedReady) return
    val capability = currentCapability()
    if (capability.permissionState == "granted") {
      pairPhone()
    } else {
      renderStatus(
        "Allow location to finish setup.",
        "North Star already has the desktop pairing details from the QR code. Allow location once and setup will finish.",
      )
    }
  }

  private fun saveDraftInputs() {
    store.setApiBase(binding.apiBaseInput.text.toString().trim())
    store.setUserHandle(binding.userHandleInput.text.toString().trim())
    store.setDisplayName(binding.displayNameInput.text.toString().trim())
    store.setDesktopName(binding.desktopNameInput.text.toString().trim())
  }

  private fun pairPhone() {
    saveDraftInputs()
    val apiBase = store.apiBase().trim().trimEnd('/')
    val userHandle = store.userHandle().trim()
    val displayName = store.displayName().trim().ifBlank { userHandle.replaceFirstChar { it.uppercase() } }
    val desktopName = store.desktopName().trim()

    if (apiBase.isBlank() || userHandle.isBlank() || desktopName.isBlank()) {
      renderStatus("Pairing needs more detail.", "Endpoint, user handle, and desktop name are required.")
      return
    }

    lifecycleScope.launch {
      try {
        val desktops = withContext(Dispatchers.IO) {
          val session = api.createSession(apiBase, userHandle, displayName)
          store.setSessionToken(session.sessionToken)
          store.setUserHandle(session.userHandle)
          store.setDisplayName(session.displayName)
          val deviceToken = api.bindDesktop(apiBase, session.sessionToken, desktopName)
          store.setDeviceToken(deviceToken)
          api.heartbeat(apiBase, deviceToken, currentCapability())
          api.state(apiBase, session.sessionToken, session.userHandle)
        }
        renderStatus(
          "This phone is now linked.",
          "Linked to ${desktops.firstOrNull()?.desktopName ?: desktopName}. North Star will now keep automatic background sync running for location replies.",
        )
        pairingSeedReady = false
        store.setBackgroundSyncEnabled(true)
        PulseForegroundService.start(this@MainActivity)
      } catch (caught: Exception) {
        renderStatus("Pairing failed.", caught.message ?: "The native phone pairing flow could not finish.")
      }
    }
  }

  private fun refreshState() {
    saveDraftInputs()
    val sessionToken = store.sessionToken().trim()
    val apiBase = store.apiBase().trim().trimEnd('/')
    val userHandle = store.userHandle().trim()
    if (sessionToken.isBlank() || apiBase.isBlank() || userHandle.isBlank()) {
      renderStatus("Status: waiting for pairing", detailSummary())
      return
    }

    lifecycleScope.launch {
      try {
        val desktops = withContext(Dispatchers.IO) { api.state(apiBase, sessionToken, userHandle) }
        val primaryDesktop = desktops.firstOrNull()
        renderStatus(
          if (primaryDesktop != null) "${primaryDesktop.desktopName} is linked." else "No linked desktop found.",
          detailSummary(primaryDesktop?.desktopName ?: store.desktopName()),
        )
        binding.pairButton.text = if (primaryDesktop != null) "Reconnect this phone" else getString(R.string.finish_setup)
      } catch (caught: Exception) {
        renderStatus("North Star status could not be refreshed.", caught.message ?: "Unknown native status error.")
      }
    }
  }

  private fun requestLocationPermissions() {
    val permissions = buildList {
      add(Manifest.permission.ACCESS_FINE_LOCATION)
      add(Manifest.permission.ACCESS_COARSE_LOCATION)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) add(Manifest.permission.ACCESS_BACKGROUND_LOCATION)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) add(Manifest.permission.POST_NOTIFICATIONS)
    }.toTypedArray()
    locationPermissionLauncher.launch(permissions)
  }

  private fun currentCapability(): LocationCapabilityPayload {
    val fineGranted = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
    val backgroundGranted =
      Build.VERSION.SDK_INT < Build.VERSION_CODES.Q ||
        ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_BACKGROUND_LOCATION) == PackageManager.PERMISSION_GRANTED
    return LocationCapabilityPayload(
      permissionState = if (fineGranted) "granted" else "denied",
      locationSupported = fineGranted,
      backgroundSupported = fineGranted && backgroundGranted,
      lastKnownAccuracyMeters = null,
      lastLocationAt = null,
    )
  }

  private fun detailSummary(connectedDesktopName: String = store.desktopName()): String {
    val capability = currentCapability()
    val permissionSummary = if (capability.permissionState == "granted") "allowed" else "still needed"
    val backgroundSummary = if (store.backgroundSyncEnabled()) "on" else "off"
    return "Desktop: ${connectedDesktopName.ifBlank { "not paired yet" }}. Location permission: $permissionSummary. Automatic background sync: $backgroundSummary."
  }

  private fun renderStatus(status: String, detail: String) {
    binding.statusText.text = status
    binding.detailText.text = detail
  }
}
