@file:OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)

package dev.aminegames125.vesper.ui

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.Button
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.TextButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
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
import dev.aminegames125.vesper.data.formatDuration
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import dev.aminegames125.vesper.data.formatBytes
import dev.aminegames125.vesper.data.formatMoment
import dev.aminegames125.vesper.work.Notifications

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

    Column(
        Modifier.verticalScroll(rememberScrollState()).padding(horizontal = pageHorizontal(), vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        SectionTitle("Server")
        Text(vm.serverAddress, style = MaterialTheme.typography.bodyLarge)
        Text(
            "Vesper server ${gate.info.version} · ${if (gate.info.isFull) "signed in as ${gate.user.username}" else "no accounts"}",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        val (used, limit) = storage
        Text(
            if (limit > 0) "Storage: ${formatBytes(used)} of ${formatBytes(limit)}" else "Storage: ${formatBytes(used)} used",
            style = MaterialTheme.typography.bodyMedium,
        )
        if (limit > 0) LinearProgressIndicator(progress = { (used.toFloat() / limit).coerceIn(0f, 1f) }, modifier = Modifier.fillMaxWidth())

        status?.let { s ->
            s.diskFree?.let { free ->
                Text(
                    "Server disk: ${formatBytes(free)} free" + (s.diskTotal?.let { " of ${formatBytes(it)}" } ?: ""),
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
            s.next?.let {
                Text(
                    "Next: ${it.title} · ${formatMoment(it.startAt)}",
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
            s.daysLeft?.let { days ->
                Text(
                    if (days < 14) "At the recent pace the disk is full in about $days day(s)." else "Room for about $days more days at the recent pace.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = if (days < 7) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            s.updateAvailable?.let {
                Text("A newer server version is out: $it.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.primary)
            }
            s.brokenChannels.forEach {
                Text(
                    "${it.name.ifBlank { "A channel" }} stopped answering (${it.detail}).",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.error,
                )
            }
            if (s.expiring.isNotEmpty()) {
                Text(
                    "Deleting within a day: " + s.expiring.joinToString { it.title },
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
            OutlinedButton(onClick = {
                vm.loadStorage()
                showStorage = true
            }) { Text("What takes the room") }
        }

        SectionTitle("Deleting old recordings")
        Text(
            "Recordings and downloads are removed from the server after this long, so the space stays free. " +
                "You can change it for each one later, or keep something forever.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (gate.user.isAdmin) {
            val current = status?.defaultKeepHours
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                (listOf(24L to "1 day") + KEEP_CHOICES.drop(1)).forEach { (hours, label) ->
                    FilterChip(
                        selected = (current ?: 0L) == hours,
                        onClick = { vm.setDefaultKeep(hours) },
                        label = { Text(label) },
                    )
                }
            }
        } else {
            Text(
                "Now: " + (status?.defaultKeepHours?.takeIf { it > 0 }?.let { formatDuration(it * 3600) } ?: "kept until deleted"),
                style = MaterialTheme.typography.bodyMedium,
            )
        }

        SectionTitle("Look")
        val theme by vm.theme.collectAsState()
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("system" to "Like the phone", "light" to "Light", "dark" to "Dark").forEach { (value, label) ->
                FilterChip(selected = theme == value, onClick = { vm.setTheme(value) }, label = { Text(label) })
            }
        }

        SectionTitle("Quiet hours")
        val quietStart by vm.quietStart.collectAsState()
        val quietEnd by vm.quietEnd.collectAsState()
        var from by remember(quietStart) { mutableStateOf(quietStart) }
        var until by remember(quietEnd) { mutableStateOf(quietEnd) }
        Text(
            "No notifications from this app between these times (for example 22:00 and 07:00). Leave empty for none.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(from, { from = it }, label = { Text("From") }, singleLine = true, modifier = Modifier.weight(1f))
            OutlinedTextField(until, { until = it }, label = { Text("Until") }, singleLine = true, modifier = Modifier.weight(1f))
            OutlinedButton(onClick = {
                val valid = { v: String -> v.isBlank() || Regex("([01]?\\d|2[0-3]):[0-5]\\d").matches(v.trim()) }
                if (valid(from) && valid(until)) vm.setQuietHours(from.trim(), until.trim()) else vm.toast("Use the form 22:00.")
            }) { Text("Save") }
        }

        SectionTitle("Schedules")
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
        Text(
            "Keep a copy of all your schedules in a file, or add the ones from a file (for example from another server).",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = { saveFile.launch("vesper-schedules.json") }) { Text("Save to a file") }
            OutlinedButton(onClick = { openFile.launch(arrayOf("application/json", "text/plain", "*/*")) }) { Text("Add from a file") }
        }

        SectionTitle("Playlists")
        if (sources.isEmpty()) Text("No playlists yet.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        sources.forEach { source ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(source.name, style = MaterialTheme.typography.bodyLarge)
                    Text(
                        if (source.kind == "xtream") "Xtream login" else "M3U link",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                IconButton(onClick = { toRemove = source }) { Icon(Icons.Filled.Delete, contentDescription = "Remove ${source.name}") }
            }
        }
        OutlinedButton(onClick = { addSource = true }) { Text("Add a playlist") }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            SectionTitle("Notifications")
            Text(
                if (canNotify) "You will be told when a recording finishes or fails." else "Allow notifications to hear when a recording finishes or fails.",
                style = MaterialTheme.typography.bodyMedium,
            )
            if (!canNotify) OutlinedButton(onClick = { ask.launch(Manifest.permission.POST_NOTIFICATIONS) }) { Text("Allow notifications") }
        }

        HorizontalDivider(Modifier.padding(vertical = 8.dp))
        if (gate.info.isFull) Button(onClick = vm::signOut, modifier = Modifier.fillMaxWidth()) { Text("Sign out") }
        OutlinedButton(onClick = vm::changeServer, modifier = Modifier.fillMaxWidth()) { Text("Use another server") }
        Text(
            "Vesper ${BuildConfig.VERSION_NAME}",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(bottom = 24.dp),
        )
    }

    if (showStorage) {
        val use by vm.storageUse.collectAsState()
        AlertDialog(
            onDismissRequest = { showStorage = false },
            title = { Text("What takes the room") },
            text = {
                Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    val data = use
                    if (data == null) {
                        Text("Counting…")
                    } else {
                        Text("Folders", style = MaterialTheme.typography.titleSmall)
                        data.folders.forEach { Text("${it.name}: ${formatBytes(it.bytes)} (${it.count})") }
                        Text("Biggest schedules and rules", style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 8.dp))
                        data.sources.forEach { Text("${it.name}: ${formatBytes(it.bytes)} (${it.count})") }
                        Text("Biggest single items", style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 8.dp))
                        data.biggest.forEach { Text("${it.title}: ${formatBytes(it.bytes)}") }
                    }
                }
            },
            confirmButton = { TextButton(onClick = { showStorage = false }) { Text("Close") } },
        )
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
