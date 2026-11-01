package dev.aminegames125.vesper.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import dev.aminegames125.vesper.ui.kit.ButtonKind
import dev.aminegames125.vesper.ui.kit.DatePickerDialog
import dev.aminegames125.vesper.ui.kit.Ic
import dev.aminegames125.vesper.ui.kit.Shapes
import dev.aminegames125.vesper.ui.kit.TimePickerDialog
import dev.aminegames125.vesper.ui.kit.VButton
import dev.aminegames125.vesper.ui.kit.VCard
import dev.aminegames125.vesper.ui.kit.VChip
import dev.aminegames125.vesper.ui.kit.VDialog
import dev.aminegames125.vesper.ui.kit.VField
import dev.aminegames125.vesper.ui.kit.VFlow
import dev.aminegames125.vesper.ui.kit.VIcon
import dev.aminegames125.vesper.ui.kit.VIconButton
import dev.aminegames125.vesper.ui.kit.VSwitch
import dev.aminegames125.vesper.ui.kit.VText
import dev.aminegames125.vesper.ui.kit.VTopBar
import dev.aminegames125.vesper.ui.kit.Vesper
import dev.aminegames125.vesper.ui.kit.IconStyle
import dev.aminegames125.vesper.ui.kit.glass
import dev.aminegames125.vesper.ui.kit.pressable
import dev.aminegames125.vesper.data.EVERY_DAY
import dev.aminegames125.vesper.data.NewSchedule
import dev.aminegames125.vesper.data.WEEKDAYS
import dev.aminegames125.vesper.data.WEEKEND
import dev.aminegames125.vesper.data.bit
import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId
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
/** null follows the server's default deletion timer; 0 keeps recordings until they are deleted. */
private val KEEPS = listOf<Long?>(null, 24, 24 * 7, 24 * 30, 0)

private fun keepLabel(hours: Long?, serverDefault: Long?) = when (hours) {
    null -> when (serverDefault) {
        null, 0L -> "Default"
        24L -> "Default (1 day)"
        else -> "Default (${serverDefault / 24} days)"
    }
    0L -> "Forever"
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
    var tag by rememberSaveable { mutableStateOf(editing?.tag ?: "") }
    var backup by rememberSaveable { mutableStateOf(editing?.backupUrl ?: draft?.alt?.firstOrNull().orEmpty()) }
    var epgId by rememberSaveable { mutableStateOf(editing?.epgId ?: draft?.id.orEmpty()) }
    var lowest by rememberSaveable { mutableStateOf(editing?.quality == "lowest") }
    var followGuide by rememberSaveable { mutableStateOf(editing?.followGuide ?: false) }
    val status by vm.status.collectAsState()
    LaunchedEffect(Unit) { vm.loadStatus() }
    var error by remember { mutableStateOf<String?>(null) }
    var warnings by remember { mutableStateOf<List<String>?>(null) }

    // Back from the channel list with a new choice: put it into this form, not into a new one.
    val picked = vm.picked
    LaunchedEffect(picked) {
        picked?.let {
            if (title.isBlank() || title == channelName) title = it.name
            channelName = it.name
            url = it.url
            backup = it.alt.firstOrNull().orEmpty()
            epgId = it.id
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
            endDate = editing?.endDate,
            webhookUrl = editing?.webhookUrl,
            backupUrl = backup.trim().ifEmpty { null },
            quality = if (lowest) "lowest" else "best",
            tag = tag.trim(),
            epgId = epgId,
            followGuide = followGuide && epgId.isNotBlank(),
        )
        scope.launch {
            val notes = vm.saveSchedule(editing?.id, body) ?: return@launch
            if (notes.isEmpty()) onBack() else warnings = notes
        }
    }

    Column(Modifier.fillMaxSize()) {
        VTopBar(if (editing == null) "New schedule" else "Edit schedule", onBack)
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = pageHorizontal(), vertical = 4.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            VCard(Modifier.fillMaxWidth()) {
                Label("What", first = true)
                VField(title, { title = it }, "Title", Modifier.fillMaxWidth())
                Row(
                    Modifier.padding(top = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Column(Modifier.weight(1f)) {
                        VText("Channel", style = Vesper.type.small, color = Vesper.colors.textDim)
                        VText(channelName.ifBlank { "None picked" }, style = Vesper.type.heading, maxLines = 1)
                    }
                    VButton(
                        "Change",
                        {
                            vm.returningToEditor = true
                            onPickChannel()
                        },
                        kind = ButtonKind.Soft,
                        compact = true,
                        icon = Ic.Tv,
                    )
                }
            }

            VCard(Modifier.fillMaxWidth()) {
                Label(if (days == 0) "Date" else "Starting", first = true)
                DateField(date) { date = it }
                Label("Start time (${zone.getDisplayName(TextStyle.SHORT, Locale.getDefault())})")
                TimeField(time) { time = it }

                Label("Length")
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    VIconButton(Ic.Down, "5 minutes shorter", { minutes = (minutes - 5).coerceAtLeast(1) }, style = IconStyle.Glass)
                    VText(
                        dev.aminegames125.vesper.data.formatDuration(minutes * 60L),
                        Modifier.weight(1f),
                        style = Vesper.type.numeral,
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                        maxLines = 1,
                    )
                    VIconButton(Ic.Up, "5 minutes longer", { minutes = (minutes + 5).coerceAtMost(24 * 60) }, style = IconStyle.Glass)
                }
                VFlow(Modifier.padding(top = 10.dp)) {
                    DURATIONS.forEach { m ->
                        VChip(dev.aminegames125.vesper.data.formatDuration(m * 60L), selected = minutes == m, onClick = { minutes = m })
                    }
                }

                Label("Repeat")
                VFlow {
                    REPEATS.forEach { (mask, label) ->
                        VChip(label, selected = !custom && days == mask, onClick = { custom = false; days = mask })
                    }
                    VChip("Custom", selected = custom, onClick = { custom = true; if (days == 0) days = bit(DayOfWeek.MONDAY) })
                }
                if (custom) {
                    VFlow(Modifier.padding(top = 8.dp)) {
                        DayOfWeek.entries.forEach { day ->
                            VChip(
                                day.getDisplayName(TextStyle.SHORT, Locale.getDefault()),
                                selected = days and bit(day) != 0,
                                onClick = { days = days xor bit(day) },
                            )
                        }
                    }
                }
            }

            VCard(Modifier.fillMaxWidth()) {
                Label("Start early", first = true)
                VFlow {
                    PADS.forEach { m -> VChip(if (m == 0) "Exactly" else "$m min", selected = padBefore == m, onClick = { padBefore = m }) }
                }
                Label("Stop late")
                VFlow {
                    PADS.forEach { m -> VChip(if (m == 0) "Exactly" else "$m min", selected = padAfter == m, onClick = { padAfter = m }) }
                }
                if (epgId.isNotBlank()) {
                    Row(
                        Modifier.padding(top = 16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Column(Modifier.weight(1f)) {
                            VText("Follow the guide", style = Vesper.type.bodyStrong)
                            VText(
                                "If the programme runs over, keep recording until the guide says it ended.",
                                style = Vesper.type.small,
                                color = Vesper.colors.textDim,
                            )
                        }
                        VSwitch(followGuide, { followGuide = it })
                    }
                }
            }

            VCard(Modifier.fillMaxWidth()) {
                Label("Delete recordings after", first = true)
                VFlow {
                    KEEPS.forEach { h ->
                        VChip(keepLabel(h, status?.defaultKeepHours), selected = keep == h, onClick = { keep = h })
                    }
                }
                VText(
                    "You can change this later for each recording.",
                    style = Vesper.type.small,
                    color = Vesper.colors.textFaint,
                    modifier = Modifier.padding(top = 8.dp),
                )
                Label("Keep only the newest")
                VFlow {
                    KEEP_LAST.forEach { n ->
                        VChip(if (n == null) "All of them" else "$n", selected = keepLast == n, onClick = { keepLast = n })
                    }
                }
            }

            VCard(Modifier.fillMaxWidth()) {
                Label("Picture quality", first = true)
                VFlow {
                    VChip("Best", selected = !lowest, onClick = { lowest = false })
                    VChip("Smaller files", selected = lowest, onClick = { lowest = true })
                }
                Column(Modifier.padding(top = 16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    VField(tag, { tag = it }, "Folder (optional)", Modifier.fillMaxWidth())
                    VField(backup, { backup = it }, "Backup address (optional)", Modifier.fillMaxWidth(), hint = "Used if the channel keeps failing.")
                }
            }

            error?.let { VText(it, color = Vesper.colors.danger, style = Vesper.type.bodyStrong) }
            VButton(
                if (busy) "Saving…" else "Save schedule",
                ::save,
                Modifier.fillMaxWidth().padding(top = 4.dp, bottom = 24.dp),
                enabled = !busy,
                icon = Ic.Check,
            )
        }
    }

    warnings?.let { notes ->
        VDialog(
            onDismiss = onBack,
            title = "Saved, but check this",
            actions = { VButton("OK", onBack) },
        ) {
            notes.forEach { VText(it, style = Vesper.type.body, color = Vesper.colors.textDim) }
        }
    }
}

@Composable
private fun Label(text: String, first: Boolean = false) {
    VText(
        text.uppercase(),
        Modifier.padding(top = if (first) 0.dp else 18.dp, bottom = 8.dp),
        style = Vesper.type.label,
        color = Vesper.colors.textFaint,
    )
}

/** A big tappable field that shows the chosen value and opens the picker. */
@Composable
private fun PickerField(value: String, icon: androidx.compose.ui.graphics.vector.ImageVector, onClick: () -> Unit) {
    val c = Vesper.colors
    Row(
        Modifier
            .fillMaxWidth()
            .pressable(onClick, Shapes.field, focusScale = 1.02f)
            .glass(Shapes.field, strong = true)
            .padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        VIcon(icon, null, tint = c.accent, size = 22.dp)
        VText(value, Modifier.weight(1f), style = Vesper.type.heading, maxLines = 1)
        VIcon(Ic.Right, null, tint = c.textFaint, size = 18.dp)
    }
}

@Composable
private fun DateField(date: LocalDate, onChange: (LocalDate) -> Unit) {
    val formatted = DateTimeFormatter.ofLocalizedDate(FormatStyle.FULL).format(date)
    var open by remember { mutableStateOf(false) }
    PickerField(formatted, Ic.Calendar) { open = true }
    if (open) {
        DatePickerDialog(
            initial = date,
            onPick = {
                onChange(it)
                open = false
            },
            onDismiss = { open = false },
        )
    }
}

@Composable
private fun TimeField(time: LocalTime, onChange: (LocalTime) -> Unit) {
    val formatted = time.format(DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT))
    var open by remember { mutableStateOf(false) }
    PickerField(formatted, Ic.Clock) { open = true }
    if (open) {
        TimePickerDialog(
            initial = time,
            is24Hour = android.text.format.DateFormat.is24HourFormat(LocalContext.current),
            onPick = {
                onChange(it)
                open = false
            },
            onDismiss = { open = false },
        )
    }
}
