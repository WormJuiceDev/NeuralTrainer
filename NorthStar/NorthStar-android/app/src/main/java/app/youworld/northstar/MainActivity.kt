package app.youworld.northstar

import android.Manifest
import android.animation.ObjectAnimator
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.CheckBox
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AlertDialog
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.updatePadding
import androidx.core.view.doOnLayout
import androidx.lifecycle.lifecycleScope
import app.youworld.northstar.databinding.ActivityMainBinding
import android.view.animation.AccelerateDecelerateInterpolator
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.Locale

class MainActivity : AppCompatActivity() {
  companion object {
    private const val MOBILE_OUTBOUND_CALL_NOTE = "North Star is calling from your phone."
  }

  private enum class Section {
    COMPANION,
    CONNECTION,
  }

  private lateinit var binding: ActivityMainBinding
  private lateinit var store: SettingsStore
  private val api = NorthStarApi()
  private var pairingInFlight = false
  private var activeSection = Section.COMPANION
  private var autoRefreshJob: Job? = null
  private var callMonitorJob: Job? = null
  private var visualizerAnimators: List<ObjectAnimator> = emptyList()
  private var messages: List<CompanionMessage> = emptyList()
  private var calls: List<CompanionCallSession> = emptyList()
  private var linkedDesktopName: String = ""
  private var liveCallDiagnostics = NativeLiveCallDiagnostics()
  private lateinit var liveCallController: NativeLiveCallController

  private val locationPermissionLauncher =
    registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
      syncPermissionAction()
      maybeAutoFinishSetup()
      refreshConnectionStatus()
    }

  private val audioPermissionLauncher =
    registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
      if (granted) {
        ensureNativeLiveCall()
      } else {
        renderStatus("Microphone permission is needed.", "North Star needs the microphone to speak live with NeuralTrainer.")
      }
    }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    binding = ActivityMainBinding.inflate(layoutInflater)
    setContentView(binding.root)

    store = SettingsStore(this)
    liveCallController = NativeLiveCallController(this, api, { store.micBoostEnabled() }, object : NativeLiveCallController.Listener {
      override fun onStatus(status: String, detail: String) {
        runOnUiThread {
          renderStatus(status, detail)
          renderCallOverlay()
        }
      }

      override fun onDataChannelReady() {
        runOnUiThread {
          renderCallOverlay()
        }
      }

      override fun onDataChannelClosed() {
        runOnUiThread {
          renderCallOverlay()
        }
      }

      override fun onReplyPlaybackStarted() {
        runOnUiThread { renderCallOverlay() }
      }

      override fun onReplyPlaybackFinished() {
        runOnUiThread { renderCallOverlay() }
      }

      override fun onDiagnosticsChanged(diagnostics: NativeLiveCallDiagnostics) {
        runOnUiThread {
          liveCallDiagnostics = diagnostics
          renderCallOverlay()
        }
      }
    })
    hydrateInputs()
    applyDeepLink(intent?.data)
    wireActions()
    maybeResumeBackgroundSync()
    applyWindowInsets()
    styleStaticChrome()
    setSection(Section.COMPANION)
    syncTopbar()
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

  override fun onDestroy() {
    callMonitorJob?.cancel()
    stopCallVisualizer()
    liveCallController.dispose()
    super.onDestroy()
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    applyDeepLink(intent.data)
  }

  private fun wireActions() {
    binding.companionTabButton.setOnClickListener { setSection(Section.COMPANION) }
    binding.connectionTabButton.setOnClickListener { setSection(Section.CONNECTION) }
    binding.topbarCallButton.setOnClickListener { startCallFromPhone() }
    binding.topbarMenuButton.setOnClickListener { openSettingsPanel() }
    binding.sendMessageButton.setOnClickListener { sendMessage() }
    binding.pairButton.setOnClickListener { pairPhone() }
    binding.locationPermissionButton.setOnClickListener { requestLocationPermissions() }
    binding.refreshButton.setOnClickListener { refreshAll() }
    binding.callAcceptButton.setOnClickListener { activeOverlayCall()?.let { respondToCall(it.callId, "accept") } }
    binding.callDeclineButton.setOnClickListener { activeOverlayCall()?.let { respondToCall(it.callId, "decline") } }
    binding.callEndButton.setOnClickListener { activeOverlayCall()?.let { respondToCall(it.callId, "end") } }
    binding.callMicButton.setOnClickListener { toggleCallMute() }
  }

  private fun applyWindowInsets() {
    ViewCompat.setOnApplyWindowInsetsListener(binding.appShell) { _, insets ->
      val systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
      val imeInsets = insets.getInsets(WindowInsetsCompat.Type.ime())
      val keyboardBottom = maxOf(imeInsets.bottom - systemBars.bottom, 0)
      binding.topbar.updatePadding(top = systemBars.top)
      binding.composerBar.updatePadding(bottom = dp(12) + systemBars.bottom + keyboardBottom)
      binding.messageThreadScroll.updatePadding(bottom = dp(8))
      binding.connectionSection.updatePadding(bottom = dp(16) + systemBars.bottom)
      binding.callOverlayPanel.updatePadding(top = dp(24) + systemBars.top, bottom = dp(24) + systemBars.bottom)
      binding.messageThreadScroll.doOnLayout { syncMessageThreadToComposer() }
      insets
    }
  }

  private fun styleStaticChrome() {
    styleTopActionButton(binding.topbarCallButton)
    styleTopActionButton(binding.topbarMenuButton)
    styleSendButton(binding.sendMessageButton)
    stylePrimaryButton(binding.pairButton)
    stylePrimaryButton(binding.locationPermissionButton)
    styleSecondaryButton(binding.refreshButton)
    styleCallCircleButton(binding.callAcceptButton, "#00A884")
    styleCallCircleButton(binding.callDeclineButton, "#D94A4A")
    styleCallCircleButton(binding.callEndButton, "#D94A4A")
    styleCallCircleButton(binding.callMicButton, "#1D9BF0")
    binding.topbar.setBackgroundColor(Color.parseColor("#202C33"))
    binding.tabBar.setBackgroundColor(Color.parseColor("#111B21"))
    binding.composerBar.setBackgroundColor(Color.parseColor("#202C33"))
    binding.companionSection.setBackgroundColor(Color.parseColor("#0B141A"))
    binding.connectionSection.setBackgroundColor(Color.parseColor("#0B141A"))
    binding.messageThreadScroll.setBackgroundColor(Color.parseColor("#0B141A"))
    binding.topbarAvatar.background = roundedDrawable("#00A884", radiusDp = 22)
    binding.callOverlayAvatar.background = roundedDrawable("#00A884", radiusDp = 36)
    binding.messageDraftInput.background = roundedDrawable("#202C33", radiusDp = 24)
    listOf(
      binding.callVisualizerBar1,
      binding.callVisualizerBar2,
      binding.callVisualizerBar3,
      binding.callVisualizerBar4,
      binding.callVisualizerBar5,
    ).forEach { bar ->
      bar.background = roundedDrawable("#FF8C2E", radiusDp = 8)
      bar.alpha = 0.28f
      bar.scaleY = 0.32f
      bar.pivotY = bar.layoutParams.height.toFloat()
    }
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
    val deviceToken = uri.getQueryParameter("deviceToken").orEmpty()

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
    if (deviceToken.isNotBlank()) {
      store.setPendingPairingDeviceToken(deviceToken)
    }
    syncTopbar()

    if (pairCode.isNotBlank()) {
      store.setPendingQrPairing(true)
      setSection(Section.CONNECTION)
      syncConnectionControls(linked = false)
      renderStatus(
        "Pairing details received from QR.",
        "North Star picked up your desktop details. Allow location once and setup can finish itself.",
      )
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
    val pendingDeviceToken = store.pendingPairingDeviceToken().trim()

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
          val deviceToken = if (pendingDeviceToken.isNotBlank()) {
            pendingDeviceToken
          } else {
            api.bindDesktop(apiBase, session.sessionToken, desktopName)
          }
          store.setDeviceToken(deviceToken)
          api.heartbeat(apiBase, deviceToken, currentCapability())
          api.state(apiBase, session.sessionToken, session.userHandle)
        }
        linkedDesktopName = desktops.firstOrNull()?.desktopName.orEmpty()
        store.setPendingQrPairing(false)
        store.setPendingPairingDeviceToken("")
        store.setBackgroundSyncEnabled(true)
        PulseForegroundService.start(this@MainActivity)
        syncPermissionAction()
        syncConnectionControls(linked = true)
        renderStatus(
          if (currentCapability().backgroundSupported) "This phone is now linked." else "This phone is linked. One more step remains.",
          if (currentCapability().backgroundSupported) {
            "Linked to ${linkedDesktopName.ifBlank { desktopName }}. Messages, calls, and background location replies can now use this shared link."
          } else {
            "Linked to ${linkedDesktopName.ifBlank { desktopName }}. Enable always-on location in Android settings so NeuralTrainer can request location while North Star stays in the background."
          },
        )
        syncTopbar()
        refreshAll()
      } catch (caught: Exception) {
        renderStatus("Pairing failed.", caught.message ?: "The native phone pairing flow could not finish.")
      } finally {
        pairingInFlight = false
      }
    }
  }

  private fun refreshAll() {
    refreshConnectionStatus()
    refreshCompanion(silent = true)
    refreshCalls(silent = true)
  }

  private fun refreshConnectionStatus() {
    saveDraftInputs()
    val sessionToken = store.sessionToken().trim()
    val apiBase = store.apiBase().trim().trimEnd('/')
    val userHandle = store.userHandle().trim()
    if (sessionToken.isBlank() || apiBase.isBlank() || userHandle.isBlank()) {
      linkedDesktopName = ""
      syncConnectionControls(linked = false)
      syncTopbar()
      renderStatus("Status: waiting for pairing", detailSummary())
      return
    }

    lifecycleScope.launch {
      try {
        val desktops = withContext(Dispatchers.IO) { api.state(apiBase, sessionToken, userHandle) }
        val currentDeviceToken = store.deviceToken().trim()
        val linkedDesktop = desktops.firstOrNull { desktop -> currentDeviceToken.isNotBlank() && desktop.deviceToken == currentDeviceToken }
        linkedDesktopName = linkedDesktop?.desktopName.orEmpty()
        syncConnectionControls(linked = linkedDesktop != null)
        syncPermissionAction()
        syncTopbar()
        if (!store.pendingQrPairing()) {
          renderStatus(
            if (linkedDesktop != null) {
              "${linkedDesktopName.ifBlank { "NeuralTrainer" }} is linked."
            } else if (desktops.isNotEmpty()) {
              "North Star needs a quick re-pair."
            } else {
              "No linked desktop found."
            },
            if (linkedDesktop != null) {
              detailSummary(linkedDesktopName.ifBlank { store.desktopName() })
            } else if (desktops.isNotEmpty()) {
              "This phone still has a saved desktop token, but it no longer matches the active NeuralTrainer link. Scan the desktop QR code again so both sides share the same connection."
            } else {
              detailSummary()
            },
          )
        }
      } catch (caught: Exception) {
        renderStatus("North Star status could not be refreshed.", caught.message ?: "Unknown native status error.")
      }
    }
  }

  private fun refreshCompanion(silent: Boolean) {
    val sessionToken = store.sessionToken().trim()
    val apiBase = store.apiBase().trim().trimEnd('/')
    if (sessionToken.isBlank() || apiBase.isBlank()) {
      messages = emptyList()
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
        if (!silent) renderStatus("Companion thread could not refresh.", caught.message ?: "Unknown thread error.")
      }
    }
  }

  private fun refreshCalls(silent: Boolean) {
    val sessionToken = store.sessionToken().trim()
    val apiBase = store.apiBase().trim().trimEnd('/')
    if (sessionToken.isBlank() || apiBase.isBlank()) {
      calls = emptyList()
      renderCallOverlay()
      return
    }

    lifecycleScope.launch {
      try {
        calls = withContext(Dispatchers.IO) { api.callSessions(apiBase, sessionToken) }
        renderCallOverlay()
        ensureNativeLiveCall()
      } catch (caught: Exception) {
        if (!silent) renderStatus("Calls could not refresh.", caught.message ?: "Unknown call refresh error.")
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
    val deviceToken = store.deviceToken().trim()
    if (sessionToken.isBlank() || apiBase.isBlank()) {
      renderStatus("Phone is not linked yet.", "Scan the NeuralTrainer QR code first so calls know where to go.")
      return
    }

    lifecycleScope.launch {
      try {
        liveCallController.startSetupTone()
        val call = withContext(Dispatchers.IO) {
          api.startCallFromPhone(
            apiBase,
            sessionToken,
            "North Star is calling from your phone.",
            deviceToken.ifBlank { null },
          )
        }
        renderStatus("Call requested.", "${call.desktopName} was asked to pick up through NeuralTrainer.")
        refreshCalls(silent = true)
        monitorCallUntilLive(call.callId)
        ensureNativeLiveCall()
        setSection(Section.COMPANION)
      } catch (caught: Exception) {
        liveCallController.stopSetupTone()
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
        if (action == "accept") {
          liveCallController.startSetupTone()
        } else if (action == "decline" || action == "missed" || action == "end") {
          liveCallController.stopSetupTone()
        }
        withContext(Dispatchers.IO) { api.respondToCall(apiBase, sessionToken, callId, action) }
        renderStatus("Call updated.", "North Star sent the ${action.trim()} response.")
        refreshCalls(silent = true)
        if (action == "accept") {
          monitorCallUntilLive(callId)
        }
      } catch (caught: Exception) {
        if (action == "accept") {
          liveCallController.stopSetupTone()
        }
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

  private fun detailSummary(connectedDesktopName: String = linkedDesktopName.ifBlank { store.desktopName() }): String {
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
  }

  private fun syncTopbar() {
    val displayName = store.displayName().ifBlank { "North Star" }
    binding.topbarTitle.text = if (activeSection == Section.COMPANION) displayName else when (activeSection) {
      Section.CONNECTION -> getString(R.string.connection_heading)
      else -> displayName
    }
    binding.topbarSubtitle.text = when (activeSection) {
      Section.COMPANION -> if (store.deviceToken().isNotBlank()) "Secure companion\nchat" else getString(R.string.onboarding_copy)
      Section.CONNECTION -> detailSummary()
    }
    binding.topbarAvatar.text = (displayName.firstOrNull()?.uppercase() ?: "N").toString()
    binding.topbarCallButton.visibility = if (activeSection == Section.CONNECTION) View.GONE else View.VISIBLE
  }

  private fun setSection(section: Section) {
    activeSection = section
    binding.companionSection.visibility = if (section == Section.COMPANION) View.VISIBLE else View.GONE
    binding.connectionSection.visibility = if (section == Section.CONNECTION) View.VISIBLE else View.GONE
    updateTabStyles()
    syncTopbar()
  }

  private fun updateTabStyles() {
    styleTab(binding.companionTabButton, activeSection == Section.COMPANION)
    styleTab(binding.connectionTabButton, activeSection == Section.CONNECTION)
  }

  private fun styleTab(button: Button, active: Boolean) {
    button.background = roundedDrawable(if (active) "#00A884" else "#111B21", radiusDp = 18)
    button.setTextColor(Color.parseColor(if (active) "#081318" else "#E9EDEF"))
    button.setPadding(dp(18), dp(10), dp(18), dp(10))
  }

  private fun renderMessages() {
    val container = binding.messageThreadContainer
    container.removeAllViews()

    if (messages.isEmpty()) {
      container.addView(
        messageBubble(
          text = getString(R.string.chat_placeholder),
          incoming = true,
          secondary = "",
        ),
      )
    } else {
      val dayChip = TextView(this).apply {
        text = "Today"
        setTextColor(Color.parseColor("#AEBAC1"))
        setPadding(dp(12), dp(6), dp(12), dp(6))
        background = roundedDrawable("#1F2C34", radiusDp = 16)
        gravity = Gravity.CENTER
      }
      val chipParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
        gravity = Gravity.CENTER_HORIZONTAL
        bottomMargin = dp(12)
      }
      container.addView(dayChip, chipParams)

      messages.takeLast(24).forEach { message ->
        container.addView(
          messageBubble(
            text = message.text.trim().ifBlank { "..." },
            incoming = message.source == "desktop",
            secondary = if (message.source == "desktop") "NeuralTrainer" else "You",
          ),
        )
      }
    }

    binding.messageThreadScroll.post {
      syncMessageThreadToComposer()
      binding.messageThreadScroll.fullScroll(View.FOCUS_DOWN)
    }
  }

  private fun messageBubble(text: String, incoming: Boolean, secondary: String): View {
    val bubble = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      background = roundedDrawable(if (incoming) "#202C33" else "#005C4B", radiusDp = 18)
      setPadding(dp(14), dp(12), dp(14), dp(12))
    }
    val speaker = TextView(this).apply {
      this.text = secondary
      setTextColor(Color.parseColor("#AEBAC1"))
      textSize = 12f
    }
    val body = TextView(this).apply {
      this.text = text
      setTextColor(Color.parseColor("#E9EDEF"))
      textSize = 15f
    }
    bubble.addView(speaker)
    bubble.addView(body)

    return bubble.apply {
      val params = LinearLayout.LayoutParams((resources.displayMetrics.widthPixels * 0.82f).toInt(), LinearLayout.LayoutParams.WRAP_CONTENT).apply {
        gravity = if (incoming) Gravity.START else Gravity.END
        bottomMargin = dp(10)
      }
      layoutParams = params
    }
  }

  private fun syncMessageThreadToComposer() {
    val viewportHeight = binding.messageThreadScroll.height - binding.messageThreadScroll.paddingTop - binding.messageThreadScroll.paddingBottom
    if (viewportHeight <= 0) return
    val targetMinimumHeight = maxOf(0, viewportHeight)
    if (binding.messageThreadContainer.minimumHeight != targetMinimumHeight) {
      binding.messageThreadContainer.minimumHeight = targetMinimumHeight
    }
    binding.messageThreadContainer.gravity = Gravity.BOTTOM
  }

  private fun renderCallOverlay() {
    val call = activeOverlayCall()
    if (call == null) {
      liveCallController.stopSetupTone()
      stopCallVisualizer()
      binding.callOverlay.visibility = View.GONE
      binding.callMicButton.visibility = View.GONE
      binding.callOverlayDiagnostics.visibility = View.GONE
      return
    }

    binding.callOverlay.visibility = View.VISIBLE
    binding.callOverlayTitle.text = call.desktopName.ifBlank { "NeuralTrainer" }
    binding.callOverlayAvatar.text = (call.desktopName.firstOrNull()?.uppercase() ?: "N").toString()
    val outgoingPending = call.status == "pending" && call.note == MOBILE_OUTBOUND_CALL_NOTE
    val accepted = call.status == "accepted"
    binding.callOverlayStatus.text = when (call.status) {
      "pending" -> if (outgoingPending) "Calling NeuralTrainer" else "Incoming call"
      "ended" -> "Call ended"
      "declined" -> "Call declined"
      "missed" -> "Call missed"
      else -> ""
    }
    binding.callOverlayNote.text = when (call.status) {
      "pending" -> if (outgoingPending) {
        "NeuralTrainer is picking up now."
      } else {
        "NeuralTrainer wants to talk for a moment."
      }
      "ended" -> "The call has ended."
      "declined" -> "The call was declined."
      "missed" -> "The call was missed."
      else -> ""
    }
    val shouldPlaySetupTone =
      call.status == "pending"
        || (call.status == "accepted" && !liveCallController.isRunning(call.callId))
        || liveCallController.shouldPlaySetupTone()
    if (shouldPlaySetupTone) {
      liveCallController.startSetupTone()
    } else {
      liveCallController.stopSetupTone()
    }
    binding.callOverlayStatus.visibility = View.VISIBLE
    binding.callOverlayNote.visibility = View.VISIBLE
    binding.callVisualizer.visibility = View.GONE
    stopCallVisualizer()
    if (accepted) {
      binding.callOverlayStatus.text = liveCallController.statusHeadline()
      binding.callOverlayNote.text = liveCallController.statusDetail()
      if (store.showDebug()) {
        binding.callOverlayDiagnostics.visibility = View.VISIBLE
        binding.callOverlayDiagnostics.text = buildCallDiagnosticsText(liveCallDiagnostics)
      } else {
        binding.callOverlayDiagnostics.visibility = View.GONE
      }
    } else {
      binding.callOverlayDiagnostics.visibility = View.GONE
    }
    binding.callOverlay.background = roundedDrawable("#CC081318", radiusDp = 0)
    binding.callOverlayPanel.background = GradientDrawable().apply { setColor(Color.TRANSPARENT) }
    binding.callOverlayAvatar.background = roundedDrawable("#21C7B7", radiusDp = 36)
    styleCallCircleButton(binding.callMicButton, "#1D9BF0")
    binding.callAcceptButton.visibility = if (call.status == "pending" && !outgoingPending) View.VISIBLE else View.GONE
    binding.callDeclineButton.visibility = if (call.status == "pending" && !outgoingPending) View.VISIBLE else View.GONE
    binding.callEndButton.visibility = if (call.status == "accepted" || outgoingPending) View.VISIBLE else View.GONE
    binding.callMicButton.visibility = if (call.status == "accepted") View.VISIBLE else View.GONE
    binding.callMicButton.contentDescription = if (liveCallController.isMuted()) getString(R.string.unmute_call) else getString(R.string.mute_call)
    binding.callMicButton.alpha = if (liveCallController.isMuted()) 0.72f else 1f
  }

  private fun buildCallDiagnosticsText(diagnostics: NativeLiveCallDiagnostics): String {
    return buildString {
      append("Phone live diagnostics")
      append('\n')
      append("Phase: ").append(diagnostics.phase)
      append('\n')
      append("Channel: ").append(diagnostics.dataChannelState)
      append(" / buffered: ").append(diagnostics.dataChannelBufferedAmount)
      append('\n')
      append("Recorder source: ").append(diagnostics.recorderSource)
      append('\n')
      append("Recorder state: ").append(diagnostics.recorderState)
      append('\n')
      append("Reads: ").append(diagnostics.readCount)
      append(" ok / ").append(diagnostics.readFailures).append(" failed")
      append('\n')
      append("Last read bytes: ").append(diagnostics.lastReadBytes)
      append('\n')
      append("RMS / peak: ")
      append(String.format(Locale.US, "%.4f", diagnostics.rms))
      append(" / ")
      append(String.format(Locale.US, "%.4f", diagnostics.peak))
      append('\n')
      append("Speaking: ").append(if (diagnostics.speaking) "yes" else "no")
      append(" / speech frames: ").append(diagnostics.speechFrames)
      append('\n')
      append("Silence ms: ").append(diagnostics.silenceMs)
      append(" / turn ms: ").append(diagnostics.turnMs)
      append('\n')
      append("Sends: ").append(diagnostics.sendSuccesses)
      append(" ok / ").append(diagnostics.sendFailures)
      append(" failed / ").append(diagnostics.sendAttempts).append(" tried")
      append('\n')
      append("Request id: ").append(diagnostics.currentRequestId)
      append('\n')
      append("Last event: ").append(diagnostics.lastEvent)
    }
  }

  private fun openSettingsPanel() {
    val container = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(22), dp(18), dp(22), dp(8))
    }
    val openConnectionButton = Button(this).apply {
      text = getString(R.string.open_connection)
      setTextColor(Color.WHITE)
      background = roundedDrawable("#0F5D7A", radiusDp = 14)
      setPadding(dp(18), dp(12), dp(18), dp(12))
    }
    val copy = TextView(this).apply {
      text = getString(R.string.show_debug_copy)
      setTextColor(Color.parseColor("#AEBAC1"))
      textSize = 13f
    }
    val micBoostCopy = TextView(this).apply {
      text = getString(R.string.mic_boost_copy)
      setTextColor(Color.parseColor("#AEBAC1"))
      textSize = 13f
      setPadding(0, dp(14), 0, 0)
    }
    val micBoostCheckbox = CheckBox(this).apply {
      text = getString(R.string.mic_boost)
      isChecked = store.micBoostEnabled()
      setTextColor(Color.parseColor("#E9EDEF"))
      textSize = 16f
      setPadding(0, dp(8), 0, 0)
    }
    val showDebugCheckbox = CheckBox(this).apply {
      text = getString(R.string.show_debug)
      isChecked = store.showDebug()
      setTextColor(Color.parseColor("#E9EDEF"))
      textSize = 16f
      setPadding(0, dp(12), 0, 0)
    }
    container.addView(openConnectionButton)
    container.addView(micBoostCopy)
    container.addView(micBoostCheckbox)
    container.addView(copy)
    container.addView(showDebugCheckbox)

    val dialog = AlertDialog.Builder(this)
      .setTitle(getString(R.string.settings_title))
      .setView(container)
      .setPositiveButton(android.R.string.ok) { _, _ ->
        store.setMicBoostEnabled(micBoostCheckbox.isChecked)
        store.setShowDebug(showDebugCheckbox.isChecked)
        renderCallOverlay()
      }
      .setNegativeButton(android.R.string.cancel, null)
      .show()

    openConnectionButton.setOnClickListener {
      store.setMicBoostEnabled(micBoostCheckbox.isChecked)
      store.setShowDebug(showDebugCheckbox.isChecked)
      dialog.dismiss()
      setSection(Section.CONNECTION)
    }
  }

  private fun activeOverlayCall(): CompanionCallSession? =
    filteredCalls().firstOrNull { it.status == "pending" } ?: filteredCalls().firstOrNull { it.status == "accepted" }

  private fun filteredCalls(): List<CompanionCallSession> {
    val currentDeviceToken = store.deviceToken().trim()
    if (currentDeviceToken.isBlank()) {
      return calls
    }
    val matching = calls.filter { it.deviceToken == currentDeviceToken }
    return if (matching.isNotEmpty()) matching else calls
  }

  private fun startAutoRefresh() {
    autoRefreshJob?.cancel()
    autoRefreshJob = lifecycleScope.launch {
      while (isActive) {
        delay(8000)
        refreshCompanion(silent = true)
        refreshCalls(silent = true)
      }
    }
  }

  private fun monitorCallUntilLive(callId: String) {
    val sessionToken = store.sessionToken().trim()
    val apiBase = store.apiBase().trim().trimEnd('/')
    if (sessionToken.isBlank() || apiBase.isBlank()) return
    callMonitorJob?.cancel()
    callMonitorJob = lifecycleScope.launch {
      repeat(40) {
        val refreshedCalls = try {
          withContext(Dispatchers.IO) { api.callSessions(apiBase, sessionToken) }
        } catch (_: Exception) {
          delay(500)
          return@repeat
        }
        calls = refreshedCalls
        renderCallOverlay()
        val targetCall = refreshedCalls.firstOrNull { it.callId == callId } ?: run {
          delay(500)
          return@repeat
        }
        if (targetCall.status == "accepted") {
          ensureNativeLiveCall()
          return@launch
        }
        if (targetCall.status == "ended" || targetCall.status == "declined" || targetCall.status == "missed") {
          liveCallController.stopSetupTone()
          return@launch
        }
        delay(500)
      }
    }
  }

  private fun startCallVisualizer() {
    if (visualizerAnimators.isNotEmpty()) return
    val bars = listOf(
      binding.callVisualizerBar1,
      binding.callVisualizerBar2,
      binding.callVisualizerBar3,
      binding.callVisualizerBar4,
      binding.callVisualizerBar5,
    )
    visualizerAnimators = bars.mapIndexed { index, bar ->
      ObjectAnimator.ofFloat(bar, View.SCALE_Y, 0.28f, 1f, 0.45f).apply {
        duration = 520L + (index * 80L)
        repeatCount = ObjectAnimator.INFINITE
        repeatMode = ObjectAnimator.REVERSE
        startDelay = index * 70L
        interpolator = AccelerateDecelerateInterpolator()
        start()
      }
    } + bars.mapIndexed { index, bar ->
      ObjectAnimator.ofFloat(bar, View.ALPHA, 0.22f, 1f, 0.4f).apply {
        duration = 520L + (index * 80L)
        repeatCount = ObjectAnimator.INFINITE
        repeatMode = ObjectAnimator.REVERSE
        startDelay = index * 70L
        interpolator = AccelerateDecelerateInterpolator()
        start()
      }
    }
  }

  private fun stopCallVisualizer() {
    visualizerAnimators.forEach { it.cancel() }
    visualizerAnimators = emptyList()
    listOf(
      binding.callVisualizerBar1,
      binding.callVisualizerBar2,
      binding.callVisualizerBar3,
      binding.callVisualizerBar4,
      binding.callVisualizerBar5,
    ).forEach { bar ->
      bar.scaleY = 0.32f
      bar.alpha = 0.28f
    }
  }

  private fun styleTopActionButton(button: Button) {
    button.background = roundedDrawable("#111B21", radiusDp = 10)
    button.setTextColor(Color.WHITE)
    button.setPadding(dp(16), dp(10), dp(16), dp(10))
  }

  private fun stylePrimaryButton(button: Button) {
    button.background = roundedDrawable("#00A884", radiusDp = 14)
    button.setTextColor(Color.parseColor("#081318"))
    button.setPadding(dp(18), dp(12), dp(18), dp(12))
  }

  private fun styleSecondaryButton(button: Button) {
    button.background = roundedDrawable("#202C33", radiusDp = 14)
    button.setTextColor(Color.parseColor("#E9EDEF"))
    button.setPadding(dp(18), dp(12), dp(18), dp(12))
  }

  private fun styleSendButton(button: Button) {
    button.background = roundedDrawable("#00A884", radiusDp = 22)
    button.setTextColor(Color.parseColor("#081318"))
    button.setPadding(dp(18), dp(12), dp(18), dp(12))
  }

  private fun styleCallCircleButton(button: View, color: String) {
    button.background = roundedDrawable(color, radiusDp = 28)
    val size = dp(88)
    button.layoutParams = (button.layoutParams ?: ViewGroup.LayoutParams(size, size)).apply {
      width = size
      height = size
    }
    if (button is ImageView) {
      button.setColorFilter(Color.WHITE)
      button.scaleType = ImageView.ScaleType.CENTER_INSIDE
    } else if (button is Button) {
      button.setTextColor(Color.WHITE)
    }
  }

  private fun roundedDrawable(fillColor: String, radiusDp: Int = 14): GradientDrawable =
    GradientDrawable().apply {
      shape = GradientDrawable.RECTANGLE
      cornerRadius = dp(radiusDp).toFloat()
      setColor(Color.parseColor(fillColor))
    }

  private fun strokedDrawable(fillColor: String, strokeColor: String): GradientDrawable =
    GradientDrawable().apply {
      shape = GradientDrawable.RECTANGLE
      cornerRadius = dp(16).toFloat()
      setColor(Color.parseColor(fillColor))
      setStroke(dp(1), Color.parseColor(strokeColor))
    }

  private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

  private fun renderStatus(status: String, detail: String) {
    binding.statusText.text = status
    binding.detailText.text = detail
  }

  private fun ensureNativeLiveCall() {
    val call = filteredCalls().firstOrNull { it.status == "accepted" }
    if (call == null) {
      if (activeOverlayCall() == null) {
        liveCallController.stop()
      }
      renderCallOverlay()
      return
    }
    if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
      audioPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
      return
    }
    val apiBase = store.apiBase().trim().trimEnd('/')
    val sessionToken = store.sessionToken().trim()
    if (apiBase.isBlank() || sessionToken.isBlank()) return
    liveCallController.start(call.callId, apiBase, sessionToken, call.note)
    renderCallOverlay()
  }

  private fun toggleCallMute() {
    if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
      audioPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
      return
    }
    liveCallController.toggleMute()
    renderCallOverlay()
  }
}
