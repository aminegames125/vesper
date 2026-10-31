package dev.aminegames125.vesper.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import dev.aminegames125.vesper.data.Channel
import dev.aminegames125.vesper.data.readSharedLink

/**
 * A link shared into Vesper, or opened with it: a single stream, or a playlist of channels. The
 * person picks one (if there are several) and chooses to cast it to a TV or to record it.
 */
@Composable
fun SharedLinkDialog(
    url: String,
    onCast: (Channel) -> Unit,
    onRecord: (Channel) -> Unit,
    onDismiss: () -> Unit,
) {
    var items by remember(url) { mutableStateOf<List<Channel>?>(null) }
    var chosen by remember(url) { mutableStateOf<Channel?>(null) }
    LaunchedEffect(url) {
        val read = readSharedLink(url)
        items = read
        if (read.size == 1) chosen = read.first()
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if ((items?.size ?: 0) > 1) "Pick a channel" else "Shared link") },
        text = {
            val list = items
            when {
                list == null -> CircularProgressIndicator()
                list.size == 1 -> Column {
                    Text(list.first().name, style = MaterialTheme.typography.titleSmall)
                    Text(
                        list.first().url,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 2,
                        modifier = Modifier.padding(top = 4.dp),
                    )
                }
                else -> LazyColumn(Modifier.heightIn(max = 360.dp)) {
                    items(list) { channel ->
                        ListItem(
                            headlineContent = { Text(channel.name, maxLines = 1) },
                            supportingContent = if (channel.group.isNotBlank()) ({ Text(channel.group, maxLines = 1) }) else null,
                            trailingContent = if (chosen == channel) ({ Icon(Icons.Filled.Check, contentDescription = "Selected") }) else null,
                            modifier = Modifier.clickable { chosen = channel },
                        )
                    }
                }
            }
        },
        confirmButton = {
            Column {
                TextButton(onClick = { chosen?.let(onCast) }, enabled = chosen != null) { Text("Cast to a TV") }
                TextButton(onClick = { chosen?.let(onRecord) }, enabled = chosen != null) { Text("Record") }
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}
