package dev.aminegames125.vesper.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import dev.aminegames125.vesper.ui.kit.Ic
import dev.aminegames125.vesper.ui.kit.Shapes
import dev.aminegames125.vesper.ui.kit.VIcon
import dev.aminegames125.vesper.ui.kit.VText
import dev.aminegames125.vesper.ui.kit.VTopBar
import dev.aminegames125.vesper.ui.kit.Vesper
import dev.aminegames125.vesper.ui.kit.glass
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle

private val DAY = DateTimeFormatter.ofLocalizedDate(FormatStyle.FULL)
private val HOUR = DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT)

/** The next seven days of recordings grouped by day, with the ones that overlap too much marked. */
@Composable
fun CalendarScreen(vm: VesperViewModel, onBack: () -> Unit) {
    val items by vm.calendar.collectAsState()
    LaunchedEffect(Unit) { vm.loadCalendar() }
    val zone = ZoneId.systemDefault()
    val byDay = items.groupBy { Instant.ofEpochSecond(it.startAt).atZone(zone).toLocalDate() }.toSortedMap()
    val c = Vesper.colors

    Column(Modifier.fillMaxSize()) {
        VTopBar("This week", onBack)
        if (items.isEmpty()) {
            EmptyState("Nothing planned this week", "Schedule a recording or pick a programme from the guide.", icon = Ic.Calendar)
        } else {
            LazyColumn(
                Modifier.fillMaxSize(),
                contentPadding = PaddingValues(start = pageHorizontal(), end = pageHorizontal(), bottom = 24.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                byDay.forEach { (day, entries) ->
                    item(key = day.toString()) { SectionTitle(DAY.format(day)) }
                    items(entries, key = { it.id }) { entry ->
                        val start = Instant.ofEpochSecond(entry.startAt).atZone(zone)
                        val end = Instant.ofEpochSecond(entry.endAt).atZone(zone)
                        val tone = if (entry.clash) c.danger else c.accent
                        Row(
                            Modifier.fillMaxWidth().height(IntrinsicSize.Min).glass(Shapes.tile),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Box(Modifier.width(5.dp).fillMaxHeight().background(tone))
                            Column(Modifier.width(76.dp).padding(start = 12.dp)) {
                                VText(HOUR.format(start), style = Vesper.type.bodyStrong, color = tone, maxLines = 1)
                                VText(HOUR.format(end), style = Vesper.type.small, color = c.textFaint, maxLines = 1)
                            }
                            Column(Modifier.weight(1f).padding(vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                VText(entry.title, style = Vesper.type.bodyStrong, maxLines = 1)
                                VText(
                                    entry.channelName + if (entry.clash) " · overlaps another recording" else "",
                                    style = Vesper.type.small,
                                    color = if (entry.clash) c.danger else c.textDim,
                                    maxLines = 2,
                                )
                            }
                            if (entry.clash) {
                                VIcon(Ic.Warning, "Overlaps another recording", Modifier.padding(horizontal = 14.dp), tint = c.danger)
                            }
                        }
                    }
                }
            }
        }
    }
}
