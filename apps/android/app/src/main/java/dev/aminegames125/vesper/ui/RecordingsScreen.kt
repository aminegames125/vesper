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
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.text.KeyboardOptions
import dev.aminegames125.vesper.data.KEEP_CHOICES
import dev.aminegames125.vesper.data.Recording
import dev.aminegames125.vesper.data.formatBytes
import dev.aminegames125.vesper.data.formatClock
import dev.aminegames125.vesper.data.formatDuration
import dev.aminegames125.vesper.data.formatExpiry
import dev.aminegames125.vesper.data.formatMoment
import dev.aminegames125.vesper.data.formatUntil
import dev.aminegames125.vesper.ui.kit.ButtonKind
import dev.aminegames125.vesper.ui.kit.Ic
import dev.aminegames125.vesper.ui.kit.Poster
import dev.aminegames125.vesper.ui.kit.ScreenTitle
import dev.aminegames125.vesper.ui.kit.SheetAction
import dev.aminegames125.vesper.ui.kit.Shapes
import dev.aminegames125.vesper.ui.kit.Tone
import dev.aminegames125.vesper.ui.kit.VActionSheet
import dev.aminegames125.vesper.ui.kit.VButton
import dev.aminegames125.vesper.ui.kit.VCard
import dev.aminegames125.vesper.ui.kit.VChip
import dev.aminegames125.vesper.ui.kit.VDialog
import dev.aminegames125.vesper.ui.kit.VFab
import dev.aminegames125.vesper.ui.kit.VField
import dev.aminegames125.vesper.ui.kit.VIconButton
import dev.aminegames125.vesper.ui.kit.VPill
import dev.aminegames125.vesper.ui.kit.VProgress
import dev.aminegames125.vesper.ui.kit.VText
import dev.aminegames125.vesper.ui.kit.Vesper
import dev.aminegames125.vesper.ui.kit.glass
import dev.aminegames125.vesper.ui.kit.pressable

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

    Box(Modifier.fillMaxSize()) {
        if (recordings.isEmpty() && query.isBlank()) {
            Column(Modifier.fillMaxSize().padding(horizontal = pageHorizontal())) {
                ScreenTitle("Recordings", "Everything you recorded lives here.")
                EmptyState(
                    "Nothing recorded yet",
                    "Tap Record now to start recording a channel, or schedule one for later.",
                    icon = Ic.Library,
                )
            }
        } else {
            LazyColumn(
                Modifier.fillMaxSize(),
                contentPadding = PaddingValues(start = pageHorizontal(), end = pageHorizontal(), top = 0.dp, bottom = 112.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                item {
                    val live = recordings.count { it.isRunning && !it.isDownload }
                    ScreenTitle(
                        "Recordings",
                        when {
                            live > 0 -> "$live recording right now"
                            else -> "${recordings.count { it.status == "done" }} saved on the server"
                        },
                    )
                }
                if (recordings.size > 4 || query.isNotBlank()) {
                    item {
                        VField(query, { query = it }, "Search recordings", Modifier.fillMaxWidth(), leading = Ic.Search)
                    }
                }
                if (folders.isNotEmpty()) {
                    item {
                        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp), contentPadding = PaddingValues(vertical = 4.dp)) {
                            item { VChip("All", selected = folder.isEmpty(), onClick = { folder = "" }, icon = Ic.Folder) }
                            items(folders, key = { it }) { name ->
                                VChip(name, selected = folder == name, onClick = { folder = name })
                            }
                        }
                    }
                }
                if (storage.second > 0) {
                    item {
                        val (used, limit) = storage
                        VCard(Modifier.fillMaxWidth(), padding = 14.dp) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                VText("Storage", Modifier.weight(1f), style = Vesper.type.bodyStrong)
                                VText("${formatBytes(used)} of ${formatBytes(limit)}", style = Vesper.type.small, color = Vesper.colors.textDim)
                            }
                            VProgress((used.toFloat() / limit).coerceIn(0f, 1f), Modifier.padding(top = 10.dp))
                        }
                    }
                }
                if (resume.isNotEmpty() && folder.isEmpty() && query.isBlank()) {
                    item { SectionTitle("Continue watching") }
                    item {
                        LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp), contentPadding = PaddingValues(vertical = 4.dp)) {
                            items(resume.take(8), key = { "resume${it.id}" }) { recording ->
                                ResumeCard(recording, vm) { onPlay(recording) }
                            }
                        }
                    }
                    item { SectionTitle("Everything") }
                }
                if (recordings.any { it.status == "failed" }) {
                    item {
                        VButton("Clear failed recordings", vm::clearFailed, kind = ButtonKind.Soft, compact = true, icon = Ic.Delete)
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
        VFab("Record now", Ic.Record, onRecordNow, Modifier.align(Alignment.BottomEnd).padding(end = pageHorizontal() + 4.dp, bottom = 18.dp))
    }

    toRename?.let { recording ->
        var name by remember(recording.id) { mutableStateOf(recording.title) }
        VDialog(
            onDismiss = { toRename = null },
            title = "Rename",
            actions = {
                VButton("Cancel", { toRename = null }, kind = ButtonKind.Ghost)
                VButton("Save", {
                    vm.renameRecording(recording.id, name.trim())
                    toRename = null
                }, enabled = name.isNotBlank())
            },
        ) {
            VField(name, { name = it }, "Name", Modifier.fillMaxWidth())
        }
    }

    toTag?.let { recording ->
        var name by remember(recording.id) { mutableStateOf(recording.tag) }
        VDialog(
            onDismiss = { toTag = null },
            title = "Folder",
            actions = {
                VButton("Cancel", { toTag = null }, kind = ButtonKind.Ghost)
                VButton("Save", {
                    vm.setTag(recording.id, name)
                    toTag = null
                })
            },
        ) {
            VField(name, { name = it }, "Folder name", Modifier.fillMaxWidth(), hint = "Leave empty to take it out of a folder.")
            if (folders.isNotEmpty()) {
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp), contentPadding = PaddingValues(vertical = 4.dp)) {
                    items(folders, key = { it }) { existing ->
                        VChip(existing, selected = name == existing, onClick = { name = existing })
                    }
                }
            }
        }
    }

    toKeep?.let { recording ->
        VDialog(
            onDismiss = { toKeep = null },
            title = "Delete from the server after",
            actions = { VButton("Close", { toKeep = null }, kind = ButtonKind.Ghost) },
        ) {
            VText(
                formatExpiry(recording.keepUntil) ?: "It stays until you delete it.",
                style = Vesper.type.body,
                color = Vesper.colors.textDim,
            )
            KEEP_CHOICES.forEach { (hours, label) ->
                VButton(
                    label,
                    {
                        vm.setKeep(recording.id, hours)
                        toKeep = null
                    },
                    Modifier.fillMaxWidth(),
                    kind = ButtonKind.Soft,
                )
            }
            VText("The time counts from now.", style = Vesper.type.small, color = Vesper.colors.textFaint)
        }
    }

    toCut?.let { recording ->
        var from by remember(recording.id) { mutableStateOf("0") }
        var to by remember(recording.id) { mutableStateOf((recording.seconds / 60).coerceAtLeast(1).toString()) }
        val fromS = (from.toLongOrNull() ?: -1) * 60
        val toS = (to.toLongOrNull() ?: -1) * 60
        VDialog(
            onDismiss = { toCut = null },
            title = "Cut a part",
            actions = {
                VButton("Cancel", { toCut = null }, kind = ButtonKind.Ghost)
                VButton("Cut", {
                    vm.trim(recording.id, fromS, toS)
                    toCut = null
                }, enabled = fromS >= 0 && toS > fromS)
            },
        ) {
            VText("A copy is made; the original stays as it is.", style = Vesper.type.small, color = Vesper.colors.textDim)
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                VField(
                    from,
                    { from = it.filter(Char::isDigit) },
                    "From (min)",
                    Modifier.weight(1f),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                )
                VField(
                    to,
                    { to = it.filter(Char::isDigit) },
                    "To (min)",
                    Modifier.weight(1f),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                )
            }
        }
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

/** A poster with a bar showing how far you got; a carousel of these is "continue watching". */
@Composable
private fun ResumeCard(recording: Recording, vm: VesperViewModel, onPlay: () -> Unit) {
    val c = Vesper.colors
    Column(
        Modifier.width(250.dp).pressable(onPlay, Shapes.tile, focusScale = 1.04f),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Poster(
            url = vm.thumbUrl(recording.id).takeIf { recording.thumb },
            title = recording.title,
            modifier = Modifier.fillMaxWidth().aspectRatio(16f / 9f),
            shape = Shapes.tile,
            progress = if (recording.seconds > 0 && !recording.isDownload) (recording.positionS.toFloat() / recording.seconds).coerceIn(0f, 1f) else null,
        )
        Column(Modifier.padding(horizontal = 4.dp, vertical = 2.dp)) {
            VText(recording.title, style = Vesper.type.bodyStrong, maxLines = 1)
            VText("Resume at ${formatClock(recording.positionS)}", style = Vesper.type.small, color = c.textDim, maxLines = 1)
        }
    }
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
    val c = Vesper.colors
    var menu by remember { mutableStateOf(false) }
    val canWatch = recording.isPlayable && !(recording.isDownload && recording.isRunning)
    VCard(
        Modifier.fillMaxWidth().alpha(if (recording.watched) 0.62f else 1f),
        onClick = if (canWatch) onPlay else null,
        padding = 12.dp,
    ) {
        Poster(
            url = vm.thumbUrl(recording.id).takeIf { recording.thumb },
            title = recording.title,
            modifier = Modifier.fillMaxWidth().aspectRatio(16f / 9f),
            shape = Shapes.tile,
            overlay = {
                Box(Modifier.align(Alignment.TopStart).padding(10.dp)) {
                    when {
                        recording.isRunning && recording.isDownload -> VPill("Downloading", Tone.Accent, pulse = true)
                        recording.isRunning -> VPill("REC", Tone.Live, pulse = true)
                        recording.isScheduled -> VPill("Scheduled", Tone.Neutral)
                        recording.status == "done" -> VPill(if (recording.isDownload) "Download" else "Done", Tone.Ok)
                        recording.status == "queued" -> VPill("Waiting", Tone.Warn)
                        else -> VPill("Failed", Tone.Bad)
                    }
                }
            },
        )
        Row(Modifier.padding(top = 10.dp), verticalAlignment = Alignment.Top) {
            Column(Modifier.weight(1f).padding(top = 4.dp, start = 4.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                VText(recording.title, style = Vesper.type.heading, maxLines = 2)
                val detail = when {
                    recording.isRunning && recording.isDownload ->
                        "Downloading · ${formatBytes(recording.bytes)}" + (recording.totalBytes?.let { " of ${formatBytes(it)}" } ?: "")
                    recording.isRunning -> "Recording · ${formatDuration(recording.seconds)} · ${formatBytes(recording.bytes)}"
                    recording.isScheduled -> "Starts ${formatMoment(recording.startAt)} (${formatUntil(recording.startAt)})"
                    recording.status == "done" && recording.isDownload -> formatBytes(recording.bytes)
                    recording.status == "done" -> "${formatDuration(recording.seconds)} · ${formatBytes(recording.bytes)}"
                    recording.status == "queued" -> "Waiting to start"
                    else -> "Failed"
                }
                VText(detail, style = Vesper.type.small, color = if (recording.isRunning) c.danger else c.textDim, maxLines = 2)
                val notes = listOfNotNull(
                    recording.channelName.takeIf { it.isNotEmpty() && it != recording.title },
                    recording.tag.takeIf { it.isNotBlank() },
                    if (recording.watched) "Watched" else null,
                    if (recording.status == "done") formatExpiry(recording.keepUntil) else null,
                )
                if (notes.isNotEmpty()) {
                    VText(notes.joinToString(" · "), style = Vesper.type.small, color = c.textFaint, maxLines = 2)
                }
            }
            if (recording.isFinished) {
                VIconButton(Ic.More, "More for ${recording.title}", { menu = true })
            }
        }
        if (recording.isRunning && recording.isDownload) {
            VProgress(recording.progress, Modifier.padding(top = 8.dp))
        } else if (recording.isRunning && recording.maxSeconds > 0) {
            VProgress((recording.seconds.toFloat() / recording.maxSeconds).coerceIn(0f, 1f), Modifier.padding(top = 8.dp))
        }
        recording.error?.let {
            VText(it, style = Vesper.type.small, color = c.danger, modifier = Modifier.padding(top = 6.dp))
        }
        if (canWatch || recording.isRunning || recording.isScheduled) {
            Row(Modifier.padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (canWatch) VButton(if (recording.isRunning) "Watch live" else "Watch", onPlay, icon = Ic.Play, compact = true)
                if (recording.isRunning) VButton(if (recording.isDownload) "Cancel" else "Stop", onStop, kind = ButtonKind.Soft, compact = true)
                if (recording.isScheduled) VButton("Cancel", onStop, kind = ButtonKind.Soft, compact = true)
            }
        }
    }
    if (menu) {
        val actions = buildList {
            add(SheetAction("Rename", Ic.Folder) { onRename() })
            add(SheetAction("Folder", Ic.Folder) { onFolder() })
            if (recording.status == "done") {
                add(SheetAction("Delete after…", Ic.Calendar) { onKeep() })
                add(SheetAction(if (recording.watched) "Mark as not watched" else "Mark as watched", Ic.Check) { onWatched() })
                if (!recording.isDownload) add(SheetAction("Share a link", Ic.Copy) { onShare() })
                add(SheetAction("Save to this phone", Ic.Download) { onSave() })
                if (ffmpeg && !recording.isDownload) {
                    add(SheetAction("Convert to MP4", Ic.Refresh) { onMp4() })
                    add(SheetAction("Save the MP4 to this phone", Ic.Download) { onSaveMp4() })
                    add(SheetAction("Cut a part", Ic.Pause) { onCut() })
                }
            }
            add(SheetAction("Delete", Ic.Delete, danger = true) { onDelete() })
        }
        VActionSheet(recording.title, actions) { menu = false }
    }
}
