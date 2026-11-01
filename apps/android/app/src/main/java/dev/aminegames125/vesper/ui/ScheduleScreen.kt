package dev.aminegames125.vesper.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.unit.dp
import dev.aminegames125.vesper.data.Schedule
import dev.aminegames125.vesper.data.describeDays
import dev.aminegames125.vesper.data.formatDuration
import dev.aminegames125.vesper.data.formatMoment
import dev.aminegames125.vesper.data.formatUntil
import dev.aminegames125.vesper.ui.kit.ButtonKind
import dev.aminegames125.vesper.ui.kit.Ic
import dev.aminegames125.vesper.ui.kit.ScreenTitle
import dev.aminegames125.vesper.ui.kit.SectionHeader
import dev.aminegames125.vesper.ui.kit.Shapes
import dev.aminegames125.vesper.ui.kit.Tone
import dev.aminegames125.vesper.ui.kit.VButton
import dev.aminegames125.vesper.ui.kit.VCard
import dev.aminegames125.vesper.ui.kit.VFab
import dev.aminegames125.vesper.ui.kit.VIcon
import dev.aminegames125.vesper.ui.kit.VIconButton
import dev.aminegames125.vesper.ui.kit.VPill
import dev.aminegames125.vesper.ui.kit.VSwitch
import dev.aminegames125.vesper.ui.kit.VText
import dev.aminegames125.vesper.ui.kit.Vesper
import dev.aminegames125.vesper.ui.kit.glass
import dev.aminegames125.vesper.ui.kit.pressable

/** The next recordings that will happen, and the schedules that make them. */
@Composable
fun ScheduleScreen(vm: VesperViewModel, onNew: () -> Unit, onEdit: (Schedule) -> Unit, onGuide: () -> Unit, onCalendar: () -> Unit) {
    val schedules by vm.schedules.collectAsState()
    val recordings by vm.recordings.collectAsState()
    var toDelete by remember { mutableStateOf<Schedule?>(null) }
    val c = Vesper.colors

    val upcoming = remember(recordings) { recordings.filter { it.isScheduled }.sortedBy { it.startAt }.take(6) }

    Box(Modifier.fillMaxSize()) {
        if (schedules.isEmpty() && upcoming.isEmpty()) {
            Column(Modifier.fillMaxSize().padding(horizontal = pageHorizontal())) {
                ScreenTitle("Schedule", "Plan a recording and Vesper takes care of it.")
                EmptyState(
                    "No schedules yet",
                    "Pick a channel and a time, for example 11:00 to 11:30, and Vesper records it for you.",
                    icon = Ic.Calendar,
                    action = { VButton("Pick a programme from the TV guide", onGuide, kind = ButtonKind.Soft, icon = Ic.Guide) },
                )
            }
        } else {
            LazyColumn(
                Modifier.fillMaxSize(),
                contentPadding = PaddingValues(start = pageHorizontal(), end = pageHorizontal(), top = 0.dp, bottom = 112.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                item {
                    ScreenTitle(
                        "Schedule",
                        when {
                            upcoming.isNotEmpty() -> "Next up ${formatUntil(upcoming.first().startAt)}: ${upcoming.first().title}"
                            else -> "${schedules.size} planned"
                        },
                    )
                }
                item {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        QuickTile("TV guide", "Find a programme", Ic.Guide, onGuide, Modifier.weight(1f))
                        QuickTile("This week", "What is planned", Ic.Calendar, onCalendar, Modifier.weight(1f))
                    }
                }
                if (upcoming.isNotEmpty()) {
                    item { SectionTitle("Coming up") }
                    items(upcoming, key = { "up-${it.id}" }) { recording ->
                        Row(
                            Modifier.fillMaxWidth().glass(Shapes.tile).padding(horizontal = 14.dp, vertical = 12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(14.dp),
                        ) {
                            Column(Modifier.width(68.dp)) {
                                VText(clockTime(recording.startAt), style = Vesper.type.heading, color = c.accent, maxLines = 1)
                                VText(dayLabel(recording.startAt), style = Vesper.type.small, color = c.textDim, maxLines = 1)
                            }
                            Column(Modifier.weight(1f)) {
                                VText(recording.title, style = Vesper.type.bodyStrong, maxLines = 1)
                                VText(
                                    formatUntil(recording.startAt) + if (recording.channelName.isNotBlank()) " · ${recording.channelName}" else "",
                                    style = Vesper.type.small,
                                    color = c.textDim,
                                    maxLines = 1,
                                )
                            }
                        }
                    }
                }
                if (schedules.isNotEmpty()) {
                    item {
                        val allPaused = schedules.none { it.enabled }
                        SectionHeader(
                            "Schedules",
                            trailing = {
                                VButton(
                                    if (allPaused) "Resume all" else "Pause all",
                                    { vm.pauseAll(!allPaused) },
                                    kind = ButtonKind.Ghost,
                                    compact = true,
                                    icon = if (allPaused) Ic.Play else Ic.Pause,
                                )
                            },
                        )
                    }
                    items(schedules, key = { it.id }) { schedule ->
                        ScheduleCard(
                            schedule,
                            onClick = { onEdit(schedule) },
                            onToggle = { vm.setScheduleEnabled(schedule.id, it) },
                            onDelete = { toDelete = schedule },
                            onRun = { vm.runSchedule(schedule.id) },
                            onCopy = { vm.duplicateSchedule(schedule.id) },
                        )
                    }
                }
            }
        }
        VFab("New schedule", Ic.Add, onNew, Modifier.align(Alignment.BottomEnd).padding(end = pageHorizontal() + 4.dp, bottom = 18.dp))
    }

    toDelete?.let { schedule ->
        ConfirmDialog(
            title = "Delete this schedule?",
            body = "${schedule.title} will not record again. Recordings already made are kept.",
            confirm = "Delete",
            onDismiss = { toDelete = null },
            onConfirm = {
                vm.deleteSchedule(schedule.id)
                toDelete = null
            },
        )
    }
}

@Composable
private fun QuickTile(title: String, note: String, icon: androidx.compose.ui.graphics.vector.ImageVector, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val c = Vesper.colors
    Row(
        modifier.pressable(onClick, Shapes.tile, focusScale = 1.04f).glass(Shapes.tile).padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(Modifier.width(40.dp).glass(Shapes.field, strong = true).padding(vertical = 9.dp), contentAlignment = Alignment.Center) {
            VIcon(icon, null, tint = c.accent, size = 22.dp)
        }
        Column {
            VText(title, style = Vesper.type.bodyStrong, maxLines = 1)
            VText(note, style = Vesper.type.small, color = c.textDim, maxLines = 1)
        }
    }
}

@Composable
private fun ScheduleCard(schedule: Schedule, onClick: () -> Unit, onToggle: (Boolean) -> Unit, onDelete: () -> Unit, onRun: () -> Unit, onCopy: () -> Unit) {
    val c = Vesper.colors
    VCard(Modifier.fillMaxWidth().alpha(if (schedule.enabled) 1f else 0.62f), onClick = onClick, padding = 16.dp) {
        Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                VText(schedule.title, style = Vesper.type.heading, maxLines = 1)
                VText(
                    "${describeDays(schedule.days)} · ${schedule.startTime} · ${formatDuration(schedule.seconds)}",
                    style = Vesper.type.body,
                    color = c.textDim,
                    maxLines = 1,
                )
            }
            VSwitch(schedule.enabled, onToggle)
        }
        Row(Modifier.padding(top = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            when {
                !schedule.enabled -> VPill("Paused", Tone.Neutral)
                schedule.nextStart != null -> VPill("Next: ${formatMoment(schedule.nextStart)}", Tone.Accent)
                else -> VPill("Nothing coming up", Tone.Neutral)
            }
        }
        Row(Modifier.padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            VButton("Record now", onRun, kind = ButtonKind.Ghost, compact = true, icon = Ic.Record)
            VButton("Duplicate", onCopy, kind = ButtonKind.Ghost, compact = true, icon = Ic.Copy)
            Box(Modifier.weight(1f))
            VIconButton(Ic.Delete, "Delete ${schedule.title}", onDelete, tint = c.danger)
        }
    }
}
