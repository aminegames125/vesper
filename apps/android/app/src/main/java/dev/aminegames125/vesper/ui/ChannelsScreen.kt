@file:OptIn(ExperimentalMaterial3Api::class)

package dev.aminegames125.vesper.ui

import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.StarBorder
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import dev.aminegames125.vesper.data.Channel
import dev.aminegames125.vesper.data.GuideHit
import dev.aminegames125.vesper.data.formatMoment

/**
 * Pick a channel from your playlists. Tapping a row plans a recording; the play button opens it live
 * (and can cast it to a TV); the menu has the rest.
 */
@Composable
fun ChannelsScreen(
    vm: VesperViewModel,
    onBack: () -> Unit,
    onSchedule: (Channel) -> Unit,
    onWatch: (Channel) -> Unit,
) {
    val sources by vm.sources.collectAsState()
    val browser by vm.browser.collectAsState()
    val busy by vm.busy.collectAsState()
    val favorites by vm.favorites.collectAsState()
    var onlyFavorites by remember { mutableStateOf(false) }
    var recordNow by remember { mutableStateOf<Channel?>(null) }
    var guideFor by remember { mutableStateOf<Channel?>(null) }
    var addSource by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) { vm.loadSources() }
    // A stream shared from another app: offer to record it right away.
    val shared = vm.sharedUrl
    LaunchedEffect(shared) {
        if (shared != null) recordNow = Channel(name = shared.toHttpUrlOrNull()?.host ?: "Shared stream", url = shared)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Pick a channel") },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back") }
                },
            )
        },
    ) { padding ->
        if (sources.isEmpty()) {
            EmptyState(
                title = "Add a playlist first",
                body = "Vesper needs your IPTV playlist or Xtream login to list channels you can record.",
                modifier = Modifier.padding(padding),
                action = { Button(onClick = { addSource = true }) { Text("Add a playlist") } },
            )
        } else {
            Column(Modifier.padding(padding).padding(pagePadding())) {
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(listOf("live" to "Live", "movie" to "Movies", "series" to "Series"), key = { it.first }) { (kind, label) ->
                        FilterChip(selected = browser.kind == kind, onClick = { vm.setKind(kind) }, label = { Text(label) })
                    }
                    if (sources.size > 1) {
                        items(sources, key = { it.id }) { source ->
                            FilterChip(
                                selected = browser.sourceId == source.id,
                                onClick = { vm.selectSource(source.id) },
                                label = { Text(source.name) },
                            )
                        }
                    }
                }
                OutlinedTextField(
                    value = browser.query,
                    onValueChange = vm::setQuery,
                    label = { Text("Search channels") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                )
                if (browser.groups.isNotEmpty()) {
                    LazyRow(Modifier.padding(vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        item { FilterChip(selected = onlyFavorites, onClick = { onlyFavorites = !onlyFavorites }, label = { Text("Favorites") }) }
                        item { FilterChip(selected = browser.group.isEmpty(), onClick = { vm.setGroup("") }, label = { Text("All") }) }
                        items(browser.groups, key = { it }) { group ->
                            FilterChip(selected = browser.group == group, onClick = { vm.setGroup(group) }, label = { Text(group) })
                        }
                    }
                }
                val shown = remember(browser.channels, favorites, onlyFavorites) {
                    val base = if (onlyFavorites) browser.channels.filter { it.url in favorites } else browser.channels
                    base.sortedByDescending { it.url in favorites }
                }
                Box(browser.loading && browser.channels.isEmpty()) {
                    if (shown.isEmpty() && !browser.loading) {
                        EmptyState("No channels found", "Try another search, group or section.")
                    } else {
                        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp)) {
                            itemsIndexed(shown, key = { i, c -> "$i${c.url}" }) { index, channel ->
                                if (!onlyFavorites && index >= shown.size - 5) LaunchedEffect(browser.channels.size) { vm.loadMore() }
                                ChannelRow(
                                    channel = channel,
                                    starred = channel.url in favorites,
                                    onPick = { onSchedule(channel) },
                                    onWatch = { onWatch(channel) },
                                    onDownload = { vm.downloadToServer(channel) },
                                    onStar = { vm.toggleFavorite(channel) },
                                    onRecordNow = { recordNow = channel },
                                    onGuide = {
                                        vm.loadChannelGuide(channel)
                                        guideFor = channel
                                    },
                                    onTest = { vm.testChannel(channel) },
                                    onSample = { vm.testChannel(channel, sample = true) },
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    recordNow?.let { channel ->
        RecordNowDialog(
            channel = channel,
            onDismiss = {
                recordNow = null
                vm.sharedUrl = null
            },
            onStart = { seconds ->
                vm.recordNow(channel, seconds)
                recordNow = null
                vm.sharedUrl = null
                onBack()
            },
        )
    }
    guideFor?.let { channel ->
        ChannelGuideDialog(channel, vm, busy) { guideFor = null }
    }
    if (addSource) {
        AddSourceDialog(busy = busy, onDismiss = { addSource = false }, onAdd = {
            vm.addSource(it)
            addSource = false
        })
    }
}

@Composable
private fun ChannelRow(
    channel: Channel,
    starred: Boolean,
    onPick: () -> Unit,
    onWatch: () -> Unit,
    onDownload: () -> Unit,
    onStar: () -> Unit,
    onRecordNow: () -> Unit,
    onGuide: () -> Unit,
    onTest: () -> Unit,
    onSample: () -> Unit,
) {
    var menu by remember { mutableStateOf(false) }
    ListItem(
        modifier = Modifier.clickable(onClick = onPick),
        leadingContent = if (channel.logo.isNotBlank()) {
            {
                AsyncImage(
                    model = channel.logo,
                    contentDescription = null,
                    contentScale = ContentScale.Fit,
                    modifier = Modifier.size(44.dp).clip(RoundedCornerShape(8.dp)),
                )
            }
        } else {
            null
        },
        headlineContent = { Text(channel.name, maxLines = 1) },
        supportingContent = if (channel.group.isNotEmpty()) {
            { Text(channel.group, maxLines = 1) }
        } else {
            null
        },
        trailingContent = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (channel.isLive) {
                    IconButton(onClick = onWatch) { Icon(Icons.Filled.PlayArrow, contentDescription = "Watch ${channel.name}") }
                } else {
                    IconButton(onClick = onDownload) { Icon(Icons.Filled.Download, contentDescription = "Download ${channel.name} to the server") }
                }
                IconButton(onClick = onStar) {
                    Icon(
                        if (starred) Icons.Filled.Star else Icons.Filled.StarBorder,
                        contentDescription = if (starred) "Remove ${channel.name} from favorites" else "Add ${channel.name} to favorites",
                    )
                }
                IconButton(onClick = { menu = true }) { Icon(Icons.Filled.MoreVert, contentDescription = "More for ${channel.name}") }
                DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                    if (!channel.isLive) {
                        DropdownMenuItem(text = { Text("Watch") }, onClick = { menu = false; onWatch() })
                    }
                    if (channel.isLive) {
                        DropdownMenuItem(text = { Text("Record now") }, onClick = { menu = false; onRecordNow() })
                        DropdownMenuItem(text = { Text("Schedule") }, onClick = { menu = false; onPick() })
                        DropdownMenuItem(text = { Text("Guide") }, onClick = { menu = false; onGuide() })
                        DropdownMenuItem(text = { Text("Test") }, onClick = { menu = false; onTest() })
                        DropdownMenuItem(text = { Text("Test with a 10 second sample") }, onClick = { menu = false; onSample() })
                    }
                }
            }
        },
    )
}

/** What is on a channel now and next, with a way to record each programme. */
@Composable
private fun ChannelGuideDialog(channel: Channel, vm: VesperViewModel, busy: Boolean, onDismiss: () -> Unit) {
    val programmes by vm.channelGuide.collectAsState()
    var chosen by remember { mutableStateOf<GuideHit?>(null) }
    androidx.compose.material3.AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(channel.name) },
        text = {
            if (programmes.isEmpty()) {
                Text("No guide for this channel. Set the guide address in the admin panel.", style = MaterialTheme.typography.bodyMedium)
            } else {
                LazyColumn {
                    items(programmes) { programme ->
                        ListItem(
                            modifier = Modifier.clickable {
                                chosen = GuideHit(
                                    channelId = vm.channelGuideId ?: channel.id,
                                    channelName = channel.name,
                                    startAt = programme.startAt,
                                    stopAt = programme.stopAt,
                                    title = programme.title,
                                    description = programme.description,
                                )
                            },
                            headlineContent = { Text(programme.title, maxLines = 1) },
                            supportingContent = { Text(formatMoment(programme.startAt)) },
                        )
                    }
                }
            }
        },
        confirmButton = { androidx.compose.material3.TextButton(onClick = onDismiss) { Text("Close") } },
    )
    chosen?.let { hit -> ProgrammeDialog(hit, vm, busy) { chosen = null } }
}

/** A box that shows a spinner while it has nothing to show yet. */
@Composable
private fun Box(loading: Boolean, content: @Composable () -> Unit) {
    if (loading) {
        androidx.compose.foundation.layout.Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator()
        }
    } else {
        content()
    }
}
