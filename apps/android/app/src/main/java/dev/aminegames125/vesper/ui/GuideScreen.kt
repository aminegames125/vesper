package dev.aminegames125.vesper.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
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
import dev.aminegames125.vesper.ui.kit.ButtonKind
import dev.aminegames125.vesper.ui.kit.Ic
import dev.aminegames125.vesper.ui.kit.VButton
import dev.aminegames125.vesper.ui.kit.VDialog
import dev.aminegames125.vesper.ui.kit.VField
import dev.aminegames125.vesper.ui.kit.VIconButton
import dev.aminegames125.vesper.ui.kit.VRow
import dev.aminegames125.vesper.ui.kit.VText
import dev.aminegames125.vesper.ui.kit.VTopBar
import dev.aminegames125.vesper.ui.kit.Vesper
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

    Column(Modifier.fillMaxSize()) {
        VTopBar("TV guide", onBack) {
            VIconButton(Ic.Refresh, "Update the guide now", vm::refreshGuide, enabled = !busy)
        }
        LazyColumn(
            Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = pageHorizontal(), end = pageHorizontal(), top = 4.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            item {
                VField(query, { query = it }, "Search programmes", Modifier.fillMaxWidth(), leading = Ic.Search)
            }
            if (query.trim().length >= 2 && hits.isEmpty()) {
                item {
                    EmptyState(
                        "Nothing found",
                        "Set the guide address in the admin panel (Settings), then update the guide here.",
                        icon = Ic.Search,
                    )
                }
            }
            items(hits) { hit ->
                VRow(
                    title = hit.title,
                    subtitle = "${hit.channelName} · ${formatMoment(hit.startAt)} · ${formatDuration(hit.stopAt - hit.startAt)}",
                    onClick = { chosen = hit },
                )
            }
            if (rules.isNotEmpty()) {
                item { SectionTitle("Recorded every time") }
                items(rules, key = { it.id }) { rule ->
                    VRow(
                        title = rule.title,
                        subtitle = rule.channelName,
                        trailing = {
                            VIconButton(Ic.Delete, "Stop recording ${rule.title}", { vm.deleteRule(rule.id) }, tint = Vesper.colors.danger)
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
    val c = Vesper.colors
    VDialog(
        onDismiss = onDismiss,
        title = hit.title,
        actions = {
            VButton("Close", onDismiss, kind = ButtonKind.Ghost)
            VButton(
                "Every time",
                {
                    vm.recordSeries(hit)
                    onDismiss()
                },
                kind = ButtonKind.Soft,
                enabled = !busy,
                icon = Ic.Refresh,
            )
            VButton(
                "Record",
                {
                    vm.recordProgramme(hit)
                    onDismiss()
                },
                enabled = !busy,
                icon = Ic.Record,
            )
        },
    ) {
        VText("${hit.channelName} · ${formatMoment(hit.startAt)}", style = Vesper.type.bodyStrong)
        if (hit.description.isNotBlank()) {
            VText(hit.description, style = Vesper.type.small, color = c.textDim)
        }
        VText(
            "Recording starts a minute early and runs until the guide says it has ended.",
            style = Vesper.type.small,
            color = c.textFaint,
        )
    }
}
