package dev.aminegames125.vesper.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import dev.aminegames125.vesper.VesperApp
import dev.aminegames125.vesper.data.ApiException
import dev.aminegames125.vesper.data.Channel
import dev.aminegames125.vesper.data.NewRecording
import dev.aminegames125.vesper.data.NewSchedule
import dev.aminegames125.vesper.data.NewSource
import dev.aminegames125.vesper.data.Recording
import dev.aminegames125.vesper.data.Schedule
import dev.aminegames125.vesper.data.ServerInfo
import dev.aminegames125.vesper.data.Source
import dev.aminegames125.vesper.data.Status
import dev.aminegames125.vesper.data.User
import dev.aminegames125.vesper.data.normalizeServer
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/** Where the app is on its way to being usable. */
sealed interface Gate {
    data object Loading : Gate
    data class NeedServer(val address: String = "", val error: String? = null) : Gate
    data class NeedLogin(val info: ServerInfo) : Gate
    data class Ready(val info: ServerInfo, val user: User) : Gate
}

data class ChannelBrowser(
    val sourceId: String? = null,
    val query: String = "",
    val group: String = "",
    val channels: List<Channel> = emptyList(),
    val groups: List<String> = emptyList(),
    val total: Int = 0,
    val loading: Boolean = false,
)

class VesperViewModel(app: Application) : AndroidViewModel(app) {
    private val container = (app as VesperApp).container
    private val api = container.api
    private val settings = container.settings

    private val _gate = MutableStateFlow<Gate>(Gate.Loading)
    val gate: StateFlow<Gate> = _gate.asStateFlow()

    private val _busy = MutableStateFlow(false)
    val busy: StateFlow<Boolean> = _busy.asStateFlow()

    private val _messages = MutableSharedFlow<String>(extraBufferCapacity = 8)
    val messages: SharedFlow<String> = _messages.asSharedFlow()

    private val _recordings = MutableStateFlow<List<Recording>>(emptyList())
    val recordings: StateFlow<List<Recording>> = _recordings.asStateFlow()

    private val _storage = MutableStateFlow(0L to 0L)
    /** Bytes used and the limit (0 means no limit). */
    val storage: StateFlow<Pair<Long, Long>> = _storage.asStateFlow()

    private val _schedules = MutableStateFlow<List<Schedule>>(emptyList())
    val schedules: StateFlow<List<Schedule>> = _schedules.asStateFlow()

    val favorites: StateFlow<Set<String>> =
        settings.favorites.stateIn(viewModelScope, SharingStarted.Eagerly, emptySet())

    private val _status = MutableStateFlow<Status?>(null)
    val status: StateFlow<Status?> = _status.asStateFlow()

    private val _sources = MutableStateFlow<List<Source>>(emptyList())
    val sources: StateFlow<List<Source>> = _sources.asStateFlow()

    private val _browser = MutableStateFlow(ChannelBrowser())
    val browser: StateFlow<ChannelBrowser> = _browser.asStateFlow()

    /** The channel picked for a new schedule, and the schedule being edited, if any. */
    var draftChannel: Channel? = null
    var editing: Schedule? = null

    val serverAddress: String get() = api.base
    fun playlistUrl(id: String) = api.playlistUrl(id)

    init {
        bootstrap()
    }

    private fun bootstrap() {
        viewModelScope.launch {
            val stored = settings.current()
            if (stored.server.isEmpty()) {
                _gate.value = Gate.NeedServer()
                return@launch
            }
            api.base = stored.server
            api.token = stored.token
            _gate.value = try {
                val info = api.info()
                when {
                    !info.isFull -> Gate.Ready(info, api.me())
                    stored.token == null -> Gate.NeedLogin(info)
                    else -> Gate.Ready(info, api.me())
                }
            } catch (e: ApiException) {
                if (e.code == 401) {
                    runCatching { api.info() }.map { Gate.NeedLogin(it) }
                        .getOrElse { Gate.NeedServer(stored.server, "Could not reach the server.") }
                } else {
                    Gate.NeedServer(stored.server, e.message)
                }
            }
            if (_gate.value is Gate.Ready) refresh()
        }
    }

    /** Runs a call, shows its error, and goes back to sign-in if the session has ended. */
    private suspend fun <T> guard(work: suspend () -> T): T? = try {
        work()
    } catch (e: ApiException) {
        if (e.code == 401 && _gate.value is Gate.Ready) {
            api.token = null
            settings.signOut()
            _gate.value = Gate.NeedLogin((_gate.value as Gate.Ready).info)
            _messages.tryEmit("Your session ended. Sign in again.")
        } else {
            _messages.tryEmit(e.message ?: "Something went wrong.")
        }
        null
    }

    fun connect(address: String) {
        val base = normalizeServer(address)
        if (base.isEmpty()) {
            _gate.value = Gate.NeedServer(address, "Enter the server address.")
            return
        }
        viewModelScope.launch {
            _busy.value = true
            api.base = base
            api.token = null
            try {
                val info = api.info()
                if (info.isFull) {
                    settings.save(base, null, "")
                    _gate.value = Gate.NeedLogin(info)
                } else {
                    val user = api.me()
                    settings.save(base, null, user.username)
                    _gate.value = Gate.Ready(info, user)
                    refresh()
                }
            } catch (e: ApiException) {
                _gate.value = Gate.NeedServer(address, e.message)
            } catch (e: Exception) {
                _gate.value = Gate.NeedServer(address, "That does not look like a Vesper server.")
            }
            _busy.value = false
        }
    }

    fun signIn(username: String, password: String, register: Boolean, invite: String?) {
        val info = (_gate.value as? Gate.NeedLogin)?.info ?: return
        viewModelScope.launch {
            _busy.value = true
            try {
                val session = if (register) api.register(username, password, invite) else api.login(username, password)
                api.token = session.token
                settings.save(api.base, session.token, session.user.username)
                _gate.value = Gate.Ready(info, session.user)
                refresh()
            } catch (e: ApiException) {
                _messages.tryEmit(if (e.code == 401) "Wrong username or password." else e.message ?: "Could not sign in.")
            }
            _busy.value = false
        }
    }

    fun signOut() {
        viewModelScope.launch {
            val info = (_gate.value as? Gate.Ready)?.info
            api.logout()
            api.token = null
            settings.signOut()
            clear()
            _gate.value = if (info?.isFull == true) Gate.NeedLogin(info) else Gate.NeedServer(api.base)
        }
    }

    fun changeServer() {
        viewModelScope.launch {
            val address = api.base
            api.logout()
            api.token = null
            settings.save("", null, "")
            clear()
            _gate.value = Gate.NeedServer(address)
        }
    }

    private fun clear() {
        _recordings.value = emptyList()
        _schedules.value = emptyList()
        _sources.value = emptyList()
        _browser.value = ChannelBrowser()
    }

    /** Loads what the main screens show. Called every few seconds while the app is on screen. */
    fun refresh() {
        if (_gate.value !is Gate.Ready) return
        viewModelScope.launch {
            guard {
                val list = api.recordings()
                _recordings.value = list.recordings
                _storage.value = list.storageUsed to list.storageLimit
                _schedules.value = api.schedules()
            }
        }
    }

    fun loadStatus() {
        viewModelScope.launch { guard { _status.value = api.status() } }
    }

    fun toggleFavorite(channel: Channel) {
        viewModelScope.launch { settings.toggleFavorite(channel.url) }
    }

    fun renameRecording(id: String, title: String) {
        viewModelScope.launch {
            if (guard { api.renameRecording(id, title) } != null) refresh()
        }
    }

    fun clearFailed() {
        viewModelScope.launch {
            if (guard { api.clearFailed() } != null) {
                _messages.tryEmit("Cleared the failed recordings.")
                refresh()
            }
        }
    }

    fun runSchedule(id: String) {
        viewModelScope.launch {
            if (guard { api.runSchedule(id) } != null) {
                _messages.tryEmit("Recording started.")
                refresh()
            }
        }
    }

    fun duplicateSchedule(id: String) {
        viewModelScope.launch {
            if (guard { api.duplicateSchedule(id) } != null) {
                _messages.tryEmit("Copied. The copy is paused.")
                refresh()
            }
        }
    }

    fun pauseAll(paused: Boolean) {
        viewModelScope.launch {
            if (guard { api.pauseAll(paused) } != null) {
                _messages.tryEmit(if (paused) "All schedules paused." else "All schedules resumed.")
                refresh()
            }
        }
    }

    fun testChannel(channel: Channel) {
        viewModelScope.launch {
            val reply = guard { api.testChannel(channel.url) }
            if (reply != null) {
                _messages.tryEmit(if (reply.ok) "${channel.name} is answering." else "${channel.name} answered ${reply.status}.")
            }
        }
    }

    fun loadSources() {
        viewModelScope.launch {
            guard {
                val list = api.sources()
                _sources.value = list
                val current = _browser.value.sourceId
                if (current == null || list.none { it.id == current }) {
                    _browser.value = ChannelBrowser(sourceId = list.firstOrNull()?.id)
                }
            }
            if (_browser.value.sourceId != null) search(reset = true)
        }
    }

    fun addSource(body: NewSource) {
        viewModelScope.launch {
            _busy.value = true
            if (guard { api.createSource(body) } != null) {
                _messages.tryEmit("Added ${body.name}.")
                loadSources()
            }
            _busy.value = false
        }
    }

    fun removeSource(id: String) {
        viewModelScope.launch {
            if (guard { api.deleteSource(id) } != null) loadSources()
        }
    }

    private var searching: Job? = null

    fun selectSource(id: String) {
        _browser.value = ChannelBrowser(sourceId = id)
        search(reset = true)
    }

    fun setQuery(query: String) {
        _browser.value = _browser.value.copy(query = query)
        search(reset = true, debounce = true)
    }

    fun setGroup(group: String) {
        _browser.value = _browser.value.copy(group = group)
        search(reset = true)
    }

    fun loadMore() {
        val state = _browser.value
        if (!state.loading && state.channels.size < state.total) search(reset = false)
    }

    private fun search(reset: Boolean, debounce: Boolean = false) {
        val source = _browser.value.sourceId ?: return
        searching?.cancel()
        searching = viewModelScope.launch {
            if (debounce) delay(300)
            val before = _browser.value
            _browser.value = before.copy(loading = true)
            val offset = if (reset) 0 else before.channels.size
            val page = guard { api.channels(source, before.query, before.group, offset) }
            val now = _browser.value
            _browser.value = if (page == null) {
                now.copy(loading = false)
            } else {
                now.copy(
                    channels = if (reset) page.channels else now.channels + page.channels,
                    groups = page.groups,
                    total = page.total,
                    loading = false,
                )
            }
        }
    }

    fun recordNow(channel: Channel, seconds: Long) {
        viewModelScope.launch {
            _busy.value = true
            if (guard { api.recordNow(NewRecording(channel.name, channel.name, channel.url, seconds)) } != null) {
                _messages.tryEmit("Recording ${channel.name}.")
                refresh()
            }
            _busy.value = false
        }
    }

    fun stopRecording(id: String) {
        viewModelScope.launch {
            if (guard { api.stopRecording(id) } != null) refresh()
        }
    }

    fun deleteRecording(id: String) {
        viewModelScope.launch {
            if (guard { api.deleteRecording(id) } != null) refresh()
        }
    }

    /** Saves a schedule and returns the server's warnings, or null when it could not be saved. */
    suspend fun saveSchedule(id: String?, body: NewSchedule): List<String>? {
        _busy.value = true
        val reply = guard { if (id == null) api.createSchedule(body) else api.updateSchedule(id, body) }
        _busy.value = false
        if (reply != null) refresh()
        return reply?.warnings
    }

    fun setScheduleEnabled(id: String, enabled: Boolean) {
        viewModelScope.launch {
            if (guard { api.setScheduleEnabled(id, enabled) } != null) refresh()
        }
    }

    fun deleteSchedule(id: String) {
        viewModelScope.launch {
            if (guard { api.deleteSchedule(id) } != null) refresh()
        }
    }
}
