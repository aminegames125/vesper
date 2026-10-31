package dev.aminegames125.vesper.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import dev.aminegames125.vesper.data.KEEP_CHOICES
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import dev.aminegames125.vesper.data.Channel
import dev.aminegames125.vesper.data.NewSource
import dev.aminegames125.vesper.ui.theme.LocalIsTv

/** Page padding: wider on a TV, where the edges of the screen can be cut off. */
@Composable
fun pagePadding(): PaddingValues = if (LocalIsTv.current) {
    PaddingValues(horizontal = 48.dp, vertical = 24.dp)
} else {
    PaddingValues(horizontal = 16.dp, vertical = 8.dp)
}

@Composable
fun pageHorizontal() = if (LocalIsTv.current) 48.dp else 16.dp

@Composable
fun SectionTitle(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.titleMedium,
        color = MaterialTheme.colorScheme.primary,
        modifier = Modifier.padding(top = 16.dp, bottom = 4.dp),
    )
}

@Composable
fun EmptyState(title: String, body: String, modifier: Modifier = Modifier, action: (@Composable () -> Unit)? = null) {
    Column(
        modifier.fillMaxWidth().padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(title, style = MaterialTheme.typography.titleLarge)
        Text(body, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        action?.invoke()
    }
}

/** The lengths offered for "record now". 0 records until the person stops it. */
private val NOW_CHOICES = listOf(
    1800L to "30 minutes",
    3600L to "1 hour",
    7200L to "2 hours",
    10800L to "3 hours",
    0L to "Until I stop it",
)

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun RecordNowDialog(channel: Channel, onDismiss: () -> Unit, onStart: (Long, Long?) -> Unit) {
    var seconds by remember { mutableStateOf(3600L) }
    var keep by remember { mutableStateOf<Long?>(null) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Record ${channel.name} now") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                NOW_CHOICES.forEach { (value, label) ->
                    Row(
                        Modifier.fillMaxWidth().selectable(selected = seconds == value, role = Role.RadioButton) { seconds = value },
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        RadioButton(selected = seconds == value, onClick = null)
                        Text(label, Modifier.padding(start = 12.dp, top = 12.dp, bottom = 12.dp))
                    }
                }
                Text("Delete after", style = MaterialTheme.typography.labelLarge, modifier = Modifier.padding(top = 8.dp, bottom = 4.dp))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(selected = keep == null, onClick = { keep = null }, label = { Text("Usual") })
                    KEEP_CHOICES.forEach { (hours, label) ->
                        FilterChip(selected = keep == hours, onClick = { keep = hours }, label = { Text(label) })
                    }
                }
            }
        },
        confirmButton = { Button(onClick = { onStart(seconds, keep) }) { Text("Start recording") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@Composable
fun ConfirmDialog(title: String, body: String, confirm: String, onDismiss: () -> Unit, onConfirm: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = { Text(body) },
        confirmButton = { Button(onClick = onConfirm) { Text(confirm) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
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
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add a playlist") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(selected = !xtream, onClick = { kind = "m3u" }, label = { Text("M3U link") })
                    FilterChip(selected = xtream, onClick = { kind = "xtream" }, label = { Text("Xtream login") })
                }
                OutlinedTextField(name, { name = it }, label = { Text("Name") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(
                    url,
                    { url = it },
                    label = { Text(if (xtream) "Server address" else "Playlist link") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                    modifier = Modifier.fillMaxWidth(),
                )
                if (xtream) {
                    OutlinedTextField(username, { username = it }, label = { Text("Username") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(
                        password,
                        { password = it },
                        label = { Text("Password") },
                        singleLine = true,
                        visualTransformation = PasswordVisualTransformation(),
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                Text(
                    "The server reads the playlist, so your provider login stays on the server.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        },
        confirmButton = {
            Button(
                enabled = ready && !busy,
                onClick = { onAdd(NewSource(name.trim(), kind, url.trim(), username.trim(), password)) },
            ) { Text(if (busy) "Checking…" else "Add") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}
