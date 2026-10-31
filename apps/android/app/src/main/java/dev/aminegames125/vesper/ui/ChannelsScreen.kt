@file:OptIn(ExperimentalMaterial3Api::class)

package dev.aminegames125.vesper.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.clickable
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Event
import androidx.compose.material.icons.filled.NetworkCheck
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.StarBorder
import androidx.compose.material.icons.filled.FiberManualRecord
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.ui.unit.dp
import dev.aminegames125.vesper.data.Channel

/**
 * Pick a channel from your playlists. Each row can record it right now, or open the schedule form
 * to record it at a time you choose.
 */
@Composable
fun ChannelsScreen(vm: VesperViewModel, onBack: () -> Unit, onSchedule: (Channel) -> Unit) {
    val sources by vm.sources.collectAsState()
    val browser by vm.browser.collectAsState()
    val busy by vm.busy.collectAsState()
    val favorites by vm.favorites.collectAsState()
    var onlyFavorites by remember { mutableStateOf(false) }
    var recordNow by remember { mutableStateOf<Channel?>(null) }
    var addSource by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) { vm.loadSources() }

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
                if (sources.size > 1) {
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
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
                        EmptyState("No channels found", "Try another search or group.")
                    } else {
                        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp)) {
                            itemsIndexed(shown, key = { i, c -> "$i${c.url}" }) { index, channel ->
                                if (index >= shown.size - 5) LaunchedEffect(browser.channels.size) { vm.loadMore() }
                                ListItem(
                                    modifier = Modifier.clickable { onSchedule(channel) },
                                    headlineContent = { Text(channel.name, maxLines = 1) },
                                    supportingContent = if (channel.group.isNotEmpty()) {
                                        { Text(channel.group, maxLines = 1) }
                                    } else {
                                        null
                                    },
                                    trailingContent = {
                                        Row(verticalAlignment = Alignment.CenterVertically) {
                                            val starred = channel.url in favorites
                                            IconButton(onClick = { vm.toggleFavorite(channel) }) {
                                                Icon(
                                                    if (starred) Icons.Filled.Star else Icons.Filled.StarBorder,
                                                    contentDescription = if (starred) "Remove ${channel.name} from favorites" else "Add ${channel.name} to favorites",
                                                )
                                            }
                                            IconButton(onClick = { vm.testChannel(channel) }) {
                                                Icon(Icons.Filled.NetworkCheck, contentDescription = "Test ${channel.name}")
                                            }
                                            IconButton(onClick = { recordNow = channel }) {
                                                Icon(
                                                    Icons.Filled.FiberManualRecord,
                                                    contentDescription = "Record ${channel.name} now",
                                                    tint = MaterialTheme.colorScheme.error,
                                                )
                                            }
                                            IconButton(onClick = { onSchedule(channel) }) {
                                                Icon(Icons.Filled.Event, contentDescription = "Schedule ${channel.name}")
                                            }
                                        }
                                    },
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
            onDismiss = { recordNow = null },
            onStart = { seconds ->
                vm.recordNow(channel, seconds)
                recordNow = null
                onBack()
            },
        )
    }
    if (addSource) {
        AddSourceDialog(busy = busy, onDismiss = { addSource = false }, onAdd = {
            vm.addSource(it)
            addSource = false
        })
    }
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
