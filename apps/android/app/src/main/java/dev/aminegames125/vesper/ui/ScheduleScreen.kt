@file:OptIn(ExperimentalMaterial3Api::class)

package dev.aminegames125.vesper.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.TextButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import dev.aminegames125.vesper.data.Schedule
import dev.aminegames125.vesper.data.describeDays
import dev.aminegames125.vesper.data.formatDuration
import dev.aminegames125.vesper.data.formatMoment
import dev.aminegames125.vesper.data.formatUntil

/** The next recordings that will happen, and the schedules that make them. */
@Composable
fun ScheduleScreen(vm: VesperViewModel, onNew: () -> Unit, onEdit: (Schedule) -> Unit) {
    val schedules by vm.schedules.collectAsState()
    val recordings by vm.recordings.collectAsState()
    var toDelete by remember { mutableStateOf<Schedule?>(null) }

    val upcoming = remember(recordings) { recordings.filter { it.isScheduled }.sortedBy { it.startAt }.take(6) }

    Scaffold(
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = onNew,
                icon = { Icon(Icons.Filled.Add, contentDescription = null) },
                text = { Text("New schedule") },
            )
        },
    ) { padding ->
        if (schedules.isEmpty() && upcoming.isEmpty()) {
            EmptyState(
                "No schedules yet",
                "Pick a channel and a time, for example 11:00 to 11:30, and Vesper records it for you.",
                Modifier.padding(padding),
            )
        } else {
            LazyColumn(
                Modifier.padding(padding),
                contentPadding = PaddingValues(start = pageHorizontal(), end = pageHorizontal(), top = 8.dp, bottom = 96.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                if (upcoming.isNotEmpty()) {
                    item { SectionTitle("Coming up") }
                    items(upcoming, key = { "up-${it.id}" }) { recording ->
                        Column(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                            Text(recording.title, style = MaterialTheme.typography.titleSmall, maxLines = 1)
                            Text(
                                "${formatMoment(recording.startAt)} · ${formatUntil(recording.startAt)}",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
                if (schedules.isNotEmpty()) {
                    item {
                        val allPaused = schedules.none { it.enabled }
                        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                            Box(Modifier.weight(1f)) { SectionTitle("Schedules") }
                            TextButton(onClick = { vm.pauseAll(!allPaused) }) { Text(if (allPaused) "Resume all" else "Pause all") }
                        }
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
private fun ScheduleCard(schedule: Schedule, onClick: () -> Unit, onToggle: (Boolean) -> Unit, onDelete: () -> Unit, onRun: () -> Unit, onCopy: () -> Unit) {
    Card(Modifier.fillMaxWidth().clickable(onClick = onClick)) {
        Row(Modifier.padding(start = 16.dp, top = 12.dp, bottom = 12.dp, end = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(schedule.title, style = MaterialTheme.typography.titleMedium, maxLines = 1)
                Text(
                    "${describeDays(schedule.days)} · ${schedule.startTime} · ${formatDuration(schedule.seconds)}",
                    style = MaterialTheme.typography.bodyMedium,
                )
                Text(
                    when {
                        !schedule.enabled -> "Paused"
                        schedule.nextStart != null -> "Next: ${formatMoment(schedule.nextStart)}"
                        else -> "Nothing coming up"
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    TextButton(onClick = onRun) { Text("Record now") }
                    TextButton(onClick = onCopy) { Text("Duplicate") }
                }
            }
            Switch(checked = schedule.enabled, onCheckedChange = onToggle)
            IconButton(onClick = onDelete) { Icon(Icons.Filled.Delete, contentDescription = "Delete ${schedule.title}") }
        }
    }
}
