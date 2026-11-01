package dev.aminegames125.vesper.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import dev.aminegames125.vesper.data.Channel
import dev.aminegames125.vesper.data.KEEP_CHOICES
import dev.aminegames125.vesper.data.NewSource
import dev.aminegames125.vesper.ui.kit.ButtonKind
import dev.aminegames125.vesper.ui.kit.ChoiceRow
import dev.aminegames125.vesper.ui.kit.Ic
import dev.aminegames125.vesper.ui.kit.SectionHeader
import dev.aminegames125.vesper.ui.kit.VButton
import dev.aminegames125.vesper.ui.kit.VChip
import dev.aminegames125.vesper.ui.kit.VDialog
import dev.aminegames125.vesper.ui.kit.VEmpty
import dev.aminegames125.vesper.ui.kit.VField
import dev.aminegames125.vesper.ui.kit.VFlow
import dev.aminegames125.vesper.ui.kit.VText
import dev.aminegames125.vesper.ui.kit.Vesper
import dev.aminegames125.vesper.ui.kit.gutter
import dev.aminegames125.vesper.ui.theme.LocalIsTv

/** Page padding: wider on a TV, where the edges of the screen can be cut off. */
@Composable
fun pagePadding(): PaddingValues = if (LocalIsTv.current) {
    PaddingValues(horizontal = 48.dp, vertical = 24.dp)
} else {
    PaddingValues(horizontal = 16.dp, vertical = 8.dp)
}

@Composable
fun pageHorizontal(): Dp = gutter()

@Composable
fun SectionTitle(text: String) = SectionHeader(text)

@Composable
fun EmptyState(
    title: String,
    body: String,
    modifier: Modifier = Modifier,
    icon: ImageVector = Ic.Record,
    action: (@Composable () -> Unit)? = null,
) = VEmpty(title, body, modifier, icon, action)

/** The lengths offered for "record now". 0 records until the person stops it. */
private val NOW_CHOICES = listOf(
    1800L to "30 minutes",
    3600L to "1 hour",
    7200L to "2 hours",
    10800L to "3 hours",
    0L to "Until I stop it",
)

@Composable
fun RecordNowDialog(channel: Channel, onDismiss: () -> Unit, onStart: (Long, Long?) -> Unit) {
    var seconds by remember { mutableStateOf(3600L) }
    var keep by remember { mutableStateOf<Long?>(null) }
    VDialog(
        onDismiss = onDismiss,
        title = "Record ${channel.name} now",
        actions = {
            VButton("Cancel", onDismiss, kind = ButtonKind.Ghost)
            VButton("Start recording", { onStart(seconds, keep) }, icon = Ic.Record)
        },
    ) {
        Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            NOW_CHOICES.forEach { (value, label) ->
                ChoiceRow(label, selected = seconds == value, onClick = { seconds = value })
            }
            SectionHeader("Delete after")
            VFlow {
                VChip("Usual", selected = keep == null, onClick = { keep = null })
                KEEP_CHOICES.forEach { (hours, label) ->
                    VChip(label, selected = keep == hours, onClick = { keep = hours })
                }
            }
        }
    }
}

@Composable
fun ConfirmDialog(title: String, body: String, confirm: String, onDismiss: () -> Unit, onConfirm: () -> Unit) {
    VDialog(
        onDismiss = onDismiss,
        title = title,
        actions = {
            VButton("Cancel", onDismiss, kind = ButtonKind.Ghost)
            VButton(confirm, onConfirm, kind = ButtonKind.Danger)
        },
    ) {
        VText(body, style = Vesper.type.body, color = Vesper.colors.textDim)
    }
}

@Composable
fun AddSourceDialog(busy: Boolean, onDismiss: () -> Unit, onAdd: (NewSource) -> Unit) {
    var name by remember { mutableStateOf("") }
    var kind by remember { mutableStateOf("m3u") }
    var url by remember { mutableStateOf("") }
    var username by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    val xtream = kind == "xtream"
    val ready = name.isNotBlank() && url.isNotBlank() && (!xtream || (username.isNotBlank() && password.isNotBlank()))
    VDialog(
        onDismiss = onDismiss,
        title = "Add a playlist",
        actions = {
            VButton("Cancel", onDismiss, kind = ButtonKind.Ghost)
            VButton(if (busy) "Checking…" else "Add", { onAdd(NewSource(name.trim(), kind, url.trim(), username.trim(), password)) }, enabled = ready && !busy)
        },
    ) {
        Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            VFlow {
                VChip("M3U link", selected = !xtream, onClick = { kind = "m3u" })
                VChip("Xtream login", selected = xtream, onClick = { kind = "xtream" })
            }
            VField(name, { name = it }, "Name", Modifier)
            VField(
                url,
                { url = it },
                if (xtream) "Server address" else "Playlist link",
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
            )
            if (xtream) {
                VField(username, { username = it }, "Username")
                VField(password, { password = it }, "Password", visualTransformation = PasswordVisualTransformation())
            }
            VText(
                "The server reads the playlist, so your provider login stays on the server.",
                style = Vesper.type.small,
                color = Vesper.colors.textFaint,
            )
        }
    }
}

/** The time of day of a moment, in the viewer's own format and zone: "21:30" or "9:30 PM". */
fun clockTime(epochSeconds: Long): String =
    java.time.format.DateTimeFormatter.ofLocalizedTime(java.time.format.FormatStyle.SHORT)
        .withZone(java.time.ZoneId.systemDefault())
        .format(java.time.Instant.ofEpochSecond(epochSeconds))

/** "Today", "Tomorrow" or a short weekday and date, for grouping and labels. */
fun dayLabel(epochSeconds: Long): String {
    val zone = java.time.ZoneId.systemDefault()
    val day = java.time.Instant.ofEpochSecond(epochSeconds).atZone(zone).toLocalDate()
    val today = java.time.LocalDate.now(zone)
    return when (day) {
        today -> "Today"
        today.plusDays(1) -> "Tomorrow"
        else -> java.time.format.DateTimeFormatter.ofPattern("EEE d MMM", java.util.Locale.getDefault()).format(day)
    }
}
