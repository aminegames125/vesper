package dev.aminegames125.vesper.ui.kit

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.semantics.Role
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalTime
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.time.temporal.WeekFields
import java.util.Locale

/**
 * A month you can move through with the arrows. Every day is a plain button, so a remote's arrow
 * keys walk the grid the same way a finger taps it.
 */
@Composable
fun DatePickerDialog(initial: LocalDate, onPick: (LocalDate) -> Unit, onDismiss: () -> Unit) {
    val c = Vesper.colors
    val locale = Locale.getDefault()
    var month by remember { mutableStateOf(YearMonth.from(initial)) }
    var chosen by remember { mutableStateOf(initial) }
    val today = remember { LocalDate.now() }
    val first = WeekFields.of(locale).firstDayOfWeek
    val days = remember(first) { List(7) { first.plus(it.toLong()) } }
    val leading = (month.atDay(1).dayOfWeek.value - first.value + 7) % 7

    VDialog(
        onDismiss = onDismiss,
        title = null,
        actions = {
            VButton("Today", { chosen = today; month = YearMonth.from(today) }, kind = ButtonKind.Ghost)
            VButton("Cancel", onDismiss, kind = ButtonKind.Soft)
            VButton("Done", { onPick(chosen) })
        },
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            VIconButton(Ic.Left, "Previous month", { month = month.minusMonths(1) }, style = IconStyle.Glass)
            VText(
                month.atDay(1).format(DateTimeFormatter.ofPattern("LLLL yyyy", locale)).replaceFirstChar { it.uppercase() },
                Modifier.weight(1f),
                style = Vesper.type.heading,
                textAlign = TextAlign.Center,
            )
            VIconButton(Ic.Right, "Next month", { month = month.plusMonths(1) }, style = IconStyle.Glass)
        }
        Row(Modifier.fillMaxWidth()) {
            days.forEach { day: DayOfWeek ->
                VText(
                    day.getDisplayName(TextStyle.NARROW, locale),
                    Modifier.weight(1f),
                    style = Vesper.type.label,
                    color = c.textFaint,
                    textAlign = TextAlign.Center,
                )
            }
        }
        val cells = leading + month.lengthOfMonth()
        val rows = (cells + 6) / 7
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            repeat(rows) { row ->
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    repeat(7) { col ->
                        val dayNumber = row * 7 + col - leading + 1
                        if (dayNumber < 1 || dayNumber > month.lengthOfMonth()) {
                            Box(Modifier.weight(1f).aspectRatio(1f))
                        } else {
                            val date = month.atDay(dayNumber)
                            val selected = date == chosen
                            Box(
                                Modifier
                                    .weight(1f)
                                    .aspectRatio(1f)
                                    .pressable({ chosen = date }, CircleShape, role = Role.Button, focusScale = 1.1f)
                                    .then(if (selected) Modifier.background(c.accent, CircleShape) else Modifier)
                                    .then(if (!selected && date == today) Modifier.border(1.5.dp, c.accent.copy(alpha = 0.6f), CircleShape) else Modifier),
                                contentAlignment = Alignment.Center,
                            ) {
                                VText(
                                    dayNumber.toString(),
                                    style = Vesper.type.bodyStrong,
                                    color = if (selected) c.onAccent else if (date.isBefore(today)) c.textFaint else c.text,
                                    maxLines = 1,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

/** Hours and minutes with a button above and below each, and quick picks for the quarter hours. */
@Composable
fun TimePickerDialog(initial: LocalTime, is24Hour: Boolean, onPick: (LocalTime) -> Unit, onDismiss: () -> Unit) {
    val c = Vesper.colors
    var hour by remember { mutableIntStateOf(initial.hour) }
    var minute by remember { mutableIntStateOf(initial.minute) }
    val shownHour = if (is24Hour) hour else (if (hour % 12 == 0) 12 else hour % 12)

    VDialog(
        onDismiss = onDismiss,
        title = null,
        actions = {
            VButton("Cancel", onDismiss, kind = ButtonKind.Soft)
            VButton("Done", { onPick(LocalTime.of(hour, minute)) })
        },
    ) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
            Stepper("%02d".format(shownHour), "hour", onUp = { hour = (hour + 1) % 24 }, onDown = { hour = (hour + 23) % 24 })
            VText(":", Modifier.padding(horizontal = 10.dp), style = Vesper.type.display.copy(fontSize = 44.sp), color = c.textFaint)
            Stepper("%02d".format(minute), "minute", onUp = { minute = (minute + 1) % 60 }, onDown = { minute = (minute + 59) % 60 })
            if (!is24Hour) {
                Column(Modifier.padding(start = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    VChip("AM", selected = hour < 12, onClick = { if (hour >= 12) hour -= 12 })
                    VChip("PM", selected = hour >= 12, onClick = { if (hour < 12) hour += 12 })
                }
            }
        }
        VFlow(Modifier.fillMaxWidth()) {
            listOf(0, 15, 30, 45).forEach { m ->
                VChip(":%02d".format(m), selected = minute == m, onClick = { minute = m })
            }
            VChip("+5", selected = false, onClick = { minute = (minute + 5) % 60 })
            VChip("−5", selected = false, onClick = { minute = (minute + 55) % 60 })
        }
    }
}

@Composable
private fun Stepper(digits: String, what: String, onUp: () -> Unit, onDown: () -> Unit) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        VIconButton(Ic.Up, "More $what", onUp, style = IconStyle.Glass)
        Box(Modifier.width(92.dp).glass(Shapes.field, strong = true).padding(vertical = 10.dp), contentAlignment = Alignment.Center) {
            VText(digits, style = Vesper.type.display.copy(fontSize = 44.sp), maxLines = 1)
        }
        VIconButton(Ic.Down, "Less $what", onDown, style = IconStyle.Glass)
    }
}
