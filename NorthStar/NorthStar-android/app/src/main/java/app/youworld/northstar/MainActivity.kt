package app.youworld.northstar

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.View
import android.widget.Button
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import app.youworld.northstar.databinding.ActivityMainBinding
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class MainActivity : AppCompatActivity() {
  private enum class Section {
    COMPANION,
    CALLS,
    CONNECTION,
  }

  private lateinit var binding: ActivityMainBinding
  private lateinit var store: SettingsStore
  private val api = NorthStarApi()
  private var pairingInFlight = false
  private var activeSection = Section.COMPANION
  private var autoRefreshJob: Job? = null
  private var messages: List<CompanionMessage> = emptyList()
  private var calls: List<CompanionCallSession> = emptyList()

  private val locationPermissionLauncher =
    registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
      renderStatus("Location permissions updated.", detailSummary())
      syncPermissionAction()
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
    setSection(Section.COMPANION)
    syncPermissionAction()
    syncConnectionControls(linked = store.deviceToken().isNotBlank())
    renderStatus("North Star is waking up.", detailSummary())
    refreshAll()
  }

  override fun onResume() {
    super.onResume()
    syncPermissionAction()
    maybeAutoFinishSetup()
    refreshAll()
    startAutoRefresh()
  }

  override fun onPause() {
    autoRefreshJob?.cancel()
    autoRefreshJob = null
    super.onPause()
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    applyDeepLink(intent.data)
  }

  private fun wireActions() {
    binding.companionTabButton.setOnClickListener { setSection(Section.COMPANION) }
    binding.callsTabButton.setOnClickListener { setSection(Section.CALLS) }
    binding.connectionTabButton.setOnClickListener { setSection(Section.CONNECTION) }
    binding.sendMessageButton.setOnClickListener { sendMessage() }
    binding.refreshCompanionButton.setOnClickListener { refreshCompanion() }
    binding.startCallButton.setOnClickListener { startCallFromPhone() }
    binding.refreshCallsButton.setOnClickListener { refreshCalls() }
    binding.pairButton.setOnClickListener { pairPhone() }
    binding.locationPermissionButton.setOnClickListener { requestLocationPermissions() }
    binding.refreshButton.setOnClickListener { refreshAll() }
  }

  private fun hydrateInputs() {
    binding.apiBaseInput.setText(store.apiBase())
    binding.userHandleInput.setText(store.userHandle())
    binding.displayNameInput.setText(store.displayName())
    binding.desktopNameInput.setText(store.desktopName())
  }

  private fun applyDeepLink(uri: Uri?) {
    if (uri == null) return
    val pairCode = (
      uri.getQueryParameter("pairCode")
        ?: if (uri.scheme == "northstar" && uri.host == "pair") {
          uri.pathSegments.firstOrNull()
        } else {
          uri.pathSegments.takeIf { it.firstOrNull() == "pair" }?.getOrNull(1)
        }
    ).orEmpty()
    val endpoint = uri.getQueryParameter("endpoint").orEmpty()
    val userHandle = uri.getQueryParameter("userHandle").orEmpty()
    val displayName = uri.getQueryParameter("displayName").orEmpty()
    val desktopName = uri.getQueryParameter("desktopName").orEmpty()

    if (endpoint.isNotBlank()) {
      binding.apiBaseInput.setText(endpoint)
      store.setApiBase(endpoint)
    }
    if (userHandle.isNotBlank()) {
      binding.userHandleInput.setText(userHandle)
      store.setUserHandle(userHandle)
    }
    if (displayName.isNotBlank()) {
      binding.displayNameInput.setText(displayName)
      store.setDisplayName(displayName)
    }
    if (desktopName.isNotBlank()) {
      binding.desktopNameInput.setText(desktopName)
      store.setDesktopName(desktopName)
    }
    if (pairCode.isNotBlank()) {
      store.setPendingQrPairing(true)
      setSection(Section.CONNECTION)
      syncConnectionControls(linked = false)
      renderStatus("Pairing details received from QR.", "North Star picked up your desktop details. Allow location once and setup can finish itself.")
      maybeAutoFinishSetup()
    }
  }

  private fun maybeResumeBackgroundSync() {
    if (store.backgroundSyncEnabled() && store.sessionToken().isNotBlank() && store.deviceToken().isNotBlank()) {
      PulseForegroundService.start(this)
    }
  }

  private fun maybeAutoFinishSetup() {
    if (!store.pendingQrPairing() || pairingInFlight) return
    if (currentCapability().locationSupported) {
      pairPhone()
    } else {
      syncPermissionAction()
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
    if (pairingInFlight) return
    saveDraftInputs()
    val apiBase = store.apiBase().trim().trimEnd('/')
    val userHandle = store.userHandle().trim()
    val displayName = store.displayName().trim().ifBlank { userHandle.replaceFirstChar { it.uppercase() } }
    val desktopName = store.desktopName().trim()

    if (apiBase.isBlank() || userHandle.isBlank() || desktopName.isBlank()) {
      renderStatus("Pairing needs more detail.", "Endpoint, user handle, and desktop name are required.")
      return
    }

    pairingInFlight = true
    renderStatus("Finishing setup...", "North Star is linking this phone and starting background sync.")
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
        store.setPendingQrPairing(false)
        store.setBackgroundSyncEnabled(true)
        PulseForegroundService.start(this@MainActivity)
        syncPermissionAction()
        syncConnectionControls(linked = true)
        renderStatus(
          if (currentCapability().backgroundSupported) "This phone is now linked." else "This phone is linked. One more step remains.",
          if (currentCapability().backgroundSupported) {
            "Linked to ${desktops.firstOrNull()?.desktopName ?: desktopName}. Messages, calls, and background location replies can now use this shared link."
          } else {
            "Linked to ${desktops.firstOrNull()?.desktopName ?: desktopName}. Enable always-on location in Android settings so NeuralTrainer can request location while North Star stays in the background."
          },
        )
        refreshAll()
      } catch (caught: Exception) {
        renderStatus("Pairing failed.", caught.message ?: "The native phone pairing flow could not finish.")
      } finally {
        pairingInFlight = false
      }
    }
  }

  private fun refreshAll() {
    refreshConnection()
    refreshCompanion(silent = true)
    refreshCalls(silent = true)
  }

  private fun refreshConnection() {
    saveDraftInputs()
    val sessionToken = store.sessionToken().trim()
    val apiBase = store.apiBase().trim().trimEnd('/')
    val userHandle = store.userHandle().trim()
    if (sessionToken.isBlank() || apiBase.isBlank() || userHandle.isBlank()) {
      syncConnectionControls(linked = false)
      renderStatus("Status: waiting for pairing", detailSummary())
      return
    }

    lifecycleScope.launch {
      try {
        val desktops = withContext(Dispatchers.IO) { api.state(apiBase, sessionToken, userHandle) }
        val primaryDesktop = desktops.firstOrNull()
        syncConnectionControls(linked = primaryDesktop != null)
        syncPermissionAction()
        if (!store.pendingQrPairing()) {
          renderStatus(
            if (primaryDesktop != null) "${primaryDesktop.desktopName} is linked." else "No linked desktop found.",
            detailSummary(primaryDesktop?.desktopName ?: store.desktopName()),
          )
        }
      } catch (caught: Exception) {
        renderStatus("North Star status could not be refreshed.", caught.message ?: "Unknown native status error.")
      }
    }
  }

  private fun refreshCompanion(silent: Boolean = false) {
    val sessionToken = store.sessionToken().trim()
    val apiBase = store.apiBase().trim().trimEnd('/')
    if (sessionToken.isBlank() || apiBase.isBlank()) {
      renderMessages()
      return
    }

    lifecycleScope.launch {
      try {
        messages = withContext(Dispatchers.IO) { api.messages(apiBase, sessionToken) }
        renderMessages()
        if (!silent && activeSection == Section.COMPANION) {
          renderStatus("Companion thread refreshed.", "North Star pulled the latest messages from NeuralTrainer.")
        }
      } catch (caught: Exception) {
        if (!silent) {
          renderStatus("Companion thread could not refresh.", caught.message ?: "Unknown thread error.")
        }
      }
    }
  }

  private fun refreshCalls(silent: Boolean = false) {
    val sessionToken = store.sessionToken().trim()
    val apiBase = store.apiBase().trim().trimEnd('/')
    if (sessionToken.isBlank() || apiBase.isBlank()) {
      renderCalls()
      return
    }

    lifecycleScope.launch {
      try {
        calls = withContext(Dispatchers.IO) { api.callSessions(apiBase, sessionToken) }
        renderCalls()
        if (!silent && activeSection == Section.CALLS) {
          renderStatus("Calls refreshed.", "North Star checked for new or updated calls.")
        }
      } catch (caught: Exception) {
        if (!silent) {
          renderStatus("Calls could not refresh.", caught.message ?: "Unknown call refresh error.")
        }
      }
    }
  }

  private fun sendMessage() {
    val draft = binding.messageDraftInput.text.toString().trim()
    val sessionToken = store.sessionToken().trim()
    val apiBase = store.apiBase().trim().trimEnd('/')
    if (draft.isBlank()) {
      renderStatus("Write something first.", "North Star can send the message once there is something to say.")
      return
    }
    if (sessionToken.isBlank() || apiBase.isBlank()) {
      renderStatus("Phone is not linked yet.", "Scan the NeuralTrainer QR code first so the companion thread exists.")
      return
    }

    lifecycleScope.launch {
      try {
        withContext(Dispatchers.IO) { api.sendMessage(apiBase, sessionToken, draft) }
        binding.messageDraftInput.setText("")
        renderStatus("Message sent.", "North Star sent your message into the companion thread.")
        refreshCompanion(silent = true)
      } catch (caught: Exception) {
        renderStatus("Message failed.", caught.message ?: "North Star could not send that message.")
      }
    }
  }

  private fun startCallFromPhone() {
    val sessionToken = store.sessionToken().trim()
    val apiBase = store.apiBase().trim().trimEnd('/')
    if (sessionToken.isBlank() || apiBase.isBlank()) {
      renderStatus("Phone is not linked yet.", "Scan the NeuralTrainer QR code first so calls know where to go.")
      return
    }

    lifecycleScope.launch {
      try {
        val call = withContext(Dispatchers.IO) {
          api.startCallFromPhone(apiBase, sessionToken, "North Star is calling from your phone.")
        }
        renderStatus("Call requested.", "${call.desktopName} was asked to pick up through NeuralTrainer.")
        refreshCalls(silent = true)
        setSection(Section.CALLS)
      } catch (caught: Exception) {
        renderStatus("Call failed.", caught.message ?: "North Star could not reach NeuralTrainer just then.")
      }
    }
  }

  private fun respondToCall(callId: String, action: String) {
    val sessionToken = store.sessionToken().trim()
    val apiBase = store.apiBase().trim().trimEnd('/')
    if (sessionToken.isBlank() || apiBase.isBlank()) {
      renderStatus("Phone is not linked yet.", "Scan the NeuralTrainer QR code first so calls know where to go.")
      return
    }

    lifecycleScope.launch {
      try {
        withContext(Dispatchers.IO) { api.respondToCall(apiBase, sessionToken, callId, action) }
        renderStatus("Call updated.", "North Star sent the ${action.trim()} response.")
        refreshCalls(silent = true)
      } catch (caught: Exception) {
        renderStatus("Call action failed.", caught.message ?: "North Star could not update that call.")
      }
    }
  }

  private fun requestLocationPermissions() {
    val capability = currentCapability()
    if (capability.locationSupported && !capability.backgroundSupported && store.backgroundSyncEnabled() && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      openAppLocationSettings()
      return
    }
    val permissions = buildList {
      add(Manifest.permission.ACCESS_COARSE_LOCATION)
      add(Manifest.permission.ACCESS_FINE_LOCATION)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) add(Manifest.permission.POST_NOTIFICATIONS)
    }.toTypedArray()
    locationPermissionLauncher.launch(permissions)
  }

  private fun openAppLocationSettings() {
    val intent = Intent(
      Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
      Uri.fromParts("package", packageName, null),
    )
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    startActivity(intent)
    renderStatus(
      "Enable always-on location.",
      "In Android app settings, allow location all the time so North Star can answer NeuralTrainer requests while it stays in the background.",
    )
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
      lastLocationAt = null,
    )
  }

  private fun detailSummary(connectedDesktopName: String = store.desktopName()): String {
    val capability = currentCapability()
    val permissionSummary = if (capability.permissionState == "granted") "allowed" else "still needed"
    val backgroundSummary = when {
      !store.backgroundSyncEnabled() -> "off"
      capability.backgroundSupported -> "on"
      else -> "limited until always-on location is allowed"
    }
    return "Desktop: ${connectedDesktopName.ifBlank { "not paired yet" }}. Location permission: $permissionSummary. Automatic background sync: $backgroundSummary."
  }

  private fun syncPermissionAction() {
    val capability = currentCapability()
    binding.locationPermissionButton.text = when {
      !capability.locationSupported -> getString(R.string.allow_location)
      store.backgroundSyncEnabled() && !capability.backgroundSupported -> getString(R.string.enable_always_on_location)
      else -> getString(R.string.allow_location)
    }
    binding.locationPermissionButton.visibility = if (capability.backgroundSupported && store.deviceToken().isNotBlank()) View.GONE else View.VISIBLE
  }

  private fun syncConnectionControls(linked: Boolean) {
    val pending = store.pendingQrPairing()
    binding.pairButton.visibility = if (pending || !linked) View.VISIBLE else View.GONE
    binding.pairButton.text = if (linked) getString(R.string.reconnect_phone) else getString(R.string.finish_setup)
    binding.refreshButton.text = getString(R.string.refresh_connection)
  }

  private fun renderMessages() {
    binding.chatThreadText.text = if (messages.isEmpty()) {
      getString(R.string.chat_placeholder)
    } else {
      messages.takeLast(12).joinToString("\n\n") { message ->
        val speaker = if (message.source == "desktop") "NeuralTrainer" else "You"
        "$speaker\n${message.text.trim()}"
      }
    }
  }

  private fun renderCalls() {
    val sortedCalls = calls.sortedByDescending { it.requestedAt }
    binding.callSummaryText.text = if (sortedCalls.isEmpty()) {
      getString(R.string.calls_placeholder)
    } else {
      sortedCalls.take(8).joinToString("\n\n") { call ->
        buildString {
          append(call.desktopName.ifBlank { "NeuralTrainer" })
          append('\n')
          append(call.status.replaceFirstChar { it.uppercase() })
          if (call.note.isNotBlank()) {
            append('\n')
            append(call.note.trim())
          }
        }
      }
    }

    binding.callActionsContainer.removeAllViews()
    val actionableCalls = sortedCalls.filter { it.status == "pending" || it.status == "accepted" }
    for (call in actionableCalls) {
      val primaryAction = when (call.status) {
        "pending" -> "accept"
        "accepted" -> "end"
        else -> null
      } ?: continue

      val primaryLabel = if (primaryAction == "accept") "Accept ${call.desktopName}" else "End ${call.desktopName}"
      binding.callActionsContainer.addView(actionButton(primaryLabel) { respondToCall(call.callId, primaryAction) })

      if (call.status == "pending") {
        binding.callActionsContainer.addView(actionButton("Decline ${call.desktopName}") { respondToCall(call.callId, "decline") })
        binding.callActionsContainer.addView(actionButton("Missed ${call.desktopName}") { respondToCall(call.callId, "missed") })
      }
    }
  }

  private fun actionButton(label: String, onClick: () -> Unit): Button =
    Button(this).apply {
      text = label
      setOnClickListener { onClick() }
    }

  private fun setSection(section: Section) {
    activeSection = section
    binding.companionSection.visibility = if (section == Section.COMPANION) View.VISIBLE else View.GONE
    binding.callsSection.visibility = if (section == Section.CALLS) View.VISIBLE else View.GONE
    binding.connectionSection.visibility = if (section == Section.CONNECTION) View.VISIBLE else View.GONE
    binding.onboardingText.text = when (section) {
      Section.COMPANION -> getString(R.string.companion_copy)
      Section.CALLS -> getString(R.string.calls_copy)
      Section.CONNECTION -> getString(R.string.onboarding_copy)
    }
  }

  private fun startAutoRefresh() {
    autoRefreshJob?.cancel()
    autoRefreshJob = lifecycleScope.launch {
      while (isActive) {
        delay(10_000)
        refreshCompanion(silent = true)
        refreshCalls(silent = true)
      }
    }
  }

  private fun renderStatus(status: String, detail: String) {
    binding.statusText.text = status
    binding.detailText.text = detail
  }
}
