package app.youworld.northstar

import android.Manifest
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
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.children
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
  private var linkedDesktopName: String = ""

  private val locationPermissionLauncher =
    registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
      syncPermissionAction()
      maybeAutoFinishSetup()
      refreshConnectionStatus()
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

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    applyDeepLink(intent.data)
  }

  private fun wireActions() {
    binding.companionTabButton.setOnClickListener { setSection(Section.COMPANION) }
    binding.callsTabButton.setOnClickListener { setSection(Section.CALLS) }
    binding.connectionTabButton.setOnClickListener { setSection(Section.CONNECTION) }
    binding.topbarCallButton.setOnClickListener { startCallFromPhone() }
    binding.topbarMenuButton.setOnClickListener { setSection(Section.CONNECTION) }
    binding.sendMessageButton.setOnClickListener { sendMessage() }
    binding.startCallButton.setOnClickListener { startCallFromPhone() }
    binding.refreshCallsButton.setOnClickListener { refreshCalls(silent = false) }
    binding.pairButton.setOnClickListener { pairPhone() }
    binding.locationPermissionButton.setOnClickListener { requestLocationPermissions() }
    binding.refreshButton.setOnClickListener { refreshAll() }
    binding.callAcceptButton.setOnClickListener { activeOverlayCall()?.let { respondToCall(it.callId, "accept") } }
    binding.callDeclineButton.setOnClickListener { activeOverlayCall()?.let { respondToCall(it.callId, "decline") } }
    binding.callEndButton.setOnClickListener { activeOverlayCall()?.let { respondToCall(it.callId, "end") } }
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
        linkedDesktopName = desktops.firstOrNull()?.desktopName.orEmpty()
        store.setPendingQrPairing(false)
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
        linkedDesktopName = desktops.firstOrNull()?.desktopName.orEmpty()
        syncConnectionControls(linked = desktops.isNotEmpty())
        syncPermissionAction()
        syncTopbar()
        if (!store.pendingQrPairing()) {
          renderStatus(
            if (desktops.isNotEmpty()) "${linkedDesktopName.ifBlank { "NeuralTrainer" }} is linked." else "No linked desktop found.",
            detailSummary(linkedDesktopName.ifBlank { store.desktopName() }),
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
      renderCalls()
      renderCallOverlay()
      return
    }

    lifecycleScope.launch {
      try {
        calls = withContext(Dispatchers.IO) { api.callSessions(apiBase, sessionToken) }
        renderCalls()
        renderCallOverlay()
        if (!silent && activeSection == Section.CALLS) {
          renderStatus("Calls refreshed.", "North Star checked for new or updated calls.")
        }
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
    val name = linkedDesktopName.ifBlank { store.displayName().ifBlank { "North Star" } }
    binding.topbarTitle.text = if (activeSection == Section.COMPANION) name else when (activeSection) {
      Section.CALLS -> getString(R.string.calls_heading)
      Section.CONNECTION -> getString(R.string.connection_heading)
      else -> name
    }
    binding.topbarSubtitle.text = when (activeSection) {
      Section.COMPANION -> if (store.deviceToken().isNotBlank()) "North Star and NeuralTrainer are staying in touch." else getString(R.string.onboarding_copy)
      Section.CALLS -> getString(R.string.calls_copy)
      Section.CONNECTION -> detailSummary()
    }
    binding.topbarAvatar.text = (name.firstOrNull()?.uppercase() ?: "N").toString()
    binding.topbarCallButton.visibility = if (activeSection == Section.CONNECTION) View.GONE else View.VISIBLE
  }

  private fun setSection(section: Section) {
    activeSection = section
    binding.companionSection.visibility = if (section == Section.COMPANION) View.VISIBLE else View.GONE
    binding.callsSection.visibility = if (section == Section.CALLS) View.VISIBLE else View.GONE
    binding.connectionSection.visibility = if (section == Section.CONNECTION) View.VISIBLE else View.GONE
    updateTabStyles()
    syncTopbar()
  }

  private fun updateTabStyles() {
    styleTab(binding.companionTabButton, activeSection == Section.COMPANION)
    styleTab(binding.callsTabButton, activeSection == Section.CALLS)
    styleTab(binding.connectionTabButton, activeSection == Section.CONNECTION)
  }

  private fun styleTab(button: Button, active: Boolean) {
    button.setBackgroundColor(Color.parseColor(if (active) "#202C33" else "#111B21"))
    button.setTextColor(Color.parseColor("#E9EDEF"))
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
        background = roundedDrawable("#1F2C34")
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

    binding.messageThreadScroll.post { binding.messageThreadScroll.fullScroll(View.FOCUS_DOWN) }
  }

  private fun messageBubble(text: String, incoming: Boolean, secondary: String): View {
    val bubble = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      background = roundedDrawable(if (incoming) "#202C33" else "#005C4B")
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

  private fun renderCalls() {
    val container = binding.callCardContainer
    container.removeAllViews()

    if (calls.isEmpty()) {
      container.addView(callCard("No calls yet", "North Star call requests will appear here.", emptyList()))
      return
    }

    calls.sortedByDescending { it.requestedAt }.take(8).forEach { call ->
      val actions = mutableListOf<Pair<String, () -> Unit>>()
      when (call.status) {
        "pending" -> {
          actions += "Accept" to { respondToCall(call.callId, "accept") }
          actions += "Decline" to { respondToCall(call.callId, "decline") }
          actions += "Missed" to { respondToCall(call.callId, "missed") }
        }
        "accepted" -> actions += "End call" to { respondToCall(call.callId, "end") }
      }
      container.addView(
        callCard(
          title = call.desktopName.ifBlank { "NeuralTrainer" },
          body = buildString {
            append(call.status.replaceFirstChar { it.uppercase() })
            if (call.note.isNotBlank()) {
              append("\n")
              append(call.note.trim())
            }
          },
          actions = actions,
        ),
      )
    }
  }

  private fun callCard(title: String, body: String, actions: List<Pair<String, () -> Unit>>): View {
    val card = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      background = strokedDrawable("#182229", "#22313A")
      setPadding(dp(16), dp(14), dp(16), dp(14))
    }
    val heading = TextView(this).apply {
      text = title
      setTextColor(Color.parseColor("#E9EDEF"))
      textSize = 17f
      setTypeface(typeface, Typeface.BOLD)
    }
    val detail = TextView(this).apply {
      text = body
      setTextColor(Color.parseColor("#AEBAC1"))
      textSize = 14f
    }
    card.addView(heading)
    card.addView(detail)
    if (actions.isNotEmpty()) {
      val row = LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.START
      }
      actions.forEachIndexed { index, (label, click) ->
        val button = Button(this).apply {
          text = label
          setOnClickListener { click() }
        }
        val params = LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
          topMargin = dp(12)
          if (index > 0) marginStart = dp(8)
        }
        row.addView(button, params)
      }
      card.addView(row)
    }
    return card.apply {
      layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
        bottomMargin = dp(12)
      }
    }
  }

  private fun renderCallOverlay() {
    val call = activeOverlayCall()
    if (call == null) {
      binding.callOverlay.visibility = View.GONE
      return
    }

    binding.callOverlay.visibility = View.VISIBLE
    binding.callOverlayTitle.text = call.desktopName.ifBlank { "NeuralTrainer" }
    binding.callOverlayAvatar.text = (call.desktopName.firstOrNull()?.uppercase() ?: "N").toString()
    binding.callOverlayStatus.text = when (call.status) {
      "pending" -> "Incoming call"
      "accepted" -> "Call is live"
      "ended" -> "Call ended"
      "declined" -> "Call declined"
      "missed" -> "Call missed"
      else -> call.status.replaceFirstChar { it.uppercase() }
    }
    binding.callOverlayNote.text = when (call.status) {
      "accepted" -> "North Star call transport is being ported into native Android now. The live phone-call shell is preserved here while the WebRTC voice path is brought over."
      else -> call.note.trim().ifBlank { "NeuralTrainer wants to talk for a moment." }
    }
    binding.callAcceptButton.visibility = if (call.status == "pending") View.VISIBLE else View.GONE
    binding.callDeclineButton.visibility = if (call.status == "pending") View.VISIBLE else View.GONE
    binding.callEndButton.visibility = if (call.status == "accepted") View.VISIBLE else View.GONE
  }

  private fun activeOverlayCall(): CompanionCallSession? =
    calls.firstOrNull { it.status == "pending" } ?: calls.firstOrNull { it.status == "accepted" }

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

  private fun roundedDrawable(fillColor: String): GradientDrawable =
    GradientDrawable().apply {
      shape = GradientDrawable.RECTANGLE
      cornerRadius = dp(14).toFloat()
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
}
