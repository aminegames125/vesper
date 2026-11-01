package dev.aminegames125.vesper.ui

import android.app.Activity
import android.app.PictureInPictureParams
import android.content.Context
import android.content.ContextWrapper
import android.content.pm.PackageManager
import android.view.View
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.app.PictureInPictureModeChangedInfo
import androidx.core.util.Consumer
import androidx.media3.cast.CastPlayer
import androidx.media3.cast.SessionAvailabilityListener
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.extractor.DefaultExtractorsFactory
import androidx.media3.extractor.ts.DefaultTsPayloadReaderFactory
import androidx.media3.ui.PlayerView
import dev.aminegames125.vesper.cast.CastButton
import dev.aminegames125.vesper.cast.CastSupport
import dev.aminegames125.vesper.cast.Variant
import dev.aminegames125.vesper.cast.castUrlFor
import dev.aminegames125.vesper.cast.fetchVariants
import dev.aminegames125.vesper.cast.heightsOf
import dev.aminegames125.vesper.cast.isLocalOnly
import dev.aminegames125.vesper.cast.pickVariant
import dev.aminegames125.vesper.cast.qualityLabel
import dev.aminegames125.vesper.cast.mimeFor
import dev.aminegames125.vesper.data.Bookmark
import dev.aminegames125.vesper.data.formatClock
import dev.aminegames125.vesper.ui.kit.ButtonKind
import dev.aminegames125.vesper.ui.kit.ChoiceRow
import dev.aminegames125.vesper.ui.kit.Ic
import dev.aminegames125.vesper.ui.kit.IconStyle
import dev.aminegames125.vesper.ui.kit.Shapes
import dev.aminegames125.vesper.ui.kit.VButton
import dev.aminegames125.vesper.ui.kit.VDialog
import dev.aminegames125.vesper.ui.kit.VIcon
import dev.aminegames125.vesper.ui.kit.VIconButton
import dev.aminegames125.vesper.ui.kit.VRow
import dev.aminegames125.vesper.ui.kit.VText
import dev.aminegames125.vesper.ui.kit.Vesper
import dev.aminegames125.vesper.ui.kit.glass
import dev.aminegames125.vesper.ui.theme.LocalIsTv
import kotlinx.coroutines.delay

/** Something to watch: a recording, a saved movie, or a live channel. */
data class PlayerSource(
    val title: String,
    val url: String,
    /** Other addresses of the same thing, tried in turn if the first cannot be played. */
    val fallbacks: List<String> = emptyList(),
    /** What a Chromecast is given. Usually [url]; a live link may be adjusted so the TV can play it. */
    val castUrl: String = url,
    val live: Boolean = false,
    /** Where to start, in milliseconds. */
    val startMs: Long = 0,
    /** The media type to tell a Chromecast; guessed from [castUrl] when null. */
    val castMime: String? = null,
    /** True while the recording is still being made; it is never marked as watched. */
    val running: Boolean = false,
)

private val KNOWN_EXTENSIONS = listOf(".m3u8", ".mp4", ".m4v", ".mkv", ".webm", ".ts", ".avi", ".mov")

private fun hasKnownExtension(url: String): Boolean {
    val path = url.substringBefore('?').substringBefore('#').lowercase()
    return KNOWN_EXTENSIONS.any { path.endsWith(it) }
}

/**
 * The ways to try playing something on this device, in order: each address as it is, and, for an
 * address that gives no hint what it is, once more as HLS.
 */
fun playbackCandidates(url: String, fallbacks: List<String>): List<Pair<String, String?>> =
    (listOf(url) + fallbacks).distinct().flatMap { address ->
        when {
            // A raw Xtream .ts link: many providers only let a player in through the .m3u8 twin.
            castUrlFor(address) != address -> listOf(address to null, castUrlFor(address) to null)
            hasKnownExtension(address) -> listOf(address to null)
            else -> listOf(address to null, address to MimeTypes.APPLICATION_M3U8)
        }
    }.distinct()

private tailrec fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}

@OptIn(UnstableApi::class)
@Composable
fun PlayerScreen(
    incoming: PlayerSource,
    cast: CastSupport?,
    bookmarks: List<Bookmark>,
    onProgress: (positionSeconds: Long, finished: Boolean) -> Unit,
    onBookmark: (positionSeconds: Long) -> Unit,
    onDeleteBookmark: (String) -> Unit = {},
    /** On a phone, a live channel is not played locally: this screen only sends it to a TV. */
    castOnly: Boolean = false,
    /** On a TV, the remote changes channel: -1 for the previous one, 1 for the next. Null when it cannot. */
    onZap: ((Int) -> Unit)? = null,
    onBack: () -> Unit,
) {
    val context = LocalContext.current
    val isTv = LocalIsTv.current
    // The list refreshes while watching and the saved position changes with it; playback must not
    // restart each time. Take the details once per address (and again when the title arrives).
    val source = remember(incoming.url, incoming.title.isEmpty()) { incoming }
    val candidates = remember(source) { playbackCandidates(source.url, source.fallbacks) }
    var attempt by remember(source) { mutableIntStateOf(0) }
    var failed by remember(source) { mutableStateOf(false) }
    var failure by remember(source) { mutableStateOf("") }
    var overlay by remember { mutableStateOf(true) }
    var inPip by remember { mutableStateOf(false) }
    var showBookmarks by remember { mutableStateOf(false) }

    val exo = remember {
        // IPTV providers often turn away "ExoPlayerLib", redirect from http to https, or send
        // transport streams with odd key frames; the player is set up to cope with all three.
        val http = DefaultHttpDataSource.Factory()
            .setUserAgent("VLC/3.0.20 LibVLC/3.0.20")
            .setAllowCrossProtocolRedirects(true)
            .setConnectTimeoutMs(15_000)
            .setReadTimeoutMs(20_000)
        val extractors = DefaultExtractorsFactory()
            .setTsExtractorFlags(
                DefaultTsPayloadReaderFactory.FLAG_ALLOW_NON_IDR_KEYFRAMES or DefaultTsPayloadReaderFactory.FLAG_DETECT_ACCESS_UNITS,
            )
            .setConstantBitrateSeekingEnabled(true)
        ExoPlayer.Builder(context, DefaultRenderersFactory(context).setEnableDecoderFallback(true))
            .setMediaSourceFactory(DefaultMediaSourceFactory(context, extractors).setDataSourceFactory(http))
            .setSeekBackIncrementMs(10_000)
            .setSeekForwardIncrementMs(10_000)
            .setAudioAttributes(AudioAttributes.DEFAULT, true)
            .setHandleAudioBecomingNoisy(true)
            .build()
    }
    val castPlayer = remember(cast) { cast?.castContext?.let { CastPlayer(it) } }
    var current by remember { mutableStateOf<Player>(exo) }
    val latestProgress by rememberUpdatedState(onProgress)

    fun loadCandidate(index: Int, positionMs: Long) {
        if (castOnly) return
        val (address, mime) = candidates[index]
        val item = MediaItem.Builder().setUri(address).apply { mime?.let(::setMimeType) }.build()
        exo.setMediaItem(item, if (positionMs > 0) positionMs else C.TIME_UNSET)
        exo.prepare()
        exo.playWhenReady = true
    }

    // The qualities a stream offers, and the tallest picture the person allows (0 follows the connection).
    var variants by remember(source) { mutableStateOf(emptyList<Variant>()) }
    var maxHeight by remember(source) { mutableIntStateOf(0) }
    var showQuality by remember { mutableStateOf(false) }
    LaunchedEffect(source) { variants = fetchVariants(source.castUrl) }

    fun castTarget(): String =
        if (maxHeight > 0) pickVariant(variants, maxHeight)?.url ?: source.castUrl else source.castUrl

    fun castItem(): MediaItem =
        MediaItem.Builder()
            .setUri(castTarget())
            .setMimeType(source.castMime ?: mimeFor(castTarget()))
            .setMediaMetadata(MediaMetadata.Builder().setTitle(source.title).build())
            .build()

    fun switchTo(target: Player) {
        val from = current
        if (from === target) return
        val position = if (source.live) 0L else from.currentPosition.takeIf { it > 0 } ?: source.startMs
        from.stop()
        from.clearMediaItems()
        current = target
        if (target === castPlayer) {
            target.setMediaItem(castItem(), if (position > 0) position else C.TIME_UNSET)
            target.prepare()
            target.playWhenReady = true
        } else {
            failed = false
            loadCandidate(attempt.coerceAtMost(candidates.lastIndex), position)
        }
    }

    fun chooseQuality(height: Int) {
        maxHeight = height
        val player = current
        if (player === exo) {
            exo.trackSelectionParameters = exo.trackSelectionParameters.buildUpon().apply {
                if (height == 0) clearVideoSizeConstraints() else setMaxVideoSize(Int.MAX_VALUE, height)
            }.build()
        } else {
            // A Chromecast picks its own quality, so it is handed the address of the one chosen.
            val position = if (source.live) C.TIME_UNSET else player.currentPosition
            player.setMediaItem(castItem(), position)
            player.prepare()
            player.playWhenReady = true
        }
    }

    // Keyed on the source too: after changing channel the listener must use the new channel's tries.
    DisposableEffect(exo, source) {
        val listener = object : Player.Listener {
            override fun onPlayerError(error: PlaybackException) {
                // A live stream that fell behind its window just needs to be joined again.
                if (error.errorCode == PlaybackException.ERROR_CODE_BEHIND_LIVE_WINDOW) {
                    exo.seekToDefaultPosition()
                    exo.prepare()
                    return
                }
                failure = error.errorCodeName
                if (attempt < candidates.lastIndex) {
                    attempt += 1
                } else {
                    failed = true
                }
            }
        }
        exo.addListener(listener)
        onDispose { exo.removeListener(listener) }
    }

    // Start (or move on to the next way of playing it) whenever the attempt changes.
    LaunchedEffect(attempt, source) {
        if (current === exo) loadCandidate(attempt, if (attempt == 0) source.startMs else 0L)
    }

    DisposableEffect(castPlayer) {
        castPlayer?.setSessionAvailabilityListener(
            object : SessionAvailabilityListener {
                override fun onCastSessionAvailable() = switchTo(castPlayer)
                override fun onCastSessionUnavailable() = switchTo(exo)
            },
        )
        // If the TV cannot play it, come back to the phone instead of leaving a blank screen.
        val castErrors = object : Player.Listener {
            override fun onPlayerError(error: PlaybackException) {
                switchTo(exo)
                failed = true
            }
        }
        castPlayer?.addListener(castErrors)
        if (castPlayer?.isCastSessionAvailable == true) switchTo(castPlayer)
        onDispose {
            castPlayer?.removeListener(castErrors)
            castPlayer?.setSessionAvailabilityListener(null)
            castPlayer?.release()
        }
    }

    // Remember where the person stopped, every so often and when leaving.
    LaunchedEffect(source) {
        while (!source.live) {
            delay(10_000)
            val player = current
            if (player.isPlaying) {
                val duration = player.duration
                val position = player.currentPosition
                latestProgress(position / 1000, !source.running && duration > 0 && position >= duration * 95 / 100)
            }
        }
    }
    DisposableEffect(Unit) {
        onDispose {
            if (!source.live) {
                val player = current
                val duration = player.duration
                val position = player.currentPosition
                if (position > 0) latestProgress(position / 1000, !source.running && duration > 0 && position >= duration * 95 / 100)
            }
            exo.release()
        }
    }

    val activity = context.findActivity()
    DisposableEffect(activity) {
        val listener = Consumer<PictureInPictureModeChangedInfo> { inPip = it.isInPictureInPictureMode }
        (activity as? ComponentActivity)?.addOnPictureInPictureModeChangedListener(listener)
        onDispose { (activity as? ComponentActivity)?.removeOnPictureInPictureModeChangedListener(listener) }
    }
    // Sound should not carry on after the person leaves the screen, unless a window is still showing it.
    DisposableEffect(activity) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_STOP && !inPip) current.pause()
        }
        val lifecycle = (activity as? ComponentActivity)?.lifecycle
        lifecycle?.addObserver(observer)
        onDispose { lifecycle?.removeObserver(observer) }
    }
    val canPip = !isTv && context.packageManager.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)

    BackHandler(onBack = onBack)

    // A TV remote: up and down (or the channel keys) change channel while the controls are hidden,
    // and the menu key opens the picture quality list.
    var banner by remember { mutableStateOf(true) }
    LaunchedEffect(source.url) {
        banner = true
        delay(4_000)
        banner = false
    }
    val remoteKeys = Modifier.onPreviewKeyEvent { event ->
        if (!isTv || event.type != KeyEventType.KeyDown) return@onPreviewKeyEvent false
        val zap = onZap
        when (event.key) {
            Key.ChannelUp, Key.PageUp -> if (zap != null && source.live) { zap(-1); true } else false
            Key.ChannelDown, Key.PageDown -> if (zap != null && source.live) { zap(1); true } else false
            Key.DirectionUp -> if (zap != null && source.live && !overlay) { zap(-1); true } else false
            Key.DirectionDown -> if (zap != null && source.live && !overlay) { zap(1); true } else false
            Key.Menu -> if (heightsOf(variants).size > 1) { showQuality = true; true } else false
            else -> false
        }
    }

    Box(Modifier.fillMaxSize().background(Color.Black).then(remoteKeys)) {
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { ctx ->
                PlayerView(ctx).apply {
                    keepScreenOn = true
                    setShowSubtitleButton(true)
                    setControllerVisibilityListener(
                        PlayerView.ControllerVisibilityListener { visibility -> overlay = visibility == View.VISIBLE },
                    )
                    requestFocus()
                }
            },
            update = { it.player = current },
        )

        if (failed) {
            Column(
                Modifier.align(Alignment.Center).padding(32.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                VText("This stream will not play on this device.", color = Color.White, style = Vesper.type.heading)
                if (failure.isNotEmpty()) VText(failure, color = Color.White.copy(alpha = 0.6f), style = Vesper.type.small)
                VText(
                    if (cast?.available == true) {
                        "Cast it to a TV or Chromecast instead, or go back and try another channel."
                    } else {
                        "Go back and try another channel."
                    },
                    color = Color.White.copy(alpha = 0.8f),
                    style = Vesper.type.body,
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                )
                if (cast != null && !isTv) CastButton(cast)
            }
        }

        if (isTv && (banner || overlay) && !inPip) {
            Column(
                Modifier.align(Alignment.BottomStart).padding(start = 48.dp, bottom = 56.dp, end = 48.dp)
                    .glass(Shapes.tile, strong = true).padding(horizontal = 22.dp, vertical = 14.dp),
            ) {
                VText(source.title, color = Color.White, style = Vesper.type.title, maxLines = 1)
                val hints = buildList {
                    if (source.live && onZap != null) add("Up / Down: change channel")
                    if (heightsOf(variants).size > 1) add("Menu: picture quality")
                    add("Back: leave")
                }
                VText(hints.joinToString("   ·   "), color = Color.White.copy(alpha = 0.75f), style = Vesper.type.body)
            }
        }

        if (castOnly && current === exo) {
            Column(
                Modifier.align(Alignment.Center).padding(32.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                VText(source.title, color = Color.White, style = Vesper.type.title, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                VText(
                    if (cast?.available == true) "Pick a TV or Chromecast to start it there." else "Casting needs Google Play services, which this phone does not have.",
                    color = Color.White.copy(alpha = 0.8f),
                    style = Vesper.type.body,
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                )
                if (cast != null) CastButton(cast)
            }
        }

        if (overlay && !inPip) {
            Row(
                Modifier
                    .fillMaxWidth()
                    .background(Brush.verticalGradient(listOf(Color.Black.copy(alpha = 0.65f), Color.Transparent)))
                    .statusBarsPadding()
                    .padding(horizontal = 12.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                VIconButton(Ic.Back, "Back", onBack, style = IconStyle.Scrim)
                Column(Modifier.weight(1f)) {
                    VText(source.title, color = Color.White, style = Vesper.type.heading, maxLines = 1)
                    // A Chromecast cannot reach an address that only means "this phone".
                    if (cast?.available == true && !isTv && isLocalOnly(source.castUrl) && !source.live) {
                        VText(
                            "To cast, connect the app to the server's network address, not localhost.",
                            color = Color.White.copy(alpha = 0.8f),
                            style = Vesper.type.small,
                        )
                    }
                }
                if (heightsOf(variants).size > 1 && !isTv) {
                    VIconButton(Ic.Quality, "Picture quality", { showQuality = true }, style = IconStyle.Scrim)
                }
                if (!source.live && !isTv) {
                    VIconButton(Ic.BookmarkAdd, "Add a bookmark here", { onBookmark(current.currentPosition / 1000) }, style = IconStyle.Scrim)
                    if (bookmarks.isNotEmpty()) {
                        VIconButton(Ic.Bookmarks, "Bookmarks", { showBookmarks = true }, style = IconStyle.Scrim)
                    }
                }
                if (!isTv && cast != null) CastButton(cast)
                if (canPip) {
                    VIconButton(
                        Ic.Pip,
                        "Picture in picture",
                        { activity?.enterPictureInPictureMode(PictureInPictureParams.Builder().build()) },
                        style = IconStyle.Scrim,
                    )
                }
            }
        }
    }

    if (showQuality) {
        VDialog(
            onDismiss = { showQuality = false },
            title = "Picture quality",
            actions = { VButton("Close", { showQuality = false }, kind = ButtonKind.Soft) },
        ) {
            (listOf(0) + heightsOf(variants)).forEach { height ->
                ChoiceRow(
                    qualityLabel(height),
                    selected = maxHeight == height,
                    onClick = {
                        chooseQuality(height)
                        showQuality = false
                    },
                )
            }
            VText(
                "A lower quality uses less data and buffers less on a slow connection.",
                style = Vesper.type.small,
                color = Vesper.colors.textFaint,
            )
        }
    }

    if (showBookmarks) {
        VDialog(
            onDismiss = { showBookmarks = false },
            title = "Bookmarks",
            actions = { VButton("Close", { showBookmarks = false }, kind = ButtonKind.Soft) },
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                bookmarks.forEach { bookmark ->
                    VRow(
                        title = bookmark.label.ifBlank { formatClock(bookmark.atS) },
                        subtitle = if (bookmark.label.isNotBlank()) formatClock(bookmark.atS) else null,
                        onClick = {
                            current.seekTo(bookmark.atS * 1000)
                            showBookmarks = false
                        },
                        trailing = {
                            VIconButton(Ic.Delete, "Delete this bookmark", {
                                onDeleteBookmark(bookmark.id)
                                if (bookmarks.size <= 1) showBookmarks = false
                            }, tint = Vesper.colors.danger)
                        },
                    )
                }
            }
        }
    }
}
