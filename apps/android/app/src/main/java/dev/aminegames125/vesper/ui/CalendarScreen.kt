@file:OptIn(ExperimentalMaterial3Api::class)

package dev.aminegames125.vesper.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale

private val DAY = DateTimeFormatter.ofLocalizedDate(FormatStyle.FULL)
private val HOUR = DateTimeFormatter.ofPattern("HH:mm", Locale.getDefault())

/** The next seven days of recordings grouped by day, with the ones that overlap too much marked. */
@Composable
fun CalendarScreen(vm: VesperViewModel, onBack: () -> Unit) {
    val items by vm.calendar.collectAsState()
    LaunchedEffect(Unit) { vm.loadCalendar() }
    val zone = ZoneId.systemDefault()
    val byDay = items.groupBy { Instant.ofEpochSecond(it.startAt).atZone(zone).toLocalDate() }.toSortedMap()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("This week") },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back") }
                },
            )
        },
    ) { padding ->
        if (items.isEmpty()) {
            EmptyState("Nothing planned this week", "Schedule a recording or pick a programme from the guide.", Modifier.padding(padding))
        } else {
            LazyColumn(
                Modifier.padding(padding),
                contentPadding = PaddingValues(start = pageHorizontal(), end = pageHorizontal(), bottom = 24.dp),
                verticalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                byDay.forEach { (day, entries) ->
                    item(key = day.toString()) { SectionTitle(DAY.format(day)) }
                    items(entries, key = { it.id }) { entry ->
                        val start = Instant.ofEpochSecond(entry.startAt).atZone(zone)
                        val end = Instant.ofEpochSecond(entry.endAt).atZone(zone)
                        ListItem(
                            headlineContent = { Text(entry.title, maxLines = 1) },
                            supportingContent = {
                                Text(
                                    "${HOUR.format(start)} to ${HOUR.format(end)} · ${entry.channelName}" +
                                        if (entry.clash) " · overlaps another recording" else "",
                                    maxLines = 2,
                                    color = if (entry.clash) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            },
                            trailingContent = if (entry.clash) {
                                { Icon(Icons.Filled.Warning, contentDescription = "Overlaps another recording", tint = MaterialTheme.colorScheme.error) }
                            } else {
                                null
                            },
                        )
                    }
                }
            }
        }
    }
}
