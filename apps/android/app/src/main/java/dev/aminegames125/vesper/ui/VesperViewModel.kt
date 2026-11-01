package dev.aminegames125.vesper.ui

import android.app.Application
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.viewModelScope
import dev.aminegames125.vesper.VesperApp
import dev.aminegames125.vesper.cast.castUrlFor
import dev.aminegames125.vesper.cast.mimeFor
import dev.aminegames125.vesper.data.ApiException
import dev.aminegames125.vesper.data.AppJson
import dev.aminegames125.vesper.data.Bookmark
import dev.aminegames125.vesper.data.CalendarItem
import dev.aminegames125.vesper.data.Channel
import dev.aminegames125.vesper.data.GuideHit
import dev.aminegames125.vesper.data.NewDownload
import dev.aminegames125.vesper.data.NewRecording
import dev.aminegames125.vesper.data.NewRule
import dev.aminegames125.vesper.data.Programme
import dev.aminegames125.vesper.data.SeriesRule
import dev.aminegames125.vesper.data.StorageUse
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
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
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString

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
    /** `live`, `movie` or `series`. */
    val kind: String = "live",
)

class VesperViewModel(app: Application, private val saved: SavedStateHandle) : AndroidViewModel(app) {
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
    // Kept in the saved state, so the form comes back as it was if Android ended the app meanwhile.
    var draftChannel: Channel?
        get() = saved.get<String>("draft")?.let { runCatching { AppJson.decodeFromString<Channel>(it) }.getOrNull() }
        set(value) {
            saved["draft"] = value?.let { AppJson.encodeToString(it) }
        }
    var editing: Schedule?
        get() = saved.get<String>("editing")?.let { runCatching { AppJson.decodeFromString<Schedule>(it) }.getOrNull() }
        set(value) {
            saved["editing"] = value?.let { AppJson.encodeToString(it) }
        }

    /** Set while the channel list is open on behalf of the schedule form, which wants the choice back. */
    var returningToEditor = false
    var picked by mutableStateOf<Channel?>(null)

    val serverAddress: String get() = api.base
    fun playlistUrl(id: String) = api.playlistUrl(id)
    fun thumbUrl(id: String) = api.thumbUrl(id)
    fun fileUrl(id: String) = api.fileUrl(id)

    /** A stream shared into the app from another app, waiting for the person to choose what to do. */
    var sharedUrl by mutableStateOf<String?>(null)

    /** The live channel being watched. */
    var watching by mutableStateOf<Channel?>(null)

    /** A screen another part of the app (a tile, a widget) asked to open once the app is ready. */
    var launchRoute by mutableStateOf<String?>(null)

    private val _bookmarks = MutableStateFlow<List<Bookmark>>(emptyList())
    val bookmarks: StateFlow<List<Bookmark>> = _bookmarks.asStateFlow()

    private val _guideHits = MutableStateFlow<List<GuideHit>>(emptyList())
    val guideHits: StateFlow<List<GuideHit>> = _guideHits.asStateFlow()

    private val _channelGuide = MutableStateFlow<List<Programme>>(emptyList())
    val channelGuide: StateFlow<List<Programme>> = _channelGuide.asStateFlow()

    private val _rules = MutableStateFlow<List<SeriesRule>>(emptyList())
    val rules: StateFlow<List<SeriesRule>> = _rules.asStateFlow()

    private val _calendar = MutableStateFlow<List<CalendarItem>>(emptyList())
    val calendar: StateFlow<List<CalendarItem>> = _calendar.asStateFlow()

    private val _storageUse = MutableStateFlow<StorageUse?>(null)
    val storageUse: StateFlow<StorageUse?> = _storageUse.asStateFlow()

    val relay: StateFlow<String> = settings.relay.stateIn(viewModelScope, SharingStarted.Eagerly, "auto")

    fun setRelay(value: String) {
        viewModelScope.launch { settings.setRelay(value) }
    }

    val theme: StateFlow<String> = settings.theme.stateIn(viewModelScope, SharingStarted.Eagerly, "system")
    val quietStart: StateFlow<String> = settings.quietStart.stateIn(viewModelScope, SharingStarted.Eagerly, "")
    val quietEnd: StateFlow<String> = settings.quietEnd.stateIn(viewModelScope, SharingStarted.Eagerly, "")

    fun setTheme(value: String) {
        viewModelScope.launch { settings.setTheme(value) }
    }

    fun setQuietHours(start: String, end: String) {
        viewModelScope.launch { settings.setQuiet(start, end) }
    }

    /** What to play for a recording or saved download, starting where the person left off. */
    fun playerFor(recording: Recording): PlayerSource {
        val url = if (recording.isDownload) api.fileUrl(recording.id) else api.playlistUrl(recording.id)
        val resume = recording.positionS.takeIf { it > 10 && !recording.watched } ?: 0L
        return PlayerSource(
            title = recording.title,
            url = url,
            startMs = resume * 1000,
            castMime = if (recording.isDownload) mimeFor(recording.fileName ?: "movie.mp4") else null,
            running = recording.isRunning,
        )
    }

    /** What to play for a live channel: the channel's own address, then its backups. */
    fun playerFor(channel: Channel): PlayerSource {
        val prefix = api.relayPrefix()
        val mode = if (prefix == null) "off" else relay.value
        val cast = castUrlFor(channel.url)
        return PlayerSource(
            title = channel.name,
            url = channel.url,
            fallbacks = channel.alt,
            // A Chromecast is in the same country as the viewer, so it gets the relayed address too.
            castUrl = if (mode == "always" && prefix != null) relayed(prefix, cast) else cast,
            live = true,
            relayPrefix = prefix,
            relayMode = mode,
        )
    }

    fun saveProgress(id: String, seconds: Long, finished: Boolean) {
        viewModelScope.launch {
            runCatching {
                api.savePosition(id, seconds)
                if (finished) api.setWatched(id, true)
            }
        }
    }

    fun loadBookmarks(id: String) {
        _bookmarks.value = emptyList()
        viewModelScope.launch { guard { _bookmarks.value = api.bookmarks(id) } }
    }

    fun addBookmark(id: String, seconds: Long) {
        viewModelScope.launch {
            if (guard { api.addBookmark(id, seconds) } != null) {
                _messages.tryEmit("Bookmark added.")
                loadBookmarks(id)
            }
        }
    }

    fun deleteBookmark(id: String, bookmark: String) {
        viewModelScope.launch {
            if (guard { api.deleteBookmark(id, bookmark) } != null) loadBookmarks(id)
        }
    }

    fun setKeep(id: String, hours: Long) {
        viewModelScope.launch {
            if (guard { api.setKeep(id, hours) } != null) {
                _messages.tryEmit(if (hours == 0L) "It will be kept until you delete it." else "The deletion timer was changed.")
                refresh()
            }
        }
    }

    fun setTag(id: String, tag: String) {
        viewModelScope.launch {
            if (guard { api.setTag(id, tag.trim()) } != null) refresh()
        }
    }

    fun setWatched(id: String, watched: Boolean) {
        viewModelScope.launch {
            if (guard { api.setWatched(id, watched) } != null) refresh()
        }
    }

    /** Makes a link anyone can open for a day and hands it to [done]. */
    fun share(id: String, done: (String) -> Unit) {
        viewModelScope.launch {
            guard { api.share(id) }?.let(done)
        }
    }

    fun exportMp4(id: String, then: (() -> Unit)? = null) {
        viewModelScope.launch {
            _messages.tryEmit("Converting to MP4…")
            if (guard { api.exportMp4(id) } != null) {
                _messages.tryEmit("The MP4 is ready.")
                then?.invoke()
            }
        }
    }

    fun trim(id: String, fromS: Long, toS: Long) {
        viewModelScope.launch {
            if (guard { api.trim(id, fromS, toS) } != null) {
                _messages.tryEmit("Cutting a copy.")
                refresh()
            }
        }
    }

    fun exportUrl(id: String) = api.exportUrl(id)

    /** Saves a movie or episode on the server so it can be watched later, with the default timer. */
    fun downloadToServer(channel: Channel) {
        viewModelScope.launch {
            if (guard { api.download(NewDownload(channel.name, channel.url)) } != null) {
                _messages.tryEmit("Downloading ${channel.name} to the server.")
                refresh()
            }
        }
    }

    fun loadStorage() {
        viewModelScope.launch { guard { _storageUse.value = api.storage() } }
    }

    fun loadCalendar() {
        val from = System.currentTimeMillis() / 1000
        viewModelScope.launch { guard { _calendar.value = api.calendar(from, from + 7 * 86_400) } }
    }

    fun loadRules() {
        viewModelScope.launch { guard { _rules.value = api.seriesRules() } }
    }

    fun deleteRule(id: String) {
        viewModelScope.launch {
            if (guard { api.deleteRule(id) } != null) {
                loadRules()
                refresh()
            }
        }
    }

    fun searchGuide(query: String) {
        if (query.trim().length < 2) {
            _guideHits.value = emptyList()
            return
        }
        viewModelScope.launch { guard { _guideHits.value = api.searchGuide(query.trim()) } }
    }

    /** The guide's own id for the channel whose programmes are in [channelGuide]. */
    var channelGuideId by mutableStateOf<String?>(null)
        private set

    fun loadChannelGuide(channel: Channel) {
        _channelGuide.value = emptyList()
        channelGuideId = null
        val from = System.currentTimeMillis() / 1000 - 3600
        viewModelScope.launch {
            guard {
                val reply = api.guide(channel.id, channel.name, from, from + 86_400)
                channelGuideId = reply.channelId
                _channelGuide.value = reply.programmes
            }
        }
    }

    fun refreshGuide() {
        viewModelScope.launch {
            _busy.value = true
            if (guard { api.refreshGuide() } != null) _messages.tryEmit("The guide was updated.")
            _busy.value = false
        }
    }

    /** The playable channel behind a guide entry, found by its guide id or name. */
    private suspend fun channelFor(channelId: String, channelName: String): Channel? {
        val page = api.channels("all", channelName, "", 0, 50, kind = "live")
        return page.channels.firstOrNull { it.id == channelId }
            ?: page.channels.firstOrNull { it.name.equals(channelName, ignoreCase = true) }
    }

    /** Records one programme from the guide, a minute early and five minutes late. */
    fun recordProgramme(hit: GuideHit) {
        viewModelScope.launch {
            _busy.value = true
            val ok = guard {
                val channel = channelFor(hit.channelId, hit.channelName)
                    ?: throw ApiException("That channel is not in your playlists.")
                val zone = ZoneId.systemDefault()
                val start = Instant.ofEpochSecond(hit.startAt).atZone(zone)
                api.createSchedule(
                    NewSchedule(
                        title = hit.title,
                        channelName = channel.name,
                        url = channel.url,
                        tz = zone.id,
                        startTime = start.format(DateTimeFormatter.ofPattern("HH:mm")),
                        seconds = hit.stopAt - hit.startAt,
                        days = 0,
                        startDate = start.toLocalDate().toString(),
                        padBefore = 60,
                        padAfter = 300,
                        backupUrl = channel.alt.firstOrNull(),
                        epgId = hit.channelId,
                        followGuide = true,
                    ),
                )
            }
            if (ok != null) {
                _messages.tryEmit("Scheduled ${hit.title}.")
                refresh()
            }
            _busy.value = false
        }
    }

    /** Records every programme with this title, now and in the future. */
    fun recordSeries(hit: GuideHit) {
        viewModelScope.launch {
            _busy.value = true
            val ok = guard {
                val channel = channelFor(hit.channelId, hit.channelName)
                    ?: throw ApiException("That channel is not in your playlists.")
                api.createRule(
                    NewRule(
                        title = hit.title,
                        epgChannelId = hit.channelId,
                        channelName = channel.name,
                        url = channel.url,
                        backupUrl = channel.alt.firstOrNull(),
                        padBefore = 60,
                        padAfter = 300,
                    ),
                )
            }
            if (ok != null) {
                _messages.tryEmit("Every \"${hit.title}\" will be recorded.")
                loadRules()
                refresh()
            }
            _busy.value = false
        }
    }

    /** Admin only: the deletion timer new recordings get when nobody chooses. */
    fun setDefaultKeep(hours: Long) {
        viewModelScope.launch {
            if (guard { api.setSetting("default_keep_hours", hours.toString()) } != null) {
                _messages.tryEmit(if (hours == 0L) "New recordings are kept until deleted." else "Saved.")
                loadStatus()
            }
        }
    }

    suspend fun exportSchedulesText(): String? = guard { api.exportSchedules() }

    suspend fun importSchedulesText(json: String): String? {
        val reply = guard { api.importSchedules(json) } ?: return null
        refresh()
        return buildString {
            append("Added ${reply.added} schedule(s).")
            if (reply.problems.isNotEmpty()) append(" ${reply.problems.size} could not be added.")
        }
    }

    fun toast(message: String) {
        _messages.tryEmit(message)
    }

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
                if (System.currentTimeMillis() - api.mediaTokenAt > 6 * 3_600_000L) {
                    runCatching { api.refreshMediaToken() }
                }
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

    /** Opens the channel, or with [sample] records ten seconds on the server to show the bitrate. */
    fun testChannel(channel: Channel, sample: Boolean = false) {
        viewModelScope.launch {
            if (sample) _messages.tryEmit("Recording a 10 second sample…")
            val reply = guard { api.testChannel(channel.url, if (sample) 10 else null) }
            if (reply != null) {
                _messages.tryEmit(
                    when {
                        sample && reply.ok -> "${channel.name} works: ${reply.kbps} kbit/s."
                        sample -> "${channel.name} did not deliver anything. ${reply.error.orEmpty()}".trim()
                        reply.ok -> "${channel.name} is answering."
                        else -> "${channel.name} answered ${reply.status}."
                    },
                )
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
                    _browser.value = ChannelBrowser(sourceId = list.firstOrNull()?.id, kind = _browser.value.kind)
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
        _browser.value = ChannelBrowser(sourceId = id, kind = _browser.value.kind)
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

    fun setKind(kind: String) {
        _browser.value = _browser.value.copy(kind = kind, group = "")
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
            val page = guard { api.channels(source, before.query, before.group, offset, kind = before.kind) }
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

    fun recordNow(channel: Channel, seconds: Long, keepHours: Long? = null) {
        viewModelScope.launch {
            _busy.value = true
            if (guard { api.recordNow(NewRecording(channel.name, channel.name, channel.url, seconds, keepHours = keepHours, backupUrl = channel.alt.firstOrNull())) } != null) {
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
