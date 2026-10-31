@file:OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)

package dev.aminegames125.vesper.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.Saver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import dev.aminegames125.vesper.data.EVERY_DAY
import dev.aminegames125.vesper.data.NewSchedule
import dev.aminegames125.vesper.data.WEEKDAYS
import dev.aminegames125.vesper.data.WEEKEND
import dev.aminegames125.vesper.data.bit
import dev.aminegames125.vesper.ui.theme.LocalIsTv
import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.time.format.TextStyle
import java.util.Locale
import kotlinx.coroutines.launch

private val DateSaver = Saver<LocalDate, String>(save = { it.toString() }, restore = { LocalDate.parse(it) })
private val TimeSaver = Saver<LocalTime, String>(save = { it.toString() }, restore = { LocalTime.parse(it) })

private val REPEATS = listOf(0 to "Once", EVERY_DAY to "Every day", WEEKDAYS to "Weekdays", WEEKEND to "Weekends")
private val DURATIONS = listOf(15, 30, 45, 60, 90, 120, 180)
private val PADS = listOf(0, 1, 2, 5, 10)
private val KEEP_LAST = listOf<Long?>(null, 1, 3, 5, 10)
private val KEEPS = listOf<Long?>(null, 24, 24 * 7, 24 * 30)

private fun keepLabel(hours: Long?) = when (hours) {
    null -> "Until I delete it"
    24L -> "1 day"
    else -> "${hours / 24} days"
}

/** Whether a one-off recording would start in the past. */
internal fun isPast(date: LocalDate, time: LocalTime, zone: ZoneId, now: Instant = Instant.now()): Boolean =
    !LocalDateTime.of(date, time).atZone(zone).toInstant().isAfter(now)

/** Create a schedule for the channel the person just picked, or change an existing one. */
@Composable
fun ScheduleEditorScreen(vm: VesperViewModel, onBack: () -> Unit, onPickChannel: () -> Unit) {
    val editing = remember { vm.editing }
    val draft = remember { vm.draftChannel }
    val zone = remember { editing?.let { runCatching { ZoneId.of(it.tz) }.getOrNull() } ?: ZoneId.systemDefault() }
    val scope = rememberCoroutineScope()
    val busy by vm.busy.collectAsState()

    var title by rememberSaveable { mutableStateOf(editing?.title ?: draft?.name.orEmpty()) }
    var channelName by rememberSaveable { mutableStateOf(editing?.channelName ?: draft?.name.orEmpty()) }
    var url by rememberSaveable { mutableStateOf(editing?.url ?: draft?.url.orEmpty()) }
    var date by rememberSaveable(stateSaver = DateSaver) {
        mutableStateOf(
            editing?.let { LocalDate.parse(it.startDate) }
                ?: LocalDate.now(zone).let { today -> if (LocalTime.now(zone).hour == 23) today.plusDays(1) else today },
        )
    }
    var time by rememberSaveable(stateSaver = TimeSaver) {
        mutableStateOf(editing?.let { LocalTime.parse(it.startTime) } ?: LocalTime.now(zone).plusHours(1).withMinute(0).withSecond(0).withNano(0))
    }
    var minutes by rememberSaveable { mutableIntStateOf(((editing?.seconds ?: 3600L) / 60).toInt()) }
    var days by rememberSaveable { mutableIntStateOf(editing?.days ?: 0) }
    var custom by rememberSaveable { mutableStateOf(editing != null && editing.days !in REPEATS.map { it.first }) }
    var padBefore by rememberSaveable { mutableIntStateOf(((editing?.padBefore ?: 60L) / 60).toInt()) }
    var padAfter by rememberSaveable { mutableIntStateOf(((editing?.padAfter ?: 120L) / 60).toInt()) }
    var keep by rememberSaveable { mutableStateOf(editing?.keepHours) }
    var keepLast by rememberSaveable { mutableStateOf(editing?.keepLast) }
    var error by remember { mutableStateOf<String?>(null) }
    var warnings by remember { mutableStateOf<List<String>?>(null) }

    // Back from the channel list with a new choice: put it into this form, not into a new one.
    val picked = vm.picked
    LaunchedEffect(picked) {
        picked?.let {
            if (title.isBlank() || title == channelName) title = it.name
            channelName = it.name
            url = it.url
            vm.picked = null
        }
    }

    fun save() {
        error = when {
            title.isBlank() -> "Give the schedule a title."
            url.isBlank() -> "Pick a channel."
            custom && days == 0 -> "Pick at least one day."
            minutes < 1 -> "The recording must be at least a minute long."
            days == 0 && isPast(date, time, zone) -> "That time has already passed."
            else -> null
        }
        if (error != null) return
        val body = NewSchedule(
            title = title.trim(),
            channelName = channelName,
            url = url,
            tz = zone.id,
            startTime = time.format(DateTimeFormatter.ofPattern("HH:mm")),
            seconds = minutes * 60L,
            days = days,
            startDate = date.toString(),
            padBefore = padBefore * 60L,
            padAfter = padAfter * 60L,
            keepHours = keep,
            keepLast = keepLast,
            enabled = editing?.enabled ?: true,
        )
        scope.launch {
            val notes = vm.saveSchedule(editing?.id, body) ?: return@launch
            if (notes.isEmpty()) onBack() else warnings = notes
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (editing == null) "New schedule" else "Edit schedule") },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back") }
                },
            )
        },
    ) { padding ->
        Column(
            Modifier.padding(padding).verticalScroll(rememberScrollState()).padding(horizontal = pageHorizontal(), vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            OutlinedTextField(title, { title = it }, label = { Text("Title") }, singleLine = true, modifier = Modifier.fillMaxWidth())

            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Column(Modifier.weight(1f)) {
                    Text("Channel", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(channelName.ifBlank { "None picked" }, style = MaterialTheme.typography.bodyLarge)
                }
                OutlinedButton(
                    onClick = {
                        vm.returningToEditor = true
                        onPickChannel()
                    },
                ) { Text("Change") }
            }

            Label(if (days == 0) "Date" else "Starting")
            DateField(date) { date = it }
            Label("Start time (${zone.getDisplayName(TextStyle.SHORT, Locale.getDefault())})")
            TimeField(time) { time = it }

            Label("Length")
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = { minutes = (minutes - 5).coerceAtLeast(1) }) { Text("−5") }
                Text(dev.aminegames125.vesper.data.formatDuration(minutes * 60L), style = MaterialTheme.typography.titleMedium)
                OutlinedButton(onClick = { minutes = (minutes + 5).coerceAtMost(24 * 60) }) { Text("+5") }
            }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                DURATIONS.forEach { m ->
                    FilterChip(selected = minutes == m, onClick = { minutes = m }, label = { Text(dev.aminegames125.vesper.data.formatDuration(m * 60L)) })
                }
            }

            Label("Repeat")
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                REPEATS.forEach { (mask, label) ->
                    FilterChip(selected = !custom && days == mask, onClick = { custom = false; days = mask }, label = { Text(label) })
                }
                FilterChip(selected = custom, onClick = { custom = true; if (days == 0) days = bit(DayOfWeek.MONDAY) }, label = { Text("Custom") })
            }
            if (custom) {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    DayOfWeek.entries.forEach { day ->
                        FilterChip(
                            selected = days and bit(day) != 0,
                            onClick = { days = days xor bit(day) },
                            label = { Text(day.getDisplayName(TextStyle.SHORT, Locale.getDefault())) },
                        )
                    }
                }
            }

            Label("Start early")
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                PADS.forEach { m -> FilterChip(selected = padBefore == m, onClick = { padBefore = m }, label = { Text(if (m == 0) "Exactly" else "$m min") }) }
            }
            Label("Stop late")
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                PADS.forEach { m -> FilterChip(selected = padAfter == m, onClick = { padAfter = m }, label = { Text(if (m == 0) "Exactly" else "$m min") }) }
            }

            Label("Keep recordings")
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                KEEPS.forEach { h -> FilterChip(selected = keep == h, onClick = { keep = h }, label = { Text(keepLabel(h)) }) }
            }

            Label("Keep only the newest")
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                KEEP_LAST.forEach { n ->
                    FilterChip(selected = keepLast == n, onClick = { keepLast = n }, label = { Text(if (n == null) "All of them" else "$n") })
                }
            }

            error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            Button(onClick = ::save, enabled = !busy, modifier = Modifier.fillMaxWidth().padding(top = 8.dp, bottom = 24.dp)) {
                Text(if (busy) "Saving…" else "Save schedule")
            }
        }
    }

    warnings?.let { notes ->
        AlertDialog(
            onDismissRequest = onBack,
            title = { Text("Saved, but check this") },
            text = { Column(verticalArrangement = Arrangement.spacedBy(8.dp)) { notes.forEach { Text(it) } } },
            confirmButton = { Button(onClick = onBack) { Text("OK") } },
        )
    }
}

@Composable
private fun Label(text: String) {
    Text(text, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
}

/** The system date picker on a phone; steppers on a TV, where a remote cannot drive a calendar well. */
@Composable
private fun DateField(date: LocalDate, onChange: (LocalDate) -> Unit) {
    val formatted = DateTimeFormatter.ofLocalizedDate(FormatStyle.FULL).format(date)
    if (LocalIsTv.current) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = { onChange(date.minusDays(1)) }) { Text("−1 day") }
            Text(formatted, style = MaterialTheme.typography.titleMedium)
            OutlinedButton(onClick = { onChange(date.plusDays(1)) }) { Text("+1 day") }
        }
        return
    }
    var open by remember { mutableStateOf(false) }
    OutlinedButton(onClick = { open = true }, modifier = Modifier.fillMaxWidth()) { Text(formatted) }
    if (open) {
        val state = rememberDatePickerState(initialSelectedDateMillis = date.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli())
        DatePickerDialog(
            onDismissRequest = { open = false },
            confirmButton = {
                TextButton(onClick = {
                    state.selectedDateMillis?.let { onChange(Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate()) }
                    open = false
                }) { Text("OK") }
            },
            dismissButton = { TextButton(onClick = { open = false }) { Text("Cancel") } },
        ) { DatePicker(state) }
    }
}

@Composable
private fun TimeField(time: LocalTime, onChange: (LocalTime) -> Unit) {
    val formatted = time.format(DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT))
    if (LocalIsTv.current) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = { onChange(time.minusHours(1)) }) { Text("−1 h") }
            OutlinedButton(onClick = { onChange(time.minusMinutes(5)) }) { Text("−5 min") }
            Text(formatted, style = MaterialTheme.typography.titleMedium)
            OutlinedButton(onClick = { onChange(time.plusMinutes(5)) }) { Text("+5 min") }
            OutlinedButton(onClick = { onChange(time.plusHours(1)) }) { Text("+1 h") }
        }
        return
    }
    var open by remember { mutableStateOf(false) }
    OutlinedButton(onClick = { open = true }, modifier = Modifier.fillMaxWidth()) { Text(formatted) }
    if (open) {
        val state = rememberTimePickerState(initialHour = time.hour, initialMinute = time.minute, is24Hour = android.text.format.DateFormat.is24HourFormat(androidx.compose.ui.platform.LocalContext.current))
        AlertDialog(
            onDismissRequest = { open = false },
            confirmButton = {
                TextButton(onClick = {
                    onChange(LocalTime.of(state.hour, state.minute))
                    open = false
                }) { Text("OK") }
            },
            dismissButton = { TextButton(onClick = { open = false }) { Text("Cancel") } },
            text = { TimePicker(state) },
        )
    }
}
