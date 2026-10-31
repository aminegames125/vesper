@file:OptIn(ExperimentalTvMaterial3Api::class, ExperimentalComposeUiApi::class)

package dev.aminegames125.vesper.ui

import androidx.compose.foundation.BorderStroke
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.focusRestorer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import androidx.tv.material3.Border
import androidx.tv.material3.ClickableSurfaceDefaults
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.Surface
import coil.compose.AsyncImage
import dev.aminegames125.vesper.data.Recording
import dev.aminegames125.vesper.data.formatBytes
import dev.aminegames125.vesper.data.formatClock
import dev.aminegames125.vesper.data.formatDuration
import dev.aminegames125.vesper.data.formatMoment
import dev.aminegames125.vesper.data.formatUntil

/**
 * The first screen on a TV: what is recording, what is next, what to carry on watching, and what
 * was recorded lately, as rows of cards that the remote's arrows move through.
 */
@Composable
fun TvHome(
    vm: VesperViewModel,
    onPlay: (Recording) -> Unit,
    onRecordNow: () -> Unit,
    onGuide: () -> Unit,
    onCalendar: () -> Unit,
) {
    val recordings by vm.recordings.collectAsState()
    val first = remember { FocusRequester() }
    LaunchedEffect(Unit) { runCatching { first.requestFocus() } }

    val running = remember(recordings) { recordings.filter { it.isRunning && !it.isDownload } }
    val next = remember(recordings) { recordings.filter { it.isScheduled }.sortedBy { it.startAt }.take(12) }
    val resume = remember(recordings) { recordings.filter { it.status == "done" && !it.watched && it.positionS > 10 } }
    val recent = remember(recordings) {
        recordings.filter { it.status == "done" && !it.isDownload }.sortedByDescending { it.finishedAt ?: it.createdAt }.take(16)
    }
    val downloads = remember(recordings) { recordings.filter { it.isDownload && it.status != "failed" }.take(16) }

    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 24.dp, end = 48.dp, top = 24.dp, bottom = 48.dp),
        verticalArrangement = Arrangement.spacedBy(20.dp),
    ) {
        item {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("Vesper", style = MaterialTheme.typography.displaySmall)
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Button(onClick = onRecordNow, modifier = Modifier.focusRequester(first)) { Text("Record now") }
                    OutlinedButton(onClick = onGuide) { Text("TV guide") }
                    OutlinedButton(onClick = onCalendar) { Text("This week") }
                }
            }
        }
        if (recordings.isEmpty()) {
            item {
                Text(
                    "Nothing recorded yet. Choose Record now, or plan something from the TV guide.",
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        if (running.isNotEmpty()) item { CardRow("Recording now") { items(running, key = { it.id }) { r ->
            TvCard(r.title, "${formatDuration(r.seconds)} · ${formatBytes(r.bytes)}", vm.thumbUrl(r.id).takeIf { r.thumb }, null) { onPlay(r) }
        } } }
        if (resume.isNotEmpty()) item { CardRow("Continue watching") { items(resume, key = { "resume${it.id}" }) { r ->
            TvCard(
                r.title,
                "Resume at ${formatClock(r.positionS)}",
                vm.thumbUrl(r.id).takeIf { r.thumb },
                if (r.isDownload || r.seconds <= 0) null else (r.positionS.toFloat() / r.seconds).coerceIn(0f, 1f),
            ) { onPlay(r) }
        } } }
        if (next.isNotEmpty()) item { CardRow("Up next") { items(next, key = { "next${it.id}" }) { r ->
            TvCard(r.title, "${formatMoment(r.startAt)} · ${formatUntil(r.startAt)}", null, null) {}
        } } }
        if (recent.isNotEmpty()) item { CardRow("Recorded lately") { items(recent, key = { "recent${it.id}" }) { r ->
            TvCard(r.title, "${formatDuration(r.seconds)} · ${formatBytes(r.bytes)}", vm.thumbUrl(r.id).takeIf { r.thumb }, null) { onPlay(r) }
        } } }
        if (downloads.isNotEmpty()) item { CardRow("Downloads") { items(downloads, key = { "dl${it.id}" }) { r ->
            TvCard(
                r.title,
                if (r.isRunning) "Downloading · ${formatBytes(r.bytes)}" else formatBytes(r.bytes),
                vm.thumbUrl(r.id).takeIf { r.thumb },
                r.progress,
            ) { if (r.status == "done") onPlay(r) }
        } } }
    }
}

@Composable
private fun CardRow(title: String, content: androidx.compose.foundation.lazy.LazyListScope.() -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(title, style = MaterialTheme.typography.titleLarge)
        LazyRow(
            Modifier.fillMaxWidth().focusRestorer(),
            horizontalArrangement = Arrangement.spacedBy(16.dp),
            contentPadding = PaddingValues(vertical = 8.dp, horizontal = 4.dp),
            content = content,
        )
    }
}

/** A card the remote can focus: it grows a little and gets a border when it has the focus. */
@Composable
private fun TvCard(title: String, subtitle: String, thumb: String?, progress: Float?, onClick: () -> Unit) {
    val colors = MaterialTheme.colorScheme
    Surface(
        onClick = onClick,
        modifier = Modifier.width(260.dp),
        shape = ClickableSurfaceDefaults.shape(RoundedCornerShape(12.dp)),
        scale = ClickableSurfaceDefaults.scale(focusedScale = 1.08f),
        border = ClickableSurfaceDefaults.border(
            focusedBorder = Border(BorderStroke(3.dp, colors.primary), shape = RoundedCornerShape(12.dp)),
        ),
        colors = ClickableSurfaceDefaults.colors(
            containerColor = colors.surfaceVariant,
            contentColor = colors.onSurfaceVariant,
            focusedContainerColor = colors.surfaceVariant,
            focusedContentColor = colors.onSurface,
        ),
    ) {
        Column {
            Box(Modifier.fillMaxWidth().aspectRatio(16f / 9f)) {
                if (thumb != null) {
                    AsyncImage(
                        model = thumb,
                        contentDescription = null,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxSize(),
                    )
                }
            }
            if (progress != null) {
                LinearProgressIndicator(progress = { progress }, modifier = Modifier.fillMaxWidth())
            }
            Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(title, style = MaterialTheme.typography.titleMedium, maxLines = 2)
                Text(subtitle, style = MaterialTheme.typography.bodySmall, maxLines = 2)
            }
        }
    }
}
