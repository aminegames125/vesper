@file:OptIn(ExperimentalMaterial3Api::class)

package dev.aminegames125.vesper.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.FiberManualRecord
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.TextButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import dev.aminegames125.vesper.data.Recording
import dev.aminegames125.vesper.data.formatBytes
import dev.aminegames125.vesper.data.formatDuration
import dev.aminegames125.vesper.data.formatMoment
import dev.aminegames125.vesper.data.formatUntil

/** What is recording, what is coming up and what is ready to watch. */
@Composable
fun RecordingsScreen(vm: VesperViewModel, onRecordNow: () -> Unit, onPlay: (Recording) -> Unit) {
    val recordings by vm.recordings.collectAsState()
    val storage by vm.storage.collectAsState()
    var toDelete by remember { mutableStateOf<Recording?>(null) }
    var toRename by remember { mutableStateOf<Recording?>(null) }
    var query by remember { mutableStateOf("") }

    // Running first, then what starts soonest, then the newest finished ones.
    val sorted = remember(recordings, query) {
        recordings.filter { query.isBlank() || it.title.contains(query.trim(), ignoreCase = true) || it.channelName.contains(query.trim(), ignoreCase = true) }.sortedWith(
            compareBy<Recording> { if (it.isRunning) 0 else if (it.isScheduled) 1 else 2 }
                .thenBy { if (it.isScheduled) it.startAt else 0L }
                .thenByDescending { it.createdAt },
        )
    }

    Scaffold(
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = onRecordNow,
                icon = { Icon(Icons.Filled.FiberManualRecord, contentDescription = null) },
                text = { Text("Record now") },
            )
        },
    ) { padding ->
        if (sorted.isEmpty() && query.isBlank()) {
            EmptyState(
                "Nothing recorded yet",
                "Tap Record now to start recording a channel, or schedule one for later.",
                Modifier.padding(padding),
            )
        } else {
            LazyColumn(
                Modifier.padding(padding),
                contentPadding = PaddingValues(start = pageHorizontal(), end = pageHorizontal(), top = 8.dp, bottom = 96.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                if (recordings.size > 4 || query.isNotBlank()) {
                    item {
                        OutlinedTextField(
                            value = query,
                            onValueChange = { query = it },
                            label = { Text("Search recordings") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                }
                if (recordings.any { it.status == "failed" }) {
                    item {
                        TextButton(onClick = vm::clearFailed) { Text("Clear failed recordings") }
                    }
                }
                if (storage.second > 0) {
                    item {
                        val (used, limit) = storage
                        Column {
                            Text("Storage: ${formatBytes(used)} of ${formatBytes(limit)}", style = MaterialTheme.typography.bodyMedium)
                            LinearProgressIndicator(
                                progress = { (used.toFloat() / limit).coerceIn(0f, 1f) },
                                modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                            )
                        }
                    }
                }
                items(sorted, key = { it.id }) { recording ->
                    RecordingCard(
                        recording,
                        onPlay = { onPlay(recording) },
                        onStop = { vm.stopRecording(recording.id) },
                        onDelete = { toDelete = recording },
                        onRename = { toRename = recording },
                    )
                }
            }
        }
    }

    toRename?.let { recording ->
        var name by remember(recording.id) { mutableStateOf(recording.title) }
        AlertDialog(
            onDismissRequest = { toRename = null },
            title = { Text("Rename recording") },
            text = { OutlinedTextField(value = name, onValueChange = { name = it }, singleLine = true) },
            confirmButton = {
                TextButton(
                    enabled = name.isNotBlank(),
                    onClick = {
                        vm.renameRecording(recording.id, name.trim())
                        toRename = null
                    },
                ) { Text("Save") }
            },
            dismissButton = { TextButton(onClick = { toRename = null }) { Text("Cancel") } },
        )
    }

    toDelete?.let { recording ->
        ConfirmDialog(
            title = "Delete this recording?",
            body = "${recording.title} will be removed from the server.",
            confirm = "Delete",
            onDismiss = { toDelete = null },
            onConfirm = {
                vm.deleteRecording(recording.id)
                toDelete = null
            },
        )
    }
}

@Composable
private fun RecordingCard(recording: Recording, onPlay: () -> Unit, onStop: () -> Unit, onDelete: () -> Unit, onRename: () -> Unit) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(recording.title, style = MaterialTheme.typography.titleMedium, maxLines = 2)
            val detail = when {
                recording.isRunning -> "Recording · ${formatDuration(recording.seconds)} · ${formatBytes(recording.bytes)}"
                recording.isScheduled -> "Starts ${formatMoment(recording.startAt)} (${formatUntil(recording.startAt)})"
                recording.status == "done" -> "Done · ${formatDuration(recording.seconds)} · ${formatBytes(recording.bytes)}"
                else -> "Failed"
            }
            Text(
                detail,
                style = MaterialTheme.typography.bodyMedium,
                color = if (recording.isRunning) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (recording.channelName.isNotEmpty() && recording.channelName != recording.title) {
                Text(recording.channelName, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (recording.isRunning && recording.maxSeconds > 0) {
                LinearProgressIndicator(
                    progress = { (recording.seconds.toFloat() / recording.maxSeconds).coerceIn(0f, 1f) },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            recording.error?.let {
                Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (recording.isPlayable) Button(onClick = onPlay) { Text(if (recording.isRunning) "Watch live" else "Watch") }
                if (recording.isRunning) OutlinedButton(onClick = onStop) { Text("Stop") }
                if (recording.isScheduled) OutlinedButton(onClick = onStop) { Text("Cancel") }
                if (recording.isFinished) OutlinedButton(onClick = onDelete) { Text("Delete") }
                if (recording.isFinished) TextButton(onClick = onRename) { Text("Rename") }
            }
        }
    }
}
