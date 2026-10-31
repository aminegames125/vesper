@file:OptIn(ExperimentalMaterial3Api::class)

package dev.aminegames125.vesper.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import dev.aminegames125.vesper.data.GuideHit
import dev.aminegames125.vesper.data.formatDuration
import dev.aminegames125.vesper.data.formatMoment
import kotlinx.coroutines.delay

/** Find a programme by title and record it once or every time it is on. */
@Composable
fun GuideScreen(vm: VesperViewModel, onBack: () -> Unit) {
    val hits by vm.guideHits.collectAsState()
    val rules by vm.rules.collectAsState()
    val busy by vm.busy.collectAsState()
    var query by remember { mutableStateOf("") }
    var chosen by remember { mutableStateOf<GuideHit?>(null) }

    LaunchedEffect(Unit) { vm.loadRules() }
    LaunchedEffect(query) {
        delay(300)
        vm.searchGuide(query)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("TV guide") },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back") }
                },
                actions = {
                    IconButton(onClick = vm::refreshGuide, enabled = !busy) {
                        Icon(Icons.Filled.Refresh, contentDescription = "Update the guide now")
                    }
                },
            )
        },
    ) { padding ->
        LazyColumn(
            Modifier.padding(padding),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(
                start = pageHorizontal(), end = pageHorizontal(), top = 8.dp, bottom = 24.dp,
            ),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            item {
                OutlinedTextField(
                    value = query,
                    onValueChange = { query = it },
                    label = { Text("Search programmes") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            if (query.trim().length >= 2 && hits.isEmpty()) {
                item {
                    EmptyState(
                        "Nothing found",
                        "Set the guide address in the admin panel (Settings), then update the guide here.",
                    )
                }
            }
            items(hits) { hit ->
                ListItem(
                    modifier = Modifier.clickable { chosen = hit },
                    headlineContent = { Text(hit.title, maxLines = 1) },
                    supportingContent = {
                        Text("${hit.channelName} · ${formatMoment(hit.startAt)} · ${formatDuration(hit.stopAt - hit.startAt)}", maxLines = 2)
                    },
                )
            }
            if (rules.isNotEmpty()) {
                item { SectionTitle("Recorded every time") }
                items(rules, key = { it.id }) { rule ->
                    ListItem(
                        headlineContent = { Text(rule.title) },
                        supportingContent = { Text(rule.channelName) },
                        trailingContent = {
                            IconButton(onClick = { vm.deleteRule(rule.id) }) {
                                Icon(Icons.Filled.Delete, contentDescription = "Stop recording ${rule.title}")
                            }
                        },
                    )
                }
            }
        }
    }

    chosen?.let { hit -> ProgrammeDialog(hit, vm, busy) { chosen = null } }
}

/** What to do with a programme from the guide. */
@Composable
fun ProgrammeDialog(hit: GuideHit, vm: VesperViewModel, busy: Boolean, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(hit.title) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("${hit.channelName} · ${formatMoment(hit.startAt)}", style = MaterialTheme.typography.bodyMedium)
                if (hit.description.isNotBlank()) {
                    Text(hit.description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Text(
                    "Recording starts a minute early and runs until the guide says it has ended.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        },
        confirmButton = {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(
                    enabled = !busy,
                    onClick = {
                        vm.recordSeries(hit)
                        onDismiss()
                    },
                ) { Text("Every time") }
                Button(
                    enabled = !busy,
                    onClick = {
                        vm.recordProgramme(hit)
                        onDismiss()
                    },
                ) { Text("Record") }
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Close") } },
    )
}
