@file:OptIn(ExperimentalMaterial3Api::class)

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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
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
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import dev.aminegames125.vesper.BuildConfig
import dev.aminegames125.vesper.data.Source
import dev.aminegames125.vesper.data.formatBytes
import dev.aminegames125.vesper.work.Notifications

@Composable
fun SettingsScreen(vm: VesperViewModel, gate: Gate.Ready) {
    val sources by vm.sources.collectAsState()
    val storage by vm.storage.collectAsState()
    val busy by vm.busy.collectAsState()
    val context = LocalContext.current
    var addSource by remember { mutableStateOf(false) }
    var toRemove by remember { mutableStateOf<Source?>(null) }
    var canNotify by remember { mutableStateOf(Notifications.canPost(context)) }
    val ask = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { canNotify = it }

    LaunchedEffect(Unit) { vm.loadSources() }

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
