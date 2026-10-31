package dev.aminegames125.vesper.ui.library

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import dev.aminegames125.vesper.data.db.SourceEntity
import dev.aminegames125.vesper.data.repo.SourceRepository
import dev.aminegames125.vesper.data.repo.SyncState
import dev.aminegames125.vesper.ui.common.Message
import dev.aminegames125.vesper.ui.common.ScreenTitle
import dev.aminegames125.vesper.ui.common.tvFocus
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

@HiltViewModel
class SourcesViewModel @Inject constructor(private val repo: SourceRepository) : ViewModel() {

    val sources: StateFlow<List<SourceEntity>?> = repo.all.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)
    val sync: StateFlow<SyncState> = repo.sync

    private val _adding = MutableStateFlow(false)
    val adding: StateFlow<Boolean> = _adding.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    fun clearError() { _error.value = null }

    /** Returns through [onDone] so the dialog can close only when the source really loaded. */
    fun addXtream(name: String, host: String, user: String, pass: String, onDone: () -> Unit) = add(onDone) { repo.addXtream(name, host, user, pass) }

    fun addM3u(name: String, url: String, onDone: () -> Unit) = add(onDone) { repo.addM3u(name, url) }

    private fun add(onDone: () -> Unit, block: suspend () -> Result<Unit>) {
        viewModelScope.launch {
            _adding.value = true
            _error.value = null
            block().fold(onSuccess = { onDone() }, onFailure = { _error.value = it.message ?: "Could not add this source." })
            _adding.value = false
        }
    }

    fun refresh(source: SourceEntity) {
        viewModelScope.launch { runCatching { repo.refresh(source) } }
    }

    fun remove(source: SourceEntity) {
        viewModelScope.launch { repo.remove(source.id) }
    }
}

@Composable
fun SourcesScreen(viewModel: SourcesViewModel = hiltViewModel(), openAdd: Boolean = false) {
    val sources by viewModel.sources.collectAsState()
    val sync by viewModel.sync.collectAsState()
    var showAdd by remember { mutableStateOf(openAdd) }

    Column {
        Row(verticalAlignment = Alignment.CenterVertically) {
            ScreenTitle("Sources", sources?.size, Modifier.weight(1f))
            Button(onClick = { showAdd = true }, modifier = Modifier.padding(end = 16.dp).tvFocus()) {
                Icon(Icons.Filled.Add, contentDescription = null)
                Text("Add")
            }
        }
        when (val s = sync) {
            is SyncState.Loading -> Text("Loading ${s.source}…", Modifier.padding(horizontal = 16.dp), color = MaterialTheme.colorScheme.primary)
            is SyncState.Failed -> Text(s.message, Modifier.padding(horizontal = 16.dp), color = MaterialTheme.colorScheme.error)
            SyncState.Idle -> Unit
        }
        val list = sources.orEmpty()
        if (sources != null && list.isEmpty()) {
            Message("No sources yet", "Add an Xtream login or an M3U playlist to start watching.")
        } else {
            LazyColumn(contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                items(list, key = { it.id }) { source ->
                    Card(Modifier.fillMaxWidth()) {
                        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(source.name, style = MaterialTheme.typography.titleMedium)
                                Text(
                                    if (source.isXtream) "Xtream · ${source.url}" else "M3U playlist",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    maxLines = 1,
                                )
                            }
                            IconButton({ viewModel.refresh(source) }, Modifier.tvFocus()) { Icon(Icons.Filled.Refresh, "Refresh") }
                            IconButton({ viewModel.remove(source) }, Modifier.tvFocus()) { Icon(Icons.Filled.Delete, "Remove") }
                        }
                    }
                }
            }
        }
    }

    if (showAdd) AddSourceDialog(viewModel) { showAdd = false }
}

@Composable
private fun AddSourceDialog(viewModel: SourcesViewModel, onClose: () -> Unit) {
    val adding by viewModel.adding.collectAsState()
    val error by viewModel.error.collectAsState()
    var xtream by remember { mutableStateOf(true) }
    var name by remember { mutableStateOf("") }
    var host by remember { mutableStateOf("") }
    var user by remember { mutableStateOf("") }
    var pass by remember { mutableStateOf("") }
    var url by remember { mutableStateOf("") }
    val ready = if (xtream) host.isNotBlank() && user.isNotBlank() else url.isNotBlank()

    AlertDialog(
        onDismissRequest = { if (!adding) { viewModel.clearError(); onClose() } },
        title = { Text("Add a source") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(xtream, { xtream = true }, { Text("Xtream login") })
                    FilterChip(!xtream, { xtream = false }, { Text("M3U link") })
                }
                OutlinedTextField(name, { name = it }, label = { Text("Name (optional)") }, singleLine = true)
                if (xtream) {
                    OutlinedTextField(host, { host = it }, label = { Text("Server address") }, singleLine = true)
                    OutlinedTextField(user, { user = it }, label = { Text("Username") }, singleLine = true)
                    OutlinedTextField(pass, { pass = it }, label = { Text("Password") }, singleLine = true, visualTransformation = PasswordVisualTransformation())
                } else {
                    OutlinedTextField(url, { url = it }, label = { Text("Playlist address") }, singleLine = true)
                }
                error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium) }
            }
        },
        confirmButton = {
            Button(
                enabled = ready && !adding,
                onClick = {
                    val done = { viewModel.clearError(); onClose() }
                    if (xtream) viewModel.addXtream(name, host, user, pass, done) else viewModel.addM3u(name, url, done)
                },
            ) { Text(if (adding) "Loading…" else "Add") }
        },
        dismissButton = { TextButton(onClick = { viewModel.clearError(); onClose() }, enabled = !adding) { Text("Cancel") } },
    )
}
