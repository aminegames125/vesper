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
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.BookmarkAdd
import androidx.compose.material.icons.filled.Bookmarks
import androidx.compose.material.icons.filled.PictureInPictureAlt
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.graphics.Color
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
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import dev.aminegames125.vesper.cast.CastButton
import dev.aminegames125.vesper.cast.CastSupport
import dev.aminegames125.vesper.cast.isLocalOnly
import dev.aminegames125.vesper.cast.mimeFor
import dev.aminegames125.vesper.data.Bookmark
import dev.aminegames125.vesper.data.formatClock
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
        if (hasKnownExtension(address)) listOf(address to null) else listOf(address to null, address to MimeTypes.APPLICATION_M3U8)
    }

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
    var overlay by remember { mutableStateOf(true) }
    var inPip by remember { mutableStateOf(false) }
    var showBookmarks by remember { mutableStateOf(false) }

    val exo = remember {
        ExoPlayer.Builder(context)
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
        val (address, mime) = candidates[index]
        val item = MediaItem.Builder().setUri(address).apply { mime?.let(::setMimeType) }.build()
        exo.setMediaItem(item, if (positionMs > 0) positionMs else C.TIME_UNSET)
        exo.prepare()
        exo.playWhenReady = true
    }

    fun castItem(): MediaItem =
        MediaItem.Builder()
            .setUri(source.castUrl)
            .setMimeType(source.castMime ?: mimeFor(source.castUrl))
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

    DisposableEffect(exo) {
        val listener = object : Player.Listener {
            override fun onPlayerError(error: PlaybackException) {
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

    Box(Modifier.fillMaxSize().background(Color.Black)) {
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
                Text("This stream will not play on this device.", color = Color.White, style = MaterialTheme.typography.titleMedium)
                Text(
                    if (cast?.available == true) {
                        "Cast it to a TV or Chromecast instead, or go back and try another channel."
                    } else {
                        "Go back and try another channel."
                    },
                    color = Color.White.copy(alpha = 0.8f),
                    style = MaterialTheme.typography.bodyMedium,
                )
                if (cast != null && !isTv) CastButton(cast)
            }
        }

        if (overlay && !inPip) {
            Row(
                Modifier.fillMaxWidth().statusBarsPadding().background(Color.Black.copy(alpha = 0.45f)).padding(horizontal = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = Color.White)
                }
                Column(Modifier.weight(1f)) {
                    Text(source.title, color = Color.White, style = MaterialTheme.typography.titleMedium, maxLines = 1)
                    // A Chromecast cannot reach an address that only means "this phone".
                    if (cast?.available == true && !isTv && isLocalOnly(source.castUrl) && !source.live) {
                        Text(
                            "To cast, connect the app to the server's network address, not localhost.",
                            color = Color.White.copy(alpha = 0.8f),
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                }
                if (!source.live) {
                    IconButton(onClick = { onBookmark(current.currentPosition / 1000) }) {
                        Icon(Icons.Filled.BookmarkAdd, contentDescription = "Add a bookmark here", tint = Color.White)
                    }
                    if (bookmarks.isNotEmpty()) {
                        IconButton(onClick = { showBookmarks = true }) {
                            Icon(Icons.Filled.Bookmarks, contentDescription = "Bookmarks", tint = Color.White)
                        }
                    }
                }
                if (!isTv && cast != null) CastButton(cast)
                if (canPip) {
                    IconButton(onClick = {
                        activity?.enterPictureInPictureMode(PictureInPictureParams.Builder().build())
                    }) {
                        Icon(Icons.Filled.PictureInPictureAlt, contentDescription = "Picture in picture", tint = Color.White)
                    }
                }
            }
        }
    }

    if (showBookmarks) {
        AlertDialog(
            onDismissRequest = { showBookmarks = false },
            title = { Text("Bookmarks") },
            text = {
                Column {
                    bookmarks.forEach { bookmark ->
                        ListItem(
                            headlineContent = { Text(bookmark.label.ifBlank { formatClock(bookmark.atS) }) },
                            supportingContent = if (bookmark.label.isNotBlank()) ({ Text(formatClock(bookmark.atS)) }) else null,
                            modifier = Modifier.clickable {
                                current.seekTo(bookmark.atS * 1000)
                                showBookmarks = false
                            },
                        )
                    }
                }
            },
            confirmButton = { TextButton(onClick = { showBookmarks = false }) { Text("Close") } },
        )
    }
}
