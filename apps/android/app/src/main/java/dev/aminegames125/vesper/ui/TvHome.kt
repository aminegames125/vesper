@file:OptIn(ExperimentalComposeUiApi::class)

package dev.aminegames125.vesper.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.focusRestorer
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.aminegames125.vesper.data.Recording
import dev.aminegames125.vesper.data.formatBytes
import dev.aminegames125.vesper.data.formatClock
import dev.aminegames125.vesper.data.formatDuration
import dev.aminegames125.vesper.data.formatMoment
import dev.aminegames125.vesper.data.formatUntil
import dev.aminegames125.vesper.ui.kit.ButtonKind
import dev.aminegames125.vesper.ui.kit.Ic
import dev.aminegames125.vesper.ui.kit.Poster
import dev.aminegames125.vesper.ui.kit.Shapes
import dev.aminegames125.vesper.ui.kit.Tone
import dev.aminegames125.vesper.ui.kit.VButton
import dev.aminegames125.vesper.ui.kit.VPill
import dev.aminegames125.vesper.ui.kit.VText
import dev.aminegames125.vesper.ui.kit.Vesper
import dev.aminegames125.vesper.ui.kit.pressable

/**
 * The first screen on a TV: what is recording, what is next, what to carry on watching, and what
 * was recorded lately. A large hero at the top says what matters most right now; under it, rows of
 * cards that the remote's arrows move through.
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
    val c = Vesper.colors

    val running = remember(recordings) { recordings.filter { it.isRunning && !it.isDownload } }
    val next = remember(recordings) { recordings.filter { it.isScheduled }.sortedBy { it.startAt }.take(12) }
    val resume = remember(recordings) { recordings.filter { it.status == "done" && !it.watched && it.positionS > 10 } }
    val recent = remember(recordings) {
        recordings.filter { it.status == "done" && !it.isDownload }.sortedByDescending { it.finishedAt ?: it.createdAt }.take(16)
    }
    val downloads = remember(recordings) { recordings.filter { it.isDownload && it.status != "failed" }.take(16) }

    // The one thing the hero talks about: what is recording, else what starts next, else a welcome.
    val headline = running.firstOrNull() ?: next.firstOrNull()

    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 12.dp, end = 48.dp, top = 28.dp, bottom = 48.dp),
        verticalArrangement = Arrangement.spacedBy(22.dp),
    ) {
        item {
            Hero(
                recording = headline,
                thumb = headline?.let { vm.thumbUrl(it.id).takeIf { _ -> it.thumb } },
                live = headline?.isRunning == true,
                first = first,
                onRecordNow = onRecordNow,
                onGuide = onGuide,
                onCalendar = onCalendar,
                onWatch = { headline?.let(onPlay) },
            )
        }
        if (recordings.isEmpty()) {
            item {
                VText(
                    "Nothing recorded yet. Choose Record now, or plan something from the TV guide.",
                    Modifier.padding(start = 12.dp),
                    style = Vesper.type.heading,
                    color = c.textDim,
                )
            }
        }
        if (running.isNotEmpty()) item {
            CardRow("Recording now") {
                items(running, key = { it.id }) { r ->
                    TvCard(r.title, "${formatDuration(r.seconds)} · ${formatBytes(r.bytes)}", vm.thumbUrl(r.id).takeIf { r.thumb }, null, badge = "REC") { onPlay(r) }
                }
            }
        }
        if (resume.isNotEmpty()) item {
            CardRow("Continue watching") {
                items(resume, key = { "resume${it.id}" }) { r ->
                    TvCard(
                        r.title,
                        "Resume at ${formatClock(r.positionS)}",
                        vm.thumbUrl(r.id).takeIf { r.thumb },
                        if (r.isDownload || r.seconds <= 0) null else (r.positionS.toFloat() / r.seconds).coerceIn(0f, 1f),
                    ) { onPlay(r) }
                }
            }
        }
        if (next.isNotEmpty()) item {
            CardRow("Up next") {
                items(next, key = { "next${it.id}" }) { r ->
                    TvCard(r.title, "${formatMoment(r.startAt)} · ${formatUntil(r.startAt)}", null, null) {}
                }
            }
        }
        if (recent.isNotEmpty()) item {
            CardRow("Recorded lately") {
                items(recent, key = { "recent${it.id}" }) { r ->
                    TvCard(r.title, "${formatDuration(r.seconds)} · ${formatBytes(r.bytes)}", vm.thumbUrl(r.id).takeIf { r.thumb }, null) { onPlay(r) }
                }
            }
        }
        if (downloads.isNotEmpty()) item {
            CardRow("Downloads") {
                items(downloads, key = { "dl${it.id}" }) { r ->
                    TvCard(
                        r.title,
                        if (r.isRunning) "Downloading · ${formatBytes(r.bytes)}" else formatBytes(r.bytes),
                        vm.thumbUrl(r.id).takeIf { r.thumb },
                        r.progress,
                    ) { if (r.status == "done") onPlay(r) }
                }
            }
        }
    }
}

/** The big banner: a soft picture, the headline, and the three things most worth doing. */
@Composable
private fun Hero(
    recording: Recording?,
    thumb: String?,
    live: Boolean,
    first: FocusRequester,
    onRecordNow: () -> Unit,
    onGuide: () -> Unit,
    onCalendar: () -> Unit,
    onWatch: () -> Unit,
) {
    val c = Vesper.colors
    Box(
        Modifier
            .padding(start = 12.dp)
            .fillMaxWidth()
            .height(280.dp),
    ) {
        Poster(
            url = thumb,
            title = recording?.title ?: "Vesper",
            modifier = Modifier.fillMaxSize(),
            shape = Shapes.sheet,
        )
        // Fade the picture into ink on the left so the words can sit on it.
        Box(
            Modifier
                .fillMaxSize()
                .background(Brush.horizontalGradient(listOf(c.bg.copy(alpha = 0.96f), c.bg.copy(alpha = 0.55f), Color.Transparent)), Shapes.sheet),
        )
        Column(
            Modifier.align(Alignment.CenterStart).padding(start = 40.dp).fillMaxWidth(0.62f),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            if (recording != null) {
                if (live) {
                    VPill("Recording now", Tone.Live, pulse = true)
                } else {
                    VPill("Up next · ${formatUntil(recording.startAt)}", Tone.Accent)
                }
                VText(recording.title, style = Vesper.type.display.copy(fontSize = 40.sp, lineHeight = 44.sp), maxLines = 2)
                VText(
                    if (live) "${formatDuration(recording.seconds)} so far · ${formatBytes(recording.bytes)}" else formatMoment(recording.startAt),
                    style = Vesper.type.heading,
                    color = c.textDim,
                    maxLines = 1,
                )
            } else {
                VText("Vesper", style = Vesper.type.display.copy(fontSize = 52.sp, lineHeight = 56.sp))
                VText("Your recordings, planned and ready.", style = Vesper.type.heading, color = c.textDim)
            }
            Row(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                if (live) {
                    VButton("Watch live", onWatch, Modifier.focusRequester(first), icon = Ic.Play)
                    VButton("Record now", onRecordNow, kind = ButtonKind.Soft, icon = Ic.Record)
                } else {
                    VButton("Record now", onRecordNow, Modifier.focusRequester(first), icon = Ic.Record)
                }
                VButton("TV guide", onGuide, kind = ButtonKind.Soft, icon = Ic.Guide)
                VButton("This week", onCalendar, kind = ButtonKind.Soft, icon = Ic.Calendar)
            }
        }
    }
}

@Composable
private fun CardRow(title: String, content: LazyListScope.() -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        VText(title, Modifier.padding(start = 12.dp), style = Vesper.type.title)
        LazyRow(
            Modifier.fillMaxWidth().focusRestorer(),
            horizontalArrangement = Arrangement.spacedBy(18.dp),
            contentPadding = PaddingValues(vertical = 14.dp, horizontal = 12.dp),
            content = content,
        )
    }
}

/** A card the remote can focus: it grows, gets an accent ring and a glow. Wide picture, two lines of text. */
@Composable
private fun TvCard(title: String, subtitle: String, thumb: String?, progress: Float?, badge: String? = null, onClick: () -> Unit) {
    val c = Vesper.colors
    Column(
        Modifier
            .width(268.dp)
            .pressable(onClick, Shapes.tile, focusScale = 1.06f),
        verticalArrangement = Arrangement.spacedBy(0.dp),
    ) {
        Poster(
            url = thumb,
            title = title,
            modifier = Modifier.fillMaxWidth().aspectRatio(16f / 9f),
            shape = Shapes.tile,
            progress = progress,
            overlay = if (badge != null) {
                { Box(Modifier.align(Alignment.TopStart).padding(10.dp)) { VPill(badge, Tone.Live, pulse = true) } }
            } else {
                null
            },
        )
        Column(Modifier.padding(horizontal = 4.dp, vertical = 10.dp)) {
            VText(title, style = Vesper.type.heading, maxLines = 1)
            VText(subtitle, style = Vesper.type.small, color = c.textDim, maxLines = 2)
        }
    }
}
