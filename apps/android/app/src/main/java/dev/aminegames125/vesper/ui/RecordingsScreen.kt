@file:OptIn(ExperimentalMaterial3Api::class)

package dev.aminegames125.vesper.ui

import android.app.DownloadManager
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.FiberManualRecord
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.text.KeyboardOptions
import coil.compose.AsyncImage
import dev.aminegames125.vesper.data.KEEP_CHOICES
import dev.aminegames125.vesper.data.Recording
import dev.aminegames125.vesper.data.formatBytes
import dev.aminegames125.vesper.data.formatClock
import dev.aminegames125.vesper.data.formatDuration
import dev.aminegames125.vesper.data.formatExpiry
import dev.aminegames125.vesper.data.formatMoment
import dev.aminegames125.vesper.data.formatUntil

/** What is recording, what is coming up and what is ready to watch. */
@Composable
fun RecordingsScreen(vm: VesperViewModel, onRecordNow: () -> Unit, onPlay: (Recording) -> Unit) {
    val recordings by vm.recordings.collectAsState()
    val storage by vm.storage.collectAsState()
    val status by vm.status.collectAsState()
    var toDelete by remember { mutableStateOf<Recording?>(null) }
    var toRename by remember { mutableStateOf<Recording?>(null) }
    var toTag by remember { mutableStateOf<Recording?>(null) }
    var toKeep by remember { mutableStateOf<Recording?>(null) }
    var toCut by remember { mutableStateOf<Recording?>(null) }
    var query by remember { mutableStateOf("") }
    var folder by remember { mutableStateOf("") }
    val context = LocalContext.current

    LaunchedEffect(Unit) { vm.loadStatus() }
    val ffmpeg = status?.ffmpeg == true
    val folders = remember(recordings) { recordings.map { it.tag }.filter { it.isNotBlank() }.distinct().sorted() }

    // Running first, then what starts soonest, then the newest finished ones.
    val sorted = remember(recordings, query, folder) {
        recordings
            .filter { folder.isEmpty() || it.tag == folder }
            .filter {
                query.isBlank() || it.title.contains(query.trim(), ignoreCase = true) ||
                    it.channelName.contains(query.trim(), ignoreCase = true)
            }
            .sortedWith(
                compareBy<Recording> { if (it.isRunning) 0 else if (it.isScheduled) 1 else 2 }
                    .thenBy { if (it.isScheduled) it.startAt else 0L }
                    .thenByDescending { it.createdAt },
            )
    }
    val resume = remember(recordings) {
        recordings.filter { it.status == "done" && !it.watched && it.positionS > 10 }.sortedByDescending { it.createdAt }
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
        if (recordings.isEmpty() && query.isBlank()) {
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
                if (folders.isNotEmpty()) {
                    item {
                        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            item { FilterChip(selected = folder.isEmpty(), onClick = { folder = "" }, label = { Text("All") }) }
                            items(folders, key = { it }) { name ->
                                FilterChip(selected = folder == name, onClick = { folder = name }, label = { Text(name) })
                            }
                        }
                    }
                }
                if (resume.isNotEmpty() && folder.isEmpty() && query.isBlank()) {
                    item { SectionTitle("Continue watching") }
                    items(resume.take(3), key = { "resume${it.id}" }) { recording ->
                        ResumeRow(recording, vm) { onPlay(recording) }
                    }
                    item { SectionTitle("Everything") }
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
                        recording = recording,
                        vm = vm,
                        ffmpeg = ffmpeg,
                        onPlay = { onPlay(recording) },
                        onStop = { vm.stopRecording(recording.id) },
                        onDelete = { toDelete = recording },
                        onRename = { toRename = recording },
                        onFolder = { toTag = recording },
                        onKeep = { toKeep = recording },
                        onWatched = { vm.setWatched(recording.id, !recording.watched) },
                        onShare = {
                            vm.share(recording.id) { link ->
                                val clipboard = context.getSystemService(ClipboardManager::class.java)
                                clipboard.setPrimaryClip(ClipData.newPlainText("Vesper link", link))
                                vm.toast("Link copied. It works for a day.")
                                val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, link)
                                context.startActivity(Intent.createChooser(send, "Share ${recording.title}").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                            }
                        },
                        onSave = { saveToPhone(context, vm, recording, mp4 = false) },
                        onMp4 = {
                            vm.exportMp4(recording.id)
                        },
                        onSaveMp4 = { vm.exportMp4(recording.id) { saveToPhone(context, vm, recording, mp4 = true) } },
                        onCut = { toCut = recording },
                    )
                }
            }
        }
    }

    toRename?.let { recording ->
        var name by remember(recording.id) { mutableStateOf(recording.title) }
        AlertDialog(
            onDismissRequest = { toRename = null },
            title = { Text("Rename") },
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

    toTag?.let { recording ->
        var name by remember(recording.id) { mutableStateOf(recording.tag) }
        AlertDialog(
            onDismissRequest = { toTag = null },
            title = { Text("Folder") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(value = name, onValueChange = { name = it }, singleLine = true, label = { Text("Folder name") })
                    if (folders.isNotEmpty()) {
                        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            items(folders, key = { it }) { existing ->
                                FilterChip(selected = name == existing, onClick = { name = existing }, label = { Text(existing) })
                            }
                        }
                    }
                    Text("Leave empty to take it out of a folder.", style = MaterialTheme.typography.bodySmall)
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    vm.setTag(recording.id, name)
                    toTag = null
                }) { Text("Save") }
            },
            dismissButton = { TextButton(onClick = { toTag = null }) { Text("Cancel") } },
        )
    }

    toKeep?.let { recording ->
        AlertDialog(
            onDismissRequest = { toKeep = null },
            title = { Text("Delete from the server after") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        formatExpiry(recording.keepUntil) ?: "It stays until you delete it.",
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    KEEP_CHOICES.forEach { (hours, label) ->
                        OutlinedButton(
                            onClick = {
                                vm.setKeep(recording.id, hours)
                                toKeep = null
                            },
                            modifier = Modifier.fillMaxWidth(),
                        ) { Text(label) }
                    }
                    Text("The time counts from now.", style = MaterialTheme.typography.bodySmall)
                }
            },
            confirmButton = {},
            dismissButton = { TextButton(onClick = { toKeep = null }) { Text("Close") } },
        )
    }

    toCut?.let { recording ->
        var from by remember(recording.id) { mutableStateOf("0") }
        var to by remember(recording.id) { mutableStateOf((recording.seconds / 60).coerceAtLeast(1).toString()) }
        val fromS = (from.toLongOrNull() ?: -1) * 60
        val toS = (to.toLongOrNull() ?: -1) * 60
        AlertDialog(
            onDismissRequest = { toCut = null },
            title = { Text("Cut a part") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("A copy is made; the original stays as it is.", style = MaterialTheme.typography.bodySmall)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(
                            value = from,
                            onValueChange = { from = it.filter(Char::isDigit) },
                            label = { Text("From (min)") },
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            modifier = Modifier.weight(1f),
                        )
                        OutlinedTextField(
                            value = to,
                            onValueChange = { to = it.filter(Char::isDigit) },
                            label = { Text("To (min)") },
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
            },
            confirmButton = {
                Button(
                    enabled = fromS >= 0 && toS > fromS,
                    onClick = {
                        vm.trim(recording.id, fromS, toS)
                        toCut = null
                    },
                ) { Text("Cut") }
            },
            dismissButton = { TextButton(onClick = { toCut = null }) { Text("Cancel") } },
        )
    }

    toDelete?.let { recording ->
        ConfirmDialog(
            title = "Delete this?",
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

/** Hands a file to the system download manager, so it ends up on the phone. */
private fun saveToPhone(context: Context, vm: VesperViewModel, recording: Recording, mp4: Boolean) {
    val url = if (mp4) vm.exportUrl(recording.id) else vm.fileUrl(recording.id)
    val extension = when {
        mp4 -> "mp4"
        recording.isDownload -> recording.fileName?.substringAfterLast('.', "mp4") ?: "mp4"
        else -> "ts"
    }
    val name = recording.title.replace(Regex("[^\\p{L}\\p{N} -]"), "_").trim().ifEmpty { "recording" } + ".$extension"
    val request = DownloadManager.Request(Uri.parse(url))
        .setTitle(recording.title)
        .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        request.setDestinationInExternalPublicDir(Environment.DIRECTORY_MOVIES, "Vesper/$name")
    } else {
        request.setDestinationInExternalFilesDir(context, Environment.DIRECTORY_MOVIES, name)
    }
    runCatching { context.getSystemService(DownloadManager::class.java).enqueue(request) }
        .onSuccess { vm.toast("Saving $name to this phone.") }
        .onFailure { vm.toast("Could not start the download.") }
}

@Composable
private fun ResumeRow(recording: Recording, vm: VesperViewModel, onPlay: () -> Unit) {
    Card(onClick = onPlay, modifier = Modifier.fillMaxWidth()) {
        Row(Modifier.padding(12.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Thumbnail(recording, vm, Modifier.weight(0.4f))
            Column(Modifier.weight(0.6f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(recording.title, style = MaterialTheme.typography.titleSmall, maxLines = 2)
                Text("Resume at ${formatClock(recording.positionS)}", style = MaterialTheme.typography.bodySmall)
                if (recording.seconds > 0 && !recording.isDownload) {
                    LinearProgressIndicator(
                        progress = { (recording.positionS.toFloat() / recording.seconds).coerceIn(0f, 1f) },
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
        }
    }
}

/** The picture for a recording when the server made one, otherwise nothing. */
@Composable
private fun Thumbnail(recording: Recording, vm: VesperViewModel, modifier: Modifier = Modifier) {
    if (!recording.thumb) return
    AsyncImage(
        model = vm.thumbUrl(recording.id),
        contentDescription = null,
        contentScale = ContentScale.Crop,
        modifier = modifier.aspectRatio(16f / 9f),
    )
}

@Composable
private fun RecordingCard(
    recording: Recording,
    vm: VesperViewModel,
    ffmpeg: Boolean,
    onPlay: () -> Unit,
    onStop: () -> Unit,
    onDelete: () -> Unit,
    onRename: () -> Unit,
    onFolder: () -> Unit,
    onKeep: () -> Unit,
    onWatched: () -> Unit,
    onShare: () -> Unit,
    onSave: () -> Unit,
    onMp4: () -> Unit,
    onSaveMp4: () -> Unit,
    onCut: () -> Unit,
) {
    var menu by remember { mutableStateOf(false) }
    Card(Modifier.fillMaxWidth().alpha(if (recording.watched) 0.6f else 1f)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Thumbnail(recording, vm, Modifier.fillMaxWidth())
            Row(verticalAlignment = androidx.compose.ui.Alignment.Top) {
                Text(recording.title, style = MaterialTheme.typography.titleMedium, maxLines = 2, modifier = Modifier.weight(1f))
                if (recording.isFinished) {
                    Box {
                        IconButton(onClick = { menu = true }) { Icon(Icons.Filled.MoreVert, contentDescription = "More for ${recording.title}") }
                        DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                            DropdownMenuItem(text = { Text("Rename") }, onClick = { menu = false; onRename() })
                            DropdownMenuItem(text = { Text("Folder") }, onClick = { menu = false; onFolder() })
                            if (recording.status == "done") {
                                DropdownMenuItem(text = { Text("Delete after…") }, onClick = { menu = false; onKeep() })
                                DropdownMenuItem(
                                    text = { Text(if (recording.watched) "Mark as not watched" else "Mark as watched") },
                                    onClick = { menu = false; onWatched() },
                                )
                                if (!recording.isDownload) DropdownMenuItem(text = { Text("Share a link") }, onClick = { menu = false; onShare() })
                                DropdownMenuItem(text = { Text("Save to this phone") }, onClick = { menu = false; onSave() })
                                if (ffmpeg && !recording.isDownload) {
                                    DropdownMenuItem(text = { Text("Convert to MP4") }, onClick = { menu = false; onMp4() })
                                    DropdownMenuItem(text = { Text("Save the MP4 to this phone") }, onClick = { menu = false; onSaveMp4() })
                                    DropdownMenuItem(text = { Text("Cut a part") }, onClick = { menu = false; onCut() })
                                }
                            }
                            DropdownMenuItem(text = { Text("Delete") }, onClick = { menu = false; onDelete() })
                        }
                    }
                }
            }
            val kindLabel = if (recording.isDownload) "Download" else "Recording"
            val detail = when {
                recording.isRunning && recording.isDownload ->
                    "Downloading · ${formatBytes(recording.bytes)}" + (recording.totalBytes?.let { " of ${formatBytes(it)}" } ?: "")
                recording.isRunning -> "Recording · ${formatDuration(recording.seconds)} · ${formatBytes(recording.bytes)}"
                recording.isScheduled -> "Starts ${formatMoment(recording.startAt)} (${formatUntil(recording.startAt)})"
                recording.status == "done" && recording.isDownload -> "$kindLabel · ${formatBytes(recording.bytes)}"
                recording.status == "done" -> "Done · ${formatDuration(recording.seconds)} · ${formatBytes(recording.bytes)}"
                recording.status == "queued" -> "Waiting to start"
                else -> "Failed"
            }
            Text(
                detail,
                style = MaterialTheme.typography.bodyMedium,
                color = if (recording.isRunning) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
            )
            val notes = listOfNotNull(
                recording.channelName.takeIf { it.isNotEmpty() && it != recording.title },
                recording.tag.takeIf { it.isNotBlank() },
                if (recording.watched) "Watched" else null,
                if (recording.status == "done") formatExpiry(recording.keepUntil) else null,
            )
            if (notes.isNotEmpty()) {
                Text(notes.joinToString(" · "), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (recording.isRunning && recording.isDownload) {
                val share = recording.progress
                if (share != null) {
                    LinearProgressIndicator(progress = { share }, modifier = Modifier.fillMaxWidth())
                } else {
                    LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
                }
            } else if (recording.isRunning && recording.maxSeconds > 0) {
                LinearProgressIndicator(
                    progress = { (recording.seconds.toFloat() / recording.maxSeconds).coerceIn(0f, 1f) },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            recording.error?.let {
                Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (recording.isPlayable && !(recording.isDownload && recording.isRunning)) {
                    Button(onClick = onPlay) { Text(if (recording.isRunning) "Watch live" else "Watch") }
                }
                if (recording.isRunning) OutlinedButton(onClick = onStop) { Text(if (recording.isDownload) "Cancel" else "Stop") }
                if (recording.isScheduled) OutlinedButton(onClick = onStop) { Text("Cancel") }
            }
        }
    }
}
