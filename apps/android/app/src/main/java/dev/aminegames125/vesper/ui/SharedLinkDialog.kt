package dev.aminegames125.vesper.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import dev.aminegames125.vesper.data.Channel
import dev.aminegames125.vesper.data.readSharedLink
import dev.aminegames125.vesper.ui.kit.ButtonKind
import dev.aminegames125.vesper.ui.kit.Ic
import dev.aminegames125.vesper.ui.kit.VButton
import dev.aminegames125.vesper.ui.kit.VDialog
import dev.aminegames125.vesper.ui.kit.VIcon
import dev.aminegames125.vesper.ui.kit.VRow
import dev.aminegames125.vesper.ui.kit.VSpinner
import dev.aminegames125.vesper.ui.kit.VText
import dev.aminegames125.vesper.ui.kit.Vesper

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
    val c = Vesper.colors
    LaunchedEffect(url) {
        val read = readSharedLink(url)
        items = read
        if (read.size == 1) chosen = read.first()
    }
    VDialog(
        onDismiss = onDismiss,
        title = if ((items?.size ?: 0) > 1) "Pick a channel" else "Shared link",
        actions = {
            VButton("Cancel", onDismiss, kind = ButtonKind.Ghost)
            VButton("Cast to a TV", { chosen?.let(onCast) }, kind = ButtonKind.Soft, enabled = chosen != null, icon = Ic.Cast)
            VButton("Record", { chosen?.let(onRecord) }, enabled = chosen != null, icon = Ic.Record)
        },
    ) {
        val list = items
        when {
            list == null -> Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { VSpinner() }
            list.size == 1 -> {
                VText(list.first().name, style = Vesper.type.heading, maxLines = 2)
                VText(list.first().url, style = Vesper.type.small, color = c.textDim, maxLines = 2)
            }
            else -> LazyColumn(Modifier.heightIn(max = 360.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(list) { channel ->
                    VRow(
                        title = channel.name,
                        subtitle = channel.group.takeIf { it.isNotBlank() },
                        onClick = { chosen = channel },
                        trailing = if (chosen == channel) ({ VIcon(Ic.Check, "Selected", tint = c.accent) }) else null,
                    )
                }
            }
        }
    }
}
