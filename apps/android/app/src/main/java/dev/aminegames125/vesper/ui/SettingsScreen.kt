package dev.aminegames125.vesper.ui

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import dev.aminegames125.vesper.BuildConfig
import dev.aminegames125.vesper.data.KEEP_CHOICES
import dev.aminegames125.vesper.data.Source
import dev.aminegames125.vesper.data.formatBytes
import dev.aminegames125.vesper.data.formatDuration
import dev.aminegames125.vesper.data.formatMoment
import dev.aminegames125.vesper.ui.kit.ButtonKind
import dev.aminegames125.vesper.ui.kit.Ic
import dev.aminegames125.vesper.ui.kit.ScreenTitle
import dev.aminegames125.vesper.ui.kit.SectionHeader
import dev.aminegames125.vesper.ui.kit.VButton
import dev.aminegames125.vesper.ui.kit.VCard
import dev.aminegames125.vesper.ui.kit.VChip
import dev.aminegames125.vesper.ui.kit.VDialog
import dev.aminegames125.vesper.ui.kit.VDivider
import dev.aminegames125.vesper.ui.kit.VField
import dev.aminegames125.vesper.ui.kit.VFlow
import dev.aminegames125.vesper.ui.kit.VIcon
import dev.aminegames125.vesper.ui.kit.VIconButton
import dev.aminegames125.vesper.ui.kit.VProgress
import dev.aminegames125.vesper.ui.kit.VSpinner
import dev.aminegames125.vesper.ui.kit.VText
import dev.aminegames125.vesper.ui.kit.Vesper
import dev.aminegames125.vesper.work.Notifications
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
fun SettingsScreen(vm: VesperViewModel, gate: Gate.Ready) {
    val sources by vm.sources.collectAsState()
    val storage by vm.storage.collectAsState()
    val busy by vm.busy.collectAsState()
    val context = LocalContext.current
    var addSource by remember { mutableStateOf(false) }
    var toRemove by remember { mutableStateOf<Source?>(null) }
    var showStorage by remember { mutableStateOf(false) }
    var canNotify by remember { mutableStateOf(Notifications.canPost(context)) }
    val ask = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { canNotify = it }

    val status by vm.status.collectAsState()
    LaunchedEffect(Unit) {
        vm.loadSources()
        vm.loadStatus()
    }

    val c = Vesper.colors
    val body = Vesper.type.body
    val small = Vesper.type.small
    Column(
        Modifier.verticalScroll(rememberScrollState()).padding(horizontal = pageHorizontal()).padding(bottom = 32.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        ScreenTitle("Settings", "Vesper ${BuildConfig.VERSION_NAME}")

        SectionTitle("Server")
        VCard(Modifier.fillMaxWidth()) {
            VText(vm.serverAddress, style = Vesper.type.heading, maxLines = 1)
            VText(
                "Vesper server ${gate.info.version} · ${if (gate.info.isFull) "signed in as ${gate.user.username}" else "no accounts"}",
                style = small,
                color = c.textDim,
                modifier = Modifier.padding(top = 2.dp),
            )
            val (used, limit) = storage
            Row(Modifier.padding(top = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                VText("Storage", Modifier.weight(1f), style = Vesper.type.bodyStrong)
                VText(
                    if (limit > 0) "${formatBytes(used)} of ${formatBytes(limit)}" else "${formatBytes(used)} used",
                    style = small,
                    color = c.textDim,
                )
            }
            if (limit > 0) VProgress((used.toFloat() / limit).coerceIn(0f, 1f), Modifier.padding(top = 8.dp))

            status?.let { s ->
                val lines = buildList<Pair<String, androidx.compose.ui.graphics.Color>> {
                    s.diskFree?.let { free ->
                        add(("Server disk: ${formatBytes(free)} free" + (s.diskTotal?.let { " of ${formatBytes(it)}" } ?: "")) to c.textDim)
                    }
                    s.next?.let { add("Next: ${it.title} · ${formatMoment(it.startAt)}" to c.textDim) }
                    s.daysLeft?.let { days ->
                        add(
                            (if (days < 14) "At the recent pace the disk is full in about $days day(s)." else "Room for about $days more days at the recent pace.") to
                                (if (days < 7) c.danger else c.textDim),
                        )
                    }
                    s.updateAvailable?.let { add("A newer server version is out: $it." to c.accent) }
                    s.brokenChannels.forEach {
                        add("${it.name.ifBlank { "A channel" }} stopped answering (${it.detail})." to c.danger)
                    }
                    if (s.expiring.isNotEmpty()) add(("Deleting within a day: " + s.expiring.joinToString { it.title }) to c.textDim)
                }
                if (lines.isNotEmpty()) {
                    VDivider(Modifier.padding(vertical = 12.dp))
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        lines.forEach { (text, color) -> VText(text, style = small, color = color) }
                    }
                }
                VButton(
                    "What takes the room",
                    {
                        vm.loadStorage()
                        showStorage = true
                    },
                    Modifier.padding(top = 14.dp),
                    kind = ButtonKind.Soft,
                    compact = true,
                )
            }
        }

        SectionTitle("Deleting old recordings")
        VCard(Modifier.fillMaxWidth()) {
            VText(
                "Recordings and downloads are removed from the server after this long, so the space stays free. " +
                    "You can change it for each one later, or keep something forever.",
                style = small,
                color = c.textDim,
                modifier = Modifier.padding(bottom = 12.dp),
            )
            if (gate.user.isAdmin) {
                val current = status?.defaultKeepHours
                VFlow {
                    (listOf(24L to "1 day") + KEEP_CHOICES.drop(1)).forEach { (hours, label) ->
                        VChip(label, selected = (current ?: 0L) == hours, onClick = { vm.setDefaultKeep(hours) })
                    }
                }
            } else {
                VText(
                    "Now: " + (status?.defaultKeepHours?.takeIf { it > 0 }?.let { formatDuration(it * 3600) } ?: "kept until deleted"),
                    style = Vesper.type.bodyStrong,
                )
            }
        }

        SectionTitle("Look")
        VCard(Modifier.fillMaxWidth()) {
            val theme by vm.theme.collectAsState()
            VFlow {
                listOf("system" to "Like the phone", "light" to "Light", "dark" to "Dark").forEach { (value, label) ->
                    VChip(label, selected = theme == value, onClick = { vm.setTheme(value) })
                }
            }
        }

        SectionTitle("Quiet hours")
        VCard(Modifier.fillMaxWidth()) {
            val quietStart by vm.quietStart.collectAsState()
            val quietEnd by vm.quietEnd.collectAsState()
            var from by remember(quietStart) { mutableStateOf(quietStart) }
            var until by remember(quietEnd) { mutableStateOf(quietEnd) }
            VText(
                "No notifications from this app between these times (for example 22:00 and 07:00). Leave empty for none.",
                style = small,
                color = c.textDim,
                modifier = Modifier.padding(bottom = 12.dp),
            )
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                VField(from, { from = it }, "From", Modifier.weight(1f))
                VField(until, { until = it }, "Until", Modifier.weight(1f))
            }
            VButton(
                "Save",
                {
                    val valid = { v: String -> v.isBlank() || Regex("([01]?\\d|2[0-3]):[0-5]\\d").matches(v.trim()) }
                    if (valid(from) && valid(until)) vm.setQuietHours(from.trim(), until.trim()) else vm.toast("Use the form 22:00.")
                },
                Modifier.padding(top = 12.dp),
                kind = ButtonKind.Soft,
                compact = true,
            )
        }

        SectionTitle("Schedules")
        VCard(Modifier.fillMaxWidth()) {
            val scope = rememberCoroutineScope()
            val saveFile = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
                if (uri != null) {
                    scope.launch {
                        val text = vm.exportSchedulesText() ?: return@launch
                        withContext(Dispatchers.IO) { context.contentResolver.openOutputStream(uri)?.use { it.write(text.toByteArray()) } }
                        vm.toast("Saved your schedules.")
                    }
                }
            }
            val openFile = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
                if (uri != null) {
                    scope.launch {
                        val text = withContext(Dispatchers.IO) {
                            context.contentResolver.openInputStream(uri)?.use { String(it.readBytes()) }
                        }
                        if (text.isNullOrBlank()) vm.toast("That file is empty.") else vm.importSchedulesText(text)?.let(vm::toast)
                    }
                }
            }
            VText(
                "Keep a copy of all your schedules in a file, or add the ones from a file (for example from another server).",
                style = small,
                color = c.textDim,
                modifier = Modifier.padding(bottom = 12.dp),
            )
            VFlow {
                VButton("Save to a file", { saveFile.launch("vesper-schedules.json") }, kind = ButtonKind.Soft, compact = true, icon = Ic.Download)
                VButton("Add from a file", { openFile.launch(arrayOf("application/json", "text/plain", "*/*")) }, kind = ButtonKind.Soft, compact = true, icon = Ic.Add)
            }
        }

        SectionTitle("Playlists")
        VCard(Modifier.fillMaxWidth()) {
            if (sources.isEmpty()) VText("No playlists yet.", style = body, color = c.textDim)
            sources.forEachIndexed { index, source ->
                if (index > 0) VDivider(Modifier.padding(vertical = 4.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        VText(source.name, style = Vesper.type.bodyStrong, maxLines = 1)
                        VText(if (source.kind == "xtream") "Xtream login" else "M3U link", style = small, color = c.textDim)
                    }
                    VIconButton(Ic.Delete, "Remove ${source.name}", { toRemove = source }, tint = c.danger)
                }
            }
            VButton("Add a playlist", { addSource = true }, Modifier.padding(top = if (sources.isEmpty()) 12.dp else 8.dp), kind = ButtonKind.Soft, compact = true, icon = Ic.Add)
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            SectionTitle("Notifications")
            VCard(Modifier.fillMaxWidth()) {
                VText(
                    if (canNotify) "You will be told when a recording finishes or fails." else "Allow notifications to hear when a recording finishes or fails.",
                    style = body,
                    color = c.textDim,
                )
                if (!canNotify) {
                    VButton("Allow notifications", { ask.launch(Manifest.permission.POST_NOTIFICATIONS) }, Modifier.padding(top = 12.dp), kind = ButtonKind.Soft, compact = true)
                }
            }
        }

        Column(Modifier.padding(top = 18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            if (gate.info.isFull) VButton("Sign out", vm::signOut, Modifier.fillMaxWidth(), kind = ButtonKind.Danger)
            VButton("Use another server", vm::changeServer, Modifier.fillMaxWidth(), kind = ButtonKind.Soft)
        }
    }

    if (showStorage) {
        val use by vm.storageUse.collectAsState()
        VDialog(
            onDismiss = { showStorage = false },
            title = "What takes the room",
            actions = { VButton("Close", { showStorage = false }, kind = ButtonKind.Soft) },
        ) {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                val data = use
                if (data == null) {
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        VSpinner(size = 24.dp)
                        VText("Counting…", color = Vesper.colors.textDim)
                    }
                } else {
                    SectionHeader("Folders")
                    data.folders.forEach { VText("${it.name}: ${formatBytes(it.bytes)} (${it.count})", style = small) }
                    SectionHeader("Biggest schedules and rules")
                    data.sources.forEach { VText("${it.name}: ${formatBytes(it.bytes)} (${it.count})", style = small) }
                    SectionHeader("Biggest single items")
                    data.biggest.forEach { VText("${it.title}: ${formatBytes(it.bytes)}", style = small) }
                }
            }
        }
    }
    if (addSource) {
        AddSourceDialog(busy = busy, onDismiss = { addSource = false }, onAdd = {
            vm.addSource(it)
            addSource = false
        })
    }
    toRemove?.let { source ->
        ConfirmDialog(
            title = "Remove this playlist?",
            body = "${source.name} will be removed. Schedules that already use its channels keep working.",
            confirm = "Remove",
            onDismiss = { toRemove = null },
            onConfirm = {
                vm.removeSource(source.id)
                toRemove = null
            },
        )
    }
}
