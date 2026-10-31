package dev.aminegames125.vesper.player

import android.app.Activity
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.FiberManualRecord
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import dagger.hilt.android.lifecycle.HiltViewModel
import dev.aminegames125.vesper.data.repo.CloudRepository
import dev.aminegames125.vesper.data.repo.CloudSession
import dev.aminegames125.vesper.data.repo.LocalRecordingRepository
import dev.aminegames125.vesper.data.repo.PlayItem
import dev.aminegames125.vesper.data.repo.UserDataRepository
import dev.aminegames125.vesper.ui.common.tvFocus
import javax.inject.Inject
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

@HiltViewModel
class PlayerViewModel @Inject constructor(
    private val userData: UserDataRepository,
    private val local: LocalRecordingRepository,
    private val cloud: CloudRepository,
    private val session: PlayerSession,
) : ViewModel() {

    val cloudSession: StateFlow<CloudSession?> =
        cloud.session.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    private val _message = MutableStateFlow<String?>(null)
    val message: StateFlow<String?> = _message.asStateFlow()

    fun close() = session.close()

    fun clearMessage() { _message.value = null }

    suspend fun resumePosition(item: PlayItem): Long = if (item.live) 0 else userData.resumePosition(item.id)

    fun saveProgress(item: PlayItem, positionMs: Long, durationMs: Long) {
        viewModelScope.launch { userData.saveProgress(item, positionMs, if (item.live) 0 else durationMs) }
    }

    fun recordHere(item: PlayItem, seconds: Int) {
        local.start(item, seconds)
        _message.value = "Recording to this device"
    }

    fun recordInCloud(item: PlayItem, seconds: Int) {
        viewModelScope.launch {
            cloud.record(item.title, item.subtitle.orEmpty(), item.url, seconds, startAt = null, keepHours = null).fold(
                onSuccess = { _message.value = "Recording in the cloud" },
                onFailure = { _message.value = it.message },
            )
        }
    }
}

@Composable
fun PlayerScreen(item: PlayItem, viewModel: PlayerViewModel = hiltViewModel()) {
    val context = LocalContext.current
    val view = LocalView.current
    val cloud by viewModel.cloudSession.collectAsState()
    val message by viewModel.message.collectAsState()
    var error by remember(item.id) { mutableStateOf<String?>(null) }
    var menu by remember { mutableStateOf(false) }

    val exo = remember(item.id) {
        ExoPlayer.Builder(context).build().apply {
            setMediaItem(MediaItem.fromUri(item.url))
            playWhenReady = true
            prepare()
        }
    }

    LaunchedEffect(exo) {
        val at = viewModel.resumePosition(item)
        if (at > 5_000) exo.seekTo(at)
    }

    DisposableEffect(exo) {
        val listener = object : Player.Listener {
            override fun onPlayerError(e: PlaybackException) {
                error = "This stream would not play (${e.errorCodeName})."
            }
        }
        exo.addListener(listener)
        onDispose {
            if (!item.live) viewModel.saveProgress(item, exo.currentPosition, exo.duration.coerceAtLeast(0))
            else viewModel.saveProgress(item, 0, 0)
            exo.removeListener(listener)
            exo.release()
        }
    }

    // Remember where a movie was left, every few seconds.
    LaunchedEffect(exo) {
        while (!item.live) {
            delay(10_000)
            if (exo.isPlaying) viewModel.saveProgress(item, exo.currentPosition, exo.duration.coerceAtLeast(0))
        }
    }

    // Immersive: hide the status and navigation bars while watching.
    DisposableEffect(Unit) {
        val window = (context as? Activity)?.window
        val controller = window?.let { WindowCompat.getInsetsController(it, view) }
        controller?.hide(WindowInsetsCompat.Type.systemBars())
        controller?.systemBarsBehavior = androidx.core.view.WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        onDispose { controller?.show(WindowInsetsCompat.Type.systemBars()) }
    }

    BackHandler { viewModel.close() }

    Box(Modifier.fillMaxSize().background(Color.Black)) {
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { PlayerView(it).apply { player = exo; useController = true; keepScreenOn = true } },
        )

        Row(
            Modifier.fillMaxWidth().align(Alignment.TopStart)
                .background(Brush.verticalGradient(listOf(Color.Black.copy(alpha = 0.6f), Color.Transparent)))
                .padding(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = viewModel::close, modifier = Modifier.tvFocus()) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = Color.White)
            }
            Text(item.title, color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
            Box {
                IconButton(onClick = { menu = true }, modifier = Modifier.tvFocus()) {
                    Icon(Icons.Filled.FiberManualRecord, contentDescription = "Record", tint = Color(0xFFFF5C7A))
                }
                DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                    listOf(30 to "30 minutes", 60 to "1 hour", 120 to "2 hours").forEach { (minutes, label) ->
                        DropdownMenuItem(
                            text = { Text("Record on this device · $label") },
                            onClick = { menu = false; viewModel.recordHere(item, minutes * 60) },
                        )
                        if (cloud != null) {
                            DropdownMenuItem(
                                text = { Text("Record in the cloud · $label") },
                                onClick = { menu = false; viewModel.recordInCloud(item, minutes * 60) },
                            )
                        }
                    }
                }
            }
        }

        (error ?: message)?.let { text ->
            LaunchedEffect(text) {
                delay(4_000)
                viewModel.clearMessage()
            }
            Text(
                text,
                color = Color.White,
                modifier = Modifier.align(Alignment.BottomCenter).padding(24.dp)
                    .background(Color.Black.copy(alpha = 0.75f), androidx.compose.foundation.shape.RoundedCornerShape(50))
                    .padding(horizontal = 20.dp, vertical = 10.dp),
            )
        }
    }
}
