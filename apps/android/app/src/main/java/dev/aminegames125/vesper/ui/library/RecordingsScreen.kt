package dev.aminegames125.vesper.ui.library

import android.net.Uri
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.Card
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import dev.aminegames125.vesper.data.db.RecordingEntity
import dev.aminegames125.vesper.data.repo.CloudRecording
import dev.aminegames125.vesper.data.repo.CloudRepository
import dev.aminegames125.vesper.data.repo.CloudSession
import dev.aminegames125.vesper.data.repo.LocalRecordingRepository
import dev.aminegames125.vesper.data.repo.PlayItem
import dev.aminegames125.vesper.player.PlayerSession
import dev.aminegames125.vesper.ui.common.LoadingBox
import dev.aminegames125.vesper.ui.common.Message
import dev.aminegames125.vesper.ui.common.ScreenTitle
import dev.aminegames125.vesper.ui.common.UiState
import dev.aminegames125.vesper.ui.common.tvFocus
import java.io.File
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

@HiltViewModel
class RecordingsViewModel @Inject constructor(
    private val local: LocalRecordingRepository,
    private val cloud: CloudRepository,
    private val player: PlayerSession,
) : ViewModel() {

    val device: StateFlow<List<RecordingEntity>?> =
        local.recordings.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    val session: StateFlow<CloudSession?> =
        cloud.session.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    private val _cloud = MutableStateFlow<UiState<List<CloudRecording>>>(UiState.Loading)
    val cloudState: StateFlow<UiState<List<CloudRecording>>> = _cloud.asStateFlow()

    init {
        viewModelScope.launch { local.cleanUpAfterCrash() }
    }

    fun refreshCloud() {
        viewModelScope.launch {
            cloud.recordings().fold(
                onSuccess = { _cloud.value = if (it.recordings.isEmpty()) UiState.Empty else UiState.Content(it.recordings) },
                onFailure = { _cloud.value = UiState.Error(it.message ?: "Could not load recordings.") },
            )
        }
    }

    fun play(recording: RecordingEntity) =
        player.play(PlayItem(recording.id, recording.title, recording.channelName, Uri.fromFile(File(recording.path)).toString()))

    fun stop(recording: RecordingEntity) = local.stop(recording.id)

    fun delete(recording: RecordingEntity) {
        viewModelScope.launch { local.delete(recording) }
    }

    fun playCloud(recording: CloudRecording) {
        val s = session.value ?: return
        player.play(PlayItem("cloud:${recording.id}", recording.title, recording.channelName, cloud.playlistUrl(s, recording.id)))
    }

    fun stopCloud(recording: CloudRecording) {
        viewModelScope.launch { cloud.stop(recording.id); refreshCloud() }
    }

    fun deleteCloud(recording: CloudRecording) {
        viewModelScope.launch { cloud.delete(recording.id); refreshCloud() }
    }
}

private fun size(bytes: Long): String = when {
    bytes >= 1L shl 30 -> "%.1f GB".format(bytes / (1L shl 30).toDouble())
    bytes >= 1L shl 20 -> "%.0f MB".format(bytes / (1L shl 20).toDouble())
    else -> "%d KB".format(bytes / 1024)
}

private fun clock(seconds: Int) = "%d:%02d:%02d".format(seconds / 3600, seconds % 3600 / 60, seconds % 60)

@Composable
fun RecordingsScreen(viewModel: RecordingsViewModel = hiltViewModel()) {
    var tab by remember { mutableIntStateOf(0) }
    val device by viewModel.device.collectAsState()
    val session by viewModel.session.collectAsState()
    val cloudState by viewModel.cloudState.collectAsState()

    LaunchedEffect(session, tab) { if (tab == 1 && session != null) viewModel.refreshCloud() }

    Column {
        ScreenTitle("Recordings")
        TabRow(selectedTabIndex = tab) {
            Tab(selected = tab == 0, onClick = { tab = 0 }, text = { Text("This device") }, modifier = Modifier.tvFocus())
            Tab(selected = tab == 1, onClick = { tab = 1 }, text = { Text("Cloud") }, modifier = Modifier.tvFocus())
        }
        if (tab == 0) {
            val list = device.orEmpty()
            when {
                device == null -> LoadingBox()
                list.isEmpty() -> Message("No recordings yet", "Press Record while watching a channel and it is saved on this device.")
                else -> LazyColumn(contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    items(list, key = { it.id }) { r ->
                        RecordingCard(
                            title = r.title,
                            detail = "${r.channelName} · ${clock(r.seconds)} · ${size(r.bytes)}",
                            status = r.status,
                            error = r.error,
                            onPlay = { viewModel.play(r) }.takeIf { r.status != "failed" },
                            onStop = { viewModel.stop(r) }.takeIf { r.status == "recording" },
                            onDelete = { viewModel.delete(r) },
                        )
                    }
                }
            }
        } else if (session == null) {
            Message("Not connected", "Connect to a Vesper Cloud server in Settings to record in the cloud and watch from any device.")
        } else {
            when (val s = cloudState) {
                UiState.Loading -> LoadingBox()
                UiState.Empty -> Message("No cloud recordings", "Record from the player and it appears here.")
                is UiState.Error -> Message("Could not load", s.message)
                is UiState.Content -> LazyColumn(contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    items(s.data, key = { it.id }) { r ->
                        RecordingCard(
                            title = r.title,
                            detail = "${r.channelName} · ${clock(r.seconds)} · ${size(r.bytes)}",
                            status = r.status,
                            error = r.error,
                            onPlay = { viewModel.playCloud(r) }.takeIf { r.status == "done" || r.status == "recording" },
                            onStop = { viewModel.stopCloud(r) }.takeIf { r.status == "recording" },
                            onDelete = { viewModel.deleteCloud(r) },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun RecordingCard(
    title: String,
    detail: String,
    status: String,
    error: String?,
    onPlay: (() -> Unit)?,
    onStop: (() -> Unit)?,
    onDelete: () -> Unit,
) {
    Card(Modifier.fillMaxWidth()) {
        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(title, style = MaterialTheme.typography.titleMedium, maxLines = 1)
                Text(detail, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
                Text(
                    if (status == "failed") "Failed${error?.let { ": $it" } ?: ""}" else status.replaceFirstChar { it.uppercase() },
                    style = MaterialTheme.typography.labelMedium,
                    color = if (status == "failed") MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
                )
            }
            if (onPlay != null) IconButton(onPlay, Modifier.tvFocus()) { Icon(Icons.Filled.PlayArrow, "Play") }
            if (onStop != null) IconButton(onStop, Modifier.tvFocus()) { Icon(Icons.Filled.Stop, "Stop recording") }
            IconButton(onDelete, Modifier.tvFocus()) { Icon(Icons.Filled.Delete, "Delete") }
        }
    }
}
