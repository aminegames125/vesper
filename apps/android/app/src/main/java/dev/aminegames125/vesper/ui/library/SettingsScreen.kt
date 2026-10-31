package dev.aminegames125.vesper.ui.library

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import dev.aminegames125.vesper.BuildConfig
import dev.aminegames125.vesper.data.repo.CloudRepository
import dev.aminegames125.vesper.data.repo.CloudSession
import dev.aminegames125.vesper.data.repo.ServerInfo
import dev.aminegames125.vesper.data.repo.SettingsRepository
import dev.aminegames125.vesper.data.repo.ThemeMode
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
class SettingsViewModel @Inject constructor(
    private val settings: SettingsRepository,
    private val cloud: CloudRepository,
) : ViewModel() {

    val theme: StateFlow<ThemeMode> = settings.theme.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), ThemeMode.Dark)
    val session: StateFlow<CloudSession?> = cloud.session.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    private val _info = MutableStateFlow<ServerInfo?>(null)
    val info: StateFlow<ServerInfo?> = _info.asStateFlow()

    private val _message = MutableStateFlow<String?>(null)
    val message: StateFlow<String?> = _message.asStateFlow()

    private val _busy = MutableStateFlow(false)
    val busy: StateFlow<Boolean> = _busy.asStateFlow()

    fun setTheme(mode: ThemeMode) {
        viewModelScope.launch { settings.setTheme(mode) }
    }

    fun check(address: String) {
        viewModelScope.launch {
            _busy.value = true
            _message.value = null
            cloud.info(address).fold(
                onSuccess = { _info.value = it },
                onFailure = { _info.value = null; _message.value = it.message },
            )
            _busy.value = false
        }
    }

    fun connect(address: String, user: String, pass: String, register: Boolean, invite: String) {
        viewModelScope.launch {
            _busy.value = true
            _message.value = null
            cloud.connect(address, user, pass, register, invite).onFailure { _message.value = it.message }
            _busy.value = false
        }
    }

    fun disconnect() {
        viewModelScope.launch { cloud.disconnect(); _info.value = null }
    }
}

@Composable
fun SettingsScreen(viewModel: SettingsViewModel = hiltViewModel()) {
    val theme by viewModel.theme.collectAsState()
    val session by viewModel.session.collectAsState()
    val info by viewModel.info.collectAsState()
    val message by viewModel.message.collectAsState()
    val busy by viewModel.busy.collectAsState()
    var address by remember { mutableStateOf("") }
    var user by remember { mutableStateOf("") }
    var pass by remember { mutableStateOf("") }
    var invite by remember { mutableStateOf("") }
    var register by remember { mutableStateOf(false) }

    Column(Modifier.verticalScroll(rememberScrollState())) {
        ScreenTitle("Settings")
        Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("Appearance", style = MaterialTheme.typography.titleMedium)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ThemeMode.entries.forEach { mode ->
                    FilterChip(theme == mode, { viewModel.setTheme(mode) }, { Text(mode.name) }, modifier = Modifier.tvFocus())
                }
            }

            Text("Vesper Cloud", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 16.dp))
            Text(
                "Record in the cloud, schedule recordings and watch them from any device.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            val connected = session
            if (connected != null) {
                Text(
                    "Connected to ${connected.url}" + (connected.username?.let { " as $it" } ?: " (no login needed)"),
                    style = MaterialTheme.typography.bodyMedium,
                )
                OutlinedButton(onClick = viewModel::disconnect, modifier = Modifier.tvFocus()) { Text("Disconnect") }
            } else {
                OutlinedTextField(address, { address = it }, label = { Text("Server address") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                val full = info?.mode == "full"
                if (full) {
                    OutlinedTextField(user, { user = it }, label = { Text("Username") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(pass, { pass = it }, label = { Text("Password") }, singleLine = true, visualTransformation = PasswordVisualTransformation(), modifier = Modifier.fillMaxWidth())
                    if (info?.registration != "closed") {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            FilterChip(!register, { register = false }, { Text("Sign in") })
                            FilterChip(register, { register = true }, { Text("Create account") })
                        }
                    }
                    if (register && info?.registration == "invite") {
                        OutlinedTextField(invite, { invite = it }, label = { Text("Invite code") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    }
                }
                message?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium) }
                Button(
                    enabled = address.isNotBlank() && !busy,
                    onClick = { if (info == null) viewModel.check(address) else viewModel.connect(address, user, pass, register, invite) },
                    modifier = Modifier.tvFocus(),
                ) { Text(if (busy) "Please wait…" else if (info == null) "Connect" else if (full) (if (register) "Create account" else "Sign in") else "Use this server") }
            }

            Text("About", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 16.dp))
            Text("Vesper ${BuildConfig.VERSION_NAME}", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
