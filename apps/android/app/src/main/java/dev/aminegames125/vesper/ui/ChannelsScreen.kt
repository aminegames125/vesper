package dev.aminegames125.vesper.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
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
import dev.aminegames125.vesper.data.GuideHit
import dev.aminegames125.vesper.data.formatMoment
import dev.aminegames125.vesper.ui.kit.ButtonKind
import dev.aminegames125.vesper.ui.kit.Ic
import dev.aminegames125.vesper.ui.kit.LoadingBox
import dev.aminegames125.vesper.ui.kit.LogoTile
import dev.aminegames125.vesper.ui.kit.SheetAction
import dev.aminegames125.vesper.ui.kit.VActionSheet
import dev.aminegames125.vesper.ui.kit.VButton
import dev.aminegames125.vesper.ui.kit.VChip
import dev.aminegames125.vesper.ui.kit.VDialog
import dev.aminegames125.vesper.ui.kit.VField
import dev.aminegames125.vesper.ui.kit.VIconButton
import dev.aminegames125.vesper.ui.kit.VRow
import dev.aminegames125.vesper.ui.kit.VText
import dev.aminegames125.vesper.ui.kit.VTopBar
import dev.aminegames125.vesper.ui.kit.Vesper
import dev.aminegames125.vesper.ui.theme.LocalIsTv

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
    shared?.let { link ->
        SharedLinkDialog(
            url = link,
            onCast = { channel ->
                vm.sharedUrl = null
                onWatch(channel)
            },
            onRecord = { channel ->
                vm.sharedUrl = null
                recordNow = channel
            },
            onDismiss = { vm.sharedUrl = null },
        )
    }

    Column(Modifier.fillMaxSize()) {
        VTopBar("Pick a channel", onBack)
        if (sources.isEmpty()) {
            EmptyState(
                title = "Add a playlist first",
                body = "Vesper needs your IPTV playlist or Xtream login to list channels you can record.",
                icon = Ic.Tv,
                action = { VButton("Add a playlist", { addSource = true }, icon = Ic.Add) },
            )
        } else {
            Column(Modifier.fillMaxSize().padding(horizontal = pageHorizontal()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp), contentPadding = PaddingValues(vertical = 4.dp)) {
                    items(listOf("live" to "Live", "movie" to "Movies", "series" to "Series"), key = { it.first }) { (kind, label) ->
                        VChip(label, selected = browser.kind == kind, onClick = { vm.setKind(kind) })
                    }
                    if (sources.size > 1) {
                        items(sources, key = { it.id }) { source ->
                            VChip(source.name, selected = browser.sourceId == source.id, onClick = { vm.selectSource(source.id) })
                        }
                    }
                }
                VField(browser.query, vm::setQuery, "Search channels", Modifier.fillMaxWidth(), leading = Ic.Search)
                if (browser.groups.isNotEmpty()) {
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp), contentPadding = PaddingValues(vertical = 2.dp)) {
                        item { VChip("Favorites", selected = onlyFavorites, onClick = { onlyFavorites = !onlyFavorites }, icon = Ic.Star) }
                        item { VChip("All", selected = browser.group.isEmpty(), onClick = { vm.setGroup("") }) }
                        items(browser.groups, key = { it }) { group ->
                            VChip(group, selected = browser.group == group, onClick = { vm.setGroup(group) })
                        }
                    }
                }
                val shown = remember(browser.channels, favorites, onlyFavorites) {
                    val base = if (onlyFavorites) browser.channels.filter { it.url in favorites } else browser.channels
                    base.sortedByDescending { it.url in favorites }
                }
                Spinning(browser.loading && browser.channels.isEmpty()) {
                    if (shown.isEmpty() && !browser.loading) {
                        EmptyState("No channels found", "Try another search, group or section.", icon = Ic.Search)
                    } else {
                        LazyColumn(
                            Modifier.fillMaxSize(),
                            contentPadding = PaddingValues(top = 4.dp, bottom = 24.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
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
            onStart = { seconds, keep ->
                vm.recordNow(channel, seconds, keep)
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
    val isTv = LocalIsTv.current
    val c = Vesper.colors
    VRow(
        title = channel.name,
        subtitle = channel.group.takeIf { it.isNotEmpty() },
        onClick = onPick,
        leading = { LogoTile(channel.logo, channel.name) },
        trailing = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (channel.isLive) {
                    // The phone does not play live channels (that would use the provider's connection
                    // while a recording needs it); it sends them to a TV. A TV plays them.
                    if (isTv) {
                        VIconButton(Ic.Play, "Watch ${channel.name}", onWatch)
                    } else {
                        VIconButton(Ic.Cast, "Cast ${channel.name} to a TV", onWatch)
                    }
                } else {
                    VIconButton(Ic.Download, "Download ${channel.name} to the server", onDownload)
                }
                VIconButton(
                    if (starred) Ic.StarOn else Ic.Star,
                    if (starred) "Remove ${channel.name} from favorites" else "Add ${channel.name} to favorites",
                    onStar,
                    tint = if (starred) c.warn else c.textDim,
                )
                VIconButton(Ic.More, "More for ${channel.name}", { menu = true }, tint = c.textDim)
            }
        },
    )
    if (menu) {
        val actions = buildList {
            if (!channel.isLive) add(SheetAction(if (isTv) "Watch" else "Cast to a TV", if (isTv) Ic.Play else Ic.Cast) { onWatch() })
            if (channel.isLive) {
                add(SheetAction("Record now", Ic.Record) { onRecordNow() })
                add(SheetAction("Schedule", Ic.Calendar) { onPick() })
                add(SheetAction("Guide", Ic.Guide) { onGuide() })
                add(SheetAction("Test", Ic.Refresh) { onTest() })
                add(SheetAction("Test with a 10 second sample", Ic.Refresh) { onSample() })
            }
        }
        VActionSheet(channel.name, actions) { menu = false }
    }
}

/** What is on a channel now and next, with a way to record each programme. */
@Composable
private fun ChannelGuideDialog(channel: Channel, vm: VesperViewModel, busy: Boolean, onDismiss: () -> Unit) {
    val programmes by vm.channelGuide.collectAsState()
    var chosen by remember { mutableStateOf<GuideHit?>(null) }
    VDialog(
        onDismiss = onDismiss,
        title = channel.name,
        actions = { VButton("Close", onDismiss, kind = ButtonKind.Soft) },
    ) {
        if (programmes.isEmpty()) {
            VText("No guide for this channel. Set the guide address in the admin panel.", style = Vesper.type.body, color = Vesper.colors.textDim)
        } else {
            LazyColumn(Modifier.heightIn(max = 420.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(programmes) { programme ->
                    VRow(
                        title = programme.title,
                        subtitle = formatMoment(programme.startAt),
                        onClick = {
                            chosen = GuideHit(
                                channelId = vm.channelGuideId ?: channel.id,
                                channelName = channel.name,
                                startAt = programme.startAt,
                                stopAt = programme.stopAt,
                                title = programme.title,
                                description = programme.description,
                            )
                        },
                    )
                }
            }
        }
    }
    chosen?.let { hit -> ProgrammeDialog(hit, vm, busy) { chosen = null } }
}

/** Shows a spinner while there is nothing to show yet, and the content otherwise. */
@Composable
private fun Spinning(loading: Boolean, content: @Composable () -> Unit) {
    if (loading) LoadingBox() else content()
}
